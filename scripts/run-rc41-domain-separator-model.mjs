import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "research/reproducibility/rc41-domain-separator-model-result.json");
const shouldWrite = process.argv.includes("--write");

const unique = values => [...new Set(values)];
const domain = (id, supports, calibrationDomain = id) => ({ id, supports, calibrationDomain, alphabet: unique(Object.values(supports).flat()) });

function observationKey(values, mode) {
  if (mode === "anonymous") return JSON.stringify(values.filter(value => value !== null).sort());
  return JSON.stringify(values);
}

function enumerateTruth(profile, truth, corruptBudget, omissionBudget, mode = "indexed") {
  const observations = new Set();
  let worlds = 0;
  const values = Array(profile.length).fill(null);
  function visit(index, corrupt, omitted) {
    if (index === profile.length) {
      worlds += 1;
      observations.add(observationKey(values, mode));
      return;
    }
    const item = profile[index];
    for (const value of item.supports[String(truth)]) {
      values[index] = value;
      visit(index + 1, corrupt, omitted);
    }
    if (corrupt < corruptBudget) {
      for (const value of item.alphabet) {
        values[index] = value;
        visit(index + 1, corrupt + 1, omitted);
      }
    }
    if (omitted < omissionBudget) {
      values[index] = null;
      visit(index + 1, corrupt, omitted + 1);
    }
  }
  visit(0, 0, 0);
  return { worlds, observations };
}

function separatorCount(profile, left, right) {
  return profile.filter(item => !item.supports[String(left)].some(value => item.supports[String(right)].includes(value))).length;
}

function analyzeProfile(name, profile, truths, corruptBudget, omissionBudget, mode = "indexed") {
  const byTruth = new Map(truths.map(truth => [truth, enumerateTruth(profile, truth, corruptBudget, omissionBudget, mode)]));
  const observed = new Map();
  for (const [truth, result] of byTruth) {
    for (const key of result.observations) {
      if (!observed.has(key)) observed.set(key, new Set());
      observed.get(key).add(truth);
    }
  }
  const collisions = [...observed.entries()].filter(([, compatible]) => compatible.size > 1);
  const pairwiseSeparators = [];
  for (let i = 0; i < truths.length; i += 1) for (let j = i + 1; j < truths.length; j += 1) {
    pairwiseSeparators.push({ left: truths[i], right: truths[j], count: separatorCount(profile, truths[i], truths[j]) });
  }
  return {
    name, mode, domainCount: profile.length, corruptBudget, omissionBudget,
    worldCountByTruth: Object.fromEntries([...byTruth].map(([truth, result]) => [truth, result.worlds])),
    observationCountByTruth: Object.fromEntries([...byTruth].map(([truth, result]) => [truth, result.observations.size])),
    observationCount: observed.size, collisionCount: collisions.length, identifiesExactTruth: collisions.length === 0,
    pairwiseSeparators,
    minimumPairwiseSeparators: Math.min(...pairwiseSeparators.map(item => item.count)),
    shortestCollision: collisions.length ? { observation: JSON.parse(collisions[0][0]), truths: [...collisions[0][1]] } : null
  };
}

const binarySweep = [];
for (let n = 1; n <= 6; n += 1) {
  for (let mask = 0; mask < 2 ** n; mask += 1) {
    const profile = Array.from({ length: n }, (_, index) => {
      const separates = Boolean(mask & (1 << index));
      return separates ? domain(`D${index + 1}`, { 0: ["A"], 1: ["B"] }) : domain(`D${index + 1}`, { 0: ["A"], 1: ["A"] });
    });
    const separators = profile.filter((_, index) => Boolean(mask & (1 << index))).length;
    for (let g = 0; g <= 2; g += 1) for (let a = 0; a <= 2; a += 1) {
      const result = analyzeProfile(`B-${n}-${mask}-${g}-${a}`, profile, [0, 1], g, a);
      binarySweep.push({
        n, mask, separatorCount: separators, corruptBudget: g, omissionBudget: a,
        truth0ObservationCount: result.observationCountByTruth[0], truth1ObservationCount: result.observationCountByTruth[1],
        collisionCount: result.collisionCount, identifiesExactTruth: result.identifiesExactTruth,
        theoremPrediction: separators >= 2 * g + a + 1
      });
    }
  }
}

