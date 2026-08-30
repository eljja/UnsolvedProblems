#!/usr/bin/env python3
"""RC65 public HST-JWST host and NGC 3447 semantic-closure audit."""

import argparse
import hashlib
import html
import json
import math
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TAU = math.sqrt(0.017 ** 2 + 0.017 ** 2)
REQUIRED_SLOPE = 0.07


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-dir", default=".cache/rc65-jwst-host-source")
    parser.add_argument("--write", action="store_true")
    return parser.parse_args()


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def numeric_rows(path, expected_columns):
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        fields = [item.strip() for item in line.split("\t")]
        if len(fields) >= expected_columns and re.fullmatch(r"(?:NGC \d+|M101|HST .*|JWST .*)", fields[0]):
            rows.append(fields)
    return rows


def parse_table1(path):
    rows = []
    for fields in numeric_rows(path, 5):
        match = re.search(r"([0-9.]+)", fields[2])
        rows.append({"label": fields[0], "mu": float(fields[1]), "sigma": float(match.group(1)), "n": int(fields[3]), "scatter": float(fields[4])})
    return rows


def parse_table_a1(path):
    rows = []
    for fields in numeric_rows(path, 6):
        if not (fields[0].startswith("NGC") or fields[0] == "M101"):
            continue
        rows.append({"host": fields[0].replace(" ", ""), "jwst": float(fields[1]), "jwstSigma": float(fields[2]), "hst": float(fields[3]), "hstSigma": float(fields[4]), "filter": fields[5]})
    return rows


def parse_mrt(path):
    rows = []
    pattern = re.compile(r"^(N3447(?:Spiral|A)?)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)")
    for line in path.read_text(encoding="utf-8").splitlines():
        match = pattern.match(line)
        if not match:
            continue
        host, cepheid_id, ra, dec, logp, f150w, e_f150w, color, e_color = match.groups()
        rows.append({"host": host, "id": cepheid_id, "ra": float(ra), "dec": float(dec), "logP": float(logp), "f150w": float(f150w), "f150wSigma": float(e_f150w), "color": float(color), "colorSigma": float(e_color)})
    return rows


def strip_markup(value):
    value = re.sub(r"<annotation.*?</annotation>", "", value, flags=re.S)
    value = re.sub(r"<[^>]+>", "", value)
    return " ".join(html.unescape(value).replace("−", "-").replace("–", "-").split())


def parse_2024_table3(path):
    source = path.read_text(encoding="utf-8")
    table = re.search(r'<table id="S3\.T3\.6".*?</table>', source, flags=re.S).group(0)
    parsed = []
    for row_markup in re.findall(r"<tr[^>]*>(.*?)</tr>", table, flags=re.S):
        cells = [strip_markup(cell) for cell in re.findall(r"<td[^>]*>(.*?)</td>", row_markup, flags=re.S)]
        if len(cells) == 17 and cells[0].startswith("n") and cells[0] != "n4258":
            parsed.append({"host": cells[0].upper(), "jwst": float(cells[7]), "hst": float(cells[13]), "delta": float(cells[15]), "deltaSigma": float(cells[16]), "filter": "F150W"})
    anchor_markup = next(row for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table, flags=re.S) if "n4258" in row)
    anchor_cells = [strip_markup(cell) for cell in re.findall(r"<td[^>]*>(.*?)</td>", anchor_markup, flags=re.S)]
    return parsed, {"jwstInterceptSigma": float(anchor_cells[5]), "hstInterceptSigma": float(anchor_cells[11])}


def solve(matrix, vector):
    n = len(vector)
    aug = [list(matrix[i]) + [vector[i]] for i in range(n)]
    for column in range(n):
        pivot = max(range(column, n), key=lambda row: abs(aug[row][column]))
        if abs(aug[pivot][column]) < 1e-15:
            raise ValueError("singular matrix")
        aug[column], aug[pivot] = aug[pivot], aug[column]
        scale = aug[column][column]
        aug[column] = [value / scale for value in aug[column]]
        for row in range(n):
            if row == column:
                continue
            factor = aug[row][column]
            aug[row] = [aug[row][item] - factor * aug[column][item] for item in range(n + 1)]
    return [aug[index][n] for index in range(n)]


