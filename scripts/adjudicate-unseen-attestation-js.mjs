import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const protocol = readJson("research/reproducibility/unseen-attestation-protocol.json");
const schemaNames = ["evidence", "trace", "registry", "revocation", "ledger", "timestampRecord", "packageCommitment"];
const schemas = Object.fromEntries(protocol.inputContract.structuralSchemas.map((file, index) => [schemaNames[index], readJson(file)]));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const hash = value => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : canonical(value)).digest("hex");
const without = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([name]) => !keys.includes(name)));
const same = (left, right) => canonical(left) === canonical(right);
const time = value => Date.parse(value);

function validate(schema, value, pointer = "$") {
  const errors = [];
  const fail = keyword => errors.push({ pointer, keyword });
  if (Object.hasOwn(schema, "const") && !same(value, schema.const)) fail("const");
  if (schema.enum && !schema.enum.some(candidate => same(value, candidate))) fail("enum");
  const allowed = schema.type == null ? null : Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value === "number" ? "number" : typeof value;
  if (allowed && !allowed.some(type => type === actual || (type === "number" && actual === "integer"))) {
    fail("type");
    return errors;
  }
  if (typeof value === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail("pattern");
    if (schema.format === "date-time" && !Number.isFinite(time(value))) fail("format");
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) fail("minimum");
    if (schema.maximum != null && value > schema.maximum) fail("maximum");
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) fail("minItems");
    if (schema.maxItems != null && value.length > schema.maxItems) fail("maxItems");
    if (schema.uniqueItems && new Set(value.map(canonical)).size !== value.length) fail("uniqueItems");
    if (schema.items) value.forEach((item, index) => errors.push(...validate(schema.items, item, `${pointer}/${index}`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required || []) if (!Object.hasOwn(value, required)) errors.push({ pointer: `${pointer}/${required}`, keyword: "required" });
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...validate(schema.properties[key], child, `${pointer}/${key}`));
      else if (schema.additionalProperties === false) errors.push({ pointer: `${pointer}/${key}`, keyword: "additionalProperties" });
    }
  }
  return errors;
}

function structural(bundle) {
  const errors = [];
  for (const [name, schema] of Object.entries(schemas)) for (const error of validate(schema, bundle[name])) errors.push({ document: name, ...error });
  return errors;
}

