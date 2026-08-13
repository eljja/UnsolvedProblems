import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/chiplet-attestation-emulator-spec.json");
const fixtures = load("research/reproducibility/chiplet-attestation-adversarial-fixtures.json");
const clone = value => JSON.parse(JSON.stringify(value));
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => crypto.createHmac("sha256", key).update(value).digest("hex");
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

const demoKeys = {
  issuer: "DEMO-ISSUER-KEY-PUBLIC-IN-REPOSITORY-NOT-FOR-HARDWARE",
  package: "DEMO-PACKAGE-KEY-PUBLIC-IN-REPOSITORY-NOT-FOR-HARDWARE"
};
const baselineResponse = [0.12, -0.21, 0.44, 0.05, -0.36, 0.28, 0.17, -0.09];

function traceEvent(sequence, type, payload, previousEventSha256) {
  const body = { sequence, type, payload, previousEventSha256 };
  const eventSha256 = sha(stable(body));
  return { ...body, eventSha256, issuerKeyId: "DEMO-ISSUER-01", issuerSignature: hmac(demoKeys.issuer, eventSha256) };
}

function buildTrace() {
  const events = [];
  let previous = "GENESIS";
  for (const [type, payload] of [
    ["manufactured", { chipletId: "MOCK-CHIPLET-001", vendor: "MOCK-VENDOR-A", processFamily: "MOCK-PROCESS-P1", lot: "MOCK-LOT-01" }],
    ["package-assembled", { packageId: "MOCK-PACKAGE-001", chipletId: "MOCK-CHIPLET-001" }],
    ["custody-transferred", { from: "MOCK-VENDOR-A", to: "MOCK-INTEGRATOR-B" }],
    ["received", { by: "MOCK-ADJUDICATION-SITE-C" }]
  ]) {
    const event = traceEvent(events.length + 1, type, payload, previous);
    events.push(event);
    previous = event.eventSha256;
  }
  return events;
}

function signEvidence(evidence, key = demoKeys.package) {
  const claims = {
    packageId: evidence.packageId,
    chipletId: evidence.chipletId,
    nonce: evidence.nonce,
    monotonicCounter: evidence.monotonicCounter,
    traceHeadSha256: evidence.traceHeadSha256,
    physicalResponseDigest: sha(stable(evidence.physicalResponse))
  };
  evidence.claimsSha256 = sha(stable(claims));
  evidence.attesterSignature = hmac(key, evidence.claimsSha256);
}

function buildValidBundle() {
  const trace = buildTrace();
  const evidence = {
    packageId: "MOCK-PACKAGE-001",
    chipletId: "MOCK-CHIPLET-001",
    nonce: sha("DEMO-VERIFIER-NONCE-2026-08-14").slice(0, 32),
    monotonicCounter: 42,
    traceHeadSha256: trace.at(-1).eventSha256,
    physicalResponse: baselineResponse.map((value, index) => Number((value + 0.005 * Math.sin(index + 1)).toFixed(9))),
    attesterKeyId: "DEMO-PACKAGE-KEY-01",
    endorsementId: "DEMO-ENDORSEMENT-01"
  };
  signEvidence(evidence);
  return {
    mode: "synthetic-emulator-only",
    expectedNonce: evidence.nonce,
    reference: {
      packageId: "MOCK-PACKAGE-001",
      chipletId: "MOCK-CHIPLET-001",
      minimumCounter: 42,
      traceHeadSha256: trace.at(-1).eventSha256,
      physicalResponse: baselineResponse,
      acceptDistance: 0.08,
      rejectDistance: 0.16,
      acceptedAttesterKeyId: "DEMO-PACKAGE-KEY-01",
      acceptedEndorsementId: "DEMO-ENDORSEMENT-01",
      rootStatus: "active"
    },
    trace,
    evidence
  };
}

function responseDistance(observed, reference) {
  return Math.sqrt(observed.reduce((sum, value, index) => sum + (value - reference[index]) ** 2, 0));
}

