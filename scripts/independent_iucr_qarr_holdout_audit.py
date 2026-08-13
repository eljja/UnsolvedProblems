import hashlib
import json
import math
import os
import statistics
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CALIBRATION_DIR = Path(os.environ.get("IUCR_QARR_REFERENCE_DIR", Path(tempfile.gettempdir()) / "unsolved-rc20-qarr-reference"))
HOLDOUT_DIR = Path(os.environ.get("IUCR_QARR_HOLDOUT_DIR", Path(tempfile.gettempdir()) / "unsolved-rc21-qarr-holdout"))
SPEC = json.loads((ROOT / "research/reproducibility/iucr-qarr-external-holdout-spec.json").read_text(encoding="utf-8"))
CALIBRATION_MANIFEST = json.loads((ROOT / "research/reproducibility/iucr-qarr-reference-pattern-manifest.json").read_text(encoding="utf-8"))
HOLDOUT_MANIFEST = json.loads((ROOT / "research/reproducibility/iucr-qarr-external-holdout-manifest.json").read_text(encoding="utf-8"))
RC20_SPEC = json.loads((ROOT / "research/reproducibility/iucr-qpa-independent-reduction-spec.json").read_text(encoding="utf-8"))
RC20_RESULT = json.loads((ROOT / "research/reproducibility/iucr-qpa-independent-reduction-result.json").read_text(encoding="utf-8"))
PHASES = SPEC["phaseOrder"]


def rounded(value, digits=9):
    return round(value, digits) if value is not None and math.isfinite(value) else None


def parse_profile(directory, contract):
    path = directory / contract["name"]
    raw = path.read_bytes()
    if len(raw) != contract["bytes"] or hashlib.sha256(raw).hexdigest() != contract["sha256"]:
        raise RuntimeError(f"profile contract changed for {contract['name']}")
    rows = []
    for index, line in enumerate(raw.decode("utf-8").strip().splitlines()):
        values = [float(value) for value in line.split()]
        if len(values) != 2 or not all(math.isfinite(value) for value in values):
            raise RuntimeError(f"invalid row {contract['name']}:{index + 1}")
        rows.append(tuple(values))
    if len(rows) != 7251 or any(abs(row[0] - (5 + 0.02 * index)) >= 1e-9 for index, row in enumerate(rows)):
        raise RuntimeError(f"grid changed for {contract['name']}")
    return rows


calibration_profiles = {contract["name"]: parse_profile(CALIBRATION_DIR, contract) for contract in CALIBRATION_MANIFEST["files"]}
holdout_profiles = {contract["name"]: parse_profile(HOLDOUT_DIR, contract) for contract in HOLDOUT_MANIFEST["files"]}


def interpolate(left_x, left_y, right_x, right_y, x):
    return (left_y + right_y) / 2 if left_x == right_x else left_y + (right_y - left_y) * (x - left_x) / (right_x - left_x)


def peak_area(points, center):
    contract = RC20_SPEC["peakAreaContract"]
    signal = [row for row in points if abs(row[0] - center) <= contract["signalHalfWidthDegrees2Theta"]]
    low = [row for row in points if center - contract["sidebandOuterHalfWidthDegrees2Theta"] <= row[0] <= center - contract["sidebandInnerHalfWidthDegrees2Theta"]]
    high = [row for row in points if center + contract["sidebandInnerHalfWidthDegrees2Theta"] <= row[0] <= center + contract["sidebandOuterHalfWidthDegrees2Theta"]]
    if len(signal) < 2 or not low or not high:
        return None
    low_x, high_x = statistics.median(row[0] for row in low), statistics.median(row[0] for row in high)
    low_y, high_y = statistics.median(row[1] for row in low), statistics.median(row[1] for row in high)
    net = [(x, max(y - interpolate(low_x, low_y, high_x, high_y, x), 0)) for x, y in signal]
    return sum((net[index][0] - net[index - 1][0]) * (net[index][1] + net[index - 1][1]) / 2 for index in range(1, len(net)))


