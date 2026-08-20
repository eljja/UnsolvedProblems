import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const xyptPath = path.join(root, ".cache", "rc44-x16", "l0002", "extracted", "XYPT_L0002.csv");
const rawPath = path.join(root, ".cache", "rc44-x16", "l0002", "frames-8x8-gray.raw");
const pythonResultPath = path.join(root, "research", "reproducibility", "rc44-x16-layer-0002-python-development-v02.json");
const pythonTrialsPath = path.join(root, "research", "reproducibility", "rc44-x16-layer-0002-python-trials-v02.json");
const write = process.argv.includes("--write");
const ROWS = 1_486_203;
const FRAMES = 95_504;
const TRAIN_END = Math.floor(0.6 * FRAMES);
const TEST_START = Math.floor(0.8 * FRAMES);
const TEST_LENGTH = FRAMES - TEST_START;
const FEATURES_X = 18;
const FEATURES_Y = 22;
const ALPHA = 1;
const DELTA = 1;
const SEED = "RC44-X16-SYNTHETIC-HOLDOUT-v1";

const shaFile = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const median = values => {
  const copy = Float64Array.from(values).sort();
  const middle = Math.floor(copy.length / 2);
  return copy.length % 2 ? copy[middle] : (copy[middle - 1] + copy[middle]) / 2;
};

async function parseXypt() {
  const x = new Float64Array(ROWS);
  const y = new Float64Array(ROWS);
  const power = new Float64Array(ROWS);
  const triggers = new Int32Array(FRAMES);
  let row = 0, event = 0;
  const input = fs.createReadStream(xyptPath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const fields = line.split(",");
    if (fields.length !== 4 || row >= ROWS) throw new Error(`Malformed XYPT row ${row}`);
    x[row] = Number(fields[0]);
    y[row] = Number(fields[1]);
    power[row] = Number(fields[2]);
    if (Number(fields[3]) !== 0) {
      if (event >= FRAMES) throw new Error("too many triggers");
      triggers[event++] = row;
    }
    row += 1;
  }
  if (row !== ROWS || event !== FRAMES) throw new Error(`XYPT dimensions ${row}/${event}`);
  return { x, y, power, triggers };
}

const gradientAt = (values, index) => (values[index + 1] - values[index - 1]) / 2;
const secondGradientAt = (values, index) => (values[index + 2] - 2 * values[index] + values[index - 2]) / 4;

function commandFeatures(data) {
  const columns = Array.from({ length: FEATURES_X }, () => new Float64Array(FRAMES));
  let previousUnwrapped = 0;
  let previousPower = 0;
  const energyPerSpeed = new Float64Array(FRAMES);
  for (let event = 0; event < FRAMES; event += 1) {
    const index = data.triggers[event];
    const dx = gradientAt(data.x, index), dy = gradientAt(data.y, index);
    const ddx = secondGradientAt(data.x, index), ddy = secondGradientAt(data.y, index);
    const speed = Math.hypot(dx, dy);
    let angle = Math.atan2(dy, dx);
    if (event > 0) {
      while (angle - previousUnwrapped > Math.PI) angle -= 2 * Math.PI;
      while (angle - previousUnwrapped < -Math.PI) angle += 2 * Math.PI;
    }
    const p = data.power[index];
    columns[0][event] = p;
    columns[1][event] = dx;
    columns[2][event] = dy;
    columns[3][event] = ddx;
    columns[4][event] = ddy;
    columns[5][event] = speed;
    columns[6][event] = Math.hypot(ddx, ddy);
    columns[7][event] = Math.sin(angle);
    columns[8][event] = Math.cos(angle);
    columns[9][event] = event === 0 ? 0 : angle - previousUnwrapped;
    columns[10][event] = p > 0 ? 1 : 0;
    columns[11][event] = event === 0 ? 0 : p - previousPower;
    energyPerSpeed[event] = p / Math.max(speed, 1e-9);
    previousUnwrapped = angle;
    previousPower = p;
  }
  let column = 12;
  for (const window of [5, 25, 125]) {
    let sumPower = 0, sumEnergy = 0;
    for (let event = 0; event < FRAMES; event += 1) {
      sumPower += columns[0][event];
      sumEnergy += energyPerSpeed[event];
      if (event >= window) {
        sumPower -= columns[0][event - window];
        sumEnergy -= energyPerSpeed[event - window];
      }
      columns[column][event] = sumPower;
      columns[column + 1][event] = sumEnergy;
    }
    column += 2;
  }
  return columns;
}