function mutate(base, mutation) {
  const bundle = clone(base);
  const evidence = bundle.evidence;
  if (mutation === "none" || mutation === "silent-full-compromise") return bundle;
  if (mutation === "stale-nonce") evidence.nonce = sha("STALE-DEMO-NONCE").slice(0, 32);
  if (mutation === "counter-replay") evidence.monotonicCounter = 41;
  if (mutation === "substitute-package-id") evidence.packageId = "MOCK-PACKAGE-SUBSTITUTE";
  if (mutation === "substitute-chiplet-id") evidence.chipletId = "MOCK-CHIPLET-SUBSTITUTE";
  if (mutation === "tamper-response") evidence.physicalResponse = evidence.physicalResponse.map((value, index) => Number((value + (index % 2 ? -0.11 : 0.11)).toFixed(9)));
  if (mutation === "genuine-environmental-drift") evidence.physicalResponse = evidence.physicalResponse.map((value, index) => Number((value + (index % 2 ? -0.045 : 0.045)).toFixed(9)));
  if (mutation === "forge-trace-event") bundle.trace[2].payload.to = "MOCK-UNRECORDED-PARTY";
  if (mutation === "break-trace-link") bundle.trace[3].previousEventSha256 = "0".repeat(64);
  if (mutation === "mismatch-trace-head") evidence.traceHeadSha256 = sha("MISMATCHED-TRACE-HEAD");
  if (mutation === "known-root-compromise") bundle.reference.rootStatus = "revoked";
  if (mutation === "unknown-endorsement") evidence.endorsementId = "UNKNOWN-ENDORSEMENT";
  if (["stale-nonce", "counter-replay", "substitute-package-id", "substitute-chiplet-id", "tamper-response", "genuine-environmental-drift", "mismatch-trace-head", "unknown-endorsement"].includes(mutation)) signEvidence(evidence);
  return bundle;
}

function verifyTrace(bundle) {
  const codes = [];
  let previous = "GENESIS";
  for (const event of bundle.trace) {
    const body = { sequence: event.sequence, type: event.type, payload: event.payload, previousEventSha256: event.previousEventSha256 };
    const expectedHash = sha(stable(body));
    if (event.previousEventSha256 !== previous) codes.push("E_TRACE_LINK");
    if (event.eventSha256 !== expectedHash || event.issuerSignature !== hmac(demoKeys.issuer, event.eventSha256)) codes.push("E_TRACE_SIGNATURE");
    previous = event.eventSha256;
  }
  return [...new Set(codes)];
}

function adjudicate(bundle, ablation) {
  const errors = [];
  const quarantines = [];
  const add = (target, code) => { if (!target.includes(code)) target.push(code); };
  const useTrace = ["trace-only", "crypto-plus-trace", "full-combination"].includes(ablation);
  const useCrypto = ["crypto-plus-trace", "full-combination"].includes(ablation);
  const usePhysical = ["physical-only", "full-combination"].includes(ablation);
  if (useTrace) for (const code of verifyTrace(bundle)) add(errors, code);
  if (useCrypto) {
    const evidence = bundle.evidence;
    const reference = bundle.reference;
    if (reference.rootStatus === "revoked") add(quarantines, "Q_ROOT_REVOKED");
    if (evidence.endorsementId !== reference.acceptedEndorsementId || evidence.attesterKeyId !== reference.acceptedAttesterKeyId) add(quarantines, "Q_ENDORSEMENT_UNKNOWN");
    if (evidence.packageId !== reference.packageId) add(errors, "E_PACKAGE_BINDING");
    if (evidence.chipletId !== reference.chipletId) add(errors, "E_CHIPLET_BINDING");
    if (evidence.nonce !== bundle.expectedNonce) add(errors, "E_NONCE_FRESHNESS");
    if (evidence.monotonicCounter < reference.minimumCounter) add(errors, "E_COUNTER_REPLAY");
    const traceHead = bundle.trace.at(-1).eventSha256;
    if (evidence.traceHeadSha256 !== traceHead || evidence.traceHeadSha256 !== reference.traceHeadSha256) add(errors, "E_TRACE_HEAD_BINDING");
    const claims = { packageId: evidence.packageId, chipletId: evidence.chipletId, nonce: evidence.nonce, monotonicCounter: evidence.monotonicCounter, traceHeadSha256: evidence.traceHeadSha256, physicalResponseDigest: sha(stable(evidence.physicalResponse)) };
    const claimsSha256 = sha(stable(claims));
    if (evidence.claimsSha256 !== claimsSha256 || evidence.attesterSignature !== hmac(demoKeys.package, claimsSha256)) add(errors, "E_ATTESTER_SIGNATURE");
  }
  let distance = null;
  if (usePhysical) {
    distance = responseDistance(bundle.evidence.physicalResponse, bundle.reference.physicalResponse);
    if (distance >= bundle.reference.rejectDistance) add(errors, "E_PHYSICAL_RESPONSE");
    else if (distance > bundle.reference.acceptDistance) add(quarantines, "Q_RESPONSE_DRIFT");
  }
  return { verdict: errors.length ? "reject" : quarantines.length ? "quarantine" : "accept", codes: [...errors, ...quarantines], distance: distance === null ? null : Number(distance.toFixed(9)) };
}

