#!/usr/bin/env python3
"""Post-outcome RC54 boundary diagnosis; no confirmatory model or verdict changes."""

from __future__ import annotations

import json
import math
import pathlib
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"
TABLE = json.loads((REPRO / "rc54-kit-early-response-feature-table.json").read_text(encoding="utf-8"))
RESULT = json.loads((REPRO / "rc54-kit-early-response-python.json").read_text(encoding="utf-8"))
OUTPUT = REPRO / "rc54-kit-early-response-boundary-diagnostic.json"


def median(values):
    clean = sorted(value for value in values if value is not None and math.isfinite(value))
    if not clean:
        return None
    middle = len(clean) // 2
    return clean[middle] if len(clean) % 2 else (clean[middle - 1] + clean[middle]) / 2


def improvement(baseline, candidate):
    return (baseline - candidate) / baseline if baseline else None


def summarize_cells(cells):
    return {
        "cells": len(cells),
        "completeD": sum(cell["completeD"] for cell in cells),
        "events": sum(bool(cell["endpoint"] and cell["endpoint"]["event"]) for cell in cells),
        "censored": sum(bool(cell["endpoint"] and not cell["endpoint"]["event"]) for cell in cells),
        "noEndpoint": sum(cell["endpoint"] is None for cell in cells),
    }


cells = TABLE["rows"]
target_all = [cell for cell in cells if cell["split"] == "target"]
target_complete = [cell for cell in target_all if cell["completeD"]]
development_complete = [cell for cell in cells if cell["split"] == "development" and cell["completeD"]]
prediction_by_id = {item["id"]: item for item in RESULT["targetPredictions"]}

missing_fields = Counter(field for cell in cells if not cell["completeD"] for field in cell["missing"])
target_missing_fields = Counter(field for cell in target_all if not cell["completeD"] for field in cell["missing"])

temperature_family = {}
for temperature in (0, 10, 25, 40):
    temperature_family[str(temperature)] = {}
    for family in ("calendar", "cyclic", "profile"):
        temperature_family[str(temperature)][family] = summarize_cells([
            cell for cell in cells if cell["temperatureC"] == temperature and cell["ageFamily"] == family
        ])

development_events = {
    family: summarize_cells([cell for cell in development_complete if cell["ageFamily"] == family])
    for family in ("calendar", "cyclic", "profile")
}

paired = {}
for candidate, baseline in (("B", "A"), ("C", "B"), ("D", "C")):
    by_family = {}
    all_deltas = []
    wins = 0
    losses = 0
    for family in ("calendar", "cyclic", "profile"):
        deltas = []
        for cell in target_complete:
            if cell["ageFamily"] != family or not cell["endpoint"]["event"]:
                continue
            prediction = prediction_by_id[cell["id"]]["predictedMedianDays"]
            observed = cell["endpoint"]["timeDays"]
            baseline_error = abs(prediction[baseline] - observed)
            candidate_error = abs(prediction[candidate] - observed)
            deltas.append(baseline_error - candidate_error)
            all_deltas.append(baseline_error - candidate_error)
            if candidate_error < baseline_error:
                wins += 1
            elif candidate_error > baseline_error:
                losses += 1
        by_family[family] = {
            "eventCells": len(deltas),
            "medianAbsoluteErrorChangeDays": median(deltas),
            "positiveMeansCandidateLowerError": True,
        }
    paired[f"{candidate}vs{baseline}"] = {
        "wins": wins,
        "losses": losses,
        "ties": len(all_deltas) - wins - losses,
        "medianAbsoluteErrorChangeDays": median(all_deltas),
        "byFamily": by_family,
    }


def single_feature_within_condition(feature_name, increasing_means_longer=True, cohort=None):
    comparable = 0
    correct = 0.0
    grouped = defaultdict(list)
    for cell in cohort or target_complete:
        value = cell["features"].get(feature_name)
        if cell["endpoint"] and value is not None and math.isfinite(value):
            grouped[cell["conditionId"]].append(cell)
    for group in grouped.values():
        for left in range(len(group)):
            for right in range(left + 1, len(group)):
                a, b = group[left], group[right]
                ta, tb = a["endpoint"]["timeDays"], b["endpoint"]["timeDays"]
                ea, eb = a["endpoint"]["event"], b["endpoint"]["event"]
                if ta == tb:
                    continue
                if ta < tb and ea:
                    early, late = a, b
                elif tb < ta and eb:
                    early, late = b, a
                else:
                    continue
                q_early = early["features"][feature_name]
                q_late = late["features"][feature_name]
                if q_early == q_late:
                    correct += 0.5
                elif (q_early < q_late) == increasing_means_longer:
                    correct += 1.0
                comparable += 1
    return {"value": correct / comparable if comparable else None, "comparablePairs": comparable}


