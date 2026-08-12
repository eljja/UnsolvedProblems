import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/nist-phase-fraction-drift-envelope-spec.json");
const result = load("research/reproducibility/nist-phase-fraction-drift-envelope-result.json");
const independent = load("research/reproducibility/nist-phase-fraction-drift-independent-audit.json");
const physical = load("research/reproducibility/vo2-phase-fraction-physical-pilot-preregistration.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const close = (left, right, tolerance = 1e-9) => Math.abs(left - right) <= tolerance;

check(spec.benchmarkId === result.benchmarkId && result.benchmarkId === "NIST-VO2-DRIFT-ENVELOPE-0.1", "drift-envelope spec/result contract differs");
check(result.source.rawProfilesSha256 === "3b47bf36b2abaef376730226e2616a353ba07571c46e71bce464cf9e9bfbe348", "drift-envelope source hash changed");
check(result.denominators.compositions === 6 && result.denominators.endpointProfiles === 12 && result.denominators.anglePointsPerProfile === 3841, "endpoint denominator changed");
check(result.denominators.fractions === 99 && result.denominators.shiftMagnitudes === 41 && result.denominators.totalCases === 48114, "continuous-grid denominator changed");
check(result.globalSafeShiftPrefixDegrees === 0.00325, "global safe-shift prefix changed");
const expectedCompositionLimits = { 92: 0.00325, 93: 0.004, 94: 0.0045, 95: 0.0045, 96: 0.005, 97: 0.00525 };
for (const [composition, expected] of Object.entries(expectedCompositionLimits)) check(result.byComposition[composition].safeShiftPrefixDegrees === expected, `composition ${composition} safe-shift prefix changed`);
const byShift = magnitude => result.byShift.find(row => row.shiftMagnitudeDegrees === magnitude);
check(close(byShift(0.003).maximumAbsoluteError, 0.045368309) && close(byShift(0.004).maximumAbsoluteError, 0.060986628), "failure onset around 0.003-0.004 degrees changed");
check(close(byShift(0.005).maximumAbsoluteError, 0.076862955) && close(byShift(0.01).maximumAbsoluteError, 0.189536209), "large-shift envelope changed");
check(close(byShift(0.005).maximumAbsoluteOddBias, 0.01883133) && close(byShift(0.005).maximumAbsoluteEvenBias, 0.058031625), "odd/even curvature decomposition changed");
check(byShift(0.005).maximumAbsoluteEvenBias > byShift(0.005).maximumAbsoluteOddBias, "finite-shift curvature no longer dominates at 0.005 degrees");
check(result.activeSet.boundaryCases === 0 && result.activeSet.fractionOfCases === 0, "active-set boundary interpretation changed");
check(close(result.residualRefusal.thresholdSelectedOnDevelopment, 0.012291693423, 1e-12), "development residual threshold changed");
check(result.residualRefusal.development.unsafeCases === 6681 && result.residualRefusal.development.unsafeAcceptedCases === 0, "development refusal outcome changed");
check(result.residualRefusal.holdout.unsafeCases === 5785 && result.residualRefusal.holdout.unsafeAcceptedCases === 0, "holdout refusal outcome changed");
check(close(result.residualRefusal.holdout.acceptedCoverage, 0.442864863) && close(result.residualRefusal.holdout.safeRefusalRate, 0.416922067), "holdout refusal utility changed");
check(Object.values(result.gates).every(Boolean), "a drift-envelope gate failed");

check(independent.allComparisonsPass && Object.values(independent.comparisonsWithJavaScript).every(Boolean), "independent Python drift replay disagrees");
check(independent.denominators.totalCases === result.denominators.totalCases, "independent denominator differs");
check(close(independent.globalSafeShiftPrefixDegrees, result.globalSafeShiftPrefixDegrees, 1e-12), "independent global safe shift differs");
check(independent.activeBoundaryCases === 0, "independent audit found an active boundary");

check(physical.protocolId === "VO2-PHASE-FRACTION-PHYSICAL-PILOT-0.1" && physical.status === "preregistered-design-not-executed", "physical protocol status overclaims execution");
check(physical.measurandLadder.length === 3 && physical.measurandLadder.map(row => row.level).join("|") === "instrument|stable-surrogate|target-system", "physical measurand ladder changed");
check(physical.whyKnownFractionVO2MixingIsNotTheFirstControl.includes("not guaranteed"), "physical protocol does not reject assumed known-fraction VO2 mixing");
check(physical.frozenComputationalBound.totalUnmodeledRelativeShiftStopDegrees === result.globalSafeShiftPrefixDegrees, "physical protocol drift bound differs from benchmark");
check(physical.frozenComputationalBound.notMeaning.includes("not a universal instrument tolerance"), "physical bound overclaims instrument tolerance");
check(Object.keys(physical.rolesAndBlindKeys).length >= 6 && physical.rolesAndBlindKeys.keyReleaseOrder.length === 6, "blind roles or release order incomplete");
check(physical.experimentalSequence.length === 6 && physical.experimentalSequence.every(row => row.workPackage && row.purpose && row.inputs && row.method && row.deliverable && row.pass && row.fail && row.next), "physical work packages incomplete");
check(physical.competingHypotheses.length === 3 && physical.competingHypotheses.every(row => row.claim && row.divergentPrediction && row.decisiveTest && row.reject && row.stop), "physical competing hypotheses incomplete");
check(physical.uncertaintyBudget.length >= 10 && physical.safetyAndEthics.length >= 5 && physical.sources.length >= 9, "physical uncertainty, safety, or source coverage incomplete");

const context = { window: {} };
vm.createContext(context);
for (const file of [
  "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js",
  "research-cycle-data.js", "research-cycle-03-data.js", "research-cycle-04-data.js", "research-cycle-05-data.js", "research-cycle-06-data.js", "research-cycle-07-data.js", "research-cycle-08-data.js", "research-cycle-09-data.js", "research-cycle-10-data.js", "research-cycle-11-data.js", "research-cycle-12-data.js", "research-cycle-13-data.js", "research-cycle-14-data.js", "research-cycle-15-data.js", "research-cycle-16-data.js", "research-cycle-17-data.js"
]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const cycle = context.window.RESEARCH_CYCLES.find(row => row.id === "RC-2026-17");
const connection = context.window.RESEARCH_CONNECTIONS.find(row => row.id === "CONN-LADDER-001");
check(cycle && cycle.problemIds.join("|") === "UP-182|UP-185|UP-195" && cycle.artifacts.length === 7, "RC17 cycle record incomplete");
check(connection && connection.problemIds.includes("UP-184") && connection.minimumTest.textEn, "measurand-ladder connection incomplete");
for (const id of cycle?.problemIds || []) {
  const problem = context.window.PROBLEMS.find(row => row.id === id);
  const record = problem?.researchHistory?.find(row => row.cycleId === "RC-2026-17");
  check(record && record.hypotheses.length === 3 && record.updatedDefinition.textEn && record.decisiveTest.textEn, `RC17 bilingual record incomplete for ${id}`);
}
for (const id of ["nist_qpa_srm676a_2011", "iucr_qpa_round_robin_2001", "nist_texture_phase_bias_2021", "iucr_powder_metadata_2025", "vo2_multimodal_probe_2016", "vo2_cross_measurement_2020"]) check(context.window.CATALOG_SOURCES[id]?.publishedOn, `new source ${id} missing`);
check(Object.keys(context.window.CATALOG_SOURCES).length === 155, "source count is not 155");
check(context.window.RESEARCH_CYCLES.length === 17 && context.window.RESEARCH_CONNECTIONS.length === 20, "cycle or connection count changed");
check(context.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 60, "research-record count is not 60");

for (const file of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, file), "utf8").includes("research-cycle-17-data.js"), `${file} does not load RC17`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("RC17 verification passed: the continuous drift envelope is independently reproduced, curvature is separated from inactive constraints, residual refusal is held out, and the physical measurand ladder remains explicitly unexecuted.");
