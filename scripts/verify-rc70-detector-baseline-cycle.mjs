import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const text = file => fs.readFileSync(file, "utf8");
const read = file => JSON.parse(text(file));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const near = (actual, expected, tolerance = 1e-9) => Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
const repro = "research/reproducibility/";

const design = read(`${repro}rc70-detector-tile-design.json`);
const designAudit = read(`${repro}rc70-detector-design-node-audit.json`);
const runManifest = read(`${repro}rc70-detector-baseline-run-manifest.json`);
const result = read(`${repro}rc70-nrcb1-detector-baseline-result.json`);
const python = read(`${repro}rc70-nrcb1-detector-baseline-python-audit.json`);
const sourceReview = read(`${repro}rc70-source-review.json`);
const priorArt = read(`${repro}rc70-prior-art-boundary.json`);
const cycleResult = read(`${repro}rc70-detector-baseline-cycle-result.json`);

assert(design.cycleId === "RC-2026-70" && design.inputBoundary.calExposureCount === 32, "RC70 design identity or exposure count changed");
assert(design.tiles.length === 4 && design.tiles.every(tile => tile.expectedImageIndices.length === 8 && tile.edgeMarginInEveryExposure >= 64), "RC70 WCS tile support changed");
assert(new Set(design.tiles.flatMap(tile => tile.expectedImageIndices)).size === 32, "RC70 expected-image sets no longer partition 32 exposures");
assert(design.tiles.every(tile => tile.filterCounts.F090W === 4 && tile.filterCounts.F150W === 4 && tile.dithers.length === 4), "RC70 band/dither balance changed");
assert(design.design.selection.includes("nearest-to-median") && design.design.reason.includes("not all four"), "RC70 outcome-blind selection rule changed");

assert(designAudit.verified.exposureCount === 32 && designAudit.verified.detectorCount === 4 && designAudit.verified.inputOutcomeSeparation, "RC70 independent design audit failed");
assert(designAudit.tiles.length === 4 && designAudit.tiles.every(tile => /^[a-f0-9]{64}$/.test(tile.parameterSha256)), "RC70 parameter hashes are incomplete");
assert(runManifest.changedParameter === "photsec only" && runManifest.invariantParameters.length === 7, "RC70 baseline parameter contract changed");
for (const tile of runManifest.tiles) {
  const file = tile.parameterFile;
  const receipt = designAudit.tiles.find(row => row.tileId === tile.tileId);
  assert(fs.existsSync(file) && hash(file) === receipt.parameterSha256, `${tile.tileId}: RC70 parameter file or hash changed`);
}

assert(result.experimentId.endsWith("NRCB1-PILOT") && result.tile.detector === "NRCB1", "RC70 pilot identity changed");
assert(result.alignment.length === 32 && result.psf.length === 32 && result.aperture.length === 32, "RC70 diagnostic row count changed");
const expectedAlignment = result.alignment.filter(row => row.expected);
const expectedPsf = result.psf.filter(row => row.expected);
const expectedAperture = result.aperture.filter(row => row.expected);
assert(expectedAlignment.length === 8 && Math.min(...expectedAlignment.map(row => row.matched)) === 983 && Math.max(...expectedAlignment.map(row => row.matched)) === 1039, "RC70 matched-star range changed");
assert(Math.min(...expectedAlignment.map(row => row.sigmaPixels)) === 0.08 && Math.max(...expectedAlignment.map(row => row.sigmaPixels)) === 0.10, "RC70 alignment sigma range changed");
assert(Math.min(...expectedPsf.map(row => row.stars)) === 120 && Math.max(...expectedPsf.map(row => row.stars)) === 121, "RC70 PSF-star range changed");
assert(near(Math.max(...expectedPsf.map(row => Math.abs(row.centralPixelAdjustment))), 0.00285), "RC70 PSF adjustment changed");
assert(expectedAperture.every(row => row.stars === 200), "RC70 aperture-star counts changed");
assert(Object.values(result.gates).slice(0, 5).every(gate => gate.pass) && !result.gates.fourDetectorBaseline.pass && !result.gates.sealedAst.pass, "RC70 stop/go boundary changed");
assert(result.warnings.totalLines === 72 && result.warnings.expectedExposureWarnings === 0 && result.warnings.warningsOnlyOutsideSupport, "RC70 typed warning boundary changed");
assert(result.output.catalogueRows === 14140 && result.output.timing.elapsed === "39:11.13" && result.output.timing.maximumResidentKb === 2443108, "RC70 catalogue or timing receipt changed");
for (const receipt of result.output.receipts) {
  assert(fs.existsSync(receipt.file) && fs.statSync(receipt.file).size === receipt.bytes && hash(receipt.file) === receipt.sha256, `${receipt.kind}: RC70 committed receipt changed`);
}

