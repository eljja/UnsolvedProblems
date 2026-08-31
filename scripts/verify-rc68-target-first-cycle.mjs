import fs from "node:fs";
import vm from "node:vm";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const near = (actual, expected, tolerance = 1e-10) => Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
const readText = file => fs.readFileSync(file, "utf8");
const read = file => JSON.parse(readText(file));

const spec = read("research/reproducibility/rc68-target-first-ledger-spec.json");
const manifest = read("research/reproducibility/rc68-target-first-source-manifest.json");
const py = read("research/reproducibility/rc68-target-first-ledger-python.json");
const js = read("research/reproducibility/rc68-target-first-ledger-node.json");
const cycleResult = read("research/reproducibility/rc68-target-first-cycle-result.json");
const connectionArtifact = read("research/reproducibility/rc68-segmentation-collision-connection.json");
const injectionContract = read("research/reproducibility/rc68-collision-ast-contract.json");
const priorArt = read("research/reproducibility/rc68-prior-art-boundary.json");

assert(spec.cycleId === "RC-2026-68" && spec.experimentId === "PHOST-PF1A", "RC68 experiment identity changed");
assert(spec.selectedProblems.join(",") === "UP-003,UP-625,UP-626", "RC68 problem scope changed");
assert(spec.frozenInputs.coordinateTransform.xArcsec === 0.02 && spec.frozenInputs.coordinateTransform.yArcsec === -0.08, "RC68 frozen transform changed");
assert(spec.ledgerGate.rowsPerBand === 142 && spec.frozenInputs.catalogMatchRadiusArcsec === 0.3, "RC68 target frame or match radius changed");
assert(spec.measurementReceipts.reference.apertureRadiusPixels.F090W === 2.3332438 && spec.measurementReceipts.sensitivity.apertureRadiusPixels.F150W === 1.5689266, "RC68 aperture receipts changed");
assert(spec.stopRules.length === 5 && spec.sealedAdjudicands.length === 6, "RC68 claim-control family changed");

assert(manifest.files.length === 7 && manifest.pipelineVersion === "2.0.1" && manifest.pipelineDate === "2026-07-18", "RC68 source manifest changed");
const expectedSources = {
  "f090w_i2d.fits": [1216140480, "eeb24ecd78f08ef78f43da9324a0a364bfbaa6273eebe779829cf049ee212ffc"],
  "f090w_segm.fits": [173845440, "ef1a829435ed182fabdbc3a322aa6755bcafbefd82a7e23f6663fe1b770d50a1"],
  "f150w_i2d.fits": [1216140480, "562ff6afd1e03c9ba5d8ce73649ded3b4b66f1e901be30cbea9ae23bbfec54c0"],
  "f150w_segm.fits": [173845440, "08b5c1d8194f00d1789de5cef62eb5c497c31cbd30c0b85e8fb609628e39b4ce"]
};
for (const [name, [bytes, sha256]] of Object.entries(expectedSources)) {
  const item = manifest.files.find(row => row.path.endsWith(name));
  assert(item?.bytes === bytes && item?.sha256 === sha256, `${name}: RC68 official source receipt changed`);
}
assert(manifest.files.filter(row => row.path.includes("rc68-target-first")).reduce((sum, row) => sum + row.bytes, 0) === 2779971840, "RC68 four-product byte total changed");