def inverse(matrix):
    columns = []
    for index in range(len(matrix)):
        unit = [0.0] * len(matrix)
        unit[index] = 1.0
        columns.append(solve(matrix, unit))
    return [[columns[column][row] for column in range(len(matrix))] for row in range(len(matrix))]


def multiply(matrix, vector):
    return [sum(value * vector[column] for column, value in enumerate(row)) for row in matrix]


def transpose(matrix):
    return [list(column) for column in zip(*matrix)]


def matmul(left, right):
    right_t = transpose(right)
    return [[sum(a * b for a, b in zip(row, column)) for column in right_t] for row in left]


def gls(rows, tau, with_slope):
    n = len(rows)
    covariance = [[tau * tau if i != j else rows[i]["sigma"] ** 2 for j in range(n)] for i in range(n)]
    cinv = inverse(covariance)
    x = [[1.0, row["hst"] - 29.397] if with_slope else [1.0] for row in rows]
    xt = transpose(x)
    normal = matmul(matmul(xt, cinv), x)
    normal_inv = inverse(normal)
    beta = multiply(normal_inv, multiply(matmul(xt, cinv), [row["delta"] for row in rows]))
    return {"coefficients": beta, "standardErrors": [math.sqrt(normal_inv[i][i]) for i in range(len(beta))]}


def host_rows(table1, table_a1, older):
    rows = []
    for item in table_a1:
        rows.append({**item, "delta": item["jwst"] - item["hst"], "sigma": math.hypot(item["jwstSigma"], item["hstSigma"]), "source": "2025-table-a1"})
    hst_refit = next(item for item in table1 if item["label"].startswith("HST Refit"))
    jwst_all = next(item for item in table1 if item["label"] == "JWST N3447 All")
    rows.append({"host": "NGC3447", "jwst": jwst_all["mu"], "hst": hst_refit["mu"], "delta": jwst_all["mu"] - hst_refit["mu"], "sigma": math.hypot(jwst_all["sigma"], hst_refit["sigma"]), "filter": "F150W", "source": "2025-table1"})
    existing = {item["host"] for item in rows}
    for item in older:
        canonical = item["host"].replace("N", "NGC", 1)
        if canonical in existing:
            continue
        rows.append({**item, "host": canonical, "sigma": item["deltaSigma"], "source": "2024-table3"})
    return rows


def fixed_component(records, weighting):
    prepared = []
    for record in records:
        w_h = record["f150w"] - 0.4 * record["color"]
        intercept_value = w_h + 3.25 * record["logP"]
        if weighting == "unweighted":
            weight = 1.0
        elif weighting == "f150w":
            weight = 1.0 / record["f150wSigma"] ** 2
        else:
            sigma = math.hypot(record["f150wSigma"], 0.4 * record["colorSigma"])
            weight = 1.0 / sigma ** 2
        prepared.append((intercept_value, weight))
    intercept = sum(value * weight for value, weight in prepared) / sum(weight for _, weight in prepared)
    residuals = [value - intercept for value, _ in prepared]
    return {"n": len(records), "intercept": intercept, "rms": math.sqrt(sum(value * value for value in residuals) / len(residuals))}


