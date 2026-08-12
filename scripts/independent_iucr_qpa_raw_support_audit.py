import argparse
import csv
import hashlib
import json
import math
import statistics
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PHASES = ("corundum", "fluorite", "zincite")
PREFIXES = {"corundum": "cor", "fluorite": "flu", "zincite": "zin"}
HALS = (40, 50, 70, 90, 110, 130, 150)
ERROR_GATE = 5.0
RWP_THRESHOLD = 8.043046005815


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def quantile(values, probability):
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def condition_key(sample, maximum, step, hal):
    return f"{sample}|{maximum}|{step:.3f}|{hal}"


def trapezoid(points, transform):
    total = 0.0
    for left, right in zip(points, points[1:]):
        total += (right[0] - left[0]) * (transform(left[1]) + transform(right[1])) / 2
    return total


def window_snr(points, contract):
    center = contract["centerDegrees2Theta"]
    signal = [point for point in points if abs(point[0] - center) <= contract["signalHalfWidth"]]
    sideband = [
        point for point in points
        if contract["backgroundInnerHalfWidth"] <= abs(point[0] - center) <= contract["backgroundOuterHalfWidth"]
    ]
    if not signal or not sideband:
        return 0.0
    background = statistics.median(point[1] for point in sideband)
    net = max(0.0, sum(point[1] - background for point in signal))
    variance = max(1.0, sum(max(point[1], 0.0) for point in signal) + background * len(signal))
    return net / math.sqrt(variance)


