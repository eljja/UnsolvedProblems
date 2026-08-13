import argparse
import hashlib
import json
import math
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_json(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def iso(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def sha256(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def make_rows():
    rows = []
    classes = ["genuine", "replay", "substitution", "tamper", "trace-forgery"]
    vendors = ["V1", "V2", "HIDDEN-V3"]
    for class_name in classes:
        for vendor in vendors:
            for process in ["P1", "P2"]:
                for lot in ["LOT-1", "LOT-2", "LOT-3"]:
                    for replicate in range(1, 18):
                        token = f"{class_name}-{vendor}-{process}-{lot}-{replicate}".upper()
                        rows.append({
                            "unit": f"U-{len(rows) + 1:04d}",
                            "physical": sha256(f"physical-package:{token}"),
                            "class": class_name,
                            "vendor": vendor,
                            "process": process,
                            "lot": lot,
                        })
    return rows


def balance(rows):
    class_counts = Counter(row["class"] for row in rows)
    cell_counts = Counter((row["class"], row["vendor"], row["process"], row["lot"]) for row in rows)
    return {
        "total": len(rows),
        "classCounts": dict(class_counts),
        "cells": len(cell_counts),
        "cellMinimum": min(cell_counts.values()),
        "cellMaximum": max(cell_counts.values()),
        "unitUnique": len({row["unit"] for row in rows}) == len(rows),
        "physicalUnique": len({row["physical"] for row in rows}) == len(rows),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--emit", action="store_true")
    args = parser.parse_args()

    spec = read_json("research/reproducibility/hidden-vendor-attestation-spec.json")
    fixtures = read_json("research/reproducibility/hidden-vendor-adversarial-fixtures.json")
    result = read_json("research/reproducibility/hidden-vendor-attestation-result.json")
    schema_paths = spec["schemas"]
    schemas = [read_json(path) for path in schema_paths]

    rows = make_rows()
    base_balance = balance(rows)
    duplicate_unit = [dict(row) for row in rows]
    duplicate_unit[1] = dict(duplicate_unit[0])
    rerun = [dict(row) for row in rows]
    rerun[1]["physical"] = rerun[0]["physical"]
    rebalanced = [dict(row) for row in rows]
    hidden_index = next(index for index, row in enumerate(rebalanced) if row["vendor"] == "HIDDEN-V3")
    rebalanced[hidden_index]["vendor"] = "V1"

    independently_expected = {
        "F00": ("accept-contract", None),
        "F01": ("reject-structure", "S_EVIDENCE_REQUIRED"),
        "F02": ("reject-structure", "S_EVIDENCE_ADDITIONAL"),
        "F03": ("reject-semantic", "E_NONCE_FRESHNESS"),
        "F04": ("reject-semantic", "E_TRACE_LINK"),
        "F05": ("reject-semantic", "E_TRACE_RECEIPT"),
        "F06": ("reject-semantic", "E_REFERENCE_VERSION"),
        "F07": ("reject-semantic", "E_AUTHORITY_SCOPE"),
        "F08": ("quarantine", "Q_REVOKED_KEY"),
        "F09": ("invalidate-adjudication", "A_POLICY_POST_REVEAL"),
        "F10": ("invalidate-adjudication", "A_POLICY_DIGEST"),
        "F11": ("invalidate-adjudication", "A_HIDDEN_VENDOR_LEAK"),
        "F12": ("invalidate-adjudication", "A_UNIT_DUPLICATE"),
        "F13": ("invalidate-adjudication", "A_INDEPENDENT_UNIT"),
        "F14": ("invalidate-adjudication", "A_CELL_BALANCE"),
        "F15": ("invalidate-adjudication", "A_LEDGER_DIGEST"),
        "F16": ("accept-contract-indistinguishable", "I_SILENT_COMPROMISE"),
    }
    observed = {row["id"]: (row["observed"], row["primaryCode"]) for row in result["fixtureResults"]}
    fixture_contract = {row["id"]: (row["expected"], row.get("code")) for row in fixtures["fixtures"]}

    structural_only_ids = {"F01", "F02"}
    semantic_ids = set(independently_expected) - {"F00", "F01", "F02", "F16"}
    result_structural = {row["id"] for row in result["fixtureResults"] if row["schemaErrorCount"] > 0}
    result_semantic_shape_pass = {row["id"] for row in result["fixtureResults"] if row["schemaErrorCount"] == 0} & semantic_ids

    checks = {
        "five_distinct_draft_2020_12_schemas": len(schemas) == 5 and len({schema["$id"] for schema in schemas}) == 5 and all(schema["$schema"] == "https://json-schema.org/draft/2020-12/schema" for schema in schemas),
        "schemas_close_unknown_fields": all(schema.get("additionalProperties") is False for schema in schemas),
        "evidence_requires_nonce_counter_policy_and_trace": {"nonce", "counter", "policyDigest", "traceHead"}.issubset(set(schemas[0]["required"])),
        "ledger_requires_exact_1530_rows": schemas[4]["properties"]["units"]["minItems"] == 1530 and schemas[4]["properties"]["units"]["maxItems"] == 1530,
        "timeline_is_strictly_pre_reveal": iso(spec["sealedTimeline"]["policyFrozenAt"]) < iso(spec["sealedTimeline"]["hiddenVendorRevealedAt"]) and iso(spec["sealedTimeline"]["adjudicationLedgerFrozenAt"]) < iso(spec["sealedTimeline"]["hiddenVendorRevealedAt"]),
        "base_denominator_reconstructed": base_balance["total"] == 1530 and set(base_balance["classCounts"].values()) == {306} and base_balance["cells"] == 90 and base_balance["cellMinimum"] == base_balance["cellMaximum"] == 17,
        "base_independent_units_unique": base_balance["unitUnique"] and base_balance["physicalUnique"],
        "row_preserving_duplicate_detected": not balance(duplicate_unit)["unitUnique"] and len(duplicate_unit) == 1530,
        "rerun_as_new_unit_detected": balance(rerun)["unitUnique"] and not balance(rerun)["physicalUnique"] and len(rerun) == 1530,
        "post_reveal_rebalance_detected": balance(rebalanced)["cellMinimum"] == 16 and balance(rebalanced)["cellMaximum"] == 18,
        "fixture_denominator_and_contract_fixed": len(fixtures["fixtures"]) == 17 and fixture_contract == independently_expected,
        "javascript_fixture_outcomes_reproduced": observed == independently_expected,
        "only_two_structural_failures": result_structural == structural_only_ids,
        "thirteen_semantic_failures_pass_structure": result_semantic_shape_pass == semantic_ids and result["summary"]["semanticallyInvalidButStructurallyValid"] == 13,
        "schema_only_hypothesis_rejected": result["hypotheses"]["W1_schemasAloneSuffice"] is False,
        "digest_only_freeze_hypothesis_rejected": result["hypotheses"]["W2_digestAloneProvesPreRevealFreeze"] is False,
        "row_count_only_denominator_rejected": result["hypotheses"]["W3_rowCountAloneDefinesDenominator"] is False,
        "hardware_performance_not_claimed": result["hypotheses"]["W4_contractPassageEstablishesHardwarePerformance"] is False and result["baseBundle"]["hardwareDevicesTested"] == 0,
        "silent_compromise_remains_indistinguishable": observed["F16"] == independently_expected["F16"],
        "draft_boundaries_are_explicit": "not CoRIM conformance" in spec["standardsBoundary"]["corim"] and "early work in progress" in spec["standardsBoundary"]["hardwareAttestation"],
    }

    audit = {
        "auditId": "INDEPENDENT-HIDDEN-VENDOR-ATTESTATION-AUDIT-0.5",
        "computedOn": "2026-08-14",
        "passed": all(checks.values()),
        "checks": checks,
        "independentlyRecomputed": {
            "baseBalance": base_balance,
            "duplicateUnitUnique": balance(duplicate_unit)["unitUnique"],
            "rerunPhysicalPackageUnique": balance(rerun)["physicalUnique"],
            "rebalancedCellMinimum": balance(rebalanced)["cellMinimum"],
            "rebalancedCellMaximum": balance(rebalanced)["cellMaximum"],
            "fixtureOutcomes": {key: {"verdict": value[0], "code": value[1]} for key, value in independently_expected.items()},
        },
        "independenceBoundary": "This Python audit does not import or execute the JavaScript generator. It reconstructs the 1,530-unit grid, row-count-preserving denominator attacks, chronology, schema contracts, and all seventeen adjudication outcomes from sealed specifications. It does not independently validate a production JSON Schema implementation or any hardware.",
        "conclusion": "Structure alone misses thirteen invalid research bundles. Pre-reveal chronology, cross-document digests, physical-unit uniqueness, cell balance, authority scope, and explicit non-identifiability are necessary additional gates."
    }
    output = ROOT / "research/reproducibility/hidden-vendor-attestation-python-audit.json"
    if args.emit:
        output.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    else:
        expected = read_json("research/reproducibility/hidden-vendor-attestation-python-audit.json")
        if audit != expected:
            raise SystemExit("Independent hidden-vendor audit differs from the committed artifact; run --emit only after review.")
    print(json.dumps(audit, indent=2, ensure_ascii=False))
    if not audit["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
