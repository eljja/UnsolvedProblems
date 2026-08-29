#!/usr/bin/env python3
"""Run the preregistered RC55 same-condition battery frailty test."""

from __future__ import annotations

import json
import math
import pathlib
import random
import statistics
import subprocess
from collections import defaultdict

import numpy as np
from scipy.io import loadmat
from scipy.optimize import minimize

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".cache" / "rc55-rwth"
P001 = SOURCE / "Processed Experimental Data" / "P001"
REPRO = ROOT / "research" / "reproducibility"
FEATURE_OUT = REPRO / "rc55-rwth-frailty-response-feature-table.json"
RESULT_OUT = REPRO / "rc55-rwth-frailty-response-python.json"
SEALED_COMMIT = "488eb68c23898f46308f58b9299088c287b9380d"
SEALED_TREE = "0b525ffafd634535b5af81d629fc4c09b1b8ec5e"
ALPHA = 1.0
BOOTSTRAP_SEED = 55029
BOOTSTRAP_REPLICATES = 2000
PILOTS = {1, 2}
TARGETS = {3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48}
ARM_FEATURES = {"A": [], "B": ["early_log_capacity_response_per_cycle"]}


def finite(value):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def source_git_value(spec: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(SOURCE), "rev-parse", spec],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def scalar_from_mat(data: dict, key: str):
    if key not in data:
        return None
    value = data[key]
    array = np.asarray(value).reshape(-1)
    if array.size != 1:
        return None
    return finite(array[0])


def capacity_rounds(cell_path: pathlib.Path):
    cumulative_cycles = 0.0
    grouped = defaultdict(list)
    provenance = defaultdict(list)
    for test_path in sorted(path for path in cell_path.iterdir() if path.is_dir() and "EIS" not in path.name):
        lean_path = test_path / "lean_data.mat"
        if not lean_path.exists():
            continue
        data = loadmat(lean_path, simplify_cells=True)
        subcycles = scalar_from_mat(data, "subcycles")
        if subcycles is not None:
            if subcycles < 0:
                raise RuntimeError(f"{cell_path.name}/{test_path.name}: negative subcycles")
            cumulative_cycles += subcycles
        capacity = scalar_from_mat(data, "CapDCH1")
        if capacity is not None:
            grouped[cumulative_cycles].append(capacity)
            provenance[cumulative_cycles].append(test_path.name)
    rounds = []
    for cycle in sorted(grouped):
        rounds.append(
            {
                "cycle": cycle,
                "capacityAh": statistics.median(grouped[cycle]),
                "measurementCount": len(grouped[cycle]),
                "sourceTests": provenance[cycle],
            }
        )
    return rounds


def build_cell(identifier: int, source_id: str):
    rounds = capacity_rounds(P001 / source_id)
    missing = []
    bol = next((row for row in rounds if row["cycle"] == 0), None)
    first_rpt = next((row for row in rounds if row["cycle"] > 0), None)
    if bol is None:
        missing.append("bol_capacity")
    if first_rpt is None:
        missing.append("first_post_aging_rpt_capacity")
    endpoint = None
    response = None
    if bol and first_rpt and bol["capacityAh"] > 0 and first_rpt["capacityAh"] > 0 and first_rpt["cycle"] > 0:
        response = math.log(first_rpt["capacityAh"] / bol["capacityAh"]) / first_rpt["cycle"]
        threshold = 0.8 * bol["capacityAh"]
        later = [row for row in rounds if row["cycle"] > first_rpt["cycle"]]
        crossing = next((row for row in later if row["capacityAh"] <= threshold), None)
        terminal = crossing or (later[-1] if later else None)
        if terminal is None:
            missing.append("post_landmark_endpoint_or_censor")
        else:
            endpoint = {
                "bolCycle": bol["cycle"],
                "bolCapacityAh": bol["capacityAh"],
                "landmarkCycle": first_rpt["cycle"],
                "landmarkCapacityAh": first_rpt["capacityAh"],
                "thresholdAh": threshold,
                "terminalCycle": terminal["cycle"],
                "terminalCapacityAh": terminal["capacityAh"],
                "timeCycles": terminal["cycle"] - first_rpt["cycle"],
                "event": crossing is not None,
                "capacityRoundCount": len(rounds),
            }
            if endpoint["timeCycles"] <= 0:
                missing.append("nonpositive_endpoint_time")
                endpoint = None
    else:
        missing.append("invalid_capacity_response_inputs")
    split = "pilot" if identifier in PILOTS else ("target" if identifier in TARGETS else "development")
    return {
        "id": identifier,
        "sourceId": source_id,
        "split": split,
        "features": {"early_log_capacity_response_per_cycle": response},
        "endpoint": endpoint,
        "capacityRounds": rounds,
        "completeA": endpoint is not None,
        "completeB": endpoint is not None and response is not None and math.isfinite(response),
        "missing": sorted(set(missing)),
    }


