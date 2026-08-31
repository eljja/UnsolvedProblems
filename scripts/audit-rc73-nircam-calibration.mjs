import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(root, "research/reproducibility/rc73-nircam-calibration-result.json");
const output = path.join(root, "research/reproducibility/rc73-nircam-calibration-node-audit.json");
const write = process.argv.includes("--write");

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function metrics(rows) {
  const values = rows.map(row => row.fluxDnPerSecond.r5);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const med = median(values);
  const robust = 1.4826 * median(values.map(value => Math.abs(value - med))) / med;
  const max = Math.max(...values.map(value => Math.abs(value / mean - 1)));
  return {
    n: values.length,
    robustSigmaFraction: robust,
    maxAbsDeviationFraction: max,
    normalizedByPattern: Object.fromEntries(
      rows.map((row, index) => [String(row.patternNumber), values[index] / mean])
    )
  };
}

const source = JSON.parse(fs.readFileSync(input, "utf8"));
const groupedRows = new Map();
for (const row of source.measurements) {
  const key = `${row.target}|${row.detector}|${row.filter}`;
  if (!groupedRows.has(key)) groupedRows.set(key, []);
  groupedRows.get(key).push(row);
}
const groups = Object.fromEntries([...groupedRows].map(([key, rows]) => [key, metrics(rows)]));
const matched = {};
for (const filter of ["F090W", "F150W"]) {
  const left = groups[`WDFS0458-56|NRCB1|${filter}`].normalizedByPattern;
  const right = groups[`WDFS0122-30|NRCB1|${filter}`].normalizedByPattern;
  matched[filter] = Math.max(...Object.keys(left).map(key => Math.abs(left[key] - right[key])));
}
const decision = {
  supportFourOfFourPerGroup: Object.values(groups).every(group => group.n === 4),
  zeroDoNotUsePixelsWithinR3: source.measurements.every(row => row.badDoNotUsePixelsR3 === 0),
  maxRobustSigmaAtMostOnePercent: Math.max(...Object.values(groups).map(group => group.robustSigmaFraction)) <= 0.01,
  maxDitherExcursionAtMostTwoPercent: Math.max(...Object.values(groups).map(group => group.maxAbsDeviationFraction)) <= 0.02,
  matchedNrcb1PatternDifferenceAtMostOnePercent: Math.max(...Object.values(matched)) <= 0.01
};
decision.localMeasurementOperatorQualified = Object.values(decision).every(Boolean);

const tolerance = 1e-12;
const differences = [];
for (const [key, group] of Object.entries(groups)) {
  differences.push(Math.abs(group.robustSigmaFraction - source.groups[key].r5.robustSigmaFraction));
  differences.push(Math.abs(group.maxAbsDeviationFraction - source.groups[key].r5.maxAbsDeviationFraction));
}
for (const filter of Object.keys(matched)) {
  differences.push(Math.abs(matched[filter] - source.matchedNrcb1Replication[filter].maxAbsNormalizedDifference));
}
const result = {
  cycle: source.cycle,
  runtime: `Node ${process.version}`,
  input: path.relative(root, input).replaceAll("\\", "/"),
  algorithm: "Independent JavaScript regrouping and recomputation from the frozen per-exposure r=5 measurements",
  groups,
  matchedNrcb1MaximumDifference: matched,
  decision,
  maximumAbsoluteMetricDifferenceFromPython: Math.max(...differences),
  tolerance,
  reproduced: Math.max(...differences) <= tolerance && JSON.stringify(decision) === JSON.stringify(source.decision)
};
if (write) fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
