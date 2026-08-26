import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const write = (relative, value) => fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
const table = read("research/reproducibility/rc53-battery-mechanism-bridge-feature-table.json");
const python = read("research/reproducibility/rc53-battery-mechanism-bridge-python.json");
const development = table.rows.filter(row => row.split === "development");
const targets = table.rows.filter(row => row.split === "target");

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = values => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

function solve(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-15) throw new Error("singular ridge system");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    augmented[column] = augmented[column].map(value => value / divisor);
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (factor !== 0) augmented[row] = augmented[row].map((value, index) => value - factor * augmented[column][index]);
    }
  }
  return augmented.map((row, index) => row[n]);
}

function fit(features) {
  const means = features.map(name => mean(development.map(row => row[name])));
  const scales = features.map((name, index) => {
    const variance = mean(development.map(row => (row[name] - means[index]) ** 2));
    return variance > 0 ? Math.sqrt(variance) : 1;
  });
  const x = development.map(row => features.map((name, index) => (row[name] - means[index]) / scales[index]));
  const y = development.map(row => row.capacity_retention_rpt8);
  const intercept = mean(y);
  const centered = y.map(value => value - intercept);
  const p = features.length;
  const matrix = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => x.reduce((sum, row) => sum + row[i] * row[j], 0) + (i === j ? 1 : 0)));
  const vector = Array.from({ length: p }, (_, i) => x.reduce((sum, row, index) => sum + row[i] * centered[index], 0));
  return { features, means, scales, intercept, coefficients: solve(matrix, vector), alpha: 1 };
}

function predict(model, row) {
  return model.intercept + model.features.reduce((sum, name, index) => sum + model.coefficients[index] * ((row[name] - model.means[index]) / model.scales[index]), 0);
}

function ranks(values) {
  const order = values.map((_, index) => index).sort((a, b) => values[a] - values[b]);
  const result = Array(values.length).fill(0);
  let cursor = 0;
  while (cursor < order.length) {
    let end = cursor + 1;
    while (end < order.length && values[order[end]] === values[order[cursor]]) end += 1;
    const rank = (cursor + 1 + end) / 2;
    for (let index = cursor; index < end; index += 1) result[order[index]] = rank;
    cursor = end;
  }
  return result;
}

function spearman(left, right) {
  const a = ranks(left);
  const b = ranks(right);
  const ma = mean(a);
  const mb = mean(b);
  const numerator = a.reduce((sum, value, index) => sum + (value - ma) * (b[index] - mb), 0);
  const denominator = Math.sqrt(a.reduce((sum, value) => sum + (value - ma) ** 2, 0) * b.reduce((sum, value) => sum + (value - mb) ** 2, 0));
  return denominator ? numerator / denominator : 0;
}

function metrics(predictions) {
  const errors = predictions.map(item => Math.abs(item.prediction - item.observed) * 100);
  return {
    count: predictions.length,
    medianAbsoluteErrorPercentagePoints: median(errors),
    meanAbsoluteErrorPercentagePoints: mean(errors),
    maximumAbsoluteErrorPercentagePoints: Math.max(...errors),
    spearman: spearman(predictions.map(item => item.prediction), predictions.map(item => item.observed)),
  };
}

const targetExperiments = ["2,2", "4", "5"];
const armResults = {};
for (const [code, features] of Object.entries(table.arms)) {
  const model = fit(features);
  const predictions = targets.map(row => ({ cellId: row.cell_id, experiment: row.experiment, observed: row.capacity_retention_rpt8, prediction: predict(model, row) }));
  armResults[code] = {
    model,
    metrics: metrics(predictions),
    byExperiment: Object.fromEntries(targetExperiments.map(experiment => [experiment, metrics(predictions.filter(item => item.experiment === experiment))])),
    predictions,
  };
}

