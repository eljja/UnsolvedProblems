import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const WRITE = process.argv.includes("--write");
const contract = JSON.parse(fs.readFileSync(path.join(REPRO, "rc60-preflight-contract.json"), "utf8"));
const rc59 = JSON.parse(fs.readFileSync(path.join(REPRO, "rc59-48-cell-manifest-node.json"), "utf8"));

const SAFE = Number.MAX_SAFE_INTEGER;
const TOP_LEVEL_KEYS = [
  "profile", "cycleId", "evaluationContext", "domain", "allocation", "specimenLineage",
  "resources", "failureContainment", "owners", "margins", "safety", "acuteSentinel",
  "expansionObserver", "outcomeIsolation"
].sort();
const DOMAIN_KEYS = [
  "conditionId", "chemistry", "cellDesign", "manufacturingLotDefinition", "formationRecipeId",
  "temperatureSetpointAndTolerance", "chargeProtocolId", "dischargeProtocolId", "voltageWindow",
  "endpointDefinitionId"
];
const METRICS = ["LIFE", "TMAX", "QTHRU", "DZ"];
const OWNER_ROLES = ["domain", "metrology", "safety", "adjudication"];
const EXPECTED_ALLOCATION_HASH = "E03D97B2F4EA042E6D4023A3E5595A224DF59DD83636048AA953A8CEACEF1540";

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("RC60 canonical profile accepts safe integers only");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  throw new Error(`Unsupported canonical type: ${typeof value}`);
}

const sha256 = value => crypto.createHash("sha256").update(canonical(value), "utf8").digest("hex").toUpperCase();
function snapshotCanonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid-input snapshot rejects NaN and Infinity");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(snapshotCanonical).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${snapshotCanonical(value[key])}`).join(",")}}`;
  throw new Error(`Unsupported snapshot type: ${typeof value}`);
}
const snapshotSha256 = value => crypto.createHash("sha256").update(snapshotCanonical(value), "utf8").digest("hex").toUpperCase();
const clone = value => JSON.parse(JSON.stringify(value));
const allocationProjection = item => ({
  specimenId: item.specimenId,
  manufacturingBlockId: item.manufacturingBlockId,
  conditionId: item.conditionId,
  startWave: item.startWave,
  chamberId: item.chamberId,
  fixtureGroupId: item.fixtureGroupId,
  channelPosition: item.channelPosition,
  channelId: item.channelId
});
const expectedAllocation = rc59.allocation.map(allocationProjection);

function containment(records) {
  const definitions = [
    ["chamberId", item => item.chamberId],
    ["fixtureGroupId", item => item.fixtureGroupId],
    ["startWave", item => String(item.startWave)],
    ["manufacturingBlockId", item => item.manufacturingBlockId],
    ["channelId", item => item.channelId],
    ["chamberFixture", item => `${item.chamberId}|${item.fixtureGroupId}`]
  ];
  const result = {};
  for (const [name, getter] of definitions) {
    const counts = new Map();
    for (const record of records) counts.set(getter(record), (counts.get(getter(record)) || 0) + 1);
    const largestDomainSize = Math.max(...counts.values());
    result[name] = {
      domainCount: counts.size,
      largestDomainSize,
      usableAfterWorstSingleDomainLoss: records.length - largestDomainSize
    };
  }
  return result;
}

