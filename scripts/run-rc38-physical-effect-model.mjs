import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "research/reproducibility/rc38-physical-effect-model-result.json");
const write = process.argv.includes("--write");
const sat = value => Math.min(2, value);
const state = (overrides = {}) => ({ m: 0, e: 0, x: 0, s: 0, a: 0, q: 0, v: 1, r: 0, ...overrides });
const key = value => [value.m, value.e, value.x, value.s, value.a, value.q, value.v, value.r].join("|");
const same = (left, right) => key(left) === key(right);
const push = (items, action, before, after, fault = false) => {
  if (!same(before, after)) items.push({ action, state: after, fault });
};

const commonFinish = (current, items) => {
  if (current.v && current.m && current.e > 0) push(items, "COMPLETE", current, { ...current, v: 0 });
};

const protocols = [
  {
    id: "MARKER_THEN_PULSE",
    observation: ["m", "q"],
    initial: state(),
    next(current) {
      const items = [];
      if (current.v && !current.m) push(items, "WRITE_MARKER", current, { ...current, m: 1 });
      if (current.v && current.m && current.e === 0) push(items, "PULSE", current, { ...current, e: 1, x: 1 });
      commonFinish(current, items);
      if (current.v && current.m && current.e === 0) push(items, "CRASH_RESTART", current, { ...current, v: 0, r: 1 }, true);
      return items;
    }
  },
  {
    id: "PULSE_THEN_MARKER",
    observation: ["m", "q"],
    initial: state(),
    next(current) {
      const items = [];
      if (current.v && !current.m && (current.e === 0 || (current.e === 1 && current.r === 1))) push(items, "PULSE", current, { ...current, e: sat(current.e + 1), x: 1 });
      if (current.v && !current.m && current.e > 0) push(items, "WRITE_MARKER", current, { ...current, m: 1 });
      commonFinish(current, items);
      if (current.v && !current.m && current.e > 0 && !current.r) push(items, "CRASH_RETRY", current, { ...current, r: 1 }, true);
      return items;
    }
  },
  {
    id: "QOS2_ONCE_HANDLER_RETRY",
    observation: ["m", "q"],
    initial: state({ v: 0 }),
    next(current) {
      const items = [];
      if (!current.q) push(items, "DELIVER_APPLICATION_MESSAGE_ONCE", current, { ...current, q: 1, v: 1 });
      if (current.q && current.v && !current.m && (current.e === 0 || (current.e === 1 && current.r === 1))) push(items, "PULSE", current, { ...current, e: sat(current.e + 1), x: 1 });
      if (current.q && current.v && !current.m && current.e > 0) push(items, "WRITE_MARKER", current, { ...current, m: 1 });
      commonFinish(current, items);
      if (current.q && current.v && !current.m && current.e > 0 && !current.r) push(items, "CRASH_RETRY_HANDLER", current, { ...current, r: 1 }, true);
      return items;
    }
  },
  {
    id: "LATE_SENSOR_AFTER_PULSE",
    observation: ["m", "q", "s"],
    initial: state(),
    next(current) {
      const items = [];
      if (current.v && !current.m && current.s === 0 && (current.e === 0 || (current.e === 1 && current.r === 1))) push(items, "PULSE", current, { ...current, e: sat(current.e + 1), x: 1 });
      if (current.v && current.s < current.e) push(items, "RECORD_LATE_SENSOR", current, { ...current, s: current.e });
      if (current.v && !current.m && current.s > 0) push(items, "WRITE_MARKER", current, { ...current, m: 1 });
      commonFinish(current, items);
      if (current.v && !current.m && current.e > current.s && !current.r) push(items, "CRASH_RETRY", current, { ...current, r: 1 }, true);
      return items;
    }
  },
  {
    id: "COUPLED_EVENT_COUNTER",
    observation: ["m", "q", "s"],
    initial: state(),
    next(current) {
      const items = [];
      if (current.v && !current.m && current.s === 0) push(items, "PULSE_AND_COUPLED_COUNT", current, { ...current, e: 1, x: 1, s: 1 });
      if (current.v && !current.m && current.s === 1) push(items, "WRITE_MARKER_FROM_COUNTER", current, { ...current, m: 1 });
      commonFinish(current, items);
      if (current.v && !current.m && current.s === 1 && !current.r) push(items, "CRASH_RECONCILE", current, { ...current, r: 1 }, true);
      return items;
    }
  },
  {
    id: "ATOMIC_ACTUATOR_COMMAND_ID",
    observation: ["m", "q", "a"],
    initial: state(),
    next(current) {
      const items = [];
      if (current.v && !current.m && !current.a) push(items, "ACTUATOR_ACCEPT_ID_AND_PULSE", current, { ...current, a: 1, e: 1, x: 1 });
      if (current.v && !current.m && current.a) push(items, "WRITE_MARKER_FROM_ACCEPTANCE", current, { ...current, m: 1 });
      commonFinish(current, items);
      if (current.v && !current.m && current.a && !current.r) push(items, "CRASH_REPLAY_ID", current, { ...current, r: 1 }, true);
      return items;
    }
  },
  {
    id: "ABSOLUTE_SETPOINT_RETRY",
    observation: ["m", "q", "x"],
    initial: state(),
    next(current) {
      const items = [];
      if (current.v && !current.m && (current.e === 0 || (current.e === 1 && current.r === 1))) push(items, "SET_ABSOLUTE_TARGET", current, { ...current, e: sat(current.e + 1), x: 1 });
      if (current.v && !current.m && current.x) push(items, "WRITE_MARKER_FROM_READBACK", current, { ...current, m: 1 });
      commonFinish(current, items);
      if (current.v && !current.m && current.x && !current.r) push(items, "CRASH_RETRY_SETPOINT", current, { ...current, r: 1 }, true);
      return items;
    }
  }
];

