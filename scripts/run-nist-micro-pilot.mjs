import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/nist-micro-pilot-spec.json"), "utf8"));
const source = JSON.parse(fs.readFileSync(path.join(root, "research/external-audit/nist-vo2-2020/human-labels.json"), "utf8"));
const resultPath = path.join(root, "research/reproducibility/nist-micro-pilot-result.json");
const round = value => Number(value.toFixed(6));
const mode = values => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
};

const temperatures = [...new Set(source.records.map(row => row.temperatureC))].sort((a, b) => a - b);
const compositions = [...new Set(source.records.map(row => row.vanadiumAtomicPercent))].sort((a, b) => a - b);
const points = source.records.map(row => ({
  measurementId: row.measurementId,
  composition: row.vanadiumAtomicPercent,
  temperature: row.temperatureC,
  development: [row.labels.HL1, row.labels.HL2],
  developmentConsensus: row.labels.HL1 === row.labels.HL2 ? row.labels.HL1 : null,
  x: (row.vanadiumAtomicPercent - compositions[0]) / (compositions.at(-1) - compositions[0]),
  y: (row.temperatureC - temperatures[0]) / (temperatures.at(-1) - temperatures[0]),
  adjudicated: mode([row.labels.HL3, row.labels.HL4, row.labels.HL5])
}));
const key = (x, y) => `${x}|${y}`;
const pointByCoordinate = new Map(points.map(point => [key(point.composition, point.temperature), point]));
const neighbors = point => {
  const xi = compositions.indexOf(point.composition);
  const yi = temperatures.indexOf(point.temperature);
  return [[xi - 1, yi], [xi + 1, yi], [xi, yi - 1], [xi, yi + 1]]
    .filter(([x, y]) => x >= 0 && x < compositions.length && y >= 0 && y < temperatures.length)
    .map(([x, y]) => pointByCoordinate.get(key(compositions[x], temperatures[y])));
};
const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
const labelSet = point => new Set(point.development);
const developmentTransition = point => neighbors(point).some(neighbor => [...labelSet(point)].some(label => !labelSet(neighbor).has(label)) || [...labelSet(neighbor)].some(label => !labelSet(point).has(label)));
const developmentFrontier = point => point.developmentConsensus === null || developmentTransition(point) || neighbors(point).some(neighbor => neighbor.developmentConsensus === null);
const truthBoundary = point => neighbors(point).some(neighbor => neighbor.adjudicated !== point.adjudicated);

function frontierPriority(point) {
  const disagreement = point.developmentConsensus === null ? 1 : 0;
  const neighborDisagreement = neighbors(point).filter(neighbor => neighbor.developmentConsensus === null).length;
  const transition = developmentTransition(point) ? 1 : 0;
  return 20 * disagreement + 4 * neighborDisagreement + 3 * transition;
}

function orderedSelection(pool, count, priority, seedTemperatures = true) {
  const selected = [];
  if (seedTemperatures) {
    for (const temperature of temperatures) {
      const candidates = pool.filter(point => point.temperature === temperature && !selected.includes(point));
      if (!candidates.length || selected.length >= count) continue;
      candidates.sort((a, b) => priority(b) - priority(a) || a.measurementId - b.measurementId);
      selected.push(candidates[0]);
    }
  }
  while (selected.length < count) {
    const candidates = pool.filter(point => !selected.includes(point));
    const ranked = candidates.map(point => ({
      point,
      score: priority(point) + (selected.length ? 2 * Math.min(...selected.map(chosen => distance(point, chosen))) : 0)
    })).sort((a, b) => b.score - a.score || a.point.measurementId - b.point.measurementId);
    if (!ranked.length) throw new Error(`Insufficient candidates for ${count}-point selection`);
    selected.push(ranked[0].point);
  }
  return selected;
}

const frontierPool = points.filter(developmentFrontier);
const controlPool = points.filter(point => !developmentFrontier(point) && point.developmentConsensus !== null);
const frontierOrder = orderedSelection(frontierPool, 16, frontierPriority);
const controlOrder = orderedSelection(controlPool, 16, point => {
  const phaseRarity = 1 / controlPool.filter(candidate => candidate.developmentConsensus === point.developmentConsensus).length;
  const interiorDepth = Math.min(...frontierPool.map(frontier => distance(point, frontier)));
  return 10 * interiorDepth + 5 * phaseRarity;
});

function exactZeroFailureUpper(n, alpha = 0.05) {
  return 1 - Math.pow(alpha, 1 / n);
}
const minimumZeroFailureControls = Math.ceil(Math.log(spec.controlGate.confidence ? 1 - spec.controlGate.confidence : 0.05) / Math.log(1 - spec.controlGate.targetUpperRate));

