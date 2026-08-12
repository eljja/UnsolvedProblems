import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/active-boundary/nist-label-acquisition-spec.json"), "utf8"));
const source = JSON.parse(fs.readFileSync(path.join(root, "research/external-audit/nist-vo2-2020/human-labels.json"), "utf8"));
const resultPath = path.join(root, "research/active-boundary/nist-label-acquisition-result.json");
const round = value => Number(value.toFixed(6));
const temperatures = [...new Set(source.records.map(row => row.temperatureC))].sort((a, b) => a - b);
const compositions = [...new Set(source.records.map(row => row.vanadiumAtomicPercent))].sort((a, b) => a - b);
const mode = values => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
};
const points = source.records.map(row => ({
  ...row,
  x: (row.vanadiumAtomicPercent - compositions[0]) / (compositions.at(-1) - compositions[0]),
  y: (row.temperatureC - temperatures[0]) / (temperatures.at(-1) - temperatures[0]),
  truth: mode([row.labels.HL3, row.labels.HL4, row.labels.HL5]),
  developmentDisagrees: row.labels.HL1 !== row.labels.HL2
}));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const byCoordinate = new Map(points.map(point => [`${point.vanadiumAtomicPercent}|${point.temperatureC}`, point]));
const boundaryIds = new Set(points.filter(point => {
  const xIndex = compositions.indexOf(point.vanadiumAtomicPercent);
  const yIndex = temperatures.indexOf(point.temperatureC);
  return [[xIndex - 1, yIndex], [xIndex + 1, yIndex], [xIndex, yIndex - 1], [xIndex, yIndex + 1]]
    .filter(([x, y]) => x >= 0 && x < compositions.length && y >= 0 && y < temperatures.length)
    .map(([x, y]) => byCoordinate.get(`${compositions[x]}|${temperatures[y]}`))
    .some(neighbor => neighbor.truth !== point.truth);
}).map(point => point.measurementId));

