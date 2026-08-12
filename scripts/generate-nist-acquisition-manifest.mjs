import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pilot = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/nist-micro-pilot-result.json"), "utf8"));
const budget24 = pilot.budgets.find(row => row.budget === 24);
const budget32 = pilot.budgets.find(row => row.budget === 32);
const coordinates = [...budget32.frontierCoordinates.map(row => ({ ...row, stratum: "frontier" })), ...budget32.controlCoordinates.map(row => ({ ...row, stratum: "control" }))]
  .map(row => ({ ...row, stage: [...budget24.frontierCoordinates, ...budget24.controlCoordinates].some(item => item.measurementId === row.measurementId) ? "checkpoint-24" : "extension-32" }));

const hash32 = text => crypto.createHash("sha256").update(text).digest().readUInt32LE(0);
const shuffled = (items, seed) => {
  const result = [...items];
  let state = hash32(seed) || 1;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2 ** 32; };
  for (let i = result.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};
const scheduleSegment = (coords, sessionId, stage) => {
  const expanded = coords.flatMap(coord => [1, 2].map(repeat => ({ coordinateId: `NIST-${String(coord.measurementId).padStart(3, "0")}`, measurementId: coord.measurementId, vanadiumAtomicPercent: coord.vanadiumAtomicPercent, temperatureC: coord.temperatureC, technicalRepeat: repeat, stage })));
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = shuffled(expanded, `${sessionId}|${stage}|${attempt}`);
    if (candidate.every((row, index) => index === 0 || row.measurementId !== candidate[index - 1].measurementId)) return candidate;
  }
  throw new Error(`Could not separate technical repeats in ${sessionId} ${stage}`);
};

const sessions = [];
for (const preparation of ["P1", "P2"]) for (const condition of ["C1", "C2"]) {
  const sessionId = `${preparation}-${condition}`;
  const checkpoint = scheduleSegment(coordinates.filter(row => row.stage === "checkpoint-24"), sessionId, "checkpoint-24");
  const extension = scheduleSegment(coordinates.filter(row => row.stage === "extension-32"), sessionId, "extension-32");
  const sampleRows = [...checkpoint, ...extension].map((row, index) => ({ runOrder: index + 1, preparationId: preparation, instrumentConditionId: condition, blindedSampleCode: `RC13-${sessionId}-${String(index + 1).padStart(2, "0")}`, ...row }));
  const calibrationRows = [
    { afterSampleRunOrder: 0, referenceRole: "same-geometry transfer monitor", referenceMaterial: "sealed stable artifact to be selected after geometry audit", purpose: "start-session drift in specimen geometry" },
    { afterSampleRunOrder: 0, referenceRole: "traceable anchor", referenceMaterial: "certificate-compatible NIST SRM to be selected", candidateMaterials: ["SRM 1976c", "SRM 2000", "SRM 640f"], purpose: "start-session traceable angular and response anchor" },
    { afterSampleRunOrder: 24, referenceRole: "same-geometry transfer monitor", referenceMaterial: "sealed stable artifact to be selected after geometry audit", purpose: "mid-prefix drift in specimen geometry" },
    { afterSampleRunOrder: 48, referenceRole: "same-geometry transfer monitor", referenceMaterial: "sealed stable artifact to be selected after geometry audit", purpose: "checkpoint drift in specimen geometry" },
    { afterSampleRunOrder: 48, referenceRole: "traceable anchor", referenceMaterial: "certificate-compatible NIST SRM to be selected", candidateMaterials: ["SRM 1976c", "SRM 2000", "SRM 640f"], purpose: "checkpoint traceable angular and response anchor" },
    { afterSampleRunOrder: 64, referenceRole: "same-geometry transfer monitor", referenceMaterial: "sealed stable artifact to be selected after geometry audit", purpose: "end-session drift in specimen geometry" }
  ].map((row, index) => ({ calibrationId: `${sessionId}-CAL-${index + 1}`, sessionId, ...row }));
  sessions.push({ sessionId, preparationId: preparation, instrumentConditionId: condition, sampleAcquisitions: sampleRows, calibrationAcquisitions: calibrationRows });
}

const manifest = {
  manifestId: "NIST-VO2-NESTED-ACQUISITION-MANIFEST-0.1",
  generatedOn: "2026-08-12",
  design: { coordinates: 32, preparations: 2, fixedInstrumentConditions: 2, technicalRepeats: 2, sampleAcquisitions: 256, calibrationAcquisitions: 24, totalFrames: 280, checkpointSampleAcquisitions: 192, extensionSampleAcquisitions: 64 },
  blinding: {
    publicScheduleIsDryRunTemplate: true,
    actualRunRequirement: "A custodian must regenerate blinded sample codes and within-stage order using an uncommitted private seed. Measurement operators receive neither stratum nor HL1-HL5 labels; adjudicators receive raw_frame_id and calibration parentage only after the 192-frame checkpoint is sealed.",
    leakageAudit: { operatorRowsContainStratum: false, operatorRowsContainHumanLabels: false, stageOrderRevealsCheckpointMembership: true }
  },
  currentReferenceMaterials: {
    source: "https://www.nist.gov/programs-projects/powder-diffraction-srms",
    reviewedOn: "2026-08-12",
    referenceSelectionStatus: "unresolved by design",
    geometryAudit: "research/reproducibility/nist-geometry-reference-audit.json",
    originalDatasetGeometry: "Bruker D8 Discover, Cu K-alpha, 500 micrometer beam, two-dimensional detector, fixed 14 degree incident angle, 18-37.2 degree two-theta window, ten-minute integration.",
    caveat: "No SRM is assumed compatible by technique name alone. A traceable anchor must be used in its certificate-prescribed geometry and connected to a stable transfer monitor measured in the exact specimen geometry; configuration-transition uncertainty is estimated separately."
  },
  lineageSchema: {
    requiredIdentifiers: ["specimen_id", "aliquot_id", "preparation_id", "coordinate_id", "facility_id", "instrument_config_id", "session_id", "raw_frame_id", "calibration_id", "reduction_id", "refinement_id", "parent_ids"],
    rawFrameSeal: ["content_sha256", "byte_count", "media_type", "acquired_at", "operator_blind_code"],
    valueBlindGate: "Before intensities are read, every raw frame must have exactly one preparation, coordinate, session, instrument configuration, and applicable calibration parent."
  },
  analysisMapping: coordinates.map(({ developmentLabel, developmentLabels, ...row }) => row),
  operatorSessions: sessions.map(session => ({ ...session, sampleAcquisitions: session.sampleAcquisitions.map(({ measurementId, ...row }) => row) })),
  stopRules: [
    "Stop before analysis if any preparation, frame, calibration, or parent identifier is missing or duplicated.",
    "Stop at 192 sample acquisitions if either external reference drifts beyond its certificate-compatible preregistered tolerance or if a second reduction cannot reconstruct the same parent graph.",
    "Do not estimate preparation variance if P1 and P2 are not independently prepared.",
    "Do not use the published dry-run codes for a live blinded acquisition."
  ]
};

const output = path.join(root, "research/reproducibility/nist-acquisition-manifest.json");
if (process.argv.includes("--write")) {
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, output)}`);
} else console.log(JSON.stringify(manifest, null, 2));

export { manifest };
