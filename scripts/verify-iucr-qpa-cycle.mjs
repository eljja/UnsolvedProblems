import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/iucr-qpa-transfer-spec.json");
const manifest = load("research/reproducibility/iucr-qpa-summary-source-manifest.json");
const result = load("research/reproducibility/iucr-qpa-diagnostic-transfer-result.json");
const independent = load("research/reproducibility/iucr-qpa-diagnostic-independent-audit.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const close = (left, right, tolerance = 1e-9) => Math.abs(left - right) <= tolerance;

check(spec.benchmarkId === result.benchmarkId && result.benchmarkId === "IUCR-QPA-DIAGNOSTIC-TRANSFER-0.1", "RC18 spec/result contract differs");
check(spec.status === "sealed-secondary-analysis-before-computation", "RC18 does not preserve its secondary-analysis status");
check(spec.split.developmentSample === "1a" && spec.split.holdoutSample === "1e", "RC18 composition split changed");
check(spec.design.unsafeGatePercentagePoints === 5, "RC18 error gate changed");
check(manifest.archive.sha256 === spec.sourceContract.summaryArchiveSha256 && manifest.archive.bytes === 59631807, "official summary archive contract changed");
check(manifest.files.length === 8 && manifest.files.every(file => file.bytes > 1e7 && /^[0-9a-f]{64}$/.test(file.sha256)), "official extracted-file manifest is incomplete");
check(manifest.serverTimestampCaveat.includes("not treated as dates"), "server timestamps are not distinguished from scientific dates");

check(result.denominators.rows === 5824 && result.denominators.randomizedStartRefinementsRepresented === 1164800, "RC18 refinement denominator changed");
check(result.denominators.acquisitionConditions === 1456 && result.denominators.refinementTypes === 4, "RC18 condition denominator changed");
check(result.bySample["1a"].unsafeCases === 245 && result.bySample["1e"].unsafeCases === 1241, "RC18 unsafe counts changed");
check(close(result.bySample["1a"].unsafeFraction, 0.084134615) && close(result.bySample["1e"].unsafeFraction, 0.426167582), "RC18 unsafe fractions changed");

const rwp = result.rowSelectors.rwp;
const formal = result.rowSelectors.formalUncertainty;
const acquisition = result.rowSelectors.literatureAcquisitionGate;
check(close(rwp.thresholdSelectedOnDevelopment, 8.043046005815, 1e-12), "Rwp threshold changed");
check(rwp.holdout.acceptedCases === 484 && rwp.holdout.unsafeAcceptedCases === 0 && close(rwp.holdout.maximumAcceptedAbsoluteError, 4.347002028), "Rwp holdout decision changed");
check(close(formal.thresholdSelectedOnDevelopment, 0.17098682507, 1e-12), "formal-uncertainty threshold changed");
check(formal.holdout.acceptedCases === 1258 && formal.holdout.unsafeAcceptedCases === 378 && close(formal.holdout.maximumAcceptedAbsoluteError, 28.6980834), "formal-uncertainty failure changed");
check(acquisition.holdout.acceptedCases === 360 && acquisition.holdout.unsafeAcceptedCases === 0 && close(acquisition.holdout.safeRetention, 0.215439856), "literature acquisition-gate outcome changed");

const models = result.crossModelConditions;
check(close(models.spreadSelector.thresholdSelectedOnDevelopment, 0.528593089885, 1e-12), "model-spread threshold changed");
check(models.spreadSelector.holdout.acceptedConditions === 120 && models.spreadSelector.holdout.unsafeAcceptedConditions === 0, "model-spread holdout decision changed");
check(close(models.holdout.rawModelEnvelopeAllPhaseCoverage, 0.020604396) && close(models.holdout.expandedModelEnvelopeAllPhaseCoverage, 0.236263736), "common-mode envelope result changed");
check(close(result.bySample["1e"].formalBandAllPhaseCoverage, 0.122596154) && close(result.bySample["1e"].combinedBandAllPhaseCoverage, 0.124656593), "diagnostic-band inclusion changed");
check(result.decision.rwpTransfersSafely && result.decision.modelSpreadTransfersSafely && result.decision.literatureAcquisitionGateTransfersSafely, "a provisional safe refusal result changed");
check(!result.decision.formalUncertaintyTransfersSafely && !result.decision.stableSurrogateRungQualified, "RC18 overclaims formal uncertainty or stable-surrogate qualification");
check(result.decision.whyNotQualified.includes("no independent preparation"), "independence limitation is missing");

check(independent.allComparisonsPass && Object.values(independent.comparisonsWithJavaScript).every(Boolean), "independent Python RC18 replay disagrees");
check(independent.computed.rows === result.denominators.rows && independent.computed.refinementsRepresented === result.denominators.randomizedStartRefinementsRepresented, "independent RC18 denominator differs");
check(independent.computed.formalHoldout.unsafeAcceptedCases === formal.holdout.unsafeAcceptedCases, "independent formal-uncertainty failure differs");

const context = { window: {} };
vm.createContext(context);
for (const file of [
  "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js",
  "research-cycle-data.js", "research-cycle-03-data.js", "research-cycle-04-data.js", "research-cycle-05-data.js", "research-cycle-06-data.js", "research-cycle-07-data.js", "research-cycle-08-data.js", "research-cycle-09-data.js", "research-cycle-10-data.js", "research-cycle-11-data.js", "research-cycle-12-data.js", "research-cycle-13-data.js", "research-cycle-14-data.js", "research-cycle-15-data.js", "research-cycle-16-data.js", "research-cycle-17-data.js", "research-cycle-18-data.js"
]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const cycle = context.window.RESEARCH_CYCLES.find(row => row.id === "RC-2026-18");
const connection = context.window.RESEARCH_CONNECTIONS.find(row => row.id === "CONN-COMMONMODE-001");
check(cycle && cycle.problemIds.join("|") === "UP-182|UP-184|UP-185" && cycle.artifacts.length === 7, "RC18 cycle record is incomplete");
check(cycle?.verifiedFindings.length === 8 && cycle?.log.length === 9 && cycle?.resultMatrix.rows.length === 8, "RC18 findings, log, or result matrix is incomplete");
check(connection && connection.problemIds.join("|") === "UP-182|UP-184|UP-185" && connection.mapping.textEn && connection.minimumTest.textEn, "common-mode connection is incomplete");
for (const id of cycle?.problemIds || []) {
  const problem = context.window.PROBLEMS.find(row => row.id === id);
  const record = problem?.researchHistory?.find(row => row.cycleId === "RC-2026-18");
  check(record && record.hypotheses.length === 3 && record.updatedDefinition.textEn && record.decisiveTest.textEn && record.unresolved.textEn, `RC18 bilingual record incomplete for ${id}`);
}
for (const id of ["iucr_qarr_weighed_values_1999", "curtin_qpa_dataset_2020", "rowles_qpa_author_manuscript_2021"]) check(context.window.CATALOG_SOURCES[id]?.publishedOn, `RC18 source ${id} missing`);
check(Object.keys(context.window.CATALOG_SOURCES).length === 158, "source count is not 158");
check(context.window.RESEARCH_CYCLES.length === 18 && context.window.RESEARCH_CONNECTIONS.length === 21, "cycle or connection count changed");
check(context.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 63, "research-record count is not 63");

for (const file of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, file), "utf8").includes("research-cycle-18-data.js"), `${file} does not load RC18`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("RC18 verification passed: official physical-mixture summaries are hash-bound, diagnostic transfer is independently reproduced, formal uncertainty failure is preserved, and independent stable-surrogate qualification remains explicitly unpassed.");
