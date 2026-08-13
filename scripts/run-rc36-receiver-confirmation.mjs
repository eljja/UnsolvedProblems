import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const DB_ROOT = path.join(REPRO, "rc36-receiver-db");
const PRECOMMIT = JSON.parse(fs.readFileSync(path.join(REPRO, "rc36-receiver-delivery-precommit.json"), "utf8"));
const PYTHON = process.env.RC36_PYTHON || "D:\\python\\anaconda3\\python.exe";
const RECEIVER = path.join(ROOT, "scripts", "rc36_receiver.py");
const WRITE = process.argv.includes("--write");
const PORT = 23936;
const BASE = `http://127.0.0.1:${PORT}`;
const OUTCOME_A = crypto.createHash("sha256").update("RC36-OUTCOME-A").digest("hex");
const OUTCOME_B = crypto.createHash("sha256").update("RC36-OUTCOME-B").digest("hex");
const history = [];
let receiver = null;

function assertReproPath(target) {
  const resolved = path.resolve(target);
  const allowed = `${path.resolve(REPRO)}${path.sep}`;
  if (!resolved.startsWith(allowed)) throw new Error(`Refusing mutation outside reproducibility directory: ${resolved}`);
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function stopReceiver(reason) {
  if (!receiver || receiver.exitCode !== null || receiver.signalCode !== null) return;
  const exited = new Promise(resolve => receiver.once("exit", resolve));
  receiver.kill();
  await Promise.race([exited, wait(5000)]);
  history.push({ type: "process", action: "stop", reason, exitCode: receiver.exitCode, signalCode: receiver.signalCode, at: new Date().toISOString() });
  receiver = null;
}

async function startReceiver(dbPath) {
  receiver = spawn(PYTHON, [RECEIVER, "--db", dbPath, "--port", String(PORT)], { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  receiver.stdout.on("data", chunk => { stdout += chunk; });
  receiver.stderr.on("data", chunk => { stderr += chunk; });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (receiver.exitCode !== null) throw new Error(`Receiver exited during startup: ${stderr || stdout}`);
    if (stdout.includes('"ready": true')) {
      history.push({ type: "process", action: "start", pid: receiver.pid, dbPath: path.relative(ROOT, dbPath).replaceAll("\\", "/"), at: new Date().toISOString() });
      return;
    }
    await wait(50);
  }
  throw new Error(`Receiver did not become ready: ${stderr || stdout}`);
}

async function put(deliveryId, outcomeSha256, fault = "none") {
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(`${BASE}/deliveries/${deliveryId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-rc36-fault": fault },
      body: JSON.stringify({ outcomeSha256 })
    });
    const body = await response.json();
    const event = { type: "request", deliveryId, outcomeSha256, fault, startedAt, completedAt: new Date().toISOString(), response: { status: response.status, body } };
    history.push(event);
    return event.response;
  } catch (error) {
    const event = { type: "request", deliveryId, outcomeSha256, fault, startedAt, completedAt: new Date().toISOString(), response: null, error: error.message };
    history.push(event);
    return null;
  }
}

async function state() {
  const response = await fetch(`${BASE}/state`);
  if (!response.ok) throw new Error(`State query failed: ${response.status}`);
  return response.json();
}

async function waitExited(expectedCode) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && receiver?.exitCode === null) await wait(50);
  if (receiver?.exitCode !== expectedCode) throw new Error(`Expected receiver exit ${expectedCode}, observed ${receiver?.exitCode}`);
  history.push({ type: "process", action: "fault-exit", exitCode: receiver.exitCode, at: new Date().toISOString() });
  receiver = null;
}

async function runCrashCase(name, fault, expectedExit, deliveryId) {
  const dbPath = path.join(DB_ROOT, `${name}.sqlite`);
  await startReceiver(dbPath);
  const first = await put(deliveryId, OUTCOME_A, fault);
  if (first !== null) throw new Error(`${name}: fault request unexpectedly returned a response`);
  await waitExited(expectedExit);
  await startReceiver(dbPath);
  const retry = await put(deliveryId, OUTCOME_A);
  const replay = await put(deliveryId, OUTCOME_A);
  const conflict = await put(deliveryId, OUTCOME_B);
  const snapshot = await state();
  await stopReceiver(`${name}-complete`);
  return { name, fault, expectedExit, deliveryId, firstResponse: first, retry, replay, conflict, snapshot, db: path.relative(ROOT, dbPath).replaceAll("\\", "/") };
}

async function runConcurrentCase() {
  const name = "concurrent-100";
  const deliveryId = "RC36-CONCURRENT-001";
  const dbPath = path.join(DB_ROOT, `${name}.sqlite`);
  await startReceiver(dbPath);
  const responses = await Promise.all(Array.from({ length: 100 }, () => put(deliveryId, OUTCOME_A)));
  const snapshot = await state();
  const invalidId = await put("bad", OUTCOME_A);
  const invalidDigest = await put("RC36-INVALID-001", "not-a-digest");
  const finalState = await state();
  await stopReceiver(`${name}-complete`);
  return {
    name, deliveryId,
    created: responses.filter(item => item?.status === 201).length,
    replay: responses.filter(item => item?.status === 200).length,
    responseReceipts: responses.map(item => item?.body?.receipt).filter(Boolean),
    snapshot, invalidId, invalidDigest, finalState,
    db: path.relative(ROOT, dbPath).replaceAll("\\", "/")
  };
}

async function main() {
  if (!fs.existsSync(PYTHON) || !fs.existsSync(RECEIVER)) throw new Error("RC36 Python runtime or receiver is missing");
  assertReproPath(DB_ROOT);
  fs.rmSync(DB_ROOT, { recursive: true, force: true });
  fs.mkdirSync(DB_ROOT, { recursive: true });
  const cases = [
    await runCrashCase("before-commit-crash", "before-commit", 86, "RC36-BEFORE-001"),
    await runCrashCase("after-commit-crash", "after-commit", 87, "RC36-AFTER-001"),
    await runConcurrentCase()
  ];
  const crashCases = cases.slice(0, 2);
  const concurrent = cases[2];
  const criteria = {
    beforeCommitRetryCreatesOnce: crashCases[0].retry?.status === 201 && crashCases[0].replay?.status === 200 && crashCases[0].snapshot.effects.length === 1,
    afterCommitRetryReplaysOnce: crashCases[1].retry?.status === 200 && crashCases[1].replay?.status === 200 && crashCases[1].snapshot.effects.length === 1,
    conflictingPayloadRejected: crashCases.every(item => item.conflict?.status === 409 && item.snapshot.effects[0].outcomeSha256 === OUTCOME_A),
    concurrentOneCreate: concurrent.created === 1 && concurrent.replay === 99 && concurrent.snapshot.deliveries.length === 1 && concurrent.snapshot.effects.length === 1,
    malformedInputsNoEffect: concurrent.invalidId?.status === 400 && concurrent.invalidDigest?.status === 400 && concurrent.finalState.effects.length === 1
  };
  const result = {
    cycle: "RC-2026-36",
    experiment: "one-host-external-process-atomic-inbox-effect",
    computedOn: "2026-08-14",
    precommitId: PRECOMMIT.precommitId,
    implementation: {
      receiver: "Python ThreadingHTTPServer plus sqlite3",
      sender: "Node fetch coordinator",
      databaseMode: "SQLite rollback journal, synchronous FULL",
      receiverProcessesAtOnce: 1,
      receiverDatabaseFiles: 3,
      physicalHosts: 1,
      outcomeA: OUTCOME_A,
      outcomeB: OUTCOME_B
    },
    cases,
    criteria,
    qualifies: Object.values(criteria).every(Boolean),
    boundary: {
      qualifies: "Atomic receiver-database insertion of a delivery marker and a modeled effect row under the fixed crashes, retries, conflicts, and concurrency on one host.",
      doesNotQualify: ["an effect outside SQLite", "physical actuation, payment, email, or remote service side effects", "multiple physical hosts", "a real network partition", "host or storage-device loss", "Byzantine clients or receivers", "unbounded exactly-once delivery"]
    },
    historyEvents: history.length
  };
  if (WRITE) {
    fs.writeFileSync(path.join(REPRO, "rc36-receiver-confirmation-history.json"), `${JSON.stringify({ cycle: result.cycle, history }, null, 2)}\n`);
    fs.writeFileSync(path.join(REPRO, "rc36-receiver-confirmation-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify({ criteria, qualifies: result.qualifies, historyEvents: history.length }, null, 2)}\n`);
  if (!result.qualifies) process.exitCode = 1;
}

try { await main(); } finally { await stopReceiver("final-cleanup"); }

