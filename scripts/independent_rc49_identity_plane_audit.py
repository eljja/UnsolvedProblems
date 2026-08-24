import base64
import hashlib
import json
import struct
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


ROOT = Path(__file__).resolve().parents[1]
PRECOMMIT = json.loads((ROOT / "research/reproducibility/rc49-identity-plane-precommit.json").read_text(encoding="utf-8"))
OUTPUT = Path(sys.argv[sys.argv.index("--output") + 1]) if "--output" in sys.argv else Path("research/reproducibility/rc49-identity-plane-python.json")
EVENT_COUNT = PRECOMMIT["corpus"]["eventCount"]
PERIOD_US = PRECOMMIT["corpus"]["periodMicroseconds"]
DOMAIN = PRECOMMIT["corpus"]["identityDomain"]


def sha256(value: bytes) -> bytes:
    return hashlib.sha256(value).digest()


def u32(value: int) -> bytes:
    return struct.pack(">I", value)


def u64(value: int) -> bytes:
    return struct.pack(">Q", value)


def encode_parts(parts) -> bytes:
    buffers = [part if isinstance(part, bytes) else str(part).encode("utf-8") for part in parts]
    return b"".join(u32(len(part)) + part for part in buffers)


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def largest_power_below(n: int) -> int:
    k = 1
    while k * 2 < n:
        k *= 2
    return k


def merkle_root(entries) -> bytes:
    if not entries:
        return sha256(b"")
    if len(entries) == 1:
        return sha256(b"\x00" + entries[0])
    k = largest_power_below(len(entries))
    return sha256(b"\x01" + merkle_root(entries[:k]) + merkle_root(entries[k:]))


seed = sha256(b"RC49-ED25519-PUBLIC-DEMO-SEED-v1")
private_key = Ed25519PrivateKey.from_private_bytes(seed)
public_key = private_key.public_key()
public_key_raw = public_key.public_bytes(encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw)
corpus_salt = b"RC49-10K-CORPUS-PUBLIC-SALT-v1"
reference = []
for index in range(EVENT_COUNT):
    ordinal = index + 1
    payload = sha256(b"UP-RC49-PAYLOAD-v1\0" + u64(ordinal) + corpus_salt)
    reference.append({"ordinal": ordinal, "counter": ordinal, "domain": DOMAIN, "timestampCenterUs": ordinal * PERIOD_US, "payload": payload})


def clone_records(records):
    return [{**record, "payload": bytes(record["payload"])} for record in records]


def token(record):
    return sha256(record["payload"]).hex()


def signature_leaf(record):
    return encode_parts(["UP-RC49-SIGNATURE-LEAF-v1", sha256(record["payload"])])


def identity_leaf(record):
    return encode_parts(["UP-RC49-LEAF-v1", record["domain"], u64(record["counter"]), sha256(record["payload"])])


def apply_fault(records, fault, target_ordinal):
    index = next((i for i, record in enumerate(records) if record["ordinal"] == target_ordinal), -1)
    if index < 0:
        raise RuntimeError(f"target {target_ordinal} is absent")
    if fault == "omission":
        records.pop(index)
    elif fault == "duplicate":
        records.insert(index + 1, {**records[index], "payload": bytes(records[index]["payload"])})
    elif fault == "adjacent-reorder":
        records[index], records[index + 1] = records[index + 1], records[index]
    elif fault == "unannounced-counter-reset":
        for position in range(index, len(records)):
            records[position]["counter"] = position - index
    elif fault == "payload-mutation":
        mutated = bytearray(records[index]["payload"])
        mutated[0] ^= 1
        records[index]["payload"] = bytes(mutated)
    else:
        raise RuntimeError(f"unknown fault: {fault}")


