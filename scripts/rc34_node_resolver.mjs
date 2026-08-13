import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 === 0 ? [...pairs, [value.replace(/^--/, ""), all[index + 1]]] : pairs, []));
const store = path.resolve(args.store);
const attempts = Number(args.attempts || 1);
const resolverId = args.resolver || "NODE-RESOLVER";
const mode = args.mode || "race";
const capability = JSON.parse(fs.readFileSync(args.capability, "utf8"));
const registry = JSON.parse(fs.readFileSync(args.registry, "utf8"));
const outcomes = JSON.parse(fs.readFileSync(args.outcomes, "utf8"));
const AUDITOR_KEY = "rc33-public-synthetic-auditor-key";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const sha = value => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : canonical(value)).digest("hex");
const hmac = value => crypto.createHmac("sha256", AUDITOR_KEY).update(value).digest("hex");
const decode = token => {
  const [payloadPart, signature] = token.split(".");
  if (hmac(payloadPart) !== signature) throw new Error("bad MAC");
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  if (payload.maximumOpenings !== 1 || payload.disputeId !== capability.publicClaims.disputeId) throw new Error("bad capability scope");
  return payload;
};
const payload = decode(capability.token);
const bridge = registry.records.find(item => item.auditRecordId === payload.auditRecordId);
const outcome = outcomes.records.find(item => item.pseudonymizerToOutcomeHandle === bridge.pseudonymizerToOutcomeHandle);
if (!bridge || !outcome) throw new Error("capability bridge unresolved");

const claimPath = path.join(store, "claim.json");
const receiptPath = path.join(store, "receipt.json");
const outcomePath = path.join(store, "outcome.json");
const startGate = args["start-gate"] ? path.resolve(args["start-gate"]) : null;
const responsePath = args.response ? path.resolve(args.response) : null;
fs.mkdirSync(store, { recursive: true });

function durableExclusive(file, value) {
  const descriptor = fs.openSync(file, "wx");
  try { fs.writeFileSync(descriptor, JSON.stringify(value)); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function claimValue() {
  const value = {
    capabilityDigest: capability.tokenDigest,
    capabilityId: payload.capabilityId,
    auditRecordId: payload.auditRecordId,
    disputeId: payload.disputeId,
    resolverId,
    state: "claimed",
  };
  return { ...value, claimDigest: sha(value) };
}

function receiptValue(claim) {
  const value = {
    receiptId: `RECEIPT-${sha(claim.claimDigest).slice(0, 24)}`,
    claimDigest: claim.claimDigest,
    capabilityDigest: capability.tokenDigest,
    auditRecordId: payload.auditRecordId,
    eventOutcomeBinding: outcome.eventOutcomeBinding,
    resolverId,
    state: "receipt-durable-before-release",
  };
  return { ...value, receiptDigest: sha(value) };
}

function attempt(index) {
  const claim = claimValue();
  try { durableExclusive(claimPath, claim); } catch (error) {
    if (error.code === "EEXIST") return { resolverId, attempt: index, status: "replay" };
    throw error;
  }
  if (mode === "crash-after-claim") return { resolverId, attempt: index, status: "claimed-then-crashed" };
  const receipt = receiptValue(claim);
  durableExclusive(receiptPath, receipt);
  const released = { receiptDigest: receipt.receiptDigest, eventOutcomeBinding: outcome.eventOutcomeBinding, vendorCode: outcome.vendorCode, outcomeClass: outcome.outcomeClass, releaseOrder: ["claim", "receipt", "outcome"] };
  durableExclusive(outcomePath, released);
  return { resolverId, attempt: index, status: "opened-one", receiptDigest: receipt.receiptDigest, outcome: released };
}

async function waitForGate() {
  if (!startGate) return;
  while (!fs.existsSync(startGate)) await new Promise(resolve => setTimeout(resolve, 2));
}

await waitForGate();
const responses = await Promise.all(Array.from({ length: attempts }, (_, index) => Promise.resolve().then(() => attempt(index))));
if (responsePath) fs.writeFileSync(responsePath, JSON.stringify(responses));
if (mode === "crash-after-claim") process.exit(86);
process.stdout.write(JSON.stringify({ resolverId, attempts, opened: responses.filter(item => item.status === "opened-one").length, replay: responses.filter(item => item.status === "replay").length }));
