import copy
import hashlib
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"
WRITE = "--write" in sys.argv


def load_json(name):
    with (REPRO / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


contract = load_json("rc60-preflight-contract.json")
fixture_spec = load_json("rc60-preflight-fixtures.json")
rc59 = load_json("rc59-48-cell-manifest-python.json")

TOP_LEVEL_KEYS = sorted([
    "profile", "cycleId", "evaluationContext", "domain", "allocation", "specimenLineage",
    "resources", "failureContainment", "owners", "margins", "safety", "acuteSentinel",
    "expansionObserver", "outcomeIsolation"
])
DOMAIN_KEYS = [
    "conditionId", "chemistry", "cellDesign", "manufacturingLotDefinition", "formationRecipeId",
    "temperatureSetpointAndTolerance", "chargeProtocolId", "dischargeProtocolId", "voltageWindow",
    "endpointDefinitionId"
]
METRICS = ["LIFE", "TMAX", "QTHRU", "DZ"]
OWNER_ROLES = ["domain", "metrology", "safety", "adjudication"]
EXPECTED_ALLOCATION_HASH = "E03D97B2F4EA042E6D4023A3E5595A224DF59DD83636048AA953A8CEACEF1540"
SAFE = 9_007_199_254_740_991


def canonical(value):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int) and not isinstance(value, bool):
        if abs(value) > SAFE:
            raise ValueError("RC60 canonical profile accepts safe integers only")
        return str(value)
    if isinstance(value, float):
        raise ValueError("RC60 canonical profile rejects floating-point numbers")
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False, separators=(",", ":")) + ":" + canonical(value[key])
            for key in sorted(value)
        ) + "}"
    raise ValueError(f"Unsupported canonical type: {type(value)}")


def snapshot_canonical(value):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Invalid-input snapshot rejects NaN and Infinity")
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(snapshot_canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False, separators=(",", ":")) + ":" + snapshot_canonical(value[key])
            for key in sorted(value)
        ) + "}"
    raise ValueError(f"Unsupported snapshot type: {type(value)}")


def digest(value, snapshot=False):
    text = snapshot_canonical(value) if snapshot else canonical(value)
    return hashlib.sha256(text.encode("utf-8")).hexdigest().upper()


def allocation_projection(item):
    return {
        "specimenId": item["specimenId"],
        "manufacturingBlockId": item["manufacturingBlockId"],
        "conditionId": item["conditionId"],
        "startWave": item["startWave"],
        "chamberId": item["chamberId"],
        "fixtureGroupId": item["fixtureGroupId"],
        "channelPosition": item["channelPosition"],
        "channelId": item["channelId"]
    }


expected_allocation = [allocation_projection(item) for item in rc59["allocation"]]


def containment(records):
    definitions = [
        ("chamberId", lambda item: item["chamberId"]),
        ("fixtureGroupId", lambda item: item["fixtureGroupId"]),
        ("startWave", lambda item: str(item["startWave"])),
        ("manufacturingBlockId", lambda item: item["manufacturingBlockId"]),
        ("channelId", lambda item: item["channelId"]),
        ("chamberFixture", lambda item: item["chamberId"] + "|" + item["fixtureGroupId"])
    ]
    result = {}
    for name, getter in definitions:
        counts = {}
        for record in records:
            key = getter(record)
            counts[key] = counts.get(key, 0) + 1
        largest = max(counts.values())
        result[name] = {
            "domainCount": len(counts),
            "largestDomainSize": largest,
            "usableAfterWorstSingleDomainLoss": len(records) - largest
        }
    return result


def set_path(target, parts, value):
    cursor = target
    for part in parts[:-1]:
        cursor = cursor[part]
    cursor[parts[-1]] = copy.deepcopy(value)


def delete_path(target, parts):
    cursor = target
    for part in parts[:-1]:
        cursor = cursor[part]
    del cursor[parts[-1]]