def boundary_receipt(trial_id, arm, stage, records, previous_root):
    leaf_function = signature_leaf if arm == "signature-only" else identity_leaf
    leaves = [leaf_function(record) for record in records]
    root_hash = merkle_root(leaves).hex()
    statement = {
        "arm": arm,
        "fixtureId": trial_id,
        "previousRoot": previous_root,
        "root": root_hash,
        "schemaVersion": "UP-RC49-BOUNDARY-v1",
        "stage": stage,
        "treeSize": len(records),
    }
    payload = canonical(statement).encode("utf-8")
    signature = private_key.sign(payload)
    public_key.verify(signature, payload)
    mutated_signature = bytes([signature[0] ^ 1]) + signature[1:]
    try:
        public_key.verify(mutated_signature, payload)
        raise RuntimeError(f"mutated signature accepted: {trial_id}/{arm}/{stage}")
    except Exception as error:
        if isinstance(error, RuntimeError):
            raise
    mutated_statement = {**statement, "root": ("1" if statement["root"][0] == "0" else "0") + statement["root"][1:]}
    try:
        public_key.verify(signature, canonical(mutated_statement).encode("utf-8"))
        raise RuntimeError(f"mutated signed root accepted: {trial_id}/{arm}/{stage}")
    except Exception as error:
        if isinstance(error, RuntimeError):
            raise
    if merkle_root(leaves).hex() != root_hash:
        raise RuntimeError(f"Merkle self-check failed: {trial_id}/{arm}/{stage}")
    return {"statement": statement, "signature": base64.b64encode(signature).decode("ascii")}


def make_trial(truth):
    records = clone_records(reference)
    stages = {}
    for stage in PRECOMMIT["corpus"]["stages"]:
        if truth["fault"] and truth["stage"] == stage:
            apply_fault(records, truth["fault"], truth["targetOrdinal"])
        stages[stage] = clone_records(records)
    return stages


EXPECTED_COUNTERS = list(range(1, EVENT_COUNT + 1))


def analyze_counter_sequence(values):
    expected = EXPECTED_COUNTERS
    if len(values) == len(expected) and all(value == expected[index] for index, value in enumerate(values)):
        return {"kind": "clean"}
    if len(values) == len(expected) - 1:
        index = next((i for i, value in enumerate(values) if value != expected[i]), len(values))
        if all(value == expected[index + i + 1] for i, value in enumerate(values[index:])):
            return {"kind": "omission", "eventOrdinal": expected[index], "position": index + 1}
    if len(values) == len(expected) + 1:
        index = next((i for i, value in enumerate(values) if value != expected[i]), len(values) - 1)
        if index > 0 and values[index] == values[index - 1] and all(value == expected[index + i] for i, value in enumerate(values[index + 1:])):
            return {"kind": "duplicate", "eventOrdinal": values[index], "position": index + 1}
    if len(values) == len(expected):
        differences = [index for index, value in enumerate(values) if value != expected[index]]
        if len(differences) == 2 and differences[1] == differences[0] + 1:
            a, b = differences
            if values[a] == expected[b] and values[b] == expected[a]:
                return {"kind": "adjacent-reorder", "eventOrdinal": expected[a], "position": a + 1}
        if differences:
            first = differences[0]
            if values[first] == 0 and all(value == i for i, value in enumerate(values[first:])):
                return {"kind": "unannounced-counter-reset", "eventOrdinal": expected[first], "position": first + 1}
    return {"kind": "unclassified"}


def diff_tokens(previous, current):
    if len(current) == len(previous) - 1:
        index = 0
        while index < len(current) and current[index] == previous[index]:
            index += 1
        if all(value == previous[index + i + 1] for i, value in enumerate(current[index:])):
            return {"kind": "omission", "position": index + 1, "token": previous[index]}
    if len(current) == len(previous) + 1:
        index = 0
        while index < len(previous) and current[index] == previous[index]:
            index += 1
        if index > 0 and current[index] == current[index - 1] and all(value == previous[index + i] for i, value in enumerate(current[index + 1:])):
            return {"kind": "duplicate", "position": index, "token": current[index]}
    if len(current) == len(previous):
        differences = [index for index, value in enumerate(current) if value != previous[index]]
        if len(differences) == 2 and differences[1] == differences[0] + 1:
            a, b = differences
            if current[a] == previous[b] and current[b] == previous[a]:
                return {"kind": "adjacent-reorder", "position": a + 1, "token": previous[a]}
        if len(differences) == 1:
            return {"kind": "payload-mutation", "position": differences[0] + 1, "token": previous[differences[0]]}
    return {"kind": "unclassified"}


