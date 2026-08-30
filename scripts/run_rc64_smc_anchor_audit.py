#!/usr/bin/env python3
"""RC64 audit of the named 2024 SMC Cepheid anchor release."""

import argparse
import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMMIT = "c06da1a2f28761d9149d8aeedf3ebfd3e1967312"
ALPHA_FIXED = -3.26
EXCLUDED_ID = "OGLE-1455"
CRNL = 0.0293
R_BASE = 0.386
R_ALT = 0.362
BOOTSTRAP_REPLICATES = 20000
BOOTSTRAP_SEED = 20260831


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-dir", default=".cache/rc64-smc-source")
    parser.add_argument("--write", action="store_true")
    return parser.parse_args()


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def split_latex_rows(path):
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("Cepheid &"):
            continue
        fields = [field.strip() for field in line.rstrip("\\").rstrip().split("&")]
        rows.append(fields)
    return rows


def parse_table1(path):
    records = []
    for fields in split_latex_rows(path):
        if len(fields) != 8:
            raise ValueError(f"Table1 column count {len(fields)}")
        frame_field = fields[1]
        records.append({
            "id": fields[0],
            "frame": frame_field.split()[0],
            "largeDrift": "(*)" in frame_field,
            "filter": fields[2],
            "mjd": float(fields[3]),
            "exposureSeconds": float(fields[4]),
            "array": fields[5],
            "xPixel": float(fields[6]),
            "yPixel": float(fields[7])
        })
    return records


def parse_table2(path):
    records = []
    for fields in split_latex_rows(path):
        if len(fields) != 13:
            raise ValueError(f"Table2 column count {len(fields)}")
        records.append({
            "id": fields[0],
            "raDeg": float(fields[1]),
            "decDeg": float(fields[2]),
            "geoMag": float(fields[3]),
            "logP": float(fields[4]),
            "f555w": float(fields[5]),
            "f555wSigma": float(fields[6]),
            "f814w": float(fields[7]),
            "f814wSigma": float(fields[8]),
            "f160w": float(fields[9]),
            "f160wSigma": float(fields[10]),
            "mHW": float(fields[11]),
            "mHWSigma": float(fields[12])
        })
    return records


def mean(values):
    return sum(values) / len(values)


def rms(values):
    return math.sqrt(sum(value * value for value in values) / len(values))


def sample_sd(values):
    center = mean(values)
    return math.sqrt(sum((value - center) ** 2 for value in values) / (len(values) - 1))


def fixed_fit(records, y_key):
    intercept = mean([record[y_key] - ALPHA_FIXED * record["logP"] for record in records])
    residuals = [record[y_key] - (ALPHA_FIXED * record["logP"] + intercept) for record in records]
    return {
        "slope": ALPHA_FIXED,
        "interceptLogP0Mag": intercept,
        "magnitudeAtLogP1": intercept + ALPHA_FIXED,
        "rmsMag": rms(residuals),
        "sampleSdMag": sample_sd(residuals),
        "interceptStandardErrorMag": sample_sd(residuals) / math.sqrt(len(records)),
        "residuals": residuals
    }


def ols_line(records, y_key):
    xs = [record["logP"] for record in records]
    ys = [record[y_key] for record in records]
    xbar = mean(xs)
    ybar = mean(ys)
    sxx = sum((x - xbar) ** 2 for x in xs)
    slope = sum((x - xbar) * (y - ybar) for x, y in zip(xs, ys)) / sxx
    intercept = ybar - slope * xbar
    residuals = [y - (intercept + slope * x) for x, y in zip(xs, ys)]
    sigma = math.sqrt(sum(value * value for value in residuals) / (len(xs) - 2))
    return {
        "slope": slope,
        "slopeStandardError": sigma / math.sqrt(sxx),
        "interceptLogP0Mag": intercept,
        "magnitudeAtLogP1": intercept + slope,
        "rmsMag": rms(residuals),
        "sampleSigmaMag": sigma,
        "residuals": residuals
    }


