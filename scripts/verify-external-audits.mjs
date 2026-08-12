import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plos = JSON.parse(fs.readFileSync(path.join(root, "research/external-audit/plos-followup-2019/audit-result.json"), "utf8"));
const nist = JSON.parse(fs.readFileSync(path.join(root, "research/external-audit/nist-vo2-2020/audit-result.json"), "utf8"));
const labels = JSON.parse(fs.readFileSync(path.join(root, "research/external-audit/nist-vo2-2020/human-labels.json"), "utf8"));
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/active-boundary/nist-label-acquisition-spec.json"), "utf8"));
const benchmark = JSON.parse(fs.readFileSync(path.join(root, "research/active-boundary/nist-label-acquisition-result.json"), "utf8"));
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const near = (actual, expected, tolerance = 1e-6) => Math.abs(actual - expected) <= tolerance;

assert(plos.auditId === "PLOS-FOLLOWUP-PUBLIC-DATA-2019-0.1", "PLOS audit must retain its stable ID");
assert(plos.workbook.records === 728 && plos.workbook.uniquePatientIds === 728, "PLOS audit must reconcile 728 unique records");
assert(JSON.stringify(plos.workbook.randomizedGroupCounts) === JSON.stringify({ 1: 183, 2: 187, 3: 358 }), "PLOS randomized and validation groups must reconcile");
assert(plos.fieldCoverage.healthStatus === 639 && plos.fieldCoverage.deathStatus === 728, "PLOS field denominators must be preserved");
const pooled = plos.externalMortalityCalibration.find(row => row.label === "all");
const validation = plos.externalMortalityCalibration.find(row => row.label === "group-3");
assert(near(pooled.aliveToDeadResponseOddsRatio, 106.29108), "pooled mortality-specific health-availability odds must reproduce");
assert(near(pooled.simultaneous95UpperGamma, 499.530168), "pooled simultaneous Gamma upper bound must reproduce");
assert(validation.aliveToDeadResponseOddsRatio === "unbounded" && validation.deadHealthObserved === 0, "validation stratum must retain zero health availability among deaths");
assert(plos.targetDesignAudit.initialNonrespondentFramePresent === false && plos.targetDesignAudit.invitationProbabilityPresent === false, "PLOS audit must refuse the absent two-phase frame and invitation probability");
assert(Object.values(plos.findings).every(Boolean), "every PLOS public-data finding must be true");

assert(nist.auditId === "NIST-VO2-LABEL-GRID-0.1", "NIST audit must retain its stable ID");
assert(labels.records.length === 192 && nist.grid.completeRectangularGrid, "NIST label extraction must preserve the complete 192-point grid");
assert(new Set(labels.records.map(row => row.temperatureC)).size === 8 && new Set(labels.records.map(row => row.vanadiumAtomicPercent)).size === 24, "NIST grid axes must preserve 8 temperatures and 24 compositions");
assert(nist.uncertainty.nonUnanimousPoints === 73 && nist.uncertainty.independentAdjudicationBoundaryPoints === 49, "NIST disagreement and boundary denominators must reproduce");
assert(nist.targetDesignAudit.repeatedPhysicalMeasurementsAtSameCoordinatePresent === false, "NIST audit must refuse physical-repeatability claims");
assert(Object.values(nist.findings).every(Boolean), "every NIST label-grid finding must be true");

assert(benchmark.benchmarkId === spec.benchmarkId, "NIST acquisition result must match its specification");
assert(benchmark.strategies.every(row => row.runs === 400), "all NIST acquisition strategies must retain 400 runs");
const uniform = benchmark.strategies.find(row => row.strategy === "space-fill-16");
const active = benchmark.strategies.find(row => row.strategy === "space-fill-8-frontier-8");
const hybrid = benchmark.strategies.find(row => row.strategy === "space-fill-12-frontier-4");
assert(hybrid.meanAccuracy > uniform.meanAccuracy && hybrid.meanBoundaryAccuracy > uniform.meanBoundaryAccuracy, "hybrid must improve mean independent-adjudication accuracy over space filling");
assert(hybrid.minimumAccuracy >= spec.gates.minimumAccuracy && hybrid.minimumBoundaryAccuracy >= spec.gates.minimumBoundaryAccuracy && hybrid.minimumMacroRecall >= spec.gates.minimumMacroRecall, "hybrid must pass every minimum-run accuracy gate");
assert(hybrid.maximumUnqueriedDistance <= uniform.maximumUnqueriedDistance * spec.gates.maximumGapRatioToSpaceFill, "hybrid must pass the global-gap ratio gate");
assert(benchmark.pareto.find(row => row.strategy === active.strategy).dominatedBy.includes(hybrid.strategy), "hybrid must Pareto-dominate aggressive 8+8");
assert(benchmark.pareto.find(row => row.strategy === uniform.strategy).dominatedBy.length === 0, "space filling must remain non-dominated on global coverage");
assert(Object.values(benchmark.findings).every(Boolean), "every NIST acquisition finding must be true");

if (failures.length) {
  console.error(`External-audit verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("External-audit verification passed: public denominators, Gamma refusal, label split, and real-grid acquisition tradeoffs are consistent.");
