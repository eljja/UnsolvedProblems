import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/rc38-software-loop-result.json"), "utf8"));
const history = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/rc38-software-loop-history.json"), "utf8"));
const outputPath = path.join(root, "research/reproducibility/rc38-software-loop-independent-audit.json");
const checks = [];
const check = (name, pass, observed, expected) => checks.push({ name, pass: Boolean(pass), observed, expected });
const readLines = file => fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : [];

check("case-count", result.cases.length === 8, result.cases.length, 8);
check("history-count", history.history.length === result.historyEvents, history.history.length, result.historyEvents);
check("all-preregistered-criteria", Object.values(result.criteria).every(Boolean), result.criteria, "all true");
check("scope-host-count", result.implementation.physicalHosts === 1 && result.implementation.actualHardwareInLoop === false, result.implementation, { physicalHosts: 1, actualHardwareInLoop: false });

const summaries = {};
for (const item of result.cases) {
  const caseDir = path.join(root, item.caseDir);
  const db = new DatabaseSync(path.join(root, item.sinkDb), { readOnly: true });
  const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
  const markers = db.prepare("SELECT event_id AS eventId,payload_sha256 AS payloadSha256,criterion FROM sink_markers ORDER BY event_id").all();
  const receipts = db.prepare("SELECT event_id AS eventId,payload_sha256 AS payloadSha256 FROM transport_receipts ORDER BY event_id").all();
  db.close();
  const pulses = readLines(path.join(caseDir, "pulse-effects.ndjson"));
  const absolute = readLines(path.join(caseDir, "absolute-invocations.ndjson"));
  const controllerPath = path.join(caseDir, "controller.sqlite");
  const controller = new DatabaseSync(controllerPath, { readOnly: true });
  const controllerIntegrity = controller.prepare("PRAGMA integrity_check").get().integrity_check;
  const controllerEffects = controller.prepare("SELECT event_id AS eventId,payload_sha256 AS payloadSha256,effect_ordinal AS effectOrdinal FROM command_effects ORDER BY event_id").all();
  controller.close();
  const artifact = { integrity, controllerIntegrity, markerCount: markers.length, receiptCount: receipts.length, pulseCount: pulses.length, absoluteInvocations: absolute.length, controllerEffects: controllerEffects.length };
  summaries[item.name] = artifact;
  check(`${item.name}-integrity`, integrity === "ok" && controllerIntegrity === "ok", artifact, "both ok");
  check(`${item.name}-payload-binding`, [...markers, ...receipts, ...pulses, ...absolute, ...controllerEffects].every(row => row.payloadSha256 === result.payloadSha256), "all durable rows checked", result.payloadSha256);
}

check("marker-first-missed", summaries["marker-before-action"].markerCount === 1 && summaries["marker-before-action"].pulseCount === 0, summaries["marker-before-action"], { markerCount: 1, pulseCount: 0 });
check("action-first-duplicate", summaries["action-before-marker"].markerCount === 1 && summaries["action-before-marker"].pulseCount === 2, summaries["action-before-marker"], { markerCount: 1, pulseCount: 2 });
check("qos2-boundary", summaries["qos2-once-handler-retry"].receiptCount === 1 && summaries["qos2-once-handler-retry"].pulseCount === 2, summaries["qos2-once-handler-retry"], { receiptCount: 1, pulseCount: 2 });
check("counter-current", summaries["authoritative-counter-reconcile"].pulseCount === 1, summaries["authoritative-counter-reconcile"].pulseCount, 1);
check("counter-stale", summaries["stale-counter-reconcile"].pulseCount === 2, summaries["stale-counter-reconcile"].pulseCount, 2);
check("counter-false-positive", summaries["false-positive-counter"].markerCount === 1 && summaries["false-positive-counter"].pulseCount === 0, summaries["false-positive-counter"], { markerCount: 1, pulseCount: 0 });
check("absolute-state-reformulation", summaries["absolute-setpoint-retry"].absoluteInvocations === 2 && result.cases.find(item => item.name === "absolute-setpoint-retry").final.actuator.absoluteState.target === 1, summaries["absolute-setpoint-retry"], { absoluteInvocations: 2, target: 1 });
check("controller-id-upper-bound", summaries["controller-command-id"].controllerEffects === 1, summaries["controller-command-id"].controllerEffects, 1);

const passed = checks.filter(item => item.pass).length;
const output = { cycle: "RC-2026-38", auditor: "independent Node raw-artifact and SQLite audit", computedOn: "2026-08-20", summaries, checks, passed, total: checks.length, qualifies: passed === checks.length, resultSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "research/reproducibility/rc38-software-loop-result.json"))).digest("hex") };
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify(output, null, 2));
