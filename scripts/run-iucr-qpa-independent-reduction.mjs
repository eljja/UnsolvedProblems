import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueAfter = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : null; };
const referenceDir = path.resolve(valueAfter("--reference-dir") || process.env.IUCR_QARR_REFERENCE_DIR || path.join(os.tmpdir(), "unsolved-rc20-qarr-reference"));
const rawDir = path.resolve(valueAfter("--raw-dir") || process.env.IUCR_QPA_RAW_DIR || path.join(os.tmpdir(), "unsolved-rc19-rowles-raw", "diffraction_data"));
const summaryDir = path.resolve(valueAfter("--summary-dir") || process.env.IUCR_QPA_SUMMARY_DIR || path.join(os.tmpdir(), "unsolved-rc18-rowles", "sup1"));
const write = args.includes("--write");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/iucr-qpa-independent-reduction-spec.json");
const referenceManifest = load("research/reproducibility/iucr-qarr-reference-pattern-manifest.json");
const rawManifest = load("research/reproducibility/iucr-qpa-raw-source-manifest.json");
const summaryManifest = load("research/reproducibility/iucr-qpa-summary-source-manifest.json");
const phases = spec.phaseOrder;
const prefixes = { corundum: "cor", fluorite: "flu", zincite: "zin" };
const round = (value, digits = 9) => Number(value.toFixed(digits));
const roundOrNull = (value, digits = 9) => Number.isFinite(value) ? round(value, digits) : null;
const ratio = (numerator, denominator) => denominator ? round(numerator / denominator) : null;
const median = values => { const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const parseTwoColumn = (file, contract, normalizedTransport = false) => {
  if (!fs.existsSync(file)) throw new Error(`Missing ${contract.name}`);
  if (!normalizedTransport && fs.statSync(file).size !== contract.bytes) throw new Error(`Byte count changed for ${contract.name}`);
  if (sha256(file) !== contract.sha256) throw new Error(`SHA-256 changed for ${contract.name}`);
  const rows = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).map((line, index) => {
    const values = line.trim().split(/\s+/).map(Number);
    if (values.length !== 2 || !values.every(Number.isFinite)) throw new Error(`Invalid row ${contract.name}:${index + 1}`);
    return values;
  });
  if (!rows.every((row, index) => index === 0 || row[0] > rows[index - 1][0])) throw new Error(`Non-monotone angles in ${contract.name}`);
  return rows;
};

const interpolate = (leftX, leftY, rightX, rightY, x) => leftX === rightX ? (leftY + rightY) / 2 : leftY + (rightY - leftY) * (x - leftX) / (rightX - leftX);
const peakArea = (points, center) => {
  const contract = spec.peakAreaContract;
  const signal = points.filter(([x]) => Math.abs(x - center) <= contract.signalHalfWidthDegrees2Theta);
  const low = points.filter(([x]) => x >= center - contract.sidebandOuterHalfWidthDegrees2Theta && x <= center - contract.sidebandInnerHalfWidthDegrees2Theta);
  const high = points.filter(([x]) => x >= center + contract.sidebandInnerHalfWidthDegrees2Theta && x <= center + contract.sidebandOuterHalfWidthDegrees2Theta);
  if (signal.length < 2 || !low.length || !high.length) return null;
  const lowX = median(low.map(row => row[0])), highX = median(high.map(row => row[0]));
  const lowY = median(low.map(row => row[1])), highY = median(high.map(row => row[1]));
  const net = signal.map(([x, y]) => [x, Math.max(y - interpolate(lowX, lowY, highX, highY, x), 0)]);
  let area = 0;
  for (let index = 1; index < net.length; index += 1) area += (net[index][0] - net[index - 1][0]) * (net[index][1] + net[index - 1][1]) / 2;
  return area;
};
const areasFor = (points, centers) => Object.fromEntries(phases.map(phase => [phase, peakArea(points, centers[phase])]));
const estimateFromAreas = (areas, responses) => {
  if (phases.some(phase => !Number.isFinite(areas[phase]) || areas[phase] <= 0 || !Number.isFinite(responses[phase]) || responses[phase] <= 0)) return null;
  const unnormalized = Object.fromEntries(phases.map(phase => [phase, areas[phase] / responses[phase]]));
  const total = Object.values(unnormalized).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(phases.map(phase => [phase, 100 * unnormalized[phase] / total]));
};
const maxDifference = (left, right) => Math.max(...phases.map(phase => Math.abs(left[phase] - right[phase])));
const errorsFor = (estimate, truth) => {
  const byPhase = Object.fromEntries(phases.map(phase => [phase, estimate ? Math.abs(estimate[phase] - truth[phase]) : null]));
  return { byPhase, maximum: estimate ? Math.max(...Object.values(byPhase)) : null, unsafe: !estimate || Math.max(...Object.values(byPhase)) > 5 };
};

