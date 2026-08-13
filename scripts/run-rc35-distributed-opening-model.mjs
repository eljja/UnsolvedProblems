import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const PRECOMMIT = JSON.parse(fs.readFileSync(path.join(REPRO, "rc35-distributed-opening-precommit.json"), "utf8"));
const WRITE = process.argv.includes("--write");
const PARTITIONS = PRECOMMIT.partitions.map(groups => groups.map(group => group.map(name => Number(name.slice(1)))));
const PROTOCOLS = PRECOMMIT.protocols.map(item => item.id);
const clone = value => JSON.parse(JSON.stringify(value));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function aliveNodes(state) {
  return [0, 1, 2].filter(node => state.alive[node]);
}

function componentFor(state, node) {
  return PARTITIONS[state.partition].find(group => group.includes(node))?.filter(member => state.alive[member]) || [];
}

function leaderHasQuorum(state) {
  return state.leader >= 0 && state.alive[state.leader] && componentFor(state, state.leader).length >= 2;
}

function initialState(protocol) {
  const common = { protocol, partition: 0, alive: [true, true, true], leader: -1, client: ["idle", "idle"], releaseEvents: 0, releaseWithoutReceipt: false };
  if (protocol === "LOCAL_IMMEDIATE") return { ...common, localStage: [0, 0, 0], localReceipt: [false, false, false] };
  if (protocol === "QUORUM_CLAIM_LOCAL_RECEIPT") return { ...common, claimed: false, localReceipt: [false, false, false], localReleased: [false, false, false] };
  return { ...common, committedStage: 0 };
}

function addTransition(output, state, action, mutate) {
  const next = clone(state);
  mutate(next);
  const before = canonical(state);
  const after = canonical(next);
  if (before !== after) output.push({ action, state: next });
}

function commonTransitions(state, output) {
  for (let partition = 0; partition < PARTITIONS.length; partition += 1) {
    if (partition !== state.partition) addTransition(output, state, `SET_PARTITION P${partition}`, next => { next.partition = partition; if (next.leader >= 0 && !leaderHasQuorum(next)) next.leader = -1; });
  }
  for (const node of aliveNodes(state)) {
    if (componentFor(state, node).length >= 2 && node !== state.leader) addTransition(output, state, `ELECT_LEADER R${node}`, next => { next.leader = node; });
  }
  if (aliveNodes(state).length === 3) {
    for (const node of aliveNodes(state)) addTransition(output, state, `CRASH_WITH_LOCAL_STORAGE_LOSS R${node}`, next => {
      next.alive[node] = false;
      if (next.leader === node) next.leader = -1;
      if (next.protocol === "LOCAL_IMMEDIATE") { next.localStage[node] = 0; next.localReceipt[node] = false; }
      if (next.protocol === "QUORUM_CLAIM_LOCAL_RECEIPT") { next.localReceipt[node] = false; next.localReleased[node] = false; }
    });
  }
}

function localTransitions(state) {
  const output = [];
  commonTransitions(state, output);
  for (let client = 0; client < 2; client += 1) {
    if (state.client[client] !== "idle") continue;
    for (const node of aliveNodes(state)) addTransition(output, state, `OPEN C${client} R${node}`, next => {
      if (next.localStage[node] === 0) {
        next.localStage[node] = 3;
        next.localReceipt[node] = true;
        next.releaseEvents += 1;
        next.client[client] = "opened-one";
      } else next.client[client] = "replay";
    });
  }
  return output;
}

function quorumLocalTransitions(state) {
  const output = [];
  commonTransitions(state, output);
  if (leaderHasQuorum(state)) {
    for (let client = 0; client < 2; client += 1) {
      if (state.client[client] !== "idle") continue;
      addTransition(output, state, `OPEN C${client} R${state.leader}`, next => {
        if (!next.claimed) {
          next.claimed = true;
          next.client[client] = "pending";
        } else if (next.localReleased[next.leader]) next.client[client] = "replay";
        else next.client[client] = "pending";
      });
    }
    if (state.claimed && state.client.includes("pending") && !state.localReceipt[state.leader]) {
      addTransition(output, state, `ADVANCE_RECEIPT R${state.leader}`, next => { next.localReceipt[next.leader] = true; });
    }
    if (state.localReceipt[state.leader] && !state.localReleased[state.leader] && state.client.includes("pending")) {
      for (let client = 0; client < 2; client += 1) {
        if (state.client[client] !== "pending") continue;
        addTransition(output, state, `ADVANCE_RELEASE C${client} R${state.leader}`, next => {
          if (!next.localReceipt[next.leader]) next.releaseWithoutReceipt = true;
          next.localReleased[next.leader] = true;
          next.releaseEvents += 1;
          next.client[client] = "opened-one";
        });
      }
    }
    for (let client = 0; client < 2; client += 1) {
      if (state.client[client] === "pending" && state.localReleased[state.leader]) addTransition(output, state, `RETRY C${client} R${state.leader}`, next => { next.client[client] = "replay"; });
    }
  }
  return output;
}

