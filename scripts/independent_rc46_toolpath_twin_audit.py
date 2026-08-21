#!/usr/bin/env python3
import csv
import hashlib
import json
import math
import pathlib
import statistics
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / ".cache" / "rc46-x16" / "XYPT_L001-025.zip"
OUTPUT = ROOT / "research" / "reproducibility" / "rc46-toolpath-twin-python.json"
ARCHIVE_SHA = "7b2b863c843aeabe19f308a5886d57ae241cd386f38c95a7e7ce01e9bc34d007"
BINS = 1024
LOCAL_BINS = 4096
EPS = 1e-15


def file_sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_layer(archive, info):
    xs, ys, ps = [], [], []
    total_rows = nonzero_t = camera_rows = 0
    digest = hashlib.sha256()
    with archive.open(info, "r") as raw:
        for binary_line in raw:
            digest.update(binary_line)
            stripped = binary_line.strip()
            if not stripped:
                continue
            fields = stripped.split(b",")
            if len(fields) != 4:
                raise RuntimeError(f"{info.filename}: non-four-column row {total_rows + 1}")
            try:
                values = [float(field) for field in fields]
            except ValueError as error:
                raise RuntimeError(f"{info.filename}: non-numeric row {total_rows + 1}") from error
            if not all(math.isfinite(value) for value in values) or values[3] != int(values[3]):
                raise RuntimeError(f"{info.filename}: non-finite or non-integral T row {total_rows + 1}")
            total_rows += 1
            trigger = int(values[3])
            nonzero_t += int(trigger != 0)
            if trigger & 2:
                xs.append(values[0]); ys.append(values[1]); ps.append(values[2]); camera_rows += 1
    if camera_rows != nonzero_t:
        raise RuntimeError(f"{info.filename}: camera-bit count differs from nonzero-T count")
    layer = int(info.filename.split("L")[1].split(".")[0])
    return {
        "layer": layer,
        "member": {"name": info.filename, "bytes": info.file_size, "sha256": digest.hexdigest(), "crc32": f"{info.CRC:08x}"},
        "totalRows": total_rows, "cameraRows": camera_rows, "nonzeroT": nonzero_t,
        "x": xs, "y": ys, "p": ps
    }


def qtile(values, q):
    if not values:
        return 0.0
    ordered = sorted(values)
    pos = (len(ordered) - 1) * q
    lower, upper = math.floor(pos), math.ceil(pos)
    fraction = pos - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction


def target_scale(layer):
    cx, cy = statistics.fmean(layer["x"]), statistics.fmean(layer["y"])
    radius = math.sqrt(statistics.fmean((x - cx) ** 2 + (y - cy) ** 2 for x, y in zip(layer["x"], layer["y"])))
    speeds = [math.hypot(layer["x"][i] - layer["x"][i - 1], layer["y"][i] - layer["y"][i - 1]) for i in range(1, layer["cameraRows"])]
    speeds = [value for value in speeds if value > 0]
    return {"cx": cx, "cy": cy, "rmsRadius": radius, "maxPower": max(layer["p"]), "medianPositiveStep": statistics.median(speeds)}