assert(py.cycleId === "RC-2026-68" && py.experimentId === "PHOST-PF1A", "RC68 Python result identity changed");
assert(py.aggregate.ledgerRows === 284 && py.aggregate.expectedRows === 284 && py.ledger.length === 284, "RC68 Python ledger is incomplete");
const uniqueKeys = new Set(py.ledger.map(row => `${row.authorId}:${row.band}`));
assert(uniqueKeys.size === 284, "RC68 target-band identities are not unique");
assert(Math.min(...py.ledger.map(row => row.edgeDistancePixels)) > 39.62, "RC68 minimum edge margin changed");
const expectedBand = {
  F090W: { validCoverage: 142, centerSegmented: 71, catalogMatched: 42, catalogMisses: 100, catalogMissCenterSegmented: 35, catalogMissReferenceSnrAbove5: 100, referenceBackgroundFallbacks: 18 },
  F150W: { validCoverage: 142, centerSegmented: 116, catalogMatched: 57, catalogMisses: 85, catalogMissCenterSegmented: 64, catalogMissReferenceSnrAbove5: 85, referenceBackgroundFallbacks: 41 }
};
for (const [band, expected] of Object.entries(expectedBand)) {
  const actual = py.aggregate.bands[band];
  for (const [key, value] of Object.entries(expected)) assert(actual[key] === value, `${band}: RC68 aggregate changed: ${key}`);
  assert(actual.referencePositiveFlux === 142 && actual.sensitivityPositiveFlux === 142 && actual.fluxSignDiscordance === 0, `${band}: RC68 aperture sign state changed`);
}
const f090Groups = py.aggregate.bands.F090W.centerIslandMultiplicity.largestTargetGroups;
const f150Groups = py.aggregate.bands.F150W.centerIslandMultiplicity.largestTargetGroups;
assert(f090Groups[0].label === 1352 && f090Groups[0].targets === 11 && f090Groups[0].isophotalAreaPixels === 1160958, "RC68 F090W largest collision changed");
assert(f150Groups[0].label === 2532 && f150Groups[0].targets === 18 && f150Groups[0].isophotalAreaPixels === 2726434, "RC68 F150W largest collision changed");
assert(near(py.aggregate.bands.F090W.reductionAgreement.spearmanFlux, 0.9215576152945048), "RC68 F090W aperture rank agreement changed");
assert(near(py.aggregate.bands.F150W.reductionAgreement.spearmanFlux, 0.9293238975588392), "RC68 F150W aperture rank agreement changed");
assert(near(py.aggregate.bands.F090W.reductionAgreement.referenceMinusSensitivityVegaMag.median, -0.32121153014941406), "RC68 F090W aperture sensitivity changed");
assert(near(py.aggregate.bands.F150W.reductionAgreement.referenceMinusSensitivityVegaMag.median, -0.2634727281707576), "RC68 F150W aperture sensitivity changed");
const residuals = py.aggregate.f150wDevelopmentCalibratedResiduals;
assert(near(residuals.reference.validationTidalMinusSpiralMeanResidualMag, 0.048544836102569565), "RC68 reference component residual changed");
assert(near(residuals.sensitivity.validationTidalMinusSpiralMeanResidualMag, 0.02346868370066578), "RC68 sensitivity component residual changed");
assert(Math.abs(residuals.reference.validationTidalMinusSpiralMeanResidualMag - residuals.sensitivity.validationTidalMinusSpiralMeanResidualMag) > 0.025, "RC68 0.01-mag robustness failure disappeared");
assert(py.gates.targetFirstRowsComplete && py.gates.allCoordinatesHaveValidCoverage && py.gates.noRowsDeletedForCatalogMiss && py.gates.mosaicApertureLayerClosed, "RC68 closed observation gates regressed");
assert(!py.gates.exposureLevelDolphotReproduced && !py.gates.artificialStarSelectionSurfaceClosed && !py.gates.phaseLedgerClosed && !py.gates.authorSelectionLineageClosed && !py.gates.globalH0Refit, "RC68 claim boundary changed");

assert(js.implementation.startsWith("dependency-free-node") && js.rows === 284 && js.mismatches.length === 0, "RC68 Node replay failed");
assert(Object.values(js.gates).every(Boolean), "RC68 Node numerical gates failed");
assert(js.maxAbsoluteDifference.x < 3e-9 && js.maxAbsoluteDifference.y < 4e-9, "RC68 independent WCS disagreement increased");
assert(js.maxAbsoluteDifference["reference.fluxJy"] === 0 && js.maxAbsoluteDifference["reference.pipelineErrorJy"] < 2e-24, "RC68 independent aperture disagreement increased");
for (const band of Object.keys(expectedBand)) {
  for (const key of ["rows", "validCoverage", "centerSegmented", "catalogMatched", "catalogMisses", "catalogMissCenterSegmented", "catalogMissReferenceSnrAbove5", "referencePositiveFlux", "sensitivityPositiveFlux", "fluxSignDiscordance"]) {
    assert(js.counts[band][key] === py.aggregate.bands[band][key], `${band}: Python/Node mismatch for ${key}`);
  }
}