const valid = buildValidBundle();
const fixtureResults = fixtures.fixtures.map(fixture => {
  const bundle = mutate(valid, fixture.mutation);
  const byAblation = Object.fromEntries(spec.frozenAblations.map(ablation => [ablation, adjudicate(bundle, ablation)]));
  const full = byAblation["full-combination"];
  return {
    id: fixture.id,
    truth: fixture.truth,
    expectedFullVerdict: fixture.expectedFullVerdict,
    observedFullVerdict: full.verdict,
    expectedFullCode: fixture.expectedFullCode,
    observedFullCodes: full.codes,
    matched: full.verdict === fixture.expectedFullVerdict && (fixture.expectedFullCode === null || full.codes.includes(fixture.expectedFullCode)),
    byAblation
  };
});

const oneSidedUpper = n => 1 - 0.05 ** (1 / n);
let minimumForOnePercent = 1;
while (oneSidedUpper(minimumForOnePercent) > 0.01) minimumForOnePercent += 1;
const unsafeTruths = new Set(["replay", "substitution", "tamper", "trace-forgery", "silent-full-compromise"]);
const ablationSummary = Object.fromEntries(spec.frozenAblations.map(ablation => {
  const rows = fixtureResults.filter(row => unsafeTruths.has(row.truth));
  return [ablation, {
    unsafeAcceptedFixtureIds: rows.filter(row => row.byAblation[ablation].verdict === "accept").map(row => row.id),
    rejectedFixtureIds: rows.filter(row => row.byAblation[ablation].verdict === "reject").map(row => row.id),
    quarantinedFixtureIds: rows.filter(row => row.byAblation[ablation].verdict === "quarantine").map(row => row.id)
  }];
}));