function buildBaseBundle() {
  const domain = {
    conditionId: "SYNTHETIC-RC60-CONDITION-01",
    chemistry: "SYNTHETIC-NMC-GRAPHITE-VALIDATOR-FIXTURE",
    cellDesign: "SYNTHETIC-21700-BUILD-A",
    manufacturingLotDefinition: "SYNTHETIC-LOT-A-BLOCKED-BY-PRODUCTION-ORDER",
    formationRecipeId: "SYNTHETIC-FORMATION-01",
    temperatureSetpointAndTolerance: "SYNTHETIC-25C-PLUSMINUS-1C",
    chargeProtocolId: "SYNTHETIC-CHARGE-01",
    dischargeProtocolId: "SYNTHETIC-DISCHARGE-01",
    voltageWindow: "SYNTHETIC-2P5V-4P2V",
    endpointDefinitionId: "SYNTHETIC-EOL-80PCT-01"
  };
  domain.commitmentSha256 = sha256(Object.fromEntries(DOMAIN_KEYS.map(key => [key, domain[key]])));
  const records = expectedAllocation.map(clone);
  return {
    profile: "RC60-PREFLIGHT-BUNDLE-1.0",
    cycleId: "RC-2026-60",
    evaluationContext: {
      mode: "synthetic-test",
      synthetic: true,
      targetStage: "preflight",
      requestedCapability: "preflight-only",
      evaluatedAt: "2026-08-29T00:00:00Z"
    },
    domain,
    allocation: {
      algorithmVersion: "rc59-v1",
      allocationHashSha256: EXPECTED_ALLOCATION_HASH,
      records
    },
    specimenLineage: records.map((record, index) => ({
      assignmentSpecimenId: record.specimenId,
      physicalSerialId: `SYNTHETIC-SERIAL-${String(index + 1).padStart(2, "0")}`,
      serialCommitmentSha256: sha256({ syntheticSerial: index + 1, assignmentSpecimenId: record.specimenId })
    })),
    resources: {
      chambers: ["C1", "C2"].map(id => ({ id, status: "ready", calibrationStatus: "current", calibrationId: `SYNTHETIC-CAL-${id}`, configurationId: `SYNTHETIC-CONFIG-${id}` })),
      fixtures: ["C1", "C2"].flatMap(chamber => ["F1", "F2", "F3", "F4"].map(fixture => ({ id: `${chamber}-${fixture}`, status: "ready", calibrationStatus: "current", calibrationId: `SYNTHETIC-CAL-${chamber}-${fixture}`, configurationId: `SYNTHETIC-CONFIG-${chamber}-${fixture}` }))),
      channels: records.map(record => ({ id: record.channelId, status: "ready", calibrationStatus: "current", calibrationId: `SYNTHETIC-CAL-${record.channelId}`, configurationId: `SYNTHETIC-CONFIG-${record.channelId}` }))
    },
    failureContainment: containment(records),
    owners: OWNER_ROLES.map((role, index) => ({
      role,
      ownerId: `SYNTHETIC-OWNER-${String(index + 1).padStart(2, "0")}`,
      attestationId: `SYNTHETIC-ATTESTATION-${role.toUpperCase()}`,
      status: "signed-reference-present-not-cryptographically-verified"
    })),
    margins: METRICS.map((metric, index) => ({
      metric,
      scale: index === 1 ? "milli-celsius" : "parts-per-million",
      u95Scaled: 10 + index,
      marginScaled: 20 + index,
      scientificLimitScaled: 30 + index,
      safetyLimitScaled: 40 + index,
      ownerAttestationId: "SYNTHETIC-ATTESTATION-METROLOGY"
    })),
    safety: {
      status: "approved-reference-present-not-externally-verified",
      hazardReviewId: "SYNTHETIC-HAZARD-REVIEW-01",
      sopId: "SYNTHETIC-SOP-01",
      electricalLimitsId: "SYNTHETIC-ELECTRICAL-LIMITS-01",
      ventingControlId: "SYNTHETIC-VENTING-01",
      thermalMonitoringId: "SYNTHETIC-THERMAL-01",
      fireResponseId: "SYNTHETIC-FIRE-01",
      emergencyStopId: "SYNTHETIC-ESTOP-01",
      disposalPlanId: "SYNTHETIC-DISPOSAL-01",
      ownerAttestationId: "SYNTHETIC-ATTESTATION-SAFETY"
    },
    acuteSentinel: {
      status: "passed-synthetic-fixture-only",
      claimScope: "acute-large-effect-and-safety-screen-only-not-lifetime-equivalence",
      specimenSerialIds: Array.from({ length: 12 }, (_, index) => `SYNTHETIC-SENTINEL-${String(index + 1).padStart(2, "0")}`),
      safetyEvents: 0,
      materialCarryoverDetected: false,
      receiptSha256: sha256({ syntheticSentinel: 12, claimScope: "acute-only" })
    },
    expansionObserver: {
      enabled: false,
      qualificationStatus: "excluded-before-confirmation",
      exclusionReason: "SYNTHETIC-FIXTURE-DOES-NOT-CLAIM-PHYSICAL-EXPANSION-QUALIFICATION",
      u95ExpScaled: null,
      marginExpScaled: null,
      minimumDetectableContrastScaled: null,
      qualificationReceiptSha256: null
    },
    outcomeIsolation: {
      storeStatus: "closed",
      designRoleAccess: false,
      outcomeValuesPresent: false,
      accessLedgerSha256: sha256({ store: "closed", designRoleAccess: false, fixture: "synthetic" })
    }
  };
}

