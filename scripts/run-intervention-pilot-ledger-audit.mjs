import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const protocol = load("research/reproducibility/intervention-pilot-protocol.json");
const fixtures = load("research/reproducibility/intervention-pilot-adversarial-fixtures.json");
const oldSchema = load("research/reproducibility/intervention-batch-ledger.schema.json");
const newSchema = load("research/reproducibility/intervention-pilot-ledger.schema.json");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const clone = value => JSON.parse(JSON.stringify(value));

const geometryCode = { "stationary-flat-plate": "S", "rotating-capillary": "R" };
const particleCode = { "fine": "F", "mixed-coarse": "C" };
const lots = { BaSO4: "BARITE-L01", Bi2O3: "BISMITE-L01", graphiteFine: "GRAPHITE-F01", graphiteCoarse: "GRAPHITE-C01" };

function buildValidLedger() {
  const batches = Object.entries(protocol.physicalDesign.randomizedAcquisitionSchedule).map(([batchId, schedule], batchIndex) => {
    const specimens = ["fine", "mixed-coarse"].map(arm => ({
      physicalSpecimenId: `${batchId}-SP-${particleCode[arm]}`,
      particleSizeArm: arm,
      gravimetrySha256: sha(`${batchId}|${arm}|gravimetry|synthetic`),
      particleSizeSha256: sha(`${batchId}|${arm}|particle-size|synthetic`),
      integrityGate: { compositionErrorPercentagePoints: null, phaseChanged: null, contaminationDetected: null, passed: null, status: "untested" }
    }));
    const aliquots = schedule.map((cell, order) => {
      const [particle, geometry] = cell.split("|");
      return {
        aliquotId: `${batchId}-AQ-${particleCode[particle]}${geometryCode[geometry]}`,
        physicalSpecimenId: `${batchId}-SP-${particleCode[particle]}`,
        geometryArm: geometry,
        blindCode: sha(`${batchId}|${cell}|blind|synthetic`).slice(0, 8).toUpperCase(),
        randomizedBlockOrder: order + 1,
        transmissionSha256: sha(`${batchId}|${cell}|transmission|synthetic`)
      };
    });
    const acquisitions = aliquots.flatMap(aliquot => [1, 2].map(repeat => ({
      acquisitionId: `${aliquot.aliquotId}-X${repeat}`,
      aliquotId: aliquot.aliquotId,
      technicalRepeat: repeat,
      sequenceOrder: (aliquot.randomizedBlockOrder - 1) * 2 + repeat,
      acquisitionSessionId: `${batchId}-SESSION-XRPD`,
      rawXrpdSha256: sha(`${aliquot.aliquotId}|repeat-${repeat}|raw|synthetic`),
      instrumentMetadataSha256: sha(`${batchId}|instrument-metadata|synthetic`)
    })));
    const analyses = acquisitions.flatMap(acquisition => ["complete-dictionary", "omitted-phase"].map(view => ({
      analysisId: `${acquisition.acquisitionId}-${view === "complete-dictionary" ? "COMP" : "OMIT"}`,
      acquisitionId: acquisition.acquisitionId,
      dictionaryView: view,
      omittedPhaseId: view === "omitted-phase" ? "Bi2O3" : null,
      analysisOutputSha256: sha(`${acquisition.acquisitionId}|${view}|analysis|synthetic`),
      alarmEstimate: null,
      candidateEvidenceEstimate: null,
      sealedBeforeUnblinding: true
    })));
    return {
      preparationBatchId: batchId,
      institutionId: "DRYRUN-INSTITUTION-A",
      preparationSessionId: `${batchId}-PREP-SESSION`,
      operatorPseudonym: `PREP-${String(batchIndex + 1).padStart(2, "0")}`,
      armMapCommitmentSha256: sha(`${batchId}|one-time-arm-map|synthetic`),
      sourceLots: clone(lots), specimens, aliquots, acquisitions, analyses,
      endpointAdjudication: {
        eligible: false, negativeReductionEstimate: null, negativeLowerBound: null,
        positiveRetentionEstimate: null, positiveLowerBound: null,
        negativePassed: null, positivePassed: null, status: "sealed-no-outcomes"
      }
    };
  });
  return {
    protocolVersion: protocol.protocolId,
    mode: "dry-run-no-physical-outcomes",
    sealedOn: protocol.fixedOn,
    inferentialScope: "preparation-repeatability-conditional-on-source-lots",
    reportedIndependentN: batches.length,
    splitContract: {
      developmentInstitutions: ["DRYRUN-INSTITUTION-A"],
      adjudicationInstitutions: ["DRYRUN-INSTITUTION-B"],
      forbiddenSharedKeys: ["preparationBatchId", "physicalSpecimenId", "aliquotId", "rawXrpdSha256"],
      analysisRowsNeverEqualIndependentN: true
    },
    batches
  };
}

