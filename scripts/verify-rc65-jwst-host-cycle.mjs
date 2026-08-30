import fs from "node:fs";
import vm from "node:vm";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const near = (actual, expected, tolerance = 1e-10) => Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
const readText = file => fs.readFileSync(file, "utf8");
const read = file => JSON.parse(readText(file));

const spec = read("research/reproducibility/rc65-jwst-host-audit-spec.json");
const manifest = read("research/reproducibility/rc65-jwst-host-source-manifest.json");
const py = read("research/reproducibility/rc65-jwst-host-audit-python.json");
const js = read("research/reproducibility/rc65-jwst-host-audit-node.json");
const cycleResult = read("research/reproducibility/rc65-jwst-host-cycle-result.json");
const connectionArtifact = read("research/reproducibility/rc65-summary-microdata-connection.json");
const releaseContract = read("research/reproducibility/rc65-perfect-host-semantic-release-contract.json");
const priorArt = read("research/reproducibility/rc65-prior-art-boundary.json");

assert(spec.cycleId === "RC-2026-65" && spec.sources.machineReadableCepheidRows === 142, "RC65 audit contract changed");
assert(spec.hostSummaryGate.sample.startsWith("Eighteen unique") && near(spec.hostSummaryGate.sharedAnchorStandardDeviationMag, Math.hypot(0.017, 0.017)), "RC65 host-summary gate changed");
assert(spec.objectLevelSemanticClosureGate.declaredFits.length === 3 && spec.independentImplementationGate.implementations.length === 2, "RC65 object or independent gate changed");
assert(manifest.files.length === 5 && manifest.totalBytes === 453850, "RC65 source manifest size changed");
const expectedHashes = [
  "a4b2f2ab2f0225b9e3f4a89e6e19138d9caaa84281338ba396d66b6434b54d6a",
  "e0868e6914be9367c40fff71cbe4ed7e9180475514cb0a8b527b98d094235394",
  "87a4e1b0d89b91694e42d7cf57f4b098d50c4ffe580ab4f32b39318434e24326",
  "2a8ddb01ef8d3d7ba7cd4830297b9c342c89a2e34f2fc1d8917dfdf22f4eccfb",
  "e465c7f2976d80d64d4e7236230ad1adf6cf9ea047f8ab0547b290fbf65cf963"
];
assert(manifest.files.every((item, index) => item.sha256 === expectedHashes[index]), "RC65 source hash changed");

assert(py.sourceAudit.allHashesMatch && py.sourceAudit.table1Rows === 5 && py.sourceAudit.tableA1Rows === 13 && py.sourceAudit.table3PriorHostRows === 5, "RC65 source-table audit failed");
assert(py.sourceAudit.machineReadableCepheidRows === 142 && py.sourceAudit.machineReadableGroups.N3447Spiral === 63 && py.sourceAudit.machineReadableGroups.N3447A === 55 && py.sourceAudit.machineReadableGroups.N3447 === 24, "RC65 machine-readable group coverage changed");
assert(py.sourceAudit.rowShortfallVersusAll === 2 && py.sourceAudit.rowShortfallVersusPhaseCorrections === 12, "RC65 published-count gap changed");
assert(py.hostSummary.hostCount === 18 && py.hostSummary.missingNumericHost === "NGC4038", "RC65 public host coverage changed");
assert(near(py.hostSummary.glsMeanMag, -0.020824018568800687) && near(py.hostSummary.glsMeanStandardErrorMag, 0.027528237979144592), "RC65 host mean changed");
assert(near(py.hostSummary.glsDistanceSlopeMagPerMag, -0.0050953760803880265) && near(py.hostSummary.glsDistanceSlopeStandardError, 0.015397431376932934), "RC65 distance slope changed");
assert(py.hostSummary.publishedSummaryReproduced && near(py.hostSummary.requiredCrowdingSlopeExclusionSigma, 4.877136597789243), "RC65 publication reproduction or crowding-slope decision changed");
assert(py.hostSummary.leaveOneHostOut.length === 18 && py.hostSummary.maximumMeanInfluence.removedHost === "NGC1448" && near(py.hostSummary.maximumMeanInfluence.meanMovementMag, -0.01319210564887828), "RC65 maximum host influence changed");
assert(!py.gates.oneHostMeanStability && py.hostSummary.crowdingSlopeRejectedUnderEveryDeletion && near(py.hostSummary.minimumLeaveOneOutRequiredSlopeExclusionSigma, 3.718716020709363), "RC65 deletion decision changed");
assert(py.perfectHostPublishedContrast.requiredOffsetRejectedAtFiveSigma && py.perfectHostPublishedContrast.requiredOffsetExclusionSigma === 6, "RC65 published perfect-host decision changed");
assert(py.objectLevelSemanticClosure.declaredFits.length === 3 && !py.objectLevelSemanticClosure.anyDeclaredFitCloses, "RC65 object semantic-closure decision changed");
assert(near(py.objectLevelSemanticClosure.declaredFits[0].tidalMinusSpiralMag, -0.061969971139969715) && near(py.objectLevelSemanticClosure.declaredFits[2].tidalMinusSpiralMag, -0.04763110826000272), "RC65 object-fit values changed");
assert(!py.gates.machineReadableCoverage && !py.gates.completeNineteenHostReproduction && !py.gates.globalH0Refit, "RC65 claim boundaries changed");