function setPath(target, pathParts, value) {
  let cursor = target;
  for (const part of pathParts.slice(0, -1)) cursor = cursor[part];
  cursor[pathParts.at(-1)] = clone(value);
}

function deletePath(target, pathParts) {
  let cursor = target;
  for (const part of pathParts.slice(0, -1)) cursor = cursor[part];
  delete cursor[pathParts.at(-1)];
}

function applyMutations(base, mutations) {
  const value = clone(base);
  for (const mutation of mutations) {
    if (mutation.op === "set") setPath(value, mutation.path, mutation.value);
    else if (mutation.op === "delete") deletePath(value, mutation.path);
    else throw new Error(`Unknown fixture mutation: ${mutation.op}`);
  }
  return value;
}

function hasOnlySafeIntegers(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isSafeInteger(value) && Math.abs(value) <= SAFE;
  if (Array.isArray(value)) return value.every(hasOnlySafeIntegers);
  if (typeof value === "object") return Object.values(value).every(hasOnlySafeIntegers);
  return false;
}

function gateChecks(bundle) {
  return {
    "G00-CONTEXT": () => bundle.profile === "RC60-PREFLIGHT-BUNDLE-1.0"
      && bundle.cycleId === "RC-2026-60"
      && ["synthetic-test", "physical"].includes(bundle.evaluationContext?.mode)
      && bundle.evaluationContext.synthetic === (bundle.evaluationContext.mode === "synthetic-test")
      && bundle.evaluationContext.targetStage === "preflight"
      && bundle.evaluationContext.evaluatedAt === "2026-08-29T00:00:00Z",
    "G01-CLOSED-PROFILE": () => JSON.stringify(Object.keys(bundle).sort()) === JSON.stringify(TOP_LEVEL_KEYS) && hasOnlySafeIntegers(bundle),
    "G02-FROZEN-DOMAIN": () => DOMAIN_KEYS.every(key => typeof bundle.domain?.[key] === "string" && bundle.domain[key].length > 0 && !/(TO_BE|PLACEHOLDER|TBD)/i.test(bundle.domain[key]))
      && bundle.domain.commitmentSha256 === sha256(Object.fromEntries(DOMAIN_KEYS.map(key => [key, bundle.domain[key]]))),
    "G03-ALLOCATION-COMMITMENT": () => bundle.allocation?.algorithmVersion === "rc59-v1"
      && bundle.allocation.allocationHashSha256 === EXPECTED_ALLOCATION_HASH
      && canonical(bundle.allocation.records) === canonical(expectedAllocation),
    "G04-SPECIMEN-LINEAGE": () => {
      const rows = bundle.specimenLineage || [];
      const serials = rows.map(item => item.physicalSerialId);
      const assignments = rows.map(item => item.assignmentSpecimenId);
      const expectedIds = expectedAllocation.map(item => item.specimenId);
      const physicalIdentifiersAreReal = bundle.evaluationContext.mode !== "physical" || serials.every(id => !/^SYNTHETIC-/i.test(id));
      return rows.length === 48 && new Set(serials).size === 48 && new Set(assignments).size === 48
        && canonical([...assignments].sort()) === canonical([...expectedIds].sort()) && physicalIdentifiersAreReal
        && rows.every(item => typeof item.serialCommitmentSha256 === "string" && /^[A-F0-9]{64}$/.test(item.serialCommitmentSha256));
    },
    "G05-RESOURCE-READINESS": () => {
      const ready = items => Array.isArray(items) && items.every(item => item.status === "ready" && item.calibrationStatus === "current" && item.calibrationId && item.configurationId);
      if (!ready(bundle.resources?.chambers) || !ready(bundle.resources?.fixtures) || !ready(bundle.resources?.channels)) return false;
      const chambers = new Set(bundle.resources.chambers.map(item => item.id));
      const fixtures = new Set(bundle.resources.fixtures.map(item => item.id));
      const channels = new Set(bundle.resources.channels.map(item => item.id));
      return bundle.allocation.records.every(item => chambers.has(item.chamberId) && fixtures.has(`${item.chamberId}-${item.fixtureGroupId}`) && channels.has(item.channelId));
    },
    "G06-FAILURE-CONTAINMENT": () => canonical(bundle.failureContainment) === canonical(containment(bundle.allocation.records))
      && Math.min(...Object.values(bundle.failureContainment).map(item => item.usableAfterWorstSingleDomainLoss)) >= 24,
    "G07-ACCOUNTABLE-OWNERS": () => {
      const rows = bundle.owners || [];
      return rows.length === 4 && canonical(rows.map(item => item.role).sort()) === canonical([...OWNER_ROLES].sort())
        && new Set(rows.map(item => item.ownerId)).size === 4
        && rows.every(item => item.ownerId && item.attestationId && item.status === "signed-reference-present-not-cryptographically-verified");
    },
    "G08-MARGIN-IDENTIFIABILITY": () => {
      const rows = bundle.margins || [];
      return rows.length === 4 && canonical(rows.map(item => item.metric)) === canonical(METRICS)
        && rows.every(item => item.scale && item.ownerAttestationId === "SYNTHETIC-ATTESTATION-METROLOGY"
          && item.u95Scaled < item.marginScaled
          && item.marginScaled <= Math.min(item.scientificLimitScaled, item.safetyLimitScaled));
    },
    "G09-SAFETY-READINESS": () => bundle.safety?.status === "approved-reference-present-not-externally-verified"
      && ["hazardReviewId", "sopId", "electricalLimitsId", "ventingControlId", "thermalMonitoringId", "fireResponseId", "emergencyStopId", "disposalPlanId", "ownerAttestationId"].every(key => typeof bundle.safety[key] === "string" && bundle.safety[key].length > 0),
    "G10-ACUTE-SENTINEL": () => {
      const sentinel = bundle.acuteSentinel || {};
      const ids = sentinel.specimenSerialIds || [];
      const confirmationIds = new Set((bundle.specimenLineage || []).map(item => item.physicalSerialId));
      return sentinel.status === "passed-synthetic-fixture-only"
        && sentinel.claimScope === "acute-large-effect-and-safety-screen-only-not-lifetime-equivalence"
        && ids.length === 12 && new Set(ids).size === 12 && ids.every(id => !confirmationIds.has(id))
        && sentinel.safetyEvents === 0 && sentinel.materialCarryoverDetected === false && /^[A-F0-9]{64}$/.test(sentinel.receiptSha256 || "");
    },
    "G11-EXPANSION-OBSERVER": () => {
      const observer = bundle.expansionObserver || {};
      if (observer.enabled === false) return observer.qualificationStatus === "excluded-before-confirmation" && typeof observer.exclusionReason === "string" && observer.exclusionReason.length > 0;
      return observer.enabled === true && observer.qualificationStatus === "qualified"
        && observer.u95ExpScaled < observer.marginExpScaled
        && observer.marginExpScaled <= observer.minimumDetectableContrastScaled
        && /^[A-F0-9]{64}$/.test(observer.qualificationReceiptSha256 || "");
    },
    "G12-OUTCOME-ISOLATION": () => bundle.outcomeIsolation?.storeStatus === "closed"
      && bundle.outcomeIsolation.designRoleAccess === false
      && bundle.outcomeIsolation.outcomeValuesPresent === false
      && /^[A-F0-9]{64}$/.test(bundle.outcomeIsolation.accessLedgerSha256 || ""),
    "G13-CAPABILITY-CEILING": () => ["preflight-only", "independent-authorization-candidate"].includes(bundle.evaluationContext.requestedCapability)
  };
}

