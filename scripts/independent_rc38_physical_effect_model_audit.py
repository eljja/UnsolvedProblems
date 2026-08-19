import json
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULT = ROOT / "research/reproducibility/rc38-physical-effect-model-result.json"
OUTPUT = ROOT / "research/reproducibility/rc38-physical-effect-model-python-audit.json"
FIELDS = ("m", "e", "x", "s", "a", "q", "v", "r")


def st(**kwargs):
    value = dict(m=0, e=0, x=0, s=0, a=0, q=0, v=1, r=0)
    value.update(kwargs)
    return value


def key(value):
    return tuple(value[field] for field in FIELDS)


def edge(items, action, value, **updates):
    next_value = dict(value)
    next_value.update(updates)
    if key(next_value) != key(value):
        items.append((action, next_value, action.startswith("CRASH")))


def finish(value, items):
    if value["v"] and value["m"] and value["e"] > 0:
        edge(items, "COMPLETE", value, v=0)


def transitions(protocol, value):
    out = []
    m, e, x, s, a, q, v, r = (value[field] for field in FIELDS)
    if protocol == "MARKER_THEN_PULSE":
        if v and not m: edge(out, "WRITE_MARKER", value, m=1)
        if v and m and e == 0: edge(out, "PULSE", value, e=1, x=1)
        finish(value, out)
        if v and m and e == 0: edge(out, "CRASH_RESTART", value, v=0, r=1)
    elif protocol == "PULSE_THEN_MARKER":
        if v and not m and (e == 0 or (e == 1 and r == 1)): edge(out, "PULSE", value, e=min(2, e + 1), x=1)
        if v and not m and e > 0: edge(out, "WRITE_MARKER", value, m=1)
        finish(value, out)
        if v and not m and e > 0 and not r: edge(out, "CRASH_RETRY", value, r=1)
    elif protocol == "QOS2_ONCE_HANDLER_RETRY":
        if not q: edge(out, "DELIVER_APPLICATION_MESSAGE_ONCE", value, q=1, v=1)
        if q and v and not m and (e == 0 or (e == 1 and r == 1)): edge(out, "PULSE", value, e=min(2, e + 1), x=1)
        if q and v and not m and e > 0: edge(out, "WRITE_MARKER", value, m=1)
        finish(value, out)
        if q and v and not m and e > 0 and not r: edge(out, "CRASH_RETRY_HANDLER", value, r=1)
    elif protocol == "LATE_SENSOR_AFTER_PULSE":
        if v and not m and s == 0 and (e == 0 or (e == 1 and r == 1)): edge(out, "PULSE", value, e=min(2, e + 1), x=1)
        if v and s < e: edge(out, "RECORD_LATE_SENSOR", value, s=e)
        if v and not m and s > 0: edge(out, "WRITE_MARKER", value, m=1)
        finish(value, out)
        if v and not m and e > s and not r: edge(out, "CRASH_RETRY", value, r=1)
    elif protocol == "COUPLED_EVENT_COUNTER":
        if v and not m and s == 0: edge(out, "PULSE_AND_COUPLED_COUNT", value, e=1, x=1, s=1)
        if v and not m and s == 1: edge(out, "WRITE_MARKER_FROM_COUNTER", value, m=1)
        finish(value, out)
        if v and not m and s == 1 and not r: edge(out, "CRASH_RECONCILE", value, r=1)
    elif protocol == "ATOMIC_ACTUATOR_COMMAND_ID":
        if v and not m and not a: edge(out, "ACTUATOR_ACCEPT_ID_AND_PULSE", value, a=1, e=1, x=1)
        if v and not m and a: edge(out, "WRITE_MARKER_FROM_ACCEPTANCE", value, m=1)
        finish(value, out)
        if v and not m and a and not r: edge(out, "CRASH_REPLAY_ID", value, r=1)
    elif protocol == "ABSOLUTE_SETPOINT_RETRY":
        if v and not m and (e == 0 or (e == 1 and r == 1)): edge(out, "SET_ABSOLUTE_TARGET", value, e=min(2, e + 1), x=1)
        if v and not m and x: edge(out, "WRITE_MARKER_FROM_READBACK", value, m=1)
        finish(value, out)
        if v and not m and x and not r: edge(out, "CRASH_RETRY_SETPOINT", value, r=1)
    return out


PROTOCOLS = [
    ("MARKER_THEN_PULSE", ("m", "q"), st()),
    ("PULSE_THEN_MARKER", ("m", "q"), st()),
    ("QOS2_ONCE_HANDLER_RETRY", ("m", "q"), st(v=0)),
    ("LATE_SENSOR_AFTER_PULSE", ("m", "q", "s"), st()),
    ("COUPLED_EVENT_COUNTER", ("m", "q", "s"), st()),
    ("ATOMIC_ACTUATOR_COMMAND_ID", ("m", "q", "a"), st()),
    ("ABSOLUTE_SETPOINT_RETRY", ("m", "q", "x"), st()),
]


