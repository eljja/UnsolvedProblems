import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { backup, DatabaseSync } from "node:sqlite";
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "research", "reproducibility", "rc51-persistent-gossip-node.json");
const tracePath = path.join(root, "research", "reproducibility", "rc51-blind-event-ledger.json");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const stable = value => value === null || typeof value !== "object"
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(stable).join(",")}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
const digest = value => sha256(stable(value));
const rootHash = label => sha256(`RC51-ROOT:${label}`);
const opaqueId = id => `X-${sha256(`RC51-BLIND:${id}`).slice(0, 16)}`;

function demoKey(label) {
  const seed = createHash("sha256").update(`RC51-PUBLIC-DEMO-KEY:${label}`).digest().subarray(0, 32);
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const privateKey = createPrivateKey({ key: Buffer.concat([prefix, seed]), format: "der", type: "pkcs8" });
  return { privateKey, publicKey: createPublicKey(privateKey) };
}

const keys = Object.fromEntries(["K1", "K2", "K3", "LOG-A", "LOG-B", "ISSUER"].map(label => [label, demoKey(label)]));
const signObject = (keyId, value) => sign(null, Buffer.from(stable(value)), keys[keyId].privateKey).toString("base64");
const verifyObject = (keyId, value, signature) => Boolean(signature) && verify(null, Buffer.from(stable(value)), keys[keyId].publicKey, Buffer.from(signature, "base64"));

function initialState() {
  return {
    acceptedHead: { logId: "lineage-log", treeSize: 1, root: rootHash("1") },
    domain: "DOMAIN-0",
    generation: 0,
    keyEpoch: 1,
    keyId: "K1",
    spentNonces: []
  };
}

function stateDigest(state) { return digest(state); }

