import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "research/reproducibility/rc40-interval-fault-tree-model-result.json");
const truths = [0, 1, 2];

const reportsFor = radius => truths.map(center => ({
  label: `c${center}r${radius}`,
  low: Number((center - radius).toFixed(6)),
  high: Number((center + radius).toFixed(6))
}));

const product = arrays => arrays.reduce((acc, items) => acc.flatMap(prefix => items.map(item => [...prefix, item])), [[]]);
const statusVectors = n => product(Array.from({ length: n }, () => ["healthy", "arbitrary", "missing"]));

const enumerateWorlds = ({ n, f, m, radius }) => {
  const reports = reportsFor(radius);
  const worlds = [];
  for (const e of truths) {
    for (const statuses of statusVectors(n)) {
      const arbitrary = statuses.filter(status => status === "arbitrary").length;
      const missing = statuses.filter(status => status === "missing").length;
      if (arbitrary > f || missing > m) continue;
      const options = statuses.map(status => {
        if (status === "missing") return [null];
        if (status === "arbitrary") return reports;
        return reports.filter(report => report.low <= e && e <= report.high);
      });
      for (const observation of product(options)) worlds.push({ e, statuses, observation, arbitrary, missing });
    }
  }
  return worlds;
};

const observationKey = observation => JSON.stringify(observation.map(report => report ? [report.low, report.high] : null));
const analyze = parameters => {
  const worlds = enumerateWorlds(parameters);
  const classes = new Map();
  for (const world of worlds) {
    const key = observationKey(world.observation);
    if (!classes.has(key)) classes.set(key, { observation: world.observation.map(report => report ? [report.low, report.high] : null), truths: new Set(), worldCount: 0 });
    const item = classes.get(key);
    item.truths.add(world.e);
    item.worldCount += 1;
  }
  const observations = [...classes.values()].map(item => ({ ...item, truths: [...item.truths].sort((a, b) => a - b) }));
  const collisions = observations.filter(item => item.truths.length > 1);
  return {
    ...parameters,
    worldCount: worlds.length,
    observationCount: observations.length,
    collisionCount: collisions.length,
    identifiesExactEventCount: collisions.length === 0,
    shortestCollision: collisions.sort((a, b) => a.observation.length - b.observation.length || JSON.stringify(a.observation).localeCompare(JSON.stringify(b.observation)))[0] || null
  };
};

const narrowGrid = [];
for (let f = 0; f <= 2; f += 1) {
  for (let m = 0; m <= 2; m += 1) {
    for (let n = 1; n <= 6; n += 1) {
      const result = analyze({ n, f, m, radius: 0.25 });
      narrowGrid.push({
        ...result,
        expectedByBound: n >= 2 * f + m + 1
      });
    }
  }
}

const radiusSweep = [0.25, 0.75, 1, 1.25].map(radius => analyze({ n: 1, f: 0, m: 0, radius }));
const decisiveCases = {
  threeOneFaultNoMissing: analyze({ n: 3, f: 1, m: 0, radius: 0.25 }),
  threeOneFaultOneMissing: analyze({ n: 3, f: 1, m: 1, radius: 0.25 }),
  fourOneFaultOneMissing: analyze({ n: 4, f: 1, m: 1, radius: 0.25 }),
  oneBroadNoFault: analyze({ n: 1, f: 0, m: 0, radius: 1 })
};

const minimalCutSets = [
  { id: "M1", basicEvents: ["shared_aggregator_corruption"], meaning: "one shared evidence processor can forge every operational report" },
  { id: "M2", basicEvents: ["shared_epoch_replay"], meaning: "one shared epoch authority can make stale claims appear current" },
  { id: "M3", basicEvents: ["package_event_misbinding"], meaning: "correct measurements can be attached to the wrong physical event or part" },
  { id: "M4", basicEvents: ["shared_sensor_power_loss", "fail_open_missing_policy"], meaning: "shared power loss becomes false acceptance only when missing evidence fails open" },
  { id: "M5", basicEvents: ["common_calibration_bias", "insufficient_guard_band"], meaning: "shared bias reaches a wrong decision when uncertainty is not guarded" },
  { id: "M6", basicEvents: ["counter_reset", "reset_undetected"], meaning: "reset becomes a false current count when no independent reset evidence exists" },
  { id: "M7", basicEvents: ["optical_occlusion", "electrical_emi", "mechanical_jam"], meaning: "simultaneous modality-specific disturbances defeat the operational physical view" }
];

const safeguards = [
  { id: "S_PROCESSOR", kind: "separation", covers: ["shared_aggregator_corruption", "fail_open_missing_policy", "reset_undetected"] },
  { id: "S_EPOCH", kind: "freshness", covers: ["shared_epoch_replay", "reset_undetected"] },
  { id: "S_IDENTITY", kind: "binding", covers: ["package_event_misbinding"] },
  { id: "S_CALIBRATION", kind: "metrology", covers: ["common_calibration_bias", "insufficient_guard_band"] },
  { id: "W_MECHANICAL", kind: "external-veto-witness", covers: ["shared_sensor_power_loss", "optical_occlusion", "electrical_emi"] },
  { id: "W_OPTICAL", kind: "external-veto-witness", covers: ["shared_sensor_power_loss", "electrical_emi", "mechanical_jam"] },
  { id: "W_ENERGY", kind: "external-veto-witness", covers: ["shared_sensor_power_loss", "optical_occlusion", "mechanical_jam"] },
  { id: "S_RETENTION", kind: "retention", covers: ["counter_reset"] }
];

