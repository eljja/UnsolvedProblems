#!/usr/bin/env python3
"""Run the preregistered RC53 held-regime battery mechanism bridge."""

from __future__ import annotations

import csv
import io
import json
import math
import pathlib
import re
import statistics
import time
import urllib.request
import zipfile

import fsspec

ROOT = pathlib.Path(__file__).resolve().parents[1]
PRECOMMIT = ROOT / "research" / "reproducibility" / "rc53-battery-mechanism-bridge-precommit.json"
AMENDMENT = ROOT / "research" / "reproducibility" / "rc53-battery-mechanism-bridge-amendment-01.json"
SCHEMA = ROOT / "research" / "reproducibility" / "rc53-battery-mechanism-bridge-schema-audit.json"
FEATURE_OUT = ROOT / "research" / "reproducibility" / "rc53-battery-mechanism-bridge-feature-table.json"
RESULT_OUT = ROOT / "research" / "reproducibility" / "rc53-battery-mechanism-bridge-python.json"
API = "https://zenodo.org/api/records/10637534"
BASE = "https://zenodo.org/records/10637534/files/"
ARCHIVES = {
    "1": "Expt 1 - Si-based Degradation.zip",
    "2,2": "Expt 2,2 - C-based Degradation 2.zip",
    "3": "Expt 3 - Cathode Degradation and Li-Plating.zip",
    "4": "Expt 4 - Drive Cycle Aging (Control).zip",
    "5": "Expt 5 - Standard Cycle Aging (Control).zip",
}
SOC = {
    "1": (0.0, 0.30, 0),
    "2,2": (0.70, 0.85, 0),
    "3": (0.85, 1.00, 0),
    "4": (0.0, 1.00, 1),
    "5": (0.0, 1.00, 0),
}
PILOT = {"1-E", "1-F", "3-E", "3-G"}
DEVELOPMENT = {"1-A", "1-B", "1-D", "1-J", "1-K", "1-L", "1-M", "3-A", "3-B", "3-C", "3-D", "3-F", "3-H", "3-I"}
TARGET_EXPERIMENTS = {"2,2", "4", "5"}
ARMS = {
    "A": ["temperature_c", "soc_lower_fraction", "soc_upper_fraction", "soc_span_fraction", "drive_cycle_indicator"],
    "B": ["temperature_c", "soc_lower_fraction", "soc_upper_fraction", "soc_span_fraction", "drive_cycle_indicator", "bol_c10_capacity_ah", "bol_c2_capacity_ah"],
    "C": [
        "temperature_c", "soc_lower_fraction", "soc_upper_fraction", "soc_span_fraction", "drive_cycle_indicator",
        "bol_c10_capacity_ah", "bol_c2_capacity_ah", "bol_positive_electrode_capacity_ah",
        "bol_negative_electrode_capacity_ah", "bol_graphite_capacity_ah", "bol_silicon_capacity_ah",
        "bol_electrode_offset_ah", "bol_r_0_1s_ohm", "bol_r_10s_ohm", "bol_r_10s_minus_0_1s_ohm",
    ],
}


def finite(value: object) -> float:
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"non-finite value: {value}")
    return result


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "UnsolvedProblems-RC53/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def open_archive(name: str) -> tuple[object, zipfile.ZipFile]:
    url = BASE + name.replace(" ", "%20")
    last_error = None
    for attempt in range(4):
        try:
            remote = fsspec.open(url, "rb", block_size=1_048_576).open()
            return remote, zipfile.ZipFile(remote)
        except Exception as error:
            last_error = error
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Could not open {name}: {last_error}")


def member_bytes(archive_name: str, member: str) -> bytes:
    last_error = None
    for attempt in range(4):
        remote = archive = None
        try:
            remote, archive = open_archive(archive_name)
            with archive.open(member) as stream:
                return stream.read()
        except Exception as error:
            last_error = error
            time.sleep(2 * (attempt + 1))
        finally:
            if archive is not None:
                archive.close()
            if remote is not None:
                remote.close()
    raise RuntimeError(f"Could not read {member}: {last_error}")


def parse_csv(data: bytes) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))


