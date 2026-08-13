import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/iucr-qarr-open-world-spec.json");
const manifest = load("research/reproducibility/iucr-qarr-open-world-manifest.json");
const result = load("research/reproducibility/iucr-qarr-open-world-result.json");
const audit = load("research/reproducibility/iucr-qarr-open-world-python-audit.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const close = (left, right, tolerance = 1e-8) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;

check(spec.benchmarkId === result.benchmarkId && spec.status === "sealed-before-sample-2-numerical-computation", "RC22 seal or benchmark differs");
check(spec.knowledgeFirewall.blindDetection.includes("may not read") && spec.knowledgeFirewall.finalAdjudication.includes("Only after"), "knowledge firewall is incomplete");
check(spec.competingHypotheses.length === 4 && spec.stopConditions.length >= 5, "hypotheses or stop conditions changed");
check(spec.numericalContract.fitRangeDegrees2Theta.join("|") === "10|100" && spec.numericalContract.dominantBrucite001MaskDegrees2Theta.join("|") === "17.8|19.4", "fit range or orientation mask changed");

check(manifest.status === "source-lineage-fixed-before-sample-2-computation" && manifest.files.length === 3, "open-world lineage is not fixed");
check(manifest.files.every(file => file.points === 7251 && file.bytes === 137770 && file.archive.timestamp && file.archive.warcDigest), "numerical or archive contract changed");
check(manifest.verified.uniqueHashes === 3 && manifest.verified.totalBytes === 413310, "hash or byte denominator changed");
check(manifest.files.map(file => file.name).sort().join("|") === "brucite.prn|cpd-2.prn|silica.prn", "target or candidate set changed");

check(result.denominators.calibrationMixtures === 3 && result.denominators.knownOnlyControls === 5 && result.denominators.candidateTemplates === 2, "RC22 denominators changed");
check(result.denominators.fullFitPoints === 4501 && result.denominators.maskedFitPoints === 4420, "fit-point denominator changed");
check(close(result.blindCalibration.s0, 0.993912948) && close(result.blindCalibration.massAlarmThresholdPercentagePoints, 10) && close(result.blindCalibration.residualAlarmThreshold, 0.336902813), "blind scale or thresholds changed");
check(result.blindCalibration.knownOnlyControls.every(row => !row.alarm), "a known-only control now alarms");
check(result.blindCalibration.targetBeforeCandidateDisclosure.alarm && close(result.blindCalibration.targetBeforeCandidateDisclosure.missingMass, 17.213002, 1e-6) && close(result.blindCalibration.targetBeforeCandidateDisclosure.normalizedResidual, 0.760565887), "blind Sample 2 decision changed");
check(close(result.closedThreePhase.primaryPeakRir.composition.corundum, 33.251045, 1e-6) && close(result.closedThreePhase.wholePattern.composition.corundum, 37.126578, 1e-6), "closed composition changed");
const fullBrucite = result.candidateAttribution.fullRange.ranking.find(row => row.candidate === "brucite");
const fullSilica = result.candidateAttribution.fullRange.ranking.find(row => row.candidate === "silica");
const maskedBrucite = result.candidateAttribution.dominantBrucite001Masked.ranking.find(row => row.candidate === "brucite");
check(result.candidateAttribution.fullRange.selected === "brucite" && close(fullBrucite.squaredResidualReduction, 0.957654955) && close(fullSilica.squaredResidualReduction, 0.01871031), "full candidate competition changed");
check(result.candidateAttribution.dominantBrucite001Masked.selected === "brucite" && close(maskedBrucite.squaredResidualReduction, 0.830204913), "masked candidate competition changed");
check(result.decisions.H1_closedThreePhaseSilentUnsafe && !result.decisions.H2_blindClosureDetectsMissingMass && result.decisions.H3_candidateCompetitionIdentifiesBrucite && result.decisions.H4_attributionSurvivesDominantPeakMask, "RC22 hypothesis decisions changed");
check(!result.decisions.independentPhysicalRungQualified, "historical replay overclaims physical independence");

check(close(audit.blindCalibration.s0, result.blindCalibration.s0) && close(audit.blindCalibration.targetMissingMass, result.blindCalibration.targetBeforeCandidateDisclosure.missingMass, 1e-6), "Python blind audit differs");
check(audit.candidateAttribution.fullSelected === result.candidateAttribution.fullRange.selected && close(audit.candidateAttribution.fullBruciteResidualReduction, fullBrucite.squaredResidualReduction), "Python candidate audit differs");
check(JSON.stringify(audit.decisions) === JSON.stringify(result.decisions), "Python decisions differ");

const context = { window: {} };
vm.createContext(context);
for (const file of [
  "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js",
  "research-cycle-data.js", "research-cycle-03-data.js", "research-cycle-04-data.js", "research-cycle-05-data.js", "research-cycle-06-data.js", "research-cycle-07-data.js", "research-cycle-08-data.js", "research-cycle-09-data.js", "research-cycle-10-data.js", "research-cycle-11-data.js", "research-cycle-12-data.js", "research-cycle-13-data.js", "research-cycle-14-data.js", "research-cycle-15-data.js", "research-cycle-16-data.js", "research-cycle-17-data.js", "research-cycle-18-data.js", "research-cycle-19-data.js", "research-cycle-20-data.js", "research-cycle-21-data.js", "research-cycle-22-data.js"
]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const cycle = context.window.RESEARCH_CYCLES.find(row => row.id === "RC-2026-22");
const connection = context.window.RESEARCH_CONNECTIONS.find(row => row.id === "CONN-CLOSURE-001");
check(cycle?.problemIds.join("|") === "UP-182|UP-184|UP-185" && cycle.artifacts.length === 8, "RC22 cycle record is incomplete");
check(cycle?.verifiedFindings.length >= 9 && cycle?.log.length >= 8 && cycle?.resultMatrix.rows.length >= 8, "RC22 evidence, log, or matrix is incomplete");
check(connection?.problemIds.join("|") === "UP-182|UP-184|UP-185" && connection.mapping.textEn && connection.minimumTest.textEn, "closure connection is incomplete");
for (const id of cycle?.problemIds || []) {
  const record = context.window.PROBLEMS.find(row => row.id === id)?.researchHistory?.find(row => row.cycleId === "RC-2026-22");
  check(record?.hypotheses.length === 4 && record.updatedDefinition.textEn && record.decisiveTest.textEn && record.unresolved.textEn, `RC22 bilingual record incomplete for ${id}`);
}
check(Object.keys(context.window.CATALOG_SOURCES).length === 165, "source count is not 165");
check(context.window.RESEARCH_CYCLES.length === 22 && context.window.RESEARCH_CONNECTIONS.length === 25, "cycle or connection count changed");
check(context.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 75, "research-record count is not 75");
for (const file of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, file), "utf8").includes("research-cycle-22-data.js"), `${file} does not load RC22`);

if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("RC22 verification passed: closed three-phase outputs silently hide brucite; blind residual refuses Sample 2, missing-mass quantification fails, brucite attribution survives the 001 mask, and two implementations agree.");
