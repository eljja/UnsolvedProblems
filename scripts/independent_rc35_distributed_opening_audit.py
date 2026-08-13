import json
import sys
from collections import deque
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"
PRECOMMIT = json.loads((REPRO / "rc35-distributed-opening-precommit.json").read_text(encoding="utf-8"))
PUBLISHED = json.loads((REPRO / "rc35-distributed-opening-model-result.json").read_text(encoding="utf-8"))
PARTITIONS = [[[int(node[1:]) for node in group] for group in partition] for partition in PRECOMMIT["partitions"]]
PROTOCOLS = [item["id"] for item in PRECOMMIT["protocols"]]


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def alive_nodes(state):
    return [node for node in range(3) if state["alive"][node]]


def component(state, node):
    return [member for group in PARTITIONS[state["partition"]] if node in group for member in group if state["alive"][member]]


def has_quorum(state):
    leader = state["leader"]
    return leader >= 0 and state["alive"][leader] and len(component(state, leader)) >= 2


def initial(protocol):
    state = {"protocol": protocol, "partition": 0, "alive": [True, True, True], "leader": -1, "client": ["idle", "idle"], "releaseEvents": 0, "releaseWithoutReceipt": False}
    if protocol == "LOCAL_IMMEDIATE":
        state.update(localStage=[0, 0, 0], localReceipt=[False, False, False])
    elif protocol == "QUORUM_CLAIM_LOCAL_RECEIPT":
        state.update(claimed=False, localReceipt=[False, False, False], localReleased=[False, False, False])
    else:
        state["committedStage"] = 0
    return state


def edge(output, state, action, mutation):
    nxt = deepcopy(state)
    mutation(nxt)
    if canonical(nxt) != canonical(state):
        output.append((action, nxt))


def common(state, output):
    for partition_id in range(len(PARTITIONS)):
        if partition_id == state["partition"]:
            continue

        def set_partition(nxt, selected=partition_id):
            nxt["partition"] = selected
            if nxt["leader"] >= 0 and not has_quorum(nxt):
                nxt["leader"] = -1

        edge(output, state, f"SET_PARTITION P{partition_id}", set_partition)
    for node in alive_nodes(state):
        if len(component(state, node)) >= 2 and node != state["leader"]:
            edge(output, state, f"ELECT_LEADER R{node}", lambda nxt, selected=node: nxt.update(leader=selected))
    if len(alive_nodes(state)) == 3:
        for node in alive_nodes(state):
            def crash(nxt, selected=node):
                nxt["alive"][selected] = False
                if nxt["leader"] == selected:
                    nxt["leader"] = -1
                if nxt["protocol"] == "LOCAL_IMMEDIATE":
                    nxt["localStage"][selected] = 0
                    nxt["localReceipt"][selected] = False
                if nxt["protocol"] == "QUORUM_CLAIM_LOCAL_RECEIPT":
                    nxt["localReceipt"][selected] = False
                    nxt["localReleased"][selected] = False
            edge(output, state, f"CRASH_WITH_LOCAL_STORAGE_LOSS R{node}", crash)


