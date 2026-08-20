import argparse
import csv
import hashlib
import json
import math
import pathlib
import subprocess
from dataclasses import dataclass

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "rc44-x16"
FFMPEG = ROOT / ".cache" / "rc44-python" / "imageio_ffmpeg" / "binaries" / "ffmpeg-win-x86_64-v7.1.exe"
SEED = "RC44-X16-SYNTHETIC-HOLDOUT-v1"


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_xypt(layer):
    path = CACHE / f"l{layer:04d}" / "extracted" / f"XYPT_L{layer:04d}.csv"
    values = np.loadtxt(path, delimiter=",", dtype=np.float64)
    trigger_indices = np.flatnonzero(values[:, 3] != 0)
    if len(trigger_indices) == 0:
        raise ValueError("no camera triggers")
    return path, values, trigger_indices


def ensure_raw(layer, expected_frames):
    avi = CACHE / f"l{layer:04d}" / "extracted" / f"MPMcamera_L{layer:04d}.avi"
    raw = CACHE / f"l{layer:04d}" / "frames-8x8-gray.raw"
    expected_bytes = expected_frames * 64
    if not raw.exists() or raw.stat().st_size != expected_bytes:
        if not FFMPEG.exists():
            raise FileNotFoundError(f"FFmpeg not found: {FFMPEG}")
        subprocess.run([
            str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-i", str(avi),
            "-vf", "scale=8:8:flags=area,format=gray", "-f", "rawvideo", str(raw)
        ], check=True)
    pixels = np.fromfile(raw, dtype=np.uint8)
    if pixels.size != expected_bytes:
        raise ValueError(f"raw byte count {pixels.size} != {expected_bytes}")
    return avi, raw, pixels.reshape(expected_frames, 8, 8)


def moving_sum(values, window):
    prefix = np.concatenate(([0.0], np.cumsum(values, dtype=np.float64)))
    starts = np.maximum(0, np.arange(len(values)) + 1 - window)
    return prefix[np.arange(len(values)) + 1] - prefix[starts]


def command_features(all_rows, trigger_indices):
    x, y, power = all_rows[:, 0], all_rows[:, 1], all_rows[:, 2]
    dx, dy = np.gradient(x), np.gradient(y)
    ddx, ddy = np.gradient(dx), np.gradient(dy)
    speed_all = np.hypot(dx, dy)
    acceleration_all = np.hypot(ddx, ddy)
    idx = trigger_indices
    speed = speed_all[idx]
    angle = np.arctan2(dy[idx], dx[idx])
    angle_unwrapped = np.unwrap(angle)
    turn = np.concatenate(([0.0], np.diff(angle_unwrapped)))
    p = power[idx]
    laser_on = (p > 0).astype(np.float64)
    power_transition = np.concatenate(([0.0], np.diff(p)))
    energy_per_speed = p / np.maximum(speed, 1e-9)
    columns = [
        p, dx[idx], dy[idx], ddx[idx], ddy[idx], speed, acceleration_all[idx],
        np.sin(angle), np.cos(angle), turn, laser_on, power_transition
    ]
    for window in (5, 25, 125):
        columns.extend((moving_sum(p, window), moving_sum(energy_per_speed, window)))
    return np.column_stack(columns)


def image_features(frames):
    f = frames.astype(np.float64)
    mean = f.mean(axis=(1, 2))
    std = f.std(axis=(1, 2))
    bright = [(f >= level).mean(axis=(1, 2)) for level in (32, 64, 128, 192)]
    grid_y, grid_x = np.mgrid[0:8, 0:8]
    weight = f.sum(axis=(1, 2))
    safe = np.maximum(weight, 1.0)
    cx = (f * grid_x).sum(axis=(1, 2)) / safe
    cy = (f * grid_y).sum(axis=(1, 2)) / safe
    centered_x = grid_x[None, :, :] - cx[:, None, None]
    centered_y = grid_y[None, :, :] - cy[:, None, None]
    mxx = (f * centered_x ** 2).sum(axis=(1, 2)) / safe
    myy = (f * centered_y ** 2).sum(axis=(1, 2)) / safe
    mxy = (f * centered_x * centered_y).sum(axis=(1, 2)) / safe
    base = np.column_stack([mean, std, *bright, cx, cy, mxx, myy, mxy])
    delta = np.vstack([np.zeros((1, base.shape[1])), np.diff(base, axis=0)])
    return np.column_stack([base, delta])


def robust_fit_transform(train, *others):
    median = np.median(train, axis=0)
    scale = 1.4826 * np.median(np.abs(train - median), axis=0)
    scale[scale == 0] = 1.0
    return median, scale, [(value - median) / scale for value in (train, *others)]


def ridge_fit(x, y, alpha):
    design = np.column_stack([np.ones(len(x)), x])
    penalty = np.eye(design.shape[1]) * alpha
    penalty[0, 0] = 0.0
    return np.linalg.solve(design.T @ design + penalty, design.T @ y)