function evaluate(caseId, bundle) {
  const checks = gateChecks(bundle);
  const evaluatedGates = [];
  let firstFailedGate = null;
  let retryCondition = null;
  for (const gate of contract.gateOrder) {
    let passed = false;
    try { passed = checks[gate.id](); } catch { passed = false; }
    evaluatedGates.push({ id: gate.id, status: passed ? "pass" : "fail", detail: passed ? gate.pass : gate.question });
    if (!passed) {
      firstFailedGate = gate.id;
      retryCondition = gate.retry;
      break;
    }
  }
  const verdict = firstFailedGate
    ? contract.receiptSemantics.failure
    : bundle.evaluationContext.mode === "synthetic-test"
      ? contract.receiptSemantics.syntheticPass
      : contract.receiptSemantics.physicalPass;
  const payload = {
    receiptProfile: "RC60-PREFLIGHT-RECEIPT-1.0",
    cycleId: "RC-2026-60",
    caseId,
    evaluatedAt: bundle.evaluationContext?.evaluatedAt || "2026-08-29T00:00:00Z",
    bundleHashSha256: hasOnlySafeIntegers(bundle) ? sha256(bundle) : snapshotSha256(bundle),
    bundleHashProfile: hasOnlySafeIntegers(bundle) ? contract.canonicalizationProfile.name : "RC60-INVALID-INPUT-SNAPSHOT-1",
    contractHashSha256: sha256(contract),
    gateOrderHashSha256: sha256(contract.gateOrder.map(gate => gate.id)),
    verdict,
    firstFailedGate,
    retryCondition,
    evaluatedGates,
    physicalAuthorization: false,
    claimBoundary: "Content-addressed software preflight only; no owner authenticity, trusted time, laboratory existence, safety validity, or physical result is established."
  };
  return { ...payload, receiptHashSha256: sha256(payload) };
}

