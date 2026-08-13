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

const precommit = readJson("research/reproducibility/rc36-receiver-delivery-precommit.json");
const modelAmend11 = readJson("research/reproducibility/rc36-receiver-model-amendment-1.1.json");
const modelAmend12 = readJson("research/reproducibility/rc36-receiver-model-amendment-1.2.json");
const confirmationAmend = readJson("research/reproducibility/rc36-receiver-confirmation-amendment-1.1.json");
assert(precommit.status === "sealed-before-any-model-or-confirmation-result", "RC36 precommit is not sealed.");
assert(readJson("research/reproducibility/rc36-receiver-model-first-failure.json").outcome === "implementation-failure-no-scientific-verdict", "RC36 initial model failure is not preserved.");
assert(readJson("research/reproducibility/rc36-receiver-confirmation-first-failure.json").concurrencyObservation.connectionFailuresBeforeApplicationResponse === 73, "RC36 first confirmation failure is not preserved.");
for (const amendment of [modelAmend11, modelAmend12]) for (const item of Object.values(amendment.amendedImplementations)) assert(sha(item.path) === item.sha256 || amendment === modelAmend11, `RC36 amended model hash changed: ${item.path}`);
assert(sha(modelAmend12.amendedImplementations.model.path) === modelAmend12.amendedImplementations.model.sha256 && sha(modelAmend12.amendedImplementations.modelAuditor.path) === modelAmend12.amendedImplementations.modelAuditor.sha256, "RC36 final model hashes changed.");
assert(sha(confirmationAmend.amendedReceiver.path) === confirmationAmend.amendedReceiver.sha256, "RC36 amended receiver hash changed.");
assert(sha(precommit.frozenImplementations.coordinator.path) === confirmationAmend.frozenUnchangedHashes.coordinator && sha(precommit.frozenImplementations.confirmationAuditor.path) === confirmationAmend.frozenUnchangedHashes.independentAuditor, "RC36 frozen coordinator or auditor changed.");

const model = readJson("research/reproducibility/rc36-receiver-state-model-result.json");
const modelAudit = readJson("research/reproducibility/rc36-receiver-state-model-python-audit.json");
assert(model.metrics.map(item => item.reachableStates).join("|") === "19|18|7" && model.metrics.map(item => item.exploredTransitions).join("|") === "22|22|6", "RC36 model graph changed.");
assert(model.metrics[0].invariants.R1_AT_MOST_ONE_EFFECT.minimalCounterexample.traceLength === 3 && model.metrics[1].invariants.R3_REPLAY_IMPLIES_EFFECT.minimalCounterexample.traceLength === 3, "RC36 minimal crash counterexamples changed.");
assert(Object.values(model.metrics[2].invariants).every(item => item.passed) && model.aggregateDecision.qualifyingProtocols.join("|") === "ATOMIC_INBOX_EFFECT", "RC36 atomic model no longer qualifies alone.");
assert(modelAudit.qualifies && modelAudit.passed === 18 && modelAudit.total === 18, "RC36 independent model audit incomplete.");

const result = readJson("research/reproducibility/rc36-receiver-confirmation-result.json");
const history = readJson("research/reproducibility/rc36-receiver-confirmation-history.json");
const audit = readJson("research/reproducibility/rc36-receiver-confirmation-independent-audit.json");
assert(result.qualifies && Object.values(result.criteria).every(Boolean) && result.historyEvents === 120 && history.history.length === 120, "RC36 final confirmation no longer qualifies.");
const before = result.cases.find(item => item.name === "before-commit-crash");
const after = result.cases.find(item => item.name === "after-commit-crash");
const concurrent = result.cases.find(item => item.name === "concurrent-100");
assert(before.retry.status === 201 && before.replay.status === 200 && before.snapshot.effects.length === 1, "RC36 pre-commit crash boundary changed.");
assert(after.retry.status === 200 && after.replay.status === 200 && after.snapshot.effects.length === 1, "RC36 post-commit crash boundary changed.");
assert(before.conflict.status === 409 && after.conflict.status === 409, "RC36 payload conflict boundary changed.");
assert(concurrent.created === 1 && concurrent.replay === 99 && concurrent.invalidId.status === 400 && concurrent.invalidDigest.status === 400 && concurrent.finalState.effects.length === 1, "RC36 concurrent or invalid-input result changed.");
assert(result.implementation.physicalHosts === 1 && result.boundary.doesNotQualify.includes("an effect outside SQLite"), "RC36 external-effect boundary overstated.");
assert(audit.qualifies && audit.passed === 15 && audit.total === 15, "RC36 independent receiver audit incomplete.");
for (const file of ["before-commit-crash.sqlite", "after-commit-crash.sqlite", "concurrent-100.sqlite"]) {
  const db = new DatabaseSync(path.join(root, "research", "reproducibility", "rc36-receiver-db", file), { readOnly: true });
  const integrity = db.prepare("PRAGMA integrity_check").get();
  const deliveries = db.prepare("SELECT count(*) AS count FROM deliveries").get().count;
  const effects = db.prepare("SELECT count(*) AS count FROM effects").get().count;
  db.close();
  assert(integrity.integrity_check === "ok" && deliveries === 1 && effects === 1, `RC36 database ${file} changed.`);
}

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 34 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-36");
assert(cycle?.problemIds.join("|") === "UP-605|UP-602|UP-315" && cycle?.connectionIds.join("|") === "CONN-ATTESTATION-009", "RC36 public scope changed.");
assert(cycle.verifiedFindings.length === 17 && cycle.resultMatrix.rows.length === 15 && cycle.artifacts.length === 18 && cycle.log.length === 17, "RC36 public record incomplete.");
assert(cycle.nextCycle.text.includes("durable outbox") && cycle.nextCycle.textEn.includes("durable outbox"), "RC36 next starting point is not exact.");
for (const artifact of cycle.artifacts) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC36 artifact: ${artifact.url}`);
const connection = connections.find(item => item.id === "CONN-ATTESTATION-009");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 150 && connection.failureBoundary.textEn.length > 250, "RC36 structural connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length === 6, `${id}: RC36 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) assert(record[field].text.length > (field === "role" ? 35 : 100) && record[field].textEn.length > (field === "role" ? 70 : 220), `${id}: RC36 ${field} is not substantive and bilingual.`);
  for (const item of record.hypotheses) for (const field of ["claim", "prediction", "test", "reject"]) assert(item[field].text.length > 30 && item[field].textEn.length > 65, `${id}: RC36 hypothesis ${item.code} ${field} is not specific and bilingual.`);
}
for (const id of ["http_rfc9110_2022", "sqlite_atomic_commit_2026", "sqlite_transactional_2026", "ietf_idempotency_key_draft07_2025"]) assert(sources[id]?.reviewedOn === "2026-08-14" && /^https:\/\//.test(sources[id]?.url), `RC36 source ${id} missing or stale.`);
assert(Object.keys(sources).length === 230 && cycles.length === 36 && connections.length === 39, "RC36 cumulative counts changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 124, "RC36 curated-problem or record counts changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-36-data.js"), `${page} does not load RC36.`);
const publicText = read("research-cycle-36-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지"]) assert(!publicText.includes(phrase), `RC36 contains forbidden mechanical phrasing: ${phrase}`);
console.log("RC36 verified: 3/3-step reordered-protocol counterexamples, atomic model 18/18, preserved 73-connection first failure, final receiver audit 15/15; external effect n=0.");
