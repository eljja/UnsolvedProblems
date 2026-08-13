import argparse
import base64
import hashlib
import hmac
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

AUDITOR_KEY = b"rc33-public-synthetic-auditor-key"


def canonical(value):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, separators=(",", ":"))
    if isinstance(value, (int, float)):
        return json.dumps(value, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    return "{" + ",".join(json.dumps(key) + ":" + canonical(value[key]) for key in sorted(value)) + "}"


def sha(value):
    if not isinstance(value, (bytes, str)):
        value = canonical(value)
    if isinstance(value, str):
        value = value.encode()
    return hashlib.sha256(value).hexdigest()


def durable_exclusive(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    try:
        os.write(descriptor, json.dumps(value, separators=(",", ":")).encode())
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--store", required=True)
    parser.add_argument("--attempts", type=int, default=1)
    parser.add_argument("--resolver", default="PYTHON-RESOLVER")
    parser.add_argument("--mode", choices=("race", "recover"), default="race")
    parser.add_argument("--start-gate")
    parser.add_argument("--response")
    parser.add_argument("--capability", required=True)
    parser.add_argument("--registry", required=True)
    parser.add_argument("--outcomes", required=True)
    args = parser.parse_args()
    store = Path(args.store).resolve()
    store.mkdir(parents=True, exist_ok=True)
    capability = json.loads(Path(args.capability).read_text(encoding="utf-8"))
    registry = json.loads(Path(args.registry).read_text(encoding="utf-8"))
    outcomes = json.loads(Path(args.outcomes).read_text(encoding="utf-8"))
    payload_part, signature = capability["token"].split(".")
    expected = hmac.new(AUDITOR_KEY, payload_part.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise SystemExit("bad MAC")
    padded = payload_part + "=" * (-len(payload_part) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded).decode())
    if payload["maximumOpenings"] != 1 or payload["disputeId"] != capability["publicClaims"]["disputeId"]:
        raise SystemExit("bad capability scope")
    bridge = next(item for item in registry["records"] if item["auditRecordId"] == payload["auditRecordId"])
    outcome = next(item for item in outcomes["records"] if item["pseudonymizerToOutcomeHandle"] == bridge["pseudonymizerToOutcomeHandle"])
    claim_path = store / "claim.json"
    receipt_path = store / "receipt.json"
    outcome_path = store / "outcome.json"

    def receipt_value(claim):
        value = {
            "receiptId": "RECEIPT-" + sha(claim["claimDigest"])[:24],
            "claimDigest": claim["claimDigest"],
            "capabilityDigest": capability["tokenDigest"],
            "auditRecordId": payload["auditRecordId"],
            "eventOutcomeBinding": outcome["eventOutcomeBinding"],
            "resolverId": args.resolver,
            "state": "receipt-durable-before-release",
        }
        return {**value, "receiptDigest": sha(value)}

    def release(claim, status, attempt):
        receipt = receipt_value(claim)
        durable_exclusive(receipt_path, receipt)
        released = {
            "receiptDigest": receipt["receiptDigest"],
            "eventOutcomeBinding": outcome["eventOutcomeBinding"],
            "vendorCode": outcome["vendorCode"],
            "outcomeClass": outcome["outcomeClass"],
            "releaseOrder": ["claim", "receipt", "outcome"],
        }
        durable_exclusive(outcome_path, released)
        return {"resolverId": args.resolver, "attempt": attempt, "status": status, "receiptDigest": receipt["receiptDigest"], "outcome": released}

    def attempt(index):
        value = {
            "capabilityDigest": capability["tokenDigest"],
            "capabilityId": payload["capabilityId"],
            "auditRecordId": payload["auditRecordId"],
            "disputeId": payload["disputeId"],
            "resolverId": args.resolver,
            "state": "claimed",
        }
        claim = {**value, "claimDigest": sha(value)}
        try:
            durable_exclusive(claim_path, claim)
        except FileExistsError:
            return {"resolverId": args.resolver, "attempt": index, "status": "replay"}
        return release(claim, "opened-one", index)

    if args.start_gate:
        while not Path(args.start_gate).exists():
            time.sleep(0.002)
    if args.mode == "recover":
        claim = json.loads(claim_path.read_text(encoding="utf-8"))
        if receipt_path.exists() or outcome_path.exists():
            responses = [{"resolverId": args.resolver, "attempt": 0, "status": "already-completed"}]
        else:
            responses = [release(claim, "recovered-opened-one", 0)]
    else:
        with ThreadPoolExecutor(max_workers=args.attempts) as executor:
            responses = list(executor.map(attempt, range(args.attempts)))
    if args.response:
        Path(args.response).write_text(json.dumps(responses, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"resolverId": args.resolver, "attempts": args.attempts, "opened": sum(item["status"] in ("opened-one", "recovered-opened-one") for item in responses), "replay": sum(item["status"] == "replay" for item in responses)}, separators=(",", ":")))


if __name__ == "__main__":
    main()
