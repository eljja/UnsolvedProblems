import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import childProcess from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const readJson = relative => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const precommit = readJson("research/reproducibility/rc49-identity-plane-precommit.json");
assert(precommit.precommitId === "RC49-COUNTER-MERKLE-IDENTITY-PLANE-PRECOMMIT-0.1", "RC49 precommit ID changed.");
assert(precommit.status === "sealed-after-capability-and-prior-art-audit-before-corpus-generation-fault-outcomes-or-independent-adjudication", "RC49 chronology boundary changed.");
assert(precommit.problems.join("|") === "UP-605|UP-315", "RC49 problem scope changed.");
assert(precommit.corpus.eventCount === 10000 && precommit.corpus.placements.join("|") === "17|257|4095|5000|9998", "RC49 event corpus or placements changed.");
assert(precommit.corpus.stages.join("|") === "capture|export|package" && precommit.corpus.faults.length === 5, "RC49 stage or fault grammar changed.");
assert(precommit.arms.map(item => item.id).join("|") === "counter-only|signature-only|clock-only|counter-plus-merkle", "RC49 competing arms changed.");
assert(precommit.hardGates.length === 8 && precommit.hardGates.some(item => item.includes("Capture payload mutation")), "RC49 hard gates changed.");

const preregCommit = childProcess.execFileSync("git", ["show", "--name-only", "--format=", "0ab691d"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean).sort();
assert(preregCommit.join("|") === ["research/reproducibility/rc49-identity-plane-precommit.json", "research/reproducibility/rc49-identity-plane-prior-art.json", "research/reproducibility/rc49-x16-custodian-request.json"].sort().join("|"), "RC49 preregistration commit contents changed.");
for (const outcome of ["research/reproducibility/rc49-identity-plane-node.json", "research/reproducibility/rc49-identity-plane-python.json", "research/reproducibility/rc49-identity-plane-independent-audit.json"]) {
  const check = childProcess.spawnSync("git", ["cat-file", "-e", `0ab691d:${outcome}`], { cwd: root });
  assert(check.status !== 0, `RC49 outcome existed in preregistration commit: ${outcome}`);
}

const priorArt = readJson("research/reproducibility/rc49-identity-plane-prior-art.json");
assert(priorArt.confirmedFacts.length === 7 && priorArt.unverifiedProposals.length === 3 && priorArt.existingRepositoryAssets.length === 3, "RC49 prior-art boundary incomplete.");
assert(priorArt.postSealMetadataCorrections.length === 1 && priorArt.postSealMetadataCorrections[0].correctedValue === "2025-11-24" && priorArt.postSealMetadataCorrections[0].effectOnPreregisteredDesign.startsWith("none"), "RC49 post-seal source-date correction is not explicit.");
assert(priorArt.confirmedFacts.some(item => item.source.includes("rfc9942") && item.publishedOn === "2026-06-01"), "RFC 9942 primary source missing.");
assert(priorArt.confirmedFacts.some(item => item.source.includes("rfc9943") && item.claim.includes("not that the statement is accurate")), "RFC 9943 accuracy boundary missing.");
const custodian = readJson("research/reproducibility/rc49-x16-custodian-request.json");
assert(custodian.status === "draft-only-not-sent-no-artifact-assumed" && custodian.requestedArtifacts.length === 3 && custodian.semanticQuestions.length === 9, "X16 custodian-request boundary changed.");

const node = readJson("research/reproducibility/rc49-identity-plane-node.json");
const python = readJson("research/reproducibility/rc49-identity-plane-python.json");
for (const field of ["corpus", "cryptography", "summaries", "h1Gate", "hypothesisAdjudication", "trials", "receipts", "limitations"]) assert(same(node[field], python[field]), `Node/Python mismatch: ${field}`);
assert(node.corpus.eventCount === 10000 && node.corpus.trialCount === 80 && node.corpus.armRegimeEvaluations === 400, "RC49 outcome denominator changed.");
assert(node.receipts.length === 480 && node.cryptography.receiptCount === 480, "RC49 receipt count changed.");
assert(node.cryptography.signatureSelfChecksPassed === 480 && node.cryptography.merkleSelfChecksPassed === 480, "RC49 valid proof checks changed.");
assert(node.cryptography.mutatedSignatureRejections === 480 && node.cryptography.mutatedSignedRootRejections === 480, "RC49 negative proof controls changed.");
assert(node.h1Gate.pass && node.h1Gate.exactObservable === 55 && node.h1Gate.resetRefusals === 15 && node.h1Gate.precommitAbstentions === 5 && node.h1Gate.cleanAccepted === 5 && node.h1Gate.failures.length === 0, "RC49 preregistered H1 gate changed.");
const summaries = Object.fromEntries(node.summaries.map(item => [`${item.arm}:${item.regime || "none"}`, item]));
assert(summaries["counter-only:none"].statuses["event-only"] === 45 && summaries["counter-only:none"].exactEventAndStage === 0, "Counter-only boundary changed.");
assert(summaries["signature-only:none"].exactStageAnyEvent === 50 && summaries["signature-only:none"].exactEventAndStage === 0, "Signature-only boundary changed.");
assert(summaries["clock-only:tight-40us"].exactEventAnyStage === 45 && summaries["clock-only:loose-60us"].statuses["ambiguous-clock"] === 80, "Clock-envelope result changed.");
assert(summaries["counter-plus-merkle:none"].exactEventAndStage === 55 && summaries["counter-plus-merkle:none"].cleanFalseCalls === 0, "Combined-arm exactness changed.");

const audit = readJson("research/reproducibility/rc49-identity-plane-independent-audit.json");
assert(audit.verdict === "pass" && audit.failures.length === 0 && audit.comparisons.totalExactStructuredComparisons === 1367, "RC49 independent audit changed.");
assert(audit.cryptographicControls.mutatedSignaturesRejectedByEachImplementation === 480 && audit.cryptographicControls.mutatedSignedRootsRejectedByEachImplementation === 480, "RC49 independent negative controls changed.");
const connectionEvidence = readJson("research/reproducibility/rc49-identity-connection-evidence.json");
assert(connectionEvidence.connectionId === "CONN-EVIDENCE-022" && connectionEvidence.problemIds.join("|") === "UP-605|UP-315", "RC49 structural connection changed.");
assert(connectionEvidence.holdsWhen.length === 5 && connectionEvidence.breaksWhen.length === 5 && connectionEvidence.validationStatus.includes("Synthetic single-fault"), "RC49 connection limits weakened.");
const integrated = readJson("research/reproducibility/rc49-identity-plane-cycle-result.json");
assert(integrated.precommit.gitCommit === "0ab691d" && integrated.verifiedFindings.length === 10 && integrated.hypothesisAdjudication.length === 4, "RC49 integrated result incomplete.");
assert(integrated.workPackages.length === 5 && integrated.failedAttempts.length === 5 && integrated.unresolved.length === 6, "RC49 program or uncertainties incomplete.");
assert(integrated.newSolutionPath.status.includes("not claimed as a new cryptographic primitive") && integrated.nextCycleStart.includes("RC50 should not rerun"), "RC49 novelty or next-start boundary weakened.");

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 47 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-49");
assert(cycle?.problemIds.join("|") === "UP-605|UP-315" && cycle.connectionIds.join("|") === "CONN-EVIDENCE-022", "RC49 public scope changed.");
assert(cycle.verifiedFindings.length === 10 && cycle.resultMatrix.rows.length === 12 && cycle.artifacts.length === 12 && cycle.log.length === 10, "RC49 public cycle record incomplete.");
for (const item of cycle.artifacts) assert(fs.existsSync(path.join(root, item.url)), `Missing RC49 artifact: ${item.url}`);
const connection = connections.find(item => item.id === "CONN-EVIDENCE-022");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 240 && connection.failureBoundary.text.length > 220, "RC49 public connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 4 && record.sourceIds.length === 15, `${id}: RC49 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    const minimumKo = field === "role" ? 75 : 300;
    const minimumEn = field === "role" ? 140 : 550;
    assert(record[field].text.length > minimumKo && record[field].textEn.length > minimumEn, `${id}: RC49 ${field} is not substantive and bilingual.`);
  }
}
for (const id of ["rfc_cose_receipts_9942_2026", "rfc_scitt_9943_2026", "rfc_ct_9162_2021", "rfc_jcs_8785_2020", "in_toto_attestation_framework_v1_2024", "slsa_v1_2_2025"]) {
  assert(sources[id]?.reviewedOn === "2026-08-25" && /^https:\/\//.test(sources[id].url), `RC49 source missing: ${id}`);
}
assert(sources.rfc_scitt_9943_2026.resultPeriod.includes("Standards Track") && !sources.rfc_scitt_9943_2026.resultPeriod.includes("Informational"), "RFC 9943 status correction missing.");
assert(Object.keys(sources).length === 283 && cycles.length === 49 && connections.length === 52, "RC49 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 158, "RC49 research record count changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).includes("research-cycle-49-data.js"), `${page} does not load RC49.`);
const publicText = read("research-cycle-49-data.js");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추", "분량 목표"]) assert(!publicText.includes(phrase), `RC49 contains forbidden wording: ${phrase}`);
assert(read("package.json").includes("verify-rc49-identity-plane-cycle.mjs"), "RC49 verifier is not in npm test.");
assert(read("sitemap.xml").includes("RC-2026-49&amp;lang=ko") && read("sitemap.xml").includes("RC-2026-49&amp;lang=en"), "RC49 is missing from sitemap.xml.");
console.log("RC49 verified: 55 observable faults exact, 15 resets refused, 5 pre-witness mutations outside, and 1,367 independent structures agree.");
