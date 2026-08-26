import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const featurePath = path.join(root, "research/reproducibility/rc52-battery-feature-table.json");
const splitPath = path.join(root, "research/reproducibility/rc52-battery-domain-passport-python.json");
const outputPath = path.join(root, "research/reproducibility/rc52-battery-domain-passport-node.json");
const table = JSON.parse(fs.readFileSync(featurePath, "utf8"));
const splitManifest = JSON.parse(fs.readFileSync(splitPath, "utf8"));
const rows = table.rows;
const sources = ["CALB", "HNEI", "MICH_EXP", "UL_PUR"];

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = values => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};
const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);
const transpose = matrix => matrix[0].map((_, column) => matrix.map(row => row[column]));
const multiply = (left, right) => {
  const rightT = transpose(right);
  return left.map(row => rightT.map(column => dot(row, column)));
};

function solveLinear(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    if (!Number.isFinite(divisor) || Math.abs(divisor) < 1e-14) throw new Error("singular ridge system");
    for (let item = column; item <= n; item += 1) augmented[column][item] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item <= n; item += 1) augmented[row][item] -= factor * augmented[column][item];
    }
  }
  return augmented.map(row => row[n]);
}

function ridgePredict(train, test) {
  const width = table.featureNames.length;
  const centers = Array.from({ length: width }, (_, column) => mean(train.map(row => row.features[column])));
  const scales = Array.from({ length: width }, (_, column) => {
    const variance = mean(train.map(row => (row.features[column] - centers[column]) ** 2));
    const value = Math.sqrt(variance);
    return value === 0 ? 1 : value;
  });
  const standardize = row => row.features.map((value, column) => (value - centers[column]) / scales[column]);
  const trainZ = train.map(standardize);
  const testZ = test.map(standardize);
  const design = trainZ.map(row => [1, ...row]);
  const designT = transpose(design);
  const gram = multiply(designT, design);
  for (let index = 1; index < gram.length; index += 1) gram[index][index] += 1;
  const y = train.map(row => row.logLife);
  const rhs = designT.map(row => dot(row, y));
  const beta = solveLinear(gram, rhs);
  const prediction = testZ.map(row => dot([1, ...row], beta));
  return { prediction, trainZ, testZ, centers, scales, beta };
}

function metrics(data, logPrediction) {
  const ape = data.map((row, index) => Math.abs(Math.exp(logPrediction[index]) - row.life) / row.life);
  return {
    n: data.length,
    mdape: median(ape),
    rmseLogLife: Math.sqrt(mean(data.map((row, index) => (logPrediction[index] - row.logLife) ** 2))),
    catastrophicFraction: mean(ape.map(value => value > 0.5 ? 1 : 0)),
    meanAbsolutePercentageError: mean(ape)
  };
}

function distance(left, right) {
  return Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0));
}

function nearestDistances(reference, query, leaveSelfOut = false) {
  return query.map((item, itemIndex) => Math.min(...reference.map((candidate, candidateIndex) => leaveSelfOut && itemIndex === candidateIndex ? Infinity : distance(item, candidate))));
}

