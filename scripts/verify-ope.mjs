import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateFixedNuisance } from "./ope/estimators.mjs";

const root = new URL("../", import.meta.url);
const result = JSON.parse(await readFile(new URL("research/ope/simulation-result.json", root), "utf8"));
const fixture = [
  { targetAction: 1, action: 1, outcome: 1, observed: true, actionPropensity: 0.5, responsePropensity: 1, targetPrediction: 0.6, observedPrediction: 0.6 },
  { targetAction: 0, action: 1, outcome: 0, observed: true, actionPropensity: 0.4, responsePropensity: 1, targetPrediction: 0.4, observedPrediction: 0.3 },
  { targetAction: 1, action: 1, outcome: 1, observed: true, actionPropensity: 0.25, responsePropensity: 0.5, targetPrediction: 0.7, observedPrediction: 0.7 }
];
const scores = evaluateFixedNuisance(fixture);
assert.ok(Math.abs(scores.DM - 1.7 / 3) < 1e-12);
assert.ok(Math.abs(scores.IPW - 10 / 3) < 1e-12);
assert.ok(Math.abs(scores.DR - 4.9 / 3) < 1e-12);
assert.equal(result.simulationId, "OPE-IDENTIFICATION-0.1");
assert.equal(result.design.replications, 400);
assert.equal(result.scenarios.length, 8);
assert.ok(result.scenarios.every(scenario => ["DM", "IPW", "DR"].every(id => scenario.estimators[id])));
assert.equal(result.preregisteredFindings.doubleRobustnessOutcomeMisspecified, true);
assert.equal(result.preregisteredFindings.doubleRobustnessPropensityMisspecified, true);
assert.equal(result.preregisteredFindings.bothMisspecifiedFailsBiasGate, true);
assert.equal(result.preregisteredFindings.mnarCorrectionRestoresBiasGate, true);
assert.equal(result.preregisteredFindings.mnarIgnoringFailsBiasGate, true);
assert.equal(result.preregisteredFindings.weakOverlapReducesEss, true);
assert.equal(result.preregisteredFindings.weakOverlapFailsPrecisionGate, true);
assert.equal(result.preregisteredFindings.zeroSupportRejected, true);
const zeroSupport = result.scenarios.find(({ scenarioId }) => scenarioId === "zero_support");
assert.equal(zeroSupport.causalEligible, false);
assert.ok(zeroSupport.meanZeroSupportFraction > 0);
const weakOverlap = result.scenarios.find(({ scenarioId }) => scenarioId === "weak_overlap");
assert.equal(weakOverlap.causalEligible, true);
assert.equal(weakOverlap.benchmarkEligible, false);
console.log("OPE verification passed: fixed-nuisance formulas, eight scenarios, eight preregistered findings, and support/precision refusal gates.");
