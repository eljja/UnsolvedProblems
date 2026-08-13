import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const RESULT_PATH = path.join(REPRO, "rc37-outbox-sink-confirmation-result.json");
const HISTORY_PATH = path.join(REPRO, "rc37-outbox-sink-confirmation-history.json");
const OUT = path.join(REPRO, "rc37-outbox-sink-confirmation-independent-audit.json");
const result = JSON.parse(fs.readFileSync(RESULT_PATH, "utf8"));
const historyDocument = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
const ACK_KEY = Buffer.from("726333372d73796e7468657469632d726563656970742d6b65792d6e6f742d70726f64", "hex");
const checks = [];
const check = (name, pass, evidence) => checks.push({ name, pass: Boolean(pass), evidence });

function expectedReceipt(kind, identifier, digest, status) {
  return crypto.createHmac("sha256", ACK_KEY).update(`RC37-${kind}-V1\0${identifier}\0${digest}\0${status}`).digest("hex");
}

function readReceiver(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const integrity = db.prepare("PRAGMA integrity_check").all();
  const deliveries = db.prepare("SELECT delivery_id AS deliveryId,outcome_sha256 AS outcomeSha256,event_id AS eventId FROM deliveries ORDER BY delivery_id").all();
  const outbox = db.prepare("SELECT event_id AS eventId,delivery_id AS deliveryId,outcome_sha256 AS outcomeSha256,status FROM outbox ORDER BY event_id").all();
  db.close();
  return { integrity, deliveries, outbox };
}

function readSink(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const integrity = db.prepare("PRAGMA integrity_check").all();
  const inbox = db.prepare("SELECT event_id AS eventId,outcome_sha256 AS outcomeSha256 FROM sink_inbox ORDER BY event_id").all();
  const effects = db.prepare("SELECT effect_id AS effectId,event_id AS eventId,outcome_sha256 AS outcomeSha256 FROM sink_effects ORDER BY effect_id").all();
  db.close();
  return { integrity, inbox, effects };
}

const reconstructed = {};
for (const item of result.cases) {
  const receiver = readReceiver(path.join(ROOT, item.receiverDb));
  const sink = readSink(path.join(ROOT, item.sinkDb));
  reconstructed[item.name] = { receiver, sink };
  check(`${item.name}-receiver-sqlite-integrity`, receiver.integrity.length === 1 && receiver.integrity[0].integrity_check === "ok", receiver.integrity);
  check(`${item.name}-sink-sqlite-integrity`, sink.integrity.length === 1 && sink.integrity[0].integrity_check === "ok", sink.integrity);
  const delivery = receiver.deliveries[0];
  const outbox = receiver.outbox[0];
  const inbox = sink.inbox[0];
  const effect = sink.effects[0];
  const chainPass = receiver.deliveries.length === 1 && receiver.outbox.length === 1 && sink.inbox.length === 1 && sink.effects.length === 1 && outbox.status === "delivered" && delivery.eventId === outbox.eventId && outbox.eventId === inbox.eventId && inbox.eventId === effect.eventId && delivery.outcomeSha256 === outbox.outcomeSha256 && outbox.outcomeSha256 === inbox.outcomeSha256 && inbox.outcomeSha256 === effect.outcomeSha256;
  check(`${item.name}-end-to-end-row-chain`, chainPass, { delivery, outbox, inbox, effect });
}

