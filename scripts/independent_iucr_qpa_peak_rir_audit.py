import csv
import hashlib
import json
import math
import os
import statistics
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_DIR = Path(os.environ.get("IUCR_QARR_REFERENCE_DIR", Path(tempfile.gettempdir()) / "unsolved-rc20-qarr-reference"))
RAW_DIR = Path(os.environ.get("IUCR_QPA_RAW_DIR", Path(tempfile.gettempdir()) / "unsolved-rc19-rowles-raw" / "diffraction_data"))
SUMMARY_DIR = Path(os.environ.get("IUCR_QPA_SUMMARY_DIR", Path(tempfile.gettempdir()) / "unsolved-rc18-rowles" / "sup1"))
SPEC = json.loads((ROOT / "research/reproducibility/iucr-qpa-independent-reduction-spec.json").read_text(encoding="utf-8"))
REFERENCE_MANIFEST = json.loads((ROOT / "research/reproducibility/iucr-qarr-reference-pattern-manifest.json").read_text(encoding="utf-8"))
RAW_MANIFEST = json.loads((ROOT / "research/reproducibility/iucr-qpa-raw-source-manifest.json").read_text(encoding="utf-8"))
SUMMARY_MANIFEST = json.loads((ROOT / "research/reproducibility/iucr-qpa-summary-source-manifest.json").read_text(encoding="utf-8"))
PHASES = SPEC["phaseOrder"]
PREFIX = {"corundum": "cor", "fluorite": "flu", "zincite": "zin"}


def rounded(value, digits=9):
    return round(value, digits) if math.isfinite(value) else None


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_two_column(path, contract, normalized=False):
    if not path.exists():
        raise RuntimeError(f"missing {contract['name']}")
    if not normalized and path.stat().st_size != contract["bytes"]:
        raise RuntimeError(f"byte count changed for {contract['name']}")
    if sha256(path) != contract["sha256"]:
        raise RuntimeError(f"hash changed for {contract['name']}")
    rows = []
    for index, line in enumerate(path.read_text(encoding="utf-8").strip().splitlines(), 1):
        fields = line.split()
        if len(fields) != 2:
            raise RuntimeError(f"invalid row {contract['name']}:{index}")
        rows.append((float(fields[0]), float(fields[1])))
    if any(rows[index][0] <= rows[index - 1][0] for index in range(1, len(rows))):
        raise RuntimeError(f"non-monotone profile {contract['name']}")
    return rows


def interpolate(left_x, left_y, right_x, right_y, x):
    if left_x == right_x:
        return (left_y + right_y) / 2
    return left_y + (right_y - left_y) * (x - left_x) / (right_x - left_x)


def peak_area(points, center):
    contract = SPEC["peakAreaContract"]
    signal_half = contract["signalHalfWidthDegrees2Theta"]
    inner = contract["sidebandInnerHalfWidthDegrees2Theta"]
    outer = contract["sidebandOuterHalfWidthDegrees2Theta"]
    signal = [point for point in points if abs(point[0] - center) <= signal_half]
    low = [point for point in points if center - outer <= point[0] <= center - inner]
    high = [point for point in points if center + inner <= point[0] <= center + outer]
    if len(signal) < 2 or not low or not high:
        return None
    low_x = statistics.median(point[0] for point in low)
    high_x = statistics.median(point[0] for point in high)
    low_y = statistics.median(point[1] for point in low)
    high_y = statistics.median(point[1] for point in high)
    net = [(x, max(y - interpolate(low_x, low_y, high_x, high_y, x), 0)) for x, y in signal]
    return sum((net[index][0] - net[index - 1][0]) * (net[index][1] + net[index - 1][1]) / 2 for index in range(1, len(net)))


def areas_for(points, centers):
    return {phase: peak_area(points, centers[phase]) for phase in PHASES}


def estimate(areas, responses):
    if any(areas[phase] is None or areas[phase] <= 0 or responses[phase] <= 0 for phase in PHASES):
        return None
    raw = {phase: areas[phase] / responses[phase] for phase in PHASES}
    total = sum(raw.values())
    return {phase: raw[phase] / total * 100 for phase in PHASES}