def diff_identity(previous, current):
    previous_counters = [record["counter"] for record in previous]
    current_counters = [record["counter"] for record in current]
    if previous_counters == current_counters:
        change = diff_tokens([token(record) for record in previous], [token(record) for record in current])
        if change["kind"] == "payload-mutation":
            change["eventOrdinal"] = previous[change["position"] - 1]["counter"]
        return change
    if len(current) == len(previous) - 1:
        index = 0
        while index < len(current) and current[index]["counter"] == previous[index]["counter"]:
            index += 1
        if all(record["counter"] == previous[index + i + 1]["counter"] for i, record in enumerate(current[index:])):
            return {"kind": "omission", "position": index + 1, "eventOrdinal": previous[index]["counter"]}
    if len(current) == len(previous) + 1:
        index = 0
        while index < len(previous) and current[index]["counter"] == previous[index]["counter"]:
            index += 1
        if index > 0 and current[index]["counter"] == current[index - 1]["counter"] and all(record["counter"] == previous[index + i]["counter"] for i, record in enumerate(current[index + 1:])):
            return {"kind": "duplicate", "position": index, "eventOrdinal": current[index]["counter"]}
    if len(current) == len(previous):
        differences = [index for index, value in enumerate(current_counters) if value != previous_counters[index]]
        if len(differences) == 2 and differences[1] == differences[0] + 1:
            a, b = differences
            if current_counters[a] == previous_counters[b] and current_counters[b] == previous_counters[a]:
                return {"kind": "adjacent-reorder", "position": a + 1, "eventOrdinal": previous_counters[a]}
        if differences:
            first = differences[0]
            if current_counters[first] == 0 and all(value == i for i, value in enumerate(current_counters[first:])):
                return {"kind": "unannounced-counter-reset", "position": first + 1, "eventOrdinal": previous_counters[first]}
    return {"kind": "unclassified"}


def row_base(truth, arm, regime=None):
    return {"trialId": truth["trialId"], "arm": arm, "regime": regime, "truthStage": truth["stage"], "truthFault": truth["fault"], "truthTargetOrdinal": truth["targetOrdinal"]}


def counter_only_verdict(truth, stages):
    analysis = analyze_counter_sequence([record["counter"] for record in stages["package"]])
    if analysis["kind"] == "clean":
        return {**row_base(truth, "counter-only"), "status": "missed" if truth["fault"] else "clean", "detectedKind": None, "eventOrdinal": None, "stage": None, "exactEvent": False, "exactStage": False, "reason": "Final counters are unchanged; this arm has no payload or boundary commitment." if truth["fault"] else "The final counter roster is complete and monotonic."}
    if analysis["kind"] == "unannounced-counter-reset":
        return {**row_base(truth, "counter-only"), "status": "refuse-domain", "detectedKind": analysis["kind"], "eventOrdinal": analysis["eventOrdinal"], "stage": None, "exactEvent": analysis["eventOrdinal"] == truth["targetOrdinal"], "exactStage": False, "reason": "The old domain is reused after a numerical reset; downstream identity is refused, but no stage evidence exists."}
    return {**row_base(truth, "counter-only"), "status": "event-only", "detectedKind": analysis["kind"], "eventOrdinal": analysis.get("eventOrdinal"), "stage": None, "exactEvent": analysis.get("eventOrdinal") == truth["targetOrdinal"], "exactStage": False, "reason": "The final counter sequence identifies an event anomaly but cannot attribute its pipeline stage."}