const csvLines = readText("research/reproducibility/rc68-target-first-ledger.csv").trim().split(/\r?\n/);
assert(csvLines.length === 285 && csvLines[0].includes("authorId") && csvLines[0].includes("centerSegmentationLabel"), "RC68 CSV ledger is incomplete");
assert(cycleResult.newVerifiedFacts.length === 12 && cycleResult.hypothesisAdjudication.length === 6 && cycleResult.workPackages.length === 3, "RC68 research record is incomplete");
assert(cycleResult.failedOrRejectedAttempts.length === 7 && cycleResult.exactNextStart.includes("PHOST-COLLISION-AST-1"), "RC68 failure history or exact handoff is missing");
assert(connectionArtifact.id === "CONN-EVIDENCE-041" && connectionArtifact.problemIds.join(",") === "UP-003,UP-625,UP-626", "RC68 connection artifact changed");
assert(connectionArtifact.validWhen.length === 5 && connectionArtifact.breaksWhen.length === 5 && connectionArtifact.minimumValidationTest.length > 500, "RC68 structural connection is not falsifiable enough");
assert(injectionContract.contractId === "PHOST-COLLISION-AST-1" && injectionContract.pilot.sample.startsWith("Forty-eight") && injectionContract.hypotheses.length === 3 && injectionContract.uncertaintyBudget.length === 6, "RC68 injection contract changed");
assert(injectionContract.pilot.intervention.includes("3,072 injections per band and pipeline") && injectionContract.success.includes("0.01 mag"), "RC68 intervention denominator or gate changed");
assert(priorArt.queries.length === 5 && priorArt.verifiedExistingMethods.length === 5 && priorArt.notVerifiedInReviewedSources.length === 5 && priorArt.primarySources.length === 7, "RC68 prior-art boundary changed");
assert(priorArt.noveltyBoundary.startsWith("No constituent method is claimed as new"), "RC68 novelty qualification changed");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 66 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInNewContext(readText(file), sandbox, { filename: file });
const problems = sandbox.window.PROBLEMS || [];
const sources = sandbox.window.CATALOG_SOURCES || {};
const cycles = sandbox.window.RESEARCH_CYCLES || [];
const connections = sandbox.window.RESEARCH_CONNECTIONS || [];
assert(problems.length === 744 && Object.keys(sources).length === 379 && cycles.length === 68 && connections.length === 71, "RC68 site catalogue totals changed");
assert(problems.reduce((sum, problem) => sum + (problem.researchHistory || []).length, 0) === 219, "RC68 problem-cycle record total changed");
assert(problems.filter(problem => (problem.researchHistory || []).length > 0).length === 20, "RC68 deeply researched problem total changed");
const siteCycle = cycles.find(item => item.id === "RC-2026-68");
assert(siteCycle?.problemIds.join(",") === "UP-003,UP-625,UP-626" && siteCycle.connectionIds[0] === "CONN-EVIDENCE-041", "RC68 public cycle is missing");
assert(siteCycle.verifiedFindings.length === 12 && siteCycle.resultMatrix.rows.length === 10 && siteCycle.artifacts.length === 9 && siteCycle.log.length === 9, "RC68 public cycle record is incomplete");
for (const id of siteCycle.problemIds) {
  const problem = problems.find(item => item.id === id);
  const record = (problem.researchHistory || []).find(item => item.cycleId === "RC-2026-68");
  assert(problem?.cycleResearch === record, `${id}: RC68 is not the current focused record`);
  assert(record?.focusedPage && record.technicalAxes.length === 3 && record.causalChain.length === 5 && record.hypotheses.length === 4 && record.workPackages.length === 3 && record.uncertaintyBudget.length === 4 && record.decisionTree.length === 4, `${id}: RC68 focused record is incomplete`);
  for (const key of ["role", "centralQuestion", "resolutionCriterion", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) assert(record?.[key]?.text?.length > 55 && record?.[key]?.textEn?.length > 85, `${id}: RC68 ${key} is not substantive and bilingual`);
}
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.text)).size === 3, "RC68 Korean narratives are duplicated");
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.textEn)).size === 3, "RC68 English narratives are duplicated");
assert(sources.jwst_resampled_science_products_2026.publishedOn === "2026-07-18" && sources.dolphot_jwst_crowded_photometry_2024.publishedOn === "2024-04-01" && sources.linear_field_deblending_2021.publishedOn === "2021-06-15", "RC68 primary-source dates are missing");

for (const page of ["index.html", "solve.html", "research-log.html"]) assert(readText(page).includes("research-cycle-68-data.js?v=20260831-cycle68"), `${page}: RC68 script is missing`);
assert(readText("scripts/generate-sitemap.mjs").includes("length: 66"), "Sitemap generator omits RC68");
const publicProse = readText("research-cycle-68-data.js");
for (const forbidden of ["전공자 포인트", "1단계", "개수를 맞", "아래 시도는 개별 논문"]) assert(!publicProse.includes(forbidden), `RC68 public prose contains forbidden wording: ${forbidden}`);

if (failures.length) {
  console.error(`RC68 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC68 verified: official-product receipts, 284-row target frame, segmentation collisions, aperture sensitivity, independent FITS/WCS replay, injection contract, and bilingual site records agree.");