def solve_linear(matrix, vector):
    n = len(vector)
    aug = [list(matrix[row]) + [vector[row]] for row in range(n)]
    for column in range(n):
        pivot = max(range(column, n), key=lambda row: abs(aug[row][column]))
        if abs(aug[pivot][column]) < 1e-14:
            raise ValueError("singular normal matrix")
        aug[column], aug[pivot] = aug[pivot], aug[column]
        divisor = aug[column][column]
        for item in range(column, n + 1):
            aug[column][item] /= divisor
        for row in range(n):
            if row == column:
                continue
            factor = aug[row][column]
            for item in range(column, n + 1):
                aug[row][item] -= factor * aug[column][item]
    return [aug[row][n] for row in range(n)]


def affine_geometry_coefficients(records, y_key):
    # y - fixed period term = beta + gx*x + gy*y on the local tangent plane.
    normal = [[0.0] * 3 for _ in range(3)]
    rhs = [0.0] * 3
    for record in records:
        features = [1.0, record["xKpc"], record["yKpc"]]
        target = record[y_key] - ALPHA_FIXED * record["logP"]
        for row in range(3):
            rhs[row] += features[row] * target
            for column in range(3):
                normal[row][column] += features[row] * features[column]
    return solve_linear(normal, rhs)


def affine_geometry_residual(record, coefficients, y_key):
    predicted = (ALPHA_FIXED * record["logP"] + coefficients[0]
                 + coefficients[1] * record["xKpc"] + coefficients[2] * record["yKpc"])
    return record[y_key] - predicted


def segment_slope_and_se(xs, ys, start, end):
    count = end - start
    sx = sum(xs[start:end])
    sy = sum(ys[start:end])
    sxx_raw = sum(value * value for value in xs[start:end])
    sxy_raw = sum(xs[index] * ys[index] for index in range(start, end))
    xbar = sx / count
    ybar = sy / count
    sxx = sxx_raw - count * xbar * xbar
    slope = (sxy_raw - count * xbar * ybar) / sxx
    intercept = ybar - slope * xbar
    sse = sum((ys[index] - intercept - slope * xs[index]) ** 2 for index in range(start, end))
    se = math.sqrt((sse / (count - 2)) / sxx)
    return slope, se


def break_scan(xs, ys, minimum=9):
    best = None
    for split in range(minimum, len(xs) - minimum + 1):
        if xs[split - 1] == xs[split]:
            continue
        pivot = (xs[split - 1] + xs[split]) / 2
        if pivot < 0.85 or pivot > 1.5:
            continue
        left_slope, left_se = segment_slope_and_se(xs, ys, 0, split)
        right_slope, right_se = segment_slope_and_se(xs, ys, split, len(xs))
        statistic = abs(left_slope - right_slope) / math.sqrt(left_se * left_se + right_se * right_se)
        candidate = {
            "pivotLogP": pivot,
            "shortCount": split,
            "longCount": len(xs) - split,
            "shortSlope": left_slope,
            "longSlope": right_slope,
            "localStatistic": statistic
        }
        if best is None or statistic > best["localStatistic"]:
            best = candidate
    return best


class XorShiftNormal:
    def __init__(self, seed):
        self.state = seed & 0xFFFFFFFF
        self.spare = None

    def uint32(self):
        value = self.state
        value ^= (value << 13) & 0xFFFFFFFF
        value ^= value >> 17
        value ^= (value << 5) & 0xFFFFFFFF
        self.state = value & 0xFFFFFFFF
        return self.state

    def uniform(self):
        return (self.uint32() + 1.0) / 4294967297.0

    def normal(self):
        if self.spare is not None:
            value = self.spare
            self.spare = None
            return value
        radius = math.sqrt(-2.0 * math.log(self.uniform()))
        angle = 2.0 * math.pi * self.uniform()
        self.spare = radius * math.sin(angle)
        return radius * math.cos(angle)


