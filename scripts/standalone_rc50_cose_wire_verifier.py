import hashlib
import json
import struct
import sys
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


ROOT = Path(__file__).resolve().parents[1]
VECTORS_PATH = Path(sys.argv[sys.argv.index("--vectors") + 1]) if "--vectors" in sys.argv else ROOT / "research/reproducibility/rc50-compositional-receipts-wire-vectors.json"
OUTPUT_PATH = Path(sys.argv[sys.argv.index("--output") + 1]) if "--output" in sys.argv else ROOT / "research/reproducibility/rc50-compositional-receipts-third-wire-audit.json"
CONTRACT = json.loads((ROOT / "research/reproducibility/rc50-third-verifier-contract.json").read_text(encoding="utf-8"))
VECTORS = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))


def sha256(value: bytes) -> bytes:
    return hashlib.sha256(value).digest()


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
    raise ValueError("integer outside uint64")


@dataclass
class Tag:
    number: int
    value: object


def encode(value) -> bytes:
    if isinstance(value, Tag):
        return cbor_head(6, value.number) + encode(value.value)
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
        return cbor_head(4, len(value)) + b"".join(encode(member) for member in value)
    if isinstance(value, dict):
        pairs = sorted(((encode(key), encode(member)) for key, member in value.items()), key=lambda pair: pair[0])
        return cbor_head(5, len(pairs)) + b"".join(key + member for key, member in pairs)
    raise ValueError(f"unsupported CBOR type: {type(value)}")


def decode(raw: bytes):
    data = bytes(raw)
    offset = 0

    def length(additional: int) -> int:
        nonlocal offset
        if additional < 24:
            return additional
        if additional == 24:
            if offset + 1 > len(data):
                raise ValueError("truncated uint8")
            value = data[offset]
            offset += 1
            if value < 24:
                raise ValueError("non-shortest uint8")
            return value
        if additional == 25:
            if offset + 2 > len(data):
                raise ValueError("truncated uint16")
            value = struct.unpack_from(">H", data, offset)[0]
            offset += 2
            if value <= 0xFF:
                raise ValueError("non-shortest uint16")
            return value
        if additional == 26:
            if offset + 4 > len(data):
                raise ValueError("truncated uint32")
            value = struct.unpack_from(">I", data, offset)[0]
            offset += 4
            if value <= 0xFFFF:
                raise ValueError("non-shortest uint32")
            return value
        if additional == 27:
            if offset + 8 > len(data):
                raise ValueError("truncated uint64")
            value = struct.unpack_from(">Q", data, offset)[0]
            offset += 8
            if value <= 0xFFFFFFFF:
                raise ValueError("non-shortest uint64")
            return value
        raise ValueError("indefinite or reserved length")

    def item():
        nonlocal offset
        if offset >= len(data):
            raise ValueError("truncated CBOR")
        initial = data[offset]
        offset += 1
        major, additional = initial >> 5, initial & 31
        if major == 7:
            if additional == 20:
                return False
            if additional == 21:
                return True
            if additional == 22:
                return None
            raise ValueError("unsupported simple or floating value")
        count = length(additional)
        if major == 0:
            return count
        if major == 1:
            return -1 - count
        if major == 2:
            if offset + count > len(data):
                raise ValueError("truncated byte string")
            value = data[offset:offset + count]
            offset += count
            return value
        if major == 3:
            if offset + count > len(data):
                raise ValueError("truncated text string")
            value = data[offset:offset + count].decode("utf-8")
            offset += count
            return value
        if major == 4:
            return [item() for _ in range(count)]
        if major == 5:
            result = {}
            previous_key_encoding = None
            for _ in range(count):
                key_start = offset
                key = item()
                key_encoding = data[key_start:offset]
                if previous_key_encoding is not None and key_encoding <= previous_key_encoding:
                    raise ValueError("duplicate or non-deterministically ordered map key")
                previous_key_encoding = key_encoding
                if key in result:
                    raise ValueError("duplicate decoded map key")
                result[key] = item()
            return result
        if major == 6:
            if count != 18:
                raise ValueError("unsupported CBOR tag")
            return Tag(count, item())
        raise ValueError("unsupported major type")

    value = item()
    if offset != len(data):
        raise ValueError("trailing CBOR bytes")
    if encode(value) != data:
        raise ValueError("encoding is not deterministic")
    return value


PUBLIC_KEYS = {
    label: Ed25519PublicKey.from_public_bytes(bytes.fromhex(record["ed25519PublicKeyHex"]))
    for label, record in VECTORS["publicKeys"].items()
}
KIDS = {label: bytes.fromhex(record["kidHex"]) for label, record in VECTORS["publicKeys"].items()}


def parse_sign1(raw: bytes):
    tagged = decode(raw)
    if not isinstance(tagged, Tag) or tagged.number != 18 or not isinstance(tagged.value, list) or len(tagged.value) != 4:
        raise ValueError("not a tagged four-member COSE_Sign1")
    protected_raw, unprotected, payload, signature = tagged.value
    if not isinstance(protected_raw, bytes) or not isinstance(unprotected, dict) or not isinstance(signature, bytes):
        raise ValueError("invalid COSE_Sign1 member types")
    protected = decode(protected_raw)
    if not isinstance(protected, dict):
        raise ValueError("protected header is not a map")
    return protected_raw, protected, unprotected, payload, signature