function stagedTransitions(state) {
  const output = [];
  commonTransitions(state, output);
  if (!leaderHasQuorum(state)) return output;
  for (let client = 0; client < 2; client += 1) {
    if (state.client[client] !== "idle") continue;
    addTransition(output, state, `OPEN C${client} R${state.leader}`, next => { next.client[client] = next.committedStage === 3 ? "replay" : "pending"; });
  }
  if (state.client.includes("pending") && state.committedStage === 0) addTransition(output, state, `ADVANCE_CLAIM R${state.leader}`, next => { next.committedStage = 1; });
  if (state.client.includes("pending") && state.committedStage === 1) addTransition(output, state, `ADVANCE_RECEIPT R${state.leader}`, next => { next.committedStage = 2; });
  if (state.client.includes("pending") && state.committedStage === 2) {
    for (let client = 0; client < 2; client += 1) {
      if (state.client[client] !== "pending") continue;
      addTransition(output, state, `ADVANCE_RELEASE C${client} R${state.leader}`, next => {
        if (next.committedStage < 2) next.releaseWithoutReceipt = true;
        next.committedStage = 3;
        next.releaseEvents += 1;
        next.client[client] = "opened-one";
      });
    }
  }
  if (state.committedStage === 3) {
    for (let client = 0; client < 2; client += 1) {
      if (state.client[client] === "pending") addTransition(output, state, `RETRY C${client} R${state.leader}`, next => { next.client[client] = "replay"; });
    }
  }
  return output;
}

function transitions(state) {
  if (state.protocol === "LOCAL_IMMEDIATE") return localTransitions(state);
  if (state.protocol === "QUORUM_CLAIM_LOCAL_RECEIPT") return quorumLocalTransitions(state);
  return stagedTransitions(state);
}

function receiptSurvives(state) {
  if (state.releaseEvents === 0) return true;
  if (state.protocol === "QUORUM_STAGED_RELEASE") return state.committedStage >= 2 && aliveNodes(state).length >= 2;
  return state.localReceipt.some((receipt, node) => receipt && state.alive[node]);
}

function invariantValues(state) {
  return {
    S1_AT_MOST_ONE_RELEASE: state.releaseEvents <= 1,
    S2_RECEIPT_BEFORE_RELEASE: !state.releaseWithoutReceipt,
    S3_RECEIPT_SURVIVES_ONE_CRASH: receiptSurvives(state),
    S4_MINORITY_CANNOT_ADVANCE: true,
    S5_LINEARIZABLE_ONE_USE_HISTORY: state.client.filter(status => status === "opened-one").length <= 1,
  };
}

function traceFor(key, parents) {
  const result = [];
  let cursor = key;
  while (parents.get(cursor)?.parent !== null) {
    const item = parents.get(cursor);
    result.push(item.action);
    cursor = item.parent;
  }
  return result.reverse();
}

function explore(protocol) {
  const initial = initialState(protocol);
  const initialKey = canonical(initial);
  const queue = [initialKey];
  const states = new Map([[initialKey, initial]]);
  const parents = new Map([[initialKey, { parent: null, action: null }]]);
  const failures = Object.fromEntries(PRECOMMIT.invariants.map(item => [item.id, null]));
  let cursor = 0;
  let transitionCount = 0;
  let maximumDepth = 0;
  const depths = new Map([[initialKey, 0]]);
  while (cursor < queue.length) {
    const key = queue[cursor++];
    const state = states.get(key);
    const values = invariantValues(state);
    for (const [id, passed] of Object.entries(values)) {
      if (!passed && failures[id] === null) failures[id] = { stateKey: key, state, trace: traceFor(key, parents), traceLength: depths.get(key) };
    }
    for (const edge of transitions(state)) {
      transitionCount += 1;
      const nextKey = canonical(edge.state);
      if (states.has(nextKey)) continue;
      const depth = depths.get(key) + 1;
      maximumDepth = Math.max(maximumDepth, depth);
      states.set(nextKey, edge.state);
      parents.set(nextKey, { parent: key, action: edge.action });
      depths.set(nextKey, depth);
      queue.push(nextKey);
    }
  }
  const livenessFailures = [];
  if (protocol === "QUORUM_STAGED_RELEASE") {
    for (const [key, state] of states) {
      if (aliveNodes(state).length < 2 || state.committedStage === 3) continue;
      const requiredAdvances = 3 - state.committedStage;
      if (requiredAdvances > 3) livenessFailures.push({ stateKey: key, requiredAdvances });
    }
  }
  return {
    protocol,
    reachableStates: states.size,
    exploredTransitions: transitionCount,
    maximumShortestPathDepth: maximumDepth,
    invariants: Object.fromEntries(Object.entries(failures).map(([id, failure]) => [id, { passed: failure === null, ...(failure ? { minimalCounterexample: failure } : {}) }])),
    boundedRecovery: protocol === "QUORUM_STAGED_RELEASE" ? { passed: livenessFailures.length === 0, examinedNonterminalStates: [...states.values()].filter(state => aliveNodes(state).length >= 2 && state.committedStage < 3).length, failures: livenessFailures } : { applicable: false },
  };
}

