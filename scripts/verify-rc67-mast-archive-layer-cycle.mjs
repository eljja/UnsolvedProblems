import fs from "node:fs";
import vm from "node:vm";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const near = (actual, expected, tolerance = 1e-10) => Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
const readText = file => fs.readFileSync(file, "utf8");
const read = file => JSON.parse(readText(file));

const spec = read("research/reproducibility/rc67-archive-layer-spec.json");
const manifest = read("research/reproducibility/rc67-mast-source-manifest.json");
const py = read("research/reproducibility/rc67-archive-layer-python.json");
const js = read("research/reproducibility/rc67-archive-layer-node.json");
const cycleResult = read("research/reproducibility/rc67-archive-layer-cycle-result.json");
const connectionArtifact = read("research/reproducibility/rc67-detection-selection-connection.json");
const forcedContract = read("research/reproducibility/rc67-position-forced-photometry-contract.json");
const priorArt = read("research/reproducibility/rc67-prior-art-boundary.json");

assert(spec.cycleId === "RC-2026-67" && spec.selectedProblems.join(",") === "UP-003,UP-625,UP-626", "RC67 scope changed");
assert(spec.frozenDesign.developmentSplit.includes("Even") && spec.frozenDesign.validationSplit.includes("Odd"), "RC67 split changed");
assert(spec.frozenDesign.validationRadiiArcsec.join(",") === "0.05,0.1,0.15,0.2,0.3,0.5", "RC67 radius family changed");
assert(spec.frozenDesign.negativeControls.count === 36 && spec.frozenDesign.negativeControls.radiusArcsec === 5, "RC67 control family changed");
assert(spec.crossmatchGate.confirmatoryRadiusArcsec === 0.3 && spec.independentImplementationGate.implementations.length === 2, "RC67 adjudication gate changed");

assert(manifest.files.length === 7 && manifest.doi === "10.17909/96p0-6z78", "RC67 source inventory changed");
assert(manifest.files.find(row => row.path.endsWith("f090w_cat.ecsv"))?.sha256 === "9b0063362639b6933b097bcde34305c57485146b3f8dbbab27a4f57fddc3951f", "RC67 F090W hash changed");
assert(manifest.files.find(row => row.path.endsWith("f150w_cat.ecsv"))?.sha256 === "f50661a091197dc795038ed206061be5bcb4a38567f757cc9cff6334811aa58a", "RC67 F150W hash changed");

assert(py.sourceAudit.allHashesMatch && py.doiInventory.rows === 115, "RC67 Python source or DOI audit failed");
assert(py.doiInventory.proposalCounts[2875] === 40 && py.doiInventory.proposalCounts[1995] === 39 && py.doiInventory.proposalCounts[1685] === 36, "RC67 DOI proposal counts changed");
assert(py.doiInventory.instrumentCounts["NIRCAM/IMAGE"] === 87 && py.doiInventory.instrumentCounts["NIRISS/IMAGE"] === 28, "RC67 DOI instrument counts changed");
assert(py.ngc3447Archive.observationRows === 6 && py.ngc3447Archive.productRows === 1428 && py.ngc3447Archive.level3CatalogRows === 6, "RC67 NGC 3447 archive inventory changed");
assert(near(py.ngc3447Archive.spanDays, 0.061417164353770204) && !py.ngc3447Archive.secondEpochPublic, "RC67 epoch boundary changed");
assert(py.catalogAudit.f090w.rows === 6636 && py.catalogAudit.f150w.rows === 11327, "RC67 catalog row count changed");
assert(py.catalogAudit.f090w.columns === 59 && py.catalogAudit.f150w.columns === 59, "RC67 catalog schema changed");
assert(py.catalogAudit.f090w.requiredAuthorFieldsMissing.length === 11 && py.catalogAudit.f150w.requiredAuthorFieldsPresent.length === 0, "RC67 semantic audit changed");

