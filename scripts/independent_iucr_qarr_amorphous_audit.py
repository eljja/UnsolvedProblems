import hashlib
import json
import math
import os
import statistics
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REF_DIR = Path(os.environ.get("IUCR_QARR_REFERENCE_DIR", Path(tempfile.gettempdir()) / "unsolved-rc20-qarr-reference"))
CANDIDATE_DIR = Path(os.environ.get("IUCR_QARR_OPEN_WORLD_DIR", Path(tempfile.gettempdir()) / "unsolved-rc22-qarr-open-world"))
TARGET_DIR = Path(os.environ.get("IUCR_QARR_AMORPHOUS_DIR", Path(tempfile.gettempdir()) / "unsolved-rc23-qarr-amorphous"))


def load(name):
    return json.loads((ROOT / "research/reproducibility" / name).read_text(encoding="utf-8"))


spec = load("iucr-qarr-amorphous-holdout-spec.json")
ref_manifest = load("iucr-qarr-reference-pattern-manifest.json")
candidate_manifest = load("iucr-qarr-open-world-manifest.json")
target_manifest = load("iucr-qarr-amorphous-holdout-manifest.json")
rc20_spec = load("iucr-qpa-independent-reduction-spec.json")
rc20_result = load("iucr-qpa-independent-reduction-result.json")
rc21_result = load("iucr-qarr-external-holdout-result.json")
rc22_result = load("iucr-qarr-open-world-result.json")
known = ["corundum", "fluorite", "zincite"]
candidates = ["brucite", "silica"]


def parse(directory, contract):
    raw = (directory / contract["name"]).read_bytes()
    if len(raw) != contract["bytes"] or hashlib.sha256(raw).hexdigest() != contract["sha256"]:
        raise RuntimeError("profile contract changed: " + contract["name"])
    rows = [tuple(map(float, line.split())) for line in raw.decode().strip().splitlines()]
    if len(rows) != 7251 or any(len(row) != 2 or abs(row[0] - (5 + .02 * i)) >= 1e-9 for i, row in enumerate(rows)):
        raise RuntimeError("grid changed: " + contract["name"])
    return rows


refs = {c["name"]: parse(REF_DIR, c) for c in ref_manifest["files"]}
candidate_contracts = [c for c in candidate_manifest["files"] if c["name"] in [name + ".prn" for name in candidates]]
candidate_profiles = {c["name"]: parse(CANDIDATE_DIR, c) for c in candidate_contracts}
target = parse(TARGET_DIR, target_manifest["files"][0])


def percentile(sequence, probability):
    ordered = sorted(sequence)
    position = probability * (len(ordered) - 1)
    low, high = math.floor(position), math.ceil(position)
    return ordered[low] if low == high else ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def interpolate(a, b, x):
    return (a[1] + b[1]) / 2 if a[0] == b[0] else a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])


def baseline(points):
    bins = [[] for _ in range(73)]
    for point in points:
        bins[min(72, math.floor((point[0] - 5) / 2))].append(point)
    anchors = [(statistics.median(x for x, _ in group), percentile([y for _, y in group], .05)) for group in bins if group]
    output, anchor = [], 0
    for x, y in points:
        while anchor + 1 < len(anchors) and x > anchors[anchor + 1][0]:
            anchor += 1
        output.append((x, max(y - interpolate(anchors[anchor], anchors[min(anchor + 1, len(anchors) - 1)], x), 0)))
    return output


def segment(points):
    return [(x, y) for x, y in points if 10 <= x <= 100]


def dot(left, right):
    return sum(a * b for a, b in zip(left, right))


def solve(matrix, rhs):
    n = len(rhs)
    a = [list(row) + [rhs[i]] for i, row in enumerate(matrix)]
    for column in range(n):
        pivot = max(range(column, n), key=lambda row: abs(a[row][column]))
        if abs(a[pivot][column]) < 1e-12:
            return None
        a[column], a[pivot] = a[pivot], a[column]
        for row in range(column + 1, n):
            factor = a[row][column] / a[column][column]
            for index in range(column, n + 1):
                a[row][index] -= factor * a[column][index]
    result = [0] * n
    for row in range(n - 1, -1, -1):
        result[row] = (a[row][n] - sum(a[row][i] * result[i] for i in range(row + 1, n))) / a[row][row]
    return result


