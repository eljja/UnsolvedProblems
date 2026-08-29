#!/usr/bin/env node
/* Dependency-free RC62 audit: independent weighted moments and bridge algebra. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "research", "reproducibility");
const SPEC = JSON.parse(fs.readFileSync(path.join(DATA, "rc62-posterior-analysis-spec.json"), "utf8"));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(DATA, "rc62-posterior-chain-manifest.json"), "utf8"));
const PYTHON = JSON.parse(fs.readFileSync(path.join(DATA, "rc62-posterior-bridge-result.json"), "utf8"));
const OUTPUT = path.join(DATA, "rc62-posterior-node-audit.json");
const chainArg = process.argv.indexOf("--chain-dir");
if (chainArg < 0) throw new Error("--chain-dir is required");
const CHAIN_DIR = path.resolve(process.argv[chainArg + 1]);
const write = process.argv.includes("--write");
const PARAMETERS = ["H0", "rdrag", "H0rdrag", "w", "wa", "omegam"];

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();

function parseCobaya(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const header = lines[0].replace(/^#\s*/, "").trim().split(/\s+/);
  const indices = ["weight", ...PARAMETERS].map((name) => header.indexOf(name));
  if (indices.some((index) => index < 0)) throw new Error(`missing column in ${file}`);
  const rows = [];
  let total = 0;
  for (const line of lines.slice(1)) {
    if (!line || line.startsWith("#")) continue;
    const fields = line.trim().split(/\s+/);
    const weight = Number(fields[indices[0]]);
    if (!Number.isInteger(weight) || weight < 1) throw new Error(`invalid multiplicity in ${file}`);
    rows.push({ weight, values: indices.slice(1).map((index) => Number(fields[index])) });
    total += weight;
  }
  let drop = Math.floor(total * SPEC.processing.discardInitialFractionByExpandedMarkovSteps);
  for (const row of rows) {
    const removed = Math.min(drop, row.weight);
    row.weight -= removed;
    drop -= removed;
    if (!drop) break;
  }
  return rows;
}

function aggregateGroup(groupId) {
  const files = MANIFEST.files.filter((file) => file.groupId === groupId).sort((a, b) => a.chain - b.chain);
  const accumulators = PARAMETERS.map(() => ({ sum: 0, square: 0 }));
  let crossRdragProduct = 0;
  let total = 0;
  const hashes = [];
  for (const item of files) {
    const file = path.join(CHAIN_DIR, item.localFilename);
    const observed = sha256(file);
    hashes.push(observed === item.expectedSha256 && observed === item.observedSha256);
    for (const row of parseCobaya(file)) {
      if (!row.weight) continue;
      total += row.weight;
      row.values.forEach((value, index) => {
        accumulators[index].sum += row.weight * value;
        accumulators[index].square += row.weight * value * value;
      });
      const rdrag = row.values[PARAMETERS.indexOf("rdrag")];
      const product = row.values[PARAMETERS.indexOf("H0rdrag")];
      crossRdragProduct += row.weight * rdrag * product;
    }
  }
  const summaries = {};
  PARAMETERS.forEach((parameter, index) => {
    const mean = accumulators[index].sum / total;
    const variance = (accumulators[index].square - total * mean * mean) / (total - 1);
    summaries[parameter] = { mean, sd: Math.sqrt(variance) };
  });
  return { hashesPassed: hashes.every(Boolean), total, summaries, crossRdragProductMean: crossRdragProduct / total };
}

