import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/iucr-qarr-external-holdout-spec.json");
const manifest = load("research/reproducibility/iucr-qarr-external-holdout-manifest.json");
const result = load("research/reproducibility/iucr-qarr-external-holdout-result.json");
const audit = load("research/reproducibility/iucr-qarr-external-holdout-python-audit.json");
const rc20 = load("research/reproducibility/iucr-qpa-independent-reduction-result.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const close = (left, right, tolerance = 1e-8) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;

check(spec.benchmarkId === result.benchmarkId && result.benchmarkId === "IUCR-QARR-EXTERNAL-COMPOSITION-0.1", "RC21 spec/result contract differs");
check(spec.status === "sealed-before-external-holdout-computation", "RC21 was not sealed before holdout computation");
check(spec.calibrationSamples.join("|") === "1a|1b|1c" && spec.externalHoldoutSamples.join("|") === "1d|1e|1f|1g|1h", "calibration/holdout split changed");
check(spec.frozenPeakReduction.noRetuning.includes("Do not change"), "RC20 peak parameters are no longer frozen");
check(spec.preregisteredFullPatternCompetitor.angleRangeDegrees2Theta.join("|") === "20|100", "full-pattern range changed");
check(spec.preregisteredFullPatternCompetitor.baseline.includes("fifth percentile") && spec.preregisteredFullPatternCompetitor.coefficientFit.includes("seven nonempty active phase sets"), "full-pattern preprocessing or NNLS contract changed");
check(spec.competingHypotheses.length === 4 && spec.stopConditions.length >= 4, "RC21 hypotheses or stop rules are incomplete");

check(manifest.status === "source-lineage-fixed-before-holdout-computation", "holdout source lineage was not fixed first");
check(manifest.files.length === 5 && manifest.verified.samples.join("|") === "1d|1e|1f|1g|1h", "holdout source grid changed");
check(manifest.verified.uniqueHashes === 5 && manifest.verified.totalBytes === 688850, "holdout hash/byte contract changed");
check(manifest.files.every(file => file.points === 7251 && file.bytes === 137770 && file.archive.timestamp && file.archive.warcDigest), "holdout numerical or archive provenance is incomplete");
check(new Set(manifest.files.map(file => file.sha256)).size === 5 && manifest.calibrationExclusion.includes("No file"), "holdout hashes or calibration exclusion changed");
check(manifest.transportRule.includes("0.00002 degree") && manifest.currentSourceCrossCheck.includes("Archive replay is transport evidence"), "angle normalization or source distinction is missing");

check(result.denominators.externalHoldoutProfiles === 5 && result.denominators.numericalPointsPerProfile === 7251 && result.denominators.fullPatternFitPoints === 4001, "RC21 denominator changed");
check(JSON.stringify(result.frozenPeakResponses) === JSON.stringify({ primary: rc20.calibrations.primary.responseRatios, secondary: rc20.calibrations.secondary.responseRatios }), "RC20 peak response was retuned");
check(close(result.fullPatternCalibration.responseRatios.corundum, 0.292218481) && close(result.fullPatternCalibration.responseRatios.zincite, 0.493857262), "full-pattern calibration changed");
const expected = {
  "1d": [0.546808, 2.754136, 1.418257, 3.073047],
  "1e": [0.79629, 1.433953, 2.782992, 1.488699],
  "1f": [0.612879, 7.593212, 0.662741, 8.144006],
  "1g": [0.525131, 4.508755, 1.43966, 5.019607],
  "1h": [0.925634, 3.577494, 1.499761, 4.503128]
};
for (const row of result.externalHoldouts) {
  const values = expected[row.sample];
  check(values && close(row.primaryError.maximum, values[0], 1e-6) && close(row.secondaryError.maximum, values[1], 1e-6), `${row.sample}: peak error changed`);
  check(values && close(row.fullPatternError.maximum, values[2], 1e-6) && close(row.primarySecondaryAgreement, values[3], 1e-6), `${row.sample}: full-pattern error or agreement changed`);
  check(row.primary && row.secondary && row.fullPattern && row.fullPatternFit.active.length === 3, `${row.sample}: a method became non-estimable`);
}
check(result.aggregate.peak.estimable === 5 && result.aggregate.peak.unsafe === 0 && close(result.aggregate.peak.maximumError, 0.925634, 1e-6), "primary peak transport changed");
check(result.aggregate.fullPattern.estimable === 5 && result.aggregate.fullPattern.unsafe === 0 && close(result.aggregate.fullPattern.maximumError, 2.782992, 1e-6), "full-pattern transport changed");
check(close(result.aggregate.xrfCrossCheck.peakMaximumDifference, 1.355634, 1e-6) && close(result.aggregate.xrfCrossCheck.fullPatternMaximumDifference, 2.112992, 1e-6), "XRF cross-check changed");
check(close(result.aggregate.worstErrorReduction, -2.006580062) && close(result.aggregate.peakAgreementErrorSpearman, -0.3), "method comparison changed");
check(result.decision.H1_frozenPeakRirTransports && result.decision.H2_fullPatternReferenceTransports, "H1/H2 decision changed");
check(!result.decision.H3_fullPatternMateriallyImprovesWorstError && !result.decision.H4_peakDisagreementRanksError, "H3/H4 decision changed");
check(!result.decision.independentPhysicalRungQualified, "historical holdouts overclaim physical independence");

check(audit.denominators.holdoutProfiles === result.denominators.externalHoldoutProfiles && audit.denominators.fullPatternFitPoints === result.denominators.fullPatternFitPoints, "Python denominator differs");
check(close(audit.fullPatternResponseRatios.corundum, result.fullPatternCalibration.responseRatios.corundum), "Python response differs");
check(close(audit.aggregate.peakMaximumError, result.aggregate.peak.maximumError, 1e-6) && close(audit.aggregate.fullPatternMaximumError, result.aggregate.fullPattern.maximumError, 1e-6), "Python error audit differs");
check(close(audit.aggregate.peakMaximumDifferenceFromXrf, result.aggregate.xrfCrossCheck.peakMaximumDifference, 1e-6), "Python XRF audit differs");
check(audit.decisions.H1 && audit.decisions.H2 && !audit.decisions.H3 && !audit.decisions.H4, "Python decisions differ");

const context = { window: {} };
vm.createContext(context);
for (const file of [
  "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js",
  "research-cycle-data.js", "research-cycle-03-data.js", "research-cycle-04-data.js", "research-cycle-05-data.js", "research-cycle-06-data.js", "research-cycle-07-data.js", "research-cycle-08-data.js", "research-cycle-09-data.js", "research-cycle-10-data.js", "research-cycle-11-data.js", "research-cycle-12-data.js", "research-cycle-13-data.js", "research-cycle-14-data.js", "research-cycle-15-data.js", "research-cycle-16-data.js", "research-cycle-17-data.js", "research-cycle-18-data.js", "research-cycle-19-data.js", "research-cycle-20-data.js", "research-cycle-21-data.js"
]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const cycle = context.window.RESEARCH_CYCLES.find(row => row.id === "RC-2026-21");
const connection = context.window.RESEARCH_CONNECTIONS.find(row => row.id === "CONN-NUISANCE-001");
check(cycle?.problemIds.join("|") === "UP-182|UP-184|UP-185" && cycle.artifacts.length >= 8, "RC21 cycle record is incomplete");
check(cycle?.verifiedFindings.length >= 8 && cycle?.log.length >= 8 && cycle?.resultMatrix.rows.length >= 8, "RC21 findings, log, or matrix is incomplete");
check(connection?.problemIds.join("|") === "UP-182|UP-184|UP-185" && connection.mapping.textEn && connection.minimumTest.textEn, "RC21 structural connection is incomplete");
for (const id of cycle?.problemIds || []) {
  const record = context.window.PROBLEMS.find(row => row.id === id)?.researchHistory?.find(row => row.cycleId === "RC-2026-21");
  check(record?.hypotheses.length === 3 && record.updatedDefinition.textEn && record.decisiveTest.textEn && record.unresolved.textEn, `RC21 bilingual record incomplete for ${id}`);
}
check(Object.keys(context.window.CATALOG_SOURCES).length === 161, "source count is not 161");
check(context.window.RESEARCH_CYCLES.length === 21 && context.window.RESEARCH_CONNECTIONS.length === 24, "cycle or connection count changed");
check(context.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 72, "research-record count is not 72");
for (const file of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, file), "utf8").includes("research-cycle-21-data.js"), `${file} does not load RC21`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("RC21 verification passed: five untouched QARR compositions are hash-bound and independently reproduced; both methods pass five points, the frozen primary peak method is more accurate, self-diagnosis fails, and physical independence remains unqualified.");
