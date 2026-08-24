import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawPath = path.join(root, ".cache", "rc47-x16", "l0002", "frames-32x32-gray.raw");
const outputPath = path.join(root, "research", "reproducibility", "rc47-self-deletion-node.json");
const trialPath = path.join(root, "research", "reproducibility", "rc47-self-deletion-node-trials.json");
const seed = "RC47-X16-SELF-DELETION-v1";
const n = 95_504;
const side = 32;
const partitions = { development: [0, 57_302], validation: [57_302, 76_403], sealedTest: [76_403, 95_504] };
const blocks = [1, 2, 4, 8];
const validationTrials = { 1: 128, 2: 96, 4: 96, 8: 96 };
const testTrials = { 1: 256, 2: 128, 4: 128, 8: 128 };
const familyOrder = ["scalar-jump", "diagonal-LDA", "ridge-LDA-1.0", "ridge-LDA-0.1", "ridge-LDA-0.01"];

const hashFile = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (!fs.existsSync(rawPath) || fs.statSync(rawPath).size !== n * side * side) throw new Error("RC47 raw input is absent or malformed");
const raw = fs.readFileSync(rawPath);

const scaled = new Map([[32, raw]]);
for (const target of [16, 8, 4]) {
  const factor = side / target;
  const values = new Float32Array(n * target * target);
  for (let frame = 0; frame < n; frame += 1) {
    const sourceBase = frame * side * side;
    const targetBase = frame * target * target;
    for (let y = 0; y < target; y += 1) for (let x = 0; x < target; x += 1) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy += 1) for (let dx = 0; dx < factor; dx += 1) {
        sum += raw[sourceBase + (y * factor + dy) * side + x * factor + dx];
      }
      values[targetBase + y * target + x] = sum / (factor * factor);
    }
  }
  scaled.set(target, values);
}

const intensity = new Float64Array(n);
const cx = new Float64Array(n);
const cy = new Float64Array(n);
const bright = new Float64Array(n * 4);
const rows = new Float32Array(n * side);
const cols = new Float32Array(n * side);
for (let frame = 0; frame < n; frame += 1) {
  const base = frame * side * side;
  let sum = 0;
  let xsum = 0;
  let ysum = 0;
  const counts = [0, 0, 0, 0];
  for (let y = 0; y < side; y += 1) for (let x = 0; x < side; x += 1) {
    const value = raw[base + y * side + x];
    sum += value;
    xsum += value * x;
    ysum += value * y;
    if (value >= 32) counts[0] += 1;
    if (value >= 64) counts[1] += 1;
    if (value >= 128) counts[2] += 1;
    if (value >= 192) counts[3] += 1;
    rows[frame * side + y] += value / side;
    cols[frame * side + x] += value / side;
  }
  intensity[frame] = sum / (side * side);
  cx[frame] = sum > 0 ? xsum / sum : 0;
  cy[frame] = sum > 0 ? ysum / sum : 0;
  for (let index = 0; index < 4; index += 1) bright[frame * 4 + index] = counts[index] / (side * side);
}