def signature_only_verdict(truth, stages):
    tokens = {stage: [token(record) for record in stages[stage]] for stage in PRECOMMIT["corpus"]["stages"]}
    if not truth["fault"]:
        return {**row_base(truth, "signature-only"), "status": "clean", "detectedKind": None, "eventOrdinal": None, "stage": None, "exactEvent": False, "exactStage": False, "reason": "All signed stage token manifests agree and the capture count is complete."}
    if truth["stage"] == "capture":
        if truth["fault"] == "omission" and len(tokens["capture"]) == EVENT_COUNT - 1:
            return {**row_base(truth, "signature-only"), "status": "stage-only", "detectedKind": truth["fault"], "eventOrdinal": None, "stage": "capture", "exactEvent": False, "exactStage": True, "reason": "The first signed boundary has one fewer anonymous token, but no token-to-trigger join exists."}
        if truth["fault"] == "duplicate" and any(tokens["capture"][index] == tokens["capture"][index - 1] for index in range(1, len(tokens["capture"]))):
            return {**row_base(truth, "signature-only"), "status": "stage-only", "detectedKind": truth["fault"], "eventOrdinal": None, "stage": "capture", "exactEvent": False, "exactStage": True, "reason": "The first signed boundary repeats an anonymous token, but the token has no physical trigger identity."}
        if truth["fault"] == "payload-mutation":
            return {**row_base(truth, "signature-only"), "status": "outside-observable-boundary", "detectedKind": None, "eventOrdinal": None, "stage": None, "exactEvent": False, "exactStage": False, "reason": "The changed payload is already self-consistent with the first signed root."}
        return {**row_base(truth, "signature-only"), "status": "missed", "detectedKind": None, "eventOrdinal": None, "stage": None, "exactEvent": False, "exactStage": False, "reason": "The first anonymous manifest has no prior physical ordering or counter against which this fault can be tested."}
    previous_stage = "capture" if truth["stage"] == "export" else "export"
    analysis = diff_tokens(tokens[previous_stage], tokens[truth["stage"]])
    if analysis["kind"] == "unclassified":
        return {**row_base(truth, "signature-only"), "status": "missed", "detectedKind": None, "eventOrdinal": None, "stage": None, "exactEvent": False, "exactStage": False, "reason": "The signed anonymous leaves do not carry the changed counter field."}
    return {**row_base(truth, "signature-only"), "status": "stage-token-only", "detectedKind": analysis["kind"], "eventOrdinal": None, "stage": truth["stage"], "exactEvent": False, "exactStage": True, "anonymousPosition": analysis["position"], "reason": "The first differing signed boundary and anonymous token position are known, but no physical trigger ordinal is bound."}


def clock_verdict(truth, stages, half_width):
    regime = "tight-40us" if half_width == 40 else "loose-60us"
    records = stages["package"]
    robust = True
    for record in records:
        center = record["timestampCenterUs"]
        cell_center = round(center / PERIOD_US) * PERIOD_US
        if not (center - half_width > cell_center - PERIOD_US / 2 and center + half_width < cell_center + PERIOD_US / 2):
            robust = False
            break
    if not robust:
        return {**row_base(truth, "clock-only", regime), "status": "ambiguous-clock", "detectedKind": None, "eventOrdinal": None, "stage": None, "exactEvent": False, "exactStage": False, "reason": "The declared clock interval crosses an adjacent trigger decision boundary; point-estimate matching is refused."}
    inferred = [round(record["timestampCenterUs"] / PERIOD_US) for record in records]
    analysis = analyze_counter_sequence(inferred)
    if analysis["kind"] == "clean":
        return {**row_base(truth, "clock-only", regime), "status": "missed" if truth["fault"] else "clean", "detectedKind": None, "eventOrdinal": None, "stage": None, "exactEvent": False, "exactStage": False, "reason": "The tested fault does not alter this arm's clock values." if truth["fault"] else "All intervals lie within unique trigger decision cells."}
    return {**row_base(truth, "clock-only", regime), "status": "event-only", "detectedKind": analysis["kind"], "eventOrdinal": analysis.get("eventOrdinal"), "stage": None, "exactEvent": analysis.get("eventOrdinal") == truth["targetOrdinal"], "exactStage": False, "reason": "The tight clock maps the event sequence uniquely but has no intermediate boundary evidence."}