def ridge_predict(x, coefficients):
    return np.column_stack([np.ones(len(x)), x]) @ coefficients


def huber_cost(predicted, observed, delta):
    residual = np.abs(predicted - observed)
    values = np.where(residual <= delta, 0.5 * residual ** 2, delta * (residual - 0.5 * delta))
    return values.mean(axis=1)


def deterministic_positions(seed, case, trial, count, start, end):
    eligible_start, eligible_end = start + 128, end - 128
    if eligible_end <= eligible_start:
        raise ValueError("interval too small for edge guard")
    chosen, counter = set(), 0
    while len(chosen) < count:
        payload = f"{seed}|{case}|{trial}|{counter}".encode()
        value = int.from_bytes(hashlib.sha256(payload).digest(), "big")
        chosen.add(eligible_start + value % (eligible_end - eligible_start))
        counter += 1
    return sorted(chosen)


def recover_single(predicted, observed, delta):
    n = len(predicted)
    if len(observed) != n - 1:
        raise ValueError("single recovery requires one deleted frame")
    left = huber_cost(predicted[:-1], observed, delta)
    right = huber_cost(predicted[1:], observed, delta)
    prefix = np.concatenate(([0.0], np.cumsum(left)))
    suffix = np.concatenate((np.cumsum(right[::-1])[::-1], [0.0]))
    total = prefix + suffix
    best = int(np.argmin(total))
    return [best], float(total[best])


def recover_deletions(predicted, observed, deletion_count, delta):
    n, m = len(predicted), len(observed)
    if n - m != deletion_count:
        raise ValueError(f"length deficit {n-m} != deletion count {deletion_count}")
    if deletion_count == 0:
        return [], float(huber_cost(predicted, observed, delta).sum())
    if deletion_count == 1:
        return recover_single(predicted, observed, delta)
    inf = float("inf")
    costs = np.full((n, deletion_count + 1), inf, dtype=np.float64)
    for d in range(deletion_count + 1):
        valid = min(m, n - d)
        if valid > 0:
            costs[d:d + valid, d] = huber_cost(predicted[d:d + valid], observed[:valid], delta)
    dp = np.full(deletion_count + 1, inf)
    dp[0] = 0.0
    traces = np.zeros((n, deletion_count + 1), dtype=np.uint8)
    for i in range(n):
        match = dp + costs[i]
        delete = np.full_like(dp, inf)
        delete[1:] = dp[:-1]
        take_delete = delete < match
        next_dp = np.where(take_delete, delete, match)
        traces[i] = take_delete.astype(np.uint8)
        dp = next_dp
    deleted, d = [], deletion_count
    for i in range(n - 1, -1, -1):
        if d > 0 and traces[i, d] == 1:
            deleted.append(i)
            d -= 1
    if d != 0:
        raise RuntimeError("traceback did not recover fixed deletion count")
    return sorted(deleted), float(dp[deletion_count])


def score_calls(truth, calls):
    truth, calls = list(truth), list(calls)
    used = set()
    recovered = 0
    for expected in truth:
        candidates = [(abs(call - expected), index) for index, call in enumerate(calls) if index not in used and abs(call - expected) <= 1]
        if candidates:
            _, index = min(candidates)
            used.add(index)
            recovered += 1
    false = len(calls) - recovered
    return {"truth": len(truth), "calls": len(calls), "recoveredWithinOne": recovered, "falseDiscoveries": false}


