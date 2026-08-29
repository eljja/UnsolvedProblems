#!/usr/bin/env node

/** Independently replay RC58 attrition and equivalence planning without packages. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, "research/reproducibility/rc58-public-cohort-screen-contract.json"), "utf8"));
const output = path.join(ROOT, "research/reproducibility/rc58-acquisition-design-node.json");

function combination(n, k) {
  const reduced = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= reduced; index += 1) value = value * (n - reduced + index) / index;
  return value;
}

function binomialTail(n, minimum, retainProbability) {
  let total = 0;
  for (let observed = minimum; observed <= n; observed += 1) {
    total += combination(n, observed) * retainProbability ** observed * (1 - retainProbability) ** (n - observed);
  }
  return total;
}

// Peter J. Acklam's inverse-normal rational approximation.
function inverseNormal(probability) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  const high = 1 - low;
  if (probability < low) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (probability <= high) {
    const q = probability - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - probability));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function minimumStart(minimum, retainProbability, targetProbability) {
  for (let n = minimum; n <= 200; n += 1) {
    const probability = binomialTail(n, minimum, retainProbability);
    if (probability >= targetProbability) return { n, probability };
  }
  throw new Error("registered search bound did not produce a design");
}

function equivalenceFloor(alpha, power, standardizedMargin) {
  const zAlpha = inverseNormal(1 - alpha);
  const zPower = inverseNormal((1 + power) / 2);
  return Math.ceil(2 * ((zAlpha + zPower) / standardizedMargin) ** 2);
}

const sensitivity = contract.attritionSensitivity;
const startCells = contract.prospectiveAcquisition.startingCells;
const attritionRows = [];
for (const dropoutProbability of sensitivity.dropoutProbabilities) {
  const retainProbability = 1 - dropoutProbability;
  for (const usableThreshold of sensitivity.usableThresholds) {
    const minimum = minimumStart(usableThreshold, retainProbability, sensitivity.minimumRetentionProbability);
    attritionRows.push({
      dropoutProbability,
      usableThreshold,
      minimumStartingCellsFor95Percent: minimum.n,
      probabilityAtMinimum: minimum.probability,
      probabilityWith48StartingCells: binomialTail(startCells, usableThreshold, retainProbability)
    });
  }
}

const intervention = contract.measurementIntervention;
const oneSidedAlphaPerMetric = intervention.familywiseAlpha / intervention.metrics.length;
const equivalenceRows = [];
for (const standardizedMargin of intervention.standardizedMargins) {
  for (const targetPower of intervention.targetPowers) {
    equivalenceRows.push({
      standardizedMargin,
      targetPower,
      oneSidedAlphaPerMetric,
      minimumPerArmKnownVarianceNormal: equivalenceFloor(oneSidedAlphaPerMetric, targetPower, standardizedMargin)
    });
  }
}

const result = {
  resultId: "RC58-ACQUISITION-DESIGN-NODE-0.1",
  cycleId: contract.cycleId,
  computedOn: contract.sealedOn,
  status: "independent-prospective-sensitivity-only",
  attritionRows,
  equivalenceRows,
  principalDesign: {
    startingCells: startCells,
    at15PercentDropoutProbabilityAtLeast36: binomialTail(startCells, 36, 0.85),
    at20PercentDropoutProbabilityAtLeast24: binomialTail(startCells, 24, 0.8),
    branchRule: contract.prospectiveAcquisition.endpointBranchRule
  },
  outcomeValuesUsed: 0
};

fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.principalDesign, null, 2));