def apply_mutations(base, mutations):
    value = copy.deepcopy(base)
    for mutation in mutations:
        if mutation["op"] == "set":
            set_path(value, mutation["path"], mutation["value"])
        elif mutation["op"] == "delete":
            delete_path(value, mutation["path"])
        else:
            raise ValueError("Unknown fixture mutation: " + mutation["op"])
    return value


def has_only_safe_integers(value):
    if value is None or isinstance(value, (str, bool)):
        return True
    if isinstance(value, int):
        return abs(value) <= SAFE
    if isinstance(value, float):
        return False
    if isinstance(value, list):
        return all(has_only_safe_integers(item) for item in value)
    if isinstance(value, dict):
        return all(has_only_safe_integers(item) for item in value.values())
    return False


def gate_checks(bundle):
    def g00():
        context = bundle.get("evaluationContext", {})
        return (
            bundle.get("profile") == "RC60-PREFLIGHT-BUNDLE-1.0"
            and bundle.get("cycleId") == "RC-2026-60"
            and context.get("mode") in ["synthetic-test", "physical"]
            and context.get("synthetic") == (context.get("mode") == "synthetic-test")
            and context.get("targetStage") == "preflight"
            and context.get("evaluatedAt") == "2026-08-29T00:00:00Z"
        )

    def g01():
        return sorted(bundle.keys()) == TOP_LEVEL_KEYS and has_only_safe_integers(bundle)

    def g02():
        domain = bundle.get("domain", {})
        values_ok = all(
            isinstance(domain.get(key), str)
            and len(domain[key]) > 0
            and all(token not in domain[key].upper() for token in ["TO_BE", "PLACEHOLDER", "TBD"])
            for key in DOMAIN_KEYS
        )
        projection = {key: domain.get(key) for key in DOMAIN_KEYS}
        return values_ok and domain.get("commitmentSha256") == digest(projection)

    def g03():
        allocation = bundle.get("allocation", {})
        return (
            allocation.get("algorithmVersion") == "rc59-v1"
            and allocation.get("allocationHashSha256") == EXPECTED_ALLOCATION_HASH
            and canonical(allocation.get("records")) == canonical(expected_allocation)
        )

    def g04():
        rows = bundle.get("specimenLineage", [])
        serials = [item.get("physicalSerialId") for item in rows]
        assignments = [item.get("assignmentSpecimenId") for item in rows]
        expected_ids = [item["specimenId"] for item in expected_allocation]
        physical_identifiers_are_real = bundle["evaluationContext"]["mode"] != "physical" or all(
            not str(item).upper().startswith("SYNTHETIC-") for item in serials
        )
        return (
            len(rows) == 48
            and len(set(serials)) == 48
            and len(set(assignments)) == 48
            and sorted(assignments) == sorted(expected_ids)
            and physical_identifiers_are_real
            and all(isinstance(item.get("serialCommitmentSha256"), str) and len(item["serialCommitmentSha256"]) == 64 and all(character in "ABCDEF0123456789" for character in item["serialCommitmentSha256"]) for item in rows)
        )

    def g05():
        resources = bundle.get("resources", {})

        def ready(items):
            return isinstance(items, list) and all(
                item.get("status") == "ready"
                and item.get("calibrationStatus") == "current"
                and item.get("calibrationId")
                and item.get("configurationId")
                for item in items
            )

        if not all(ready(resources.get(name)) for name in ["chambers", "fixtures", "channels"]):
            return False
        chambers = {item["id"] for item in resources["chambers"]}
        fixtures = {item["id"] for item in resources["fixtures"]}
        channels = {item["id"] for item in resources["channels"]}
        return all(
            item["chamberId"] in chambers
            and item["chamberId"] + "-" + item["fixtureGroupId"] in fixtures
            and item["channelId"] in channels
            for item in bundle["allocation"]["records"]
        )

    def g06():
        submitted = bundle.get("failureContainment", {})
        return (
            canonical(submitted) == canonical(containment(bundle["allocation"]["records"]))
            and min(item["usableAfterWorstSingleDomainLoss"] for item in submitted.values()) >= 24
        )

    def g07():
        rows = bundle.get("owners", [])
        return (
            len(rows) == 4
            and sorted(item.get("role") for item in rows) == sorted(OWNER_ROLES)
            and len({item.get("ownerId") for item in rows}) == 4
            and all(item.get("ownerId") and item.get("attestationId") and item.get("status") == "signed-reference-present-not-cryptographically-verified" for item in rows)
        )

    def g08():
        rows = bundle.get("margins", [])
        return (
            len(rows) == 4
            and [item.get("metric") for item in rows] == METRICS
            and all(
                item.get("scale")
                and item.get("ownerAttestationId") == "SYNTHETIC-ATTESTATION-METROLOGY"
                and item["u95Scaled"] < item["marginScaled"]
                and item["marginScaled"] <= min(item["scientificLimitScaled"], item["safetyLimitScaled"])
                for item in rows
            )
        )

    def g09():
        safety = bundle.get("safety", {})
        keys = ["hazardReviewId", "sopId", "electricalLimitsId", "ventingControlId", "thermalMonitoringId", "fireResponseId", "emergencyStopId", "disposalPlanId", "ownerAttestationId"]
        return safety.get("status") == "approved-reference-present-not-externally-verified" and all(isinstance(safety.get(key), str) and len(safety[key]) > 0 for key in keys)

    def g10():
        sentinel = bundle.get("acuteSentinel", {})
        ids = sentinel.get("specimenSerialIds", [])
        confirmation_ids = {item.get("physicalSerialId") for item in bundle.get("specimenLineage", [])}
        receipt = sentinel.get("receiptSha256", "")
        return (
            sentinel.get("status") == "passed-synthetic-fixture-only"
            and sentinel.get("claimScope") == "acute-large-effect-and-safety-screen-only-not-lifetime-equivalence"
            and len(ids) == 12
            and len(set(ids)) == 12
            and all(item not in confirmation_ids for item in ids)
            and sentinel.get("safetyEvents") == 0
            and sentinel.get("materialCarryoverDetected") is False
            and isinstance(receipt, str) and len(receipt) == 64 and all(character in "ABCDEF0123456789" for character in receipt)
        )

    def g11():
        observer = bundle.get("expansionObserver", {})
        if observer.get("enabled") is False:
            return observer.get("qualificationStatus") == "excluded-before-confirmation" and isinstance(observer.get("exclusionReason"), str) and len(observer["exclusionReason"]) > 0
        receipt = observer.get("qualificationReceiptSha256", "")
        return (
            observer.get("enabled") is True
            and observer.get("qualificationStatus") == "qualified"
            and observer["u95ExpScaled"] < observer["marginExpScaled"]
            and observer["marginExpScaled"] <= observer["minimumDetectableContrastScaled"]
            and isinstance(receipt, str) and len(receipt) == 64 and all(character in "ABCDEF0123456789" for character in receipt)
        )

    def g12():
        isolation = bundle.get("outcomeIsolation", {})
        ledger = isolation.get("accessLedgerSha256", "")
        return (
            isolation.get("storeStatus") == "closed"
            and isolation.get("designRoleAccess") is False
            and isolation.get("outcomeValuesPresent") is False
            and isinstance(ledger, str) and len(ledger) == 64 and all(character in "ABCDEF0123456789" for character in ledger)
        )

    def g13():
        return bundle["evaluationContext"].get("requestedCapability") in ["preflight-only", "independent-authorization-candidate"]

    return {
        "G00-CONTEXT": g00,
        "G01-CLOSED-PROFILE": g01,
        "G02-FROZEN-DOMAIN": g02,
        "G03-ALLOCATION-COMMITMENT": g03,
        "G04-SPECIMEN-LINEAGE": g04,
        "G05-RESOURCE-READINESS": g05,
        "G06-FAILURE-CONTAINMENT": g06,
        "G07-ACCOUNTABLE-OWNERS": g07,
        "G08-MARGIN-IDENTIFIABILITY": g08,
        "G09-SAFETY-READINESS": g09,
        "G10-ACUTE-SENTINEL": g10,
        "G11-EXPANSION-OBSERVER": g11,
        "G12-OUTCOME-ISOLATION": g12,
        "G13-CAPABILITY-CEILING": g13
    }