const a = armResults.A.metrics;
const b = armResults.B.metrics;
const c = armResults.C.metrics;
const comparisons = {
  passportVsStressMdAEImprovement: (a.medianAbsoluteErrorPercentagePoints - c.medianAbsoluteErrorPercentagePoints) / a.medianAbsoluteErrorPercentagePoints,
  passportVsCapacityMdAEImprovement: (b.medianAbsoluteErrorPercentagePoints - c.medianAbsoluteErrorPercentagePoints) / b.medianAbsoluteErrorPercentagePoints,
  capacityVsStressMdAEImprovement: (a.medianAbsoluteErrorPercentagePoints - b.medianAbsoluteErrorPercentagePoints) / a.medianAbsoluteErrorPercentagePoints,
};
const h0 = a.medianAbsoluteErrorPercentagePoints <= 1.5 && a.spearman >= 0.60 && Object.values(armResults.A.byExperiment).every(item => item.medianAbsoluteErrorPercentagePoints <= 2.0);
const h1 = comparisons.capacityVsStressMdAEImprovement >= 0.10 && b.maximumAbsoluteErrorPercentagePoints <= a.maximumAbsoluteErrorPercentagePoints;
const h2 = c.medianAbsoluteErrorPercentagePoints <= 1.25 && comparisons.passportVsStressMdAEImprovement >= 0.20 && comparisons.passportVsCapacityMdAEImprovement >= 0.10 && c.spearman >= 0.60 && Object.values(armResults.C.byExperiment).every(item => item.medianAbsoluteErrorPercentagePoints <= 2.0);
const hypotheses = [
  { code: "H0", verdict: h0 ? "supported" : "rejected" },
  { code: "H1", verdict: h1 ? "supported" : "rejected" },
  { code: "H2", verdict: h2 ? "supported" : "rejected" },
  { code: "H3", verdict: "unsupported-by-design" },
];
const node = {
  resultId: "RC53-BATTERY-MECHANISM-BRIDGE-NODE-0.1",
  cycleId: "RC-2026-53",
  runOn: "2026-08-26",
  implementation: "dependency-free Node recomputation from the frozen feature table",
  counts: { candidate: table.rows.length, pilotZeroWeight: table.rows.filter(row => row.split === "pilot").length, development: development.length, untouchedTarget: targets.length },
  armResults,
  comparisons,
  hypotheses,
};

const differences = [];
for (const code of Object.keys(armResults)) {
  const expectedByCell = new Map(python.armResults[code].predictions.map(item => [item.cellId, item]));
  for (const item of armResults[code].predictions) differences.push({ kind: "prediction", arm: code, cellId: item.cellId, absoluteDifference: Math.abs(item.prediction - expectedByCell.get(item.cellId).prediction) });
  for (const key of ["medianAbsoluteErrorPercentagePoints", "meanAbsoluteErrorPercentagePoints", "maximumAbsoluteErrorPercentagePoints", "spearman"]) differences.push({ kind: "metric", arm: code, key, absoluteDifference: Math.abs(armResults[code].metrics[key] - python.armResults[code].metrics[key]) });
  for (const experiment of targetExperiments) for (const key of ["medianAbsoluteErrorPercentagePoints", "meanAbsoluteErrorPercentagePoints", "maximumAbsoluteErrorPercentagePoints", "spearman"]) differences.push({ kind: "experimentMetric", arm: code, experiment, key, absoluteDifference: Math.abs(armResults[code].byExperiment[experiment][key] - python.armResults[code].byExperiment[experiment][key]) });
}
for (const key of Object.keys(comparisons)) differences.push({ kind: "comparison", key, absoluteDifference: Math.abs(comparisons[key] - python.comparisons[key]) });
const verdictsMatch = JSON.stringify(hypotheses) === JSON.stringify(python.hypotheses);
const maximumAbsoluteDifference = Math.max(...differences.map(item => item.absoluteDifference));
const audit = {
  auditId: "RC53-BATTERY-MECHANISM-BRIDGE-INDEPENDENT-AUDIT-0.1",
  cycleId: "RC-2026-53",
  tolerance: 1e-8,
  comparisons: { total: differences.length, predictions: differences.filter(item => item.kind === "prediction").length, numericMetrics: differences.filter(item => item.kind !== "prediction").length },
  maximumAbsoluteDifference,
  verdictsMatch,
  failures: differences.filter(item => item.absoluteDifference > 1e-8),
  verdict: maximumAbsoluteDifference <= 1e-8 && verdictsMatch ? "pass" : "fail",
};

write("research/reproducibility/rc53-battery-mechanism-bridge-node.json", node);
write("research/reproducibility/rc53-battery-mechanism-bridge-independent-audit.json", audit);
if (audit.verdict !== "pass") throw new Error(`RC53 independent audit failed: ${JSON.stringify(audit)}`);
console.log(`RC53 independent Node audit passed: ${audit.comparisons.total} comparisons, max |Δ|=${audit.maximumAbsoluteDifference}.`);