def enumerate_graph(protocol, initial):
    nodes = {key(initial): (initial, [])}
    queue = deque([initial])
    count = 0
    while queue:
        current = queue.popleft()
        prefix = nodes[key(current)][1]
        for action, nxt, _ in transitions(protocol, current):
            count += 1
            if key(nxt) not in nodes:
                nodes[key(nxt)] = (nxt, prefix + [action])
                queue.append(nxt)
    return nodes, count


def healthy_reachable(protocol, start, predicate):
    seen = {key(start)}
    queue = deque([start])
    while queue:
        current = queue.popleft()
        if predicate(current):
            return True
        for _, nxt, fault in transitions(protocol, current):
            if fault:
                continue
            if key(nxt) not in seen:
                seen.add(key(nxt))
                queue.append(nxt)
    return False


def audit():
    expected = json.loads(RESULT.read_text(encoding="utf-8"))
    checks = []
    reconstructed = []
    for protocol, observation, initial in PROTOCOLS:
        nodes, transition_count = enumerate_graph(protocol, initial)
        published = next(item for item in expected["protocols"] if item["protocol"] == protocol)
        checks.append({"name": f"{protocol}-states", "pass": len(nodes) == published["states"], "observed": len(nodes), "expected": published["states"]})
        checks.append({"name": f"{protocol}-transitions", "pass": transition_count == published["transitions"], "observed": transition_count, "expected": published["transitions"]})
        predicates = {
            "T1_stable_marker_matches_one_execution": lambda z: not (z["v"] == 0 and z["m"] == 1) or z["e"] == 1,
            "T2_execution_at_most_once": lambda z: z["e"] <= 1,
            "T3_stable_marker_requires_target_state": lambda z: not (z["v"] == 0 and z["m"] == 1) or z["x"] == 1,
            "T4_transport_delivery_at_most_once": lambda z: z["q"] <= 1,
            "T5_sensor_never_overstates_execution": lambda z: z["s"] <= z["e"],
            "T6_actuator_id_never_aliases_multiple_executions": lambda z: not z["a"] or z["e"] == 1,
            "T7_exact_healthy_completion_reachable": lambda z: healthy_reachable(protocol, z, lambda y: y["v"] == 0 and y["m"] == 1 and y["e"] == 1 and y["x"] == 1),
            "T8_target_state_healthy_completion_reachable": lambda z: healthy_reachable(protocol, z, lambda y: y["v"] == 0 and y["m"] == 1 and y["x"] == 1),
        }
        for name, predicate in predicates.items():
            failed = next(((value, trace) for value, trace in nodes.values() if not predicate(value)), None)
            observed_pass = failed is None
            expected_inv = published["invariants"][name]
            expected_length = None if expected_inv["counterexample"] is None else len(expected_inv["counterexample"]["trace"])
            observed_length = None if failed is None else len(failed[1])
            checks.append({"name": f"{protocol}-{name}", "pass": observed_pass == expected_inv["pass"] and observed_length == expected_length, "observed": {"pass": observed_pass, "traceLength": observed_length}, "expected": {"pass": expected_inv["pass"], "traceLength": expected_length}})
        groups = {}
        for value, trace in nodes.values():
            if value["r"] == 1 or value["v"] == 0:
                obs = tuple(value[field] for field in observation)
                groups.setdefault(obs, []).append((value, trace))
        collision = any(len({value["e"] for value, _ in group}) > 1 for group in groups.values())
        checks.append({"name": f"{protocol}-observation-collision", "pass": collision == bool(published["observationCollision"]), "observed": collision, "expected": bool(published["observationCollision"])})
        reconstructed.append({"protocol": protocol, "states": len(nodes), "transitions": transition_count, "collision": collision})
    exact = [item["protocol"] for item in expected["protocols"] if item["exactTransitionQualifies"]]
    target = [item["protocol"] for item in expected["protocols"] if item["targetStateQualifies"]]
    checks.append({"name": "exact-qualifiers", "pass": exact == expected["gate"]["expectedExactTransitionQualifiers"], "observed": exact, "expected": expected["gate"]["expectedExactTransitionQualifiers"]})
    checks.append({"name": "target-state-qualifiers", "pass": target == expected["gate"]["expectedTargetStateQualifiers"], "observed": target, "expected": expected["gate"]["expectedTargetStateQualifiers"]})
    checks.append({"name": "minimum-universal-witness", "pass": expected["minimumWitnessSets"] == [["physically_coupled_event_counter"]], "observed": expected["minimumWitnessSets"], "expected": [["physically_coupled_event_counter"]]})
    passed = sum(1 for item in checks if item["pass"])
    output = {"cycle": "RC-2026-38", "auditor": "independent Python enumerator", "computedOn": "2026-08-20", "reconstructed": reconstructed, "checks": checks, "passed": passed, "total": len(checks), "qualifies": passed == len(checks)}
    OUTPUT.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    audit()
