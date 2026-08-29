#!/usr/bin/env node

/** Dependency-free independent replay of the RC56 outcome-open RWTH landmark screen. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = path.join(ROOT, "research", "reproducibility", "rc55-rwth-frailty-response-feature-table.json");
const OUTPUT = path.join(ROOT, "research", "reproducibility", "rc56-rwth-landmark-development-node.json");
const CANDIDATES = [
  ["R1_capacity_level", 1, "level"],
  ["R1_log_slope", 1, "slope"],
  ["R2_capacity_level", 2, "level"],
  ["R2_recent_log_slope", 2, "slope"],
  ["R2_log_slope_curvature", 2, "curvature"],
  ["R3_capacity_level", 3, "level"],
  ["R3_recent_log_slope", 3, "slope"],
  ["R3_log_slope_curvature", 3, "curvature"],
];

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const maxAbs = (values) => Math.max(...values.map(Math.abs));
const identity = (size) => Array.from({ length: size }, (_, row) => Array.from({ length: size }, (__, column) => row === column ? 1 : 0));
const matVec = (matrix, vector) => matrix.map((row) => dot(row, vector));

function solveLinear(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-14) throw new Error("singular Hessian");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row) => row[size]);
}

function objective(theta, values, times, events) {
  const [intercept, beta, logShape] = theta;
  const shape = Math.exp(logShape);
  const gradient = [0, beta, 0];
  let value = 0.5 * beta * beta;
  for (let index = 0; index < values.length; index += 1) {
    const eta = intercept + beta * values[index];
    const logTime = Math.log(times[index]);
    const u = logTime - eta;
    const exponent = Math.exp(Math.max(-700, Math.min(700, shape * u)));
    const event = events[index] ? 1 : 0;
    value += -event * (logShape + (shape - 1) * logTime - shape * eta) + exponent;
    const gradEta = shape * (event - exponent);
    gradient[0] += gradEta;
    gradient[1] += values[index] * gradEta;
    gradient[2] += -event * (1 + shape * u) + exponent * shape * u;
  }
  return { value, gradient };
}

function hessian(theta, values, times, events) {
  const [intercept, beta, logShape] = theta;
  const shape = Math.exp(logShape);
  const result = Array.from({ length: 3 }, () => Array(3).fill(0));
  for (let index = 0; index < values.length; index += 1) {
    const design = [1, values[index]];
    const eta = intercept + beta * values[index];
    const u = Math.log(times[index]) - eta;
    const exponent = Math.exp(Math.max(-700, Math.min(700, shape * u)));
    const event = events[index] ? 1 : 0;
    const hEtaEta = shape * shape * exponent;
    const hEtaG = shape * (event - exponent) - shape * shape * u * exponent;
    const w = shape * u;
    const hGG = -event * w + exponent * w * (w + 1);
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 2; column += 1) result[row][column] += hEtaEta * design[row] * design[column];
      result[row][2] += hEtaG * design[row];
      result[2][row] += hEtaG * design[row];
    }
    result[2][2] += hGG;
  }
  result[1][1] += 1;
  return result;
}

function fit(values, times, events) {
  let theta = [Math.log(median(times)), 0, Math.log(2)];
  let inverse = identity(3);
  let current = objective(theta, values, times, events);
  for (let iteration = 0; iteration < 5000; iteration += 1) {
    if (maxAbs(current.gradient) <= 1e-9) break;
    let direction = matVec(inverse, current.gradient).map((value) => -value);
    let directional = dot(current.gradient, direction);
    if (!(directional < 0)) {
      inverse = identity(3);
      direction = current.gradient.map((value) => -value);
      directional = -dot(current.gradient, current.gradient);
    }
    let step = 1;
    let candidate;
    while (step >= 2 ** -40) {
      candidate = objective(theta.map((value, index) => value + step * direction[index]), values, times, events);
      if (Number.isFinite(candidate.value) && candidate.value <= current.value + 1e-4 * step * directional) break;
      step *= 0.5;
    }
    if (step < 2 ** -40 || !candidate) break;
    const next = theta.map((value, index) => value + step * direction[index]);
    const s = next.map((value, index) => value - theta[index]);
    const y = candidate.gradient.map((value, index) => value - current.gradient[index]);
    const ys = dot(y, s);
    if (ys > 1e-12) {
      const hy = matVec(inverse, y);
      const factor = (ys + dot(y, hy)) / (ys * ys);
      const updated = identity(3);
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          updated[row][column] = inverse[row][column]
            + factor * s[row] * s[column]
            - (hy[row] * s[column] + s[row] * hy[column]) / ys;
        }
      }
      inverse = updated;
    } else inverse = identity(3);
    theta = next;
    current = candidate;
  }
  for (let polish = 0; polish < 25; polish += 1) {
    current = objective(theta, values, times, events);
    if (maxAbs(current.gradient) <= 1e-11) break;
    let direction = solveLinear(hessian(theta, values, times, events), current.gradient).map((value) => -value);
    let directional = dot(current.gradient, direction);
    if (!(directional < 0)) {
      direction = current.gradient.map((value) => -value);
      directional = -dot(current.gradient, current.gradient);
    }
    let step = 1;
    while (step >= 2 ** -40) {
      const trial = theta.map((value, index) => value + step * direction[index]);
      const candidate = objective(trial, values, times, events);
      if (Number.isFinite(candidate.value) && candidate.value <= current.value + 1e-4 * step * directional) {
        theta = trial;
        break;
      }
      step *= 0.5;
    }
    if (step < 2 ** -40) break;
  }
  return { intercept: theta[0], beta: theta[1], shape: Math.exp(theta[2]) };
}

function derive(row, roundIndex, kind) {
  const rounds = row.capacityRounds.slice(0, roundIndex + 1);
  if (rounds.length !== roundIndex + 1) return null;
  const cycles = rounds.map((item) => Number(item.cycle));
  const capacities = rounds.map((item) => Number(item.capacityAh));
  if (!cycles.every(Number.isFinite) || !capacities.every((value) => Number.isFinite(value) && value > 0)) return null;
  if (!cycles.slice(1).every((cycle, index) => cycle > cycles[index])) return null;
  if (cycles[roundIndex] >= Number(row.endpoint.terminalCycle)) return null;
  let value;
  if (kind === "level") value = Math.log(capacities[roundIndex] / capacities[0]);
  else {
    const recent = Math.log(capacities[roundIndex] / capacities[roundIndex - 1]) / (cycles[roundIndex] - cycles[roundIndex - 1]);
    if (kind === "slope") value = recent;
    else {
      const prior = Math.log(capacities[roundIndex - 1] / capacities[roundIndex - 2]) / (cycles[roundIndex - 1] - cycles[roundIndex - 2]);
      value = recent - prior;
    }
  }
  return {
    id: Number(row.id),
    batch: Math.floor((Number(row.id) - 1) / 4) + 1,
    value,
    time: Number(row.endpoint.terminalCycle) - cycles[roundIndex],
    event: Boolean(row.endpoint.event),
  };
}

function concordance(rows) {
  let pairs = 0;
  let score = 0;
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      if (rows[left].time === rows[right].time) continue;
      const [earlier, later] = rows[left].time < rows[right].time ? [rows[left], rows[right]] : [rows[right], rows[left]];
      if (!earlier.event) continue;
      pairs += 1;
      if (earlier.prediction < later.prediction) score += 1;
      else if (earlier.prediction === later.prediction) score += 0.5;
    }
  }
  return { concordance: pairs ? score / pairs : null, comparablePairs: pairs };
}

function analyze(sourceRows, [name, roundIndex, kind]) {
  const rows = sourceRows.map((row) => derive(row, roundIndex, kind)).filter(Boolean);
  const predictions = [];
  const betaSigns = [];
  let predictedFolds = 0;
  for (let batch = 1; batch <= 12; batch += 1) {
    const train = rows.filter((row) => row.batch !== batch);
    const held = rows.filter((row) => row.batch === batch);
    if (held.length !== 4) continue;
    const center = mean(train.map((row) => row.value));
    const scale = Math.sqrt(mean(train.map((row) => (row.value - center) ** 2)));
    if (!Number.isFinite(scale) || scale === 0) continue;
    const model = fit(train.map((row) => (row.value - center) / scale), train.map((row) => row.time), train.map((row) => row.event));
    betaSigns.push(Math.sign(model.beta));
    predictedFolds += 1;
    for (const row of held) {
      const z = (row.value - center) / scale;
      predictions.push({ ...row, prediction: Math.exp(model.intercept + model.beta * z) * Math.log(2) ** (1 / model.shape) });
    }
  }
  let pairs = 0;
  let score = 0;
  for (let batch = 1; batch <= 12; batch += 1) {
    const metric = concordance(predictions.filter((row) => row.batch === batch));
    if (metric.comparablePairs) {
      pairs += metric.comparablePairs;
      score += metric.concordance * metric.comparablePairs;
    }
  }
  const center = mean(rows.map((row) => row.value));
  const scale = Math.sqrt(mean(rows.map((row) => (row.value - center) ** 2)));
  const full = fit(rows.map((row) => (row.value - center) / scale), rows.map((row) => row.time), rows.map((row) => row.event));
  const fullSign = Math.sign(full.beta);
  const cIndex = pairs ? score / pairs : null;
  const gates = {
    coverage: predictions.length >= 44 && predictedFolds === 12,
    pairs: pairs >= 60,
    ranking: cIndex !== null && cIndex >= 0.65,
    direction: betaSigns.length === 12 && fullSign !== 0 && betaSigns.every((sign) => sign === fullSign),
  };
  return {
    name,
    predictionCoverage: predictions.length,
    withinHeldBatchComparablePairs: pairs,
    withinHeldBatchConcordance: cIndex,
    fullCohortBeta: full.beta,
    fullCohortBetaSign: fullSign,
    foldBetaSigns: betaSigns,
    gates,
    passesAllGates: Object.values(gates).every(Boolean),
  };
}

const table = JSON.parse(await readFile(INPUT, "utf8"));
const results = CANDIDATES.map((candidate) => analyze(table.rows, candidate));
const selectedCandidate = results.find((result) => result.passesAllGates)?.name ?? null;
const output = {
  analysisId: "RC56-RWTH-LANDMARK-DEVELOPMENT-NODE-0.1",
  cycleId: "RC-2026-56",
  completedOn: "2026-08-29",
  status: "independent-outcome-open-method-development-replay",
  selectedCandidate,
  auroraOutcomeAccessAuthorized: selectedCandidate !== null,
  results,
};
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`RC56 independent Node: selected=${selectedCandidate ?? "none"}`);
for (const result of results) {
  console.log(`  ${result.name}: pairs=${result.withinHeldBatchComparablePairs} C=${result.withinHeldBatchConcordance.toFixed(6)} direction=${result.gates.direction} pass=${result.passesAllGates}`);
}