const quartetFeature = (a, left, right, b) => {
  const output = [];
  const logIndices = [];
  for (const scaleSide of [32, 16, 8, 4]) {
    const values = scaled.get(scaleSide);
    const pixels = scaleSide * scaleSide;
    const bases = [a, left, right, b].map(frame => frame * pixels);
    let madCenter = 0;
    let squareCenter = 0;
    let madPrior = 0;
    let madFollowing = 0;
    let meanLeft = 0;
    let meanRight = 0;
    let velocityResidual = 0;
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const av = values[bases[0] + pixel];
      const lv = values[bases[1] + pixel];
      const rv = values[bases[2] + pixel];
      const bv = values[bases[3] + pixel];
      const center = rv - lv;
      const prior = lv - av;
      const following = bv - rv;
      madCenter += Math.abs(center);
      squareCenter += center * center;
      madPrior += Math.abs(prior);
      madFollowing += Math.abs(following);
      velocityResidual += Math.abs(center - 0.5 * (prior + following));
      meanLeft += lv;
      meanRight += rv;
    }
    madCenter /= pixels;
    const rmsCenter = Math.sqrt(squareCenter / pixels);
    madPrior /= pixels;
    madFollowing /= pixels;
    meanLeft /= pixels;
    meanRight /= pixels;
    velocityResidual /= pixels;
    let dot = 0;
    let leftSquare = 0;
    let rightSquare = 0;
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const lv = values[bases[1] + pixel] - meanLeft;
      const rv = values[bases[2] + pixel] - meanRight;
      dot += lv * rv;
      leftSquare += lv * lv;
      rightSquare += rv * rv;
    }
    const denominator = Math.sqrt(leftSquare * rightSquare);
    const cosine = 1 - (denominator > 0 ? dot / denominator : 0);
    const logRatio = Math.log((madCenter + 1) / (0.5 * (madPrior + madFollowing) + 1));
    logIndices.push(output.length + 4);
    output.push(madCenter, rmsCenter, madPrior, madFollowing, logRatio, cosine, velocityResidual);
  }
  output.push(Math.hypot(cx[right] - cx[left], cy[right] - cy[left]));
  for (let index = 0; index < 4; index += 1) output.push(Math.abs(bright[right * 4 + index] - bright[left * 4 + index]));
  let rowChange = 0;
  let colChange = 0;
  for (let index = 0; index < side; index += 1) {
    rowChange += Math.abs(rows[right * side + index] - rows[left * side + index]);
    colChange += Math.abs(cols[right * side + index] - cols[left * side + index]);
  }
  output.push(rowChange / side, colChange / side);
  return { values: Float64Array.from(output), logIndices };
};

const range = (start, end, step = 1) => {
  const values = [];
  for (let value = start; value < end; value += step) values.push(value);
  return values;
};
const gapFeatures = (starts, gap) => starts.map(start => quartetFeature(start - 1, start, start + gap, start + gap + 1).values);
const columnStats = matrix => {
  const dims = matrix[0].length;
  const mean = new Float64Array(dims);
  for (const row of matrix) for (let j = 0; j < dims; j += 1) mean[j] += row[j];
  for (let j = 0; j < dims; j += 1) mean[j] /= matrix.length;
  const scale = new Float64Array(dims);
  for (const row of matrix) for (let j = 0; j < dims; j += 1) scale[j] += (row[j] - mean[j]) ** 2;
  for (let j = 0; j < dims; j += 1) {
    scale[j] = Math.sqrt(scale[j] / matrix.length);
    if (scale[j] === 0) scale[j] = 1;
  }
  return { mean, scale };
};
const standardize = (matrix, mean, scale) => matrix.map(row => Float64Array.from(row, (value, index) => (value - mean[index]) / scale[index]));
const dot = (left, right) => {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += left[index] * right[index];
  return value;
};
const solve = (matrix, vector) => {
  const size = vector.length;
  const rowsWork = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(rowsWork[row][column]) > Math.abs(rowsWork[pivot][column])) pivot = row;
    [rowsWork[column], rowsWork[pivot]] = [rowsWork[pivot], rowsWork[column]];
    const divisor = rowsWork[column][column];
    if (Math.abs(divisor) < 1e-18) throw new Error("singular RC47 LDA matrix");
    for (let item = column; item <= size; item += 1) rowsWork[column][item] /= divisor;
    for (let row = 0; row < size; row += 1) if (row !== column) {
      const factor = rowsWork[row][column];
      for (let item = column; item <= size; item += 1) rowsWork[row][item] -= factor * rowsWork[column][item];
    }
  }
  return Float64Array.from(rowsWork.map(row => row[size]));
};
const familyWeights = (neg, pos, logIndices) => {
  const dims = neg[0].length;
  const negMean = columnStats(neg).mean;
  const posMean = columnStats(pos).mean;
  const direction = Float64Array.from(negMean, (value, index) => posMean[index] - value);
  const covariance = Array.from({ length: dims }, () => new Float64Array(dims));
  for (const [matrix, mean] of [[neg, negMean], [pos, posMean]]) for (const row of matrix) {
    for (let j = 0; j < dims; j += 1) for (let k = 0; k < dims; k += 1) covariance[j][k] += (row[j] - mean[j]) * (row[k] - mean[k]);
  }
  const denominator = neg.length + pos.length - 2;
  for (let j = 0; j < dims; j += 1) for (let k = 0; k < dims; k += 1) covariance[j][k] /= denominator;
  const diagonal = Float64Array.from(covariance, row => row[covariance.indexOf?.(row)] ?? 0);
  for (let j = 0; j < dims; j += 1) diagonal[j] = covariance[j][j];
  const meanDiagonal = Array.from(diagonal).reduce((sum, value) => sum + value, 0) / dims;
  const result = {};
  const scalar = new Float64Array(dims);
  for (const index of logIndices) scalar[index] = 1;
  result["scalar-jump"] = scalar;
  result["diagonal-LDA"] = Float64Array.from(direction, (value, index) => value / (diagonal[index] > 1e-12 ? diagonal[index] : 1));
  for (const ridge of [1, 0.1, 0.01]) {
    const regularized = covariance.map((row, j) => Float64Array.from(row, (value, k) => value + (j === k ? ridge * meanDiagonal : 0)));
    result[`ridge-LDA-${ridge.toFixed(ridge === 1 ? 1 : ridge === 0.1 ? 1 : 2)}`] = solve(regularized, direction);
  }
  return result;
};

