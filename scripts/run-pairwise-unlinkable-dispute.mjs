import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const protocol = readJson("research/reproducibility/pairwise-unlinkable-dispute-protocol.json");
const SYNTHETIC_ROUTING_KEY = "rc33-public-synthetic-routing-key";
const SYNTHETIC_CUSTODY_KEY = "rc33-public-synthetic-custody-key";
const SYNTHETIC_AUDITOR_KEY = "rc33-public-synthetic-auditor-key";
const SYNTHETIC_STUDY_KEYS = {
  "STUDY-A": "rc33-public-synthetic-study-key-a",
  "STUDY-B": "rc33-public-synthetic-study-key-b",
  "STUDY-C": "rc33-public-synthetic-study-key-c"
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const sha256 = value => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonical(value)).digest("hex");
const hmac = (key, value) => crypto.createHmac("sha256", key).update(value).digest("hex");
const handle = (hop, study, column) => `${hop}-${hmac(SYNTHETIC_ROUTING_KEY, `${hop}\0${study}\0${column}`).slice(0, 32)}`;
const base64url = value => Buffer.from(value, "utf8").toString("base64url");
const shuffle = (records, order) => order.map(index => records[index]);
const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

const columns = [
  { column: "PACKAGE-X-FIRST", rawPackageId: "SYNTHETIC-PACKAGE-X", vendorCode: "VENDOR-GAMMA", outcomeClass: "genuine" },
  { column: "PACKAGE-X-REPEAT", rawPackageId: "SYNTHETIC-PACKAGE-X", vendorCode: "VENDOR-GAMMA", outcomeClass: "genuine" },
  { column: "PACKAGE-Y-FIRST", rawPackageId: "SYNTHETIC-PACKAGE-Y", vendorCode: "VENDOR-DELTA", outcomeClass: "substitution" }
];
const custodyRows = [];
const pseudonymizerRows = [];
const outcomeRows = [];
const auditorRows = [];
const ledgerRows = [];

for (let studyIndex = 0; studyIndex < protocol.matrix.studies.length; studyIndex++) {
  const studyId = protocol.matrix.studies[studyIndex];
  const letter = String.fromCharCode(65 + studyIndex);
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const item = columns[columnIndex];
    const c2p = handle("C2P", studyId, item.column);
    const p2o = handle("P2O", studyId, item.column);
    const auditRecordId = `AUDIT-${letter}-${columnIndex + 1}`;
    const ledgerEntryId = `LEDGER-${letter}-${columnIndex + 1}`;
    const custodyObservationId = `CUSTODY-${letter}-${columnIndex + 1}`;
    const normalized = item.rawPackageId.toUpperCase();
    const custodyToken = hmac(SYNTHETIC_CUSTODY_KEY, `custody-token-v2\0${studyId}\0${normalized}`);
    const commitment = hmac(SYNTHETIC_STUDY_KEYS[studyId], `study-package-v2\0${studyId}\0${custodyToken}`);
    const outcomeBinding = hmac(SYNTHETIC_STUDY_KEYS[studyId], `event-outcome-v2\0${p2o}\0${commitment}`);
    custodyRows.push({ studyId, syntheticRawPackageId: item.rawPackageId, custodyObservationId, custodyToPseudonymizerHandle: c2p, studyScopedCustodyToken: custodyToken });
    pseudonymizerRows.push({ studyId, custodyToPseudonymizerHandle: c2p, studyScopedCustodyToken: custodyToken, pseudonymizerToOutcomeHandle: p2o, finalPackageCommitment: commitment, eventOutcomeBinding: outcomeBinding });
    outcomeRows.push({ pseudonymizerToOutcomeHandle: p2o, eventOutcomeBinding: outcomeBinding, vendorCode: item.vendorCode, outcomeClass: item.outcomeClass });
    auditorRows.push({ auditRecordId, custodyToPseudonymizerHandle: c2p, pseudonymizerToOutcomeHandle: p2o, capabilityNonceDigest: sha256(`capability-nonce\0${auditRecordId}`) });
    ledgerRows.push({ ledgerEntryId, studyId, finalPackageCommitment: commitment, duplicateOfLedgerEntryId: columnIndex === 1 ? `LEDGER-${letter}-1` : null, custodyObservationDigest: sha256({ custodyObservationId, studyId, normalized }) });
  }
}