function mutate(base, mutation) {
  const ledger = clone(base);
  const first = ledger.batches[0];
  if (mutation === "none") return ledger;
  if (mutation === "reuse-raw-hash-across-aliquots") first.acquisitions[2].rawXrpdSha256 = first.acquisitions[0].rawXrpdSha256;
  if (mutation === "alias-one-aliquot-across-two-specimens") first.aliquots[1].aliquotId = first.aliquots[0].aliquotId;
  if (mutation === "report-analysis-row-count-as-independent-n") ledger.reportedIndependentN = ledger.batches.reduce((sum, batch) => sum + batch.analyses.length, 0);
  if (mutation === "remove-one-factorial-cell-and-descendants") {
    const removed = first.aliquots.pop();
    const acquisitionIds = first.acquisitions.filter(row => row.aliquotId === removed.aliquotId).map(row => row.acquisitionId);
    first.acquisitions = first.acquisitions.filter(row => row.aliquotId !== removed.aliquotId);
    first.analyses = first.analyses.filter(row => !acquisitionIds.includes(row.acquisitionId));
  }
  if (mutation === "encode-arm-name-in-blind-code") first.aliquots[0].blindCode = "FINE0001";
  if (mutation === "insert-endpoint-estimate-in-dry-run") first.endpointAdjudication.negativeReductionEstimate = 0.85;
  if (mutation === "claim-unconditional-lot-transport-with-common-lots") ledger.inferentialScope = "unconditional-across-source-lots";
  if (mutation === "replace-sealed-omitted-phase") first.analyses.find(row => row.dictionaryView === "omitted-phase").omittedPhaseId = "graphite";
  if (mutation === "duplicate-acquisition-sequence-order") first.acquisitions[1].sequenceOrder = first.acquisitions[0].sequenceOrder;
  if (mutation === "mark-phase-change-as-integrity-pass") first.specimens[0].integrityGate = { compositionErrorPercentagePoints: 0.2, phaseChanged: true, contaminationDetected: false, passed: true, status: "pass" };
  if (mutation === "reuse-arm-map-commitment-across-batches") ledger.batches[1].armMapCommitmentSha256 = ledger.batches[0].armMapCommitmentSha256;
  return ledger;
}