def evaluate(case_id, bundle):
    checks = gate_checks(bundle)
    evaluated_gates = []
    first_failed_gate = None
    retry_condition = None
    for gate in contract["gateOrder"]:
        try:
            passed = bool(checks[gate["id"]]())
        except (KeyError, TypeError, ValueError, AttributeError):
            passed = False
        evaluated_gates.append({
            "id": gate["id"],
            "status": "pass" if passed else "fail",
            "detail": gate["pass"] if passed else gate["question"]
        })
        if not passed:
            first_failed_gate = gate["id"]
            retry_condition = gate["retry"]
            break
    if first_failed_gate:
        verdict = contract["receiptSemantics"]["failure"]
    elif bundle["evaluationContext"]["mode"] == "synthetic-test":
        verdict = contract["receiptSemantics"]["syntheticPass"]
    else:
        verdict = contract["receiptSemantics"]["physicalPass"]
    safe_profile = has_only_safe_integers(bundle)
    payload = {
        "receiptProfile": "RC60-PREFLIGHT-RECEIPT-1.0",
        "cycleId": "RC-2026-60",
        "caseId": case_id,
        "evaluatedAt": bundle.get("evaluationContext", {}).get("evaluatedAt", "2026-08-29T00:00:00Z"),
        "bundleHashSha256": digest(bundle, snapshot=not safe_profile),
        "bundleHashProfile": contract["canonicalizationProfile"]["name"] if safe_profile else "RC60-INVALID-INPUT-SNAPSHOT-1",
        "contractHashSha256": digest(contract),
        "gateOrderHashSha256": digest([gate["id"] for gate in contract["gateOrder"]]),
        "verdict": verdict,
        "firstFailedGate": first_failed_gate,
        "retryCondition": retry_condition,
        "evaluatedGates": evaluated_gates,
        "physicalAuthorization": False,
        "claimBoundary": "Content-addressed software preflight only; no owner authenticity, trusted time, laboratory existence, safety validity, or physical result is established."
    }
    payload["receiptHashSha256"] = digest(payload)
    return payload


