import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const spec = readJson("research/reproducibility/hidden-vendor-attestation-spec.json");
const fixtures = readJson("research/reproducibility/hidden-vendor-adversarial-fixtures.json");
const result = readJson("research/reproducibility/hidden-vendor-attestation-result.json");
const audit = readJson("research/reproducibility/hidden-vendor-attestation-python-audit.json");
const schemas = spec.schemas.map(readJson);

check(spec.protocolId === "HIDDEN-VENDOR-ATTESTATION-0.5", "RC30 protocol identity changed");
check(spec.status === "synthetic-wire-profile-and-outcome-free-adjudication-contract", "synthetic scope changed");
check(spec.schemas.length === 5 && new Set(spec.schemas).size === 5, "five distinct schemas are required");
check(schemas.every(schema => schema.$schema === "https://json-schema.org/draft/2020-12/schema" && schema.additionalProperties === false), "schemas must use Draft 2020-12 and close unknown top-level fields");
check(spec.standardsBoundary.rfc9999.includes("finalized") && spec.standardsBoundary.corim.includes("not CoRIM conformance") && spec.standardsBoundary.hardwareAttestation.includes("early work in progress"), "standards maturity is overstated");
check(spec.semanticGates.length === 12, "twelve semantic gates are not sealed");
check(Date.parse(spec.sealedTimeline.policyFrozenAt) < Date.parse(spec.sealedTimeline.hiddenVendorRevealedAt), "policy is not frozen before reveal");
check(Date.parse(spec.sealedTimeline.adjudicationLedgerFrozenAt) < Date.parse(spec.sealedTimeline.hiddenVendorRevealedAt), "ledger is not frozen before reveal");
check(spec.hypotheses.length === 4 && spec.nonClaims.length === 4, "protocol hypotheses or nonclaims are incomplete");
check(spec.securitySafetyPrivacy.operationalBoundary.includes("No secret extraction"), "safe repository boundary is missing");

const ledgerSchema = schemas.find(schema => schema.title.includes("denominator"));
check(ledgerSchema.properties.units.minItems === 1530 && ledgerSchema.properties.units.maxItems === 1530, "ledger schema no longer fixes 1,530 rows");
check(ledgerSchema.properties.balance.properties.unitsPerClass.const === 306 && ledgerSchema.properties.balance.properties.unitsPerCellPerClass.const === 17, "class or cell balance changed");
check(ledgerSchema.properties.units.items.required.includes("physicalPackageDigest") && ledgerSchema.properties.units.items.required.includes("acquisitionId"), "physical-unit identity contract weakened");

check(fixtures.fixtures.length === 17 && fixtures.fixtures.at(0).id === "F00" && fixtures.fixtures.at(-1).id === "F16", "fixture denominator or ordering changed");
check(new Set(fixtures.fixtures.map(item => item.id)).size === 17, "fixture IDs are not unique");
check(fixtures.fixtures.find(item => item.id === "F16")?.expected === "accept-contract-indistinguishable", "F16 identifiability boundary changed");
check(result.fixtureResults.length === 17 && result.fixtureResults.every(item => item.matched), "not all sealed fixtures match");
check(result.summary.matched === 17 && result.summary.structuralRejects === 2 && result.summary.semanticallyInvalidButStructurallyValid === 13, "structural versus semantic result changed");
check(result.summary.semanticRejects === 5 && result.summary.adjudicationInvalidations === 7 && result.summary.quarantines === 1 && result.summary.indistinguishableControls === 1, "verdict composition changed");
check(result.baseBundle.structuralErrors === 0 && result.baseBundle.semanticVerdict === "accept-contract", "base bundle no longer passes contract");
check(result.baseBundle.ledgerUnits === 1530 && result.baseBundle.hardwareDevicesTested === 0, "ledger or hardware nonclaim changed");
check(Object.values(result.hypotheses).every(value => value === false), "one of four rejected protocol hypotheses is being claimed");
check(result.fixtureResults.find(item => item.id === "F09")?.primaryCode === "A_POLICY_POST_REVEAL", "post-reveal rewrite is not rejected chronologically");
check(result.fixtureResults.find(item => item.id === "F12")?.primaryCode === "A_UNIT_DUPLICATE", "duplicate-unit mutation changed");
check(result.fixtureResults.find(item => item.id === "F13")?.primaryCode === "A_INDEPENDENT_UNIT", "rerun mutation changed");
check(result.fixtureResults.find(item => item.id === "F14")?.primaryCode === "A_CELL_BALANCE", "cell-rebalance mutation changed");
check(result.fixtureResults.find(item => item.id === "F16")?.primaryCode === "I_SILENT_COMPROMISE", "silent compromise no longer remains explicit");