const baseBundle = buildBaseBundle();
const baseDomainForPlanning = clone(rc59.frozenDomain);
baseDomainForPlanning.commitmentSha256 = sha256(Object.fromEntries(DOMAIN_KEYS.map(key => [key, baseDomainForPlanning[key]])));
const cases = [
  { id: "SYNTHETIC-VALID", expectedFirstFailedGate: null, mutations: [] },
  { id: "ADV-G00-CONTEXT", expectedFirstFailedGate: "G00-CONTEXT", mutations: [{ op: "set", path: ["profile"], value: "UNKNOWN-PROFILE" }] },
  { id: "ADV-G01-UNKNOWN-FIELD", expectedFirstFailedGate: "G01-CLOSED-PROFILE", mutations: [{ op: "set", path: ["unknownField"], value: "forbidden" }] },
  { id: "ADV-G01-FLOAT", expectedFirstFailedGate: "G01-CLOSED-PROFILE", mutations: [{ op: "set", path: ["margins", 0, "u95Scaled"], value: 10.5 }] },
  { id: "ADV-G02-DOMAIN", expectedFirstFailedGate: "G02-FROZEN-DOMAIN", mutations: [{ op: "set", path: ["domain", "chemistry"], value: "TO_BE_FROZEN_BEFORE_ACQUISITION" }] },
  { id: "ADV-G03-ALLOCATION", expectedFirstFailedGate: "G03-ALLOCATION-COMMITMENT", mutations: [{ op: "set", path: ["allocation", "allocationHashSha256"], value: "0".repeat(64) }] },
  { id: "ADV-G04-LINEAGE", expectedFirstFailedGate: "G04-SPECIMEN-LINEAGE", mutations: [{ op: "set", path: ["specimenLineage", 1, "physicalSerialId"], value: "SYNTHETIC-SERIAL-01" }] },
  { id: "ADV-G05-RESOURCE", expectedFirstFailedGate: "G05-RESOURCE-READINESS", mutations: [{ op: "set", path: ["resources", "channels", 0, "calibrationStatus"], value: "expired" }] },
  { id: "ADV-G06-CONTAINMENT", expectedFirstFailedGate: "G06-FAILURE-CONTAINMENT", mutations: [{ op: "set", path: ["failureContainment", "chamberId", "usableAfterWorstSingleDomainLoss"], value: 23 }] },
  { id: "ADV-G07-OWNER", expectedFirstFailedGate: "G07-ACCOUNTABLE-OWNERS", mutations: [{ op: "set", path: ["owners", 2, "status"], value: "unsigned" }] },
  { id: "ADV-G08-MARGIN", expectedFirstFailedGate: "G08-MARGIN-IDENTIFIABILITY", mutations: [{ op: "set", path: ["margins", 0, "marginScaled"], value: 10 }] },
  { id: "ADV-G09-SAFETY", expectedFirstFailedGate: "G09-SAFETY-READINESS", mutations: [{ op: "set", path: ["safety", "status"], value: "pending" }] },
  { id: "ADV-G10-SENTINEL", expectedFirstFailedGate: "G10-ACUTE-SENTINEL", mutations: [{ op: "set", path: ["acuteSentinel", "materialCarryoverDetected"], value: true }] },
  { id: "ADV-G11-EXPANSION", expectedFirstFailedGate: "G11-EXPANSION-OBSERVER", mutations: [
    { op: "set", path: ["expansionObserver", "enabled"], value: true },
    { op: "set", path: ["expansionObserver", "qualificationStatus"], value: "qualified" },
    { op: "set", path: ["expansionObserver", "u95ExpScaled"], value: 20 },
    { op: "set", path: ["expansionObserver", "marginExpScaled"], value: 20 },
    { op: "set", path: ["expansionObserver", "minimumDetectableContrastScaled"], value: 30 },
    { op: "set", path: ["expansionObserver", "qualificationReceiptSha256"], value: "A".repeat(64) }
  ] },
  { id: "ADV-G12-OUTCOME", expectedFirstFailedGate: "G12-OUTCOME-ISOLATION", mutations: [{ op: "set", path: ["outcomeIsolation", "designRoleAccess"], value: true }] },
  { id: "ADV-G13-CAPABILITY", expectedFirstFailedGate: "G13-CAPABILITY-CEILING", mutations: [{ op: "set", path: ["evaluationContext", "requestedCapability"], value: "open-physical-enrollment" }] },
  { id: "ADV-MULTI-G05-G09", expectedFirstFailedGate: "G05-RESOURCE-READINESS", mutations: [
    { op: "set", path: ["resources", "channels", 0, "calibrationStatus"], value: "expired" },
    { op: "set", path: ["safety", "status"], value: "pending" }
  ] },
  { id: "RC59-PLANNING-PHYSICAL", expectedFirstFailedGate: "G02-FROZEN-DOMAIN", mutations: [
    { op: "set", path: ["evaluationContext", "mode"], value: "physical" },
    { op: "set", path: ["evaluationContext", "synthetic"], value: false },
    { op: "set", path: ["evaluationContext", "requestedCapability"], value: "independent-authorization-candidate" },
    { op: "set", path: ["domain"], value: baseDomainForPlanning }
  ] }
];

