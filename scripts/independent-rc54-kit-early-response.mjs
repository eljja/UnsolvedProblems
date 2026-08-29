#!/usr/bin/env node

/** Dependency-free RC54 Weibull AFT and metric recomputation from the sealed table. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = path.join(ROOT, "research", "reproducibility", "rc54-kit-early-response-feature-table.json");
const OUTPUT = path.join(ROOT, "research", "reproducibility", "rc54-kit-early-response-node.json");
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
  const p = theta.length - 2;
  const intercept = theta[0];
  const beta = theta.slice(1, 1 + p);
  const logShape = theta.at(-1);
  const shape = Math.exp(logShape);
  const gradient = Array(theta.length).fill(0);
  let value = 0;
  for (let i = 0; i < x.length; i += 1) {
    const eta = intercept + dot(x[i], beta);
    const logTime = Math.log(times[i]);
    const u = logTime - eta;
    const exponent = Math.exp(Math.max(-700, Math.min(700, shape * u)));
    const event = events[i] ? 1 : 0;
    value += -event * (logShape + (shape - 1) * logTime - shape * eta) + exponent;
    const gradEta = shape * (event - exponent);
    gradient[0] += gradEta;
    for (let j = 0; j < p; j += 1) gradient[j + 1] += x[i][j] * gradEta;
    gradient.at(-1);
    gradient[gradient.length - 1] += -event * (1 + shape * u) + exponent * shape * u;
  }
  for (let j = 0; j < p; j += 1) {
    value += 0.5 * ALPHA * beta[j] * beta[j];
    gradient[j + 1] += ALPHA * beta[j];
  }
  return { value, gradient };
}

function identity(n) {
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (__, column) => row === column ? 1 : 0));
}

function solveLinear(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-14) throw new Error("singular score Hessian");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= n; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= n; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row) => row[n]);
}

function analyticHessian(theta, x, times, events) {
  const featureCount = x[0].length;
  const beta = theta.slice(1, -1);
  const shape = Math.exp(theta.at(-1));
  const size = featureCount + 2;
  const hessian = Array.from({ length: size }, () => Array(size).fill(0));
  for (let i = 0; i < x.length; i += 1) {
    const design = [1, ...x[i]];
    const eta = theta[0] + dot(x[i], beta);
    const u = Math.log(times[i]) - eta;
    const exponent = Math.exp(Math.max(-700, Math.min(700, shape * u)));
    const event = events[i] ? 1 : 0;
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
  for (let index = 0; index < featureCount; index += 1) hessian[index + 1][index + 1] += ALPHA;
  return hessian;
}

function polishScoreEquations(initial, x, times, events) {
  let theta = [...initial];
  let iterations = 0;
  for (iterations = 1; iterations <= 25; iterations += 1) {
    const current = objective(theta, x, times, events);
    if (maxAbs(current.gradient) <= 1e-10) break;
    let direction = solveLinear(analyticHessian(theta, x, times, events), current.gradient).map((value) => -value);
    let directional = dot(current.gradient, direction);
    if (!(directional < 0)) {
      direction = current.gradient.map((value) => -value);
      directional = -dot(current.gradient, current.gradient);
    }
    let step = 1;
    while (step >= 2 ** -40) {
      const candidateTheta = theta.map((value, index) => value + step * direction[index]);
      const candidate = objective(candidateTheta, x, times, events);
      if (Number.isFinite(candidate.value) && (
        candidate.value <= current.value + 1e-4 * step * directional
        || maxAbs(candidate.gradient) < maxAbs(current.gradient)
      )) {
        theta = candidateTheta;
        break;
      }
      step *= 0.5;
    }
    if (step < 2 ** -40) break;
  }
  const final = objective(theta, x, times, events);
  return {
    theta,
    method: "independent analytic score-equation Newton polish after BFGS",
    iterations,
    objective: final.value,
    gradientMaxAbs: maxAbs(final.gradient),
    success: maxAbs(final.gradient) <= 1e-7,
  };
}

function matVec(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

function bfgs(x, times, events, featureCount) {
  let theta = Array(featureCount + 2).fill(0);
  theta[0] = Math.log(median(times));
  theta[theta.length - 1] = Math.log(2);
  let hessianInverse = identity(theta.length);
  let current = objective(theta, x, times, events);
  let iterations = 0;
  let resets = 0;
  for (; iterations < 5000; iterations += 1) {
    if (maxAbs(current.gradient) <= 1e-7) break;
    let direction = matVec(hessianInverse, current.gradient).map((value) => -value);
    let directionalDerivative = dot(current.gradient, direction);
    if (!(directionalDerivative < 0)) {
      hessianInverse = identity(theta.length);
      direction = current.gradient.map((value) => -value);
      directionalDerivative = -dot(current.gradient, current.gradient);
      resets += 1;
    }
    let step = 1;
    let candidate;
    while (step >= 2 ** -40) {
      const trial = theta.map((value, index) => value + step * direction[index]);
      candidate = objective(trial, x, times, events);
      if (Number.isFinite(candidate.value) && candidate.value <= current.value + 1e-4 * step * directionalDerivative) {
        break;
      }
      step *= 0.5;
    }
    if (step < 2 ** -40 || !candidate) break;
    const nextTheta = theta.map((value, index) => value + step * direction[index]);
    const s = nextTheta.map((value, index) => value - theta[index]);
    const y = candidate.gradient.map((value, index) => value - current.gradient[index]);
    const ys = dot(y, s);
    if (ys > 1e-12) {
      const hy = matVec(hessianInverse, y);
      const yhy = dot(y, hy);
      const factor = (ys + yhy) / (ys * ys);
      const nextH = identity(theta.length);
      for (let row = 0; row < theta.length; row += 1) {
        for (let column = 0; column < theta.length; column += 1) {
          nextH[row][column] = hessianInverse[row][column]
            + factor * s[row] * s[column]
            - (hy[row] * s[column] + s[row] * hy[column]) / ys;
        }
      }
      hessianInverse = nextH;
    } else {
      hessianInverse = identity(theta.length);
      resets += 1;
    }
    theta = nextTheta;
    current = candidate;
  }
  return {
    theta,
    objective: current.value,
    gradientMaxAbs: maxAbs(current.gradient),
    iterations,
    resets,
    success: maxAbs(current.gradient) <= 1e-5,
  };
}

function standardize(development, target, names) {
  const raw = development.map((row) => names.map((name) => row.features[name]));
  const means = names.map((_, column) => raw.reduce((sum, row) => sum + row[column], 0) / raw.length);
  const scales = names.map((_, column) => {
    const variance = raw.reduce((sum, row) => sum + (row[column] - means[column]) ** 2, 0) / raw.length;
    const value = Math.sqrt(variance);
    return value === 0 ? 1 : value;
  });
  const transform = (rows) => rows.map((row) => names.map((name, column) => (row.features[name] - means[column]) / scales[column]));
  return { means, scales, developmentX: transform(development), targetX: transform(target) };
}

function fitArm(development, target, names) {
  const transformed = standardize(development, target, names);
  const times = development.map((row) => row.endpoint.timeDays);
  const events = development.map((row) => row.endpoint.event);
  const fitted = bfgs(transformed.developmentX, times, events, names.length);
  const polish = polishScoreEquations(fitted.theta, transformed.developmentX, times, events);
  const intercept = polish.theta[0];
  const beta = polish.theta.slice(1, -1);
  const logShape = polish.theta.at(-1);
  const shape = Math.exp(logShape);
  const predictedEta = transformed.targetX.map((row) => intercept + dot(row, beta));
  const predictedMedianDays = predictedEta.map((eta) => Math.exp(eta) * Math.log(2) ** (1 / shape));
  return {
    featureNames: names,
    developmentMean: transformed.means,
    developmentScale: transformed.scales,
    intercept,
    coefficients: beta,
    logShape,
    shape,
    objective: polish.objective,
    optimizerSuccess: fitted.gradientMaxAbs <= 5e-5 && polish.success,
    iterations: fitted.iterations,
    resets: fitted.resets,
    bfgsGradientMaxAbs: fitted.gradientMaxAbs,
    gradientMaxAbs: polish.gradientMaxAbs,
    numericPolish: {
      method: polish.method,
      iterations: polish.iterations,
      objective: polish.objective,
      gradientMaxAbs: polish.gradientMaxAbs,
      success: polish.success,
    },
    predictedEta,
    predictedMedianDays,
  };
}

function concordance(rows, predictions, withinCondition = false) {
  let comparablePairs = 0;
  let score = 0;
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      if (withinCondition && rows[left].conditionId !== rows[right].conditionId) continue;
      const a = rows[left].endpoint;
      const b = rows[right].endpoint;
      if (a.timeDays === b.timeDays) continue;
      let early;
      let late;
      if (a.timeDays < b.timeDays && a.event) [early, late] = [left, right];
      else if (b.timeDays < a.timeDays && b.event) [early, late] = [right, left];
      else continue;
      comparablePairs += 1;
      if (predictions[early] < predictions[late]) score += 1;
      else if (predictions[early] === predictions[late]) score += 0.5;
    }
  }
  return { value: comparablePairs ? score / comparablePairs : null, comparablePairs };
}

function kmSurvival(rows, horizon) {
  const eventTimes = [...new Set(rows.filter((row) => row.endpoint.event && row.endpoint.timeDays <= horizon).map((row) => row.endpoint.timeDays))].sort((a, b) => a - b);
  let survival = 1;
  for (const eventTime of eventTimes) {
    const risk = rows.filter((row) => row.endpoint.timeDays >= eventTime).length;
    const deaths = rows.filter((row) => row.endpoint.event && row.endpoint.timeDays === eventTime).length;
    if (risk) survival *= 1 - deaths / risk;
  }
  return survival;
}

function metrics(rows, predictions, fit) {
  const errors = rows.flatMap((row, index) => row.endpoint.event ? [Math.abs(predictions[index] - row.endpoint.timeDays)] : []);
  const byFamily = Object.fromEntries(["calendar", "cyclic", "profile"].map((family) => {
    const familyErrors = rows.flatMap((row, index) => row.ageFamily === family && row.endpoint.event ? [Math.abs(predictions[index] - row.endpoint.timeDays)] : []);
    return [family, { eventCount: familyErrors.length, medianAbsoluteErrorDays: median(familyErrors) }];
  }));
  const calibration = {};
  for (const horizon of [365, 500]) {
    const predicted = fit.predictedEta.map((eta) => Math.exp(-Math.exp(fit.shape * (Math.log(horizon) - eta))));
    const predictedMeanSurvival = predicted.reduce((sum, value) => sum + value, 0) / predicted.length;
    const observed = kmSurvival(rows, horizon);
    calibration[horizon] = {
      predictedMeanSurvival,
      kaplanMeierSurvival: observed,
      absoluteError: Math.abs(predictedMeanSurvival - observed),
      atRisk: rows.filter((row) => row.endpoint.timeDays >= horizon).length,
    };
  }
  return {
    targetCount: rows.length,
    eventCount: errors.length,
    censoredCount: rows.length - errors.length,
    medianAbsoluteErrorDays: median(errors),
    meanAbsoluteErrorDays: errors.reduce((sum, value) => sum + value, 0) / errors.length,
    maximumAbsoluteErrorDays: Math.max(...errors),
    harrellConcordance: concordance(rows, predictions),
    withinConditionConcordance: concordance(rows, predictions, true),
    byFamily,
    calibration,
    maximumCalibrationError: Math.max(...Object.values(calibration).map((item) => item.absoluteError)),
  };
}

function improvement(baseline, candidate) {
  return (baseline - candidate) / baseline;
}

function verdicts(all, completeTarget, optimizationSucceeded) {
  const [a, b, c, d] = "ABCD".split("").map((code) => all[code]);
  const worst = (value) => Math.max(...Object.values(value.byFamily).map((item) => item.medianAbsoluteErrorDays).filter((item) => item !== null));
  const decisions = {
    H0: a.eventCount >= 30 && a.medianAbsoluteErrorDays <= 75 && a.harrellConcordance.value >= 0.70 && a.maximumCalibrationError <= 0.15 && worst(a) <= 105,
    H1: improvement(a.medianAbsoluteErrorDays, b.medianAbsoluteErrorDays) >= 0.10 && b.harrellConcordance.value >= a.harrellConcordance.value - 0.02 && worst(b) <= worst(a),
    H2: improvement(b.medianAbsoluteErrorDays, c.medianAbsoluteErrorDays) >= 0.15 && c.harrellConcordance.value >= b.harrellConcordance.value - 0.02 && c.maximumCalibrationError <= b.maximumCalibrationError,
    H3: completeTarget && d.eventCount >= 30 && d.medianAbsoluteErrorDays <= 60 && improvement(c.medianAbsoluteErrorDays, d.medianAbsoluteErrorDays) >= 0.10 && d.harrellConcordance.value >= 0.72 && d.withinConditionConcordance.value >= 0.60 && d.withinConditionConcordance.comparablePairs >= 30 && worst(d) <= 90 && d.maximumCalibrationError <= 0.15 && optimizationSucceeded,
  };
  return Object.fromEntries(Object.entries(decisions).map(([code, pass]) => [code, { pass, verdict: pass ? "retained" : "rejected" }]));
}

const table = JSON.parse(await readFile(INPUT, "utf8"));
const development = table.rows.filter((row) => row.split === "development" && row.completeD);
const target = table.rows.filter((row) => row.split === "target" && row.completeD);
const fits = {};
const armMetrics = {};
const predictions = {};
for (const code of "ABCD") {
  fits[code] = fitArm(development, target, table.featureNamesByArm[code]);
  predictions[code] = fits[code].predictedMedianDays;
  armMetrics[code] = metrics(target, predictions[code], fits[code]);
  delete fits[code].predictedMedianDays;
}
const comparisons = {
  BvsA: improvement(armMetrics.A.medianAbsoluteErrorDays, armMetrics.B.medianAbsoluteErrorDays),
  CvsB: improvement(armMetrics.B.medianAbsoluteErrorDays, armMetrics.C.medianAbsoluteErrorDays),
  DvsC: improvement(armMetrics.C.medianAbsoluteErrorDays, armMetrics.D.medianAbsoluteErrorDays),
};
const optimizationSucceeded = Object.values(fits).every((fit) => fit.optimizerSuccess);
const output = {
  resultId: "RC54-KIT-EARLY-RESPONSE-NODE-0.1",
  cycleId: "RC-2026-54",
  runOn: "2026-08-29",
  implementation: { runtime: "dependency-free Node.js", optimizer: "independently written inverse-Hessian BFGS with Armijo backtracking", alpha: ALPHA, penalty: "0.5*alpha*sum(beta^2)" },
  cohort: {
    completeDevelopmentCells: development.length,
    completeTargetCells: target.length,
    targetFeatureComplete: target.length === 57,
    targetEvents: target.filter((row) => row.endpoint.event).length,
    targetCensored: target.filter((row) => !row.endpoint.event).length,
  },
  fits,
  metrics: armMetrics,
  comparisons,
  hypotheses: verdicts(armMetrics, target.length === 57, optimizationSucceeded),
  targetPredictions: target.map((row, index) => ({
    id: row.id,
    observedTimeDays: row.endpoint.timeDays,
    event: row.endpoint.event,
    predictedMedianDays: Object.fromEntries("ABCD".split("").map((code) => [code, predictions[code][index]])),
  })),
};
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  `RC54 Node: dev=${development.length}, target=${target.length}, events=${output.cohort.targetEvents}; `
  + "ABCD".split("").map((code) => `${code} MdAE=${armMetrics[code].medianAbsoluteErrorDays.toFixed(3)}d C=${armMetrics[code].harrellConcordance.value.toFixed(4)} grad=${fits[code].gradientMaxAbs.toExponential(2)}`).join(", "),
);