function hash32(text) {
  let value = 2166136261 ^ spec.seed;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function observe(point, replicate) {
  return hash32(`${replicate}|${point.measurementId}`) % 2 === 0 ? point.labels.HL1 : point.labels.HL2;
}

function farthestCandidate(selectedIds) {
  const selected = points.filter(point => selectedIds.has(point.measurementId));
  const candidates = points.filter(point => !selectedIds.has(point.measurementId));
  if (!selected.length) return candidates.sort((a, b) => a.measurementId - b.measurementId)[0];
  return candidates.map(candidate => ({ candidate, score: Math.min(...selected.map(point => distance(candidate, point))) }))
    .sort((a, b) => b.score - a.score || a.candidate.measurementId - b.candidate.measurementId)[0].candidate;
}

function frontierCandidate(selectedIds, observations) {
  const selected = points.filter(point => selectedIds.has(point.measurementId));
  const candidates = points.filter(point => !selectedIds.has(point.measurementId));
  return candidates.map(candidate => {
    const nearest = selected.map(point => ({ point, d: distance(candidate, point), label: observations.get(point.measurementId) }))
      .sort((a, b) => a.d - b.d || a.point.measurementId - b.point.measurementId);
    let frontier = 0;
    for (let left = 0; left < Math.min(6, nearest.length); left += 1) {
      for (let right = left + 1; right < Math.min(6, nearest.length); right += 1) {
        if (nearest[left].label !== nearest[right].label) frontier = Math.max(frontier, 1 / (nearest[left].d + nearest[right].d + 1e-9));
      }
    }
    const exploration = nearest[0].d;
    return { candidate, score: frontier ? frontier + 0.05 * exploration : exploration };
  }).sort((a, b) => b.score - a.score || a.candidate.measurementId - b.candidate.measurementId)[0].candidate;
}

function predict(point, selectedIds, observations) {
  const nearest = points.filter(candidate => selectedIds.has(candidate.measurementId))
    .map(candidate => ({ candidate, d: distance(point, candidate), label: observations.get(candidate.measurementId) }))
    .sort((a, b) => a.d - b.d || a.candidate.measurementId - b.candidate.measurementId)
    .slice(0, 3);
  if (nearest[0].d === 0) return nearest[0].label;
  const scores = new Map([[0, 0], [1, 0], [2, 0]]);
  for (const item of nearest) scores.set(item.label, scores.get(item.label) + 1 / Math.max(item.d, 1e-9));
  return [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function run(strategy, replicate) {
  const selectedIds = new Set();
  const observations = new Map();
  while (selectedIds.size < strategy.exploration) {
    const point = farthestCandidate(selectedIds);
    selectedIds.add(point.measurementId);
    observations.set(point.measurementId, observe(point, replicate));
  }
  while (selectedIds.size < spec.budget) {
    const point = frontierCandidate(selectedIds, observations);
    selectedIds.add(point.measurementId);
    observations.set(point.measurementId, observe(point, replicate));
  }
  const predictions = points.map(point => ({ point, predicted: predict(point, selectedIds, observations) }));
  const accuracy = subset => subset.filter(item => item.predicted === item.point.truth).length / subset.length;
  const recalls = [0, 1, 2].map(label => {
    const subset = predictions.filter(item => item.point.truth === label);
    return accuracy(subset);
  });
  const selected = points.filter(point => selectedIds.has(point.measurementId));
  return {
    accuracy: accuracy(predictions),
    boundaryAccuracy: accuracy(predictions.filter(item => boundaryIds.has(item.point.measurementId))),
    macroRecall: recalls.reduce((sum, value) => sum + value, 0) / recalls.length,
    maximumUnqueriedDistance: Math.max(...points.map(point => Math.min(...selected.map(query => distance(point, query))))),
    disagreementAcquisitionRate: selected.filter(point => point.developmentDisagrees).length / selected.length
  };
}

function summarize(strategy) {
  const runs = Array.from({ length: spec.replicates }, (_, replicate) => run(strategy, replicate));
  const mean = key => runs.reduce((sum, row) => sum + row[key], 0) / runs.length;
  const minimum = key => Math.min(...runs.map(row => row[key]));
  return {
    strategy: strategy.id,
    runs: runs.length,
    meanAccuracy: round(mean("accuracy")),
    minimumAccuracy: round(minimum("accuracy")),
    meanBoundaryAccuracy: round(mean("boundaryAccuracy")),
    minimumBoundaryAccuracy: round(minimum("boundaryAccuracy")),
    meanMacroRecall: round(mean("macroRecall")),
    minimumMacroRecall: round(minimum("macroRecall")),
    meanMaximumUnqueriedDistance: round(mean("maximumUnqueriedDistance")),
    maximumUnqueriedDistance: round(Math.max(...runs.map(row => row.maximumUnqueriedDistance))),
    meanDevelopmentDisagreementAcquisitionRate: round(mean("disagreementAcquisitionRate"))
  };
}

const strategies = spec.strategies.map(summarize);
function dominates(candidate, target) {
  const noWorse = candidate.meanAccuracy >= target.meanAccuracy
    && candidate.meanBoundaryAccuracy >= target.meanBoundaryAccuracy
    && candidate.meanMacroRecall >= target.meanMacroRecall
    && candidate.maximumUnqueriedDistance <= target.maximumUnqueriedDistance;
  const better = candidate.meanAccuracy > target.meanAccuracy
    || candidate.meanBoundaryAccuracy > target.meanBoundaryAccuracy
    || candidate.meanMacroRecall > target.meanMacroRecall
    || candidate.maximumUnqueriedDistance < target.maximumUnqueriedDistance;
  return noWorse && better;
}
const pareto = strategies.map(row => ({ strategy: row.strategy, dominatedBy: strategies.filter(candidate => candidate.strategy !== row.strategy && dominates(candidate, row)).map(candidate => candidate.strategy) }));
const uniform = strategies.find(row => row.strategy === "space-fill-16");
const hybrid = strategies.find(row => row.strategy === "space-fill-12-frontier-4");
const active = strategies.find(row => row.strategy === "space-fill-8-frontier-8");
const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: spec.reviewedOn,
  dataSplit: spec.labelSplit,
  grid: { points: points.length, boundaryPoints: boundaryIds.size, phaseCounts: Object.fromEntries([0, 1, 2].map(label => [label, points.filter(point => point.truth === label).length])) },
  strategies,
  pareto,
  findings: {
    developmentAndAdjudicationLabelsAreDisjoint: true,
    adaptivePoliciesDoNotUniformlyDominateSpaceFilling: pareto.find(row => row.strategy === uniform.strategy).dominatedBy.length === 0,
    hybridRetainsMaximumGapGate: hybrid.maximumUnqueriedDistance <= uniform.maximumUnqueriedDistance * spec.gates.maximumGapRatioToSpaceFill,
    aggressiveFrontierHasLargestCoverageRisk: active.maximumUnqueriedDistance >= Math.max(...strategies.map(row => row.maximumUnqueriedDistance)),
    hybridMeetsEveryMinimumRunGate: hybrid.minimumAccuracy >= spec.gates.minimumAccuracy && hybrid.minimumBoundaryAccuracy >= spec.gates.minimumBoundaryAccuracy && hybrid.minimumMacroRecall >= spec.gates.minimumMacroRecall,
    physicalRepeatabilityRemainsUntested: true
  },
  decision: "Use space-fill-12-frontier-4 as the preferred annotation-acquisition baseline for this grid: it passes every minimum-run accuracy gate and Pareto-dominates the aggressive 8+8 policy, while space-fill-16 retains the smallest global gap. The dataset supports annotation-noise research only; obtain replicate spectra before transferring the policy to physical experiment selection."
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, resultPath)}`);
} else console.log(JSON.stringify(result, null, 2));

export { result };
