import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative));
const readJson = relative => JSON.parse(read(relative).toString("utf8"));
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const tsaProtocol = readJson("research/reproducibility/tsa-qualification-protocol.json");
const tsaManifest = readJson("research/reproducibility/tsa-request-manifest.json");
const tsaResult = readJson("research/reproducibility/tsa-qualification-result.json");
const requestBytes = read("research/reproducibility/rc32-precommit.tsq");
const payloadBytes = read(tsaManifest.payloadPath);

assert(tsaProtocol.protocolId === "RFC3161-REQUEST-QUALIFICATION-0.7", "Unexpected TSA qualification protocol.");
assert(tsaManifest.protocolId === tsaProtocol.protocolId && tsaResult.protocolId === tsaProtocol.protocolId, "TSA artifacts disagree on protocol.");
assert(tsaManifest.payloadBytes === payloadBytes.length && tsaManifest.payloadSha256 === sha256(payloadBytes), "TSA payload binding changed.");
assert(tsaManifest.requestBytes === requestBytes.length && tsaManifest.requestSha256 === sha256(requestBytes), "TimeStampReq bytes changed.");
assert(tsaManifest.messageImprintHex === tsaManifest.payloadSha256 && tsaManifest.messageImprintAlgorithmOid === "2.16.840.1.101.3.4.2.1", "TimeStampReq does not bind the exact payload with SHA-256.");
assert(tsaManifest.certReq === true && tsaManifest.qualification === "request-only", "TSA request qualification was overstated.");
assert(tsaResult.testCount === 8 && tsaResult.passedRequestTests === 8 && Object.values(tsaResult.tests).every(Boolean), "RFC 3161 request tests are incomplete.");
assert(Object.values(tsaResult.responseVerification).filter(value => value === true).length === 0 && tsaResult.responseVerification.trustedTimeQualified === false, "Trusted time must remain unqualified without a verified response.");
assert(tsaResult.environment.externalResponseSupplied === false && tsaResult.environment.explicitCaFileSupplied === false, "RC32 unexpectedly claims response or CA evidence.");

const enrollmentProtocol = readJson("research/reproducibility/role-separated-enrollment-protocol.json");
const enrollmentSchema = readJson("research/reproducibility/role-separated-enrollment-ledger.schema.json");
const custody = readJson("research/reproducibility/enrollment-custody-view.json");
const pseudonymizer = readJson("research/reproducibility/enrollment-pseudonymizer-view.json");
const outcome = readJson("research/reproducibility/enrollment-outcome-view.json");
const ledger = readJson("research/reproducibility/role-separated-enrollment-ledger.json");
const enrollmentResult = readJson("research/reproducibility/role-separated-enrollment-result.json");
const independentAudit = readJson("research/reproducibility/role-separated-enrollment-python-audit.json");

assert(enrollmentProtocol.protocolId === "ROLE-SEPARATED-PACKAGE-ENROLLMENT-0.7", "Unexpected enrollment protocol.");
assert(Object.keys(enrollmentProtocol.roles).length === 3, "Enrollment must define exactly three roles.");
assert(enrollmentSchema.properties.records.minItems === 9 && enrollmentSchema.properties.records.maxItems === 9, "Enrollment schema must freeze the 3x3 matrix.");
for (const [name, view] of Object.entries({ custody, pseudonymizer, outcome, ledger })) assert(view.records.length === 9, `${name} does not contain nine records.`);
assert(enrollmentResult.records === 9 && enrollmentResult.studies === 3 && enrollmentResult.columns === 3, "Enrollment result is not a 3x3 matrix.");
assert(enrollmentResult.withinStudyChecks.length === 3 && enrollmentResult.withinStudyChecks.every(row => row.repeatMatches && row.differentPackageDiffers && row.duplicatePointerCorrect && row.scopeKeyMatchesStudy), "Within-study equality matrix failed.");
assert(enrollmentResult.crossStudyUnlinkable === true && Object.values(enrollmentResult.forbiddenFields).every(value => value === false), "Single-role separation or cross-study equality failed.");
assert(enrollmentResult.hypotheses.E1_sameStudyEqualityAndCrossStudyUnlinkability === true && enrollmentResult.hypotheses.E2_singleRoleFieldSeparation === true && enrollmentResult.hypotheses.E3_syntheticPassEstablishesRealPrivacyAndCustody === false, "Enrollment hypotheses are misqualified.");
assert(enrollmentResult.qualification.productionPrivacy === "unqualified" && enrollmentResult.qualification.physicalCustody === "unqualified" && enrollmentResult.qualification.twoRoleCollusionResistance === "unqualified" && enrollmentResult.qualification.voprf === "not-implemented", "Enrollment qualification was overstated.");
assert(independentAudit.passed === true && Object.keys(independentAudit.checks).length === 17 && Object.values(independentAudit.checks).every(Boolean), "Independent enrollment audit is incomplete.");
assert(independentAudit.recomputed.pairCollusionCanJoinOnEnrollmentId === true, "The two-role collusion failure must remain visible.");
assert(independentAudit.independenceBoundary.includes("does not execute JavaScript") && independentAudit.independenceBoundary.includes("cannot independently prove"), "Independent-audit boundary is missing.");