const custodyView = { viewId: "RC33-CUSTODY-VIEW", role: "custodyObserver", synthetic: true, records: shuffle(custodyRows, [0, 4, 8, 2, 6, 1, 7, 3, 5]) };
const pseudonymizerView = { viewId: "RC33-PSEUDONYMIZER-VIEW", role: "studyPseudonymizer", synthetic: true, records: shuffle(pseudonymizerRows, [5, 0, 7, 3, 8, 2, 4, 1, 6]) };
const outcomeView = { viewId: "RC33-OUTCOME-VIEW", role: "outcomeHolder", synthetic: true, records: shuffle(outcomeRows, [7, 2, 5, 1, 8, 3, 0, 6, 4]) };
const auditorRegistry = { viewId: "RC33-AUDITOR-REGISTRY", role: "independentAuditor", synthetic: true, records: shuffle(auditorRows, [3, 8, 1, 6, 4, 0, 7, 5, 2]) };
const publicLedger = {
  profile: "urn:unsolved-problems:pairwise-unlinkable-ledger:0.8",
  protocolId: protocol.protocolId,
  records: ledgerRows,
  ledgerDigest: "",
  qualification: "synthetic-message-graph-only"
};
publicLedger.ledgerDigest = sha256(without(publicLedger, "ledgerDigest"));

const capabilityPayload = {
  capabilityId: "CAP-RC33-B2",
  auditRecordId: protocol.matrix.disputedRecord.auditRecordId,
  disputeId: "DISPUTE-RC33-001",
  nonce: "6f8fc59e8ac11c42b19e2cc98e9f0ec2",
  expiresAt: "2026-08-15T00:00:00Z",
  maximumOpenings: 1
};
const encodedPayload = base64url(canonical(capabilityPayload));
const signature = hmac(SYNTHETIC_AUDITOR_KEY, encodedPayload);
const capability = {
  profile: "urn:unsolved-problems:dispute-opening-capability:0.8",
  synthetic: true,
  token: `${encodedPayload}.${signature}`,
  tokenDigest: sha256(`${encodedPayload}.${signature}`),
  publicClaims: { capabilityId: capabilityPayload.capabilityId, disputeId: capabilityPayload.disputeId, expiresAt: capabilityPayload.expiresAt, maximumOpenings: 1 },
  warning: "The bearer token and synthetic key are public test data. Stateful replay rejection, not token copying resistance, enforces one redemption in this fixture."
};

