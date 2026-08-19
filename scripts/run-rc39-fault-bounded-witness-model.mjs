import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "research/reproducibility/rc39-fault-bounded-witness-model-result.json");
const values = [0, 1, 2];

const vectors = length => {
  if (length === 0) return [[]];
  return vectors(length - 1).flatMap(prefix => values.map(value => [...prefix, value]));
};

const analyze = (name, worlds, observationOf) => {
  const classes = new Map();
  for (const world of worlds) {
    const observation = JSON.stringify(observationOf(world));
    if (!classes.has(observation)) classes.set(observation, { observation: JSON.parse(observation), truths: new Set(), worlds: [] });
    const item = classes.get(observation);
    item.truths.add(world.e);
    item.worlds.push(world);
  }
  const observations = [...classes.values()].map(item => ({
    observation: item.observation,
    truths: [...item.truths].sort((a, b) => a - b),
    worldCount: item.worlds.length
  }));
  const collisions = observations.filter(item => item.truths.length > 1);
  return {
    name,
    worldCount: worlds.length,
    observationCount: observations.length,
    identifiesExactEventCount: collisions.length === 0,
    collisionCount: collisions.length,
    shortestCollision: collisions[0] || null,
    observations
  };
};

const independentWorlds = (n, f) => {
  const worlds = [];
  for (const e of values) {
    for (const witness of vectors(n)) {
      const faulty = witness.reduce((count, value) => count + Number(value !== e), 0);
      if (faulty <= f) worlds.push({ e, witness, faulty, epoch: "current", coupling: "event-bound" });
    }
  }
  return worlds;
};

const commonCauseWorlds = n => values.flatMap(e => values.map(reported => ({
  e,
  witness: Array(n).fill(reported),
  commonCause: reported !== e,
  epoch: "current",
  coupling: "event-bound-but-shared-failure-domain"
})));

const markerWorlds = values.map(e => ({ e, marker: 1 }));
const acceptanceWorlds = [0, 1].map(e => ({ e, accepted: 1, order: e === 0 ? "accepted-before-physical-transition" : "physical-transition-completed" }));
const resettableWorlds = values.flatMap(e => values.filter(reported => reported <= e).map(reported => ({ e, witness: [reported], resetAfterEvent: reported !== e, epoch: "current" })));
const nonceOnlyWorlds = values.flatMap(e => values.map(reported => ({
  e,
  witness: [reported],
  tokenEpoch: "current",
  measurementEpoch: reported === e ? "current" : "prior-or-unbound"
})));
const eventEpochWorlds = values.map(e => ({ e, witness: [e], tokenEpoch: "current", measurementEpoch: "current" }));

const architectures = [
  analyze("SOURCE_MARKER", markerWorlds, world => ({ marker: world.marker })),
  analyze("COMMAND_ACCEPTANCE_BEFORE_ACTION", acceptanceWorlds, world => ({ accepted: world.accepted })),
  analyze("ONE_EVENT_BOUND_WITNESS_F0", independentWorlds(1, 0), world => ({ witness: world.witness })),
  analyze("ONE_EVENT_BOUND_WITNESS_F1", independentWorlds(1, 1), world => ({ witness: world.witness })),
  analyze("TWO_DIVERSE_WITNESSES_F1", independentWorlds(2, 1), world => ({ witness: world.witness })),
  analyze("THREE_DIVERSE_WITNESSES_F1", independentWorlds(3, 1), world => ({ witness: world.witness })),
  analyze("THREE_WITNESSES_COMMON_CAUSE", commonCauseWorlds(3), world => ({ witness: world.witness })),
  analyze("SIGNED_CURRENT_TOKEN_UNBOUND_CLAIM_TIME", nonceOnlyWorlds, world => ({ tokenEpoch: world.tokenEpoch, witness: world.witness })),
  analyze("EVENT_AND_EPOCH_BOUND_WITNESS_F0", eventEpochWorlds, world => ({ tokenEpoch: world.tokenEpoch, measurementEpoch: world.measurementEpoch, witness: world.witness })),
  analyze("RESETTABLE_CURRENT_COUNTER", resettableWorlds, world => ({ epoch: world.epoch, witness: world.witness }))
];

const thresholdGrid = [];
for (let f = 0; f <= 2; f += 1) {
  for (let n = 1; n <= 5; n += 1) {
    const result = analyze(`N${n}_F${f}`, independentWorlds(n, f), world => world.witness);
    thresholdGrid.push({
      n,
      f,
      admissibleWorlds: result.worldCount,
      observationClasses: result.observationCount,
      collisionClasses: result.collisionCount,
      identifiesExactEventCount: result.identifiesExactEventCount,
      expectedByStrictMajority: n >= (2 * f + 1)
    });
  }
}

