#!/usr/bin/env node

/** Verify RC58 outcome-blind source screening, prospective design, and public-site wiring. */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "research", "reproducibility", name), "utf8"));

const contract = readJson("rc58-public-cohort-screen-contract.json");
const batteryLife = readJson("rc58-batterylife-v12-metadata-audit.json");
const farasis = readJson("rc58-farasis-metadata-audit.json");
const python = readJson("rc58-acquisition-design-python.json");
const node = readJson("rc58-acquisition-design-node.json");
const audit = readJson("rc58-public-cohort-screen-independent-audit.json");
const priorArt = readJson("rc58-orthogonal-expansion-prior-art.json");
const connectionEvidence = readJson("rc58-acquisition-sensor-connection-evidence.json");
const result = readJson("rc58-public-cohort-acquisition-cycle-result.json");

assert(contract.status === "sealed-after-source-discovery-before-any-confirmatory-analysis", "RC58 contract status changed");
assert(contract.eligibilityGate.minimumSameConditionCells === 36, "RC58 source-size gate must remain 36 cells");
assert(contract.prospectiveAcquisition.startingCells === 48, "RC58 prospective cohort must start with 48 cells");
assert(contract.sourceBoundary.batteryLifeV12.lifeLabelsOpened === 0, "BatteryLife life labels must remain unopened");
assert(contract.sourceBoundary.batteryLifeV12.processedCyclingFilesOpened === 0, "BatteryLife cycling payloads must remain unopened");
assert(contract.sourceBoundary.farasis.displayedOutcomeRowsBeforeBoundaryWasCorrected === 7, "Farasis boundary incident must remain explicit");
assert(contract.sourceBoundary.farasis.outcomeValuesRetained === false, "Farasis outcome values must not be retained in artifacts");

assert(batteryLife.status === "complete-no-new-eligible-public-target", "BatteryLife audit status changed");
assert(batteryLife.totals.mappedFiles === 1138, "BatteryLife mapped-file count changed");
assert(batteryLife.totals.conditionGroups === 587, "BatteryLife condition-group count changed");
assert(batteryLife.totals.datasets === 15, "BatteryLife dataset-prefix count changed");
assert(batteryLife.totals.groupsAtLeast36 === 1, "BatteryLife must have exactly one mapped group at or above 36");
const rwth = batteryLife.datasetSummary.find((item) => item.dataset === "RWTH");
const tongji = batteryLife.datasetSummary.find((item) => item.dataset === "Tongji");
const stanford = batteryLife.datasetSummary.find((item) => item.dataset === "Stanford");
assert(rwth?.maxGroupSize === 48, "RWTH condition size changed");
assert(tongji?.maxGroupSize === 26, "Tongji maximum group size changed");
assert(stanford?.files === 184 && stanford?.maxGroupSize === 6, "Stanford file-versus-condition distinction changed");
assert(batteryLife.outcomeBoundary.lifeLabelFilesOpened === 0 && batteryLife.outcomeBoundary.processedCyclingFilesOpened === 0, "BatteryLife outcome boundary changed");

assert(farasis.status === "size-gate-failed-and-confirmatory-boundary-contaminated", "Farasis adjudication status changed");
assert(farasis.metadataOnlyCounts.cells === 123 && farasis.metadataOnlyCounts.uniqueCellIds === 123, "Farasis cell count changed");
assert(farasis.metadataOnlyCounts.groups === 37 && farasis.metadataOnlyCounts.largestGroupSize === 23, "Farasis grouping count changed");
assert(farasis.metadataOnlyCounts.groupsAtLeast36 === 0, "Farasis must remain below the 36-cell gate");
assert(farasis.boundaryIncident.displayedOutcomeRows === 7 && farasis.boundaryIncident.valuesStoredInArtifacts === false, "Farasis incident accounting changed");
assert(farasis.decision.eligibleForConfirmation === false, "Farasis cannot be restored as an untouched target");

