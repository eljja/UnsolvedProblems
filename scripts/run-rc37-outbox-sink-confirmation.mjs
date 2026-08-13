import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const DB_ROOT = path.join(REPRO, "rc37-chain-db");
const PRECOMMIT_PATH = path.join(REPRO, "rc37-outbox-sink-precommit.json");
const PYTHON = process.env.RC37_PYTHON || "D:\\python\\anaconda3\\python.exe";
const SERVICE = path.join(ROOT, "scripts", "rc37_chain_service.py");
const RELAY = path.join(ROOT, "scripts", "rc37_relay.mjs");
const WRITE = process.argv.includes("--write");
const RECEIVER_PORT = 24037;
const SINK_PORT = 24038;
const RECEIVER_URL = `http://127.0.0.1:${RECEIVER_PORT}`;
const SINK_URL = `http://127.0.0.1:${SINK_PORT}`;
const DIGEST_A = crypto.createHash("sha256").update("RC37-OUTCOME-A").digest("hex");
const DIGEST_B = crypto.createHash("sha256").update("RC37-OUTCOME-B").digest("hex");
const history = [];

if (!WRITE) throw new Error("RC37 confirmation mutates sealed DB artifacts; rerun with --write after precommit push.");
if (!fs.existsSync(PRECOMMIT_PATH)) throw new Error("RC37 precommit is missing.");
const PRECOMMIT = JSON.parse(fs.readFileSync(PRECOMMIT_PATH, "utf8"));

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function rel(target) { return path.relative(ROOT, target).replaceAll("\\", "/"); }
function assertReproPath(target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(`${path.resolve(REPRO)}${path.sep}`)) throw new Error(`Refusing mutation outside reproducibility directory: ${resolved}`);
}