assert(py.split.developmentRows === 63 && py.split.validationRows === 79, "RC67 split population changed");
for (const band of ["f090w", "f150w"]) {
  assert(near(py.translation[band].xArcsec, 0.02) && near(py.translation[band].yArcsec, -0.08), `${band}: RC67 translation changed`);
}
assert(py.validationSensitivity.f090w.map(row => row.matched).join(",") === "4,10,15,16,25,37", "RC67 F090W validation sensitivity changed");
assert(py.validationSensitivity.f150w.map(row => row.matched).join(",") === "11,18,25,29,37,48", "RC67 F150W validation sensitivity changed");
assert(py.dualBandValidation.map(row => row.matched).join(",") === "1,2,7,8,15,25", "RC67 dual-band sensitivity changed");
const dual03 = py.dualBandValidation.find(row => near(row.radiusArcsec, 0.3));
assert(dual03.components.tidal.matched === 14 && dual03.components.tidal.total === 30, "RC67 tidal recovery changed");
assert(dual03.components.spiral.matched === 1 && dual03.components.spiral.total === 35 && dual03.components.other.matched === 0, "RC67 spiral or other recovery changed");
assert(near(py.dualBandControlsAt0_3.summary.all.mean, 4.666666666666667) && near(py.dualBandControlsAt0_3.summary.all.sampleStandardDeviation, 1.867006771737662), "RC67 shifted controls changed");
assert(near(py.componentRecoveryExactTestAt0_3.oddsRatio, 29.75) && near(py.componentRecoveryExactTestAt0_3.greaterPValue, 2.5291952921516962e-5) && near(py.componentRecoveryExactTestAt0_3.twoSidedPValue, 4.095414875734042e-5), "RC67 exact component test changed");
assert(py.f150wResidualDiagnosticAt0_1.all.count === 18 && near(py.f150wResidualDiagnosticAt0_1.all.rootMeanSquare, 0.3121654329406488), "RC67 F150W residual diagnostic changed");
assert(py.f150wResidualDiagnosticAt0_1.unextendedOnly.count === 9 && near(py.f150wResidualDiagnosticAt0_1.unextendedOnly.rootMeanSquare, 0.1531526410483807), "RC67 point-source residual diagnostic changed");
assert(py.identityAudit.matchedCatalogLabelEqualsAuthorIdAt0_3.f090w === 0 && py.identityAudit.matchedCatalogLabelEqualsAuthorIdAt0_3.f150w === 0, "RC67 identity equality changed");
assert(py.gates.doiInventory && py.gates.observationIdentity && py.gates.publicLevel3CatalogLayer && py.gates.archiveCatalogRecoverabilityDiagnostic, "RC67 closed gates regressed");
assert(!py.gates.coordinateCrosswalkComplete && !py.gates.authorIdentityMapping && !py.gates.phaseLedger && !py.gates.selectionLineage && !py.gates.objectCovariance && !py.gates.secondEpoch && !py.gates.customPsfPhotometryReproduced && !py.gates.globalH0Refit, "RC67 claim boundary changed");

assert(js.implementation === "dependency-free-node" && js.sourceAudit.allHashesMatch, "RC67 Node source audit failed");
for (const band of ["f090w", "f150w"]) {
  for (const key of ["xArcsec", "yArcsec", "developmentMatchesAt0_1", "matchedSquaredResidual"]) assert(near(js.translation[band][key], py.translation[band][key]), `${band}: independent translation mismatch: ${key}`);
  for (let index = 0; index < py.validationSensitivity[band].length; index += 1) {
    assert(js.validationSensitivity[band][index].matched === py.validationSensitivity[band][index].matched, `${band}: independent validation mismatch at radius index ${index}`);
    assert(near(js.negativeControlSensitivity[band][index].mean, py.negativeControlSensitivity[band][index].mean), `${band}: independent control mismatch at radius index ${index}`);
  }
}
for (let index = 0; index < py.dualBandValidation.length; index += 1) assert(js.dualBandValidation[index].matched === py.dualBandValidation[index].matched, `Independent dual-band mismatch at radius index ${index}`);
for (const key of ["oddsRatio", "greaterPValue", "twoSidedPValue"]) assert(near(js.componentRecoveryExactTestAt0_3[key], py.componentRecoveryExactTestAt0_3[key]), `Independent exact-test mismatch: ${key}`);
for (const group of ["all", "unextendedOnly"]) for (const key of ["count", "median", "mean", "sampleStandardDeviation", "rootMeanSquare"]) assert(near(js.f150wResidualDiagnosticAt0_1[group][key], py.f150wResidualDiagnosticAt0_1[group][key]), `Independent residual mismatch: ${group}.${key}`);