check(audit.passed === true && Object.keys(audit.checks).length === 20 && Object.values(audit.checks).every(Boolean), "independent Python audit did not pass twenty checks");
check(audit.independentlyRecomputed.baseBalance.total === 1530 && audit.independentlyRecomputed.baseBalance.cells === 90, "independent grid reconstruction changed");
check(audit.independentlyRecomputed.baseBalance.cellMinimum === 17 && audit.independentlyRecomputed.baseBalance.cellMaximum === 17, "independent cell balance changed");
check(audit.independentlyRecomputed.duplicateUnitUnique === false && audit.independentlyRecomputed.rerunPhysicalPackageUnique === false, "independent denominator attacks are no longer detected");
check(audit.independentlyRecomputed.rebalancedCellMinimum === 16 && audit.independentlyRecomputed.rebalancedCellMaximum === 18, "independent rebalance result changed");
check(audit.independenceBoundary.includes("does not import or execute the JavaScript generator") && audit.independenceBoundary.includes("does not independently validate a production JSON Schema implementation"), "independence boundary is overstated");

const sandbox = { window: {} };
const siteFiles = [
  "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js",
  ...Array.from({ length: 28 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)
];
for (const file of siteFiles) vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-30");
check(cycle?.problemIds.join("|") === "UP-602|UP-605|UP-625|UP-315", "RC30 problem scope changed");
check(cycle?.connectionIds.join("|") === "CONN-ATTESTATION-003", "RC30 connection scope changed");
check(cycle?.verifiedFindings.length === 22 && cycle.resultMatrix.rows.length === 17 && cycle.artifacts.length === 12 && cycle.log.length === 16, "RC30 public research record is incomplete");
check(cycle?.nextCycle.text.includes("최소 20개 미공개 bundle") && cycle?.nextCycle.textEn.includes("at least twenty undisclosed bundles"), "next-cycle start point is not exact");
for (const artifact of cycle?.artifacts || []) check(fs.existsSync(path.join(root, artifact.url)), `missing RC30 artifact: ${artifact.url}`);

const connection = connections.find(item => item.id === "CONN-ATTESTATION-003");
check(connection?.problemIds.join("|") === "UP-602|UP-605|UP-625|UP-315", "RC30 connection participants changed");
check(connection?.strength === "moderate" && connection?.validationStatus.textEn.includes("unverified"), "connection confidence is overstated");
check((connection?.mapping.text.match(/↔/g) || []).length >= 8, "connection variable mapping is incomplete");
check(connection?.minimumTest.text.length > 100 && connection?.failureBoundary.text.length > 100, "connection minimum test or failure boundary is too weak");

for (const id of cycle?.problemIds || []) {
  const problem = problems.find(item => item.id === id);
  const record = problem?.researchHistory?.find(item => item.cycleId === "RC-2026-30");
  check(Boolean(record), `${id}: RC30 record missing`);
  check(record?.hypotheses.length === 3, `${id}: three problem-specific hypotheses required`);
  check(record?.sourceIds.length >= 7, `${id}: source support too sparse`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    check(record?.[field]?.text?.length > 45 && record?.[field]?.textEn?.length > 70, `${id}: ${field} is not substantive and bilingual`);
  }
  for (const item of record?.hypotheses || []) for (const field of ["claim", "prediction", "test", "reject"]) check(item[field]?.text?.length > 20 && item[field]?.textEn?.length > 35, `${id}/${item.code}: ${field} is not testable and bilingual`);
}
check(problems.find(item => item.id === "UP-315")?.researchHistory?.some(item => item.cycleId === "RC-2026-30"), "finite-observation impossibility problem was not promoted to deep research");

for (const id of ["rfc_cmw_9999_2026", "ietf_corim_draft11_2026", "ietf_endorsements_draft09_2026", "ietf_hardware_attestation_draft00_2026", "json_schema_core_2020", "json_schema_validation_2020", "puf_modeling_attack_2010", "photonic_puf_crossfab_2022"]) {
  check(sources[id]?.reviewedOn === "2026-08-14" && /^https:\/\//.test(sources[id]?.url), `source ${id} is missing or stale`);
}
check(Object.keys(sources).length === 207, "source count is not 207");
check(cycles.length === 30 && connections.length === 33, "cycle or connection count changed");
check(problems.filter(item => item.researchHistory?.length).length === 12, "curated problem count is not twelve");
check(problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 102, "research-record count is not 102");

for (const page of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, page), "utf8").includes("research-cycle-30-data.js"), `${page} does not load RC30`);
const cycleText = fs.readFileSync(path.join(root, "research-cycle-30-data.js"), "utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지"]) check(!cycleText.includes(phrase), `RC30 contains forbidden mechanical phrasing: ${phrase}`);

if (failures.length) {
  console.error(`Hidden-vendor attestation cycle verification failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Verified RC30: five wire schemas, seventeen sealed fixtures, thirteen structure-pass semantic failures, an independent denominator audit, four bilingual records, and one bounded adjudication connection.");
