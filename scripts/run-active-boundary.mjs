import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/active-boundary/benchmark-spec.json"), "utf8"));
const resultPath = path.join(root, "research/active-boundary/benchmark-result.json");
const round = value => Number(value.toFixed(6));
const linspace = (start, end, count) => Array.from({ length: count }, (_, index) => start + (end - start) * index / (count - 1));
const base = x => 0.25 + 0.45 * x;
const residualClass = (value, x) => Math.abs(value - base(x)) > spec.detectionThreshold ? 1 : 0;

function worldValue(world, x) {
  if (world.type === "step") return Math.min(1, base(x) + (x >= world.boundary ? spec.jumpMagnitude : 0));
  return Math.min(1, base(x) + (Math.abs(x - world.center) <= world.width / 2 ? spec.jumpMagnitude : 0));
}

function uniformPoints() {
  return linspace(spec.domain[0], spec.domain[1], spec.budget);
}

function activePoints(world) {
  const points = linspace(spec.domain[0], spec.domain[1], 8);
  while (points.length < spec.budget) {
    points.sort((a, b) => a - b);
    const classified = points.map(x => ({ x, label: residualClass(worldValue(world, x), x) }));
    const transitions = [];
    for (let index = 0; index < classified.length - 1; index += 1) {
      if (classified[index].label !== classified[index + 1].label) transitions.push([classified[index].x, classified[index + 1].x]);
    }
    let interval;
    if (transitions.length) interval = transitions.sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]))[0];
    else {
      const gaps = points.slice(0, -1).map((value, index) => [value, points[index + 1]]);
      interval = gaps.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
    }
    points.push((interval[0] + interval[1]) / 2);
  }
  return [...new Set(points)].sort((a, b) => a - b);
}

function metrics(world, points) {
  const queried = points.map(x => ({ x, label: residualClass(worldValue(world, x), x) }));
  const detected = queried.some(item => item.label === 1);
  const gaps = points.slice(0, -1).map((x, index) => points[index + 1] - x);
  let bracketWidth = null;
  if (world.type === "step") {
    const left = queried.filter(item => item.label === 0 && item.x < world.boundary).at(-1);
    const right = queried.find(item => item.label === 1 && item.x >= world.boundary);
    if (left && right) bracketWidth = right.x - left.x;
  }
  return { detected, bracketWidth, worstGap: Math.max(...gaps) };
}

function summarize(worlds, strategy) {
  const rows = worlds.map(world => metrics(world, strategy === "uniform-16" ? uniformPoints() : activePoints(world)));
  const detected = rows.filter(item => item.detected).length;
  const brackets = rows.map(item => item.bracketWidth).filter(value => value !== null);
  return {
    strategy,
    worlds: rows.length,
    detectionRate: round(detected / rows.length),
    meanBoundaryBracket: brackets.length ? round(brackets.reduce((sum, value) => sum + value, 0) / brackets.length) : null,
    maximumBoundaryBracket: brackets.length ? round(Math.max(...brackets)) : null,
    meanWorstGap: round(rows.reduce((sum, item) => sum + item.worstGap, 0) / rows.length),
    maximumWorstGap: round(Math.max(...rows.map(item => item.worstGap)))
  };
}

const stepWorlds = linspace(spec.persistentStepBoundaries.minimum, spec.persistentStepBoundaries.maximum, spec.persistentStepBoundaries.count).map(boundary => ({ type: "step", boundary }));
const pocketWorlds = linspace(spec.transientPockets.minimumCenter, spec.transientPockets.maximumCenter, spec.transientPockets.count).map(center => ({ type: "pocket", center, width: spec.transientPockets.width }));
const stepResults = spec.strategies.map(item => summarize(stepWorlds, item.id));
const pocketResults = spec.strategies.map(item => summarize(pocketWorlds, item.id));
const uniformStep = stepResults.find(item => item.strategy === "uniform-16");
const activeStep = stepResults.find(item => item.strategy === "explore-8-refine-8");
const uniformPocket = pocketResults.find(item => item.strategy === "uniform-16");
const activePocket = pocketResults.find(item => item.strategy === "explore-8-refine-8");
const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: spec.reviewedOn,
  persistentStep: stepResults,
  transientPocket: pocketResults,
  findings: {
    activeImprovesPersistentBoundaryLocalization: activeStep.meanBoundaryBracket < uniformStep.meanBoundaryBracket,
    activeIncreasesGlobalWorstGap: activeStep.maximumWorstGap > uniformStep.maximumWorstGap,
    activeDoesNotDominateUniform: !(activeStep.meanBoundaryBracket < uniformStep.meanBoundaryBracket && activeStep.maximumWorstGap <= uniformStep.maximumWorstGap),
    pocketDetectionRemainsBelowGate: Math.min(uniformPocket.detectionRate, activePocket.detectionRate) < spec.gates.minimumDetectionRate,
    sameBudgetRequiresExplorationRefinementTradeoff: true
  },
  decision: "The explore-refine policy localizes a persistent step more sharply but increases the largest untested gap and does not reliably find narrow transient pockets. Reserve an explicit exploration quota and report localization and global worst-gap metrics together; do not claim universal information gain from active sampling."
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, resultPath)}`);
} else console.log(JSON.stringify(result, null, 2));

export { result };