assert(cycleResult.newVerifiedFacts.length === 14 && cycleResult.hypothesisAdjudication.length === 6 && cycleResult.workPackages.length === 3, "RC67 research record is incomplete");
assert(cycleResult.failedOrRejectedAttempts.length === 6 && cycleResult.exactNextStart.includes("PHOST-FORCED-1"), "RC67 failure history or handoff missing");
assert(connectionArtifact.id === "CONN-EVIDENCE-040" && connectionArtifact.problemIds.join(",") === "UP-003,UP-625,UP-626", "RC67 connection artifact changed");
assert(connectionArtifact.validWhen.length === 5 && connectionArtifact.breaksWhen.length === 5 && connectionArtifact.minimumValidationTest.length > 500, "RC67 connection is not falsifiable enough");
assert(forcedContract.contractId === "PHOST-FORCED-1" && forcedContract.workPackages.length === 3 && forcedContract.uncertaintyBudget.length === 5, "RC67 forced-photometry contract changed");
assert(priorArt.queries.length === 5 && priorArt.notVerifiedInReviewedSources.length === 5 && priorArt.primarySources.length === 5, "RC67 prior-art boundary changed");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 65 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInNewContext(readText(file), sandbox, { filename: file });
const problems = sandbox.window.PROBLEMS || [];
const sources = sandbox.window.CATALOG_SOURCES || {};
const cycles = sandbox.window.RESEARCH_CYCLES || [];
const connections = sandbox.window.RESEARCH_CONNECTIONS || [];
assert(problems.length === 744 && Object.keys(sources).length === 373 && cycles.length === 67 && connections.length === 70, "RC67 site catalogue totals changed");
assert(problems.reduce((sum, problem) => sum + (problem.researchHistory || []).length, 0) === 216, "RC67 problem-cycle record total changed");
assert(problems.filter(problem => (problem.researchHistory || []).length > 0).length === 20, "RC67 deeply researched problem total changed");
const siteCycle = cycles.find(item => item.id === "RC-2026-67");
assert(siteCycle?.problemIds.join(",") === "UP-003,UP-625,UP-626" && siteCycle.connectionIds[0] === "CONN-EVIDENCE-040", "RC67 site cycle missing");
assert(siteCycle.verifiedFindings.length === 11 && siteCycle.resultMatrix.rows.length === 10 && siteCycle.artifacts.length === 8 && siteCycle.log.length === 9, "RC67 public cycle record incomplete");
for (const id of siteCycle.problemIds) {
  const problem = problems.find(item => item.id === id);
  const record = (problem.researchHistory || []).find(item => item.cycleId === "RC-2026-67");
  assert(record?.focusedPage && record.causalChain.length === 5 && record.hypotheses.length === 4 && record.workPackages.length === 3 && record.uncertaintyBudget.length === 4 && record.decisionTree.length === 4, `${id}: RC67 focused record incomplete`);
}
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.text)).size === 3, "RC67 Korean narratives are duplicated");
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.textEn)).size === 3, "RC67 English narratives are duplicated");
assert(sources.mast_jwst_cepheid_doi_2025.publishedOn === "2025-08-19" && sources.mast_ngc3447_level3_catalogs_2026.publishedOn === "2026-07-18", "RC67 primary source dates missing");

for (const page of ["index.html", "solve.html", "research-log.html"]) assert(readText(page).includes("research-cycle-67-data.js?v=20260831-cycle67"), `${page}: RC67 script missing`);
assert(Number(readText("scripts/generate-sitemap.mjs").match(/length: (\d+)/)?.[1]) >= 65, "Sitemap generator omits RC67");
const publicProse = readText("research-cycle-67-data.js");
for (const forbidden of ["전공자 포인트", "1단계", "개수를 맞", "아래 시도는 개별 논문"]) assert(!publicProse.includes(forbidden), `RC67 public prose contains forbidden wording: ${forbidden}`);

if (failures.length) {
  console.error(`RC67 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC67 verified: MAST inventory, catalog semantics, split crossmatch, shifted controls, component exact test, independent implementation, and bilingual site records agree.");
