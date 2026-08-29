#!/usr/bin/env python3
"""Post-verdict diagnostics for RC55; these results cannot alter the sealed verdict."""

from __future__ import annotations

import json
import pathlib
import statistics

from scipy.stats import pearsonr, spearmanr

import run_rc55_rwth_frailty_response as rc55

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"
INPUT = REPRO / "rc55-rwth-frailty-response-feature-table.json"
OUTPUT = REPRO / "rc55-rwth-frailty-response-boundary-diagnostic.json"


def association(rows):
    response = [row["features"]["early_log_capacity_response_per_cycle"] for row in rows]
    lifetime = [row["endpoint"]["timeCycles"] for row in rows]
    early_loss = [
        100 * (1 - row["endpoint"]["landmarkCapacityAh"] / row["endpoint"]["bolCapacityAh"])
        for row in rows
    ]
    spearman = spearmanr(response, lifetime)
    pearson = pearsonr(response, lifetime)
    return {
        "cells": len(rows),
        "earlyCapacityLossPercent": {
            "median": statistics.median(early_loss),
            "minimum": min(early_loss),
            "maximum": max(early_loss),
        },
        "remainingLifeCycles": {
            "median": statistics.median(lifetime),
            "minimum": min(lifetime),
            "maximum": max(lifetime),
            "distinctIntervalResolvedTimes": len(set(lifetime)),
        },
        "responseLifetimeAssociation": {
            "spearmanRho": float(spearman.statistic),
            "spearmanPValueDescriptive": float(spearman.pvalue),
            "pearsonR": float(pearson.statistic),
            "pearsonPValueDescriptive": float(pearson.pvalue),
        },
    }


def modulo_sensitivity(rows, residue):
    eligible = [row for row in rows if row["id"] not in rc55.PILOTS and row["completeB"]]
    target = [row for row in eligible if row["id"] % 3 == residue]
    development = [row for row in eligible if row["id"] % 3 != residue]
    fit_a = rc55.fit_arm(development, target, [])
    fit_b = rc55.fit_arm(development, target, rc55.ARM_FEATURES["B"])
    metrics_a = rc55.metrics(target, fit_a["predictedMedianCycles"], fit_a)
    metrics_b = rc55.metrics(target, fit_b["predictedMedianCycles"], fit_b)
    improvement = (
        metrics_a["medianAbsoluteErrorCycles"] - metrics_b["medianAbsoluteErrorCycles"]
    ) / metrics_a["medianAbsoluteErrorCycles"]
    return {
        "residue": residue,
        "developmentCells": len(development),
        "targetCells": len(target),
        "capacityCoefficientStandardized": fit_b["coefficients"][0],
        "baselineMdAECycles": metrics_a["medianAbsoluteErrorCycles"],
        "capacityMdAECycles": metrics_b["medianAbsoluteErrorCycles"],
        "relativeMdAEImprovement": improvement,
        "capacityConcordance": metrics_b["harrellConcordance"],
        "capacityMaximumCalibrationError": metrics_b["maximumCalibrationError"],
    }


def main():
    table = json.loads(INPUT.read_text(encoding="utf-8"))
    rows = table["rows"]
    development = [row for row in rows if row["split"] == "development" and row["completeB"]]
    target = [row for row in rows if row["split"] == "target" and row["completeB"]]
    output = {
        "diagnosticId": "RC55-RWTH-FRAILTY-RESPONSE-BOUNDARY-DIAGNOSTIC-0.1",
        "cycleId": "RC-2026-55",
        "runOn": "2026-08-29",
        "status": "post-verdict-diagnostic-not-eligible-to-change-preregistered-verdict",
        "registeredSplit": {
            "development": association(development),
            "target": association(target),
        },
        "moduloSplitSensitivity": [modulo_sensitivity(rows, residue) for residue in (0, 1, 2)],
        "interpretationBoundary": [
            "The development association is weak and does not reproduce in the untouched target.",
            "Only four distinct interval-resolved target EOL times remain after the first-RPT landmark, so tied pairs limit rank resolution.",
            "Modulo-split results diagnose split sensitivity; they are not cross-validation estimates and cannot rescue H1.",
            "The next experiment must improve observability or endpoint resolution and then use a new untouched source."
        ],
    }
    OUTPUT.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(
        "RC55 diagnostic: "
        f"dev rho={output['registeredSplit']['development']['responseLifetimeAssociation']['spearmanRho']:.3f}, "
        f"target rho={output['registeredSplit']['target']['responseLifetimeAssociation']['spearmanRho']:.3f}; "
        + ", ".join(
            f"mod{item['residue']} C={item['capacityConcordance']['value']:.3f}"
            for item in output["moduloSplitSensitivity"]
        )
    )


if __name__ == "__main__":
    main()