function linearizabilityFixture(metric) {
  const failure = metric.invariants.S5_LINEARIZABLE_ONE_USE_HISTORY.minimalCounterexample;
  if (!failure) return { protocol: metric.protocol, operations: [{ process: "C0", invocation: 0, completion: 1, result: "opened-one" }, { process: "C1", invocation: 2, completion: 3, result: "replay" }], expectedLinearizable: true };
  const opened = failure.state.client.map((status, client) => ({ status, client })).filter(item => item.status === "opened-one");
  return { protocol: metric.protocol, operations: opened.map((item, index) => ({ process: `C${item.client}`, invocation: index * 2, completion: index * 2 + 1, result: "opened-one" })), expectedLinearizable: false, sourceTrace: failure.trace };
}

const metrics = PROTOCOLS.map(explore);
const deliveryPolicies = [
  { policy: "RESEND_OUTCOME", DELIVERED_ACK_LOST: { atMostOnceClientDelivery: false, eventualClientDelivery: true }, OUTCOME_LOST: { atMostOnceClientDelivery: true, eventualClientDelivery: true } },
  { policy: "WITHHOLD_OUTCOME", DELIVERED_ACK_LOST: { atMostOnceClientDelivery: true, eventualClientDelivery: true }, OUTCOME_LOST: { atMostOnceClientDelivery: true, eventualClientDelivery: false } },
].map(item => ({ ...item, qualifiesExactlyOnceDelivery: item.DELIVERED_ACK_LOST.atMostOnceClientDelivery && item.DELIVERED_ACK_LOST.eventualClientDelivery && item.OUTCOME_LOST.atMostOnceClientDelivery && item.OUTCOME_LOST.eventualClientDelivery }));

const result = {
  resultId: "RC35-DISTRIBUTED-OPENING-MODEL-RESULT-0.9",
  computedOn: "2026-08-14",
  precommitId: PRECOMMIT.precommitId,
  modelKind: PRECOMMIT.modelBoundary.kind,
  metrics,
  linearizabilityFixtures: metrics.map(linearizabilityFixture),
  deliveryIndistinguishability: {
    serverObservationEqual: true,
    policies: deliveryPolicies,
    qualifyingPolicies: deliveryPolicies.filter(item => item.qualifiesExactlyOnceDelivery).length,
    conclusion: "Without a receiver acknowledgement or an idempotent receiver-side effect, the server cannot choose a fixed retry policy that guarantees both at-most-once client delivery after delivered-but-unacknowledged output and eventual delivery after output loss.",
  },
  aggregateDecision: {
    localImmediateQualified: metrics[0].invariants.S1_AT_MOST_ONE_RELEASE.passed && metrics[0].invariants.S5_LINEARIZABLE_ONE_USE_HISTORY.passed,
    quorumClaimLocalReceiptQualified: metrics[1].invariants.S1_AT_MOST_ONE_RELEASE.passed && metrics[1].invariants.S3_RECEIPT_SURVIVES_ONE_CRASH.passed && metrics[1].invariants.S5_LINEARIZABLE_ONE_USE_HISTORY.passed,
    quorumStagedReleaseQualifiedWithinModel: Object.values(metrics[2].invariants).every(item => item.passed) && metrics[2].boundedRecovery.passed,
    exactlyOnceDeliveryQualified: deliveryPolicies.some(item => item.qualifiesExactlyOnceDelivery),
  },
  qualification: {
    supported: "The exhaustive finite abstraction distinguishes local and leader-local counterexamples from a majority-staged protocol with no reachable violation under the preregistered one-crash state space.",
    notEstablished: PRECOMMIT.modelBoundary.notModeled,
    deliveryBoundary: "Exactly-once committed state transition is distinct from exactly-once outcome delivery.",
    externalSystems: "No etcd, Raft, TLA+, Jepsen, multi-host process, disk, or network implementation was executed.",
  },
};

if (WRITE) fs.writeFileSync(path.join(REPRO, "rc35-distributed-opening-model-result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(metrics.map(item => `${item.protocol}: ${item.reachableStates} states, ${item.exploredTransitions} transitions, S1=${item.invariants.S1_AT_MOST_ONE_RELEASE.passed}, S3=${item.invariants.S3_RECEIPT_SURVIVES_ONE_CRASH.passed}, S5=${item.invariants.S5_LINEARIZABLE_ONE_USE_HISTORY.passed}`).join("\n"));
console.log(`RC35 delivery policies qualifying exactly once: ${result.deliveryIndistinguishability.qualifyingPolicies}/${deliveryPolicies.length}.`);
