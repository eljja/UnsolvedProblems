#!/usr/bin/env python3
"""Run the preregistered RC54 KIT early-response EOL transfer test."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import pathlib
from collections import defaultdict

import numpy as np
from scipy.optimize import minimize

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "rc54-kit"
REPRO = ROOT / "research" / "reproducibility"
FEATURE_OUT = REPRO / "rc54-kit-early-response-feature-table.json"
RESULT_OUT = REPRO / "rc54-kit-early-response-python.json"
PILOTS = {"P008-1", "P017-2", "P026-1", "P069-2"}
SOCS = (10, 30, 50, 70, 90)
ALPHA = 1.0
BOOTSTRAP_SEED = 54029
BOOTSTRAP_REPLICATES = 2000

STRESS_FEATURES = [
    "inverse_temperature_relative_to_25c",
    "cyclic_indicator",
    "profile_indicator",
    "age_soc_fraction",
    "charge_rate_c",
    "discharge_rate_c",
    "cycle_voltage_min_v",
    "cycle_voltage_max_v",
    "profile_2_indicator",
    "profile_3_indicator",
    "profile_4_indicator",
]
STATIC_FEATURES = ["cu0_capacity_ah"] + [f"cu0_eis_zref_mohm_soc{soc}" for soc in SOCS] + [
    f"cu0_pulse_r10ms_mohm_soc{soc}" for soc in SOCS
] + [f"cu0_pulse_r1s_mohm_soc{soc}" for soc in SOCS]
CAPACITY_RESPONSE_FEATURES = ["early_log_capacity_response_per_day"]
PERTURBATION_FEATURES = [f"early_log_eis_zref_response_per_day_soc{soc}" for soc in SOCS] + [
    f"early_log_pulse_r10ms_response_per_day_soc{soc}" for soc in SOCS
] + [f"early_log_pulse_r1s_response_per_day_soc{soc}" for soc in SOCS]
ARM_FEATURES = {
    "A": STRESS_FEATURES,
    "B": STRESS_FEATURES + STATIC_FEATURES,
    "C": STRESS_FEATURES + STATIC_FEATURES + CAPACITY_RESPONSE_FEATURES,
    "D": STRESS_FEATURES + STATIC_FEATURES + CAPACITY_RESPONSE_FEATURES + PERTURBATION_FEATURES,
}


def finite(value: str | float | None) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def median(values: list[float]) -> float | None:
    clean = sorted(value for value in values if math.isfinite(value))
    if not clean:
        return None
    middle = len(clean) // 2
    return clean[middle] if len(clean) % 2 else (clean[middle - 1] + clean[middle]) / 2


def md5(path: pathlib.Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_rows(path: pathlib.Path):
    with path.open("r", encoding="utf-8", newline="") as handle:
        yield from csv.DictReader(handle, delimiter=";")


def file_for(kind: str, condition: int, replicate: int) -> pathlib.Path:
    prefix = f"cell_{kind}v2_P{condition:03d}_{replicate}_"
    matches = sorted((CACHE / kind).glob(f"{prefix}*.csv"))
    if len(matches) != 1:
        raise RuntimeError(f"{kind} P{condition:03d}-{replicate}: expected one file, got {len(matches)}")
    return matches[0]


def cfg_rows():
    for path in sorted((CACHE / "cfg").glob("cell_cfg_P*.csv")):
        rows = list(read_rows(path))
        if len(rows) != 1:
            raise RuntimeError(f"{path.name}: expected one config row")
        row = rows[0]
        parameter = int(row["parameter_id"])
        if parameter == 0 or row["cell_used"] != "1":
            continue
        replicate = int(row["parameter_nr"])
        yield path, parameter, replicate, row


def capacity_anchors(path: pathlib.Path):
    anchors = []
    for row in read_rows(path):
        value = finite(row["cap_aged_est_Ah"])
        timestamp = finite(row["timestamp_s"])
        if row["cyc_condition"] == "2" and row["cyc_charged"] == "0" and value is not None and timestamp is not None:
            anchors.append({"timestamp": timestamp, "capacityAh": value})
    return sorted(anchors, key=lambda item: item["timestamp"])


def diagnostic_groups(path: pathlib.Path, kind: str):
    value_columns = ["z_ref_now_mOhm"] if kind == "eis" else ["r_ref_10ms_mOhm", "r_ref_1s_mOhm"]
    groups = {}
    for row in read_rows(path):
        soc = finite(row["soc_nom"])
        timestamp = finite(row["timestamp_s"])
        if row["is_rt"] != "1" or soc not in SOCS or timestamp is None:
            continue
        if kind == "eis" and row["valid"] != "1":
            continue
        key = (row["sd_block_id"], int(soc))
        if key not in groups:
            groups[key] = {"timestamps": [], **{column: [] for column in value_columns}}
        groups[key]["timestamps"].append(timestamp)
        for column in value_columns:
            value = finite(row[column])
            if value is not None:
                groups[key][column].append(value)
    result = []
    for (_, soc), group in groups.items():
        result.append({
            "soc": soc,
            "timestamp": min(group["timestamps"]),
            **{column: median(group[column]) for column in value_columns},
        })
    return sorted(result, key=lambda item: (item["timestamp"], item["soc"]))


def checkup_diagnostics(groups, anchors, checkup_index: int, column: str):
    start = anchors[checkup_index]["timestamp"]
    end = anchors[checkup_index + 1]["timestamp"]
    result = {}
    for soc in SOCS:
        candidates = [item for item in groups if item["soc"] == soc and start <= item["timestamp"] < end and item[column] is not None]
        result[soc] = {
            "value": median([item[column] for item in candidates]),
            "timestamp": median([item["timestamp"] for item in candidates]),
            "measurementCount": len(candidates),
        }
    return result


def log_rate(q0, q1, t0, t1):
    if q0 is None or q1 is None or t0 is None or t1 is None or q0 <= 0 or q1 <= 0 or t1 <= t0:
        return None
    return math.log(q1 / q0) / ((t1 - t0) / 86400.0)


def build_cell(parameter: int, replicate: int, cfg: dict):
    identifier = f"P{parameter:03d}-{replicate}"
    age_type = int(cfg["age_type"])
    family = {1: "calendar", 2: "cyclic", 3: "profile"}.get(age_type, f"unknown-{age_type}")
    temperature = float(cfg["age_temp"])
    anchors = capacity_anchors(file_for("eoc", parameter, replicate))
    missing = []
    if len(anchors) < 3:
        missing.append("fewer_than_three_capacity_checkups")
    features = {
        "inverse_temperature_relative_to_25c": 1.0 / (temperature + 273.15) - 1.0 / 298.15,
        "cyclic_indicator": 1.0 if family == "cyclic" else 0.0,
        "profile_indicator": 1.0 if family == "profile" else 0.0,
        "age_soc_fraction": float(cfg["age_soc"]) / 100.0,
        "charge_rate_c": float(cfg["age_chg_rate"]),
        "discharge_rate_c": float(cfg["age_dischg_rate"]),
        "cycle_voltage_min_v": float(cfg["V_min_cyc_V"]),
        "cycle_voltage_max_v": float(cfg["V_max_cyc_V"]),
        "profile_2_indicator": 1.0 if int(cfg["age_profile"]) == 2 else 0.0,
        "profile_3_indicator": 1.0 if int(cfg["age_profile"]) == 3 else 0.0,
        "profile_4_indicator": 1.0 if int(cfg["age_profile"]) == 4 else 0.0,
    }
    endpoint = None
    diagnostics = {"eis": [], "pulse": []}
    if len(anchors) >= 3:
        cu0, cu1 = anchors[0], anchors[1]
        threshold = 0.8 * cu0["capacityAh"]
        crossing = next((item for item in anchors[2:] if item["capacityAh"] <= threshold), None)
        terminal = crossing or anchors[-1]
        endpoint = {
            "cu0Timestamp": cu0["timestamp"],
            "cu1Timestamp": cu1["timestamp"],
            "cu0CapacityAh": cu0["capacityAh"],
            "cu1CapacityAh": cu1["capacityAh"],
            "thresholdAh": threshold,
            "timeDays": (terminal["timestamp"] - cu1["timestamp"]) / 86400.0,
            "event": crossing is not None,
            "terminalTimestamp": terminal["timestamp"],
            "terminalCapacityAh": terminal["capacityAh"],
            "capacityCheckupCount": len(anchors),
        }
        features["cu0_capacity_ah"] = cu0["capacityAh"]
        features["early_log_capacity_response_per_day"] = log_rate(
            cu0["capacityAh"], cu1["capacityAh"], cu0["timestamp"], cu1["timestamp"]
        )
        eis_groups = diagnostic_groups(file_for("eis", parameter, replicate), "eis")
        pulse_groups = diagnostic_groups(file_for("pls", parameter, replicate), "pulse")
        diagnostics = {"eis": eis_groups, "pulse": pulse_groups}
        eis0 = checkup_diagnostics(eis_groups, anchors, 0, "z_ref_now_mOhm")
        eis1 = checkup_diagnostics(eis_groups, anchors, 1, "z_ref_now_mOhm")
        pulse10_0 = checkup_diagnostics(pulse_groups, anchors, 0, "r_ref_10ms_mOhm")
        pulse10_1 = checkup_diagnostics(pulse_groups, anchors, 1, "r_ref_10ms_mOhm")
        pulse1_0 = checkup_diagnostics(pulse_groups, anchors, 0, "r_ref_1s_mOhm")
        pulse1_1 = checkup_diagnostics(pulse_groups, anchors, 1, "r_ref_1s_mOhm")
        for soc in SOCS:
            features[f"cu0_eis_zref_mohm_soc{soc}"] = eis0[soc]["value"]
            features[f"cu0_pulse_r10ms_mohm_soc{soc}"] = pulse10_0[soc]["value"]
            features[f"cu0_pulse_r1s_mohm_soc{soc}"] = pulse1_0[soc]["value"]
            features[f"early_log_eis_zref_response_per_day_soc{soc}"] = log_rate(
                eis0[soc]["value"], eis1[soc]["value"], eis0[soc]["timestamp"], eis1[soc]["timestamp"]
            )
            features[f"early_log_pulse_r10ms_response_per_day_soc{soc}"] = log_rate(
                pulse10_0[soc]["value"], pulse10_1[soc]["value"], pulse10_0[soc]["timestamp"], pulse10_1[soc]["timestamp"]
            )
            features[f"early_log_pulse_r1s_response_per_day_soc{soc}"] = log_rate(
                pulse1_0[soc]["value"], pulse1_1[soc]["value"], pulse1_0[soc]["timestamp"], pulse1_1[soc]["timestamp"]
            )
    for name in ARM_FEATURES["D"]:
        value = features.get(name)
        if value is None or not math.isfinite(value):
            missing.append(name)
    split = "pilot" if identifier in PILOTS else ("target" if temperature == 40 else "development")
    return {
        "id": identifier,
        "conditionId": f"P{parameter:03d}",
        "replicate": replicate,
        "ageFamily": family,
        "temperatureC": temperature,
        "split": split,
        "modelWeight": 0 if split == "pilot" else 1,
        "completeD": not missing,
        "missing": sorted(set(missing)),
        "endpoint": endpoint,
        "features": features,
    }


def standardize(rows, names):
    matrix = np.asarray([[row["features"][name] for name in names] for row in rows], dtype=float)
    mean = matrix.mean(axis=0)
    scale = matrix.std(axis=0)
    scale[scale == 0] = 1.0
    return mean, scale, (matrix - mean) / scale


def aft_objective(theta, x, times, events):
    intercept = theta[0]
    beta = theta[1:-1]
    log_shape = theta[-1]
    shape = math.exp(log_shape)
    eta = intercept + x @ beta
    log_time = np.log(times)
    u = log_time - eta
    exponent = np.exp(np.clip(shape * u, -700, 700))
    event = events.astype(float)
    value = np.sum(-event * (log_shape + (shape - 1.0) * log_time - shape * eta) + exponent)
    value += 0.5 * ALPHA * float(beta @ beta)
    grad_eta = shape * (event - exponent)
    grad = np.empty_like(theta)
    grad[0] = grad_eta.sum()
    grad[1:-1] = x.T @ grad_eta + ALPHA * beta
    grad[-1] = np.sum(-event * (1.0 + shape * u) + exponent * shape * u)
    return float(value), grad


def aft_hessian(theta, x, times, events):
    feature_count = x.shape[1]
    beta = theta[1:-1]
    shape = math.exp(theta[-1])
    eta = theta[0] + x @ beta
    log_time = np.log(times)
    u = log_time - eta
    exponent = np.exp(np.clip(shape * u, -700, 700))
    event = events.astype(float)
    design = np.column_stack([np.ones(len(x)), x])
    h_eta_eta = shape * shape * exponent
    h_eta_g = shape * (event - exponent) - shape * shape * u * exponent
    w = shape * u
    h_gg = -event * w + exponent * w * (w + 1.0)
    hessian = np.zeros((feature_count + 2, feature_count + 2), dtype=float)
    hessian[:-1, :-1] = design.T @ (h_eta_eta[:, None] * design)
    hessian[:-1, -1] = design.T @ h_eta_g
    hessian[-1, :-1] = hessian[:-1, -1]
    hessian[-1, -1] = h_gg.sum()
    hessian[1:1 + feature_count, 1:1 + feature_count] += ALPHA * np.eye(feature_count)
    return hessian


def polish_score_equations(theta, x, times, events):
    current = np.asarray(theta, dtype=float).copy()
    iterations = 0
    for iterations in range(1, 26):
        value, gradient = aft_objective(current, x, times, events)
        if np.max(np.abs(gradient)) <= 1e-10:
            break
        hessian = aft_hessian(current, x, times, events)
        try:
            direction = -np.linalg.solve(hessian, gradient)
        except np.linalg.LinAlgError:
            direction = -np.linalg.lstsq(hessian, gradient, rcond=None)[0]
        directional = float(gradient @ direction)
        if not directional < 0:
            direction = -gradient
            directional = -float(gradient @ gradient)
        step = 1.0
        while step >= 2 ** -40:
            candidate = current + step * direction
            candidate_value, _ = aft_objective(candidate, x, times, events)
            if math.isfinite(candidate_value) and candidate_value <= value + 1e-4 * step * directional:
                current = candidate
                break
            step *= 0.5
        if step < 2 ** -40:
            break
    final_value, final_gradient = aft_objective(current, x, times, events)
    return current, {
        "method": "analytic score-equation Newton polish after BFGS",
        "iterations": iterations,
        "objective": final_value,
        "gradientMaxAbs": float(np.max(np.abs(final_gradient))),
        "success": bool(np.max(np.abs(final_gradient)) <= 1e-7),
    }


def fit_arm(development, target, names):
    mean, scale, x_dev = standardize(development, names)
    x_target_raw = np.asarray([[row["features"][name] for name in names] for row in target], dtype=float)
    x_target = (x_target_raw - mean) / scale
    times = np.asarray([row["endpoint"]["timeDays"] for row in development], dtype=float)
    events = np.asarray([row["endpoint"]["event"] for row in development], dtype=bool)
    initial = np.zeros(len(names) + 2)
    initial[0] = math.log(float(np.median(times)))
    initial[-1] = math.log(2.0)
    result = minimize(
        lambda theta: aft_objective(theta, x_dev, times, events),
        initial,
        method="BFGS",
        jac=True,
        options={"gtol": 1e-5, "maxiter": 5000, "disp": False},
    )
    theta, polish = polish_score_equations(result.x, x_dev, times, events)
    shape = math.exp(theta[-1])
    eta = theta[0] + x_target @ theta[1:-1]
    median_days = np.exp(eta) * math.log(2.0) ** (1.0 / shape)
    return {
        "featureNames": names,
        "developmentMean": mean.tolist(),
        "developmentScale": scale.tolist(),
        "intercept": float(theta[0]),
        "coefficients": theta[1:-1].tolist(),
        "logShape": float(theta[-1]),
        "shape": shape,
        "objective": polish["objective"],
        "optimizerSuccess": bool(result.success and polish["success"]),
        "optimizerStatus": int(result.status),
        "optimizerMessage": str(result.message),
        "iterations": int(result.nit),
        "bfgsGradientMaxAbs": float(np.max(np.abs(result.jac))),
        "gradientMaxAbs": polish["gradientMaxAbs"],
        "numericPolish": polish,
        "predictedMedianDays": median_days.tolist(),
        "predictedEta": eta.tolist(),
    }


def median_abs_error(rows, predictions):
    errors = [abs(predictions[index] - row["endpoint"]["timeDays"]) for index, row in enumerate(rows) if row["endpoint"]["event"]]
    return median(errors)


def concordance(rows, predictions, within_condition=False):
    comparable = 0
    score = 0.0
    for left in range(len(rows)):
        for right in range(left + 1, len(rows)):
            a, b = rows[left], rows[right]
            if within_condition and a["conditionId"] != b["conditionId"]:
                continue
            ta, tb = a["endpoint"]["timeDays"], b["endpoint"]["timeDays"]
            ea, eb = a["endpoint"]["event"], b["endpoint"]["event"]
            if ta == tb:
                continue
            if ta < tb and ea:
                early, late = left, right
            elif tb < ta and eb:
                early, late = right, left
            else:
                continue
            comparable += 1
            if predictions[early] < predictions[late]:
                score += 1.0
            elif predictions[early] == predictions[late]:
                score += 0.5
    return {"value": score / comparable if comparable else None, "comparablePairs": comparable}


def km_survival(rows, horizon):
    survival = 1.0
    event_times = sorted({row["endpoint"]["timeDays"] for row in rows if row["endpoint"]["event"] and row["endpoint"]["timeDays"] <= horizon})
    for event_time in event_times:
        risk = sum(row["endpoint"]["timeDays"] >= event_time for row in rows)
        deaths = sum(row["endpoint"]["event"] and row["endpoint"]["timeDays"] == event_time for row in rows)
        if risk:
            survival *= 1.0 - deaths / risk
    return survival


def metrics(rows, predictions, fit):
    event_errors = [abs(predictions[index] - row["endpoint"]["timeDays"]) for index, row in enumerate(rows) if row["endpoint"]["event"]]
    families = {}
    for family in ("calendar", "cyclic", "profile"):
        values = [
            abs(predictions[index] - row["endpoint"]["timeDays"])
            for index, row in enumerate(rows)
            if row["ageFamily"] == family and row["endpoint"]["event"]
        ]
        families[family] = {"eventCount": len(values), "medianAbsoluteErrorDays": median(values)}
    calibration = {}
    shape = fit["shape"]
    for horizon in (365, 500):
        predicted = [math.exp(-math.exp(shape * (math.log(horizon) - eta))) for eta in fit["predictedEta"]]
        observed = km_survival(rows, horizon)
        calibration[str(horizon)] = {
            "predictedMeanSurvival": sum(predicted) / len(predicted),
            "kaplanMeierSurvival": observed,
            "absoluteError": abs(sum(predicted) / len(predicted) - observed),
            "atRisk": sum(row["endpoint"]["timeDays"] >= horizon for row in rows),
        }
    return {
        "targetCount": len(rows),
        "eventCount": len(event_errors),
        "censoredCount": len(rows) - len(event_errors),
        "medianAbsoluteErrorDays": median(event_errors),
        "meanAbsoluteErrorDays": sum(event_errors) / len(event_errors) if event_errors else None,
        "maximumAbsoluteErrorDays": max(event_errors) if event_errors else None,
        "harrellConcordance": concordance(rows, predictions),
        "withinConditionConcordance": concordance(rows, predictions, True),
        "byFamily": families,
        "calibration": calibration,
        "maximumCalibrationError": max(item["absoluteError"] for item in calibration.values()),
    }


def improvement(baseline, candidate):
    return (baseline - candidate) / baseline if baseline else None


def cluster_bootstrap(rows, pred_c, pred_d):
    grouped = defaultdict(list)
    for index, row in enumerate(rows):
        grouped[row["conditionId"]].append(index)
    conditions = sorted(grouped)
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    values = []
    for _ in range(BOOTSTRAP_REPLICATES):
        sampled = rng.choice(conditions, size=len(conditions), replace=True)
        indices = [index for condition in sampled for index in grouped[condition]]
        errors_c = [abs(pred_c[index] - rows[index]["endpoint"]["timeDays"]) for index in indices if rows[index]["endpoint"]["event"]]
        errors_d = [abs(pred_d[index] - rows[index]["endpoint"]["timeDays"]) for index in indices if rows[index]["endpoint"]["event"]]
        if errors_c and errors_d:
            base = median(errors_c)
            if base:
                values.append((base - median(errors_d)) / base)
    return {
        "seed": BOOTSTRAP_SEED,
        "replicatesRequested": BOOTSTRAP_REPLICATES,
        "replicatesComputed": len(values),
        "clusterCount": len(conditions),
        "relativeMdAEImprovementDvsC": improvement(median_abs_error(rows, pred_c), median_abs_error(rows, pred_d)),
        "percentile95Interval": [float(np.quantile(values, 0.025)), float(np.quantile(values, 0.975))] if values else None,
    }


def verdicts(metrics_by_arm, complete_target):
    a, b, c, d = (metrics_by_arm[code] for code in "ABCD")
    worst = lambda value: max(item["medianAbsoluteErrorDays"] for item in value["byFamily"].values() if item["medianAbsoluteErrorDays"] is not None)
    decisions = {
        "H0": (
            a["eventCount"] >= 30 and a["medianAbsoluteErrorDays"] <= 75 and
            a["harrellConcordance"]["value"] >= 0.70 and a["maximumCalibrationError"] <= 0.15 and worst(a) <= 105
        ),
        "H1": (
            improvement(a["medianAbsoluteErrorDays"], b["medianAbsoluteErrorDays"]) >= 0.10 and
            b["harrellConcordance"]["value"] >= a["harrellConcordance"]["value"] - 0.02 and worst(b) <= worst(a)
        ),
        "H2": (
            improvement(b["medianAbsoluteErrorDays"], c["medianAbsoluteErrorDays"]) >= 0.15 and
            c["harrellConcordance"]["value"] >= b["harrellConcordance"]["value"] - 0.02 and
            c["maximumCalibrationError"] <= b["maximumCalibrationError"]
        ),
        "H3": (
            complete_target and d["eventCount"] >= 30 and d["medianAbsoluteErrorDays"] <= 60 and
            improvement(c["medianAbsoluteErrorDays"], d["medianAbsoluteErrorDays"]) >= 0.10 and
            d["harrellConcordance"]["value"] >= 0.72 and
            d["withinConditionConcordance"]["value"] >= 0.60 and
            d["withinConditionConcordance"]["comparablePairs"] >= 30 and
            worst(d) <= 90 and d["maximumCalibrationError"] <= 0.15
        ),
    }
    return {code: {"pass": passed, "verdict": "retained" if passed else "rejected"} for code, passed in decisions.items()}


def main():
    registered_hashes = {
        "cell_eocv2.zip": "b4f42914c8eaf176fd47e33e6f112d7c",
        "cell_eisv2.zip": "6eb09ae51c8a9e9b4b02b33e739787ab",
        "cell_plsv2.zip": "5c660fc53ac4ae4de5850143f629242a",
    }
    integrity = {}
    for name, expected in registered_hashes.items():
        observed = md5(CACHE / name)
        integrity[name] = {"registeredMd5": expected, "observedMd5": observed, "matches": observed == expected}
    if not all(item["matches"] for item in integrity.values()):
        raise RuntimeError("archive integrity gate failed")

    cells = [build_cell(parameter, replicate, cfg) for _, parameter, replicate, cfg in cfg_rows()]
    missing = [cell for cell in cells if not cell["completeD"]]
    development = [cell for cell in cells if cell["split"] == "development" and cell["completeD"]]
    target = [cell for cell in cells if cell["split"] == "target" and cell["completeD"]]
    feature_table = {
        "tableId": "RC54-KIT-EARLY-RESPONSE-FEATURE-TABLE-0.1",
        "cycleId": "RC-2026-54",
        "sourceIntegrity": integrity,
        "featureNamesByArm": ARM_FEATURES,
        "cohortRule": "All arms use the same D-complete non-pilot development and target rows; incomplete rows remain listed with exact missing fields.",
        "rows": cells,
    }
    FEATURE_OUT.write_text(json.dumps(feature_table, indent=2, allow_nan=False) + "\n", encoding="utf-8")

    if not development or not target:
        raise RuntimeError("no complete development or target cohort")
    fits, arm_metrics = {}, {}
    predictions = {}
    for code in "ABCD":
        fit = fit_arm(development, target, ARM_FEATURES[code])
        fits[code] = fit
        predictions[code] = fit.pop("predictedMedianDays")
        arm_metrics[code] = metrics(target, predictions[code], fit)

    target_predictions = []
    for index, row in enumerate(target):
        target_predictions.append({
            "id": row["id"],
            "conditionId": row["conditionId"],
            "replicate": row["replicate"],
            "ageFamily": row["ageFamily"],
            "observedTimeDays": row["endpoint"]["timeDays"],
            "event": row["endpoint"]["event"],
            "predictedMedianDays": {code: predictions[code][index] for code in "ABCD"},
        })

    comparisons = {
        "BvsA": improvement(arm_metrics["A"]["medianAbsoluteErrorDays"], arm_metrics["B"]["medianAbsoluteErrorDays"]),
        "CvsB": improvement(arm_metrics["B"]["medianAbsoluteErrorDays"], arm_metrics["C"]["medianAbsoluteErrorDays"]),
        "DvsC": improvement(arm_metrics["C"]["medianAbsoluteErrorDays"], arm_metrics["D"]["medianAbsoluteErrorDays"]),
    }
    complete_target = len(target) == 57
    output = {
        "resultId": "RC54-KIT-EARLY-RESPONSE-PYTHON-0.1",
        "cycleId": "RC-2026-54",
        "runOn": "2026-08-29",
        "implementation": {"runtime": "Python", "optimizer": "scipy.optimize.minimize BFGS", "alpha": ALPHA, "penalty": "0.5*alpha*sum(beta^2)"},
        "sourceIntegrity": integrity,
        "cohort": {
            "configuredCells": len(cells),
            "pilotCells": sum(cell["split"] == "pilot" for cell in cells),
            "completeDevelopmentCells": len(development),
            "completeTargetCells": len(target),
            "targetFeatureComplete": complete_target,
            "targetEvents": sum(cell["endpoint"]["event"] for cell in target),
            "targetCensored": sum(not cell["endpoint"]["event"] for cell in target),
            "incompleteCells": [{"id": cell["id"], "split": cell["split"], "missing": cell["missing"]} for cell in missing],
        },
        "fits": fits,
        "metrics": arm_metrics,
        "comparisons": comparisons,
        "bootstrap": cluster_bootstrap(target, predictions["C"], predictions["D"]),
        "hypotheses": verdicts(arm_metrics, complete_target),
        "targetPredictions": target_predictions,
        "claimBoundary": "This is a same-model, same-purchase-batch, held-40-degree 80%-capacity EOL test. It is not chemistry, pack, field, failure-safety, or warranty validation.",
    }
    RESULT_OUT.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(
        f"RC54 Python: dev={len(development)}, target={len(target)}, events={output['cohort']['targetEvents']}; "
        + ", ".join(f"{code} MdAE={arm_metrics[code]['medianAbsoluteErrorDays']:.3f}d C={arm_metrics[code]['harrellConcordance']['value']:.4f}" for code in "ABCD")
    )
    print("Verdicts:", ", ".join(f"{code}={item['verdict']}" for code, item in output["hypotheses"].items()))


if __name__ == "__main__":
    main()
