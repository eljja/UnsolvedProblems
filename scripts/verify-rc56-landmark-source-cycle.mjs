#!/usr/bin/env node

/** Verify RC56 data, outcome boundary, independent replay, site wiring, and bilingual record. */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "research", "reproducibility", name), "utf8"));
const source = readJson("rc56-aurora-source-audit.json");
const contract = readJson("rc56-rwth-landmark-development-contract.json");
const python = readJson("rc56-rwth-landmark-development-python.json");
const node = readJson("rc56-rwth-landmark-development-node.json");
const audit = readJson("rc56-landmark-source-independent-audit.json");
const connectionEvidence = readJson("rc56-landmark-source-connection-evidence.json");
const result = readJson("rc56-landmark-source-cycle-result.json");

assert(source.status === "metadata-only-before-any-cycling-data-entry-was-opened", "Aurora audit must remain metadata-only");
assert(source.directory.entryCount === 797, "Aurora ZIP entry count must remain 797");
assert(source.metadataFileCount === 199, "Aurora metadata count must remain 199");
for (const suffix of [".metadata.json", ".bdf.csv", ".bdf.parquet"]) {
  assert(source.entryClasses.find((item) => item.suffix === suffix)?.count === 199, `Aurora ${suffix} count must remain 199`);
}
assert(source.outcomeBoundary.cyclingDataEntriesOpened === 0, "Aurora cycling entries must remain unopened");
assert(source.outcomeBoundary.cellCapacityValuesObserved === 0, "Aurora cell capacity values must remain unseen");
assert(source.outcomeBoundary.cellEolValuesObserved === 0, "Aurora EOL values must remain unseen");
const explicitLfp = source.metadata.filter((item) => item.matchedLeaves.some((leaf) => String(leaf.value).toLowerCase().includes("lifepo4")));
assert(explicitLfp.length === 32, "Aurora explicit LiFePO4 metadata count must remain 32");

assert(contract.status === "outcome-open-method-development-only", "RWTH contract must preserve outcome-open claim boundary");
assert(contract.candidateOrder.length === 8, "RWTH contract must preserve eight candidates");
assert(contract.selection.pairGate.includes("60"), "RWTH pair gate must remain 60");
assert(contract.selection.rankingGate.includes("0.65"), "RWTH ranking gate must remain 0.65");
assert(contract.independentTransfer.boundary.includes("precommit"), "Aurora outcome boundary must require a precommit");

