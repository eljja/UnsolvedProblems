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
HOLD_DIR = Path(os.environ.get("IUCR_QARR_HOLDOUT_DIR", Path(tempfile.gettempdir()) / "unsolved-rc21-qarr-holdout"))
OPEN_DIR = Path(os.environ.get("IUCR_QARR_OPEN_WORLD_DIR", Path(tempfile.gettempdir()) / "unsolved-rc22-qarr-open-world"))


def load(name):
    return json.loads((ROOT / "research/reproducibility" / name).read_text(encoding="utf-8"))


spec = load("iucr-qarr-open-world-spec.json")
ref_manifest = load("iucr-qarr-reference-pattern-manifest.json")
hold_manifest = load("iucr-qarr-external-holdout-manifest.json")
open_manifest = load("iucr-qarr-open-world-manifest.json")
rc20_spec = load("iucr-qpa-independent-reduction-spec.json")
rc20_result = load("iucr-qpa-independent-reduction-result.json")
rc21_result = load("iucr-qarr-external-holdout-result.json")
known = spec["knownPhases"]
candidates = spec["candidatePhases"]


def parse(directory, contract):
    raw = (directory / contract["name"]).read_bytes()
    if len(raw) != contract["bytes"] or hashlib.sha256(raw).hexdigest() != contract["sha256"]:
        raise RuntimeError("profile contract changed: " + contract["name"])
    rows = [tuple(map(float, line.split())) for line in raw.decode().strip().splitlines()]
    if len(rows) != 7251 or any(len(row) != 2 or abs(row[0] - (5 + .02 * i)) >= 1e-9 for i, row in enumerate(rows)):
        raise RuntimeError("grid changed: " + contract["name"])
    return rows


refs = {c["name"]: parse(REF_DIR, c) for c in ref_manifest["files"]}
holds = {c["name"]: parse(HOLD_DIR, c) for c in hold_manifest["files"]}
opens = {c["name"]: parse(OPEN_DIR, c) for c in open_manifest["files"]}


def percentile(values, probability):
    ordered = sorted(values)
    position = probability * (len(ordered) - 1)
    low, high = math.floor(position), math.ceil(position)
    return ordered[low] if low == high else ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def interpolate(a, b, x):
    return (a[1] + b[1]) / 2 if a[0] == b[0] else a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])


def baseline(points):
    bins = [[] for _ in range(73)]
    for point in points:
        bins[min(72, math.floor((point[0] - 5) / 2))].append(point)
    anchors = [(statistics.median(p[0] for p in group), percentile([p[1] for p in group], .05)) for group in bins if group]
    result, anchor = [], 0
    for x, y in points:
        while anchor + 1 < len(anchors) and x > anchors[anchor + 1][0]:
            anchor += 1
        result.append((x, max(y - interpolate(anchors[anchor], anchors[min(anchor + 1, len(anchors) - 1)], x), 0)))
    return result


