#!/usr/bin/env python3
"""Exploratory, post-verdict diagnostics for RC53. These cannot rescue a gate."""

from __future__ import annotations

import json
import math
import pathlib
import statistics

from run_rc53_battery_mechanism_bridge import fit_ridge, metrics, predict, spearman

ROOT = pathlib.Path(__file__).resolve().parents[1]
TABLE = ROOT / "research" / "reproducibility" / "rc53-battery-mechanism-bridge-feature-table.json"
OUT = ROOT / "research" / "reproducibility" / "rc53-battery-mechanism-bridge-boundary-diagnostic.json"


def main() -> None:
    table = json.loads(TABLE.read_text(encoding="utf-8"))
    development = [row for row in table["rows"] if row["split"] == "development"]
    targets = [row for row in table["rows"] if row["split"] == "target"]
    stress_capacity = table["arms"]["B"]
    dma = [
        "bol_positive_electrode_capacity_ah", "bol_negative_electrode_capacity_ah",
        "bol_graphite_capacity_ah", "bol_silicon_capacity_ah", "bol_electrode_offset_ah",
    ]
    resistance = ["bol_r_0_1s_ohm", "bol_r_10s_ohm", "bol_r_10s_minus_0_1s_ohm"]
    exploratory_arms = {"D_capacity_plus_dma": stress_capacity + dma, "E_capacity_plus_resistance": stress_capacity + resistance}
    arm_results = {}
    for code, features in exploratory_arms.items():
        model = fit_ridge(development, features)
        predictions = [{"cellId": row["cell_id"], "experiment": row["experiment"], "observed": row["capacity_retention_rpt8"], "prediction": predict(model, row)} for row in targets]
        arm_results[code] = {
            "featureNames": features,
            "metrics": metrics(predictions),
            "byExperiment": {experiment: metrics([item for item in predictions if item["experiment"] == experiment]) for experiment in ["2,2", "4", "5"]},
        }

    full = fit_ridge(development, table["arms"]["C"])
    predictions = [{"cellId": row["cell_id"], "experiment": row["experiment"], "observed": row["capacity_retention_rpt8"], "prediction": predict(full, row), "row": row} for row in targets]
    centered_prediction = []
    centered_observed = []
    group_bias = {}
    for experiment in ["2,2", "4", "5"]:
        group = [item for item in predictions if item["experiment"] == experiment]
        mean_prediction = statistics.fmean(item["prediction"] for item in group)
        mean_observed = statistics.fmean(item["observed"] for item in group)
        group_bias[experiment] = {
            "count": len(group),
            "meanObserved": mean_observed,
            "meanPrediction": mean_prediction,
            "meanBiasPercentagePoints": (mean_prediction - mean_observed) * 100.0,
            "spearman": spearman([item["prediction"] for item in group], [item["observed"] for item in group]),
        }
        centered_prediction.extend(item["prediction"] - mean_prediction for item in group)
        centered_observed.extend(item["observed"] - mean_observed for item in group)

    support = []
    out_of_range = {name: 0 for name in full["features"]}
    target_z = {name: [] for name in full["features"]}
    development_ranges = {name: (min(row[name] for row in development), max(row[name] for row in development)) for name in full["features"]}
    for item in predictions:
        standardized = [(item["row"][name] - mean) / scale for name, mean, scale in zip(full["features"], full["means"], full["scales"])]
        distance = min(math.sqrt(sum((value - ((row[name] - mean) / scale)) ** 2 for value, name, mean, scale in zip(standardized, full["features"], full["means"], full["scales"]))) for row in development)
        error = abs(item["prediction"] - item["observed"]) * 100.0
        support.append({"cellId": item["cellId"], "experiment": item["experiment"], "nearestDevelopmentDistance": distance, "absoluteErrorPercentagePoints": error})
        for name, value, z in zip(full["features"], [item["row"][name] for name in full["features"]], standardized):
            low, high = development_ranges[name]
            if value < low or value > high:
                out_of_range[name] += 1
            target_z[name].append(abs(z))

    output = {
        "diagnosticId": "RC53-BATTERY-MECHANISM-BRIDGE-BOUNDARY-DIAGNOSTIC-0.1",
        "cycleId": "RC-2026-53",
        "status": "exploratory-after-registered-outcomes; cannot rescue H0-H3 or alter the RC53 verdict",
        "registeredFullPassport": {
            "pooledSpearman": spearman([item["prediction"] for item in predictions], [item["observed"] for item in predictions]),
            "withinExperimentCenteredSpearman": spearman(centered_prediction, centered_observed),
            "byExperiment": group_bias,
        },
        "supportDiagnostic": {
            "distanceErrorSpearman": spearman([item["nearestDevelopmentDistance"] for item in support], [item["absoluteErrorPercentagePoints"] for item in support]),
            "cells": support,
            "outOfDevelopmentRangeCounts": out_of_range,
            "maximumAbsoluteStandardizedTargetValue": {name: max(values) for name, values in target_z.items()},
        },
        "postHocBlockAblations": arm_results,
        "interpretation": [
            "The full passport's pooled rank correlation must be compared with within-experiment ranks; a pooled value can be driven by regime means rather than cell-level susceptibility.",
            "BoL electrode and resistance levels are nested within experiment, rig, and acquisition context. Without an early change measurement or replicated regime coverage, a static passport can encode batch/domain coordinates rather than a transferable damage state.",
            "The next decisive test should use a preregistered early diagnostic derivative under a standardized perturbation and an independent common-EOL target, not tune another static BoL regression on these opened outcomes."
        ],
    }
    OUT.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"registeredFullPassport": output["registeredFullPassport"], "supportDistanceErrorSpearman": output["supportDiagnostic"]["distanceErrorSpearman"], "postHocBlockMetrics": {key: value["metrics"] for key, value in arm_results.items()}}, indent=2))


if __name__ == "__main__":
    main()