function percentileLinear(values, probability) {
  const ordered = [...values].sort((a, b) => a - b);
  if (ordered.length === 1) return ordered[0];
  const position = (ordered.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return ordered[lower] * (1 - weight) + ordered[upper] * weight;
}

function averageRanks(values) {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const ranks = Array(values.length);
  for (let start = 0; start < order.length;) {
    let end = start + 1;
    while (end < order.length && order[end].value === order[start].value) end += 1;
    const rank = (start + 1 + end) / 2;
    for (let cursor = start; cursor < end; cursor += 1) ranks[order[cursor].index] = rank;
    start = end;
  }
  return ranks;
}

function spearman(left, right) {
  const a = averageRanks(left);
  const b = averageRanks(right);
  const centerA = mean(a);
  const centerB = mean(b);
  const numerator = a.reduce((sum, value, index) => sum + (value - centerA) * (b[index] - centerB), 0);
  const denominator = Math.sqrt(a.reduce((sum, value) => sum + (value - centerA) ** 2, 0) * b.reduce((sum, value) => sum + (value - centerB) ** 2, 0));
  return denominator ? numerator / denominator : 0;
}

function trainingCvResiduals(train) {
  const residuals = [];
  for (const source of [...new Set(train.map(row => row.source))].sort()) {
    const test = train.filter(row => row.source === source);
    const innerTrain = train.filter(row => row.source !== source);
    const { prediction } = ridgePredict(innerTrain, test);
    test.forEach((row, index) => residuals.push(Math.abs(prediction[index] - row.logLife)));
  }
  return residuals;
}

function allPairs(length) {
  const pairs = [];
  for (let left = 0; left < length; left += 1) for (let right = left + 1; right < length; right += 1) pairs.push([left, right]);
  return pairs;
}

function pilotMetrics(target, basePrediction, targetZ) {
  if (target.length < 5) return null;
  const candidates = allPairs(target.length).map(([left, right]) => {
    const distances = targetZ.map(item => Math.min(distance(item, targetZ[left]), distance(item, targetZ[right])));
    return { left, right, max: Math.max(...distances), average: mean(distances), leftId: target[left].cellId, rightId: target[right].cellId };
  });
  candidates.sort((a, b) => a.max - b.max || a.average - b.average || a.leftId.localeCompare(b.leftId) || a.rightId.localeCompare(b.rightId));
  const chosen = candidates[0];
  const evaluate = ([left, right]) => {
    const pilot = new Set([left, right]);
    const remainingIndices = target.map((_, index) => index).filter(index => !pilot.has(index));
    const offset = median([target[left].logLife - basePrediction[left], target[right].logLife - basePrediction[right]]);
    const remaining = remainingIndices.map(index => target[index]);
    const beforePrediction = remainingIndices.map(index => basePrediction[index]);
    const afterPrediction = remainingIndices.map(index => basePrediction[index] + offset);
    return { pair: [target[left].cellId, target[right].cellId], offsetLogLife: offset, before: metrics(remaining, beforePrediction), after: metrics(remaining, afterPrediction) };
  };
  const all = allPairs(target.length).map(evaluate);
  const selected = evaluate([chosen.left, chosen.right]);
  const medianAllPairMdape = median(all.map(item => item.after.mdape));
  const improvement = selected.before.mdape ? 1 - selected.after.mdape / selected.before.mdape : 0;
  return {
    ...selected,
    geometry: { maxCoverDistance: chosen.max, meanCoverDistance: chosen.average },
    possiblePairCount: all.length,
    medianAllPairMdape,
    relativeMdapeImprovement: improvement,
    passesTwentyPercent: improvement >= 0.20,
    noWorseThanMedianPair: selected.after.mdape <= medianAllPairMdape
  };
}

const randomResults = splitManifest.randomSplit.results.map(item => {
  const testIds = new Set(item.testCellIds);
  const train = rows.filter(row => !testIds.has(row.cellId));
  const test = rows.filter(row => testIds.has(row.cellId));
  const { prediction } = ridgePredict(train, test);
  return { repeat: item.repeat, testCellIds: item.testCellIds, ...metrics(test, prediction) };
});

const folds = [];
const cellPredictions = [];
for (const source of sources) {
  const target = rows.filter(row => row.source === source);
  const train = rows.filter(row => row.source !== source);
  const model = ridgePredict(train, target);
  const trainingNn = nearestDistances(model.trainZ, model.trainZ, true);
  const supportThreshold = percentileLinear(trainingNn, 0.95);
  const targetDistance = nearestDistances(model.trainZ, model.testZ);
  const accepted = targetDistance.map(value => value <= supportThreshold);
  const residuals = trainingCvResiduals(train).sort((a, b) => a - b);
  const rank = Math.min(residuals.length, Math.ceil((residuals.length + 1) * 0.90));
  const intervalRadius = residuals[rank - 1];
  const covered = target.map((row, index) => Math.abs(row.logLife - model.prediction[index]) <= intervalRadius);
  const acceptedIndices = accepted.map((value, index) => value ? index : -1).filter(index => index >= 0);
  const acceptedRows = acceptedIndices.map(index => target[index]);
  const acceptedPredictions = acceptedIndices.map(index => model.prediction[index]);
  folds.push({
    source,
    metrics: metrics(target, model.prediction),
    supportThreshold,
    acceptedCount: acceptedIndices.length,
    acceptedFraction: mean(accepted.map(value => value ? 1 : 0)),
    acceptedMetrics: acceptedRows.length ? metrics(acceptedRows, acceptedPredictions) : null,
    intervalCalibrationResidualCount: residuals.length,
    intervalOrderRank: rank,
    intervalRadiusLogLife: intervalRadius,
    intervalMultiplicativeWidth: Math.exp(2 * intervalRadius),
    intervalCoverage: mean(covered.map(value => value ? 1 : 0)),
    pilot: pilotMetrics(target, model.prediction, model.testZ)
  });
  target.forEach((row, index) => {
    const predictedLife = Math.exp(model.prediction[index]);
    cellPredictions.push({
      source,
      cellId: row.cellId,
      life: row.life,
      predictedLife,
      logPrediction: model.prediction[index],
      absolutePercentageError: Math.abs(predictedLife - row.life) / row.life,
      supportDistance: targetDistance[index],
      accepted: accepted[index],
      intervalCovered: covered[index]
    });
  });
}

const randomMdape = median(randomResults.map(item => item.mdape));
const randomCat = median(randomResults.map(item => item.catastrophicFraction));
const pooledRows = cellPredictions.map(item => ({ life: item.life, logLife: Math.log(item.life) }));
const pooledPrediction = cellPredictions.map(item => item.logPrediction);
const pooled = metrics(pooledRows, pooledPrediction);
const distances = cellPredictions.map(item => item.supportDistance);
const errors = cellPredictions.map(item => item.absolutePercentageError);
const accepted = cellPredictions.map(item => item.accepted);
const allCat = mean(errors.map(value => value > 0.50 ? 1 : 0));
const acceptedErrors = errors.filter((_, index) => accepted[index]);
const acceptedCat = acceptedErrors.length ? mean(acceptedErrors.map(value => value > 0.50 ? 1 : 0)) : 1;
const retained = mean(accepted.map(value => value ? 1 : 0));
const rankCorrelation = spearman(distances, errors);
const pooledCoverage = mean(cellPredictions.map(item => item.intervalCovered ? 1 : 0));
const eligibleCoverage = folds.filter(fold => fold.metrics.n >= 4).map(fold => fold.intervalCoverage);
const pilots = folds.filter(fold => fold.pilot !== null);
const passingPilots = pilots.filter(fold => fold.pilot.passesTwentyPercent && fold.pilot.noWorseThanMedianPair).length;
const h0MdapeRatio = pooled.mdape / randomMdape;
const h0CatRatio = randomCat ? pooled.catastrophicFraction / randomCat : pooled.catastrophicFraction ? Infinity : 1;

const output = {
  experiment: "RC52 BatteryLife domain passport independent Node implementation",
  inputFeatureTable: "rc52-battery-feature-table.json",
  splitAssignmentsFrom: "rc52-battery-domain-passport-python.json:testCellIds only",
  eligibleCellCount: rows.length,
  featureCount: table.featureNames.length,
  randomSplit: { seed: 520026, repeatCount: randomResults.length, results: randomResults },
  leaveSourceOut: { folds, cellPredictions },
  adjudication: {
    randomMixtureMedian: { mdape: randomMdape, catastrophicFraction: randomCat },
    pooledLeaveSourceOut: pooled,
    hypotheses: [
      { code: "H0", verdict: h0MdapeRatio >= 1.5 || h0CatRatio >= 2 ? "rejected" : "not-rejected", mdapeRatio: h0MdapeRatio, catastrophicRatio: h0CatRatio },
      { code: "H1", verdict: rankCorrelation >= 0.50 && retained >= 0.50 && acceptedCat <= allCat * 0.50 ? "supported" : "rejected", spearman: rankCorrelation, acceptedFraction: retained, allCatastrophicFraction: allCat, acceptedCatastrophicFraction: acceptedCat },
      { code: "H2", verdict: pooledCoverage >= 0.90 && eligibleCoverage.every(value => value >= 0.75) ? "supported" : "rejected", pooledCoverage, eligibleSourceCoverage: eligibleCoverage },
      { code: "H3", verdict: passingPilots >= 2 ? "supported" : "rejected", eligibleSourceCount: pilots.length, passingSourceCount: passingPilots },
      { code: "H4", verdict: "unsupported-and-not-testable-with-this-cohort", interventionLabels: 0, independentInternalStateMeasurements: 0 }
    ]
  }
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ eligible: rows.length, adjudication: output.adjudication }, null, 2));