def estimate(values, responses):
    if any(values[phase] is None or values[phase] <= 0 or responses[phase] <= 0 for phase in PHASES):
        return None
    unnormalized = {phase: values[phase] / responses[phase] for phase in PHASES}
    total = sum(unnormalized.values())
    return {phase: unnormalized[phase] / total * 100 for phase in PHASES}


def percentile(values, probability):
    ordered = sorted(values)
    position = probability * (len(ordered) - 1)
    low, high = math.floor(position), math.ceil(position)
    return ordered[low] if low == high else ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def baseline_subtract(points):
    bins = [[] for _ in range(73)]
    for point in points:
        bins[min(72, math.floor((point[0] - 5) / 2))].append(point)
    anchors = [(statistics.median(row[0] for row in group), percentile([row[1] for row in group], 0.05)) for group in bins if group]
    anchor = 0
    result = []
    for x, y in points:
        while anchor + 1 < len(anchors) and x > anchors[anchor + 1][0]:
            anchor += 1
        left, right = anchors[min(anchor, len(anchors) - 1)], anchors[min(anchor + 1, len(anchors) - 1)]
        result.append((x, max(y - interpolate(left[0], left[1], right[0], right[1], x), 0)))
    return result


def segment(points):
    return [row[1] for row in points if 20 <= row[0] <= 100]


def dot(left, right):
    return sum(a * b for a, b in zip(left, right))


def solve_linear(matrix, vector):
    n = len(vector)
    augmented = [list(row) + [vector[index]] for index, row in enumerate(matrix)]
    for column in range(n):
        pivot = max(range(column, n), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-12:
            return None
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        for row in range(column + 1, n):
            factor = augmented[row][column] / augmented[column][column]
            for index in range(column, n + 1):
                augmented[row][index] -= factor * augmented[column][index]
    solution = [0] * n
    for row in range(n - 1, -1, -1):
        solution[row] = (augmented[row][n] - sum(augmented[row][index] * solution[index] for index in range(row + 1, n))) / augmented[row][row]
    return solution


def nnls(target, templates):
    best = None
    for mask in range(1, 2 ** len(PHASES)):
        active = [index for index in range(len(PHASES)) if mask & (1 << index)]
        gram = [[dot(templates[i], templates[j]) for j in active] for i in active]
        rhs = [dot(templates[i], target) for i in active]
        fit = solve_linear(gram, rhs)
        if fit is None or any(value < 0 for value in fit):
            continue
        coefficients = [0] * len(PHASES)
        for index, phase_index in enumerate(active):
            coefficients[phase_index] = fit[index]
        residual = sum((value - sum(coefficients[phase] * templates[phase][row] for phase in range(len(PHASES)))) ** 2 for row, value in enumerate(target))
        if best is None or residual < best["residual"]:
            best = {"coefficients": coefficients, "residual": residual, "active": [PHASES[index] for index in active]}
    if best is not None:
        best["normalizedResidual"] = math.sqrt(best["residual"] / dot(target, target))
    return best


templates = [segment(baseline_subtract(calibration_profiles[f"{phase}.prn"])) for phase in PHASES]
calibration_fits = {sample: nnls(segment(baseline_subtract(calibration_profiles[f"cpd-{sample}.prn"])), templates) for sample in SPEC["calibrationSamples"]}
full_responses = {"fluorite": 1.0}
for phase in [name for name in PHASES if name != "fluorite"]:
    phase_index, fluorite_index = PHASES.index(phase), PHASES.index("fluorite")
    ratios = []
    for sample in SPEC["calibrationSamples"]:
        coefficients, truth = calibration_fits[sample]["coefficients"], SPEC["truthWeightPercent"][sample]
        ratios.append((coefficients[phase_index] / coefficients[fluorite_index]) / (truth[phase] / truth["fluorite"]))
    full_responses[phase] = math.exp(statistics.median(math.log(value) for value in ratios))


def maximum_error(value, truth):
    return None if value is None else max(abs(value[phase] - truth[phase]) for phase in PHASES)


rows = []
for contract in HOLDOUT_MANIFEST["files"]:
    sample, points = contract["sample"], holdout_profiles[contract["name"]]
    primary_areas = {phase: peak_area(points, RC20_SPEC["peakAreaContract"]["primaryCentersDegrees2Theta"][phase]) for phase in PHASES}
    secondary_areas = {phase: peak_area(points, RC20_SPEC["peakAreaContract"]["secondaryCentersDegrees2Theta"][phase]) for phase in PHASES}
    primary = estimate(primary_areas, RC20_RESULT["calibrations"]["primary"]["responseRatios"])
    secondary = estimate(secondary_areas, RC20_RESULT["calibrations"]["secondary"]["responseRatios"])
    fit = nnls(segment(baseline_subtract(points)), templates)
    coefficient_map = {phase: fit["coefficients"][index] for index, phase in enumerate(PHASES)}
    full_pattern = estimate(coefficient_map, full_responses)
    truth = SPEC["truthWeightPercent"][sample]
    rows.append({
        "sample": sample,
        "primaryMaximumError": maximum_error(primary, truth),
        "secondaryMaximumError": maximum_error(secondary, truth),
        "fullPatternMaximumError": maximum_error(full_pattern, truth),
        "peakAgreement": max(abs(primary[phase] - secondary[phase]) for phase in PHASES) if primary and secondary else None,
        "fullPatternResidual": fit["normalizedResidual"],
        "primaryMaximumDifferenceFromXrf": max(abs(primary[phase] - SPEC["xrfWeightPercentAsReported"][sample][phase]) for phase in PHASES),
        "fullPatternMaximumDifferenceFromXrf": max(abs(full_pattern[phase] - SPEC["xrfWeightPercentAsReported"][sample][phase]) for phase in PHASES),
    })


def ranks(values):
    ordered = sorted(values)
    return [statistics.mean(index + 1 for index, item in enumerate(ordered) if item == value) for value in values]


def correlation(left, right):
    left_mean, right_mean = statistics.mean(left), statistics.mean(right)
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in zip(left, right))
    denominator = math.sqrt(sum((value - left_mean) ** 2 for value in left) * sum((value - right_mean) ** 2 for value in right))
    return numerator / denominator if denominator else None


