import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = relative => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
const readText = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");
const near = (actual, expected, tolerance) => Math.abs(actual - expected) <= tolerance;

const spec = read("research/reproducibility/rc62-posterior-analysis-spec.json");
const manifest = read("research/reproducibility/rc62-posterior-chain-manifest.json");
const result = read("research/reproducibility/rc62-posterior-bridge-result.json");
const nodeAudit = read("research/reproducibility/rc62-posterior-node-audit.json");
const priorArt = read("research/reproducibility/rc62-posterior-prior-art-boundary.json");
const connectionEvidence = read("research/reproducibility/rc62-likelihood-transport-connection.json");
const cycleResult = read("research/reproducibility/rc62-posterior-cycle-result.json");

assert(spec.cycleId === "RC-2026-62" && spec.eligibleGroups.length === 4, "RC62 specification must freeze four controlled chain groups");
assert(spec.predeclaredGates.sampling.minimumBulkEssPerParameter === 1000, "RC62 ESS gate changed");
assert(spec.predeclaredGates.sampling.maximumSplitRhat === 1.02, "RC62 split-Rhat gate changed");
assert(spec.predeclaredGates.supernovaFamilyStability.maximumPairwiseMeanShiftPooledSigma === 1, "RC62 supernova-family gate changed");
assert(spec.predeclaredGates.cmbCalibrationStability.maximumMeanShiftPooledSigma === 0.5, "RC62 CMB-choice gate changed");
assert(spec.localAnchorAuditContract.requiredInfluenceRuns.length === 4 && spec.localAnchorAuditContract.anchors.length === 4, "RC62 local-ladder audit contract is incomplete");

assert(manifest.fileCount === 17 && manifest.files.length === 17, "RC62 manifest must pin seventeen posterior files");
assert(manifest.totalBytes === 405073676, "RC62 frozen posterior byte count changed");
assert(manifest.checksumManifestSha256 === "DF78872AA8B2D3473A9E8DE78F498180EFD7CBCBEB18211CE4787FAC52067EE5", "RC62 DESI checksum manifest changed");
const desiFiles = manifest.files.filter(file => file.source === "DESI DR2 official catalog");
const dovekieFile = manifest.files.find(file => file.groupId === "des-dovekie-current-release");
assert(desiFiles.length === 16 && desiFiles.every(file => file.expectedSha256 === file.observedSha256), "One or more official DESI posterior hashes changed");
assert(manifest.downloadAudit.allOfficialSha256Matched === true, "RC62 source-integrity audit no longer passes");
assert(dovekieFile?.gitCommit === "c9a4fcafc4cbd19bd750dee47fc76194a45c181f", "Dovekie release commit changed");
assert(dovekieFile?.expectedGitBlobSha === "d3475ed4677987fb417c95be9e829ea30915a5dc", "Dovekie chain blob changed");
assert(dovekieFile?.observedSha256 === "9CC1D4455D7D5E0652D556F6EA46D03CAB249EAF47B596DED9DDBA87A216A635", "Dovekie decoded-file hash changed");

assert(result.status === "posterior-constraint-not-solution" && result.sourceIntegrityPassed, "RC62 result overstates solution status or lost source integrity");
const diagnostics = Object.values(result.groups).flatMap(group => Object.values(group.diagnostics));
assert(Math.min(...diagnostics.map(item => item.bulkEss)) > 4065, "RC62 minimum bulk ESS changed or fell below the declared stability margin");
assert(Math.max(...diagnostics.map(item => item.splitRhat)) < 1.0014, "RC62 maximum split R-hat changed");
assert(Math.max(...diagnostics.map(item => item.tailMeanShiftSigma)) < 0.0127, "RC62 full-versus-tail stability changed");

const pantheon = result.groups["pantheonplus-camspec"];
const union = result.groups["union3-camspec"];
const desy5 = result.groups["desy5-camspec"];
const plik = result.groups["desy5-plik"];
assert(near(pantheon.summaries.H0rdrag.mean, 9958.7440703, 1e-5) && near(pantheon.summaries.rdragRequiredByLocal.mean, 136.0656392, 1e-5), "Pantheon+ scale bridge changed");
assert(near(union.summaries.H0rdrag.mean, 9717.0867331, 1e-5) && near(union.summaries.rdragRequiredByLocal.mean, 132.7690341, 1e-5), "Union3 scale bridge changed");
assert(near(desy5.summaries.H0rdrag.mean, 9842.8388827, 1e-5) && near(desy5.summaries.rdragRequiredByLocal.mean, 134.487, 0.01), "DES-SN5YR scale bridge changed");
assert(near(plik.summaries.H0rdrag.mean, 9843.4463298, 1e-5), "DES-SN5YR Plik bridge changed");
assert(result.gateAdjudication.sampling.passed === true, "RC62 sampling gate failed");
assert(result.gateAdjudication.supernovaFamilyStability.passed === false && near(result.gateAdjudication.supernovaFamilyStability.maximumDeclaredShiftSigma, 1.5884368763, 1e-9), "RC62 supernova-family adjudication changed");
assert(result.gateAdjudication.cmbCalibrationStability.passed === true && near(result.gateAdjudication.cmbCalibrationStability.maximumDeclaredShiftSigma, 0.0051867752, 1e-10), "RC62 CMB-choice adjudication changed");
assert(result.gateAdjudication.physicalRulerConflict.passed === true && near(result.gateAdjudication.physicalRulerConflict.minimumGapZ, 5.5406825865, 1e-9), "RC62 physical-ruler diagnostic changed");
assert(result.dovekieCurrentReleaseCheck.rows === 51934 && result.dovekieCurrentReleaseCheck.kishEss > 10569, "RC62 Dovekie state check changed");
assert(near(result.dovekieCurrentReleaseCheck.summaries.w.mean, -0.8028762138, 1e-9) && near(result.dovekieCurrentReleaseCheck.summaries.wa.mean, -0.7295005168, 1e-9), "RC62 Dovekie w0-wa reproduction changed");
assert(result.dovekieCurrentReleaseCheck.controlledComparison === false, "RC62 must not label the Dovekie state check as controlled");

