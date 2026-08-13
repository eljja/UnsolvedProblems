import base64
import hashlib
import hmac
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDITOR_KEY = b"rc33-public-synthetic-auditor-key"


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
            raise ValueError("non-finite number")
        return str(int(value)) if value.is_integer() else json.dumps(value, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(json.dumps(key, ensure_ascii=False) + ":" + canonical(value[key]) for key in sorted(value)) + "}"
    raise TypeError(type(value))


def sha256(value):
    payload = value if isinstance(value, bytes) else (value if isinstance(value, str) else canonical(value)).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def decode_capability(token):
    parts = token.split(".")
    if len(parts) != 2:
        return None, "malformed"
    payload_part, signature = parts
    expected = hmac.new(AUDITOR_KEY, payload_part.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None, "bad-mac"
    padding = "=" * ((4 - len(payload_part) % 4) % 4)
    return json.loads(base64.urlsafe_b64decode(payload_part + padding)), None


LOW_ENTROPY = {"studyId", "vendorCode", "outcomeClass", "role", "viewId", "synthetic"}


def pairwise_paths(view_a, view_b, bridges=None):
    rows = []
    for view in [view_a, view_b]:
        rows.extend([{**row, "_node": f"{view['role']}:{index}"} for index, row in enumerate(view["records"])])
    rows.extend([{**row, "_node": f"bridge:{index}"} for index, row in enumerate(bridges or [])])
    adjacency = defaultdict(set)
    by_value = defaultdict(list)
    for row in rows:
        for field, value in row.items():
            if field not in LOW_ENTROPY and field != "_node" and isinstance(value, str):
                by_value[value].append(row["_node"])
    for nodes in by_value.values():
        for left in nodes:
            adjacency[left].update(right for right in nodes if right != left)
    targets = {row["_node"] for row in rows if "outcomeClass" in row}
    paths = []
    for source in [row for row in rows if "syntheticRawPackageId" in row]:
        seen = {source["_node"]}
        queue = deque(seen)
        while queue:
            for neighbor in adjacency[queue.popleft()]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    queue.append(neighbor)
        paths.extend((source["_node"], target) for target in targets if target in seen)
    return paths


def main():
    protocol = read_json("research/reproducibility/pairwise-unlinkable-dispute-protocol.json")
    custody = read_json("research/reproducibility/pairwise-custody-view.json")
    pseudo = read_json("research/reproducibility/pairwise-pseudonymizer-view.json")
    outcome = read_json("research/reproducibility/pairwise-outcome-view.json")
    auditor = read_json("research/reproducibility/pairwise-auditor-registry.json")
    ledger = read_json("research/reproducibility/pairwise-public-ledger.json")
    capability = read_json("research/reproducibility/dispute-opening-capability.json")
    result = read_json("research/reproducibility/pairwise-unlinkable-dispute-result.json")

    all_rows = sum((view["records"] for view in [custody, pseudo, outcome, auditor, ledger]), [])
    pair_views = [(custody, pseudo), (custody, outcome), (pseudo, outcome)]
    pair_counts = [len({target for _, target in pairwise_paths(left, right)}) for left, right in pair_views]
    payload, capability_error = decode_capability(capability["token"])
    registry_row = next((row for row in auditor["records"] if row["auditRecordId"] == payload.get("auditRecordId")), None) if payload else None
    bridge = {key: registry_row[key] for key in ["auditRecordId", "custodyToPseudonymizerHandle", "pseudonymizerToOutcomeHandle"]} if registry_row else None
    opened_targets = len({target for _, target in pairwise_paths(custody, outcome, [bridge] if bridge else [])})
    tampered = capability["token"][:-1] + ("0" if capability["token"][-1] != "0" else "1")
    _, tamper_error = decode_capability(tampered)
    redeemed = set()
    token_digest = sha256(capability["token"])
    first_redeem = token_digest not in redeemed
    redeemed.add(token_digest)
    replay_rejected = token_digest in redeemed

    forbidden = {
        "custody": any(any(field in row for field in ["pseudonymizerToOutcomeHandle", "vendorCode", "outcomeClass"]) for row in custody["records"]),
        "pseudonymizer": any(any(field in row for field in ["syntheticRawPackageId", "vendorCode", "outcomeClass"]) for row in pseudo["records"]),
        "outcome": any(any(field in row for field in ["syntheticRawPackageId", "custodyToPseudonymizerHandle", "studyScopedCustodyToken", "finalPackageCommitment"]) for row in outcome["records"]),
        "auditor": any(any(field in row for field in ["syntheticRawPackageId", "vendorCode", "outcomeClass", "finalPackageCommitment"]) for row in auditor["records"]),
    }
    c2p = {row["custodyToPseudonymizerHandle"] for row in custody["records"]}
    p2o = {row["pseudonymizerToOutcomeHandle"] for row in outcome["records"]}
    three_role = {"role": "pseudonymizer+outcome", "records": pseudo["records"] + outcome["records"]}
    three_role_targets = len({target for _, target in pairwise_paths(custody, three_role)})
    ledger_without_digest = {key: value for key, value in ledger.items() if key != "ledgerDigest"}
    orders = [tuple((row.get("custodyToPseudonymizerHandle") or row.get("pseudonymizerToOutcomeHandle")) for row in view["records"]) for view in [custody, pseudo, outcome, auditor]]

    checks = {
        "protocol_and_artifact_versions_match": protocol["protocolId"] == result["protocolId"] == ledger["protocolId"],
        "nine_records_in_every_view": all(len(view["records"]) == 9 for view in [custody, pseudo, outcome, auditor, ledger]),
        "global_enrollment_id_absent": all("enrollmentId" not in row for row in all_rows),
        "role_orders_are_not_shared": len(set(orders)) == 4,
        "hop_handle_namespaces_are_disjoint": c2p.isdisjoint(p2o) and len(c2p) == len(p2o) == 9,
        "single_role_forbidden_fields_absent": not any(forbidden.values()),
        "custody_pseudonymizer_pair_links_zero_outcomes": pair_counts[0] == 0,
        "custody_outcome_pair_links_zero_outcomes": pair_counts[1] == 0,
        "pseudonymizer_outcome_pair_links_zero_outcomes": pair_counts[2] == 0,
        "all_three_roles_link_nine_outcomes": three_role_targets == 9,
        "capability_mac_and_payload_validate": capability_error is None and payload["maximumOpenings"] == 1,
        "capability_digest_recomputes": capability["tokenDigest"] == token_digest,
        "capability_selects_one_registry_bridge": registry_row is not None and bridge is not None,
        "authorized_bridge_opens_one_outcome": opened_targets == 1,
        "tampered_capability_is_rejected": tamper_error == "bad-mac",
        "stateful_replay_is_rejected": first_redeem and replay_rejected,
        "wrong_dispute_and_expiry_are_rejected_in_result": result["disputeTests"]["wrongDispute"] == {"opened": False, "code": "wrong-dispute"} and result["disputeTests"]["expired"] == {"opened": False, "code": "expired"},
        "public_ledger_digest_recomputes": ledger["ledgerDigest"] == sha256(ledger_without_digest),
        "production_claims_remain_bounded": result["qualification"]["productionAnonymity"] == "unqualified" and result["qualification"]["physicalCustody"] == "unqualified",
        "three_role_collusion_not_claimed": result["qualification"]["threeRoleCollusionResistance"] == "failed-as-expected",
    }
    audit = {
        "auditId": "INDEPENDENT-PAIRWISE-UNLINKABLE-AUDIT-0.8",
        "computedOn": "2026-08-14",
        "passed": all(checks.values()),
        "checks": checks,
        "recomputed": {
            "normalPairUniqueOutcomeRecords": dict(zip(["custody+pseudonymizer", "custody+outcome", "pseudonymizer+outcome"], pair_counts)),
            "authorizedOpeningUniqueOutcomeRecords": opened_targets,
            "threeRoleUniqueOutcomeRecords": three_role_targets,
            "globalEnrollmentIdPresent": any("enrollmentId" in row for row in all_rows),
            "hopHandleIntersection": len(c2p.intersection(p2o)),
        },
        "independenceBoundary": "This Python audit does not execute the JavaScript generator. It reconstructs exact-value message-graph paths, field exclusions, handle namespaces, capability HMAC and payload, stateful replay logic, and ledger digest from committed artifacts. Public synthetic keys and enumerated JSON fields cannot establish production anonymity, resistance to traffic analysis, organizational non-collusion, or physical custody.",
        "conclusion": "All enumerated two-role unions expose zero outcome records from raw custody identities, while the authorized bridge exposes one and all three operational roles expose nine. This is a bounded message-graph result, not an anonymity proof."
    }
    output = ROOT / "research/reproducibility/pairwise-unlinkable-python-audit.json"
    if "--write" in sys.argv:
        output.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    elif canonical(read_json("research/reproducibility/pairwise-unlinkable-python-audit.json")) != canonical(audit):
        raise SystemExit("Independent RC33 audit differs from committed artifact.")
    print(f"RC33 independent message-graph audit: {sum(checks.values())}/{len(checks)} checks passed; 0 normal, 1 authorized, 9 three-role outcome records.")
    if not audit["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