def bootstrap_break(xs, observed_statistic, replicates, seed):
    base_records = [{"logP": x, "value": 0.0} for x in xs]
    global_fit = ols_line(base_records, "value")
    # The null line can be set to zero because the statistic is translation- and slope-invariant.
    sigma = 1.0
    rng = XorShiftNormal(seed)
    exceed = 0
    maximum_sum = 0.0
    for _ in range(replicates):
        simulated = [sigma * rng.normal() for _ in xs]
        statistic = break_scan(xs, simulated)["localStatistic"]
        maximum_sum += statistic
        if statistic >= observed_statistic:
            exceed += 1
    p_value = (exceed + 1) / (replicates + 1)
    mc_se = math.sqrt(p_value * (1 - p_value) / (replicates + 1))
    return {
        "replicates": replicates,
        "seed": seed,
        "exceedances": exceed,
        "globalPValue": p_value,
        "monteCarloStandardError": mc_se,
        "meanNullMaximumStatistic": maximum_sum / replicates
    }


def tangent_coordinates(ra_deg, dec_deg, distance=62.44):
    alpha = math.radians(ra_deg)
    delta = math.radians(dec_deg)
    alpha0 = math.radians(12.54)
    delta0 = math.radians(-73.11)
    x = -distance * math.cos(delta) * math.sin(alpha - alpha0)
    y = distance * (math.sin(delta) * math.cos(delta0)
                    - math.cos(delta) * math.sin(delta0) * math.cos(alpha - alpha0))
    return x, y


def geometry_correction(x, y, x_coefficient, y_coefficient, distance=62.44):
    local_distance = distance + x_coefficient * x + y_coefficient * y
    return 5 * math.log10(distance / local_distance)


def h0_equivalent(delta_mag, baseline=73.17):
    fraction = 10 ** (0.2 * delta_mag) - 1
    return {"percent": 100 * fraction, "kmPerSecondPerMpc": baseline * fraction}


