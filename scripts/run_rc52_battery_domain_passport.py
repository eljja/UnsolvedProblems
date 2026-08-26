#!/usr/bin/env python3
"""Execute the preregistered RC52 BatteryLife domain-passport experiment."""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
import pickle
import random
from pathlib import Path
from typing import Iterable

import numpy as np


SOURCES = {
    "CALB": ("CALB/CALB", "CALB_labels.json"),
    "HNEI": ("HNEI/HNEI", "HNEI_labels.json"),
    "MICH_EXP": ("MICH_EXP/MICH_EXP", "MICH_EXP_labels.json"),
    "UL_PUR": ("UL_PUR/UL_PUR", "UL-PUR_labels.json"),
}

ARCHIVES = {
    "CALB.zip": "2b1006e96e0ca42765a732060f964687",
    "HNEI.zip": "27d009bbb908f04e90ecd9a145d81b62",
    "MICH_EXP.zip": "e267051a90f0fc02f8e6701b9f3ecc58",
    "UL_PUR.zip": "65551018b3d67d96eda724552a0360bd",
    "Life labels.zip": "cd0cc01a7211972be45e8e38d86cdeca",
    "READMEs.zip": "f1b28ff26d2cbb1e81455518be9b0e23",
}

FEATURE_NAMES = [
    "charge_capacity_norm_cycle_1",
    "charge_capacity_norm_cycle_5",
    "charge_capacity_norm_cycle_10",
    "charge_capacity_norm_cycle_20",
    "discharge_capacity_norm_cycle_1",
    "discharge_capacity_norm_cycle_5",
    "discharge_capacity_norm_cycle_10",
    "discharge_capacity_norm_cycle_20",
    "ols_discharge_capacity_norm_slope_cycles_2_20",
    "median_coulombic_efficiency_cycles_2_20",
    "ols_coulombic_efficiency_slope_cycles_2_20",
    "median_charge_c_rate_cycles_2_20",
    "median_discharge_c_rate_cycles_2_20",
    "log_median_cycle_duration_seconds_cycles_2_20",
    "discharge_voltage_median_cycle_20",
    "discharge_voltage_median_cycle_20_minus_cycle_2",
]


def finite_array(value: object) -> np.ndarray:
    array = np.asarray(value, dtype=float).reshape(-1)
    return array[np.isfinite(array)]


def maximum(cycle: dict, key: str) -> float:
    values = finite_array(cycle[key])
    if values.size == 0:
        raise ValueError(f"no finite {key}")
    return float(np.max(values))


def current_voltage(cycle: dict) -> tuple[np.ndarray, np.ndarray]:
    current = np.asarray(cycle["current_in_A"], dtype=float).reshape(-1)
    voltage = np.asarray(cycle["voltage_in_V"], dtype=float).reshape(-1)
    if current.size != voltage.size:
        raise ValueError("current and voltage arrays differ in length")
    mask = np.isfinite(current) & np.isfinite(voltage)
    return current[mask], voltage[mask]


def cycle_number(cycle: dict, position: int) -> float:
    try:
        value = float(cycle.get("cycle_number", position))
    except (TypeError, ValueError):
        value = float(position)
    return value if math.isfinite(value) else float(position)


def slope(values: Iterable[float], x_start: int = 2) -> float:
    y = np.asarray(list(values), dtype=float)
    x = np.arange(x_start, x_start + y.size, dtype=float)
    x_centered = x - np.mean(x)
    return float(np.dot(x_centered, y - np.mean(y)) / np.dot(x_centered, x_centered))