def objective_and_gradient(theta, x, times, events):
    feature_count = x.shape[1]
    intercept = theta[0]
    beta = theta[1 : 1 + feature_count]
    log_shape = theta[-1]
    shape = math.exp(log_shape)
    eta = intercept + x @ beta
    log_time = np.log(times)
    u = log_time - eta
    exponent = np.exp(np.clip(shape * u, -700, 700))
    event = events.astype(float)
    value = np.sum(-event * (log_shape + (shape - 1) * log_time - shape * eta) + exponent)
    value += 0.5 * ALPHA * float(beta @ beta)
    grad_eta = shape * (event - exponent)
    gradient = np.empty_like(theta)
    gradient[0] = np.sum(grad_eta)
    if feature_count:
        gradient[1 : 1 + feature_count] = x.T @ grad_eta + ALPHA * beta
    gradient[-1] = np.sum(-event * (1 + shape * u) + exponent * shape * u)
    return float(value), gradient


def standardize(development, target, feature_names):
    if not feature_names:
        return np.zeros((len(development), 0)), np.zeros((len(target), 0)), [], []
    raw_development = np.asarray(
        [[row["features"][name] for name in feature_names] for row in development], dtype=float
    )
    raw_target = np.asarray([[row["features"][name] for name in feature_names] for row in target], dtype=float)
    means = raw_development.mean(axis=0)
    scales = raw_development.std(axis=0)
    scales[scales == 0] = 1.0
    return (raw_development - means) / scales, (raw_target - means) / scales, means.tolist(), scales.tolist()


def fit_arm(development, target, feature_names):
    development_x, target_x, means, scales = standardize(development, target, feature_names)
    times = np.asarray([row["endpoint"]["timeCycles"] for row in development], dtype=float)
    events = np.asarray([row["endpoint"]["event"] for row in development], dtype=bool)
    theta0 = np.zeros(len(feature_names) + 2)
    theta0[0] = math.log(statistics.median(times.tolist()))
    theta0[-1] = math.log(2.0)
    result = minimize(
        lambda theta: objective_and_gradient(theta, development_x, times, events),
        theta0,
        method="BFGS",
        jac=True,
        options={"gtol": 1e-10, "maxiter": 5000},
    )
    value, gradient = objective_and_gradient(result.x, development_x, times, events)
    intercept = float(result.x[0])
    beta = result.x[1:-1]
    log_shape = float(result.x[-1])
    shape = math.exp(log_shape)
    predicted_eta = intercept + target_x @ beta
    predictions = np.exp(predicted_eta) * math.log(2) ** (1 / shape)
    return {
        "featureNames": feature_names,
        "developmentMean": means,
        "developmentScale": scales,
        "intercept": intercept,
        "coefficients": beta.tolist(),
        "logShape": log_shape,
        "shape": shape,
        "objective": value,
        "optimizerReportedSuccess": bool(result.success),
        "optimizerMessage": str(result.message),
        "iterations": int(result.nit),
        "gradientMaxAbs": float(np.max(np.abs(gradient))),
        "predictedEta": predicted_eta.tolist(),
        "predictedMedianCycles": predictions.tolist(),
    }


def concordance(rows, predictions):
    comparable = 0
    score = 0.0
    for left in range(len(rows)):
        for right in range(left + 1, len(rows)):
            a = rows[left]["endpoint"]
            b = rows[right]["endpoint"]
            if a["timeCycles"] == b["timeCycles"]:
                continue
            if a["timeCycles"] < b["timeCycles"] and a["event"]:
                early, late = left, right
            elif b["timeCycles"] < a["timeCycles"] and b["event"]:
                early, late = right, left
            else:
                continue
            comparable += 1
            if predictions[early] < predictions[late]:
                score += 1
            elif predictions[early] == predictions[late]:
                score += 0.5
    return {"value": score / comparable if comparable else None, "comparablePairs": comparable}


