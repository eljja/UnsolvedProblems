import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "research", "reproducibility", "rc37-outbox-sink-model-result.json");
const WRITE = process.argv.includes("--write");
const PROTOCOLS = ["DUAL_WRITE", "EARLY_OUTBOX_ACK", "NON_IDEMPOTENT_SINK", "ATOMIC_OUTBOX_IDEMPOTENT_SINK"];
const INITIAL = Object.freeze({ ri: 0, ro: 0, od: 0, si: 0, se: 0, vi: 0, vr: 0, sm: 0, va: 0, cr: 0 });

function clone(state, patch) { return { ...state, ...patch }; }
function key(state) { return [state.ri, state.ro, state.od, state.si, state.se, state.vi, state.vr, state.sm, state.va, state.cr].join(""); }

function nextStates(protocol, state) {
  const next = [];
  const add = (action, value) => { if (key(value) !== key(state)) next.push({ action, state: value }); };

  if (!state.ri) {
    if (protocol === "DUAL_WRITE") add("ACCEPT_INBOX", clone(state, { ri: 1, vi: 1 }));
    else add("ACCEPT_INBOX_AND_OUTBOX", clone(state, { ri: 1, ro: 1 }));
  }
  if (protocol === "DUAL_WRITE" && state.ri && state.vi && !state.ro) {
    add("WRITE_OUTBOX_SEPARATELY", clone(state, { ro: 1, vi: 0 }));
  }
  if (protocol === "EARLY_OUTBOX_ACK" && state.ro && !state.od) {
    add("MARK_OUTBOX_DELIVERED_EARLY", clone(state, { od: 1, vr: 1 }));
  }
  if (protocol === "EARLY_OUTBOX_ACK" && state.vr) {
    add("SEND_AFTER_EARLY_MARK", clone(state, { si: 1, se: 1, vr: 0 }));
  }
  if ((protocol === "DUAL_WRITE" || protocol === "ATOMIC_OUTBOX_IDEMPOTENT_SINK") && state.ro && !state.od) {
    if (!state.si) add("SINK_ATOMIC_CREATE", clone(state, { si: 1, se: 1, va: 1 }));
    else add("SINK_IDEMPOTENT_REPLAY", clone(state, { va: 1 }));
  }
  if (protocol === "NON_IDEMPOTENT_SINK" && state.ro && !state.od) {
    add("APPLY_SINK_EFFECT", clone(state, { se: Math.min(2, state.se + 1), sm: 1 }));
    if (state.sm) add("WRITE_SINK_MARKER", clone(state, { si: 1, sm: 0, va: 1 }));
  }
  if (state.va && state.ro && !state.od) add("ACK_OUTBOX", clone(state, { od: 1, va: 0 }));
  if (state.va) add("DROP_SINK_ACK", clone(state, { va: 0 }));
  if (!state.cr || state.vi || state.vr || state.sm || state.va) {
    add("CRASH_AND_RESTART", clone(state, { vi: 0, vr: 0, sm: 0, va: 0, cr: 1 }));
  }
  return next;
}

function enumerate(protocol) {
  const states = new Map([[key(INITIAL), INITIAL]]);
  const traces = new Map([[key(INITIAL), []]]);
  const queue = [INITIAL];
  const edges = [];
  while (queue.length) {
    const state = queue.shift();
    for (const transition of nextStates(protocol, state)) {
      const from = key(state);
      const to = key(transition.state);
      edges.push({ from, action: transition.action, to });
      if (!states.has(to)) {
        states.set(to, transition.state);
        traces.set(to, [...traces.get(from), transition.action]);
        queue.push(transition.state);
      }
    }
  }
  return { states, traces, edges };
}

const terminal = state => state.ri === 1 && state.ro === 1 && state.od === 1 && state.si === 1 && state.se === 1;
const healthyAction = action => !["CRASH_AND_RESTART", "DROP_SINK_ACK"].includes(action);

function healthyCompletionReachable(protocol, start) {
  const seen = new Set([key(start)]);
  const queue = [start];
  while (queue.length) {
    const state = queue.shift();
    if (terminal(state)) return true;
    for (const transition of nextStates(protocol, state).filter(item => healthyAction(item.action))) {
      const nextKey = key(transition.state);
      if (!seen.has(nextKey)) { seen.add(nextKey); queue.push(transition.state); }
    }
  }
  return false;
}

function shortestFailure(graph, predicate) {
  let best = null;
  for (const [stateKey, state] of graph.states) {
    if (!predicate(state)) continue;
    const trace = graph.traces.get(stateKey);
    if (!best || trace.length < best.trace.length) best = { state, trace };
  }
  return best;
}

function adjudicate(protocol) {
  const graph = enumerate(protocol);
  const recoverabilityFailures = [...graph.states.values()].filter(state => state.ri && !healthyCompletionReachable(protocol, state));
  const predicates = {
    M1_no_crash_stable_receiver_orphan: state => state.cr && state.ri && !state.ro,
    M2_sink_effect_at_most_once: state => state.se > 1,
    M3_sink_marker_matches_one_effect: state => Boolean(state.si) !== (state.se === 1),
    M4_delivered_outbox_implies_sink_commit: state => state.od && !(state.si && state.se === 1),
    M5_sink_commit_has_receiver_origin: state => state.si && !(state.ri && state.ro),
    M6_healed_completion_reachable: state => recoverabilityFailures.some(item => key(item) === key(state))
  };
  const invariants = Object.fromEntries(Object.entries(predicates).map(([name, fails]) => {
    const failure = shortestFailure(graph, fails);
    return [name, { pass: !failure, counterexample: failure }];
  }));
  return {
    protocol,
    states: graph.states.size,
    transitions: graph.edges.length,
    invariants,
    qualifies: Object.values(invariants).every(item => item.pass)
  };
}

const protocols = PROTOCOLS.map(adjudicate);
const result = {
  cycle: "RC-2026-37",
  experiment: "finite receiver-outbox-relay-sink crash model",
  computedOn: "2026-08-14",
  stateEncoding: {
    ri: "receiver inbox durable", ro: "receiver outbox durable", od: "outbox marked delivered",
    si: "sink inbox durable", se: "sink effect count saturated at 2", vi: "volatile receiver intent",
    vr: "volatile relay intent after early mark", sm: "volatile sink marker intent", va: "volatile acknowledgement",
    cr: "at least one crash has occurred"
  },
  protocols,
  gate: {
    expectedUniqueQualifier: "ATOMIC_OUTBOX_IDEMPOTENT_SINK",
    uniqueQualifier: protocols.filter(item => item.qualifies).map(item => item.protocol),
    pass: protocols.filter(item => item.qualifies).length === 1 && protocols.find(item => item.qualifies)?.protocol === "ATOMIC_OUTBOX_IDEMPOTENT_SINK"
  },
  boundary: "Finite saturated safety model plus healthy-suffix reachability; not an unbounded temporal proof, performance model, Byzantine model, or physical-host experiment."
};

if (WRITE) fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ protocols: protocols.map(({ protocol, states, transitions, qualifies }) => ({ protocol, states, transitions, qualifies })), gate: result.gate }, null, 2)}\n`);
if (!result.gate.pass) process.exitCode = 1;