function imageFeatures() {
  const raw = fs.readFileSync(rawPath);
  if (raw.length !== FRAMES * 64) throw new Error(`raw byte count ${raw.length}`);
  const columns = Array.from({ length: FEATURES_Y }, () => new Float64Array(FRAMES));
  const previous = new Float64Array(11);
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const offset = frame * 64;
    let sum = 0, sumSquares = 0, n32 = 0, n64 = 0, n128 = 0, n192 = 0, sx = 0, sy = 0;
    for (let pixel = 0; pixel < 64; pixel += 1) {
      const value = raw[offset + pixel], px = pixel % 8, py = Math.floor(pixel / 8);
      sum += value; sumSquares += value * value; sx += value * px; sy += value * py;
      if (value >= 32) n32 += 1;
      if (value >= 64) n64 += 1;
      if (value >= 128) n128 += 1;
      if (value >= 192) n192 += 1;
    }
    const safe = Math.max(sum, 1), mean = sum / 64, cx = sx / safe, cy = sy / safe;
    let mxx = 0, myy = 0, mxy = 0;
    for (let pixel = 0; pixel < 64; pixel += 1) {
      const value = raw[offset + pixel], px = pixel % 8, py = Math.floor(pixel / 8);
      mxx += value * (px - cx) ** 2;
      myy += value * (py - cy) ** 2;
      mxy += value * (px - cx) * (py - cy);
    }
    const base = [mean, Math.sqrt(Math.max(0, sumSquares / 64 - mean * mean)), n32 / 64, n64 / 64, n128 / 64, n192 / 64, cx, cy, mxx / safe, myy / safe, mxy / safe];
    for (let feature = 0; feature < 11; feature += 1) {
      columns[feature][frame] = base[feature];
      columns[11 + feature][frame] = frame === 0 ? 0 : base[feature] - previous[feature];
      previous[feature] = base[feature];
    }
  }
  return columns;
}

function standardize(columns) {
  const medians = [], scales = [], standardized = [];
  for (const column of columns) {
    const train = column.subarray(0, TRAIN_END);
    const center = median(train);
    const deviations = Float64Array.from(train, value => Math.abs(value - center));
    const scaleValue = 1.4826 * median(deviations) || 1;
    medians.push(center); scales.push(scaleValue);
    standardized.push(Float64Array.from(column, value => (value - center) / scaleValue));
  }
  return { medians, scales, columns: standardized };
}

function solveRidge(x, y) {
  const p = FEATURES_X + 1, q = FEATURES_Y;
  const augmented = Array.from({ length: p }, () => new Float64Array(p + q));
  for (let row = 0; row < TRAIN_END; row += 1) {
    for (let a = 0; a < p; a += 1) {
      const va = a === 0 ? 1 : x[a - 1][row];
      for (let b = 0; b < p; b += 1) augmented[a][b] += va * (b === 0 ? 1 : x[b - 1][row]);
      for (let target = 0; target < q; target += 1) augmented[a][p + target] += va * y[target][row];
    }
  }
  for (let index = 1; index < p; index += 1) augmented[index][index] += ALPHA;
  for (let pivot = 0; pivot < p; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < p; row += 1) if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
    const divisor = augmented[pivot][pivot];
    if (Math.abs(divisor) < 1e-12) throw new Error(`singular ridge matrix at ${pivot}`);
    for (let col = pivot; col < p + q; col += 1) augmented[pivot][col] /= divisor;
    for (let row = 0; row < p; row += 1) if (row !== pivot) {
      const factor = augmented[row][pivot];
      if (factor === 0) continue;
      for (let col = pivot; col < p + q; col += 1) augmented[row][col] -= factor * augmented[pivot][col];
    }
  }
  return Array.from({ length: p }, (_, row) => Float64Array.from({ length: q }, (_, target) => augmented[row][p + target]));
}

function predictTest(x, coefficients) {
  const predicted = new Float64Array(TEST_LENGTH * FEATURES_Y);
  for (let index = 0; index < TEST_LENGTH; index += 1) {
    const global = TEST_START + index;
    for (let target = 0; target < FEATURES_Y; target += 1) {
      let value = coefficients[0][target];
      for (let feature = 0; feature < FEATURES_X; feature += 1) value += x[feature][global] * coefficients[feature + 1][target];
      predicted[index * FEATURES_Y + target] = value;
    }
  }
  return predicted;
}

function deterministicPosition(trial) {
  let counter = 0;
  const low = TEST_START + 128, high = FRAMES - 128;
  while (true) {
    const payload = `${SEED}|test-single|${trial}|${counter}`;
    const value = BigInt(`0x${crypto.createHash("sha256").update(payload).digest("hex")}`);
    const candidate = low + Number(value % BigInt(high - low));
    if (candidate >= low && candidate < high) return candidate - TEST_START;
    counter += 1;
  }
}

function huberPair(predicted, y, predictedIndex, observedOriginalIndex) {
  let cost = 0;
  for (let feature = 0; feature < FEATURES_Y; feature += 1) {
    const residual = Math.abs(predicted[predictedIndex * FEATURES_Y + feature] - y[feature][TEST_START + observedOriginalIndex]);
    cost += residual <= DELTA ? 0.5 * residual * residual : DELTA * (residual - 0.5 * DELTA);
  }
  return cost / FEATURES_Y;
}

