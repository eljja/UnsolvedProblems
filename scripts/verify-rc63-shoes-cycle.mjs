#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const readText = file => fs.readFileSync(path.join(root, file), "utf8");
const read = file => JSON.parse(readText(file));
const close = (actual, expected, tolerance) => Math.abs(actual - expected) <= tolerance;

const spec = read("research/reproducibility/rc63-shoes-release-audit-spec.json");
const manifest = read("research/reproducibility/rc63-shoes-release-manifest.json");
const result = read("research/reproducibility/rc63-shoes-release-audit-result.json");
const sufficient = read("research/reproducibility/rc63-shoes-sufficient-statistics.json");
const nodeAudit = read("research/reproducibility/rc63-shoes-node-audit.json");
const contract = read("research/reproducibility/rc63-shoes-semantic-release-contract.json");
const connectionArtifact = read("research/reproducibility/rc63-semantic-identifiability-connection.json");
const cycleResult = read("research/reproducibility/rc63-shoes-cycle-result.json");

assert(spec.cycleId === "RC-2026-63" && spec.selectedProblems.join(",") === "UP-003,UP-005,UP-625", "RC63 preregistration or selected problem set changed");
assert(manifest.commit === "c447f0fea703fcd0fff57de5000947b5ca81286b" && manifest.fileCount === 6 && manifest.totalBytes === 49462230, "RC63 source manifest changed");
assert(manifest.files.every(item => item.bytes > 0 && /^[A-F0-9]{64}$/.test(item.sha256) && /^[a-f0-9]{40}$/.test(item.gitBlobSha)), "RC63 source integrity metadata is incomplete");
assert(result.releaseShape.observations === 3492 && result.releaseShape.parameters === 47, "RC63 released-system shape changed");
assert(result.predeclaredBaselineGates.sourceIntegrity && result.predeclaredBaselineGates.covariancePositiveDefinite && result.predeclaredBaselineGates.designFullColumnRank, "RC63 source, covariance, or rank gate failed");
assert(result.predeclaredBaselineGates.publishedH0 && result.predeclaredBaselineGates.publishedH0Sigma, "RC63 no longer reproduces the published H0 baseline");
assert(!result.predeclaredBaselineGates.referenceParameterVector && close(result.numericalBaseline.maximumReferenceParameterDifference, 0.0496177133, 1e-10), "RC63 failed reference-vector gate was altered");
assert(close(result.numericalBaseline.H0, 73.042819101987, 1e-9) && close(result.numericalBaseline.H0Sigma, 1.007147851338, 1e-9), "RC63 H0 baseline changed");
assert(!result.semanticInterventionGate.passed && result.semanticInterventionGate.rowLabelCoverage === 0 && result.semanticInterventionGate.parameterLabelCoverage === 0, "RC63 semantic stop boundary changed");
assert(result.anonymousSingleRowInfluence.evaluatedRows === 3492 && result.anonymousSingleRowInfluence.identifiedAfterDeletion === 3491 && result.anonymousSingleRowInfluence.notIdentifiableRowsZeroBased.join(",") === "3210", "RC63 single-row identifiability result changed");
assert(close(result.anonymousSingleRowInfluence.maximumAbsoluteH0ShiftSigma, 0.3041362488, 1e-9) && result.anonymousSingleRowInfluence.rowsAtOrAboveOneSigma === 0, "RC63 single-row influence envelope changed");
assert(result.anonymousDesignSignatureBlocks.blockCount === 86 && result.anonymousDesignSignatureBlocks.identifiedAfterDeletion === 83 && result.anonymousDesignSignatureBlocks.notIdentifiableAfterDeletion === 3, "RC63 anonymous-block counts changed");
assert(close(result.anonymousDesignSignatureBlocks.maximumAbsoluteH0ShiftSigma, 0.67914235682, 1e-9) && result.anonymousDesignSignatureBlocks.blocksAtOrAboveOneSigma === 0, "RC63 anonymous-block influence envelope changed");
assert(result.adjudication.decisionRule === "insufficientRelease" && result.adjudication.publishedBaselineReproduced && !result.adjudication.namedLocalAuditContractPassed, "RC63 adjudication boundary changed");
assert(sufficient.normalMatrix.length === 47 && sufficient.normalMatrix.every(row => row.length === 47) && sufficient.normalRhs.length === 47, "RC63 sufficient statistics are incomplete");
assert(nodeAudit.passed && nodeAudit.absoluteH0Difference < 1e-10 && nodeAudit.maximumParameterDifference < 1e-9 && nodeAudit.constraintDeletionMaximumH0Difference < 1e-9, "RC63 independent Node audit failed");
assert(contract.observations.coverageRequired === 1 && contract.parameters.coverageRequired === 1 && contract.validation.causalClaimGate.includes("No named"), "RC63 semantic release contract is incomplete");
assert(connectionArtifact.id === "CONN-EVIDENCE-036" && connectionArtifact.problemIds.join(",") === "UP-003,UP-005,UP-625" && connectionArtifact.breaksWhen.length === 4, "RC63 structural connection artifact changed");
assert(cycleResult.newVerifiedFacts.length === 9 && cycleResult.hypothesisAdjudication.length === 5 && cycleResult.workPackages.length === 3, "RC63 research record is incomplete");
assert(cycleResult.failedOrRejectedAttempts.length === 4 && cycleResult.exactNextStart.includes("row dictionary"), "RC63 failure history or exact handoff is missing");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 62 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInNewContext(readText(file), sandbox, { filename: file });
}

