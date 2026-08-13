import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const spec = readJson("research/reproducibility/hidden-vendor-attestation-spec.json");
const protocol = readJson("research/reproducibility/unseen-attestation-protocol.json");
const corpusPath = "research/reproducibility/unseen-attestation-corpus.json.gz";
const manifestPath = "research/reproducibility/unseen-attestation-corpus-manifest.json";
const STUDY_ID = "RC31-HIDDEN-VENDOR-PILOT";
const SYNTHETIC_STUDY_KEY = "synthetic-public-demo-key-not-for-production";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const hash = value => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : canonical(value)).digest("hex");
const hmac = value => crypto.createHmac("sha256", SYNTHETIC_STUDY_KEY).update(`physical-package-v1\u0000${STUDY_ID}\u0000${value}`).digest("hex");
const clone = value => structuredClone(value);
const without = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([name]) => !keys.includes(name)));

function attachDigest(object, field) {
  object[field] = hash(without(object, field));
  return object;
}

function buildPolicy() {
  const policy = { ...clone(spec.frozenPolicy), frozenAt: spec.sealedTimeline.policyFrozenAt };
  policy.digest = hash(without(policy, "digest"));
  return policy;
}

function rebuildTrace(trace) {
  let previous = null;
  for (const event of trace.events) {
    event.previousDigest = previous;
    event.eventDigest = hash(without(event, "eventDigest", "statementDigest"));
    event.statementDigest = hash({ eventDigest: event.eventDigest, actorId: event.actorId });
    previous = event.eventDigest;
  }
  trace.headDigest = previous;
  trace.receipt.statementDigest = trace.events.at(-1).statementDigest;
  trace.receipt.receiptDigest = hash(without(trace.receipt, "receiptDigest"));
}

function buildTrace() {
  const packageId = "PKG-GAMMA-001";
  const componentId = "DIE-GAMMA-001";
  const subjectDigest = hash({ packageId, componentId });
  const actors = ["ORG-VENDOR-GAMMA", "ORG-ASSEMBLER", "ORG-LOGISTICS", "ORG-RECEIVER"];
  const eventTypes = ["die-manufactured", "package-assembled", "custody-transferred", "package-received"];
  const trace = {
    profile: "urn:unsolved-problems:chiplet-trace:0.5",
    traceId: "TRACE-GAMMA-001",
    subject: { packageId, componentIds: [componentId] },
    events: eventTypes.map((eventType, index) => ({
      sequence: index + 1,
      eventType,
      actorId: actors[index],
      occurredAt: `2026-08-14T00:0${index}:00Z`,
      subjectDigest,
      previousDigest: null,
      eventDigest: "0".repeat(64),
      statementDigest: "0".repeat(64)
    })),
    headDigest: "0".repeat(64),
    receipt: { serviceId: "TS-SYNTHETIC-1", statementDigest: "0".repeat(64), issuedAt: "2026-08-14T00:04:30Z", receiptDigest: "0".repeat(64) }
  };
  rebuildTrace(trace);
  return trace;
}

function buildRegistry(policy) {
  const environments = [];
  for (const vendor of ["VENDOR-ALPHA", "VENDOR-BETA"]) for (const processFamily of ["P1", "P2"]) for (const lot of ["LOT-1", "LOT-2", "LOT-3"]) {
    environments.push({
      environmentId: `ENV-${vendor.replace("VENDOR-", "")}-${processFamily}-${lot.replace("LOT-", "L")}`,
      vendor, processFamily, lot,
      measurement: { kind: "physical-response-distance", acceptMaximum: 0.08, quarantineMaximum: 0.16, contextModel: "linear-temperature-voltage-age-v1" },
      authorizedBy: "KEY-REFERENCE-1"
    });
  }
  return attachDigest({
    profile: "urn:unsolved-problems:chiplet-reference-registry:0.5",
    registryId: "REG-CHIPLET-05",
    version: "REF-5",
    issuedAt: "2026-08-14T00:04:00Z",
    authority: { organizationId: "ORG-REFERENCE-LAB", competence: "chiplet-physical-reference-provider", keyId: "KEY-REFERENCE-1" },
    validity: { notBefore: "2026-08-14T00:00:00Z", notAfter: "2027-08-14T00:00:00Z" },
    environments,
    policyDigest: policy.digest
  }, "registryDigest");
}

