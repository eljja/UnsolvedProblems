import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative));
const readJson = relative => JSON.parse(read(relative).toString("utf8"));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha = relative => crypto.createHash("sha256").update(read(relative)).digest("hex");

const precommit = readJson("research/reproducibility/rc37-outbox-sink-precommit.json");
const amend11 = readJson("research/reproducibility/rc37-outbox-sink-model-amendment-1.1.json");
const amend12 = readJson("research/reproducibility/rc37-outbox-sink-model-amendment-1.2.json");
assert(precommit.precommitId === "RC37-OUTBOX-SINK-PRECOMMIT-V1" && precommit.resultStateAtSeal.includes("No model result"), "RC37 precommit is not sealed before results.");
for (const [file, hash] of Object.entries(precommit.codeHashes)) {
  if (file === "scripts/run-rc37-outbox-sink-model.mjs" || file === "scripts/independent_rc37_outbox_sink_model_audit.py") continue;
  assert(sha(file) === hash, `RC37 frozen implementation changed: ${file}`);
}
assert(sha(amend11.firstRun.artifact) === amend11.firstRun.sha256 && amend11.firstRun.uniqueQualifiers.length === 0, "RC37 first model failure is not preserved.");
assert(sha("scripts/run-rc37-outbox-sink-model.mjs") === amend11.codeHashAfter, "RC37 amended JavaScript model hash changed.");
assert(sha(amend12.firstAudit.artifact) === amend12.firstAudit.sha256 && amend12.firstAudit.score === "30/32", "RC37 first Python audit failure is not preserved.");
assert(sha("scripts/independent_rc37_outbox_sink_model_audit.py") === amend12.codeHashAfter, "RC37 amended Python audit hash changed.");

const model = readJson("research/reproducibility/rc37-outbox-sink-model-result.json");
const modelAudit = readJson("research/reproducibility/rc37-outbox-sink-model-python-audit.json");
assert(model.protocols.map(item => item.states).join("|") === "13|9|28|10" && model.protocols.map(item => item.transitions).join("|") === "20|11|56|16", "RC37 model graph changed.");
assert(model.protocols[0].invariants.M1_no_crash_stable_receiver_orphan.counterexample.trace.length === 2, "RC37 dual-write orphan changed.");
assert(model.protocols[1].invariants.M4_delivered_outbox_implies_sink_commit.counterexample.trace.length === 2, "RC37 early-ack counterexample changed.");
assert(model.protocols[2].invariants.M2_sink_effect_at_most_once.counterexample.trace.length === 3, "RC37 non-idempotent counterexample changed.");
assert(model.gate.pass && model.gate.uniqueQualifier.join("|") === "ATOMIC_OUTBOX_IDEMPOTENT_SINK" && model.protocols[3].qualifies, "RC37 atomic outbox-sink chain no longer uniquely qualifies.");
assert(modelAudit.qualifies && modelAudit.passed === 32 && modelAudit.total === 32, "RC37 independent model audit incomplete.");