const direct = (id, calibrationDomain = id) => domain(id, { 0: ["L"], 1: ["M"], 2: ["H"] }, calibrationDomain);
const weakProfile = [direct("D1"), direct("D2"), direct("D3"), domain("D4", { 0: ["W01"], 1: ["W01"], 2: ["H"] }), domain("D5", { 0: ["ALL"], 1: ["ALL"], 2: ["ALL"] })];
const strongProfile = [direct("D1"), direct("D2"), direct("D3"), domain("D4", { 0: ["W01"], 1: ["W01"], 2: ["H"] }), domain("D5", { 0: ["L"], 1: ["W12"], 2: ["W12"] })];
const polarityProfile = [
  domain("D1", { 0: ["L"], 1: ["M"], 2: ["H"] }), domain("D2", { 0: ["M"], 1: ["L"], 2: ["H"] }),
  domain("D3", { 0: ["L"], 1: ["M"], 2: ["H"] }), domain("D4", { 0: ["M"], 1: ["L"], 2: ["H"] })
];
const rawNaiveProfile = Array.from({ length: 6 }, (_, index) => direct(`S${index + 1}`, `C${Math.floor(index / 2) + 1}`));
const correlatedThreeDomains = [
  domain("C1", { 0: ["LL"], 1: ["MM"], 2: ["HH"] }), domain("C2", { 0: ["LL"], 1: ["MM"], 2: ["HH"] }), domain("C3", { 0: ["LL"], 1: ["MM"], 2: ["HH"] })
];
const correlatedPlusAnchor = [...correlatedThreeDomains, direct("ANCHOR")];
const profileResults = [
  analyzeProfile("HETEROGENEOUS_WEAK", weakProfile, [0, 1, 2], 1, 1),
  analyzeProfile("HETEROGENEOUS_STRONG", strongProfile, [0, 1, 2], 1, 1),
  analyzeProfile("POLARITY_INDEXED", polarityProfile, [0, 1, 2], 0, 0, "indexed"),
  analyzeProfile("POLARITY_ANONYMOUS", polarityProfile, [0, 1, 2], 0, 0, "anonymous"),
  analyzeProfile("RAW_CHANNEL_NAIVE", rawNaiveProfile, [0, 1, 2], 1, 1),
  analyzeProfile("THREE_CORRELATED_DOMAINS", correlatedThreeDomains, [0, 1, 2], 1, 1),
  analyzeProfile("THREE_DOMAINS_PLUS_ANCHOR", correlatedPlusAnchor, [0, 1, 2], 1, 1)
];
const profileByName = Object.fromEntries(profileResults.map(item => [item.name, item]));

const populationN = 6;
const threshold = 0.5;
const populationSummaries = [];
for (let observedOnes = 0; observedOnes <= populationN; observedOnes += 1) {
  for (let observedZeros = 0; observedZeros <= populationN - observedOnes; observedZeros += 1) {
    const missing = populationN - observedOnes - observedZeros;
    const minimumSuccesses = observedOnes;
    const maximumSuccesses = observedOnes + missing;
    const lowerMean = minimumSuccesses / populationN;
    const upperMean = maximumSuccesses / populationN;
    const decision = lowerMean > threshold ? "above" : upperMean < threshold ? "below" : "inconclusive";
    populationSummaries.push({ observedOnes, observedZeros, missing, minimumSuccesses, maximumSuccesses, identifiedWidth: missing, lowerMean, upperMean, decision, exactMean: missing === 0 });
  }
}
const decisivePopulation = populationSummaries.find(item => item.observedOnes === 3 && item.observedZeros === 1 && item.missing === 2);
const auditRevealZero = populationSummaries.find(item => item.observedOnes === 3 && item.observedZeros === 2 && item.missing === 1);
const auditRevealOne = populationSummaries.find(item => item.observedOnes === 4 && item.observedZeros === 1 && item.missing === 1);
const missingButThresholdIdentified = populationSummaries.filter(item => item.missing > 0 && item.decision !== "inconclusive");

