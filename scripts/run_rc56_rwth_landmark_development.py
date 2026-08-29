#!/usr/bin/env python3
"""Outcome-open RC56 capacity landmark method development on the RC55 RWTH table."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib

import numpy as np
from scipy.optimize import minimize

ROOT = pathlib.Path(__file__).resolve().parents[1]
INPUT = ROOT / "research" / "reproducibility" / "rc55-rwth-frailty-response-feature-table.json"
CONTRACT = ROOT / "research" / "reproducibility" / "rc56-rwth-landmark-development-contract.json"
OUTPUT = ROOT / "research" / "reproducibility" / "rc56-rwth-landmark-development-python.json"

CANDIDATES = [
    ("R1_capacity_level", 1, "level"),
    ("R1_log_slope", 1, "slope"),
    ("R2_capacity_level", 2, "level"),
    ("R2_recent_log_slope", 2, "slope"),
    ("R2_log_slope_curvature", 2, "curvature"),
    ("R3_capacity_level", 3, "level"),
    ("R3_recent_log_slope", 3, "slope"),
    ("R3_log_slope_curvature", 3, "curvature"),
]


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def candidate_value(row: dict, round_index: int, kind: str):
    rounds = row["capacityRounds"]
    if len(rounds) <= round_index:
        return None
    used = rounds[: round_index + 1]
    cycles = [float(item["cycle"]) for item in used]
    capacities = [float(item["capacityAh"]) for item in used]
    if not all(math.isfinite(value) and value > 0 for value in capacities):
        return None
    if not all(math.isfinite(value) for value in cycles):
        return None
    if not all(cycles[index] > cycles[index - 1] for index in range(1, len(cycles))):
        return None
    if cycles[round_index] >= float(row["endpoint"]["terminalCycle"]):
        return None
    if kind == "level":
        value = math.log(capacities[round_index] / capacities[0])
    elif kind == "slope":
        value = math.log(capacities[round_index] / capacities[round_index - 1]) / (
            cycles[round_index] - cycles[round_index - 1]
        )
    else:
        recent = math.log(capacities[round_index] / capacities[round_index - 1]) / (
            cycles[round_index] - cycles[round_index - 1]
        )
        prior = math.log(capacities[round_index - 1] / capacities[round_index - 2]) / (
            cycles[round_index - 1] - cycles[round_index - 2]
        )
        value = recent - prior
    return {
        "value": value,
        "landmarkCycle": cycles[round_index],
        "time": float(row["endpoint"]["terminalCycle"]) - cycles[round_index],
        "event": bool(row["endpoint"]["event"]),
    }


def fit_weibull(values, times, events):
    x = np.asarray(values, dtype=float)
    t = np.asarray(times, dtype=float)
    e = np.asarray(events, dtype=float)

    def objective(theta):
        intercept, beta, log_shape = theta
        shape = math.exp(log_shape)
        log_lambda = intercept + beta * x
        scaled_log = shape * (np.log(t) - log_lambda)
        scaled = np.exp(np.clip(scaled_log, -700, 700))
        log_likelihood = e * (log_shape - log_lambda + (shape - 1) * (np.log(t) - log_lambda)) - scaled
        return -float(np.sum(log_likelihood)) + 0.5 * beta * beta

    initial = np.array([math.log(float(np.median(t))), 0.0, math.log(2.0)])
    result = minimize(objective, initial, method="BFGS", options={"gtol": 1e-10, "maxiter": 2000})
    if not result.success and not np.all(np.isfinite(result.x)):
        raise RuntimeError(f"Weibull fit failed: {result.message}")
    return {
        "intercept": float(result.x[0]),
        "beta": float(result.x[1]),
        "shape": math.exp(float(result.x[2])),
        "optimizerSuccess": bool(result.success),
        "optimizerMessage": str(result.message),
    }


def concordance(rows):
    comparable = 0
    concordant = 0.0
    for left_index, left in enumerate(rows):
        for right in rows[left_index + 1 :]:
            if left["time"] == right["time"]:
                continue
            earlier, later = (left, right) if left["time"] < right["time"] else (right, left)
            if not earlier["event"]:
                continue
            comparable += 1
            if earlier["prediction"] < later["prediction"]:
                concordant += 1
            elif earlier["prediction"] == later["prediction"]:
                concordant += 0.5
    return {"concordance": concordant / comparable if comparable else None, "comparablePairs": comparable}


def run_candidate(source_rows, name, round_index, kind):
    prepared = []
    for row in source_rows:
        derived = candidate_value(row, round_index, kind)
        if derived is not None:
            prepared.append(
                {
                    "id": int(row["id"]),
                    "batch": (int(row["id"]) - 1) // 4 + 1,
                    **derived,
                }
            )
    predictions = []
    folds = []
    beta_signs = []
    for batch in range(1, 13):
        train = [row for row in prepared if row["batch"] != batch]
        held = [row for row in prepared if row["batch"] == batch]
        if len(held) != 4:
            folds.append({"batch": batch, "status": "unavailable", "heldCount": len(held)})
            continue
        mean = float(np.mean([row["value"] for row in train]))
        scale = float(np.std([row["value"] for row in train]))
        if not math.isfinite(scale) or scale == 0:
            folds.append({"batch": batch, "status": "zero-training-scale", "heldCount": len(held)})
            continue
        standardized = [(row["value"] - mean) / scale for row in train]
        model = fit_weibull(standardized, [row["time"] for row in train], [row["event"] for row in train])
        beta_signs.append(1 if model["beta"] > 0 else -1 if model["beta"] < 0 else 0)
        fold_predictions = []
        for row in held:
            z = (row["value"] - mean) / scale
            median = math.exp(model["intercept"] + model["beta"] * z) * math.log(2) ** (1 / model["shape"])
            item = {**row, "z": z, "prediction": median}
            fold_predictions.append(item)
            predictions.append(item)
        fold_c = concordance(fold_predictions)
        folds.append(
            {
                "batch": batch,
                "status": "predicted",
                "heldCount": len(held),
                "trainingMean": mean,
                "trainingScale": scale,
                "beta": model["beta"],
                **fold_c,
            }
        )
    pooled_within = []
    comparable = 0
    concordant = 0.0
    for batch in range(1, 13):
        metric = concordance([row for row in predictions if row["batch"] == batch])
        if metric["comparablePairs"]:
            pooled_within.append(metric)
            comparable += metric["comparablePairs"]
            concordant += metric["concordance"] * metric["comparablePairs"]
    values = [row["value"] for row in prepared]
    full_mean = float(np.mean(values))
    full_scale = float(np.std(values))
    full_model = fit_weibull(
        [(value - full_mean) / full_scale for value in values],
        [row["time"] for row in prepared],
        [row["event"] for row in prepared],
    )
    full_sign = 1 if full_model["beta"] > 0 else -1 if full_model["beta"] < 0 else 0
    coverage = len(predictions)
    c_index = concordant / comparable if comparable else None
    passes = {
        "coverage": coverage >= 44 and len([fold for fold in folds if fold["status"] == "predicted"]) == 12,
        "pairs": comparable >= 60,
        "ranking": c_index is not None and c_index >= 0.65,
        "direction": bool(beta_signs) and len(beta_signs) == 12 and full_sign != 0 and all(sign == full_sign for sign in beta_signs),
    }
    return {
        "name": name,
        "round": round_index,
        "kind": kind,
        "availableRows": len(prepared),
        "predictionCoverage": coverage,
        "withinHeldBatchConcordance": c_index,
        "withinHeldBatchComparablePairs": comparable,
        "fullCohortBeta": full_model["beta"],
        "fullCohortBetaSign": full_sign,
        "foldBetaSigns": beta_signs,
        "gates": passes,
        "passesAllGates": all(passes.values()),
        "folds": folds,
        "predictions": sorted(predictions, key=lambda row: row["id"]),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    data = json.loads(INPUT.read_text(encoding="utf-8"))
    results = [run_candidate(data["rows"], *candidate) for candidate in CANDIDATES]
    selected = next((result["name"] for result in results if result["passesAllGates"]), None)
    output = {
        "analysisId": "RC56-RWTH-LANDMARK-DEVELOPMENT-PYTHON-0.1",
        "cycleId": "RC-2026-56",
        "completedOn": "2026-08-29",
        "status": "outcome-open-method-development-only",
        "inputSha256": sha256(INPUT),
        "contractSha256": sha256(CONTRACT),
        "candidateOrder": [candidate[0] for candidate in CANDIDATES],
        "selectionRule": "First candidate in registered order satisfying coverage, pair, ranking, and direction gates.",
        "selectedCandidate": selected,
        "auroraOutcomeAccessAuthorized": selected is not None,
        "results": results,
        "claimBoundary": "No RWTH result in this file is confirmatory because the outcome was opened in RC55.",
    }
    rendered = json.dumps(output, indent=2, ensure_ascii=False) + "\n"
    if args.write:
        OUTPUT.write_text(rendered, encoding="utf-8")
    print(f"RC56 RWTH development: selected={selected or 'none'}")
    for result in results:
        print(
            f"  {result['name']}: n={result['predictionCoverage']} pairs={result['withinHeldBatchComparablePairs']} "
            f"C={result['withinHeldBatchConcordance']:.6f} direction={result['gates']['direction']} "
            f"pass={result['passesAllGates']}"
        )


if __name__ == "__main__":
    main()