def extract_features(cell: dict) -> list[float]:
    nominal = float(cell["nominal_capacity_in_Ah"])
    if not math.isfinite(nominal) or nominal <= 0:
        raise ValueError("invalid nominal capacity")
    raw_cycles = list(cell.get("cycle_data") or [])
    ordered = sorted(enumerate(raw_cycles, 1), key=lambda item: (cycle_number(item[1], item[0]), item[0]))
    cycles = [item[1] for item in ordered[:20]]
    if len(cycles) < 20:
        raise ValueError("fewer than 20 cycles")

    charge = np.asarray([maximum(cycle, "charge_capacity_in_Ah") / nominal for cycle in cycles])
    discharge = np.asarray([maximum(cycle, "discharge_capacity_in_Ah") / nominal for cycle in cycles])
    if np.any(charge <= 0) or np.any(discharge <= 0):
        raise ValueError("nonpositive capacity summary")
    efficiency = discharge / charge

    positive_current = []
    negative_current = []
    durations = []
    discharge_voltage = []
    for cycle in cycles:
        current, voltage = current_voltage(cycle)
        positive_current.extend((current[current > 0] / nominal).tolist())
        negative_current.extend((-current[current < 0] / nominal).tolist())
        time_values = finite_array(cycle["time_in_s"])
        durations.append(float(np.max(time_values) - np.min(time_values)))
        negative_voltage = voltage[current < 0]
        if negative_voltage.size == 0:
            raise ValueError("cycle has no negative-current voltage samples")
        discharge_voltage.append(float(np.median(negative_voltage)))

    indices = [0, 4, 9, 19]
    features = [float(charge[index]) for index in indices]
    features.extend(float(discharge[index]) for index in indices)
    features.extend(
        [
            slope(discharge[1:20]),
            float(np.median(efficiency[1:20])),
            slope(efficiency[1:20]),
            float(np.median(positive_current)),
            float(np.median(negative_current)),
            float(math.log(np.median(durations[1:20]))),
            discharge_voltage[19],
            discharge_voltage[19] - discharge_voltage[1],
        ]
    )
    if len(features) != len(FEATURE_NAMES) or not np.all(np.isfinite(features)):
        raise ValueError("feature contract produced nonfinite or wrong-length vector")
    return features


def md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_rows(data_root: Path) -> tuple[list[dict], list[dict]]:
    rows = []
    exclusions = []
    labels_dir = data_root / "labels" / "Life labels"
    for source, (relative_dir, label_name) in SOURCES.items():
        labels = json.loads((labels_dir / label_name).read_text(encoding="utf-8"))
        data_dir = data_root / relative_dir
        for filename, raw_life in sorted(labels.items()):
            path = data_dir / filename
            try:
                life = float(raw_life)
            except (TypeError, ValueError):
                exclusions.append({"source": source, "cellId": filename, "reason": "non-numeric official life label"})
                continue
            if not math.isfinite(life) or life <= 20:
                exclusions.append({"source": source, "cellId": filename, "reason": "official life label does not exceed 20-cycle horizon", "life": life})
                continue
            if not path.exists():
                exclusions.append({"source": source, "cellId": filename, "reason": "labelled pickle missing"})
                continue
            try:
                with path.open("rb") as handle:
                    cell = pickle.load(handle)
                features = extract_features(cell)
            except Exception as error:  # preserve every registered exclusion
                exclusions.append({"source": source, "cellId": filename, "reason": f"feature extraction failed: {error}"})
                continue
            rows.append(
                {
                    "source": source,
                    "cellId": filename,
                    "life": life,
                    "logLife": math.log(life),
                    "features": features,
                }
            )
    return rows, exclusions