def verify_sign1(raw: bytes, key_label: str, detached_payload: bytes | None = None, receipt: bool = False) -> bool:
    try:
        protected_raw, protected, _, attached, signature = parse_sign1(raw)
        if protected.get(1) != -8 or protected.get(4) != KIDS[key_label]:
            return False
        claims = protected.get(15)
        if not isinstance(claims, dict) or not isinstance(claims.get(1), str) or not isinstance(claims.get(2), str):
            return False
        if receipt:
            if protected.get(395) != 1 or protected.get(16) != "application/scitt-receipt+cose":
                return False
        elif protected.get(16) != "application/scitt-statement+cose":
            return False
        payload = detached_payload if attached is None else attached
        if not isinstance(payload, bytes):
            return False
        to_verify = encode(["Signature1", protected_raw, b"", payload])
        PUBLIC_KEYS[key_label].verify(signature, to_verify)
        return True
    except Exception:
        return False


def inclusion_root(entry: bytes, leaf_index: int, tree_size: int, proof: list[bytes]) -> bytes:
    if leaf_index < 0 or leaf_index >= tree_size:
        raise ValueError("invalid inclusion coordinates")
    fn, sn = leaf_index, tree_size - 1
    root = sha256(b"\x00" + entry)
    for node in proof:
        if sn == 0 or not isinstance(node, bytes):
            raise ValueError("invalid inclusion path")
        if fn & 1 or fn == sn:
            root = sha256(b"\x01" + node + root)
            if not fn & 1:
                while not fn & 1 and fn != 0:
                    fn >>= 1
                    sn >>= 1
        else:
            root = sha256(b"\x01" + root + node)
        fn >>= 1
        sn >>= 1
    if sn != 0:
        raise ValueError("short inclusion path")
    return root


def inclusion_receipt_ok(receipt_raw: bytes, entry: bytes, key_label: str) -> bool:
    try:
        _, _, unprotected, attached, _ = parse_sign1(receipt_raw)
        if attached is not None:
            return False
        proof_container = unprotected.get(396)
        if not isinstance(proof_container, dict) or set(proof_container) != {-1}:
            return False
        proof_items = proof_container[-1]
        if not isinstance(proof_items, list) or len(proof_items) != 1 or not isinstance(proof_items[0], bytes):
            return False
        proof = decode(proof_items[0])
        if not isinstance(proof, list) or len(proof) != 3 or not isinstance(proof[2], list):
            return False
        root = inclusion_root(entry, proof[1], proof[0], proof[2])
        return verify_sign1(receipt_raw, key_label, root, True)
    except Exception:
        return False


def verify_consistency(first: int, second: int, first_root: bytes, second_root: bytes, path: list[bytes]) -> bool:
    if not (0 < first < second) or not path:
        return False
    work = list(path)
    if first & (first - 1) == 0:
        work.insert(0, first_root)
    fn, sn = first - 1, second - 1
    while fn & 1:
        fn >>= 1
        sn >>= 1
    fr = sr = work[0]
    for node in work[1:]:
        if sn == 0 or not isinstance(node, bytes):
            return False
        if fn & 1 or fn == sn:
            fr = sha256(b"\x01" + node + fr)
            sr = sha256(b"\x01" + node + sr)
            if not fn & 1:
                while not fn & 1 and fn != 0:
                    fn >>= 1
                    sn >>= 1
        else:
            sr = sha256(b"\x01" + sr + node)
        fn >>= 1
        sn >>= 1
    return sn == 0 and fr == first_root and sr == second_root


def consistency_receipt_ok(receipt_raw: bytes, old_size: int, old_root: bytes, new_size: int, new_root: bytes, key_label: str) -> bool:
    try:
        if not verify_sign1(receipt_raw, key_label, new_root, True):
            return False
        _, _, unprotected, attached, _ = parse_sign1(receipt_raw)
        if attached is not None:
            return False
        proof_container = unprotected.get(396)
        if not isinstance(proof_container, dict) or set(proof_container) != {-2}:
            return False
        proof_items = proof_container[-2]
        if not isinstance(proof_items, list) or len(proof_items) != 1 or not isinstance(proof_items[0], bytes):
            return False
        proof = decode(proof_items[0])
        if not isinstance(proof, list) or len(proof) != 3 or not isinstance(proof[2], list):
            return False
        return proof[0] == old_size and proof[1] == new_size and verify_consistency(old_size, new_size, old_root, new_root, proof[2])
    except Exception:
        return False


checks = {
    "signedStatementPositive": 0,
    "inclusionReceiptPositive": 0,
    "consistencyReceiptPositive": 0,
    "statementSignatureMutationRejected": 0,
    "receiptSignatureMutationRejected": 0,
    "wrongLeafRejected": 0,
    "inclusionPathMutationRejected": 0,
    "consistencyPathMutationRejected": 0,
}
failures = []