const criteria = {
  C1_all_binary_separator_cells_match_theorem: binarySweep.every(item => item.identifiesExactTruth === item.theoremPrediction),
  C2_binary_sweep_has_1134_cells: binarySweep.length === 1134,
  C3_heterogeneous_strong_profile_identifies: profileByName.HETEROGENEOUS_STRONG.identifiesExactTruth,
  C4_heterogeneous_weak_profile_collides: !profileByName.HETEROGENEOUS_WEAK.identifiesExactTruth,
  C5_weakest_pair_has_three_separators: profileByName.HETEROGENEOUS_WEAK.minimumPairwiseSeparators === 3,
  C6_indexed_polarity_profile_identifies: profileByName.POLARITY_INDEXED.identifiesExactTruth,
  C7_anonymous_polarity_profile_collides_without_fault: !profileByName.POLARITY_ANONYMOUS.identifiesExactTruth && profileByName.POLARITY_ANONYMOUS.shortestCollision.truths.join("|") === "0|1",
  C8_naive_raw_channel_count_identifies: profileByName.RAW_CHANNEL_NAIVE.identifiesExactTruth,
  C9_three_correlated_domains_do_not_identify: !profileByName.THREE_CORRELATED_DOMAINS.identifiesExactTruth,
  C10_one_independent_anchor_restores_domain_boundary: profileByName.THREE_DOMAINS_PLUS_ANCHOR.identifiesExactTruth,
  C11_population_identified_width_equals_missing_count: populationSummaries.every(item => item.identifiedWidth === item.missing),
  C12_unknown_missing_outcomes_prevent_exact_mean: populationSummaries.filter(item => item.missing > 0).every(item => !item.exactMean),
  C13_all_missing_population_spans_zero_to_one: populationSummaries.some(item => item.missing === 6 && item.lowerMean === 0 && item.upperMean === 1),
  C14_one_audit_reduces_width_and_may_resolve_threshold: auditRevealZero.identifiedWidth === decisivePopulation.identifiedWidth - 1 && auditRevealOne.identifiedWidth === decisivePopulation.identifiedWidth - 1 && auditRevealZero.decision === "inconclusive" && auditRevealOne.decision === "above",
  C15_some_MNAR_bounded_decisions_need_not_recover_every_value: missingButThresholdIdentified.length === 6,
  C16_no_physical_result_is_claimed: true
};

const result = {
  cycle: "RC-2026-41",
  model: "Pairwise independent-domain separator certificate with indexed/adaptive omissions, calibration-domain collapse, and finite-population missing-outcome bounds",
  causalChain: {
    inputAndAllowedAssumptions: "Finite truths, domain-specific healthy output supports, at most g arbitrary calibration-domain corruptions, at most a authenticated indexed omissions, and a declared decision target.",
    bottleneck: "Only domains whose healthy supports are disjoint can separate a truth pair; shared calibration collapses raw channels, and removing domain identity can erase otherwise decisive structure.",
    bridgeLemma: "Two truths can share an indexed observation iff every separating domain can be assigned to at most g corruptions in each world or to at most a common omissions; exact identification therefore requires s(t,u)>=2g+a+1 for every truth pair.",
    independentAdjudicand: "Truth-set cardinality under exhaustive world enumeration, pairwise separator counts, and the finite-population success-count interval [observed ones, observed ones plus missing].",
    finalCriterion: "Emit exact truth only for a singleton identified set; otherwise emit the compatible set or refuse. Population threshold decisions may be emitted before exact recovery only when the entire identified interval lies on one side of the threshold."
  },
  binarySweep,
  profiles: profileResults,
  population: {
    N: populationN, threshold, summaries: populationSummaries,
    decisiveBeforeAudit: decisivePopulation, afterAuditRevealZero: auditRevealZero, afterAuditRevealOne: auditRevealOne,
    missingSummaryCount: populationSummaries.filter(item => item.missing > 0).length,
    missingButThresholdIdentifiedCount: missingButThresholdIdentified.length
  },
  criteria,
  qualifies: Object.values(criteria).every(Boolean),
  implementationBoundary: {
    actualHardwareInLoop: false, physicalSensors: 0, physicalEventsObserved: 0, calibratedSupportSets: 0, auditedHumanRecords: 0,
    claim: "Finite combinatorial identification only; no sensor distribution, covariance magnitude, missingness probability, calibration-domain independence, population effect, or physical safeguard effectiveness is measured."
  }
};

if (shouldWrite) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.qualifies) process.exitCode = 1;