def nnls(target_values, templates, names):
    best = None
    for active_mask in range(1, 2 ** len(names)):
        active = [i for i in range(len(names)) if active_mask & (1 << i)]
        solution = solve([[dot(templates[i], templates[j]) for j in active] for i in active], [dot(templates[i], target_values) for i in active])
        if solution is None or any(value < -1e-12 for value in solution):
            continue
        coefficients = [0] * len(names)
        for index, phase in enumerate(active):
            coefficients[phase] = max(0, solution[index])
        prediction = [sum(coefficients[i] * templates[i][row] for i in range(len(names))) for row in range(len(target_values))]
        residual = sum((value - prediction[row]) ** 2 for row, value in enumerate(target_values))
        if best is None or residual < best["residual"]:
            best = {"coefficients": coefficients, "prediction": prediction, "residual": residual}
    best["normalizedResidual"] = math.sqrt(best["residual"] / dot(target_values, target_values))
    return best


target_segment = segment(baseline(target))
target_values = [row[1] for row in target_segment]
known_templates = [[row[1] for row in segment(baseline(refs[name + ".prn"]))] for name in known]
known_fit = nnls(target_values, known_templates, known)
scale = spec["frozenRc22Detector"]["absoluteCoefficientScale"]
known_mass = 100 * sum(known_fit["coefficients"]) / scale
missing_mass = 100 - known_mass
residual_threshold = spec["frozenRc22Detector"]["residualAlarmThreshold"]
mass_threshold = spec["frozenRc22Detector"]["massAlarmThresholdPercentagePoints"]
alarm = missing_mass > mass_threshold or known_fit["normalizedResidual"] > residual_threshold


def peak_area(points, center):
    contract = rc20_spec["peakAreaContract"]
    signal = [row for row in points if abs(row[0] - center) <= contract["signalHalfWidthDegrees2Theta"]]
    low = [row for row in points if center - contract["sidebandOuterHalfWidthDegrees2Theta"] <= row[0] <= center - contract["sidebandInnerHalfWidthDegrees2Theta"]]
    high = [row for row in points if center + contract["sidebandInnerHalfWidthDegrees2Theta"] <= row[0] <= center + contract["sidebandOuterHalfWidthDegrees2Theta"]]
    a = (statistics.median(x for x, _ in low), statistics.median(y for _, y in low))
    b = (statistics.median(x for x, _ in high), statistics.median(y for _, y in high))
    net = [(x, max(y - interpolate(a, b, x), 0)) for x, y in signal]
    return sum((net[i][0] - net[i - 1][0]) * (net[i][1] + net[i - 1][1]) / 2 for i in range(1, len(net)))


def composition(input_values, response):
    raw = {name: input_values[name] / response[name] for name in known}
    total = sum(raw.values())
    return {name: 100 * raw[name] / total for name in known}


centers = rc20_spec["peakAreaContract"]["primaryCentersDegrees2Theta"]
primary = composition({name: peak_area(target, centers[name]) for name in known}, rc20_result["calibrations"]["primary"]["responseRatios"])
whole = composition({name: known_fit["coefficients"][i] for i, name in enumerate(known)}, rc21_result["fullPatternCalibration"]["responseRatios"])

candidate_rows, candidate_fits = [], {}
for candidate in candidates:
    template = [row[1] for row in segment(baseline(candidate_profiles[candidate + ".prn"]))]
    fitted = nnls(target_values, known_templates + [template], known + [candidate])
    candidate_fits[candidate] = fitted
    candidate_rows.append({
        "candidate": candidate,
        "coefficient": fitted["coefficients"][-1],
        "diagnosticMass": 100 * fitted["coefficients"][-1] / scale,
        "normalizedResidual": fitted["normalizedResidual"],
        "squaredResidualReduction": 1 - fitted["residual"] / known_fit["residual"]
    })
