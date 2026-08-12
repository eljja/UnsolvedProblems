import { readFile, writeFile } from "node:fs/promises";
import { evaluatePolicy } from "./ope/estimators.mjs";

const root = new URL("../", import.meta.url);
const spec = JSON.parse(await readFile(new URL("research/ope/simulation-spec.json", root), "utf8"));
const round = value => Number(value.toFixed(6));
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

function fnv1a(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const logistic = value => 1 / (1 + Math.exp(-value));
const targetAction = row => Number(row.x2 + 0.4 * row.x1 - 0.2 * row.family > 0);
const meanOutcome = (row, action) => {
  const base = 0.42 + 0.10 * row.x1 - 0.06 * row.x2 + 0.07 * row.family + 0.05 * row.x1 * row.x2;
  const effect = 0.02 + 0.12 * row.x2 - 0.10 * row.family + 0.05 * row.x1 * row.x1;
  return base + action * effect;
};

function truePolicyValue(pointsPerAxis) {
  let total = 0;
  let count = 0;
  for (let family = 0; family <= 1; family += 1) {
    for (let left = 0; left < pointsPerAxis; left += 1) {
      const x1 = -1 + 2 * (left + 0.5) / pointsPerAxis;
      for (let right = 0; right < pointsPerAxis; right += 1) {
        const x2 = -1 + 2 * (right + 0.5) / pointsPerAxis;
        const row = { x1, x2, family };
        total += meanOutcome(row, targetAction(row));
        count += 1;
      }
    }
  }
  return total / count;
}

function behaviorProbability(row, previousVisibleOutcome, overlap) {
  if (overlap === "violated-for-x2-above-0.65" && row.x2 > 0.65) return targetAction(row) ? 0 : 1;
  const weak = overlap === "weak";
  const epsilon = weak ? 0.01 : 0.1;
  const scale = weak ? 3 : 1;
  const raw = logistic(scale * (0.7 * row.x1 - 0.5 * row.x2 + 0.4 * row.family + 0.9 * (previousVisibleOutcome - 0.5)));
  return epsilon + (1 - 2 * epsilon) * raw;
}

function simulateReplication(scenario, seed) {
  const rng = random(seed);
  const rows = [];
  for (let campaign = 0; campaign < spec.sampling.campaignsPerReplication; campaign += 1) {
    let previousVisibleOutcome = 0.5;
    for (let step = 0; step < spec.sampling.roundsPerCampaign; step += 1) {
      const row = {
        campaignId: `C${campaign + 1}`,
        step,
        x1: 2 * rng() - 1,
        x2: 2 * rng() - 1,
        family: Number(rng() < 0.5)
      };
      row.targetAction = targetAction(row);
      row.behaviorProbabilityAction1 = behaviorProbability(row, previousVisibleOutcome, scenario.overlap);
      row.targetActionPropensity = row.targetAction ? row.behaviorProbabilityAction1 : 1 - row.behaviorProbabilityAction1;
      row.action = Number(rng() < row.behaviorProbabilityAction1);
      row.actionPropensityLogged = row.action ? row.behaviorProbabilityAction1 : 1 - row.behaviorProbabilityAction1;
      row.outcome = Number(rng() < meanOutcome(row, row.action));
      row.responsePropensityTrue = scenario.censoring === "outcome-dependent"
        ? 0.25 + 0.5 * row.outcome + 0.15 * Number(row.x1 > 0)
        : 1;
      row.observed = rng() < row.responsePropensityTrue;
      row.actionPropensityEval = scenario.actionPropensity === "fixed-action1-0.8"
        ? (row.action ? 0.8 : 0.2)
        : row.actionPropensityLogged;
      row.responsePropensityEval = scenario.responsePropensity === "known-oracle" ? row.responsePropensityTrue : 1;
      previousVisibleOutcome = row.observed ? row.outcome : 0.5;
      rows.push(row);
    }
  }
  return rows;
}

function summarize(estimates, standardErrors, truth) {
  const average = mean(estimates);
  const deviations = estimates.map(value => value - truth);
  const empiricalSd = Math.sqrt(mean(estimates.map(value => (value - average) ** 2)));
  const averageSe = mean(standardErrors);
  return {
    meanEstimate: round(average),
    bias: round(average - truth),
    rmse: round(Math.sqrt(mean(deviations.map(value => value * value)))),
    empiricalSd: round(empiricalSd),
    meanStandardError: round(averageSe),
    coverage95: round(mean(estimates.map((value, index) => Number(truth >= value - 1.96 * standardErrors[index] && truth <= value + 1.96 * standardErrors[index])))),
    meanIntervalWidth95: round(2 * 1.96 * averageSe)
  };
}

const truth = truePolicyValue(spec.sampling.truthQuadraturePointsPerAxis);
const scenarioResults = [];
for (const scenario of spec.scenarios) {
  const collections = {
    DM: { estimates: [], standardErrors: [] },
    IPW: { estimates: [], standardErrors: [] },
    DR: { estimates: [], standardErrors: [] }
  };
  const effectiveSampleSizes = [];
  const observedFractions = [];
  const minimumTargetPropensities = [];
  const zeroSupportFractions = [];
  for (let replication = 0; replication < spec.sampling.replications; replication += 1) {
    const seed = fnv1a(`${spec.sampling.baseSeed}:${scenario.id}:${replication}`);
    const rows = simulateReplication(scenario, seed);
    const evaluated = evaluatePolicy(rows, scenario.outcomeModel);
    for (const estimator of Object.keys(collections)) {
      collections[estimator].estimates.push(evaluated.estimates[estimator]);
      collections[estimator].standardErrors.push(evaluated.standardErrors[estimator]);
    }
    effectiveSampleSizes.push(evaluated.effectiveSampleSize);
    observedFractions.push(mean(rows.map(row => Number(row.observed))));
    minimumTargetPropensities.push(Math.min(...rows.map(row => row.targetActionPropensity)));
    zeroSupportFractions.push(mean(rows.map(row => Number(row.targetActionPropensity === 0))));
  }
  const minimumTargetActionPropensity = Math.min(...minimumTargetPropensities);
  const meanEffectiveSampleSize = mean(effectiveSampleSizes);
  const supportEligible = minimumTargetActionPropensity >= spec.gates.minimumTargetActionPropensity;
  const precisionEligible = meanEffectiveSampleSize >= spec.gates.minimumMeanEffectiveSampleSize;
  const benchmarkEligible = supportEligible && precisionEligible;
  scenarioResults.push({
    scenarioId: scenario.id,
    causalEligible: supportEligible,
    precisionEligible,
    benchmarkEligible,
    eligibilityReason: !supportEligible
      ? "At least one target action has zero or below-gate behavior-policy support; point identification is refused regardless of model fit."
      : (!precisionEligible
        ? "Target actions retain support, but mean effective sample size is below the frozen precision gate; estimates remain diagnostic."
        : "Target actions retain logged support and mean effective sample size exceeds the frozen precision gate."),
    meanObservedFraction: round(mean(observedFractions)),
    minimumTargetActionPropensity: round(minimumTargetActionPropensity),
    meanZeroSupportFraction: round(mean(zeroSupportFractions)),
    meanEffectiveSampleSize: round(meanEffectiveSampleSize),
    estimators: Object.fromEntries(Object.entries(collections).map(([id, values]) => [id, {
      ...summarize(values.estimates, values.standardErrors, truth),
      diagnosticOnly: !benchmarkEligible
    }]))
  });
  console.log(`finished ${scenario.id}`);
}

const byId = Object.fromEntries(scenarioResults.map(result => [result.scenarioId, result]));
const findings = {
  doubleRobustnessOutcomeMisspecified: Math.abs(byId.outcome_misspecified.estimators.DR.bias) <= spec.gates.acceptableAbsoluteBias,
  doubleRobustnessPropensityMisspecified: Math.abs(byId.propensity_misspecified.estimators.DR.bias) <= spec.gates.acceptableAbsoluteBias,
  bothMisspecifiedFailsBiasGate: Math.abs(byId.both_misspecified.estimators.DR.bias) > spec.gates.acceptableAbsoluteBias,
  mnarCorrectionRestoresBiasGate: Math.abs(byId.mnar_corrected_oracle.estimators.DR.bias) <= spec.gates.acceptableAbsoluteBias,
  mnarIgnoringFailsBiasGate: Math.abs(byId.mnar_ignored.estimators.DR.bias) > spec.gates.acceptableAbsoluteBias,
  weakOverlapReducesEss: byId.weak_overlap.meanEffectiveSampleSize < byId.well_specified.meanEffectiveSampleSize,
  weakOverlapFailsPrecisionGate: byId.weak_overlap.precisionEligible === false,
  zeroSupportRejected: byId.zero_support.causalEligible === false
};
const result = {
  resultId: "OPE-IDENTIFICATION-RESULT-2026-08-12",
  simulationId: spec.simulationId,
  generatedOn: "2026-08-12",
  truth: {
    targetPolicyValue: round(truth),
    method: `${spec.sampling.truthQuadraturePointsPerAxis}x${spec.sampling.truthQuadraturePointsPerAxis} midpoint quadrature for each of two families`
  },
  design: spec.sampling,
  intervalMethod: "Campaign-clustered influence-function standard errors with a normal 95% interval; ridge 1e-8 stabilizes outcome-model normal equations.",
  scenarios: scenarioResults,
  preregisteredFindings: findings,
  interpretationBoundary: "This experiment tests estimator logic under a fully known synthetic data-generating process. It does not estimate any ARROWS or A-Lab policy value and does not validate transport to real chemistry."
};

if (process.argv.includes("--write")) {
  await writeFile(new URL("research/ope/simulation-result.json", root), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log("wrote research/ope/simulation-result.json");
} else {
  console.log(JSON.stringify(result, null, 2));
}
