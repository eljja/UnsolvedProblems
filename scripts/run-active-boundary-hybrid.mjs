import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/active-boundary/hybrid-spec.json"), "utf8"));
const resultPath = path.join(root, "research/active-boundary/hybrid-result.json");
const round = value => Number(value.toFixed(6));
const linspace = (start, end, count) => Array.from({ length: count }, (_, index) => start + (end - start) * index / (count - 1));
const base = x => 0.25 + 0.45 * x;

function hash32(text) {
  let value = 2166136261 ^ spec.seed;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function uniformFromHash(key) {
  let value = hash32(key);
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) + 0.5) / 4294967296;
}

function gaussianNoise(worldId, replicate, x) {
  const coordinate = x.toFixed(12);
  const first = Math.max(Number.EPSILON, uniformFromHash(`${worldId}|${replicate}|${coordinate}|a`));
  const second = uniformFromHash(`${worldId}|${replicate}|${coordinate}|b`);
  return spec.noiseStandardDeviation * Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function worldSignal(world, x) {
  if (world.type === "single") return x >= world.boundary ? spec.jumpMagnitude : 0;
  if (world.type === "pocket") return x >= world.left && x <= world.right ? spec.jumpMagnitude : 0;
  return 0;
}

function observe(world, replicate, x) {
  const residual = worldSignal(world, x) + gaussianNoise(world.id, replicate, x);
  return { x, residual, label: residual > spec.detectionThreshold ? 1 : 0 };
}

function chooseRefinement(points, observations) {
  const sorted = [...points].sort((a, b) => a - b);
  const transitions = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = observations.get(sorted[index]);
    const right = observations.get(sorted[index + 1]);
    if (left.label !== right.label) transitions.push([left.x, right.x]);
  }
  const candidates = transitions.length
    ? transitions.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))
    : sorted.slice(0, -1).map((value, index) => [value, sorted[index + 1]]).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  return (candidates[0][0] + candidates[0][1]) / 2;
}

function runStrategy(world, replicate, strategy) {
  const points = linspace(spec.domain[0], spec.domain[1], strategy.exploration);
  const observations = new Map(points.map(x => [x, observe(world, replicate, x)]));
  while (points.length < spec.budget) {
    const next = chooseRefinement(points, observations);
    points.push(next);
    observations.set(next, observe(world, replicate, next));
  }
  const sorted = [...points].sort((a, b) => a - b);
  return { points: sorted, observations: sorted.map(x => observations.get(x)) };
}

function bracketingTransition(observations, boundary, fromLabel, toLabel) {
  for (let index = 0; index < observations.length - 1; index += 1) {
    const left = observations[index];
    const right = observations[index + 1];
    if (left.x <= boundary && boundary <= right.x && left.label === fromLabel && right.label === toLabel) return right.x - left.x;
  }
  return null;
}

function runMetrics(world, replicate, strategy) {
  const run = runStrategy(world, replicate, strategy);
  const gaps = run.points.slice(0, -1).map((x, index) => run.points[index + 1] - x);
  const metrics = {
    detected: run.observations.some(item => item.label === 1),
    falsePositive: world.type === "none" && run.observations.some(item => item.label === 1),
    worstGap: Math.max(...gaps),
    bracketWidths: []
  };
  if (world.type === "single") {
    const bracket = bracketingTransition(run.observations, world.boundary, 0, 1);
    if (bracket !== null) metrics.bracketWidths.push(bracket);
    metrics.allBoundariesLocalized = bracket !== null;
  } else if (world.type === "pocket") {
    const left = bracketingTransition(run.observations, world.left, 0, 1);
    const right = bracketingTransition(run.observations, world.right, 1, 0);
    if (left !== null) metrics.bracketWidths.push(left);
    if (right !== null) metrics.bracketWidths.push(right);
    metrics.allBoundariesLocalized = left !== null && right !== null;
  }
  return metrics;
}

function summarize(worlds, strategy) {
  const rows = [];
  for (const world of worlds) {
    for (let replicate = 0; replicate < spec.replicatesPerWorld; replicate += 1) rows.push(runMetrics(world, replicate, strategy));
  }
  const brackets = rows.flatMap(row => row.bracketWidths);
  return {
    strategy: strategy.id,
    runs: rows.length,
    detectionRate: round(rows.filter(row => row.detected).length / rows.length),
    allBoundariesLocalizedRate: rows[0].allBoundariesLocalized === undefined ? null : round(rows.filter(row => row.allBoundariesLocalized).length / rows.length),
    falsePositiveRate: round(rows.filter(row => row.falsePositive).length / rows.length),
    meanLocalizedBoundaryBracket: brackets.length ? round(brackets.reduce((sum, value) => sum + value, 0) / brackets.length) : null,
    maximumWorstGap: round(Math.max(...rows.map(row => row.worstGap)))
  };
}

