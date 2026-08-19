import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(root, "research/reproducibility/rc38-software-loop");
const resultPath = path.join(root, "research/reproducibility/rc38-software-loop-result.json");
const historyPath = path.join(root, "research/reproducibility/rc38-software-loop-history.json");
const write = process.argv.includes("--write");
const digest = crypto.createHash("sha256").update("RC38 fixed physical-effect frontier payload v1").digest("hex");
const history = [];
const log = (caseName, event, details = {}) => history.push({ ordinal: history.length + 1, case: caseName, event, details });

const removeOutput = () => {
  for (const target of [outRoot, resultPath, historyPath]) {
    const resolved = path.resolve(target);
    if (!resolved.startsWith(path.join(root, "research", "reproducibility"))) throw new Error(`unsafe output target: ${resolved}`);
    if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
  }
};
const readLines = file => fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : [];
const parseLastJson = text => {
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.length ? JSON.parse(lines.at(-1)) : null;
};
const startActuator = caseDir => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, "scripts/rc38-emulated-actuator.mjs"), `--dir=${caseDir}`], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", data => { stderr += data; });
  child.once("error", reject);
  child.stdout.once("data", data => {
    try {
      const ready = parseLastJson(data.toString("utf8"));
      resolve({ child, ready, url: `http://127.0.0.1:${ready.port}`, stderr: () => stderr });
    } catch (error) { reject(error); }
  });
});
const stopActuator = service => new Promise(resolve => {
  const timer = setTimeout(() => { service.child.kill("SIGKILL"); resolve(); }, 3000);
  service.child.once("exit", () => { clearTimeout(timer); resolve(); });
  service.child.kill("SIGTERM");
});
const runWorker = ({ protocol, db, actuator, event, fault = "none", sensorOffset = 0 }) => new Promise((resolve, reject) => {
  const argumentsList = [path.join(root, "scripts/rc38-sink-worker.mjs"), `--protocol=${protocol}`, `--db=${db}`, `--actuator=${actuator}`, `--event=${event}`, `--digest=${digest}`, `--fault=${fault}`, `--sensorOffset=${sensorOffset}`];
  const child = spawn(process.execPath, argumentsList, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", data => { stdout += data; });
  child.stderr.on("data", data => { stderr += data; });
  child.once("error", reject);
  child.once("exit", code => resolve({ code, output: parseLastJson(stdout), stderr: stderr || null }));
});
const snapshot = async (caseDir, dbPath, actuatorUrl) => {
  const response = await fetch(`${actuatorUrl}/state`);
  const actuator = await response.json();
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const markers = db.prepare("SELECT event_id AS eventId,payload_sha256 AS payloadSha256,criterion FROM sink_markers ORDER BY event_id").all();
  const receipts = db.prepare("SELECT event_id AS eventId,payload_sha256 AS payloadSha256 FROM transport_receipts ORDER BY event_id").all();
  const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
  db.close();
  return { actuator, markers, receipts, integrity, files: fs.readdirSync(caseDir).sort() };
};

const cases = [];
const executeCase = async definition => {
  const caseDir = path.join(outRoot, definition.name);
  fs.mkdirSync(caseDir, { recursive: true });
  const dbPath = path.join(caseDir, "sink.sqlite");
  const service = await startActuator(caseDir);
  log(definition.name, "actuator-started", service.ready);
  const attempts = [];
  try {
    for (const step of definition.steps) {
      const attempt = await runWorker({ ...step, db: dbPath, actuator: service.url, event: definition.event });
      attempts.push({ ...step, result: attempt });
      log(definition.name, "worker-exit", { protocol: step.protocol, fault: step.fault || "none", sensorOffset: step.sensorOffset || 0, exitCode: attempt.code, output: attempt.output });
    }
    const final = await snapshot(caseDir, dbPath, service.url);
    log(definition.name, "final-snapshot", final);
    cases.push({ name: definition.name, eventId: definition.event, attempts, final, caseDir: path.relative(root, caseDir).replaceAll("\\", "/"), sinkDb: path.relative(root, dbPath).replaceAll("\\", "/") });
  } finally {
    await stopActuator(service);
    log(definition.name, "actuator-stopped", { exitCode: service.child.exitCode, stderr: service.stderr() || null });
  }
};

if (!write) throw new Error("confirmation is destructive to its fixed output directory; rerun with --write after preregistration");
removeOutput();
fs.mkdirSync(outRoot, { recursive: true });
await executeCase({ name: "marker-before-action", event: "RC38-MARKER-FIRST-001", steps: [{ protocol: "marker-first", fault: "after-marker" }, { protocol: "marker-first" }] });
await executeCase({ name: "action-before-marker", event: "RC38-ACTION-FIRST-001", steps: [{ protocol: "action-first", fault: "after-action" }, { protocol: "action-first" }] });
await executeCase({ name: "qos2-once-handler-retry", event: "RC38-QOS2-HANDLER-001", steps: [{ protocol: "qos2-handler", fault: "after-action" }, { protocol: "qos2-handler" }] });
await executeCase({ name: "authoritative-counter-reconcile", event: "RC38-COUNTER-CURRENT-001", steps: [{ protocol: "action-first", fault: "after-action" }, { protocol: "sensor-reconcile" }] });
await executeCase({ name: "stale-counter-reconcile", event: "RC38-COUNTER-STALE-001", steps: [{ protocol: "action-first", fault: "after-action" }, { protocol: "sensor-reconcile", sensorOffset: -1 }] });
await executeCase({ name: "false-positive-counter", event: "RC38-COUNTER-FALSE-001", steps: [{ protocol: "sensor-reconcile", sensorOffset: 1 }] });
await executeCase({ name: "absolute-setpoint-retry", event: "RC38-ABSOLUTE-001", steps: [{ protocol: "absolute-setpoint", fault: "after-action" }, { protocol: "absolute-setpoint" }] });
await executeCase({ name: "controller-command-id", event: "RC38-CONTROLLER-ID-001", steps: [{ protocol: "controller-dedup", fault: "after-action" }, { protocol: "controller-dedup" }] });

const byName = Object.fromEntries(cases.map(item => [item.name, item]));
const criteria = {
  C1_marker_first_exposes_missed_effect: byName["marker-before-action"].final.markers.length === 1 && byName["marker-before-action"].final.actuator.pulseCount === 0,
  C2_action_first_exposes_duplicate: byName["action-before-marker"].final.markers.length === 1 && byName["action-before-marker"].final.actuator.pulseCount === 2,
  C3_qos2_message_once_does_not_make_handler_effect_once: byName["qos2-once-handler-retry"].final.receipts.length === 1 && byName["qos2-once-handler-retry"].final.actuator.pulseCount === 2,
  C4_current_counter_reconciles_one_effect: byName["authoritative-counter-reconcile"].final.markers.length === 1 && byName["authoritative-counter-reconcile"].final.actuator.pulseCount === 1,
  C5_stale_counter_duplicates: byName["stale-counter-reconcile"].final.actuator.pulseCount === 2,
  C6_false_positive_counter_loses_effect: byName["false-positive-counter"].final.markers.length === 1 && byName["false-positive-counter"].final.actuator.pulseCount === 0,
  C7_absolute_command_converges_despite_two_invocations: byName["absolute-setpoint-retry"].final.actuator.absoluteInvocationCount === 2 && byName["absolute-setpoint-retry"].final.actuator.absoluteState.target === 1,
  C8_controller_command_id_replays_without_duplicate_modeled_effect: byName["controller-command-id"].final.actuator.controllerEffects.length === 1 && byName["controller-command-id"].attempts[1].result.output.action.body.status === "replay",
  C9_all_sink_databases_integral: cases.every(item => item.final.integrity === "ok"),
  C10_scope_is_one_host_software_loop: true
};
const result = {
  cycle: "RC-2026-38",
  executedOn: "2026-08-20",
  payloadSha256: digest,
  implementation: { physicalHosts: 1, actualHardwareInLoop: false, processesPerCase: ["orchestrator", "sink worker", "emulated actuator service"], durableBoundaries: ["sink SQLite", "append-only pulse/invocation logs", "controller SQLite"] },
  cases,
  criteria,
  qualifies: Object.values(criteria).every(Boolean),
  historyEvents: history.length,
  boundary: {
    qualifies: "A one-host software-loop confirmation of the action-marker ambiguity, message/effect separation, counter freshness dependence, state-convergence reformulation, and controller-owned command-ID upper bound under fixed crash cuts.",
    doesNotQualify: ["a physical actuator or hardware-in-the-loop device", "multiple physical hosts", "a real asymmetric network partition", "host or storage-device power loss", "an atomicity proof between a physical transition and controller memory", "sensor calibration, miss, false-positive, latency, or common-cause-failure rates", "an unbounded exactly-once or liveness proof"]
  }
};
fs.writeFileSync(historyPath, `${JSON.stringify({ cycle: result.cycle, history }, null, 2)}\n`, "utf8");
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
