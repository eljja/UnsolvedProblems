"""Independent RC36 receiver-state enumerator."""

import json
from collections import deque
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"
PRECOMMIT = json.loads((REPRO / "rc36-receiver-delivery-precommit.json").read_text(encoding="utf-8"))
REPORTED = json.loads((REPRO / "rc36-receiver-state-model-result.json").read_text(encoding="utf-8"))


def key(state):
    return json.dumps(state, sort_keys=True, separators=(",", ":"))


def initial(protocol):
    return {"protocol": protocol, "marker": False, "markerDigest": None, "effectRecord": False, "effectDigest": None, "effectCount": 0, "pending": None, "clients": ["idle", "idle"], "conflictRejected": False}


def successors(state):
    output = []

    def add(action, mutate):
        nxt = deepcopy(state)
        mutate(nxt)
        if key(nxt) != key(state):
            output.append((action, nxt))

    for client in range(2):
        if state["clients"][client] != "idle" or state["pending"]:
            continue
        if state["marker"]:
            add(f"RETRY_SAME C{client}", lambda nxt, c=client: nxt["clients"].__setitem__(c, "replay"))
            def conflict(nxt, c=client):
                nxt["clients"][c] = "conflict"
                nxt["conflictRejected"] = True
            add(f"RETRY_CONFLICT C{client}", conflict)
        elif state["protocol"] == "EFFECT_THEN_MARKER":
            def effect_first(nxt, c=client):
                nxt["effectCount"] = min(2, nxt["effectCount"] + 1)
                nxt["effectRecord"] = True
                nxt["effectDigest"] = "A"
                nxt["pending"] = {"client": c, "phase": "effect-applied"}
            add(f"APPLY_EFFECT C{client}", effect_first)
        elif state["protocol"] == "MARKER_THEN_EFFECT":
            def marker_first(nxt, c=client):
                nxt["marker"] = True
                nxt["markerDigest"] = "A"
                nxt["pending"] = {"client": c, "phase": "marker-written"}
            add(f"WRITE_MARKER C{client}", marker_first)
        else:
            def atomic(nxt, c=client):
                nxt.update(marker=True, markerDigest="A", effectRecord=True, effectDigest="A", effectCount=1)
                nxt["clients"][c] = "created"
            add(f"ATOMIC_COMMIT C{client}", atomic)
    if state["pending"] and state["pending"]["phase"] == "effect-applied":
        def write_marker(nxt):
            nxt["marker"] = True
            nxt["markerDigest"] = "A"
            nxt["clients"][nxt["pending"]["client"]] = "created"
            nxt["pending"] = None
        add(f"WRITE_MARKER C{state['pending']['client']}", write_marker)
    if state["pending"] and state["pending"]["phase"] == "marker-written":
        def apply_effect(nxt):
            nxt["effectCount"] = min(2, nxt["effectCount"] + 1)
            nxt["effectRecord"] = True
            nxt["effectDigest"] = "A"
            nxt["clients"][nxt["pending"]["client"]] = "created"
            nxt["pending"] = None
        add(f"APPLY_EFFECT C{state['pending']['client']}", apply_effect)
    if state["pending"]:
        add("CRASH_AND_RESTART", lambda nxt: nxt.__setitem__("pending", None))
    return output


def failures(state):
    return {
        "R1_AT_MOST_ONE_EFFECT": state["effectCount"] > 1,
        "R2_MARKER_EFFECT_ATOMIC": state["marker"] != state["effectRecord"] or (state["marker"] and state["markerDigest"] != state["effectDigest"]),
        "R3_REPLAY_IMPLIES_EFFECT": "replay" in state["clients"] and state["effectCount"] != 1,
        "R4_CONFLICT_NEVER_MUTATES": state["conflictRejected"] and any(digest is not None and digest != "A" for digest in (state["markerDigest"], state["effectDigest"])),
        "R5_ONE_SUCCESSFUL_DELIVERY": all(value != "idle" for value in state["clients"]) and state["effectCount"] != 1,
    }


def explore(protocol):
    start = initial(protocol)
    start_key = key(start)
    queue = deque([start_key])
    states = {start_key: start}
    traces = {start_key: []}
    first = {name: None for name in failures(start)}
    transitions = 0
    depth = 0
    while queue:
        current_key = queue.popleft()
        state = states[current_key]
        trace = traces[current_key]
        depth = max(depth, len(trace))
        for name, failed in failures(state).items():
            if failed and first[name] is None:
                first[name] = {"trace": trace, "traceLength": len(trace)}
        for action, nxt in successors(state):
            transitions += 1
            nxt_key = key(nxt)
            if nxt_key not in states:
                states[nxt_key] = nxt
                traces[nxt_key] = trace + [action]
                queue.append(nxt_key)
    return {"protocol": protocol, "reachableStates": len(states), "exploredTransitions": transitions, "maximumShortestPathDepth": depth, "failures": first}


recomputed = [explore(item["id"]) for item in PRECOMMIT["model"]["protocols"]]
checks = []
for actual, expected in zip(recomputed, REPORTED["metrics"]):
    checks.append({"name": f"{actual['protocol']}-graph", "pass": actual["reachableStates"] == expected["reachableStates"] and actual["exploredTransitions"] == expected["exploredTransitions"] and actual["maximumShortestPathDepth"] == expected["maximumShortestPathDepth"], "actual": actual})
    for name, failure in actual["failures"].items():
        reported_failure = expected["invariants"][name].get("minimalCounterexample")
        checks.append({"name": f"{actual['protocol']}-{name}", "pass": (failure is None) == expected["invariants"][name]["passed"] and (failure is None or failure["traceLength"] == reported_failure["traceLength"]), "actual": failure})

audit = {
    "auditId": "RC36-INDEPENDENT-RECEIVER-MODEL-AUDIT-1.0",
    "computedOn": "2026-08-14",
    "checks": checks,
    "passed": sum(1 for item in checks if item["pass"]),
    "total": len(checks),
    "qualifies": all(item["pass"] for item in checks),
    "boundary": "This independent Python enumerator checks the same finite abstraction. It does not prove atomicity for an effect outside the receiver database."
}
(REPRO / "rc36-receiver-state-model-python-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"RC36 independent receiver model audit: {audit['passed']}/{audit['total']}")
if not audit["qualifies"]:
    raise SystemExit(1)