receipts = []
for test_case in fixture_spec["cases"]:
    bundle = apply_mutations(fixture_spec["baseBundle"], test_case["mutations"])
    receipt = evaluate(test_case["id"], bundle)
    if receipt["firstFailedGate"] != test_case["expectedFirstFailedGate"]:
        raise AssertionError(f"{test_case['id']}: expected {test_case['expectedFirstFailedGate']}, got {receipt['firstFailedGate']}")
    receipts.append(receipt)

output = {
    "resultId": "RC60-PREFLIGHT-PYTHON-RESULT-1.0",
    "cycleId": "RC-2026-60",
    "implementation": "dependency-free-python",
    "generatedOn": "2026-08-29",
    "fixtureSpecHashSha256": digest(fixture_spec, snapshot=True),
    "contractHashSha256": digest(contract),
    "cases": receipts,
    "summary": {
        "cases": len(receipts),
        "syntheticPasses": sum(item["verdict"] == contract["receiptSemantics"]["syntheticPass"] for item in receipts),
        "refusals": sum(item["verdict"] == contract["receiptSemantics"]["failure"] for item in receipts),
        "physicalAuthorizations": sum(item["physicalAuthorization"] for item in receipts),
        "rc59PlanningFirstFailure": next(item for item in receipts if item["caseId"] == "RC59-PLANNING-PHYSICAL")["firstFailedGate"]
    },
    "claimBoundary": contract["claimBoundary"]
}

if WRITE:
    with (REPRO / "rc60-preflight-python.json").open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(output, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

print(json.dumps(output["summary"], separators=(",", ":")))
