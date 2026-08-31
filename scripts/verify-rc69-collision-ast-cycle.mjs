import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const readText = file => fs.readFileSync(file, "utf8");
const read = file => JSON.parse(readText(file));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const near = (actual, expected, tolerance = 1e-6) => Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;

const repro = "research/reproducibility/";
const manifest = read(`${repro}rc69-phost-cal-source-manifest.json`);
const environments = read(`${repro}rc69-collision-environment-manifest.json`);
const designAudit = read(`${repro}rc69-collision-design-node-audit.json`);
const smokeSelection = read(`${repro}rc69-dolphot-smoke-selection.json`);
const smoke = read(`${repro}rc69-dolphot-smoke-result.json`);
const smokePython = read(`${repro}rc69-dolphot-smoke-python-audit.json`);
const priorArt = read(`${repro}rc69-prior-art-boundary.json`);
const cycleResult = read(`${repro}rc69-collision-ast-cycle-result.json`);

assert(manifest.cycleId === "RC-2026-69" && manifest.exposureCount === 32, "RC69 CAL manifest identity changed");
assert(manifest.totalExposureBytes === 3762339840 && manifest.bands.F090W === 16 && manifest.bands.F150W === 16, "RC69 exposure grid or byte total changed");
assert(manifest.exposureFiles.length === 32 && new Set(manifest.exposureFiles.map(row => `${row.band}:${row.dither}:${row.detector}`)).size === 32, "RC69 exposure cells are incomplete or duplicated");
assert(manifest.exposureFiles.every(row => row.expectedBytes === 117573120 && row.archiveBytes === 117573120 && /^[a-f0-9]{64}$/.test(row.sha256)), "RC69 CAL receipts are incomplete");
assert(manifest.exposureFiles.every(row => row.header.CAL_VER === "2.0.1" && row.header.CRDS_CTX === "jwst_1535.pmap"), "RC69 calibration context changed");
assert(manifest.softwareFiles.length === 8 && manifest.softwareFiles.every(row => row.bytes > 0 && /^[a-f0-9]{64}$/.test(row.sha256)), "RC69 software receipts are incomplete");
assert(manifest.releaseDecision.startsWith("DOLPHOT 3.0 is the frozen reference"), "RC69 reference release decision changed");

assert(environments.experimentId === "PHOST-COLLISION-AST-1" && environments.environmentCount === 48 && environments.injectionCountPerBandPerPipeline === 3072, "RC69 intervention denominator changed");
assert(Object.keys(environments.cellCounts).length === 12 && Object.values(environments.cellCounts).every(value => value === 4), "RC69 environment balance changed");
assert(Object.values(environments.topologyCounts).every(value => value === 1024), "RC69 topology counts changed");
assert(environments.supportBoundary.includes("no spiral-development support"), "RC69 support boundary is missing");

const csvLines = readText(`${repro}rc69-collision-injection-manifest.csv`).trim().split(/\r?\n/);
const inputLines = readText(`${repro}rc69-collision-dolphot-input.txt`).trim().split(/\r?\n/);
assert(csvLines.length === 3073 && inputLines.length === 3072, "RC69 injection row count changed");
assert(inputLines.every(line => line.trim().split(/\s+/).length === 6), "RC69 DOLPHOT input no longer has six ext/chip/x/y/filter fields");
assert(designAudit.verdict === "pass" && designAudit.verified.intervention.uniqueInjectionIds === 3072, "RC69 independent design audit failed");
assert(designAudit.verified.exposureGrid.totalBytes === manifest.totalExposureBytes && designAudit.verified.frozenInterface.dolphotRows === 3072, "RC69 design and archive ledgers diverged");
for (const param of ["rc69-dolphot-reference.param", "rc69-dolphot-smoke.param", "rc69-dolphot-smoke-blank.param", "rc69-dolphot-smoke-isolated.param", "rc69-dolphot-smoke-collision.param"]) {
  const text = readText(`${repro}${param}`);
  assert(text.includes("img_RSky2 = 3 10") && text.includes("img_apsky = 20 35"), `${param}: accepted DOLPHOT 3.0 parameter names changed`);
}

assert(smokeSelection.windows.length === 3 && smokeSelection.windows.reduce((sum, row) => sum + row.injectionCount, 0) === 16, "RC69 smoke selection changed");
assert(new Set(smokeSelection.windows.flatMap(row => row.states)).size === 3, "RC69 smoke no longer covers three collision states");
assert(smoke.status === "executable-smoke-pass-scientific-gates-remain-closed", "RC69 smoke claim boundary changed");
assert(smoke.ledger.expectedRows === 16 && smoke.ledger.outputRows === 16 && smoke.ledger.uniqueInjectionIds === 16, "RC69 smoke row ledger changed");
assert(smoke.rows.length === 16 && new Set(smoke.rows.map(row => row.injectionId)).size === 16, "RC69 smoke identities are incomplete");
assert(smoke.baselineReceipts.length === 3 && smoke.baselineReceipts.every(row => row.lowPsfStarWarning && row.noCoverageAlignmentWarnings === 24), "RC69 smoke warning boundary changed");
assert(smoke.adjudication.plumbingGate.startsWith("pass") && smoke.adjudication.scientificGate.startsWith("not tested"), "RC69 executable and scientific gates were conflated");
assert(near(smoke.stateSummary.blank.medianResidualF090WMag, -0.171166) && near(smoke.stateSummary.blank.medianResidualF150WMag, -0.1045), "RC69 smoke parsing changed");
assert(near(smoke.stateSummary.isolated.medianResidualF090WMag, 0.042334) && near(smoke.stateSummary["large-collision"].medianResidualF150WMag, -0.0245), "RC69 smoke summaries changed");