def km_survival(rows, horizon):
    event_times = sorted(
        {row["endpoint"]["timeCycles"] for row in rows if row["endpoint"]["event"] and row["endpoint"]["timeCycles"] <= horizon}
    )
    survival = 1.0
    for event_time in event_times:
        risk = sum(row["endpoint"]["timeCycles"] >= event_time for row in rows)
        deaths = sum(
            row["endpoint"]["event"] and row["endpoint"]["timeCycles"] == event_time for row in rows
        )
        if risk:
            survival *= 1 - deaths / risk
    return survival


def metrics(rows, predictions, fit):
    errors = [
        abs(predictions[index] - row["endpoint"]["timeCycles"])
        for index, row in enumerate(rows)
        if row["endpoint"]["event"]
    ]
    calibration = {}
    for horizon in (900, 1100):
        predicted_survival = [
            math.exp(-math.exp(fit["shape"] * (math.log(horizon) - eta))) for eta in fit["predictedEta"]
        ]
        predicted_mean = statistics.mean(predicted_survival)
        observed = km_survival(rows, horizon)
        calibration[str(horizon)] = {
            "predictedMeanSurvival": predicted_mean,
            "kaplanMeierSurvival": observed,
            "absoluteError": abs(predicted_mean - observed),
            "atRisk": sum(row["endpoint"]["timeCycles"] >= horizon for row in rows),
        }
    return {
        "targetCount": len(rows),
        "eventCount": len(errors),
        "censoredCount": len(rows) - len(errors),
        "medianAbsoluteErrorCycles": statistics.median(errors) if errors else None,
        "meanAbsoluteErrorCycles": statistics.mean(errors) if errors else None,
        "maximumAbsoluteErrorCycles": max(errors) if errors else None,
        "harrellConcordance": concordance(rows, predictions),
        "calibration": calibration,
        "maximumCalibrationError": max(item["absoluteError"] for item in calibration.values()),
    }


def paired_improvement(rows, baseline, candidate):
    indices = [index for index, row in enumerate(rows) if row["endpoint"]["event"]]
    baseline_errors = [abs(baseline[index] - rows[index]["endpoint"]["timeCycles"]) for index in indices]
    candidate_errors = [abs(candidate[index] - rows[index]["endpoint"]["timeCycles"]) for index in indices]
    baseline_median = statistics.median(baseline_errors)
    candidate_median = statistics.median(candidate_errors)
    point = (baseline_median - candidate_median) / baseline_median if baseline_median else None
    rng = random.Random(BOOTSTRAP_SEED)
    samples = []
    if indices and baseline_median:
        for _ in range(BOOTSTRAP_REPLICATES):
            selected = [rng.randrange(len(indices)) for __ in indices]
            base = statistics.median(baseline_errors[index] for index in selected)
            cand = statistics.median(candidate_errors[index] for index in selected)
            if base:
                samples.append((base - cand) / base)
    samples.sort()
    lower = samples[math.floor(0.025 * (len(samples) - 1))] if samples else None
    upper = samples[math.ceil(0.975 * (len(samples) - 1))] if samples else None
    return {
        "relativeMdAEImprovement": point,
        "bootstrapSeed": BOOTSTRAP_SEED,
        "bootstrapReplicates": BOOTSTRAP_REPLICATES,
        "percentile95Interval": [lower, upper],
    }