function validate(ledger) {
  const errors = [];
  const add = code => { if (!errors.includes(code)) errors.push(code); };
  const batchIds = ledger.batches.map(row => row.preparationBatchId);
  if (ledger.reportedIndependentN !== new Set(batchIds).size || ledger.reportedIndependentN !== ledger.batches.length) add("E_INDEPENDENT_N");

  const commitments = new Set();
  const rawOwner = new Map();
  for (const batch of ledger.batches) {
    if (commitments.has(batch.armMapCommitmentSha256)) add("E_COMMITMENT_REUSE");
    commitments.add(batch.armMapCommitmentSha256);
    const specimenById = new Map(batch.specimens.map(row => [row.physicalSpecimenId, row]));
    const aliquotById = new Map();
    for (const aliquot of batch.aliquots) {
      if (aliquotById.has(aliquot.aliquotId) && aliquotById.get(aliquot.aliquotId).physicalSpecimenId !== aliquot.physicalSpecimenId) add("E_ALIQUOT_PARENT_CONFLICT");
      aliquotById.set(aliquot.aliquotId, aliquot);
      if (!specimenById.has(aliquot.physicalSpecimenId)) add("E_ALIQUOT_PARENT_CONFLICT");
      if (/FINE|COARSE|ROTAT|STATIC|STATION/i.test(aliquot.blindCode)) add("E_BLIND_CODE_LEAK");
    }
    const cells = new Set(batch.aliquots.map(aliquot => `${specimenById.get(aliquot.physicalSpecimenId)?.particleSizeArm}|${aliquot.geometryArm}`));
    if (protocol.physicalDesign.factorialCells.some(cell => !cells.has(cell)) || cells.size !== 4) add("E_FACTORIAL_CELL");
    const sequence = batch.acquisitions.map(row => row.sequenceOrder);
    if (new Set(sequence).size !== 8 || ![1,2,3,4,5,6,7,8].every(value => sequence.includes(value))) add("E_RANDOMIZATION");
    for (const acquisition of batch.acquisitions) {
      const owner = rawOwner.get(acquisition.rawXrpdSha256);
      if (owner && owner !== acquisition.aliquotId) add("E_RAW_HASH_REUSE");
      rawOwner.set(acquisition.rawXrpdSha256, acquisition.aliquotId);
    }
    const analysesByAcquisition = new Map();
    for (const analysis of batch.analyses) {
      if (!analysesByAcquisition.has(analysis.acquisitionId)) analysesByAcquisition.set(analysis.acquisitionId, []);
      analysesByAcquisition.get(analysis.acquisitionId).push(analysis);
      if ((analysis.dictionaryView === "omitted-phase") !== (analysis.omittedPhaseId === "Bi2O3") || (analysis.dictionaryView === "complete-dictionary" && analysis.omittedPhaseId !== null)) add("E_DICTIONARY_VIEW");
    }
    for (const acquisition of batch.acquisitions) {
      const views = analysesByAcquisition.get(acquisition.acquisitionId) || [];
      if (views.length !== 2 || !views.some(row => row.dictionaryView === "complete-dictionary") || !views.some(row => row.dictionaryView === "omitted-phase")) add("E_DICTIONARY_VIEW");
    }
    for (const specimen of batch.specimens) {
      const gate = specimen.integrityGate;
      if (gate.passed === true && (gate.phaseChanged === true || gate.contaminationDetected === true || gate.compositionErrorPercentagePoints > 1 || gate.status !== "pass")) add("E_INTEGRITY_LOGIC");
    }
    if (ledger.mode === "dry-run-no-physical-outcomes") {
      const adjudication = batch.endpointAdjudication;
      const forbidden = [adjudication.negativeReductionEstimate, adjudication.negativeLowerBound, adjudication.positiveRetentionEstimate, adjudication.positiveLowerBound, adjudication.negativePassed, adjudication.positivePassed];
      if (adjudication.eligible || adjudication.status !== "sealed-no-outcomes" || forbidden.some(value => value !== null) || batch.analyses.some(row => row.alarmEstimate !== null || row.candidateEvidenceEstimate !== null)) add("E_DRY_RUN_OUTCOME");
    }
  }
  const uniqueLotTuples = new Set(ledger.batches.map(batch => JSON.stringify(batch.sourceLots))).size;
  if (ledger.inferentialScope === "unconditional-across-source-lots" && uniqueLotTuples < ledger.batches.length) add("E_LOT_SCOPE");
  return { valid: errors.length === 0, errors };
}

