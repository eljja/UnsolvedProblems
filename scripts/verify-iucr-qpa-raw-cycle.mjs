import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/iucr-qpa-raw-support-spec.json");
const manifest = load("research/reproducibility/iucr-qpa-raw-source-manifest.json");
const result = load("research/reproducibility/iucr-qpa-raw-support-result.json");
const audit = load("research/reproducibility/iucr-qpa-raw-support-independent-audit.json");
const pilotSchema = load("research/reproducibility/iucr-qpa-independent-pilot.schema.json");
const pilot = load("research/reproducibility/iucr-qpa-independent-pilot-preregistration.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const close = (left, right, tolerance = 1e-9) => Math.abs(left - right) <= tolerance;

check(spec.benchmarkId === result.benchmarkId && result.benchmarkId === "IUCR-QPA-RAW-SUPPORT-0.1", "RC19 spec/result contract differs");
check(spec.status === "sealed-before-raw-support-computation", "RC19 analysis was not sealed before computation");
check(spec.split.developmentSample === "1a" && spec.split.holdoutSample === "1e", "RC19 composition split changed");
check(spec.split.conditionUnsafe.includes("five weight-percentage points") && spec.split.rowUnsafe.includes("five weight-percentage points"), "RC19 unsafe-error gate changed");

check(manifest.expectedGrid.rawFiles === 208 && manifest.rawFiles.length === 208, "official raw-file grid is incomplete");
check(manifest.verified.rawFiles === 208 && manifest.verified.totalRawBytes === 12685811, "official raw-file byte contract changed");
check(manifest.verified.allProfilesTwoColumnAndMonotone, "a raw profile is no longer two-column monotone data");
check(new Set(manifest.rawFiles.map(file => file.sha256)).size === 208, "raw-profile hashes are not unique");
check(manifest.lineageFiles.length === 9 && manifest.readmes.length === 2, "official lineage or README manifest is incomplete");
check(manifest.serverTimestampCaveat.includes("not the dates of data collection"), "server timestamps are not distinguished from scientific dates");

check(result.denominators.rawFiles === 208 && result.denominators.rawHalConditions === 1456, "RC19 raw denominator changed");
check(result.denominators.joinedConditions === 1456 && result.denominators.joinedRefinementRows === 5824, "RC19 joined denominator changed");
check(result.joinAudit.everyConditionHasFourRefinementChildren && result.joinAudit.uniqueRawHashes === 208, "RC19 parent-child join is incomplete");
check(result.joinAudit.development.unsafe === 103 && result.joinAudit.development.discordant === 63, "development condition labels changed");
check(result.joinAudit.holdout.unsafe === 351 && result.joinAudit.holdout.discordant === 83, "holdout condition labels changed");

const nominal = result.selectors.nominalArticleGate.holdout;
const observed = result.selectors.observedArticleGate.holdout;
const net = result.selectors.netCountGate.holdout;
const phase = result.selectors.phaseSupportGate.holdout;
check(nominal.acceptedConditions === 90 && nominal.unsafeAccepted === 0 && close(nominal.safeRetention, 0.23872679), "nominal holdout gate changed");
check(observed.acceptedConditions === 75 && observed.unsafeAccepted === 0 && close(observed.safeRetention, 0.198938992), "observed-count holdout gate changed");
check(net.acceptedConditions === 152 && net.unsafeAccepted === 72 && close(result.selectors.netCountGate.threshold, 185175.729301), "net-count transfer failure changed");
check(phase.acceptedConditions === 612 && phase.unsafeAccepted === 284 && close(result.selectors.phaseSupportGate.threshold, 2.527451803), "phase-support transfer failure changed");

const rwp = result.rowSelectors.rc18RwpGate.holdout;
const twoStage = result.rowSelectors.twoStageGate.holdout;
check(rwp.acceptedRows === 484 && rwp.unsafeAccepted === 0 && close(rwp.safeRetention, 0.289646918), "frozen Rwp holdout gate changed");
check(twoStage.acceptedRows === 410 && twoStage.unsafeAccepted === 0 && close(twoStage.safeRetention, 0.245362059), "two-stage holdout gate changed");
check(result.stagePartition["1e"].counts.rawPassRwpFail === 2038 && result.stagePartition["1e"].counts.rawFailRwpPass === 74, "two-stage diagnostic partition changed");
check(!result.decision.H1_observedGateImprovesNominal && result.decision.H2_sameProfileModelChoiceFailure, "RC19 H1/H2 decision changed");
check(!result.decision.H3_phaseSupportBeatsNetCounts && result.decision.H4_twoStagesDiagnoseDistinctFailure, "RC19 H3/H4 decision changed");
check(!result.decision.stableMixtureRungQualified, "RC19 overclaims stable-mixture qualification");

check(audit.denominators.rawFiles === result.denominators.rawFiles && audit.denominators.joinedRows === result.denominators.joinedRefinementRows, "independent audit denominator differs");
check(audit.conditionLabels.holdoutDiscordant === result.joinAudit.holdout.discordant, "independent discordance audit differs");
check(audit.holdoutConditionSelectors.phaseSupportGate.unsafeAccepted === phase.unsafeAccepted, "independent phase-support audit differs");
check(audit.holdoutRowSelectors.rc18RwpGate.acceptedRows === rwp.acceptedRows && audit.holdoutRowSelectors.twoStageGate.acceptedRows === twoStage.acceptedRows, "independent row-gate audit differs");
check(audit.decisions.H1 === false && audit.decisions.H2 === true && audit.decisions.H3 === false && audit.decisions.H4 === true, "independent hypothesis decisions differ");

check(pilotSchema.$schema === "https://json-schema.org/draft/2020-12/schema" && pilotSchema.additionalProperties === false, "pilot schema contract changed");
check(pilot.status === "design-complete-not-executed", "unexecuted pilot is not clearly labelled");
check(pilot.compositionStrata.length === 3 && pilot.factorialDesign.independentPreparationsPerComposition === 2, "pilot physical-independence design changed");
check(pilot.factorialDesign.institutionsPerPreparation === 2 && pilot.factorialDesign.reductionImplementationsPerAcquisition === 2, "pilot institutional or implementation independence changed");
check(pilot.primaryDecisions.unsafeAcceptance.includes("Zero") && pilot.primaryDecisions.safeRetention.includes("0.50"), "pilot decision gate changed");

const context = { window: {} };
vm.createContext(context);
for (const file of [
  "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js",
  "research-cycle-data.js", "research-cycle-03-data.js", "research-cycle-04-data.js", "research-cycle-05-data.js", "research-cycle-06-data.js", "research-cycle-07-data.js", "research-cycle-08-data.js", "research-cycle-09-data.js", "research-cycle-10-data.js", "research-cycle-11-data.js", "research-cycle-12-data.js", "research-cycle-13-data.js", "research-cycle-14-data.js", "research-cycle-15-data.js", "research-cycle-16-data.js", "research-cycle-17-data.js", "research-cycle-18-data.js", "research-cycle-19-data.js"
]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const cycle = context.window.RESEARCH_CYCLES.find(row => row.id === "RC-2026-19");
const connection = context.window.RESEARCH_CONNECTIONS.find(row => row.id === "CONN-SUPPORTLABEL-001");
check(cycle?.problemIds.join("|") === "UP-182|UP-184|UP-185" && cycle.artifacts.length === 10, "RC19 cycle record is incomplete");
check(cycle?.verifiedFindings.length >= 8 && cycle?.log.length >= 8 && cycle?.resultMatrix.rows.length >= 8, "RC19 findings, log, or matrix is incomplete");
check(connection?.problemIds.join("|") === "UP-182|UP-184|UP-185" && connection.mapping.textEn && connection.minimumTest.textEn, "RC19 structural connection is incomplete");
for (const id of cycle?.problemIds || []) {
  const problem = context.window.PROBLEMS.find(row => row.id === id);
  const record = problem?.researchHistory?.find(row => row.cycleId === "RC-2026-19");
  check(record?.hypotheses.length === 3 && record.updatedDefinition.textEn && record.decisiveTest.textEn && record.unresolved.textEn, `RC19 bilingual record incomplete for ${id}`);
}
check(context.window.CATALOG_SOURCES.wang_spratt_qpa_methods_2025?.url.endsWith("5004054"), "Wang-Spratt DOI is incorrect");
check(Object.keys(context.window.CATALOG_SOURCES).length === 160, "source count is not 160");
check(context.window.RESEARCH_CYCLES.length === 19 && context.window.RESEARCH_CONNECTIONS.length === 22, "cycle or connection count changed");
check(context.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 66, "research-record count is not 66");
for (const file of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, file), "utf8").includes("research-cycle-19-data.js"), `${file} does not load RC19`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("RC19 verification passed: 208 official raw profiles are hash-bound to 5,824 refinement rows, independent implementations agree, failed transfer hypotheses are preserved, and the physical pilot remains explicitly unexecuted.");