const referenceProfiles = new Map(referenceManifest.files.map(contract => [contract.name, parseTwoColumn(path.join(referenceDir, contract.name), contract, true)]));
const peakFamilies = { primary: spec.peakAreaContract.primaryCentersDegrees2Theta, secondary: spec.peakAreaContract.secondaryCentersDegrees2Theta };
const pureReferenceCrosstalk = {};
for (const [family, centers] of Object.entries(peakFamilies)) {
  pureReferenceCrosstalk[family] = {};
  for (const phase of phases) {
    const areas = areasFor(referenceProfiles.get(`${phase}.prn`), centers);
    const own = areas[phase], other = phases.filter(name => name !== phase).reduce((sum, name) => sum + (areas[name] || 0), 0);
    pureReferenceCrosstalk[family][phase] = { areas: Object.fromEntries(phases.map(name => [name, round(areas[name], 6)])), ownToOtherAreaRatio: other > 0 ? round(own / other, 6) : null };
  }
}

const calibrationSamples = { "cpd-1a.prn": "1a", "cpd-1b.prn": "1b", "cpd-1c.prn": "1c" };
const calibrate = centers => {
  const mixtures = [];
  for (const [file, sample] of Object.entries(calibrationSamples)) {
    const areas = areasFor(referenceProfiles.get(file), centers);
    mixtures.push({ sample, areas });
  }
  const responseRatios = { fluorite: 1 };
  for (const phase of phases.filter(name => name !== "fluorite")) {
    const perMixture = mixtures.map(({ sample, areas }) => ({ sample, value: (areas[phase] / areas.fluorite) / (spec.truthWeightPercent[sample][phase] / spec.truthWeightPercent[sample].fluorite) }));
    responseRatios[phase] = Math.exp(median(perMixture.map(row => Math.log(row.value))));
  }
  const ratiosByMixture = Object.fromEntries(mixtures.map(({ sample, areas }) => [sample, Object.fromEntries(phases.map(phase => [phase, phase === "fluorite" ? 1 : round((areas[phase] / areas.fluorite) / (spec.truthWeightPercent[sample][phase] / spec.truthWeightPercent[sample].fluorite), 9)]))]));
  const estimates = Object.fromEntries(mixtures.map(({ sample, areas }) => [sample, estimateFromAreas(areas, responseRatios)]));
  return { responseRatios: Object.fromEntries(phases.map(phase => [phase, round(responseRatios[phase], 9)])), ratiosByMixture, estimates };
};
const calibrations = Object.fromEntries(Object.entries(peakFamilies).map(([family, centers]) => [family, calibrate(centers)]));

const targetProfiles = [];
for (const contract of rawManifest.rawFiles) {
  const points = parseTwoColumn(path.join(rawDir, contract.name), contract);
  const primaryAreas = areasFor(points, peakFamilies.primary);
  const secondaryAreas = areasFor(points, peakFamilies.secondary);
  const primary = estimateFromAreas(primaryAreas, calibrations.primary.responseRatios);
  const secondary = estimateFromAreas(secondaryAreas, calibrations.secondary.responseRatios);
  const truth = spec.truthWeightPercent[contract.sample];
  targetProfiles.push({
    name: contract.name, rawSha256: contract.sha256, sample: contract.sample,
    nominalMaximumIntensity: contract.nominalMaximumIntensity, nominalStepSize: contract.nominalStepSize,
    adequate: contract.nominalMaximumIntensity >= 20000 && contract.nominalStepSize <= 0.04,
    primaryAreas, secondaryAreas, primary, secondary,
    primaryError: errorsFor(primary, truth), secondaryError: errorsFor(secondary, truth),
    peakAgreement: primary && secondary ? maxDifference(primary, secondary) : null
  });
}

