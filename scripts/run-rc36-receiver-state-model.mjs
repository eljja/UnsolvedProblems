import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const PRECOMMIT = JSON.parse(fs.readFileSync(path.join(REPRO, "rc36-receiver-delivery-precommit.json"), "utf8"));
const WRITE = process.argv.includes("--write");
const PROTOCOLS = PRECOMMIT.model.protocols.map(item => item.id);
const clone = value => JSON.parse(JSON.stringify(value));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function initialState(protocol) {
  return {
    protocol,
    marker: false,
    markerDigest: null,
    effectRecord: false,
    effectDigest: null,
    effectCount: 0,
    pending: null,
    clients: ["idle", "idle"],
    conflictRejected: false
  };
}

function add(output, state, action, mutate) {
  const next = clone(state);
  mutate(next);
  if (canonical(next) !== canonical(state)) output.push({ action, state: next });
}

function transitions(state) {
  const output = [];
  for (let client = 0; client < 2; client += 1) {
    if (state.clients[client] !== "idle" || state.pending) continue;
    if (state.marker) {
      add(output, state, `RETRY_SAME C${client}`, next => { next.clients[client] = "replay"; });
      add(output, state, `RETRY_CONFLICT C${client}`, next => { next.clients[client] = "conflict"; next.conflictRejected = true; });
      continue;
    }
    if (state.protocol === "EFFECT_THEN_MARKER") {
      add(output, state, `APPLY_EFFECT C${client}`, next => {
        next.effectCount = Math.min(2, next.effectCount + 1);
        next.effectRecord = true;
        next.effectDigest = "A";
        next.pending = { client, phase: "effect-applied" };
      });
    } else if (state.protocol === "MARKER_THEN_EFFECT") {
      add(output, state, `WRITE_MARKER C${client}`, next => {
        next.marker = true;
        next.markerDigest = "A";
        next.pending = { client, phase: "marker-written" };
      });
    } else {
      add(output, state, `ATOMIC_COMMIT C${client}`, next => {
        next.marker = true;
        next.markerDigest = "A";
        next.effectRecord = true;
        next.effectDigest = "A";
        next.effectCount = 1;
        next.clients[client] = "created";
      });
    }
  }

  if (state.pending?.phase === "effect-applied") {
    add(output, state, `WRITE_MARKER C${state.pending.client}`, next => {
      next.marker = true;
      next.markerDigest = "A";
      next.clients[next.pending.client] = "created";
      next.pending = null;
    });
  }
  if (state.pending?.phase === "marker-written") {
    add(output, state, `APPLY_EFFECT C${state.pending.client}`, next => {
      next.effectCount = Math.min(2, next.effectCount + 1);
      next.effectRecord = true;
      next.effectDigest = "A";
      next.clients[next.pending.client] = "created";
      next.pending = null;
    });
  }
  if (state.pending) add(output, state, "CRASH_AND_RESTART", next => { next.pending = null; });
  return output;
}

function invariantFailures(state) {
  return {
    R1_AT_MOST_ONE_EFFECT: state.effectCount > 1,
    R2_MARKER_EFFECT_ATOMIC: state.marker !== state.effectRecord || (state.marker && state.markerDigest !== state.effectDigest),
    R3_REPLAY_IMPLIES_EFFECT: state.clients.some(value => value === "replay") && state.effectCount !== 1,
    R4_CONFLICT_NEVER_MUTATES: state.conflictRejected && [state.markerDigest, state.effectDigest].some(digest => digest !== null && digest !== "A"),
    R5_ONE_SUCCESSFUL_DELIVERY: state.clients.every(value => value !== "idle") && state.effectCount !== 1
  };
}

function explore(protocol) {
  const start = initialState(protocol);
  const startKey = canonical(start);
  const queue = [startKey];
  const states = new Map([[startKey, start]]);
  const traces = new Map([[startKey, []]]);
  const failures = Object.fromEntries(Object.keys(invariantFailures(start)).map(name => [name, null]));
  let transitionsExplored = 0;
  let maxDepth = 0;
  while (queue.length) {
    const key = queue.shift();
    const state = states.get(key);
    const trace = traces.get(key);
    maxDepth = Math.max(maxDepth, trace.length);
    for (const [name, failed] of Object.entries(invariantFailures(state))) {
      if (failed && failures[name] === null) failures[name] = { trace, traceLength: trace.length, state };
    }
    for (const transition of transitions(state)) {
      transitionsExplored += 1;
      const nextKey = canonical(transition.state);
      if (!states.has(nextKey)) {
        states.set(nextKey, transition.state);
        traces.set(nextKey, [...trace, transition.action]);
        queue.push(nextKey);
      }
    }
  }
  return {
    protocol,
    reachableStates: states.size,
    exploredTransitions: transitionsExplored,
    maximumShortestPathDepth: maxDepth,
    invariants: Object.fromEntries(Object.entries(failures).map(([name, failure]) => [name, { passed: failure === null, ...(failure ? { minimalCounterexample: failure } : {}) }]))
  };
}

const metrics = PROTOCOLS.map(explore);
const result = {
  resultId: "RC36-RECEIVER-STATE-MODEL-RESULT-1.0",
  computedOn: "2026-08-14",
  precommitId: PRECOMMIT.precommitId,
  modelKind: PRECOMMIT.model.kind,
  metrics,
  aggregateDecision: {
    qualifyingProtocols: metrics.filter(item => Object.values(item.invariants).every(invariant => invariant.passed)).map(item => item.protocol),
    rejectedProtocols: metrics.filter(item => Object.values(item.invariants).some(invariant => !invariant.passed)).map(item => item.protocol)
  },
  qualification: "A passing bounded model applies only when the receiver's deduplication record and modeled effect share one atomic transaction. It is not a proof for external physical, network, email, payment, or machine-actuation effects."
};

for (const metric of metrics) {
  process.stdout.write(`${metric.protocol}: ${metric.reachableStates} states, ${metric.exploredTransitions} transitions, ${Object.entries(metric.invariants).map(([name, value]) => `${name}=${value.passed}`).join(", ")}\n`);
}
if (WRITE) fs.writeFileSync(path.join(REPRO, "rc36-receiver-state-model-result.json"), `${JSON.stringify(result, null, 2)}\n`);
if (result.aggregateDecision.qualifyingProtocols.join("|") !== "ATOMIC_INBOX_EFFECT") process.exitCode = 1;