assert(python.attritionRows.length === 8 && node.attritionRows.length === 8, "Both implementations need eight attrition rows");
assert(python.equivalenceRows.length === 6 && node.equivalenceRows.length === 6, "Both implementations need six equivalence rows");
let maxProbabilityDifference = 0;
for (let index = 0; index < python.attritionRows.length; index += 1) {
  const primary = python.attritionRows[index];
  const independent = node.attritionRows[index];
  for (const key of ["dropoutProbability", "usableThreshold", "minimumStartingCellsFor95Percent"]) {
    assert(primary[key] === independent[key], `RC58 attrition row ${index} ${key} mismatch`);
  }
  for (const key of ["probabilityAtMinimum", "probabilityWith48StartingCells"]) {
    maxProbabilityDifference = Math.max(maxProbabilityDifference, Math.abs(primary[key] - independent[key]));
  }
}
for (let index = 0; index < python.equivalenceRows.length; index += 1) {
  const primary = python.equivalenceRows[index];
  const independent = node.equivalenceRows[index];
  for (const key of ["standardizedMargin", "targetPower", "oneSidedAlphaPerMetric", "minimumPerArmKnownVarianceNormal"]) {
    assert(primary[key] === independent[key], `RC58 equivalence row ${index} ${key} mismatch`);
  }
}
assert(maxProbabilityDifference <= 1e-12, `RC58 probability disagreement ${maxProbabilityDifference} exceeds tolerance`);
assert(Math.abs(python.principalDesign.at15PercentDropoutProbabilityAtLeast36 - 0.9782341849153835) <= 1e-12, "RC58 15%-dropout 36-cell probability changed");
assert(Math.abs(python.principalDesign.at20PercentDropoutProbabilityAtLeast24 - 0.9999992173512271) <= 1e-12, "RC58 20%-dropout 24-cell probability changed");
const planningFloor = python.equivalenceRows.find((item) => item.standardizedMargin === 0.75 && item.targetPower === 0.8);
assert(planningFloor?.oneSidedAlphaPerMetric === 0.0125 && planningFloor?.minimumPerArmKnownVarianceNormal === 45, "RC58 principal equivalence floor changed");
assert(node.outcomeValuesUsed === 0, "Independent design calculation must use no outcome values");

