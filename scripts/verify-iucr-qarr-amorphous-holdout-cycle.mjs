import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/iucr-qarr-amorphous-holdout-spec.json");
const manifest = load("research/reproducibility/iucr-qarr-amorphous-holdout-manifest.json");
const result = load("research/reproducibility/iucr-qarr-amorphous-holdout-result.json");
const audit = load("research/reproducibility/iucr-qarr-amorphous-holdout-python-audit.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const close = (left, right, tolerance = 1e-8) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;

check(spec.benchmarkId === result.benchmarkId && spec.status === "sealed-before-sample-3-numerical-computation", "RC23 seal or benchmark differs");
check(spec.competingHypotheses.length === 5 && spec.stopConditions.length >= 5, "RC23 hypotheses or stop rules changed");
check(spec.frozenRc22Detector.noRetuning.includes("may not change") && spec.knowledgeFirewall.finalAdjudication.includes("Only after"), "RC23 knowledge firewall is incomplete");
check(close(spec.frozenRc22Detector.absoluteCoefficientScale, 0.993912948) && close(spec.frozenRc22Detector.residualAlarmThreshold, 0.336902813), "frozen RC22 detector changed");
check(spec.localizationContract.haloDegrees2Theta.join("|") === "15|30", "amorphous halo interval changed");

const file = manifest.files[0];
check(manifest.status === "source-lineage-fixed-after-spec-seal-before-sample-3-computation" && manifest.files.length === 1, "Sample 3 lineage is not fixed");
check(file.name === "cpd-3.prn" && file.points === 7251 && file.bytes === 137770, "Sample 3 numerical denominator changed");
check(file.sha256 === "f86f9851124ccb85bb80aaeafb6c0b7329919eb22bb51bcc98fb3a4d6a89ffc3", "Sample 3 hash changed");
check(file.archive.timestamp === "20090728004713" && file.archive.warcDigest === "RRWIRTL2IH4COULSZIQA2LZ6GWUA6Z4W", "Sample 3 archive identity changed");

check(result.denominators.knownOnlyControls === 5 && result.denominators.externalAmorphousPositives === 1 && result.denominators.fitPoints === 4501 && result.denominators.haloPoints === 751, "RC23 denominators changed");
const blind = result.blindTargetBeforeCandidateDisclosure;
check(blind.alarm && blind.alarmByMass && !blind.alarmByResidual, "RC23 alarm path changed");
check(close(blind.missingMass, 26.161396, 1e-6) && close(blind.normalizedResidual, 0.204185155), "RC23 blind target result changed");
check(close(result.closedThreePhase.primaryPeakRir.composition.corundum, 43.54032, 1e-6) && close(result.closedThreePhase.wholePattern.composition.corundum, 46.154522, 1e-6), "RC23 closed compositions changed");
const silica = result.candidateReversal.ranking.find(row => row.candidate === "silica");
const brucite = result.candidateReversal.ranking.find(row => row.candidate === "brucite");
check(result.candidateReversal.selected === "silica" && close(silica.squaredResidualReduction, 0.027001869) && close(brucite.squaredResidualReduction, 0.000563301), "RC23 candidate ranking changed");
check(close(result.candidateReversal.silicaToBruciteImprovementRatio, 47.935052911) && close(result.signalLocalization.haloShare, 0.559845108), "RC23 ratio or localization changed");
check(close(result.finalAdjudication.diagnosticSilicaMassAbsoluteError, 1.965963, 1e-6), "RC23 amorphous quantity changed");
check(result.decisions.H1_closedThreePhaseSilentlyHidesAmorphous && result.decisions.H2_frozenBlindDetectorTransportsToAmorphous && !result.decisions.H3_candidateLibraryReversesToSilica && result.decisions.H4_frozenScaleQuantifiesAmorphousMass && result.decisions.H5_gainLocalizesToOfficialHalo && !result.decisions.independentPhysicalRungQualified, "RC23 decisions changed");

check(close(audit.blindTarget.missingMass, blind.missingMass, 1e-6) && close(audit.blindTarget.normalizedResidual, blind.normalizedResidual), "Python blind audit differs");
check(audit.candidateReversal.selected === result.candidateReversal.selected && close(audit.candidateReversal.silicaMass, silica.diagnosticMass, 1e-6), "Python candidate audit differs");
check(close(audit.localization.haloShare, result.signalLocalization.haloShare) && JSON.stringify(audit.decisions) === JSON.stringify(result.decisions), "Python localization or decisions differ");

const context = { window: {} };
vm.createContext(context);
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 21 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const dataFile of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInContext(fs.readFileSync(path.join(root, dataFile), "utf8"), context, { filename: dataFile });
}
const cycle = context.window.RESEARCH_CYCLES.find(row => row.id === "RC-2026-23");
const connection = context.window.RESEARCH_CONNECTIONS.find(row => row.id === "CONN-MORPHOLOGY-001");
check(cycle?.problemIds.join("|") === "UP-182|UP-184|UP-185" && cycle.artifacts.length === 8, "RC23 cycle record is incomplete");
check(cycle?.verifiedFindings.length >= 10 && cycle?.log.length >= 7 && cycle?.resultMatrix.rows.length >= 7, "RC23 evidence, log, or matrix is incomplete");
check(connection?.problemIds.join("|") === "UP-182|UP-184|UP-185" && connection.mapping.textEn && connection.minimumTest.textEn, "morphology connection is incomplete");
for (const id of cycle?.problemIds || []) {
  const record = context.window.PROBLEMS.find(row => row.id === id)?.researchHistory?.find(row => row.cycleId === "RC-2026-23");
  check(record?.hypotheses.length === 3 && record.updatedDefinition.textEn && record.decisiveTest.textEn && record.unresolved.textEn, `RC23 bilingual record incomplete for ${id}`);
}
check(Object.keys(context.window.CATALOG_SOURCES).length === 167, "source count is not 167");
check(context.window.RESEARCH_CYCLES.length === 23 && context.window.RESEARCH_CONNECTIONS.length === 26, "cycle or connection count changed");
check(context.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 78, "research-record count is not 78");
for (const page of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, page), "utf8").includes("research-cycle-23-data.js"), `${page} does not load RC23`);

if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("RC23 verification passed: mass closure detects amorphous Sample 3, residual does not; silica ranks first but fails the crystalline strength gate, quantitative recovery and halo localization pass, and independent implementations agree.");