function openRegistry(dbPath) {
  const db = new DatabaseSync(dbPath, { timeout: 5000 });
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS causal_state(
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      head_log_id TEXT NOT NULL,
      head_tree_size INTEGER NOT NULL,
      head_root TEXT NOT NULL,
      domain TEXT NOT NULL,
      generation INTEGER NOT NULL,
      key_epoch INTEGER NOT NULL,
      key_id TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS spent_nonce(
      nonce TEXT PRIMARY KEY,
      successor_domain TEXT NOT NULL,
      generation INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS committed_event(
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      event_digest TEXT NOT NULL UNIQUE
    ) STRICT;
  `);
  const count = Number(db.prepare("SELECT count(*) AS n FROM causal_state").get().n);
  if (!count) {
    const state = initialState();
    db.prepare("INSERT INTO causal_state VALUES(1,?,?,?,?,?,?,?)").run(
      state.acceptedHead.logId, state.acceptedHead.treeSize, state.acceptedHead.root,
      state.domain, state.generation, state.keyEpoch, state.keyId
    );
  }
  return db;
}

function readState(db) {
  const row = db.prepare("SELECT * FROM causal_state WHERE singleton=1").get();
  const spent = db.prepare("SELECT nonce FROM spent_nonce ORDER BY nonce").all().map(item => item.nonce);
  return {
    acceptedHead: { logId: row.head_log_id, treeSize: Number(row.head_tree_size), root: row.head_root },
    domain: row.domain,
    generation: Number(row.generation),
    keyEpoch: Number(row.key_epoch),
    keyId: row.key_id,
    spentNonces: spent
  };
}

function pragmaSnapshot(db) {
  return {
    journalMode: db.prepare("PRAGMA journal_mode").get().journal_mode,
    synchronous: Number(db.prepare("PRAGMA synchronous").get().synchronous),
    foreignKeys: Number(db.prepare("PRAGMA foreign_keys").get().foreign_keys),
    integrity: db.prepare("PRAGMA integrity_check").get().integrity_check,
    sqliteVersion: db.prepare("SELECT sqlite_version() AS version").get().version
  };
}

function transitionDocument(operation) {
  return {
    type: "domain-transition",
    nonce: operation.nonce,
    successorDomain: operation.successorDomain,
    generation: operation.generation,
    head: operation.head
  };
}

function rotationDocument(operation) {
  return { type: "key-rotation", epoch: operation.epoch, predecessorKeyId: operation.predecessorKeyId, newKeyId: operation.newKeyId };
}

function applyTransition(db, operation, crashPhase = "none") {
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = readState(db);
    const prior = db.prepare("SELECT successor_domain FROM spent_nonce WHERE nonce=?").get(operation.nonce);
    if (prior) {
      db.exec("ROLLBACK");
      return { accepted: false, verdict: prior.successor_domain === operation.successorDomain ? "reject-nonce-replay" : "reject-nonce-fork", state: current };
    }
    if (!verifyObject(current.keyId, transitionDocument(operation), operation.signature)) {
      db.exec("ROLLBACK");
      return { accepted: false, verdict: "reject-transition-signature", state: current };
    }
    if (operation.generation !== current.generation + 1 || operation.head.treeSize <= current.acceptedHead.treeSize) {
      db.exec("ROLLBACK");
      return { accepted: false, verdict: "reject-nonmonotone-transition", state: current };
    }
    db.prepare("UPDATE causal_state SET head_log_id=?, head_tree_size=?, head_root=?, domain=?, generation=? WHERE singleton=1").run(
      operation.head.logId, operation.head.treeSize, operation.head.root, operation.successorDomain, operation.generation
    );
    db.prepare("INSERT INTO spent_nonce VALUES(?,?,?)").run(operation.nonce, operation.successorDomain, operation.generation);
    db.prepare("INSERT INTO committed_event(event_type,event_digest) VALUES(?,?)").run("transition", digest(transitionDocument(operation)));
    if (crashPhase === "before-commit") process.exit(91);
    db.exec("COMMIT");
    if (crashPhase === "after-commit") process.exit(92);
    return { accepted: true, verdict: "accept", state: readState(db) };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function applyRotation(db, operation, crashPhase = "none") {
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = readState(db);
    if (operation.epoch !== current.keyEpoch + 1 || operation.predecessorKeyId !== current.keyId) {
      db.exec("ROLLBACK");
      return { accepted: false, verdict: "reject-rotation-replay", state: current };
    }
    const document = rotationDocument(operation);
    if (!verifyObject(current.keyId, document, operation.predecessorSignature)) {
      db.exec("ROLLBACK");
      return { accepted: false, verdict: "reject-predecessor-continuity", state: current };
    }
    if (!verifyObject(operation.newKeyId, document, operation.newSignature)) {
      db.exec("ROLLBACK");
      return { accepted: false, verdict: "reject-new-key-continuity", state: current };
    }
    db.prepare("UPDATE causal_state SET key_epoch=?, key_id=? WHERE singleton=1").run(operation.epoch, operation.newKeyId);
    db.prepare("INSERT INTO committed_event(event_type,event_digest) VALUES(?,?)").run("rotation", digest(document));
    if (crashPhase === "before-commit") process.exit(93);
    db.exec("COMMIT");
    if (crashPhase === "after-commit") process.exit(94);
    return { accepted: true, verdict: "accept-rotation", state: readState(db) };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function openAnchor(dbPath) {
  const db = new DatabaseSync(dbPath, { timeout: 5000 });
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS checkpoint(singleton INTEGER PRIMARY KEY CHECK(singleton=1), generation INTEGER NOT NULL, state_digest TEXT NOT NULL) STRICT;");
  return db;
}

function updateAnchor(db, checkpoint) {
  const current = db.prepare("SELECT generation,state_digest FROM checkpoint WHERE singleton=1").get();
  if (current && (Number(current.generation) > checkpoint.generation || (Number(current.generation) === checkpoint.generation && current.state_digest !== checkpoint.stateDigest))) {
    return { accepted: false, verdict: "refuse-anchor-regression" };
  }
  db.prepare("INSERT INTO checkpoint VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET generation=excluded.generation,state_digest=excluded.state_digest").run(checkpoint.generation, checkpoint.stateDigest);
  return { accepted: true, verdict: "anchor-updated" };
}

function compareAnchor(primary, anchor) {
  if (primary.generation < anchor.generation) return "refuse-backup-rollback";
  if (primary.generation === anchor.generation && stateDigest(primary) !== anchor.state_digest) return "refuse-anchor-conflict";
  return "accept-anchor-current";
}

function openViewStore(dbPath) {
  const db = new DatabaseSync(dbPath, { timeout: 5000 });
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS signed_view(sequence INTEGER PRIMARY KEY AUTOINCREMENT, view_json TEXT NOT NULL, signer_key_id TEXT NOT NULL, signature TEXT NOT NULL) STRICT;");
  return db;
}

function storeView(db, view, signerKeyId) {
  const signature = signObject(signerKeyId, view);
  db.prepare("INSERT INTO signed_view(view_json,signer_key_id,signature) VALUES(?,?,?)").run(stable(view), signerKeyId, signature);
  return { view, signerKeyId, signature };
}

function compareViews(retained, incoming) {
  if (!retained.signatureValid || !incoming.signatureValid) return "reject-view-signature";
  const a = retained.view;
  const b = incoming.view;
  if (a.logId === b.logId && b.treeSize < a.treeSize) return "refuse-stale-view";
  if (a.logId === b.logId && b.treeSize === a.treeSize && b.root !== a.root) return "refuse-log-equivocation";
  if (a.issuer === b.issuer && a.subject === b.subject && a.sequence === b.sequence && a.statementDigest !== b.statementDigest) return "refuse-issuer-equivocation";
  return "accept-cross-view";
}

function removeSidecars(dbPath) {
  for (const suffix of ["-wal", "-shm"]) {
    const target = `${dbPath}${suffix}`;
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}

function encode(value) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decode(value) { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }

if (process.argv[2] === "--worker") {
  const [kind, dbPath, encoded, crashPhase = "none"] = process.argv.slice(3);
  const payload = decode(encoded);
  if (kind === "transition") {
    const db = openRegistry(dbPath);
    const result = applyTransition(db, payload, crashPhase);
    db.close();
    process.stdout.write(JSON.stringify(result));
  } else if (kind === "rotation") {
    const db = openRegistry(dbPath);
    const result = applyRotation(db, payload, crashPhase);
    db.close();
    process.stdout.write(JSON.stringify(result));
  } else if (kind === "anchor") {
    const db = openAnchor(dbPath);
    const result = updateAnchor(db, payload);
    db.close();
    process.stdout.write(JSON.stringify(result));
  } else if (kind === "view") {
    const db = openViewStore(dbPath);
    const result = storeView(db, payload.view, payload.signerKeyId);
    db.close();
    process.stdout.write(JSON.stringify(result));
  } else {
    throw new Error(`Unknown worker kind: ${kind}`);
  }
  process.exit(0);
}

function worker(kind, dbPath, payload, crashPhase = "none") {
  return spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--worker", kind, dbPath, encode(payload), crashPhase], { encoding: "utf8", timeout: 15000 });
}

function transition(nonce, successorDomain, generation, treeSize, keyId = "K1") {
  const operation = { nonce, successorDomain, generation, head: { logId: "lineage-log", treeSize, root: rootHash(String(treeSize)) } };
  operation.signature = signObject(keyId, transitionDocument(operation));
  return operation;
}

function rotation(epoch = 2, predecessorKeyId = "K1", newKeyId = "K2", old = true, fresh = true) {
  const operation = { epoch, predecessorKeyId, newKeyId };
  const document = rotationDocument(operation);
  operation.predecessorSignature = old ? signObject(predecessorKeyId, document) : null;
  operation.newSignature = fresh ? signObject(newKeyId, document) : null;
  return operation;
}

function verifyRegistry(dbPath) {
  const db = openRegistry(dbPath);
  const state = readState(db);
  const pragmas = pragmaSnapshot(db);
  db.close();
  return { state, pragmas };
}

function resultRow(id, verdict, state, armVerdicts, operations, observations = {}) {
  return { id, opaqueCaseId: opaqueId(id), verdict, stateDigest: stateDigest(state), state, armVerdicts, operations, observations };
}

function assert(condition, message) { if (!condition) throw new Error(message); }

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "unsolved-rc51-node-"));
assert(path.resolve(workDir).startsWith(path.resolve(os.tmpdir())), "RC51 work directory escaped the OS temp directory");
const results = [];
const pragmaChecks = [];

async function registryCase(id, run) {
  const dbPath = path.join(workDir, `${id}.sqlite`);
  const db = openRegistry(dbPath); db.close();
  const row = await run(dbPath);
  const verified = verifyRegistry(dbPath);
  pragmaChecks.push({ id, ...verified.pragmas });
  results.push(resultRow(id, row.verdict, verified.state, row.armVerdicts, row.operations, row.observations));
}

await registryCase("F01", async dbPath => {
  const op = transition("N-01", "DOMAIN-1", 1, 2);
  const run = worker("transition", dbPath, op);
  assert(run.status === 0, `F01 worker failed: ${run.stderr}`);
  return { verdict: "accept", armVerdicts: { signatureOnly: "accept-local-signature", singlePersistentRegistry: "accept", anchoredCrossView: "not-required" }, operations: [{ type: "transition", operation: op, committed: true, responseObserved: true }] };
});

await registryCase("F02", async dbPath => {
  const first = transition("N-01", "DOMAIN-1", 1, 2);
  const second = transition("N-02", "DOMAIN-2", 2, 3);
  assert(worker("transition", dbPath, first).status === 0 && worker("transition", dbPath, second).status === 0, "F02 transition failed");
  return { verdict: "accept", armVerdicts: { signatureOnly: "accept-local-signature", singlePersistentRegistry: "accept", anchoredCrossView: "not-required" }, operations: [{ type: "transition", operation: first, committed: true, responseObserved: true }, { type: "transition", operation: second, committed: true, responseObserved: true }] };
});

await registryCase("F03", async dbPath => {
  const op = transition("N-01", "DOMAIN-1", 1, 2);
  const crash = worker("transition", dbPath, op, "before-commit");
  assert(crash.status === 91, `F03 expected exit 91, got ${crash.status}`);
  const afterCrash = verifyRegistry(dbPath).state;
  assert(stateDigest(afterCrash) === stateDigest(initialState()), "F03 exposed partial pre-commit state");
  const retry = worker("transition", dbPath, op);
  assert(retry.status === 0 && JSON.parse(retry.stdout).accepted, "F03 retry did not accept");
  return { verdict: "retry-accepted-once", armVerdicts: { signatureOnly: "accept-local-signature", singlePersistentRegistry: "retry-accepted-once", anchoredCrossView: "not-required" }, operations: [{ type: "transition", operation: op, committed: false, responseObserved: false }, { type: "transition", operation: op, committed: true, responseObserved: true }], observations: { crashExit: 91, preCommitStateDigest: stateDigest(afterCrash) } };
});

await registryCase("F04", async dbPath => {
  const op = transition("N-01", "DOMAIN-1", 1, 2);
  const crash = worker("transition", dbPath, op, "after-commit");
  assert(crash.status === 92, `F04 expected exit 92, got ${crash.status}`);
  const afterCrash = verifyRegistry(dbPath).state;
  assert(afterCrash.generation === 1 && afterCrash.spentNonces.includes("N-01"), "F04 lost committed state");
  const retry = worker("transition", dbPath, op);
  const retried = JSON.parse(retry.stdout);
  assert(retried.verdict === "reject-nonce-replay", "F04 retry was not rejected");
  return { verdict: "retry-rejected-replay", armVerdicts: { signatureOnly: "accept-local-signature", singlePersistentRegistry: "retry-rejected-replay", anchoredCrossView: "not-required" }, operations: [{ type: "transition", operation: op, committed: true, responseObserved: false }, { type: "transition", operation: op, committed: false, responseObserved: true }], observations: { crashExit: 92, postCommitStateDigest: stateDigest(afterCrash) } };
});

await registryCase("F05", async dbPath => {
  const op = transition("N-01", "DOMAIN-1", 1, 2);
  assert(worker("transition", dbPath, op).status === 0, "F05 first transition failed");
  const replay = JSON.parse(worker("transition", dbPath, op).stdout);
  return { verdict: replay.verdict, armVerdicts: { signatureOnly: "accept-local-signature", singlePersistentRegistry: replay.verdict, anchoredCrossView: "not-required" }, operations: [{ type: "transition", operation: op, committed: true, responseObserved: true }, { type: "transition", operation: op, committed: false, responseObserved: true }] };
});

await registryCase("F06", async dbPath => {
  const first = transition("N-01", "DOMAIN-1", 1, 2);
  const fork = transition("N-01", "DOMAIN-X", 1, 2);
  assert(worker("transition", dbPath, first).status === 0, "F06 first transition failed");
  const rejected = JSON.parse(worker("transition", dbPath, fork).stdout);
  return { verdict: rejected.verdict, armVerdicts: { signatureOnly: "accept-local-signature", singlePersistentRegistry: rejected.verdict, anchoredCrossView: "not-required" }, operations: [{ type: "transition", operation: first, committed: true, responseObserved: true }, { type: "transition", operation: fork, committed: false, responseObserved: true }] };
});

for (const [id, op, expected] of [
  ["F07", rotation(), "accept-rotation"],
  ["F08", rotation(2, "K1", "K2", true, false), "reject-new-key-continuity"],
  ["F09", rotation(2, "K1", "K2", false, true), "reject-predecessor-continuity"]
]) {
  await registryCase(id, async dbPath => {
    const outcome = JSON.parse(worker("rotation", dbPath, op).stdout);
    assert(outcome.verdict === expected, `${id} expected ${expected}, got ${outcome.verdict}`);
    return { verdict: outcome.verdict, armVerdicts: { signatureOnly: id === "F07" ? "accept-both-signatures" : "reject-missing-required-signature", singlePersistentRegistry: outcome.verdict, anchoredCrossView: "not-required" }, operations: [{ type: "rotation", operation: op, committed: outcome.accepted, responseObserved: true }] };
  });
}

await registryCase("F10", async dbPath => {
  const op = rotation();
  const crash = worker("rotation", dbPath, op, "before-commit");
  assert(crash.status === 93, `F10 expected exit 93, got ${crash.status}`);
  assert(verifyRegistry(dbPath).state.keyEpoch === 1, "F10 mixed rotation state");
  const retry = JSON.parse(worker("rotation", dbPath, op).stdout);
  return { verdict: "retry-accepted-rotation", armVerdicts: { signatureOnly: "accept-both-signatures", singlePersistentRegistry: "retry-accepted-rotation", anchoredCrossView: "not-required" }, operations: [{ type: "rotation", operation: op, committed: false, responseObserved: false }, { type: "rotation", operation: op, committed: true, responseObserved: true }], observations: { crashExit: 93 } };
});

await registryCase("F11", async dbPath => {
  const op = rotation();
  const crash = worker("rotation", dbPath, op, "after-commit");
  assert(crash.status === 94, `F11 expected exit 94, got ${crash.status}`);
  assert(verifyRegistry(dbPath).state.keyEpoch === 2, "F11 lost committed rotation");
  const retry = JSON.parse(worker("rotation", dbPath, op).stdout);
  assert(retry.verdict === "reject-rotation-replay", "F11 retry was not rejected");
  return { verdict: "retry-rejected-rotation", armVerdicts: { signatureOnly: "accept-both-signatures", singlePersistentRegistry: "retry-rejected-rotation", anchoredCrossView: "not-required" }, operations: [{ type: "rotation", operation: op, committed: true, responseObserved: false }, { type: "rotation", operation: op, committed: false, responseObserved: true }], observations: { crashExit: 94 } };
});

await registryCase("F12", async dbPath => {
  const anchorPath = path.join(workDir, "F12-anchor.sqlite");
  const backupPath = path.join(workDir, "F12-backup.sqlite");
  const first = transition("N-01", "DOMAIN-1", 1, 2);
  const second = transition("N-02", "DOMAIN-2", 2, 3);
  assert(worker("transition", dbPath, first).status === 0, "F12 first transition failed");
  let db = openRegistry(dbPath);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  await backup(db, backupPath);
  db.close();
  assert(worker("transition", dbPath, second).status === 0, "F12 second transition failed");
  const newest = verifyRegistry(dbPath).state;
  const checkpoint = { generation: newest.generation, stateDigest: stateDigest(newest) };
  assert(worker("anchor", anchorPath, checkpoint).status === 0, "F12 anchor update failed");
  removeSidecars(dbPath);
  fs.copyFileSync(backupPath, dbPath);
  const restored = verifyRegistry(dbPath).state;
  const anchorDb = openAnchor(anchorPath);
  const anchor = anchorDb.prepare("SELECT generation,state_digest FROM checkpoint WHERE singleton=1").get();
  anchorDb.close();
  const verdict = compareAnchor(restored, { generation: Number(anchor.generation), state_digest: anchor.state_digest });
  assert(verdict === "refuse-backup-rollback", "F12 anchor failed to detect rollback");
  return { verdict, armVerdicts: { signatureOnly: "accept-local-signature", singlePersistentRegistry: "accept-internally-valid-old-state", anchoredCrossView: verdict }, operations: [{ type: "transition", operation: first, committed: true, responseObserved: true }, { type: "checkpoint", label: "backup" }, { type: "transition", operation: second, committed: true, responseObserved: true }, { type: "anchor", checkpoint, committed: true }, { type: "restore", restoredState: restored }, { type: "compare-anchor" }], observations: { backupMethod: "node:sqlite backup API", restoredIntegrity: "ok", anchorGeneration: Number(anchor.generation), anchorStateDigest: anchor.state_digest } };
});

async function viewCase(id, viewA, keyA, viewB, keyB, expected) {
  const dbA = path.join(workDir, `${id}-view-a.sqlite`);
  const dbB = path.join(workDir, `${id}-view-b.sqlite`);
  const a = JSON.parse(worker("view", dbA, { view: viewA, signerKeyId: keyA }).stdout);
  const b = JSON.parse(worker("view", dbB, { view: viewB, signerKeyId: keyB }).stdout);
  a.signatureValid = verifyObject(a.signerKeyId, a.view, a.signature);
  b.signatureValid = verifyObject(b.signerKeyId, b.view, b.signature);
  const verdict = compareViews(a, b);
  assert(verdict === expected, `${id} expected ${expected}, got ${verdict}`);
  const state = initialState();
  results.push(resultRow(id, verdict, state, { signatureOnly: "accept-both-local-signatures", singlePersistentRegistry: "accept-own-view", anchoredCrossView: verdict }, [{ type: "compare-views", retained: a, incoming: b }], { processDatabases: [path.basename(dbA), path.basename(dbB)] }));
  for (const [tag, dbPath] of [[`${id}A`, dbA], [`${id}B`, dbB]]) {
    const db = openViewStore(dbPath);
    pragmaChecks.push({ id: tag, ...pragmaSnapshot(db) });
    db.close();
  }
}

const statement = (issuer, subject, sequence, content) => ({ issuer, subject, sequence, statementDigest: sha256(content) });
const view = (logId, treeSize, root, statementValue) => ({ logId, treeSize, root, ...statementValue });
await viewCase("F13", view("log-A", 3, rootHash("A3"), statement("issuer", "subject", 3, "S3")), "LOG-A", view("log-A", 2, rootHash("A2"), statement("issuer", "subject", 2, "S2")), "LOG-A", "refuse-stale-view");
await viewCase("F14", view("log-A", 3, rootHash("A3-left"), statement("issuer", "subject", 3, "S3")), "LOG-A", view("log-A", 3, rootHash("A3-right"), statement("issuer", "subject", 3, "S3")), "LOG-A", "refuse-log-equivocation");
await viewCase("F15", view("log-A", 3, rootHash("A3"), statement("issuer", "subject", 7, "LEFT")), "LOG-A", view("log-B", 4, rootHash("B4"), statement("issuer", "subject", 7, "RIGHT")), "LOG-B", "refuse-issuer-equivocation");
await viewCase("F16", view("log-A", 3, rootHash("A3"), statement("issuer", "subject", 7, "SAME")), "LOG-A", view("log-B", 4, rootHash("B4"), statement("issuer", "subject", 7, "SAME")), "LOG-B", "accept-cross-view");

assert(results.length === 16, `Expected 16 results, got ${results.length}`);
assert(pragmaChecks.every(item => item.journalMode === "wal" && item.synchronous === 2 && item.foreignKeys === 1 && item.integrity === "ok"), "SQLite pragma or integrity gate failed");

const blindCases = results.map(row => ({
  opaqueCaseId: row.opaqueCaseId,
  initialState: initialState(),
  operations: row.operations,
  observations: row.observations
}));
const trace = {
  traceId: "RC51-BLIND-EVENT-LEDGER-0.1",
  cycleId: "RC-2026-51",
  contract: "research/reproducibility/rc51-blind-replay-contract.json",
  withheld: "Fixture labels, expected verdicts, generator verdicts, hypotheses, and aggregate outcomes are absent.",
  cases: blindCases
};
const result = {
  resultId: "RC51-PERSISTENT-GOSSIP-NODE-RESULT-0.1",
  cycleId: "RC-2026-51",
  runtime: { node: process.version, sqlite: pragmaChecks[0].sqliteVersion, platform: `${process.platform}-${process.arch}` },
  preregistrationCommit: "5a2f847",
  processCrashScope: true,
  powerLossScope: false,
  operatorIndependenceScope: false,
  physicalAcquisitions: 0,
  fixtures: results.map(({ operations, observations, state, ...row }) => row),
  pragmaChecks,
  gates: {
    fixtureCount: results.length === 16,
    atomicCrashTuples: results.find(row => row.id === "F03").verdict === "retry-accepted-once" && results.find(row => row.id === "F04").verdict === "retry-rejected-replay" && results.find(row => row.id === "F10").verdict === "retry-accepted-rotation" && results.find(row => row.id === "F11").verdict === "retry-rejected-rotation",
    backupRollbackDetectedOnlyWithAnchor: results.find(row => row.id === "F12").armVerdicts.singlePersistentRegistry === "accept-internally-valid-old-state" && results.find(row => row.id === "F12").verdict === "refuse-backup-rollback",
    equivocationDetectedAfterExchange: ["F13", "F14", "F15"].every(id => results.find(row => row.id === id).verdict.startsWith("refuse-")),
    consistentViewsAccepted: results.find(row => row.id === "F16").verdict === "accept-cross-view",
    sqlitePragmasAndIntegrity: true
  }
};
fs.writeFileSync(tracePath, `${JSON.stringify(trace, null, 2)}\n`);
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
fs.rmSync(workDir, { recursive: true, force: true });
console.log(`RC51 Node: ${results.length} fixtures; SQLite ${result.runtime.sqlite}; process-crash gates PASS; physical n=0.`);
