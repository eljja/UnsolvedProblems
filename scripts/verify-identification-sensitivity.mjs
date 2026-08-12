import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clopperPearson, selectionSensitivityBounds } from "./identification/bounds.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/identification/sensitivity-spec.json"), "utf8"));
const result = JSON.parse(fs.readFileSync(path.join(root, "research/identification/sensitivity-result.json"), "utf8"));
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

const mar = selectionSensitivityBounds(0.6, 0.7, 1);
const unrestricted = selectionSensitivityBounds(0.6, 0.7, Infinity);
assert(near(mar.lower, 0.7) && near(mar.upper, 0.7), "Gamma 1 must collapse to the observed positive rate");
assert(near(unrestricted.lower, 0.42) && near(unrestricted.upper, 0.82), "unrestricted bounds must equal the logical missing-data bounds");
assert(clopperPearson(0, 0).lower === 0 && clopperPearson(0, 0).upper === 1, "no-data binomial interval must be [0,1]");
assert(clopperPearson(0, 10).lower === 0 && clopperPearson(10, 10).upper === 1, "extreme Clopper-Pearson endpoints must be exact");
assert(result.simulationId === spec.simulationId, "result and specification IDs must match");
assert(JSON.stringify(result.indistinguishableWorlds[0].observedJoint) === JSON.stringify(result.indistinguishableWorlds[1].observedJoint), "MNAR worlds must have identical observed distributions");
assert(result.indistinguishableWorlds[0].supportedMean !== result.indistinguishableWorlds[1].supportedMean, "MNAR worlds must imply different full means");
assert(Object.values(result.preregisteredFindings).every(Boolean), "all preregistered findings must be adjudicated true");
assert(result.randomizedTrials.find(item => item.sampleSize === 10).coverage >= 0.95, "ten-run stratified interval must retain familywise coverage");
assert(result.randomizedTrials.find(item => item.sampleSize === 0).meanPolicyContributionWidth === spec.zeroSupportRegion.targetWeight, "no-trial width must equal zero-support target weight");

if (failures.length) {
  console.error(`Identification sensitivity verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Identification sensitivity verification passed: analytic bounds, indistinguishable worlds, and randomized-trial gates are consistent.");
