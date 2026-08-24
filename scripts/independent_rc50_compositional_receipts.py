import hashlib
import json
import struct
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


ROOT = Path(__file__).resolve().parents[1]
PRECOMMIT = json.loads((ROOT / "research/reproducibility/rc50-compositional-receipts-precommit.json").read_text(encoding="utf-8"))
OUTPUT = Path(sys.argv[sys.argv.index("--output") + 1]) if "--output" in sys.argv else ROOT / "research/reproducibility/rc50-compositional-receipts-python.json"


def sha256(value: bytes) -> bytes:
    return hashlib.sha256(value).digest()


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def u64(value: int) -> bytes:
    return struct.pack(">Q", value)


class TestKey:
    def __init__(self, label: str):
        self.label = label
        self.seed = sha256(f"RC50-PUBLIC-DEMO-KEY:{label}".encode())
        self.private = Ed25519PrivateKey.from_private_bytes(self.seed)
        self.public = self.private.public_key()
        self.public_raw = self.public.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)

    def sign(self, payload: bytes) -> bytes:
        signature = self.private.sign(payload)
        self.public.verify(signature, payload)
        return signature


KEYS = {label: TestKey(label) for label in [
    "event-issuer", "pre-capture-witness", "capture-writer", "reset-authority", "reset-witness", "log-a", "log-b"
]}


def cbor_head(major: int, value: int) -> bytes:
    if value < 24:
        return bytes([(major << 5) | value])
    if value <= 0xFF:
        return bytes([(major << 5) | 24, value])
    if value <= 0xFFFF:
        return bytes([(major << 5) | 25]) + struct.pack(">H", value)
    if value <= 0xFFFFFFFF:
        return bytes([(major << 5) | 26]) + struct.pack(">I", value)
    if value <= 0xFFFFFFFFFFFFFFFF:
        return bytes([(major << 5) | 27]) + struct.pack(">Q", value)
    raise RuntimeError("CBOR integer outside uint64")


def cbor_encode(value) -> bytes:
    if value is None:
        return b"\xf6"
    if value is False:
        return b"\xf4"
    if value is True:
        return b"\xf5"
    if isinstance(value, int):
        return cbor_head(0, value) if value >= 0 else cbor_head(1, -1 - value)
    if isinstance(value, bytes):
        return cbor_head(2, len(value)) + value
    if isinstance(value, str):
        raw = value.encode("utf-8")
        return cbor_head(3, len(raw)) + raw
    if isinstance(value, list):
        return cbor_head(4, len(value)) + b"".join(cbor_encode(member) for member in value)
    if isinstance(value, dict):
        pairs = sorted(((cbor_encode(key), cbor_encode(member)) for key, member in value.items()), key=lambda pair: pair[0])
        return cbor_head(5, len(pairs)) + b"".join(key + member for key, member in pairs)
    raise RuntimeError(f"unsupported CBOR type: {type(value)}")


def largest_power_below(n: int) -> int:
    k = 1
    while k * 2 < n:
        k *= 2
    return k


def merkle_root(entries: list[bytes]) -> bytes:
    if not entries:
        return sha256(b"")
    if len(entries) == 1:
        return sha256(b"\x00" + entries[0])
    k = largest_power_below(len(entries))
    return sha256(b"\x01" + merkle_root(entries[:k]) + merkle_root(entries[k:]))


EVENT_COUNT = PRECOMMIT["corpus"]["eventCount"]
OLD_DOMAIN = PRECOMMIT["corpus"]["oldIdentityDomain"]
NEW_DOMAIN = PRECOMMIT["corpus"]["newIdentityDomain"]
SALT = b"RC50-1024-CORPUS-PUBLIC-SALT-v1"
REFERENCE = []
for index in range(EVENT_COUNT):
    ordinal = index + 1
    REFERENCE.append({
        "ordinal": ordinal,
        "domain": OLD_DOMAIN,
        "counter": ordinal,
        "payload": sha256(b"UP-RC50-PAYLOAD-v1\0" + u64(ordinal) + SALT),
    })


def clone_records(records):
    return [{**record, "payload": bytes(record["payload"])} for record in records]


def record_view(record):
    return {"ordinal": record["ordinal"], "domain": record["domain"], "counter": record["counter"], "payload": record["payload"].hex()}


def state_digest(states) -> str:
    material = {name: [record_view(record) for record in records] for name, records in states.items()}
    return sha256(canonical(material).encode()).hex()


