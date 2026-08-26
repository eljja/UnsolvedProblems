import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = relative => fs.readFileSync(path.join(root, relative), "utf8");
const read = relative => JSON.parse(readText(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const precommit = read("research/reproducibility/rc52-battery-domain-passport-precommit.json");
const priorArt = read("research/reproducibility/rc52-battery-domain-passport-prior-art.json");
const schema = read("research/reproducibility/rc52-battery-schema-audit.json");
const features = read("research/reproducibility/rc52-battery-feature-table.json");
const python = read("research/reproducibility/rc52-battery-domain-passport-python.json");
const node = read("research/reproducibility/rc52-battery-domain-passport-node.json");
const audit = read("research/reproducibility/rc52-battery-domain-passport-independent-audit.json");
const diagnostic = read("research/reproducibility/rc52-battery-boundary-diagnostic.json");
const connectionEvidence = read("research/reproducibility/rc52-battery-domain-passport-connection-evidence.json");
const result = read("research/reproducibility/rc52-battery-domain-passport-cycle-result.json");

assert(precommit.precommitId === "RC52-BATTERY-DOMAIN-PASSPORT-PRECOMMIT-0.1" && precommit.status.includes("before-feature-extraction-model-fitting-or-performance-results"), "RC52 precommit identity or chronology changed");
assert(precommit.selection.problemIds.join("|") === "UP-219|UP-233|UP-234" && precommit.featureContract.featuresInOrder.length === 16 && precommit.competingHypotheses.length === 5 && precommit.hardGates.length === 13, "RC52 preregistered scope changed");
assert(priorArt.sources.length === 12 && priorArt.repositoryInheritance.length === 3 && priorArt.sources.every(item => /^https:\/\//.test(item.url) && item.usedFor && item.doesNotEstablish), "RC52 prior-art boundaries incomplete");
assert(schema.labelValuesRead === false && schema.totals.labelledFileCount === 55 && schema.totals.eligibleAtHorizonCountBeforeOutcomeRules === 55 && schema.totals.unlabelledExtraFileCount === 14, "RC52 schema audit changed");

const preregFiles = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "bd5a4ae"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).sort();
const expectedPreregFiles = [
  "research/reproducibility/rc52-battery-domain-passport-precommit.json",
  "research/reproducibility/rc52-battery-domain-passport-prior-art.json",
  "research/reproducibility/rc52-battery-schema-audit.json",
  "scripts/audit_rc52_battery_schema.py"
].sort();
assert(preregFiles.join("|") === expectedPreregFiles.join("|"), "RC52 preregistration commit contains implementation or outcome files");
for (const outcome of [
  "research/reproducibility/rc52-battery-feature-table.json",
  "research/reproducibility/rc52-battery-domain-passport-python.json",
  "research/reproducibility/rc52-battery-domain-passport-node.json",
  "research/reproducibility/rc52-battery-domain-passport-independent-audit.json",
  "research-cycle-52-data.js",
  "scripts/run_rc52_battery_domain_passport.py",
  "scripts/independent-rc52-battery-domain-passport.mjs"
]) {
  const existed = spawnSync("git", ["cat-file", "-e", `bd5a4ae:${outcome}`], { cwd: root });
  assert(existed.status !== 0, `RC52 outcome existed at preregistration: ${outcome}`);
}

assert(features.featureNames.join("|") === precommit.featureContract.featuresInOrder.join("|") && features.rows.length === 52 && features.exclusions.length === 3, "RC52 feature contract or cohort changed");
assert(python.archiveHashAudit.length === 6 && python.archiveHashAudit.every(item => item.matches), "RC52 official archive hash gate failed");
assert(python.eligibleCellCount === 52 && python.sourceCounts.CALB === 27 && python.sourceCounts.HNEI === 14 && python.sourceCounts.MICH_EXP === 9 && python.sourceCounts.UL_PUR === 2, "RC52 source denominators changed");
assert(python.randomSplit.repeatCount === 200 && python.leaveSourceOut.folds.length === 4 && python.leaveSourceOut.cellPredictions.length === 52, "RC52 experiment denominators changed");
assert(Math.abs(python.adjudication.randomMixtureMedian.mdape - 0.19387526525911958) < 1e-12, "RC52 random-split result changed");
assert(Math.abs(python.adjudication.pooledLeaveSourceOut.mdape - 0.6499148977864233) < 1e-12 && Math.abs(python.adjudication.pooledLeaveSourceOut.catastrophicFraction - 0.6538461538461539) < 1e-12, "RC52 leave-source-out result changed");
const verdicts = Object.fromEntries(python.adjudication.hypotheses.map(item => [item.code, item.verdict]));
assert(verdicts.H0 === "rejected" && verdicts.H1 === "rejected" && verdicts.H2 === "rejected" && verdicts.H3 === "rejected" && verdicts.H4 === "unsupported-and-not-testable-with-this-cohort", "RC52 hypothesis adjudication changed");
assert(node.eligibleCellCount === 52 && node.leaveSourceOut.cellPredictions.length === 52 && node.randomSplit.repeatCount === 200, "RC52 independent Node denominators changed");
assert(audit.verdict === "pass" && audit.failures.length === 0 && audit.comparisons.total === 1399, "RC52 independent adjudication failed or changed");
assert(diagnostic.status === "exploratory-after-registered-outcomes" && Math.abs(diagnostic.pooled.three_nearest_neighbours.mdape - 0.6050076525085551) < 1e-12 && diagnostic.pooled.bounded_ridge.maximumPredictedLife <= 1411.000000000001, "RC52 exploratory boundary changed or is not labelled exploratory");
assert(connectionEvidence.connectionId === "CONN-EVIDENCE-025" && connectionEvidence.problemIds.join("|") === "UP-219|UP-233|UP-234" && connectionEvidence.variableMapping.length === 6 && connectionEvidence.holdsWhen.length === 5 && connectionEvidence.breaksWhen.length === 5, "RC52 structural connection evidence incomplete");
assert(result.precommit.gitCommit === "bd5a4ae" && result.precommit.outcomeBlind === false && result.newlyVerifiedFacts.length === 12 && result.workPackages.length === 5 && result.failedOrRejectedApproaches.length === 7 && result.uncertaintyBudget.length === 5, "RC52 integrated cycle record incomplete");
assert(result.mostPromisingPath.status.includes("not established as novel") && result.nextCycleStart.startsWith("Do not tune another model"), "RC52 novelty or continuation boundary weakened");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 50 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles];
for (const file of siteFiles) vm.runInNewContext(readText(file), sandbox, { filename: file });
const problems = sandbox.window.PROBLEMS;
const sources = sandbox.window.CATALOG_SOURCES;
const cycles = sandbox.window.RESEARCH_CYCLES;
const connections = sandbox.window.RESEARCH_CONNECTIONS;
const cycle = cycles.find(item => item.id === "RC-2026-52");
const connection = connections.find(item => item.id === "CONN-EVIDENCE-025");
assert(cycle?.problemIds.join("|") === "UP-219|UP-233|UP-234" && cycle.connectionIds.join("|") === "CONN-EVIDENCE-025", "RC52 public scope changed");
assert(cycle.verifiedFindings.length === 12 && cycle.resultMatrix.rows.length === 11 && cycle.artifacts.length === 15 && cycle.log.length === 12, "RC52 public cycle record incomplete");
for (const item of cycle.artifacts) assert(fs.existsSync(path.join(root, item.url)), `Missing RC52 artifact: ${item.url}`);
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|"), "RC52 public connection scope changed");
for (const field of ["sharedBottleneck", "mapping", "transfer", "minimumTest", "failureBoundary", "evidence", "validationStatus"]) assert(connection[field]?.text && connection[field]?.textEn, `RC52 connection missing ${field}`);
for (const id of cycle.problemIds) {
  const problem = problems.find(item => item.id === id);
  const record = problem?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 4 && record.sourceIds.length === 12, `${id}: RC52 hypotheses or sources incomplete`);
  assert(record.focusedPage === true && record.technicalAxes.length === 3 && record.causalChain.length === 5, `${id}: focused causal research frame incomplete`);
  assert(record.workPackages.length === 3 && record.uncertaintyBudget.length === 4 && record.decisionTree.length === 3, `${id}: focused execution program incomplete`);
  assert(problem.cycleResearch === record && problem.researchConnections.includes(connection.id), `${id}: current research or connection not attached`);
  for (const field of ["centralQuestion", "resolutionCriterion", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text && record[field].textEn, `${id}: RC52 ${field} is not bilingual`);
  }
  for (const field of ["updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text.length >= 360 && record[field].textEn.length >= 600, `${id}: RC52 ${field} is not substantive and bilingual`);
  }
  for (const step of record.causalChain) for (const field of ["title", "claim", "failure"]) assert(step[field].text && step[field].textEn, `${id}: incomplete causal step ${step.code}.${field}`);
  for (const item of record.workPackages) for (const field of ["title", "objective", "method", "deliverable", "gate"]) assert(item[field].text && item[field].textEn, `${id}: incomplete work package ${item.code}.${field}`);
  for (const item of record.hypotheses) for (const field of ["claim", "prediction", "test", "reject"]) assert(item[field].text && item[field].textEn, `${id}: incomplete hypothesis ${item.code}.${field}`);
}
for (const id of ["batterylife_kdd_2025", "batterylife_v11_2026", "batterylife_v11_notes_2026", "limits_electrochemical_battery_2026", "discovery_learning_battery_2026", "varying_usage_battery_2024", "severson_battery_2019", "battery_data_genome_2022", "hnei_variability_2018", "mich_formation_2021", "ulpur_aging_2020", "weighted_conformal_2019"]) {
  assert(sources[id]?.reviewedOn === "2026-08-26" && /^https:\/\//.test(sources[id].url), `RC52 source missing or stale: ${id}`);
}
assert(Object.keys(sources).length === 309 && cycles.length === 52 && connections.length === 55, "RC52 cumulative source, cycle, or connection count changed");
assert(problems.filter(item => item.researchHistory?.length).length === 15 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 166, "RC52 research-record count changed");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(readText(page).includes("research-cycle-52-data.js"), `${page} does not load RC52`);
assert(readText("solve.html").includes("cycle-work-packages") && readText("solve.js").includes("problem.cycleResearch?.causalChain") && readText("solve.js").includes("focusedCycle"), "Focused cycle page renderer is incomplete");
const publicText = readText("research-cycle-52-data.js");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추", "분량 목표", "전공자 관점의 질문은"]) assert(!publicText.includes(phrase), `RC52 contains forbidden wording: ${phrase}`);
for (const script of ["audit_rc52_battery_schema.py", "run_rc52_battery_domain_passport.py", "independent-rc52-battery-domain-passport.mjs", "diagnose_rc52_battery_boundary.py", "adjudicate-rc52-battery-domain-passport.mjs", "verify-rc52-battery-domain-passport-cycle.mjs"]) assert(readText("package.json").includes(script), `package.json missing RC52 script: ${script}`);
assert(readText("sitemap.xml").includes("RC-2026-52&amp;lang=ko") && readText("sitemap.xml").includes("RC-2026-52&amp;lang=en"), "RC52 missing from sitemap.xml");
assert(/5[2-9]개 누적 연구 사이클/.test(readText("README.md")) && /1,5(?:9[4-9]|[0-9]{3,})개 현지화 URL/.test(readText("README.md")) && /3(?:09|1[0-9]|[2-9][0-9])개 기관·로드맵·원 연구 출처/.test(readText("README.md")), "README no longer reports RC52-or-later cumulative counts");

console.log("RC52 verified: 52 cells, 200 random splits, 4 source holdouts, 1,399 independent comparisons, and explicit multimodal/field zero boundaries.");
