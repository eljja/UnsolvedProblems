import base64
import hashlib
import hmac
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"
AUDITOR_KEY = b"rc33-public-synthetic-auditor-key"


def read_json(name):
    return json.loads((REPRO / name).read_text(encoding="utf-8"))


def canonical(value):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, (int, float)):
        return json.dumps(value, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    return "{" + ",".join(json.dumps(key) + ":" + canonical(value[key]) for key in sorted(value)) + "}"


def sha_bytes(value):
    if isinstance(value, str):
        value = value.encode()
    return hashlib.sha256(value).hexdigest()


def record_digest(record, field):
    unsigned = {key: value for key, value in record.items() if key != field}
    return sha_bytes(canonical(unsigned)) == record[field]


def node_hash(left, right):
    return sha_bytes(b"\x01" + bytes.fromhex(left) + bytes.fromhex(right))


def main():
    capability = read_json("dispute-opening-capability.json")
    registry = read_json("pairwise-auditor-registry.json")
    outcomes = read_json("pairwise-outcome-view.json")
    evidence = read_json("rc34-resolver-race-evidence.json")
    ledger = read_json("rc34-resolver-receipt-ledger.json")
    published = read_json("rc34-resolver-race-result.json")

    payload_part, signature = capability["token"].split(".")
    expected_signature = hmac.new(AUDITOR_KEY, payload_part.encode(), hashlib.sha256).hexdigest()
    padded = payload_part + "=" * (-len(payload_part) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded).decode())
    bridge = next(item for item in registry["records"] if item["auditRecordId"] == payload["auditRecordId"])
    authorized = next(item for item in outcomes["records"] if item["pseudonymizerToOutcomeHandle"] == bridge["pseudonymizerToOutcomeHandle"])

    normal = evidence["normal"]
    crash = evidence["crashRecovery"]
    normal_statuses = [item["status"] for item in normal["responses"]]
    opened = [item for item in normal["responses"] if item["status"] == "opened-one"]
    replay = [item for item in normal["responses"] if item["status"] == "replay"]
    recovery = crash["responses"]["recovery"]

    leaf_hashes = [sha_bytes(b"\x00" + canonical(receipt).encode()) for receipt in ledger["receipts"]]
    inclusion_valid = True
    for proof in ledger["inclusionProofs"]:
        current = leaf_hashes[proof["leafIndex"]]
        for step in proof["auditPath"]:
            current = node_hash(step["hash"], current) if step["side"] == "left" else node_hash(current, step["hash"])
        inclusion_valid &= current == proof["expectedRoot"]
    consistency = ledger["consistencyProof"]

    checks = {
        "capability_token_digest_and_mac_validate": capability["tokenDigest"] == sha_bytes(capability["token"]) and hmac.compare_digest(signature, expected_signature),
        "capability_scope_is_one_named_dispute": payload["maximumOpenings"] == 1 and payload["disputeId"] == capability["publicClaims"]["disputeId"] and payload["capabilityId"] == capability["publicClaims"]["capabilityId"],
        "capability_resolves_through_auditor_bridge": normal["claim"]["auditRecordId"] == bridge["auditRecordId"] and normal["outcome"]["eventOutcomeBinding"] == authorized["eventOutcomeBinding"],
        "normal_race_has_one_open_and_ninety_nine_replays": len(normal_statuses) == 100 and len(opened) == 1 and len(replay) == 99,
        "both_runtimes_entered_normal_race": {item["resolverId"] for item in normal["responses"]} == {"NODE-RESOLVER", "PYTHON-RESOLVER"},
        "normal_claim_and_receipt_digests_recompute": record_digest(normal["claim"], "claimDigest") and record_digest(normal["receipt"], "receiptDigest"),
        "normal_receipt_binds_claim_and_authorized_outcome": normal["receipt"]["claimDigest"] == normal["claim"]["claimDigest"] and normal["receipt"]["eventOutcomeBinding"] == authorized["eventOutcomeBinding"],
        "normal_release_follows_durable_receipt": normal["outcome"]["releaseOrder"] == ["claim", "receipt", "outcome"] and normal["outcome"]["receiptDigest"] == normal["receipt"]["receiptDigest"] and opened[0]["outcome"] == normal["outcome"],
        "crash_snapshot_contains_only_claim": crash["beforeRecovery"] == {"claimExists": True, "receiptExists": False, "outcomeExists": False} and crash["responses"]["crash"][0]["status"] == "claimed-then-crashed",
        "recovery_uses_original_claim": crash["claim"]["resolverId"] == "NODE-CRASH-RESOLVER" and crash["receipt"]["resolverId"] == "PYTHON-RECOVERY-RESOLVER" and crash["receipt"]["claimDigest"] == crash["claim"]["claimDigest"],
        "recovery_opens_once_after_receipt": len(recovery) == 1 and recovery[0]["status"] == "recovered-opened-one" and crash["outcome"]["receiptDigest"] == crash["receipt"]["receiptDigest"],
        "recovery_claim_and_receipt_digests_recompute": record_digest(crash["claim"], "claimDigest") and record_digest(crash["receipt"], "receiptDigest"),
        "ledger_receipts_match_evidence": ledger["receipts"] == [normal["receipt"], crash["receipt"]] and ledger["leaves"] == leaf_hashes,
        "both_merkle_inclusion_proofs_verify": len(ledger["inclusionProofs"]) == 2 and inclusion_valid,
        "one_to_two_consistency_proof_verifies": consistency["oldRoot"] == leaf_hashes[0] and consistency["appendedSubtree"] == leaf_hashes[1] and node_hash(consistency["oldRoot"], consistency["appendedSubtree"]) == consistency["expectedNewRoot"],
        "published_summary_matches_evidence": published["normalRace"]["attempts"] == 100 and published["normalRace"]["opened"] == 1 and published["normalRace"]["replay"] == 99 and published["normalRace"]["winner"] == normal["claim"]["resolverId"] and published["transparencyLedger"]["latestRoot"] == ledger["treeHeads"][-1]["rootHash"],
    }
    result = {
        "auditId": "INDEPENDENT-RC34-RESOLVER-AUDIT-0.9",
        "computedOn": "2026-08-14",
        "passed": all(checks.values()),
        "checks": checks,
        "aggregateChecksPassed": sum(checks.values()),
        "aggregateChecksTotal": len(checks),
        "metrics": {
            "normalAttempts": len(normal_statuses),
            "normalOpened": len(opened),
            "normalReplay": len(replay),
            "crashReleasedBeforeRecovery": crash["beforeRecovery"]["receiptExists"] or crash["beforeRecovery"]["outcomeExists"],
            "receiptLeaves": len(leaf_hashes),
        },
        "boundary": "This independently written Python audit adjudicates committed synthetic evidence from two runtimes on one host and one shared filesystem. It does not establish distributed linearizability, partition tolerance, institutional independence, secret-bearing capability protection, or physical custody.",
    }
    output = REPRO / "rc34-resolver-python-audit.json"
    if "--write" in sys.argv:
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    elif read_json("rc34-resolver-python-audit.json") != result:
        raise SystemExit("RC34 resolver audit differs from committed artifact")
    print(f"RC34 independent resolver audit: {sum(checks.values())}/{len(checks)} checks; {len(opened)}/100 opened, {len(replay)} replayed, crash pre-release leakage={result['metrics']['crashReleasedBeforeRecovery']}.")
    if not result["passed"]:
        raise SystemExit("Failed checks: " + ", ".join(name for name, value in checks.items() if not value))


if __name__ == "__main__":
    main()