def vector(points, mask=None):
    return [y for x, y in points if 10 <= x <= 100 and (mask is None or x < mask[0] or x > mask[1])]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def solve(matrix, rhs):
    n = len(rhs)
    a = [list(row) + [rhs[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda row: abs(a[row][col]))
        if abs(a[pivot][col]) < 1e-12:
            return None
        a[col], a[pivot] = a[pivot], a[col]
        for row in range(col + 1, n):
            factor = a[row][col] / a[col][col]
            for index in range(col, n + 1):
                a[row][index] -= factor * a[col][index]
    result = [0] * n
    for row in range(n - 1, -1, -1):
        result[row] = (a[row][n] - sum(a[row][i] * result[i] for i in range(row + 1, n))) / a[row][row]
    return result


def nnls(target, templates, names):
    best = None
    for active_mask in range(1, 2 ** len(names)):
        active = [i for i in range(len(names)) if active_mask & (1 << i)]
        solution = solve([[dot(templates[i], templates[j]) for j in active] for i in active], [dot(templates[i], target) for i in active])
        if solution is None or any(value < -1e-12 for value in solution):
            continue
        coefficients = [0] * len(names)
        for index, phase in enumerate(active):
            coefficients[phase] = max(0, solution[index])
        residual = sum((value - sum(coefficients[i] * templates[i][row] for i in range(len(names)))) ** 2 for row, value in enumerate(target))
        if best is None or residual < best["residual"]:
            best = {"coefficients": coefficients, "residual": residual}
    best["normalizedResidual"] = math.sqrt(best["residual"] / dot(target, target))
    return best


def fit(points, template_points, names, mask=None):
    return nnls(vector(baseline(points), mask), [vector(item, mask) for item in template_points], names)


templates = [baseline(refs[name + ".prn"]) for name in known]
calibration = [fit(refs[f"cpd-{sample}.prn"], templates, known) for sample in ("1a", "1b", "1c")]
s0 = statistics.median(sum(row["coefficients"]) for row in calibration)


def diagnostic(row):
    known_mass = 100 * sum(row["coefficients"]) / s0
    return {"knownMass": known_mass, "missingMass": 100 - known_mass, "normalizedResidual": row["normalizedResidual"]}


calibration_diagnostics = [diagnostic(row) for row in calibration]
mass_threshold = max(10, 2 * max(abs(row["missingMass"]) for row in calibration_diagnostics))
residual_threshold = 2 * max(row["normalizedResidual"] for row in calibration_diagnostics)


def alarms(row):
    return row["missingMass"] > mass_threshold or row["normalizedResidual"] > residual_threshold


control_diagnostics = [diagnostic(fit(holds[c["name"]], templates, known)) for c in hold_manifest["files"]]
target = opens["cpd-2.prn"]
target_fit = fit(target, templates, known)
target_diagnostic = diagnostic(target_fit)


def candidate_run(mask=None):
    base = fit(target, templates, known, mask)
    rows = []
    for candidate in candidates:
        candidate_fit = fit(target, templates + [baseline(opens[candidate + ".prn"])], known + [candidate], mask)
        rows.append({
            "candidate": candidate,
            "coefficient": candidate_fit["coefficients"][-1],
            "diagnosticMass": 100 * candidate_fit["coefficients"][-1] / s0,
            "normalizedResidual": candidate_fit["normalizedResidual"],
            "squaredResidualReduction": 1 - candidate_fit["residual"] / base["residual"]
        })
    rows.sort(key=lambda row: row["normalizedResidual"])
    selected = None if abs(rows[0]["normalizedResidual"] - rows[1]["normalizedResidual"]) <= 1e-9 else rows[0]["candidate"]
    return {"selected": selected, "ranking": rows}


full, masked = candidate_run(), candidate_run(spec["numericalContract"]["dominantBrucite001MaskDegrees2Theta"])
brucite = next(row for row in full["ranking"] if row["candidate"] == "brucite")
masked_brucite = next(row for row in masked["ranking"] if row["candidate"] == "brucite")


def peak_area(points, center):
    contract = rc20_spec["peakAreaContract"]
    signal = [row for row in points if abs(row[0] - center) <= contract["signalHalfWidthDegrees2Theta"]]
    low = [row for row in points if center - contract["sidebandOuterHalfWidthDegrees2Theta"] <= row[0] <= center - contract["sidebandInnerHalfWidthDegrees2Theta"]]
    high = [row for row in points if center + contract["sidebandInnerHalfWidthDegrees2Theta"] <= row[0] <= center + contract["sidebandOuterHalfWidthDegrees2Theta"]]
    a = (statistics.median(x for x, _ in low), statistics.median(y for _, y in low))
    b = (statistics.median(x for x, _ in high), statistics.median(y for _, y in high))
    net = [(x, max(y - interpolate(a, b, x), 0)) for x, y in signal]
    return sum((net[i][0] - net[i - 1][0]) * (net[i][1] + net[i - 1][1]) / 2 for i in range(1, len(net)))


def composition(values, responses):
    raw = {name: values[name] / responses[name] for name in known}
    total = sum(raw.values())
    return {name: 100 * raw[name] / total for name in known}


centers = rc20_spec["peakAreaContract"]["primaryCentersDegrees2Theta"]
closed_peak = composition({name: peak_area(target, centers[name]) for name in known}, rc20_result["calibrations"]["primary"]["responseRatios"])
truth = spec["officialTruthWeightPercent"]["sample2"]
decisions = {
    "H1_closedThreePhaseSilentUnsafe": abs(sum(closed_peak.values()) - 100) < 1e-8 and max([abs(closed_peak[name] - truth[name]) for name in known] + [truth["brucite"]]) > 5,
    "H2_blindClosureDetectsMissingMass": all(not alarms(row) for row in control_diagnostics) and alarms(target_diagnostic) and abs(target_diagnostic["missingMass"] - truth["brucite"]) <= 10,
    "H3_candidateCompetitionIdentifiesBrucite": full["selected"] == "brucite" and brucite["coefficient"] > 0 and brucite["squaredResidualReduction"] >= .5 and brucite["normalizedResidual"] < residual_threshold,
    "H4_attributionSurvivesDominantPeakMask": masked["selected"] == "brucite" and masked_brucite["squaredResidualReduction"] >= .5 and abs(masked_brucite["diagnosticMass"] - brucite["diagnosticMass"]) / brucite["diagnosticMass"] <= .2,
    "independentPhysicalRungQualified": False
}


def rounded(value, digits=9):
    return round(value, digits)


audit = {
    "auditId": "IUCR-QARR-OPEN-WORLD-PYTHON-AUDIT-0.1", "generatedOn": "2026-08-14",
    "implementation": "Python standard library; does not import or execute the JavaScript open-world reduction",
    "blindCalibration": {"s0": rounded(s0), "massThreshold": rounded(mass_threshold, 6), "residualThreshold": rounded(residual_threshold), "knownOnlyFalseAlarms": sum(alarms(row) for row in control_diagnostics), "targetKnownMass": rounded(target_diagnostic["knownMass"], 6), "targetMissingMass": rounded(target_diagnostic["missingMass"], 6), "targetResidual": rounded(target_diagnostic["normalizedResidual"]), "targetAlarm": alarms(target_diagnostic)},
    "candidateAttribution": {"fullSelected": full["selected"], "fullBruciteMass": rounded(brucite["diagnosticMass"], 6), "fullBruciteResidualReduction": rounded(brucite["squaredResidualReduction"]), "maskedSelected": masked["selected"], "maskedBruciteMass": rounded(masked_brucite["diagnosticMass"], 6), "maskedBruciteResidualReduction": rounded(masked_brucite["squaredResidualReduction"])},
    "closedPeakComposition": {name: rounded(value, 6) for name, value in closed_peak.items()},
    "decisions": decisions
}
output = ROOT / "research/reproducibility/iucr-qarr-open-world-python-audit.json"
if "--write" in sys.argv:
    output.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Wrote " + str(output.relative_to(ROOT)))
else:
    print(json.dumps(audit, ensure_ascii=False, indent=2))