const subsets = items => {
  const output = [];
  for (let mask = 0; mask < 2 ** items.length; mask += 1) output.push(items.filter((_, index) => mask & (1 << index)));
  return output;
};
const hitsEveryCut = selected => {
  const covered = new Set(selected.flatMap(item => item.covers));
  return minimalCutSets.every(cut => cut.basicEvents.some(event => covered.has(event)));
};
const hitting = subsets(safeguards).filter(hitsEveryCut);
const minimumSize = Math.min(...hitting.map(set => set.length));
const minimumHittingSets = hitting.filter(set => set.length === minimumSize).map(set => set.map(item => item.id));
const inclusionMinimalHittingSets = hitting.filter(set => set.every((_, index) => !hitsEveryCut(set.filter((__, other) => other !== index)))).map(set => set.map(item => item.id));

const vetoCounterexample = {
  truth: 1,
  operationalReports: [0, 0, 0],
  externalVetoReport: 1,
  naivePluralityVerdict: 0,
  vetoPolicyVerdict: "inconclusive",
  lesson: "A single outside-domain witness can veto a false operational consensus but cannot recover exact truth by majority when three corrupted reports remain."
};

const criteria = {
  C1_narrow_interval_grid_matches_bound: narrowGrid.every(item => item.identifiesExactEventCount === item.expectedByBound),
  C2_three_tolerates_one_arbitrary_without_missing: decisiveCases.threeOneFaultNoMissing.identifiesExactEventCount,
  C3_three_fails_with_one_arbitrary_and_one_missing: !decisiveCases.threeOneFaultOneMissing.identifiesExactEventCount,
  C4_four_tolerates_one_arbitrary_and_one_missing: decisiveCases.fourOneFaultOneMissing.identifiesExactEventCount,
  C5_radius_below_count_spacing_identifies_without_fault: radiusSweep.filter(item => item.radius < 1).every(item => item.identifiesExactEventCount),
  C6_radius_at_count_spacing_collides_without_fault: !radiusSweep.find(item => item.radius === 1).identifiesExactEventCount,
  C7_all_missing_observation_is_ambiguous: !narrowGrid.find(item => item.n === 1 && item.f === 0 && item.m === 1).identifiesExactEventCount,
  C8_minimum_safeguard_hitting_set_has_five_members: minimumSize === 5,
  C9_exactly_three_minimum_safeguard_sets_exist: minimumHittingSets.length === 3,
  C10_every_minimum_set_has_four_forced_controls: minimumHittingSets.every(set => ["S_PROCESSOR", "S_EPOCH", "S_IDENTITY", "S_CALIBRATION"].every(id => set.includes(id))),
  C11_every_minimum_set_has_one_external_physical_veto: minimumHittingSets.every(set => set.filter(id => id.startsWith("W_")).length === 1),
  C12_each_minimum_set_is_inclusion_minimal: minimumHittingSets.every(set => inclusionMinimalHittingSets.some(other => JSON.stringify(other) === JSON.stringify(set))),
  C13_external_veto_refuses_but_naive_plurality_is_wrong: vetoCounterexample.naivePluralityVerdict !== vetoCounterexample.truth && vetoCounterexample.vetoPolicyVerdict === "inconclusive",
  C14_no_physical_result_is_claimed: true
};

const result = {
  cycle: "RC-2026-40",
  model: "Interval event-count identifiability with arbitrary reports, omissions, structured common-cause cut sets, and veto-versus-recovery semantics",
  causalChain: [
    "declare count spacing, interval uncertainty, arbitrary-report budget, and omission budget",
    "enumerate every truth and verifier-visible interval vector allowed by those budgets",
    "issue an exact count only for singleton observation classes",
    "derive structured minimal cut sets for false-certificate acceptance",
    "select safeguards hitting every cut set, then keep safe refusal separate from exact recovery"
  ],
  intervalModel: {
    countDomain: truths,
    reportCenters: truths,
    narrowRadius: 0.25,
    spacing: 1,
    grid: { n: [1, 2, 3, 4, 5, 6], f: [0, 1, 2], m: [0, 1, 2], cells: narrowGrid.length },
    bound: "For this finite interval library with radius below count spacing, exact identification holds iff n >= 2f + m + 1.",
    interpretation: "f counts arbitrary interval reports; m counts missing reports. The bound is worst-case identifiability, not a stochastic confidence statement."
  },
  narrowGrid,
  radiusSweep,
  decisiveCases,
  faultTree: {
    topEvent: "accept a false exact physical-event certificate",
    minimalCutSets,
    safeguards,
    minimumSize,
    minimumHittingSets,
    inclusionMinimalHittingSets,
    interpretation: "The hitting set blocks every modeled cut set from reaching false acceptance. It is a safe-refusal architecture, not an exact-recovery quorum."
  },
  vetoCounterexample,
  exactRecoveryRule: "After faults and omissions, exact recovery still requires an active independent narrow-interval quorum satisfying n_active >= 2f_active + m_active + 1; one veto witness only detects disagreement.",
  criteria,
  qualifies: Object.values(criteria).every(Boolean),
  implementationBoundary: {
    actualHardwareInLoop: false,
    physicalSensors: 0,
    physicalEventsObserved: 0,
    calibratedIntervals: 0,
    claim: "Finite combinatorial evidence only; no physical uncertainty distribution, independence claim, cut-set frequency, or safety integrity level is measured."
  }
};

if (process.argv.includes("--write")) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));

