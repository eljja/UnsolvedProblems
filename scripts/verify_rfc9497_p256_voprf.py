import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF
A = P - 3
B = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B
N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
GX = 0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296
GY = 0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5
G = (GX, GY)
IDENTITY = None


def read_json(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def i2osp(value, length):
    return value.to_bytes(length, "big")


def add(left, right):
    if left is None:
        return right
    if right is None:
        return left
    x1, y1 = left
    x2, y2 = right
    if x1 == x2 and (y1 + y2) % P == 0:
        return None
    if left == right:
        slope = ((3 * x1 * x1 + A) * pow(2 * y1, -1, P)) % P
    else:
        slope = ((y2 - y1) * pow(x2 - x1, -1, P)) % P
    x3 = (slope * slope - x1 - x2) % P
    y3 = (slope * (x1 - x3) - y1) % P
    return x3, y3


def multiply(scalar, point):
    scalar %= N
    result = None
    addend = point
    while scalar:
        if scalar & 1:
            result = add(result, addend)
        addend = add(addend, addend)
        scalar >>= 1
    return result


def deserialize(encoded):
    if len(encoded) != 33 or encoded[0] not in (2, 3):
        raise ValueError("invalid compressed P-256 element")
    x = int.from_bytes(encoded[1:], "big")
    if x >= P:
        raise ValueError("x out of range")
    rhs = (pow(x, 3, P) + A * x + B) % P
    y = pow(rhs, (P + 1) // 4, P)
    if (y * y) % P != rhs:
        raise ValueError("point not on curve")
    if (y & 1) != (encoded[0] & 1):
        y = P - y
    point = (x, y)
    if point is None or multiply(N, point) is not None:
        raise ValueError("invalid subgroup element")
    return point


def serialize(point):
    if point is None:
        raise ValueError("identity cannot be serialized")
    x, y = point
    return bytes([2 | (y & 1)]) + i2osp(x, 32)


def xor(left, right):
    return bytes(a ^ b for a, b in zip(left, right))


def expand_message_xmd(message, dst, length):
    if len(dst) > 255 or length > 65535:
        raise ValueError("unsupported XMD length")
    digest_size = 32
    ell = (length + digest_size - 1) // digest_size
    if ell > 255:
        raise ValueError("too many XMD blocks")
    dst_prime = dst + i2osp(len(dst), 1)
    b0 = hashlib.sha256(bytes(64) + message + i2osp(length, 2) + b"\x00" + dst_prime).digest()
    blocks = [hashlib.sha256(b0 + b"\x01" + dst_prime).digest()]
    for index in range(2, ell + 1):
        blocks.append(hashlib.sha256(xor(b0, blocks[-1]) + i2osp(index, 1) + dst_prime).digest())
    return b"".join(blocks)[:length]


def hash_to_scalar(message, context):
    uniform = expand_message_xmd(message, b"HashToScalar-" + context, 48)
    return int.from_bytes(uniform, "big") % N


def composites(public_key, blinded, evaluated, context):
    public_bytes = serialize(public_key)
    seed_dst = b"Seed-" + context
    seed = hashlib.sha256(i2osp(len(public_bytes), 2) + public_bytes + i2osp(len(seed_dst), 2) + seed_dst).digest()
    m_point = None
    z_point = None
    for index, (blind_point, eval_point) in enumerate(zip(blinded, evaluated)):
        blind_bytes = serialize(blind_point)
        eval_bytes = serialize(eval_point)
        transcript = i2osp(len(seed), 2) + seed + i2osp(index, 2) + i2osp(len(blind_bytes), 2) + blind_bytes + i2osp(len(eval_bytes), 2) + eval_bytes + b"Composite"
        coefficient = hash_to_scalar(transcript, context)
        m_point = add(m_point, multiply(coefficient, blind_point))
        z_point = add(z_point, multiply(coefficient, eval_point))
    return m_point, z_point


def verify_proof(public_key, blinded, evaluated, proof, context):
    if len(proof) != 64:
        return False
    challenge = int.from_bytes(proof[:32], "big")
    response = int.from_bytes(proof[32:], "big")
    if challenge >= N or response >= N:
        return False
    m_point, z_point = composites(public_key, blinded, evaluated, context)
    t2 = add(multiply(response, G), multiply(challenge, public_key))
    t3 = add(multiply(response, m_point), multiply(challenge, z_point))
    items = [serialize(public_key), serialize(m_point), serialize(z_point), serialize(t2), serialize(t3)]
    transcript = b"".join(i2osp(len(item), 2) + item for item in items) + b"Challenge"
    return hash_to_scalar(transcript, context) == challenge


def finalize(private_input, blind, evaluated_element):
    unblinded = multiply(pow(blind, -1, N), evaluated_element)
    encoded = serialize(unblinded)
    return hashlib.sha256(i2osp(len(private_input), 2) + private_input + i2osp(len(encoded), 2) + encoded + b"Finalize").digest()


def main():
    fixture = read_json("research/reproducibility/rfc9497-p256-voprf-vectors.json")
    context = b"OPRFV1-" + bytes([fixture["mode"]]) + b"-" + fixture["suite"].encode()
    private_scalar = int(fixture["serverPrivateScalar"], 16)
    public_key = deserialize(bytes.fromhex(fixture["serverPublicElement"]))
    vector_results = []
    for vector in fixture["vectors"]:
        inputs = [bytes.fromhex(value) for value in vector["inputs"]]
        blinds = [int(value, 16) for value in vector["blinds"]]
        blinded = [deserialize(bytes.fromhex(value)) for value in vector["blindedElements"]]
        evaluated = [deserialize(bytes.fromhex(value)) for value in vector["evaluationElements"]]
        proof = bytes.fromhex(vector["proof"])
        outputs = [bytes.fromhex(value) for value in vector["outputs"]]
        output_matches = [finalize(item, blind, element) == expected for item, blind, element, expected in zip(inputs, blinds, evaluated, outputs)]
        evaluation_matches = [multiply(private_scalar, blind_point) == eval_point for blind_point, eval_point in zip(blinded, evaluated)]
        proof_valid = verify_proof(public_key, blinded, evaluated, proof, context)
        wrong_context_rejected = not verify_proof(public_key, blinded, evaluated, proof, b"OPRFV1-\x00-P256-SHA256")
        mutated_proof = proof[:-1] + bytes([proof[-1] ^ 1])
        mutated_proof_rejected = not verify_proof(public_key, blinded, evaluated, mutated_proof, context)
        mutated_evaluated = list(evaluated)
        mutated_evaluated[0] = add(mutated_evaluated[0], G)
        mutated_evaluation_rejected = not verify_proof(public_key, blinded, mutated_evaluated, proof, context)
        vector_results.append({
            "id": vector["id"],
            "batchSize": vector["batchSize"],
            "batchShapeMatches": vector["batchSize"] == len(inputs) == len(blinds) == len(blinded) == len(evaluated) == len(outputs),
            "publicEvaluationMatchesPrivateScalar": all(evaluation_matches),
            "dleqProofValid": proof_valid,
            "outputsMatch": all(output_matches),
            "wrongModeContextRejected": wrong_context_rejected,
            "mutatedProofRejected": mutated_proof_rejected,
            "mutatedEvaluationRejected": mutated_evaluation_rejected,
        })
    checks = {
        "context_string_matches_fixture": context.hex() == fixture["contextStringHex"],
        "server_public_key_matches_private_scalar": multiply(private_scalar, G) == public_key,
        "three_published_vectors_present": len(vector_results) == 3,
        "all_batch_shapes_match": all(item["batchShapeMatches"] for item in vector_results),
        "all_server_evaluations_match": all(item["publicEvaluationMatchesPrivateScalar"] for item in vector_results),
        "all_dleq_proofs_verify": all(item["dleqProofValid"] for item in vector_results),
        "all_finalize_outputs_match": all(item["outputsMatch"] for item in vector_results),
        "wrong_mode_context_rejected_for_all": all(item["wrongModeContextRejected"] for item in vector_results),
        "mutated_proof_rejected_for_all": all(item["mutatedProofRejected"] for item in vector_results),
        "mutated_evaluation_rejected_for_all": all(item["mutatedEvaluationRejected"] for item in vector_results),
    }
    result = {
        "resultId": "RFC9497-P256-VOPRF-CONFORMANCE-RESULT-0.8",
        "computedOn": "2026-08-14",
        "fixtureId": fixture["fixtureId"],
        "suite": fixture["suite"],
        "mode": fixture["modeName"],
        "passed": all(checks.values()),
        "checks": checks,
        "vectors": vector_results,
        "testCount": len(checks) + sum(7 for _ in vector_results),
        "qualification": {
            "publishedVectorConformance": "pass" if all(checks.values()) else "fail",
            "liveServerInteroperability": "untested",
            "constantTime": "unqualified-pure-python-reference-code",
            "productionKeyProtection": "unqualified-public-vector-key",
            "enrollmentPrivacy": "not-established-by-primitive-conformance"
        },
        "conclusion": "Pure-Python P-256 arithmetic verifies all three RFC 9497 A.3.2 VOPRF proofs and outputs, including the batch proof, and rejects wrong-mode, mutated-proof, and mutated-evaluation controls. This qualifies the reference transcript logic only; it does not qualify a live service, constant-time implementation, or enrollment privacy."
    }
    output = ROOT / "research/reproducibility/rfc9497-p256-voprf-result.json"
    if "--write" in sys.argv:
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    elif read_json("research/reproducibility/rfc9497-p256-voprf-result.json") != result:
        raise SystemExit("RFC 9497 result differs from committed artifact.")
    print(f"RFC 9497 P256 VOPRF: {sum(checks.values())}/{len(checks)} aggregate checks passed across {len(vector_results)} official vectors.")
    if not result["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
