import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clopperPearson, selectionSensitivityBounds } from "./identification/bounds.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/two-phase/finite-spec.json"), "utf8"));
const resultPath = path.join(root, "research/two-phase/finite-result.json");
const round = value => Number(value.toFixed(6));
const initial = spec.initialObservedDistribution;
const initialObservedPositive = initial.responseRate * initial.positiveRateAmongObserved;
const missingFraction = 1 - initial.responseRate;

function responseProbabilityForSuccess(failureProbability, oddsRatio) {
  return oddsRatio * failureProbability / (1 - failureProbability + oddsRatio * failureProbability);
}

function logFactorials(n) {
  const values = [0];
  for (let index = 1; index <= n; index += 1) values.push(values[index - 1] + Math.log(index));
  return values;
}

function multinomialProbability(counts, probabilities, logFacts) {
  const n = counts.reduce((sum, value) => sum + value, 0);
  let logProbability = logFacts[n];
  for (let index = 0; index < counts.length; index += 1) {
    logProbability -= logFacts[counts[index]];
    if (counts[index] && probabilities[index] === 0) return 0;
    if (counts[index]) logProbability += counts[index] * Math.log(probabilities[index]);
  }
  return Math.exp(logProbability);
}

function finiteGammaBounds(successInterval, failureInterval, gamma) {
  const successForLower = successInterval.lower;
  const failureForLower = Math.min(failureInterval.upper, 1 - successForLower);
  const successForUpper = Math.min(successInterval.upper, 1 - failureInterval.lower);
  const failureForUpper = failureInterval.lower;
  const lowerResponse = successForLower + failureForLower;
  const upperResponse = successForUpper + failureForUpper;
  const lower = lowerResponse === 0 ? 0 : selectionSensitivityBounds(lowerResponse, successForLower / lowerResponse, gamma).lower;
  const upper = upperResponse === 0 ? 1 : selectionSensitivityBounds(upperResponse, successForUpper / upperResponse, gamma).upper;
  return { lower, upper };
}

function enumerate(invitationCount, trueMissingPositiveRate, truePopulationMean) {
  const q0 = spec.rescueResponse.failureResponseProbability;
  const q1 = responseProbabilityForSuccess(q0, spec.rescueResponse.trueOutcomeOddsRatio);
  const probabilities = [
    trueMissingPositiveRate * q1,
    (1 - trueMissingPositiveRate) * q0,
    trueMissingPositiveRate * (1 - q1) + (1 - trueMissingPositiveRate) * (1 - q0)
  ];
  const marginalAlpha = (1 - spec.simultaneousInterval.familyConfidence) / spec.simultaneousInterval.cellsUsed.length;
  const intervals = Array.from({ length: invitationCount + 1 }, (_, count) => clopperPearson(count, invitationCount, marginalAlpha));
  const logFacts = logFactorials(invitationCount);
  let probabilityTotal = 0;
  let coverage = 0;
  let expectedWidth = 0;
  let widthGateProbability = 0;
  let minimumWidth = Infinity;
  let maximumWidth = 0;
  let enumeratedTables = 0;
  for (let success = 0; success <= invitationCount; success += 1) {
    for (let failure = 0; failure <= invitationCount - success; failure += 1) {
      const nonresponse = invitationCount - success - failure;
      const probability = multinomialProbability([success, failure, nonresponse], probabilities, logFacts);
      const missingBounds = finiteGammaBounds(intervals[success], intervals[failure], spec.rescueResponse.assumedSensitivityGamma);
      const populationLower = initialObservedPositive + missingFraction * missingBounds.lower;
      const populationUpper = initialObservedPositive + missingFraction * missingBounds.upper;
      const width = populationUpper - populationLower;
      probabilityTotal += probability;
      expectedWidth += probability * width;
      if (populationLower <= truePopulationMean + 1e-12 && truePopulationMean <= populationUpper + 1e-12) coverage += probability;
      if (width <= spec.decisionGates.maximumExpectedPopulationWidth) widthGateProbability += probability;
      minimumWidth = Math.min(minimumWidth, width);
      maximumWidth = Math.max(maximumWidth, width);
      enumeratedTables += 1;
    }
  }
  return {
    invitationCount,
    multinomialCellProbabilities: probabilities.map(round),
    enumeratedTables,
    probabilityTotal: round(probabilityTotal),
    exactCoverage: round(coverage / probabilityTotal),
    expectedPopulationWidth: round(expectedWidth / probabilityTotal),
    probabilityWidthAtMostGate: round(widthGateProbability / probabilityTotal),
    minimumRealizedWidth: round(minimumWidth),
    maximumRealizedWidth: round(maximumWidth)
  };
}

const worlds = spec.firstStageSelectionOddsGamma.map(firstGamma => {
  const truePopulationMean = selectionSensitivityBounds(initial.responseRate, initial.positiveRateAmongObserved, firstGamma).lower;
  const trueMissingPositiveRate = (truePopulationMean - initialObservedPositive) / missingFraction;
  return {
    firstGamma,
    truePopulationMean: round(truePopulationMean),
    trueMissingPositiveRate: round(trueMissingPositiveRate),
    samples: spec.invitationCounts.map(count => enumerate(count, trueMissingPositiveRate, truePopulationMean))
  };
});

const result = {
  studyId: spec.studyId,
  generatedOn: spec.reviewedOn,
  method: {
    samplingLaw: "Three-cell multinomial: success responder, failure responder, invited nonresponder",
    simultaneousConfidence: spec.simultaneousInterval.familyConfidence,
    marginalIntervals: "Two-sided Clopper-Pearson at 97.5% for each of two response cells; Bonferroni family coverage is at least 95%",
    propagation: "Monotone endpoint propagation through the Gamma-4 response-odds identification map"
  },
  worlds,
  findings: {
    allWorldsMeetCoverageGate: worlds.every(world => world.samples.every(sample => sample.exactCoverage >= spec.decisionGates.minimumExactCoverage)),
    expectedWidthFallsWithSampleSize: worlds.every(world => world.samples.every((sample, index) => index === 0 || sample.expectedPopulationWidth < world.samples[index - 1].expectedPopulationWidth)),
    finiteSamplingCanFailWidthGate: worlds.some(world => world.samples.some(sample => sample.expectedPopulationWidth > spec.decisionGates.maximumExpectedPopulationWidth)),
    largerSamplesDoNotRemoveIdentificationWidth: true
  },
  decision: "Use the simultaneous finite-sample interval for adjudication. More invitations shrink the sampling layer, but the Gamma-4 identification layer remains; sample-size expansion cannot substitute for an external constraint on outcome-dependent rescue response."
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, resultPath)}`);
} else console.log(JSON.stringify(result, null, 2));

export { finiteGammaBounds, result };
