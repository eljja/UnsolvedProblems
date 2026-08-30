import fs from "node:fs";
import vm from "node:vm";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const near = (actual, expected, tolerance = 1e-10) => Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
const readText = path => fs.readFileSync(path, "utf8");
const read = path => JSON.parse(readText(path));

const spec = read("research/reproducibility/rc64-smc-cepheid-audit-spec.json");
const manifest = read("research/reproducibility/rc64-smc-source-manifest.json");
const py = read("research/reproducibility/rc64-smc-anchor-audit-python.json");
const js = read("research/reproducibility/rc64-smc-anchor-audit-node.json");
const cycleResult = read("research/reproducibility/rc64-smc-anchor-cycle-result.json");
const connectionArtifact = read("research/reproducibility/rc64-smc-breakpoint-connection.json");

assert(spec.cycleId === "RC-2026-64" && spec.source.expectedTable1Rows === 264 && spec.source.expectedTable2Rows === 88, "RC64 preregistration or source shape changed");
assert(spec.breakSearchGate.bootstrapReplicates === 20000 && spec.breakSearchGate.seed === 20260831 && spec.breakSearchGate.globalSignificanceThreshold === 0.01, "RC64 frozen breakpoint search changed");
assert(manifest.commit === "c06da1a2f28761d9149d8aeedf3ebfd3e1967312" && manifest.totalBytes === 33224, "RC64 source manifest changed");
assert(manifest.files[0].sha256 === "68db2618e65e794a8d7685332b7ed14232c70a1efcb390b087c1594f1eae94dc" && manifest.files[1].sha256 === "122930e4eedd790b0b01cb7133632d66ef5e28b42a7b39308435e4e8f8de9b55", "RC64 source hashes changed");

assert(py.semanticAudit.table1Rows === 264 && py.semanticAudit.table2Rows === 88 && py.semanticAudit.threeFilterCoverageComplete, "RC64 semantic source audit failed");
assert(py.semanticAudit.largeDriftFlaggedFrames === 17 && py.semanticAudit.largeDriftFlaggedCepheids === 13, "RC64 drift-flag counts changed");
assert(near(py.semanticAudit.maximumDerivedMHWResidualMag, 0.001514, 1e-12), "RC64 derived-magnitude identity changed");
assert(py.publishedBaselineReproduction.sampleSize === 87 && py.publishedBaselineReproduction.excludedCepheid === "OGLE-1455", "RC64 baseline sample changed");
assert(near(py.publishedBaselineReproduction.fit.interceptLogP0Mag, 16.46675149425288) && near(py.publishedBaselineReproduction.fit.rmsMag, 0.10162356861362029), "RC64 fixed-slope reproduction changed");
assert(near(py.publishedBaselineReproduction.freeFit.slope, -3.3157339707691027) && near(py.publishedBaselineReproduction.freeFit.slopeStandardError, 0.05262986768873524), "RC64 free-slope reproduction changed");
assert(py.singleCepheidInfluence.maximum.id === "OGLE-0896" && near(py.singleCepheidInfluence.maximum.absoluteShiftMag, 0.0026761454156698505), "RC64 single-Cepheid influence changed");
assert(near(py.geometryTransfer.externalDebGeometryRmsMag, 0.10220660864034829) && near(py.geometryTransfer.sameSampleAffineLeaveOneOutRmsMag, 0.10512669125199939), "RC64 geometry-transfer values changed");
assert(near(py.geometryTransfer.crossValidatedGainVersusExternalDebMag, -0.0029200826116510953) && !py.geometryTransfer.materialTransferSupported, "RC64 geometry-transfer decision changed");
assert(py.breakSearch.observed.pivotLogP === 0.959 && py.breakSearch.bootstrap.exceedances === 9994 && near(py.breakSearch.bootstrap.globalPValue, 0.49972501374931255, 1e-14), "RC64 breakpoint search changed");
assert(!py.breakSearch.breakSupported && !py.gates.sameSampleGeometryTransfers && !py.gates.periodBreak && !py.gates.globalNamedDeletion, "RC64 stop boundaries changed");
assert(near(py.analysisChoiceEnvelope.retainOutlier.deltaFromBaselineAtLogP1Mag, 0.0037882784743956677) && near(py.analysisChoiceEnvelope.naiveAlternateRNotAdmissible.deltaFromBaselineAtLogP1Mag, 0.024593678160925947), "RC64 analysis-choice ledger changed");

