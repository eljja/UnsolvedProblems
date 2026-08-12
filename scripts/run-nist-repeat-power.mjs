import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/nist-repeat-power-spec.json"), "utf8"));
const round = (value, digits = 6) => Number(value.toFixed(digits));
const erf = value => {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - polynomial * Math.exp(-x * x));
};
const normalCdf = value => 0.5 * (1 + erf(value / Math.sqrt(2)));
const zCritical = 1.959963984540054;
const powerFor = (control, boundary, icc, coordinates = spec.design.boundaryCoordinatesPerGroup, repeats = spec.design.repeatsPerCoordinate) => {
  const designEffect = 1 + (repeats - 1) * icc;
  const effectiveSampleSize = coordinates * repeats / designEffect;
  const standardError = Math.sqrt(control * (1 - control) / effectiveSampleSize + boundary * (1 - boundary) / effectiveSampleSize);
  const alternativeZ = Math.abs(boundary - control) / standardError;
  const power = normalCdf(-zCritical - alternativeZ) + 1 - normalCdf(zCritical - alternativeZ);
  return { designEffect, effectiveSampleSize, standardError, alternativeZ, power };
};

const scenarios = [];
for (const control of spec.scenarios.controlDiscordance) {
  for (const boundary of spec.scenarios.boundaryDiscordance.filter(value => value > control)) {
    for (const icc of spec.scenarios.icc) {
      const estimate = powerFor(control, boundary, icc);
      scenarios.push({
        controlDiscordance: control,
        boundaryDiscordance: boundary,
        difference: round(boundary - control),
        icc,
        designEffect: round(estimate.designEffect),
        effectiveSampleSizePerGroup: round(estimate.effectiveSampleSize),
        standardError: round(estimate.standardError),
        approximatePower: round(estimate.power),
        passesTarget: estimate.power >= spec.gates.targetPower
      });
    }
  }
}
const primaryPower = icc => powerFor(spec.gates.primaryControlDiscordance, spec.gates.primaryBoundaryDiscordance, icc).power;
let lower = 0;
let upper = 0.999;
for (let iteration = 0; iteration < 80; iteration += 1) {
  const middle = (lower + upper) / 2;
  if (primaryPower(middle) >= spec.gates.targetPower) lower = middle;
  else upper = middle;
}
const repeatEfficiency = spec.scenarios.icc.flatMap(icc => [4, 6, 12].map(repeats => {
  const estimate = powerFor(spec.gates.primaryControlDiscordance, spec.gates.primaryBoundaryDiscordance, icc, spec.design.boundaryCoordinatesPerGroup, repeats);
  return {
    icc,
    repeatsPerCoordinate: repeats,
    acquisitionsPerGroup: spec.design.boundaryCoordinatesPerGroup * repeats,
    effectiveSampleSizePerGroup: round(estimate.effectiveSampleSize),
    approximatePrimaryPower: round(estimate.power)
  };
}));
const primaryAtPlanningIcc = powerFor(spec.gates.primaryControlDiscordance, spec.gates.primaryBoundaryDiscordance, spec.gates.maximumPlanningIcc);
const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: spec.reviewedOn,
  design: spec.design,
  primaryScenario: {
    controlDiscordance: spec.gates.primaryControlDiscordance,
    boundaryDiscordance: spec.gates.primaryBoundaryDiscordance,
    planningIcc: spec.gates.maximumPlanningIcc,
    designEffect: round(primaryAtPlanningIcc.designEffect),
    effectiveSampleSizePerGroup: round(primaryAtPlanningIcc.effectiveSampleSize),
    approximatePower: round(primaryAtPlanningIcc.power),
    maximumIccRetaining80PercentPower: round(lower)
  },
  scenarios,
  repeatEfficiency,
  stagedDecision: {
    pilotAcquisitions: spec.gates.pilotAcquisitions,
    remainingAcquisitionsAfterPilot: spec.design.totalAcquisitions - spec.gates.pilotAcquisitions,
    allocationRule: "Estimate preparation, measurement-condition and residual components in the 392-acquisition pilot. Add preparations when preparation variance dominates, add measurement conditions when condition variance dominates, and add coordinates rather than technical repeats when coordinate ICC is above the 80%-power boundary.",
    refusalRule: spec.gates.stopIf
  },
  findings: {
    acquisitionTotalReconciles: spec.design.totalCoordinates * spec.design.repeatsPerCoordinate === spec.design.totalAcquisitions,
    pilotUsesOneThirdOfAcquisitionBudget: spec.gates.pilotAcquisitions * 3 === spec.design.totalAcquisitions,
    primaryScenarioPassesAtIcc06: primaryAtPlanningIcc.power >= spec.gates.targetPower,
    primaryScenarioFailsAtIcc09: primaryPower(0.9) < spec.gates.targetPower,
    highIccMakesAdditionalTechnicalRepeatsInefficient: powerFor(0.05, 0.2, 0.6, 49, 12).effectiveSampleSize - powerFor(0.05, 0.2, 0.6, 49, 4).effectiveSampleSize < 8,
    powerGridIsPlanningOnly: true
  },
  decision: "Run the 392-acquisition crossed pilot before spending the full 1,176-acquisition budget. The primary 0.20-versus-0.05 discordance contrast has at least 80% approximate power only below the sealed ICC boundary; above it, more technical repeats add little independent information, so acquire more coordinates or stop the transfer claim."
};

const output = path.join(root, "research/reproducibility/nist-repeat-power-result.json");
if (process.argv.includes("--write")) {
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, output)}`);
} else {
  console.log(JSON.stringify(result, null, 2));
}
