import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const argValue = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const downloadDir = path.resolve(root, argValue("--download-dir") || ".cache/rc64-smc-source");
const shouldWrite = process.argv.includes("--write");
const alphaFixed = -3.26;
const excludedId = "OGLE-1455";
const crnl = 0.0293;
const baselineR = 0.386;
const alternateR = 0.362;
const bootstrapReplicates = 20000;
const bootstrapSeed = 20260831;

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
const sampleSd = values => {
  const center = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1));
};

function splitRows(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !line.startsWith("Cepheid &"))
    .map(line => line.replace(/\\+\s*$/, "").split("&").map(field => field.trim()));
}

function parseTable1(file) {
  return splitRows(file).map(fields => {
    if (fields.length !== 8) throw new Error(`Table1 column count ${fields.length}`);
    return { id: fields[0], frame: fields[1].split(/\s+/)[0], largeDrift: fields[1].includes("(*)"), filter: fields[2] };
  });
}

function parseTable2(file) {
  return splitRows(file).map(fields => {
    if (fields.length !== 13) throw new Error(`Table2 column count ${fields.length}`);
    return {
      id: fields[0], raDeg: +fields[1], decDeg: +fields[2], geoMag: +fields[3], logP: +fields[4],
      f555w: +fields[5], f814w: +fields[7], f160w: +fields[9], mHW: +fields[11]
    };
  });
}

function fixedFit(records, key) {
  const intercept = mean(records.map(record => record[key] - alphaFixed * record.logP));
  const residuals = records.map(record => record[key] - (alphaFixed * record.logP + intercept));
  return { slope: alphaFixed, interceptLogP0Mag: intercept, magnitudeAtLogP1: intercept + alphaFixed, rmsMag: rms(residuals), sampleSdMag: sampleSd(residuals) };
}

function olsLine(records, key) {
  const xs = records.map(record => record.logP);
  const ys = records.map(record => record[key]);
  const xbar = mean(xs);
  const ybar = mean(ys);
  const sxx = xs.reduce((sum, x) => sum + (x - xbar) ** 2, 0);
  const slope = xs.reduce((sum, x, index) => sum + (x - xbar) * (ys[index] - ybar), 0) / sxx;
  const intercept = ybar - slope * xbar;
  const residuals = ys.map((y, index) => y - intercept - slope * xs[index]);
  const sigma = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / (xs.length - 2));
  return { slope, slopeStandardError: sigma / Math.sqrt(sxx), interceptLogP0Mag: intercept, magnitudeAtLogP1: intercept + slope, rmsMag: rms(residuals) };
}

function solveLinear(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-14) throw new Error("singular normal matrix");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let item = column; item <= n; item += 1) augmented[column][item] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item <= n; item += 1) augmented[row][item] -= factor * augmented[column][item];
    }
  }
  return augmented.map((row, index) => row[n]);
}

function affineCoefficients(records, key) {
  const normal = Array.from({ length: 3 }, () => Array(3).fill(0));
  const rhs = Array(3).fill(0);
  for (const record of records) {
    const features = [1, record.xKpc, record.yKpc];
    const target = record[key] - alphaFixed * record.logP;
    for (let row = 0; row < 3; row += 1) {
      rhs[row] += features[row] * target;
      for (let column = 0; column < 3; column += 1) normal[row][column] += features[row] * features[column];
    }
  }
  return solveLinear(normal, rhs);
}

function affineResidual(record, coefficients, key) {
  const predicted = alphaFixed * record.logP + coefficients[0] + coefficients[1] * record.xKpc + coefficients[2] * record.yKpc;
  return record[key] - predicted;
}

function segmentSlopeAndSe(xs, ys, start, end) {
  const count = end - start;
  let sx = 0, sy = 0, sxxRaw = 0, sxyRaw = 0;
  for (let index = start; index < end; index += 1) {
    sx += xs[index]; sy += ys[index]; sxxRaw += xs[index] * xs[index]; sxyRaw += xs[index] * ys[index];
  }
  const xbar = sx / count;
  const ybar = sy / count;
  const sxx = sxxRaw - count * xbar * xbar;
  const slope = (sxyRaw - count * xbar * ybar) / sxx;
  const intercept = ybar - slope * xbar;
  let sse = 0;
  for (let index = start; index < end; index += 1) sse += (ys[index] - intercept - slope * xs[index]) ** 2;
  return { slope, se: Math.sqrt((sse / (count - 2)) / sxx) };
}

