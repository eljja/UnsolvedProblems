import gzip
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = Path(__file__).resolve()


def read_json(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def canonical(value):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Non-finite numbers are outside the frozen canonical subset")
        if value.is_integer():
            return str(int(value))
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + canonical(value[key])
            for key in sorted(value)
        ) + "}"
    raise TypeError(type(value))


def sha256(value):
    if isinstance(value, bytes):
        payload = value
    elif isinstance(value, str):
        payload = value.encode("utf-8")
    else:
        payload = canonical(value).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def without(value, *keys):
    return {key: item for key, item in value.items() if key not in keys}


def parse_time(value):
    from datetime import datetime
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000


def same(left, right):
    return canonical(left) == canonical(right)


def json_type(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    return "unknown"


def validate(schema, value, pointer="$"):
    import re
    errors = []
    if "const" in schema and not same(value, schema["const"]):
        errors.append({"pointer": pointer, "keyword": "const"})
    if "enum" in schema and not any(same(value, candidate) for candidate in schema["enum"]):
        errors.append({"pointer": pointer, "keyword": "enum"})
    allowed = schema.get("type")
    allowed = allowed if isinstance(allowed, list) else [allowed] if allowed else None
    actual = json_type(value)
    if allowed and not any(kind == actual or (kind == "number" and actual == "integer") for kind in allowed):
        errors.append({"pointer": pointer, "keyword": "type"})
        return errors
    if isinstance(value, str):
        if schema.get("pattern") and re.search(schema["pattern"], value) is None:
            errors.append({"pointer": pointer, "keyword": "pattern"})
        if schema.get("format") == "date-time":
            try:
                parse_time(value)
            except ValueError:
                errors.append({"pointer": pointer, "keyword": "format"})
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if schema.get("minimum") is not None and value < schema["minimum"]:
            errors.append({"pointer": pointer, "keyword": "minimum"})
        if schema.get("maximum") is not None and value > schema["maximum"]:
            errors.append({"pointer": pointer, "keyword": "maximum"})
    if isinstance(value, list):
        if schema.get("minItems") is not None and len(value) < schema["minItems"]:
            errors.append({"pointer": pointer, "keyword": "minItems"})
        if schema.get("maxItems") is not None and len(value) > schema["maxItems"]:
            errors.append({"pointer": pointer, "keyword": "maxItems"})
        if schema.get("uniqueItems") and len({canonical(item) for item in value}) != len(value):
            errors.append({"pointer": pointer, "keyword": "uniqueItems"})
        if schema.get("items"):
            for index, item in enumerate(value):
                errors.extend(validate(schema["items"], item, f"{pointer}/{index}"))
    if isinstance(value, dict):
        for required in schema.get("required", []):
            if required not in value:
                errors.append({"pointer": f"{pointer}/{required}", "keyword": "required"})
        for key, child in value.items():
            if key in schema.get("properties", {}):
                errors.extend(validate(schema["properties"][key], child, f"{pointer}/{key}"))
            elif schema.get("additionalProperties") is False:
                errors.append({"pointer": f"{pointer}/{key}", "keyword": "additionalProperties"})
    return errors


PROTOCOL = read_json("research/reproducibility/unseen-attestation-protocol.json")
SCHEMA_NAMES = ["evidence", "trace", "registry", "revocation", "ledger", "timestampRecord", "packageCommitment"]
SCHEMAS = {
    name: read_json(path)
    for name, path in zip(SCHEMA_NAMES, PROTOCOL["inputContract"]["structuralSchemas"])
}


def structural(bundle):
    errors = []
    for document, schema in SCHEMAS.items():
        for error in validate(schema, bundle[document]):
            errors.append({"document": document, **error})
    return errors


def structure_code(error):
    aliases = {"timestampRecord": "TIMESTAMP", "packageCommitment": "PACKAGE"}
    document = aliases.get(error["document"], error["document"].upper())
    return f"S_{document}_{error['keyword'].upper()}"


def timestamp_payload(bundle):
    return {
        "policyDigest": bundle["policy"]["digest"],
        "evidenceDigest": bundle["evidence"]["demonstrationIntegrity"]["digest"],
        "traceHead": bundle["trace"]["headDigest"],
        "registryDigest": bundle["registry"]["registryDigest"],
        "revocationDigest": bundle["revocation"]["snapshotDigest"],
        "ledgerDigest": bundle["ledger"]["ledgerDigest"],
        "packageCommitment": bundle["packageCommitment"]["commitment"],
    }


def adjudicate(bundle):
    schema_errors = structural(bundle)
    if schema_errors:
        codes = []
        for error in schema_errors:
            code = structure_code(error)
            if code not in codes:
                codes.append(code)
        return {"verdict": "reject-structure", "firstCode": codes[0], "allCodes": codes}

    codes = []

    def add(code):
        if code not in codes:
            codes.append(code)

    adjudicated_at = parse_time(bundle["manifest"]["adjudicatedAt"])
    evidence_at = parse_time(bundle["evidence"]["issuedAt"])
    policy_digest = sha256(without(bundle["policy"], "digest"))
    evidence_payload = without(bundle["evidence"], "demonstrationIntegrity")
    integrity = bundle["evidence"]["demonstrationIntegrity"]
    expected_evidence = sha256(canonical(evidence_payload) + ":" + bundle["evidence"]["attester"]["keyId"])
    if integrity["digest"] != expected_evidence or integrity["keyId"] != bundle["evidence"]["attester"]["keyId"]:
        add("E_EVIDENCE_INTEGRITY")
    if evidence_at > adjudicated_at:
        add("E_EVIDENCE_FUTURE")
    elif (adjudicated_at - evidence_at) / 1000 > bundle["policy"]["maximumEvidenceAgeSeconds"]:
        add("E_EVIDENCE_AGE")
    if bundle["evidence"]["counter"] <= bundle["policy"]["minimumCounter"]:
        add("E_COUNTER_FRESHNESS")
    if bundle["evidence"]["nonce"] != bundle["policy"]["nonce"]:
        add("E_NONCE_FRESHNESS")
    target = bundle["evidence"]["target"]
    if target["packageId"] != bundle["evidence"]["attester"]["instanceId"] or bundle["trace"]["subject"]["packageId"] != target["packageId"] or target["componentId"] not in bundle["trace"]["subject"]["componentIds"]:
        add("E_TARGET_BINDING")

    previous = None
    previous_time = None
    for index, event in enumerate(bundle["trace"]["events"]):
        event_digest = sha256(without(event, "eventDigest", "statementDigest"))
        if event["sequence"] != index + 1 or event["previousDigest"] != previous or event["eventDigest"] != event_digest or event["statementDigest"] != sha256({"eventDigest": event["eventDigest"], "actorId": event["actorId"]}):
            add("E_TRACE_LINK")
        event_time = parse_time(event["occurredAt"])
        if previous_time is not None and event_time <= previous_time:
            add("E_TRACE_TIME")
        previous = event["eventDigest"]
        previous_time = event_time
    if bundle["trace"]["headDigest"] != previous or bundle["evidence"]["traceHead"] != previous or bundle["evidence"]["measurements"][1]["value"] != previous:
        add("E_TRACE_HEAD")
    receipt = bundle["trace"]["receipt"]
    if receipt["statementDigest"] != bundle["trace"]["events"][-1]["statementDigest"] or receipt["receiptDigest"] != sha256(without(receipt, "receiptDigest")):
        add("E_TRACE_RECEIPT")
    if parse_time(receipt["issuedAt"]) < parse_time(bundle["trace"]["events"][-1]["occurredAt"]):
        add("E_TRACE_RECEIPT_TIME")

    registry = bundle["registry"]
    if registry["registryDigest"] != sha256(without(registry, "registryDigest")):
        add("E_REFERENCE_DIGEST")
    if bundle["evidence"]["referenceVersion"] != registry["version"] or bundle["evidence"]["referenceVersion"] != bundle["policy"]["referenceVersion"]:
        add("E_REFERENCE_VERSION")
    if evidence_at < parse_time(registry["validity"]["notBefore"]) or evidence_at > parse_time(registry["validity"]["notAfter"]):
        add("E_REFERENCE_VALIDITY")
    if bundle["evidence"]["attester"]["endorserId"] != "ORG-VENDOR-GAMMA" or registry["authority"]["competence"] != "chiplet-physical-reference-provider":
        add("E_AUTHORITY_SCOPE")

    revocation = bundle["revocation"]
    if revocation["snapshotDigest"] != sha256(without(revocation, "snapshotDigest")):
        add("E_REVOCATION_DIGEST")
    if parse_time(revocation["issuedAt"]) > adjudicated_at:
        add("E_REVOCATION_FUTURE")
    if parse_time(revocation["nextUpdate"]) <= adjudicated_at:
        add("E_REVOCATION_STALE")
    for entry in revocation["revoked"]:
        if parse_time(entry["effectiveAt"]) <= adjudicated_at:
            if entry["objectType"] == "attestation-key" and entry["objectId"] == bundle["evidence"]["attester"]["keyId"]:
                add("Q_KEY_REVOKED")
            if entry["objectType"] == "reference-registry" and entry["objectId"] == registry["registryId"]:
                add("Q_REFERENCE_REVOKED")

    if bundle["policy"]["digest"] != policy_digest or bundle["evidence"]["policyDigest"] != policy_digest or registry["policyDigest"] != policy_digest or bundle["ledger"]["policyDigest"] != policy_digest:
        add("A_POLICY_DIGEST")
    if bundle["manifest"]["committedPolicyDigest"] != policy_digest:
        add("A_POLICY_COMMITMENT")
    timeline = [bundle["policy"]["frozenAt"], bundle["ledger"]["hiddenVendorCommittedAt"], bundle["ledger"]["frozenAt"], bundle["ledger"]["hiddenVendorRevealedAt"]]
    timeline = [parse_time(value) for value in timeline]
    if not (timeline[0] < timeline[1] < timeline[2] < timeline[3]):
        add("A_TIMELINE_ORDER")
    ledger = bundle["ledger"]
    if ledger["ledgerDigest"] != sha256(without(ledger, "ledgerDigest")):
        add("A_LEDGER_DIGEST")
    units = ledger["units"]
    if len({unit["unitId"] for unit in units}) != len(units):
        add("A_UNIT_DUPLICATE")
    if len({unit["physicalPackageDigest"] for unit in units}) != len(units):
        add("A_INDEPENDENT_UNIT")
    if len({unit["acquisitionId"] for unit in units}) != len(units):
        add("A_ACQUISITION_DUPLICATE")
    if any(unit["clusterId"] != f"CL-{unit['vendorCode']}-{unit['processFamily']}-{unit['lot']}" for unit in units):
        add("A_CLUSTER_MAPPING")
    class_counts = {}
    cell_counts = {}
    for unit in units:
        class_counts[unit["class"]] = class_counts.get(unit["class"], 0) + 1
        key = (unit["class"], unit["vendorCode"], unit["processFamily"], unit["lot"])
        cell_counts[key] = cell_counts.get(key, 0) + 1
    if len(units) != 1530 or any(class_counts.get(name) != 306 for name in ledger["classes"]) or len(cell_counts) != 90 or any(count != 17 for count in cell_counts.values()):
        add("A_CELL_BALANCE")

    timestamp = bundle["timestampRecord"]
    if timestamp["payloadDigest"] != sha256(timestamp_payload(bundle)):
        add("A_TIMESTAMP_QUALIFICATION")
    if timestamp["qualification"] == "rfc3161-verified":
        token = timestamp["rfc3161"]
        if not token["policyOid"] or token["messageImprint"] != timestamp["payloadDigest"] or not token["genTime"] or not token["serialNumber"] or not token["tokenBase64"] or not token["tsaCertificateChainDigest"]:
            add("A_TIMESTAMP_QUALIFICATION")
    package = bundle["packageCommitment"]
    if package["studyId"] != bundle["manifest"]["studyId"]:
        add("Q_COMMITMENT_SCOPE")
    if package["algorithm"] != "hmac-sha-256":
        add("Q_COMMITMENT_PRIVACY")

    counter = bundle["manifest"].get("counterWorld")
    if not codes and counter and counter["worldACommitment"] != counter["worldBCommitment"] and counter["observationDigestA"] == counter["observationDigestB"]:
        add("I_COUNTERWORLD_COLLISION")
    if any(code.startswith("A_") for code in codes):
        verdict = "invalidate-adjudication"
    elif any(code.startswith("Q_") for code in codes):
        verdict = "quarantine"
    elif any(code.startswith("I_") for code in codes):
        verdict = "accept-contract-indistinguishable"
    elif codes:
        verdict = "reject-semantic"
    else:
        verdict = "accept-contract"
    return {"verdict": verdict, "firstCode": codes[0] if codes else None, "allCodes": codes}


def main():
    compressed = (ROOT / "research/reproducibility/unseen-attestation-corpus.json.gz").read_bytes()
    corpus = json.loads(gzip.decompress(compressed).decode("utf-8"))
    predictions = []
    for item in corpus["cases"]:
        predictions.append({
            "caseId": item["caseId"],
            **adjudicate(item["bundle"]),
            "timestampQualification": item["bundle"]["timestampRecord"]["qualification"],
            "privacyQualification": item["bundle"]["packageCommitment"]["privacyQualification"],
        })
    output = {
        "predictionSetId": "UNSEEN-ATTESTATION-PYTHON-PREDICTIONS-0.6",
        "implementation": "python-independent-semantic-adjudicator",
        "computedOn": "2026-08-14",
        "protocolId": PROTOCOL["protocolId"],
        "corpusSha256": sha256(compressed),
        "implementationSha256": sha256(SCRIPT.read_bytes()),
        "expectedOutcomesRead": False,
        "oldFixtureCatalogueRead": False,
        "predictions": predictions,
        "predictionDigest": sha256(predictions),
        "limitations": "Custom Draft 2020-12 assertion subset and repository-local semantics; not an independent production parser or trusted timestamp verifier.",
    }
    output_path = ROOT / "research/reproducibility/unseen-attestation-python-predictions.json"
    if "--write" in sys.argv:
        output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    elif canonical(read_json("research/reproducibility/unseen-attestation-python-predictions.json")) != canonical(output):
        raise SystemExit("Python predictions differ from the committed pre-reveal output.")
    print(f"RC31 Python pre-reveal prediction committed in memory: {len(predictions)} cases, digest {output['predictionDigest']}.")


if __name__ == "__main__":
    main()