const byName = Object.fromEntries(result.cases.map(item => [item.name, item]));
check("receiver-precommit-reconstructed", byName["receiver-before-commit"].first === null && byName["receiver-before-commit"].retry.status === 201 && byName["receiver-before-commit"].replay.status === 200, byName["receiver-before-commit"]);
check("receiver-postcommit-reconstructed", byName["receiver-after-commit"].first === null && byName["receiver-after-commit"].retry.status === 200 && byName["receiver-after-commit"].replay.status === 200, byName["receiver-after-commit"]);
check("sink-precommit-reconstructed", byName["sink-before-commit"].pendingAfterFault.events.length === 1 && byName["sink-before-commit"].retryRelay.output.sink.status === 201, byName["sink-before-commit"]);
check("sink-postcommit-reconstructed", byName["sink-after-commit"].pendingAfterFault.events.length === 1 && byName["sink-after-commit"].retryRelay.output.sink.status === 200, byName["sink-after-commit"]);
check("relay-crash-reconstructed", byName["relay-after-sink-response"].firstRelay.exitCode === 103 && byName["relay-after-sink-response"].pendingAfterFault.events.length === 1 && byName["relay-after-sink-response"].sinkAfterFault.effects.length === 1 && byName["relay-after-sink-response"].retryRelay.output.sink.status === 200, byName["relay-after-sink-response"]);
check("receiver-ack-loss-reconstructed", byName["receiver-ack-after-commit"].firstRelay.exitCode === 105 && byName["receiver-ack-after-commit"].pendingAfterRestart.events.length === 0 && byName["receiver-ack-after-commit"].retryRelay.output.status === "empty", byName["receiver-ack-after-commit"]);
check("fifty-duplicate-denominator", byName["duplicate-conflict-50"].duplicateCounts.created === 1 && byName["duplicate-conflict-50"].duplicateCounts.replay === 49 && byName["duplicate-conflict-50"].duplicateCounts.missing === 0, byName["duplicate-conflict-50"].duplicateCounts);
check("conflict-invalid-controls", byName["duplicate-conflict-50"].conflict.status === 409 && byName["duplicate-conflict-50"].invalidId.status === 400 && byName["duplicate-conflict-50"].invalidDigest.status === 400 && reconstructed["duplicate-conflict-50"].sink.effects.length === 1, { conflict: byName["duplicate-conflict-50"].conflict, invalidId: byName["duplicate-conflict-50"].invalidId, invalidDigest: byName["duplicate-conflict-50"].invalidDigest });

const receiptChecks = [];
for (const event of historyDocument.history.filter(item => item.type === "http" && item.response?.body?.receipt)) {
  const body = event.response.body;
  const kind = event.label === "receiver-delivery" ? "RECEIVER" : event.label === "sink-event" ? "SINK" : "OUTBOX";
  const identifier = kind === "RECEIVER" ? body.deliveryId : body.eventId;
  receiptChecks.push({ kind, identifier, pass: body.receipt === expectedReceipt(kind, identifier, body.outcomeSha256, body.status) });
}
for (const event of historyDocument.history.filter(item => item.type === "relay")) {
  const sink = event.output?.sink?.body;
  if (sink?.receipt) receiptChecks.push({ kind: "SINK", identifier: sink.eventId, pass: sink.receipt === expectedReceipt("SINK", sink.eventId, sink.outcomeSha256, sink.status) });
  const receiver = event.output?.receiver?.body;
  if (receiver?.receipt) receiptChecks.push({ kind: "OUTBOX", identifier: receiver.eventId, pass: receiver.receipt === expectedReceipt("OUTBOX", receiver.eventId, receiver.outcomeSha256, receiver.status) });
}
check("all-synthetic-receipts-authenticate", receiptChecks.length > 0 && receiptChecks.every(item => item.pass), { verified: receiptChecks.length, failed: receiptChecks.filter(item => !item.pass) });
check("history-result-event-count", historyDocument.history.length === result.historyEvents, { history: historyDocument.history.length, result: result.historyEvents });
check("claim-boundary-explicit", result.implementation.physicalHosts === 1 && result.implementation.simultaneousServiceProcesses === 3 && result.boundary.doesNotQualify.includes("a physical actuator, payment, email, or third-party API side effect") && result.boundary.doesNotQualify.includes("multiple physical hosts"), result.boundary);

const audit = {
  cycle: "RC-2026-37",
  auditor: "independent Node SQLite, history, denominator, and HMAC reconstruction",
  computedOn: "2026-08-14",
  resultSha256: crypto.createHash("sha256").update(fs.readFileSync(RESULT_PATH)).digest("hex"),
  historySha256: crypto.createHash("sha256").update(fs.readFileSync(HISTORY_PATH)).digest("hex"),
  checks,
  passed: checks.filter(item => item.pass).length,
  total: checks.length,
  qualifies: checks.every(item => item.pass)
};
fs.writeFileSync(OUT, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`RC37 independent outbox-sink audit: ${audit.passed}/${audit.total}`);
if (!audit.qualifies) process.exitCode = 1;