function buildRevocation() {
  return attachDigest({
    profile: "urn:unsolved-problems:chiplet-revocation:0.5",
    snapshotId: "REV-SNAPSHOT-05",
    sequence: 5,
    issuedAt: "2026-08-14T00:05:30Z",
    nextUpdate: "2026-08-15T00:05:30Z",
    issuer: { organizationId: "ORG-INDEPENDENT-REVOCATION", keyId: "KEY-INDEPENDENT-REVOCATION-1" },
    revoked: []
  }, "snapshotDigest");
}

function buildLedger(policy) {
  const units = [];
  const classes = ["genuine", "replay", "substitution", "tamper", "trace-forgery"];
  const vendors = ["V1", "V2", "HIDDEN-V3"];
  for (const className of classes) for (const vendorCode of vendors) for (const processFamily of ["P1", "P2"]) for (const lot of ["LOT-1", "LOT-2", "LOT-3"]) for (let replicate = 1; replicate <= 17; replicate++) {
    const serial = String(units.length + 1).padStart(4, "0");
    const token = `${className}-${vendorCode}-${processFamily}-${lot}-${replicate}`.toUpperCase();
    units.push({
      unitId: `U-${serial}`,
      physicalPackageDigest: hmac(token),
      acquisitionId: `ACQ-${serial}`,
      class: className,
      vendorCode,
      processFamily,
      lot,
      clusterId: `CL-${vendorCode}-${processFamily}-${lot}`,
      primaryUse: "adjudication-only",
      adjudication: "pending"
    });
  }
  return attachDigest({
    profile: "urn:unsolved-problems:claim-denominator-ledger:0.5",
    ledgerId: "LEDGER-HIDDEN-VENDOR-05",
    frozenAt: spec.sealedTimeline.adjudicationLedgerFrozenAt,
    hiddenVendorCommittedAt: spec.sealedTimeline.hiddenVendorCommittedAt,
    hiddenVendorRevealedAt: spec.sealedTimeline.hiddenVendorRevealedAt,
    policyDigest: policy.digest,
    independentUnit: "one-physical-package-measured-once-for-primary-adjudication",
    classes,
    balance: { vendors: 3, processFamilies: 2, lotsPerVendorProcess: 3, cellsPerClass: 18, unitsPerCellPerClass: 17, unitsPerClass: 306, totalUnits: 1530 },
    exclusions: ["known-root-compromise", "silent-full-compromise"],
    units
  }, "ledgerDigest");
}

function buildEvidence(policy, trace) {
  const evidence = {
    profile: "urn:unsolved-problems:chiplet-evidence:0.5",
    cmw: { mediaType: "application/cmw+json", indicator: "evidence" },
    evidenceId: "EV-GAMMA-0001",
    issuedAt: "2026-08-14T01:00:30Z",
    nonce: policy.nonce,
    counter: 42,
    attester: { instanceId: "PKG-GAMMA-001", keyId: "KEY-GAMMA-001", endorserId: "ORG-VENDOR-GAMMA" },
    target: { componentId: "DIE-GAMMA-001", vendor: "VENDOR-GAMMA", processFamily: "P1", lot: "LOT-1", packageId: "PKG-GAMMA-001" },
    traceHead: trace.headDigest,
    measurements: [
      { measurementUnitId: "MU-PDN-001", kind: "physical-response-distance", value: 0.052, unit: "normalized-distance", uncertainty: 0.009, context: { temperatureC: 35, voltageV: 1.0, ageHours: 500 } },
      { measurementUnitId: "MU-TRACE-001", kind: "trace-digest", value: trace.headDigest, unit: "sha-256", uncertainty: 0, context: { temperatureC: 35, voltageV: 1.0, ageHours: 500 } }
    ],
    referenceVersion: policy.referenceVersion,
    policyDigest: policy.digest
  };
  refreshEvidence(evidence);
  return evidence;
}