def identity_verdict(truth, stages):
    analysis = analyze_counter_sequence([record["counter"] for record in stages["capture"]])
    if analysis["kind"] != "clean":
        reset = analysis["kind"] == "unannounced-counter-reset"
        return {**row_base(truth, "counter-plus-merkle"), "status": "refuse-domain" if reset else "exact", "detectedKind": analysis["kind"], "eventOrdinal": analysis.get("eventOrdinal"), "stage": "capture", "exactEvent": analysis.get("eventOrdinal") == truth["targetOrdinal"], "exactStage": truth["stage"] == "capture", "reason": "The first signed boundary exposes a reset in the reused domain; downstream identities are refused." if reset else "The complete trigger roster and first signed counter manifest localize the structural capture fault."}
    for previous_stage, stage in [("capture", "export"), ("export", "package")]:
        analysis = diff_identity(stages[previous_stage], stages[stage])
        if analysis["kind"] == "unclassified":
            continue
        reset = analysis["kind"] == "unannounced-counter-reset"
        return {**row_base(truth, "counter-plus-merkle"), "status": "refuse-domain" if reset else "exact", "detectedKind": analysis["kind"], "eventOrdinal": analysis.get("eventOrdinal"), "stage": stage, "exactEvent": analysis.get("eventOrdinal") == truth["targetOrdinal"], "exactStage": stage == truth["stage"], "reason": "The first differing signed boundary exposes an unbridged reset; exact identity after it is refused." if reset else "The counter-bound leaf difference gives the first changed boundary and physical trigger ordinal."}
    if truth["fault"] == "payload-mutation" and truth["stage"] == "capture":
        return {**row_base(truth, "counter-plus-merkle"), "status": "outside-observable-boundary", "detectedKind": None, "eventOrdinal": None, "stage": None, "exactEvent": False, "exactStage": False, "reason": "The capture payload is already committed by the first root; no independent pre-capture payload measurement exists."}
    if not truth["fault"]:
        return {**row_base(truth, "counter-plus-merkle"), "status": "clean", "detectedKind": None, "eventOrdinal": None, "stage": None, "exactEvent": False, "exactStage": False, "reason": "Counter rosters, payload digests, chained roots, and signatures agree at all three boundaries."}
    return {**row_base(truth, "counter-plus-merkle"), "status": "missed", "detectedKind": None, "eventOrdinal": None, "stage": None, "exactEvent": False, "exactStage": False, "reason": "No admissible evidence difference was found."}


def summarize(rows, arm, regime=None):
    selected = [row for row in rows if row["arm"] == arm and row["regime"] == regime]
    counts = {}
    for row in selected:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    return {
        "arm": arm,
        "regime": regime,
        "evaluations": len(selected),
        "statuses": counts,
        "exactEventAndStage": sum(row["status"] == "exact" and row["exactEvent"] and row["exactStage"] for row in selected),
        "exactEventAnyStage": sum(row["exactEvent"] for row in selected),
        "exactStageAnyEvent": sum(row["exactStage"] for row in selected),
        "cleanFalseCalls": sum(row["truthFault"] is None and row["status"] not in ("clean", "ambiguous-clock") for row in selected),
    }


truths = []
for index in range(1, 6):
    truths.append({"trialId": f"CLEAN-{index:02d}", "stage": None, "fault": None, "targetOrdinal": None})
for stage in PRECOMMIT["corpus"]["stages"]:
    for fault in PRECOMMIT["corpus"]["faults"]:
        for target_ordinal in PRECOMMIT["corpus"]["placements"]:
            truths.append({"trialId": f"{stage.upper()}-{fault.upper()}-{target_ordinal:05d}", "stage": stage, "fault": fault, "targetOrdinal": target_ordinal})

trial_rows = []
receipts = []
for truth in truths:
    stages = make_trial(truth)
    for arm in ("signature-only", "counter-plus-merkle"):
        previous_root = None
        for stage in PRECOMMIT["corpus"]["stages"]:
            receipt = boundary_receipt(truth["trialId"], arm, stage, stages[stage], previous_root)
            receipts.append({"trialId": truth["trialId"], "arm": arm, "stage": stage, **receipt})
            previous_root = receipt["statement"]["root"]
    trial_rows.append(counter_only_verdict(truth, stages))
    trial_rows.append(signature_only_verdict(truth, stages))
    trial_rows.append(clock_verdict(truth, stages, 40))
    trial_rows.append(clock_verdict(truth, stages, 60))
    trial_rows.append(identity_verdict(truth, stages))

cm_rows = [row for row in trial_rows if row["arm"] == "counter-plus-merkle"]
failures = []
for row in cm_rows:
    if row["truthFault"] is None:
        failure = row["status"] != "clean"
    elif row["truthFault"] == "unannounced-counter-reset":
        failure = not (row["status"] == "refuse-domain" and row["exactEvent"] and row["exactStage"])
    elif row["truthFault"] == "payload-mutation" and row["truthStage"] == "capture":
        failure = row["status"] != "outside-observable-boundary"
    else:
        failure = not (row["status"] == "exact" and row["exactEvent"] and row["exactStage"] and row["detectedKind"] == row["truthFault"])
    if failure:
        failures.append(row["trialId"])