candidate_rows.sort(key=lambda row: row["normalizedResidual"])
selected = None if abs(candidate_rows[0]["normalizedResidual"] - candidate_rows[1]["normalizedResidual"]) <= 1e-9 else candidate_rows[0]["candidate"]
silica = next(row for row in candidate_rows if row["candidate"] == "silica")
brucite = next(row for row in candidate_rows if row["candidate"] == "brucite")

halo_improvement = 0
outside_improvement = 0
for index, (angle, value) in enumerate(target_segment):
    known_error = (value - known_fit["prediction"][index]) ** 2
    silica_error = (value - candidate_fits["silica"]["prediction"][index]) ** 2
    improvement = known_error - silica_error
    if 15 <= angle <= 30:
        halo_improvement += improvement
    else:
        outside_improvement += improvement
halo_share = halo_improvement / (halo_improvement + outside_improvement)

truth = spec["officialTruthWeightPercent"]["sample3"]
def unsafe_closed(row):
    return max([abs(row[name] - truth[name]) for name in known] + [truth["amorphousSilica"]]) > 5


decisions = {
    "H1_closedThreePhaseSilentlyHidesAmorphous": abs(sum(primary.values()) - 100) < 1e-8 and abs(sum(whole.values()) - 100) < 1e-8 and unsafe_closed(primary) and unsafe_closed(whole),
    "H2_frozenBlindDetectorTransportsToAmorphous": all(not row["alarm"] for row in rc22_result["blindCalibration"]["knownOnlyControls"]) and alarm,
    "H3_candidateLibraryReversesToSilica": selected == "silica" and silica["coefficient"] > 0 and silica["squaredResidualReduction"] >= .5 and silica["normalizedResidual"] < residual_threshold and silica["squaredResidualReduction"] >= 2 * brucite["squaredResidualReduction"],
    "H4_frozenScaleQuantifiesAmorphousMass": abs(silica["diagnosticMass"] - truth["amorphousSilica"]) <= 10,
    "H5_gainLocalizesToOfficialHalo": halo_improvement > 0 and halo_share >= .5,
    "independentPhysicalRungQualified": False
}


def rounded(value, digits=9):
    return round(value, digits)


audit = {
    "auditId": "IUCR-QARR-AMORPHOUS-HOLDOUT-PYTHON-AUDIT-0.1", "generatedOn": "2026-08-14",
    "implementation": "Python standard library; does not import or execute the JavaScript amorphous-holdout reduction",
    "denominators": {"targetProfiles": 1, "fitPoints": len(target_values), "haloPoints": sum(15 <= x <= 30 for x, _ in target_segment), "candidateTemplates": 2},
    "blindTarget": {"knownMass": rounded(known_mass, 6), "missingMass": rounded(missing_mass, 6), "normalizedResidual": rounded(known_fit["normalizedResidual"]), "alarm": alarm},
    "closedPrimaryComposition": {name: rounded(primary[name], 6) for name in known},
    "closedWholeComposition": {name: rounded(whole[name], 6) for name in known},
    "candidateReversal": {"selected": selected, "silicaMass": rounded(silica["diagnosticMass"], 6), "silicaResidualReduction": rounded(silica["squaredResidualReduction"]), "bruciteResidualReduction": rounded(brucite["squaredResidualReduction"]), "improvementRatio": rounded(silica["squaredResidualReduction"] / brucite["squaredResidualReduction"])},
    "localization": {"haloImprovementSse": rounded(halo_improvement, 3), "outsideImprovementSse": rounded(outside_improvement, 3), "haloShare": rounded(halo_share)},
    "decisions": decisions
}
output = ROOT / "research/reproducibility/iucr-qarr-amorphous-holdout-python-audit.json"
if "--write" in sys.argv:
    output.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Wrote " + str(output.relative_to(ROOT)))
else:
    print(json.dumps(audit, ensure_ascii=False, indent=2))
