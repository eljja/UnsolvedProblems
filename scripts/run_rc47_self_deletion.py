"""RC47 preregistered L0002 cadence-gap experiment; never reads L0001."""
import hashlib
import json
import math
import pathlib
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / ".cache" / "rc47-x16" / "l0002" / "frames-32x32-gray.raw"
DECODE = ROOT / "research" / "reproducibility" / "rc47-l0002-decode.json"
OUTPUT = ROOT / "research" / "reproducibility" / "rc47-self-deletion-python.json"
TRIAL_OUTPUT = ROOT / "research" / "reproducibility" / "rc47-self-deletion-python-trials.json"
SEED = "RC47-X16-SELF-DELETION-v1"
N, SIDE = 95_504, 32
PARTITIONS = {"development": (0, 57_302), "validation": (57_302, 76_403), "sealedTest": (76_403, 95_504)}
BLOCKS = (1, 2, 4, 8)
VALIDATION_TRIALS = {1: 128, 2: 96, 4: 96, 8: 96}
TEST_TRIALS = {1: 256, 2: 128, 4: 128, 8: 128}
FAMILY_ORDER = ("scalar-jump", "diagonal-LDA", "ridge-LDA-1.0", "ridge-LDA-0.1", "ridge-LDA-0.01")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def deterministic_start(partition, block, trial):
    start, end = PARTITIONS[partition]
    low = start + 128
    high_exclusive = end - 128 - block + 1
    payload = f"{SEED}|{partition}|block-{block}|{trial}".encode()
    value = int.from_bytes(hashlib.sha256(payload).digest(), "big")
    return low + value % (high_exclusive - low)


def make_scales(frames):
    scales = {32: frames}
    for side in (16, 8, 4):
        factor = SIDE // side
        scales[side] = frames.reshape(N, side, factor, side, factor).mean(axis=(2, 4), dtype=np.float64)
    return scales


def base_descriptors(frames):
    f = frames.astype(np.float64)
    intensity = f.mean(axis=(1, 2))
    yy, xx = np.mgrid[0:SIDE, 0:SIDE]
    weight = f.sum(axis=(1, 2))
    safe = np.maximum(weight, 1.0)
    cx = (f * xx).sum(axis=(1, 2)) / safe
    cy = (f * yy).sum(axis=(1, 2)) / safe
    bright = np.column_stack([(frames >= threshold).mean(axis=(1, 2)) for threshold in (32, 64, 128, 192)])
    rows = f.mean(axis=2)
    cols = f.mean(axis=1)
    return {"intensity": intensity, "cx": cx, "cy": cy, "bright": bright, "rows": rows, "cols": cols}


def quartet_features(scales, descriptors, a, left, right, b):
    a = np.asarray(a, dtype=np.int64)
    left = np.asarray(left, dtype=np.int64)
    right = np.asarray(right, dtype=np.int64)
    b = np.asarray(b, dtype=np.int64)
    columns = []
    log_ratio_columns = []
    for side in (32, 16, 8, 4):
        values = scales[side]
        av = values[a].astype(np.float64, copy=False)
        lv = values[left].astype(np.float64, copy=False)
        rv = values[right].astype(np.float64, copy=False)
        bv = values[b].astype(np.float64, copy=False)
        center = rv - lv
        prior = lv - av
        following = bv - rv
        mad_center = np.mean(np.abs(center), axis=(1, 2))
        rms_center = np.sqrt(np.mean(center * center, axis=(1, 2)))
        mad_prior = np.mean(np.abs(prior), axis=(1, 2))
        mad_following = np.mean(np.abs(following), axis=(1, 2))
        log_ratio = np.log((mad_center + 1.0) / (0.5 * (mad_prior + mad_following) + 1.0))
        lc = lv - lv.mean(axis=(1, 2), keepdims=True)
        rc = rv - rv.mean(axis=(1, 2), keepdims=True)
        denom = np.sqrt(np.sum(lc * lc, axis=(1, 2)) * np.sum(rc * rc, axis=(1, 2)))
        cosine = 1.0 - np.divide(np.sum(lc * rc, axis=(1, 2)), denom, out=np.zeros_like(denom), where=denom > 0)
        velocity_residual = np.mean(np.abs(center - 0.5 * (prior + following)), axis=(1, 2))
        log_ratio_columns.append(len(columns) + 4)
        columns.extend((mad_center, rms_center, mad_prior, mad_following, log_ratio, cosine, velocity_residual))
    centroid = np.hypot(descriptors["cx"][right] - descriptors["cx"][left], descriptors["cy"][right] - descriptors["cy"][left])
    bright = np.abs(descriptors["bright"][right] - descriptors["bright"][left])
    row_change = np.mean(np.abs(descriptors["rows"][right] - descriptors["rows"][left]), axis=1)
    col_change = np.mean(np.abs(descriptors["cols"][right] - descriptors["cols"][left]), axis=1)
    columns.extend((centroid, bright[:, 0], bright[:, 1], bright[:, 2], bright[:, 3], row_change, col_change))
    return np.column_stack(columns), log_ratio_columns


