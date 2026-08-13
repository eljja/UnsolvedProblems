import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const protocol = load("research/reproducibility/intervention-pilot-protocol.json");
const schema = load("research/reproducibility/intervention-pilot-ledger.schema.json");
const fixtures = load("research/reproducibility/intervention-pilot-adversarial-fixtures.json");
const result = load("research/reproducibility/intervention-pilot-ledger-audit-result.json");
const audit = load("research/reproducibility/intervention-pilot-python-audit.json");
const oldSchema = load("research/reproducibility/intervention-batch-ledger.schema.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(protocol.protocolId === "INTERVENTION-PILOT-0.2" && protocol.status.includes("before-any-physical-outcomes"), "RC27 protocol identity or prospective boundary changed");
check(protocol.materialSystem.nominalMassFractions.BaSO4 + protocol.materialSystem.nominalMassFractions.Bi2O3 + protocol.materialSystem.nominalMassFractions.graphite === 1, "RC27 mass fractions do not sum to one");
check(protocol.physicalDesign.pilotBatches === 3 && protocol.physicalDesign.factorialCells.length === 4 && protocol.physicalDesign.omittedPhase === "Bi2O3", "RC27 physical design changed");
check(protocol.readinessGates.length === 5 && protocol.readinessGates.filter(gate => gate.currentStatus.startsWith("not-satisfied")).length === 3, "RC27 readiness boundaries are incomplete");
check(protocol.safetyAndAuthority.executionGate.includes("does not authorize laboratory work") && protocol.safetyAndAuthority.powderControl.includes("Do not use nanopowders"), "RC27 execution authority or powder boundary is missing");
check(protocol.primarySources.includes("https://www.cdc.gov/niosh/npg/npgd0306.html") && protocol.primarySources.some(url => url.includes("AC192620050")), "RC27 official safety sources are missing");

check(schema.$schema === "https://json-schema.org/draft/2020-12/schema" && schema.required.includes("reportedIndependentN"), "RC27 ledger root is incomplete");
for (const name of ["sourceLots", "batch", "specimen", "aliquot", "acquisition", "analysis", "endpointAdjudication"]) check(Boolean(schema.$defs[name]), `RC27 hierarchy level missing: ${name}`);
for (const name of ["specimens", "aliquots", "acquisitions", "analyses"]) check(schema.$defs.batch.required.includes(name), `RC27 batch child array not required: ${name}`);
check(schema.$defs.analysis.required.includes("dictionaryView") && schema.$defs.analysis.required.includes("omittedPhaseId"), "RC27 analysis views are not explicit");

check(fixtures.status.includes("before-any-physical-outcomes") && fixtures.tests.length === 12, "RC27 fixture denominator or prospective status changed");
check(new Set(fixtures.tests.slice(1).map(row => row.expectedCode)).size === 11, "RC27 adversarial error codes are not unique");
check(result.denominators.adversarialMutations === 11 && result.fixtureResults.length === 12, "RC27 result denominator changed");
check(JSON.stringify(result.hierarchyCounts) === JSON.stringify({ sourceLotTuples: 1, preparationBatches: 3, physicalSpecimens: 6, geometryAliquots: 12, rawAcquisitions: 24, analysisViews: 48, reportedIndependentN: 3 }), "RC27 hierarchy counts changed");
check(result.validFixture.valid && !result.validFixture.containsPhysicalOutcomes, "RC27 valid fixture failed or contains outcomes");
for (const fixture of fixtures.tests) {
  const observed = result.fixtureResults.find(row => row.id === fixture.id);
  check(observed?.detectedAsSpecified && observed.observedValid === fixture.expectedValid, `RC27 fixture failed: ${fixture.id}`);
  if (fixture.expectedCode) check(observed?.observedCodes.includes(fixture.expectedCode), `RC27 expected code missing: ${fixture.expectedCode}`);
}
check(Object.values(result.oldSchemaAudit).every(Boolean), "RC27 old-schema audit changed");
check(oldSchema.$defs.batchRecord.required.includes("dictionaryArm") && oldSchema.$defs.batchRecord.required.includes("negativeEndpoint") && !oldSchema.$defs.batchRecord.required.includes("omittedPhaseId"), "RC26 historical schema no longer demonstrates the audited defect");
check(JSON.stringify(result.decisions) === JSON.stringify({ H1_flatRecordSchemaSufficient: false, H2_hierarchicalOutcomeFreeLedgerPasses: true, H3_allPrecommittedMutationsDetected: true, H4_analysisViewsIncreaseIndependentN: false, H5_commonLotsQualifyUnconditionalTransport: false, H6_physicalPilotReady: false, H7_sieveAndRotationEfficacyQualified: false }), "RC27 decision vector changed");
check(result.readiness["G2-LINEAGE"].startsWith("passed") && Object.entries(result.readiness).filter(([id]) => id !== "G2-LINEAGE").every(([, state]) => !state.startsWith("passed")), "RC27 overstates readiness");
check(audit.passed && Object.values(audit.checks).every(Boolean) && audit.independenceBoundary.includes("no material"), "RC27 independent Python audit failed or overclaims physical evidence");

const context = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 25 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const dataFile of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInContext(fs.readFileSync(path.join(root, dataFile), "utf8"), vm.createContext(context), { filename: dataFile });
const cycle = context.window.RESEARCH_CYCLES.find(row => row.id === "RC-2026-27");
const connection = context.window.RESEARCH_CONNECTIONS.find(row => row.id === "CONN-LINEAGE-002");
check(cycle?.problemIds.join("|") === "UP-182|UP-184|UP-185|UP-625" && cycle.artifacts.length === 8, "RC27 scope or artifacts are incomplete");
check(cycle?.verifiedFindings.length >= 16 && cycle?.log.length >= 10 && cycle?.resultMatrix.rows.length >= 10, "RC27 findings, log, or result matrix is incomplete");
check(cycle?.sharedProgram.successRule.textEn.includes("twelve successes") && cycle?.sharedProgram.stopRule.textEn.includes("dust escape"), "RC27 program lacks confirmation or safety boundaries");
check(connection?.problemIds.join("|") === "UP-182|UP-184|UP-185|UP-625" && connection.strength === "moderate", "RC27 connection is missing or overgraded");
check(connection?.mapping.textEn.includes("Source lot maps") && connection?.failureBoundary.textEn.includes("re-encoded copies"), "RC27 connection lacks a variable mapping or failure boundary");
const definitions = [];
for (const id of cycle?.problemIds || []) {
  const record = context.window.PROBLEMS.find(row => row.id === id)?.researchHistory?.find(row => row.cycleId === "RC-2026-27");
  check(record?.hypotheses.length === 3 && record.updatedDefinition.textEn && record.decisiveTest.textEn && record.unresolved.textEn, `RC27 bilingual record incomplete for ${id}`);
  check(record?.sourceIds.length >= 7, `RC27 record has insufficient primary or official evidence for ${id}`);
  definitions.push(record?.updatedDefinition.textEn);
}
check(new Set(definitions).size === 4, "RC27 problem definitions are templated duplicates");
for (const sourceId of ["nist_astm_e3294_powder_xrd", "niosh_natural_graphite_guide", "thermofisher_bismuth_oxide_sds_2025"]) check(context.window.CATALOG_SOURCES[sourceId]?.reviewedOn === "2026-08-14", `RC27 source missing or stale: ${sourceId}`);
check(Object.keys(context.window.CATALOG_SOURCES).length === 181, "source count is not 181");
check(context.window.RESEARCH_CYCLES.length === 27 && context.window.RESEARCH_CONNECTIONS.length === 30, "cycle or connection count changed");
check(context.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 92, "research-record count is not 92");
check(context.window.PROBLEMS.filter(problem => problem.researchHistory?.length).length === 9, "curated-problem count is not 9");
for (const page of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, page), "utf8").includes("research-cycle-27-data.js"), `${page} does not load RC27`);
for (const phrase of ["1단계", "2단계", "전공자 포인트", "아래 시도는 개별 논문"]) check(!fs.readFileSync(path.join(root, "research-cycle-27-data.js"), "utf8").includes(phrase), `RC27 contains forbidden mechanical phrasing: ${phrase}`);

if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("RC27 verification passed: the outcome-free hierarchy preserves n=3, detects 11/11 adversarial mutations, and leaves physical efficacy and four non-lineage readiness gates unclaimed.");
