import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { rankState as referenceRank } from "./replay/reference.mjs";
import { rankState as auditRank } from "./replay/audit.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const fixture = await readJson("../research/replay/synthetic-replay-fixture.json");
const expected = await readJson("../research/replay/verification-result.json");
const schema = await readJson("../research/complete-ledger.schema.json");
const benchmark = await readJson("../research/alab-replay-benchmark.json");
const policyIds = benchmark.policies.map(({ id }) => id);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function validate(value, rule, path = "$") {
  const errors = [];
  const allowedTypes = rule.type ? (Array.isArray(rule.type) ? rule.type : [rule.type]) : [];
  if (allowedTypes.length && !allowedTypes.some((type) => typeMatches(value, type))) {
    return [`${path}: expected ${allowedTypes.join("|")}`];
  }
  if (rule.const !== undefined && value !== rule.const) errors.push(`${path}: const mismatch`);
  if (rule.enum && !rule.enum.includes(value)) errors.push(`${path}: enum mismatch`);

  if (typeof value === "string") {
    if (rule.minLength !== undefined && value.length < rule.minLength) errors.push(`${path}: shorter than minLength`);
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) errors.push(`${path}: pattern mismatch`);
    if (rule.format === "date-time" && Number.isNaN(Date.parse(value))) errors.push(`${path}: invalid date-time`);
  }

  if (typeof value === "number") {
    if (rule.minimum !== undefined && value < rule.minimum) errors.push(`${path}: below minimum`);
    if (rule.maximum !== undefined && value > rule.maximum) errors.push(`${path}: above maximum`);
    if (rule.exclusiveMinimum !== undefined && value <= rule.exclusiveMinimum) errors.push(`${path}: below exclusiveMinimum`);
  }

  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) errors.push(`${path}: fewer than minItems`);
    if (rule.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path}: duplicate items`);
    if (rule.items) value.forEach((item, index) => errors.push(...validate(item, rule.items, `${path}[${index}]`)));
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of rule.required || []) {
      if (!(key in value)) errors.push(`${path}.${key}: required`);
    }
    if (rule.minProperties !== undefined && Object.keys(value).length < rule.minProperties) errors.push(`${path}: fewer than minProperties`);
    for (const [key, child] of Object.entries(value)) {
      if (rule.properties?.[key]) errors.push(...validate(child, rule.properties[key], `${path}.${key}`));
      else if (rule.additionalProperties === false) errors.push(`${path}.${key}: additional property`);
      else if (rule.additionalProperties && typeof rule.additionalProperties === "object") {
        errors.push(...validate(child, rule.additionalProperties, `${path}.${key}`));
      }
    }
  }
  return errors;
}

function makeLedgerRecord(state, index) {
  const ranking = referenceRank(state, "R2");
  const selected = state.actions.find(({ actionId }) => actionId === ranking[0]);
  const successful = index % 2 === 0;
  const finalCall = successful ? "success" : "failure";
  const startHour = String(index * 2).padStart(2, "0");
  const endHour = String(index * 2 + 1).padStart(2, "0");

  return {
    schemaVersion: "0.1.0",
    campaignId: "SYNTHETIC-REPLAY-0.1",
    experimentId: `SYN-${state.stateId}`,
    parentExperimentIds: index ? [`SYN-S${index}`] : [],
    target: {
      formula: `M${index + 1}O2`,
      materialIds: [`urn:synthetic:material:${state.stateId}`],
      structureReference: `urn:synthetic:structure:${state.stateId}`,
      successThreshold: { targetPhaseWeightFraction: 0.5, adjudicationRuleVersion: "synthetic-v1" }
    },
    policyDecision: {
      policyName: "pairwise-path-avoidance",
      policyVersion: "0.1",
      codeCommit: "synthetic-fixture",
      modelArtifactHash: null,
      randomSeed: null,
      candidateSetHash: sha256(JSON.stringify(state.actions)),
      selectedActionId: selected.actionId,
      eligibleActionCount: state.actions.length,
      selectionProbability: 1,
      scores: Object.fromEntries(state.actions.map(({ actionId, drivingForce }) => [actionId, drivingForce])),
      rejectedActionIds: state.actions.filter(({ path }) => state.observedDetrimentalPaths.includes(path)).map(({ actionId }) => actionId),
      decisionTimestamp: `2026-01-01T${startHour}:00:00.000Z`
    },
    recipe: {
      precursors: [{ formula: "M2O3", amountMg: 100, batchId: `B-${state.stateId}`, purityFraction: 0.99, supplier: null }],
      mixing: { method: "synthetic", durationSeconds: 600, mediaBatchId: null },
      heatingProfile: [{ setpointC: 800, rampCPerMinute: 5, dwellSeconds: 3600 }],
      atmosphere: { composition: "synthetic-air", pressurePa: 101325 },
      vessel: { material: "synthetic-alumina", vesselId: `V-${state.stateId}` },
      cooling: { method: "controlled", rateCPerMinute: 5 },
      regrindingEvents: []
    },
    execution: {
      siteId: "SYNTHETIC",
      instrumentIds: ["SIM-1"],
      startedAt: `2026-01-01T${startHour}:00:00.000Z`,
      completedAt: `2026-01-01T${endHour}:00:00.000Z`,
      deviations: [],
      exceptions: []
    },
    observation: {
      rawXrd: { uri: `urn:synthetic:xrd:${state.stateId}`, sha256: sha256(`synthetic-xrd-${state.stateId}`) },
      calibrationId: "SYN-CAL-1",
      phaseCalls: [{ phase: `M${index + 1}O2`, weightFraction: successful ? 0.65 : 0.2, standardUncertainty: 0.03 }],
      intermediatePhases: [selected.path],
      orthogonalMeasurements: []
    },
    adjudication: {
      automatedCall: finalCall,
      independentCall: finalCall,
      finalCall,
      blinded: true,
      ruleVersion: "synthetic-v1",
      disagreementReason: null
    },
    outcome: {
      status: finalCall,
      failureModes: successful ? [] : ["kinetic-trap"],
      censored: false
    },
    provenance: {
      createdAt: `2026-01-01T${endHour}:30:00.000Z`,
      recordSoftwareVersion: "synthetic-ledger-0.1",
      license: "Apache-2.0",
      supersedes: null
    }
  };
}

function kendallTau(left, right) {
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < left.length; i += 1) {
    for (let j = i + 1; j < left.length; j += 1) {
      const rightOrder = right.indexOf(left[i]) - right.indexOf(left[j]);
      if (rightOrder < 0) concordant += 1;
      else discordant += 1;
    }
  }
  return (concordant - discordant) / (concordant + discordant);
}

let selectionMatches = 0;
let rankingMatches = 0;
let goldenMatches = 0;
const taus = [];
for (const state of fixture.states) {
  for (const policyId of policyIds) {
    const reference = referenceRank(state, policyId);
    const audit = auditRank(state, policyId);
    if (reference[0] === audit[0]) selectionMatches += 1;
    if (JSON.stringify(reference) === JSON.stringify(audit)) rankingMatches += 1;
    if (JSON.stringify(reference) === JSON.stringify(state.goldenRankings[policyId])) goldenMatches += 1;
    taus.push(kendallTau(reference, audit));
  }
}

const records = fixture.states.map(makeLedgerRecord);
for (const record of records) assert.deepEqual(validate(record, schema), [], `Valid ledger rejected: ${record.experimentId}`);

const withoutChecksum = records.map((record) => structuredClone(record));
withoutChecksum.forEach((record) => delete record.observation.rawXrd.sha256);
const invalidWithoutChecksum = withoutChecksum.filter((record) => validate(record, schema).length > 0).length;

const withoutIndependentCall = records.map((record) => structuredClone(record));
withoutIndependentCall.forEach((record) => delete record.adjudication.independentCall);
const invalidWithoutIndependentCall = withoutIndependentCall.filter((record) => validate(record, schema).length > 0).length;

const withoutPathHistory = fixture.states.map((state) => ({ ...state, observedDetrimentalPaths: [] }));
const changedStateIds = fixture.states
  .filter((state, index) => referenceRank(state, "R2")[0] !== referenceRank(withoutPathHistory[index], "R2")[0])
  .map(({ stateId }) => stateId);

const nullProbability = structuredClone(records[0]);
nullProbability.policyDecision.selectionProbability = null;
const nullProbabilitySchemaValid = validate(nullProbability, schema).length === 0;
const comparisons = fixture.states.length * policyIds.length;
const result = {
  verificationId: "REPLAY-VERIFICATION-2026-08-12",
  fixtureId: fixture.fixtureId,
  implementations: ["reference-declarative", "audit-insertion"],
  stateCount: fixture.states.length,
  policyCount: policyIds.length,
  selectionComparisons: comparisons,
  selectionAgreement: selectionMatches / comparisons,
  fullRankingAgreement: rankingMatches / comparisons,
  meanKendallTau: taus.reduce((sum, value) => sum + value, 0) / taus.length,
  goldenRankingAgreement: goldenMatches / comparisons,
  schema: {
    validCompleteRecords: records.length,
    invalidWithoutRawXrdChecksum: invalidWithoutChecksum,
    invalidWithoutIndependentCall
  },
  ablations: {
    removeDetrimentalPathHistory: {
      policy: "R2",
      changedSelections: changedStateIds.length,
      totalStates: fixture.states.length,
      changeRate: changedStateIds.length / fixture.states.length,
      changedStateIds
    },
    removeSelectionProbability: {
      schemaValid: nullProbabilitySchemaValid,
      causalReplayEligible: false,
      reason: "The schema permits null for deterministic or unavailable propensities, but causal off-policy evaluation is not identified without logged propensities or exact deterministic reconstruction."
    }
  },
  interpretationBoundary: "Agreement validates the fixture, ledger checks, and two replay implementations. It does not estimate ARROWS performance or establish superiority of any search policy."
};

assert.deepEqual(result, expected);
assert.equal(result.selectionAgreement >= benchmark.replayFidelityGate.selectedActionAgreement, true);
assert.equal(result.meanKendallTau >= benchmark.replayFidelityGate.topFiveRankKendallTau, true);
console.log(`Replay verification passed: ${comparisons}/${comparisons} selections, ${records.length} complete ledger records, ${changedStateIds.length}/${fixture.states.length} R2 path-history ablations changed.`);
