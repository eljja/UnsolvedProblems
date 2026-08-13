import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const protocol = load("research/reproducibility/site-lineage-interface-protocol.json");
const fixtures = load("research/reproducibility/site-lineage-adversarial-fixtures.json");
const result = load("research/reproducibility/site-lineage-attestation-result.json");
const audit = load("research/reproducibility/site-lineage-python-audit.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(protocol.protocolId === "SITE-LINEAGE-ATTESTATION-0.3" && protocol.status.includes("before-any-site-or-physical-claim"), "RC28 prospective non-physical boundary changed");
check(protocol.eventStateMachine.join("|") === "planned|label-bound|acquisition-started|acquisition-stopped|export-registered|analysis-sealed|key-released", "RC28 event state machine changed");
check(protocol.identityContract.physicalSample.includes("must not resemble an issued IGSN") && protocol.identityContract.digitalObject.includes("digital-object identifier"), "RC28 physical and digital identity scopes are not separated");
check(Object.keys(protocol.roleSeparation).length === 4 && protocol.commitment.warning.includes("not a reusable secret"), "RC28 role separation or demonstration-key boundary is missing");
check(protocol.exportManifest.required.includes("deviceMonotonicCounter") && protocol.exportManifest.required.includes("canonicalSignalSha256") && protocol.exportManifest.required.includes("receiptClass"), "RC28 export manifest is incomplete");
check(protocol.siteReadinessGates.length === 5 && protocol.siteReadinessGates.filter(row => row.repositoryStatus === "not-demonstrated").length === 2, "RC28 site-readiness gates changed");

check(fixtures.tests.length === 14 && fixtures.tests.filter(row => row.expectedVerdict === "reject").length === 11 && fixtures.tests.filter(row => row.expectedVerdict === "quarantine").length === 2, "RC28 fixture denominator or verdict partition changed");
check(fixtures.interpretiveControl.pairedFixtures.join("|") === "S04|S05", "RC28 ambiguity control changed");
check(result.fixtureResults.length === 14 && result.fixtureResults.every(row => row.detectedAsSpecified), "RC28 fixture adjudication failed");
check(result.similarities.transformedCopy >= result.similarities.quarantineThreshold && result.similarities.legitimateRepeat >= result.similarities.quarantineThreshold, "RC28 ambiguity pair no longer shares the quarantine region");
check(result.similarities.legitimateRepeat > result.similarities.transformedCopy && result.similarities.unrelatedSignals < 0, "RC28 similarity control geometry changed");
check(result.decisions.H1_byteDigestProvesNewAcquisition === false && result.decisions.H3_tolerantFingerprintUniquelyProvesCopying === false && result.decisions.H5_contentOnlyRuleDistinguishesPhysicalOccurrence === false, "RC28 content-only impossibility boundary changed");
check(result.decisions.H8_independentAcquisitionRootRequired === true && result.readiness["L4-ATTESTATION"] === "not-demonstrated" && result.readiness["L5-PHYSICAL"] === "not-demonstrated", "RC28 attestation requirement or physical nonclaim changed");
check(audit.passed && Object.values(audit.checks).every(Boolean) && audit.independenceBoundary.includes("no site"), "RC28 independent Python audit failed or overclaims physical evidence");
for (const key of ["transformedCopy", "legitimateRepeat", "unrelatedSignals"]) check(Math.abs(audit.independentlyRecomputedSimilarities[key] - result.similarities[key]) <= 5e-9, `RC28 independent similarity differs: ${key}`);

const context = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 26 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const cycle = context.window.RESEARCH_CYCLES.find(row => row.id === "RC-2026-28");
const connection = context.window.RESEARCH_CONNECTIONS.find(row => row.id === "CONN-ATTESTATION-001");
check(cycle?.problemIds.join("|") === "UP-185|UP-625|UP-602" && cycle.artifacts.length === 7, "RC28 scope or artifacts are incomplete");
check(cycle?.verifiedFindings.length >= 18 && cycle?.log.length >= 13 && cycle?.resultMatrix.rows.length >= 12, "RC28 findings, log, or decision matrix is incomplete");
check(cycle?.sharedProgram.successRule.textEn.includes("zero of 300") && cycle?.sharedProgram.stopRule.textEn.includes("legal authority"), "RC28 program lacks a quantitative gate or safety boundary");
check(connection?.problemIds.join("|") === "UP-185|UP-625|UP-602" && connection.strength === "moderate", "RC28 connection is missing or overgraded");
check(connection?.mapping.textEn.includes("PDN or PUF") && connection?.failureBoundary.textEn.includes("root of trust"), "RC28 connection lacks a variable mapping or failure boundary");
check(connection?.verificationStatus.textEn.includes("Synthetic") && connection?.verificationStatus.textEn.includes("pending"), "RC28 connection validation status overclaims evidence");
const definitions = [];
for (const id of cycle?.problemIds || []) {
  const record = context.window.PROBLEMS.find(row => row.id === id)?.researchHistory?.find(row => row.cycleId === "RC-2026-28");
  check(record?.hypotheses.length === 3 && record.updatedDefinition.textEn && record.decisiveTest.textEn && record.unresolved.textEn, `RC28 bilingual record incomplete for ${id}`);
  check(record?.sourceIds.length >= 6, `RC28 record has insufficient primary or official evidence for ${id}`);
  check(record.hypotheses.every(row => row.claim.textEn && row.prediction.textEn && row.test.textEn && row.reject.textEn), `RC28 hypothesis lacks an adjudicable field for ${id}`);
  definitions.push(record.updatedDefinition.textEn);
}
check(new Set(definitions).size === 3, "RC28 problem definitions are templated duplicates");
for (const sourceId of ["datacite_igsn_samples_2026", "nexus_processed_provenance_2026", "iucr_imgcif_dictionary_132", "nist_fips1804_hash_2015", "nist_semiconductor_standards_2025", "nist_chiplet_workshop_2024", "nist_chip_traceability_2025", "darpa_shield_program", "chipletquake_impedance_2025"]) check(context.window.CATALOG_SOURCES[sourceId]?.reviewedOn === "2026-08-14", `RC28 source missing or stale: ${sourceId}`);
check(Object.keys(context.window.CATALOG_SOURCES).length === 191, "source count is not 191");
check(context.window.RESEARCH_CYCLES.length === 28 && context.window.RESEARCH_CONNECTIONS.length === 31, "cycle or connection count changed");
check(context.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 95, "research-record count is not 95");
check(context.window.PROBLEMS.filter(problem => problem.researchHistory?.length).length === 10, "curated-problem count is not 10");
for (const page of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, page), "utf8").includes("research-cycle-28-data.js"), `${page} does not load RC28`);
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지"]) check(!fs.readFileSync(path.join(root, "research-cycle-28-data.js"), "utf8").includes(phrase), `RC28 contains forbidden mechanical phrasing: ${phrase}`);

if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("RC28 verification passed: 14/14 fixture verdicts and independent similarities reproduce; content fingerprints remain insufficient for physical occurrence or chiplet provenance.");
