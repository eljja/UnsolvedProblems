import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def load(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))

protocol = load("research/reproducibility/site-lineage-interface-protocol.json")
fixtures = load("research/reproducibility/site-lineage-adversarial-fixtures.json")
result = load("research/reproducibility/site-lineage-attestation-result.json")

def powder_signal(variant=0):
    peaks = ((24.8, 1.0, .35), (28.7, .7, .42), (42.9, .45, .55)) if variant == 0 else ((22.6, .8, .40), (33.1, 1.0, .50), (47.4, .52, .38))
    rows = []
    for index in range(161):
        x = 20 + index * .25
        y = .05 + sum(height * math.exp(-.5 * ((x - centre) / width) ** 2) for centre, height, width in peaks)
        rows.append((x, y))
    return rows

def interpolate(rows, x):
    if x <= rows[0][0]:
        return rows[0][1]
    if x >= rows[-1][0]:
        return rows[-1][1]
    for left, right in zip(rows, rows[1:]):
        if left[0] <= x <= right[0]:
            return left[1] + (right[1] - left[1]) * (x - left[0]) / (right[0] - left[0])
    raise AssertionError("interpolation domain error")

def fingerprint(rows):
    vector = [interpolate(sorted(rows), 20 + index * .25) for index in range(161)]
    mean = sum(vector) / len(vector)
    centered = [value - mean for value in vector]
    norm = math.sqrt(sum(value * value for value in centered))
    return [value / norm for value in centered]

def cosine(left, right):
    return sum(a * b for a, b in zip(left, right))

base = powder_signal(0)
transformed = [(x + .001, y * 1.05 + .002) for x, y in base]
legitimate = [(x, y + .00012 * math.sin(index * .73)) for index, (x, y) in enumerate(base)]
unrelated = powder_signal(1)
independent_similarities = {
    "transformedCopy": round(cosine(fingerprint(base), fingerprint(transformed)), 9),
    "legitimateRepeat": round(cosine(fingerprint(base), fingerprint(legitimate)), 9),
    "unrelatedSignals": round(cosine(fingerprint(base), fingerprint(unrelated)), 9),
}

fixture_by_id = {row["id"]: row for row in fixtures["tests"]}
observed_by_id = {row["id"]: row for row in result["fixtureResults"]}
checks = {
    "protocol_is_synthetic_only": protocol["status"] == "synthetic-interface-test-before-any-site-or-physical-claim",
    "physical_and_digital_ids_are_separate": "physical sample" in protocol["identityContract"]["physicalSample"].lower() and "digital-object" in protocol["identityContract"]["digitalObject"],
    "state_machine_seals_before_release": protocol["eventStateMachine"].index("analysis-sealed") < protocol["eventStateMachine"].index("key-released"),
    "fixture_denominator_is_fixed": len(fixtures["tests"]) == 14 and len(result["fixtureResults"]) == 14,
    "fixture_expectations_match": set(fixture_by_id) == set(observed_by_id) and all(observed_by_id[key]["expectedVerdict"] == row["expectedVerdict"] and observed_by_id[key]["expectedCode"] == row["expectedCode"] and observed_by_id[key]["detectedAsSpecified"] for key, row in fixture_by_id.items()),
    "two_ambiguous_controls_are_quarantined": all(observed_by_id[key]["observedVerdict"] == "quarantine" for key in ("S04", "S05")),
    "similarities_recomputed_independently": all(abs(independent_similarities[key] - result["similarities"][key]) <= 5e-9 for key in independent_similarities),
    "similarity_cannot_identify_copy": independent_similarities["transformedCopy"] >= .999 and independent_similarities["legitimateRepeat"] >= .999,
    "content_only_impossibility_preserved": result["decisions"]["H5_contentOnlyRuleDistinguishesPhysicalOccurrence"] is False and "same input" in result["indistinguishableWorlds"]["consequence"],
    "physical_readiness_not_claimed": result["readiness"]["L4-ATTESTATION"] == "not-demonstrated" and result["readiness"]["L5-PHYSICAL"] == "not-demonstrated",
    "emulator_is_not_attestation": result["validFixture"]["receiptClass"] == "synthetic-emulator" and result["decisions"]["H6_emulatorReceiptQualifiesPhysicalSite"] is False,
}

audit = {
    "auditId": "SITE-LINEAGE-PYTHON-AUDIT-0.3",
    "computedOn": "2026-08-14",
    "passed": all(checks.values()),
    "checks": checks,
    "independentlyRecomputedSimilarities": independent_similarities,
    "independenceBoundary": "This Python audit reimplements signal generation, interpolation, normalization, similarity, and cross-file semantic checks without importing the JavaScript validator. It uses no site, material, instrument, barcode, chiplet, or physical outcome.",
    "conclusion": "Both transformed copies and legitimate repeats enter the same similarity quarantine. Physical occurrence remains undecidable from content alone."
}

if not audit["passed"]:
    raise SystemExit(json.dumps(audit, indent=2))

target = ROOT / "research/reproducibility/site-lineage-python-audit.json"
if "--emit" in __import__("sys").argv:
    print(json.dumps(audit, indent=2))
else:
    expected = json.loads(target.read_text(encoding="utf-8"))
    if audit != expected:
        raise SystemExit("RC28 independent audit differs from committed artifact")
    print("RC28 independent Python audit passed: similarity ambiguity and non-physical scope reproduced independently.")
