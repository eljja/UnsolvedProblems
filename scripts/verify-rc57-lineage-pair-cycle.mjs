#!/usr/bin/env node

/** Verify RC57 source boundary, exact pair design, independent replay, and site wiring. */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "research", "reproducibility", name), "utf8"));
const contract = readJson("rc57-lineage-pair-design-contract.json");
const lineage = readJson("rc57-aurora-rocrate-lineage-audit.json");
const python = readJson("rc57-endpoint-pair-design-python.json");
const node = readJson("rc57-endpoint-pair-design-node.json");
const audit = readJson("rc57-lineage-pair-independent-audit.json");
const priorArt = readJson("rc57-lineage-pair-prior-art.json");
const connectionEvidence = readJson("rc57-lineage-pair-connection-evidence.json");
const result = readJson("rc57-lineage-pair-cycle-result.json");

assert(contract.status === "prospective-design-from-outcome-open-source", "RC57 contract status changed");
assert(contract.pairDesign.gate.includes("P(non-tied pairs >= 100) >= 0.95"), "RC57 exact probability gate missing");
assert(contract.pairDesign.phaseRobustness.includes("every integer-cycle phase"), "RC57 phase robustness missing");
assert(lineage.status === "lineage-unresolved-aurora-excluded-before-outcomes", "Aurora exclusion boundary changed");
assert(lineage.roCrate.graphEntityCount === 599, "Aurora RO-Crate graph count must remain 599");
assert(lineage.roCrate.cellDatasetCount === 199, "Aurora RO-Crate cell dataset count must remain 199");
assert(lineage.roCrate.bdfCsvEntityCount === 199 && lineage.roCrate.bdfParquetEntityCount === 199, "Aurora BDF entity counts changed");
assert(lineage.roCrate.cohortSemanticEntityCount === 0, "Aurora RO-Crate unexpectedly gained a cohort semantic relation");
assert(lineage.inventoryAgreement.allFourInventoriesEqual === true, "Aurora physical and crate inventories must agree");
assert(lineage.paperToArchiveCohort.paperLongTermLfpCells === 36, "Aurora paper cohort count changed");
assert(lineage.paperToArchiveCohort.archiveExplicitLfpCells === 32, "Aurora explicit LFP count changed");
assert(lineage.decision.lineageGatePass === false && lineage.decision.auroraEligibleForConfirmation === false, "Aurora lineage must remain ineligible");
assert(lineage.outcomeBoundary.cyclingDataEntriesOpened === 0, "Aurora cycling data must remain unopened");
assert(lineage.outcomeBoundary.cellCapacityValuesObserved === 0 && lineage.outcomeBoundary.cellEolValuesObserved === 0, "Aurora outcomes must remain unseen");

