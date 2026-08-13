import hashlib
import itertools
import json
import math
import os
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_DIR = Path(os.environ.get("IUCR_QARR_REFERENCE_DIR", Path(os.environ.get("TEMP", "/tmp")) / "unsolved-rc20-qarr-reference"))
TARGET_DIR = Path(os.environ.get("IUCR_QARR_MICROABSORPTION_DIR", Path(os.environ.get("TEMP", "/tmp")) / "unsolved-rc24-qarr-microabsorption"))

def load_json(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))

SPEC = load_json("research/reproducibility/iucr-qarr-microabsorption-adversary-spec.json")
REFERENCE_MANIFEST = load_json("research/reproducibility/iucr-qarr-reference-pattern-manifest.json")
TARGET_MANIFEST = load_json("research/reproducibility/iucr-qarr-microabsorption-adversary-manifest.json")

def parse(directory, contract):
    path = directory / contract["name"]
    raw = path.read_bytes()
    if len(raw) != contract["bytes"] or hashlib.sha256(raw).hexdigest() != contract["sha256"]:
        raise RuntimeError(f"profile contract changed for {contract['name']}")
    rows = [[float(value) for value in line.split()] for line in raw.decode("utf-8").strip().splitlines()]
    if len(rows) != 7251 or any(len(row) != 2 or abs(row[0] - (5 + .02 * i)) >= 1e-9 for i, row in enumerate(rows)):
        raise RuntimeError(f"grid changed for {contract['name']}")
    return rows

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
    anchors = [[median(row[0] for row in group), percentile([row[1] for row in group], .05)] for group in bins if group]
    anchor = 0
    output = []
    for x, y in points:
        while anchor + 1 < len(anchors) and x > anchors[anchor + 1][0]:
            anchor += 1
        background = interpolate(anchors[anchor], anchors[min(anchor + 1, len(anchors) - 1)], x)
        output.append([x, max(y - background, 0)])
    return output

def vector(points):
    return [row[1] for row in baseline(points) if 10 <= row[0] <= 100]

def dot(left, right):
    return sum(a * b for a, b in zip(left, right))

def solve(matrix, rhs):
    n = len(rhs)
    work = [list(row) + [rhs[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda row: abs(work[row][col]))
        if abs(work[pivot][col]) < 1e-12:
            return None
        work[col], work[pivot] = work[pivot], work[col]
        for row in range(col + 1, n):
            factor = work[row][col] / work[col][col]
            for index in range(col, n + 1):
                work[row][index] -= factor * work[col][index]
    result = [0.0] * n
    for row in range(n - 1, -1, -1):
        result[row] = (work[row][n] - sum(work[row][index] * result[index] for index in range(row + 1, n))) / work[row][row]
    return result

def nnls(target, templates):
    best = None
    for size in range(1, len(templates) + 1):
        for active in itertools.combinations(range(len(templates)), size):
            matrix = [[dot(templates[i], templates[j]) for j in active] for i in active]
            rhs = [dot(templates[i], target) for i in active]
            fit = solve(matrix, rhs)
            if fit is None or any(value < -1e-12 for value in fit):
                continue
            coefficients = [0.0] * len(templates)
            for index, phase in enumerate(active):
                coefficients[phase] = max(0.0, fit[index])
            prediction = [sum(coefficients[index] * templates[index][row] for index in range(len(templates))) for row in range(len(target))]
            residual = sum((target[row] - prediction[row]) ** 2 for row in range(len(target)))
            if best is None or residual < best[0]:
                best = (residual, coefficients, prediction, active)
    if best is None:
        raise RuntimeError("no nonnegative solution")
    residual, coefficients, prediction, active = best
    return coefficients, prediction, residual, math.sqrt(residual / dot(target, target)), active

reference_contract = next(row for row in REFERENCE_MANIFEST["files"] if row["name"] == "corundum.prn")
contracts = {row["name"]: row for row in TARGET_MANIFEST["files"]}
target = vector(parse(TARGET_DIR, contracts["cpd-4.prn"]))
templates = [
    vector(parse(REFERENCE_DIR, reference_contract)),
    vector(parse(TARGET_DIR, contracts["magnetit.prn"])),
    vector(parse(TARGET_DIR, contracts["zircon.prn"]))
]
phases = ["corundum", "magnetite", "zircon"]
coefficients, prediction, residual, normalized_residual, active = nnls(target, templates)
coefficient_sum = sum(coefficients)
scale = SPEC["frozenDetector"]["absoluteCoefficientScale"]
missing_mass = 100 - 100 * coefficient_sum / scale
composition = {phase: 100 * coefficients[index] / coefficient_sum for index, phase in enumerate(phases)}

# Truth joins only after the reduction is fixed.
official = SPEC["officialDesignHeldUntilAdjudication"]
signed = {phase: composition[phase] - official["weighedWeightPercent"][phase] for phase in phases}
errors = {phase: abs(signed[phase]) for phase in phases}
maximum_error = max(errors.values())
xrf_total = sum(official["xrfWeightPercentAsReported"].values())
xrf_errors = {phase: abs(official["xrfWeightPercentAsReported"][phase] - official["weighedWeightPercent"][phase]) for phase in phases}
mass_alarm = missing_mass > SPEC["frozenDetector"]["massAlarmThresholdPercentagePoints"]
residual_alarm = normalized_residual > SPEC["frozenDetector"]["residualAlarmThreshold"]
decisions = {
    "H1_completeDictionaryQuantitativelySafe": maximum_error <= 5,
    "H2_frozenGateSpecificAfterDictionaryTransport": not (mass_alarm or residual_alarm),
    "H3_biasMatchesMicroabsorptionDirection": signed["corundum"] > 0 and signed["magnetite"] < 0 and signed["zircon"] < 0,
    "H4_residualWarnsOnUnsafeComposition": None if maximum_error <= 5 else residual_alarm,
    "H5_xrfDistinguishesNuisanceFromMissingMass": xrf_total >= 99 and max(xrf_errors.values()) <= 1,
    "independentPhysicalRungQualified": False
}

audit = {
    "auditId": "IUCR-QARR-MICROABSORPTION-PYTHON-AUDIT-0.1",
    "generatedOn": "2026-08-14",
    "implementation": "Python standard library; does not import or execute the JavaScript microabsorption reduction",
    "denominators": {"targetProfiles": 1, "pureReferences": 3, "fitPoints": len(target)},
    "blindTarget": {
        "coefficients": {phase: round(coefficients[index], 9) for index, phase in enumerate(phases)},
        "coefficientSum": round(coefficient_sum, 9), "missingMass": round(missing_mass, 6),
        "normalizedResidual": round(normalized_residual, 9), "alarmByMass": mass_alarm,
        "alarmByResidual": residual_alarm, "alarm": mass_alarm or residual_alarm
    },
    "closedComposition": {phase: round(composition[phase], 6) for phase in phases},
    "signedErrorsPercentagePoints": {phase: round(signed[phase], 6) for phase in phases},
    "maximumAbsoluteErrorPercentagePoints": round(maximum_error, 6),
    "xrfTotalWeightPercent": round(xrf_total, 6),
    "decisions": decisions
}
destination = ROOT / "research/reproducibility/iucr-qarr-microabsorption-python-audit.json"
destination.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Wrote {destination.relative_to(ROOT)}.")