def gitt_r10(rows: list[dict[str, str]]) -> tuple[float, dict]:
    time_s = [finite(row["Time (s)"]) for row in rows]
    current_ma = [finite(row["Current (mA)"]) for row in rows]
    voltage_v = [finite(row["Voltage (V)"]) for row in rows]
    starts = [index for index in range(1, len(rows)) if current_ma[index] < -100 and current_ma[index - 1] >= -100]
    if len(starts) != 25:
        raise ValueError(f"expected 25 GITT pulses, found {len(starts)}")
    start = starts[11]
    pre = [index for index in range(max(0, start - 10), start) if 0 < time_s[start] - time_s[index] <= 0.5 and abs(current_ma[index]) < 100]
    if len(pre) < 3:
        raise ValueError("fewer than three pre-pulse samples")
    selected_pre = pre[-3:]
    v_pre = statistics.median(voltage_v[index] for index in selected_pre)
    at_10 = min(range(start, min(len(rows), start + 300)), key=lambda index: abs((time_s[index] - time_s[start]) - 10.0))
    delta_t = time_s[at_10] - time_s[start]
    if abs(delta_t - 10.0) > 0.051 or current_ma[at_10] >= -100:
        raise ValueError(f"invalid 10 s sample: {delta_t}")
    r10 = (v_pre - voltage_v[at_10]) / abs(current_ma[at_10] / 1000.0)
    return r10, {"pulseCount": 25, "pulseNumber": 12, "sampleTimeAfterOnsetS": delta_t}


def gaussian_solve(matrix: list[list[float]], vector: list[float]) -> list[float]:
    size = len(vector)
    augmented = [row[:] + [vector[index]] for index, row in enumerate(matrix)]
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-15:
            raise ValueError("singular ridge system")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        divisor = augmented[column][column]
        augmented[column] = [value / divisor for value in augmented[column]]
        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column]
            if factor:
                augmented[row] = [left - factor * right for left, right in zip(augmented[row], augmented[column])]
    return [augmented[index][-1] for index in range(size)]


def fit_ridge(rows: list[dict], features: list[str], alpha: float = 1.0) -> dict:
    means = [statistics.fmean(row[name] for row in rows) for name in features]
    scales = []
    for name, mean in zip(features, means):
        variance = statistics.fmean((row[name] - mean) ** 2 for row in rows)
        scales.append(math.sqrt(variance) if variance > 0 else 1.0)
    x = [[(row[name] - mean) / scale for name, mean, scale in zip(features, means, scales)] for row in rows]
    y = [row["capacity_retention_rpt8"] for row in rows]
    intercept = statistics.fmean(y)
    centered = [value - intercept for value in y]
    p = len(features)
    matrix = [[sum(row[i] * row[j] for row in x) + (alpha if i == j else 0.0) for j in range(p)] for i in range(p)]
    vector = [sum(row[i] * value for row, value in zip(x, centered)) for i in range(p)]
    beta = gaussian_solve(matrix, vector)
    return {"features": features, "means": means, "scales": scales, "intercept": intercept, "coefficients": beta, "alpha": alpha}


def predict(model: dict, row: dict) -> float:
    return model["intercept"] + sum(
        coefficient * ((row[name] - mean) / scale)
        for name, mean, scale, coefficient in zip(model["features"], model["means"], model["scales"], model["coefficients"])
    )


def ranks(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda index: values[index])
    result = [0.0] * len(values)
    cursor = 0
    while cursor < len(order):
        end = cursor + 1
        while end < len(order) and values[order[end]] == values[order[cursor]]:
            end += 1
        rank = (cursor + 1 + end) / 2.0
        for index in order[cursor:end]:
            result[index] = rank
        cursor = end
    return result


def spearman(left: list[float], right: list[float]) -> float:
    a, b = ranks(left), ranks(right)
    mean_a, mean_b = statistics.fmean(a), statistics.fmean(b)
    numerator = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b))
    denominator = math.sqrt(sum((x - mean_a) ** 2 for x in a) * sum((y - mean_b) ** 2 for y in b))
    return numerator / denominator if denominator else 0.0


def metrics(predictions: list[dict]) -> dict:
    errors = [abs(item["prediction"] - item["observed"]) * 100.0 for item in predictions]
    return {
        "count": len(predictions),
        "medianAbsoluteErrorPercentagePoints": statistics.median(errors),
        "meanAbsoluteErrorPercentagePoints": statistics.fmean(errors),
        "maximumAbsoluteErrorPercentagePoints": max(errors),
        "spearman": spearman([item["prediction"] for item in predictions], [item["observed"] for item in predictions]),
    }


