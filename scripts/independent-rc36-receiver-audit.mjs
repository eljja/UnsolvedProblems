import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const result = JSON.parse(fs.readFileSync(path.join(REPRO, "rc36-receiver-confirmation-result.json"), "utf8"));
const historyDocument = JSON.parse(fs.readFileSync(path.join(REPRO, "rc36-receiver-confirmation-history.json"), "utf8"));
const SYNTHETIC_ACK_KEY = Buffer.from("726333362d73796e7468657469632d61636b2d6b65792d6e6f742d70726f64756374696f6e", "hex");
const checks = [];
const check = (name, pass, evidence) => checks.push({ name, pass: Boolean(pass), evidence });

function expectedReceipt(deliveryId, digest, status) {
  return crypto.createHmac("sha256", SYNTHETIC_ACK_KEY).update(`RC36-ACK-V1\0${deliveryId}\0${digest}\0${status}`).digest("hex");
}

for (const item of result.cases) {
  const dbPath = path.join(ROOT, item.db);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const deliveries = db.prepare("SELECT delivery_id AS deliveryId,outcome_sha256 AS outcomeSha256 FROM deliveries ORDER BY delivery_id").all();
  const effects = db.prepare("SELECT effect_id AS effectId,delivery_id AS deliveryId,outcome_sha256 AS outcomeSha256 FROM effects ORDER BY effect_id").all();
  const integrity = db.prepare("PRAGMA integrity_check").all();
  db.close();
  check(`${item.name}-sqlite-integrity`, integrity.length === 1 && integrity[0].integrity_check === "ok", integrity);
  check(`${item.name}-one-delivery-one-effect`, deliveries.length === 1 && effects.length === 1 && deliveries[0].deliveryId === effects[0].deliveryId && deliveries[0].outcomeSha256 === effects[0].outcomeSha256, { deliveries, effects });
}

const before = result.cases.find(item => item.name === "before-commit-crash");
const after = result.cases.find(item => item.name === "after-commit-crash");
const concurrent = result.cases.find(item => item.name === "concurrent-100");
check("before-commit-rolled-back", before.firstResponse === null && before.retry.status === 201 && before.replay.status === 200, before);
check("after-commit-survived", after.firstResponse === null && after.retry.status === 200 && after.replay.status === 200, after);
check("payload-conflicts-rejected", before.conflict.status === 409 && after.conflict.status === 409, { before: before.conflict, after: after.conflict });
check("concurrency-one-created", concurrent.created === 1 && concurrent.replay === 99, { created: concurrent.created, replay: concurrent.replay });
check("malformed-inputs-rejected", concurrent.invalidId.status === 400 && concurrent.invalidDigest.status === 400 && concurrent.finalState.effects.length === 1, { invalidId: concurrent.invalidId, invalidDigest: concurrent.invalidDigest });

const successfulResponses = historyDocument.history.filter(event => event.type === "request" && event.response?.body?.receipt);
check("all-acknowledgements-authenticate", successfulResponses.every(event => event.response.body.receipt === expectedReceipt(event.deliveryId, event.outcomeSha256, event.response.body.status)), { verified: successfulResponses.length });
const conflictEvents = historyDocument.history.filter(event => event.type === "request" && event.response?.status === 409);
check("conflicts-never-return-receipt", conflictEvents.length === 2 && conflictEvents.every(event => !event.response.body.receipt), conflictEvents.length);
check("history-result-event-count", historyDocument.history.length === result.historyEvents, { history: historyDocument.history.length, result: result.historyEvents });
check("claim-boundary-explicit", result.implementation.physicalHosts === 1 && result.boundary.doesNotQualify.includes("an effect outside SQLite") && result.boundary.doesNotQualify.includes("multiple physical hosts"), result.boundary);

const audit = {
  cycle: "RC-2026-36",
  auditor: "independent Node SQLite and history reconstruction",
  computedOn: "2026-08-14",
  resultSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(REPRO, "rc36-receiver-confirmation-result.json"))).digest("hex"),
  historySha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(REPRO, "rc36-receiver-confirmation-history.json"))).digest("hex"),
  checks,
  passed: checks.filter(item => item.pass).length,
  total: checks.length,
  qualifies: checks.every(item => item.pass)
};
fs.writeFileSync(path.join(REPRO, "rc36-receiver-confirmation-independent-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(`RC36 independent receiver audit: ${audit.passed}/${audit.total}`);
if (!audit.qualifies) process.exitCode = 1;

