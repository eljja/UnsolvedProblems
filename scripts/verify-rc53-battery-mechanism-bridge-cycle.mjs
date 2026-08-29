import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = relative => fs.readFileSync(path.join(root, relative), "utf8");
const read = relative => JSON.parse(readText(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const close = (actual, expected, tolerance = 1e-12) => Math.abs(actual - expected) <= tolerance;

const precommit = read("research/reproducibility/rc53-battery-mechanism-bridge-precommit.json");
const priorArt = read("research/reproducibility/rc53-battery-mechanism-bridge-prior-art.json");
const schema = read("research/reproducibility/rc53-battery-mechanism-bridge-schema-audit.json");
const pilot = read("research/reproducibility/rc53-battery-mechanism-bridge-pilot.json");
const amendment = read("research/reproducibility/rc53-battery-mechanism-bridge-amendment-01.json");
const features = read("research/reproducibility/rc53-battery-mechanism-bridge-feature-table.json");
const python = read("research/reproducibility/rc53-battery-mechanism-bridge-python.json");
const node = read("research/reproducibility/rc53-battery-mechanism-bridge-node.json");
const audit = read("research/reproducibility/rc53-battery-mechanism-bridge-independent-audit.json");
const diagnostic = read("research/reproducibility/rc53-battery-mechanism-bridge-boundary-diagnostic.json");
const connectionEvidence = read("research/reproducibility/rc53-battery-mechanism-bridge-connection-evidence.json");
const result = read("research/reproducibility/rc53-battery-mechanism-bridge-cycle-result.json");

assert(precommit.precommitId === "RC53-BATTERY-MECHANISM-BRIDGE-PRECOMMIT-0.1" && precommit.status.includes("before-any-summary-csv-value-was-read"), "RC53 precommit identity or chronology changed");
assert(precommit.selection.problemIds.join("|") === "UP-219|UP-233|UP-234" && precommit.competingHypotheses.length === 4 && precommit.hardGates.length === 13, "RC53 preregistered scope changed");
assert(precommit.cohortAndSplit.candidateCount === 40 && precommit.cohortAndSplit.pilot.cells.length === 4 && precommit.cohortAndSplit.development.count === 14 && precommit.cohortAndSplit.untouchedTarget.count === 22, "RC53 registered split changed");
assert(precommit.featureContract.stressArm.featuresInOrder.length === 5 && precommit.featureContract.capacityArm.featuresInOrder.length === 7 && precommit.featureContract.passportArm.featuresInOrder.length === 15 && precommit.modelContract.regressor.includes("alpha 1.0"), "RC53 arms or model changed");
assert(priorArt.sources.length === 7 && priorArt.sources.every(item => /^https:\/\//.test(item.url) && item.usedFor && item.doesNotEstablish), "RC53 prior-art boundary incomplete");
assert(schema.summaryValuesRead === false && schema.totals.metadataRows === 40 && schema.totals.performanceSummaryMembers === 40 && schema.totals.pilotCells === 4 && schema.totals.developmentCells === 14 && schema.totals.untouchedTargetCells === 22, "RC53 schema audit changed");

const preregFiles = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "b2fb296"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).sort();
const expectedPreregFiles = [
  "research/reproducibility/rc53-battery-mechanism-bridge-precommit.json",
  "research/reproducibility/rc53-battery-mechanism-bridge-prior-art.json",
  "research/reproducibility/rc53-battery-mechanism-bridge-schema-audit.json",
  "scripts/audit_rc53_battery_mechanism_bridge.py"
].sort();
assert(preregFiles.join("|") === expectedPreregFiles.join("|"), "RC53 preregistration commit contains pilot, implementation, or outcome files");

const pilotFiles = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "47bf264"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).sort();
const expectedPilotFiles = [
  "research/reproducibility/rc53-battery-mechanism-bridge-amendment-01.json",
  "research/reproducibility/rc53-battery-mechanism-bridge-pilot.json",
  "scripts/pilot_rc53_battery_mechanism_bridge.py"
].sort();
assert(pilotFiles.join("|") === expectedPilotFiles.join("|"), "RC53 pilot commit contains development, target, or outcome files");
for (const commit of ["b2fb296", "47bf264"]) {
  for (const outcome of [
    "research/reproducibility/rc53-battery-mechanism-bridge-feature-table.json",
    "research/reproducibility/rc53-battery-mechanism-bridge-python.json",
    "research/reproducibility/rc53-battery-mechanism-bridge-node.json",
    "research/reproducibility/rc53-battery-mechanism-bridge-independent-audit.json",
    "research-cycle-53-data.js",
    "scripts/run_rc53_battery_mechanism_bridge.py",
    "scripts/independent-rc53-battery-mechanism-bridge.mjs"
  ]) {
    const existed = spawnSync("git", ["cat-file", "-e", `${commit}:${outcome}`], { cwd: root });
    assert(existed.status !== 0, `RC53 outcome existed at sealed checkpoint ${commit}: ${outcome}`);
  }
}

assert(pilot.schemaVerdict === "pass" && pilot.cells.length === 4 && pilot.records.length === 4 && pilot.modelWeight === 0 && pilot.developmentValuesRead === false && pilot.targetValuesRead === false, "RC53 zero-weight pilot boundary changed");
assert(amendment.status.includes("before-any-development-or-target-summary-value-was-read") && amendment.modelWeight === 0 && amendment.pilotCells.join("|") === pilot.cells.join("|"), "RC53 pilot amendment boundary changed");
assert(features.rows.length === 40 && features.rows.filter(row => row.split === "pilot").length === 4 && features.rows.filter(row => row.split === "development").length === 14 && features.rows.filter(row => row.split === "target").length === 22, "RC53 feature table split changed");
assert(features.arms.A.length === 5 && features.arms.B.length === 7 && features.arms.C.length === 15, "RC53 feature arms changed");

assert(python.counts.candidate === 40 && python.counts.pilotZeroWeight === 4 && python.counts.development === 14 && python.counts.untouchedTarget === 22, "RC53 Python denominators changed");
const expectedMetrics = {
  A: [6.38334137332579, 6.00531537560692, 10.325674369715276, 0.49971023044616614],
  B: [5.698823207031689, 5.64976005963742, 11.203248034449508, 0.5844155844155844],
  C: [10.546761031048252, 8.793416517685559, 16.64616823924906, 0.6239412761151891]
};
for (const [arm, expected] of Object.entries(expectedMetrics)) {
  const metric = python.armResults[arm].metrics;
  const actual = [metric.medianAbsoluteErrorPercentagePoints, metric.meanAbsoluteErrorPercentagePoints, metric.maximumAbsoluteErrorPercentagePoints, metric.spearman];
  assert(actual.every((value, index) => close(value, expected[index])), `RC53 ${arm} metrics changed`);
  assert(node.armResults[arm].metrics.count === 22, `RC53 Node ${arm} target count changed`);
}
const verdicts = Object.fromEntries(python.hypotheses.map(item => [item.code, item.verdict]));
assert(verdicts.H0 === "rejected" && verdicts.H1 === "rejected" && verdicts.H2 === "rejected" && verdicts.H3 === "unsupported-by-design", "RC53 registered verdicts changed");
assert(node.counts.untouchedTarget === 22 && node.hypotheses.every(item => item.verdict === verdicts[item.code]), "RC53 Node denominators or verdicts changed");
assert(audit.verdict === "pass" && audit.failures.length === 0 && audit.comparisons.total === 117 && audit.verdictsMatch === true && audit.maximumAbsoluteDifference < 1e-12, "RC53 independent audit failed or changed");
assert(diagnostic.status.startsWith("exploratory-after-registered-outcomes") && close(diagnostic.registeredFullPassport.withinExperimentCenteredSpearman, -0.011857707509881422), "RC53 pooled/within-regime boundary changed");
assert(close(diagnostic.postHocBlockAblations.D_capacity_plus_dma.metrics.medianAbsoluteErrorPercentagePoints, 8.44960735281045) && close(diagnostic.postHocBlockAblations.E_capacity_plus_resistance.metrics.medianAbsoluteErrorPercentagePoints, 6.7620619465133425), "RC53 post-verdict diagnostic changed");
assert(connectionEvidence.connectionId === "CONN-EVIDENCE-026" && connectionEvidence.problemIds.join("|") === "UP-219|UP-233|UP-234" && connectionEvidence.variableMapping.length === 5 && connectionEvidence.holdsWhen.length === 5 && connectionEvidence.breaksWhen.length === 5, "RC53 structural connection evidence incomplete");
assert(result.precommit.gitCommit === "b2fb296" && result.precommit.pilotSchemaCommit === "47bf264" && result.newlyVerifiedFacts.length === 12 && result.workPackages.length === 4 && result.failedOrRejectedApproaches.length === 7 && result.uncertaintyBudget.length === 5, "RC53 integrated cycle record incomplete");
assert(result.failedRuns.length === 2 && result.mostPromisingPath.status.includes("not established as novel") && result.nextCycleStart.startsWith("Do not tune another static model"), "RC53 failures, novelty, or continuation boundary weakened");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 51 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInNewContext(readText(file), sandbox, { filename: file });
const problems = sandbox.window.PROBLEMS;
const sources = sandbox.window.CATALOG_SOURCES;
const cycles = sandbox.window.RESEARCH_CYCLES;
const connections = sandbox.window.RESEARCH_CONNECTIONS;
const cycle = cycles.find(item => item.id === "RC-2026-53");
const connection = connections.find(item => item.id === "CONN-EVIDENCE-026");
assert(cycle?.problemIds.join("|") === "UP-219|UP-233|UP-234" && cycle.connectionIds.join("|") === "CONN-EVIDENCE-026", "RC53 public scope changed");
assert(cycle.verifiedFindings.length === 12 && cycle.resultMatrix.rows.length === 10 && cycle.artifacts.length === 14 && cycle.log.length === 12, "RC53 public cycle record incomplete");
for (const item of cycle.artifacts) assert(fs.existsSync(path.join(root, item.url)), `Missing RC53 artifact: ${item.url}`);
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|"), "RC53 public connection scope changed");
for (const field of ["sharedBottleneck", "mapping", "transfer", "minimumTest", "failureBoundary", "evidence", "validationStatus"]) assert(connection[field]?.text && connection[field]?.textEn, `RC53 connection missing ${field}`);
for (const id of cycle.problemIds) {
  const problem = problems.find(item => item.id === id);
  const record = problem?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 4 && record.sourceIds.length >= 5, `${id}: RC53 hypotheses or sources incomplete`);
  assert(record.focusedPage === true && record.technicalAxes.length === 3 && record.causalChain.length === 5, `${id}: focused causal research frame incomplete`);
  assert(record.workPackages.length === 3 && record.uncertaintyBudget.length === 4 && record.decisionTree.length === 3, `${id}: focused execution program incomplete`);
  assert(problem.cycleResearch === record && problem.researchConnections.includes(connection.id), `${id}: current research or connection not attached`);
  for (const field of ["centralQuestion", "resolutionCriterion", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) assert(record[field]?.text && record[field]?.textEn, `${id}: RC53 ${field} is not bilingual`);
  for (const step of record.causalChain) for (const field of ["title", "claim", "failure"]) assert(step[field]?.text && step[field]?.textEn, `${id}: incomplete causal step ${step.code}.${field}`);
  for (const item of record.workPackages) for (const field of ["title", "objective", "method", "deliverable", "gate"]) assert(item[field]?.text && item[field]?.textEn, `${id}: incomplete work package ${item.code}.${field}`);
  for (const item of record.hypotheses) for (const field of ["claim", "prediction", "test", "reject"]) assert(item[field]?.text && item[field]?.textEn, `${id}: incomplete hypothesis ${item.code}.${field}`);
}
for (const id of ["imperial_m50t_dataset_2024", "kirkaldy_m50t_2024", "li_dma_models_2025", "ramasubramanian_path_indicators_2025", "dynamic_path_prediction_2025"]) assert(sources[id]?.reviewedOn === "2026-08-26" && /^https:\/\//.test(sources[id].url), `RC53 source missing or stale: ${id}`);
assert(Object.keys(sources).length === 314 && cycles.length === 53 && connections.length === 56, "RC53 cumulative source, cycle, or connection count changed");
assert(problems.filter(item => item.researchHistory?.length).length === 15 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 169, "RC53 research-record count changed");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(readText(page).includes("research-cycle-53-data.js"), `${page} does not load RC53`);
const publicText = readText("research-cycle-53-data.js");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추", "분량 목표", "전공자 관점의 질문은"]) assert(!publicText.includes(phrase), `RC53 contains forbidden wording: ${phrase}`);
for (const script of ["audit_rc53_battery_mechanism_bridge.py", "pilot_rc53_battery_mechanism_bridge.py", "run_rc53_battery_mechanism_bridge.py", "independent-rc53-battery-mechanism-bridge.mjs", "diagnose_rc53_battery_mechanism_bridge.py", "verify-rc53-battery-mechanism-bridge-cycle.mjs"]) assert(readText("package.json").includes(script), `package.json missing RC53 script: ${script}`);
assert(readText("sitemap.xml").includes("RC-2026-53&amp;lang=ko") && readText("sitemap.xml").includes("RC-2026-53&amp;lang=en"), "RC53 missing from sitemap.xml");
const readme = readText("README.md");
const currentCycles = Number(readme.match(/([\d,]+)개 누적 연구 사이클/)?.[1].replaceAll(",", ""));
const currentUrls = Number(readme.match(/([\d,]+)개 현지화 URL/)?.[1].replaceAll(",", ""));
const currentSources = Number(readme.match(/([\d,]+)개 기관·로드맵·원 연구 출처/)?.[1].replaceAll(",", ""));
assert(currentCycles >= 54 && currentUrls >= 1598 && currentSources >= 319, "README cumulative counts incomplete after RC54");

console.log("RC53 verified: 40 cells, 4 zero-weight pilots, 14 development cells, 22 untouched regime holdouts, 117 independent comparisons, and an explicit pooled/within-regime failure boundary.");