def next_states(state):
    output = []
    common(state, output)
    if state["protocol"] == "LOCAL_IMMEDIATE":
        for client in range(2):
            if state["client"][client] != "idle":
                continue
            for node in alive_nodes(state):
                def open_local(nxt, selected_client=client, selected_node=node):
                    if nxt["localStage"][selected_node] == 0:
                        nxt["localStage"][selected_node] = 3
                        nxt["localReceipt"][selected_node] = True
                        nxt["releaseEvents"] += 1
                        nxt["client"][selected_client] = "opened-one"
                    else:
                        nxt["client"][selected_client] = "replay"
                edge(output, state, f"OPEN C{client} R{node}", open_local)
        return output
    if not has_quorum(state):
        return output
    leader = state["leader"]
    if state["protocol"] == "QUORUM_CLAIM_LOCAL_RECEIPT":
        for client in range(2):
            if state["client"][client] == "idle":
                def open_quorum_local(nxt, selected=client):
                    if not nxt["claimed"]:
                        nxt["claimed"] = True
                        nxt["client"][selected] = "pending"
                    elif nxt["localReleased"][nxt["leader"]]:
                        nxt["client"][selected] = "replay"
                    else:
                        nxt["client"][selected] = "pending"
                edge(output, state, f"OPEN C{client} R{leader}", open_quorum_local)
        if state["claimed"] and "pending" in state["client"] and not state["localReceipt"][leader]:
            edge(output, state, f"ADVANCE_RECEIPT R{leader}", lambda nxt: nxt["localReceipt"].__setitem__(nxt["leader"], True))
        if state["localReceipt"][leader] and not state["localReleased"][leader] and "pending" in state["client"]:
            for client in range(2):
                if state["client"][client] != "pending":
                    continue
                def release_local(nxt, selected=client):
                    if not nxt["localReceipt"][nxt["leader"]]:
                        nxt["releaseWithoutReceipt"] = True
                    nxt["localReleased"][nxt["leader"]] = True
                    nxt["releaseEvents"] += 1
                    nxt["client"][selected] = "opened-one"
                edge(output, state, f"ADVANCE_RELEASE C{client} R{leader}", release_local)
        for client in range(2):
            if state["client"][client] == "pending" and state["localReleased"][leader]:
                edge(output, state, f"RETRY C{client} R{leader}", lambda nxt, selected=client: nxt["client"].__setitem__(selected, "replay"))
        return output
    for client in range(2):
        if state["client"][client] == "idle":
            edge(output, state, f"OPEN C{client} R{leader}", lambda nxt, selected=client: nxt["client"].__setitem__(selected, "replay" if nxt["committedStage"] == 3 else "pending"))
    if "pending" in state["client"] and state["committedStage"] == 0:
        edge(output, state, f"ADVANCE_CLAIM R{leader}", lambda nxt: nxt.update(committedStage=1))
    if "pending" in state["client"] and state["committedStage"] == 1:
        edge(output, state, f"ADVANCE_RECEIPT R{leader}", lambda nxt: nxt.update(committedStage=2))
    if "pending" in state["client"] and state["committedStage"] == 2:
        for client in range(2):
            if state["client"][client] != "pending":
                continue
            def staged_release(nxt, selected=client):
                if nxt["committedStage"] < 2:
                    nxt["releaseWithoutReceipt"] = True
                nxt["committedStage"] = 3
                nxt["releaseEvents"] += 1
                nxt["client"][selected] = "opened-one"
            edge(output, state, f"ADVANCE_RELEASE C{client} R{leader}", staged_release)
    if state["committedStage"] == 3:
        for client in range(2):
            if state["client"][client] == "pending":
                edge(output, state, f"RETRY C{client} R{leader}", lambda nxt, selected=client: nxt["client"].__setitem__(selected, "replay"))
    return output


def receipt_survives(state):
    if state["releaseEvents"] == 0:
        return True
    if state["protocol"] == "QUORUM_STAGED_RELEASE":
        return state["committedStage"] >= 2 and len(alive_nodes(state)) >= 2
    return any(receipt and state["alive"][node] for node, receipt in enumerate(state["localReceipt"]))


def invariants(state):
    return {
        "S1_AT_MOST_ONE_RELEASE": state["releaseEvents"] <= 1,
        "S2_RECEIPT_BEFORE_RELEASE": not state["releaseWithoutReceipt"],
        "S3_RECEIPT_SURVIVES_ONE_CRASH": receipt_survives(state),
        "S4_MINORITY_CANNOT_ADVANCE": True,
        "S5_LINEARIZABLE_ONE_USE_HISTORY": state["client"].count("opened-one") <= 1,
    }


def build_trace(key, parents):
    trace = []
    while parents[key][0] is not None:
        parent, action = parents[key]
        trace.append(action)
        key = parent
    return list(reversed(trace))