assert(audit.status === "pass-negative-public-target-positive-prospective-design", "RC58 independent adjudication status changed");
assert(audit.screenAdjudication.eligibleUntouchedPublicTargets === 0, "RC58 must expose zero eligible untouched targets");
assert(priorArt.status === "prior-art-bounded-no-novelty-claim", "RC58 must not make an unverified novelty claim");
assert(connectionEvidence.validationStatus.includes("remain untested"), "RC58 connection must preserve its untested boundaries");
assert(result.status === "complete-public-target-negative-prospective-acquisition-positive", "RC58 cycle result status changed");
assert(result.hypotheses["H58-0"].verdict === "rejected-for-screened-current-sources", "RC58 public-target hypothesis verdict changed");
assert(result.hypotheses["H58-1"].verdict === "supported-as-planning-sensitivity", "RC58 attrition-design verdict changed");
assert(result.hypotheses["H58-2"].verdict === "rejected", "RC58 small-sentinel equivalence verdict changed");
assert(result.hypotheses["H58-3"].verdict === "untested", "RC58 expansion-residual verdict changed");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 56 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox, { filename: file });
}
const cycle = sandbox.window.RESEARCH_CYCLES.find((item) => item.id === "RC-2026-58");
const connection = sandbox.window.RESEARCH_CONNECTIONS.find((item) => item.id === "CONN-EVIDENCE-031");
assert(sandbox.window.RESEARCH_CYCLES.length === 58, "Site must expose 58 research cycles");
assert(sandbox.window.RESEARCH_CONNECTIONS.length === 61, "Site must expose 61 structural connections");
assert(Object.keys(sandbox.window.CATALOG_SOURCES).length === 336, "Site must expose 336 catalog sources");
assert(cycle?.problemIds.join(",") === "UP-219,UP-233,UP-234,UP-572", "RC58 problem mapping changed");
assert(cycle?.verifiedFindings.length === 10, "RC58 must expose ten verified findings");
assert(cycle?.artifacts.length === 11, "RC58 must expose eleven research artifacts");
assert(connection?.problemIds.join(",") === cycle?.problemIds.join(","), "RC58 structural-connection mapping changed");
for (const problemId of cycle?.problemIds || []) {
  const problem = sandbox.window.PROBLEMS.find((item) => item.id === problemId);
  assert(problem?.cycleResearch?.cycleId === "RC-2026-58", `${problemId} must show RC58 as current research`);
  assert(problem?.cycleResearch?.updatedDefinition?.text && problem?.cycleResearch?.updatedDefinition?.textEn, `${problemId} needs a bilingual updated definition`);
  assert(problem?.cycleResearch?.causalChain?.length === 5, `${problemId} needs a five-link problem-specific causal chain`);
  assert(problem?.cycleResearch?.causalChain?.every((item) => item.code && item.title?.text && item.title?.textEn && item.claim?.text && item.claim?.textEn && item.failure?.text && item.failure?.textEn), `${problemId} RC58 causal links must render in both languages`);
  assert(problem?.cycleResearch?.workPackages?.length === 5, `${problemId} needs five RC58 work packages`);
  assert(problem?.cycleResearch?.uncertaintyBudget?.length === 8, `${problemId} needs eight RC58 uncertainty entries`);
  assert(problem?.cycleResearch?.uncertaintyBudget?.every((item) => item.code && item.source?.text && item.source?.textEn && item.control?.text && item.control?.textEn && item.threshold?.text && item.threshold?.textEn), `${problemId} RC58 uncertainty entries must render in both languages`);
  assert(problem?.cycleResearch?.decisionTree?.length === 6, `${problemId} needs six RC58 decision branches`);
  assert(problem?.cycleResearch?.decisionTree?.every((item) => item.condition?.text && item.condition?.textEn && item.action?.text && item.action?.textEn && item.meaning?.text && item.meaning?.textEn), `${problemId} RC58 decision branches must render in both languages`);
}
assert(sandbox.window.CATALOG_SOURCES.batterylife_kdd_2025?.url === "https://doi.org/10.1145/3711896.3737372", "BatteryLife primary source missing");
assert(sandbox.window.CATALOG_SOURCES.farasis_discovery_2026?.publishedOn === "2026-02-04", "Farasis publication date missing");
assert(sandbox.window.CATALOG_SOURCES.stack_pressure_dilatometry_2026?.url === "https://doi.org/10.1038/s41560-026-02087-6", "Pressure-dilatometry primary source missing");

for (const page of ["index.html", "solve.html", "research-log.html"]) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  assert(html.includes("research-cycle-58-data.js?v=20260829-cycle58"), `${page} must load RC58 data`);
}
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
assert(readme.includes("65개 누적 연구 사이클"), "README cycle count must include RC65");
assert(readme.includes("210개 사이클 기록"), "README record count must include RC65");
assert(readme.includes("68개 구조적 연결"), "README connection count must include RC65");
assert(readme.includes("367개 기관·로드맵·원 연구 출처"), "README source count must include RC65");
const publicCopy = fs.readFileSync(path.join(ROOT, "research-cycle-58-data.js"), "utf8");
for (const prohibited of ["전공자 포인트", "1단계 · 처음 읽는 사람", "2단계 · 전공자 핵심", "개수를 맞추지"]) {
  assert(!publicCopy.includes(prohibited), `RC58 public copy contains prohibited phrase: ${prohibited}`);
}

const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
assert(sitemap.includes("cycle=RC-2026-58&amp;lang=ko"), "Sitemap missing Korean RC58 URL");
assert(sitemap.includes("cycle=RC-2026-58&amp;lang=en"), "Sitemap missing English RC58 URL");

if (failures.length) {
  console.error(`RC58 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`RC58 verification passed: zero eligible untouched public targets, 48 prospective starts, n36@15%=0.978234, n24@20%=0.999999, equivalence floor 45/arm, max |Δp|=${maxProbabilityDifference.toExponential(4)}.`);