const deterministicStart = (partition, block, trial) => {
  const [start, end] = partitions[partition];
  const low = start + 128;
  const highExclusive = end - 128 - block + 1;
  const digest = crypto.createHash("sha256").update(`${seed}|${partition}|block-${block}|${trial}`).digest("hex");
  return low + Number(BigInt(`0x${digest}`) % BigInt(highExclusive - low));
};
const observedOriginal = (partStart, truthLocal, block, observed) => partStart + observed + (observed < truthLocal ? 0 : block);
const scoreRaw = (feature, model) => {
  let value = 0;
  for (let index = 0; index < feature.length; index += 1) value += ((feature[index] - model.mean[index]) / model.scale[index]) * model.weight[index];
  return value;
};
const isClose = (left, right) => Math.abs(left - right) <= 1e-12;

const evaluate = (model, partition, block, count, quartiles) => {
  const [partStart, partEnd] = partitions[partition];
  const intactStarts = range(partStart + 1, partEnd - 2);
  const intactScores = gapFeatures(intactStarts, 1).map(feature => scoreRaw(feature, model));
  const trials = [];
  const strata = Object.fromEntries([0, 1, 2, 3].map(index => [String(index), { truth: 0, correct: 0 }]));
  for (let trial = 0; trial < count; trial += 1) {
    const truth = deterministicStart(partition, block, trial);
    const truthLocal = truth - partStart;
    const observedLength = partEnd - partStart - block;
    const candidates = [];
    for (let rightSlot = Math.max(2, truthLocal - 1); rightSlot < Math.min(observedLength - 1, truthLocal + 2); rightSlot += 1) {
      const ids = [-2, -1, 0, 1].map(offset => observedOriginal(partStart, truthLocal, block, rightSlot + offset));
      candidates.push([scoreRaw(quartetFeature(ids[0], ids[1], ids[2], ids[3]).values, model), rightSlot]);
    }
    let backgroundScore = -Infinity;
    let backgroundStart = null;
    for (let index = 0; index < intactStarts.length; index += 1) {
      const start = intactStarts[index];
      if (start >= truth - 3 && start <= truth + block + 2) continue;
      const score = intactScores[index];
      if (score > backgroundScore || (isClose(score, backgroundScore) && start < backgroundStart)) {
        backgroundScore = score;
        backgroundStart = start;
      }
    }
    const backgroundRight = backgroundStart < truth ? backgroundStart + 1 - partStart : backgroundStart + 1 - partStart - block;
    candidates.push([backgroundScore, backgroundRight]);
    candidates.sort((left, right) => right[0] - left[0] || left[1] - right[1]);
    const [topScore, topSlot] = candidates[0];
    const call = topScore > model.threshold ? topSlot : null;
    const correct = call !== null && Math.abs(call - truthLocal) <= 1;
    let stratum = 0;
    while (stratum < quartiles.length && intensity[truth - 1] >= quartiles[stratum]) stratum += 1;
    strata[String(stratum)].truth += 1;
    strata[String(stratum)].correct += Number(correct);
    trials.push({ trial, truthStart: truth, truthRightSlot: truthLocal, callRightSlot: call, topScore, correct, falseDiscovery: call !== null && !correct, intensityStratum: stratum });
  }
  const calls = trials.filter(row => row.callRightSlot !== null).length;
  const correct = trials.filter(row => row.correct).length;
  const falseDiscoveries = trials.filter(row => row.falseDiscovery).length;
  for (const value of Object.values(strata)) value.recall = value.truth ? value.correct / value.truth : null;
  const maximumScore = Math.max(...intactScores);
  const firstMaximumStart = Math.min(...intactStarts.filter((_, index) => isClose(intactScores[index], maximumScore)));
  return {
    totals: { truth: count, calls, correctWithinOne: correct, falseDiscoveries },
    recallWithinOne: correct / count,
    falseDiscoveryRate: calls ? falseDiscoveries / calls : 0,
    unmodifiedControl: { calls: Number(maximumScore > model.threshold), maximumScore, firstMaximumStart },
    intensityStrata: strata,
    trials
  };
};

