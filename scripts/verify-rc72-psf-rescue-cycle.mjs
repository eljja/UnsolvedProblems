import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const text = file => fs.readFileSync(file, "utf8");
const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
const repro = "research/reproducibility/";

const contract = read(`${repro}rc72-psf-rescue-contract.json`);
const dag = read(`${repro}rc72-adaptation-dag.json`);
const support = read(`${repro}rc72-psf-holdout-support.json`);
const manifest = read(`${repro}rc72-core-holdout-manifest.json`);
const receipt = read(`${repro}rc72-preregistration-receipt.json`);
const result = read(`${repro}rc72-core-aperture-result.json`);
const audit = read(`${repro}rc72-core-aperture-independent-audit.json`);
const sourceReview = read(`${repro}rc72-source-review.json`);
const priorArt = read(`${repro}rc72-prior-art-boundary.json`);
const connectionArtifact = read(`${repro}rc72-support-first-rescue-connection.json`);
const cycleResult = read(`${repro}rc72-psf-rescue-cycle-result.json`);
const calManifest = read(`${repro}rc69-phost-cal-source-manifest.json`);

assert(contract.cycleId === "RC-2026-72" && contract.parentFailure.immutableDecision.includes("remains failed"), "RC72 contract or immutable RC71 failure changed");
assert(contract.developmentInspection.disclosure.includes("Before this contract") && contract.developmentInspection.consequence.includes("no claim"), "RC72 development-inspection disclosure is missing");
assert(contract.tracks.length === 2 && contract.tracks[0].id === "EE80-INDEPENDENT" && contract.tracks[1].id === "CORE-DIAGNOSTIC", "RC72 branch definitions changed");
assert(contract.adaptationPolicy.forbidden.length === 5 && dag.nodes.length === 9 && dag.nonRetroactivity.includes("No path changes"), "RC72 adaptation boundary is incomplete");
for (const item of receipt.artifacts) assert(fs.existsSync(item.file) && fs.statSync(item.file).size === item.bytes && sha(item.file) === item.sha256, `${item.file}: sealed preregistration artifact changed`);
assert(receipt.candidateCounts.NRCB1 === 32 && receipt.candidateCounts.NRCB2 === 32 && receipt.outcomeBoundary.includes("No CAL-pixel"), "RC72 candidate or outcome boundary changed");

const b1 = support.detectors.find(row => row.detector === "NRCB1");
const b2 = support.detectors.find(row => row.detector === "NRCB2");
assert(b1.tracks["EE80-INDEPENDENT"].total === 49 && b1.tracks["EE80-INDEPENDENT"].minimumCell === 4, "NRCB1 EE80 support changed");
assert(b2.tracks["EE80-INDEPENDENT"].total === 0 && b2.tracks["EE80-INDEPENDENT"].minimumCell === 0, "NRCB2 EE80 support changed");
assert(b1.tracks["CORE-DIAGNOSTIC"].total === 260 && b2.tracks["CORE-DIAGNOSTIC"].total === 91, "RC72 core catalogue support changed");
assert(!support.gates.ee80Independent.pass && support.gates.coreDiagnostic.pass && support.firstDivergence === "EE80-INDEPENDENT support", "RC72 support decision changed");
assert(manifest.candidateCount === 64 && new Set(manifest.candidates.map(row => `${row.detector}|${row.cell}|${row.rankInCell}`)).size === 64, "RC72 holdout is incomplete or duplicated");
assert(manifest.candidates.every(row => row.nearestNeighborPixels >= 6 && row.exposures.length === 8), "RC72 holdout violates isolation or exposure support");

assert(result.inputReceipts.length === 16 && result.measurements.length === 512, "RC72 CAL or measurement row count changed");
const calReceipts = Object.fromEntries(calManifest.exposureFiles.map(item => [item.filename, item]));
assert(result.inputReceipts.every(item => calReceipts[item.file]?.sha256 === item.sha256 && calReceipts[item.file]?.expectedBytes === item.bytes), "RC72 CAL receipt changed");
assert(near(result.method.offsetsLearnedOnlyOnNRCB1.F090W, 25.773254362) && near(result.method.offsetsLearnedOnlyOnNRCB1.F150W, 25.482389634), "RC72 control offsets changed");
assert(near(result.summaries.NRCB1.F090W.p90AbsoluteResidualMagnitude, 0.302520528) && near(result.summaries.NRCB1.F150W.p90AbsoluteResidualMagnitude, 0.210338707), "RC72 NRCB1 control tails changed");
assert(near(result.summaries.NRCB2.F090W.medianResidualMagnitude, 0.302431959) && near(result.summaries.NRCB2.F150W.medianResidualMagnitude, 0.165408291), "RC72 NRCB2 diagnostic medians changed");
assert(!result.gates.ee80IndependentSupport.pass && !result.gates.nrcb1ControlTail.pass && !result.gates.coreDiagnostic.pass, "RC72 negative result changed");
assert(!result.gates.originalNrcb2PsfGate.pass && result.gates.originalNrcb2PsfGate.immutable && !result.gates.sealedArtificialStarTest.opened, "RC72 opened or rewrote a downstream gate");
assert(result.firstDivergence.overallAdaptationDag === "EE80-INDEPENDENT support" && result.firstDivergence.coreDiagnostic === "NRCB1 control tail", "RC72 first divergence changed");
assert(audit.status === "pass" && Object.values(audit.checks).every(Boolean) && !audit.gates.coreDiagnostic, "RC72 independent decision audit failed");