const enumerate = protocol => {
  const initial = protocol.initial;
  const nodes = new Map([[key(initial), { state: initial, trace: [] }]]);
  const queue = [initial];
  let transitions = 0;
  while (queue.length) {
    const current = queue.shift();
    const prefix = nodes.get(key(current)).trace;
    for (const edge of protocol.next(current)) {
      transitions += 1;
      const nextKey = key(edge.state);
      if (!nodes.has(nextKey)) {
        nodes.set(nextKey, { state: edge.state, trace: [...prefix, edge.action] });
        queue.push(edge.state);
      }
    }
  }
  return { nodes, transitions };
};

const healthyReachable = (protocol, start, predicate) => {
  const seen = new Set([key(start)]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    if (predicate(current)) return true;
    for (const edge of protocol.next(current).filter(item => !item.fault)) {
      const nextKey = key(edge.state);
      if (!seen.has(nextKey)) { seen.add(nextKey); queue.push(edge.state); }
    }
  }
  return false;
};

const predicates = {
  T1_stable_marker_matches_one_execution: value => !(value.v === 0 && value.m === 1) || value.e === 1,
  T2_execution_at_most_once: value => value.e <= 1,
  T3_stable_marker_requires_target_state: value => !(value.v === 0 && value.m === 1) || value.x === 1,
  T4_transport_delivery_at_most_once: value => value.q <= 1,
  T5_sensor_never_overstates_execution: value => value.s <= value.e,
  T6_actuator_id_never_aliases_multiple_executions: value => !value.a || value.e === 1
};

const result = protocols.map(protocol => {
  const graph = enumerate(protocol);
  const values = [...graph.nodes.values()];
  const invariants = {};
  for (const [name, predicate] of Object.entries(predicates)) {
    const failed = values.find(item => !predicate(item.state));
    invariants[name] = { pass: !failed, counterexample: failed ? { state: failed.state, trace: failed.trace } : null };
  }
  for (const [name, predicate] of [
    ["T7_exact_healthy_completion_reachable", value => value.v === 0 && value.m === 1 && value.e === 1 && value.x === 1],
    ["T8_target_state_healthy_completion_reachable", value => value.v === 0 && value.m === 1 && value.x === 1]
  ]) {
    const failed = values.find(item => !healthyReachable(protocol, item.state, predicate));
    invariants[name] = { pass: !failed, counterexample: failed ? { state: failed.state, trace: failed.trace } : null };
  }
  const observationGroups = new Map();
  for (const item of values.filter(entry => entry.state.r === 1 || entry.state.v === 0)) {
    const observation = protocol.observation.map(field => item.state[field]).join("|");
    if (!observationGroups.has(observation)) observationGroups.set(observation, []);
    observationGroups.get(observation).push(item);
  }
  let collision = null;
  for (const [observation, group] of observationGroups) {
    const counts = new Set(group.map(item => item.state.e));
    if (counts.size > 1) {
      const first = group[0];
      const second = group.find(item => item.state.e !== first.state.e);
      collision = { observation, fields: protocol.observation, left: { state: first.state, trace: first.trace }, right: { state: second.state, trace: second.trace } };
      break;
    }
  }
  const exactGate = ["T1_stable_marker_matches_one_execution", "T2_execution_at_most_once", "T3_stable_marker_requires_target_state", "T4_transport_delivery_at_most_once", "T5_sensor_never_overstates_execution", "T6_actuator_id_never_aliases_multiple_executions", "T7_exact_healthy_completion_reachable"].every(name => invariants[name].pass) && !collision;
  const stateGate = ["T3_stable_marker_requires_target_state", "T4_transport_delivery_at_most_once", "T5_sensor_never_overstates_execution", "T8_target_state_healthy_completion_reachable"].every(name => invariants[name].pass);
  return { protocol: protocol.id, observation: protocol.observation, states: graph.nodes.size, transitions: graph.transitions, invariants, observationCollision: collision, exactTransitionQualifies: exactGate, targetStateQualifies: stateGate };
});