def error(estimate_value, truth):
    if estimate_value is None:
        return {"maximum": None, "unsafe": True}
    maximum = max(abs(estimate_value[phase] - truth[phase]) for phase in PHASES)
    return {"maximum": maximum, "unsafe": maximum > 5}


reference_profiles = {
    contract["name"]: parse_two_column(REFERENCE_DIR / contract["name"], contract, normalized=True)
    for contract in REFERENCE_MANIFEST["files"]
}
families = {
    "primary": SPEC["peakAreaContract"]["primaryCentersDegrees2Theta"],
    "secondary": SPEC["peakAreaContract"]["secondaryCentersDegrees2Theta"],
}
calibration_samples = {"cpd-1a.prn": "1a", "cpd-1b.prn": "1b", "cpd-1c.prn": "1c"}


def calibrate(centers):
    mixtures = [(sample, areas_for(reference_profiles[file], centers)) for file, sample in calibration_samples.items()]
    responses = {"fluorite": 1.0}
    ratios_by_mixture = {sample: {"fluorite": 1.0} for sample, _ in mixtures}
    for phase in [name for name in PHASES if name != "fluorite"]:
        values = []
        for sample, areas in mixtures:
            value = float("inf") if areas["fluorite"] == 0 else (areas[phase] / areas["fluorite"]) / (SPEC["truthWeightPercent"][sample][phase] / SPEC["truthWeightPercent"][sample]["fluorite"])
            ratios_by_mixture[sample][phase] = value
            values.append(math.log(value) if value > 0 else float("-inf"))
        responses[phase] = math.exp(statistics.median(values))
    return responses, ratios_by_mixture


calibrations = {family: calibrate(centers) for family, centers in families.items()}
target_profiles = []
for contract in RAW_MANIFEST["rawFiles"]:
    points = parse_two_column(RAW_DIR / contract["name"], contract)
    primary = estimate(areas_for(points, families["primary"]), calibrations["primary"][0])
    secondary = estimate(areas_for(points, families["secondary"]), calibrations["secondary"][0])
    primary_error = error(primary, SPEC["truthWeightPercent"][contract["sample"]])
    secondary_error = error(secondary, SPEC["truthWeightPercent"][contract["sample"]])
    agreement = max(abs(primary[phase] - secondary[phase]) for phase in PHASES) if primary and secondary else None
    target_profiles.append({
        "name": contract["name"], "sample": contract["sample"],
        "maximum": contract["nominalMaximumIntensity"], "step": contract["nominalStepSize"],
        "adequate": contract["nominalMaximumIntensity"] >= 20000 and contract["nominalStepSize"] <= 0.04,
        "primary": primary, "primaryError": primary_error, "secondaryError": secondary_error, "agreement": agreement,
    })


def summarize(selected):
    primary_errors = [row["primaryError"]["maximum"] if row["primaryError"]["maximum"] is not None else float("inf") for row in selected]
    agreements = [row["agreement"] if row["agreement"] is not None else float("inf") for row in selected]
    return {
        "profiles": len(selected),
        "refusedProfiles": sum(row["primary"] is None for row in selected),
        "unsafePrimary": sum(row["primaryError"]["unsafe"] for row in selected),
        "unsafeSecondary": sum(row["secondaryError"]["unsafe"] for row in selected),
        "maximumPrimaryError": rounded(max(primary_errors), 6),
        "medianPrimaryError": rounded(statistics.median(primary_errors), 6),
        "medianPeakAgreement": rounded(statistics.median(agreements), 6),
    }


adequate = [row for row in target_profiles if row["adequate"]]
adequate_1a = [row for row in adequate if row["sample"] == "1a"]
adequate_1e = [row for row in adequate if row["sample"] == "1e"]
unsafe_agreements = [row["agreement"] for row in adequate_1a if row["primaryError"]["unsafe"] and row["agreement"] is not None]
agreement_threshold = min(unsafe_agreements) if unsafe_agreements else None


