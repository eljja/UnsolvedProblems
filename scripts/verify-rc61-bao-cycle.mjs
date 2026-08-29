import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = relative => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
const near = (actual, expected, tolerance) => Math.abs(actual - expected) <= tolerance;

const spec = read("research/reproducibility/rc61-bao-analysis-spec.json");
const result = read("research/reproducibility/rc61-bao-tension-result.json");
const nodeAudit = read("research/reproducibility/rc61-bao-node-audit.json");
const priorArt = read("research/reproducibility/rc61-bao-prior-art-boundary.json");
const connectionEvidence = read("research/reproducibility/rc61-scale-identifiability-connection.json");
const cycleResult = read("research/reproducibility/rc61-bao-cycle-result.json");

assert(spec.cycleId === "RC-2026-61" && spec.redshiftBlocks.length === 7, "RC61 specification must freeze seven redshift blocks");
assert(spec.claimBoundary.includes("neither re-runs") && spec.independenceCaveat.includes("diagnostics"), "RC61 claim boundary must remain explicit");
assert(result.sourceIntegrity.rowCount === 13 && result.sourceIntegrity.covarianceMinimumEigenvalue > 0, "RC61 likelihood shape or covariance validity changed");
assert(near(result.fits.flatLambdaCDM.parameters.Omega_m, 0.2974618216, 1e-8), "RC61 Omega_m replication changed");
assert(near(result.fits.flatLambdaCDM.parameters.h_times_r_d_Mpc, 101.5397730, 1e-6), "RC61 h*r_d replication changed");
assert(near(result.fits.flatLambdaCDM.chi2, 10.2710410, 1e-6), "RC61 flat-LambdaCDM chi-square changed");
assert(result.leaveOneRedshiftBlockOut.length === 7, "RC61 must retain seven leave-one-block fits");
assert(Math.max(...result.leaveOneRedshiftBlockOut.map(item => item.hTimesRdShiftInFullSigma)) < 1, "A DESI redshift block now dominates the scale");
assert(near(Math.max(...result.leaveOneRedshiftBlockOut.map(item => item.hTimesRdShiftInFullSigma)), 0.6641646390, 1e-6), "RC61 maximum block influence changed");
assert(result.fits.flatWCDM.deltaAiccFromLambdaCDM > 2 && result.fits.flatW0WaCDM.deltaAiccFromLambdaCDM > 3, "RC61 smooth-late-time adjudication changed");
assert(near(result.externalScaleDiagnostics.shoesWithStandardRuler.tensionWithDesiSigma, 4.0159976, 1e-5), "RC61 principal product diagnostic changed");
assert(near(result.externalScaleDiagnostics.requiredRulerForShoes.rDragMpc, 138.7155369, 1e-5), "RC61 required ruler changed");
assert(result.hypothesisTests.find(item => item.code === "H61-B")?.verdict === "refuted", "RC61 single-block verdict changed");
assert(result.hypothesisTests.find(item => item.code === "H61-C")?.verdict === "refuted", "RC61 late-expansion verdict changed");
assert(nodeAudit.exactDecisionAgreement === true, "RC61 independent implementation no longer agrees");
assert(Object.values(nodeAudit.comparisonWithPython).every(item => item.pass), "RC61 cross-implementation tolerance failed");
assert(priorArt.claimsNotMade.length === 4 && priorArt.verifiedPrecedents.length === 4, "RC61 prior-art boundary is incomplete");
assert(connectionEvidence.connectionId === "CONN-EVIDENCE-034" && connectionEvidence.variableMapping.length === 3, "RC61 scale-identifiability connection is incomplete");
assert(cycleResult.status === "computational-constraint-not-solution", "RC61 research record overstates solution status");
assert(cycleResult.hypothesisAdjudication.length === 5 && cycleResult.workPackages.length === 3, "RC61 research program is incomplete");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 59 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox, { filename: file });
}