const sortedDevIntensity = Array.from(intensity.slice(0, partitions.development[1])).sort((a, b) => a - b);
const numpyLinearQuantile = probability => {
  const index = (sortedDevIntensity.length - 1) * probability;
  const low = Math.floor(index);
  const fraction = index - low;
  return sortedDevIntensity[low] * (1 - fraction) + sortedDevIntensity[Math.min(low + 1, sortedDevIntensity.length - 1)] * fraction;
};
const quartiles = [0.25, 0.5, 0.75].map(numpyLinearQuantile);
const models = {};
const validation = {};
const validationTrialOutput = {};
for (const block of blocks) {
  const gap = block + 1;
  const devStarts = range(1, partitions.development[1] - gap - 1, 4);
  const rawNeg = gapFeatures(devStarts, 1);
  const rawPos = gapFeatures(devStarts, gap);
  const { mean, scale } = columnStats(rawNeg);
  const neg = standardize(rawNeg, mean, scale);
  const pos = standardize(rawPos, mean, scale);
  const logIndices = quartetFeature(0, 1, 2, 3).logIndices;
  const weights = familyWeights(neg, pos, logIndices);
  const validationStarts = range(partitions.validation[0] + 1, partitions.validation[1] - 2);
  const validationNeg = standardize(gapFeatures(validationStarts, 1), mean, scale);
  const candidates = [];
  const candidateTrials = {};
  for (const family of familyOrder) {
    const weight = weights[family];
    const threshold = Math.max(...validationNeg.map(row => dot(row, weight)));
    const model = { family, mean, scale, weight, threshold };
    const evaluated = evaluate(model, "validation", block, validationTrials[block], quartiles);
    candidates.push({ family, threshold, recallWithinOne: evaluated.recallWithinOne, falseDiscoveryRate: evaluated.falseDiscoveryRate, calls: evaluated.totals.calls });
    candidateTrials[family] = evaluated.trials;
  }
  candidates.sort((left, right) => right.recallWithinOne - left.recallWithinOne || left.falseDiscoveryRate - right.falseDiscoveryRate || familyOrder.indexOf(left.family) - familyOrder.indexOf(right.family));
  const selected = candidates[0];
  models[block] = { family: selected.family, mean, scale, weight: weights[selected.family], threshold: selected.threshold };
  validation[String(block)] = { gap, trainingPairsPerClass: devStarts.length, candidates: candidates.sort((a, b) => familyOrder.indexOf(a.family) - familyOrder.indexOf(b.family)), selected };
  validationTrialOutput[String(block)] = candidateTrials[selected.family];
}