feature_directions = {
    "earlyCapacityResponse": single_feature_within_condition("early_log_capacity_response_per_day", True),
}
feature_directions_all_target = {
    "earlyCapacityResponse": single_feature_within_condition("early_log_capacity_response_per_day", True, target_all),
}
for prefix, direction in (
    ("early_log_eis_zref_response_per_day_soc", False),
    ("early_log_pulse_r10ms_response_per_day_soc", False),
    ("early_log_pulse_r1s_response_per_day_soc", False),
):
    for soc in (10, 30, 50, 70, 90):
        feature_directions[f"{prefix}{soc}"] = single_feature_within_condition(f"{prefix}{soc}", direction)
        feature_directions_all_target[f"{prefix}{soc}"] = single_feature_within_condition(f"{prefix}{soc}", direction, target_all)

condition_coverage = []
for condition in sorted({cell["conditionId"] for cell in target_all}):
    group = [cell for cell in target_all if cell["conditionId"] == condition]
    condition_coverage.append({
        "conditionId": condition,
        "family": group[0]["ageFamily"],
        "configured": len(group),
        "completeD": sum(cell["completeD"] for cell in group),
        "eventsAll": sum(bool(cell["endpoint"] and cell["endpoint"]["event"]) for cell in group),
        "eventsCompleteD": sum(bool(cell["completeD"] and cell["endpoint"] and cell["endpoint"]["event"]) for cell in group),
    })

coefficient_rank = {}
for code in "ABCD":
    fit = RESULT["fits"][code]
    coefficient_rank[code] = sorted(
        ({"feature": name, "standardizedCoefficient": coefficient} for name, coefficient in zip(fit["featureNames"], fit["coefficients"])),
        key=lambda item: abs(item["standardizedCoefficient"]),
        reverse=True,
    )[:8]

diagnostic = {
    "diagnosticId": "RC54-KIT-EARLY-RESPONSE-BOUNDARY-DIAGNOSTIC-0.1",
    "cycleId": "RC-2026-54",
    "runOn": "2026-08-29",
    "status": "post-outcome-exploratory-does-not-change-preregistered-verdicts",
    "confirmedBoundaries": {
        "allTarget": summarize_cells(target_all),
        "commonCompleteTarget": summarize_cells(target_complete),
        "commonCompleteDevelopment": summarize_cells(development_complete),
        "developmentByFamily": development_events,
        "temperatureByFamily": temperature_family,
        "missingFieldsAll": dict(missing_fields.most_common()),
        "missingFieldsTarget": dict(target_missing_fields.most_common()),
        "targetConditionCoverage": condition_coverage,
    },
    "pairedErrorDiagnosis": paired,
    "registeredFeatureDirectionsWithinCondition": feature_directions,
    "registeredFeatureDirectionsWithinConditionAllAvailableTarget": feature_directions_all_target,
    "largestStandardizedCoefficients": coefficient_rank,
    "interpretation": [
        "Temperature and protocol rank many target cells correctly in aggregate, but they cannot order cell-to-cell variation within a triplicate: arm A within-condition concordance is 0.50.",
        "Static diagnostics lower pooled median error, yet the three observed calendar events produce extremely large extrapolation errors and the worst-family gate fails.",
        "The one-week capacity response degrades both error and calibration, so its sign or magnitude is not a stable susceptibility bridge across calendar, cyclic, and WLTP aging.",
        "Adding all fifteen EIS/pulse response rates recovers part of C's loss but remains worse than B; its D-versus-C bootstrap interval crosses zero widely.",
        "Thirteen target cells lack at least one registered CU0/CU1 EIS response and only 27 within-condition event pairs remain, independently failing the coverage and pair-count gates."
    ],
    "nextDecisiveTest": {
        "hypothesis": "The transferable signal, if present, is a low-dimensional degradation-path response observed after a nontrivial aging interval, not the noisy one-week change of every impedance coordinate.",
        "design": "Use the same 40-degree target only in a newly preregistered cycle. Select a single later landmark common to the cohort without reading later target values; learn a sparse SOC/frequency or physically constrained impedance-path summary on 0/10/25-degree development cells only; keep complete condition holdout, censoring, family gates, and within-triplicate ranking.",
        "minimumTest": "Before refitting survival, test whether the selected response summary reaches within-condition concordance above 0.60 with at least 30 comparable held-temperature pairs and at least 90% target feature coverage.",
        "stop": "Stop the electrochemical-only branch if no prespecified later-landmark summary clears both coverage and within-condition gates; escalate to thermal, pressure, acoustic, or mechanical measurements rather than adding flexible predictors."
    },
    "claimBoundary": "Feature-direction and coefficient summaries are exploratory diagnostics. They neither rescue H0-H3 nor establish a mechanism."
}
OUTPUT.write_text(json.dumps(diagnostic, indent=2, allow_nan=False) + "\n", encoding="utf-8")
print(
    f"RC54 diagnostic: target complete {len(target_complete)}/{len(target_all)}, "
    f"development family events { {key: value['events'] for key, value in development_events.items()} }, "
    f"target missing fields {sum(target_missing_fields.values())}."
)