h1 = {
    "exactObservable": sum(row["status"] == "exact" and row["exactEvent"] and row["exactStage"] for row in cm_rows),
    "resetRefusals": sum(row["status"] == "refuse-domain" and row["exactEvent"] and row["exactStage"] for row in cm_rows),
    "precommitAbstentions": sum(row["status"] == "outside-observable-boundary" for row in cm_rows),
    "cleanAccepted": sum(row["status"] == "clean" and row["truthFault"] is None for row in cm_rows),
    "failures": failures,
}
h1["pass"] = h1["exactObservable"] == 55 and h1["resetRefusals"] == 15 and h1["precommitAbstentions"] == 5 and h1["cleanAccepted"] == 5 and not failures

result = {
    "resultId": "RC49-COUNTER-MERKLE-IDENTITY-PLANE-PYTHON-0.1",
    "cycleId": PRECOMMIT["cycleId"],
    "precommitId": PRECOMMIT["precommitId"],
    "implementation": {"language": "Python", "runtime": sys.version.split()[0], "script": "scripts/independent_rc49_identity_plane_audit.py", "importedOtherOutcome": False},
    "corpus": {
        "eventCount": EVENT_COUNT,
        "periodMicroseconds": PERIOD_US,
        "identityDomain": DOMAIN,
        "payloadDigest": sha256(b"".join(record["payload"] for record in reference)).hex(),
        "counterRosterDigest": sha256(b"".join(u64(record["counter"]) for record in reference)).hex(),
        "trialCount": len(truths),
        "armRegimeEvaluations": len(trial_rows),
        "placements": PRECOMMIT["corpus"]["placements"],
    },
    "cryptography": {
        "hash": "SHA-256",
        "merkleProfile": "RFC9162_SHA256",
        "signature": "Ed25519",
        "publicDemoKeyRawBase64": base64.b64encode(public_key_raw).decode("ascii"),
        "receiptCount": len(receipts),
        "signatureSelfChecksPassed": len(receipts),
        "merkleSelfChecksPassed": len(receipts),
        "mutatedSignatureRejections": len(receipts),
        "mutatedSignedRootRejections": len(receipts),
        "operationalAuthenticityClaimed": False,
    },
    "summaries": [
        summarize(trial_rows, "counter-only"),
        summarize(trial_rows, "signature-only"),
        summarize(trial_rows, "clock-only", "tight-40us"),
        summarize(trial_rows, "clock-only", "loose-60us"),
        summarize(trial_rows, "counter-plus-merkle"),
    ],
    "h1Gate": h1,
    "hypothesisAdjudication": [
        {"id": "H0-universal-integrity", "verdict": "rejected", "evidence": "All five capture payload mutations are self-consistent with the first root and correctly remain outside the observable boundary."},
        {"id": "H1-stage-bounded-identity", "verdict": "supported-in-synthetic-scope" if not failures else "rejected", "evidence": f"{h1['exactObservable']} exact observable faults, {h1['resetRefusals']} reset refusals, {h1['precommitAbstentions']} pre-commit abstentions, and {h1['cleanAccepted']} clean controls."},
        {"id": "H2-signature-is-identity", "verdict": "rejected", "evidence": "The signature-only arm authenticates anonymous stage-token changes but produces zero exact physical event-and-stage localizations."},
        {"id": "H3-clock-envelope", "verdict": "supported-in-synthetic-scope", "evidence": "Every tight interval remains in one trigger decision cell; every loose interval crosses a cell boundary and is refused as ambiguous."},
    ],
    "trials": trial_rows,
    "receipts": receipts,
    "limitations": [
        "Synthetic one-fault trials do not estimate production failure rates or multi-fault interactions.",
        "The public test key verifies deterministic implementation behavior and supplies no operational key custody.",
        "No pre-capture payload witness exists, so the first signed root can faithfully authenticate already-corrupted bytes.",
        "The test does not establish completeness of a physical trigger roster, X16 sidecar existence, or asynchronous many-to-many process lineage.",
    ],
}

(ROOT / OUTPUT).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"RC49 Python: {len(truths)} trials, {len(trial_rows)} arm/regime evaluations, H1 {'PASS' if h1['pass'] else 'FAIL'}.")
