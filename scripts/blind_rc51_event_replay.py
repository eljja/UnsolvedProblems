#!/usr/bin/env python3
"""Blind RC51 replay. Reads only the opaque ledger and sealed contract."""

import base64
import hashlib
import json
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


ROOT = Path(__file__).resolve().parents[1]
TRACE_PATH = ROOT / "research" / "reproducibility" / "rc51-blind-event-ledger.json"
CONTRACT_PATH = ROOT / "research" / "reproducibility" / "rc51-blind-replay-contract.json"
OUTPUT_PATH = ROOT / "research" / "reproducibility" / "rc51-blind-replay-audit.json"


def stable(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256(value):
    if isinstance(value, str):
        value = value.encode()
    return hashlib.sha256(value).hexdigest()


def digest(value):
    return sha256(stable(value))


def private_key(label):
    seed = hashlib.sha256(f"RC51-PUBLIC-DEMO-KEY:{label}".encode()).digest()[:32]
    return Ed25519PrivateKey.from_private_bytes(seed)


KEYS = {label: private_key(label).public_key() for label in ["K1", "K2", "K3", "LOG-A", "LOG-B", "ISSUER"]}


def verify_object(key_id, value, signature):
    if not signature:
        return False
    try:
        KEYS[key_id].verify(base64.b64decode(signature), stable(value).encode())
        return True
    except Exception:
        return False


def transition_document(operation):
    return {
        "type": "domain-transition", "nonce": operation["nonce"],
        "successorDomain": operation["successorDomain"], "generation": operation["generation"],
        "head": operation["head"],
    }


def rotation_document(operation):
    return {
        "type": "key-rotation", "epoch": operation["epoch"],
        "predecessorKeyId": operation["predecessorKeyId"], "newKeyId": operation["newKeyId"],
    }


def compare_views(retained, incoming):
    if not verify_object(retained["signerKeyId"], retained["view"], retained["signature"]) or not verify_object(incoming["signerKeyId"], incoming["view"], incoming["signature"]):
        return "reject-view-signature", "invalid-view-signature"
    a, b = retained["view"], incoming["view"]
    if a["logId"] == b["logId"] and b["treeSize"] < a["treeSize"]:
        return "refuse-stale-view", "retained-tree-size-is-greater"
    if a["logId"] == b["logId"] and a["treeSize"] == b["treeSize"] and a["root"] != b["root"]:
        return "refuse-log-equivocation", "same-log-and-size-different-root"
    if a["issuer"] == b["issuer"] and a["subject"] == b["subject"] and a["sequence"] == b["sequence"] and a["statementDigest"] != b["statementDigest"]:
        return "refuse-issuer-equivocation", "same-issuer-subject-sequence-different-digest"
    return "accept-cross-view", "valid-nonconflicting-views"


def replay_case(case):
    state = json.loads(json.dumps(case["initialState"]))
    attempts = []
    anchor = None
    final_verdict = None
    reason = None
    for event in case["operations"]:
        kind = event["type"]
        if kind == "transition":
            operation = event["operation"]
            spent = operation["nonce"] in state["spentNonces"]
            if spent:
                current_domain = state["domain"]
                verdict = "reject-nonce-replay" if operation["successorDomain"] == current_domain else "reject-nonce-fork"
                attempts.append(verdict)
                final_verdict, reason = verdict, "retained-nonce-already-spent"
                continue
            valid = verify_object(state["keyId"], transition_document(operation), operation.get("signature"))
            monotone = operation["generation"] == state["generation"] + 1 and operation["head"]["treeSize"] > state["acceptedHead"]["treeSize"]
            if not valid:
                attempts.append("reject-transition-signature")
                final_verdict, reason = "reject-transition-signature", "invalid-current-key-signature"
            elif not monotone:
                attempts.append("reject-nonmonotone-transition")
                final_verdict, reason = "reject-nonmonotone-transition", "generation-or-tree-size-not-monotone"
            elif event["committed"]:
                state["acceptedHead"] = operation["head"]
                state["domain"] = operation["successorDomain"]
                state["generation"] = operation["generation"]
                state["spentNonces"] = sorted(state["spentNonces"] + [operation["nonce"]])
                attempts.append("accept")
                final_verdict, reason = "accept", "valid-atomic-transition"
            else:
                attempts.append("uncommitted")
                final_verdict, reason = "uncommitted", "no-commit-observed"
        elif kind == "rotation":
            operation = event["operation"]
            document = rotation_document(operation)
            if operation["epoch"] != state["keyEpoch"] + 1 or operation["predecessorKeyId"] != state["keyId"]:
                attempts.append("reject-rotation-replay")
                final_verdict, reason = "reject-rotation-replay", "rotation-is-not-exact-successor"
            elif not verify_object(state["keyId"], document, operation.get("predecessorSignature")):
                attempts.append("reject-predecessor-continuity")
                final_verdict, reason = "reject-predecessor-continuity", "missing-or-invalid-predecessor-signature"
            elif not verify_object(operation["newKeyId"], document, operation.get("newSignature")):
                attempts.append("reject-new-key-continuity")
                final_verdict, reason = "reject-new-key-continuity", "missing-or-invalid-new-key-signature"
            elif event["committed"]:
                state["keyEpoch"] = operation["epoch"]
                state["keyId"] = operation["newKeyId"]
                attempts.append("accept-rotation")
                final_verdict, reason = "accept-rotation", "dual-authorized-exact-successor"
            else:
                attempts.append("uncommitted-rotation")
                final_verdict, reason = "uncommitted-rotation", "no-rotation-commit-observed"
        elif kind == "checkpoint":
            continue
        elif kind == "anchor":
            anchor = event["checkpoint"]
        elif kind == "restore":
            state = json.loads(json.dumps(event["restoredState"]))
        elif kind == "compare-anchor":
            if state["generation"] < anchor["generation"]:
                final_verdict, reason = "refuse-backup-rollback", "primary-generation-lower-than-anchor"
            elif state["generation"] == anchor["generation"] and digest(state) != anchor["stateDigest"]:
                final_verdict, reason = "refuse-anchor-conflict", "same-generation-different-state-digest"
            else:
                final_verdict, reason = "accept-anchor-current", "primary-not-behind-anchor"
        elif kind == "compare-views":
            final_verdict, reason = compare_views(event["retained"], event["incoming"])
        else:
            raise RuntimeError(f"Unknown opaque event type: {kind}")

    if attempts[:2] == ["uncommitted", "accept"]:
        final_verdict, reason = "retry-accepted-once", "pre-commit-termination-left-old-state"
    elif attempts[:2] == ["accept", "reject-nonce-replay"] and len(attempts) == 2:
        first = case["operations"][0]
        if first.get("responseObserved") is False:
            final_verdict, reason = "retry-rejected-replay", "post-commit-response-loss-retained-nonce"
    elif attempts[:2] == ["uncommitted-rotation", "accept-rotation"]:
        final_verdict, reason = "retry-accepted-rotation", "pre-commit-termination-left-old-key-epoch"
    elif attempts[:2] == ["accept-rotation", "reject-rotation-replay"]:
        final_verdict, reason = "retry-rejected-rotation", "post-commit-response-loss-retained-key-epoch"

    if final_verdict is None:
        raise RuntimeError(f"No verdict for opaque case {case['opaqueCaseId']}")
    return {"opaqueCaseId": case["opaqueCaseId"], "verdict": final_verdict, "stateDigest": digest(state), "reasonCode": reason}


contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
trace = json.loads(TRACE_PATH.read_text(encoding="utf-8"))
if trace["contract"] != "research/reproducibility/rc51-blind-replay-contract.json":
    raise RuntimeError("Blind contract path changed")
if any("id" in case or "expected" in case or "verdict" in case for case in trace["cases"]):
    raise RuntimeError("A withheld fixture label or verdict leaked into the blind ledger")

cases = [replay_case(case) for case in trace["cases"]]
result = {
    "auditId": "RC51-BLIND-REPLAY-AUDIT-0.1",
    "cycleId": "RC-2026-51",
    "contractId": contract["contractId"],
    "inputTraceId": trace["traceId"],
    "readFiles": [
        "research/reproducibility/rc51-blind-replay-contract.json",
        "research/reproducibility/rc51-blind-event-ledger.json",
    ],
    "withheldFieldsAbsent": True,
    "fixtureLabelsRead": False,
    "expectedVerdictsRead": False,
    "generatorOutcomesRead": False,
    "cases": cases,
}
OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"RC51 blind replay: {len(cases)} opaque cases reconstructed without fixture labels or expected verdicts.")