def features_for_gap(scales, descriptors, starts, gap):
    starts = np.asarray(starts, dtype=np.int64)
    return quartet_features(scales, descriptors, starts - 1, starts, starts + gap, starts + gap + 1)


def family_weights(name, neg, pos, log_indices):
    direction = pos.mean(axis=0) - neg.mean(axis=0)
    if name == "scalar-jump":
        weight = np.zeros(neg.shape[1], dtype=np.float64)
        weight[log_indices] = 1.0
        return weight
    neg_centered = neg - neg.mean(axis=0)
    pos_centered = pos - pos.mean(axis=0)
    denominator = neg.shape[0] + pos.shape[0] - 2
    covariance = (neg_centered.T @ neg_centered + pos_centered.T @ pos_centered) / denominator
    diagonal = np.diag(covariance)
    if name == "diagonal-LDA":
        return direction / np.where(diagonal > 1e-12, diagonal, 1.0)
    ridge = float(name.rsplit("-", 1)[1])
    regularized = covariance + np.eye(covariance.shape[0]) * ridge * float(diagonal.mean())
    return np.linalg.solve(regularized, direction)


def observed_original_index(part_start, truth_local, block, observed_index):
    return part_start + observed_index if observed_index < truth_local else part_start + observed_index + block


def trial_result(scales, descriptors, model, partition, block, truth, intact_starts, intact_scores):
    part_start, part_end = PARTITIONS[partition]
    truth_local = truth - part_start
    observed_length = part_end - part_start - block
    candidates = []
    affected_rights = range(max(2, truth_local - 1), min(observed_length - 1, truth_local + 2))
    for right_slot in affected_rights:
        ids = [observed_original_index(part_start, truth_local, block, right_slot + offset) for offset in (-2, -1, 0, 1)]
        raw, _ = quartet_features(scales, descriptors, [ids[0]], [ids[1]], [ids[2]], [ids[3]])
        standardized = (raw[0] - model["mean"]) / model["scale"]
        candidates.append((float(standardized @ model["weight"]), int(right_slot)))
    exclusion_low, exclusion_high = truth - 3, truth + block + 2
    allowed = (intact_starts < exclusion_low) | (intact_starts > exclusion_high)
    allowed_indices = np.flatnonzero(allowed)
    if len(allowed_indices):
        local_scores = intact_scores[allowed_indices]
        max_score = float(local_scores.max())
        tied = allowed_indices[np.flatnonzero(np.isclose(local_scores, max_score, rtol=0.0, atol=1e-12))]
        best_start = int(intact_starts[tied].min())
        right_slot = best_start + 1 - part_start if best_start < truth else best_start + 1 - part_start - block
        candidates.append((max_score, int(right_slot)))
    candidates.sort(key=lambda item: (-item[0], item[1]))
    top_score, top_slot = candidates[0]
    call = top_slot if top_score > model["threshold"] else None
    correct = call is not None and abs(call - truth_local) <= 1
    return {"trial": None, "truthStart": int(truth), "truthRightSlot": int(truth_local), "callRightSlot": call, "topScore": top_score, "correct": bool(correct), "falseDiscovery": bool(call is not None and not correct)}