const packageManifest = readJson("research/reproducibility/external-adjudication-package-manifest.json");
const submissionSchema = readJson("research/reproducibility/external-adjudication-submission.schema.json");
assert(packageManifest.includedFiles.length === 9, "External collaboration package must freeze nine inputs.");
for (const item of packageManifest.includedFiles) {
  const bytes = read(item.path);
  assert(bytes.length === item.bytes && sha256(bytes) === item.sha256, `External-package digest mismatch: ${item.path}`);
}
assert(packageManifest.excludedDevelopmentFiles.length === 5 && packageManifest.privateAuditRequirements.minimumCases === 20, "External package exclusion or private-case threshold changed.");
assert(packageManifest.currentStatus.externalTeamEnrolled === false && packageManifest.currentStatus.privateCasesReceived === 0 && packageManifest.currentStatus.signedSubmissionReceived === false && packageManifest.currentStatus.externallyVerifiedTimeEvidenceReceived === false, "RC32 must not claim external participation.");
assert(submissionSchema.properties.caseCount.minimum === 20 && submissionSchema.properties.predictions.minItems === 20, "External submission schema permits too few cases.");
assert(submissionSchema.properties.independenceDisclosure.properties.sharedAuthors.const === false && submissionSchema.properties.independenceDisclosure.properties.sharedParserLibrary.const === false, "External submission does not enforce authorship and library independence.");

const sandbox = { window: {} };
const siteFiles = [
  "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js",
  ...Array.from({ length: 30 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)
];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-32");
assert(cycle?.problemIds.join("|") === "UP-602|UP-605|UP-625|UP-315", "RC32 public problem scope changed.");
assert(cycle?.connectionIds.join("|") === "CONN-ATTESTATION-005", "RC32 connection scope changed.");
assert(cycle?.verifiedFindings.length === 18 && cycle?.resultMatrix.rows.length === 17 && cycle?.artifacts.length === 15 && cycle?.log.length === 16, "RC32 public record is incomplete.");
assert(cycle?.nextCycle.text.includes("전역 enrollmentId를 제거") && cycle?.nextCycle.textEn.includes("removes the global enrollmentId"), "RC32 next starting point is not exact.");
for (const artifact of cycle?.artifacts || []) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC32 artifact: ${artifact.url}`);
const connection = connections.find(item => item.id === "CONN-ATTESTATION-005");
assert(connection?.problemIds.join("|") === cycle?.problemIds.join("|") && connection?.strength === "moderate", "RC32 connection participants or strength changed.");
assert(connection?.minimumTest.text.length > 100 && connection?.failureBoundary.text.length > 100, "RC32 connection test or failure boundary is too weak.");
for (const id of cycle?.problemIds || []) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length >= 6, `${id}: RC32 hypotheses or sources are incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) assert(record?.[field]?.text?.length > 45 && record?.[field]?.textEn?.length > 70, `${id}: RC32 ${field} is not substantive and bilingual.`);
}
for (const id of ["rfc_cms_5652_2009", "rfc_voprf_9497_2023", "nist_sp800_188_2023"]) assert(sources[id]?.reviewedOn === "2026-08-14" && /^https:\/\//.test(sources[id]?.url), `RC32 source ${id} is missing or stale.`);
assert(Object.keys(sources).length === 216 && cycles.length === 32 && connections.length === 35, "RC32 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 110, "RC32 curated-problem or research-record count changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-32-data.js"), `${page} does not load RC32.`);
const cycleText = read("research-cycle-32-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지"]) assert(!cycleText.includes(phrase), `RC32 contains forbidden mechanical phrasing: ${phrase}`);

console.log("RC32 verified: RFC 3161 request 8/8; enrollment 9/9; independent audit 17/17; two-role collusion remains; trusted time and hardware n=0.");
