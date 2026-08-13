import hashlib
import json
import sys
from pathlib import Path

from verify_rfc9497_p256_voprf import (
    A,
    B,
    G,
    N,
    P,
    add,
    deserialize,
    expand_message_xmd,
    i2osp,
    multiply,
    serialize,
    verify_proof,
)

ROOT = Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"
SEED_PREFIX = b"RC34-CORPUS-SEED-V1:"
SSWU_Z = -10 % P


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def frame(*parts):
    return b"".join(i2osp(len(part), 2) + part for part in parts)


def sign0(value):
    return value & 1


def sqrt_ratio(value):
    root = pow(value, (P + 1) // 4, P)
    return root, (root * root) % P == value % P


def map_to_curve_simple_swu(u):
    # RFC 9380, Section 6.6.2 specialized to P-256 with Z=-10.
    tv1 = (SSWU_Z * u * u) % P
    tv2 = (tv1 * tv1) % P
    denominator = (tv1 + tv2) % P
    denominator_inverse = pow(denominator, -1, P) if denominator else 0
    x1 = (denominator_inverse + 1) % P
    if denominator_inverse == 0:
        x1 = pow(SSWU_Z, -1, P)
    x1 = (x1 * (-B % P) * pow(A, -1, P)) % P
    gx1 = (pow(x1, 3, P) + A * x1 + B) % P
    x2 = (tv1 * x1) % P
    gx2 = (pow(x2, 3, P) + A * x2 + B) % P
    y, square = sqrt_ratio(gx1)
    if not square:
        x1 = x2
        y, square = sqrt_ratio(gx2)
    if not square:
        raise ValueError("SSWU produced no square root")
    if sign0(y) != sign0(u):
        y = (-y) % P
    return x1, y


def hash_to_group(message, context):
    uniform = expand_message_xmd(message, b"HashToGroup-" + context, 96)
    field_values = [int.from_bytes(uniform[index:index + 48], "big") % P for index in (0, 48)]
    point = add(map_to_curve_simple_swu(field_values[0]), map_to_curve_simple_swu(field_values[1]))
    if point is None:
        raise ValueError("hash-to-group identity")
    return point


def hash_to_scalar(message, context):
    uniform = expand_message_xmd(message, b"HashToScalar-" + context, 48)
    return int.from_bytes(uniform, "big") % N


def finalize(private_input, info, blind, evaluated_element, mode):
    unblinded = multiply(pow(blind, -1, N), evaluated_element)
    encoded = serialize(unblinded)
    transcript = i2osp(len(private_input), 2) + private_input
    if mode == "POPRF":
        transcript += i2osp(len(info), 2) + info
    transcript += i2osp(len(encoded), 2) + encoded + b"Finalize"
    return hashlib.sha256(transcript).digest()


def public_info_scalar(info, context):
    return hash_to_scalar(b"Info" + i2osp(len(info), 2) + info, context)


def expected_input(mode, study_id, package_bytes):
    if mode == "VOPRF":
        return frame(b"UP-RC34-VOPRF", study_id.encode(), package_bytes)
    return package_bytes


def expected_info(mode, study_id):
    if mode == "POPRF":
        return frame(b"UP-RC34-POPRF", study_id.encode())
    return b""


def official_hash_to_group_self_test():
    fixture = read_json(REPRO / "rfc9497-p256-voprf-vectors.json")
    context = b"OPRFV1-\x01-P256-SHA256"
    total = 0
    for vector in fixture["vectors"]:
        for input_hex, blind_hex, expected_hex in zip(vector["inputs"], vector["blinds"], vector["blindedElements"]):
            point = hash_to_group(bytes.fromhex(input_hex), context)
            actual = multiply(int(blind_hex, 16), point)
            if serialize(actual).hex() != expected_hex:
                return False
            total += 1
    return total == 4


def main():
    precommit = read_json(REPRO / "rc34-sealed-corpus-precommit.json")
    reveal = read_json(REPRO / "rc34-sealed-corpus-reveal.json")
    transcripts = read_json(REPRO / "rc34-circl-transcripts.json")
    circl_result = read_json(REPRO / "rc34-circl-interop-result.json")

    commitment = hashlib.sha256(SEED_PREFIX + reveal["seedHex"].encode()).hexdigest()
    packages = {item["id"]: bytes.fromhex(item["bytesHex"]) for item in reveal["packages"]}
    package_hashes_valid = all(
        len(packages[item["id"]]) == item["length"]
        and hashlib.sha256(packages[item["id"]]).hexdigest() == item["sha256"]
        for item in reveal["packages"]
    )
    event_lookup = {
        (study["studyId"], event["eventId"]): event
        for study in reveal["studies"]
        for event in study["events"]
    }

    batch_results = []
    observed = {"VOPRF": {}, "POPRF": {}}
    malformed_rejections = 0
    for batch in transcripts["batches"]:
        mode = batch["mode"]
        context = b"OPRFV1-" + bytes([batch["modeByte"]]) + b"-P256-SHA256"
        study_id = batch["studyId"]
        info = bytes.fromhex(batch["publicInfoHex"])
        public_key = deserialize(bytes.fromhex(batch["publicKeyHex"]))
        inputs = [bytes.fromhex(value) for value in batch["inputsHex"]]
        blinds = [int(value, 16) for value in batch["blindsHex"]]
        blinded = [deserialize(bytes.fromhex(value)) for value in batch["blindedElementsHex"]]
        evaluated = [deserialize(bytes.fromhex(value)) for value in batch["evaluatedElementsHex"]]
        outputs = [bytes.fromhex(value) for value in batch["outputsHex"]]
        proof = bytes.fromhex(batch["proofHex"])

        shape_valid = len(set(map(len, [inputs, blinds, blinded, evaluated, outputs, batch["eventIds"], batch["packageIds"]]))) == 1
        expected_inputs = [expected_input(mode, study_id, packages[package_id]) for package_id in batch["packageIds"]]
        inputs_scoped = inputs == expected_inputs and info == expected_info(mode, study_id)
        blinded_relations = [multiply(blind, hash_to_group(private_input, context)) == point for private_input, blind, point in zip(inputs, blinds, blinded)]

        if mode == "VOPRF":
            proof_valid = verify_proof(public_key, blinded, evaluated, proof, context)
            wrong_context_valid = verify_proof(public_key, blinded, evaluated, proof, b"OPRFV1-\x02-P256-SHA256")
        else:
            tweaked_key = add(public_key, multiply(public_info_scalar(info, context), G))
            proof_valid = verify_proof(tweaked_key, evaluated, blinded, proof, context)
            wrong_context_valid = verify_proof(tweaked_key, evaluated, blinded, proof, b"OPRFV1-\x01-P256-SHA256")
        mutated = proof[:-1] + bytes([proof[-1] ^ 1])
        if mode == "VOPRF":
            mutated_rejected = not verify_proof(public_key, blinded, evaluated, mutated, context)
        else:
            mutated_rejected = not verify_proof(tweaked_key, evaluated, blinded, mutated, context)
        malformed_rejections += int(mutated_rejected) + int(not wrong_context_valid)

        computed_outputs = [finalize(item, info, blind, eval_point, mode) for item, blind, eval_point in zip(inputs, blinds, evaluated)]
        outputs_match = computed_outputs == outputs
        for package_id, output in zip(batch["packageIds"], outputs):
            observed[mode].setdefault(package_id, {}).setdefault(study_id, []).append(output.hex())
        batch_results.append({
            "mode": mode,
            "studyId": study_id,
            "events": len(inputs),
            "shapeValid": shape_valid,
            "inputsAndInfoMatchSealedCorpus": inputs_scoped,
            "allBlindedInputRelationsMatch": all(blinded_relations),
            "dleqProofValid": proof_valid,
            "outputsMatch": outputs_match,
            "mutatedProofRejected": mutated_rejected,
            "wrongModeContextRejected": not wrong_context_valid,
        })

    mode_metrics = []
    for mode, package_map in observed.items():
        duplicate_comparisons = 0
        duplicate_matches = 0
        false_collisions = 0
        cross_study_equalities = 0
        study_output_owner = {}
        for package_id, study_map in package_map.items():
            first_outputs = []
            for study_id, values in study_map.items():
                duplicate_comparisons += max(0, len(values) - 1)
                duplicate_matches += sum(value == values[0] for value in values[1:])
                first_outputs.append(values[0])
                owner_key = (study_id, values[0])
                previous = study_output_owner.setdefault(owner_key, package_id)
                if previous != package_id:
                    false_collisions += 1
            cross_study_equalities += len(first_outputs) - len(set(first_outputs))
        mode_metrics.append({
            "mode": mode,
            "duplicateComparisons": duplicate_comparisons,
            "duplicateMatches": duplicate_matches,
            "differentPackageFalseCollisions": false_collisions,
            "crossStudyOutputEqualities": cross_study_equalities,
        })

    checks = {
        "precommit_seed_matches_reveal": commitment == precommit["seedCommitment"] == reveal["seedCommitment"],
        "one_hundred_package_payloads_reconstruct": len(packages) == 100 and package_hashes_valid,
        "all_revealed_events_have_transcript_rows": sum(len(study["events"]) for study in reveal["studies"]) * 2 == sum(item["events"] for item in batch_results),
        "official_vectors_validate_hash_to_group": official_hash_to_group_self_test(),
        "all_batch_shapes_valid": all(item["shapeValid"] for item in batch_results),
        "all_inputs_and_info_match_sealed_design": all(item["inputsAndInfoMatchSealedCorpus"] for item in batch_results),
        "all_blinded_input_relations_match": all(item["allBlindedInputRelationsMatch"] for item in batch_results),
        "all_eight_dleq_proofs_verify": len(batch_results) == 8 and all(item["dleqProofValid"] for item in batch_results),
        "all_920_finalize_outputs_match": all(item["outputsMatch"] for item in batch_results),
        "all_mutated_proofs_and_context_swaps_reject": malformed_rejections == 16,
        "duplicate_recall_complete": all(item["duplicateMatches"] == item["duplicateComparisons"] == 60 for item in mode_metrics),
        "different_package_collisions_zero": all(item["differentPackageFalseCollisions"] == 0 for item in mode_metrics),
        "cross_study_output_equalities_zero": all(item["crossStudyOutputEqualities"] == 0 for item in mode_metrics),
        "circl_result_reported_pass": circl_result["passed"],
    }
    result = {
        "auditId": "INDEPENDENT-RC34-CIRCL-AUDIT-0.9",
        "computedOn": "2026-08-14",
        "passed": all(checks.values()),
        "checks": checks,
        "batchResults": batch_results,
        "modeMetrics": mode_metrics,
        "aggregateChecksPassed": sum(checks.values()),
        "aggregateChecksTotal": len(checks),
        "qualification": {
            "externalImplementation": "Cloudflare CIRCL v1.6.4",
            "independentArithmetic": "pure-Python P-256, XMD, simplified SWU, DLEQ, and Finalize path",
            "constantTime": "unqualified pure-Python audit code",
            "institutionalIndependence": "not established; both artifacts are maintained in this repository",
            "physicalPackages": "n=0",
        },
        "conclusion": "A separately written Python path reconstructs all sealed inputs, verifies every blind relation and eight batched DLEQ proofs, and matches all 920 CIRCL outputs. Study scope changes every package output across studies in both modes; POPRF makes that scope public to the server while VOPRF keeps it in the private input.",
    }
    output = REPRO / "rc34-circl-python-audit.json"
    if "--write" in sys.argv:
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    elif read_json(output) != result:
        raise SystemExit("RC34 independent CIRCL audit differs from committed artifact")
    print(f"RC34 independent CIRCL audit: {sum(checks.values())}/{len(checks)} checks; {len(batch_results)} batch proofs and {sum(item['events'] for item in batch_results)} outputs adjudicated.")
    if not result["passed"]:
        failed = [name for name, value in checks.items() if not value]
        raise SystemExit("Failed checks: " + ", ".join(failed))


if __name__ == "__main__":
    main()