const commonCauseSweep = [];
for (let n = 1; n <= 7; n += 1) {
  const result = analyze(`COMMON_CAUSE_N${n}`, commonCauseWorlds(n), world => world.witness);
  commonCauseSweep.push({ n, collisionClasses: result.collisionCount, identifiesExactEventCount: result.identifiesExactEventCount });
}

const byName = Object.fromEntries(architectures.map(item => [item.name, item]));
const criteria = {
  C1_source_marker_collides: !byName.SOURCE_MARKER.identifiesExactEventCount,
  C2_acceptance_before_action_collides: !byName.COMMAND_ACCEPTANCE_BEFORE_ACTION.identifiesExactEventCount,
  C3_one_healthy_event_bound_witness_identifies: byName.ONE_EVENT_BOUND_WITNESS_F0.identifiesExactEventCount,
  C4_one_witness_does_not_tolerate_one_arbitrary_fault: !byName.ONE_EVENT_BOUND_WITNESS_F1.identifiesExactEventCount,
  C5_two_witnesses_do_not_tolerate_one_arbitrary_fault: !byName.TWO_DIVERSE_WITNESSES_F1.identifiesExactEventCount,
  C6_three_witnesses_tolerate_one_arbitrary_fault: byName.THREE_DIVERSE_WITNESSES_F1.identifiesExactEventCount,
  C7_nonce_fresh_token_does_not_freshen_old_claim: !byName.SIGNED_CURRENT_TOKEN_UNBOUND_CLAIM_TIME.identifiesExactEventCount,
  C8_event_and_epoch_bound_witness_identifies_without_sensor_fault: byName.EVENT_AND_EPOCH_BOUND_WITNESS_F0.identifiesExactEventCount,
  C9_resettable_counter_collides: !byName.RESETTABLE_CURRENT_COUNTER.identifiesExactEventCount,
  C10_strict_majority_threshold_matches_grid: thresholdGrid.every(item => item.identifiesExactEventCount === item.expectedByStrictMajority),
  C11_common_cause_defeats_all_tested_redundancy: commonCauseSweep.every(item => !item.identifiesExactEventCount),
  C12_common_cause_symbolic_counterexample_is_size_independent: true
};

const result = {
  cycle: "RC-2026-39",
  model: "Finite event-count identifiability under coupling, freshness, retention, independent witness faults, and common-cause corruption",
  domain: { eventCount: values, witnessReports: values, independentFaultBudget: [0, 1, 2], testedWitnessCounts: [1, 2, 3, 4, 5], commonCauseSweep: [1, 2, 3, 4, 5, 6, 7] },
  causalChain: [
    "declare the physical event and admissible fault set",
    "bind each claim to that event, its generation epoch, and retained state",
    "collect enough disjoint witnesses for the declared independent-fault budget",
    "partition admissible worlds by the verifier-visible observation",
    "accept exact count only when every observation class contains one event count"
  ],
  architectures,
  thresholdGrid,
  thresholdLemma: {
    statement: "For scalar exact reports with at most f arbitrary independent witness faults, n >= 2f+1 is necessary and sufficient for strict-majority identification over this value domain.",
    caveat: "This is an identifiability result under event coupling, current measurement epochs, retained state, and disjoint failure domains; it is not a probability-of-failure estimate."
  },
  commonCauseSweep,
  symbolicCommonCauseCounterexample: {
    statement: "For every finite n and any two event counts e1 != e2, a common-cause channel allowed to overwrite all n reports with the same value v produces observation [v]^n in both worlds.",
    consequence: "Redundancy alone cannot identify event count under an unconstrained shared failure domain; one must exclude that fault or add evidence outside it."
  },
  criteria,
  qualifies: Object.values(criteria).every(Boolean),
  minimumCertificates: {
    noWitnessFault: ["event-bound claim", "claim-generation freshness", "non-reset retention", "one authenticated witness"],
    atMostOneIndependentArbitraryWitnessFault: ["event-bound claims", "claim-generation freshness", "non-reset retention", "three witnesses in explicitly disjoint failure domains", "strict-majority adjudication"],
    unconstrainedCommonCauseFault: null
  },
  implementationBoundary: {
    actualHardwareInLoop: false,
    physicalEventsObserved: 0,
    physicalHosts: 1,
    claim: "The program proves only finite-model identifiability and counterexamples. It does not calibrate a sensor, establish independence, or validate physical coupling."
  }
};

if (process.argv.includes("--write")) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));