def parse_raw(raw_dir, manifest, spec):
    features = {}
    for contract in manifest["rawFiles"]:
        source = raw_dir / contract["name"]
        if source.stat().st_size != contract["bytes"] or sha256(source) != contract["sha256"]:
            raise RuntimeError(f"Raw source changed: {contract['name']}")
        points = []
        with source.open(encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    angle, count = map(float, line.split())
                    points.append((angle, count))
        for hal in HALS:
            truncated = [point for point in points if point[0] <= hal + 1e-7]
            steps = [right[0] - left[0] for left, right in zip(truncated, truncated[1:])]
            counts = [point[1] for point in truncated]
            background = quantile(counts, 0.2)
            scores = [window_snr(truncated, window) for window in spec["rawFeatureContract"]["phaseWindows"].values()]
            key = condition_key(contract["sample"], contract["nominalMaximumIntensity"], contract["nominalStepSize"], hal)
            features[key] = {
                "sample": contract["sample"],
                "nominalMaximumIntensity": contract["nominalMaximumIntensity"],
                "nominalStepSize": contract["nominalStepSize"],
                "hal": hal,
                "actualStep": statistics.median(steps),
                "observedMaximum": max(counts),
                "netIntegratedCounts": trapezoid(truncated, lambda value: max(value - background, 0.0)),
                "phaseSupportScore": min(scores),
            }
    return features


def parse_summaries(summary_dir, manifest, truth):
    required = ["sample", "reftype", "HAL", "maxintfactor", "stepsizefactor", "Rwp_mean"]
    required.extend(f"{PREFIXES[phase]}_wt_mean" for phase in PHASES)
    rows = []
    for contract in manifest["files"]:
        source = summary_dir / contract["name"]
        if source.stat().st_size != contract["bytes"] or sha256(source) != contract["sha256"]:
            raise RuntimeError(f"Summary source changed: {contract['name']}")
        with source.open(encoding="utf-8", newline="") as handle:
            reader = csv.reader(handle)
            header = next(reader)
            indices = {column: header.index(column) for column in required}
            count = 0
            for record in reader:
                if not record:
                    continue
                sample = record[indices["sample"]]
                maximum = int(float(record[indices["maxintfactor"]]))
                step = float(record[indices["stepsizefactor"]])
                hal = int(float(record[indices["HAL"]]))
                estimates = {
                    phase: float(record[indices[f"{PREFIXES[phase]}_wt_mean"]])
                    for phase in PHASES
                }
                error = max(abs(estimates[phase] - truth[sample][phase]) for phase in PHASES)
                rows.append({
                    "sample": sample,
                    "key": condition_key(sample, maximum, step, hal),
                    "refinementType": int(float(record[indices["reftype"]])),
                    "rwp": float(record[indices["Rwp_mean"]]),
                    "maximumAbsoluteError": error,
                    "unsafe": error > ERROR_GATE,
                })
                count += 1
            if count != 728:
                raise RuntimeError(f"Unexpected summary row count for {contract['name']}: {count}")
    return rows


def make_conditions(rows, features):
    grouped = {}
    for row in rows:
        row["raw"] = features[row["key"]]
        grouped.setdefault(row["key"], []).append(row)
    conditions = []
    for key, children in grouped.items():
        if len(children) != 4:
            raise RuntimeError(f"Condition {key} does not have four children")
        raw = children[0]["raw"]
        unsafe = any(row["unsafe"] for row in children)
        conditions.append({
            **raw,
            "key": key,
            "rows": children,
            "unsafe": unsafe,
            "allUnsafe": all(row["unsafe"] for row in children),
            "discordant": unsafe and any(not row["unsafe"] for row in children),
            "maximumAbsoluteError": max(row["maximumAbsoluteError"] for row in children),
        })
    return conditions


def ratio(numerator, denominator):
    return round(numerator / denominator, 9) if denominator else None


def assess_conditions(selected, accept):
    accepted = [condition for condition in selected if accept(condition)]
    safe = [condition for condition in selected if not condition["unsafe"]]
    unsafe_accepted = [condition for condition in accepted if condition["unsafe"]]
    return {
        "acceptedConditions": len(accepted),
        "unsafeAccepted": len(unsafe_accepted),
        "safeRetention": ratio(sum(not condition["unsafe"] for condition in accepted), len(safe)),
        "maximumAcceptedError": round(max((condition["maximumAbsoluteError"] for condition in accepted), default=0.0), 9) if accepted else None,
    }


def assess_rows(selected, accept):
    accepted = [row for row in selected if accept(row)]
    safe = [row for row in selected if not row["unsafe"]]
    return {
        "acceptedRows": len(accepted),
        "unsafeAccepted": sum(row["unsafe"] for row in accepted),
        "safeRetention": ratio(sum(not row["unsafe"] for row in accepted), len(safe)),
        "maximumAcceptedError": round(max((row["maximumAbsoluteError"] for row in accepted), default=0.0), 9) if accepted else None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", required=True, type=Path)
    parser.add_argument("--summary-dir", required=True, type=Path)
    parser.add_argument("--write", action="store_true")
    arguments = parser.parse_args()

    spec = json.loads((ROOT / "research/reproducibility/iucr-qpa-raw-support-spec.json").read_text(encoding="utf-8"))
    raw_manifest = json.loads((ROOT / "research/reproducibility/iucr-qpa-raw-source-manifest.json").read_text(encoding="utf-8"))
    summary_manifest = json.loads((ROOT / "research/reproducibility/iucr-qpa-summary-source-manifest.json").read_text(encoding="utf-8"))
    transfer_spec = json.loads((ROOT / "research/reproducibility/iucr-qpa-transfer-spec.json").read_text(encoding="utf-8"))

    features = parse_raw(arguments.raw_dir, raw_manifest, spec)
    rows = parse_summaries(arguments.summary_dir, summary_manifest, transfer_spec["truthWeightPercent"])
    conditions = make_conditions(rows, features)
    development = [condition for condition in conditions if condition["sample"] == "1a"]
    holdout = [condition for condition in conditions if condition["sample"] == "1e"]
    development_rows = [row for row in rows if row["sample"] == "1a"]
    holdout_rows = [row for row in rows if row["sample"] == "1e"]

    net_threshold = max(condition["netIntegratedCounts"] for condition in development if condition["unsafe"])
    phase_threshold = max(condition["phaseSupportScore"] for condition in development if condition["unsafe"])
    nominal_gate = lambda condition: condition["nominalStepSize"] <= 0.04 and condition["hal"] >= 70 and condition["nominalMaximumIntensity"] >= 20000
    observed_gate = lambda condition: condition["actualStep"] <= 0.04 and condition["hal"] >= 70 and condition["observedMaximum"] >= 20000
    net_gate = lambda condition: condition["netIntegratedCounts"] > net_threshold
    phase_gate = lambda condition: condition["phaseSupportScore"] > phase_threshold
    rwp_gate = lambda row: row["rwp"] < RWP_THRESHOLD

    stage_partition = {}
    for sample, selected in (("1a", development_rows), ("1e", holdout_rows)):
        counts = {"bothPass": 0, "rawPassRwpFail": 0, "rawFailRwpPass": 0, "bothFail": 0}
        unsafe_counts = dict.fromkeys(counts, 0)
        for row in selected:
            raw_pass, residual_pass = phase_gate(row["raw"]), rwp_gate(row)
            group = "bothPass" if raw_pass and residual_pass else "rawPassRwpFail" if raw_pass else "rawFailRwpPass" if residual_pass else "bothFail"
            counts[group] += 1
            if row["unsafe"]:
                unsafe_counts[group] += 1
        stage_partition[sample] = {"counts": counts, "unsafeCounts": unsafe_counts}

    selector_results = {
        "nominalArticleGate": assess_conditions(holdout, nominal_gate),
        "observedArticleGate": assess_conditions(holdout, observed_gate),
        "netCountGate": assess_conditions(holdout, net_gate),
        "phaseSupportGate": assess_conditions(holdout, phase_gate),
    }
    row_results = {
        "rc18RwpGate": assess_rows(holdout_rows, rwp_gate),
        "phaseSupportConditionGate": assess_rows(holdout_rows, lambda row: phase_gate(row["raw"])),
        "twoStageGate": assess_rows(holdout_rows, lambda row: phase_gate(row["raw"]) and rwp_gate(row)),
    }
    result = {
        "auditId": "IUCR-QPA-RAW-SUPPORT-INDEPENDENT-AUDIT-0.1",
        "generatedOn": "2026-08-12",
        "implementation": "Python standard library; does not import or execute the JavaScript analysis",
        "denominators": {"rawFiles": len(raw_manifest["rawFiles"]), "rawHalConditions": len(features), "joinedConditions": len(conditions), "joinedRows": len(rows)},
        "conditionLabels": {
            "developmentUnsafe": sum(condition["unsafe"] for condition in development),
            "developmentDiscordant": sum(condition["discordant"] for condition in development),
            "holdoutUnsafe": sum(condition["unsafe"] for condition in holdout),
            "holdoutDiscordant": sum(condition["discordant"] for condition in holdout),
        },
        "thresholds": {"netIntegratedCounts": round(net_threshold, 6), "phaseSupportScore": round(phase_threshold, 9), "rwp": RWP_THRESHOLD},
        "holdoutConditionSelectors": selector_results,
        "holdoutRowSelectors": row_results,
        "stagePartition": stage_partition,
        "decisions": {
            "H1": selector_results["observedArticleGate"]["unsafeAccepted"] == 0 and selector_results["observedArticleGate"]["safeRetention"] > selector_results["nominalArticleGate"]["safeRetention"],
            "H2": any(condition["discordant"] for condition in holdout),
            "H3": selector_results["phaseSupportGate"]["unsafeAccepted"] == 0 and selector_results["phaseSupportGate"]["safeRetention"] > selector_results["netCountGate"]["safeRetention"],
            "H4": row_results["twoStageGate"]["unsafeAccepted"] == 0 and stage_partition["1e"]["counts"]["rawPassRwpFail"] > 0 and stage_partition["1e"]["counts"]["rawFailRwpPass"] > 0,
        },
    }
    if arguments.write:
        (ROOT / "research/reproducibility/iucr-qpa-raw-support-independent-audit.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    else:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
