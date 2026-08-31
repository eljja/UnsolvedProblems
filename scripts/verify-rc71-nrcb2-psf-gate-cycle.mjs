import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const text = file => fs.readFileSync(file, "utf8");
const read = file => JSON.parse(text(file));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const near = (actual, expected, tolerance = 1e-12) => Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
const repro = "research/reproducibility/";

const result = read(`${repro}rc71-nrcb2-detector-baseline-result.json`);
const python = read(`${repro}rc71-nrcb2-detector-baseline-python-audit.json`);
const comparison = read(`${repro}rc71-nrcb1-nrcb2-cross-detector-comparison.json`);
const sourceReview = read(`${repro}rc71-source-review.json`);
const priorArt = read(`${repro}rc71-prior-art-boundary.json`);
const cycleResult = read(`${repro}rc71-nrcb2-baseline-cycle-result.json`);
const designAudit = read(`${repro}rc70-detector-design-node-audit.json`);

assert(result.cycleId === "RC-2026-71" && result.tile.detector === "NRCB2", "RC71 experiment identity changed");
assert(result.software.binarySha256 === "b0a3f74cddda42c24e7265fc5a8e0f94a2fbc147abc770e9cd21d330207c0c06", "RC71 DOLPHOT binary changed");
const nrcb2Design = designAudit.tiles.find(tile => tile.tileId === "nrcb2");
assert(result.software.parameterSha256 === nrcb2Design.parameterSha256 && result.software.parameterSha256 === "c08ad6f8f4006b88cb0927d1da5c1213ae3fcfb424f8924078de24726682771c", "RC71 frozen NRCB2 parameter changed");
assert(result.tile.expectedImageIndices.join(",") === "2,6,10,14,18,22,26,30", "RC71 expected-image support changed");
assert(result.alignment.length === 32 && result.psf.length === 32 && result.aperture.length === 32, "RC71 diagnostic row count changed");

const supportedAlignment = result.alignment.filter(row => row.expected);
const supportedPsf = result.psf.filter(row => row.expected);
const supportedAperture = result.aperture.filter(row => row.expected);
assert(Math.min(...supportedAlignment.map(row => row.matched)) === 1339 && Math.max(...supportedAlignment.map(row => row.matched)) === 1535, "RC71 matched-star range changed");
assert(Math.min(...supportedAlignment.map(row => row.sigmaPixels)) === 0.08 && Math.max(...supportedAlignment.map(row => row.sigmaPixels)) === 0.15, "RC71 alignment-sigma range changed");
assert(Math.min(...supportedPsf.map(row => row.stars)) === 91 && Math.max(...supportedPsf.map(row => row.stars)) === 96, "RC71 PSF-star failure range changed");
assert(near(Math.max(...supportedPsf.map(row => Math.abs(row.centralPixelAdjustment))), 0.005902), "RC71 PSF adjustment changed");
assert(Math.min(...supportedAperture.map(row => row.stars)) === 129 && Math.max(...supportedAperture.map(row => row.stars)) === 200, "RC71 aperture-star range changed");
assert(result.gates.geometry.pass && result.gates.alignment.pass && !result.gates.psf.pass && result.gates.aperture.pass && result.gates.typedWarnings.pass, "RC71 detector gate boundary changed");
assert(!result.gates.nrcb2Baseline.pass && !result.gates.twoDetectorBaseline.pass && !result.gates.fourDetectorBaseline.pass && !result.gates.sealedAst.pass, "RC71 downstream stop boundary changed");
assert(result.warnings.totalLines === 72 && result.warnings.expectedExposureWarnings === 0 && result.warnings.unclassifiedWarningLines === 0 && result.warnings.warningsOnlyOutsideSupport, "RC71 warning classification changed");
assert(Object.entries(result.warnings.warningCountByImage).every(([index, count]) => result.tile.expectedImageIndices.includes(Number(index)) ? count === 0 : count === 3), "RC71 warning multiplicity changed");
assert(result.output.catalogueRows === 29382 && result.output.timing.elapsed === "44:59.74" && result.output.timing.maximumResidentKb === 2454604, "RC71 catalogue or runtime receipt changed");
for (const receipt of result.output.receipts) assert(fs.existsSync(receipt.file) && fs.statSync(receipt.file).size === receipt.bytes && hash(receipt.file) === receipt.sha256, `${receipt.kind}: RC71 committed receipt changed`);

assert(python.status === "pass" && Object.values(python.checks).every(Boolean), "RC71 independent Python audit failed");
assert(python.recomputed.matchedRange.join(",") === "1339,1535" && python.recomputed.sigmaRangePixels.join(",") === "0.08,0.15", "RC71 independent alignment ranges changed");
assert(python.recomputed.psfStarRange.join(",") === "91,96" && near(python.recomputed.maxAbsolutePsfAdjustment, 0.005902), "RC71 independent PSF diagnostics changed");
assert(python.recomputed.apertureStarRange.join(",") === "129,200" && python.recomputed.gates.psf === false, "RC71 independent aperture or failure boundary changed");

assert(comparison.detectors.length === 2 && comparison.detectors.map(row => row.detector).join(",") === "NRCB1,NRCB2", "RC71 cross-detector comparison scope changed");
assert(near(comparison.exactContrasts.catalogueRowRatioNrcb2OverNrcb1, 29382 / 14140), "RC71 catalogue ratio changed");
assert(comparison.exactContrasts.minimumMatchedStarDifference === 356 && comparison.exactContrasts.maximumMatchedStarDifference === 496, "RC71 alignment contrast changed");
assert(comparison.exactContrasts.minimumPsfStarDifference === -29 && comparison.exactContrasts.maximumPsfStarDifference === -25, "RC71 PSF contrast changed");
assert(comparison.decision.includes("fails only the PSF-star-count") && comparison.inferenceBoundary.includes("do not establish"), "RC71 comparison claim boundary changed");

