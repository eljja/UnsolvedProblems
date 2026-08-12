import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectionSensitivityBounds } from "./identification/bounds.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/two-phase/rescue-spec.json"), "utf8"));
const resultPath = path.join(root, "research/two-phase/rescue-result.json");
const round = value => Number(value.toFixed(6));
const initial = spec.initialObservedDistribution;
const initialObservedPositive = initial.responseRate * initial.positiveRateAmongObserved;
const missingFraction = 1 - initial.responseRate;

function responseProbabilityForSuccess(failureProbability, oddsRatio) {
  return oddsRatio * failureProbability / (1 - failureProbability + oddsRatio * failureProbability);
}

const scenarios = [];
for (const firstGamma of spec.firstStageSelectionOddsGamma) {
  const truePopulationMean = selectionSensitivityBounds(initial.responseRate, initial.positiveRateAmongObserved, firstGamma).lower;
  const trueMissingPositiveRate = (truePopulationMean - initialObservedPositive) / missingFraction;
  for (const responseOddsRatio of spec.rescueResponse.trueOutcomeOddsRatio) {
    const q0 = spec.rescueResponse.failureResponseProbability;
    const q1 = responseProbabilityForSuccess(q0, responseOddsRatio);
    const rescueResponseRate = trueMissingPositiveRate * q1 + (1 - trueMissingPositiveRate) * q0;
    const rescueObservedPositiveRate = trueMissingPositiveRate * q1 / rescueResponseRate;
    const naivePopulationMean = initialObservedPositive + missingFraction * rescueObservedPositiveRate;
    const sensitivity = spec.rescueResponse.assumedSensitivityGamma.map(assumedGamma => {
      const bounds = selectionSensitivityBounds(rescueResponseRate, rescueObservedPositiveRate, assumedGamma);
      const lower = initialObservedPositive + missingFraction * bounds.lower;
      const upper = initialObservedPositive + missingFraction * bounds.upper;
      return {
        assumedGamma,
        populationLower: round(lower),
        populationUpper: round(upper),
        populationWidth: round(upper - lower),
        containsTruth: lower <= truePopulationMean + 1e-12 && truePopulationMean <= upper + 1e-12,
        passesWidthGate: upper - lower <= spec.decisionGates.maximumPopulationWidth
      };
    });
    scenarios.push({
      firstGamma,
      responseOddsRatio,
      truePopulationMean: round(truePopulationMean),
      trueMissingPositiveRate: round(trueMissingPositiveRate),
      successResponseProbability: round(q1),
      failureResponseProbability: q0,
      rescueResponseRate: round(rescueResponseRate),
      rescueObservedPositiveRate: round(rescueObservedPositiveRate),
      naivePopulationMean: round(naivePopulationMean),
      naiveBias: round(naivePopulationMean - truePopulationMean),
      naivePassesBiasGate: Math.abs(naivePopulationMean - truePopulationMean) <= spec.decisionGates.naiveAbsoluteBiasTolerance,
      sensitivity
    });
  }
}

const outcomeDependent = scenarios.filter(item => item.responseOddsRatio === 4);
const result = {
  studyId: spec.studyId,
  generatedOn: spec.reviewedOn,
  scenarios,
  findings: {
    randomizedInvitationDoesNotPreventSecondStageBias: outcomeDependent.every(item => Math.abs(item.naiveBias) > spec.decisionGates.naiveAbsoluteBiasTolerance),
    correctSecondStageGammaContainsTruth: scenarios.every(item => item.sensitivity.find(bound => bound.assumedGamma === item.responseOddsRatio).containsTruth),
    underspecifiedGammaCanMissTruth: outcomeDependent.some(item => !item.sensitivity.find(bound => bound.assumedGamma === 2).containsTruth),
    gammaFourBoundsPassWidthGate: outcomeDependent.every(item => item.sensitivity.find(bound => bound.assumedGamma === 4).passesWidthGate),
    invitationProbabilityDoesNotAlterIdentificationBounds: true
  },
  decision: "Record invitation probabilities for design weighting, but model or bound rescue response separately. A randomized invitation does not justify treating successful rescues as representative when response depends on the missing outcome."
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, resultPath)}`);
} else console.log(JSON.stringify(result, null, 2));

export { result };