assert(js.implementation === "dependency-free-node" && js.sourceAudit.machineReadableCepheidRows === py.sourceAudit.machineReadableCepheidRows, "RC65 independent source audit changed");
for (const key of ["glsMeanMag", "glsMeanStandardErrorMag", "glsDistanceSlopeMagPerMag", "glsDistanceSlopeStandardError"]) assert(near(js.hostSummary[key], py.hostSummary[key]), `RC65 independent host mismatch: ${key}`);
assert(js.hostSummary.leaveOneHostOut.length === py.hostSummary.leaveOneHostOut.length, "RC65 independent deletion count changed");
for (let index = 0; index < py.hostSummary.leaveOneHostOut.length; index += 1) {
  const left = py.hostSummary.leaveOneHostOut[index];
  const right = js.hostSummary.leaveOneHostOut[index];
  assert(left.removedHost === right.removedHost && near(left.meanMovementMag, right.meanMovementMag) && near(left.slopeMagPerMag, right.slopeMagPerMag), `RC65 independent deletion mismatch: ${left.removedHost}`);
}
for (let index = 0; index < 3; index += 1) {
  const left = py.objectLevelSemanticClosure.declaredFits[index];
  const right = js.objectLevelSemanticClosure.declaredFits[index];
  assert(left.weighting === right.weighting && near(left.tidalMinusSpiralMag, right.tidalMinusSpiralMag, 1e-9) && near(left.spiral.rms, right.spiral.rms, 1e-9) && near(left.tidal.rms, right.tidal.rms, 1e-9), `RC65 independent object-fit mismatch: ${left.weighting}`);
}

assert(cycleResult.newVerifiedFacts.length === 11 && cycleResult.hypothesisAdjudication.length === 6 && cycleResult.workPackages.length === 3, "RC65 research record is incomplete");
assert(cycleResult.failedOrRejectedAttempts.length === 5 && cycleResult.exactNextStart.includes("PHOST-SEMANTIC-1"), "RC65 failure history or exact handoff is missing");
assert(connectionArtifact.id === "CONN-EVIDENCE-038" && connectionArtifact.problemIds.join(",") === "UP-003,UP-625,UP-626", "RC65 structural connection changed");
assert(connectionArtifact.validWhen.length === 4 && connectionArtifact.breaksWhen.length === 4 && connectionArtifact.minimumValidationTest.length > 300, "RC65 connection lacks falsifiable conditions");
assert(releaseContract.contractId === "PHOST-SEMANTIC-1" && releaseContract.executableFixtures.length === 3 && releaseContract.admissionTests.length === 5, "RC65 semantic release contract changed");
assert(releaseContract.prospectiveDecisiveExperiment.primaryAdjudicand.includes("Difference-in-differences"), "RC65 prospective adjudicand missing");
assert(priorArt.queries.length === 5 && priorArt.found.length === 3 && priorArt.notVerifiedInReviewedSources.length === 2, "RC65 prior-art boundary changed");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 63 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInNewContext(readText(file), sandbox, { filename: file });
const problems = sandbox.window.PROBLEMS || [];
const sources = sandbox.window.CATALOG_SOURCES || {};
const cycles = sandbox.window.RESEARCH_CYCLES || [];
const connections = sandbox.window.RESEARCH_CONNECTIONS || [];
assert(problems.length === 744 && Object.keys(sources).length === 367 && cycles.length === 65 && connections.length === 68, "RC65 site catalogue totals changed");
assert(problems.reduce((sum, problem) => sum + (problem.researchHistory || []).length, 0) === 210, "RC65 problem-cycle record total changed");
assert(problems.filter(problem => (problem.researchHistory || []).length > 0).length === 20, "RC65 deeply researched problem total changed");
const siteCycle = cycles.find(item => item.id === "RC-2026-65");
assert(siteCycle?.problemIds.join(",") === "UP-003,UP-625,UP-626" && siteCycle.connectionIds[0] === "CONN-EVIDENCE-038", "RC65 site cycle missing");
assert(siteCycle.verifiedFindings.length === 9 && siteCycle.resultMatrix.rows.length === 8 && siteCycle.artifacts.length === 8 && siteCycle.log.length === 9, "RC65 public cycle record incomplete");
for (const id of siteCycle.problemIds) {
  const problem = problems.find(item => item.id === id);
  const record = (problem.researchHistory || []).find(item => item.cycleId === "RC-2026-65");
  assert(record?.focusedPage && record.causalChain.length === 5 && record.hypotheses.length === 4 && record.workPackages.length === 3 && record.uncertaintyBudget.length === 4 && record.decisionTree.length === 4, `${id}: RC65 focused research record incomplete`);
}
const updatedDefinitions = siteCycle.problemIds.map(id => problems.find(item => item.id === id).cycleResearch.updatedDefinition.text);
const EnglishDefinitions = siteCycle.problemIds.map(id => problems.find(item => item.id === id).cycleResearch.updatedDefinition.textEn);
assert(new Set(updatedDefinitions).size === 3 && new Set(EnglishDefinitions).size === 3, "RC65 problem narratives are duplicated");
assert(sources.shoes_perfect_host_2025.publishedOn === "2025-10-17" && sources.shoes_perfect_host_tables_2025 && sources.shoes_jwst_crowding_2024 && sources.mast_perfect_host_2025, "RC65 primary sources missing or stale");

for (const page of ["index.html", "solve.html", "research-log.html"]) assert(readText(page).includes("research-cycle-65-data.js?v=20260831-cycle65"), `${page}: RC65 script missing`);
assert(readText("scripts/generate-sitemap.mjs").includes("length: 63"), "Sitemap generator omits RC65");
assert(!readText("research-cycle-65-data.js").includes("전공자 포인트") && !readText("research-cycle-65-data.js").includes("1단계") && !readText("research-cycle-65-data.js").includes("개수를 맞"), "RC65 public prose contains forbidden mechanical or editorial wording");

if (failures.length) {
  console.error(`RC65 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC65 JWST-host cycle verified: 18-host GLS and deletions reproduced; NGC 3447 object semantic closure correctly stopped; bilingual site and artifacts linked.");