assert(sourceReview.sources.length === 7 && sourceReview.sources.filter(source => source.type.startsWith("primary")).length === 3, "RC72 source review is incomplete");
assert(sourceReview.classification.verifiedByRC72.length === 4 && sourceReview.prizeReview.includes("No active cash prize"), "RC72 fact or prize boundary is incomplete");
assert(priorArt.establishedMethods.length === 4 && priorArt.validityConditions.length === 5 && priorArt.breakConditions.length === 5 && priorArt.noveltyBoundary.startsWith("No claim"), "RC72 prior-art boundary is incomplete");
assert(connectionArtifact.id === "CONN-EVIDENCE-042" && connectionArtifact.problemIds.join(",") === "UP-003,UP-625,UP-626" && connectionArtifact.evidence.length === 4, "RC72 structural connection artifact changed");
assert(cycleResult.newVerifiedFacts.length === 11 && cycleResult.hypothesisAdjudication.length === 4 && cycleResult.failedOrRejectedAttempts.length === 5, "RC72 research record is incomplete");
assert(cycleResult.workPackages.length === 3 && cycleResult.uncertaintyBudget.length === 5 && cycleResult.exactNextStart.includes("Do not reuse"), "RC72 next program or uncertainty record is incomplete");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 70 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInNewContext(text(file), sandbox, { filename: file });
const problems = sandbox.window.PROBLEMS || [];
const sources = sandbox.window.CATALOG_SOURCES || {};
const cycles = sandbox.window.RESEARCH_CYCLES || [];
const connections = sandbox.window.RESEARCH_CONNECTIONS || [];
assert(problems.length === 744 && Object.keys(sources).length === 390 && cycles.length === 72 && connections.length === 72, "RC72 public catalogue totals changed");
assert(problems.reduce((sum, problem) => sum + (problem.researchHistory || []).length, 0) === 231, "RC72 problem-history total changed");
const siteCycle = cycles.find(cycle => cycle.id === "RC-2026-72");
assert(siteCycle?.problemIds.join(",") === "UP-003,UP-625,UP-626" && siteCycle.connectionIds[0] === "CONN-EVIDENCE-042", "RC72 public scope changed");
assert(siteCycle.verifiedFindings.length === 10 && siteCycle.resultMatrix.rows.length === 11 && siteCycle.artifacts.length === 11 && siteCycle.log.length === 9, "RC72 public cycle record is incomplete");
assert(siteCycle.resultMatrix.rows.some(row => row.label === "NRCB1 F090W TAIL" && row.values[2].text === "실패"), "RC72 public matrix hides the control failure");
assert(siteCycle.sharedProgram.stopRule.text.includes("holdout 재사용") && siteCycle.nextCycle.text.includes("다시 쓰지 않는다"), "RC72 stop or retirement boundary is missing");
for (const id of siteCycle.problemIds) {
  const problem = problems.find(row => row.id === id);
  const record = (problem?.researchHistory || []).find(row => row.cycleId === "RC-2026-72");
  assert(problem?.cycleResearch === record, `${id}: RC72 is not the current focused record`);
  assert(record?.focusedPage && record.technicalAxes.length === 3 && record.causalChain.length === 4 && record.hypotheses.length === 3 && record.workPackages.length === 3 && record.uncertaintyBudget.length === 4 && record.decisionTree.length === 4, `${id}: RC72 focused record is incomplete`);
  for (const key of ["role", "centralQuestion", "resolutionCriterion", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) assert(record?.[key]?.text?.length > 60 && record?.[key]?.textEn?.length > 80, `${id}: RC72 ${key} is not substantive and bilingual`);
}
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.text)).size === 3, "RC72 Korean narratives are duplicated");
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.textEn)).size === 3, "RC72 English narratives are duplicated");
const siteConnection = connections.find(item => item.id === "CONN-EVIDENCE-042");
assert(siteConnection?.reviewedOn === "2026-09-01" && siteConnection.validationStatus.text.includes("support enumeration"), "RC72 site connection is missing");

for (const page of ["index.html", "solve.html", "research-log.html"]) assert(text(page).includes("research-cycle-72-data.js?v=20260901-cycle72"), `${page}: RC72 script is missing`);
const sitemapGenerator = text("scripts/generate-sitemap.mjs");
const cycleSpan = Number(sitemapGenerator.match(/length:\s*(\d+)/)?.[1] || 0);
assert(cycleSpan >= 70, "Sitemap generator omits RC72");
const sitemap = text("sitemap.xml");
assert(sitemap.includes("research-log.html?cycle=RC-2026-72&amp;lang=ko") && sitemap.includes("research-log.html?cycle=RC-2026-72&amp;lang=en"), "RC72 localized sitemap URLs are missing");
const publicProse = text("research-cycle-72-data.js");
for (const forbidden of ["전공자 포인트", "1단계", "개수를 맞", "아래 시도는 개별 논문"]) assert(!publicProse.includes(forbidden), `RC72 public prose contains forbidden wording: ${forbidden}`);

if (failures.length) {
  console.error(`RC72 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC72 verified: the EE80 branch stops on missing support, the small-core branch stops on the failed NRCB1 control, Python and Node reproduce every decision, the holdout is retired, and no downstream science gate opens.");
