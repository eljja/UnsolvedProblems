import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative));
const readJson = relative => JSON.parse(read(relative).toString("utf8"));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha = value => crypto.createHash("sha256").update(value).digest("hex");

const precommit = readJson("research/reproducibility/rc34-sealed-corpus-precommit.json");
const reveal = readJson("research/reproducibility/rc34-sealed-corpus-reveal.json");
assert(precommit.seedCommitment === reveal.seedCommitment && sha(Buffer.from(`RC34-CORPUS-SEED-V1:${reveal.seedHex}`)) === precommit.seedCommitment, "RC34 seed commitment mismatch.");
assert(reveal.packages.length === 100 && new Set(reveal.packages.map(item => item.id)).size === 100 && reveal.studies.map(item => item.events.length).join("|") === "100|110|120|130", "RC34 sealed corpus shape changed.");

const circl = readJson("research/reproducibility/rc34-circl-interop-result.json");
const circlAudit = readJson("research/reproducibility/rc34-circl-python-audit.json");
assert(circl.passed && circl.corpus.uniquePackages === 100 && circl.corpus.totalEventsPerMode === 460 && circl.library.version === "v1.6.4", "RC34 CIRCL result changed.");
assert(circl.metrics.length === 2 && circl.metrics.every(item => item.duplicateMatches === 60 && item.duplicateComparisons === 60 && item.differentPackageCollisions === 0 && item.crossStudyOutputEqualities === 0 && item.fullEvaluateMismatches === 0), "RC34 CIRCL metrics changed.");
assert(circl.negativeControls.deterministicReplay.includes("accepted") && circl.qualification.physicalPackages === "n=0", "RC34 primitive replay or physical boundary was overstated.");
assert(circlAudit.passed && circlAudit.aggregateChecksPassed === 14 && circlAudit.aggregateChecksTotal === 14 && circlAudit.batchResults.length === 8 && circlAudit.batchResults.reduce((sum, item) => sum + item.events, 0) === 920, "RC34 independent CIRCL audit incomplete.");

const relay = readJson("research/reproducibility/rc34-relay-linkage-result.json");
const relayAudit = readJson("research/reproducibility/rc34-relay-python-audit.json");
assert(relay.passed && relay.heldOutStudy === "STUDY-30" && relay.holdoutMetrics.protected.correct === 15 && relay.holdoutMetrics.protected.total === 130, "RC34 protected relay metric changed.");
assert(relay.holdoutMetrics.protected.accuracy <= relay.nullModel.p95Accuracy && relay.holdoutMetrics.unprotected.accuracy === 1 && relay.holdoutMetrics["stable-token-ablation"].correct === 128, "RC34 relay controls no longer separate.");
assert(relay.nullModel.simulations === 10000 && relayAudit.passed && relayAudit.aggregateChecksPassed === 11 && relayAudit.aggregateChecksTotal === 11, "RC34 relay audit incomplete.");

const resolver = readJson("research/reproducibility/rc34-resolver-race-result.json");
const resolverEvidence = readJson("research/reproducibility/rc34-resolver-race-evidence.json");
const receiptLedger = readJson("research/reproducibility/rc34-resolver-receipt-ledger.json");
const resolverAudit = readJson("research/reproducibility/rc34-resolver-python-audit.json");
assert(resolver.normalRace.attempts === 100 && resolver.normalRace.opened === 1 && resolver.normalRace.replay === 99 && resolver.passedChecks === resolver.totalChecks && resolver.totalChecks === 16, "RC34 resolver race changed.");
assert(resolver.crashRecovery.stateBeforeRecovery.claimExists && !resolver.crashRecovery.stateBeforeRecovery.receiptExists && !resolver.crashRecovery.stateBeforeRecovery.outcomeExists && resolver.crashRecovery.recoveryStatus === "recovered-opened-one", "RC34 crash recovery boundary changed.");
assert(resolverEvidence.normal.responses.length === 100 && receiptLedger.receipts.length === 2 && receiptLedger.inclusionProofs.length === 2 && receiptLedger.consistencyProof.oldSize === 1 && receiptLedger.consistencyProof.newSize === 2, "RC34 resolver evidence or receipt ledger incomplete.");
assert(resolverAudit.passed && resolverAudit.aggregateChecksPassed === 16 && resolverAudit.aggregateChecksTotal === 16 && resolverAudit.metrics.crashReleasedBeforeRecovery === false, "RC34 independent resolver audit incomplete.");

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 32 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-34");
assert(cycle?.problemIds.join("|") === "UP-602|UP-605|UP-625|UP-315" && cycle?.connectionIds.join("|") === "CONN-ATTESTATION-007", "RC34 public scope changed.");
assert(cycle.verifiedFindings.length === 17 && cycle.resultMatrix.rows.length === 16 && cycle.artifacts.length === 17 && cycle.log.length === 16, "RC34 public record incomplete.");
assert(cycle.nextCycle.text.includes("세 failure domain") && cycle.nextCycle.textEn.includes("three failure domains"), "RC34 next starting point is not exact.");
for (const artifact of cycle.artifacts) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC34 artifact: ${artifact.url}`);
const connection = connections.find(item => item.id === "CONN-ATTESTATION-007");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.validationStatus.text.length > 150, "RC34 structural connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length === 8, `${id}: RC34 hypotheses or sources incomplete.`);
  assert(record.role.text.length > 25 && record.role.textEn.length > 50, `${id}: RC34 role is not substantive and bilingual.`);
  for (const field of ["updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) assert(record[field].text.length > 65 && record[field].textEn.length > 110, `${id}: RC34 ${field} is not substantive and bilingual.`);
}
for (const id of ["cloudflare_circl_oprf_2026", "rfc_ohttp_9458_2024", "herlihy_wing_linearizability_1990"]) assert(sources[id]?.reviewedOn === "2026-08-14" && /^https:\/\//.test(sources[id]?.url), `RC34 source ${id} missing or stale.`);
assert(Object.keys(sources).length === 221 && cycles.length === 34 && connections.length === 37, "RC34 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 118, "RC34 curated-problem or research-record count changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-34-data.js"), `${page} does not load RC34.`);
const publicText = read("research-cycle-34-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지"]) assert(!publicText.includes(phrase), `RC34 contains forbidden mechanical phrasing: ${phrase}`);
console.log("RC34 verified: CIRCL 14/14 over 920 outputs; relay 15/130 below null p95 with controls; resolver 1 open / 99 replay and 16/16 crash-recovery audit; physical n=0.");