const result = readJson("research/reproducibility/rc37-outbox-sink-confirmation-result.json");
const history = readJson("research/reproducibility/rc37-outbox-sink-confirmation-history.json");
const audit = readJson("research/reproducibility/rc37-outbox-sink-confirmation-independent-audit.json");
assert(result.qualifies && Object.values(result.criteria).every(Boolean) && result.cases.length === 7 && result.historyEvents === 113 && history.history.length === 113, "RC37 confirmation no longer qualifies.");
const byName = Object.fromEntries(result.cases.map(item => [item.name, item]));
assert(byName["receiver-before-commit"].retry.status === 201 && byName["receiver-after-commit"].retry.status === 200, "RC37 receiver crash boundaries changed.");
assert(byName["sink-before-commit"].pendingAfterFault.events.length === 1 && byName["sink-before-commit"].retryRelay.output.sink.status === 201, "RC37 sink pre-commit boundary changed.");
assert(byName["sink-after-commit"].pendingAfterFault.events.length === 1 && byName["sink-after-commit"].retryRelay.output.sink.status === 200, "RC37 sink post-commit boundary changed.");
assert(byName["relay-after-sink-response"].firstRelay.exitCode === 103 && byName["relay-after-sink-response"].retryRelay.output.sink.status === 200, "RC37 relay crash boundary changed.");
assert(byName["receiver-ack-after-commit"].pendingAfterRestart.events.length === 0, "RC37 delivered-ack boundary changed.");
const duplicate = byName["duplicate-conflict-50"];
assert(duplicate.duplicateCounts.created === 1 && duplicate.duplicateCounts.replay === 49 && duplicate.duplicateCounts.missing === 0 && duplicate.conflict.status === 409 && duplicate.invalidId.status === 400 && duplicate.invalidDigest.status === 400, "RC37 duplicate or control denominator changed.");
assert(result.implementation.physicalHosts === 1 && result.implementation.simultaneousServiceProcesses === 3 && result.boundary.doesNotQualify.includes("a physical actuator, payment, email, or third-party API side effect"), "RC37 physical boundary overstated.");
assert(audit.qualifies && audit.passed === 32 && audit.total === 32, "RC37 independent confirmation audit incomplete.");
for (const item of result.cases) {
  const receiver = new DatabaseSync(path.join(root, item.receiverDb), { readOnly: true });
  const sink = new DatabaseSync(path.join(root, item.sinkDb), { readOnly: true });
  const ri = receiver.prepare("PRAGMA integrity_check").get().integrity_check;
  const si = sink.prepare("PRAGMA integrity_check").get().integrity_check;
  const delivery = receiver.prepare("SELECT delivery_id AS deliveryId,outcome_sha256 AS digest,event_id AS eventId FROM deliveries").get();
  const outbox = receiver.prepare("SELECT event_id AS eventId,outcome_sha256 AS digest,status FROM outbox").get();
  const inbox = sink.prepare("SELECT event_id AS eventId,outcome_sha256 AS digest FROM sink_inbox").get();
  const effect = sink.prepare("SELECT event_id AS eventId,outcome_sha256 AS digest FROM sink_effects").get();
  receiver.close(); sink.close();
  assert(ri === "ok" && si === "ok" && outbox.status === "delivered" && delivery.eventId === outbox.eventId && outbox.eventId === inbox.eventId && inbox.eventId === effect.eventId && delivery.digest === outbox.digest && outbox.digest === inbox.digest && inbox.digest === effect.digest, `RC37 database chain changed: ${item.name}`);
}

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 35 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-37");
assert(cycle?.problemIds.join("|") === "UP-605|UP-602|UP-315" && cycle?.connectionIds.join("|") === "CONN-ATTESTATION-010", "RC37 public scope changed.");
assert(cycle.verifiedFindings.length === 17 && cycle.resultMatrix.rows.length === 18 && cycle.artifacts.length === 18 && cycle.log.length === 16, "RC37 public record incomplete.");
assert(cycle.nextCycle.text.includes("HIL counter") && cycle.nextCycle.textEn.includes("HIL counter"), "RC37 next starting point is not exact.");
for (const artifact of cycle.artifacts) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC37 artifact: ${artifact.url}`);
const connection = connections.find(item => item.id === "CONN-ATTESTATION-010");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 150 && connection.failureBoundary.textEn.length > 250, "RC37 structural connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length === 8, `${id}: RC37 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) assert(record[field].text.length > (field === "role" ? 35 : 100) && record[field].textEn.length > (field === "role" ? 70 : 180), `${id}: RC37 ${field} is not substantive and bilingual.`);
  for (const item of record.hypotheses) for (const field of ["claim", "prediction", "test", "reject"]) assert(item[field].text.length > 25 && item[field].textEn.length > 50, `${id}: RC37 hypothesis ${item.code} ${field} is not specific and bilingual.`);
}
for (const id of ["debezium_outbox_router_2026", "kafka_41_exactly_once_2026", "oasis_wsrm_11_2007", "helland_life_beyond_transactions_2007"]) assert(sources[id]?.reviewedOn === "2026-08-14" && /^https:\/\//.test(sources[id]?.url), `RC37 source ${id} missing or stale.`);
assert(Object.keys(sources).length === 234 && cycles.length === 37 && connections.length === 40, "RC37 cumulative counts changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 127, "RC37 curated-problem or record counts changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-37-data.js"), `${page} does not load RC37.`);
const publicText = read("research-cycle-37-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지"]) assert(!publicText.includes(phrase), `RC37 contains forbidden mechanical phrasing: ${phrase}`);
console.log("RC37 verified: 2/2/3-step protocol counterexamples, atomic model 32/32, seven two-database fault cases and 14 SQLite files audited 32/32; physical effect n=0.");