function structureCode(error) {
  const document = error.document === "timestampRecord" ? "TIMESTAMP" : error.document === "packageCommitment" ? "PACKAGE" : error.document.toUpperCase();
  return `S_${document}_${error.keyword.toUpperCase()}`;
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

function adjudicate(bundle) {
  const schemaErrors = structural(bundle);
  if (schemaErrors.length) {
    const allCodes = [...new Set(schemaErrors.map(structureCode))];
    return { verdict: "reject-structure", firstCode: allCodes[0], allCodes };
  }
  const codes = [];
  const add = code => { if (!codes.includes(code)) codes.push(code); };
  const adjudicatedAt = time(bundle.manifest.adjudicatedAt);
  const evidenceAt = time(bundle.evidence.issuedAt);
  const policyDigest = hash(without(bundle.policy, "digest"));
  const evidencePayload = without(bundle.evidence, "demonstrationIntegrity");
  const expectedEvidenceDigest = hash(`${canonical(evidencePayload)}:${bundle.evidence.demonstrationIntegrity.keyId}`);

  if (bundle.evidence.demonstrationIntegrity.digest !== expectedEvidenceDigest || bundle.evidence.demonstrationIntegrity.keyId !== bundle.evidence.attester.keyId) add("E_EVIDENCE_INTEGRITY");
  if (evidenceAt > adjudicatedAt) add("E_EVIDENCE_FUTURE");
  else if ((adjudicatedAt - evidenceAt) / 1000 > bundle.policy.maximumEvidenceAgeSeconds) add("E_EVIDENCE_AGE");
  if (bundle.evidence.counter <= bundle.policy.minimumCounter) add("E_COUNTER_FRESHNESS");
  if (bundle.evidence.nonce !== bundle.policy.nonce) add("E_NONCE_FRESHNESS");
  if (bundle.evidence.target.packageId !== bundle.evidence.attester.instanceId || bundle.trace.subject.packageId !== bundle.evidence.target.packageId || !bundle.trace.subject.componentIds.includes(bundle.evidence.target.componentId)) add("E_TARGET_BINDING");

  let previous = null;
  let previousTime = null;
  for (let index = 0; index < bundle.trace.events.length; index++) {
    const event = bundle.trace.events[index];
    const eventDigest = hash(without(event, "eventDigest", "statementDigest"));
    if (event.sequence !== index + 1 || event.previousDigest !== previous || event.eventDigest !== eventDigest || event.statementDigest !== hash({ eventDigest: event.eventDigest, actorId: event.actorId })) add("E_TRACE_LINK");
    if (previousTime != null && time(event.occurredAt) <= previousTime) add("E_TRACE_TIME");
    previous = event.eventDigest;
    previousTime = time(event.occurredAt);
  }
  if (bundle.trace.headDigest !== previous || bundle.evidence.traceHead !== previous || bundle.evidence.measurements[1].value !== previous) add("E_TRACE_HEAD");
  if (bundle.trace.receipt.statementDigest !== bundle.trace.events.at(-1).statementDigest || bundle.trace.receipt.receiptDigest !== hash(without(bundle.trace.receipt, "receiptDigest"))) add("E_TRACE_RECEIPT");
  if (time(bundle.trace.receipt.issuedAt) < time(bundle.trace.events.at(-1).occurredAt)) add("E_TRACE_RECEIPT_TIME");

  if (bundle.registry.registryDigest !== hash(without(bundle.registry, "registryDigest"))) add("E_REFERENCE_DIGEST");
  if (bundle.evidence.referenceVersion !== bundle.registry.version || bundle.evidence.referenceVersion !== bundle.policy.referenceVersion) add("E_REFERENCE_VERSION");
  if (evidenceAt < time(bundle.registry.validity.notBefore) || evidenceAt > time(bundle.registry.validity.notAfter)) add("E_REFERENCE_VALIDITY");
  if (bundle.evidence.attester.endorserId !== "ORG-VENDOR-GAMMA" || bundle.registry.authority.competence !== "chiplet-physical-reference-provider") add("E_AUTHORITY_SCOPE");

  if (bundle.revocation.snapshotDigest !== hash(without(bundle.revocation, "snapshotDigest"))) add("E_REVOCATION_DIGEST");
  if (time(bundle.revocation.issuedAt) > adjudicatedAt) add("E_REVOCATION_FUTURE");
  if (time(bundle.revocation.nextUpdate) <= adjudicatedAt) add("E_REVOCATION_STALE");
  for (const entry of bundle.revocation.revoked.filter(entry => time(entry.effectiveAt) <= adjudicatedAt)) {
    if (entry.objectType === "attestation-key" && entry.objectId === bundle.evidence.attester.keyId) add("Q_KEY_REVOKED");
    if (entry.objectType === "reference-registry" && entry.objectId === bundle.registry.registryId) add("Q_REFERENCE_REVOKED");
  }

  if (bundle.policy.digest !== policyDigest || bundle.evidence.policyDigest !== policyDigest || bundle.registry.policyDigest !== policyDigest || bundle.ledger.policyDigest !== policyDigest) add("A_POLICY_DIGEST");
  if (bundle.manifest.committedPolicyDigest !== policyDigest) add("A_POLICY_COMMITMENT");
  const timeline = [bundle.policy.frozenAt, bundle.ledger.hiddenVendorCommittedAt, bundle.ledger.frozenAt, bundle.ledger.hiddenVendorRevealedAt].map(time);
  if (!(timeline[0] < timeline[1] && timeline[1] < timeline[2] && timeline[2] < timeline[3])) add("A_TIMELINE_ORDER");
  if (bundle.ledger.ledgerDigest !== hash(without(bundle.ledger, "ledgerDigest"))) add("A_LEDGER_DIGEST");
  if (new Set(bundle.ledger.units.map(unit => unit.unitId)).size !== bundle.ledger.units.length) add("A_UNIT_DUPLICATE");
  if (new Set(bundle.ledger.units.map(unit => unit.physicalPackageDigest)).size !== bundle.ledger.units.length) add("A_INDEPENDENT_UNIT");
  if (new Set(bundle.ledger.units.map(unit => unit.acquisitionId)).size !== bundle.ledger.units.length) add("A_ACQUISITION_DUPLICATE");
  if (bundle.ledger.units.some(unit => unit.clusterId !== `CL-${unit.vendorCode}-${unit.processFamily}-${unit.lot}`)) add("A_CLUSTER_MAPPING");
  const classCounts = new Map();
  const cellCounts = new Map();
  for (const unit of bundle.ledger.units) {
    classCounts.set(unit.class, (classCounts.get(unit.class) || 0) + 1);
    const key = `${unit.class}|${unit.vendorCode}|${unit.processFamily}|${unit.lot}`;
    cellCounts.set(key, (cellCounts.get(key) || 0) + 1);
  }
  if (bundle.ledger.units.length !== 1530 || bundle.ledger.classes.some(name => classCounts.get(name) !== 306) || cellCounts.size !== 90 || [...cellCounts.values()].some(count => count !== 17)) add("A_CELL_BALANCE");

  if (bundle.timestampRecord.payloadDigest !== hash(timestampPayload(bundle))) add("A_TIMESTAMP_QUALIFICATION");
  if (bundle.timestampRecord.qualification === "rfc3161-verified") {
    const token = bundle.timestampRecord.rfc3161;
    if (!token.policyOid || token.messageImprint !== bundle.timestampRecord.payloadDigest || !token.genTime || !token.serialNumber || !token.tokenBase64 || !token.tsaCertificateChainDigest) add("A_TIMESTAMP_QUALIFICATION");
  }
  if (bundle.packageCommitment.studyId !== bundle.manifest.studyId) add("Q_COMMITMENT_SCOPE");
  if (bundle.packageCommitment.algorithm !== "hmac-sha-256") add("Q_COMMITMENT_PRIVACY");

  if (!codes.length && bundle.manifest.counterWorld && bundle.manifest.counterWorld.worldACommitment !== bundle.manifest.counterWorld.worldBCommitment && bundle.manifest.counterWorld.observationDigestA === bundle.manifest.counterWorld.observationDigestB) add("I_COUNTERWORLD_COLLISION");
  const verdict = codes.some(code => code.startsWith("A_")) ? "invalidate-adjudication"
    : codes.some(code => code.startsWith("Q_")) ? "quarantine"
      : codes.some(code => code.startsWith("I_")) ? "accept-contract-indistinguishable"
        : codes.length ? "reject-semantic" : "accept-contract";
  return { verdict, firstCode: codes[0] || null, allCodes: codes };
}

const compressed = fs.readFileSync(path.join(root, "research/reproducibility/unseen-attestation-corpus.json.gz"));
const corpus = JSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
const predictions = corpus.cases.map(item => ({
  caseId: item.caseId,
  ...adjudicate(item.bundle),
  timestampQualification: item.bundle.timestampRecord.qualification,
  privacyQualification: item.bundle.packageCommitment.privacyQualification
}));
const output = {
  predictionSetId: "UNSEEN-ATTESTATION-JS-PREDICTIONS-0.6",
  implementation: "javascript-independent-semantic-adjudicator",
  computedOn: "2026-08-14",
  protocolId: protocol.protocolId,
  corpusSha256: hash(compressed),
  implementationSha256: hash(fs.readFileSync(scriptPath)),
  expectedOutcomesRead: false,
  oldFixtureCatalogueRead: false,
  predictions,
  predictionDigest: hash(predictions),
  limitations: "Custom Draft 2020-12 assertion subset and repository-local semantics; not an independent production parser or trusted timestamp verifier."
};
const outputPath = path.join(root, "research/reproducibility/unseen-attestation-js-predictions.json");
if (process.argv.includes("--write")) fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
else if (canonical(readJson("research/reproducibility/unseen-attestation-js-predictions.json")) !== canonical(output)) throw new Error("JavaScript predictions differ from the committed pre-reveal output.");
console.log(`RC31 JavaScript pre-reveal prediction committed in memory: ${predictions.length} cases, digest ${output.predictionDigest}.`);