function recoverSingle(predicted, y, truth) {
  const count = TEST_LENGTH - 1;
  const prefix = new Float64Array(TEST_LENGTH);
  const suffix = new Float64Array(TEST_LENGTH);
  for (let observed = 0; observed < count; observed += 1) {
    const original = observed < truth ? observed : observed + 1;
    prefix[observed + 1] = prefix[observed] + huberPair(predicted, y, observed, original);
  }
  for (let observed = count - 1; observed >= 0; observed -= 1) {
    const original = observed < truth ? observed : observed + 1;
    suffix[observed] = suffix[observed + 1] + huberPair(predicted, y, observed + 1, original);
  }
  let best = 0, bestCost = prefix[0] + suffix[0];
  for (let candidate = 1; candidate < TEST_LENGTH; candidate += 1) {
    const cost = prefix[candidate] + suffix[candidate];
    if (cost < bestCost) { best = candidate; bestCost = cost; }
  }
  return { call: best, cost: bestCost };
}

const xypt = await parseXypt();
const command = standardize(commandFeatures(xypt));
const image = standardize(imageFeatures());
const coefficients = solveRidge(command.columns, image.columns);
const predicted = predictTest(command.columns, coefficients);
const trials = [];
let recovered = 0;
for (let trial = 0; trial < 128; trial += 1) {
  const truth = deterministicPosition(trial);
  const result = recoverSingle(predicted, image.columns, truth);
  const hit = Math.abs(result.call - truth) <= 1;
  if (hit) recovered += 1;
  trials.push({ trial, truth, call: result.call, recoveredWithinOne: hit, cost: result.cost });
}

const pythonResult = JSON.parse(fs.readFileSync(pythonResultPath, "utf8"));
const pythonTrials = JSON.parse(fs.readFileSync(pythonTrialsPath, "utf8")).test.filter(item => item.case === "test-single");
const pythonRecovered = pythonTrials.reduce((sum, item) => sum + item.recoveredWithinOne, 0);
const sameTruth = trials.every((item, index) => item.truth === pythonTrials[index].truthSlots[0]);
const sameCalls = trials.every((item, index) => item.call === pythonTrials[index].calledSlots[0]);
const maximumOverallRecallIfEveryOtherCasePerfect = (recovered + (pythonResult.syntheticTest.totals.truth - 128)) / pythonResult.syntheticTest.totals.truth;
const result = {
  auditId: "RC44-X16-L0002-INDEPENDENT-JS-SINGLE-DELETION-0.2",
  cycleId: "RC-2026-44",
  createdOn: "2026-08-21",
  scope: "Independent source-based reconstruction of the 128 singleton deletion trials. This is sufficient to reject the 95 percent aggregate gate when more than 61 singleton trials fail, even under the impossible best case that every remaining deletion is recovered.",
  inputs: {
    xyptSha256: shaFile(xyptPath), raw8x8Sha256: shaFile(rawPath),
    rows: ROWS, triggers: FRAMES, rawBytes: fs.statSync(rawPath).size,
    selectedConfiguration: { ridgeAlpha: ALPHA, huberDelta: DELTA }
  },
  singleton: { trials: 128, recoveredWithinOne: recovered, failures: 128 - recovered, recallWithinOne: recovered / 128 },
  comparisonToPython: { pythonRecoveredWithinOne: pythonRecovered, sameTruthSchedule: sameTruth, sameCalledSlots: sameCalls, exactAggregateAgreement: recovered === pythonRecovered && sameTruth && sameCalls },
  logicalGateBound: { allOtherDeletionTruths: pythonResult.syntheticTest.totals.truth - 128, maximumOverallRecallIfEveryOtherCasePerfect, canReach95Percent: maximumOverallRecallIfEveryOtherCasePerfect >= 0.95 },
  independence: "JavaScript streams and parses XYPT independently, derives 18 command and 22 image features, computes robust scales, solves the ridge normal equations, generates singleton truths, and scans every deletion placement without importing Python calls. It uses the same sealed raw 8 by 8 decoder output and the Python-selected scalar alpha and delta.",
  verdict: recovered === pythonRecovered && sameTruth && maximumOverallRecallIfEveryOtherCasePerfect < 0.95 ? "independently-confirms-primary-gate-cannot-pass" : "inconclusive-disagreement",
  trials
};

if (write) {
  const output = path.join(root, "research", "reproducibility", "rc44-x16-layer-0002-independent-js-audit-v02.json");
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify({ singleton: result.singleton, comparisonToPython: result.comparisonToPython, logicalGateBound: result.logicalGateBound, verdict: result.verdict }, null, 2));