assert(js.implementation === "dependency-free-node" && js.semanticAudit.table1Rows === py.semanticAudit.table1Rows, "RC64 independent Node source audit changed");
assert(near(js.baseline.interceptLogP0Mag, py.publishedBaselineReproduction.fit.interceptLogP0Mag) && near(js.baseline.rmsMag, py.publishedBaselineReproduction.fit.rmsMag), "RC64 independent baseline mismatch");
assert(js.singleCepheidInfluence.maximum.id === py.singleCepheidInfluence.maximum.id && near(js.singleCepheidInfluence.maximum.shiftMag, py.singleCepheidInfluence.maximum.shiftMag), "RC64 independent object-influence mismatch");
assert(near(js.geometryTransfer.sameSampleAffineLeaveOneOutRmsMag, py.geometryTransfer.sameSampleAffineLeaveOneOutRmsMag) && near(js.geometryTransfer.crossValidatedGainVersusExternalDebMag, py.geometryTransfer.crossValidatedGainVersusExternalDebMag), "RC64 independent geometry mismatch");
assert(js.breakSearch.bootstrap.exceedances === py.breakSearch.bootstrap.exceedances && near(js.breakSearch.bootstrap.globalPValue, py.breakSearch.bootstrap.globalPValue, 1e-14), "RC64 independent breakpoint mismatch");

assert(cycleResult.newVerifiedFacts.length === 9 && cycleResult.hypothesisAdjudication.length === 5 && cycleResult.workPackages.length === 3, "RC64 research record is incomplete");
assert(cycleResult.failedOrRejectedAttempts.length === 4 && cycleResult.exactNextStart.includes("current semantic HST-JWST-SMC"), "RC64 failure history or exact handoff is missing");
assert(connectionArtifact.id === "CONN-EVIDENCE-037" && connectionArtifact.problemIds.join(",") === "UP-003,UP-625,UP-626", "RC64 structural-connection artifact changed");
assert(connectionArtifact.validWhen.length === 4 && connectionArtifact.breaksWhen.length === 4 && connectionArtifact.minimumValidationTest.length > 200, "RC64 structural connection lacks falsifiable conditions");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 62 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInNewContext(readText(file), sandbox, { filename: file });

const cycle = sandbox.window.RESEARCH_CYCLES.find(item => item.id === "RC-2026-64");
const connection = sandbox.window.RESEARCH_CONNECTIONS.find(item => item.id === "CONN-EVIDENCE-037");
assert(sandbox.window.RESEARCH_CYCLES.length === 64, "Site must expose 64 research cycles");
assert(Object.keys(sandbox.window.CATALOG_SOURCES).length === 364, "Site must expose 364 catalog sources");
assert(sandbox.window.PROBLEMS.filter(problem => problem.researchHistory?.length).length === 20, "Site must expose 20 deeply researched problems");
assert(sandbox.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 207, "Site must expose 207 problem-cycle records");
assert(sandbox.window.RESEARCH_CONNECTIONS.length === 67, "Site must expose 67 structural connections");
assert(cycle?.problemIds.join(",") === "UP-003,UP-625,UP-626" && cycle?.verifiedFindings.length === 9 && cycle?.artifacts.length === 6, "RC64 public cycle record is incomplete");
assert(cycle?.resultMatrix?.rows?.length === 7 && cycle?.resultMatrix?.columns?.length === 4 && cycle?.sourceIds.length === 7, "RC64 result matrix or source ledger is incomplete");
assert(connection?.strength === "strong" && connection.problemIds.includes("UP-626") && connection.minimumTest.text.length > 200, "RC64 calibration-transfer connection is incomplete");

