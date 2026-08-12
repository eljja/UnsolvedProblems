import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateBounds, clopperPearson, selectionOdds, selectionSensitivityBounds } from "./identification/bounds.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specPath = path.join(root, "research/identification/sensitivity-spec.json");
const resultPath = path.join(root, "research/identification/sensitivity-result.json");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const round = (value, digits = 6) => Number(value.toFixed(digits));

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function binomial(trials, probability, random) {
  let successes = 0;
  for (let i = 0; i < trials; i += 1) if (random() < probability) successes += 1;
  return successes;
}

function trialIntervals() {
  const region = spec.zeroSupportRegion;
  const random = rng(region.seed);
  const weights = region.strata.map(item => item.weightWithinRegion);
  const truth = region.strata.reduce((sum, item) => sum + item.weightWithinRegion * item.truePositiveRate, 0);
  const familyAlpha = 1 - region.confidenceLevel;
  const stratumAlpha = familyAlpha / region.strata.length;
  return region.randomizedSampleSizes.map(sampleSize => {
    if (sampleSize === 0) {
      return {
        sampleSize,
        allocation: region.strata.map(() => 0),
        meanRegionalLower: 0,
        meanRegionalUpper: 1,
        meanRegionalWidth: 1,
        meanPolicyContributionWidth: region.targetWeight,
        coverage: 1,
        passesWidthGate: false
      };
    }
    const allocation = region.strata.map((_, index) => Math.floor(sampleSize / region.strata.length) + (index < sampleSize % region.strata.length ? 1 : 0));
    let lowerSum = 0;
    let upperSum = 0;
    let widthSum = 0;
    let covered = 0;
    for (let replication = 0; replication < region.replications; replication += 1) {
      const intervals = region.strata.map((item, index) => clopperPearson(
        binomial(allocation[index], item.truePositiveRate, random),
        allocation[index],
        stratumAlpha
      ));
      const aggregate = aggregateBounds(intervals, weights);
      lowerSum += aggregate.lower;
      upperSum += aggregate.upper;
      widthSum += aggregate.upper - aggregate.lower;
      if (aggregate.lower <= truth && truth <= aggregate.upper) covered += 1;
    }
    const meanWidth = widthSum / region.replications;
    const contributionWidth = region.targetWeight * meanWidth;
    return {
      sampleSize,
      allocation,
      meanRegionalLower: round(lowerSum / region.replications),
      meanRegionalUpper: round(upperSum / region.replications),
      meanRegionalWidth: round(meanWidth),
      meanPolicyContributionWidth: round(contributionWidth),
      widthReductionFromNoData: round(region.targetWeight - contributionWidth),
      reductionPerRandomizedObservation: round((region.targetWeight - contributionWidth) / sampleSize),
      coverage: round(covered / region.replications),
      passesWidthGate: contributionWidth <= spec.decisionGates.maximumZeroSupportContributionWidth
    };
  });
}

function buildResult() {
  const supported = spec.supportedRegion;
  const zero = spec.zeroSupportRegion;
  const a = supported.responseRate * supported.positiveRateAmongObserved;
  const b = supported.responseRate * (1 - supported.positiveRateAmongObserved);
  const zeroTruth = zero.strata.reduce((sum, item) => sum + item.weightWithinRegion * item.truePositiveRate, 0);
  const worlds = supported.indistinguishableWorlds.map(world => {
    const fullMean = a + (1 - supported.responseRate) * world.positiveRateAmongMissing;
    return {
      ...world,
      observedJoint: { positiveAndObserved: round(a), negativeAndObserved: round(b), missing: round(1 - supported.responseRate) },
      supportedMean: round(fullMean),
      selectionOddsRatio: round(selectionOdds(fullMean, a, b)),
      fullPolicyValue: round(supported.targetWeight * fullMean + zero.targetWeight * zeroTruth)
    };
  });
  const sensitivity = supported.selectionOddsGamma.map(gamma => {
    const bounds = selectionSensitivityBounds(supported.responseRate, supported.positiveRateAmongObserved, gamma);
    const lower = supported.targetWeight * bounds.lower;
    const upper = supported.targetWeight * bounds.upper + zero.targetWeight;
    return {
      gamma,
      supportedLower: round(bounds.lower),
      supportedUpper: round(bounds.upper),
      supportedWidth: round(bounds.upper - bounds.lower),
      fullPolicyLowerWithoutZeroSupportTrial: round(lower),
      fullPolicyUpperWithoutZeroSupportTrial: round(upper),
      fullPolicyWidthWithoutZeroSupportTrial: round(upper - lower),
      minimaxMidpoint: round((lower + upper) / 2),
      minimaxWorstCaseError: round((upper - lower) / 2),
      containsWorlds: Object.fromEntries(worlds.map(world => [world.id, bounds.lower <= world.supportedMean && world.supportedMean <= bounds.upper]))
    };
  });
  const randomizedTrials = trialIntervals();
  const gamma25 = sensitivity.find(item => item.gamma === 25);
  const pilot10 = randomizedTrials.find(item => item.sampleSize === 10);
  const auditReduction = supported.targetWeight * gamma25.supportedWidth;
  return {
    simulationId: spec.simulationId,
    generatedOn: spec.reviewedOn,
    observedDistribution: {
      responseRate: supported.responseRate,
      positiveRateAmongObserved: supported.positiveRateAmongObserved,
      positiveAndObserved: round(a),
      negativeAndObserved: round(b),
      missing: round(1 - supported.responseRate)
    },
    indistinguishableWorlds: worlds,
    zeroSupportTruth: {
      regionalPositiveRate: round(zeroTruth),
      targetWeight: zero.targetWeight,
      policyContribution: round(zero.targetWeight * zeroTruth)
    },
    sensitivity,
    randomizedTrials,
    informationValueComparison: {
      referenceGamma: 25,
      perfectMissingnessAuditWidthReduction: round(auditReduction),
      tenRunZeroSupportPilotExpectedWidthReduction: pilot10.widthReductionFromNoData,
      reductionRatioAuditToTenRunPilot: round(auditReduction / pilot10.widthReductionFromNoData),
      nextAction: "missingness-audit-first",
      rationale: "At Gamma 25, externally identifying the response mechanism removes more policy-value ambiguity than ten randomized observations in the zero-support region; retain the ten-run trial as a calibration pilot, not as a point-identification claim."
    },
    preregisteredFindings: {
      observedDistributionDoesNotIdentifyFullMean: worlds[0].supportedMean !== worlds[1].supportedMean,
      gammaOneCollapsesToObservedMean: sensitivity.find(item => item.gamma === 1).supportedWidth === 0,
      gamma25ContainsBothWorlds: Object.values(gamma25.containsWorlds).every(Boolean),
      tenRunsShrinkButFailWidthGate: pilot10.widthReductionFromNoData > 0 && !pilot10.passesWidthGate,
      missingnessAuditDominatesTenRunPilot: auditReduction > pilot10.widthReductionFromNoData
    }
  };
}

const result = buildResult();
if (process.argv.includes("--write")) {
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, resultPath)}`);
} else {
  console.log(JSON.stringify(result, null, 2));
}

export { buildResult };