assert(nodeAudit.comparison.passed === true && nodeAudit.comparison.allOfficialHashesPassed === true, "RC62 independent Node audit no longer passes");
assert(nodeAudit.comparison.maximumPosteriorMeanAbsoluteDifference < 1e-9, "RC62 cross-implementation posterior means diverged");
assert(nodeAudit.comparison.maximumPosteriorSdAbsoluteDifference < 2e-8, "RC62 cross-implementation posterior standard deviations diverged");
assert(nodeAudit.comparison.maximumBridgeMeanAbsoluteDifference < 0.004 && nodeAudit.comparison.maximumBridgeSdAbsoluteDifference < 0.007, "RC62 independent ladder bridge exceeded tolerance");
assert(priorArt.establishedBeforeThisCycle.length === 5 && priorArt.notClaimed.length === 5, "RC62 prior-art boundary is incomplete");
assert(priorArt.noveltyStatus === "Implementation and synthesis contribution; scientific novelty unestablished.", "RC62 novelty boundary changed");
assert(connectionEvidence.id === "CONN-EVIDENCE-035" && connectionEvidence.problemIds.join(",") === "UP-003,UP-002,UP-625", "RC62 structural connection mapping changed");
assert(Object.keys(connectionEvidence.variableMapping).length === 3 && connectionEvidence.conditionsForTransfer.length === 4 && connectionEvidence.breakConditions.length === 4, "RC62 transport connection lacks operational boundaries");
assert(cycleResult.selectedProblems.join(",") === "UP-003,UP-002,UP-005,UP-625", "RC62 selected-problem set changed");
assert(cycleResult.newVerifiedFacts.length === 9 && cycleResult.hypothesisAdjudication.length === 6 && cycleResult.workPackages.length === 4, "RC62 research program is incomplete");
assert(cycleResult.failedOrRejectedAttempts.length === 4 && cycleResult.exactNextStart.includes("identical DESI DR2 plus CMB"), "RC62 failure record or exact handoff is missing");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 60 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInNewContext(readText(file), sandbox, { filename: file });
}

const cycle = sandbox.window.RESEARCH_CYCLES.find(item => item.id === "RC-2026-62");
const connection = sandbox.window.RESEARCH_CONNECTIONS.find(item => item.id === "CONN-EVIDENCE-035");
assert(sandbox.window.RESEARCH_CYCLES.length === 62, "Site must expose 62 research cycles");
assert(Object.keys(sandbox.window.CATALOG_SOURCES).length === 358, "Site must expose 358 catalog sources");
assert(sandbox.window.PROBLEMS.filter(problem => problem.researchHistory?.length).length === 19, "Site must expose 19 deeply researched problems");
assert(sandbox.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 201, "Site must expose 201 problem-cycle records");
assert(sandbox.window.RESEARCH_CONNECTIONS.length === 65, "Site must expose 65 structural connections");
assert(cycle?.problemIds.join(",") === "UP-003,UP-002,UP-005,UP-625", "RC62 public problem mapping changed");
assert(cycle?.verifiedFindings.length === 9 && cycle?.artifacts.length === 7, "RC62 public cycle record is incomplete");
assert(cycle?.resultMatrix?.rows?.length >= 7 && cycle?.resultMatrix?.columns?.length === 4 && cycle?.sourceIds.length >= 10, "RC62 public evidence matrix or source ledger is incomplete");
assert(connection?.strength === "moderate" && connection.problemIds.includes("UP-625"), "RC62 transport connection is not exposed correctly");

