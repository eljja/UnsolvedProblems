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

const precommit = readJson("research/reproducibility/rc50-compositional-receipts-precommit.json");
assert(precommit.precommitId === "RC50-COMPOSITIONAL-RECEIPTS-PRECOMMIT-0.1", "RC50 precommit ID changed.");
assert(precommit.status === "sealed-after-repository-prior-art-and-capability-audit-before-fixture-generation-outcomes-or-independent-adjudication", "RC50 chronology boundary changed.");
assert(precommit.problems.join("|") === "UP-605|UP-315", "RC50 problem scope changed.");
assert(precommit.corpus.eventCount === 1024 && precommit.corpus.placements.join("|") === "17|257|998", "RC50 corpus or placements changed.");
assert(Object.values(precommit.corpus.trialSchedule).at(-1) === 44 && precommit.corpus.stages.join("|") === "capture|export|package", "RC50 trial schedule or stages changed.");
assert(precommit.arms.map(item => item.id).join("|") === "receipt-local|stateful-single-view|cross-view-causal", "RC50 arms changed.");
assert(precommit.competingHypotheses.length === 5 && precommit.hardGates.length === 9, "RC50 hypotheses or hard gates changed.");

const preregFiles = childProcess.execFileSync("git", ["show", "--name-only", "--format=", "7354dda"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean).sort();
const expectedPreregFiles = [
  "research/reproducibility/rc50-compositional-receipts-precommit.json",
  "research/reproducibility/rc50-compositional-receipts-prior-art.json",
  "research/reproducibility/rc50-third-verifier-contract.json"
].sort();
assert(preregFiles.join("|") === expectedPreregFiles.join("|"), "RC50 preregistration commit contents changed.");
for (const outcome of [
  "research/reproducibility/rc50-compositional-receipts-node.json",
  "research/reproducibility/rc50-compositional-receipts-python.json",
  "research/reproducibility/rc50-compositional-receipts-wire-vectors.json",
  "research/reproducibility/rc50-compositional-receipts-third-wire-audit.json",
  "research/reproducibility/rc50-compositional-receipts-independent-audit.json"
]) {
  const result = childProcess.spawnSync("git", ["cat-file", "-e", `7354dda:${outcome}`], { cwd: root });
  assert(result.status !== 0, `RC50 outcome existed in preregistration commit: ${outcome}`);
}

const priorArt = readJson("research/reproducibility/rc50-compositional-receipts-prior-art.json");
assert(priorArt.sources.length === 9 && priorArt.repositoryInheritance.length === 3, "RC50 prior-art audit incomplete.");
assert(priorArt.sources.every(item => /^https:\/\//.test(item.url) && item.usedFor && item.doesNotEstablish), "RC50 source boundary incomplete.");
assert(priorArt.sources.find(item => item.id === "rfc_cose_9052_2022")?.type === "standards-track", "RFC 9052 status correction missing.");
assert(priorArt.sources.find(item => item.id === "rfc_cose_countersignatures_9338_2022")?.type === "standards-track", "RFC 9338 status correction missing.");
assert(priorArt.postSealMetadataCorrections.length === 2 && priorArt.postSealMetadataCorrections.every(item => item.effectOnPreregisteredDesign.startsWith("none")), "RC50 post-seal metadata corrections are not explicit.");
const thirdContract = readJson("research/reproducibility/rc50-third-verifier-contract.json");
assert(thirdContract.status === "sealed-before-wire-vectors-or-outcomes" && thirdContract.requiredIndependentOperations.length === 9, "Third-verifier chronology or operations changed.");

const node = readJson("research/reproducibility/rc50-compositional-receipts-node.json");
const python = readJson("research/reproducibility/rc50-compositional-receipts-python.json");
for (const field of ["eventCount", "placements", "payloadDigest", "referenceManifestRoot"]) assert(same(node.corpus[field], python.corpus[field]), `Node/Python corpus mismatch: ${field}`);
for (const field of ["publicKeys", "trials", "summaries", "h1Gate"]) assert(same(node[field], python[field]), `Node/Python scientific mismatch: ${field}`);
assert(node.trials.length === 44 && node.h1Gate.pass && node.h1Gate.failures.length === 0, "RC50 preregistered H1 gate changed.");
assert(node.summaries.crossViewCausal.statuses["exact-composite"] === 27 && node.summaries.crossViewCausal.statuses["set-valued-shadow"] === 3, "RC50 exact or shadow verdict changed.");
assert(node.summaries.crossViewCausal.statuses["refuse-rollback"] === 3 && node.summaries.crossViewCausal.statuses["refuse-issuer-equivocation"] === 2 && node.summaries.crossViewCausal.statuses["refuse-log-equivocation"] === 2, "RC50 rollback or equivocation verdict changed.");
assert(node.summaries.crossViewCausal.statuses["reject-bridge-replay"] === 1 && node.summaries.crossViewCausal.statuses["reject-bridge-fork"] === 1, "RC50 bridge-state verdict changed.");
assert(node.summaries.crossViewCausal.statuses["outside-independent-boundary"] === 2, "RC50 witness-collusion boundary changed.");
assert(node.summaries.receiptLocal.statuses["accepted-valid-local-receipt"] === 7 && node.summaries.receiptLocal.statuses["accepted-valid-signatures"] === 2, "RC50 local-validity counterexamples changed.");

const wireVectors = readJson("research/reproducibility/rc50-compositional-receipts-wire-vectors.json");
assert(wireVectors.inclusionVectors.length === 12 && wireVectors.consistencyVectors.length === 3, "RC50 standards-vector counts changed.");
assert(wireVectors.transparentStatement.attachedReceiptCount === 2 && wireVectors.transparentStatement.logAReceiptHex && wireVectors.transparentStatement.logBReceiptHex && wireVectors.transparentStatement.baseStatementCoseHex, "RC50 transparent statement incomplete.");
const wireAudit = readJson("research/reproducibility/rc50-compositional-receipts-third-wire-audit.json");
assert(wireAudit.allPassed && wireAudit.exactExpectedCounts && wireAudit.failures.length === 0, "RC50 standalone wire audit failed.");
assert(Object.values(wireAudit.checks).reduce((sum, count) => sum + count, 0) === 81, "RC50 wire check denominator changed.");
assert(wireAudit.transparentStatement.issuerSignatureValid && wireAudit.transparentStatement.twoIndependentReceiptsValid, "RC50 transparent-statement verification changed.");

const audit = readJson("research/reproducibility/rc50-compositional-receipts-independent-audit.json");
assert(audit.verdict === "pass" && audit.failures.length === 0 && audit.comparisons.totalExactStructuredComparisons === 63, "RC50 independent adjudication changed.");
assert(audit.wireChecks.total === 81 && audit.hypothesisAdjudication.length === 5, "RC50 independent wire or hypothesis audit incomplete.");
assert(audit.hypothesisAdjudication.find(item => item.code === "H0")?.verdict === "rejected" && audit.hypothesisAdjudication.find(item => item.code === "H1")?.verdict === "supported-in-synthetic-scope", "RC50 central hypotheses changed.");
const connectionEvidence = readJson("research/reproducibility/rc50-compositional-receipts-connection-evidence.json");
assert(connectionEvidence.connectionId === "CONN-EVIDENCE-023" && connectionEvidence.problemIds.join("|") === "UP-605|UP-315", "RC50 structural connection changed.");
assert(connectionEvidence.variableMapping.length === 5 && connectionEvidence.holdsWhen.length === 5 && connectionEvidence.breaksWhen.length === 5, "RC50 connection boundary incomplete.");
assert(connectionEvidence.validationStatus.includes("Physical acquisitions: 0"), "RC50 connection physical boundary weakened.");
const integrated = readJson("research/reproducibility/rc50-compositional-receipts-cycle-result.json");
assert(integrated.precommit.gitCommit === "7354dda" && integrated.verifiedFindings.length === 10 && integrated.hypothesisAdjudication.length === 5, "RC50 integrated findings or hypotheses incomplete.");
assert(integrated.workPackages.length === 5 && integrated.failedAttempts.length === 6 && integrated.unresolved.length === 6, "RC50 work program or uncertainty record incomplete.");
assert(integrated.newSolutionPath.status.includes("not claimed as a new cryptographic primitive") && integrated.nextCycleStart.startsWith("RC51 should move only"), "RC50 novelty or next-cycle boundary weakened.");

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 48 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-50");
assert(cycle?.problemIds.join("|") === "UP-605|UP-315" && cycle.connectionIds.join("|") === "CONN-EVIDENCE-023", "RC50 public scope changed.");
assert(cycle.verifiedFindings.length === 11 && cycle.resultMatrix.rows.length === 13 && cycle.artifacts.length === 15 && cycle.log.length === 11, "RC50 public cycle record incomplete.");
for (const item of cycle.artifacts) assert(fs.existsSync(path.join(root, item.url)), `Missing RC50 artifact: ${item.url}`);
const connection = connections.find(item => item.id === "CONN-EVIDENCE-023");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|"), "RC50 public connection scope changed.");
for (const field of ["sharedBottleneck", "mapping", "transfer", "minimumTest", "failureBoundary", "evidence", "validationStatus"]) assert(connection[field]?.text && connection[field]?.textEn, `RC50 public connection missing ${field}.`);
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 5 && record.sourceIds.length === 11, `${id}: RC50 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    const minimumKo = field === "role" ? 80 : 300;
    const minimumEn = field === "role" ? 120 : 600;
    assert(record[field].text.length > minimumKo && record[field].textEn.length > minimumEn, `${id}: RC50 ${field} is not substantive and bilingual.`);
  }
}
for (const id of ["rfc_cbor_8949_2020", "rfc_cose_9052_2022", "rfc_cose_countersignatures_9338_2022", "rfc_ct_9162_2021", "rfc_cose_typ_9596_2024", "rfc_cwt_cose_headers_9597_2024", "rfc_cose_receipts_9942_2026", "rfc_scitt_9943_2026", "iana_cose_registry_2026"]) {
  assert(sources[id]?.reviewedOn === "2026-08-25" && /^https:\/\//.test(sources[id].url), `RC50 source missing: ${id}`);
}
assert(sources.rfc_cose_9052_2022.resultPeriod.includes("Standards Track") && !sources.rfc_cose_9052_2022.resultPeriod.includes("Internet Standard"), "RFC 9052 public status is incorrect.");
assert(Object.keys(sources).length === 289 && cycles.length === 50 && connections.length === 53, "RC50 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 160, "RC50 research-record count changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).includes("research-cycle-50-data.js"), `${page} does not load RC50.`);
assert(read("research-log.js").includes("cycleWindowStart") && read("research-log.js").includes("slice(cycleWindowStart, cycleWindowStart + 9)"), "Research-log cycle navigation is not bounded around the current record.");
assert(read("research-log.html").includes("research-log.js?v=20260825-cycle50"), "Research-log cache version was not advanced for the bounded navigator.");
const publicText = read("research-cycle-50-data.js");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추", "분량 목표"]) assert(!publicText.includes(phrase), `RC50 contains forbidden wording: ${phrase}`);
const packageJson = read("package.json");
for (const script of ["run-rc50-compositional-receipts.mjs", "independent_rc50_compositional_receipts.py", "standalone_rc50_cose_wire_verifier.py", "adjudicate-rc50-compositional-receipts.mjs", "verify-rc50-compositional-receipts-cycle.mjs"]) assert(packageJson.includes(script), `package.json missing RC50 script: ${script}`);
assert(read("sitemap.xml").includes("RC-2026-50&amp;lang=ko") && read("sitemap.xml").includes("RC-2026-50&amp;lang=en"), "RC50 is missing from sitemap.xml.");
assert(read("README.md").includes("RC50 compositional") || (read("README.md").includes("Composite lineage") && read("README.md").includes("rc50-compositional-receipts-precommit.json")), "README RC50 artifact record missing.");
console.log("RC50 verified: 27 exact composites, 3 causal sets, 7 refusals, 2 state rejections, 2 witness-boundary cases, 63 scientific comparisons, and 81 wire checks.");