function normalReciprocalMoments(mean, sigma) {
  const lower = mean - 8 * sigma;
  const upper = mean + 8 * sigma;
  const intervals = 200000;
  const step = (upper - lower) / intervals;
  let one = 0;
  let two = 0;
  for (let i = 0; i <= intervals; i += 1) {
    const x = lower + i * step;
    const density = Math.exp(-0.5 * ((x - mean) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
    const coefficient = i === 0 || i === intervals ? 1 : i % 2 ? 4 : 2;
    one += coefficient * density / x;
    two += coefficient * density / (x * x);
  }
  return { inverseMean: one * step / 3, inverseSquareMean: two * step / 3 };
}

function bridge(group) {
  const local = SPEC.processing.localLadder;
  const inverse = normalReciprocalMoments(local.H0, local.sigma);
  const q = group.summaries.H0rdrag;
  const r = group.summaries.rdrag;
  const qSecond = q.sd ** 2 + q.mean ** 2;
  const rSecond = r.sd ** 2 + r.mean ** 2;
  const requiredMean = q.mean * inverse.inverseMean;
  const requiredVariance = qSecond * inverse.inverseSquareMean - requiredMean ** 2;
  const gapMean = r.mean - requiredMean;
  const gapSecond = rSecond + qSecond * inverse.inverseSquareMean - 2 * group.crossRdragProductMean * inverse.inverseMean;
  const gapVariance = gapSecond - gapMean ** 2;
  return { requiredMean, requiredSd: Math.sqrt(requiredVariance), gapMean, gapSd: Math.sqrt(gapVariance), gapZ: gapMean / Math.sqrt(gapVariance) };
}

function parseDovekie(item) {
  const file = path.join(CHAIN_DIR, item.localFilename);
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const header = lines[0].replace(/^#/, "").split("\t");
  const wanted = ["cosmological_parameters--omega_m", "cosmological_parameters--h0", "cosmological_parameters--w", "cosmological_parameters--wa", "log_weight"];
  const indices = wanted.map((name) => header.indexOf(name));
  const rows = [];
  let maximum = -Infinity;
  for (const line of lines.slice(1)) {
    if (!line || line.startsWith("#")) continue;
    const fields = line.split("\t");
    const values = indices.map((index) => Number(fields[index]));
    if (!Number.isFinite(values[4])) continue;
    maximum = Math.max(maximum, values[4]);
    rows.push(values);
  }
  const sums = [0, 0, 0, 0];
  let total = 0;
  let squareWeights = 0;
  for (const values of rows) {
    const weight = Math.exp(values[4] - maximum);
    total += weight;
    squareWeights += weight * weight;
    for (let i = 0; i < 4; i += 1) sums[i] += weight * values[i];
  }
  const means = sums.map((sum) => sum / total);
  means[1] *= 100;
  return { observedSha256: sha256(file), rows: rows.length, kishEss: total * total / squareWeights, means: { omegam: means[0], H0: means[1], w: means[2], wa: means[3] } };
}

const groups = {};
let maximumMeanDifference = 0;
let maximumSdDifference = 0;
let maximumBridgeMeanDifference = 0;
let maximumBridgeSdDifference = 0;
for (const definition of SPEC.eligibleGroups) {
  const aggregate = aggregateGroup(definition.id);
  const derived = bridge(aggregate);
  groups[definition.id] = { ...aggregate, bridge: derived };
  for (const parameter of PARAMETERS) {
    maximumMeanDifference = Math.max(maximumMeanDifference, Math.abs(aggregate.summaries[parameter].mean - PYTHON.groups[definition.id].summaries[parameter].mean));
    maximumSdDifference = Math.max(maximumSdDifference, Math.abs(aggregate.summaries[parameter].sd - PYTHON.groups[definition.id].summaries[parameter].sd));
  }
  maximumBridgeMeanDifference = Math.max(maximumBridgeMeanDifference, Math.abs(derived.requiredMean - PYTHON.groups[definition.id].summaries.rdragRequiredByLocal.mean), Math.abs(derived.gapMean - PYTHON.groups[definition.id].summaries.rdragPhysicalGap.mean));
  maximumBridgeSdDifference = Math.max(maximumBridgeSdDifference, Math.abs(derived.requiredSd - PYTHON.groups[definition.id].summaries.rdragRequiredByLocal.sd), Math.abs(derived.gapSd - PYTHON.groups[definition.id].summaries.rdragPhysicalGap.sd));
}

const dovekieItem = MANIFEST.files.find((item) => item.groupId === SPEC.externalStateCheck.id);
const dovekie = parseDovekie(dovekieItem);
const dovekieDifferences = Object.fromEntries(Object.entries(dovekie.means).map(([parameter, mean]) => [parameter, Math.abs(mean - PYTHON.dovekieCurrentReleaseCheck.summaries[parameter].mean)]));
const audit = {
  cycleId: SPEC.cycleId,
  implementation: "dependency-free Node weighted-moment and analytic independent-ladder bridge",
  groups,
  dovekie,
  comparison: {
    allOfficialHashesPassed: Object.values(groups).every((group) => group.hashesPassed),
    maximumPosteriorMeanAbsoluteDifference: maximumMeanDifference,
    maximumPosteriorSdAbsoluteDifference: maximumSdDifference,
    maximumBridgeMeanAbsoluteDifference: maximumBridgeMeanDifference,
    maximumBridgeSdAbsoluteDifference: maximumBridgeSdDifference,
    maximumDovekieMeanAbsoluteDifference: Math.max(...Object.values(dovekieDifferences)),
    posteriorMomentTolerance: 1e-6,
    bridgeMonteCarloToleranceMpc: 0.03,
    passed: maximumMeanDifference < 1e-6 && maximumSdDifference < 1e-6 && maximumBridgeMeanDifference < 0.03 && maximumBridgeSdDifference < 0.03 && Math.max(...Object.values(dovekieDifferences)) < 1e-9
  },
  claimBoundary: "The Node audit checks source hashes, retained-chain moments, and independent ladder algebra. It does not independently reproduce the survey likelihoods."
};
if (write) fs.writeFileSync(OUTPUT, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