const validLedger = buildValidLedger();
const fixtureResults = fixtures.tests.map(fixture => {
  const audit = validate(mutate(validLedger, fixture.mutation));
  return {
    id: fixture.id,
    expectedValid: fixture.expectedValid,
    observedValid: audit.valid,
    expectedCode: fixture.expectedCode,
    observedCodes: audit.errors,
    detectedAsSpecified: audit.valid === fixture.expectedValid && (fixture.expectedCode === null || audit.errors.includes(fixture.expectedCode))
  };
});
const counts = {
  sourceLotTuples: new Set(validLedger.batches.map(batch => JSON.stringify(batch.sourceLots))).size,
  preparationBatches: validLedger.batches.length,
  physicalSpecimens: validLedger.batches.reduce((sum, batch) => sum + batch.specimens.length, 0),
  geometryAliquots: validLedger.batches.reduce((sum, batch) => sum + batch.aliquots.length, 0),
  rawAcquisitions: validLedger.batches.reduce((sum, batch) => sum + batch.acquisitions.length, 0),
  analysisViews: validLedger.batches.reduce((sum, batch) => sum + batch.analyses.length, 0),
  reportedIndependentN: validLedger.reportedIndependentN
};
const oldRequired = oldSchema.$defs.batchRecord.required;
const oldSchemaAudit = {
  oneDictionaryArmButBothEndpointsRequired: oldRequired.includes("dictionaryArm") && oldRequired.includes("negativeEndpoint") && oldRequired.includes("positiveEndpoint"),
  omittedPhaseNotRequired: !oldRequired.includes("omittedPhaseId"),
  noNestedPhysicalHierarchy: !oldSchema.properties.batches && Boolean(oldSchema.properties.records),
  noSourceLotScope: !oldSchema.$defs.sourceLots && !oldSchema.properties.inferentialScope,
  noOutcomeEmbargoMode: !oldSchema.properties.mode
};
const output = {
  auditId: "INTERVENTION-PILOT-LEDGER-AUDIT-0.2",
  computedOn: "2026-08-14",
  status: "outcome-free-adversarial-dry-run-complete",
  denominators: { fixtures: fixtureResults.length, adversarialMutations: fixtureResults.length - 1, expectedFactorialCellsPerBatch: 4 },
  hierarchyCounts: counts,
  scheduleCoverage: Object.fromEntries(validLedger.batches.map(batch => [batch.preparationBatchId, new Set(batch.aliquots.map(aliquot => `${batch.specimens.find(specimen => specimen.physicalSpecimenId === aliquot.physicalSpecimenId).particleSizeArm}|${aliquot.geometryArm}`)).size])),
  validFixture: { valid: validate(validLedger).valid, containsPhysicalOutcomes: false, ledgerSha256: sha(JSON.stringify(validLedger)) },
  fixtureResults,
  oldSchemaAudit,
  decisions: {
    H1_flatRecordSchemaSufficient: false,
    H2_hierarchicalOutcomeFreeLedgerPasses: validate(validLedger).valid,
    H3_allPrecommittedMutationsDetected: fixtureResults.every(row => row.detectedAsSpecified),
    H4_analysisViewsIncreaseIndependentN: false,
    H5_commonLotsQualifyUnconditionalTransport: false,
    H6_physicalPilotReady: false,
    H7_sieveAndRotationEfficacyQualified: false
  },
  readiness: {
    "G1-EHS": "not-satisfied-by-repository",
    "G2-LINEAGE": fixtureResults.every(row => row.detectedAsSpecified) ? "passed-in-outcome-free-dry-run" : "failed",
    "G3-BLINDING": "partial-offline-key-custody-not-demonstrated",
    "G4-INSTRUMENT": "not-satisfied-without-institution",
    "G5-SUPPLY": "not-satisfied-without-institution"
  },
  interpretation: {
    established: "The hierarchical dry-run ledger preserves n=3 while representing 6 specimens, 12 aliquots, 24 raw acquisitions, and 48 analysis views; every one of eleven sealed adversarial mutations is detected for its intended reason.",
    rejected: "The RC26 flat-record schema cannot faithfully express two analysis views of one acquisition, source-lot-conditional scope, or an outcome embargo, and therefore is retained only as historical design evidence.",
    notEstablished: "No powder was prepared or measured. Intervention efficacy, physical blinding, instrument readiness, safety approval, and transport beyond the common source lots remain untested."
  }
};

if (!output.decisions.H2_hierarchicalOutcomeFreeLedgerPasses || !output.decisions.H3_allPrecommittedMutationsDetected) throw new Error("RC27 outcome-free ledger audit failed");
if (process.argv.includes("--emit-ledger")) console.log(JSON.stringify(validLedger, null, 2));
else if (process.argv.includes("--emit")) console.log(JSON.stringify(output, null, 2));
else {
  const expected = load("research/reproducibility/intervention-pilot-ledger-audit-result.json");
  if (JSON.stringify(output) !== JSON.stringify(expected)) throw new Error("RC27 pilot-ledger result differs from committed artifact");
  console.log("RC27 intervention-pilot ledger audit reproduced: 11/11 adversarial mutations detected; physical n remains 3 and no outcomes are present.");
}