assert(smokePython.status === "pass" && smokePython.columnContract.artificialStarInputColumns === 68, "RC69 expanded AST output-prefix audit failed");
assert(smokePython.columnContract.combinedF090WVegaMagOneBased === 17 && smokePython.columnContract.combinedF150WVegaMagOneBased === 30, "RC69 AST column contract changed");
assert(JSON.stringify(smokePython.stateSummary) === JSON.stringify(smoke.stateSummary), "RC69 Node/Python summaries diverged");
for (const receipt of smokePython.rawReceipts) {
  const filename = `${repro}rc69-dolphot-smoke-${receipt.window}-raw.txt`;
  assert(fs.statSync(filename).size === receipt.bytes && hash(filename) === receipt.sha256, `${receipt.window}: RC69 committed raw receipt changed`);
}

assert(priorArt.queries.length === 6 && priorArt.establishedMethods.length === 4 && priorArt.primarySources.length === 7, "RC69 prior-art boundary is incomplete");
assert(priorArt.noveltyBoundary.includes("not a patentability or priority claim"), "RC69 novelty qualification changed");
assert(cycleResult.newVerifiedFacts.length === 10 && cycleResult.hypothesisAdjudication.length === 5, "RC69 research record is incomplete");
assert(cycleResult.failedOrRejectedAttempts.length === 6 && cycleResult.exactNextStart.includes("3,072"), "RC69 failures or exact handoff are missing");
assert(cycleResult.claimBoundary.includes("does not prove a collision-induced photometric bias"), "RC69 scientific claim boundary changed");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 67 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInNewContext(readText(file), sandbox, { filename: file });
const problems = sandbox.window.PROBLEMS || [];
const sources = sandbox.window.CATALOG_SOURCES || {};
const cycles = sandbox.window.RESEARCH_CYCLES || [];
const connections = sandbox.window.RESEARCH_CONNECTIONS || [];
assert(problems.length === 744 && cycles.length === 69 && connections.length === 71, "RC69 site catalogue totals changed");
assert(Object.keys(sources).length === 383, "RC69 source total changed");
assert(problems.reduce((sum, problem) => sum + (problem.researchHistory || []).length, 0) === 222, "RC69 problem-cycle record total changed");
const siteCycle = cycles.find(item => item.id === "RC-2026-69");
assert(siteCycle?.problemIds.join(",") === "UP-003,UP-625,UP-626" && siteCycle.connectionIds[0] === "CONN-EVIDENCE-041", "RC69 public cycle scope changed");
assert(siteCycle.verifiedFindings.length === 10 && siteCycle.resultMatrix.rows.length === 10 && siteCycle.artifacts.length === 10 && siteCycle.log.length === 9, "RC69 public record is incomplete");
for (const id of siteCycle.problemIds) {
  const problem = problems.find(item => item.id === id);
  const record = (problem?.researchHistory || []).find(item => item.cycleId === "RC-2026-69");
  assert(problem?.cycleResearch === record, `${id}: RC69 is not the current focused record`);
  assert(record?.focusedPage && record.technicalAxes.length === 3 && record.causalChain.length === 4 && record.hypotheses.length === 3 && record.workPackages.length === 3 && record.uncertaintyBudget.length === 4 && record.decisionTree.length === 4, `${id}: RC69 focused record is incomplete`);
  for (const key of ["role", "centralQuestion", "resolutionCriterion", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record?.[key]?.text?.length > 55 && record?.[key]?.textEn?.length > 85, `${id}: RC69 ${key} is not substantive and bilingual`);
  }
}
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.text)).size === 3, "RC69 Korean narratives are duplicated");
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.textEn)).size === 3, "RC69 English narratives are duplicated");
const connection = connections.find(item => item.id === "CONN-EVIDENCE-041");
assert(connection?.reviewedOn === "2026-09-01" && connection.validationStatus.text.includes("DOLPHOT 행 인터페이스"), "RC69 connection update is missing");
assert(sources.dolphot_official_distribution_2026.publishedOn === "2026-08-01" && sources.nircam_psf_stpsf_2025.publishedOn === "2025-07-01", "RC69 source dates changed");

for (const page of ["index.html", "solve.html", "research-log.html"]) assert(readText(page).includes("research-cycle-69-data.js?v=20260901-cycle69"), `${page}: RC69 script is missing`);
assert(readText("scripts/generate-sitemap.mjs").includes("length: 67"), "Sitemap generator omits RC69");
const publicProse = readText("research-cycle-69-data.js");
for (const forbidden of ["전공자 포인트", "1단계", "개수를 맞", "아래 시도는 개별 논문"]) assert(!publicProse.includes(forbidden), `RC69 public prose contains forbidden wording: ${forbidden}`);

if (failures.length) {
  console.error(`RC69 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC69 verified: 32-CAL receipts, 48-environment/3,072-row intervention, real DOLPHOT smoke outputs, independent parsing, scientific stop boundary, bilingual records, and site integration agree.");