function breakScan(xs, ys, minimum = 9) {
  let best = null;
  for (let split = minimum; split <= xs.length - minimum; split += 1) {
    if (xs[split - 1] === xs[split]) continue;
    const pivot = (xs[split - 1] + xs[split]) / 2;
    if (pivot < 0.85 || pivot > 1.5) continue;
    const left = segmentSlopeAndSe(xs, ys, 0, split);
    const right = segmentSlopeAndSe(xs, ys, split, xs.length);
    const statistic = Math.abs(left.slope - right.slope) / Math.sqrt(left.se ** 2 + right.se ** 2);
    const candidate = { pivotLogP: pivot, shortCount: split, longCount: xs.length - split, shortSlope: left.slope, longSlope: right.slope, localStatistic: statistic };
    if (!best || statistic > best.localStatistic) best = candidate;
  }
  return best;
}

class XorShiftNormal {
  constructor(seed) { this.state = seed >>> 0; this.spare = null; }
  uint32() {
    let value = this.state >>> 0;
    value = (value ^ ((value << 13) >>> 0)) >>> 0;
    value = (value ^ (value >>> 17)) >>> 0;
    value = (value ^ ((value << 5) >>> 0)) >>> 0;
    this.state = value >>> 0;
    return this.state;
  }
  uniform() { return (this.uint32() + 1) / 4294967297; }
  normal() {
    if (this.spare !== null) { const value = this.spare; this.spare = null; return value; }
    const radius = Math.sqrt(-2 * Math.log(this.uniform()));
    const angle = 2 * Math.PI * this.uniform();
    this.spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  }
}

function bootstrapBreak(xs, observedStatistic) {
  const random = new XorShiftNormal(bootstrapSeed);
  let exceedances = 0;
  let maximumSum = 0;
  for (let replicate = 0; replicate < bootstrapReplicates; replicate += 1) {
    const simulated = xs.map(() => random.normal());
    const statistic = breakScan(xs, simulated).localStatistic;
    maximumSum += statistic;
    if (statistic >= observedStatistic) exceedances += 1;
  }
  const globalPValue = (exceedances + 1) / (bootstrapReplicates + 1);
  return {
    replicates: bootstrapReplicates,
    seed: bootstrapSeed,
    exceedances,
    globalPValue,
    monteCarloStandardError: Math.sqrt(globalPValue * (1 - globalPValue) / (bootstrapReplicates + 1)),
    meanNullMaximumStatistic: maximumSum / bootstrapReplicates
  };
}

function tangentCoordinates(raDeg, decDeg, distance = 62.44) {
  const alpha = raDeg * Math.PI / 180;
  const delta = decDeg * Math.PI / 180;
  const alpha0 = 12.54 * Math.PI / 180;
  const delta0 = -73.11 * Math.PI / 180;
  return {
    x: -distance * Math.cos(delta) * Math.sin(alpha - alpha0),
    y: distance * (Math.sin(delta) * Math.cos(delta0) - Math.cos(delta) * Math.sin(delta0) * Math.cos(alpha - alpha0))
  };
}

function geometryCorrection(x, y, xCoefficient, yCoefficient, distance = 62.44) {
  return 5 * Math.log10(distance / (distance + xCoefficient * x + yCoefficient * y));
}

const table1Path = path.join(downloadDir, "Table1.dat");
const table2Path = path.join(downloadDir, "Table2.dat");
const table1 = parseTable1(table1Path);
const table2 = parseTable2(table2Path);
for (const record of table2) {
  record.color = record.f555w - record.f814w;
  record.mHWDerived = record.f160w - baselineR * record.color + record.geoMag + crnl;
  record.mHWRaw = record.f160w - baselineR * record.color + crnl;
  const coordinates = tangentCoordinates(record.raDeg, record.decDeg);
  record.xKpc = coordinates.x;
  record.yKpc = coordinates.y;
  record.mHWDeb = record.mHWRaw + geometryCorrection(record.xKpc, record.yKpc, 3.086, -4.248);
  record.mHWEq6 = record.mHWRaw + geometryCorrection(record.xKpc, record.yKpc, 3.480, -2.955);
}