const output = {
  auditId: "CHIPLET-ATTESTATION-EMULATOR-AUDIT-0.4",
  computedOn: "2026-08-14",
  status: "synthetic-ablation-and-denominator-audit-complete",
  denominators: { fixtures: fixtureResults.length, fullCombinationDeterministicRejects: fixtureResults.filter(row => row.observedFullVerdict === "reject").length, fullCombinationQuarantines: fixtureResults.filter(row => row.observedFullVerdict === "quarantine").length, indistinguishableControls: 1 },
  fixtureResults: fixtureResults.map(({ byAblation, ...row }) => row),
  ablationVerdicts: Object.fromEntries(spec.frozenAblations.map(ablation => [ablation, Object.fromEntries(fixtureResults.map(row => [row.id, row.byAblation[ablation].verdict]))])),
  responseDistanceControls: Object.fromEntries(["A00", "A05", "A06"].map(id => [id, fixtureResults.find(row => row.id === id).byAblation["full-combination"].distance])),
  ablationSummary,
  sampleDesignAudit: {
    exactFormula: "p_upper = 1 - 0.05^(1/n) for zero observed errors and a one-sided 95% bound",
    historical600: { genuineN: 300, totalAdversarialN: 300, attackFamilies: 4, perAttackFamilyN: 75, pooledUpper: Number(oneSidedUpper(300).toFixed(9)), perFamilyUpper: Number(oneSidedUpper(75).toFixed(9)) },
    minimumNForUpperAtMostOnePercent: minimumForOnePercent,
    revisedBalanced: { perClassN: 306, classes: 5, totalN: 1530, pooledClassUpper: Number(oneSidedUpper(306).toFixed(9)), vendorProcessLotCellsPerClass: 18, unitsPerCell: 17, perCellUpper: Number(oneSidedUpper(17).toFixed(9)) },
    independenceCondition: "Exact binomial bounds require independent Bernoulli units within the claimed population. Lot clustering or threshold tuning on blind units invalidates the simple bound.",
    transportBoundary: "A pooled class bound is not a vendor-, process-, lot-, temperature-, ageing-, or institution-specific guarantee."
  },
  indistinguishableWorlds: {
    genuine: "A genuine enrolled package produces a valid trace, fresh signed claims, and an in-envelope physical response.",
    compromised: "An adversary controls every issuer and package key and reproduces the same trace, fresh signed claims, and in-envelope response without appearing on an independent revocation source.",
    verifierObservation: "Identical in both worlds.",
    consequence: "The full-combination verifier accepts A12. A new independent root or observable is required; adding more samples of the same evidence cannot identify the world."
  },
  decisions: {
    H1_traceAloneSufficient: false,
    H2_physicalFingerprintAloneSufficient: false,
    H3_cryptoPlusTraceDetectsFreshnessAndBindingFixtures: true,
    H4_fullCombinationBlocksAllInScopeObservableFixtures: true,
    H5_fullCombinationProvesSilentFullCompromiseAbsent: false,
    H6_sixHundredUnitsBoundEachAttackFamilyBelowOnePercent: false,
    H7_revised1530BoundsEachPooledClaimedClassBelowOnePercentConditionalOnIndependence: true,
    H8_pooledClassBoundImpliesEachVendorProcessLotCellBelowOnePercent: false,
    H9_hardwarePerformanceEstablished: false
  },
  readiness: {
    "R1-PROTOCOL-LOGIC": "passed-in-synthetic-emulator",
    "R2-SAMPLE-DENOMINATOR": "revised-and-mathematically-verified",
    "R3-INDEPENDENT-IMPLEMENTATION": "passed-by-independent-python-audit",
    "R4-HARDWARE-ROOT": "not-demonstrated",
    "R5-PHYSICAL-RESPONSE": "not-demonstrated",
    "R6-MULTI-VENDOR-TRANSPORT": "not-demonstrated"
  },
  interpretation: {
    established: "The synthetic verifier separates evidence roles, detects all observable full-combination fixtures as specified, preserves quarantine, and corrects the class-specific sample denominator from 600 to 1,530 balanced units.",
    rejected: "Traceability alone, a physical fingerprint alone, the 600-unit family-specific one-percent claim, and detection of a silent compromise using identical evidence are rejected.",
    notEstablished: "No cryptographic implementation, secure key storage, chiplet, package, PUF, PDN sensor, vendor, lot, institution, or attacker was tested."
  }
};

if (!fixtureResults.every(row => row.matched)) {
  console.error(JSON.stringify(output, null, 2));
  throw new Error("RC29 full-combination fixture mismatch");
}
if (process.argv.includes("--emit")) console.log(JSON.stringify(output, null, 2));
else {
  const expected = load("research/reproducibility/chiplet-attestation-emulator-result.json");
  if (JSON.stringify(output) !== JSON.stringify(expected)) throw new Error("RC29 emulator result differs from committed artifact");
  console.log("RC29 chiplet-attestation emulator reproduced: 13/13 full-verdict fixtures matched; the 600-unit per-family claim failed and the revised blind design is 1,530 units.");
}
