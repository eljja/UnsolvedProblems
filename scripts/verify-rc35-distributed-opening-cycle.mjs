import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative));
const readJson = relative => JSON.parse(read(relative).toString("utf8"));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha = relative => crypto.createHash("sha256").update(read(relative)).digest("hex");

const modelPrecommit = readJson("research/reproducibility/rc35-distributed-opening-precommit.json");
const model = readJson("research/reproducibility/rc35-distributed-opening-model-result.json");
const modelAudit = readJson("research/reproducibility/rc35-distributed-opening-python-audit.json");
assert(model.precommitId === modelPrecommit.precommitId && model.modelKind.includes("finite abstract"), "RC35 model is not tied to its preregistration or boundary.");
assert(model.metrics.map(item => item.reachableStates).join("|") === "752|3620|752" && model.metrics.map(item => item.exploredTransitions).join("|") === "5264|24071|4862", "RC35 reachable graph changed.");
assert(model.metrics[0].invariants.S1_AT_MOST_ONE_RELEASE.minimalCounterexample.traceLength === 2 && model.metrics[1].invariants.S1_AT_MOST_ONE_RELEASE.minimalCounterexample.traceLength === 8, "RC35 minimal counterexamples changed.");
assert(Object.values(model.metrics[2].invariants).every(item => item.passed) && model.metrics[2].boundedRecovery.passed, "RC35 staged protocol no longer passes bounded safety and recovery.");
assert(model.deliveryIndistinguishability.serverObservationEqual && model.deliveryIndistinguishability.qualifyingPolicies === 0 && model.deliveryIndistinguishability.policies.every(item => !item.qualifiesExactlyOnceDelivery), "RC35 delivery boundary changed.");
assert(modelAudit.passed && modelAudit.aggregateChecksPassed === 10 && modelAudit.aggregateChecksTotal === 10, "RC35 independent finite-model audit incomplete.");

const confirmPrecommit = readJson("research/reproducibility/rc35-etcd-confirmatory-precommit.json");
assert(confirmPrecommit.status === "sealed-before-confirmatory-execution", "RC35 etcd confirmation is not sealed.");
assert(sha(confirmPrecommit.frozenImplementation.coordinator) === confirmPrecommit.frozenImplementation.coordinatorSha256, "RC35 frozen etcd coordinator changed.");
assert(sha(confirmPrecommit.frozenImplementation.independentAuditor) === confirmPrecommit.frozenImplementation.independentAuditorSha256, "RC35 frozen etcd auditor changed.");
for (const phase of ["exploratory", "confirmatory"]) {
  const result = readJson(`research/reproducibility/rc35-etcd-three-process-${phase}-result.json`);
  const history = readJson(`research/reproducibility/rc35-etcd-three-process-${phase}-history.json`);
  const audit = readJson(`research/reproducibility/rc35-etcd-three-process-${phase}-python-audit.json`);
  assert(result.runPhase === phase && history.runPhase === phase && audit.runPhase === phase, `RC35 ${phase} phase labels disagree.`);
  assert(result.implementation.release === "v3.7.1" && result.implementation.archiveSha256 === confirmPrecommit.software.windowsAmd64ArchiveSha256, `RC35 ${phase} official archive boundary changed.`);
  assert(result.implementation.processes === 3 && result.implementation.dataDirectories === 3 && result.implementation.physicalHosts === 1, `RC35 ${phase} topology changed.`);
  assert(result.qualifies && Object.values(result.criteria).every(Boolean) && result.historyEvents === 49 && history.history.length === 49, `RC35 ${phase} result no longer qualifies.`);
  assert(result.cases.length === 2 && result.cases.map(item => item.terminateAt).join("|") === "CLAIMED|RECEIPTED", `RC35 ${phase} failure positions changed.`);
  for (const item of result.cases) {
    assert(item.claimWinners === 1 && item.releaseCommitted && !item.retryReexecuted, `RC35 ${phase} ${item.terminateAt} state transition changed.`);
    assert(item.perReplica.length === 3 && item.perReplica.every(replica => replica.reads.stage.value === "RELEASED" && replica.reads.stage.version === 3 && replica.reads.receipt.version === 1 && replica.reads.outcome.version === 1), `RC35 ${phase} ${item.terminateAt} replicas do not converge.`);
  }
  assert(!result.minority.transactionSucceeded && !result.minority.keyPresentAfterHeal, `RC35 ${phase} minority write boundary changed.`);
  assert(audit.qualifies && audit.passed === 14 && audit.total === 14 && audit.eventCount === 49, `RC35 ${phase} independent history audit incomplete.`);
  assert(audit.historySha256 === crypto.createHash("sha256").update(read(`research/reproducibility/rc35-etcd-three-process-${phase}-history.json`)).digest("hex"), `RC35 ${phase} history changed after audit.`);
  assert(audit.resultSha256 === crypto.createHash("sha256").update(read(`research/reproducibility/rc35-etcd-three-process-${phase}-result.json`)).digest("hex"), `RC35 ${phase} result changed after audit.`);
}

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 33 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-35");
assert(cycle?.problemIds.join("|") === "UP-605|UP-602|UP-315" && cycle?.connectionIds.join("|") === "CONN-ATTESTATION-008", "RC35 public scope changed.");
assert(cycle.verifiedFindings.length === 16 && cycle.resultMatrix.rows.length === 15 && cycle.artifacts.length === 13 && cycle.log.length === 17, "RC35 public research record incomplete.");
assert(cycle.nextCycle.text.includes("세 독립 host") && cycle.nextCycle.textEn.includes("three independent hosts"), "RC35 next starting point is not exact.");
for (const artifact of cycle.artifacts) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC35 artifact: ${artifact.url}`);
const connection = connections.find(item => item.id === "CONN-ATTESTATION-008");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 180 && connection.failureBoundary.textEn.length > 250, "RC35 structural connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length === 6, `${id}: RC35 hypotheses or sources incomplete.`);
  assert(record.role.text.length > 35 && record.role.textEn.length > 70, `${id}: RC35 role is not substantive and bilingual.`);
  for (const field of ["updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) assert(record[field].text.length > 100 && record[field].textEn.length > 220, `${id}: RC35 ${field} is not substantive and bilingual.`);
  for (const item of record.hypotheses) {
    for (const field of ["claim", "prediction", "test", "reject"]) assert(item[field].text.length > 35 && item[field].textEn.length > 70, `${id}: RC35 hypothesis ${item.code} ${field} is not specific and bilingual.`);
  }
}
for (const id of ["raft_extended_2014", "etcd_api_v37_2026", "etcd_failure_modes_2023", "etcd_release_v371_2026", "lampson_reliable_messages_1993"]) assert(sources[id]?.reviewedOn === "2026-08-14" && /^https:\/\//.test(sources[id]?.url), `RC35 source ${id} missing or stale.`);
assert(Object.keys(sources).length === 226 && cycles.length === 35 && connections.length === 38, "RC35 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 121, "RC35 curated-problem or research-record count changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-35-data.js"), `${page} does not load RC35.`);
const publicText = read("research-cycle-35-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지"]) assert(!publicText.includes(phrase), `RC35 contains forbidden mechanical phrasing: ${phrase}`);
console.log("RC35 verified: finite model 752/3620/752 states with 2/8-step counterexamples; one-host etcd confirmation passes 14/14 history checks; multi-host, real partition, and external receiver remain open.");