const sealedTest = {};
const sealedTrialOutput = {};
for (const block of blocks) {
  const evaluated = evaluate(models[block], "sealedTest", block, testTrials[block], quartiles);
  sealedTest[String(block)] = Object.fromEntries(Object.entries(evaluated).filter(([key]) => key !== "trials"));
  sealedTrialOutput[String(block)] = evaluated.trials;
}
const totalCalls = Object.values(sealedTest).reduce((sum, value) => sum + value.totals.calls, 0);
const totalFalse = Object.values(sealedTest).reduce((sum, value) => sum + value.totals.falseDiscoveries, 0);
const aggregateFdr = totalCalls ? totalFalse / totalCalls : 0;
const stratumPass = Object.values(sealedTest).every(value => Object.values(value.intensityStrata).every(row => row.truth < 20 || row.recall >= 0.9));
const gates = {
  singletonRecallAtLeast95Percent: sealedTest["1"].recallWithinOne >= 0.95,
  block2RecallAtLeast95Percent: sealedTest["2"].recallWithinOne >= 0.95,
  block4RecallAtLeast95Percent: sealedTest["4"].recallWithinOne >= 0.95,
  block8RecallAtLeast95Percent: sealedTest["8"].recallWithinOne >= 0.95,
  aggregateFdrAtMost1Percent: aggregateFdr <= 0.01,
  unmodifiedControlsEmpty: Object.values(sealedTest).every(value => value.unmodifiedControl.calls === 0),
  intensityStrataPass: stratumPass
};
const result = {
  resultId: "RC47-X16-SELF-DELETION-NODE-0.1",
  cycleId: "RC-2026-47",
  createdOn: "2026-08-24",
  status: "complete-independent-development-run",
  preregistration: "research/reproducibility/rc47-self-deletion-precommit.json",
  inputs: { rawBytes: raw.length, rawSha256: hashFile(rawPath), frames: n, side },
  partitions: Object.fromEntries(Object.entries(partitions).map(([key, value]) => [key, { start: value[0], endExclusive: value[1], frames: value[1] - value[0] }])),
  featureCount: models[1].mean.length,
  frameIntensityQuartiles: quartiles,
  validation,
  selectedModels: Object.fromEntries(blocks.map(block => [String(block), { family: models[block].family, threshold: models[block].threshold, mean: Array.from(models[block].mean), scale: Array.from(models[block].scale), weight: Array.from(models[block].weight) }])),
  sealedTest,
  aggregate: { calls: totalCalls, falseDiscoveries: totalFalse, falseDiscoveryRate: aggregateFdr },
  gates: { ...gates, passedBeforeAdjudication: Object.values(gates).every(Boolean) },
  independence: "This implementation reads the authenticated 32 by 32 bytes, derives all scales and features, trains every candidate, selects on validation, generates trial positions, and scores the sealed block without importing Python outputs.",
  boundary: "This run tests synthetic contiguous omissions only within L0002. It does not inspect L0001, authenticate frame-trigger ordinals, or establish cross-layer transport."
};
if (process.argv.includes("--write")) {
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(trialPath, `${JSON.stringify({ resultId: "RC47-X16-SELF-DELETION-NODE-TRIALS-0.1", cycleId: "RC-2026-47", validation: validationTrialOutput, sealedTest: sealedTrialOutput })}\n`);
}
console.log(JSON.stringify({ selected: Object.fromEntries(blocks.map(block => [block, models[block].family])), sealedTest: Object.fromEntries(Object.entries(sealedTest).map(([key, value]) => [key, { recall: value.recallWithinOne, fdr: value.falseDiscoveryRate, unmodifiedCalls: value.unmodifiedControl.calls }])), aggregate: result.aggregate, gates: result.gates }, null, 2));
