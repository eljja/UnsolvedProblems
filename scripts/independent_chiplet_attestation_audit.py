import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def load(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))

spec = load("research/reproducibility/chiplet-attestation-emulator-spec.json")
fixtures = load("research/reproducibility/chiplet-attestation-adversarial-fixtures.json")
result = load("research/reproducibility/chiplet-attestation-emulator-result.json")

def one_sided_upper(n, alpha=.05):
    return 1 - alpha ** (1 / n)

minimum = 1
while one_sided_upper(minimum) > .01:
    minimum += 1

baseline = [.12, -.21, .44, .05, -.36, .28, .17, -.09]
normal = [value + .005 * math.sin(index + 1) for index, value in enumerate(baseline)]
tamper = [value + (-.11 if index % 2 else .11) for index, value in enumerate(normal)]
drift = [value + (-.045 if index % 2 else .045) for index, value in enumerate(normal)]

def distance(left, right):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right)))

distances = {
    "A00": round(distance(normal, baseline), 9),
    "A05": round(distance(tamper, baseline), 9),
    "A06": round(distance(drift, baseline), 9),
}

layer_outcome = {
    "none": {},
    "stale-nonce": {"crypto": "reject"},
    "counter-replay": {"crypto": "reject"},
    "substitute-package-id": {"crypto": "reject"},
    "substitute-chiplet-id": {"crypto": "reject"},
    "tamper-response": {"physical": "reject"},
    "genuine-environmental-drift": {"physical": "quarantine"},
    "forge-trace-event": {"trace": "reject"},
    "break-trace-link": {"trace": "reject"},
    "mismatch-trace-head": {"crypto": "reject"},
    "known-root-compromise": {"crypto": "quarantine"},
    "unknown-endorsement": {"crypto": "quarantine"},
    "silent-full-compromise": {},
}
ablation_layers = {
    "trace-only": {"trace"},
    "physical-only": {"physical"},
    "crypto-plus-trace": {"crypto", "trace"},
    "full-combination": {"crypto", "trace", "physical"},
}

def semantic_verdict(mutation, ablation):
    outcomes = [value for layer, value in layer_outcome[mutation].items() if layer in ablation_layers[ablation]]
    if "reject" in outcomes:
        return "reject"
    if "quarantine" in outcomes:
        return "quarantine"
    return "accept"

independent_ablation = {
    ablation: {fixture["id"]: semantic_verdict(fixture["mutation"], ablation) for fixture in fixtures["fixtures"]}
    for ablation in spec["frozenAblations"]
}

checks = {
    "synthetic_scope_is_explicit": spec["status"] == "synthetic-threat-model-and-sample-design-before-hardware" and "no operational instructions" in spec["safetyAndSecurity"]["repositoryBoundary"].lower(),
    "rats_roles_are_separated": set(spec["ratsRoles"]) == {"attester", "endorser", "referenceValueProvider", "verifier", "relyingParty"},
    "fixture_denominator_is_fixed": len(fixtures["fixtures"]) == 13 and result["denominators"]["fixtures"] == 13,
    "full_fixture_expectations_match": all(row["matched"] for row in result["fixtureResults"]),
    "ablation_semantics_recomputed": independent_ablation == result["ablationVerdicts"],
    "response_distances_recomputed": all(abs(distances[key] - result["responseDistanceControls"][key]) <= 1e-9 for key in distances),
    "accept_quarantine_reject_regions_hold": distances["A00"] <= .08 < distances["A06"] < .16 <= distances["A05"],
    "historical_overall_upper_recomputed": abs(one_sided_upper(300) - result["sampleDesignAudit"]["historical600"]["pooledUpper"]) <= 5e-10,
    "historical_family_upper_recomputed": abs(one_sided_upper(75) - result["sampleDesignAudit"]["historical600"]["perFamilyUpper"]) <= 5e-10,
    "minimum_sample_recomputed": minimum == 299 == result["sampleDesignAudit"]["minimumNForUpperAtMostOnePercent"],
    "revised_total_and_bound_recomputed": 306 * 5 == 1530 == result["sampleDesignAudit"]["revisedBalanced"]["totalN"] and abs(one_sided_upper(306) - result["sampleDesignAudit"]["revisedBalanced"]["pooledClassUpper"]) <= 5e-10,
    "cell_bound_is_not_one_percent": result["sampleDesignAudit"]["revisedBalanced"]["perCellUpper"] > .16,
    "silent_compromise_is_accepted": result["ablationVerdicts"]["full-combination"]["A12"] == "accept" and result["decisions"]["H5_fullCombinationProvesSilentFullCompromiseAbsent"] is False,
    "hardware_claim_is_refused": result["decisions"]["H9_hardwarePerformanceEstablished"] is False and all(result["readiness"][key] == "not-demonstrated" for key in ("R4-HARDWARE-ROOT", "R5-PHYSICAL-RESPONSE", "R6-MULTI-VENDOR-TRANSPORT")),
}

audit = {
    "auditId": "CHIPLET-ATTESTATION-PYTHON-AUDIT-0.4",
    "computedOn": "2026-08-14",
    "passed": all(checks.values()),
    "checks": checks,
    "independentlyRecomputed": {
        "responseDistances": distances,
        "zeroErrorUpperN75": round(one_sided_upper(75), 9),
        "zeroErrorUpperN300": round(one_sided_upper(300), 9),
        "zeroErrorUpperN306": round(one_sided_upper(306), 9),
        "minimumNAtOnePercent": minimum,
        "revisedTotal": 1530,
    },
    "independenceBoundary": "This audit derives the evidence-layer ablation matrix, response distances, and exact zero-error binomial denominator without importing or executing the JavaScript verifier. It contains no hardware data or security-performance evidence.",
    "conclusion": "The 600-unit design supports only a pooled adversarial bound. The 1,530-unit revision supports a pooled bound within each claimed class under independent sampling, while A12 remains unidentifiable."
}

if not audit["passed"]:
    raise SystemExit(json.dumps(audit, indent=2))

target = ROOT / "research/reproducibility/chiplet-attestation-python-audit.json"
if "--emit" in __import__("sys").argv:
    print(json.dumps(audit, indent=2))
else:
    expected = json.loads(target.read_text(encoding="utf-8"))
    if audit != expected:
        raise SystemExit("RC29 independent audit differs from committed artifact")
    print("RC29 independent Python audit passed: ablations, response regions, and exact sample denominators reproduced independently.")
