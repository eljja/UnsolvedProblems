#!/usr/bin/env node

/** Compare the RC54 Python and dependency-free Node adjudications. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const python = JSON.parse(await readFile(path.join(REPRO, "rc54-kit-early-response-python.json"), "utf8"));
const node = JSON.parse(await readFile(path.join(REPRO, "rc54-kit-early-response-node.json"), "utf8"));
const OUTPUT = path.join(REPRO, "rc54-kit-early-response-independent-audit.json");
const TOLERANCE = 1e-5;

const comparisons = [];
function compare(left, right, key) {
  if (typeof left === "number" && typeof right === "number") {
    comparisons.push({ key, left, right, absoluteDifference: Math.abs(left - right) });
    return;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) throw new Error(`${key}: array length mismatch`);
    left.forEach((value, index) => compare(value, right[index], `${key}[${index}]`));
    return;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    for (const child of Object.keys(left)) {
      if (child in right) compare(left[child], right[child], `${key}.${child}`);
    }
    return;
  }
  if (left !== right) throw new Error(`${key}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`);
}

for (const field of ["completeDevelopmentCells", "completeTargetCells", "targetFeatureComplete", "targetEvents", "targetCensored"]) {
  compare(python.cohort[field], node.cohort[field], `cohort.${field}`);
}
for (const code of "ABCD") {
  for (const field of ["developmentMean", "developmentScale", "intercept", "coefficients", "logShape", "shape", "objective", "gradientMaxAbs", "predictedEta"]) {
    compare(python.fits[code][field], node.fits[code][field], `fits.${code}.${field}`);
  }
  compare(python.metrics[code], node.metrics[code], `metrics.${code}`);
}
compare(python.comparisons, node.comparisons, "comparisons");
compare(python.hypotheses, node.hypotheses, "hypotheses");
if (python.targetPredictions.length !== node.targetPredictions.length) throw new Error("target prediction length mismatch");
for (let index = 0; index < python.targetPredictions.length; index += 1) {
  const left = python.targetPredictions[index];
  const right = node.targetPredictions[index];
  compare(left.id, right.id, `target[${index}].id`);
  compare(left.observedTimeDays, right.observedTimeDays, `target[${index}].observedTimeDays`);
  compare(left.event, right.event, `target[${index}].event`);
  compare(left.predictedMedianDays, right.predictedMedianDays, `target[${index}].predictedMedianDays`);
}

const numeric = comparisons.filter((item) => typeof item.absoluteDifference === "number");
const worst = numeric.reduce((current, item) => item.absoluteDifference > current.absoluteDifference ? item : current, { key: null, absoluteDifference: 0 });
const output = {
  auditId: "RC54-KIT-EARLY-RESPONSE-INDEPENDENT-AUDIT-0.1",
  cycleId: "RC-2026-54",
  runOn: "2026-08-29",
  tolerance: TOLERANCE,
  comparedNumericScalars: numeric.length,
  maximumAbsoluteDifference: worst.absoluteDifference,
  worstDifferenceKey: worst.key,
  targetPredictionCount: python.targetPredictions.length,
  hypothesesMatch: JSON.stringify(python.hypotheses) === JSON.stringify(node.hypotheses),
  everyOptimizerSucceeded: Object.values(python.fits).every((fit) => fit.optimizerSuccess) && Object.values(node.fits).every((fit) => fit.optimizerSuccess),
  pass: worst.absoluteDifference <= TOLERANCE
    && JSON.stringify(python.hypotheses) === JSON.stringify(node.hypotheses)
    && Object.values(python.fits).every((fit) => fit.optimizerSuccess)
    && Object.values(node.fits).every((fit) => fit.optimizerSuccess),
  comparisonBoundary: "The seeded cluster bootstrap interval is a primary descriptive uncertainty calculation and is not recomputed here; all shared deterministic fit, prediction, metric, comparison, cohort, and verdict values are compared."
};
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`RC54 independent audit: ${numeric.length} scalars, max difference=${worst.absoluteDifference} at ${worst.key}, pass=${output.pass}`);
if (!output.pass) process.exitCode = 1;