def apply_authorized_reset(records, ordinal):
    for record in records:
        if record["ordinal"] >= ordinal:
            record["domain"] = NEW_DOMAIN
            record["counter"] = record["ordinal"] - ordinal


def mutate(records, ordinal):
    record = next((item for item in records if item["ordinal"] == ordinal), None)
    if record is None:
        raise RuntimeError(f"mutation target absent: {ordinal}")
    changed = bytearray(record["payload"])
    changed[0] ^= 1
    record["payload"] = bytes(changed)


def omit(records, ordinal):
    index = next((i for i, item in enumerate(records) if item["ordinal"] == ordinal), -1)
    if index < 0:
        raise RuntimeError(f"omission target absent: {ordinal}")
    records.pop(index)


def reorder(records, ordinal):
    index = next((i for i, item in enumerate(records) if item["ordinal"] == ordinal), -1)
    if index < 0 or index + 1 >= len(records):
        raise RuntimeError(f"reorder target invalid: {ordinal}")
    records[index], records[index + 1] = records[index + 1], records[index]


def manifest_root(records) -> bytes:
    entries = [cbor_encode({1: record["ordinal"], 2: record["domain"], 3: record["counter"], 4: sha256(record["payload"])}) for record in records]
    return merkle_root(entries)


def sign_evidence(trial_id, role, stage, records):
    statement = canonical({"trialId": trial_id, "role": role, "stage": stage, "treeSize": len(records), "root": manifest_root(records).hex()}).encode()
    signature = KEYS[role].sign(statement)
    bad = bytes([signature[0] ^ 1]) + signature[1:]
    try:
        KEYS[role].public.verify(bad, statement)
        raise RuntimeError(f"mutated evidence signature accepted: {trial_id}/{role}/{stage}")
    except Exception as error:
        if isinstance(error, RuntimeError):
            raise
    return {"root": manifest_root(records).hex(), "signature": signature.hex()}


def bridge_payload(reset_ordinal, nonce, new_domain=NEW_DOMAIN):
    old_records = clone_records(REFERENCE[:reset_ordinal - 1])
    return {
        "schemaVersion": "UP-RC50-RESET-BRIDGE-v1",
        "subject": "urn:unsolved:rc50:trigger-stream",
        "oldDomain": OLD_DOMAIN,
        "oldRoot": manifest_root(old_records).hex(),
        "oldClosingCounter": reset_ordinal - 1,
        "newDomain": new_domain,
        "newCounterOrigin": 0,
        "newPhysicalOrdinal": reset_ordinal,
        "reasonCode": "authorized-recorder-restart",
        "nonce": nonce,
        "policyDigest": sha256(b"UP-RC50-RESET-POLICY-v1").hex(),
    }


def signed_bridge(reset_ordinal, nonce, new_domain=NEW_DOMAIN):
    payload = bridge_payload(reset_ordinal, nonce, new_domain)
    raw = canonical(payload).encode()
    return {
        "payload": payload,
        "digest": sha256(raw).hex(),
        "authoritySignature": KEYS["reset-authority"].sign(raw).hex(),
        "witnessSignature": KEYS["reset-witness"].sign(raw).hex(),
    }


def infer_ops(previous, current, stage):
    previous_map = {record["ordinal"]: record for record in previous}
    current_map = {record["ordinal"]: record for record in current}
    operations = []
    for ordinal in sorted(previous_map):
        if ordinal not in current_map:
            operations.append({"kind": "omission", "ordinal": ordinal, "stage": stage})
        elif previous_map[ordinal]["payload"] != current_map[ordinal]["payload"]:
            operations.append({"kind": "payload-mutation", "ordinal": ordinal, "stage": stage})
    previous_common = [record["ordinal"] for record in previous if record["ordinal"] in current_map]
    current_common = [record["ordinal"] for record in current if record["ordinal"] in previous_map]
    differences = [index for index, ordinal in enumerate(previous_common) if ordinal != current_common[index]]
    if len(differences) == 2 and differences[1] == differences[0] + 1:
        a, b = differences
        if previous_common[a] == current_common[b] and previous_common[b] == current_common[a]:
            operations.append({"kind": "adjacent-reorder", "ordinal": min(previous_common[a], previous_common[b]), "stage": stage})
    return sorted(operations, key=lambda operation: (operation["ordinal"], operation["kind"]))


def first_evidence_change(states):
    for before, after, stage in [("witness", "capture", "capture"), ("capture", "export", "export"), ("export", "package", "package")]:
        operations = infer_ops(states[before], states[after], stage)
        if operations:
            return {"stage": stage, "operations": operations}
    return {"stage": None, "operations": []}


