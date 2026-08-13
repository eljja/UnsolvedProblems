import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_json(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def canonical(value):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("non-finite value")
        return str(int(value)) if value.is_integer() else json.dumps(value, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(json.dumps(key, ensure_ascii=False) + ":" + canonical(value[key]) for key in sorted(value)) + "}"
    raise TypeError(type(value))


def sha256(value):
    payload = value.encode("utf-8") if isinstance(value, str) else canonical(value).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def without(value, key):
    return {name: item for name, item in value.items() if name != key}


def main():
    protocol = read_json("research/reproducibility/role-separated-enrollment-protocol.json")
    custody = read_json("research/reproducibility/enrollment-custody-view.json")
    pseudonymizer = read_json("research/reproducibility/enrollment-pseudonymizer-view.json")
    outcome = read_json("research/reproducibility/enrollment-outcome-view.json")
    ledger = read_json("research/reproducibility/role-separated-enrollment-ledger.json")
    result = read_json("research/reproducibility/role-separated-enrollment-result.json")

    custody_by_id = {item["enrollmentId"]: item for item in custody["records"]}
    pseudo_by_id = {item["enrollmentId"]: item for item in pseudonymizer["records"]}
    outcome_by_id = {item["enrollmentId"]: item for item in outcome["records"]}
    ledger_by_id = {item["enrollmentId"]: item for item in ledger["records"]}
    ids = set(custody_by_id)
    raw_study_commitments = defaultdict(list)
    for enrollment_id in sorted(ids):
        custody_row = custody_by_id[enrollment_id]
        pseudo_row = pseudo_by_id[enrollment_id]
        ledger_row = ledger_by_id[enrollment_id]
        raw_study_commitments[(custody_row["syntheticRawPackageId"], custody_row["studyId"])].append(pseudo_row["finalPackageCommitment"])

    same_study_repeat = {}
    different_package = {}
    for study in protocol["matrix"]["studies"]:
        x = raw_study_commitments[("SYNTHETIC-PACKAGE-X", study)]
        y = raw_study_commitments[("SYNTHETIC-PACKAGE-Y", study)]
        same_study_repeat[study] = len(x) == 2 and len(set(x)) == 1
        different_package[study] = len(y) == 1 and y[0] != x[0]
    cross_study = {}
    for raw in ["SYNTHETIC-PACKAGE-X", "SYNTHETIC-PACKAGE-Y"]:
        values = [raw_study_commitments[(raw, study)][0] for study in protocol["matrix"]["studies"]]
        cross_study[raw] = len(set(values)) == len(values)

    custody_forbidden = any(any(field in row for field in ["vendorCode", "outcomeClass", "finalPackageCommitment", "scopeKeyId"]) for row in custody["records"])
    pseudonymizer_forbidden = any(any(field in row for field in ["syntheticRawPackageId", "vendorCode", "outcomeClass", "custodyObservationId"]) for row in pseudonymizer["records"])
    outcome_forbidden = any(any(field in row for field in ["syntheticRawPackageId", "studyScopedCustodyToken", "scopeKeyId", "custodyObservationId"]) for row in outcome["records"])
    custody_digests_match = all(
        ledger_by_id[enrollment_id]["custodyObservationDigest"] == sha256({
            "custodyObservationId": row["custodyObservationId"],
            "studyId": row["studyId"],
            "normalized": row["syntheticRawPackageId"].upper(),
            "observedAt": row["observedAt"],
        })
        for enrollment_id, row in custody_by_id.items()
    )
    views_bind = all(
        pseudo_by_id[enrollment_id]["studyId"] == custody_by_id[enrollment_id]["studyId"]
        and pseudo_by_id[enrollment_id]["studyScopedCustodyToken"] == custody_by_id[enrollment_id]["studyScopedCustodyToken"]
        and ledger_by_id[enrollment_id]["packageCommitment"] == pseudo_by_id[enrollment_id]["finalPackageCommitment"]
        and outcome_by_id[enrollment_id]["finalPackageCommitment"] == pseudo_by_id[enrollment_id]["finalPackageCommitment"]
        for enrollment_id in ids
    )
    duplicate_pointers = all(
        ledger_by_id[f"ENR-{letter}-2"]["duplicateOf"] == f"ENR-{letter}-1"
        and ledger_by_id[f"ENR-{letter}-1"]["duplicateOf"] is None
        and ledger_by_id[f"ENR-{letter}-3"]["duplicateOf"] is None
        for letter in ["A", "B", "C"]
    )
    single_role_separation = not custody_forbidden and not pseudonymizer_forbidden and not outcome_forbidden
    pair_collusion_can_join = all(ids == set(view) for view in [pseudo_by_id, outcome_by_id, ledger_by_id])
    generator_source = (ROOT / "scripts/run-role-separated-enrollment.mjs").read_text(encoding="utf-8")

    checks = {
        "nine_records_in_every_view": all(len(view["records"]) == 9 for view in [custody, pseudonymizer, outcome, ledger]),
        "same_unique_enrollment_ids": len(ids) == 9 and all(set(view) == ids for view in [pseudo_by_id, outcome_by_id, ledger_by_id]),
        "same_study_repeat_detected_three_of_three": all(same_study_repeat.values()),
        "different_package_separated_three_of_three": all(different_package.values()),
        "same_package_unlinked_across_three_studies": all(cross_study.values()),
        "duplicate_pointers_exact": duplicate_pointers,
        "single_role_fields_minimized": single_role_separation,
        "view_records_bind_by_commitment": views_bind,
        "custody_observation_digests_recomputed": custody_digests_match,
        "public_ledger_digest_recomputed": ledger["ledgerDigest"] == sha256(without(ledger, "ledgerDigest")),
        "generator_uses_hmac_sha256": "createHmac(\"sha256\"" in generator_source,
        "generator_keys_explicitly_synthetic": "public-synthetic" in generator_source,
        "real_privacy_not_claimed": result["qualification"]["productionPrivacy"] == "unqualified" and result["productionKeys"] == 0,
        "physical_custody_not_claimed": result["qualification"]["physicalCustody"] == "unqualified" and result["realPackages"] == 0,
        "voprf_not_claimed": result["qualification"]["voprf"] == "not-implemented",
        "two_role_collusion_remains": pair_collusion_can_join and result["qualification"]["twoRoleCollusionResistance"] == "unqualified",
        "synthetic_hypotheses_bounded": result["hypotheses"]["E1_sameStudyEqualityAndCrossStudyUnlinkability"] is True and result["hypotheses"]["E2_singleRoleFieldSeparation"] is True and result["hypotheses"]["E3_syntheticPassEstablishesRealPrivacyAndCustody"] is False,
    }
    audit = {
        "auditId": "INDEPENDENT-ROLE-SEPARATED-ENROLLMENT-AUDIT-0.7",
        "computedOn": "2026-08-14",
        "passed": all(checks.values()),
        "checks": checks,
        "recomputed": {
            "sameStudyRepeat": same_study_repeat,
            "differentPackage": different_package,
            "crossStudyUnlinkability": cross_study,
            "singleRoleSeparation": single_role_separation,
            "pairCollusionCanJoinOnEnrollmentId": pair_collusion_can_join,
        },
        "independenceBoundary": "This Python audit does not execute JavaScript or use the synthetic HMAC keys. It recomputes equality relations, field minimization, cross-view bindings, custody digests, and the public ledger digest from committed views. It cannot independently prove the generator used secret production keys, physical custody, or cryptographic privacy.",
        "conclusion": "The committed views satisfy the 3x3 synthetic equality matrix and single-role field separation. Shared enrollment IDs make two-role collusion joinable, while public demo keys and synthetic custody leave real privacy and provenance unqualified."
    }
    output = ROOT / "research/reproducibility/role-separated-enrollment-python-audit.json"
    if "--write" in sys.argv:
        output.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    elif canonical(read_json("research/reproducibility/role-separated-enrollment-python-audit.json")) != canonical(audit):
        raise SystemExit("Independent enrollment audit differs from committed artifact.")
    print(f"RC32 independent enrollment audit: {sum(checks.values())}/{len(checks)} checks passed; pair-collusion boundary preserved.")
    if not audit["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
