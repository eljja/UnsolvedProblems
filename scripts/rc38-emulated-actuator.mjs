import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = Object.fromEntries(process.argv.slice(2).map(item => item.split("=")).map(([key, ...rest]) => [key.replace(/^--/, ""), rest.join("=")]));
if (!args.dir) throw new Error("--dir is required");
const dir = path.resolve(args.dir);
fs.mkdirSync(dir, { recursive: true });
const pulseLog = path.join(dir, "pulse-effects.ndjson");
const absoluteLog = path.join(dir, "absolute-invocations.ndjson");
const absoluteState = path.join(dir, "absolute-state.json");
const controllerDbPath = path.join(dir, "controller.sqlite");
const db = new DatabaseSync(controllerDbPath);
db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS command_inbox(event_id TEXT PRIMARY KEY, payload_sha256 TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS command_effects(event_id TEXT PRIMARY KEY, payload_sha256 TEXT NOT NULL, effect_ordinal INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");

const appendDurable = (file, value) => {
  const descriptor = fs.openSync(file, "a");
  try { fs.writeSync(descriptor, `${JSON.stringify(value)}\n`); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
};
const readLines = file => fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : [];
const readBody = request => new Promise((resolve, reject) => {
  const chunks = [];
  request.on("data", chunk => chunks.push(chunk));
  request.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (error) { reject(error); } });
  request.on("error", reject);
});
const reply = (response, status, body) => {
  const data = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  response.end(data);
};
const valid = body => /^RC38-[A-Z0-9-]+$/.test(body.eventId || "") && /^[a-f0-9]{64}$/.test(body.payloadSha256 || "");

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/state") {
      const pulses = readLines(pulseLog);
      const invocations = readLines(absoluteLog);
      const stateValue = fs.existsSync(absoluteState) ? JSON.parse(fs.readFileSync(absoluteState, "utf8")) : { target: 0 };
      const controllerEffects = db.prepare("SELECT event_id AS eventId,payload_sha256 AS payloadSha256,effect_ordinal AS effectOrdinal FROM command_effects ORDER BY event_id").all();
      return reply(response, 200, { pulseCount: pulses.length, pulses, absoluteInvocationCount: invocations.length, absoluteState: stateValue, controllerEffects });
    }
    if (request.method !== "POST") return reply(response, 404, { error: "not-found" });
    const body = await readBody(request);
    if (!valid(body)) return reply(response, 400, { error: "invalid-command" });
    if (url.pathname === "/pulse") {
      const ordinal = readLines(pulseLog).length + 1;
      appendDurable(pulseLog, { eventId: body.eventId, payloadSha256: body.payloadSha256, ordinal });
      return reply(response, 201, { status: "executed", ordinal });
    }
    if (url.pathname === "/absolute") {
      const ordinal = readLines(absoluteLog).length + 1;
      appendDurable(absoluteLog, { eventId: body.eventId, payloadSha256: body.payloadSha256, ordinal, target: 1 });
      const temp = `${absoluteState}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify({ target: 1, eventId: body.eventId, payloadSha256: body.payloadSha256 })}\n`, "utf8");
      const descriptor = fs.openSync(temp, "r");
      try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
      fs.renameSync(temp, absoluteState);
      return reply(response, 201, { status: "set", ordinal, target: 1 });
    }
    if (url.pathname === "/dedup") {
      const existing = db.prepare("SELECT event_id AS eventId,payload_sha256 AS payloadSha256,effect_ordinal AS effectOrdinal FROM command_effects WHERE event_id=?").get(body.eventId);
      if (existing) {
        if (existing.payloadSha256 !== body.payloadSha256) return reply(response, 409, { error: "idempotency-conflict" });
        return reply(response, 200, { ...existing, status: "replay" });
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        const ordinal = Number(db.prepare("SELECT COUNT(*) AS count FROM command_effects").get().count) + 1;
        db.prepare("INSERT INTO command_inbox(event_id,payload_sha256) VALUES(?,?)").run(body.eventId, body.payloadSha256);
        db.prepare("INSERT INTO command_effects(event_id,payload_sha256,effect_ordinal) VALUES(?,?,?)").run(body.eventId, body.payloadSha256, ordinal);
        db.exec("COMMIT");
        return reply(response, 201, { eventId: body.eventId, payloadSha256: body.payloadSha256, effectOrdinal: ordinal, status: "created" });
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    }
    return reply(response, 404, { error: "not-found" });
  } catch (error) { return reply(response, 500, { error: error.message }); }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.stdout.write(`${JSON.stringify({ ready: true, port: address.port, pid: process.pid, dir })}\n`);
});
const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