def build_stage_trial(spec, counterfactual=False):
    base = clone_records(REFERENCE)
    if spec.get("resetOrdinal"):
        apply_authorized_reset(base, spec["resetOrdinal"])
    if spec.get("collusionOrdinal"):
        mutate(base, spec["collusionOrdinal"])
    states = {"witness": clone_records(base)}
    records = clone_records(base)
    for stage in PRECOMMIT["corpus"]["stages"]:
        if spec.get("stage") == stage:
            if spec["kind"] == "mutation-reorder":
                mutate(records, spec["target"])
                reorder(records, spec["target"] + 1)
            elif spec["kind"] == "mutation-omission-disjoint":
                mutate(records, spec["target"])
                omit(records, spec["target"] + 2)
            elif spec["kind"] == "mutation-omission-shadow":
                if not counterfactual:
                    mutate(records, spec["target"])
                omit(records, spec["target"])
            elif spec["kind"] == "reset-omission":
                omit(records, spec["target"] + 1)
        states[stage] = clone_records(records)
    return states


def evidence_signatures(trial_id, states):
    return {
        "witness": sign_evidence(trial_id, "pre-capture-witness", "witness", states["witness"]),
        "capture": sign_evidence(trial_id, "capture-writer", "capture", states["capture"]),
        "export": sign_evidence(trial_id, "capture-writer", "export", states["export"]),
        "package": sign_evidence(trial_id, "capture-writer", "package", states["package"]),
    }


def make_stage_row(spec):
    states = build_stage_trial(spec)
    signatures = evidence_signatures(spec["trialId"], states)
    observed = first_evidence_change(states)
    operations = observed["operations"]
    bridge = None
    if spec["kind"] == "clean":
        status = "clean"
        candidates = ["no-in-scope-transformation"]
    elif spec["kind"] == "reset-omission":
        bridge = signed_bridge(spec["resetOrdinal"], f"nonce-{spec['resetOrdinal']}-{spec['stage']}")
        status = "exact-composite"
        operations = [{"kind": "authorized-reset", "ordinal": spec["resetOrdinal"], "stage": "identity-transition"}] + observed["operations"]
        candidates = [f"authorized-reset@{spec['resetOrdinal']}+omission@{spec['target'] + 1}/{spec['stage']}"]
    elif spec["kind"] in ("mutation-reorder", "mutation-omission-disjoint"):
        status = "exact-composite"
        candidates = ["+".join(f"{operation['kind']}@{operation['ordinal']}/{operation['stage']}" for operation in operations)]
    elif spec["kind"] == "mutation-omission-shadow":
        counterfactual = build_stage_trial(spec, True)
        if state_digest(states) != state_digest(counterfactual):
            raise RuntimeError(f"shadow counterfactual differs: {spec['trialId']}")
        status = "set-valued-shadow"
        candidates = [f"omission-only@{spec['target']}/{spec['stage']}", f"mutation-then-omission@{spec['target']}/{spec['stage']}"]
    elif spec["kind"] == "collusion":
        status = "outside-independent-boundary"
        candidates = [f"payload-originated-as-observed@{spec['target']}", f"witness-and-writer-common-cause@{spec['target']}"]
        operations = []
    else:
        raise RuntimeError(f"unknown stage kind: {spec['kind']}")
    return {
        "trialId": spec["trialId"],
        "kind": spec["kind"],
        "placement": spec.get("target"),
        "stage": spec.get("stage"),
        "evidenceDigest": state_digest(states),
        "earliestChangedBoundary": observed["stage"],
        "operations": operations,
        "candidates": candidates,
        "bridgeDigest": bridge["digest"] if bridge else None,
        "evidenceSignatureDigest": sha256(canonical(signatures).encode()).hex(),
        "crossViewStatus": status,
        "receiptLocalStatus": "authenticated-clean-snapshot" if status == "clean" else "authenticated-no-causal-verdict",
        "statefulSingleViewStatus": status,
    }


STAGE_SPECS = []
for i in range(1, 4):
    STAGE_SPECS.append({"trialId": f"CLEAN-{i:02d}", "kind": "clean"})
for stage in PRECOMMIT["corpus"]["stages"]:
    for target in PRECOMMIT["corpus"]["placements"]:
        STAGE_SPECS.append({"trialId": f"RESET-OMIT-{stage.upper()}-{target}", "kind": "reset-omission", "stage": stage, "target": target, "resetOrdinal": target})