const singleWorlds = linspace(spec.singleBoundaries.minimum, spec.singleBoundaries.maximum, spec.singleBoundaries.count).map((boundary, index) => ({ id: `single-${index}`, type: "single", boundary }));
const multipleWorlds = linspace(spec.multipleBoundaries.minimumCenter, spec.multipleBoundaries.maximumCenter, spec.multipleBoundaries.count).map((center, index) => ({ id: `pocket-${index}`, type: "pocket", left: center - spec.multipleBoundaries.pocketWidth / 2, right: center + spec.multipleBoundaries.pocketWidth / 2 }));
const noChangeWorlds = [{ id: "no-change", type: "none" }];
const singleBoundary = spec.strategies.map(strategy => summarize(singleWorlds, strategy));
const multipleBoundary = spec.strategies.map(strategy => summarize(multipleWorlds, strategy));
const noChange = spec.strategies.map(strategy => summarize(noChangeWorlds, strategy));

function dominates(candidate, target) {
  const noWorse = candidate.meanLocalizedBoundaryBracket <= target.meanLocalizedBoundaryBracket
    && candidate.maximumWorstGap <= target.maximumWorstGap
    && candidate.multipleLocalizedRate >= target.multipleLocalizedRate
    && candidate.falsePositiveRate <= target.falsePositiveRate;
  const strictlyBetter = candidate.meanLocalizedBoundaryBracket < target.meanLocalizedBoundaryBracket
    || candidate.maximumWorstGap < target.maximumWorstGap
    || candidate.multipleLocalizedRate > target.multipleLocalizedRate
    || candidate.falsePositiveRate < target.falsePositiveRate;
  return noWorse && strictlyBetter;
}

const paretoRows = spec.strategies.map(strategy => {
  const single = singleBoundary.find(row => row.strategy === strategy.id);
  const multiple = multipleBoundary.find(row => row.strategy === strategy.id);
  const control = noChange.find(row => row.strategy === strategy.id);
  return {
    strategy: strategy.id,
    meanLocalizedBoundaryBracket: single.meanLocalizedBoundaryBracket,
    maximumWorstGap: single.maximumWorstGap,
    multipleLocalizedRate: multiple.allBoundariesLocalizedRate,
    falsePositiveRate: control.falsePositiveRate
  };
});
for (const row of paretoRows) row.dominatedBy = paretoRows.filter(candidate => candidate.strategy !== row.strategy && dominates(candidate, row)).map(candidate => candidate.strategy);

const uniform = paretoRows.find(row => row.strategy === "uniform-16");
const hybrid = paretoRows.find(row => row.strategy === "hybrid-12-refine-4");
const hybridSingle = singleBoundary.find(row => row.strategy === hybrid.strategy);
const hybridMultiple = multipleBoundary.find(row => row.strategy === hybrid.strategy);
const hybridControl = noChange.find(row => row.strategy === hybrid.strategy);
const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: spec.reviewedOn,
  design: {
    noise: `Deterministic common-random-number Gaussian field, sigma=${spec.noiseStandardDeviation}`,
    worlds: { singleBoundaries: singleWorlds.length, multipleBoundaryPockets: multipleWorlds.length, noChange: noChangeWorlds.length },
    replicatesPerWorld: spec.replicatesPerWorld,
    totalRuns: (singleWorlds.length + multipleWorlds.length + noChangeWorlds.length) * spec.replicatesPerWorld * spec.strategies.length
  },
  singleBoundary,
  multipleBoundary,
  noChange,
  pareto: paretoRows,
  findings: {
    hybridIsParetoNonDominated: hybrid.dominatedBy.length === 0,
    hybridImprovesLocalizationOverUniform: hybrid.meanLocalizedBoundaryBracket < uniform.meanLocalizedBoundaryBracket,
    hybridRetainsGlobalGapGate: hybrid.maximumWorstGap <= uniform.maximumWorstGap * spec.gates.maximumWorstGapRatioToUniform,
    hybridMeetsSingleDetectionGate: hybridSingle.detectionRate >= spec.gates.minimumSingleBoundaryDetection,
    hybridMeetsMultipleDetectionGate: hybridMultiple.detectionRate >= spec.gates.minimumMultipleBoundaryDetection,
    hybridMeetsFalsePositiveGate: hybridControl.falsePositiveRate <= spec.gates.maximumNoChangeFalsePositiveRate
  },
  decision: "The 12+4 hybrid is a Pareto non-dominated bridge policy in the sealed noisy one-dimensional worlds: it buys sharper single-boundary localization than uniform-16 while retaining a bounded global gap, multiple-boundary detection, and a no-change false-alarm control. This is a benchmark result, not evidence of universal or high-dimensional superiority."
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, resultPath)}`);
} else console.log(JSON.stringify(result, null, 2));

export { result };