async function startService(mode, dbPath) {
  const port = mode === "receiver" ? RECEIVER_PORT : SINK_PORT;
  const child = spawn(PYTHON, [SERVICE, "--mode", mode, "--db", dbPath, "--port", String(port)], { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${mode} exited during startup: ${stderr || stdout}`);
    if (stdout.includes('"ready": true')) {
      history.push({ type: "process", action: "start", mode, pid: child.pid, db: rel(dbPath), at: new Date().toISOString() });
      return child;
    }
    await wait(40);
  }
  child.kill();
  throw new Error(`${mode} did not become ready: ${stderr || stdout}`);
}

async function stopService(child, mode, reason) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, wait(5000)]);
  history.push({ type: "process", action: "stop", mode, reason, exitCode: child.exitCode, signalCode: child.signalCode, at: new Date().toISOString() });
}

async function waitExited(child, mode, expectedCode) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline && child?.exitCode === null) await wait(40);
  if (child?.exitCode !== expectedCode) throw new Error(`Expected ${mode} exit ${expectedCode}, observed ${child?.exitCode}`);
  history.push({ type: "process", action: "fault-exit", mode, exitCode: child.exitCode, at: new Date().toISOString() });
}

async function request(label, method, url, body, fault = "none") {
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json", "x-rc37-fault": fault },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const document = await response.json();
    const value = { status: response.status, body: document };
    history.push({ type: "http", label, method, url, fault, body, startedAt, completedAt: new Date().toISOString(), response: value });
    return value;
  } catch (error) {
    history.push({ type: "http", label, method, url, fault, body, startedAt, completedAt: new Date().toISOString(), response: null, error: error.message });
    return null;
  }
}

const deliver = (deliveryId, digest = DIGEST_A, fault = "none") => request("receiver-delivery", "PUT", `${RECEIVER_URL}/deliveries/${deliveryId}`, { outcomeSha256: digest }, fault);
const sinkPut = (eventId, digest = DIGEST_A, fault = "none") => request("sink-event", "PUT", `${SINK_URL}/events/${eventId}`, { outcomeSha256: digest }, fault);
const outboxAck = (eventId, digest = DIGEST_A, fault = "none") => request("receiver-outbox-ack", "POST", `${RECEIVER_URL}/outbox/${eventId}/ack`, { outcomeSha256: digest }, fault);

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return response.json();
}

async function runRelay({ sinkFault = "none", relayFault = "none", receiverAckFault = "none" } = {}) {
  const args = [RELAY, `--receiver=${RECEIVER_URL}`, `--sink=${SINK_URL}`, `--sink-fault=${sinkFault}`, `--relay-fault=${relayFault}`, `--receiver-ack-fault=${receiverAckFault}`];
  const child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const exitCode = await new Promise(resolve => child.once("exit", resolve));
  let output = null;
  try { output = stdout.trim() ? JSON.parse(stdout.trim().split(/\r?\n/).at(-1)) : null; } catch { output = { parseError: stdout }; }
  const event = { type: "relay", pid: child.pid, sinkFault, relayFault, receiverAckFault, exitCode, output, stderr: stderr.trim() || null, at: new Date().toISOString() };
  history.push(event);
  return event;
}

async function createContext(name) {
  const receiverDb = path.join(DB_ROOT, `${name}-receiver.sqlite`);
  const sinkDb = path.join(DB_ROOT, `${name}-sink.sqlite`);
  return { name, receiverDb, sinkDb, receiver: await startService("receiver", receiverDb), sink: await startService("sink", sinkDb) };
}

async function finishContext(ctx, details) {
  const receiverState = await getJson(`${RECEIVER_URL}/state`);
  const sinkState = await getJson(`${SINK_URL}/state`);
  await stopService(ctx.receiver, "receiver", `${ctx.name}-complete`);
  await stopService(ctx.sink, "sink", `${ctx.name}-complete`);
  return { name: ctx.name, ...details, receiverState, sinkState, receiverDb: rel(ctx.receiverDb), sinkDb: rel(ctx.sinkDb) };
}

async function receiverCrashCase(name, fault, exitCode, deliveryId, expectedRetry) {
  const ctx = await createContext(name);
  const first = await deliver(deliveryId, DIGEST_A, fault);
  if (first !== null) throw new Error(`${name}: fault request returned unexpectedly`);
  await waitExited(ctx.receiver, "receiver", exitCode);
  ctx.receiver = await startService("receiver", ctx.receiverDb);
  const retry = await deliver(deliveryId);
  const replay = await deliver(deliveryId);
  if (retry?.status !== expectedRetry) throw new Error(`${name}: expected retry ${expectedRetry}, observed ${retry?.status}`);
  const relay = await runRelay();
  return finishContext(ctx, { first, retry, replay, relay });
}

async function sinkCrashCase(name, fault, exitCode, deliveryId, expectedSinkRetry) {
  const ctx = await createContext(name);
  const delivery = await deliver(deliveryId);
  const firstRelay = await runRelay({ sinkFault: fault });
  await waitExited(ctx.sink, "sink", exitCode);
  const pendingAfterFault = await getJson(`${RECEIVER_URL}/outbox/pending`);
  ctx.sink = await startService("sink", ctx.sinkDb);
  const retryRelay = await runRelay();
  if (retryRelay.output?.sink?.status !== expectedSinkRetry) throw new Error(`${name}: expected sink retry ${expectedSinkRetry}, observed ${retryRelay.output?.sink?.status}`);
  return finishContext(ctx, { delivery, firstRelay, pendingAfterFault, retryRelay });
}

async function relayCrashCase() {
  const ctx = await createContext("relay-after-sink-response");
  const delivery = await deliver("RC37-RELAY-CRASH-001");
  const firstRelay = await runRelay({ relayFault: "crash-after-sink-response" });
  const pendingAfterFault = await getJson(`${RECEIVER_URL}/outbox/pending`);
  const sinkAfterFault = await getJson(`${SINK_URL}/state`);
  const retryRelay = await runRelay();
  return finishContext(ctx, { delivery, firstRelay, pendingAfterFault, sinkAfterFault, retryRelay });
}

async function receiverAckLossCase() {
  const ctx = await createContext("receiver-ack-after-commit");
  const delivery = await deliver("RC37-ACK-LOSS-001");
  const firstRelay = await runRelay({ receiverAckFault: "after-commit" });
  await waitExited(ctx.receiver, "receiver", 89);
  ctx.receiver = await startService("receiver", ctx.receiverDb);
  const pendingAfterRestart = await getJson(`${RECEIVER_URL}/outbox/pending`);
  const retryRelay = await runRelay();
  return finishContext(ctx, { delivery, firstRelay, pendingAfterRestart, retryRelay });
}

async function duplicateConflictCase() {
  const ctx = await createContext("duplicate-conflict-50");
  const delivery = await deliver("RC37-DUPLICATE-001");
  const pending = await getJson(`${RECEIVER_URL}/outbox/pending`);
  const event = pending.events[0];
  const duplicates = await Promise.all(Array.from({ length: 50 }, () => sinkPut(event.eventId)));
  const acknowledgement = await outboxAck(event.eventId);
  const conflict = await sinkPut(event.eventId, DIGEST_B);
  const invalidId = await sinkPut("bad", DIGEST_A);
  const invalidDigest = await sinkPut("RC37-INVALID-001", "not-a-digest");
  return finishContext(ctx, {
    delivery, event,
    duplicateCounts: { created: duplicates.filter(item => item?.status === 201).length, replay: duplicates.filter(item => item?.status === 200).length, missing: duplicates.filter(item => item === null).length },
    duplicateReceipts: duplicates.map(item => item?.body?.receipt).filter(Boolean),
    acknowledgement, conflict, invalidId, invalidDigest
  });
}

function chainConsistent(item) {
  const delivery = item.receiverState.deliveries[0];
  const outbox = item.receiverState.outbox[0];
  const inbox = item.sinkState.inbox[0];
  const effect = item.sinkState.effects[0];
  return item.receiverState.deliveries.length === 1 && item.receiverState.outbox.length === 1 && item.sinkState.inbox.length === 1 && item.sinkState.effects.length === 1 && outbox.status === "delivered" && delivery.eventId === outbox.eventId && outbox.eventId === inbox.eventId && inbox.eventId === effect.eventId && delivery.outcomeSha256 === outbox.outcomeSha256 && outbox.outcomeSha256 === inbox.outcomeSha256 && inbox.outcomeSha256 === effect.outcomeSha256;
}

async function main() {
  if (!fs.existsSync(PYTHON) || !fs.existsSync(SERVICE) || !fs.existsSync(RELAY)) throw new Error("RC37 runtime or implementation is missing");
  assertReproPath(DB_ROOT);
  fs.rmSync(DB_ROOT, { recursive: true, force: true });
  fs.mkdirSync(DB_ROOT, { recursive: true });
  const cases = [
    await receiverCrashCase("receiver-before-commit", "before-commit", 86, "RC37-RX-BEFORE-001", 201),
    await receiverCrashCase("receiver-after-commit", "after-commit", 87, "RC37-RX-AFTER-001", 200),
    await sinkCrashCase("sink-before-commit", "before-commit", 96, "RC37-SINK-BEFORE-001", 201),
    await sinkCrashCase("sink-after-commit", "after-commit", 97, "RC37-SINK-AFTER-001", 200),
    await relayCrashCase(),
    await receiverAckLossCase(),
    await duplicateConflictCase()
  ];
  const byName = Object.fromEntries(cases.map(item => [item.name, item]));
  const criteria = {
    C1_receiver_precommit_retry_creates: byName["receiver-before-commit"].retry?.status === 201 && byName["receiver-before-commit"].replay?.status === 200,
    C2_receiver_postcommit_retry_replays: byName["receiver-after-commit"].retry?.status === 200 && byName["receiver-after-commit"].replay?.status === 200,
    C3_sink_precommit_keeps_outbox_pending: byName["sink-before-commit"].pendingAfterFault.events.length === 1 && byName["sink-before-commit"].retryRelay.output?.sink?.status === 201,
    C4_sink_postcommit_retry_is_sink_replay: byName["sink-after-commit"].pendingAfterFault.events.length === 1 && byName["sink-after-commit"].retryRelay.output?.sink?.status === 200,
    C5_relay_crash_replays_without_duplicate_effect: byName["relay-after-sink-response"].firstRelay.exitCode === 103 && byName["relay-after-sink-response"].pendingAfterFault.events.length === 1 && byName["relay-after-sink-response"].sinkAfterFault.effects.length === 1 && byName["relay-after-sink-response"].retryRelay.output?.sink?.status === 200,
    C6_outbox_ack_response_loss_preserves_delivered_state: byName["receiver-ack-after-commit"].firstRelay.exitCode === 105 && byName["receiver-ack-after-commit"].pendingAfterRestart.events.length === 0 && byName["receiver-ack-after-commit"].retryRelay.output?.status === "empty",
    C7_concurrent_duplicates_one_create: byName["duplicate-conflict-50"].duplicateCounts.created === 1 && byName["duplicate-conflict-50"].duplicateCounts.replay === 49 && byName["duplicate-conflict-50"].duplicateCounts.missing === 0,
    C8_conflict_and_invalid_inputs_do_not_add_effects: byName["duplicate-conflict-50"].conflict?.status === 409 && byName["duplicate-conflict-50"].invalidId?.status === 400 && byName["duplicate-conflict-50"].invalidDigest?.status === 400,
    C9_all_case_chains_consistent: cases.every(chainConsistent)
  };
  const result = {
    cycle: "RC-2026-37",
    experiment: "one-host-three-process-two-database receiver-outbox-sink confirmation",
    computedOn: "2026-08-14",
    precommitId: PRECOMMIT.precommitId,
    implementation: {
      receiver: "Python HTTP process with SQLite inbox and durable outbox",
      relay: "separate Node process reading pending outbox and awaiting sink acknowledgement",
      sink: "separate Python HTTP process with SQLite inbox and modeled effect row",
      databaseMode: "SQLite rollback journal, synchronous FULL",
      physicalHosts: 1,
      simultaneousServiceProcesses: 3,
      databaseFilesPerCase: 2,
      cases: cases.length,
      concurrentDuplicateAttempts: 50,
      digestA: DIGEST_A,
      digestB: DIGEST_B
    },
    cases,
    criteria,
    qualifies: Object.values(criteria).every(Boolean),
    historyEvents: history.length,
    boundary: {
      qualifies: "A receiver-transaction outbox and a separate-process, separate-database idempotent sink effect row under the fixed crash, response-loss, conflict, invalid-input, and duplicate schedules on one physical host.",
      doesNotQualify: ["a physical actuator, payment, email, or third-party API side effect", "multiple physical hosts", "a real network partition or packet-level fault injector", "host, storage-device, or correlated power loss", "Byzantine participants", "unbounded liveness or exactly-once proof", "production authentication, authorization, retention, or capacity guarantees"]
    }
  };
  fs.writeFileSync(path.join(REPRO, "rc37-outbox-sink-confirmation-history.json"), `${JSON.stringify({ cycle: result.cycle, history }, null, 2)}\n`);
  fs.writeFileSync(path.join(REPRO, "rc37-outbox-sink-confirmation-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ criteria, qualifies: result.qualifies, historyEvents: history.length }, null, 2)}\n`);
  if (!result.qualifies) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
