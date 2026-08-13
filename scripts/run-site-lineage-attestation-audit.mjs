import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const protocol = load("research/reproducibility/site-lineage-interface-protocol.json");
const fixtures = load("research/reproducibility/site-lineage-adversarial-fixtures.json");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const clone = value => JSON.parse(JSON.stringify(value));
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

function powderSignal(variant = 0) {
  const rows = [];
  const peaks = variant === 0 ? [[24.8, 1.0, 0.35], [28.7, 0.7, 0.42], [42.9, 0.45, 0.55]] : [[22.6, 0.8, 0.40], [33.1, 1.0, 0.50], [47.4, 0.52, 0.38]];
  for (let i = 0; i <= 160; i += 1) {
    const x = 20 + i * 0.25;
    const y = 0.05 + peaks.reduce((sum, [centre, height, width]) => sum + height * Math.exp(-0.5 * ((x - centre) / width) ** 2), 0);
    rows.push([x, y]);
  }
  return rows;
}

function encode(rows, style = "plain") {
  if (style === "reencoded") return rows.map(([x, y]) => `${x.toExponential(8)} , ${y.toExponential(10)}`).join("\r\n") + "\r\n";
  return rows.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(8)}`).join("\n") + "\n";
}

function parseSignal(raw) {
  return raw.trim().split(/\r?\n/).map((line, row) => {
    const cells = line.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cells.length !== 2 || cells.some(value => !Number.isFinite(value))) throw new Error(`invalid signal row ${row + 1}`);
    return cells;
  });
}

function canonicalSignal(raw) {
  return parseSignal(raw).map(([x, y]) => `${x.toFixed(6)},${y.toFixed(8)}`).join("\n");
}

function interpolate(rows, x) {
  if (x <= rows[0][0]) return rows[0][1];
  if (x >= rows.at(-1)[0]) return rows.at(-1)[1];
  let low = 0;
  let high = rows.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (rows[mid][0] <= x) low = mid;
    else high = mid;
  }
  const [x0, y0] = rows[low];
  const [x1, y1] = rows[high];
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
}

function fingerprint(raw) {
  const rows = parseSignal(raw).sort((a, b) => a[0] - b[0]);
  const vector = Array.from({ length: 161 }, (_, i) => interpolate(rows, 20 + i * 0.25));
  const mean = vector.reduce((sum, value) => sum + value, 0) / vector.length;
  const centered = vector.map(value => value - mean);
  const norm = Math.sqrt(centered.reduce((sum, value) => sum + value ** 2, 0));
  return centered.map(value => value / norm);
}

function cosine(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function exportRecord(acquisitionId, aliquotId, counter, raw) {
  const canonical = canonicalSignal(raw);
  return {
    acquisitionId,
    aliquotId,
    instrumentSessionId: "MOCK-XRPD-SESSION-001",
    deviceId: "MOCK-XRPD-EMULATOR",
    deviceMonotonicCounter: counter,
    startedAt: `2026-08-14T00:0${counter}:00Z`,
    stoppedAt: `2026-08-14T00:0${counter}:30Z`,
    rawByteSha256: sha(raw),
    canonicalSignalSha256: sha(canonical),
    signalFingerprint: fingerprint(raw).map(value => Number(value.toFixed(12))),
    metadataSha256: sha(`MOCK-XRPD-SESSION-001|${counter}|${aliquotId}`),
    receiptClass: "synthetic-emulator",
    raw
  };
}

function hashEvents(events) {
  let previous = "GENESIS";
  return events.map((event, index) => {
    const body = { sequence: index + 1, type: event.type, actorId: event.actorId, actorRole: event.actorRole, payload: event.payload };
    const linked = { ...body, previousEventSha256: previous };
    const eventSha256 = sha(stable(linked));
    previous = eventSha256;
    return { ...linked, eventSha256 };
  });
}

function buildValidLedger() {
  const armMap = { "MOCK-AQ-001": "fine|stationary-flat-plate", "MOCK-AQ-002": "mixed-coarse|rotating-capillary" };
  const salt = "DEMO-ONLY-NOT-A-SECRET-OR-SITE-KEY";
  const commitmentSha256 = sha(`${protocol.protocolId}\n${salt}\n${stable(armMap)}`);
  const exports = [
    exportRecord("MOCK-ACQ-001", "MOCK-AQ-001", 1, encode(powderSignal(0))),
    exportRecord("MOCK-ACQ-002", "MOCK-AQ-002", 2, encode(powderSignal(1)))
  ];
  const labels = [
    { aliquotId: "MOCK-AQ-001", parentSampleId: "MOCK-SAMPLE-001", machineReadable: "MOCK-AQ-001", humanReadable: "MOCK-AQ-001" },
    { aliquotId: "MOCK-AQ-002", parentSampleId: "MOCK-SAMPLE-002", machineReadable: "MOCK-AQ-002", humanReadable: "MOCK-AQ-002" }
  ];
  const analyses = exports.map(row => ({ analysisId: `${row.acquisitionId}-ANALYSIS`, acquisitionId: row.acquisitionId, sealedOutputSha256: sha(`${row.acquisitionId}|analysis|sealed`) }));
  const events = hashEvents([
    { type: "planned", actorId: "PREP-A", actorRole: "preparer", payload: { protocolId: protocol.protocolId } },
    { type: "label-bound", actorId: "PREP-A", actorRole: "preparer", payload: { aliquotIds: labels.map(row => row.aliquotId) } },
    { type: "acquisition-started", actorId: "OP-B", actorRole: "acquisitionOperator", payload: { acquisitionIds: exports.map(row => row.acquisitionId) } },
    { type: "acquisition-stopped", actorId: "OP-B", actorRole: "acquisitionOperator", payload: { counters: exports.map(row => row.deviceMonotonicCounter) } },
    { type: "export-registered", actorId: "OP-B", actorRole: "acquisitionOperator", payload: { rawByteSha256: exports.map(row => row.rawByteSha256) } },
    { type: "analysis-sealed", actorId: "ANALYST-C", actorRole: "analyst", payload: { outputs: analyses.map(row => row.sealedOutputSha256) } },
    { type: "key-released", actorId: "CUSTODIAN-D", actorRole: "independentCustodian", payload: { armMap, salt, commitmentSha256 } }
  ]);
  return {
    protocolId: protocol.protocolId,
    mode: "synthetic-interface-only",
    requestedPhysicalClaim: false,
    roles: { preparer: "PREP-A", acquisitionOperator: "OP-B", analyst: "ANALYST-C", independentCustodian: "CUSTODIAN-D" },
    expectedAcquisitionIds: exports.map(row => row.acquisitionId),
    acquisitionParents: { "MOCK-ACQ-001": "MOCK-AQ-001", "MOCK-ACQ-002": "MOCK-AQ-002" },
    labels,
    commitmentSha256,
    exports,
    analyses,
    events
  };
}

function refreshExport(row) {
  const rebuilt = exportRecord(row.acquisitionId, row.aliquotId, row.deviceMonotonicCounter, row.raw);
  Object.assign(row, rebuilt);
}

function mutate(base, mutation) {
  const ledger = clone(base);
  if (mutation === "none") return ledger;
  if (mutation === "swap-label-parent") ledger.exports[0].aliquotId = "MOCK-AQ-002";
  if (mutation === "remove-required-export") ledger.exports.pop();
  if (mutation === "syntax-reencoded-copy") {
    ledger.exports[1].raw = encode(parseSignal(ledger.exports[0].raw), "reencoded");
    refreshExport(ledger.exports[1]);
  }
  if (mutation === "regridded-scaled-near-copy") {
    const changed = parseSignal(ledger.exports[0].raw).map(([x, y]) => [x + 0.001, y * 1.05 + 0.002]);
    ledger.exports[1].raw = encode(changed);
    refreshExport(ledger.exports[1]);
  }
  if (mutation === "legitimate-high-similarity-repeat") {
    const changed = parseSignal(ledger.exports[0].raw).map(([x, y], index) => [x, y + 0.00012 * Math.sin(index * 0.73)]);
    ledger.exports[1].raw = encode(changed);
    refreshExport(ledger.exports[1]);
  }
  if (mutation === "invert-event-order") {
    const start = ledger.events.find(row => row.type === "acquisition-started");
    const stop = ledger.events.find(row => row.type === "acquisition-stopped");
    [start.type, stop.type] = [stop.type, start.type];
    ledger.events = hashEvents(ledger.events.map(({ type, actorId, actorRole, payload }) => ({ type, actorId, actorRole, payload })));
  }
  if (mutation === "release-key-before-analysis-seal") {
    const rows = ledger.events.map(({ type, actorId, actorRole, payload }) => ({ type, actorId, actorRole, payload }));
    const release = rows.pop();
    rows.splice(4, 0, release);
    ledger.events = hashEvents(rows);
  }
  if (mutation === "open-wrong-commitment") {
    const release = ledger.events.find(row => row.type === "key-released");
    release.payload.salt = "WRONG-DEMO-SALT";
    ledger.events = hashEvents(ledger.events.map(({ type, actorId, actorRole, payload }) => ({ type, actorId, actorRole, payload })));
  }
  if (mutation === "collapse-analyst-and-custodian") ledger.roles.independentCustodian = ledger.roles.analyst;
  if (mutation === "reuse-device-counter") ledger.exports[1].deviceMonotonicCounter = ledger.exports[0].deviceMonotonicCounter;
  if (mutation === "break-event-chain") ledger.events[4].previousEventSha256 = "0".repeat(64);
  if (mutation === "machine-human-label-mismatch") ledger.labels[0].humanReadable = "MOCK-AQ-999";
  if (mutation === "claim-physical-with-emulator-receipt") ledger.requestedPhysicalClaim = true;
  return ledger;
}

function validate(ledger) {
  const errors = [];
  const quarantines = [];
  const add = (bucket, code) => { if (!bucket.includes(code)) bucket.push(code); };
  const labelById = new Map(ledger.labels.map(row => [row.aliquotId, row]));
  for (const label of ledger.labels) if (label.machineReadable !== label.humanReadable || label.machineReadable !== label.aliquotId) add(errors, "E_LABEL_DUAL");
  if (ledger.expectedAcquisitionIds.some(id => !ledger.exports.some(row => row.acquisitionId === id))) add(errors, "E_EXPORT_COMPLETENESS");
  for (const row of ledger.exports) {
    if (!labelById.has(row.aliquotId) || ledger.acquisitionParents[row.acquisitionId] !== row.aliquotId) add(errors, "E_LABEL_PARENT");
    if (row.rawByteSha256 !== sha(row.raw) || row.canonicalSignalSha256 !== sha(canonicalSignal(row.raw))) add(errors, "E_EXPORT_DIGEST");
  }
  const canonicalOwners = new Map();
  for (const row of ledger.exports) {
    const owner = canonicalOwners.get(row.canonicalSignalSha256);
    if (owner && owner !== row.acquisitionId) add(errors, "E_CANONICAL_DUPLICATE");
    canonicalOwners.set(row.canonicalSignalSha256, row.acquisitionId);
  }
  for (let i = 0; i < ledger.exports.length; i += 1) for (let j = i + 1; j < ledger.exports.length; j += 1) {
    if (ledger.exports[i].canonicalSignalSha256 === ledger.exports[j].canonicalSignalSha256) continue;
    if (cosine(fingerprint(ledger.exports[i].raw), fingerprint(ledger.exports[j].raw)) >= 0.999) add(quarantines, "Q_SIMILARITY_AMBIGUOUS");
  }
  const counters = ledger.exports.map(row => row.deviceMonotonicCounter);
  if (new Set(counters).size !== counters.length || counters.some((value, index) => index && value <= counters[index - 1])) add(errors, "E_DEVICE_COUNTER");
  if (new Set(Object.values(ledger.roles)).size !== Object.values(ledger.roles).length) add(errors, "E_ROLE_SEPARATION");
  const expectedStates = protocol.eventStateMachine;
  const observedStates = ledger.events.map(row => row.type);
  if (observedStates.length !== expectedStates.length || observedStates.some((state, index) => state !== expectedStates[index])) {
    if (observedStates.indexOf("key-released") < observedStates.indexOf("analysis-sealed")) add(errors, "E_EARLY_UNBLIND");
    else add(errors, "E_EVENT_ORDER");
  }
  let previous = "GENESIS";
  for (const event of ledger.events) {
    const body = { sequence: event.sequence, type: event.type, actorId: event.actorId, actorRole: event.actorRole, payload: event.payload, previousEventSha256: previous };
    if (event.previousEventSha256 !== previous || event.eventSha256 !== sha(stable(body))) add(errors, "E_EVENT_CHAIN");
    previous = event.eventSha256;
  }
  const release = ledger.events.find(row => row.type === "key-released");
  if (release) {
    const opened = sha(`${protocol.protocolId}\n${release.payload.salt}\n${stable(release.payload.armMap)}`);
    if (opened !== ledger.commitmentSha256 || release.payload.commitmentSha256 !== ledger.commitmentSha256) add(errors, "E_COMMITMENT_OPEN");
  }
  if (ledger.requestedPhysicalClaim && ledger.exports.some(row => !["device-signed", "independent-witness"].includes(row.receiptClass))) add(errors, "E_ATTESTATION_MISSING");
  const verdict = errors.length ? "reject" : quarantines.length ? "quarantine" : "accept-interface";
  return { verdict, errors, quarantines };
}

const validLedger = buildValidLedger();
const fixtureResults = fixtures.tests.map(fixture => {
  const ledger = mutate(validLedger, fixture.mutation);
  const audit = validate(ledger);
  const observedCodes = [...audit.errors, ...audit.quarantines];
  return {
    id: fixture.id,
    expectedVerdict: fixture.expectedVerdict,
    observedVerdict: audit.verdict,
    expectedCode: fixture.expectedCode,
    observedCodes,
    detectedAsSpecified: audit.verdict === fixture.expectedVerdict && (fixture.expectedCode === null || observedCodes.includes(fixture.expectedCode))
  };
});
const transformed = mutate(validLedger, "regridded-scaled-near-copy");
const legitimate = mutate(validLedger, "legitimate-high-similarity-repeat");
const similarities = {
  transformedCopy: Number(cosine(fingerprint(transformed.exports[0].raw), fingerprint(transformed.exports[1].raw)).toFixed(9)),
  legitimateRepeat: Number(cosine(fingerprint(legitimate.exports[0].raw), fingerprint(legitimate.exports[1].raw)).toFixed(9)),
  unrelatedSignals: Number(cosine(fingerprint(validLedger.exports[0].raw), fingerprint(validLedger.exports[1].raw)).toFixed(9)),
  quarantineThreshold: 0.999
};
const output = {
  auditId: "SITE-LINEAGE-ATTESTATION-AUDIT-0.3",
  computedOn: "2026-08-14",
  status: "synthetic-interface-and-impossibility-control-complete",
  denominators: { fixtures: fixtureResults.length, adversarialFixtures: fixtureResults.length - 1, exactRejections: 11, ambiguousControls: 2 },
  validFixture: { verdict: validate(validLedger).verdict, physicalClaim: false, receiptClass: "synthetic-emulator", ledgerSha256: sha(stable(validLedger)) },
  fixtureResults,
  similarities,
  indistinguishableWorlds: {
    worldA: "A legitimate repeat is newly acquired and exports the same numeric array as a prior acquisition.",
    worldB: "A prior array is copied or re-encoded and supplied with forged acquisition metadata.",
    observationAvailableToContentOnlyRule: "The exported numeric arrays and claimed metadata are identical in both worlds.",
    consequence: "Every content-only decision rule receives the same input in both worlds and therefore cannot distinguish physical occurrence without an independent acquisition receipt or witness."
  },
  decisions: {
    H1_byteDigestProvesNewAcquisition: false,
    H2_canonicalDigestDetectsSyntaxReencoding: true,
    H3_tolerantFingerprintUniquelyProvesCopying: false,
    H4_eventChainAndCommitmentDetectSealedViolations: true,
    H5_contentOnlyRuleDistinguishesPhysicalOccurrence: false,
    H6_emulatorReceiptQualifiesPhysicalSite: false,
    H7_responseFingerprintAloneProvesChipletProvenance: false,
    H8_independentAcquisitionRootRequired: true
  },
  readiness: {
    "L1-IDENTITY": "passed-in-synthetic-interface-only",
    "L2-EXPORT": "passed-in-synthetic-interface-only",
    "L3-CUSTODY": "passed-with-disclosed-demo-key-only",
    "L4-ATTESTATION": "not-demonstrated",
    "L5-PHYSICAL": "not-demonstrated"
  },
  interpretation: {
    established: "The synthetic interface detects every sealed deterministic violation, separates exact canonical duplicates from ambiguous near-duplicates, and preserves the physical-occurrence impossibility boundary.",
    rejected: "Neither a byte digest nor a tolerant signal fingerprint establishes that a new measurement occurred; the same limitation applies to an unauthenticated chiplet response fingerprint.",
    notEstablished: "No barcode scanner, physical container, instrument export, offline custodian, signed device receipt, institutional witness, powder, or chiplet was tested."
  }
};

if (!fixtureResults.every(row => row.detectedAsSpecified)) {
  console.error(JSON.stringify(output, null, 2));
  throw new Error("RC28 site-lineage fixture mismatch");
}
if (process.argv.includes("--emit-ledger")) console.log(JSON.stringify(validLedger, null, 2));
else if (process.argv.includes("--emit")) console.log(JSON.stringify(output, null, 2));
else {
  const expected = load("research/reproducibility/site-lineage-attestation-result.json");
  if (JSON.stringify(output) !== JSON.stringify(expected)) throw new Error("RC28 site-lineage result differs from committed artifact");
  console.log("RC28 site-lineage audit reproduced: 13/13 adversarial fixtures matched, including two ambiguity quarantines; no physical occurrence is claimed.");
}