const assessProfiles = selected => ({
  profiles: selected.length,
  refusedProfiles: selected.filter(row => !row.primary).length,
  unsafePrimary: selected.filter(row => row.primaryError.unsafe).length,
  unsafeSecondary: selected.filter(row => row.secondaryError.unsafe).length,
  maximumPrimaryError: roundOrNull(Math.max(...selected.map(row => row.primaryError.maximum ?? Infinity)), 6),
  medianPrimaryError: roundOrNull(median(selected.map(row => row.primaryError.maximum ?? Infinity)), 6),
  maximumSecondaryError: roundOrNull(Math.max(...selected.map(row => row.secondaryError.maximum ?? Infinity)), 6),
  medianPeakAgreement: roundOrNull(median(selected.map(row => row.peakAgreement ?? Infinity)), 6)
});
const adequate = targetProfiles.filter(row => row.adequate);
const adequateDevelopment = adequate.filter(row => row.sample === "1a");
const adequateHoldout = adequate.filter(row => row.sample === "1e");
const unsafeDevelopmentAgreements = adequateDevelopment.filter(row => row.primaryError.unsafe && Number.isFinite(row.peakAgreement)).map(row => row.peakAgreement);
const agreementThreshold = unsafeDevelopmentAgreements.length ? Math.min(...unsafeDevelopmentAgreements) : null;
const agreementGate = row => agreementThreshold !== null && Number.isFinite(row.peakAgreement) && row.peakAgreement < agreementThreshold;
const assessGate = selected => {
  const accepted = selected.filter(agreementGate), safe = selected.filter(row => !row.primaryError.unsafe), unsafe = accepted.filter(row => row.primaryError.unsafe);
  return { profiles: selected.length, acceptedProfiles: accepted.length, unsafeAccepted: unsafe.length, safeRetention: ratio(accepted.filter(row => !row.primaryError.unsafe).length, safe.length), maximumAcceptedPrimaryError: accepted.length ? round(Math.max(...accepted.map(row => row.primaryError.maximum)), 6) : null };
};

const requiredColumns = ["sample", "reftype", "HAL", "maxintfactor", "stepsizefactor", "Rwp_mean", ...phases.map(phase => `${prefixes[phase]}_wt_mean`)];
const parseFullAngleRows = async contract => {
  const file = path.join(summaryDir, contract.name);
  if (!fs.existsSync(file) || fs.statSync(file).size !== contract.bytes || sha256(file) !== contract.sha256) throw new Error(`Summary source changed for ${contract.name}`);
  const lines = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  let indices = null; const rows = [];
  for await (const line of lines) {
    if (!indices) { const header = line.split(","); indices = Object.fromEntries(requiredColumns.map(column => [column, header.indexOf(column)])); if (Object.values(indices).some(index => index < 0)) throw new Error(`Missing summary column in ${contract.name}`); continue; }
    if (!line.trim()) continue; const values = line.split(","); const value = column => values[indices[column]], number = column => Number(value(column));
    if (number("HAL") !== 150) continue;
    const sample = value("sample"), estimates = Object.fromEntries(phases.map(phase => [phase, number(`${prefixes[phase]}_wt_mean`)]));
    rows.push({ sample, refinementType: number("reftype"), nominalMaximumIntensity: number("maxintfactor"), nominalStepSize: number("stepsizefactor"), rwp: number("Rwp_mean"), topasError: errorsFor(estimates, spec.truthWeightPercent[sample]) });
  }
  return rows;
};
const fullAngleRows = (await Promise.all(summaryManifest.files.map(parseFullAngleRows))).flat();
const profileKey = (sample, maximum, step) => `${sample}|${maximum}|${Number(step).toFixed(3)}`;
const profileMap = new Map(targetProfiles.map(row => [profileKey(row.sample, row.nominalMaximumIntensity, row.nominalStepSize), row]));
const diagnosticPartition = { bothPass: 0, peakUnsafeRwpPass: 0, peakSafeRwpFail: 0, bothFail: 0 };
const diagnosticUnsafeCounts = { bothPass: 0, peakUnsafeRwpPass: 0, peakSafeRwpFail: 0, bothFail: 0 };
for (const row of fullAngleRows) {
  const profile = profileMap.get(profileKey(row.sample, row.nominalMaximumIntensity, row.nominalStepSize));
  if (!profile) throw new Error("Full-angle row has no raw profile");
  const peakSafe = !profile.primaryError.unsafe, rwpPass = row.rwp < 8.043046005815;
  const group = peakSafe ? (rwpPass ? "bothPass" : "peakSafeRwpFail") : (rwpPass ? "peakUnsafeRwpPass" : "bothFail");
  diagnosticPartition[group] += 1;
  if (row.topasError.unsafe) diagnosticUnsafeCounts[group] += 1;
}