const retained = table2.filter(record => record.id !== excludedId);
const baseline = fixedFit(retained, "mHW");
const freeFit = olsLine(retained, "mHW");
const noGeometry = fixedFit(retained, "mHWRaw");
const externalDeb = fixedFit(retained, "mHWDeb");
const equation6 = fixedFit(retained, "mHWEq6");
const leaveOneOut = retained.map(removed => {
  const reduced = retained.filter(record => record.id !== removed.id);
  const shiftMag = fixedFit(reduced, "mHW").magnitudeAtLogP1 - baseline.magnitudeAtLogP1;
  return { id: removed.id, shiftMag, absoluteShiftMag: Math.abs(shiftMag) };
}).sort((a, b) => b.absoluteShiftMag - a.absoluteShiftMag);

const affine = affineCoefficients(retained, "mHWRaw");
const affineTrainingRms = rms(retained.map(record => affineResidual(record, affine, "mHWRaw")));
const affineLooRms = rms(retained.map(held => {
  const development = retained.filter(record => record.id !== held.id);
  return affineResidual(held, affineCoefficients(development, "mHWRaw"), "mHWRaw");
}));
const sorted = [...retained].sort((a, b) => a.logP - b.logP);
const xs = sorted.map(record => record.logP);
const ys = sorted.map(record => record.mHW);
const observedBreak = breakScan(xs, ys);
const bootstrap = bootstrapBreak(xs, observedBreak.localStatistic);

const filtersById = new Map();
for (const row of table1) {
  if (!filtersById.has(row.id)) filtersById.set(row.id, new Set());
  filtersById.get(row.id).add(row.filter);
}
const filterComplete = [...filtersById.values()].every(filters => ["F555W", "F814W", "F160W"].every(filter => filters.has(filter)) && filters.size === 3);
const result = {
  cycleId: "RC-2026-64",
  implementation: "dependency-free-node",
  source: {
    table1Sha256: crypto.createHash("sha256").update(fs.readFileSync(table1Path)).digest("hex"),
    table2Sha256: crypto.createHash("sha256").update(fs.readFileSync(table2Path)).digest("hex")
  },
  semanticAudit: {
    table1Rows: table1.length,
    table2Rows: table2.length,
    threeFilterCoverageComplete: filterComplete,
    largeDriftFlaggedFrames: table1.filter(row => row.largeDrift).length,
    largeDriftFlaggedCepheids: new Set(table1.filter(row => row.largeDrift).map(row => row.id)).size,
    maximumDerivedMHWResidualMag: Math.max(...table2.map(record => Math.abs(record.mHWDerived - record.mHW)))
  },
  baseline: { ...baseline, freeSlope: freeFit.slope, freeSlopeStandardError: freeFit.slopeStandardError },
  singleCepheidInfluence: { maximum: leaveOneOut[0], topFive: leaveOneOut.slice(0, 5) },
  geometryTransfer: {
    noGeometryRmsMag: noGeometry.rmsMag,
    externalDebGeometryRmsMag: externalDeb.rmsMag,
    cepheidEquation6RmsMag: equation6.rmsMag,
    sameSampleAffineTrainingRmsMag: affineTrainingRms,
    sameSampleAffineLeaveOneOutRmsMag: affineLooRms,
    crossValidatedGainVersusExternalDebMag: externalDeb.rmsMag - affineLooRms
  },
  breakSearch: { observed: observedBreak, bootstrap },
  gates: {
    sourceShape: table1.length === 264 && table2.length === 88 && filterComplete,
    derivedIdentity: Math.max(...table2.map(record => Math.abs(record.mHWDerived - record.mHW))) <= 0.002,
    publishedBaseline: Math.abs(baseline.interceptLogP0Mag - 16.467) <= 0.003 && Math.abs(baseline.rmsMag - 0.1017) <= 0.003 && Math.abs(freeFit.slope + 3.31) <= 0.08,
    singleCepheidInfluence: leaveOneOut[0].absoluteShiftMag < 0.01,
    sameSampleGeometryTransfers: externalDeb.rmsMag - affineLooRms >= 0.005,
    periodBreak: bootstrap.globalPValue < 0.01,
    globalNamedDeletion: false
  }
};

if (shouldWrite) fs.writeFileSync(path.join(root, "research/reproducibility/rc64-smc-anchor-audit-node.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