const fixtureSpec = {
  fixtureSpecId: "RC60-PREFLIGHT-FIXTURES-1.0",
  cycleId: "RC-2026-60",
  generatedOn: "2026-08-29",
  claimBoundary: "SYNTHETIC-VALID and all ADV cases are artificial software fixtures. RC59-PLANNING-PHYSICAL wraps the actual unresolved RC59 placeholders and must be refused before physical use.",
  baseBundle,
  cases
};
const receipts = cases.map(testCase => {
  const receipt = evaluate(testCase.id, applyMutations(baseBundle, testCase.mutations));
  if (receipt.firstFailedGate !== testCase.expectedFirstFailedGate) throw new Error(`${testCase.id}: expected ${testCase.expectedFirstFailedGate}, got ${receipt.firstFailedGate}`);
  return receipt;
});
const output = {
  resultId: "RC60-PREFLIGHT-NODE-RESULT-1.0",
  cycleId: "RC-2026-60",
  implementation: "dependency-free-node",
  generatedOn: "2026-08-29",
  fixtureSpecHashSha256: snapshotSha256(fixtureSpec),
  contractHashSha256: sha256(contract),
  cases: receipts,
  summary: {
    cases: receipts.length,
    syntheticPasses: receipts.filter(item => item.verdict === contract.receiptSemantics.syntheticPass).length,
    refusals: receipts.filter(item => item.verdict === contract.receiptSemantics.failure).length,
    physicalAuthorizations: receipts.filter(item => item.physicalAuthorization).length,
    rc59PlanningFirstFailure: receipts.find(item => item.caseId === "RC59-PLANNING-PHYSICAL").firstFailedGate
  },
  claimBoundary: contract.claimBoundary
};

if (WRITE) {
  fs.writeFileSync(path.join(REPRO, "rc60-preflight-fixtures.json"), `${JSON.stringify(fixtureSpec, null, 2)}\n`);
  fs.writeFileSync(path.join(REPRO, "rc60-preflight-node.json"), `${JSON.stringify(output, null, 2)}\n`);
}
console.log(JSON.stringify(output.summary));

export { canonical, sha256, applyMutations, evaluate };
