import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const close = (actual, expected, tolerance = 1e-9) => Math.abs(actual - expected) <= tolerance;

const spec = readJson("research/reproducibility/chiplet-attestation-emulator-spec.json");
const fixtures = readJson("research/reproducibility/chiplet-attestation-adversarial-fixtures.json");
const result = readJson("research/reproducibility/chiplet-attestation-emulator-result.json");
const audit = readJson("research/reproducibility/chiplet-attestation-python-audit.json");

check(spec.protocolId === "CHIPLET-ATTESTATION-EMULATOR-0.4", "protocol identity changed");
check(spec.status.includes("synthetic") && spec.safetyAndSecurity.repositoryBoundary.includes("no operational instructions"), "synthetic/security boundary is not explicit");
check(Object.keys(spec.ratsRoles).sort().join("|") === "attester|endorser|referenceValueProvider|relyingParty|verifier", "five RATS roles are not separated");
check(spec.frozenAblations.join("|") === "trace-only|physical-only|crypto-plus-trace|full-combination", "four frozen ablations changed");
check(spec.threatFamilies.length === 6 && spec.threatFamilies.filter(item => item.inScopeForRateClaim).length === 4, "threat-family scope changed");
check(spec.sampleDesign.minimumPerClaimedClass === 299, "minimum class denominator is not 299");
check(spec.sampleDesign.balancedOperationalChoicePerClass === 306 && spec.sampleDesign.totalBlindUnits === 1530, "revised 1,530-unit design changed");
check(spec.sampleDesign.balanceGrid.cells === 18 && spec.sampleDesign.balanceGrid.unitsPerCellPerClass === 17, "vendor-process-lot balance changed");

check(fixtures.fixtures.length === 13, "fixture denominator is not thirteen");
const fixtureA12 = fixtures.fixtures.find(item => item.id === "A12");
check(fixtureA12?.expectedFullVerdict === "accept", "A12 must remain an accepted indistinguishable control");
check(fixtures.indistinguishableControl?.interpretation?.includes("threat-model failure"), "A12 threat-model failure is not documented");
check(result.fixtureResults.length === 13 && result.fixtureResults.every(item => item.matched), "full fixture verdicts do not match the sealed expectations");
check(result.fixtureResults.find(item => item.id === "A12")?.observedFullVerdict === "accept", "full verifier no longer exposes silent-compromise non-identifiability");
check(close(result.responseDistanceControls.A00, 0.010648509) && close(result.responseDistanceControls.A05, 0.310987826) && close(result.responseDistanceControls.A06, 0.127403249), "response-distance controls changed");
check(close(result.sampleDesignAudit.historical600.perFamilyUpper, 0.039155887) && close(result.sampleDesignAudit.historical600.pooledUpper, 0.009936082), "historical exact bounds changed");
check(close(result.sampleDesignAudit.revisedBalanced.pooledClassUpper, 0.009742209) && close(result.sampleDesignAudit.revisedBalanced.perCellUpper, 0.161566111), "revised class or cell bound changed");
check(result.sampleDesignAudit.minimumNForUpperAtMostOnePercent === 299 && result.sampleDesignAudit.revisedBalanced.totalN === 1530, "sample-design audit changed");
check(result.decisions.H6_sixHundredUnitsBoundEachAttackFamilyBelowOnePercent === false, "invalid RC28 per-family claim was not rejected");
check(result.decisions.H8_pooledClassBoundImpliesEachVendorProcessLotCellBelowOnePercent === false, "pooled result is being generalized to cells");
check(result.decisions.H9_hardwarePerformanceEstablished === false, "synthetic work must not claim hardware performance");
check(result.readiness["R3-INDEPENDENT-IMPLEMENTATION"] === "passed-by-independent-python-audit", "independent implementation is not recorded as passed");

check(audit.passed === true && Object.values(audit.checks).length === 14 && Object.values(audit.checks).every(Boolean), "independent Python audit did not pass all fourteen checks");
check(audit.independentlyRecomputed.minimumNAtOnePercent === 299 && audit.independentlyRecomputed.revisedTotal === 1530, "independent denominator reconstruction changed");
check(audit.independenceBoundary.includes("without importing or executing the JavaScript verifier"), "independent implementation boundary weakened");