const cycle = sandbox.window.RESEARCH_CYCLES.find(item => item.id === "RC-2026-61");
const connection = sandbox.window.RESEARCH_CONNECTIONS.find(item => item.id === "CONN-EVIDENCE-034");
assert(sandbox.window.RESEARCH_CYCLES.length === 61, "Site must expose 61 research cycles");
assert(sandbox.window.RESEARCH_CONNECTIONS.length === 64, "Site must expose 64 structural connections");
assert(Object.keys(sandbox.window.CATALOG_SOURCES).length === 351, "Site must expose 351 catalog sources");
assert(sandbox.window.PROBLEMS.filter(problem => problem.researchHistory?.length).length === 19, "Site must expose 19 deeply researched problems");
assert(sandbox.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 197, "Site must expose 197 problem-cycle records");
assert(cycle?.problemIds.join(",") === "UP-003,UP-002,UP-005", "RC61 problem mapping changed");
assert(cycle?.verifiedFindings.length === 9 && cycle?.artifacts.length === 8, "RC61 public cycle record is incomplete");
assert(connection?.problemIds.includes("UP-233") && connection.problemIds.length === 4, "RC61 cross-field connection must include the digital-twin problem");

for (const problemId of cycle?.problemIds || []) {
  const problem = sandbox.window.PROBLEMS.find(item => item.id === problemId);
  const record = problem?.cycleResearch;
  assert(record?.cycleId === "RC-2026-61", `${problemId} must show RC61 as current research`);
  assert(record?.updatedDefinition?.text?.length > 300 && record.updatedDefinition.textEn.length > 420, `${problemId} needs a substantive bilingual definition`);
  assert(record?.causalChain?.length === 5 && record.causalChain.every(item => item.title?.text && item.claim?.text && item.failure?.text && item.title?.textEn && item.claim?.textEn && item.failure?.textEn), `${problemId} needs five complete bilingual causal links`);
  assert(record?.hypotheses?.length >= 3 && new Set(record.hypotheses.map(item => item.code)).size === record.hypotheses.length, `${problemId} needs distinct competing hypotheses`);
  assert(record?.workPackages?.length === 3 && record.workPackages.every(item => item.objective?.text && item.method?.text && item.deliverable?.text && item.gate?.text), `${problemId} needs three executable work packages`);
  assert(record?.uncertaintyBudget?.length === 4, `${problemId} needs four uncertainty entries`);
  assert(record?.decisionTree?.length === 4 && record.decisionTree.every(item => item.condition?.text && item.action?.text && item.meaning?.text), `${problemId} needs four adjudicable decision branches`);
  assert(record.sourceIds.every(sourceId => sandbox.window.CATALOG_SOURCES[sourceId]), `${problemId} references an unknown source`);
}

for (const sourceId of ["desi_dr2_bao_2025", "desi_dr2_data_2025", "cobaya_desi_dr2_likelihood_2025", "planck_cosmology_2020", "shoes_jwst_2024"]) {
  const source = sandbox.window.CATALOG_SOURCES[sourceId];
  assert(source?.url && source?.publishedOn && source?.resultPeriod && source?.evidenceLabel && source?.evidenceLabelEn, `Primary source ${sourceId} lacks dated bilingual evidence metadata`);
}

for (const page of ["index.html", "solve.html", "research-log.html"]) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  assert(html.includes("research-cycle-61-data.js?v=20260829-cycle61"), `${page} must load RC61 data`);
}
const publicCopy = fs.readFileSync(path.join(ROOT, "research-cycle-61-data.js"), "utf8");
for (const prohibited of ["전공자 포인트", "1단계 · 처음 읽는 사람", "2단계 · 전공자 핵심", "개수를 맞추지", "아래 시도는 개별 논문", "난제를 해결했다"]) {
  assert(!publicCopy.includes(prohibited), `RC61 public copy contains prohibited phrase: ${prohibited}`);
}
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
assert(readme.includes("61개 누적 연구 사이클"), "README cycle count must be 61");
assert(readme.includes("19개 심층 연구 문제의 197개 사이클 기록"), "README curated-problem and record counts changed");
assert(readme.includes("64개 구조적 연결"), "README connection count must be 64");
assert(readme.includes("351개 기관·로드맵·원 연구 출처"), "README source count must be 351");
assert(readme.includes("1,612개 현지화 URL"), "README sitemap count must be 1,612");
const packageJson = read("package.json");
assert(packageJson.scripts.pretest?.includes("verify-rc61-bao-cycle.mjs"), "RC61 verifier is not in the default test path");
const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
assert(sitemap.includes("cycle=RC-2026-61&amp;lang=ko") && sitemap.includes("cycle=RC-2026-61&amp;lang=en"), "Sitemap missing RC61 localized URLs");

if (failures.length) {
  console.error(`RC61 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC61 verified: DESI headline reproduced, max block influence 0.664 sigma, smooth-late rescue refuted, independent implementation agrees.");