assert(python.results.length === 8 && node.results.length === 8, "Both implementations must report eight candidates");
assert(python.selectedCandidate === null && node.selectedCandidate === null, "No RC56 coordinate may qualify");
assert(python.auroraOutcomeAccessAuthorized === false && node.auroraOutcomeAccessAuthorized === false, "Neither implementation may authorize Aurora outcomes");
const expected = {
  R1_capacity_level: [49, 0.5714285714285714],
  R1_log_slope: [49, 0.5918367346938775],
  R2_capacity_level: [47, 0.6808510638297872],
  R2_recent_log_slope: [47, 0.7021276595744681],
  R2_log_slope_curvature: [47, 0.44680851063829785],
  R3_capacity_level: [47, 0.723404255319149],
  R3_recent_log_slope: [47, 0.6382978723404256],
  R3_log_slope_curvature: [47, 0.5319148936170213],
};
let maxBetaDifference = 0;
for (let index = 0; index < python.results.length; index += 1) {
  const primary = python.results[index];
  const independent = node.results[index];
  const [pairs, concordance] = expected[primary.name];
  assert(primary.name === independent.name, `candidate order mismatch at ${index}`);
  assert(primary.withinHeldBatchComparablePairs === pairs, `${primary.name} pair count changed`);
  assert(Math.abs(primary.withinHeldBatchConcordance - concordance) <= 1e-12, `${primary.name} concordance changed`);
  assert(primary.withinHeldBatchComparablePairs === independent.withinHeldBatchComparablePairs, `${primary.name} pair implementations disagree`);
  assert(Math.abs(primary.withinHeldBatchConcordance - independent.withinHeldBatchConcordance) <= 1e-12, `${primary.name} concordance implementations disagree`);
  assert(JSON.stringify(primary.foldBetaSigns) === JSON.stringify(independent.foldBetaSigns), `${primary.name} fold signs disagree`);
  assert(JSON.stringify(primary.gates) === JSON.stringify(independent.gates), `${primary.name} gates disagree`);
  maxBetaDifference = Math.max(maxBetaDifference, Math.abs(primary.fullCohortBeta - independent.fullCohortBeta));
}
assert(maxBetaDifference <= 1e-6, `full-cohort beta disagreement ${maxBetaDifference} exceeds 1e-6`);
assert(audit.status === "pass-negative-stop", "Independent adjudication must preserve negative stop");
assert(audit.implementationAgreement.pass === true, "Independent implementations must agree");
assert(audit.sourceBoundary.explicitLiFePO4MetadataCount === 32, "Independent audit LFP count must remain 32");
assert(audit.decision.auroraCyclingAccessAuthorized === false, "Independent audit must keep Aurora outcomes closed");
assert(result.status === "complete-negative-stop-before-independent-outcomes", "Cycle result status changed");
assert(result.hypotheses["H56-1"].verdict === "not-earned", "H56-1 must remain not earned");
assert(result.hypotheses["H56-2"].verdict === "unresolved-and-ineligible", "H56-2 must remain unresolved and ineligible");
assert(connectionEvidence.validationStatus.includes("transport hypothesis remains untested"), "Connection evidence must preserve untested transport boundary");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 54 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox, { filename: file });
}
const cycle = sandbox.window.RESEARCH_CYCLES.find((item) => item.id === "RC-2026-56");
const connection = sandbox.window.RESEARCH_CONNECTIONS.find((item) => item.id === "CONN-EVIDENCE-029");
assert(sandbox.window.RESEARCH_CYCLES.length === 56, "Site must expose 56 research cycles");
assert(cycle?.problemIds.length === 3, "RC56 must focus three linked battery problems");
assert(cycle?.verifiedFindings.length >= 7, "RC56 must expose verified findings");
assert(cycle?.artifacts.length >= 8, "RC56 must expose its reproducibility artifacts");
assert(connection?.problemIds.join(",") === "UP-219,UP-233,UP-234", "RC56 structural connection mapping changed");
for (const problemId of cycle?.problemIds || []) {
  const problem = sandbox.window.PROBLEMS.find((item) => item.id === problemId);
  assert(problem?.cycleResearch?.cycleId === "RC-2026-56", `${problemId} must show RC56 as current research`);
  assert(problem?.cycleResearch?.updatedDefinition?.text && problem?.cycleResearch?.updatedDefinition?.textEn, `${problemId} needs bilingual updated definition`);
  assert(problem?.cycleResearch?.workPackages?.length === 4, `${problemId} needs four RC56 work packages`);
}
assert(sandbox.window.CATALOG_SOURCES.aurora_platform_2025?.url === "https://doi.org/10.1002/batt.202500155", "Aurora primary-paper source missing");
assert(sandbox.window.CATALOG_SOURCES.aurora_dataset_2025?.url === "https://doi.org/10.5281/zenodo.15481956", "Aurora official dataset source missing");

for (const page of ["index.html", "solve.html", "research-log.html"]) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  assert(html.includes("research-cycle-56-data.js?v=20260829-cycle56"), `${page} must load RC56 data`);
}
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
assert(readme.includes("56개 누적 연구 사이클"), "README cycle count must be 56");
assert(readme.includes("178개 사이클 기록"), "README research-record count must be 178");
assert(readme.includes("59개 구조적 연결"), "README connection count must be 59");
assert(readme.includes("328개 기관·로드맵·원 연구 출처"), "README source count must be 328");
assert(readme.includes("1,602개 현지화 URL"), "README sitemap count must be 1,602");
assert(!fs.readFileSync(path.join(ROOT, "research-cycle-56-data.js"), "utf8").includes("전공자 포인트"), "RC56 public copy contains a prohibited mechanical heading");

const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
assert(sitemap.includes("cycle=RC-2026-56&amp;lang=ko"), "Sitemap missing Korean RC56 URL");
assert(sitemap.includes("cycle=RC-2026-56&amp;lang=en"), "Sitemap missing English RC56 URL");

if (failures.length) {
  console.error(`RC56 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`RC56 verification passed: 32 explicit LFP metadata, 0 Aurora outcomes, 8 candidates, no qualified coordinate, max beta |Δ|=${maxBetaDifference.toExponential(4)}.`);