def gate_summary(selected):
    accepted = [row for row in selected if agreement_threshold is not None and row["agreement"] is not None and row["agreement"] < agreement_threshold]
    safe = [row for row in selected if not row["primaryError"]["unsafe"]]
    return {
        "acceptedProfiles": len(accepted),
        "unsafeAccepted": sum(row["primaryError"]["unsafe"] for row in accepted),
        "safeRetention": round(sum(not row["primaryError"]["unsafe"] for row in accepted) / len(safe), 9) if safe else None,
    }


profile_map = {(row["sample"], row["maximum"], round(row["step"], 3)): row for row in target_profiles}
partition = {"bothPass": 0, "peakUnsafeRwpPass": 0, "peakSafeRwpFail": 0, "bothFail": 0}
for contract in SUMMARY_MANIFEST["files"]:
    file = SUMMARY_DIR / contract["name"]
    if file.stat().st_size != contract["bytes"] or sha256(file) != contract["sha256"]:
        raise RuntimeError(f"summary source changed for {contract['name']}")
    with file.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        for row in reader:
            if float(row["HAL"]) != 150:
                continue
            profile = profile_map[(row["sample"], float(row["maxintfactor"]), round(float(row["stepsizefactor"]), 3))]
            peak_safe = not profile["primaryError"]["unsafe"]
            rwp_pass = float(row["Rwp_mean"]) < 8.043046005815
            group = "bothPass" if peak_safe and rwp_pass else "peakSafeRwpFail" if peak_safe else "peakUnsafeRwpPass" if rwp_pass else "bothFail"
            partition[group] += 1


calibration_deviation = {}
for family, (_, ratios) in calibrations.items():
    calibration_deviation[family] = {}
    for phase in [name for name in PHASES if name != "fluorite"]:
        center = calibrations[family][0][phase]
        deviations = [abs(ratios[sample][phase] - center) / center if math.isfinite(ratios[sample][phase]) else float("inf") for sample in ["1a", "1b", "1c"]]
        calibration_deviation[family][phase] = rounded(max(deviations))


gate_holdout = gate_summary(adequate_1e)
decisions = {
    "H1": all(row["primary"] is not None and not row["primaryError"]["unsafe"] for row in adequate) and len({row["sample"] for row in adequate}) == 2,
    "H2": agreement_threshold is not None and gate_holdout["unsafeAccepted"] == 0 and gate_holdout["safeRetention"] >= 0.5,
    "H3": all(value is not None and value <= 0.2 for family in calibration_deviation.values() for value in family.values()),
    "H4": partition["peakUnsafeRwpPass"] > 0 and partition["peakSafeRwpFail"] > 0,
}

audit = {
    "auditId": "IUCR-QPA-INDEPENDENT-PEAK-RIR-PYTHON-AUDIT-0.1",
    "generatedOn": "2026-08-13",
    "implementation": "Python standard library; does not import or execute the JavaScript reduction",
    "denominators": {"referenceProfiles": len(reference_profiles), "rowlesRawProfiles": len(target_profiles), "adequateProfiles": len(adequate), "fullAngleTopasRows": sum(partition.values())},
    "responseRatios": {family: {phase: rounded(value) for phase, value in calibration[0].items()} for family, calibration in calibrations.items()},
    "calibrationMaximumRelativeDeviation": calibration_deviation,
    "targetPerformance": {"all": summarize(target_profiles), "adequate": summarize(adequate), "adequate1a": summarize(adequate_1a), "adequate1e": summarize(adequate_1e)},
    "agreementGate": {"threshold": rounded(agreement_threshold) if agreement_threshold is not None else None, "development": gate_summary(adequate_1a), "holdout": gate_holdout},
    "diagnosticPartition": partition,
    "decisions": decisions,
}

output = ROOT / "research/reproducibility/iucr-qpa-independent-reduction-python-audit.json"
if "--write" in sys.argv:
    output.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output.relative_to(ROOT)}")
else:
    print(json.dumps(audit, ensure_ascii=False, indent=2))