def evaluate_partition(scales, descriptors, model, partition, block, trial_count, frame_quartiles):
    start, end = PARTITIONS[partition]
    intact_starts = np.arange(start + 1, end - 2, dtype=np.int64)
    raw_neg, _ = features_for_gap(scales, descriptors, intact_starts, 1)
    neg = (raw_neg - model["mean"]) / model["scale"]
    intact_scores = neg @ model["weight"]
    trials = []
    strata = {str(index): {"truth": 0, "correct": 0} for index in range(4)}
    for trial in range(trial_count):
        truth = deterministic_start(partition, block, trial)
        row = trial_result(scales, descriptors, model, partition, block, truth, intact_starts, intact_scores)
        row["trial"] = trial
        intensity = descriptors["intensity"][truth - 1]
        stratum = int(np.searchsorted(frame_quartiles, intensity, side="right"))
        row["intensityStratum"] = stratum
        strata[str(stratum)]["truth"] += 1
        strata[str(stratum)]["correct"] += int(row["correct"])
        trials.append(row)
    truth_count = len(trials)
    calls = sum(row["callRightSlot"] is not None for row in trials)
    correct = sum(row["correct"] for row in trials)
    false = sum(row["falseDiscovery"] for row in trials)
    for value in strata.values():
        value["recall"] = value["correct"] / value["truth"] if value["truth"] else None
    maximum = float(intact_scores.max())
    maximum_starts = intact_starts[np.flatnonzero(np.isclose(intact_scores, maximum, rtol=0.0, atol=1e-12))]
    unmodified_call = int(maximum > model["threshold"])
    return {
        "totals": {"truth": truth_count, "calls": calls, "correctWithinOne": correct, "falseDiscoveries": false},
        "recallWithinOne": correct / truth_count,
        "falseDiscoveryRate": false / calls if calls else 0.0,
        "unmodifiedControl": {"calls": unmodified_call, "maximumScore": maximum, "firstMaximumStart": int(maximum_starts.min())},
        "intensityStrata": strata,
        "trials": trials
    }


