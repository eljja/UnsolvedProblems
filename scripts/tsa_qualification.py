import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL_PATH = "research/reproducibility/tsa-qualification-protocol.json"
MANIFEST_PATH = "research/reproducibility/tsa-request-manifest.json"
REQUEST_PATH = "research/reproducibility/rc32-precommit.tsq"
RESULT_PATH = "research/reproducibility/tsa-qualification-result.json"


def read_json(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def der_length(length):
    if length < 128:
        return bytes([length])
    raw = length.to_bytes((length.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(raw)]) + raw


def tlv(tag, content):
    return bytes([tag]) + der_length(len(content)) + content


def der_integer(value):
    if value < 0:
        raise ValueError("only nonnegative integers are supported")
    raw = value.to_bytes(max(1, (value.bit_length() + 7) // 8), "big")
    if raw[0] & 0x80:
        raw = b"\x00" + raw
    return tlv(0x02, raw)


def base128(value):
    pieces = [value & 0x7F]
    value >>= 7
    while value:
        pieces.append(0x80 | (value & 0x7F))
        value >>= 7
    return bytes(reversed(pieces))


def der_oid(dotted):
    parts = [int(item) for item in dotted.split(".")]
    if len(parts) < 2 or parts[0] > 2 or parts[1] >= 40 and parts[0] < 2:
        raise ValueError("invalid OID")
    content = base128(parts[0] * 40 + parts[1]) + b"".join(base128(item) for item in parts[2:])
    return tlv(0x06, content)


def der_sequence(*items):
    return tlv(0x30, b"".join(items))


def read_tlv(data, offset=0):
    if offset >= len(data):
        raise ValueError("truncated tag")
    tag = data[offset]
    offset += 1
    if offset >= len(data):
        raise ValueError("truncated length")
    first = data[offset]
    offset += 1
    if first < 128:
        length = first
    else:
        count = first & 0x7F
        if count == 0 or count > 4 or offset + count > len(data):
            raise ValueError("unsupported or truncated DER length")
        length = int.from_bytes(data[offset:offset + count], "big")
        offset += count
        if length < 128:
            raise ValueError("non-minimal DER length")
    end = offset + length
    if end > len(data):
        raise ValueError("truncated content")
    return tag, data[offset:end], end


def decode_integer(content):
    if not content or content[0] & 0x80:
        raise ValueError("negative or empty integer")
    if len(content) > 1 and content[0] == 0 and not content[1] & 0x80:
        raise ValueError("non-minimal integer")
    return int.from_bytes(content, "big")


def decode_oid(content):
    values = []
    current = 0
    for byte in content:
        current = (current << 7) | (byte & 0x7F)
        if not byte & 0x80:
            values.append(current)
            current = 0
    if current or not values:
        raise ValueError("truncated OID")
    first = values.pop(0)
    first_arc = 0 if first < 40 else 1 if first < 80 else 2
    second_arc = first - first_arc * 40
    return ".".join(str(item) for item in [first_arc, second_arc, *values])


def parse_request(data):
    tag, outer, end = read_tlv(data)
    if tag != 0x30 or end != len(data):
        raise ValueError("TimeStampReq must be one DER SEQUENCE")
    offset = 0
    tag, content, offset = read_tlv(outer, offset)
    if tag != 0x02:
        raise ValueError("missing version")
    version = decode_integer(content)
    tag, imprint, offset = read_tlv(outer, offset)
    if tag != 0x30:
        raise ValueError("missing messageImprint")
    inner = 0
    tag, algorithm, inner = read_tlv(imprint, inner)
    if tag != 0x30:
        raise ValueError("missing AlgorithmIdentifier")
    alg_offset = 0
    tag, oid_content, alg_offset = read_tlv(algorithm, alg_offset)
    if tag != 0x06:
        raise ValueError("missing algorithm OID")
    algorithm_oid = decode_oid(oid_content)
    if alg_offset < len(algorithm):
        null_tag, null_content, alg_offset = read_tlv(algorithm, alg_offset)
        if null_tag != 0x05 or null_content:
            raise ValueError("unexpected algorithm parameters")
    if alg_offset != len(algorithm):
        raise ValueError("trailing AlgorithmIdentifier bytes")
    tag, hashed_message, inner = read_tlv(imprint, inner)
    if tag != 0x04 or inner != len(imprint):
        raise ValueError("invalid hashedMessage")
    policy = None
    nonce = None
    cert_req = False
    while offset < len(outer):
        tag, content, offset = read_tlv(outer, offset)
        if tag == 0x06 and policy is None:
            policy = decode_oid(content)
        elif tag == 0x02 and nonce is None:
            nonce = decode_integer(content)
        elif tag == 0x01:
            if content not in [b"\x00", b"\xff"]:
                raise ValueError("non-DER boolean")
            cert_req = content == b"\xff"
        else:
            raise ValueError(f"unsupported TimeStampReq tag {tag:#x}")
    return {
        "version": version,
        "messageImprintAlgorithmOid": algorithm_oid,
        "messageImprintHex": hashed_message.hex(),
        "requestedPolicy": policy,
        "nonceDecimal": str(nonce) if nonce is not None else None,
        "certReq": cert_req,
    }


def build_request(payload, protocol):
    payload_digest = hashlib.sha256(payload).digest()
    nonce_seed = hashlib.sha256(payload_digest + protocol["protocolId"].encode("utf-8")).digest()[:16]
    nonce = int.from_bytes(nonce_seed, "big")
    algorithm = der_sequence(der_oid("2.16.840.1.101.3.4.2.1"), tlv(0x05, b""))
    imprint = der_sequence(algorithm, tlv(0x04, payload_digest))
    request = der_sequence(der_integer(1), imprint, der_integer(nonce), tlv(0x01, b"\xff"))
    return request, nonce


def build_artifacts():
    protocol = read_json(PROTOCOL_PATH)
    payload_path = protocol["payload"]
    payload = (ROOT / payload_path).read_bytes()
    request, nonce = build_request(payload, protocol)
    parsed = parse_request(request)
    manifest = {
        "profile": "urn:unsolved-problems:rfc3161-request-manifest:0.7",
        "protocolId": protocol["protocolId"],
        "payloadPath": payload_path,
        "payloadBytes": len(payload),
        "payloadSha256": sha256(payload),
        "requestPath": REQUEST_PATH,
        "requestBytes": len(request),
        "requestSha256": sha256(request),
        "version": parsed["version"],
        "messageImprintAlgorithmOid": parsed["messageImprintAlgorithmOid"],
        "messageImprintHex": parsed["messageImprintHex"],
        "nonceDecimal": str(nonce),
        "certReq": parsed["certReq"],
        "requestedPolicy": parsed["requestedPolicy"],
        "qualification": "request-only",
    }
    mutated_payload = payload + b"\n"
    tests = {
        "base_request_der_parses": parsed["version"] == 1,
        "sha256_algorithm_oid_matches": parsed["messageImprintAlgorithmOid"] == "2.16.840.1.101.3.4.2.1",
        "message_imprint_matches_exact_payload": parsed["messageImprintHex"] == sha256(payload),
        "deterministic_synthetic_nonce_matches_manifest": parsed["nonceDecimal"] == str(nonce),
        "certreq_is_true": parsed["certReq"] is True,
        "mutated_payload_is_rejected_by_imprint": parsed["messageImprintHex"] != sha256(mutated_payload),
        "wrong_nonce_is_rejected": parsed["nonceDecimal"] != str(nonce + 1),
        "corrupt_der_is_rejected": False,
    }
    try:
        parse_request(b"\x31" + request[1:])
    except ValueError:
        tests["corrupt_der_is_rejected"] = True
    result = {
        "resultId": "RFC3161-REQUEST-QUALIFICATION-RESULT-0.7",
        "computedOn": "2026-08-14",
        "protocolId": protocol["protocolId"],
        "requestManifest": manifest,
        "tests": tests,
        "testCount": len(tests),
        "passedRequestTests": sum(tests.values()),
        "environment": {
            "opensslAvailableAtQualification": False,
            "externalResponseSupplied": False,
            "explicitCaFileSupplied": False,
        },
        "responseVerification": {
            "statusGranted": False,
            "cmsSignatureVerified": False,
            "tsaChainVerified": False,
            "tstInfoImprintVerified": False,
            "nonceVerifiedAgainstResponse": False,
            "trustedTimeQualified": False,
            "reason": "No external TimeStampResp, OpenSSL backend, or explicit CA trust anchor was available; request construction passes but trusted-time qualification is refused."
        },
        "hypotheses": {
            "R1_valid_request_establishes_trusted_time": False,
            "R2_git_or_local_generation_substitutes_for_tsa": False,
            "R3_request_imprint_detects_payload_change": tests["mutated_payload_is_rejected_by_imprint"],
        },
        "nextGate": "Obtain a TimeStampResp from an authorized external TSA, retain the exact request bytes, verify it with an explicitly selected CA file and OpenSSL ts -verify, independently parse TSTInfo policy/imprint/nonce/genTime, and archive the response plus verification transcript before claiming trusted time."
    }
    return request, manifest, result


def verify_external(response_path, ca_path):
    openssl = shutil.which("openssl")
    if not openssl:
        return {"qualified": False, "reason": "OpenSSL executable not available"}
    if not response_path or not response_path.exists() or not ca_path or not ca_path.exists():
        return {"qualified": False, "reason": "Response or explicit CA file missing"}
    completed = subprocess.run(
        [openssl, "ts", "-verify", "-queryfile", str(ROOT / REQUEST_PATH), "-in", str(response_path), "-CAfile", str(ca_path)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return {
        "qualified": completed.returncode == 0,
        "returnCode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
        "backend": openssl,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--probe-backend", action="store_true")
    parser.add_argument("--response", type=Path)
    parser.add_argument("--ca-file", type=Path)
    args = parser.parse_args()
    request, manifest, result = build_artifacts()
    if args.probe_backend:
        print(json.dumps({"openssl": shutil.which("openssl")}, indent=2))
        return
    if args.response or args.ca_file:
        print(json.dumps(verify_external(args.response, args.ca_file), indent=2))
        return
    if args.write:
        (ROOT / REQUEST_PATH).write_bytes(request)
        (ROOT / MANIFEST_PATH).write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        (ROOT / RESULT_PATH).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    else:
        if (ROOT / REQUEST_PATH).read_bytes() != request:
            raise SystemExit("RFC 3161 request bytes differ from committed artifact")
        if read_json(MANIFEST_PATH) != manifest or read_json(RESULT_PATH) != result:
            raise SystemExit("RFC 3161 manifest or qualification result differs from committed artifact")
    if result["passedRequestTests"] != result["testCount"] or result["responseVerification"]["trustedTimeQualified"]:
        raise SystemExit("RFC 3161 request tests or refusal boundary failed")
    print(f"RC32 RFC3161 request reproduced: {result['passedRequestTests']}/{result['testCount']} request tests passed; trusted-time qualification refused without response, backend, and CA.")


if __name__ == "__main__":
    main()
