import fs from "node:fs";
import vm from "node:vm";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const text = file => fs.readFileSync(file, "utf8");
const near = (a, b, tolerance = 1e-12) => Math.abs(a - b) <= tolerance;
const repro = "research/reproducibility/";

const contract = read(`${repro}rc73-nircam-calibration-contract.json`);
const receipt = read(`${repro}rc73-preregistration-receipt.json`);
const result = read(`${repro}rc73-nircam-calibration-result.json`);
const audit = read(`${repro}rc73-nircam-calibration-node-audit.json`);
const sourceReview = read(`${repro}rc73-source-review.json`);
const priorArt = read(`${repro}rc73-prior-art-boundary.json`);
const connectionArtifact = read(`${repro}rc73-isolated-calibration-connection.json`);
const cycleResult = read(`${repro}rc73-nircam-calibration-cycle-result.json`);

assert(contract.cycle === "RC-2026-73" && contract.status === "locked_before_pixel_measurement", "RC73 contract identity or lock state changed");
assert(contract.selection.proposalId === "6605" && contract.selection.supportedCalProducts === 24 && contract.selection.supportPerTargetDetectorFilter === 4, "RC73 registered support changed");
assert(contract.competingHypotheses.length === 3 && contract.measurement.apertureRadiusPixels === 5 && contract.measurement.backgroundAnnulusPixels.join(",") === "20,35", "RC73 hypothesis or measurement operator changed");
assert(contract.gates.maximumRobustSigmaFraction === 0.01 && contract.gates.maximumDitherExcursionFraction === 0.02 && contract.gates.maximumMatchedNrcb1PatternDifference === 0.01, "RC73 registered thresholds changed");
assert(contract.stoppingRules.length === 4 && contract.claimBoundary.includes("does not validate"), "RC73 stopping or claim boundary is incomplete");
assert(receipt.cycle === contract.cycle && receipt.supportedProducts === 24 && receipt.pixelDataReadBeforeLock === false, "RC73 pre-pixel receipt changed");
assert(receipt.phase.includes("before SCI, DQ, or AREA") && receipt.immutableAfterLock.length === 5, "RC73 outcome boundary is incomplete");

assert(result.cycle === contract.cycle && result.measurements.length === 24 && Object.keys(result.groups).length === 6, "RC73 measurement rows or groups changed");
assert(result.measurements.every(row => row.badDoNotUsePixelsR3 === 0 && [1, 2, 3, 4].includes(row.patternNumber)), "RC73 DQ support or dither patterns changed");
for (const [key, group] of Object.entries(result.groups)) assert(group.r5.n === 4, `${key}: RC73 r5 support is not 4/4`);
const failedGroup = result.groups["WDFS0458-56|NRCB1|F090W"];
assert(near(failedGroup.r5.robustSigmaFraction, 0.008839554889627883) && near(failedGroup.r5.maxAbsDeviationFraction, 0.02308405061907637), "RC73 F090W failure metrics changed");
assert(near(failedGroup.r3.maxAbsDeviationFraction, 0.02577541780748549) && near(failedGroup.r8.maxAbsDeviationFraction, 0.023849253317648977), "RC73 aperture-radius sensitivity changed");
assert(near(result.matchedNrcb1Replication.F090W.maxAbsNormalizedDifference, 0.02155366846215201) && near(result.matchedNrcb1Replication.F150W.maxAbsNormalizedDifference, 0.005674125846556577), "RC73 matched-pattern metrics changed");
assert(result.decision.supportFourOfFourPerGroup && result.decision.zeroDoNotUsePixelsWithinR3 && result.decision.maxRobustSigmaAtMostOnePercent, "RC73 passing local gates changed");
assert(!result.decision.maxDitherExcursionAtMostTwoPercent && !result.decision.matchedNrcb1PatternDifferenceAtMostOnePercent && !result.decision.localMeasurementOperatorQualified, "RC73 terminal negative decision changed");

assert(audit.cycle === contract.cycle && audit.reproduced && audit.maximumAbsoluteMetricDifferenceFromPython === 0 && audit.tolerance === 1e-12, "RC73 independent audit failed");
assert(Object.keys(audit.groups).length === 6 && near(audit.matchedNrcb1MaximumDifference.F090W, 0.02155366846215201), "RC73 independent group or pattern result changed");
assert(JSON.stringify(audit.decision) === JSON.stringify(result.decision), "RC73 Python and Node decisions disagree");