def standardize(train_x: np.ndarray, test_x: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    mean = np.mean(train_x, axis=0)
    scale = np.std(train_x, axis=0)
    scale[scale == 0] = 1.0
    return (train_x - mean) / scale, (test_x - mean) / scale, mean, scale


def ridge_predict(train: list[dict], test: list[dict]) -> tuple[np.ndarray, dict]:
    train_x = np.asarray([row["features"] for row in train], dtype=float)
    test_x = np.asarray([row["features"] for row in test], dtype=float)
    train_y = np.asarray([row["logLife"] for row in train], dtype=float)
    train_z, test_z, mean, scale = standardize(train_x, test_x)
    design = np.column_stack([np.ones(train_z.shape[0]), train_z])
    penalty = np.eye(design.shape[1])
    penalty[0, 0] = 0.0
    beta = np.linalg.solve(design.T @ design + penalty, design.T @ train_y)
    prediction = np.column_stack([np.ones(test_z.shape[0]), test_z]) @ beta
    return prediction, {"mean": mean, "scale": scale, "beta": beta, "trainZ": train_z, "testZ": test_z}


def metrics(rows: list[dict], log_prediction: np.ndarray) -> dict:
    truth = np.asarray([row["life"] for row in rows], dtype=float)
    truth_log = np.log(truth)
    prediction = np.exp(log_prediction)
    ape = np.abs(prediction - truth) / truth
    return {
        "n": len(rows),
        "mdape": float(np.median(ape)),
        "rmseLogLife": float(np.sqrt(np.mean((log_prediction - truth_log) ** 2))),
        "catastrophicFraction": float(np.mean(ape > 0.50)),
        "meanAbsolutePercentageError": float(np.mean(ape)),
    }


def percentile_linear(values: np.ndarray, probability: float) -> float:
    ordered = np.sort(np.asarray(values, dtype=float))
    if ordered.size == 1:
        return float(ordered[0])
    position = (ordered.size - 1) * probability
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    weight = position - lower
    return float(ordered[lower] * (1 - weight) + ordered[upper] * weight)


def average_ranks(values: np.ndarray) -> np.ndarray:
    order = np.argsort(values, kind="mergesort")
    ranks = np.empty(values.size, dtype=float)
    start = 0
    while start < order.size:
        end = start + 1
        while end < order.size and values[order[end]] == values[order[start]]:
            end += 1
        rank = (start + 1 + end) / 2.0
        ranks[order[start:end]] = rank
        start = end
    return ranks


def spearman(left: np.ndarray, right: np.ndarray) -> float:
    a = average_ranks(left)
    b = average_ranks(right)
    if np.std(a) == 0 or np.std(b) == 0:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


def stratified_splits(rows: list[dict], repeats: int = 200, seed: int = 520026) -> list[dict]:
    by_source = {source: [index for index, row in enumerate(rows) if row["source"] == source] for source in SOURCES}
    output = []
    for repeat in range(repeats):
        rng = random.Random(seed + repeat)
        test_indices = []
        for source in SOURCES:
            indices = list(by_source[source])
            rng.shuffle(indices)
            count = min(len(indices) - 1, max(1, int(math.floor(len(indices) * 0.2 + 0.5))))
            test_indices.extend(indices[:count])
        test_set = set(test_indices)
        train = [row for index, row in enumerate(rows) if index not in test_set]
        test = [row for index, row in enumerate(rows) if index in test_set]
        prediction, _ = ridge_predict(train, test)
        output.append({"repeat": repeat, "testCellIds": [row["cellId"] for row in test], **metrics(test, prediction)})
    return output


def training_cv_residuals(train: list[dict]) -> np.ndarray:
    residuals = []
    sources = sorted({row["source"] for row in train})
    for source in sources:
        inner_test = [row for row in train if row["source"] == source]
        inner_train = [row for row in train if row["source"] != source]
        prediction, _ = ridge_predict(inner_train, inner_test)
        residuals.extend(np.abs(prediction - np.asarray([row["logLife"] for row in inner_test])).tolist())
    return np.asarray(residuals, dtype=float)


def nearest_distances(reference_z: np.ndarray, query_z: np.ndarray, leave_self_out: bool = False) -> np.ndarray:
    distances = np.linalg.norm(query_z[:, None, :] - reference_z[None, :, :], axis=2)
    if leave_self_out:
        np.fill_diagonal(distances, np.inf)
    return np.min(distances, axis=1)


def choose_domain_passport(target_z: np.ndarray, target_rows: list[dict]) -> tuple[int, int, dict]:
    candidates = []
    for left, right in itertools.combinations(range(len(target_rows)), 2):
        distance = np.minimum(np.linalg.norm(target_z - target_z[left], axis=1), np.linalg.norm(target_z - target_z[right], axis=1))
        candidates.append((float(np.max(distance)), float(np.mean(distance)), target_rows[left]["cellId"], target_rows[right]["cellId"], left, right))
    selected = min(candidates)
    return selected[4], selected[5], {"maxCoverDistance": selected[0], "meanCoverDistance": selected[1]}


def pilot_metrics(target: list[dict], base_prediction: np.ndarray, target_z: np.ndarray) -> dict | None:
    if len(target) < 5:
        return None
    selected_left, selected_right, geometry = choose_domain_passport(target_z, target)

    def evaluate(pair: tuple[int, int]) -> dict:
        pilot = set(pair)
        remaining = [index for index in range(len(target)) if index not in pilot]
        residuals = [target[index]["logLife"] - base_prediction[index] for index in pair]
        offset = float(np.median(residuals))
        remaining_rows = [target[index] for index in remaining]
        before = metrics(remaining_rows, np.asarray([base_prediction[index] for index in remaining]))
        after = metrics(remaining_rows, np.asarray([base_prediction[index] + offset for index in remaining]))
        return {"pair": [target[index]["cellId"] for index in pair], "offsetLogLife": offset, "before": before, "after": after}

    all_pairs = [evaluate(pair) for pair in itertools.combinations(range(len(target)), 2)]
    selected = evaluate((selected_left, selected_right))
    median_pair_mdape = float(np.median([item["after"]["mdape"] for item in all_pairs]))
    improvement = 1.0 - selected["after"]["mdape"] / selected["before"]["mdape"] if selected["before"]["mdape"] else 0.0
    selected.update(
        {
            "geometry": geometry,
            "possiblePairCount": len(all_pairs),
            "medianAllPairMdape": median_pair_mdape,
            "relativeMdapeImprovement": improvement,
            "passesTwentyPercent": improvement >= 0.20,
            "noWorseThanMedianPair": selected["after"]["mdape"] <= median_pair_mdape,
        }
    )
    return selected


def leave_source_out(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    folds = []
    cell_predictions = []
    for source in SOURCES:
        target = [row for row in rows if row["source"] == source]
        train = [row for row in rows if row["source"] != source]
        prediction, model = ridge_predict(train, target)
        training_nn = nearest_distances(model["trainZ"], model["trainZ"], leave_self_out=True)
        support_threshold = percentile_linear(training_nn, 0.95)
        target_distance = nearest_distances(model["trainZ"], model["testZ"])
        accepted = target_distance <= support_threshold
        residuals = training_cv_residuals(train)
        rank = min(len(residuals), int(math.ceil((len(residuals) + 1) * 0.90)))
        interval_radius = float(np.sort(residuals)[rank - 1])
        truth_log = np.asarray([row["logLife"] for row in target])
        covered = np.abs(truth_log - prediction) <= interval_radius
        target_metrics = metrics(target, prediction)
        accepted_indices = np.flatnonzero(accepted)
        accepted_metrics = metrics([target[index] for index in accepted_indices], prediction[accepted_indices]) if accepted_indices.size else None
        pilot = pilot_metrics(target, prediction, model["testZ"])
        fold = {
            "source": source,
            "metrics": target_metrics,
            "supportThreshold": support_threshold,
            "acceptedCount": int(np.sum(accepted)),
            "acceptedFraction": float(np.mean(accepted)),
            "acceptedMetrics": accepted_metrics,
            "intervalCalibrationResidualCount": len(residuals),
            "intervalOrderRank": rank,
            "intervalRadiusLogLife": interval_radius,
            "intervalMultiplicativeWidth": float(math.exp(2 * interval_radius)),
            "intervalCoverage": float(np.mean(covered)),
            "pilot": pilot,
        }
        folds.append(fold)
        for index, row in enumerate(target):
            predicted_life = float(math.exp(prediction[index]))
            cell_predictions.append(
                {
                    "source": source,
                    "cellId": row["cellId"],
                    "life": row["life"],
                    "predictedLife": predicted_life,
                    "logPrediction": float(prediction[index]),
                    "absolutePercentageError": abs(predicted_life - row["life"]) / row["life"],
                    "supportDistance": float(target_distance[index]),
                    "accepted": bool(accepted[index]),
                    "intervalCovered": bool(covered[index]),
                }
            )
    return folds, cell_predictions


def adjudicate(random_results: list[dict], folds: list[dict], cells: list[dict]) -> dict:
    random_mdape = float(np.median([item["mdape"] for item in random_results]))
    random_cat = float(np.median([item["catastrophicFraction"] for item in random_results]))
    pooled_rows = [
        {"life": cell["life"], "logLife": math.log(cell["life"])} for cell in cells
    ]
    pooled_prediction = np.asarray([cell["logPrediction"] for cell in cells])
    pooled = metrics(pooled_rows, pooled_prediction)
    h0_mdape_ratio = pooled["mdape"] / random_mdape if random_mdape else math.inf
    h0_cat_ratio = pooled["catastrophicFraction"] / random_cat if random_cat else (math.inf if pooled["catastrophicFraction"] else 1.0)
    h0_rejected = h0_mdape_ratio >= 1.5 or h0_cat_ratio >= 2.0

    distances = np.asarray([cell["supportDistance"] for cell in cells])
    errors = np.asarray([cell["absolutePercentageError"] for cell in cells])
    accepted = np.asarray([cell["accepted"] for cell in cells])
    rank_correlation = spearman(distances, errors)
    all_cat = float(np.mean(errors > 0.50))
    accepted_cat = float(np.mean(errors[accepted] > 0.50)) if np.any(accepted) else 1.0
    retained = float(np.mean(accepted))
    h1_supported = rank_correlation >= 0.50 and retained >= 0.50 and accepted_cat <= all_cat * 0.50

    pooled_coverage = float(np.mean([cell["intervalCovered"] for cell in cells]))
    eligible_fold_coverage = [fold["intervalCoverage"] for fold in folds if fold["metrics"]["n"] >= 4]
    h2_supported = pooled_coverage >= 0.90 and all(value >= 0.75 for value in eligible_fold_coverage)

    eligible_pilots = [fold for fold in folds if fold["pilot"] is not None]
    pilot_pass_count = sum(fold["pilot"]["passesTwentyPercent"] and fold["pilot"]["noWorseThanMedianPair"] for fold in eligible_pilots)
    h3_supported = pilot_pass_count >= 2
    return {
        "randomMixtureMedian": {"mdape": random_mdape, "catastrophicFraction": random_cat},
        "pooledLeaveSourceOut": pooled,
        "hypotheses": [
            {"code": "H0", "verdict": "rejected" if h0_rejected else "not-rejected", "mdapeRatio": h0_mdape_ratio, "catastrophicRatio": h0_cat_ratio},
            {"code": "H1", "verdict": "supported" if h1_supported else "rejected", "spearman": rank_correlation, "acceptedFraction": retained, "allCatastrophicFraction": all_cat, "acceptedCatastrophicFraction": accepted_cat},
            {"code": "H2", "verdict": "supported" if h2_supported else "rejected", "pooledCoverage": pooled_coverage, "eligibleSourceCoverage": eligible_fold_coverage},
            {"code": "H3", "verdict": "supported" if h3_supported else "rejected", "eligibleSourceCount": len(eligible_pilots), "passingSourceCount": pilot_pass_count},
            {"code": "H4", "verdict": "unsupported-and-not-testable-with-this-cohort", "interventionLabels": 0, "independentInternalStateMeasurements": 0},
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("data_root", type=Path)
    parser.add_argument("--features-out", type=Path, default=Path("research/reproducibility/rc52-battery-feature-table.json"))
    parser.add_argument("--result-out", type=Path, default=Path("research/reproducibility/rc52-battery-domain-passport-python.json"))
    args = parser.parse_args()

    hash_audit = []
    for filename, expected in ARCHIVES.items():
        path = args.data_root / filename
        observed = md5(path)
        hash_audit.append({"file": filename, "expectedMd5": expected, "observedMd5": observed, "matches": observed == expected})
    if not all(item["matches"] for item in hash_audit):
        raise SystemExit("archive hash mismatch")

    rows, exclusions = load_rows(args.data_root)
    random_results = stratified_splits(rows)
    folds, cell_predictions = leave_source_out(rows)
    adjudication = adjudicate(random_results, folds, cell_predictions)

    feature_payload = {
        "dataset": "BatteryLife_Processed v11 RC52 subset",
        "sourceRecord": "https://zenodo.org/records/19688272",
        "featureContract": "RC52-BATTERY-DOMAIN-PASSPORT-PRECOMMIT-0.1",
        "featureNames": FEATURE_NAMES,
        "rows": rows,
        "exclusions": exclusions,
    }
    result = {
        "experiment": "RC52 BatteryLife domain passport",
        "cycleId": "RC-2026-52",
        "precommitGitCommit": "bd5a4ae",
        "generatedOn": "2026-08-26",
        "archiveHashAudit": hash_audit,
        "eligibleCellCount": len(rows),
        "excludedCellCount": len(exclusions),
        "sourceCounts": {source: sum(row["source"] == source for row in rows) for source in SOURCES},
        "featureCount": len(FEATURE_NAMES),
        "randomSplit": {"seed": 520026, "repeatCount": len(random_results), "results": random_results},
        "leaveSourceOut": {"folds": folds, "cellPredictions": cell_predictions},
        "adjudication": adjudication,
        "scopeBoundary": {
            "fieldPackCount": 0,
            "safetyFailureCount": 0,
            "multimodalInternalStateCount": 0,
            "newlyFabricatedCellCount": 0,
            "independentLaboratoryReplicationCount": 0,
            "claim": "A four-source observational transfer audit, not universal lifetime prediction, mechanism identification, or safety certification."
        }
    }
    args.features_out.parent.mkdir(parents=True, exist_ok=True)
    args.result_out.parent.mkdir(parents=True, exist_ok=True)
    args.features_out.write_text(json.dumps(feature_payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    args.result_out.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"eligible": len(rows), "excluded": len(exclusions), "adjudication": adjudication}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