assert(python.status === "pass" && Object.values(python.checks).every(Boolean), "RC70 independent Python audit failed");
assert(python.recomputed.matchedRange.join(",") === "983,1039" && python.recomputed.psfStarRange.join(",") === "120,121", "RC70 independent ranges changed");
assert(python.recomputed.apertureStarRange.join(",") === "200,200" && near(python.recomputed.maxAbsolutePsfAdjustment, 0.00285), "RC70 independent photometric diagnostics changed");
assert(sourceReview.sources.length === 5 && sourceReview.sources.filter(source => source.type === "primary-paper").length === 2, "RC70 source review is incomplete");
assert(priorArt.queries.length === 5 && priorArt.establishedMethods.length === 4 && priorArt.primarySources.length === 5, "RC70 prior-art boundary is incomplete");
assert(priorArt.noveltyBoundary.includes("constituent instrument geometry"), "RC70 novelty qualification changed");
assert(cycleResult.newVerifiedFacts.length === 10 && cycleResult.hypothesisAdjudication.length === 4, "RC70 research record is incomplete");
assert(cycleResult.failedOrRejectedAttempts.length === 5 && cycleResult.exactNextStart.includes("nrcb2.param"), "RC70 failures or exact handoff are missing");
assert(cycleResult.claimBoundary.includes("does not verify") && cycleResult.claimBoundary.includes("Hubble constant"), "RC70 scientific claim boundary changed");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 69 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInNewContext(text(file), sandbox, { filename: file });
const problems = sandbox.window.PROBLEMS || [];
const sources = sandbox.window.CATALOG_SOURCES || {};
const cycles = sandbox.window.RESEARCH_CYCLES || [];
const connections = sandbox.window.RESEARCH_CONNECTIONS || [];
assert(problems.length === 744 && (cycles.length === 70 || cycles.length === 71) && connections.length === 71, "RC70 site catalogue totals changed");
assert(Object.keys(sources).length === 386, "RC70 source total changed");
assert([225, 228].includes(problems.reduce((sum, problem) => sum + (problem.researchHistory || []).length, 0)), "RC70 problem-cycle record total changed");
const siteCycle = cycles.find(cycle => cycle.id === "RC-2026-70");
assert(siteCycle?.problemIds.join(",") === "UP-003,UP-625,UP-626" && siteCycle.connectionIds[0] === "CONN-EVIDENCE-041", "RC70 public cycle scope changed");
assert(siteCycle.verifiedFindings.length === 10 && siteCycle.resultMatrix.rows.length === 10 && siteCycle.artifacts.length === 12 && siteCycle.log.length === 8, "RC70 public cycle record is incomplete");
for (const id of siteCycle.problemIds) {
  const problem = problems.find(row => row.id === id);
  const record = (problem?.researchHistory || []).find(row => row.cycleId === "RC-2026-70");
  assert(record && problem?.researchHistory.includes(record), `${id}: RC70 focused record is missing`);
  assert(record?.focusedPage && record.technicalAxes.length === 3 && record.causalChain.length === 4 && record.hypotheses.length === 3 && record.workPackages.length === 3 && record.uncertaintyBudget.length === 4 && record.decisionTree.length === 4, `${id}: RC70 focused record is incomplete`);
  for (const key of ["role", "centralQuestion", "resolutionCriterion", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record?.[key]?.text?.length > 55 && record?.[key]?.textEn?.length > 85, `${id}: RC70 ${key} is not substantive and bilingual`);
  }
}
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.text)).size === 3, "RC70 Korean narratives are duplicated");
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.textEn)).size === 3, "RC70 English narratives are duplicated");
const connection = connections.find(item => item.id === "CONN-EVIDENCE-041");
assert(connection?.reviewedOn === "2026-09-01" && connection.validationStatus.text.includes("NRCB1"), "RC70 connection update is missing");
assert(sources.dolphot_output_quality_2026 && sources.nircam_field_of_view_2026 && sources.dolphot_parameter_definitions_2026, "RC70 official sources are missing");

for (const page of ["index.html", "solve.html", "research-log.html"]) assert(text(page).includes("research-cycle-70-data.js?v=20260901-cycle70"), `${page}: RC70 script is missing`);
assert(Number(text("scripts/generate-sitemap.mjs").match(/length:\s*(\d+)/)?.[1]) >= 68, "Sitemap generator omits RC70");
assert((text("sitemap.xml").match(/<loc>/g) || []).length >= 1630, "RC70 sitemap URL count changed");
const publicProse = text("research-cycle-70-data.js");
for (const forbidden of ["전공자 포인트", "1단계", "개수를 맞", "아래 시도는 개별 논문"]) assert(!publicProse.includes(forbidden), `RC70 public prose contains forbidden wording: ${forbidden}`);

if (failures.length) {
  console.error(`RC70 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC70 verified: detector support, NRCB1 alignment/PSF/aperture gates, typed warnings, independent parsing, scientific stop boundary, bilingual records, and site integration agree.");
