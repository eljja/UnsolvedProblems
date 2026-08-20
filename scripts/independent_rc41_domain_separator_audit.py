import argparse
import itertools
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "research/reproducibility/rc41-domain-separator-model-result.json"
OUTPUT_PATH = ROOT / "research/reproducibility/rc41-domain-separator-python-audit.json"


def make_domain(identifier, supports, calibration_domain=None):
    alphabet = []
    for values in supports.values():
        for value in values:
            if value not in alphabet:
                alphabet.append(value)
    return {"id": identifier, "supports": supports, "calibrationDomain": calibration_domain or identifier, "alphabet": alphabet}


def observation_key(values, mode):
    if mode == "anonymous":
        return tuple(sorted(value for value in values if value is not None))
    return tuple(values)


def enumerate_truth(profile, truth, corrupt_budget, omission_budget, mode="indexed"):
    observations = set()
    worlds = 0
    values = [None] * len(profile)

    def visit(index, corrupt, omitted):
        nonlocal worlds
        if index == len(profile):
            worlds += 1
            observations.add(observation_key(values, mode))
            return
        item = profile[index]
        for value in item["supports"][truth]:
            values[index] = value
            visit(index + 1, corrupt, omitted)
        if corrupt < corrupt_budget:
            for value in item["alphabet"]:
                values[index] = value
                visit(index + 1, corrupt + 1, omitted)
        if omitted < omission_budget:
            values[index] = None
            visit(index + 1, corrupt, omitted + 1)

    visit(0, 0, 0)
    return worlds, observations


def separator_count(profile, left, right):
    return sum(not set(item["supports"][left]).intersection(item["supports"][right]) for item in profile)


def analyze(name, profile, truths, corrupt_budget, omission_budget, mode="indexed"):
    by_truth = {truth: enumerate_truth(profile, truth, corrupt_budget, omission_budget, mode) for truth in truths}
    observed = {}
    for truth, (_, observations) in by_truth.items():
        for key in observations:
            observed.setdefault(key, set()).add(truth)
    collisions = [(key, values) for key, values in observed.items() if len(values) > 1]
    separators = [separator_count(profile, left, right) for left, right in itertools.combinations(truths, 2)]
    return {
        "name": name,
        "observationCount": len(observed),
        "collisionCount": len(collisions),
        "identifiesExactTruth": len(collisions) == 0,
        "minimumPairwiseSeparators": min(separators),
        "truthObservationCounts": {truth: len(value[1]) for truth, value in by_truth.items()},
        "shortestCollisionTruths": sorted(collisions[0][1]) if collisions else None,
    }


