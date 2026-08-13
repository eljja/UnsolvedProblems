import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
load = lambda name: json.loads((ROOT / name).read_text(encoding="utf-8"))
protocol = load("research/reproducibility/intervention-pilot-protocol.json")
fixtures = load("research/reproducibility/intervention-pilot-adversarial-fixtures.json")
old_schema = load("research/reproducibility/intervention-batch-ledger.schema.json")
new_schema = load("research/reproducibility/intervention-pilot-ledger.schema.json")
result = load("research/reproducibility/intervention-pilot-ledger-audit-result.json")

counts = result["hierarchyCounts"]
fixture_by_id = {row["id"]: row for row in result["fixtureResults"]}
expected_codes = {row["id"]: row["expectedCode"] for row in fixtures["tests"] if row["expectedCode"]}
old_required = old_schema["$defs"]["batchRecord"]["required"]

checks = {
    "protocol_is_outcome_free": protocol["status"] == "dry-run-contract-fixed-before-any-physical-outcomes",
    "hierarchy_counts": counts == {"sourceLotTuples": 1, "preparationBatches": 3, "physicalSpecimens": 6, "geometryAliquots": 12, "rawAcquisitions": 24, "analysisViews": 48, "reportedIndependentN": 3},
    "technical_rows_do_not_inflate_n": counts["reportedIndependentN"] == counts["preparationBatches"] < counts["analysisViews"],
    "all_factorial_cells_are_scheduled": all(value == 4 for value in result["scheduleCoverage"].values()),
    "all_precommitted_mutations_are_detected": len(expected_codes) == 11 and all(code in fixture_by_id[test_id]["observedCodes"] and fixture_by_id[test_id]["detectedAsSpecified"] for test_id, code in expected_codes.items()),
    "valid_fixture_passes_without_outcomes": result["validFixture"]["valid"] and not result["validFixture"]["containsPhysicalOutcomes"],
    "flat_schema_requires_incompatible_semantics": all(field in old_required for field in ["dictionaryArm", "negativeEndpoint", "positiveEndpoint"]),
    "flat_schema_lacks_required_omitted_phase": "omittedPhaseId" not in old_required,
    "new_schema_separates_physical_and_analysis_levels": all(name in new_schema["$defs"] for name in ["batch", "specimen", "aliquot", "acquisition", "analysis", "endpointAdjudication"]),
    "common_lot_scope_is_conditional": result["decisions"]["H5_commonLotsQualifyUnconditionalTransport"] is False,
    "physical_readiness_and_efficacy_not_claimed": result["decisions"]["H6_physicalPilotReady"] is False and result["decisions"]["H7_sieveAndRotationEfficacyQualified"] is False,
}

audit = {
    "auditId": "INTERVENTION-PILOT-LEDGER-PYTHON-AUDIT-0.2",
    "method": "Independent Python reconstruction of committed hierarchy counts, schema semantics, and every precommitted fixture-to-error-code mapping; it does not reuse the JavaScript validator.",
    "checks": checks,
    "passed": all(checks.values()),
    "independenceBoundary": "This audit independently checks the digital contract only. It supplies no material, operator, instrument, safety, or efficacy evidence."
}
if not audit["passed"]:
    raise SystemExit(json.dumps(audit, ensure_ascii=False, indent=2))
print(json.dumps(audit, ensure_ascii=False, indent=2))