for (const problemId of cycle?.problemIds || []) {
  const problem = sandbox.window.PROBLEMS.find(item => item.id === problemId);
  const record = problem?.researchHistory?.find(item => item.cycleId === "RC-2026-64");
  assert(problem?.cycleResearch === record, `${problemId} must expose RC64 as current research`);
  assert(record?.centralQuestion?.text?.length > 80 && record.centralQuestion.textEn.length > 120, `${problemId} needs a specific bilingual question`);
  assert(record?.updatedDefinition?.text?.length > 300 && record.updatedDefinition.textEn.length > 450, `${problemId} needs a substantive bilingual definition`);
  assert(record?.technicalAxes?.length === 3 && record.technicalAxes.every(item => item.text && item.textEn), `${problemId} needs distinct bilingual technical axes`);
  assert(record?.causalChain?.length === 5 && record.causalChain.every(item => item.title?.text && item.claim?.text && item.failure?.text && item.title?.textEn && item.claim?.textEn && item.failure?.textEn), `${problemId} needs five complete causal links`);
  assert(record?.hypotheses?.length === 4 && new Set(record.hypotheses.map(item => item.claim?.text)).size === 4, `${problemId} needs four distinct hypotheses`);
  assert(record?.workPackages?.length === 3 && record.workPackages.every(item => item.objective?.text && item.method?.text && item.deliverable?.text && item.gate?.text && item.objective?.textEn), `${problemId} needs three executable work packages`);
  assert(record?.uncertaintyBudget?.length === 4 && record.uncertaintyBudget.every(item => item.category?.text && item.source?.text && item.control?.text && item.threshold?.text && item.category?.textEn), `${problemId} needs four uncertainty entries`);
  assert(record?.decisionTree?.length === 4 && record.decisionTree.every(item => item.condition?.text && item.action?.text && item.meaning?.text && item.condition?.textEn), `${problemId} needs four decision branches`);
  assert(record?.sourceIds.every(sourceId => sandbox.window.CATALOG_SOURCES[sourceId]), `${problemId} references an unknown source`);
}

for (const sourceId of ["shoes_smc_2024", "smc_cepheid_tables_2024", "smc_deb_geometry_2020"]) {
  const source = sandbox.window.CATALOG_SOURCES[sourceId];
  assert(source?.url && source?.publishedOn && source?.resultPeriod && source?.evidenceLabel && source?.evidenceLabelEn, `RC64 primary source ${sourceId} lacks dated bilingual metadata`);
}
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(readText(page).includes("research-cycle-64-data.js?v=20260831-cycle64"), `${page} must load RC64 data`);
const publicCopy = readText("research-cycle-64-data.js");
for (const prohibited of ["전공자 포인트", "1단계 · 처음 읽는 사람", "2단계 · 전공자 핵심", "개수를 맞추지", "아래 시도는 개별 논문", "난제를 해결했다"]) assert(!publicCopy.includes(prohibited), `RC64 public copy contains prohibited phrase: ${prohibited}`);
const readme = readText("README.md");
assert(readme.includes("64개 누적 연구 사이클") && readme.includes("20개 심층 연구 문제의 207개 사이클 기록"), "README RC64 cycle counts changed");
assert(readme.includes("67개 구조적 연결") && readme.includes("364개 기관·로드맵·원 연구 출처") && readme.includes("1,618개 현지화 URL"), "README RC64 source, connection, or sitemap counts changed");
assert(read("package.json").scripts["verify:rc64"]?.includes("verify-rc64-smc-anchor-cycle.mjs"), "RC64 verifier script is missing");
const sitemap = readText("sitemap.xml");
assert(sitemap.includes("cycle=RC-2026-64&amp;lang=ko") && sitemap.includes("cycle=RC-2026-64&amp;lang=en"), "Sitemap missing RC64 localized URLs");

if (failures.length) {
  console.error(`RC64 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC64 verified: named SMC baseline reproduced, single-star shift bounded, internal geometry failed transfer, searched period break rejected, Node independently agrees; global deletion remains blocked.");
