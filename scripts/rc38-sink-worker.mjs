import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = Object.fromEntries(process.argv.slice(2).map(item => item.split("=")).map(([key, ...rest]) => [key.replace(/^--/, ""), rest.join("=")]));
for (const name of ["protocol", "db", "actuator", "event", "digest"]) if (!args[name]) throw new Error(`--${name} is required`);
const dbPath = path.resolve(args.db);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS sink_markers(event_id TEXT PRIMARY KEY,payload_sha256 TEXT NOT NULL,criterion TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS transport_receipts(event_id TEXT PRIMARY KEY,payload_sha256 TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
const payload = { eventId: args.event, payloadSha256: args.digest };
const marker = () => db.prepare("SELECT event_id AS eventId,payload_sha256 AS payloadSha256,criterion FROM sink_markers WHERE event_id=?").get(args.event);
const writeMarker = criterion => db.prepare("INSERT OR IGNORE INTO sink_markers(event_id,payload_sha256,criterion) VALUES(?,?,?)").run(args.event, args.digest, criterion);
const post = async endpoint => {
  const response = await fetch(`${args.actuator}${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
};
const getState = async () => {
  const response = await fetch(`${args.actuator}/state`);
  return response.json();
};
const finish = output => { db.close(); process.stdout.write(`${JSON.stringify(output)}\n`); };
const crash = (code, output) => { finish(output); process.exit(code); };

let output = { protocol: args.protocol, eventId: args.event, priorMarker: marker() || null };
if (args.protocol === "marker-first") {
  if (!marker()) writeMarker("execution-count");
  if (args.fault === "after-marker") crash(101, { ...output, status: "crash-after-marker" });
  if (!output.priorMarker) output.action = await post("/pulse");
  output.status = output.priorMarker ? "marker-replay-skip" : "completed";
} else if (args.protocol === "action-first") {
  if (!marker()) output.action = await post("/pulse");
  if (args.fault === "after-action") crash(102, { ...output, status: "crash-after-action" });
  writeMarker("execution-count");
  output.status = "completed";
} else if (args.protocol === "qos2-handler") {
  db.prepare("INSERT OR IGNORE INTO transport_receipts(event_id,payload_sha256) VALUES(?,?)").run(args.event, args.digest);
  if (!marker()) output.action = await post("/pulse");
  if (args.fault === "after-action") crash(103, { ...output, status: "crash-after-qos2-handler-action" });
  writeMarker("execution-count");
  output.status = "completed";
} else if (args.protocol === "sensor-reconcile") {
  const reportedOffset = Number(args.sensorOffset || 0);
  const sensed = await getState();
  output.rawPulseCount = sensed.pulseCount;
  output.reportedPulseCount = Math.max(0, sensed.pulseCount + reportedOffset);
  if (!marker() && output.reportedPulseCount === 0) output.action = await post("/pulse");
  writeMarker("sensor-reconciled-count");
  output.status = "completed";
} else if (args.protocol === "absolute-setpoint") {
  if (!marker()) output.action = await post("/absolute");
  if (args.fault === "after-action") crash(104, { ...output, status: "crash-after-absolute-set" });
  writeMarker("target-state");
  output.status = "completed";
} else if (args.protocol === "controller-dedup") {
  if (!marker()) output.action = await post("/dedup");
  if (args.fault === "after-action") crash(105, { ...output, status: "crash-after-controller-acceptance" });
  writeMarker("controller-acceptance");
  output.status = "completed";
} else {
  throw new Error(`unknown protocol ${args.protocol}`);
}
finish({ ...output, marker: marker() });
