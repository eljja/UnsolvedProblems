const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

function invert(matrix) {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [
    ...row,
    ...Array.from({ length: size }, (_, column) => Number(index === column))
  ]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
    }
    if (Math.abs(augmented[best][pivot]) < 1e-12) throw new Error("Singular outcome-model matrix");
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
    const divisor = augmented[pivot][pivot];
    augmented[pivot] = augmented[pivot].map(value => value / divisor);
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      augmented[row] = augmented[row].map((value, column) => value - factor * augmented[pivot][column]);
    }
  }
  return augmented.map(row => row.slice(size));
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map(row => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

export function outcomeFeatures(row, action, mode) {
  if (mode === "fixed-zero-adversarial") return [1];
  if (mode === "constant-only") return [1];
  if (mode === "intercept-and-action-only") return [1, action];
  return [1, row.x1, row.x2, row.family, row.x1 * row.x2, action, action * row.x2, action * row.family, action * row.x1 * row.x1];
}

function fitOutcome(rows, mode) {
  if (mode === "fixed-zero-adversarial") return { beta: [0], inverse: [[0]] };
  const dimension = outcomeFeatures(rows[0], 0, mode).length;
  const normal = Array.from({ length: dimension }, () => Array(dimension).fill(0));
  const rhs = Array(dimension).fill(0);
  const count = rows.length;
  for (const row of rows) {
    if (!row.observed) continue;
    const features = outcomeFeatures(row, row.action, mode);
    const weight = 1 / row.responsePropensityEval;
    for (let left = 0; left < dimension; left += 1) {
      rhs[left] += weight * features[left] * row.outcome / count;
      for (let right = 0; right < dimension; right += 1) {
        normal[left][right] += weight * features[left] * features[right] / count;
      }
    }
  }
  for (let index = 0; index < dimension; index += 1) normal[index][index] += 1e-8;
  const inverse = invert(normal);
  return { beta: multiplyMatrixVector(inverse, rhs), inverse };
}

function clusterStandardError(rows, influence) {
  const totals = new Map();
  rows.forEach((row, index) => totals.set(row.campaignId, (totals.get(row.campaignId) || 0) + influence[index]));
  const clusters = [...totals.values()];
  const correction = clusters.length / (clusters.length - 1);
  return Math.sqrt(correction * clusters.reduce((sum, value) => sum + value * value, 0) / (rows.length * rows.length));
}

export function evaluatePolicy(rows, outcomeModelMode) {
  const { beta, inverse } = fitOutcome(rows, outcomeModelMode);
  const targetFeatures = rows.map(row => outcomeFeatures(row, row.targetAction, outcomeModelMode));
  const observedFeatures = rows.map(row => outcomeFeatures(row, row.action, outcomeModelMode));
  const targetPredictions = targetFeatures.map(features => dot(features, beta));
  const observedPredictions = observedFeatures.map(features => dot(features, beta));
  const targetFeatureMean = targetFeatures[0].map((_, index) => mean(targetFeatures.map(features => features[index])));
  const modelInfluenceDirection = multiplyMatrixVector(inverse, targetFeatureMean);

  const actionWeights = rows.map(row => row.action === row.targetAction ? 1 / row.actionPropensityEval : 0);
  const combinedWeights = rows.map((row, index) => row.observed ? actionWeights[index] / row.responsePropensityEval : 0);
  const ipwScores = rows.map((row, index) => combinedWeights[index] * row.outcome);
  const drScores = rows.map((row, index) => targetPredictions[index] + combinedWeights[index] * (row.outcome - observedPredictions[index]));
  const estimates = { DM: mean(targetPredictions), IPW: mean(ipwScores), DR: mean(drScores) };

  const dmInfluence = rows.map((row, index) => {
    const contextPart = targetPredictions[index] - estimates.DM;
    if (!row.observed) return contextPart;
    const residual = row.outcome - observedPredictions[index];
    const modelPart = dot(modelInfluenceDirection, observedFeatures[index]) * residual / row.responsePropensityEval;
    return contextPart + modelPart;
  });
  const ipwInfluence = ipwScores.map(value => value - estimates.IPW);
  const drInfluence = drScores.map(value => value - estimates.DR);
  const standardErrors = {
    DM: clusterStandardError(rows, dmInfluence),
    IPW: clusterStandardError(rows, ipwInfluence),
    DR: clusterStandardError(rows, drInfluence)
  };
  const positiveWeights = combinedWeights.filter(value => value > 0);
  const weightSum = positiveWeights.reduce((sum, value) => sum + value, 0);
  const weightSquareSum = positiveWeights.reduce((sum, value) => sum + value * value, 0);
  const effectiveSampleSize = weightSquareSum ? weightSum * weightSum / weightSquareSum : 0;
  return { estimates, standardErrors, effectiveSampleSize };
}

export function evaluateFixedNuisance(rows) {
  const dm = mean(rows.map(row => row.targetPrediction));
  const weights = rows.map(row => row.observed && row.action === row.targetAction ? 1 / (row.actionPropensity * row.responsePropensity) : 0);
  const ipw = mean(rows.map((row, index) => weights[index] * row.outcome));
  const dr = mean(rows.map((row, index) => row.targetPrediction + weights[index] * (row.outcome - row.observedPrediction)));
  return { DM: dm, IPW: ipw, DR: dr };
}