function physicalDesign(budget, design) {
  const p = design.preparationsPerCoordinate;
  const c = design.conditionsPerPreparation;
  const r = design.technicalRepeatsPerCondition;
  const preparationDf = budget * Math.max(0, p - 1);
  const preparationConditionDf = budget * p * Math.max(0, c - 1);
  const residualDf = budget * p * c * Math.max(0, r - 1);
  const relativeSe = df => df ? round(Math.sqrt(2 / df)) : null;
  return {
    id: design.id,
    acquisitions: budget * p * c * r,
    preparationVarianceIdentifiable: p >= 2,
    conditionMainContrastIdentifiable: c >= 2,
    generalizedConditionVarianceIdentifiable: false,
    approximateDegreesOfFreedom: { preparation: preparationDf, preparationByCondition: preparationConditionDf, technicalResidual: residualDf },
    bestCaseVarianceRelativeStandardError: {
      preparation: relativeSe(preparationDf),
      preparationByCondition: relativeSe(preparationConditionDf),
      technicalResidual: relativeSe(residualDf)
    }
  };
}

function summarizeBudget(budget) {
  const each = budget / 2;
  const frontier = frontierOrder.slice(0, each);
  const controls = controlOrder.slice(0, each);
  const selected = [...frontier, ...controls];
  const allTemperatures = new Set(selected.map(point => point.temperature));
  const trueBoundary = frontier.filter(truthBoundary).length;
  const trueInteriorControls = controls.filter(point => !truthBoundary(point)).length;
  const maxGap = Math.max(...points.map(point => Math.min(...selected.map(chosen => distance(point, chosen)))));
  return {
    budget,
    frontierCoordinates: frontier.map(({ measurementId, composition, temperature, development }) => ({ measurementId, vanadiumAtomicPercent: composition, temperatureC: temperature, developmentLabels: development })),
    controlCoordinates: controls.map(({ measurementId, composition, temperature, developmentConsensus }) => ({ measurementId, vanadiumAtomicPercent: composition, temperatureC: temperature, developmentLabel: developmentConsensus })),
    retrospectiveAdjudication: {
      frontierTrueBoundaryCount: trueBoundary,
      frontierTrueBoundaryRate: round(trueBoundary / frontier.length),
      controlTrueInteriorCount: trueInteriorControls,
      controlTrueInteriorRate: round(trueInteriorControls / controls.length),
      adjudicatedPhaseCounts: Object.fromEntries([0, 1, 2].map(label => [label, selected.filter(point => point.adjudicated === label).length]))
    },
    coverage: {
      temperatureLevels: allTemperatures.size,
      allTemperatureLevelsCovered: allTemperatures.size === temperatures.length,
      maximumNormalizedGridDistance: round(maxGap)
    },
    binaryControlGate: {
      independentControlCoordinates: controls.length,
      upperRateIfZeroFailures: round(exactZeroFailureUpper(controls.length)),
      canEstablishRateBelowPointOneWithZeroFailures: controls.length >= minimumZeroFailureControls
    },
    physicalDesigns: spec.physicalDesigns.map(design => physicalDesign(budget, design))
  };
}

const budgets = spec.candidateBudgets.map(summarizeBudget);
const budget24Ids = new Set([...budgets[0].frontierCoordinates, ...budgets[0].controlCoordinates].map(point => point.measurementId));
const budget32Ids = new Set([...budgets[1].frontierCoordinates, ...budgets[1].controlCoordinates].map(point => point.measurementId));
const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: spec.reviewedOn,
  grid: { points: points.length, temperatures: temperatures.length, compositions: compositions.length, developmentFrontierCandidates: frontierPool.length, developmentInteriorCandidates: controlPool.length },
  dataSeparation: {
    selectionInputs: spec.labelSplit.selection,
    heldOutLabels: spec.labelSplit.independentRetrospectiveAdjudication,
    selectionFunctionReadsHeldOutLabels: false
  },
  budgets,
  exactControlGate: {
    targetUpperRate: spec.controlGate.targetUpperRate,
    confidence: spec.controlGate.confidence,
    minimumIndependentControlsWithZeroFailures: minimumZeroFailureControls,
    implication: "Neither micro-pilot can confirm a control discordance rate below 0.10; that binary gate belongs to the expanded study."
  },
  findings: {
    twentyFourIsNestedInThirtyTwo: [...budget24Ids].every(id => budget32Ids.has(id)),
    onePreparationCannotIdentifyPreparationVariance: budgets.every(row => row.physicalDesigns.find(item => item.id === "one-preparation").preparationVarianceIdentifiable === false),
    twoPreparationsRestorePreparationContrast: budgets.every(row => row.physicalDesigns.find(item => item.id === "two-preparation").preparationVarianceIdentifiable === true),
    thirtyTwoTwoPreparationAcquisitions: budgets.find(row => row.budget === 32).physicalDesigns.find(item => item.id === "two-preparation").acquisitions === 256,
    allTemperaturesCovered: budgets.every(row => row.coverage.allTemperatureLevelsCovered),
    binaryGateDeferred: budgets.every(row => row.binaryControlGate.canEstablishRateBelowPointOneWithZeroFailures === false)
  },
  decision: "Use the nested 32-coordinate, two-preparation design (16 development-frontier and 16 interior controls; 256 acquisitions) as a variance-identification pilot. Treat the 24-coordinate/192-acquisition prefix as an operational checkpoint only. The former 98-coordinate one-preparation/392-acquisition plan cannot estimate preparation variance. Use continuous diffraction observables for the micro-pilot and defer the binary 0.10 control-rate claim until at least 29 independent controls are available even if no failures occur."
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, resultPath)}`);
} else console.log(JSON.stringify(result, null, 2));

export { result };