assert(sourceReview.sources.length === 6 && sourceReview.confirmedFacts.length === 8 && sourceReview.inferences.length === 4 && sourceReview.unverifiedProposals.length === 3, "RC73 source review is incomplete");
assert(sourceReview.sources.filter(source => source.type.includes("primary")).length === 2 && sourceReview.prizeStatus.checked && sourceReview.prizeStatus.amount === null, "RC73 primary-source or prize boundary is incomplete");
assert(priorArt.establishedBeforeThisCycle.length === 4 && priorArt.similarities.length === 3 && priorArt.differences.length === 3 && priorArt.cycleSpecificCombination.noveltyClaim.startsWith("No claim"), "RC73 prior-art boundary is incomplete");
assert(connectionArtifact.id === "CONN-EVIDENCE-043" && connectionArtifact.problemIds.join(",") === "UP-003,UP-625,UP-626", "RC73 connection scope changed");
assert(connectionArtifact.conditionsForValidity.length === 4 && connectionArtifact.conditionsThatBreakIt.length === 3 && connectionArtifact.validationStatus.includes("F090W pattern transfer failed"), "RC73 connection validity boundary is incomplete");
assert(cycleResult.status === "completed-negative-local-adjudication" && cycleResult.selectedProblems.join(",") === "UP-003,UP-625,UP-626", "RC73 research record identity changed");
assert(cycleResult.newFacts.length === 4 && cycleResult.changedProblemStates.length === 3 && cycleResult.reproducedOrRejectedApproaches.length === 3 && cycleResult.survivingHypotheses.length === 3, "RC73 research record is incomplete");
assert(cycleResult.failuresPreserved.length === 3 && cycleResult.nextStart.includes("Program 7565"), "RC73 preserved failure or next start is missing");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 71 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInNewContext(text(file), sandbox, { filename: file });
const problems = sandbox.window.PROBLEMS || [];
const sources = sandbox.window.CATALOG_SOURCES || {};
const cycles = sandbox.window.RESEARCH_CYCLES || [];
const connections = sandbox.window.RESEARCH_CONNECTIONS || [];
assert(problems.length === 744 && Object.keys(sources).length === 394 && cycles.length === 73 && connections.length === 73, "RC73 public catalogue totals changed");
assert(problems.reduce((sum, problem) => sum + (problem.researchHistory || []).length, 0) === 234, "RC73 problem-history total changed");
const siteCycle = cycles.find(cycle => cycle.id === "RC-2026-73");
assert(siteCycle?.problemIds.join(",") === "UP-003,UP-625,UP-626" && siteCycle.connectionIds[0] === "CONN-EVIDENCE-043", "RC73 public scope changed");
assert(siteCycle.verifiedFindings.length === 12 && siteCycle.resultMatrix.rows.length === 11 && siteCycle.artifacts.length === 8 && siteCycle.log.length === 10, "RC73 public cycle record is incomplete");
assert(siteCycle.resultMatrix.rows.some(row => row.label === "MAXIMUM EXCURSION" && row.values[2].text === "실패"), "RC73 public matrix hides the excursion failure");
assert(siteCycle.resultMatrix.rows.some(row => row.label === "NRCB1 F090W PATTERN" && row.values[2].text === "실패"), "RC73 public matrix hides the transport failure");
assert(siteCycle.sharedProgram.status.text.includes("Program 7565") && siteCycle.nextCycle.text.includes("아직 열지 않는다"), "RC73 holdout reservation is missing");
for (const id of siteCycle.problemIds) {
  const problem = problems.find(row => row.id === id);
  const record = (problem?.researchHistory || []).find(row => row.cycleId === "RC-2026-73");
  assert(problem?.cycleResearch === record, `${id}: RC73 is not the current focused record`);
  assert(record?.focusedPage && record.technicalAxes.length === 3 && record.causalChain.length === 4 && record.hypotheses.length >= 3 && record.workPackages.length === 3 && record.uncertaintyBudget.length >= 4 && record.decisionTree.length === 4, `${id}: RC73 focused record is incomplete`);
  for (const key of ["role", "centralQuestion", "resolutionCriterion", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) assert(record?.[key]?.text?.length > 60 && record?.[key]?.textEn?.length > 80, `${id}: RC73 ${key} is not substantive and bilingual`);
  for (const sourceId of record?.sourceIds || []) assert(sources[sourceId], `${id}: missing public source ${sourceId}`);
}
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.text)).size === 3, "RC73 Korean narratives are duplicated");
assert(new Set(siteCycle.problemIds.map(id => problems.find(problem => problem.id === id).cycleResearch.updatedDefinition.textEn)).size === 3, "RC73 English narratives are duplicated");
const siteConnection = connections.find(item => item.id === "CONN-EVIDENCE-043");
assert(siteConnection?.reviewedOn === "2026-09-01" && siteConnection.validationStatus.text.includes("F090W pattern transport"), "RC73 site connection is missing");

for (const page of ["index.html", "solve.html", "research-log.html"]) assert(text(page).includes("research-cycle-73-data.js?v=20260901-cycle73"), `${page}: RC73 script is missing`);
assert(text("scripts/generate-sitemap.mjs").includes("length: 71"), "Sitemap generator omits RC73");
const publicProse = text("research-cycle-73-data.js");
for (const forbidden of ["전공자 포인트", "1단계", "개수를 맞", "아래 시도는 개별 논문"]) assert(!publicProse.includes(forbidden), `RC73 public prose contains forbidden wording: ${forbidden}`);

if (failures.length) {
  console.error(`RC73 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC73 verified: 24 isolated-standard exposures pass support, DQ, and robust-scatter gates; F090W fails excursion and cross-star replication; Node reproduces every metric; downstream science remains closed; and Program 7565 is reserved as a fresh holdout.");
