import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/smoothness/sealed-family-spec.json"), "utf8"));
const resultPath = path.join(root, "research/smoothness/sealed-family-result.json");
const round = value => Number(value.toFixed(6));
const grid = ({ minimum, maximum, step }) => {
  const values = [];
  for (let value = minimum; value <= maximum + 1e-10; value += step) values.push(round(value));
  return values;
};
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

function outcome(worldId, x) {
  const base = 0.25 + 0.45 * x;
  return Math.max(0, Math.min(1, base + (worldId === "hidden-phase-boundary" && x >= 0.72 ? 0.35 : 0)));
}

function fitLipschitz(points) {
  let fitted = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      fitted = Math.max(fitted, Math.abs(points[i].y - points[j].y) / Math.abs(points[i].x - points[j].x));
    }
  }
  return fitted;
}

function interval(points, x, lipschitz) {
  const lower = Math.max(0, ...points.map(point => point.y - lipschitz * Math.abs(x - point.x)));
  const upper = Math.min(1, ...points.map(point => point.y + lipschitz * Math.abs(x - point.x)));
  return { lower, upper };
}

function benchmark() {
  const developmentX = grid(spec.developmentGrid);
  const adjudicationX = grid(spec.sealedAdjudicationGrid);
  const scenarios = [];
  for (const world of spec.worlds) {
    const development = developmentX.map(x => ({ x, y: outcome(world.id, x) }));
    const fitted = fitLipschitz(development);
    for (const factor of spec.lipschitzSafetyFactors) {
      const used = fitted * factor;
      const adjudication = adjudicationX.map(x => {
        const bounds = interval(development, x, used);
        const truth = outcome(world.id, x);
        return { x, truth, ...bounds, covered: bounds.lower <= truth && truth <= bounds.upper };
      });
      const coverage = mean(adjudication.map(item => item.covered ? 1 : 0));
      const meanWidth = mean(adjudication.map(item => item.upper - item.lower));
      scenarios.push({
        worldId: world.id,
        safetyFactor: factor,
        fittedLipschitz: round(fitted),
        usedLipschitz: round(used),
        coverage: round(coverage),
        meanWidth: round(meanWidth),
        widthRatioToTenRunRandomized: round(meanWidth / spec.comparison.tenRunRandomizedRegionalWidth),
        maximumMiss: round(Math.max(0, ...adjudication.map(item => Math.max(item.lower - item.truth, item.truth - item.upper)))),
        passesGate: coverage >= spec.comparison.minimumCoverage && meanWidth < spec.comparison.maximumMeanWidth
      });
    }
  }
  return { developmentPoints: developmentX.length, adjudicationPoints: adjudicationX.length, scenarios };
}

const benchmarkResult = benchmark();
const smooth = benchmarkResult.scenarios.find(item => item.worldId === "globally-smooth" && item.safetyFactor === 1);
const boundary = benchmarkResult.scenarios.find(item => item.worldId === "hidden-phase-boundary" && item.safetyFactor === 2);
const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: spec.reviewedOn,
  ...benchmarkResult,
  findings: {
    developmentWorldsAreIndistinguishable: spec.worlds.every(world => grid(spec.developmentGrid).every(x => outcome(world.id, x) === outcome("globally-smooth", x))),
    smoothWorldBeatsTenRunWidthAndCovers: smooth.passesGate,
    doubledConstantStillMissesPhaseBoundary: boundary.coverage < spec.comparison.minimumCoverage,
    narrowBoundsDoNotCertifyTransfer: smooth.meanWidth === benchmarkResult.scenarios.find(item => item.worldId === "hidden-phase-boundary" && item.safetyFactor === 1).meanWidth
  },
  decision: "Do not use development-fit chemical smoothness for policy adjudication until a sealed external family attains at least 95% coverage. The same narrow interval is valid in the globally smooth world and invalid across an unseen phase boundary."
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, resultPath)}`);
} else {
  console.log(JSON.stringify(result, null, 2));
}

export { benchmark, result };