def profile(layer, bins, scale):
    cx, cy = statistics.fmean(layer["x"]), statistics.fmean(layer["y"])
    sums = [{"n": 0, "x": 0.0, "y": 0.0, "p": 0.0, "on": 0, "speed": 0.0, "speedN": 0, "dx": 0.0, "dy": 0.0, "dirN": 0} for _ in range(bins)]
    for i, (x, y, power) in enumerate(zip(layer["x"], layer["y"], layer["p"])):
        index = min(bins - 1, i * bins // layer["cameraRows"])
        row = sums[index]
        row["n"] += 1; row["x"] += (x - cx) / scale["rmsRadius"]; row["y"] += (y - cy) / scale["rmsRadius"]
        row["p"] += power / scale["maxPower"]; row["on"] += int(power > 0)
        if i:
            dx, dy = x - layer["x"][i - 1], y - layer["y"][i - 1]
            speed = math.hypot(dx, dy)
            if speed > 0:
                row["speed"] += speed / scale["medianPositiveStep"]; row["speedN"] += 1
                row["dx"] += dx / speed; row["dy"] += dy / speed; row["dirN"] += 1
    return [{
        "x": row["x"] / row["n"], "y": row["y"] / row["n"], "p": row["p"] / row["n"], "on": row["on"] / row["n"],
        "speed": row["speed"] / row["speedN"] if row["speedN"] else 0.0,
        "dx": row["dx"] / row["dirN"] if row["dirN"] else 0.0, "dy": row["dy"] / row["dirN"] if row["dirN"] else 0.0,
        "directionDefined": row["dirN"] > 0
    } for row in sums]


def fit_rotation(target, candidate):
    a = sum(c["x"] * t["x"] + c["y"] * t["y"] for t, c in zip(target, candidate))
    b = sum(c["x"] * t["y"] - c["y"] * t["x"] for t, c in zip(target, candidate))
    theta = math.atan2(b, a)
    return {"theta": theta, "cos": math.cos(theta), "sin": math.sin(theta)}


def rotate(x, y, rotation):
    return rotation["cos"] * x - rotation["sin"] * y, rotation["sin"] * x + rotation["cos"] * y


def hellinger(first, second):
    return math.sqrt(sum((math.sqrt(a) - math.sqrt(b)) ** 2 for a, b in zip(first, second))) / math.sqrt(2)


def grid_index(value, lower, upper):
    scaled = (value - lower) / max(upper - lower, EPS) * 32
    nearest = round(scaled)
    if abs(scaled - nearest) <= 1e-12:
        scaled = nearest
    return max(0, min(31, math.floor(scaled)))


def spatial(target, candidate, scale, rotation):
    tcx, tcy = statistics.fmean(target["x"]), statistics.fmean(target["y"])
    ccx, ccy = statistics.fmean(candidate["x"]), statistics.fmean(candidate["y"])
    tx = [(x - tcx) / scale["rmsRadius"] for x in target["x"]]; ty = [(y - tcy) / scale["rmsRadius"] for y in target["y"]]
    rotated = [rotate((x - ccx) / scale["rmsRadius"], (y - ccy) / scale["rmsRadius"], rotation) for x, y in zip(candidate["x"], candidate["y"])]
    cx = [value[0] for value in rotated]; cy = [value[1] for value in rotated]
    min_x, max_x, min_y, max_y = min(tx + cx), max(tx + cx), min(ty + cy), max(ty + cy)

    def histogram(xs, ys, powers, only_on):
        cells = [0.0] * 1024; count = 0
        for x, y, power in zip(xs, ys, powers):
            if only_on and power <= 0:
                continue
            gx = grid_index(x, min_x, max_x)
            gy = grid_index(y, min_y, max_y)
            cells[gy * 32 + gx] += 1; count += 1
        return [value / count for value in cells]

    return {
        "allHellinger": hellinger(histogram(tx, ty, target["p"], False), histogram(cx, cy, candidate["p"], False)),
        "onHellinger": hellinger(histogram(tx, ty, target["p"], True), histogram(cx, cy, candidate["p"], True)),
        "outOfGridMass": 0
    }


def segments(layer, rotation=None):
    lengths, powers, speeds, directions = [], [], [], [0.0] * 36
    in_run = False; length = 0; path_mass = 0.0
    for i, power in enumerate(layer["p"]):
        on = power > 0
        if on:
            if not in_run:
                in_run = True; length = 0
            length += 1; powers.append(power)
        if in_run and (not on or i == layer["cameraRows"] - 1):
            lengths.append(length); in_run = False
        if on and i and layer["p"][i - 1] > 0:
            dx, dy = layer["x"][i] - layer["x"][i - 1], layer["y"][i] - layer["y"][i - 1]
            speed = math.hypot(dx, dy)
            if speed > 0:
                if rotation:
                    dx, dy = rotate(dx, dy, rotation)
                speeds.append(speed)
                angle = math.atan2(dy, dx)
                if angle < 0:
                    angle += 2 * math.pi
                directions[min(35, math.floor(angle / (2 * math.pi) * 36))] += speed; path_mass += speed
    quantiles = lambda values: [qtile(values, q) for q in (0.1, 0.25, 0.5, 0.75, 0.9)]
    return {"count": len(lengths), "lengthQuantiles": quantiles(lengths), "powerQuantiles": quantiles(powers), "speedQuantiles": quantiles(speeds), "direction": [value / path_mass for value in directions]}


def compare(target, candidate, scale, target_1024, target_4096, target_segments):
    candidate_1024 = profile(candidate, BINS, scale)
    rotation = fit_rotation(target_1024, candidate_1024)
    rotated_xy = [rotate(row["x"], row["y"], rotation) for row in candidate_1024]
    xy_rmse = math.sqrt(sum((target_1024[i]["x"] - rotated_xy[i][0]) ** 2 + (target_1024[i]["y"] - rotated_xy[i][1]) ** 2 for i in range(BINS)) / BINS)
    power_rmse = math.sqrt(statistics.fmean((target_1024[i]["p"] - candidate_1024[i]["p"]) ** 2 for i in range(BINS)))
    on_rmse = math.sqrt(statistics.fmean((target_1024[i]["on"] - candidate_1024[i]["on"]) ** 2 for i in range(BINS)))
    spatial_result = spatial(target, candidate, scale, rotation)
    candidate_segments = segments(candidate, rotation)
    direction_hellinger = hellinger(target_segments["direction"], candidate_segments["direction"])
    candidate_4096 = profile(candidate, LOCAL_BINS, scale)
    matches = run = longest = position_failures = power_failures = on_failures = direction_failures = 0
    for target_row, candidate_row in zip(target_4096, candidate_4096):
        qx, qy = rotate(candidate_row["x"], candidate_row["y"], rotation)
        position_ok = math.hypot(target_row["x"] - qx, target_row["y"] - qy) <= 0.02
        power_ok = abs(target_row["p"] - candidate_row["p"]) <= 0.05
        on_ok = abs(target_row["on"] - candidate_row["on"]) <= 0.05
        direction_ok = True
        if target_row["directionDefined"] and candidate_row["directionDefined"]:
            dx, dy = rotate(candidate_row["dx"], candidate_row["dy"], rotation)
            tn, cn = math.hypot(target_row["dx"], target_row["dy"]), math.hypot(dx, dy)
            direction_ok = True if tn <= EPS or cn <= EPS else (target_row["dx"] * dx + target_row["dy"] * dy) / (tn * cn) >= 0.95
        position_failures += int(not position_ok); power_failures += int(not power_ok); on_failures += int(not on_ok); direction_failures += int(not direction_ok)
        if position_ok and power_ok and on_ok and direction_ok:
            matches += 1; run += 1; longest = max(longest, run)
        else:
            run = 0
    count_error = abs(candidate["cameraRows"] - target["cameraRows"]) / target["cameraRows"]
    positive_target = sum(value > 0 for value in target["p"]) / target["cameraRows"]
    positive_candidate = sum(value > 0 for value in candidate["p"]) / candidate["cameraRows"]
    positive_error = abs(positive_target - positive_candidate); local_fraction = matches / LOCAL_BINS
    gates = {
        "count": count_error <= 0.01, "positiveFraction": positive_error <= 0.02, "xy": xy_rmse <= 0.05,
        "power": power_rmse <= 0.10, "laserOn": on_rmse <= 0.05,
        "spatialAll": spatial_result["allHellinger"] <= 0.10, "spatialOn": spatial_result["onHellinger"] <= 0.10,
        "direction": direction_hellinger <= 0.10, "local": local_fraction >= 0.95
    }
    score = count_error + positive_error + xy_rmse + power_rmse + on_rmse + spatial_result["allHellinger"] + spatial_result["onHellinger"] + direction_hellinger + (1 - local_fraction)
    relative = lambda first, second: [abs(b - a) / max(abs(a), EPS) for a, b in zip(first, second)]
    return {
        "layer": candidate["layer"], "member": candidate["member"],
        "counts": {"totalRows": candidate["totalRows"], "cameraRows": candidate["cameraRows"], "nonzeroT": candidate["nonzeroT"], "positiveCameraRows": sum(value > 0 for value in candidate["p"])},
        "rotationRadians": rotation["theta"],
        "metrics": {"countRelativeError": count_error, "positiveFractionError": positive_error, "xyRmse": xy_rmse, "powerRmse": power_rmse, "laserOnRmse": on_rmse, **spatial_result, "directionHellinger": direction_hellinger, "localMatchFraction": local_fraction, "longestLocalMatchRun": longest, "positionFailures": position_failures, "powerFailures": power_failures, "onFailures": on_failures, "directionFailures": direction_failures},
        "segmentComparison": {"countRelativeError": abs(candidate_segments["count"] - target_segments["count"]) / target_segments["count"], "lengthQuantileRelativeErrors": relative(target_segments["lengthQuantiles"], candidate_segments["lengthQuantiles"]), "powerQuantileRelativeErrors": relative(target_segments["powerQuantiles"], candidate_segments["powerQuantiles"]), "speedQuantileRelativeErrors": relative(target_segments["speedQuantiles"], candidate_segments["speedQuantiles"])},
        "gates": gates, "eligible": all(gates.values()), "score": score
    }


def main():
    if not ARCHIVE.exists() or ARCHIVE.stat().st_size != 159_164_372 or file_sha(ARCHIVE) != ARCHIVE_SHA:
        raise RuntimeError("official archive identity mismatch")
    with zipfile.ZipFile(ARCHIVE) as archive:
        infos = sorted(archive.infolist(), key=lambda info: info.filename)
        if len(infos) != 25:
            raise RuntimeError("ZIP member count or CRC integrity failed")
        target = parse_layer(archive, next(info for info in infos if info.filename == "XYPT_L0001.csv"))
        scale = target_scale(target); target_1024 = profile(target, BINS, scale); target_4096 = profile(target, LOCAL_BINS, scale); target_segments = segments(target)
        candidates = []
        for info in infos:
            if info.filename == "XYPT_L0001.csv":
                continue
            candidate = parse_layer(archive, info)
            comparison = compare(target, candidate, scale, target_1024, target_4096, target_segments)
            candidates.append(comparison)
            print(f"L{candidate['layer']:04d} {'PASS' if comparison['eligible'] else 'fail'} score={comparison['score']:.6f}", flush=True)
    candidates.sort(key=lambda row: (row["score"], row["layer"]))
    passing = [row for row in candidates if row["eligible"]]
    result = {
        "resultId": "RC46-X16-TOOLPATH-TWIN-PYTHON-0.1", "cycleId": "RC-2026-46", "createdOn": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "implementation": "Python standard library; independent ZIP, CSV, metric, and gate implementation", "preregistration": "research/reproducibility/rc46-toolpath-twin-precommit.json",
        "input": {"path": ".cache/rc46-x16/XYPT_L001-025.zip", "bytes": ARCHIVE.stat().st_size, "sha256": file_sha(ARCHIVE), "memberCount": len(infos)},
        "target": {"layer": 1, "member": target["member"], "counts": {"totalRows": target["totalRows"], "cameraRows": target["cameraRows"], "nonzeroT": target["nonzeroT"], "positiveCameraRows": sum(value > 0 for value in target["p"])}, "scale": scale, "segmentCount": target_segments["count"]},
        "candidates": candidates,
        "ranking": [{"rank": index + 1, "layer": row["layer"], "score": row["score"], "eligible": row["eligible"], "failedGates": [name for name, passed in row["gates"].items() if not passed]} for index, row in enumerate(candidates)],
        "adjudication": {"passingLayers": [row["layer"] for row in passing], "topRankedLayer": candidates[0]["layer"], "topRankedEligible": candidates[0]["eligible"], "hypothesis": "T1-command-twin-eligible-for-future-image-benchmark" if passing else "T0-no-first-25-layer-command-twin", "releaseCandidateAviThisCycle": False, "naturalL0001RemainsSealed": True},
        "boundary": "Command-level similarity can qualify a prospective image benchmark but cannot establish image exchangeability, recover a natural missing position, or certify process truth."
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["adjudication"], indent=2))


if __name__ == "__main__":
    main()