function refreshEvidence(evidence) {
  const payload = without(evidence, "demonstrationIntegrity");
  evidence.demonstrationIntegrity = {
    algorithm: "sha-256-demo-binding-not-a-signature",
    keyId: evidence.attester.keyId,
    digest: hash(`${canonical(payload)}:${evidence.attester.keyId}`)
  };
}

function refreshPolicyBindings(bundle) {
  bundle.policy.digest = hash(without(bundle.policy, "digest"));
  bundle.evidence.policyDigest = bundle.policy.digest;
  bundle.registry.policyDigest = bundle.policy.digest;
  bundle.ledger.policyDigest = bundle.policy.digest;
  refreshEvidence(bundle.evidence);
  bundle.registry.registryDigest = hash(without(bundle.registry, "registryDigest"));
  bundle.ledger.ledgerDigest = hash(without(bundle.ledger, "ledgerDigest"));
}

function timestampPayload(bundle) {
  return {
    policyDigest: bundle.policy.digest,
    evidenceDigest: bundle.evidence.demonstrationIntegrity.digest,
    traceHead: bundle.trace.headDigest,
    registryDigest: bundle.registry.registryDigest,
    revocationDigest: bundle.revocation.snapshotDigest,
    ledgerDigest: bundle.ledger.ledgerDigest,
    packageCommitment: bundle.packageCommitment.commitment
  };
}

function refreshTimestamp(bundle) {
  bundle.timestampRecord.payloadDigest = hash(timestampPayload(bundle));
}

function buildBundle() {
  const policy = buildPolicy();
  const trace = buildTrace();
  const ledger = buildLedger(policy);
  const bundle = {
    manifest: {
      bundleId: "BUNDLE-UNSEEN-RC31",
      generatedAt: "2026-08-14T01:00:40Z",
      adjudicatedAt: "2026-08-14T01:02:30Z",
      studyId: STUDY_ID,
      preRevealMaterials: ["V1", "V2", spec.hiddenVendorDesign.hiddenVendorCommitment],
      committedPolicyDigest: policy.digest,
      hardwareDevicesTested: 0,
      counterWorld: null
    },
    policy,
    evidence: buildEvidence(policy, trace),
    trace,
    registry: buildRegistry(policy),
    revocation: buildRevocation(),
    ledger,
    packageCommitment: {
      profile: "urn:unsolved-problems:physical-package-commitment:0.6",
      studyId: STUDY_ID,
      scopeKeyId: "KEY-STUDY-RC31-01",
      algorithm: "hmac-sha-256",
      commitment: hmac("PKG-GAMMA-001"),
      enrollmentAuthority: "ORG-INDEPENDENT-ENROLLMENT",
      custodyObservationId: "CUSTODY-SYNTHETIC-001",
      createdAt: "2026-08-14T00:06:30Z",
      privacyQualification: "synthetic-only"
    },
    timestampRecord: {
      profile: "urn:unsolved-problems:adjudication-timestamp:0.6",
      payloadCanonicalization: "RFC8785-JCS",
      payloadDigestAlgorithm: "sha-256",
      payloadDigest: "0".repeat(64),
      qualification: "git-anchor-only",
      gitAnchor: { repository: "eljja/UnsolvedProblems", commit: "95d504c", path: "research/reproducibility/unseen-attestation-protocol.json" },
      rfc3161: { policyOid: null, messageImprint: null, genTime: null, serialNumber: null, tokenBase64: null, tsaCertificateChainDigest: null },
      verifiedAt: "2026-08-14T01:02:35Z"
    }
  };
  refreshTimestamp(bundle);
  return bundle;
}