for (const problemId of cycle?.problemIds || []) {
  const problem = sandbox.window.PROBLEMS.find(item => item.id === problemId);
  const record = problem?.researchHistory?.find(item => item.cycleId === "RC-2026-62");
  assert(problem?.cycleResearch === record, `${problemId} must expose RC62 as its current research record`);
  assert(record?.centralQuestion?.text?.length > 80 && record.centralQuestion.textEn.length > 100, `${problemId} needs a specific bilingual central question`);
  assert(record?.updatedDefinition?.text?.length > 300 && record.updatedDefinition.textEn.length > 400, `${problemId} needs a substantive bilingual definition`);
  assert(record?.technicalAxes?.length >= 3 && record.technicalAxes.every(item => item.text && item.textEn), `${problemId} needs problem-specific bilingual technical axes`);
  assert(record?.causalChain?.length === 5 && record.causalChain.every(item => item.title?.text && item.claim?.text && item.failure?.text && item.title?.textEn && item.claim?.textEn && item.failure?.textEn), `${problemId} needs five complete bilingual causal links`);
  assert(record?.hypotheses?.length >= 3 && new Set(record.hypotheses.map(item => item.code)).size === record.hypotheses.length, `${problemId} needs distinct competing hypotheses`);
  assert(new Set(record.hypotheses.map(item => item.claim?.text)).size === record.hypotheses.length, `${problemId} contains duplicated hypothesis claims`);
  assert(record?.workPackages?.length === 3 && record.workPackages.every(item => item.objective?.text && item.method?.text && item.deliverable?.text && item.gate?.text && item.objective?.textEn && item.method?.textEn), `${problemId} needs three executable bilingual work packages`);
  assert(record?.uncertaintyBudget?.length === 4 && record.uncertaintyBudget.every(item => item.category?.text && item.source?.text && item.control?.text && item.threshold?.text && item.category?.textEn && item.source?.textEn && item.control?.textEn && item.threshold?.textEn), `${problemId} needs four bilingual uncertainty entries`);
  assert(record?.decisionTree?.length === 4 && record.decisionTree.every(item => item.condition?.text && item.action?.text && item.condition?.textEn && item.action?.textEn), `${problemId} needs four adjudicable bilingual decision branches`);
  assert(record?.sourceIds.every(sourceId => sandbox.window.CATALOG_SOURCES[sourceId]), `${problemId} references an unknown source`);
}

for (const sourceId of ["pantheonplus_cosmology_2022", "union3_unity_2023", "des_sn5yr_cosmology_2024", "dovekie_calibration_2025", "des_dovekie_reanalysis_2026", "des_dovekie_data_2026", "bayesian_desi_dr2_2026"]) {
  const source = sandbox.window.CATALOG_SOURCES[sourceId];
  assert(source?.url && source?.publishedOn && source?.resultPeriod && source?.evidenceLabel && source?.evidenceLabelEn, `Primary source ${sourceId} lacks dated bilingual evidence metadata`);
}

for (const page of ["index.html", "solve.html", "research-log.html"]) {
  assert(readText(page).includes("research-cycle-62-data.js?v=20260829-cycle62"), `${page} must load RC62 data`);
}
const solvePage = readText("solve.html");
for (const asset of [
  "data.js",
  "expansion-data.js",
  "translations.js",
  "priority-data.js",
  "prize-data.js",
  "research-context.js",
  "solution-context.js",
  "deep-solution-context.js",
  "research-cycle-data.js",
  "solve.js",
]) {
  assert(
    solvePage.includes(`${asset}?v=20260829-cycle62`),
    `solve.html must cache-bust ${asset} for RC62`,
  );
}
const publicCopy = readText("research-cycle-62-data.js");
for (const prohibited of ["전공자 포인트", "1단계 · 처음 읽는 사람", "2단계 · 전공자 핵심", "개수를 맞추지", "아래 시도는 개별 논문", "난제를 해결했다"]) {
  assert(!publicCopy.includes(prohibited), `RC62 public copy contains prohibited phrase: ${prohibited}`);
}
const readme = readText("README.md");
assert(readme.includes("62개 누적 연구 사이클"), "README cycle count must be 62");
assert(readme.includes("19개 심층 연구 문제의 201개 사이클 기록"), "README problem-cycle record count changed");
assert(readme.includes("65개 구조적 연결"), "README connection count must be 65");
assert(readme.includes("358개 기관·로드맵·원 연구 출처"), "README source count must be 358");
assert(readme.includes("1,614개 현지화 URL"), "README sitemap count must be 1,614");
const packageJson = read("package.json");
assert(packageJson.scripts["verify:rc62"]?.includes("verify-rc62-posterior-cycle.mjs"), "RC62 verifier script is missing");
assert(packageJson.scripts.pretest?.includes("verify-rc62-posterior-cycle.mjs"), "RC62 verifier is not in the default test path");
const sitemap = readText("sitemap.xml");
assert(sitemap.includes("cycle=RC-2026-62&amp;lang=ko") && sitemap.includes("cycle=RC-2026-62&amp;lang=en"), "Sitemap missing RC62 localized URLs");

if (failures.length) {
  console.error(`RC62 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC62 verified: 17 frozen posterior files, SN-family scale gate failed, tested CMB-choice gate passed, minimum ruler gap 5.541 sigma, independent implementation agrees.");