for vector in VECTORS["inclusionVectors"]:
    statement = bytes.fromhex(vector["statementCoseHex"])
    mutated_statement = bytes.fromhex(vector["statementSignatureMutationHex"])
    receipt = bytes.fromhex(vector["receiptCoseHex"])
    mutated_receipt = bytes.fromhex(vector["receiptSignatureMutationHex"])
    wrong_leaf = bytes.fromhex(vector["wrongLeafEntryHex"])
    path_mutation = bytes.fromhex(vector["pathMutationReceiptHex"])
    if verify_sign1(statement, "event-issuer"):
        checks["signedStatementPositive"] += 1
    else:
        failures.append(f"statement positive failed: {vector['id']}")
    if not verify_sign1(mutated_statement, "event-issuer"):
        checks["statementSignatureMutationRejected"] += 1
    else:
        failures.append(f"statement mutation accepted: {vector['id']}")
    if inclusion_receipt_ok(receipt, statement, "log-a"):
        checks["inclusionReceiptPositive"] += 1
    else:
        failures.append(f"inclusion positive failed: {vector['id']}")
    if not inclusion_receipt_ok(mutated_receipt, statement, "log-a"):
        checks["receiptSignatureMutationRejected"] += 1
    else:
        failures.append(f"receipt signature mutation accepted: {vector['id']}")
    if not inclusion_receipt_ok(receipt, wrong_leaf, "log-a"):
        checks["wrongLeafRejected"] += 1
    else:
        failures.append(f"wrong leaf accepted: {vector['id']}")
    if not inclusion_receipt_ok(path_mutation, statement, "log-a"):
        checks["inclusionPathMutationRejected"] += 1
    else:
        failures.append(f"path mutation accepted: {vector['id']}")

for vector in VECTORS["consistencyVectors"]:
    receipt = bytes.fromhex(vector["receiptCoseHex"])
    mutated_receipt = bytes.fromhex(vector["receiptSignatureMutationHex"])
    path_mutation = bytes.fromhex(vector["pathMutationReceiptHex"])
    old_root = bytes.fromhex(vector["oldRootHex"])
    new_root = bytes.fromhex(vector["newRootHex"])
    args = (vector["oldSize"], old_root, vector["newSize"], new_root, "log-a")
    if consistency_receipt_ok(receipt, *args):
        checks["consistencyReceiptPositive"] += 1
    else:
        failures.append(f"consistency positive failed: {vector['id']}")
    if not consistency_receipt_ok(mutated_receipt, *args):
        checks["receiptSignatureMutationRejected"] += 1
    else:
        failures.append(f"consistency signature mutation accepted: {vector['id']}")
    if not consistency_receipt_ok(path_mutation, *args):
        checks["consistencyPathMutationRejected"] += 1
    else:
        failures.append(f"consistency path mutation accepted: {vector['id']}")

transparent = VECTORS["transparentStatement"]
transparent_raw = bytes.fromhex(transparent["coseHex"])
base_statement = bytes.fromhex(transparent["baseStatementCoseHex"])
transparent_ok = verify_sign1(transparent_raw, "event-issuer")
try:
    _, _, transparent_unprotected, _, _ = parse_sign1(transparent_raw)
    attached = transparent_unprotected.get(394)
    dual_receipts_ok = (
        isinstance(attached, list)
        and len(attached) == 2
        and inclusion_receipt_ok(attached[0], base_statement, "log-a")
        and inclusion_receipt_ok(attached[1], base_statement, "log-b")
    )
except Exception:
    dual_receipts_ok = False
if not transparent_ok:
    failures.append("transparent statement issuer signature failed")
if not dual_receipts_ok:
    failures.append("transparent statement dual receipts failed")

expected = CONTRACT["expectedCounts"]
for name, count in expected.items():
    if checks.get(name) != count:
        failures.append(f"{name}: expected {count}, got {checks.get(name)}")

result = {
    "auditId": "RC50-STANDALONE-COSE-WIRE-AUDIT-0.1",
    "cycleId": VECTORS["cycleId"],
    "reviewedOn": "2026-08-25",
    "implementation": "Standalone Python deterministic-CBOR, COSE_Sign1, RFC9162_SHA256, and RFC 9942 verifier; no generator imports",
    "vectorsPath": "research/reproducibility/rc50-compositional-receipts-wire-vectors.json",
    "checks": checks,
    "transparentStatement": {"issuerSignatureValid": transparent_ok, "twoIndependentReceiptsValid": dual_receipts_ok},
    "exactExpectedCounts": checks == expected,
    "failures": failures,
    "allPassed": not failures,
    "limitations": "Wire conformance within the frozen subset does not prove application payload accuracy, role independence, currentness without retained state, or physical event truth."
}

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"RC50 wire verifier: {'PASS' if result['allPassed'] else 'FAIL'}; {sum(checks.values())} positive/rejection checks.")
if failures:
    for failure in failures:
        print(f"- {failure}")
    raise SystemExit(1)