def main():
    if source_git_value("HEAD") != SEALED_COMMIT:
        raise RuntimeError("source commit differs from the sealed commit")
    if source_git_value("HEAD:Processed Experimental Data/P001") != SEALED_TREE:
        raise RuntimeError("processed P001 tree differs from the sealed tree")
    metadata = loadmat(P001 / "metadata.mat", simplify_cells=True)["metadata"]
    source_ids = [str(value) for value in np.asarray(metadata["cell_names"]).reshape(-1)]
    if source_ids != [f"epSanyo{number:03d}" for number in range(2, 50)]:
        raise RuntimeError("official cell-name mapping is not the sealed epSanyo002..049 sequence")
    rows = [build_cell(identifier, source_id) for identifier, source_id in enumerate(source_ids, start=1)]
    feature_table = {
        "tableId": "RC55-RWTH-FRAILTY-RESPONSE-FEATURE-TABLE-0.1",
        "cycleId": "RC-2026-55",
        "sourceCommit": SEALED_COMMIT,
        "sourceTree": SEALED_TREE,
        "featureNamesByArm": ARM_FEATURES,
        "pulseArm": {"available": False, "reason": "pilot exposes only 2-second and 10-second resistance; no 10 ms value"},
        "rows": rows,
    }
    FEATURE_OUT.write_text(json.dumps(feature_table, indent=2) + "\n", encoding="utf-8")

    fits = {}
    arm_metrics = {}
    predictions = {}
    denominators = {}
    for code, names in ARM_FEATURES.items():
        development = [row for row in rows if row["split"] == "development" and row[f"complete{code}"]]
        target = [row for row in rows if row["split"] == "target" and row[f"complete{code}"]]
        denominators[code] = {"development": len(development), "target": len(target)}
        fits[code] = fit_arm(development, target, names)
        predictions[code] = fits[code]["predictedMedianCycles"]
        arm_metrics[code] = metrics(target, predictions[code], fits[code])

    target_b = [row for row in rows if row["split"] == "target" and row["completeB"]]
    comparison = paired_improvement(target_b, predictions["A"], predictions["B"])
    b = arm_metrics["B"]
    h1_pass = bool(
        denominators["B"]["target"] >= math.ceil(0.9 * len(TARGETS))
        and b["eventCount"] >= 14
        and b["harrellConcordance"]["comparablePairs"] >= 30
        and b["harrellConcordance"]["value"] is not None
        and b["harrellConcordance"]["value"] >= 0.65
        and b["medianAbsoluteErrorCycles"] is not None
        and b["medianAbsoluteErrorCycles"] <= 160
        and comparison["relativeMdAEImprovement"] is not None
        and comparison["relativeMdAEImprovement"] >= 0.10
        and b["maximumCalibrationError"] <= 0.15
    )
    target_predictions = []
    for index, row in enumerate(target_b):
        target_predictions.append(
            {
                "id": row["id"],
                "sourceId": row["sourceId"],
                "event": row["endpoint"]["event"],
                "observedTimeCycles": row["endpoint"]["timeCycles"],
                "bolCapacityAh": row["endpoint"]["bolCapacityAh"],
                "landmarkCycle": row["endpoint"]["landmarkCycle"],
                "capacityResponsePerCycle": row["features"]["early_log_capacity_response_per_cycle"],
                "predictedMedianCycles": {"A": predictions["A"][index], "B": predictions["B"][index]},
            }
        )
    output = {
        "resultId": "RC55-RWTH-FRAILTY-RESPONSE-PYTHON-0.1",
        "cycleId": "RC-2026-55",
        "runOn": "2026-08-29",
        "implementation": {
            "runtime": "Python with SciPy",
            "optimizer": "BFGS with analytic likelihood gradient",
            "alpha": ALPHA,
            "penalty": "0.5*alpha*sum(beta^2)",
        },
        "source": {"commit": SEALED_COMMIT, "processedTree": SEALED_TREE},
        "cohort": {
            "sourceCells": len(rows),
            "pilotCells": sum(row["split"] == "pilot" for row in rows),
            "developmentCandidates": sum(row["split"] == "development" for row in rows),
            "targetCandidates": sum(row["split"] == "target" for row in rows),
            "denominators": denominators,
            "targetEventsB": b["eventCount"],
            "targetCensoredB": b["censoredCount"],
        },
        "availability": {
            "armA": "available",
            "armB": "available",
            "armC": "unavailable-no-10ms-pulse-in-pilot",
        },
        "fits": {code: {key: value for key, value in fit.items() if key != "predictedMedianCycles"} for code, fit in fits.items()},
        "metrics": arm_metrics,
        "comparison": {"BvsA": comparison},
        "hypotheses": {
            "H0": {"retained": not h1_pass, "verdict": "retained" if not h1_pass else "rejected"},
            "H1": {"pass": h1_pass, "verdict": "retained" if h1_pass else "rejected"},
            "H2": {"pass": False, "verdict": "unavailable", "reason": "registered 10 ms pulse response is absent"},
        },
        "targetPredictions": target_predictions,
    }
    RESULT_OUT.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(
        f"RC55 Python: source={len(rows)}, devB={denominators['B']['development']}, "
        f"targetB={denominators['B']['target']}, events={b['eventCount']}, "
        f"A MdAE={arm_metrics['A']['medianAbsoluteErrorCycles']:.3f}, "
        f"B MdAE={b['medianAbsoluteErrorCycles']:.3f}, C={b['harrellConcordance']['value']:.4f}, "
        f"H1={'PASS' if h1_pass else 'REJECT'}"
    )


if __name__ == "__main__":
    main()
