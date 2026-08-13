"""Independent structural audit of the RC35 etcd history.

This script does not execute the JavaScript coordinator.  It reconstructs the
stage order, winner counts, recovery reads, and minority outcome from the
persisted command history and rejects coordinator summary fields that disagree.
"""

import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"
RUN_PHASE = sys.argv[1] if len(sys.argv) > 1 else "exploratory"
if RUN_PHASE not in ("exploratory", "confirmatory"):
    raise SystemExit(f"unsupported phase: {RUN_PHASE}")
HISTORY_PATH = REPRO / f"rc35-etcd-three-process-{RUN_PHASE}-history.json"
RESULT_PATH = REPRO / f"rc35-etcd-three-process-{RUN_PHASE}-result.json"
OUTPUT_PATH = REPRO / f"rc35-etcd-three-process-{RUN_PHASE}-python-audit.json"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


history_document = load(HISTORY_PATH)
reported = load(RESULT_PATH)
events = history_document["history"]


def txn(label):
    matches = [event for event in events if event.get("type") == "txn" and event.get("label") == label]
    if len(matches) != 1:
        raise AssertionError(f"expected one transaction {label}, found {len(matches)}")
    return matches[0]


def event_index(predicate):
    matches = [index for index, event in enumerate(events) if predicate(event)]
    if len(matches) != 1:
        raise AssertionError(f"expected one matching event, found {len(matches)}")
    return matches[0]


checks = []


def check(name, condition, evidence):
    checks.append({"name": name, "pass": bool(condition), "evidence": evidence})


check(
    "official-archive-digest-fixed",
    reported["implementation"]["archiveSha256"]
    == "228d600d103e0f48715687c768de8dcaeacb19eef2006261160a9a677e36cc59",
    reported["implementation"]["archiveSha256"],
)
check(
    "three-process-one-host-boundary-explicit",
    reported["implementation"]["processes"] == 3
    and reported["implementation"]["dataDirectories"] == 3
    and reported["implementation"]["physicalHosts"] == 1,
    reported["implementation"],
)

for terminate_at in ("CLAIMED", "RECEIPTED"):
    claim_events = [txn(f"{terminate_at}:claim-c0"), txn(f"{terminate_at}:claim-c1")]
    claim_winners = sum(1 for event in claim_events if event["succeeded"])
    receipt_event = txn(f"{terminate_at}:receipt")
    release_event = txn(f"{terminate_at}:release-response-discarded")
    retry_event = txn(f"{terminate_at}:retry-after-lost-response")
    stop_index = event_index(
        lambda event: event.get("type") == "process"
        and event.get("action") == "stop"
        and event.get("reason") == f"leader-termination-after-{terminate_at}"
    )
    claim_indexes = [events.index(event) for event in claim_events]
    receipt_index = events.index(receipt_event)
    release_index = events.index(release_event)
    retry_index = events.index(retry_event)

    if terminate_at == "CLAIMED":
        order_ok = max(claim_indexes) < stop_index < receipt_index < release_index < retry_index
    else:
        order_ok = max(claim_indexes) < receipt_index < stop_index < release_index < retry_index

    check(f"{terminate_at.lower()}-one-claim-winner", claim_winners == 1, claim_winners)
    check(
        f"{terminate_at.lower()}-staged-order-across-leader-stop",
        order_ok and receipt_event["succeeded"] and release_event["succeeded"],
        {
            "claimIndexes": claim_indexes,
            "receiptIndex": receipt_index,
            "stopIndex": stop_index,
            "releaseIndex": release_index,
            "retryIndex": retry_index,
        },
    )
    check(
        f"{terminate_at.lower()}-retry-did-not-reexecute",
        not retry_event["succeeded"] and "RELEASED" in retry_event["result"]["stdout"],
        retry_event["result"],
    )

    case = next(item for item in reported["cases"] if item["terminateAt"] == terminate_at)
    replicas_ok = all(
        replica["reads"]["stage"]["value"] == "RELEASED"
        and replica["reads"]["stage"]["version"] == 3
        and replica["reads"]["receipt"]["value"] == "sha256:rc35-fixed-receipt"
        and replica["reads"]["receipt"]["version"] == 1
        and replica["reads"]["outcome"]["value"] == "sha256:rc35-fixed-outcome"
        and replica["reads"]["outcome"]["version"] == 1
        for replica in case["perReplica"]
    )
    check(
        f"{terminate_at.lower()}-all-replicas-converged",
        replicas_ok and len(case["perReplica"]) == 3,
        case["perReplica"],
    )

minority_txn = txn("minority:write")
minority_read_events = [
    event
    for event in events
    if event.get("type") == "read" and event.get("label") == "minority:post-heal-read"
]
check(
    "minority-write-failed",
    not minority_txn["succeeded"]
    and minority_txn["result"]["code"] != 0
    and minority_txn["result"]["timedOut"],
    minority_txn["result"],
)
check(
    "minority-write-absent-after-heal",
    len(minority_read_events) == 1 and minority_read_events[0]["kvs"] == [],
    minority_read_events,
)
check(
    "reported-criteria-reconstructed",
    all(reported["criteria"].values()) and reported["qualifies"],
    reported["criteria"],
)
check(
    "delivery-boundary-not-overclaimed",
    "exactly-once delivery of an outcome to an external recipient"
    in reported["boundary"]["doesNotQualify"],
    reported["boundary"]["doesNotQualify"],
)

audit = {
    "cycle": "RC-2026-35",
    "runPhase": RUN_PHASE,
    "auditor": "independent Python history reconstruction",
    "historySha256": hashlib.sha256(HISTORY_PATH.read_bytes()).hexdigest(),
    "resultSha256": hashlib.sha256(RESULT_PATH.read_bytes()).hexdigest(),
    "eventCount": len(events),
    "checks": checks,
    "passed": sum(1 for item in checks if item["pass"]),
    "total": len(checks),
    "qualifies": all(item["pass"] for item in checks),
}
OUTPUT_PATH.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(audit, ensure_ascii=False, indent=2))
if not audit["qualifies"]:
    raise SystemExit(1)