const candidates = ["final_state", "late_sensor", "actuator_acceptance", "physically_coupled_event_counter"];
const designedPairs = [
  { id: "P1-action-unknown", left: { x: 0, s: 0, a: 0, e: 0 }, right: { x: 1, s: 0, a: 0, e: 1 } },
  { id: "P2-duplicate-hidden-by-state", left: { x: 1, s: 0, a: 0, e: 1 }, right: { x: 1, s: 0, a: 0, e: 2 } },
  { id: "P3-late-sensor-gap", left: { x: 1, s: 0, a: 0, e: 1 }, right: { x: 1, s: 1, a: 0, e: 1 } },
  { id: "P4-controller-acceptance", left: { x: 0, s: 0, a: 0, e: 0 }, right: { x: 1, s: 0, a: 1, e: 1 } }
];
const observe = (candidate, value) => ({ final_state: value.x, late_sensor: value.s, actuator_acceptance: value.a, physically_coupled_event_counter: value.e })[candidate];
const subsets = [];
for (let mask = 1; mask < (1 << candidates.length); mask += 1) subsets.push(candidates.filter((_, index) => mask & (1 << index)));
const covers = subset => designedPairs.filter(pair => pair.left.e !== pair.right.e).every(pair => subset.some(candidate => observe(candidate, pair.left) !== observe(candidate, pair.right)));
const covering = subsets.filter(covers);
const minimumSize = Math.min(...covering.map(item => item.length));
const minimumWitnessSets = covering.filter(item => item.length === minimumSize);

const output = {
  cycle: "RC-2026-38",
  generatedOn: "2026-08-20",
  model: "Finite physical-effect frontier with saturated execution counts and healthy-suffix reachability",
  variables: { m: "sink marker", e: "physical execution count saturated at two", x: "target physical state", s: "sensor/event count", a: "actuator-owned accepted command ID", q: "application-message delivery count", v: "volatile workflow active", r: "a crash/retry boundary has occurred" },
  protocols: result,
  designedPairs,
  minimumWitnessSets,
  gate: {
    exactTransitionQualifiers: result.filter(item => item.exactTransitionQualifies).map(item => item.protocol),
    targetStateQualifiers: result.filter(item => item.targetStateQualifies).map(item => item.protocol),
    expectedExactTransitionQualifiers: ["COUPLED_EVENT_COUNTER", "ATOMIC_ACTUATOR_COMMAND_ID"],
    expectedTargetStateQualifiers: ["PULSE_THEN_MARKER", "QOS2_ONCE_HANDLER_RETRY", "LATE_SENSOR_AFTER_PULSE", "COUPLED_EVENT_COUNTER", "ATOMIC_ACTUATOR_COMMAND_ID", "ABSOLUTE_SETPOINT_RETRY"]
  },
  boundary: "A finite safety and healthy-suffix model. Atomic actuator acceptance and physically coupled counting are assumptions, not measurements. It is not a physical-HIL experiment, a multi-host partition test, a sensor-error model, or an unbounded liveness proof."
};
output.sha256 = crypto.createHash("sha256").update(JSON.stringify(output)).digest("hex");
if (write) fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify(output, null, 2));