peak_maximum = max(row["primaryMaximumError"] for row in rows)
full_maximum = max(row["fullPatternMaximumError"] for row in rows)
spearman = correlation(ranks([row["peakAgreement"] for row in rows]), ranks([row["primaryMaximumError"] for row in rows]))
audit = {
    "auditId": "IUCR-QARR-EXTERNAL-HOLDOUT-PYTHON-AUDIT-0.1",
    "generatedOn": "2026-08-14",
    "implementation": "Python standard library; does not import or execute the JavaScript holdout reduction",
    "denominators": {"calibrationProfiles": len(calibration_profiles), "holdoutProfiles": len(rows), "pointsPerProfile": 7251, "fullPatternFitPoints": len(templates[0])},
    "fullPatternResponseRatios": {phase: rounded(full_responses[phase]) for phase in PHASES},
    "holdouts": [{key: rounded(value, 6) if isinstance(value, float) else value for key, value in row.items()} for row in rows],
    "aggregate": {
        "peakMaximumError": rounded(peak_maximum, 6),
        "fullPatternMaximumError": rounded(full_maximum, 6),
        "peakMaximumDifferenceFromXrf": rounded(max(row["primaryMaximumDifferenceFromXrf"] for row in rows), 6),
        "fullPatternMaximumDifferenceFromXrf": rounded(max(row["fullPatternMaximumDifferenceFromXrf"] for row in rows), 6),
        "worstErrorReduction": rounded(1 - full_maximum / peak_maximum),
        "peakAgreementErrorSpearman": rounded(spearman),
    },
    "decisions": {
        "H1": all(row["primaryMaximumError"] <= 5 for row in rows),
        "H2": all(row["fullPatternMaximumError"] <= 5 for row in rows),
        "H3": full_maximum <= 5 and full_maximum <= 0.8 * peak_maximum,
        "H4": spearman is not None and spearman >= 0.8,
    },
}

output = ROOT / "research/reproducibility/iucr-qarr-external-holdout-python-audit.json"
if "--write" in sys.argv:
    output.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output.relative_to(ROOT)}")
else:
    print(json.dumps(audit, ensure_ascii=False, indent=2))