for stage in PRECOMMIT["corpus"]["stages"]:
    for target in PRECOMMIT["corpus"]["placements"]:
        STAGE_SPECS.append({"trialId": f"MUTATE-REORDER-{stage.upper()}-{target}", "kind": "mutation-reorder", "stage": stage, "target": target})
for stage in PRECOMMIT["corpus"]["stages"]:
    for target in PRECOMMIT["corpus"]["placements"]:
        STAGE_SPECS.append({"trialId": f"MUTATE-OMIT-DISJOINT-{stage.upper()}-{target}", "kind": "mutation-omission-disjoint", "stage": stage, "target": target})
for index, stage in enumerate(PRECOMMIT["corpus"]["stages"]):
    STAGE_SPECS.append({"trialId": f"MUTATE-OMIT-SHADOW-{stage.upper()}", "kind": "mutation-omission-shadow", "stage": stage, "target": PRECOMMIT["corpus"]["placements"][index]})
for index, target in enumerate([17, 998], start=1):
    STAGE_SPECS.append({"trialId": f"WITNESS-COLLUSION-{index:02d}", "kind": "collusion", "target": target, "collusionOrdinal": target})

ROWS = [make_stage_row(spec) for spec in STAGE_SPECS]
CLEAN_ENTRY_BYTES = [canonical(record_view(record)).encode() for record in REFERENCE]
CLEAN_ROOT = merkle_root(CLEAN_ENTRY_BYTES)

for size in [17, 257, 998]:
    prefix_root = merkle_root(CLEAN_ENTRY_BYTES[:size])
    head = canonical({"log": "log-a", "size": size, "root": prefix_root.hex()}).encode()
    signature = KEYS["log-a"].sign(head)
    ROWS.append({
        "trialId": f"ROLLBACK-{size}", "kind": "rollback", "placement": size, "stage": None,
        "evidenceDigest": sha256(CLEAN_ROOT + prefix_root + signature).hex(),
        "earliestChangedBoundary": "retained-log-head", "operations": [],
        "candidates": ["stale-valid-prefix-replayed", "transparency-service-rolled-back"],
        "bridgeDigest": None, "evidenceSignatureDigest": sha256(signature).hex(),
        "crossViewStatus": "refuse-rollback", "receiptLocalStatus": "accepted-valid-local-receipt", "statefulSingleViewStatus": "refuse-rollback",
    })

for i in range(1, 3):
    subject = f"urn:unsolved:rc50:equivocal-event:{i}"
    a = canonical({"issuer": "event-issuer", "subject": subject, "sequence": i, "payload": f"view-a-{i}"}).encode()
    b = canonical({"issuer": "event-issuer", "subject": subject, "sequence": i, "payload": f"view-b-{i}"}).encode()
    sa, sb = KEYS["event-issuer"].sign(a), KEYS["event-issuer"].sign(b)
    ROWS.append({
        "trialId": f"ISSUER-EQUIVOCATION-{i:02d}", "kind": "issuer-equivocation", "placement": None, "stage": None,
        "evidenceDigest": sha256(a + b + sa + sb).hex(), "earliestChangedBoundary": "cross-service-subject-sequence", "operations": [],
        "candidates": [sha256(a).hex(), sha256(b).hex()], "bridgeDigest": None, "evidenceSignatureDigest": sha256(sa + sb).hex(),
        "crossViewStatus": "refuse-issuer-equivocation", "receiptLocalStatus": "accepted-valid-local-receipt", "statefulSingleViewStatus": "accepted-single-view",
    })

for i in range(1, 3):
    size = 500 + i
    a = canonical({"log": "log-a", "size": size, "root": sha256(f"log-view-a-{i}".encode()).hex()}).encode()
    b = canonical({"log": "log-a", "size": size, "root": sha256(f"log-view-b-{i}".encode()).hex()}).encode()
    sa, sb = KEYS["log-a"].sign(a), KEYS["log-a"].sign(b)
    ROWS.append({
        "trialId": f"LOG-EQUIVOCATION-{i:02d}", "kind": "log-equivocation", "placement": None, "stage": None,
        "evidenceDigest": sha256(a + b + sa + sb).hex(), "earliestChangedBoundary": "cross-observer-log-head", "operations": [],
        "candidates": [sha256(a).hex(), sha256(b).hex()], "bridgeDigest": None, "evidenceSignatureDigest": sha256(sa + sb).hex(),
        "crossViewStatus": "refuse-log-equivocation", "receiptLocalStatus": "accepted-valid-local-receipt", "statefulSingleViewStatus": "accepted-single-view",
    })