def main():
    if not RAW.exists() or RAW.stat().st_size != N * SIDE * SIDE:
        raise RuntimeError("RC47 raw decode is absent or has the wrong size")
    decode = json.loads(DECODE.read_text(encoding="utf-8"))
    raw_sha256 = sha256_file(RAW)
    if raw_sha256 != decode["output"]["sha256"]:
        raise RuntimeError("RC47 raw hash differs from decode receipt")
    frames = np.memmap(RAW, dtype=np.uint8, mode="r", shape=(N, SIDE, SIDE))
    scales = make_scales(frames)
    descriptors = base_descriptors(frames)
    frame_quartiles = np.quantile(descriptors["intensity"][:PARTITIONS["development"][1]], (0.25, 0.5, 0.75))
    models = {}
    validation_summary = {}
    validation_trials = {}
    for block in BLOCKS:
        gap = block + 1
        dev_starts = np.arange(1, PARTITIONS["development"][1] - gap - 1, 4, dtype=np.int64)
        raw_neg, log_indices = features_for_gap(scales, descriptors, dev_starts, 1)
        raw_pos, _ = features_for_gap(scales, descriptors, dev_starts, gap)
        mean = raw_neg.mean(axis=0)
        scale = raw_neg.std(axis=0, ddof=0)
        scale[scale == 0] = 1.0
        neg = (raw_neg - mean) / scale
        pos = (raw_pos - mean) / scale
        candidate_rows = []
        candidate_trials = {}
        validation_starts = np.arange(PARTITIONS["validation"][0] + 1, PARTITIONS["validation"][1] - 2, dtype=np.int64)
        validation_raw_neg, _ = features_for_gap(scales, descriptors, validation_starts, 1)
        validation_neg = (validation_raw_neg - mean) / scale
        for family in FAMILY_ORDER:
            weight = family_weights(family, neg, pos, log_indices)
            threshold = float(np.max(validation_neg @ weight))
            model = {"family": family, "mean": mean, "scale": scale, "weight": weight, "threshold": threshold}
            evaluated = evaluate_partition(scales, descriptors, model, "validation", block, VALIDATION_TRIALS[block], frame_quartiles)
            candidate_rows.append({
                "family": family,
                "threshold": threshold,
                "recallWithinOne": evaluated["recallWithinOne"],
                "falseDiscoveryRate": evaluated["falseDiscoveryRate"],
                "calls": evaluated["totals"]["calls"]
            })
            candidate_trials[family] = evaluated["trials"]
        priority = {name: index for index, name in enumerate(FAMILY_ORDER)}
        selected = min(candidate_rows, key=lambda row: (-row["recallWithinOne"], row["falseDiscoveryRate"], priority[row["family"]]))
        selected_weight = family_weights(selected["family"], neg, pos, log_indices)
        models[block] = {"family": selected["family"], "mean": mean, "scale": scale, "weight": selected_weight, "threshold": selected["threshold"]}
        validation_summary[str(block)] = {"gap": gap, "trainingPairsPerClass": int(len(dev_starts)), "candidates": candidate_rows, "selected": selected}
        validation_trials[str(block)] = candidate_trials[selected["family"]]

    tests = {}
    test_trials = {}
    for block in BLOCKS:
        evaluated = evaluate_partition(scales, descriptors, models[block], "sealedTest", block, TEST_TRIALS[block], frame_quartiles)
        tests[str(block)] = {key: evaluated[key] for key in ("totals", "recallWithinOne", "falseDiscoveryRate", "unmodifiedControl", "intensityStrata")}
        test_trials[str(block)] = evaluated["trials"]

    total_calls = sum(row["totals"]["calls"] for row in tests.values())
    total_false = sum(row["totals"]["falseDiscoveries"] for row in tests.values())
    fdr = total_false / total_calls if total_calls else 0.0
    stratum_pass = all(
        value["truth"] < 20 or value["recall"] >= 0.90
        for row in tests.values() for value in row["intensityStrata"].values()
    )
    gates = {
        "singletonRecallAtLeast95Percent": tests["1"]["recallWithinOne"] >= 0.95,
        "block2RecallAtLeast95Percent": tests["2"]["recallWithinOne"] >= 0.95,
        "block4RecallAtLeast95Percent": tests["4"]["recallWithinOne"] >= 0.95,
        "block8RecallAtLeast95Percent": tests["8"]["recallWithinOne"] >= 0.95,
        "aggregateFdrAtMost1Percent": fdr <= 0.01,
        "unmodifiedControlsEmpty": all(row["unmodifiedControl"]["calls"] == 0 for row in tests.values()),
        "intensityStrataPass": stratum_pass
    }
    result = {
        "resultId": "RC47-X16-SELF-DELETION-PYTHON-0.1",
        "cycleId": "RC-2026-47",
        "createdOn": "2026-08-24",
        "status": "complete-development-run",
        "preregistration": "research/reproducibility/rc47-self-deletion-precommit.json",
        "inputs": {"rawBytes": RAW.stat().st_size, "rawSha256": raw_sha256, "frames": N, "side": SIDE},
        "partitions": {key: {"start": value[0], "endExclusive": value[1], "frames": value[1] - value[0]} for key, value in PARTITIONS.items()},
        "featureCount": int(next(iter(models.values()))["mean"].shape[0]),
        "frameIntensityQuartiles": frame_quartiles.tolist(),
        "validation": validation_summary,
        "selectedModels": {
            str(block): {
                "family": model["family"], "threshold": model["threshold"],
                "mean": model["mean"].tolist(), "scale": model["scale"].tolist(), "weight": model["weight"].tolist()
            } for block, model in models.items()
        },
        "sealedTest": tests,
        "aggregate": {"calls": total_calls, "falseDiscoveries": total_false, "falseDiscoveryRate": fdr},
        "gates": {**gates, "passedBeforeIndependentAudit": all(gates.values())},
        "boundary": "This run tests synthetic contiguous omissions only within L0002. It does not inspect L0001, authenticate frame-trigger ordinals, or establish cross-layer transport."
    }
    trial_result_payload = {"resultId": "RC47-X16-SELF-DELETION-PYTHON-TRIALS-0.1", "cycleId": "RC-2026-47", "validation": validation_trials, "sealedTest": test_trials}
    if "--write" in sys.argv:
        OUTPUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        TRIAL_OUTPUT.write_text(json.dumps(trial_result_payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({
        "selected": {key: value["family"] for key, value in result["selectedModels"].items()},
        "sealedTest": {key: {"recall": value["recallWithinOne"], "fdr": value["falseDiscoveryRate"], "unmodifiedCalls": value["unmodifiedControl"]["calls"]} for key, value in tests.items()},
        "aggregate": result["aggregate"], "gates": result["gates"]
    }, indent=2))


if __name__ == "__main__":
    main()