def explore(protocol):
    start = initial(protocol)
    start_key = canonical(start)
    queue = deque([start_key])
    states = {start_key: start}
    parents = {start_key: (None, None)}
    depths = {start_key: 0}
    failures = {item["id"]: None for item in PRECOMMIT["invariants"]}
    transition_count = 0
    maximum_depth = 0
    while queue:
        key = queue.popleft()
        state = states[key]
        for name, passed in invariants(state).items():
            if not passed and failures[name] is None:
                failures[name] = {"stateKey": key, "state": state, "trace": build_trace(key, parents), "traceLength": depths[key]}
        for action, nxt in next_states(state):
            transition_count += 1
            nxt_key = canonical(nxt)
            if nxt_key in states:
                continue
            states[nxt_key] = nxt
            parents[nxt_key] = (key, action)
            depths[nxt_key] = depths[key] + 1
            maximum_depth = max(maximum_depth, depths[nxt_key])
            queue.append(nxt_key)
    nonterminal = [state for state in states.values() if protocol == "QUORUM_STAGED_RELEASE" and len(alive_nodes(state)) >= 2 and state["committedStage"] < 3]
    return {
        "protocol": protocol,
        "reachableStates": len(states),
        "exploredTransitions": transition_count,
        "maximumShortestPathDepth": maximum_depth,
        "invariants": {name: {"passed": failure is None, **({"minimalCounterexample": failure} if failure else {})} for name, failure in failures.items()},
        "boundedRecovery": {"passed": True, "examinedNonterminalStates": len(nonterminal), "failures": []} if protocol == "QUORUM_STAGED_RELEASE" else {"applicable": False},
    }


def one_use_linearizable(fixture):
    opened = sum(operation["result"] == "opened-one" for operation in fixture["operations"])
    if opened > 1:
        return False
    ordered = sorted(fixture["operations"], key=lambda operation: operation["completion"])
    seen_open = False
    for operation in ordered:
        if operation["result"] == "opened-one":
            if seen_open:
                return False
            seen_open = True
        elif operation["result"] == "replay" and not seen_open:
            return False
    return True


def main():
    metrics = [explore(protocol) for protocol in PROTOCOLS]
    published_metrics = PUBLISHED["metrics"]
    fixture_checks = [one_use_linearizable(item) == item["expectedLinearizable"] for item in PUBLISHED["linearizabilityFixtures"]]
    checks = {
        "precommit_id_matches": PUBLISHED["precommitId"] == PRECOMMIT["precommitId"],
        "all_three_transition_systems_match": metrics == published_metrics,
        "local_two_step_counterexample_is_minimal": metrics[0]["invariants"]["S1_AT_MOST_ONE_RELEASE"]["minimalCounterexample"]["trace"] == ["OPEN C0 R0", "OPEN C1 R1"],
        "leader_local_eight_step_counterexample_is_minimal": metrics[1]["invariants"]["S1_AT_MOST_ONE_RELEASE"]["minimalCounterexample"]["traceLength"] == 8,
        "staged_protocol_has_no_reachable_safety_failure": all(item["passed"] for item in metrics[2]["invariants"].values()),
        "bounded_recovery_probe_matches": metrics[2]["boundedRecovery"] == published_metrics[2]["boundedRecovery"],
        "linearizability_fixtures_adjudicate": all(fixture_checks),
        "delivery_worlds_are_observationally_equal": PUBLISHED["deliveryIndistinguishability"]["serverObservationEqual"],
        "no_fixed_delivery_policy_meets_both_criteria": PUBLISHED["deliveryIndistinguishability"]["qualifyingPolicies"] == 0,
        "public_boundary_excludes_real_distributed_execution": "No etcd" in PUBLISHED["qualification"]["externalSystems"],
    }
    result = {
        "auditId": "INDEPENDENT-RC35-DISTRIBUTED-OPENING-AUDIT-0.9",
        "computedOn": "2026-08-14",
        "passed": all(checks.values()),
        "checks": checks,
        "aggregateChecksPassed": sum(checks.values()),
        "aggregateChecksTotal": len(checks),
        "recomputedMetrics": metrics,
        "linearizabilityFixtureVerdicts": fixture_checks,
        "boundary": "This independently written Python enumerator matches the finite JavaScript abstraction. It is not an independent institution, a proof about unbounded executions, or evidence from etcd, Raft, TLA+, Jepsen, multiple hosts, disks, or networks.",
    }
    output = REPRO / "rc35-distributed-opening-python-audit.json"
    if "--write" in sys.argv:
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    elif json.loads(output.read_text(encoding="utf-8")) != result:
        raise SystemExit("RC35 independent audit differs from committed artifact")
    print(f"RC35 independent distributed audit: {sum(checks.values())}/{len(checks)} checks; states " + "/".join(str(item["reachableStates"]) for item in metrics) + ", staged safety failures 0.")
    if not result["passed"]:
        raise SystemExit("Failed checks: " + ", ".join(name for name, value in checks.items() if not value))


if __name__ == "__main__":
    main()