def add_check(checks, code, passed, detail):
    checks.append({"code": code, "pass": bool(passed), "detail": detail})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    model = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    checks = []

    js_binary = {(item["n"], item["mask"], item["corruptBudget"], item["omissionBudget"]): item for item in model["binarySweep"]}
    for n in range(1, 7):
        for mask in range(2 ** n):
            profile = []
            for index in range(n):
                separates = bool(mask & (1 << index))
                supports = {0: ["A"], 1: ["B"]} if separates else {0: ["A"], 1: ["A"]}
                profile.append(make_domain(f"D{index + 1}", supports))
            separators = sum(bool(mask & (1 << index)) for index in range(n))
            for g in range(3):
                for a in range(3):
                    py = analyze("binary", profile, [0, 1], g, a)
                    js = js_binary[(n, mask, g, a)]
                    prefix = f"B-{n}-{mask}-{g}-{a}"
                    add_check(checks, f"{prefix}-separators", separators == js["separatorCount"], f"python={separators} js={js['separatorCount']}")
                    add_check(checks, f"{prefix}-truth0-observations", py["truthObservationCounts"][0] == js["truth0ObservationCount"], f"python={py['truthObservationCounts'][0]} js={js['truth0ObservationCount']}")
                    add_check(checks, f"{prefix}-truth1-observations", py["truthObservationCounts"][1] == js["truth1ObservationCount"], f"python={py['truthObservationCounts'][1]} js={js['truth1ObservationCount']}")
                    add_check(checks, f"{prefix}-collisions", py["collisionCount"] == js["collisionCount"], f"python={py['collisionCount']} js={js['collisionCount']}")
                    add_check(checks, f"{prefix}-identifies", py["identifiesExactTruth"] == js["identifiesExactTruth"], f"python={py['identifiesExactTruth']} js={js['identifiesExactTruth']}")
                    expected = separators >= 2 * g + a + 1
                    add_check(checks, f"{prefix}-theorem", py["identifiesExactTruth"] == expected == js["theoremPrediction"], f"identified={py['identifiesExactTruth']} expected={expected}")

    direct = lambda identifier, calibration=None: make_domain(identifier, {0: ["L"], 1: ["M"], 2: ["H"]}, calibration)
    weak = [direct("D1"), direct("D2"), direct("D3"), make_domain("D4", {0: ["W01"], 1: ["W01"], 2: ["H"]}), make_domain("D5", {0: ["ALL"], 1: ["ALL"], 2: ["ALL"]})]
    strong = [direct("D1"), direct("D2"), direct("D3"), make_domain("D4", {0: ["W01"], 1: ["W01"], 2: ["H"]}), make_domain("D5", {0: ["L"], 1: ["W12"], 2: ["W12"]})]
    polarity = [make_domain("D1", {0: ["L"], 1: ["M"], 2: ["H"]}), make_domain("D2", {0: ["M"], 1: ["L"], 2: ["H"]}), make_domain("D3", {0: ["L"], 1: ["M"], 2: ["H"]}), make_domain("D4", {0: ["M"], 1: ["L"], 2: ["H"]})]
    raw = [direct(f"S{index + 1}", f"C{index // 2 + 1}") for index in range(6)]
    correlated = [make_domain(f"C{index + 1}", {0: ["LL"], 1: ["MM"], 2: ["HH"]}) for index in range(3)]
    cases = [
        analyze("HETEROGENEOUS_WEAK", weak, [0, 1, 2], 1, 1),
        analyze("HETEROGENEOUS_STRONG", strong, [0, 1, 2], 1, 1),
        analyze("POLARITY_INDEXED", polarity, [0, 1, 2], 0, 0, "indexed"),
        analyze("POLARITY_ANONYMOUS", polarity, [0, 1, 2], 0, 0, "anonymous"),
        analyze("RAW_CHANNEL_NAIVE", raw, [0, 1, 2], 1, 1),
        analyze("THREE_CORRELATED_DOMAINS", correlated, [0, 1, 2], 1, 1),
        analyze("THREE_DOMAINS_PLUS_ANCHOR", correlated + [direct("ANCHOR")], [0, 1, 2], 1, 1),
    ]
    js_profiles = {item["name"]: item for item in model["profiles"]}
    for py in cases:
        js = js_profiles[py["name"]]
        for field in ["minimumPairwiseSeparators", "observationCount", "collisionCount", "identifiesExactTruth"]:
            add_check(checks, f"PROFILE-{py['name']}-{field}", py[field] == js[field], f"python={py[field]} js={js[field]}")

    summaries = []
    n_population = 6
    threshold = 0.5
    for ones in range(n_population + 1):
        for zeros in range(n_population - ones + 1):
            missing = n_population - ones - zeros
            minimum = ones
            maximum = ones + missing
            lower = minimum / n_population
            upper = maximum / n_population
            decision = "above" if lower > threshold else "below" if upper < threshold else "inconclusive"
            summaries.append({"observedOnes": ones, "observedZeros": zeros, "missing": missing, "minimumSuccesses": minimum, "maximumSuccesses": maximum, "identifiedWidth": missing, "decision": decision})
    js_summaries = {(item["observedOnes"], item["observedZeros"], item["missing"]): item for item in model["population"]["summaries"]}
    for py in summaries:
        key = (py["observedOnes"], py["observedZeros"], py["missing"])
        js = js_summaries[key]
        for field in ["minimumSuccesses", "maximumSuccesses", "identifiedWidth", "decision"]:
            add_check(checks, f"POP-{key[0]}-{key[1]}-{key[2]}-{field}", py[field] == js[field], f"python={py[field]} js={js[field]}")

    profile_map = {item["name"]: item for item in cases}
    population_map = {(item["observedOnes"], item["observedZeros"], item["missing"]): item for item in summaries}
    independent_criteria = {
        "C1_all_binary_separator_cells_match_theorem": all(item["identifiesExactTruth"] == item["theoremPrediction"] for item in model["binarySweep"]),
        "C2_binary_sweep_has_1134_cells": len(model["binarySweep"]) == 1134,
        "C3_heterogeneous_strong_profile_identifies": profile_map["HETEROGENEOUS_STRONG"]["identifiesExactTruth"],
        "C4_heterogeneous_weak_profile_collides": not profile_map["HETEROGENEOUS_WEAK"]["identifiesExactTruth"],
        "C5_weakest_pair_has_three_separators": profile_map["HETEROGENEOUS_WEAK"]["minimumPairwiseSeparators"] == 3,
        "C6_indexed_polarity_profile_identifies": profile_map["POLARITY_INDEXED"]["identifiesExactTruth"],
        "C7_anonymous_polarity_profile_collides_without_fault": not profile_map["POLARITY_ANONYMOUS"]["identifiesExactTruth"] and profile_map["POLARITY_ANONYMOUS"]["shortestCollisionTruths"] == [0, 1],
        "C8_naive_raw_channel_count_identifies": profile_map["RAW_CHANNEL_NAIVE"]["identifiesExactTruth"],
        "C9_three_correlated_domains_do_not_identify": not profile_map["THREE_CORRELATED_DOMAINS"]["identifiesExactTruth"],
        "C10_one_independent_anchor_restores_domain_boundary": profile_map["THREE_DOMAINS_PLUS_ANCHOR"]["identifiesExactTruth"],
        "C11_population_identified_width_equals_missing_count": all(item["identifiedWidth"] == item["missing"] for item in summaries),
        "C12_unknown_missing_outcomes_prevent_exact_mean": all(item["missing"] == 0 for item in summaries if item["identifiedWidth"] == 0),
        "C13_all_missing_population_spans_zero_to_one": population_map[(0, 0, 6)]["minimumSuccesses"] == 0 and population_map[(0, 0, 6)]["maximumSuccesses"] == 6,
        "C14_one_audit_reduces_width_and_may_resolve_threshold": population_map[(3, 2, 1)]["identifiedWidth"] == 1 and population_map[(4, 1, 1)]["identifiedWidth"] == 1 and population_map[(3, 2, 1)]["decision"] == "inconclusive" and population_map[(4, 1, 1)]["decision"] == "above",
        "C15_some_MNAR_bounded_decisions_need_not_recover_every_value": sum(item["missing"] > 0 and item["decision"] != "inconclusive" for item in summaries) == 6,
        "C16_no_physical_result_is_claimed": True,
    }
    for code, value in independent_criteria.items():
        add_check(checks, f"CRITERION-{code}", value == model["criteria"][code] == True, f"python={value} js={model['criteria'][code]}")

    boundary = model["implementationBoundary"]
    add_check(checks, "BOUNDARY-HIL", boundary["actualHardwareInLoop"] is False, "no HIL")
    add_check(checks, "BOUNDARY-SENSORS", boundary["physicalSensors"] == 0, "zero physical sensors")
    add_check(checks, "BOUNDARY-EVENTS", boundary["physicalEventsObserved"] == 0, "zero physical events")
    add_check(checks, "BOUNDARY-CALIBRATION", boundary["calibratedSupportSets"] == 0, "zero calibrated support sets")
    add_check(checks, "BOUNDARY-HUMAN-RECORDS", boundary["auditedHumanRecords"] == 0, "zero audited human records")
    qualifies = all(item["pass"] for item in checks) and model["qualifies"]
    add_check(checks, "QUALIFICATION", qualifies, "all independent comparisons pass")
    qualifies = all(item["pass"] for item in checks)
    result = {
        "cycle": "RC-2026-41",
        "implementation": "Independent Python world enumeration, separator counts, calibration-domain collapse, and finite-population missing-outcome bounds; no JavaScript imported",
        "passed": sum(item["pass"] for item in checks),
        "total": len(checks),
        "qualifies": qualifies,
        "checks": checks,
        "boundary": "Combinatorial audit only; sensor supports, covariance, missingness mechanisms, calibration-domain independence, and population effects remain empirically untested.",
    }
    serialized = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUTPUT_PATH.write_text(serialized, encoding="utf-8")
    else:
        print(serialized, end="")
    if not qualifies:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