def main() -> None:
    precommit = json.loads(PRECOMMIT.read_text(encoding="utf-8"))
    amendment = json.loads(AMENDMENT.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    metadata = {f"{row['experiment']}-{row['cell']}": row for row in schema["metadata"]["cells"]}
    official = fetch_json(API)
    official_files = {item["key"]: item for item in official["files"]}
    hash_audit = []
    for registered in precommit["sourceManifest"]["files"]:
        current = official_files[registered["key"]]
        observed_md5 = current["checksum"].removeprefix("md5:")
        hash_audit.append({
            "key": registered["key"],
            "registeredBytes": registered["bytes"],
            "observedBytes": current["size"],
            "registeredMd5": registered["md5"],
            "observedMd5": observed_md5,
            "matches": current["size"] == registered["bytes"] and observed_md5 == registered["md5"],
        })
    if not all(item["matches"] for item in hash_audit):
        raise ValueError("official source manifest changed")

    rows = []
    extraction_audit = []
    for experiment, archive_name in ARCHIVES.items():
        directory = next(item for item in schema["archives"] if item["file"] == archive_name)
        names = directory["performanceSummaryMembers"]
        remote, archive = open_archive(archive_name)
        try:
            all_members = archive.namelist()
            for summary_member in names:
                match = re.search(r"cell ([A-Z]) \(", summary_member)
                if not match:
                    raise ValueError(f"unparsed cell member: {summary_member}")
                cell = match.group(1)
                cell_id = f"{experiment}-{cell}"
                if cell_id not in metadata:
                    raise ValueError(f"summary absent from metadata: {cell_id}")
                summary = parse_csv(archive.read(summary_member))
                by_set = {int(float(row["Ageing Sets"])): row for row in summary}
                if 0 not in by_set or 8 not in by_set:
                    raise ValueError(f"missing RPT0/RPT8: {cell_id}")
                bol, rpt8 = by_set[0], by_set[8]
                gitt_member = next((name for name in all_members if "/GITT Voltage Curves/" in name and f"cell {cell} - RPT0 - 25-pulse GITT 0.5C discharge data.csv" in name), None)
                if not gitt_member:
                    raise ValueError(f"missing RPT0 GITT: {cell_id}")
                r10, gitt_audit = gitt_r10(parse_csv(archive.read(gitt_member)))
                lower, upper, drive = SOC[experiment]
                c0 = finite(bol["C/10 Capacity [mA h]"])
                r01 = finite(bol["0.1s Resistance [Ohms]"])
                row = {
                "cell_id": cell_id,
                "experiment": experiment,
                "cell": cell,
                "split": "pilot" if cell_id in PILOT else ("development" if cell_id in DEVELOPMENT else "target"),
                "temperature_c": finite(metadata[cell_id]["temperatureC"]),
                "soc_lower_fraction": lower,
                "soc_upper_fraction": upper,
                "soc_span_fraction": upper - lower,
                "drive_cycle_indicator": drive,
                "bol_c10_capacity_ah": c0 / 1000.0,
                "bol_c2_capacity_ah": finite(bol["C/2 Capacity [mA h]"]) / 1000.0,
                "bol_positive_electrode_capacity_ah": finite(bol["PE Capacity [mA h]"]) / 1000.0,
                "bol_negative_electrode_capacity_ah": finite(bol["NE Capacity [mA h]"]) / 1000.0,
                "bol_graphite_capacity_ah": finite(bol["NE_Gr Capacity [mA h]"]) / 1000.0,
                "bol_silicon_capacity_ah": finite(bol["NE_Si Capacity [mA h]"]) / 1000.0,
                "bol_electrode_offset_ah": finite(bol["Electrode Offset [mA h]"]) / 1000.0,
                "bol_r_0_1s_ohm": r01,
                "bol_r_10s_ohm": r10,
                "bol_r_10s_minus_0_1s_ohm": r10 - r01,
                "capacity_retention_rpt8": finite(rpt8["C/10 Capacity [mA h]"]) / c0,
                }
                if row["split"] == "target" and experiment not in TARGET_EXPERIMENTS:
                    raise ValueError(f"unexpected target split: {cell_id}")
                rows.append(row)
                extraction_audit.append({"cellId": cell_id, "summaryRows": len(summary), **gitt_audit})
        finally:
            archive.close()
            remote.close()
        print(f"RC53 extracted experiment {experiment}: {len(names)} cells", flush=True)

    rows.sort(key=lambda row: (row["experiment"], row["cell"]))
    if len(rows) != 40 or sum(row["split"] == "pilot" for row in rows) != 4 or sum(row["split"] == "development" for row in rows) != 14 or sum(row["split"] == "target" for row in rows) != 22:
        raise ValueError("registered split counts changed")
    development = [row for row in rows if row["split"] == "development"]
    targets = [row for row in rows if row["split"] == "target"]
    models = {code: fit_ridge(development, features) for code, features in ARMS.items()}
    arm_results = {}
    for code, model in models.items():
        cell_predictions = [{
            "cellId": row["cell_id"], "experiment": row["experiment"],
            "observed": row["capacity_retention_rpt8"], "prediction": predict(model, row),
        } for row in targets]
        overall = metrics(cell_predictions)
        by_experiment = {experiment: metrics([item for item in cell_predictions if item["experiment"] == experiment]) for experiment in sorted(TARGET_EXPERIMENTS)}
        arm_results[code] = {"model": model, "metrics": overall, "byExperiment": by_experiment, "predictions": cell_predictions}

    a = arm_results["A"]["metrics"]
    b = arm_results["B"]["metrics"]
    c = arm_results["C"]["metrics"]
    improvement_a = (a["medianAbsoluteErrorPercentagePoints"] - c["medianAbsoluteErrorPercentagePoints"]) / a["medianAbsoluteErrorPercentagePoints"]
    improvement_b = (b["medianAbsoluteErrorPercentagePoints"] - c["medianAbsoluteErrorPercentagePoints"]) / b["medianAbsoluteErrorPercentagePoints"]
    b_vs_a = (a["medianAbsoluteErrorPercentagePoints"] - b["medianAbsoluteErrorPercentagePoints"]) / a["medianAbsoluteErrorPercentagePoints"]
    h0_pass = a["medianAbsoluteErrorPercentagePoints"] <= 1.5 and a["spearman"] >= 0.60 and all(item["medianAbsoluteErrorPercentagePoints"] <= 2.0 for item in arm_results["A"]["byExperiment"].values())
    h1_pass = b_vs_a >= 0.10 and b["maximumAbsoluteErrorPercentagePoints"] <= a["maximumAbsoluteErrorPercentagePoints"]
    h2_pass = c["medianAbsoluteErrorPercentagePoints"] <= 1.25 and improvement_a >= 0.20 and improvement_b >= 0.10 and c["spearman"] >= 0.60 and all(item["medianAbsoluteErrorPercentagePoints"] <= 2.0 for item in arm_results["C"]["byExperiment"].values())
    hypotheses = [
        {"code": "H0", "verdict": "supported" if h0_pass else "rejected"},
        {"code": "H1", "verdict": "supported" if h1_pass else "rejected"},
        {"code": "H2", "verdict": "supported" if h2_pass else "rejected"},
        {"code": "H3", "verdict": "unsupported-by-design"},
    ]
    feature_table = {
        "tableId": "RC53-BATTERY-MECHANISM-BRIDGE-FEATURE-TABLE-0.1",
        "cycleId": "RC-2026-53",
        "precommitCommit": "b2fb296",
        "pilotSchemaCommit": "47bf264",
        "arms": ARMS,
        "rows": rows,
        "extractionAudit": extraction_audit,
    }
    result = {
        "resultId": "RC53-BATTERY-MECHANISM-BRIDGE-PYTHON-0.1",
        "cycleId": "RC-2026-53",
        "runOn": "2026-08-26",
        "precommitCommit": "b2fb296",
        "pilotSchemaCommit": "47bf264",
        "sourceManifestAudit": hash_audit,
        "counts": {"candidate": 40, "pilotZeroWeight": 4, "development": 14, "untouchedTarget": 22},
        "armResults": arm_results,
        "comparisons": {"passportVsStressMdAEImprovement": improvement_a, "passportVsCapacityMdAEImprovement": improvement_b, "capacityVsStressMdAEImprovement": b_vs_a},
        "hypotheses": hypotheses,
        "claimBoundary": "RPT8 capacity retention is a common-horizon degradation response, not lifetime or EOL.",
    }
    FEATURE_OUT.write_text(json.dumps(feature_table, indent=2) + "\n", encoding="utf-8")
    RESULT_OUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"counts": result["counts"], "metrics": {code: value["metrics"] for code, value in arm_results.items()}, "comparisons": result["comparisons"], "hypotheses": hypotheses}, indent=2))


_DIRECTORY_CACHE: dict[str, list[str]] = {}


def directory_members(archive_name: str) -> list[str]:
    if archive_name not in _DIRECTORY_CACHE:
        remote, archive = open_archive(archive_name)
        try:
            _DIRECTORY_CACHE[archive_name] = archive.namelist()
        finally:
            archive.close()
            remote.close()
    return _DIRECTORY_CACHE[archive_name]


if __name__ == "__main__":
    main()