const cycle = sandbox.window.RESEARCH_CYCLES.find(item => item.id === "RC-2026-63");
const connection = sandbox.window.RESEARCH_CONNECTIONS.find(item => item.id === "CONN-EVIDENCE-036");
assert(sandbox.window.RESEARCH_CYCLES.length === 64, "Site must expose 64 research cycles");
assert(Object.keys(sandbox.window.CATALOG_SOURCES).length === 364, "Site must expose 364 catalog sources");
assert(sandbox.window.PROBLEMS.filter(problem => problem.researchHistory?.length).length === 20, "Site must expose 20 deeply researched problems");
assert(sandbox.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 207, "Site must expose 207 problem-cycle records");
assert(sandbox.window.RESEARCH_CONNECTIONS.length === 67, "Site must expose 67 structural connections");
assert(cycle?.problemIds.join(",") === "UP-003,UP-005,UP-625" && cycle?.verifiedFindings.length === 9 && cycle?.artifacts.length === 8, "RC63 public cycle record is incomplete");
assert(cycle?.resultMatrix?.rows?.length === 7 && cycle?.resultMatrix?.columns?.length === 4 && cycle?.sourceIds.length >= 7, "RC63 result matrix or source ledger is incomplete");
assert(connection?.strength === "strong" && connection.problemIds.includes("UP-625") && connection.minimumTest.text.length > 100, "RC63 semantic-identifiability connection is incomplete");

for (const problemId of cycle?.problemIds || []) {
  const problem = sandbox.window.PROBLEMS.find(item => item.id === problemId);
  const record = problem?.researchHistory?.find(item => item.cycleId === "RC-2026-63");
  assert(record?.cycleId === "RC-2026-63", `${problemId} must preserve the RC63 research record`);
  assert(record?.centralQuestion?.text?.length > 80 && record.centralQuestion.textEn.length > 100, `${problemId} needs a specific bilingual question`);
  assert(record?.updatedDefinition?.text?.length > 300 && record.updatedDefinition.textEn.length > 400, `${problemId} needs a substantive bilingual definition`);
  assert(record?.technicalAxes?.length === 3 && record.technicalAxes.every(item => item.text && item.textEn), `${problemId} needs distinct bilingual technical axes`);
  assert(record?.causalChain?.length === 5 && record.causalChain.every(item => item.title?.text && item.claim?.text && item.failure?.text && item.title?.textEn && item.claim?.textEn && item.failure?.textEn), `${problemId} needs five complete causal links`);
  assert(record?.hypotheses?.length === 4 && new Set(record.hypotheses.map(item => item.claim?.text)).size === 4, `${problemId} needs four distinct hypotheses`);
  assert(record?.workPackages?.length === 3 && record.workPackages.every(item => item.objective?.text && item.method?.text && item.deliverable?.text && item.gate?.text && item.objective?.textEn), `${problemId} needs three executable work packages`);
  assert(record?.uncertaintyBudget?.length === 4 && record.uncertaintyBudget.every(item => item.category?.text && item.source?.text && item.control?.text && item.threshold?.text && item.category?.textEn), `${problemId} needs four uncertainty entries`);
  assert(record?.decisionTree?.length === 4 && record.decisionTree.every(item => item.condition?.text && item.action?.text && item.meaning?.text && item.condition?.textEn), `${problemId} needs four decision branches`);
  assert(record?.sourceIds.every(sourceId => sandbox.window.CATALOG_SOURCES[sourceId]), `${problemId} references an unknown source`);
}

for (const sourceId of ["shoes_compact_release_2022", "shoes_ladder_2022", "shoes_smc_2024", "shoes_perfect_host_2025"]) {
  const source = sandbox.window.CATALOG_SOURCES[sourceId];
  assert(source?.url && source?.publishedOn && source?.resultPeriod && source?.evidenceLabel && source?.evidenceLabelEn, `RC63 primary source ${sourceId} lacks dated bilingual metadata`);
}
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(readText(page).includes("research-cycle-63-data.js?v=20260829-cycle63"), `${page} must load RC63 data`);
const publicCopy = readText("research-cycle-63-data.js");
for (const prohibited of ["전공자 포인트", "1단계 · 처음 읽는 사람", "2단계 · 전공자 핵심", "개수를 맞추지", "아래 시도는 개별 논문", "난제를 해결했다"]) assert(!publicCopy.includes(prohibited), `RC63 public copy contains prohibited phrase: ${prohibited}`);
const readme = readText("README.md");
assert(readme.includes("65개 누적 연구 사이클") && readme.includes("20개 심층 연구 문제의 210개 사이클 기록"), "README current cycle counts changed");
assert(readme.includes("68개 구조적 연결") && readme.includes("367개 기관·로드맵·원 연구 출처") && readme.includes("1,620개 현지화 URL"), "README current source, connection, or sitemap counts changed");
assert(read("package.json").scripts["verify:rc63"]?.includes("verify-rc63-shoes-cycle.mjs"), "RC63 verifier script is missing");
const sitemap = readText("sitemap.xml");
assert(sitemap.includes("cycle=RC-2026-63&amp;lang=ko") && sitemap.includes("cycle=RC-2026-63&amp;lang=en"), "Sitemap missing RC63 localized URLs");

if (failures.length) {
  console.error(`RC63 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC63 verified: H0 baseline reproduced, anonymous deletion envelope below one sigma, one rank-loss preserved, semantic named audit stopped, Node independently agrees.");