def main():
    args = parse_args()
    download_dir = (ROOT / args.download_dir).resolve()
    table1_path = download_dir / "Table1.dat"
    table2_path = download_dir / "Table2.dat"
    table1 = parse_table1(table1_path)
    table2 = parse_table2(table2_path)

    expected_filters = {"F555W", "F814W", "F160W"}
    filters_by_id = {}
    for record in table1:
        filters_by_id.setdefault(record["id"], set()).add(record["filter"])
    all_filter_complete = all(filters == expected_filters for filters in filters_by_id.values())

    derived_residuals = []
    for record in table2:
        record["color"] = record["f555w"] - record["f814w"]
        record["mHWDerived"] = record["f160w"] - R_BASE * record["color"] + record["geoMag"] + CRNL
        record["mHWRaw"] = record["f160w"] - R_BASE * record["color"] + CRNL
        record["mHWNaiveAltR"] = record["f160w"] - R_ALT * record["color"] + record["geoMag"] + CRNL
        record["xKpc"], record["yKpc"] = tangent_coordinates(record["raDeg"], record["decDeg"])
        record["geoDebMag"] = geometry_correction(record["xKpc"], record["yKpc"], 3.086, -4.248)
        record["geoCepheidEq6Mag"] = geometry_correction(record["xKpc"], record["yKpc"], 3.480, -2.955)
        record["mHWDeb"] = record["mHWRaw"] + record["geoDebMag"]
        record["mHWEq6"] = record["mHWRaw"] + record["geoCepheidEq6Mag"]
        derived_residuals.append(record["mHWDerived"] - record["mHW"])

    retained = [record for record in table2 if record["id"] != EXCLUDED_ID]
    baseline = fixed_fit(retained, "mHW")
    free_fit = ols_line(retained, "mHW")
    all_fit = fixed_fit(table2, "mHW")
    no_geometry_fit = fixed_fit(retained, "mHWRaw")
    deb_fit = fixed_fit(retained, "mHWDeb")
    eq6_fit = fixed_fit(retained, "mHWEq6")

    # A host-specific R change is admissible only on color residuals after period-color removal.
    color_fit = ols_line(retained, "color")
    for record in retained:
        intrinsic_color = color_fit["interceptLogP0Mag"] + color_fit["slope"] * record["logP"]
        record["mHWResidualizedAltR"] = record["mHW"] + (R_BASE - R_ALT) * (record["color"] - intrinsic_color)
    residualized_r_fit = fixed_fit(retained, "mHWResidualizedAltR")
    naive_r_fit = fixed_fit(retained, "mHWNaiveAltR")

    leave_one_out = []
    for removed in retained:
        reduced = [record for record in retained if record["id"] != removed["id"]]
        reduced_fit = fixed_fit(reduced, "mHW")
        shift = reduced_fit["magnitudeAtLogP1"] - baseline["magnitudeAtLogP1"]
        leave_one_out.append({"id": removed["id"], "shiftMag": shift, "absoluteShiftMag": abs(shift)})
    leave_one_out.sort(key=lambda item: item["absoluteShiftMag"], reverse=True)

    no_geometry_coefficients = affine_geometry_coefficients(retained, "mHWRaw")
    training_residuals = [affine_geometry_residual(record, no_geometry_coefficients, "mHWRaw") for record in retained]
    loo_geometry_residuals = []
    for held in retained:
        development = [record for record in retained if record["id"] != held["id"]]
        coefficients = affine_geometry_coefficients(development, "mHWRaw")
        loo_geometry_residuals.append(affine_geometry_residual(held, coefficients, "mHWRaw"))

    sorted_records = sorted(retained, key=lambda record: record["logP"])
    xs = [record["logP"] for record in sorted_records]
    ys = [record["mHW"] for record in sorted_records]
    observed_break = break_scan(xs, ys)
    bootstrap = bootstrap_break(xs, observed_break["localStatistic"], BOOTSTRAP_REPLICATES, BOOTSTRAP_SEED)

    outlier_record = next(record for record in table2 if record["id"] == EXCLUDED_ID)
    outlier_residual = outlier_record["mHW"] - (ALPHA_FIXED * outlier_record["logP"] + baseline["interceptLogP0Mag"])

    alternatives = {
        "retainOutlier": all_fit,
        "freeSlope": free_fit,
        "noGeometry": no_geometry_fit,
        "externalDebGeometry": deb_fit,
        "cepheidEquation6Geometry": eq6_fit,
        "residualizedAlternateR": residualized_r_fit,
        "naiveAlternateRNotAdmissible": naive_r_fit
    }
    for item in alternatives.values():
        item["deltaFromBaselineAtLogP1Mag"] = item["magnitudeAtLogP1"] - baseline["magnitudeAtLogP1"]
        item["linearizedH0Equivalent"] = h0_equivalent(item["deltaFromBaselineAtLogP1Mag"])
        item.pop("residuals", None)
    baseline.pop("residuals", None)
    free_fit.pop("residuals", None)

    result = {
        "cycleId": "RC-2026-64",
        "reviewedOn": "2026-08-31",
        "source": {
            "repository": "https://github.com/lbreuval/SMC_Cepheids_HST",
            "commit": COMMIT,
            "files": [
                {"name": "Table1.dat", "bytes": table1_path.stat().st_size, "sha256": sha256(table1_path)},
                {"name": "Table2.dat", "bytes": table2_path.stat().st_size, "sha256": sha256(table2_path)}
            ]
        },
        "semanticAudit": {
            "table1Rows": len(table1),
            "table2Rows": len(table2),
            "uniqueTable1Cepheids": len(filters_by_id),
            "uniqueTable2Cepheids": len({record["id"] for record in table2}),
            "threeFilterCoverageComplete": all_filter_complete,
            "largeDriftFlaggedFrames": sum(record["largeDrift"] for record in table1),
            "largeDriftFlaggedCepheids": len({record["id"] for record in table1 if record["largeDrift"]}),
            "maximumDerivedMHWResidualMag": max(abs(value) for value in derived_residuals),
            "meanDerivedMHWResidualMag": mean(derived_residuals),
            "maximumEq6GeometryReconstructionResidualMag": max(abs(record["geoCepheidEq6Mag"] - record["geoMag"]) for record in table2),
            "globalLadderRowDictionary": False,
            "globalParameterDictionary": False,
            "covarianceAncestry": False,
            "globalNamedDeletionAdmissible": False
        },
        "publishedBaselineReproduction": {
            "sampleSize": len(retained),
            "excludedCepheid": EXCLUDED_ID,
            "fit": baseline,
            "freeFit": {key: value for key, value in free_fit.items() if key != "residuals"},
            "outlierResidualMag": outlier_residual,
            "outlierResidualInPublishedScatter": abs(outlier_residual) / 0.1017,
            "published": {"interceptLogP0Mag": 16.467, "scatterMag": 0.1017, "freeSlope": -3.31}
        },
        "singleCepheidInfluence": {
            "maximum": leave_one_out[0],
            "topFive": leave_one_out[:5],
            "materialThresholdMag": 0.01,
            "passes": leave_one_out[0]["absoluteShiftMag"] < 0.01,
            "maximumLinearizedH0Equivalent": h0_equivalent(leave_one_out[0]["shiftMag"])
        },
        "geometryTransfer": {
            "noGeometryRmsMag": no_geometry_fit["rmsMag"],
            "externalDebGeometryRmsMag": deb_fit["rmsMag"],
            "cepheidEquation6RmsMag": eq6_fit["rmsMag"],
            "sameSampleAffineTrainingRmsMag": rms(training_residuals),
            "sameSampleAffineLeaveOneOutRmsMag": rms(loo_geometry_residuals),
            "sameSampleAffineCoefficients": {
                "interceptLogP0Mag": no_geometry_coefficients[0],
                "xMagPerKpc": no_geometry_coefficients[1],
                "yMagPerKpc": no_geometry_coefficients[2]
            },
            "crossValidatedGainVersusExternalDebMag": deb_fit["rmsMag"] - rms(loo_geometry_residuals),
            "materialGainThresholdMag": 0.005,
            "materialTransferSupported": deb_fit["rmsMag"] - rms(loo_geometry_residuals) >= 0.005
        },
        "breakSearch": {
            "observed": observed_break,
            "bootstrap": bootstrap,
            "globalSignificanceThreshold": 0.01,
            "breakSupported": bootstrap["globalPValue"] < 0.01
        },
        "analysisChoiceEnvelope": alternatives,
        "claimBoundary": "The named SMC photometric table supports row-level finite-sample and model-selection audits, but not a covariance-preserving deletion of SMC from the current global SH0ES ladder."
    }

    # Gate decisions are computed after all raw adjudicands are sealed in the result.
    result["gates"] = {
        "sourceShape": len(table1) == 264 and len(table2) == 88 and all_filter_complete,
        "derivedIdentity": result["semanticAudit"]["maximumDerivedMHWResidualMag"] <= 0.002,
        "publishedBaseline": (
            abs(baseline["interceptLogP0Mag"] - 16.467) <= 0.003
            and abs(baseline["rmsMag"] - 0.1017) <= 0.003
            and abs(free_fit["slope"] - (-3.31)) <= 0.08
        ),
        "singleCepheidInfluence": result["singleCepheidInfluence"]["passes"],
        "externalGeometryNotWorse": deb_fit["rmsMag"] <= no_geometry_fit["rmsMag"] + 0.003,
        "sameSampleGeometryTransfers": result["geometryTransfer"]["materialTransferSupported"],
        "periodBreak": result["breakSearch"]["breakSupported"],
        "globalNamedDeletion": False
    }

    if args.write:
        output = ROOT / "research/reproducibility/rc64-smc-anchor-audit-python.json"
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
