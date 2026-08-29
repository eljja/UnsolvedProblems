#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const PYTHON_PATH = path.join(REPRO, "rc55-rwth-frailty-response-python.json");
const NODE_PATH = path.join(REPRO, "rc55-rwth-frailty-response-node.json");
const OUTPUT_PATH = path.join(REPRO, "rc55-rwth-frailty-response-independent-audit.json");
const TOLERANCE = 1e-5;

const python = JSON.parse(await readFile(PYTHON_PATH, "utf8"));
const node = JSON.parse(await readFile(NODE_PATH, "utf8"));
const differences = [];

function compare(label, left, right) {
  const difference = Math.abs(left - right);
  differences.push({ label, python: left, node: right, absoluteDifference: difference });
}

for (const code of ["A", "B"]) {
  compare(`${code}.intercept`, python.fits[code].intercept, node.fits[code].intercept);
  compare(`${code}.logShape`, python.fits[code].logShape, node.fits[code].logShape);
  compare(`${code}.objective`, python.fits[code].objective, node.fits[code].objective);
  python.fits[code].coefficients.forEach((value, index) => compare(`${code}.coefficient.${index}`, value, node.fits[code].coefficients[index]));
  compare(`${code}.MdAE`, python.metrics[code].medianAbsoluteErrorCycles, node.metrics[code].medianAbsoluteErrorCycles);
  compare(`${code}.MAE`, python.metrics[code].meanAbsoluteErrorCycles, node.metrics[code].meanAbsoluteErrorCycles);
  compare(`${code}.maxAE`, python.metrics[code].maximumAbsoluteErrorCycles, node.metrics[code].maximumAbsoluteErrorCycles);
  compare(`${code}.concordance`, python.metrics[code].harrellConcordance.value, node.metrics[code].harrellConcordance.value);
  compare(`${code}.maxCalibrationError`, python.metrics[code].maximumCalibrationError, node.metrics[code].maximumCalibrationError);
}

if (python.targetPredictions.length !== node.targetPredictions.length) throw new Error("target prediction counts differ");
for (let index = 0; index < python.targetPredictions.length; index += 1) {
  const left = python.targetPredictions[index];
  const right = node.targetPredictions[index];
  if (left.id !== right.id || left.sourceId !== right.sourceId || left.event !== right.event || left.observedTimeCycles !== right.observedTimeCycles) {
    throw new Error(`target identity or outcome differs at row ${index}`);
  }
  for (const code of ["A", "B"]) compare(`target.${left.id}.${code}`, left.predictedMedianCycles[code], right.predictedMedianCycles[code]);
}

const hypothesisMatch = ["H0", "H1", "H2"].every((code) => python.hypotheses[code].verdict === node.hypotheses[code].verdict);
const denominatorMatch = JSON.stringify(python.cohort.denominators) === JSON.stringify(node.cohort.denominators)
  && python.cohort.targetEventsB === node.cohort.targetEventsB
  && python.cohort.targetCensoredB === node.cohort.targetCensoredB;
const maxAbsoluteDifference = Math.max(...differences.map((item) => item.absoluteDifference));
const pass = maxAbsoluteDifference <= TOLERANCE && hypothesisMatch && denominatorMatch;
const output = {
  auditId: "RC55-RWTH-FRAILTY-RESPONSE-INDEPENDENT-AUDIT-0.1",
  cycleId: "RC-2026-55",
  runOn: "2026-08-29",
  tolerance: TOLERANCE,
  comparedScalarCount: differences.length,
  maxAbsoluteDifference,
  hypothesisMatch,
  denominatorMatch,
  pass,
  verdict: pass ? "independently-reproduced" : "reproduction-failed",
  largestDifferences: differences.sort((a, b) => b.absoluteDifference - a.absoluteDifference).slice(0, 12),
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`RC55 audit: ${output.verdict}; max abs diff=${maxAbsoluteDifference.toExponential(3)}; scalars=${differences.length}`);
if (!pass) process.exitCode = 1;