const calibrationDeviation = {};
for (const family of Object.keys(peakFamilies)) {
  calibrationDeviation[family] = {};
  for (const phase of phases.filter(name => name !== "fluorite")) {
    const center = calibrations[family].responseRatios[phase];
    const rows = Object.entries(calibrations[family].ratiosByMixture).map(([sample, ratios]) => ({ sample, ratio: ratios[phase], relativeDeviation: Math.abs(ratios[phase] - center) / center }));
    calibrationDeviation[family][phase] = { maximumRelativeDeviation: round(Math.max(...rows.map(row => row.relativeDeviation))), rows: rows.map(row => ({ ...row, relativeDeviation: round(row.relativeDeviation) })) };
  }
}

const decision = {
  H1_empiricalRirTransfers: adequate.every(row => row.primary && !row.primaryError.unsafe) && new Set(adequate.map(row => row.sample)).size === 2,
  H2_peakAgreementDetectsError: agreementThreshold !== null && assessGate(adequateHoldout).unsafeAccepted === 0 && assessGate(adequateHoldout).safeRetention >= 0.5,
  H3_responseRatioCompositionInvariant: Object.values(calibrationDeviation).every(family => Object.values(family).every(phase => Number.isFinite(phase.maximumRelativeDeviation) && phase.maximumRelativeDeviation <= 0.2)),
  H4_peakAndRwpComplementary: diagnosticPartition.peakUnsafeRwpPass > 0 && diagnosticPartition.peakSafeRwpFail > 0,
  independentPhysicalRungQualified: false
};

const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: "2026-08-13",
  source: { referenceManifestId: referenceManifest.manifestId, rawManifestId: rawManifest.manifestId, summaryManifestId: summaryManifest.manifestId },
  denominators: { referenceProfiles: referenceProfiles.size, purePhaseReferences: 3, calibrationMixtures: 3, rowlesRawProfiles: targetProfiles.length, adequateProfiles: adequate.length, fullAngleTopasRows: fullAngleRows.length },
  pureReferenceCrosstalk,
  calibrations: Object.fromEntries(Object.entries(calibrations).map(([family, value]) => [family, { responseRatios: value.responseRatios, ratiosByMixture: value.ratiosByMixture, calibrationEstimates: Object.fromEntries(Object.entries(value.estimates).map(([sample, estimate]) => [sample, { estimate: estimate ? Object.fromEntries(phases.map(phase => [phase, round(estimate[phase], 6)])) : null, error: errorsFor(estimate, spec.truthWeightPercent[sample]) }])) }])),
  calibrationDeviation,
  targetPerformance: {
    all: assessProfiles(targetProfiles),
    adequate: assessProfiles(adequate),
    adequateBySample: { "1a": assessProfiles(adequateDevelopment), "1e": assessProfiles(adequateHoldout) }
  },
  agreementGate: { thresholdSelectedOnAdequate1a: agreementThreshold === null ? null : round(agreementThreshold, 9), development: assessGate(adequateDevelopment), holdout: assessGate(adequateHoldout) },
  diagnosticPartition: { counts: diagnosticPartition, topasUnsafeCounts: diagnosticUnsafeCounts },
  worstAdequateProfiles: [...adequate].sort((a, b) => (b.primaryError.maximum ?? Infinity) - (a.primaryError.maximum ?? Infinity)).slice(0, 12).map(row => ({ name: row.name, sample: row.sample, nominalMaximumIntensity: row.nominalMaximumIntensity, nominalStepSize: row.nominalStepSize, primaryEstimate: row.primary ? Object.fromEntries(phases.map(phase => [phase, round(row.primary[phase], 6)])) : null, secondaryEstimate: row.secondary ? Object.fromEntries(phases.map(phase => [phase, round(row.secondary[phase], 6)])) : null, primaryMaximumError: roundOrNull(row.primaryError.maximum, 6), secondaryMaximumError: roundOrNull(row.secondaryError.maximum, 6), peakAgreement: roundOrNull(row.peakAgreement, 6) })),
  decision,
  interpretation: [
    "This is an independent software and estimator lineage but not independent physical replication: both methods ultimately analyse historical diffraction specimens.",
    "Empirical peak ratios deliberately remove whole-pattern refinement and crystal-structure models, but inherit peak-specific orientation, overlap, absorption, crystallinity, background, and cross-instrument response.",
    "A failed calibration-invariance or composition-transfer hypothesis narrows the next physical pilot toward reference-pattern and specimen-response controls rather than larger randomized-start refinement grids.",
    "No threshold is recalibrated on 1e and no physical-rung promotion is possible in this cycle."
  ]
};

const target = path.join(root, "research", "reproducibility", "iucr-qpa-independent-reduction-result.json");
if (write) { fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`); console.log(`Wrote ${path.relative(root, target)}.`); }
else console.log(JSON.stringify(result, null, 2));