function modify(base, index) {
  const bundle = clone(base);
  if (index === 1) bundle.manifest.adjudicatedAt = "2026-08-14T01:02:31Z";
  if (index === 2) { bundle.evidence.issuedAt = "2026-08-14T01:02:31Z"; refreshEvidence(bundle.evidence); }
  if (index === 3) { bundle.evidence.counter = 41; refreshEvidence(bundle.evidence); }
  if (index === 4) { bundle.trace.receipt.issuedAt = bundle.trace.events.at(-1).occurredAt; bundle.trace.receipt.receiptDigest = hash(without(bundle.trace.receipt, "receiptDigest")); }
  if (index === 5) { bundle.trace.receipt.issuedAt = "2026-08-14T00:02:59Z"; bundle.trace.receipt.receiptDigest = hash(without(bundle.trace.receipt, "receiptDigest")); }
  if (index === 6) { bundle.trace.events[2].occurredAt = "2026-08-14T00:00:30Z"; rebuildTrace(bundle.trace); bundle.evidence.traceHead = bundle.trace.headDigest; bundle.evidence.measurements[1].value = bundle.trace.headDigest; refreshEvidence(bundle.evidence); }
  if (index === 7) { bundle.trace.events[2].occurredAt = bundle.trace.events[1].occurredAt; rebuildTrace(bundle.trace); bundle.evidence.traceHead = bundle.trace.headDigest; bundle.evidence.measurements[1].value = bundle.trace.headDigest; refreshEvidence(bundle.evidence); }
  if (index === 8) { bundle.registry.validity.notBefore = bundle.evidence.issuedAt; bundle.registry.registryDigest = hash(without(bundle.registry, "registryDigest")); }
  if (index === 9) { bundle.registry.validity.notBefore = "2026-08-14T01:00:31Z"; bundle.registry.registryDigest = hash(without(bundle.registry, "registryDigest")); }
  if (index === 10) { bundle.registry.validity.notAfter = bundle.evidence.issuedAt; bundle.registry.registryDigest = hash(without(bundle.registry, "registryDigest")); }
  if (index === 11) { bundle.registry.validity.notAfter = "2026-08-14T01:00:29Z"; bundle.registry.registryDigest = hash(without(bundle.registry, "registryDigest")); }
  if (index === 12) { bundle.revocation.issuedAt = "2026-08-14T01:01:00Z"; bundle.revocation.snapshotDigest = hash(without(bundle.revocation, "snapshotDigest")); }
  if (index === 13) { bundle.revocation.issuedAt = "2026-08-14T01:02:31Z"; bundle.revocation.snapshotDigest = hash(without(bundle.revocation, "snapshotDigest")); }
  if (index === 14) { bundle.revocation.nextUpdate = bundle.manifest.adjudicatedAt; bundle.revocation.snapshotDigest = hash(without(bundle.revocation, "snapshotDigest")); }
  if (index === 15) { bundle.revocation.revoked.push({ objectType: "reference-registry", objectId: bundle.registry.registryId, reason: "authority-withdrawn", effectiveAt: "2026-08-14T01:01:00Z" }); bundle.revocation.snapshotDigest = hash(without(bundle.revocation, "snapshotDigest")); }
  if (index === 16) { const observation = hash(timestampPayload(bundle)); bundle.manifest.counterWorld = { worldACommitment: hash("world:genuine"), worldBCommitment: hash("world:silent-compromise"), observationDigestA: observation, observationDigestB: observation }; }
  if (index === 17) { bundle.ledger.hiddenVendorCommittedAt = bundle.ledger.hiddenVendorRevealedAt; bundle.ledger.ledgerDigest = hash(without(bundle.ledger, "ledgerDigest")); }
  if (index === 18) { bundle.ledger.units[900].physicalPackageDigest = bundle.ledger.units[17].physicalPackageDigest; bundle.ledger.ledgerDigest = hash(without(bundle.ledger, "ledgerDigest")); }
  if (index === 19) { bundle.ledger.units[901].acquisitionId = bundle.ledger.units[18].acquisitionId; bundle.ledger.ledgerDigest = hash(without(bundle.ledger, "ledgerDigest")); }
  if (index === 20) { bundle.ledger.units[902].clusterId = "CL-V1-P2-LOT-3"; bundle.ledger.ledgerDigest = hash(without(bundle.ledger, "ledgerDigest")); }
  if (index === 21) {
    const left = bundle.ledger.units.find(unit => unit.class === "genuine" && unit.vendorCode === "V1" && unit.processFamily === "P1" && unit.lot === "LOT-1");
    const right = bundle.ledger.units.find(unit => unit.class === "genuine" && unit.vendorCode === "V2" && unit.processFamily === "P1" && unit.lot === "LOT-1");
    [left.vendorCode, right.vendorCode] = [right.vendorCode, left.vendorCode];
    left.clusterId = `CL-${left.vendorCode}-${left.processFamily}-${left.lot}`;
    right.clusterId = `CL-${right.vendorCode}-${right.processFamily}-${right.lot}`;
    bundle.ledger.ledgerDigest = hash(without(bundle.ledger, "ledgerDigest"));
    const observation = hash({ classCounts: bundle.ledger.balance, digestCount: bundle.ledger.units.length });
    bundle.manifest.counterWorld = { worldACommitment: hash("world:enrollment-labels-original"), worldBCommitment: hash("world:enrollment-labels-swapped"), observationDigestA: observation, observationDigestB: observation };
  }
  if (index === 22) { bundle.policy.acceptMaximumDistance = 0.2; refreshPolicyBindings(bundle); }
  if (index === 23) bundle.timestampRecord = { ...bundle.timestampRecord, qualification: "rfc3161-verified", rfc3161: { policyOid: null, messageImprint: null, genTime: null, serialNumber: null, tokenBase64: null, tsaCertificateChainDigest: null } };
  if (index === 24) { bundle.packageCommitment.algorithm = "sha-256-public-id"; bundle.packageCommitment.commitment = hash("PKG-GAMMA-001"); }
  if (index === 25) bundle.packageCommitment.studyId = "RC31-OTHER-STUDY";
  if (index === 26) bundle.registry.environments[0].unregisteredCriticalField = true;
  if (index === 27) bundle.ledger.units.pop();
  refreshTimestamp(bundle);
  return bundle;
}