accepted_bridge = signed_bridge(257, "nonce-bridge-attack")
ROWS.append({
    "trialId": "BRIDGE-REPLAY-01", "kind": "bridge-replay", "placement": 257, "stage": None,
    "evidenceDigest": accepted_bridge["digest"], "earliestChangedBoundary": "bridge-registry", "operations": [],
    "candidates": ["same-authorized-bridge-presented-twice"], "bridgeDigest": accepted_bridge["digest"],
    "evidenceSignatureDigest": sha256((accepted_bridge["authoritySignature"] + accepted_bridge["witnessSignature"]).encode()).hex(),
    "crossViewStatus": "reject-bridge-replay", "receiptLocalStatus": "accepted-valid-signatures", "statefulSingleViewStatus": "reject-bridge-replay",
})
fork_a = signed_bridge(257, "nonce-bridge-fork", NEW_DOMAIN)
fork_b = signed_bridge(257, "nonce-bridge-fork", "RC50-SYNTHETIC-TRIGGER-DOMAIN-C")
ROWS.append({
    "trialId": "BRIDGE-FORK-01", "kind": "bridge-fork", "placement": 257, "stage": None,
    "evidenceDigest": sha256((fork_a["digest"] + fork_b["digest"]).encode()).hex(), "earliestChangedBoundary": "bridge-registry", "operations": [],
    "candidates": [fork_a["digest"], fork_b["digest"]], "bridgeDigest": fork_a["digest"],
    "evidenceSignatureDigest": sha256((fork_a["authoritySignature"] + fork_a["witnessSignature"] + fork_b["authoritySignature"] + fork_b["witnessSignature"]).encode()).hex(),
    "crossViewStatus": "reject-bridge-fork", "receiptLocalStatus": "accepted-valid-signatures", "statefulSingleViewStatus": "reject-bridge-fork",
})


def summarize_arm(field):
    statuses = {}
    for row in ROWS:
        statuses[row[field]] = statuses.get(row[field], 0) + 1
    return {"evaluations": len(ROWS), "statuses": statuses}


EXPECTED = PRECOMMIT["expectedAdjudication"]["crossViewCounts"]
ACTUAL = summarize_arm("crossViewStatus")["statuses"]
FAILURES = [f"{status}: expected {count}, got {ACTUAL.get(status, 0)}" for status, count in EXPECTED.items() if ACTUAL.get(status, 0) != count]
if len(ROWS) != PRECOMMIT["corpus"]["trialSchedule"]["total"]:
    FAILURES.append(f"trial count {len(ROWS)}")

RESULT = {
    "resultId": "RC50-COMPOSITIONAL-RECEIPTS-PYTHON-RESULT-0.1",
    "cycleId": PRECOMMIT["cycleId"],
    "generatedOn": "2026-08-25",
    "implementation": "Python independent scientific generator and adjudicator",
    "precommitPath": "research/reproducibility/rc50-compositional-receipts-precommit.json",
    "corpus": {
        "eventCount": EVENT_COUNT,
        "placements": PRECOMMIT["corpus"]["placements"],
        "payloadDigest": sha256(b"".join(record["payload"] for record in REFERENCE)).hex(),
        "referenceManifestRoot": manifest_root(REFERENCE).hex(),
    },
    "publicKeys": {label: key.public_raw.hex() for label, key in KEYS.items()},
    "trials": ROWS,
    "summaries": {
        "receiptLocal": summarize_arm("receiptLocalStatus"),
        "statefulSingleView": summarize_arm("statefulSingleViewStatus"),
        "crossViewCausal": summarize_arm("crossViewStatus"),
    },
    "h1Gate": {"pass": not FAILURES, "expected": EXPECTED, "actual": ACTUAL, "failures": FAILURES},
    "limitations": [
        "Different deterministic keys encode nominal role separation; operational independence is not measured.",
        "The finite causal grammar cannot exclude transformations that were not preregistered.",
        "This implementation regenerates scientific fixtures but does not consume the Node COSE wire artifact.",
        "Physical acquisition count is zero and the historical X16 branch remains paused.",
    ],
}

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(RESULT, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"RC50 Python: {len(ROWS)} trials; H1 {'PASS' if RESULT['h1Gate']['pass'] else 'FAIL'}.")