def main():
    args = arguments()
    source_dir = (ROOT / args.download_dir).resolve()
    manifest = json.loads((ROOT / "research/reproducibility/rc65-jwst-host-source-manifest.json").read_text(encoding="utf-8"))
    hash_audit = []
    for item in manifest["files"]:
        path = source_dir / item["file"]
        hash_audit.append({"file": item["file"], "bytes": path.stat().st_size, "sha256": sha256(path), "matchesManifest": path.stat().st_size == item["bytes"] and sha256(path) == item["sha256"]})

    table1 = parse_table1(source_dir / "apjlae0ad6t1_ascii.txt")
    table_a1 = parse_table_a1(source_dir / "apjlae0ad6t2_ascii.txt")
    cepheids = parse_mrt(source_dir / "apjlae0ad6t3_mrt.txt")
    older, anchor = parse_2024_table3(source_dir / "2401.04773v1.html")
    rows = host_rows(table1, table_a1, older)

    baseline_mean = gls(rows, TAU, False)
    baseline_slope = gls(rows, TAU, True)
    leave_one_out = []
    for removed in rows:
        reduced = [row for row in rows if row["host"] != removed["host"]]
        mean_fit = gls(reduced, TAU, False)
        slope_fit = gls(reduced, TAU, True)
        leave_one_out.append({
            "removedHost": removed["host"],
            "meanMag": mean_fit["coefficients"][0],
            "meanMovementMag": mean_fit["coefficients"][0] - baseline_mean["coefficients"][0],
            "slopeMagPerMag": slope_fit["coefficients"][1],
            "slopeStandardError": slope_fit["standardErrors"][1],
            "requiredSlopeExclusionSigma": (REQUIRED_SLOPE - slope_fit["coefficients"][1]) / slope_fit["standardErrors"][1]
        })
    leave_one_out.sort(key=lambda item: abs(item["meanMovementMag"]), reverse=True)

    sensitivity = []
    for tau in [0.0, 0.017, TAU, 0.03]:
        mean_fit = gls(rows, tau, False)
        slope_fit = gls(rows, tau, True)
        sensitivity.append({"sharedAnchorSigmaMag": tau, "meanMag": mean_fit["coefficients"][0], "meanStandardErrorMag": mean_fit["standardErrors"][0], "slopeMagPerMag": slope_fit["coefficients"][1], "slopeStandardError": slope_fit["standardErrors"][1]})

    filter_groups = []
    for filter_name in ["F115W", "F150W"]:
        subset = [row for row in rows if row["filter"] == filter_name]
        fit = gls(subset, TAU, False)
        filter_groups.append({"filter": filter_name, "n": len(subset), "meanMag": fit["coefficients"][0], "meanStandardErrorMag": fit["standardErrors"][0]})

    group_counts = {name: sum(1 for row in cepheids if row["host"] == name) for name in ["N3447Spiral", "N3447A", "N3447"]}
    object_fits = []
    for weighting in ["unweighted", "f150w", "propagated"]:
        spiral = fixed_component([row for row in cepheids if row["host"] == "N3447Spiral"], weighting)
        tidal = fixed_component([row for row in cepheids if row["host"] == "N3447A"], weighting)
        contrast = tidal["intercept"] - spiral["intercept"]
        object_fits.append({
            "weighting": weighting,
            "spiral": spiral,
            "tidal": tidal,
            "tidalMinusSpiralMag": contrast,
            "contrastResidualFromPublishedMag": contrast - 0.002,
            "spiralScatterResidualMag": spiral["rms"] - 0.194,
            "tidalScatterResidualMag": tidal["rms"] - 0.121,
            "semanticClosure": abs(contrast - 0.002) <= 0.01 and abs(spiral["rms"] - 0.194) <= 0.01 and abs(tidal["rms"] - 0.121) <= 0.01
        })

    slope = baseline_slope["coefficients"][1]
    slope_se = baseline_slope["standardErrors"][1]
    published_contrast_z = (0.17 - 0.002) / 0.028
    result = {
        "cycleId": "RC-2026-65",
        "implementation": "python-standard-library",
        "sourceAudit": {
            "hashes": hash_audit,
            "table1Rows": len(table1),
            "tableA1Rows": len(table_a1),
            "table3PriorHostRows": len(older),
            "machineReadableCepheidRows": len(cepheids),
            "machineReadableGroups": group_counts,
            "publishedAllCepheidCount": 144,
            "publishedPhaseCorrectionCount": 154,
            "rowShortfallVersusAll": 144 - len(cepheids),
            "rowShortfallVersusPhaseCorrections": 154 - len(cepheids),
            "allHashesMatch": all(item["matchesManifest"] for item in hash_audit)
        },
        "hostSummary": {
            "hostCount": len(rows),
            "hosts": rows,
            "missingNumericHost": "NGC4038",
            "sharedAnchorSigmaMag": TAU,
            "anchorInterceptErrors": anchor,
            "glsMeanMag": baseline_mean["coefficients"][0],
            "glsMeanStandardErrorMag": baseline_mean["standardErrors"][0],
            "glsDistanceInterceptMag": baseline_slope["coefficients"][0],
            "glsDistanceSlopeMagPerMag": slope,
            "glsDistanceSlopeStandardError": slope_se,
            "requiredCrowdingSlopeMagPerMag": REQUIRED_SLOPE,
            "requiredCrowdingSlopeExclusionSigma": (REQUIRED_SLOPE - slope) / slope_se,
            "publishedSummaryReproduced": abs(baseline_mean["coefficients"][0] + 0.022) <= 0.005 and abs(baseline_mean["standardErrors"][0] - 0.029) <= 0.005 and abs(slope + 0.005) <= 0.005 and abs(slope_se - 0.014) <= 0.005,
            "leaveOneHostOut": leave_one_out,
            "maximumMeanInfluence": leave_one_out[0],
            "minimumLeaveOneOutRequiredSlopeExclusionSigma": min(item["requiredSlopeExclusionSigma"] for item in leave_one_out),
            "crowdingSlopeRejectedUnderEveryDeletion": min(item["requiredSlopeExclusionSigma"] for item in leave_one_out) >= 3,
            "sharedAnchorSensitivity": sensitivity,
            "filterGroupDiagnostic": filter_groups
        },
        "perfectHostPublishedContrast": {
            "tidalMinusSpiralMag": 0.002,
            "standardErrorMag": 0.028,
            "requiredCrowdingOffsetMag": 0.17,
            "requiredOffsetExclusionSigma": published_contrast_z,
            "requiredOffsetRejectedAtFiveSigma": published_contrast_z >= 5
        },
        "objectLevelSemanticClosure": {
            "formula": "W_H=F150W-0.4*(V-I), slope=-3.25",
            "declaredFits": object_fits,
            "anyDeclaredFitCloses": any(item["semanticClosure"] for item in object_fits),
            "decision": "stop-and-request-missing-transformation-selection-covariance-lineage" if not any(item["semanticClosure"] for item in object_fits) else "closed"
        },
        "gates": {
            "sourceHashes": all(item["matchesManifest"] for item in hash_audit),
            "publishedHostSummary": abs(baseline_mean["coefficients"][0] + 0.022) <= 0.005 and abs(slope + 0.005) <= 0.005,
            "oneHostMeanStability": abs(leave_one_out[0]["meanMovementMag"]) < 0.01,
            "crowdingSlopeUnderDeletion": min(item["requiredSlopeExclusionSigma"] for item in leave_one_out) >= 3,
            "publishedPerfectHostContrast": published_contrast_z >= 5,
            "machineReadableCoverage": len(cepheids) == 144,
            "objectLevelSemanticClosure": any(item["semanticClosure"] for item in object_fits),
            "completeNineteenHostReproduction": False,
            "globalH0Refit": False
        },
        "claimBoundary": "The public eighteen-host summaries and published NGC 3447 differential contrast are admissible. The complete nineteen-host fit, object-level perfect-host reconstruction, and current global H0 refit are not."
    }
    output = ROOT / "research/reproducibility/rc65-jwst-host-audit-python.json"
    if args.write:
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
