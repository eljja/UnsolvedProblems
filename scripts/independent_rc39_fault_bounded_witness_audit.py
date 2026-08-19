import json
from itertools import product
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULT = ROOT / "research/reproducibility/rc39-fault-bounded-witness-model-result.json"
OUTPUT = ROOT / "research/reproducibility/rc39-fault-bounded-witness-python-audit.json"
VALUES = (0, 1, 2)


def classify(worlds, observation):
    classes = {}
    for world in worlds:
        key = json.dumps(observation(world), sort_keys=True, separators=(",", ":"))
        classes.setdefault(key, set()).add(world["e"])
    collisions = {key: sorted(truths) for key, truths in classes.items() if len(truths) > 1}
    return {
        "worldCount": len(worlds),
        "observationCount": len(classes),
        "collisionCount": len(collisions),
        "identifiesExactEventCount": not collisions,
    }


def independent(n, f):
    worlds = []
    for event in VALUES:
        for witness in product(VALUES, repeat=n):
            faulty = sum(value != event for value in witness)
            if faulty <= f:
                worlds.append({"e": event, "witness": witness, "faulty": faulty})
    return worlds


def common_cause(n):
    return [{"e": event, "witness": (reported,) * n} for event in VALUES for reported in VALUES]


def run():
    expected = json.loads(RESULT.read_text(encoding="utf-8"))
    checks = []

    def check(code, condition, detail):
        checks.append({"code": code, "pass": bool(condition), "detail": detail})

    expected_arch = {item["name"]: item for item in expected["architectures"]}
    marker = classify([{"e": event, "marker": 1} for event in VALUES], lambda world: {"marker": world["marker"]})
    acceptance = classify([{"e": event, "accepted": 1} for event in (0, 1)], lambda world: {"accepted": world["accepted"]})
    resettable = classify(
        [{"e": event, "witness": (reported,)} for event in VALUES for reported in VALUES if reported <= event],
        lambda world: {"epoch": "current", "witness": world["witness"]},
    )
    nonce_only = classify(
        [{"e": event, "witness": (reported,)} for event in VALUES for reported in VALUES],
        lambda world: {"tokenEpoch": "current", "witness": world["witness"]},
    )
    event_epoch = classify(
        [{"e": event, "witness": (event,)} for event in VALUES],
        lambda world: {"tokenEpoch": "current", "measurementEpoch": "current", "witness": world["witness"]},
    )
    reconstructed = {
        "SOURCE_MARKER": marker,
        "COMMAND_ACCEPTANCE_BEFORE_ACTION": acceptance,
        "ONE_EVENT_BOUND_WITNESS_F0": classify(independent(1, 0), lambda world: {"witness": world["witness"]}),
        "ONE_EVENT_BOUND_WITNESS_F1": classify(independent(1, 1), lambda world: {"witness": world["witness"]}),
        "TWO_DIVERSE_WITNESSES_F1": classify(independent(2, 1), lambda world: {"witness": world["witness"]}),
        "THREE_DIVERSE_WITNESSES_F1": classify(independent(3, 1), lambda world: {"witness": world["witness"]}),
        "THREE_WITNESSES_COMMON_CAUSE": classify(common_cause(3), lambda world: {"witness": world["witness"]}),
        "SIGNED_CURRENT_TOKEN_UNBOUND_CLAIM_TIME": nonce_only,
        "EVENT_AND_EPOCH_BOUND_WITNESS_F0": event_epoch,
        "RESETTABLE_CURRENT_COUNTER": resettable,
    }
    for name, actual in reconstructed.items():
        wanted = expected_arch[name]
        for field in ("worldCount", "observationCount", "collisionCount", "identifiesExactEventCount"):
            check(f"ARCH-{name}-{field}", actual[field] == wanted[field], f"python={actual[field]} js={wanted[field]}")

    grid = []
    for f in range(3):
        for n in range(1, 6):
            actual = classify(independent(n, f), lambda world: world["witness"])
            grid.append((n, f, actual))
            js = next(item for item in expected["thresholdGrid"] if item["n"] == n and item["f"] == f)
            check(f"GRID-N{n}-F{f}-worlds", actual["worldCount"] == js["admissibleWorlds"], f"python={actual['worldCount']} js={js['admissibleWorlds']}")
            check(f"GRID-N{n}-F{f}-collisions", actual["collisionCount"] == js["collisionClasses"], f"python={actual['collisionCount']} js={js['collisionClasses']}")
            check(f"GRID-N{n}-F{f}-threshold", actual["identifiesExactEventCount"] == (n >= 2 * f + 1), f"identified={actual['identifiesExactEventCount']}")

    for n in range(1, 8):
        actual = classify(common_cause(n), lambda world: world["witness"])
        js = next(item for item in expected["commonCauseSweep"] if item["n"] == n)
        check(f"COMMON-N{n}", actual["collisionCount"] == js["collisionClasses"] and not actual["identifiesExactEventCount"], f"collisions={actual['collisionCount']}")

    check("BOUNDARY-HIL", expected["implementationBoundary"]["actualHardwareInLoop"] is False, "No hardware claim")
    check("BOUNDARY-EVENTS", expected["implementationBoundary"]["physicalEventsObserved"] == 0, "No physical event observed")
    check("QUALIFICATION", expected["qualifies"] and all(expected["criteria"].values()), "All preregistered criteria pass")
    passed = sum(item["pass"] for item in checks)
    audit = {
        "cycle": "RC-2026-39",
        "implementation": "Independent Python enumeration; no JavaScript imported",
        "passed": passed,
        "total": len(checks),
        "qualifies": passed == len(checks),
        "checks": checks,
        "boundary": "Finite-model audit only; actual sensors, physical coupling, calibration, and failure-domain independence remain untested."
    }
    OUTPUT.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    run()