assert(sourceReview.sources.length === 5 && sourceReview.sources.filter(source => source.type.startsWith("primary")).length === 2, "RC71 source review is incomplete");
assert(sourceReview.classification.verifiedBeforeRun.length === 4 && sourceReview.classification.inferencesToTest.length === 2 && sourceReview.classification.proposalsNotYetValidated.length === 2, "RC71 fact/inference/proposal boundary is incomplete");
assert(priorArt.establishedMethods.length === 4 && priorArt.validityConditions.length === 5 && priorArt.breakConditions.length === 4 && priorArt.searchQueries.length === 5, "RC71 prior-art boundary is incomplete");
assert(priorArt.noveltyBoundary.startsWith("No claim"), "RC71 novelty qualification changed");
assert(cycleResult.newVerifiedFacts.length === 11 && cycleResult.hypothesisAdjudication.length === 4 && cycleResult.failedOrRejectedAttempts.length === 5, "RC71 research record is incomplete");
assert(cycleResult.survivingHypotheses.length === 3 && cycleResult.uncertaintyBudget.length === 5 && cycleResult.connections.length === 1, "RC71 surviving hypotheses, uncertainty, or connection record is incomplete");
assert(cycleResult.claimBoundary.includes("does not prove") && cycleResult.claimBoundary.includes("does not estimate"), "RC71 scientific claim boundary changed");
assert(cycleResult.exactNextStart.includes("coordinate-hash") && cycleResult.exactNextStart.includes("100-star gate as passed"), "RC71 exact next start is missing");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 69 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInNewContext(text(file), sandbox, { filename: file });
const problems = sandbox.window.PROBLEMS || [];
const sources = sandbox.window.CATALOG_SOURCES || {};
const cycles = sandbox.window.RESEARCH_CYCLES || [];
const connections = sandbox.window.RESEARCH_CONNECTIONS || [];
assert(problems.length === 744 && cycles.length === 71 && connections.length === 71, "RC71 site catalogue totals changed");
assert(Object.keys(sources).length === 386, "RC71 source total changed");
assert(problems.reduce((sum, problem) => sum + (problem.researchHistory || []).length, 0) === 228, "RC71 problem-cycle record total changed");
const siteCycle = cycles.find(cycle => cycle.id === "RC-2026-71");
assert(siteCycle?.problemIds.join(",") === "UP-003,UP-625,UP-626" && siteCycle.connectionIds[0] === "CONN-EVIDENCE-041", "RC71 public cycle scope changed");
assert(siteCycle.verifiedFindings.length === 10 && siteCycle.resultMatrix.rows.length === 11 && siteCycle.artifacts.length === 12 && siteCycle.log.length === 8, "RC71 public cycle record is incomplete");
assert(siteCycle.resultMatrix.rows.some(row => row.label === "PSF PER IMAGE" && row.values[2].text === "실패"), "RC71 public matrix hides the PSF failure");
assert(siteCycle.sharedProgram.stopRule.text.includes("검증별 재사용") && siteCycle.nextCycle.text.includes("소급 변경하지 않는다"), "RC71 public stop or adaptation boundary is missing");
for (const id of siteCycle.problemIds) {
  const problem = problems.find(row => row.id === id);
  const record = (problem?.researchHistory || []).find(row => row.cycleId === "RC-2026-71");
  assert(problem?.cycleResearch === record, `${id}: RC71 is not the current focused record`);
  assert(record?.focusedPage && record.technicalAxes.length === 3 && record.causalChain.length === 4 && record.hypotheses.length === 3 && record.workPackages.length === 3 && record.uncertaintyBudget.length === 4 && record.decisionTree.length === 4, `${id}: RC71 focused record is incomplete`);
  for (const key of ["role", "centralQuestion", "resolutionCriterion", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record?.[key]?.text?.length > 50 && record?.[key]?.textEn?.length > 75, `${id}: RC71 ${key} is not substantive and bilingual`);
  }
}
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.text)).size === 3, "RC71 Korean narratives are duplicated");
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.textEn)).size === 3, "RC71 English narratives are duplicated");
const connection = connections.find(item => item.id === "CONN-EVIDENCE-041");
assert(connection?.reviewedOn === "2026-09-01" && connection.validationStatus.text.includes("PSF count transport"), "RC71 connection update is missing");

for (const page of ["index.html", "solve.html", "research-log.html"]) assert(text(page).includes("research-cycle-71-data.js?v=20260901-cycle71"), `${page}: RC71 script is missing`);
assert(Number(text("scripts/generate-sitemap.mjs").match(/length:\s*(\d+)/)?.[1]) >= 69, "Sitemap generator omits RC71");
assert((text("sitemap.xml").match(/<loc>/g) || []).length >= 1632, "RC71 sitemap URL count changed");
const publicProse = text("research-cycle-71-data.js");
for (const forbidden of ["전공자 포인트", "1단계", "개수를 맞", "아래 시도는 개별 논문"]) assert(!publicProse.includes(forbidden), `RC71 public prose contains forbidden wording: ${forbidden}`);

if (failures.length) {
  console.error(`RC71 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC71 verified: NRCB2 WCS/alignment/aperture gates pass, the preregistered PSF-star gate fails, warnings and receipts reproduce independently, downstream gates remain closed, and bilingual records preserve the failure boundary.");
