import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/iucr-qpa-independent-reduction-spec.json");
const manifest = load("research/reproducibility/iucr-qarr-reference-pattern-manifest.json");
const result = load("research/reproducibility/iucr-qpa-independent-reduction-result.json");
const audit = load("research/reproducibility/iucr-qpa-independent-reduction-python-audit.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const close = (left, right, tolerance = 1e-8) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;

check(spec.benchmarkId === result.benchmarkId && result.benchmarkId === "IUCR-QPA-INDEPENDENT-PEAK-RIR-0.1", "RC20 spec/result contract differs");
check(spec.status === "sealed-before-independent-reduction-computation", "RC20 reduction was not sealed before computation");
check(spec.calibration.profiles.join("|") === "cpd-1a.prn|cpd-1b.prn|cpd-1c.prn", "calibration vertices changed");
check(spec.targetGrid.unsafe.includes("five weight-percentage points"), "five-point safety gate changed");

check(manifest.verified.files === 6 && manifest.verified.purePhaseReferences === 3 && manifest.verified.calibrationMixtures === 3, "reference-pattern denominator changed");
check(manifest.verified.uniqueHashes === 6 && manifest.verified.totalBytes === 826620, "reference-pattern hash/byte contract changed");
check(manifest.verified.everyFileTwoColumnMonotone && manifest.files.every(file => file.points === 7251), "reference-pattern structure changed");
check(manifest.officialCollectionContract.historicalCorrectionNotice.includes("1998-01-27"), "official historical conversion warning is missing");

check(result.denominators.referenceProfiles === 6 && result.denominators.rowlesRawProfiles === 208, "RC20 source denominator changed");
check(result.denominators.adequateProfiles === 36 && result.denominators.fullAngleTopasRows === 832, "RC20 target denominator changed");
check(Math.min(...Object.values(result.pureReferenceCrosstalk.primary).map(row => row.ownToOtherAreaRatio)) > 300, "primary peak-family specificity changed");
check(Math.min(...Object.values(result.pureReferenceCrosstalk.secondary).map(row => row.ownToOtherAreaRatio)) > 600, "secondary peak-family specificity changed");
check(close(result.calibrations.primary.responseRatios.corundum, 0.174393383) && close(result.calibrations.primary.responseRatios.zincite, 0.860244342), "primary response ratios changed");
check(close(result.calibrationDeviation.primary.corundum.maximumRelativeDeviation, 0.679745085), "corundum response instability changed");
check(close(result.calibrationDeviation.primary.zincite.maximumRelativeDeviation, 0.032274732), "zincite response stability changed");
check(result.calibrations.secondary.calibrationEstimates["1c"].estimate === null, "secondary 1c refusal disappeared");
check(result.calibrationDeviation.secondary.corundum.maximumRelativeDeviation === null, "non-identifiable secondary deviation was coerced to a number");

const adequate = result.targetPerformance.adequate;
const holdout = result.targetPerformance.adequateBySample["1e"];
check(adequate.profiles === 36 && adequate.refusedProfiles === 0 && adequate.unsafePrimary === 0 && adequate.unsafeSecondary === 0, "adequate-profile safety result changed");
check(close(adequate.maximumPrimaryError, 2.537271, 1e-6) && close(adequate.medianPrimaryError, 1.769167, 1e-6), "adequate-profile error changed");
check(holdout.profiles === 18 && close(holdout.maximumPrimaryError, 1.621758, 1e-6), "1e holdout result changed");
check(result.targetPerformance.all.refusedProfiles === 33 && result.targetPerformance.all.unsafePrimary === 80, "low-support failure boundary changed");
check(result.agreementGate.thresholdSelectedOnAdequate1a === null && result.agreementGate.holdout.acceptedProfiles === 0, "non-identifiable agreement gate was promoted");

const counts = result.diagnosticPartition.counts;
const unsafe = result.diagnosticPartition.topasUnsafeCounts;
check(counts.bothPass === 112 && counts.peakUnsafeRwpPass === 0 && counts.peakSafeRwpFail === 400 && counts.bothFail === 320, "Rwp/peak diagnostic partition changed");
check(unsafe.peakSafeRwpFail === 17 && unsafe.bothFail === 187, "TOPAS truth-error partition changed");
check(result.decision.H1_empiricalRirTransfers && !result.decision.H2_peakAgreementDetectsError, "H1/H2 decision changed");
check(!result.decision.H3_responseRatioCompositionInvariant && !result.decision.H4_peakAndRwpComplementary, "H3/H4 decision changed");
check(!result.decision.independentPhysicalRungQualified, "RC20 overclaims independent physical qualification");

check(audit.denominators.referenceProfiles === result.denominators.referenceProfiles && audit.denominators.rowlesRawProfiles === result.denominators.rowlesRawProfiles, "Python audit denominator differs");
check(close(audit.responseRatios.primary.corundum, result.calibrations.primary.responseRatios.corundum), "Python corundum response differs");
check(close(audit.targetPerformance.adequate.maximumPrimaryError, adequate.maximumPrimaryError, 1e-6), "Python adequate error differs");
check(audit.agreementGate.threshold === null && audit.diagnosticPartition.peakSafeRwpFail === counts.peakSafeRwpFail, "Python gate or partition differs");
check(audit.decisions.H1 === true && audit.decisions.H2 === false && audit.decisions.H3 === false && audit.decisions.H4 === false, "Python hypothesis decisions differ");

const context = { window: {} };
vm.createContext(context);
for (const file of [
  "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js",
  "research-cycle-data.js", "research-cycle-03-data.js", "research-cycle-04-data.js", "research-cycle-05-data.js", "research-cycle-06-data.js", "research-cycle-07-data.js", "research-cycle-08-data.js", "research-cycle-09-data.js", "research-cycle-10-data.js", "research-cycle-11-data.js", "research-cycle-12-data.js", "research-cycle-13-data.js", "research-cycle-14-data.js", "research-cycle-15-data.js", "research-cycle-16-data.js", "research-cycle-17-data.js", "research-cycle-18-data.js", "research-cycle-19-data.js", "research-cycle-20-data.js"
]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const cycle = context.window.RESEARCH_CYCLES.find(row => row.id === "RC-2026-20");
const connection = context.window.RESEARCH_CONNECTIONS.find(row => row.id === "CONN-RESPONSE-001");
check(cycle?.problemIds.join("|") === "UP-182|UP-184|UP-185" && cycle.artifacts.length >= 7, "RC20 cycle record is incomplete");
check(cycle?.verifiedFindings.length >= 7 && cycle?.log.length >= 7 && cycle?.resultMatrix.rows.length >= 7, "RC20 findings, log, or matrix is incomplete");
check(connection?.problemIds.join("|") === "UP-182|UP-184|UP-185" && connection.mapping.textEn && connection.minimumTest.textEn, "RC20 structural connection is incomplete");
for (const id of cycle?.problemIds || []) {
  const record = context.window.PROBLEMS.find(row => row.id === id)?.researchHistory?.find(row => row.cycleId === "RC-2026-20");
  check(record?.hypotheses.length === 3 && record.updatedDefinition.textEn && record.decisiveTest.textEn && record.unresolved.textEn, `RC20 bilingual record incomplete for ${id}`);
}
check(context.window.CATALOG_SOURCES.toraya_direct_qpa_2016?.url.endsWith("16010451"), "Toraya DOI is missing or incorrect");
check(Object.keys(context.window.CATALOG_SOURCES).length === 161, "source count is not 161");
check(context.window.RESEARCH_CYCLES.length === 20 && context.window.RESEARCH_CONNECTIONS.length === 23, "cycle or connection count changed");
check(context.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 69, "research-record count is not 69");
for (const file of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, file), "utf8").includes("research-cycle-20-data.js"), `${file} does not load RC20`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("RC20 verification passed: six official reference profiles and 208 Rowles profiles reproduce across independent implementations; adequate-support success and response/gate failures remain bounded and the physical rung remains unqualified.");
