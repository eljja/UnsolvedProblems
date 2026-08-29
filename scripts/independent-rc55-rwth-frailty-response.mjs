#!/usr/bin/env node

/** Dependency-free RC55 Weibull AFT and metric recomputation from the sealed feature table. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = path.join(ROOT, "research", "reproducibility", "rc55-rwth-frailty-response-feature-table.json");
const OUTPUT = path.join(ROOT, "research", "reproducibility", "rc55-rwth-frailty-response-node.json");
const ALPHA = 1;

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const maxAbs = (values) => Math.max(...values.map(Math.abs));

function objective(theta, x, times, events) {
  const featureCount = theta.length - 2;
  const intercept = theta[0];
  const beta = theta.slice(1, -1);
  const logShape = theta.at(-1);
  const shape = Math.exp(logShape);
  const gradient = Array(theta.length).fill(0);
  let value = 0;
  for (let index = 0; index < x.length; index += 1) {
    const eta = intercept + dot(x[index], beta);
    const logTime = Math.log(times[index]);
    const u = logTime - eta;
    const exponent = Math.exp(Math.max(-700, Math.min(700, shape * u)));
    const event = events[index] ? 1 : 0;
    value += -event * (logShape + (shape - 1) * logTime - shape * eta) + exponent;
    const gradEta = shape * (event - exponent);
    gradient[0] += gradEta;
    for (let column = 0; column < featureCount; column += 1) gradient[column + 1] += x[index][column] * gradEta;
    gradient[gradient.length - 1] += -event * (1 + shape * u) + exponent * shape * u;
  }
  for (let column = 0; column < featureCount; column += 1) {
    value += 0.5 * ALPHA * beta[column] ** 2;
    gradient[column + 1] += ALPHA * beta[column];
  }
  return { value, gradient };
}

function identity(size) {
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (__, column) => row === column ? 1 : 0));
}

function matVec(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

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

function analyticHessian(theta, x, times, events) {
  const featureCount = x[0].length;
  const beta = theta.slice(1, -1);
  const shape = Math.exp(theta.at(-1));
  const size = featureCount + 2;
  const hessian = Array.from({ length: size }, () => Array(size).fill(0));
  for (let index = 0; index < x.length; index += 1) {
    const design = [1, ...x[index]];
    const eta = theta[0] + dot(x[index], beta);
    const u = Math.log(times[index]) - eta;
    const exponent = Math.exp(Math.max(-700, Math.min(700, shape * u)));
    const event = events[index] ? 1 : 0;
    const hEtaEta = shape * shape * exponent;
    const hEtaG = shape * (event - exponent) - shape * shape * u * exponent;
    const w = shape * u;
    const hGG = -event * w + exponent * w * (w + 1);
    for (let row = 0; row < design.length; row += 1) {
      for (let column = 0; column < design.length; column += 1) {
        hessian[row][column] += hEtaEta * design[row] * design[column];
      }
      hessian[row][size - 1] += hEtaG * design[row];
      hessian[size - 1][row] += hEtaG * design[row];
    }
    hessian[size - 1][size - 1] += hGG;
  }
  for (let column = 0; column < featureCount; column += 1) hessian[column + 1][column + 1] += ALPHA;
  return hessian;
}

function bfgs(x, times, events, featureCount) {
  let theta = Array(featureCount + 2).fill(0);
  theta[0] = Math.log(median(times));
  theta[theta.length - 1] = Math.log(2);
  let inverse = identity(theta.length);
  let current = objective(theta, x, times, events);
  let iterations = 0;
  for (; iterations < 5000; iterations += 1) {
    if (maxAbs(current.gradient) <= 1e-8) break;
    let direction = matVec(inverse, current.gradient).map((value) => -value);
    let directional = dot(current.gradient, direction);
    if (!(directional < 0)) {
      inverse = identity(theta.length);
      direction = current.gradient.map((value) => -value);
      directional = -dot(current.gradient, current.gradient);
    }
    let step = 1;
    let candidate;
    while (step >= 2 ** -40) {
      const trial = theta.map((value, index) => value + step * direction[index]);
      candidate = objective(trial, x, times, events);
      if (Number.isFinite(candidate.value) && candidate.value <= current.value + 1e-4 * step * directional) break;
      step *= 0.5;
    }
    if (step < 2 ** -40 || !candidate) break;
    const nextTheta = theta.map((value, index) => value + step * direction[index]);
    const s = nextTheta.map((value, index) => value - theta[index]);
    const y = candidate.gradient.map((value, index) => value - current.gradient[index]);
    const ys = dot(y, s);
    if (ys > 1e-12) {
      const hy = matVec(inverse, y);
      const factor = (ys + dot(y, hy)) / (ys * ys);
      const nextInverse = identity(theta.length);
      for (let row = 0; row < theta.length; row += 1) {
        for (let column = 0; column < theta.length; column += 1) {
          nextInverse[row][column] = inverse[row][column]
            + factor * s[row] * s[column]
            - (hy[row] * s[column] + s[row] * hy[column]) / ys;
        }
      }
      inverse = nextInverse;
    } else {
      inverse = identity(theta.length);
    }
    theta = nextTheta;
    current = candidate;
  }
  for (let polish = 0; polish < 25; polish += 1) {
    current = objective(theta, x, times, events);
    if (maxAbs(current.gradient) <= 1e-11) break;
    let direction = solveLinear(analyticHessian(theta, x, times, events), current.gradient).map((value) => -value);
    let directional = dot(current.gradient, direction);
    if (!(directional < 0)) {
      direction = current.gradient.map((value) => -value);
      directional = -dot(current.gradient, current.gradient);
    }
    let step = 1;
    while (step >= 2 ** -40) {
      const trial = theta.map((value, index) => value + step * direction[index]);
      const candidate = objective(trial, x, times, events);
      if (Number.isFinite(candidate.value) && candidate.value <= current.value + 1e-4 * step * directional) {
        theta = trial;
        current = candidate;
        break;
      }
      step *= 0.5;
    }
    if (step < 2 ** -40) break;
  }
  current = objective(theta, x, times, events);
  return { theta, objective: current.value, gradientMaxAbs: maxAbs(current.gradient), iterations };
}

function standardize(development, target, names) {
  if (!names.length) {
    return { means: [], scales: [], developmentX: development.map(() => []), targetX: target.map(() => []) };
  }
  const raw = development.map((row) => names.map((name) => row.features[name]));
  const means = names.map((_, column) => raw.reduce((sum, row) => sum + row[column], 0) / raw.length);
  const scales = names.map((_, column) => {
    const variance = raw.reduce((sum, row) => sum + (row[column] - means[column]) ** 2, 0) / raw.length;
    const result = Math.sqrt(variance);
    return result === 0 ? 1 : result;
  });
  const transform = (rows) => rows.map((row) => names.map((name, column) => (row.features[name] - means[column]) / scales[column]));
  return { means, scales, developmentX: transform(development), targetX: transform(target) };
}

function fitArm(development, target, names) {
  const transformed = standardize(development, target, names);
  const times = development.map((row) => row.endpoint.timeCycles);
  const events = development.map((row) => row.endpoint.event);
  const solved = bfgs(transformed.developmentX, times, events, names.length);
  const intercept = solved.theta[0];
  const beta = solved.theta.slice(1, -1);
  const logShape = solved.theta.at(-1);
  const shape = Math.exp(logShape);
  const predictedEta = transformed.targetX.map((row) => intercept + dot(row, beta));
  const predictedMedianCycles = predictedEta.map((eta) => Math.exp(eta) * Math.log(2) ** (1 / shape));
  return {
    featureNames: names,
    developmentMean: transformed.means,
    developmentScale: transformed.scales,
    intercept,
    coefficients: beta,
    logShape,
    shape,
    objective: solved.objective,
    iterations: solved.iterations,
    gradientMaxAbs: solved.gradientMaxAbs,
    predictedEta,
    predictedMedianCycles,
  };
}

function concordance(rows, predictions) {
  let comparablePairs = 0;
  let score = 0;
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      const a = rows[left].endpoint;
      const b = rows[right].endpoint;
      if (a.timeCycles === b.timeCycles) continue;
      let early;
      let late;
      if (a.timeCycles < b.timeCycles && a.event) [early, late] = [left, right];
      else if (b.timeCycles < a.timeCycles && b.event) [early, late] = [right, left];
      else continue;
      comparablePairs += 1;
      if (predictions[early] < predictions[late]) score += 1;
      else if (predictions[early] === predictions[late]) score += 0.5;
    }
  }
  return { value: comparablePairs ? score / comparablePairs : null, comparablePairs };
}

function kmSurvival(rows, horizon) {
  const eventTimes = [...new Set(rows.filter((row) => row.endpoint.event && row.endpoint.timeCycles <= horizon).map((row) => row.endpoint.timeCycles))].sort((a, b) => a - b);
  let survival = 1;
  for (const eventTime of eventTimes) {
    const risk = rows.filter((row) => row.endpoint.timeCycles >= eventTime).length;
    const deaths = rows.filter((row) => row.endpoint.event && row.endpoint.timeCycles === eventTime).length;
    if (risk) survival *= 1 - deaths / risk;
  }
  return survival;
}

function metrics(rows, predictions, fit) {
  const errors = rows.flatMap((row, index) => row.endpoint.event ? [Math.abs(predictions[index] - row.endpoint.timeCycles)] : []);
  const calibration = {};
  for (const horizon of [900, 1100]) {
    const predicted = fit.predictedEta.map((eta) => Math.exp(-Math.exp(fit.shape * (Math.log(horizon) - eta))));
    const predictedMeanSurvival = predicted.reduce((sum, value) => sum + value, 0) / predicted.length;
    const observed = kmSurvival(rows, horizon);
    calibration[horizon] = {
      predictedMeanSurvival,
      kaplanMeierSurvival: observed,
      absoluteError: Math.abs(predictedMeanSurvival - observed),
      atRisk: rows.filter((row) => row.endpoint.timeCycles >= horizon).length,
    };
  }
  return {
    targetCount: rows.length,
    eventCount: errors.length,
    censoredCount: rows.length - errors.length,
    medianAbsoluteErrorCycles: median(errors),
    meanAbsoluteErrorCycles: errors.reduce((sum, value) => sum + value, 0) / errors.length,
    maximumAbsoluteErrorCycles: Math.max(...errors),
    harrellConcordance: concordance(rows, predictions),
    calibration,
    maximumCalibrationError: Math.max(...Object.values(calibration).map((item) => item.absoluteError)),
  };
}

const table = JSON.parse(await readFile(INPUT, "utf8"));
const fits = {};
const armMetrics = {};
const predictions = {};
const denominators = {};
for (const code of ["A", "B"]) {
  const development = table.rows.filter((row) => row.split === "development" && row[`complete${code}`]);
  const target = table.rows.filter((row) => row.split === "target" && row[`complete${code}`]);
  denominators[code] = { development: development.length, target: target.length };
  fits[code] = fitArm(development, target, table.featureNamesByArm[code]);
  predictions[code] = fits[code].predictedMedianCycles;
  armMetrics[code] = metrics(target, predictions[code], fits[code]);
}
const target = table.rows.filter((row) => row.split === "target" && row.completeB);
const improvement = (armMetrics.A.medianAbsoluteErrorCycles - armMetrics.B.medianAbsoluteErrorCycles) / armMetrics.A.medianAbsoluteErrorCycles;
const b = armMetrics.B;
const h1Pass = denominators.B.target >= 15
  && b.eventCount >= 14
  && b.harrellConcordance.comparablePairs >= 30
  && b.harrellConcordance.value >= 0.65
  && b.medianAbsoluteErrorCycles <= 160
  && improvement >= 0.10
  && b.maximumCalibrationError <= 0.15;
const output = {
  resultId: "RC55-RWTH-FRAILTY-RESPONSE-NODE-0.1",
  cycleId: "RC-2026-55",
  runOn: "2026-08-29",
  implementation: {
    runtime: "dependency-free Node.js",
    optimizer: "independently written BFGS with analytic score-equation Newton polish",
    alpha: ALPHA,
    penalty: "0.5*alpha*sum(beta^2)",
  },
  cohort: { denominators, targetEventsB: b.eventCount, targetCensoredB: b.censoredCount },
  availability: { armA: "available", armB: "available", armC: "unavailable-no-10ms-pulse-in-pilot" },
  fits: Object.fromEntries(Object.entries(fits).map(([code, fit]) => [code, Object.fromEntries(Object.entries(fit).filter(([key]) => key !== "predictedMedianCycles"))])),
  metrics: armMetrics,
  comparison: { BvsA: { relativeMdAEImprovement: improvement } },
  hypotheses: {
    H0: { retained: !h1Pass, verdict: !h1Pass ? "retained" : "rejected" },
    H1: { pass: h1Pass, verdict: h1Pass ? "retained" : "rejected" },
    H2: { pass: false, verdict: "unavailable", reason: "registered 10 ms pulse response is absent" },
  },
  targetPredictions: target.map((row, index) => ({
    id: row.id,
    sourceId: row.sourceId,
    event: row.endpoint.event,
    observedTimeCycles: row.endpoint.timeCycles,
    predictedMedianCycles: { A: predictions.A[index], B: predictions.B[index] },
  })),
};
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  `RC55 Node: devB=${denominators.B.development}, targetB=${denominators.B.target}, events=${b.eventCount}, `
  + `A MdAE=${armMetrics.A.medianAbsoluteErrorCycles.toFixed(3)}, B MdAE=${b.medianAbsoluteErrorCycles.toFixed(3)}, `
  + `C=${b.harrellConcordance.value.toFixed(4)}, H1=${h1Pass ? "PASS" : "REJECT"}`,
);