def run_suite(predicted, observed, start, end, delta, suite):
    totals = {"truth": 0, "calls": 0, "recoveredWithinOne": 0, "falseDiscoveries": 0}
    trials = []
    for case, count_trials, deletion_count in suite:
        for trial in range(count_trials):
            if "block" in case:
                block_start = deterministic_positions(SEED, case, trial, 1, start, end - deletion_count + 1)[0]
                truth_global = list(range(block_start, block_start + deletion_count))
            else:
                truth_global = deterministic_positions(SEED, case, trial, deletion_count, start, end)
            truth = [value - start for value in truth_global]
            base_pred = predicted[start:end]
            base_obs = observed[start:end]
            kept = np.ones(len(base_obs), dtype=bool)
            kept[truth] = False
            injected = base_obs[kept]
            calls, cost = recover_deletions(base_pred, injected, deletion_count, delta)
            score = score_calls(truth, calls)
            for key in totals:
                totals[key] += score[key]
            trials.append({"case": case, "trial": trial, "truthSlots": truth, "calledSlots": calls, "cost": cost, **score})
    recall = totals["recoveredWithinOne"] / totals["truth"] if totals["truth"] else 1.0
    fdr = totals["falseDiscoveries"] / totals["calls"] if totals["calls"] else 0.0
    return {"totals": totals, "recallWithinOne": recall, "falseDiscoveryRate": fdr, "trials": trials}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    layer = 2
    xypt_path, rows, trigger_indices = load_xypt(layer)
    avi_path, raw_path, frames = ensure_raw(layer, len(trigger_indices))
    command = command_features(rows, trigger_indices)
    image = image_features(frames)
    n = len(image)
    train_end, validation_end = math.floor(0.6 * n), math.floor(0.8 * n)
    x_median, x_scale, (x_train, x_all) = robust_fit_transform(command[:train_end], command)
    y_median, y_scale, (y_train, y_all) = robust_fit_transform(image[:train_end], image)
    alpha_scores = []
    fitted = {}
    for alpha in (0.01, 0.1, 1.0, 10.0, 100.0):
        coefficients = ridge_fit(x_train, y_train, alpha)
        predicted = ridge_predict(x_all, coefficients)
        mse = float(np.mean((predicted[train_end:validation_end] - y_all[train_end:validation_end]) ** 2))
        alpha_scores.append({"alpha": alpha, "validationStandardizedMse": mse})
        fitted[alpha] = (coefficients, predicted)
    selected_alpha = min(alpha_scores, key=lambda item: (item["validationStandardizedMse"], item["alpha"]))["alpha"]
    coefficients, predicted = fitted[selected_alpha]
    validation_candidates = []
    for delta in (1.0, 1.5, 2.0):
        result = run_suite(predicted, y_all, train_end, validation_end, delta, [("validation-single", 16, 1), ("validation-dispersed", 8, 23)])
        validation_candidates.append({"delta": delta, **{key: result[key] for key in ("totals", "recallWithinOne", "falseDiscoveryRate")}})
    selected = min(validation_candidates, key=lambda item: (-item["recallWithinOne"], item["falseDiscoveryRate"], item["delta"]))
    delta = selected["delta"]
    test = run_suite(predicted, y_all, validation_end, n, delta, [("test-single", 128, 1), ("test-dispersed", 32, 23), ("test-block", 16, 23)])
    unmodified_calls, unmodified_cost = recover_deletions(predicted[validation_end:], y_all[validation_end:], 0, delta)
    gate = test["recallWithinOne"] >= 0.95 and test["falseDiscoveryRate"] <= 0.01 and len(unmodified_calls) == 0
    result = {
        "resultId": "RC44-X16-L0002-PYTHON-DEVELOPMENT-0.2",
        "cycleId": "RC-2026-44",
        "createdOn": "2026-08-21",
        "layer": 2,
        "role": "development",
        "precommit": "research/reproducibility/rc44-command-image-alignment-precommit.json",
        "amendments": ["research/reproducibility/rc44-amendment-01.json", "research/reproducibility/rc44-amendment-02.json", "research/reproducibility/rc44-amendment-03.json"],
        "inputs": {
            "xypt": {"path": str(xypt_path.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256_file(xypt_path), "triggerRows": int(n)},
            "avi": {"path": str(avi_path.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256_file(avi_path), "frames": int(len(frames))},
            "raw8x8": {"path": str(raw_path.relative_to(ROOT)).replace("\\", "/"), "bytes": raw_path.stat().st_size, "sha256": sha256_file(raw_path)},
            "ffmpeg": {"path": str(FFMPEG.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256_file(FFMPEG)}
        },
        "features": {"commandColumns": int(command.shape[1]), "imageColumns": int(image.shape[1]), "train": train_end, "validation": validation_end - train_end, "test": n - validation_end},
        "model": {"alphaScores": alpha_scores, "selectedAlpha": selected_alpha, "selectedHuberDelta": delta, "validationCandidates": validation_candidates, "penaltyIdentification": "constant deletion penalties cancel because each observed length fixes the transition count"},
        "syntheticTest": {key: test[key] for key in ("totals", "recallWithinOne", "falseDiscoveryRate")},
        "unmodifiedControl": {"deletionCalls": unmodified_calls, "cost": unmodified_cost},
        "gate": {"recallAtLeast95Percent": test["recallWithinOne"] >= 0.95, "fdrAtMost1Percent": test["falseDiscoveryRate"] <= 0.01, "unmodifiedEmpty": len(unmodified_calls) == 0, "passed": gate},
        "holdoutDecision": "eligible-for-independent-implementation" if gate else "stop-before-l0001-pixel-acquisition",
        "boundaries": [
            "The synthetic test assumes ordinal pairing in count-equal L0002; count equality does not authenticate that assumption.",
            "No duplicate-only or affine-drift test is needed to release L0001 when the primary deletion gate already fails; omitted cases remain unadjudicated rather than counted as passes.",
            "No L0001 member or pixel is inspected by this script."
        ]
    }
    if args.write:
        output = ROOT / "research" / "reproducibility" / "rc44-x16-layer-0002-python-development-v02.json"
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        trial_output = ROOT / "research" / "reproducibility" / "rc44-x16-layer-0002-python-trials-v02.json"
        trial_output.write_text(json.dumps({"validation": validation_candidates, "test": test["trials"]}, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