const base = buildBundle();
const cases = Array.from({ length: protocol.inputContract.caseCount }, (_, index) => ({
  caseId: `C${String(index).padStart(2, "0")}`,
  bundle: modify(base, index)
}));
const corpus = {
  corpusId: "UNSEEN-ATTESTATION-CORPUS-0.6",
  generatedOn: "2026-08-14",
  protocolId: protocol.protocolId,
  oldFixtureCatalogueUsedAsTraining: false,
  expectedOutcomesIncluded: false,
  cases
};
const raw = Buffer.from(`${canonical(corpus)}\n`, "utf8");
const compressed = zlib.gzipSync(raw, { level: 9, mtime: 0 });
const schemaDigests = Object.fromEntries(protocol.inputContract.structuralSchemas.map(file => [file, hash(fs.readFileSync(path.join(root, file), "utf8"))]));
const manifest = {
  corpusId: corpus.corpusId,
  generatedOn: corpus.generatedOn,
  protocolId: corpus.protocolId,
  cases: cases.map(item => ({ caseId: item.caseId, bundleDigest: hash(item.bundle) })),
  caseCount: cases.length,
  oldFixtureCatalogueUsedAsTraining: false,
  expectedOutcomesIncluded: false,
  serialization: "RFC8785-JCS-compatible canonical JSON subset; gzip mtime=0",
  uncompressedBytes: raw.length,
  compressedBytes: compressed.length,
  compressedSha256: hash(compressed),
  protocolSha256: hash(fs.readFileSync(path.join(root, "research/reproducibility/unseen-attestation-protocol.json"), "utf8")),
  structuralSchemaSha256: schemaDigests,
  safety: "Synthetic documents only; the study key is explicitly a public demo key and provides no real confidentiality."
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(path.join(root, corpusPath), compressed);
  fs.writeFileSync(path.join(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
} else {
  const stored = fs.readFileSync(path.join(root, corpusPath));
  const storedManifest = readJson(manifestPath);
  if (!stored.equals(compressed) || canonical(storedManifest) !== canonical(manifest)) throw new Error("Unseen corpus differs from the committed sealed corpus.");
}
console.log(`RC31 sealed corpus reproducible: ${cases.length} cases, ${compressed.length} gzip bytes, no expected outcomes.`);
