"""Independent Python enumeration for the RC37 receiver-outbox-sink model."""

import json
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULT = ROOT / "research" / "reproducibility" / "rc37-outbox-sink-model-result.json"
AUDIT = ROOT / "research" / "reproducibility" / "rc37-outbox-sink-model-python-audit.json"
PROTOCOLS = ("DUAL_WRITE", "EARLY_OUTBOX_ACK", "NON_IDEMPOTENT_SINK", "ATOMIC_OUTBOX_IDEMPOTENT_SINK")
FIELDS = ("ri", "ro", "od", "si", "se", "vi", "vr", "sm", "va", "cr")
INITIAL = (0,) * len(FIELDS)


def mutate(state, **changes):
    data = dict(zip(FIELDS, state))
    data.update(changes)
    return tuple(data[field] for field in FIELDS)


def successors(protocol, state):
    data = dict(zip(FIELDS, state))
    out = []

    def add(action, value):
        if value != state:
            out.append((action, value))

    if not data["ri"]:
        if protocol == "DUAL_WRITE":
            add("ACCEPT_INBOX", mutate(state, ri=1, vi=1))
        else:
            add("ACCEPT_INBOX_AND_OUTBOX", mutate(state, ri=1, ro=1))
    if protocol == "DUAL_WRITE" and data["ri"] and data["vi"] and not data["ro"]:
        add("WRITE_OUTBOX_SEPARATELY", mutate(state, ro=1, vi=0))
    if protocol == "EARLY_OUTBOX_ACK" and data["ro"] and not data["od"]:
        add("MARK_OUTBOX_DELIVERED_EARLY", mutate(state, od=1, vr=1))
    if protocol == "EARLY_OUTBOX_ACK" and data["vr"]:
        add("SEND_AFTER_EARLY_MARK", mutate(state, si=1, se=1, vr=0))
    if protocol in ("DUAL_WRITE", "ATOMIC_OUTBOX_IDEMPOTENT_SINK") and data["ro"] and not data["od"]:
        if not data["si"]:
            add("SINK_ATOMIC_CREATE", mutate(state, si=1, se=1, va=1))
        else:
            add("SINK_IDEMPOTENT_REPLAY", mutate(state, va=1))
    if protocol == "NON_IDEMPOTENT_SINK" and data["ro"] and not data["od"]:
        add("APPLY_SINK_EFFECT", mutate(state, se=min(2, data["se"] + 1), sm=1))
        if data["sm"]:
            add("WRITE_SINK_MARKER", mutate(state, si=1, sm=0, va=1))
    if data["va"] and data["ro"] and not data["od"]:
        add("ACK_OUTBOX", mutate(state, od=1, va=0))
    if data["va"]:
        add("DROP_SINK_ACK", mutate(state, va=0))
    if not data["cr"] or data["vi"] or data["vr"] or data["sm"] or data["va"]:
        add("CRASH_AND_RESTART", mutate(state, vi=0, vr=0, sm=0, va=0, cr=1))
    return out


def enumerate_graph(protocol):
    seen = {INITIAL}
    order = [INITIAL]
    traces = {INITIAL: []}
    queue = deque([INITIAL])
    edges = []
    while queue:
        state = queue.popleft()
        for action, target in successors(protocol, state):
            edges.append((state, action, target))
            if target not in seen:
                seen.add(target)
                order.append(target)
                traces[target] = traces[state] + [action]
                queue.append(target)
    return seen, order, traces, edges


def terminal(state):
    data = dict(zip(FIELDS, state))
    return data["ri"] == data["ro"] == data["od"] == data["si"] == data["se"] == 1


def healthy_completion(protocol, start):
    seen = {start}
    queue = deque([start])
    while queue:
        state = queue.popleft()
        if terminal(state):
            return True
        for action, target in successors(protocol, state):
            if action in ("CRASH_AND_RESTART", "DROP_SINK_ACK"):
                continue
            if target not in seen:
                seen.add(target)
                queue.append(target)
    return False


def main():
    reference = json.loads(RESULT.read_text(encoding="utf-8"))
    checks = []
    reconstructed = []
    for protocol in PROTOCOLS:
        states, order, traces, edges = enumerate_graph(protocol)
        values = [dict(zip(FIELDS, state)) for state in states]
        recoverability = {state for state in states if dict(zip(FIELDS, state))["ri"] and not healthy_completion(protocol, state)}
        predicates = {
            "M1_no_crash_stable_receiver_orphan": lambda d, s: d["cr"] and d["ri"] and not d["ro"],
            "M2_sink_effect_at_most_once": lambda d, s: d["se"] > 1,
            "M3_sink_marker_matches_one_effect": lambda d, s: d["si"] != (d["se"] == 1),
            "M4_delivered_outbox_implies_sink_commit": lambda d, s: d["od"] and not (d["si"] and d["se"] == 1),
            "M5_sink_commit_has_receiver_origin": lambda d, s: d["si"] and not (d["ri"] and d["ro"]),
            "M6_healed_completion_reachable": lambda d, s: s in recoverability,
        }
        failures = {}
        for name, predicate in predicates.items():
            candidates = [(traces[state], state) for state in order if predicate(dict(zip(FIELDS, state)), state)]
            failures[name] = min(candidates, key=lambda item: len(item[0])) if candidates else None
        item = next(entry for entry in reference["protocols"] if entry["protocol"] == protocol)
        checks.extend([
            {"name": f"{protocol}-state-count", "pass": len(states) == item["states"], "observed": len(states), "expected": item["states"]},
            {"name": f"{protocol}-transition-count", "pass": len(edges) == item["transitions"], "observed": len(edges), "expected": item["transitions"]},
        ])
        for name, failure in failures.items():
            expected = item["invariants"][name]["counterexample"]
            observed_trace = failure[0] if failure else None
            expected_trace = expected["trace"] if expected else None
            checks.append({"name": f"{protocol}-{name}", "pass": observed_trace == expected_trace, "observed": observed_trace, "expected": expected_trace})
        reconstructed.append({"protocol": protocol, "states": len(states), "transitions": len(edges), "reachableValues": len(values)})
    document = {
        "cycle": "RC-2026-37",
        "auditor": "independent Python state enumerator",
        "computedOn": "2026-08-14",
        "reconstructed": reconstructed,
        "checks": checks,
        "passed": sum(check["pass"] for check in checks),
        "total": len(checks),
        "qualifies": all(check["pass"] for check in checks),
    }
    AUDIT.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    print(f"RC37 independent model audit: {document['passed']}/{document['total']}")
    raise SystemExit(0 if document["qualifies"] else 1)


if __name__ == "__main__":
    main()
