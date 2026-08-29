import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = relative => fs.readFileSync(path.join(root, relative), "utf8");
const read = relative => JSON.parse(readText(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const close = (actual, expected, tolerance = 1e-9) => assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const repro = name => `research/reproducibility/${name}`;

const precommit = read(repro("rc54-kit-early-response-precommit.json"));
const prior = read(repro("rc54-kit-early-response-prior-art.json"));
const schema = read(repro("rc54-kit-early-response-schema-audit.json"));
const pilot = read(repro("rc54-kit-early-response-pilot.json"));
const amendment = read(repro("rc54-kit-early-response-amendment-01.json"));
const features = read(repro("rc54-kit-early-response-feature-table.json"));
const python = read(repro("rc54-kit-early-response-python.json"));
const node = read(repro("rc54-kit-early-response-node.json"));
const audit = read(repro("rc54-kit-early-response-independent-audit.json"));
const diagnostic = read(repro("rc54-kit-early-response-boundary-diagnostic.json"));
const solver = read(repro("rc54-kit-early-response-solver-note.json"));
const connectionEvidence = read(repro("rc54-kit-early-response-connection-evidence.json"));
const cycleResult = read(repro("rc54-kit-early-response-cycle-result.json"));

assert(precommit.cycleId === "RC-2026-54" && precommit.status.startsWith("sealed-"), "RC54 preregistration is not sealed");
assert(precommit.status.includes("before-any-EOC-EIS-or-pulse-result-value"), "RC54 chronology boundary is missing");
assert(precommit.cohortAndSplit.pilot.modelWeight === 0 && precommit.cohortAndSplit.pilot.cells.length === 4, "RC54 pilot contract changed");
assert(precommit.cohortAndSplit.development.maximumModelCount === 167 && precommit.cohortAndSplit.untouchedTarget.candidateCount === 57, "RC54 split contract changed");
const armLengths = Object.values(precommit.featureContract).filter(value => value?.featuresInOrder).map(value => value.featuresInOrder.length);
assert(JSON.stringify(armLengths) === JSON.stringify([11, 16, 1, 15]), "RC54 registered feature additions changed");
assert(precommit.competingHypotheses.length === 4 && prior.sources.length === 10, "RC54 hypothesis or prior-art boundary changed");

assert(schema.cohort.configuredCells === 228 && schema.cohort.conditions === 76 && schema.cohort.triplicateConditions === 76, "RC54 source matrix changed");
assert(schema.split.pilot.length === 4 && schema.split.development.count === 167 && schema.split.untouchedTarget.count === 57, "RC54 schema split changed");
assert(schema.assertions.outcomeValuesRead === false, "RC54 schema audit crossed the outcome boundary");
assert(pilot.scope.modelWeight === 0 && pilot.scope.nonPilotFilesRead === false && pilot.cells.length === 4, "RC54 pilot scope changed");
assert(pilot.assertions.pilotCountIs4 && pilot.assertions.everyPilotFeatureReady && pilot.assertions.everyPilotHasZeroWeight && pilot.assertions.nonPilotFilesRead === false, "RC54 pilot did not pass every assertion");
assert(amendment.status.includes("before-any-non-pilot-result-file"), "RC54 amendment chronology is missing");
assert(amendment.archiveIntegrity.length === 3 && amendment.archiveIntegrity.every(item => item.matches), "RC54 archive integrity failed");
assert(amendment.pilotBoundary.nonPilotResultFilesRead === false && amendment.pilotBoundary.targetResultFilesRead === false, "RC54 amendment opened forbidden rows");

const filesAt = commit => execFileSync("git", ["show", "--name-only", "--format=", commit], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean).sort();
const preregisteredFiles = [
  repro("rc54-kit-early-response-precommit.json"),
  repro("rc54-kit-early-response-prior-art.json"),
  repro("rc54-kit-early-response-schema-audit.json"),
  "scripts/audit-rc54-kit-schema.mjs"
].sort();
const pilotFiles = [
  repro("rc54-kit-early-response-amendment-01.json"),
  repro("rc54-kit-early-response-pilot.json"),
  "scripts/pilot-rc54-kit-early-response.mjs"
].sort();
assert(JSON.stringify(filesAt("afd9301")) === JSON.stringify(preregisteredFiles), "RC54 preregistration commit contents changed");
assert(JSON.stringify(filesAt("4ceb79d")) === JSON.stringify(pilotFiles), "RC54 pilot commit contents changed");
for (const outcome of ["feature-table", "python", "node", "independent-audit", "boundary-diagnostic", "cycle-result"]) {
  assert(!filesAt("afd9301").some(file => file.includes(outcome)) && !filesAt("4ceb79d").some(file => file.includes(outcome)), `RC54 ${outcome} predates its allowed boundary`);
}

assert(features.rows.length === 228, "RC54 feature table row count changed");
assert(features.featureNamesByArm.A.length === 11 && features.featureNamesByArm.B.length === 27 && features.featureNamesByArm.C.length === 28 && features.featureNamesByArm.D.length === 43, "RC54 nested arm dimensions changed");
const splitCounts = Object.groupBy ? Object.groupBy(features.rows, row => row.split) : features.rows.reduce((out, row) => ((out[row.split] ||= []).push(row), out), {});
assert(splitCounts.pilot.length === 4 && splitCounts.development.length === 167 && splitCounts.target.length === 57, "RC54 feature-table split changed");

assert(python.cohort.configuredCells === 228 && python.cohort.completeDevelopmentCells === 156 && python.cohort.completeTargetCells === 44, "RC54 modeled cohort changed");
assert(python.cohort.targetEvents === 36 && python.cohort.targetCensored === 8 && python.cohort.targetFeatureComplete === false, "RC54 common-target status changed");
const expectedMdAE = { A: 226.2222077673, B: 166.5307410780, C: 298.4478412723, D: 240.4607994095 };
const expectedWithin = { A: 0.5, B: 0.5925925926, C: 0.4074074074, D: 0.5185185185 };
for (const arm of ["A", "B", "C", "D"]) {
  close(python.metrics[arm].medianAbsoluteErrorDays, expectedMdAE[arm], 1e-8);
  close(python.metrics[arm].withinConditionConcordance.value, expectedWithin[arm], 1e-10);
  assert(python.metrics[arm].targetCount === 44 && python.metrics[arm].eventCount === 36, `RC54 arm ${arm} denominator changed`);
  assert(python.hypotheses[`H${arm === "A" ? "0" : arm === "B" ? "1" : arm === "C" ? "2" : "3"}`].verdict === "rejected", `RC54 arm ${arm} verdict changed`);
}
close(python.comparisons.BvsA, 0.2638620995, 1e-9);
close(python.comparisons.CvsB, -0.7921486408, 1e-9);
close(python.comparisons.DvsC, 0.1942953972, 1e-9);
assert(python.bootstrap.replicatesComputed === 2000 && python.bootstrap.percentile95Interval[0] < 0 && python.bootstrap.percentile95Interval[1] > 0, "RC54 bootstrap boundary changed");
assert(node.cohort.completeTargetCells === 44 && Object.keys(node.hypotheses).length === 4, "RC54 independent result changed");
assert(audit.pass && audit.hypothesesMatch && audit.comparedNumericScalars === 850 && audit.maximumAbsoluteDifference < 1e-5, "RC54 independent audit failed");

assert(diagnostic.status.includes("post-outcome"), "RC54 diagnostic is not marked post-outcome");
assert(diagnostic.confirmedBoundaries.allTarget.cells === 57 && diagnostic.confirmedBoundaries.allTarget.events === 46 && diagnostic.confirmedBoundaries.allTarget.censored === 11, "RC54 full target ledger changed");
assert(diagnostic.confirmedBoundaries.commonCompleteDevelopment.events === 113 && diagnostic.confirmedBoundaries.developmentByFamily.calendar.events === 0, "RC54 development boundary changed");
close(diagnostic.registeredFeatureDirectionsWithinConditionAllAvailableTarget.earlyCapacityResponse.value, 0.6222222222, 1e-9);
close(diagnostic.registeredFeatureDirectionsWithinConditionAllAvailableTarget.early_log_pulse_r10ms_response_per_day_soc30.value, 0.6444444444, 1e-9);
assert(diagnostic.pairedErrorDiagnosis.DvsC.losses === 25 && diagnostic.pairedErrorDiagnosis.DvsC.wins === 11, "RC54 paired-error diagnostic changed");
assert(solver.status.includes("post-outcome") && solver.numericalCorrection.verdictChange === "none", "RC54 solver correction boundary changed");
assert(connectionEvidence.connectionId === "CONN-EVIDENCE-027" && connectionEvidence.problemIds.length === 3, "RC54 structural connection evidence changed");
assert(cycleResult.newlyVerifiedFacts.length === 12 && cycleResult.workPackages.length === 4 && cycleResult.failedRuns.length === 3, "RC54 cycle record is incomplete");
assert(cycleResult.hypotheses.every(item => item.verdict === "rejected"), "RC54 cycle record contradicts the registered verdicts");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 52 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInNewContext(readText(file), sandbox, { filename: file });
}
const problems = sandbox.window.PROBLEMS;
const sources = sandbox.window.CATALOG_SOURCES;
const cycles = sandbox.window.RESEARCH_CYCLES;
const connections = sandbox.window.RESEARCH_CONNECTIONS;
const cycle = cycles.find(item => item.id === "RC-2026-54");
assert(problems.length === 744 && Object.keys(sources).length === 319, "RC54 catalog/source counts changed");
assert(cycles.length === 54 && connections.length === 57, "RC54 cycle/connection counts changed");
assert(problems.filter(problem => problem.researchHistory?.length).length === 15, "RC54 curated-problem count changed");
assert(problems.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 172, "RC54 research-record count changed");
assert(cycle && cycle.problemIds.join(",") === "UP-219,UP-233,UP-234", "RC54 public cycle problem set changed");
assert(typeof cycle.title === "string" && typeof cycle.titleEn === "string" && cycle.selectionReason?.length > 100 && cycle.selectionReasonEn?.length > 100, "RC54 cycle heading or selection rationale is not renderable bilingually");
assert(cycle.startedOn === "2026-08-29" && cycle.reviewedOn === "2026-08-29", "RC54 public dates changed");
assert(cycle.verifiedFindings.length === 12 && cycle.resultMatrix.rows.length === 10 && cycle.artifacts.length === 15 && cycle.log.length === 12, "RC54 public cycle is incomplete");
for (const id of cycle.problemIds) {
  const record = problems.find(problem => problem.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record, `RC54 public record missing for ${id}`);
  assert(record.reviewedOn === "2026-08-29", `RC54 review date changed for ${id}`);
  assert(record.hypotheses.length === 4 && record.technicalAxes.length === 3 && record.causalChain.length === 5, `RC54 hypothesis or causal structure missing for ${id}`);
  assert(record.workPackages.length === 3 && record.uncertaintyBudget.length === 4 && record.decisionTree.length === 3, `RC54 execution structure missing for ${id}`);
  for (const field of [record.updatedDefinition, record.knownBoundary, record.bottleneck, record.minimumAdvance, record.decisiveTest, record.unresolved]) {
    assert(field?.text?.length > 40 && field?.textEn?.length > 40, `RC54 bilingual explanation too thin for ${id}`);
  }
}
assert(connections.some(item => item.id === "CONN-EVIDENCE-027"), "RC54 public connection is missing");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(readText(page).includes("research-cycle-54-data.js"), `${page} does not load RC54`);
const publicText = readText("research-cycle-54-data.js");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추"]) assert(!publicText.includes(phrase), `Forbidden editorial phrase remains: ${phrase}`);
assert(readText("sitemap.xml").includes("cycle=RC-2026-54&amp;lang=ko") && readText("sitemap.xml").includes("cycle=RC-2026-54&amp;lang=en"), "RC54 sitemap URLs are missing");
const readme = readText("README.md");
const readmeCycles = Number(readme.match(/(\d+)개 누적 연구 사이클/)?.[1]);
const readmeUrls = Number((readme.match(/([\d,]+)개 현지화 URL/)?.[1] || "").replaceAll(",", ""));
const readmeSources = Number(readme.match(/(\d+)개 기관·로드맵·원 연구 출처/)?.[1]);
assert(readmeCycles >= 54 && readmeUrls >= 1598 && readmeSources >= 319, "README cumulative counts are incomplete");
const pkg = read("package.json");
for (const command of ["research:rc54-schema", "research:rc54-pilot", "research:rc54-python", "research:rc54-node", "research:rc54-adjudicate", "research:rc54-diagnostic", "verify:rc54"]) assert(pkg.scripts[command], `Missing package command ${command}`);
assert(pkg.scripts.pretest?.includes("verify-rc54-kit-early-response-cycle.mjs"), "RC54 verifier is not in the default test path");

console.log("RC54 KIT held-temperature early-response cycle verification passed.");