const sandbox = { window: {} };
const siteFiles = [
  "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js",
  "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js",
  ...Array.from({ length: 27 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)
];
for (const file of siteFiles) vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });

const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-29");
check(cycle?.problemIds.join("|") === "UP-602|UP-605|UP-625", "RC29 problem scope changed");
check(cycle?.connectionIds.join("|") === "CONN-ATTESTATION-002", "RC29 connection scope changed");
check(cycle?.artifacts.length === 7 && cycle.verifiedFindings.length >= 20 && cycle.log.length >= 14, "RC29 evidence or research log is incomplete");
check(cycle?.resultMatrix.rows.length === 13, "RC29 adjudication matrix is incomplete");
check(cycle?.nextCycle.text.includes("JSON Schema") && cycle?.nextCycle.textEn.includes("JSON Schemas"), "next-cycle start point is not exact");
for (const artifact of cycle?.artifacts || []) check(fs.existsSync(path.join(root, artifact.url)), `missing RC29 artifact: ${artifact.url}`);

const connection = connections.find(item => item.id === "CONN-ATTESTATION-002");
check(connection?.problemIds.join("|") === "UP-602|UP-605|UP-625", "connection participants changed");
check(connection?.strength === "moderate" && connection?.verificationStatus.textEn.includes("unverified"), "connection confidence is overstated");
check((connection?.mapping.text.match(/↔/g) || []).length >= 8, "attestation-transfer variable mapping is incomplete");
check(connection?.failureBoundary.text.length > 100 && connection?.minimumTest.text.length > 100, "connection failure boundary or minimum test is too weak");

for (const id of ["UP-602", "UP-605", "UP-625"]) {
  const problem = problems.find(item => item.id === id);
  const record = problem?.researchHistory?.find(item => item.cycleId === "RC-2026-29");
  check(Boolean(record), `${id}: RC29 record missing`);
  check(record?.hypotheses.length === 3, `${id}: must have three problem-specific competing hypotheses`);
  check(record?.sourceIds.length >= 7, `${id}: primary-source support is too sparse`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    check(record?.[field]?.text?.length > 45 && record?.[field]?.textEn?.length > 70, `${id}: ${field} is not substantive and bilingual`);
  }
  for (const hypothesis of record?.hypotheses || []) {
    for (const field of ["claim", "prediction", "test", "reject"]) check(hypothesis[field]?.text?.length > 20 && hypothesis[field]?.textEn?.length > 35, `${id}/${hypothesis.code}: ${field} is not testable and bilingual`);
  }
}

for (const id of ["rfc_rats_9334_2023", "rfc_eat_9711_2025", "rfc_scitt_9943_2026", "nist_ir8536_2pd_2025", "ucie3_spec_2025", "nist_digital_twin_trust_2025", "puf_evaluation_tcad_2025", "nist_exact_binomial_handbook"]) {
  check(sources[id]?.reviewedOn === "2026-08-14" && /^https:\/\//.test(sources[id]?.url), `source ${id} is missing or not current`);
}
check(Object.keys(sources).length === 199, "source count is not 199");
check(cycles.length === 29 && connections.length === 32, "cycle or connection count changed");
check(problems.filter(item => item.researchHistory?.length).length === 11, "curated problem count is not eleven");
check(problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 98, "research-record count is not 98");

for (const page of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, page), "utf8").includes("research-cycle-29-data.js"), `${page} does not load RC29`);
const cycleText = fs.readFileSync(path.join(root, "research-cycle-29-data.js"), "utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지"]) check(!cycleText.includes(phrase), `RC29 contains forbidden mechanical phrasing: ${phrase}`);

if (failures.length) {
  console.error(`Chiplet-attestation cycle verification failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Verified RC29: thirteen sealed fixtures, four evidence ablations, exact class denominators, independent audit, three bilingual records, and one bounded structural connection.");
