import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative));
const readJson = relative => JSON.parse(read(relative).toString("utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const protocol = readJson("research/reproducibility/pairwise-unlinkable-dispute-protocol.json");
const custody = readJson("research/reproducibility/pairwise-custody-view.json");
const pseudonymizer = readJson("research/reproducibility/pairwise-pseudonymizer-view.json");
const outcome = readJson("research/reproducibility/pairwise-outcome-view.json");
const auditor = readJson("research/reproducibility/pairwise-auditor-registry.json");
const ledger = readJson("research/reproducibility/pairwise-public-ledger.json");
const capability = readJson("research/reproducibility/dispute-opening-capability.json");
const pairResult = readJson("research/reproducibility/pairwise-unlinkable-dispute-result.json");
const pairAudit = readJson("research/reproducibility/pairwise-unlinkable-python-audit.json");
const firstFailure = readJson("research/reproducibility/pairwise-dispute-first-failure.json");

assert(protocol.protocolId === "PAIRWISE-UNLINKABLE-DISPUTE-ENROLLMENT-0.8" && pairResult.protocolId === protocol.protocolId && ledger.protocolId === protocol.protocolId, "RC33 message-graph protocol mismatch.");
for (const [name, view] of Object.entries({ custody, pseudonymizer, outcome, auditor, ledger })) assert(view.records.length === 9, `${name} must contain nine records.`);
const allRows = [custody, pseudonymizer, outcome, auditor, ledger].flatMap(view => view.records);
assert(allRows.every(row => !("enrollmentId" in row)) && pairResult.globalEnrollmentIdPresent === false, "Global enrollmentId returned.");
const c2p = new Set(custody.records.map(row => row.custodyToPseudonymizerHandle));
const p2o = new Set(outcome.records.map(row => row.pseudonymizerToOutcomeHandle));
assert(c2p.size === 9 && p2o.size === 9 && [...c2p].every(value => !p2o.has(value)) && pairResult.noCrossHopHandleReuse, "Hop handles are reused or collide.");
assert(Object.values(pairResult.forbiddenFields).every(value => value === false), "A role view contains a forbidden field.");
assert(pairResult.normalPairs.length === 3 && pairResult.normalPairs.every(item => item.uniqueOutcomeRecordsLinked === 0) && pairResult.normalPairTotalLinkedOutcomeRecords === 0, "A normal two-role pair links an outcome.");
assert(pairResult.disputeTests.validOpening.opened && pairResult.disputeTests.validOpening.bridgeCount === 1 && pairResult.disputeTests.openedUniqueOutcomeRecords === 1, "Authorized opening does not reveal exactly one outcome.");
for (const control of ["replay", "wrongDispute", "expired", "tampered"]) assert(pairResult.disputeTests[control].opened === false, `${control} unexpectedly opened a record.`);
assert(pairResult.threeOperationalRoleLinkedOutcomeRecords === 9 && pairResult.qualification.threeRoleCollusionResistance === "failed-as-expected", "Three-role failure boundary disappeared.");
assert(pairAudit.passed && Object.keys(pairAudit.checks).length === 20 && Object.values(pairAudit.checks).every(Boolean), "Independent pairwise audit is incomplete.");
assert(pairAudit.recomputed.normalPairUniqueOutcomeRecords["custody+pseudonymizer"] === 0 && pairAudit.recomputed.authorizedOpeningUniqueOutcomeRecords === 1 && pairAudit.recomputed.threeRoleUniqueOutcomeRecords === 9, "Independent pairwise counts disagree.");
assert(firstFailure.status === "reproduced-and-corrected" && firstFailure.observed.capabilityBridgesReturned === 1 && firstFailure.observed.uniqueOutcomeRecordsExposed === 2 && firstFailure.postCorrection.authorizedOpeningUniqueOutcomeRecords === 1, "First equivalence-class failure is not preserved.");
assert(capability.tokenDigest === sha256(Buffer.from(capability.token, "utf8")) && capability.publicClaims.maximumOpenings === 1, "Capability digest or limit changed.");

const vectors = readJson("research/reproducibility/rfc9497-p256-voprf-vectors.json");
const pythonVoprf = readJson("research/reproducibility/rfc9497-p256-voprf-result.json");
const javascriptVoprf = readJson("research/reproducibility/rfc9497-p256-voprf-js-audit.json");
const comparison = readJson("research/reproducibility/voprf-hmac-enrollment-comparison-result.json");
assert(vectors.source === "https://www.rfc-editor.org/rfc/rfc9497.html#appendix-A.3.2" && vectors.mode === 1 && vectors.suite === "P256-SHA256" && vectors.vectors.length === 3, "RFC 9497 vector fixture changed.");
assert(pythonVoprf.passed && Object.keys(pythonVoprf.checks).length === 10 && Object.values(pythonVoprf.checks).every(Boolean) && pythonVoprf.vectors.every(item => item.dleqProofValid && item.outputsMatch && item.wrongModeContextRejected && item.mutatedProofRejected && item.mutatedEvaluationRejected), "Python VOPRF conformance is incomplete.");
assert(javascriptVoprf.passed && Object.keys(javascriptVoprf.checks).length === 9 && Object.values(javascriptVoprf.checks).every(Boolean) && javascriptVoprf.vectors.every(item => item.proofValid && item.outputMatches && item.wrongContextRejected && item.mutatedProofRejected), "JavaScript VOPRF audit is incomplete.");
assert(comparison.records === 9 && comparison.hmacRelay.metrics.sameStudyDuplicateRecall === 3 && comparison.vectorBackedVoprf.metrics.sameStudyDuplicateRecall === 3, "VOPRF-HMAC duplicate comparison changed.");
assert(comparison.hmacRelay.metrics.differentPackageFalseCollisions === 0 && comparison.vectorBackedVoprf.metrics.differentPackageFalseCollisions === 0, "VOPRF-HMAC false collision appeared.");
assert(comparison.hmacRelay.metrics.crossStudyTokenCardinality["SYNTHETIC-PACKAGE-X"] === 3 && comparison.vectorBackedVoprf.metrics.crossStudyTokenCardinality["SYNTHETIC-PACKAGE-X"] === 1, "Cross-study token counterexample changed.");
assert(comparison.transportResult.normalPairLinkedOutcomeRecords === 0 && comparison.transportResult.authorizedOpeningOutcomeRecords === 1 && comparison.transportResult.threeRoleLinkedOutcomeRecords === 9, "Transport comparison changed.");
assert(comparison.qualification.arbitraryInputVoprfEvaluation === "untested" && comparison.qualification.liveVoprfInteroperability === "untested" && comparison.qualification.physicalPackages === 0, "VOPRF qualification was overstated.");

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 31 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-33");
assert(cycle?.problemIds.join("|") === "UP-602|UP-605|UP-625|UP-315" && cycle?.connectionIds.join("|") === "CONN-ATTESTATION-006", "RC33 public scope changed.");
assert(cycle?.verifiedFindings.length === 20 && cycle?.resultMatrix.rows.length === 20 && cycle?.artifacts.length === 19 && cycle?.log.length === 16, "RC33 public record is incomplete.");
assert(cycle?.nextCycle.text.includes("임의 package 100개") && cycle?.nextCycle.textEn.includes("one hundred arbitrary packages"), "RC33 next starting point is not exact.");
for (const artifact of cycle?.artifacts || []) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC33 artifact: ${artifact.url}`);
const connection = connections.find(item => item.id === "CONN-ATTESTATION-006");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.minimumTest.text.length > 120 && connection.failureBoundary.text.length > 120, "RC33 structural connection is incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length >= 6, `${id}: RC33 hypotheses or sources are incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) assert(record?.[field]?.text?.length > 55 && record?.[field]?.textEn?.length > 100, `${id}: RC33 ${field} is not substantive and bilingual.`);
}
for (const id of ["nist_sp800_63c4_2025", "openid_pairwise_2023"]) assert(sources[id]?.reviewedOn === "2026-08-14" && /^https:\/\//.test(sources[id]?.url), `RC33 source ${id} is missing or stale.`);
assert(Object.keys(sources).length === 218 && cycles.length === 33 && connections.length === 36, "RC33 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 114, "RC33 curated-problem or research-record count changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-33-data.js"), `${page} does not load RC33.`);
const cycleText = read("research-cycle-33-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지"]) assert(!cycleText.includes(phrase), `RC33 contains forbidden mechanical phrasing: ${phrase}`);
console.log("RC33 verified: pairwise outcomes 0 normal / 1 authorized / 9 all-role; independent graph 20/20; RFC 9497 Python 10/10 and JavaScript 9/9; physical n=0.");
