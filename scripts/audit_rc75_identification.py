"""Forward-channel audit of RC75's finite identification theorem.

No JavaScript implementation is imported. This is a second implementation of
the same abstract model, not independent empirical or scientific validation.
"""

import argparse
import json
from pathlib import Path


def channel_outputs(word, length, errors, erasures):
    """Generate outputs by applying every allowed corruption/erasure action."""
    outputs = set()

    def visit(index, error_count, erasure_count, observation):
        if index == length:
            outputs.add(observation)
            return
        bit = (word >> index) & 1
        place = 3 ** index
        visit(index + 1, error_count, erasure_count, observation + bit * place)
        if error_count < errors:
            visit(index + 1, error_count + 1, erasure_count,
                  observation + (1 - bit) * place)
        if erasure_count < erasures:
            # Ternary digit 2 represents an indexed, identified null erasure.
            visit(index + 1, error_count, erasure_count + 1,
                  observation + 2 * place)

    visit(0, 0, 0, 0)
    return outputs


def output_mask(words, length, errors, erasures):
    mask = 0
    for word in words:
        for observation in channel_outputs(word, length, errors, erasures):
            mask |= 1 << observation
    return mask


def support_distance(left, right):
    return min((x ^ z).bit_count() for x in left for z in right)


def decode_observation(code, length):
    result = []
    for _ in range(length):
        code, digit = divmod(code, 3)
        result.append(None if digit == 2 else digit)
    return result


def special_case(name, length, left, right, errors, erasures):
    shared = output_mask(left, length, errors, erasures) & output_mask(
        right, length, errors, erasures)
    distance = support_distance(left, right)
    separators = sum(
        not ({(word >> i) & 1 for word in left}
             & {(word >> i) & 1 for word in right})
        for i in range(length)
    )
    collision_code = (shared & -shared).bit_length() - 1 if shared else None
    return {
        "name": name,
        "length": length,
        "leftSupportIntegers": list(left),
        "rightSupportIntegers": list(right),
        "integerEncoding": "coordinate i is integer bit i (least-significant first)",
        "errors": errors,
        "erasures": erasures,
        "minimumCrossDistance": distance,
        "marginalSeparators": separators,
        "identifiesTruth": shared == 0,
        "theoremPrediction": distance > 2 * errors + erasures,
        "firstCollision": decode_observation(collision_code, length)
        if shared else None,
    }


def audit():
    by_length = []
    failures = []
    total_cases = 0
    total_mismatches = 0
    for length in range(1, 4):
        words = tuple(range(1 << length))
        supports = [tuple(word for word in words if mask & (1 << word))
                    for mask in range(1, 1 << len(words))]
        channels = {
            (errors, erasures): [output_mask(support, length, errors, erasures)
                                for support in supports]
            for errors in range(2) for erasures in range(2)
        }
        cells = []
        for errors in range(2):
            for erasures in range(2):
                masks = channels[(errors, erasures)]
                cases = identified = ambiguous = mismatches = 0
                for i, left in enumerate(supports):
                    # Identical support sets are distinct labels and must be
                    # tested too: their observations are always ambiguous.
                    for j in range(i, len(supports)):
                        right = supports[j]
                        observed_identifiable = (masks[i] & masks[j]) == 0
                        distance = support_distance(left, right)
                        predicted = distance > 2 * errors + erasures
                        cases += 1
                        identified += observed_identifiable
                        ambiguous += not observed_identifiable
                        if observed_identifiable != predicted:
                            mismatches += 1
                            if len(failures) < 10:
                                failures.append({
                                    "length": length, "left": list(left),
                                    "right": list(right), "errors": errors,
                                    "erasures": erasures,
                                    "distance": distance,
                                    "observedIdentifiable": observed_identifiable,
                                })
                total_cases += cases
                total_mismatches += mismatches
                cells.append({"errors": errors, "erasures": erasures,
                              "cases": cases, "identified": identified,
                              "ambiguous": ambiguous, "mismatches": mismatches})
        by_length.append({"length": length, "nonemptySupports": len(supports),
                          "unorderedSupportPairsIncludingIdentical":
                          len(supports) * (len(supports) + 1) // 2,
                          "cells": cells})

    examples = [
        special_case("parity_without_faults", 2, (0, 3), (1, 2), 0, 0),
        special_case("parity_one_erasure", 2, (0, 3), (1, 2), 0, 1),
        special_case("weight_one_vs_all_one_corrects_one_error",
                     4, (1, 2, 4, 8), (15,), 1, 0),
        special_case("weight_one_vs_all_one_boundary_collision",
                     4, (1, 2, 4, 8), (15,), 1, 1),
    ]
    criteria = {
        "exhaustive_case_count_is_131064": total_cases == 131064,
        "all_exhaustive_predictions_match": total_mismatches == 0,
        "all_examples_match": all(example["identifiesTruth"]
                                  == example["theoremPrediction"]
                                  for example in examples),
        "parity_has_no_marginal_separator_but_identifies":
        examples[0]["marginalSeparators"] == 0 and examples[0]["identifiesTruth"],
        "one_error_example_has_no_marginal_separator_but_identifies":
        examples[2]["marginalSeparators"] == 0 and examples[2]["identifiesTruth"],
        "threshold_equality_is_ambiguous": not examples[3]["identifiesTruth"],
    }
    return {
        "cycle": "RC-2026-75",
        "method": "Independent Python forward enumeration of permitted channel actions",
        "scope": "All nonempty binary joint supports of lengths 1 through 3; unordered pairs including identical supports; error and erasure budgets 0 and 1",
        "exhaustiveCaseCount": total_cases,
        "mismatchCount": total_mismatches,
        "byLength": by_length,
        "counterexamplesToTheorem": failures,
        "correlatedSupportExamples": examples,
        "criteria": criteria,
        "qualifies": all(criteria.values()),
        "validationBoundary": "Same abstract model and assumptions; independent implementation, not external scientific validation. Finite checks do not prove the general theorem or calibrate physical sensor supports.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    result = audit()
    serialized = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.write:
        target = Path(__file__).resolve().parents[1] / "research" / "reproducibility" / "rc75-independent-audit.json"
        with target.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(serialized)
    print(serialized, end="")
    if not result["qualifies"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