assert(python.sourceCells === 48 && node.sourceCells === 48, "Both design implementations must use 48 source cells");
assert(python.futureExactDesigns.length === 56 && node.futureExactDesigns.length === 56, "Both implementations must report 56 exact design rows");
assert(python.principalResult.fourCellBlockUpperBound === 72 && node.principalResult.fourCellBlockUpperBound === 72, "Four-cell block upper bound changed");
let maxProbabilityDifference = 0;
for (let index = 0; index < python.futureExactDesigns.length; index += 1) {
  const primary = python.futureExactDesigns[index];
  const independent = node.futureExactDesigns[index];
  for (const key of ["effectiveObservedEvents", "spreadScale", "intervalCycles", "passesPairPowerGate"]) {
    assert(primary[key] === independent[key], `RC57 design row ${index} ${key} mismatch`);
  }
  for (const key of ["phase", "binCount", "lowerFivePercentPairCount", "medianPairCount"]) {
    assert(primary.worstPhase[key] === independent.worstPhase[key], `RC57 design row ${index} worstPhase.${key} mismatch`);
  }
  maxProbabilityDifference = Math.max(maxProbabilityDifference, Math.abs(primary.worstPhase.probabilityAtLeast100 - independent.worstPhase.probabilityAtLeast100));
}
assert(maxProbabilityDifference <= 1e-12, `RC57 probability disagreement ${maxProbabilityDifference} exceeds tolerance`);
const py24 = python.conservativeSelections.find((item) => item.effectiveObservedEvents === 24);
const py36 = python.conservativeSelections.find((item) => item.effectiveObservedEvents === 36);
assert(py24?.selectedLargestPassingIntervalCycles === 25, "RC57 24-event interval must remain 25 cycles");
assert(Math.abs(py24?.worstPhaseProbabilityAtLeast100 - 0.9993573825678991) <= 1e-12, "RC57 24-event exact probability changed");
assert(py24?.worstPhaseLowerFivePercentPairCount === 150, "RC57 24-event q05 changed");
assert(py36?.selectedLargestPassingIntervalCycles === 50, "RC57 36-event interval must remain 50 cycles");
assert(Math.abs(py36?.worstPhaseProbabilityAtLeast100 - 0.9936847404193192) <= 1e-12, "RC57 36-event exact probability changed");
assert(py36?.worstPhaseLowerFivePercentPairCount === 159, "RC57 36-event q05 changed");
assert(python.auroraOutcomeAccessAuthorized === false && node.auroraOutcomeAccessAuthorized === false, "No implementation may authorize Aurora outcomes");
assert(audit.status === "pass-design-agreement-negative-target-stop", "RC57 independent adjudication must pass with a negative target stop");
assert(audit.adjudication.pairDesignPass === true && audit.adjudication.auroraTargetEligible === false, "RC57 joint adjudication changed");
assert(priorArt.combinationAssessment.noveltyBoundary.includes("not claimed"), "RC57 novelty boundary missing");
assert(connectionEvidence.validationStatus.includes("remain untested"), "RC57 connection must preserve untested boundaries");
assert(result.status === "complete-design-positive-source-negative-stop", "RC57 cycle result status changed");
assert(result.hypotheses["H57-1"].verdict === "rejected", "RC57 cadence-only hypothesis must remain rejected");
assert(result.hypotheses["H57-2"].verdict === "supported-as-prospective-design", "RC57 larger-block design verdict changed");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 55 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox, { filename: file });
}
const cycle = sandbox.window.RESEARCH_CYCLES.find((item) => item.id === "RC-2026-57");
const connection = sandbox.window.RESEARCH_CONNECTIONS.find((item) => item.id === "CONN-EVIDENCE-030");
assert(sandbox.window.RESEARCH_CYCLES.length === 57, "Site must expose 57 research cycles");
assert(cycle?.problemIds.join(",") === "UP-219,UP-233,UP-234,UP-572", "RC57 problem mapping changed");
assert(cycle?.verifiedFindings.length >= 9, "RC57 must expose at least nine verified findings");
assert(cycle?.artifacts.length >= 10, "RC57 must expose at least ten reproducibility artifacts");
assert(connection?.problemIds.join(",") === cycle?.problemIds.join(","), "RC57 structural connection mapping changed");
for (const problemId of cycle?.problemIds || []) {
  const problem = sandbox.window.PROBLEMS.find((item) => item.id === problemId);
  assert(problem?.cycleResearch?.cycleId === "RC-2026-57", `${problemId} must show RC57 as current research`);
  assert(problem?.cycleResearch?.updatedDefinition?.text && problem?.cycleResearch?.updatedDefinition?.textEn, `${problemId} needs a bilingual updated definition`);
  assert(problem?.cycleResearch?.workPackages?.length === 4, `${problemId} needs four RC57 work packages`);
  assert(problem?.cycleResearch?.uncertaintyBudget?.length === 6, `${problemId} needs six RC57 uncertainty entries`);
  assert(problem?.cycleResearch?.uncertaintyBudget?.every((item) => item.code && item.source?.text && item.source?.textEn && item.control?.text && item.control?.textEn && item.threshold?.text && item.threshold?.textEn), `${problemId} RC57 uncertainty entries must render completely in both languages`);
  assert(problem?.cycleResearch?.decisionTree?.length === 5, `${problemId} needs five RC57 decision branches`);
  assert(problem?.cycleResearch?.decisionTree?.every((item) => item.condition?.text && item.condition?.textEn && item.action?.text && item.action?.textEn && item.meaning?.text && item.meaning?.textEn), `${problemId} RC57 decision branches must render completely in both languages`);
}
assert(sandbox.window.CATALOG_SOURCES.ro_crate_1_2_2025?.url.includes("researchobject.org"), "RO-Crate official source missing");
assert(sandbox.window.CATALOG_SOURCES.condition_based_rpt_2024?.url === "https://doi.org/10.1016/j.meaene.2024.100019", "Condition-based RPT source missing");
assert(sandbox.window.CATALOG_SOURCES.battery_aging_assessment_2026?.publishedOn === "2026-02-11", "2026 battery assessment source date missing");

for (const page of ["index.html", "solve.html", "research-log.html"]) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  assert(html.includes("research-cycle-57-data.js?v=20260829-cycle57"), `${page} must load RC57 data`);
}
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
assert(readme.includes("57개 누적 연구 사이클"), "README cycle count must be 57");
assert(readme.includes("182개 사이클 기록"), "README research-record count must be 182");
assert(readme.includes("60개 구조적 연결"), "README connection count must be 60");
assert(readme.includes("331개 기관·로드맵·원 연구 출처"), "README source count must be 331");
assert(readme.includes("1,604개 현지화 URL"), "README sitemap count must be 1,604");
const publicCopy = fs.readFileSync(path.join(ROOT, "research-cycle-57-data.js"), "utf8");
for (const prohibited of ["전공자 포인트", "1단계 · 처음 읽는 사람", "2단계 · 전공자 핵심", "개수를 맞추지"] ) {
  assert(!publicCopy.includes(prohibited), `RC57 public copy contains prohibited phrase: ${prohibited}`);
}

const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
assert(sitemap.includes("cycle=RC-2026-57&amp;lang=ko"), "Sitemap missing Korean RC57 URL");
assert(sitemap.includes("cycle=RC-2026-57&amp;lang=en"), "Sitemap missing English RC57 URL");

if (failures.length) {
  console.error(`RC57 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`RC57 verification passed: 599 RO-Crate entities, lineage rejected, four-cell max 72, n24=25 cycles, n36=50 cycles, max |Δp|=${maxProbabilityDifference.toExponential(4)}.`);