function decodeAndVerify(token) {
  const [payloadPart, macPart, extra] = token.split(".");
  if (!payloadPart || !macPart || extra) return { valid: false, code: "malformed" };
  const expected = hmac(SYNTHETIC_AUDITOR_KEY, payloadPart);
  const a = Buffer.from(macPart, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, code: "bad-mac" };
  try { return { valid: true, payload: JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")), tokenDigest: sha256(token) }; }
  catch { return { valid: false, code: "bad-payload" }; }
}

function resolver() {
  const redeemed = new Set();
  return (token, disputeId, adjudicatedAt) => {
    const checked = decodeAndVerify(token);
    if (!checked.valid) return { opened: false, code: checked.code };
    const payload = checked.payload;
    if (payload.disputeId !== disputeId) return { opened: false, code: "wrong-dispute" };
    if (payload.maximumOpenings !== 1) return { opened: false, code: "bad-opening-limit" };
    if (Date.parse(adjudicatedAt) > Date.parse(payload.expiresAt)) return { opened: false, code: "expired" };
    if (redeemed.has(checked.tokenDigest)) return { opened: false, code: "replay" };
    const row = auditorRows.find(item => item.auditRecordId === payload.auditRecordId);
    if (!row) return { opened: false, code: "unknown-audit-record" };
    redeemed.add(checked.tokenDigest);
    return { opened: true, code: "opened-one", bridgeCount: 1, bridge: { auditRecordId: row.auditRecordId, custodyToPseudonymizerHandle: row.custodyToPseudonymizerHandle, pseudonymizerToOutcomeHandle: row.pseudonymizerToOutcomeHandle }, redemptionDigest: checked.tokenDigest };
  };
}

const lowEntropyFields = new Set(["studyId", "vendorCode", "outcomeClass", "role", "viewId", "synthetic"]);
function values(row) {
  return Object.entries(row).filter(([field, value]) => !lowEntropyFields.has(field) && value !== null && typeof value === "string").map(([field, value]) => ({ field, value }));
}
function pairwisePaths(viewA, viewB, extraBridges = []) {
  const rows = [...viewA.records.map((row, index) => ({ ...row, node: `${viewA.role}:${index}` })), ...viewB.records.map((row, index) => ({ ...row, node: `${viewB.role}:${index}` })), ...extraBridges.map((row, index) => ({ ...row, node: `bridge:${index}` }))];
  const adjacency = new Map(rows.map(row => [row.node, new Set()]));
  const byValue = new Map();
  for (const row of rows) for (const { value } of values(row)) {
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push(row.node);
  }
  for (const nodes of byValue.values()) for (const left of nodes) for (const right of nodes) if (left !== right) adjacency.get(left).add(right);
  const rawNodes = rows.filter(row => "syntheticRawPackageId" in row);
  const outcomeNodes = new Set(rows.filter(row => "outcomeClass" in row).map(row => row.node));
  const links = [];
  for (const source of rawNodes) {
    const queue = [source.node];
    const seen = new Set(queue);
    while (queue.length) for (const next of adjacency.get(queue.shift()) || []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    for (const target of outcomeNodes) if (seen.has(target)) links.push({ rawPackageId: source.syntheticRawPackageId, source: source.node, target });
  }
  return links;
}

const normalPairs = [
  [custodyView, pseudonymizerView, "custody+pseudonymizer"],
  [custodyView, outcomeView, "custody+outcome"],
  [pseudonymizerView, outcomeView, "pseudonymizer+outcome"]
].map(([a, b, pair]) => {
  const paths = pairwisePaths(a, b);
  return { pair, deterministicRawOutcomePaths: paths.length, uniqueOutcomeRecordsLinked: new Set(paths.map(item => item.target)).size };
});
const allThreeView = { role: "pseudonymizer+outcome", records: [...pseudonymizerView.records, ...outcomeView.records] };
const threeRolePaths = pairwisePaths(custodyView, allThreeView);

const firstResolver = resolver();
const validOpening = firstResolver(capability.token, "DISPUTE-RC33-001", "2026-08-14T12:00:00Z");
const replayOpening = firstResolver(capability.token, "DISPUTE-RC33-001", "2026-08-14T12:01:00Z");
const wrongDispute = resolver()(capability.token, "DISPUTE-RC33-WRONG", "2026-08-14T12:00:00Z");
const expired = resolver()(capability.token, "DISPUTE-RC33-001", "2026-08-16T00:00:00Z");
const tamperedToken = `${encodedPayload}.${signature.slice(0, -1)}${signature.endsWith("0") ? "1" : "0"}`;
const tampered = resolver()(tamperedToken, "DISPUTE-RC33-001", "2026-08-14T12:00:00Z");
const openedPairPaths = validOpening.opened ? pairwisePaths(custodyView, outcomeView, [validOpening.bridge]) : [];
const openedOutcomeRecords = new Set(openedPairPaths.map(item => item.target)).size;

const forbiddenFields = {
  custody: custodyView.records.some(row => "pseudonymizerToOutcomeHandle" in row || "vendorCode" in row || "outcomeClass" in row),
  pseudonymizer: pseudonymizerView.records.some(row => "syntheticRawPackageId" in row || "vendorCode" in row || "outcomeClass" in row),
  outcome: outcomeView.records.some(row => "syntheticRawPackageId" in row || "custodyToPseudonymizerHandle" in row || "studyScopedCustodyToken" in row || "finalPackageCommitment" in row),
  auditor: auditorRegistry.records.some(row => "syntheticRawPackageId" in row || "vendorCode" in row || "outcomeClass" in row || "finalPackageCommitment" in row)
};
const handleIntersection = new Set(custodyView.records.map(row => row.custodyToPseudonymizerHandle));
const outcomeHandleIntersection = new Set(outcomeView.records.map(row => row.pseudonymizerToOutcomeHandle));
const noCrossHopHandleReuse = [...handleIntersection].every(value => !outcomeHandleIntersection.has(value));
const result = {
  resultId: "PAIRWISE-UNLINKABLE-DISPUTE-RESULT-0.8",
  computedOn: "2026-08-14",
  protocolId: protocol.protocolId,
  records: 9,
  globalEnrollmentIdPresent: [...custodyRows, ...pseudonymizerRows, ...outcomeRows, ...auditorRows, ...ledgerRows].some(row => "enrollmentId" in row),
  independentRoleOrders: new Set([custodyView, pseudonymizerView, outcomeView, auditorRegistry].map(view => view.records.map(row => row.custodyToPseudonymizerHandle || row.pseudonymizerToOutcomeHandle).join("|"))).size === 4,
  noCrossHopHandleReuse,
  forbiddenFields,
  normalPairs,
  normalPairTotalLinkedOutcomeRecords: normalPairs.reduce((sum, item) => sum + item.uniqueOutcomeRecordsLinked, 0),
  threeOperationalRoleLinkedOutcomeRecords: new Set(threeRolePaths.map(item => item.target)).size,
  disputeTests: {
    validOpening: { opened: validOpening.opened, code: validOpening.code, bridgeCount: validOpening.bridgeCount },
    openedPairRawOutcomePaths: openedPairPaths.length,
    openedUniqueOutcomeRecords: openedOutcomeRecords,
    replay: { opened: replayOpening.opened, code: replayOpening.code },
    wrongDispute: { opened: wrongDispute.opened, code: wrongDispute.code },
    expired: { opened: expired.opened, code: expired.code },
    tampered: { opened: tampered.opened, code: tampered.code }
  },
  hypotheses: {
    U1_pairwiseTransportHandlesPreventNormalTwoRoleRawOutcomeJoin: normalPairs.every(item => item.uniqueOutcomeRecordsLinked === 0),
    U2_scopedStatefulCapabilityOpensExactlyOneAndRejectsNegativeControls: validOpening.opened && validOpening.bridgeCount === 1 && openedOutcomeRecords === 1 && [replayOpening, wrongDispute, expired, tampered].every(item => !item.opened),
    U3_pairwiseHandleSeparationAndVoprfAreInterchangeablePrivacyClaims: false
  },
  qualification: {
    syntheticMessageGraph: "pass",
    oneTimeCapabilityResolver: "pass-in-stateful-synthetic-fixture",
    twoRoleDeterministicJoinResistance: "pass-for-enumerated-fields-and-pairs",
    threeRoleCollusionResistance: "failed-as-expected",
    timingAndTrafficAnalysis: "untested",
    productionAnonymity: "unqualified",
    physicalCustody: "unqualified"
  },
  viewDigests: Object.fromEntries([["custody", custodyView], ["pseudonymizer", pseudonymizerView], ["outcome", outcomeView], ["auditor", auditorRegistry], ["publicLedger", publicLedger], ["capability", capability]].map(([name, value]) => [name, sha256(value)])),
  conclusion: "Removing the global enrollment ID and using independent hop handles reduces deterministic raw-to-outcome joins to zero for all three normal two-role unions in this nine-record synthetic graph. A stateful capability opens exactly one disputed bridge and rejects four negative controls. All three operational roles still reconstruct all nine links, and timing, public demo keys, physical custody, and real anonymity remain unqualified."
};

const outputs = {
  "research/reproducibility/pairwise-custody-view.json": custodyView,
  "research/reproducibility/pairwise-pseudonymizer-view.json": pseudonymizerView,
  "research/reproducibility/pairwise-outcome-view.json": outcomeView,
  "research/reproducibility/pairwise-auditor-registry.json": auditorRegistry,
  "research/reproducibility/pairwise-public-ledger.json": publicLedger,
  "research/reproducibility/dispute-opening-capability.json": capability,
  "research/reproducibility/pairwise-unlinkable-dispute-result.json": result
};
for (const [relative, value] of Object.entries(outputs)) {
  const file = path.join(root, relative);
  if (process.argv.includes("--write")) fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  else if (canonical(readJson(relative)) !== canonical(value)) throw new Error(`${relative} differs from the committed RC33 artifact.`);
}
if (!result.hypotheses.U1_pairwiseTransportHandlesPreventNormalTwoRoleRawOutcomeJoin || !result.hypotheses.U2_scopedStatefulCapabilityOpensExactlyOneAndRejectsNegativeControls || result.hypotheses.U3_pairwiseHandleSeparationAndVoprfAreInterchangeablePrivacyClaims) throw new Error("RC33 hypothesis adjudication failed.");
console.log(`RC33 message graph reproduced: ${result.normalPairTotalLinkedOutcomeRecords} normal pair outcomes, ${result.disputeTests.openedUniqueOutcomeRecords} authorized outcome, ${result.threeOperationalRoleLinkedOutcomeRecords} three-role outcomes; physical n=0.`);
