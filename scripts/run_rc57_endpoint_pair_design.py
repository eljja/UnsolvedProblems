#!/usr/bin/env python3
"""Exact RC57 endpoint pair-power design from outcome-open RWTH trajectories."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import statistics
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
INPUT = ROOT / "research" / "reproducibility" / "rc55-rwth-frailty-response-feature-table.json"
CONTRACT = ROOT / "research" / "reproducibility" / "rc57-lineage-pair-design-contract.json"
OUTPUT = ROOT / "research" / "reproducibility" / "rc57-endpoint-pair-design-python.json"


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def crossing_proxy(row: dict) -> float:
    threshold = float(row["endpoint"]["thresholdAh"])
    for left, right in zip(row["capacityRounds"], row["capacityRounds"][1:]):
        q_left, q_right = float(left["capacityAh"]), float(right["capacityAh"])
        if q_left > threshold >= q_right:
            c_left, c_right = float(left["cycle"]), float(right["cycle"])
            return c_left + (q_left - threshold) / (q_left - q_right) * (c_right - c_left)
    raise ValueError(f"cell {row['id']} has no bracketing capacity rounds")


def exact_pair_distribution(n: int, probabilities: list[float]) -> dict[int, float]:
    factorials = [math.factorial(value) for value in range(n + 1)]
    states = {(0, 0): 1.0}
    for probability in probabilities:
        next_states = defaultdict(float)
        for (assigned, collisions), weight in states.items():
            for count in range(n - assigned + 1):
                next_states[(assigned + count, collisions + count * (count - 1) // 2)] += (
                    weight * probability**count / factorials[count]
                )
        states = next_states
    total_pairs = n * (n - 1) // 2
    distribution = defaultdict(float)
    for (assigned, collisions), weight in states.items():
        if assigned == n:
            distribution[total_pairs - collisions] += weight * factorials[n]
    normalization = sum(distribution.values())
    return {pairs: probability / normalization for pairs, probability in distribution.items()}


def distribution_metrics(distribution: dict[int, float], threshold: int = 100) -> dict:
    pass_probability = sum(probability for pairs, probability in distribution.items() if pairs >= threshold)
    cumulative = 0.0
    lower_five = None
    median = None
    for pairs in sorted(distribution):
        cumulative += distribution[pairs]
        if lower_five is None and cumulative >= 0.05:
            lower_five = pairs
        if median is None and cumulative >= 0.5:
            median = pairs
            break
    return {
        "probabilityAtLeast100": pass_probability,
        "lowerFivePercentPairCount": lower_five,
        "medianPairCount": median,
    }


def future_design(crossings: list[float], median_crossing: float, n: int, spread: float, interval: int) -> dict:
    phase_results = []
    for phase in range(interval):
        bins = Counter(
            480 + phase + math.ceil((median_crossing + spread * (value - median_crossing) - 480 - phase) / interval) * interval
            for value in crossings
        )
        distribution = exact_pair_distribution(n, [count / len(crossings) for count in bins.values()])
        phase_results.append({"phase": phase, "binCount": len(bins), **distribution_metrics(distribution)})
    worst = min(
        phase_results,
        key=lambda item: (
            round(item["probabilityAtLeast100"], 12),
            item["lowerFivePercentPairCount"],
            item["medianPairCount"],
            item["phase"],
        ),
    )
    gate = worst["probabilityAtLeast100"] >= 0.95 and worst["lowerFivePercentPairCount"] >= 100
    return {
        "effectiveObservedEvents": n,
        "spreadScale": spread,
        "intervalCycles": interval,
        "phaseCount": interval,
        "worstPhase": worst,
        "passesPairPowerGate": gate,
    }


def existing_block_pairs(crossings_by_id: dict[int, float], interval: int) -> dict:
    phase_results = []
    for phase in range(interval):
        quantized = {
            cell_id: 480 + phase + math.ceil((value - 480 - phase) / interval) * interval
            for cell_id, value in crossings_by_id.items()
        }
        pairs = 0
        for batch in range(1, 13):
            values = [quantized[cell_id] for cell_id in range((batch - 1) * 4 + 1, batch * 4 + 1)]
            pairs += sum(values[left] != values[right] for left in range(4) for right in range(left + 1, 4))
        phase_results.append({"phase": phase, "nonTiedPairs": pairs})
    return {
        "intervalCycles": interval,
        "theoreticalMaximum": 72,
        "minimumAcrossPhases": min(item["nonTiedPairs"] for item in phase_results),
        "maximumAcrossPhases": max(item["nonTiedPairs"] for item in phase_results),
        "phaseZeroPairs": phase_results[0]["nonTiedPairs"],
        "canReach100": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    data = json.loads(INPUT.read_text(encoding="utf-8"))
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))

    crossings_by_id = {int(row["id"]): crossing_proxy(row) for row in data["rows"]}
    crossings = list(crossings_by_id.values())
    median_crossing = statistics.median(crossings)
    intervals = contract["pairDesign"]["fixedIntervalsCycles"]
    event_counts = contract["pairDesign"]["effectiveObservedEventCounts"]
    spreads = contract["pairDesign"]["spreadScales"]

    existing = [existing_block_pairs(crossings_by_id, interval) for interval in intervals]
    future = [
        future_design(crossings, median_crossing, n, spread, interval)
        for n in event_counts
        for spread in spreads
        for interval in intervals
    ]

    selections = []
    for n in event_counts:
        conservative = [row for row in future if row["effectiveObservedEvents"] == n and row["spreadScale"] == 0.25]
        passing = [row for row in conservative if row["passesPairPowerGate"]]
        selected = max(passing, key=lambda row: row["intervalCycles"], default=None)
        selections.append(
            {
                "effectiveObservedEvents": n,
                "selectedLargestPassingIntervalCycles": selected["intervalCycles"] if selected else None,
                "worstPhaseProbabilityAtLeast100": selected["worstPhase"]["probabilityAtLeast100"] if selected else None,
                "worstPhaseLowerFivePercentPairCount": selected["worstPhase"]["lowerFivePercentPairCount"] if selected else None,
            }
        )

    output = {
        "analysisId": "RC57-ENDPOINT-PAIR-DESIGN-PYTHON-0.1",
        "cycleId": "RC-2026-57",
        "completedOn": "2026-08-29",
        "status": "exact-design-analysis-not-confirmation",
        "inputSha256": sha256(INPUT),
        "contractSha256": sha256(CONTRACT),
        "sourceCells": len(crossings),
        "sourceObservedEvents": sum(bool(row["endpoint"]["event"]) for row in data["rows"]),
        "crossingProxy": {
            "minimumCycle": min(crossings),
            "medianCycle": median_crossing,
            "maximumCycle": max(crossings),
            "method": "linear interpolation only between adjacent standardized capacity rounds bracketing 80% of own BOL capacity",
            "claimBoundary": "Outcome-open empirical design prior; not a reconstructed true EOL label."
        },
        "existingFourCellBlocks": existing,
        "futureExactDesigns": future,
        "conservativeSelections": selections,
        "principalResult": {
            "fourCellBlockUpperBound": 72,
            "whyCadenceAloneCannotRepairRwth": "Twelve four-cell blocks contain at most 12*C(4,2)=72 within-block pairs, below the 100-pair target even with perfectly distinct event times.",
            "twentyFourEventDesign": next(item for item in selections if item["effectiveObservedEvents"] == 24),
            "thirtySixEventDesign": next(item for item in selections if item["effectiveObservedEvents"] == 36),
            "recommendedFixedDesign": "Use one manifest-verified 36-cell same-condition block and a 25-cycle endpoint register after the nominal cycle-480 feature landmark. This remains pair-powered if only 24 events are usable under the registered quarter-spread, worst-phase sensitivity analysis.",
            "lowerBurdenBranch": "A 50-cycle endpoint register is pair-powered only if all 36 events remain usable under the same conservative design prior. Treat that as a conditional branch, not the default."
        },
        "uncertainty": [
            "Linear interpolation does not reveal the unobserved true crossing and is used only to compare schedules.",
            "The empirical resampling prior comes from NMC cylindrical cells and may not describe LFP coin-cell lifetime dispersion.",
            "Spread scaling and exhaustive grid phase expose, but do not exhaust, distributional shift.",
            "The calculation counts only event-event pairs and therefore does not depend on a censoring-time model.",
            "Dense RPTs may perturb degradation; pair power does not establish intervention equivalence."
        ],
        "auroraOutcomeAccessAuthorized": False
    }
    rendered = json.dumps(output, indent=2, ensure_ascii=False) + "\n"
    if args.write:
        OUTPUT.write_text(rendered, encoding="utf-8")
    print(
        "RC57 pair design: max-four-cell=72, "
        f"n24={output['principalResult']['twentyFourEventDesign']['selectedLargestPassingIntervalCycles']} cycles, "
        f"n36={output['principalResult']['thirtySixEventDesign']['selectedLargestPassingIntervalCycles']} cycles"
    )


if __name__ == "__main__":
    main()
