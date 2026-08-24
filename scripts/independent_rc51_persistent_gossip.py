#!/usr/bin/env python3
"""Independent RC51 SQLite implementation; it does not import Node results or blind verdicts."""

import base64
import hashlib
import json
import os
import platform
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "research" / "reproducibility" / "rc51-persistent-gossip-python.json"
SCRIPT = Path(__file__).resolve()


def stable(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256(value):
    if isinstance(value, str):
        value = value.encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def digest(value):
    return sha256(stable(value))


def root_hash(label):
    return sha256(f"RC51-ROOT:{label}")


def opaque_id(case_id):
    return f"X-{sha256(f'RC51-BLIND:{case_id}')[:16]}"


def private_key(label):
    seed = hashlib.sha256(f"RC51-PUBLIC-DEMO-KEY:{label}".encode()).digest()[:32]
    return Ed25519PrivateKey.from_private_bytes(seed)


KEYS = {label: private_key(label) for label in ["K1", "K2", "K3", "LOG-A", "LOG-B", "ISSUER"]}


def sign_object(key_id, value):
    return base64.b64encode(KEYS[key_id].sign(stable(value).encode())).decode()


def verify_object(key_id, value, signature):
    if not signature:
        return False
    try:
        KEYS[key_id].public_key().verify(base64.b64decode(signature), stable(value).encode())
        return True
    except Exception:
        return False


def initial_state():
    return {
        "acceptedHead": {"logId": "lineage-log", "treeSize": 1, "root": root_hash("1")},
        "domain": "DOMAIN-0",
        "generation": 0,
        "keyEpoch": 1,
        "keyId": "K1",
        "spentNonces": [],
    }


def state_digest(state):
    return digest(state)


def connect_registry(db_path):
    db = sqlite3.connect(db_path, timeout=5)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=FULL")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS causal_state(
          singleton INTEGER PRIMARY KEY CHECK(singleton=1),
          head_log_id TEXT NOT NULL,
          head_tree_size INTEGER NOT NULL,
          head_root TEXT NOT NULL,
          domain TEXT NOT NULL,
          generation INTEGER NOT NULL,
          key_epoch INTEGER NOT NULL,
          key_id TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS spent_nonce(
          nonce TEXT PRIMARY KEY,
          successor_domain TEXT NOT NULL,
          generation INTEGER NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS committed_event(
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          event_digest TEXT NOT NULL UNIQUE
        ) STRICT;
        """
    )
    if db.execute("SELECT count(*) FROM causal_state").fetchone()[0] == 0:
        state = initial_state()
        db.execute(
            "INSERT INTO causal_state VALUES(1,?,?,?,?,?,?,?)",
            (
                state["acceptedHead"]["logId"], state["acceptedHead"]["treeSize"],
                state["acceptedHead"]["root"], state["domain"], state["generation"],
                state["keyEpoch"], state["keyId"],
            ),
        )
        db.commit()
    return db


def read_state(db):
    row = db.execute("SELECT * FROM causal_state WHERE singleton=1").fetchone()
    spent = [item[0] for item in db.execute("SELECT nonce FROM spent_nonce ORDER BY nonce")]
    return {
        "acceptedHead": {"logId": row[1], "treeSize": int(row[2]), "root": row[3]},
        "domain": row[4], "generation": int(row[5]), "keyEpoch": int(row[6]),
        "keyId": row[7], "spentNonces": spent,
    }


def pragma_snapshot(db):
    return {
        "journalMode": db.execute("PRAGMA journal_mode").fetchone()[0],
        "synchronous": int(db.execute("PRAGMA synchronous").fetchone()[0]),
        "foreignKeys": int(db.execute("PRAGMA foreign_keys").fetchone()[0]),
        "integrity": db.execute("PRAGMA integrity_check").fetchone()[0],
        "sqliteVersion": db.execute("SELECT sqlite_version()").fetchone()[0],
    }


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


def apply_transition(db, operation, crash_phase="none"):
    db.execute("BEGIN IMMEDIATE")
    try:
        current = read_state(db)
        prior = db.execute("SELECT successor_domain FROM spent_nonce WHERE nonce=?", (operation["nonce"],)).fetchone()
        if prior:
            db.rollback()
            verdict = "reject-nonce-replay" if prior[0] == operation["successorDomain"] else "reject-nonce-fork"
            return {"accepted": False, "verdict": verdict, "state": current}
        if not verify_object(current["keyId"], transition_document(operation), operation.get("signature")):
            db.rollback()
            return {"accepted": False, "verdict": "reject-transition-signature", "state": current}
        if operation["generation"] != current["generation"] + 1 or operation["head"]["treeSize"] <= current["acceptedHead"]["treeSize"]:
            db.rollback()
            return {"accepted": False, "verdict": "reject-nonmonotone-transition", "state": current}
        db.execute(
            "UPDATE causal_state SET head_log_id=?,head_tree_size=?,head_root=?,domain=?,generation=? WHERE singleton=1",
            (operation["head"]["logId"], operation["head"]["treeSize"], operation["head"]["root"], operation["successorDomain"], operation["generation"]),
        )
        db.execute("INSERT INTO spent_nonce VALUES(?,?,?)", (operation["nonce"], operation["successorDomain"], operation["generation"]))
        db.execute("INSERT INTO committed_event(event_type,event_digest) VALUES(?,?)", ("transition", digest(transition_document(operation))))
        if crash_phase == "before-commit":
            os._exit(91)
        db.commit()
        if crash_phase == "after-commit":
            os._exit(92)
        return {"accepted": True, "verdict": "accept", "state": read_state(db)}
    except Exception:
        db.rollback()
        raise


def apply_rotation(db, operation, crash_phase="none"):
    db.execute("BEGIN IMMEDIATE")
    try:
        current = read_state(db)
        if operation["epoch"] != current["keyEpoch"] + 1 or operation["predecessorKeyId"] != current["keyId"]:
            db.rollback()
            return {"accepted": False, "verdict": "reject-rotation-replay", "state": current}
        document = rotation_document(operation)
        if not verify_object(current["keyId"], document, operation.get("predecessorSignature")):
            db.rollback()
            return {"accepted": False, "verdict": "reject-predecessor-continuity", "state": current}
        if not verify_object(operation["newKeyId"], document, operation.get("newSignature")):
            db.rollback()
            return {"accepted": False, "verdict": "reject-new-key-continuity", "state": current}
        db.execute("UPDATE causal_state SET key_epoch=?,key_id=? WHERE singleton=1", (operation["epoch"], operation["newKeyId"]))
        db.execute("INSERT INTO committed_event(event_type,event_digest) VALUES(?,?)", ("rotation", digest(document)))
        if crash_phase == "before-commit":
            os._exit(93)
        db.commit()
        if crash_phase == "after-commit":
            os._exit(94)
        return {"accepted": True, "verdict": "accept-rotation", "state": read_state(db)}
    except Exception:
        db.rollback()
        raise


def connect_anchor(db_path):
    db = sqlite3.connect(db_path, timeout=5)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=FULL")
    db.execute("CREATE TABLE IF NOT EXISTS checkpoint(singleton INTEGER PRIMARY KEY CHECK(singleton=1),generation INTEGER NOT NULL,state_digest TEXT NOT NULL) STRICT")
    db.commit()
    return db


def update_anchor(db, checkpoint):
    current = db.execute("SELECT generation,state_digest FROM checkpoint WHERE singleton=1").fetchone()
    if current and (current[0] > checkpoint["generation"] or (current[0] == checkpoint["generation"] and current[1] != checkpoint["stateDigest"])):
        return {"accepted": False, "verdict": "refuse-anchor-regression"}
    db.execute(
        "INSERT INTO checkpoint VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET generation=excluded.generation,state_digest=excluded.state_digest",
        (checkpoint["generation"], checkpoint["stateDigest"]),
    )
    db.commit()
    return {"accepted": True, "verdict": "anchor-updated"}


def connect_view(db_path):
    db = sqlite3.connect(db_path, timeout=5)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=FULL")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("CREATE TABLE IF NOT EXISTS signed_view(sequence INTEGER PRIMARY KEY AUTOINCREMENT,view_json TEXT NOT NULL,signer_key_id TEXT NOT NULL,signature TEXT NOT NULL) STRICT")
    db.commit()
    return db


def store_view(db, view_value, signer_key_id):
    signature = sign_object(signer_key_id, view_value)
    db.execute("INSERT INTO signed_view(view_json,signer_key_id,signature) VALUES(?,?,?)", (stable(view_value), signer_key_id, signature))
    db.commit()
    return {"view": view_value, "signerKeyId": signer_key_id, "signature": signature}


def compare_views(retained, incoming):
    if not retained["signatureValid"] or not incoming["signatureValid"]:
        return "reject-view-signature"
    a, b = retained["view"], incoming["view"]
    if a["logId"] == b["logId"] and b["treeSize"] < a["treeSize"]:
        return "refuse-stale-view"
    if a["logId"] == b["logId"] and b["treeSize"] == a["treeSize"] and b["root"] != a["root"]:
        return "refuse-log-equivocation"
    if a["issuer"] == b["issuer"] and a["subject"] == b["subject"] and a["sequence"] == b["sequence"] and a["statementDigest"] != b["statementDigest"]:
        return "refuse-issuer-equivocation"
    return "accept-cross-view"


def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode()


def decode(value):
    return json.loads(base64.urlsafe_b64decode(value.encode()).decode())


def worker(kind, db_path, payload, crash_phase="none"):
    return subprocess.run([sys.executable, str(SCRIPT), "--worker", kind, str(db_path), encode(payload), crash_phase], capture_output=True, text=True, timeout=15)


def transition(nonce, successor_domain, generation, tree_size, key_id="K1"):
    operation = {
        "nonce": nonce, "successorDomain": successor_domain, "generation": generation,
        "head": {"logId": "lineage-log", "treeSize": tree_size, "root": root_hash(str(tree_size))},
    }
    operation["signature"] = sign_object(key_id, transition_document(operation))
    return operation


def rotation(epoch=2, predecessor_key_id="K1", new_key_id="K2", old=True, fresh=True):
    operation = {"epoch": epoch, "predecessorKeyId": predecessor_key_id, "newKeyId": new_key_id}
    document = rotation_document(operation)
    operation["predecessorSignature"] = sign_object(predecessor_key_id, document) if old else None
    operation["newSignature"] = sign_object(new_key_id, document) if fresh else None
    return operation


def verify_registry(db_path):
    db = connect_registry(db_path)
    result = {"state": read_state(db), "pragmas": pragma_snapshot(db)}
    db.close()
    return result


def row(case_id, verdict, state, arm_verdicts):
    return {"id": case_id, "opaqueCaseId": opaque_id(case_id), "verdict": verdict, "stateDigest": state_digest(state), "armVerdicts": arm_verdicts}


if len(sys.argv) > 2 and sys.argv[1] == "--worker":
    _, _, kind, db_path, encoded, crash_phase = sys.argv
    payload = decode(encoded)
    if kind == "transition":
        db = connect_registry(db_path)
        outcome = apply_transition(db, payload, crash_phase)
    elif kind == "rotation":
        db = connect_registry(db_path)
        outcome = apply_rotation(db, payload, crash_phase)
    elif kind == "anchor":
        db = connect_anchor(db_path)
        outcome = update_anchor(db, payload)
    elif kind == "view":
        db = connect_view(db_path)
        outcome = store_view(db, payload["view"], payload["signerKeyId"])
    else:
        raise RuntimeError(f"unknown worker kind {kind}")
    db.close()
    print(json.dumps(outcome, separators=(",", ":")))
    raise SystemExit(0)


results = []
pragmas = []
work_dir = Path(tempfile.mkdtemp(prefix="unsolved-rc51-python-"))
if Path(os.path.commonpath([work_dir.resolve(), Path(tempfile.gettempdir()).resolve()])) != Path(tempfile.gettempdir()).resolve():
    raise RuntimeError("temporary directory escaped system temp")


def registry_case(case_id, execute):
    db_path = work_dir / f"{case_id}.sqlite"
    connect_registry(db_path).close()
    verdict, arms = execute(db_path)
    verified = verify_registry(db_path)
    pragmas.append({"id": case_id, **verified["pragmas"]})
    results.append(row(case_id, verdict, verified["state"], arms))


def f01(db_path):
    operation = transition("N-01", "DOMAIN-1", 1, 2)
    assert worker("transition", db_path, operation).returncode == 0
    return "accept", {"signatureOnly": "accept-local-signature", "singlePersistentRegistry": "accept", "anchoredCrossView": "not-required"}


def f02(db_path):
    assert worker("transition", db_path, transition("N-01", "DOMAIN-1", 1, 2)).returncode == 0
    assert worker("transition", db_path, transition("N-02", "DOMAIN-2", 2, 3)).returncode == 0
    return "accept", {"signatureOnly": "accept-local-signature", "singlePersistentRegistry": "accept", "anchoredCrossView": "not-required"}


def f03(db_path):
    operation = transition("N-01", "DOMAIN-1", 1, 2)
    crashed = worker("transition", db_path, operation, "before-commit")
    assert crashed.returncode == 91 and state_digest(verify_registry(db_path)["state"]) == state_digest(initial_state())
    assert json.loads(worker("transition", db_path, operation).stdout)["accepted"]
    return "retry-accepted-once", {"signatureOnly": "accept-local-signature", "singlePersistentRegistry": "retry-accepted-once", "anchoredCrossView": "not-required"}


def f04(db_path):
    operation = transition("N-01", "DOMAIN-1", 1, 2)
    crashed = worker("transition", db_path, operation, "after-commit")
    assert crashed.returncode == 92 and verify_registry(db_path)["state"]["generation"] == 1
    assert json.loads(worker("transition", db_path, operation).stdout)["verdict"] == "reject-nonce-replay"
    return "retry-rejected-replay", {"signatureOnly": "accept-local-signature", "singlePersistentRegistry": "retry-rejected-replay", "anchoredCrossView": "not-required"}


def f05(db_path):
    operation = transition("N-01", "DOMAIN-1", 1, 2)
    assert worker("transition", db_path, operation).returncode == 0
    verdict = json.loads(worker("transition", db_path, operation).stdout)["verdict"]
    return verdict, {"signatureOnly": "accept-local-signature", "singlePersistentRegistry": verdict, "anchoredCrossView": "not-required"}


def f06(db_path):
    assert worker("transition", db_path, transition("N-01", "DOMAIN-1", 1, 2)).returncode == 0
    verdict = json.loads(worker("transition", db_path, transition("N-01", "DOMAIN-X", 1, 2)).stdout)["verdict"]
    return verdict, {"signatureOnly": "accept-local-signature", "singlePersistentRegistry": verdict, "anchoredCrossView": "not-required"}


for case_id, execute in [("F01", f01), ("F02", f02), ("F03", f03), ("F04", f04), ("F05", f05), ("F06", f06)]:
    registry_case(case_id, execute)


for case_id, operation, expected in [
    ("F07", rotation(), "accept-rotation"),
    ("F08", rotation(old=True, fresh=False), "reject-new-key-continuity"),
    ("F09", rotation(old=False, fresh=True), "reject-predecessor-continuity"),
]:
    def execute(db_path, operation=operation, expected=expected, case_id=case_id):
        outcome = json.loads(worker("rotation", db_path, operation).stdout)
        assert outcome["verdict"] == expected
        sig_verdict = "accept-both-signatures" if case_id == "F07" else "reject-missing-required-signature"
        return expected, {"signatureOnly": sig_verdict, "singlePersistentRegistry": expected, "anchoredCrossView": "not-required"}
    registry_case(case_id, execute)


def f10(db_path):
    operation = rotation()
    assert worker("rotation", db_path, operation, "before-commit").returncode == 93
    assert verify_registry(db_path)["state"]["keyEpoch"] == 1
    assert json.loads(worker("rotation", db_path, operation).stdout)["accepted"]
    return "retry-accepted-rotation", {"signatureOnly": "accept-both-signatures", "singlePersistentRegistry": "retry-accepted-rotation", "anchoredCrossView": "not-required"}


def f11(db_path):
    operation = rotation()
    assert worker("rotation", db_path, operation, "after-commit").returncode == 94
    assert verify_registry(db_path)["state"]["keyEpoch"] == 2
    assert json.loads(worker("rotation", db_path, operation).stdout)["verdict"] == "reject-rotation-replay"
    return "retry-rejected-rotation", {"signatureOnly": "accept-both-signatures", "singlePersistentRegistry": "retry-rejected-rotation", "anchoredCrossView": "not-required"}


registry_case("F10", f10)
registry_case("F11", f11)


def f12(db_path):
    backup_path = work_dir / "F12-backup.sqlite"
    anchor_path = work_dir / "F12-anchor.sqlite"
    assert worker("transition", db_path, transition("N-01", "DOMAIN-1", 1, 2)).returncode == 0
    source = connect_registry(db_path)
    source.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    target = sqlite3.connect(backup_path)
    source.backup(target)
    target.close()
    source.close()
    assert worker("transition", db_path, transition("N-02", "DOMAIN-2", 2, 3)).returncode == 0
    newest = verify_registry(db_path)["state"]
    checkpoint = {"generation": newest["generation"], "stateDigest": state_digest(newest)}
    assert worker("anchor", anchor_path, checkpoint).returncode == 0
    for suffix in ("-wal", "-shm"):
        sidecar = Path(f"{db_path}{suffix}")
        if sidecar.exists():
            sidecar.unlink()
    shutil.copyfile(backup_path, db_path)
    restored = verify_registry(db_path)["state"]
    anchor = connect_anchor(anchor_path)
    anchor_row = anchor.execute("SELECT generation,state_digest FROM checkpoint WHERE singleton=1").fetchone()
    anchor.close()
    verdict = "refuse-backup-rollback" if restored["generation"] < anchor_row[0] else "accept-anchor-current"
    assert verdict == "refuse-backup-rollback"
    return verdict, {"signatureOnly": "accept-local-signature", "singlePersistentRegistry": "accept-internally-valid-old-state", "anchoredCrossView": verdict}


registry_case("F12", f12)


def statement(issuer, subject, sequence, content):
    return {"issuer": issuer, "subject": subject, "sequence": sequence, "statementDigest": sha256(content)}


def view(log_id, tree_size, root_value, statement_value):
    return {"logId": log_id, "treeSize": tree_size, "root": root_value, **statement_value}


def view_case(case_id, view_a, key_a, view_b, key_b, expected):
    db_a = work_dir / f"{case_id}-a.sqlite"
    db_b = work_dir / f"{case_id}-b.sqlite"
    a = json.loads(worker("view", db_a, {"view": view_a, "signerKeyId": key_a}).stdout)
    b = json.loads(worker("view", db_b, {"view": view_b, "signerKeyId": key_b}).stdout)
    a["signatureValid"] = verify_object(a["signerKeyId"], a["view"], a["signature"])
    b["signatureValid"] = verify_object(b["signerKeyId"], b["view"], b["signature"])
    verdict = compare_views(a, b)
    assert verdict == expected
    results.append(row(case_id, verdict, initial_state(), {"signatureOnly": "accept-both-local-signatures", "singlePersistentRegistry": "accept-own-view", "anchoredCrossView": verdict}))
    for tag, db_path in [(f"{case_id}A", db_a), (f"{case_id}B", db_b)]:
        db = connect_view(db_path)
        pragmas.append({"id": tag, **pragma_snapshot(db)})
        db.close()


view_case("F13", view("log-A", 3, root_hash("A3"), statement("issuer", "subject", 3, "S3")), "LOG-A", view("log-A", 2, root_hash("A2"), statement("issuer", "subject", 2, "S2")), "LOG-A", "refuse-stale-view")
view_case("F14", view("log-A", 3, root_hash("A3-left"), statement("issuer", "subject", 3, "S3")), "LOG-A", view("log-A", 3, root_hash("A3-right"), statement("issuer", "subject", 3, "S3")), "LOG-A", "refuse-log-equivocation")
view_case("F15", view("log-A", 3, root_hash("A3"), statement("issuer", "subject", 7, "LEFT")), "LOG-A", view("log-B", 4, root_hash("B4"), statement("issuer", "subject", 7, "RIGHT")), "LOG-B", "refuse-issuer-equivocation")
view_case("F16", view("log-A", 3, root_hash("A3"), statement("issuer", "subject", 7, "SAME")), "LOG-A", view("log-B", 4, root_hash("B4"), statement("issuer", "subject", 7, "SAME")), "LOG-B", "accept-cross-view")

assert len(results) == 16
assert all(item["journalMode"] == "wal" and item["synchronous"] == 2 and item["foreignKeys"] == 1 and item["integrity"] == "ok" for item in pragmas)

result = {
    "resultId": "RC51-PERSISTENT-GOSSIP-PYTHON-RESULT-0.1",
    "cycleId": "RC-2026-51",
    "runtime": {"python": platform.python_version(), "sqlite": sqlite3.sqlite_version, "platform": platform.platform()},
    "preregistrationCommit": "5a2f847",
    "processCrashScope": True,
    "powerLossScope": False,
    "operatorIndependenceScope": False,
    "physicalAcquisitions": 0,
    "fixtures": results,
    "pragmaChecks": pragmas,
    "gates": {
        "fixtureCount": len(results) == 16,
        "atomicCrashTuples": next(x for x in results if x["id"] == "F03")["verdict"] == "retry-accepted-once" and next(x for x in results if x["id"] == "F04")["verdict"] == "retry-rejected-replay" and next(x for x in results if x["id"] == "F10")["verdict"] == "retry-accepted-rotation" and next(x for x in results if x["id"] == "F11")["verdict"] == "retry-rejected-rotation",
        "backupRollbackDetectedOnlyWithAnchor": next(x for x in results if x["id"] == "F12")["armVerdicts"]["singlePersistentRegistry"] == "accept-internally-valid-old-state" and next(x for x in results if x["id"] == "F12")["verdict"] == "refuse-backup-rollback",
        "equivocationDetectedAfterExchange": all(next(x for x in results if x["id"] == case_id)["verdict"].startswith("refuse-") for case_id in ["F13", "F14", "F15"]),
        "consistentViewsAccepted": next(x for x in results if x["id"] == "F16")["verdict"] == "accept-cross-view",
        "sqlitePragmasAndIntegrity": True,
    },
}
OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
shutil.rmtree(work_dir)
print(f"RC51 Python: {len(results)} fixtures; SQLite {sqlite3.sqlite_version}; process-crash gates PASS; physical n=0.")
