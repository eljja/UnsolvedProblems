#!/usr/bin/env python3
"""Post-outcome RC52 diagnostics; these variants are exploratory, not preregistered."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
TABLE = json.loads((ROOT / "research/reproducibility/rc52-battery-feature-table.json").read_text(encoding="utf-8"))
ROWS = TABLE["rows"]
SOURCES = ["CALB", "HNEI", "MICH_EXP", "UL_PUR"]


def median(values: list[float]) -> float:
    return float(np.median(np.asarray(values, dtype=float)))


def summaries(rows: list[dict], prediction: np.ndarray) -> dict:
    truth = np.asarray([row["life"] for row in rows], dtype=float)
    ape = np.abs(np.exp(prediction) - truth) / truth
    return {
        "n": len(rows),
        "mdape": float(np.median(ape)),
        "rmseLogLife": float(np.sqrt(np.mean((prediction - np.log(truth)) ** 2))),
        "catastrophicFraction": float(np.mean(ape > 0.5)),
        "maximumPredictedLife": float(np.max(np.exp(prediction))),
    }


def standardize(train_x: np.ndarray, test_x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    center = np.mean(train_x, axis=0)
    scale = np.std(train_x, axis=0)
    scale[scale == 0] = 1
    return (train_x - center) / scale, (test_x - center) / scale


def ridge(train: list[dict], target: list[dict], columns: list[int]) -> np.ndarray:
    train_x = np.asarray([[row["features"][index] for index in columns] for row in train])
    target_x = np.asarray([[row["features"][index] for index in columns] for row in target])
    train_z, target_z = standardize(train_x, target_x)
    design = np.column_stack([np.ones(len(train)), train_z])
    penalty = np.eye(design.shape[1])
    penalty[0, 0] = 0
    beta = np.linalg.solve(design.T @ design + penalty, design.T @ np.asarray([row["logLife"] for row in train]))
    return np.column_stack([np.ones(len(target)), target_z]) @ beta


def knn(train: list[dict], target: list[dict], k: int = 3) -> np.ndarray:
    train_x = np.asarray([row["features"] for row in train])
    target_x = np.asarray([row["features"] for row in target])
    train_z, target_z = standardize(train_x, target_x)
    distances = np.linalg.norm(target_z[:, None, :] - train_z[None, :, :], axis=2)
    life = np.asarray([row["logLife"] for row in train])
    return np.asarray([np.mean(life[np.argsort(row)[:k]]) for row in distances])


folds = []
pooled = {name: [] for name in ["training_log_median", "unbounded_ridge", "bounded_ridge", "bounded_ridge_without_cycle1", "three_nearest_neighbours"]}
pooled_rows = []
all_columns = list(range(len(TABLE["featureNames"])))
without_cycle1 = [index for index, name in enumerate(TABLE["featureNames"]) if not name.endswith("cycle_1")]

for source in SOURCES:
    target = [row for row in ROWS if row["source"] == source]
    train = [row for row in ROWS if row["source"] != source]
    lower = min(row["logLife"] for row in train)
    upper = max(row["logLife"] for row in train)
    unbounded = ridge(train, target, all_columns)
    variants = {
        "training_log_median": np.full(len(target), median([row["logLife"] for row in train])),
        "unbounded_ridge": unbounded,
        "bounded_ridge": np.clip(unbounded, lower, upper),
        "bounded_ridge_without_cycle1": np.clip(ridge(train, target, without_cycle1), lower, upper),
        "three_nearest_neighbours": knn(train, target),
    }
    folds.append({"source": source, "trainingLogLifeRange": [lower, upper], "methods": {name: summaries(target, prediction) for name, prediction in variants.items()}})
    pooled_rows.extend(target)
    for name, prediction in variants.items():
        pooled[name].extend(prediction.tolist())

result = {
    "diagnostic": "RC52 post-outcome bounded-extrapolation audit",
    "generatedOn": "2026-08-26",
    "status": "exploratory-after-registered-outcomes",
    "purpose": "Determine whether catastrophic errors are primarily unconstrained numerical extrapolation and identify a safer baseline; no registered hypothesis is revised.",
    "variants": {
        "training_log_median": "No early-life features; predicts the geometric median training lifetime.",
        "unbounded_ridge": "Registered ridge model, repeated as a reference.",
        "bounded_ridge": "Registered ridge prediction clipped to the minimum and maximum training-source log lifetime.",
        "bounded_ridge_without_cycle1": "Bounded ridge after removing cycle-1 charge and discharge capacities, chosen because first-cycle formation artifacts can differ by source.",
        "three_nearest_neighbours": "Mean log lifetime of the three closest standardized training cells; predictions remain within training label support."
    },
    "folds": folds,
    "pooled": {name: summaries(pooled_rows, np.asarray(prediction)) for name, prediction in pooled.items()},
    "interpretationRule": "A bounded method may define a safer fallback only if it removes explosive predictions without being described as validated transfer; this same data selected the diagnostic."
}
(ROOT / "research/reproducibility/rc52-battery-boundary-diagnostic.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(result["pooled"], indent=2))
