import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), write = args.includes("--write");
const after = flag => { const index = args.indexOf(flag); return index < 0 ? null : args[index + 1]; };
const referenceDir = path.resolve(after("--reference-dir") || process.env.IUCR_QARR_REFERENCE_DIR || path.join(os.tmpdir(), "unsolved-rc20-qarr-reference"));
const holdoutDir = path.resolve(after("--holdout-dir") || process.env.IUCR_QARR_HOLDOUT_DIR || path.join(os.tmpdir(), "unsolved-rc21-qarr-holdout"));
const candidateDir = path.resolve(after("--candidate-dir") || process.env.IUCR_QARR_OPEN_WORLD_DIR || path.join(os.tmpdir(), "unsolved-rc22-qarr-open-world"));
const amorphousDir = path.resolve(after("--amorphous-dir") || process.env.IUCR_QARR_AMORPHOUS_DIR || path.join(os.tmpdir(), "unsolved-rc23-qarr-amorphous"));
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/iucr-qarr-amorphous-holdout-spec.json");
const referenceManifest = load("research/reproducibility/iucr-qarr-reference-pattern-manifest.json");
const holdoutManifest = load("research/reproducibility/iucr-qarr-external-holdout-manifest.json");
const candidateManifest = load("research/reproducibility/iucr-qarr-open-world-manifest.json");
const targetManifest = load("research/reproducibility/iucr-qarr-amorphous-holdout-manifest.json");
const rc20Spec = load("research/reproducibility/iucr-qpa-independent-reduction-spec.json");
const rc20Result = load("research/reproducibility/iucr-qpa-independent-reduction-result.json");
const rc21Result = load("research/reproducibility/iucr-qarr-external-holdout-result.json");
const rc22Result = load("research/reproducibility/iucr-qarr-open-world-result.json");
const known = ["corundum", "fluorite", "zincite"], candidates = ["brucite", "silica"];
const round = (value, digits = 9) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const median = values => { const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const percentile = (values, probability) => { const sorted = [...values].sort((a, b) => a - b), position = probability * (sorted.length - 1), low = Math.floor(position), high = Math.ceil(position); return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (position - low); };
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const parse = (directory, contract) => {
  const file = path.join(directory, contract.name);
  if (!fs.existsSync(file) || fs.statSync(file).size !== contract.bytes || sha256(file) !== contract.sha256) throw new Error(`profile contract changed for ${contract.name}`);
  const rows = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).map(line => line.trim().split(/\s+/).map(Number));
  if (rows.length !== 7251 || rows.some((row, index) => row.length !== 2 || !row.every(Number.isFinite) || Math.abs(row[0] - (5 + 0.02 * index)) >= 1e-9)) throw new Error(`grid changed for ${contract.name}`);
  return rows;
};
const maps = {
  reference: new Map(referenceManifest.files.map(contract => [contract.name, parse(referenceDir, contract)])),
  holdout: new Map(holdoutManifest.files.map(contract => [contract.name, parse(holdoutDir, contract)])),
  candidate: new Map(candidateManifest.files.filter(contract => candidates.includes(contract.name.replace(".prn", ""))).map(contract => [contract.name, parse(candidateDir, contract)])),
  target: new Map(targetManifest.files.map(contract => [contract.name, parse(amorphousDir, contract)]))
};
const interpolate = (a, b, x) => a[0] === b[0] ? (a[1] + b[1]) / 2 : a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
const baseline = points => {
  const bins = Array.from({ length: 73 }, () => []);
  for (const point of points) bins[Math.min(72, Math.floor((point[0] - 5) / 2))].push(point);
  const anchors = bins.filter(bin => bin.length).map(bin => [median(bin.map(row => row[0])), percentile(bin.map(row => row[1]), 0.05)]);
  let anchor = 0;
  return points.map(([x, y]) => { while (anchor + 1 < anchors.length && x > anchors[anchor + 1][0]) anchor += 1; return [x, Math.max(y - interpolate(anchors[anchor], anchors[Math.min(anchor + 1, anchors.length - 1)], x), 0)]; });
};
const segment = points => points.filter(([x]) => x >= 10 && x <= 100);
const values = points => segment(points).map(row => row[1]);
const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);
const solve = (matrix, rhs) => {
  const n = rhs.length, a = matrix.map((row, index) => [...row, rhs[index]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col; for (let row = col + 1; row < n; row += 1) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = col + 1; row < n; row += 1) { const factor = a[row][col] / a[col][col]; for (let index = col; index <= n; index += 1) a[row][index] -= factor * a[col][index]; }
  }
  const result = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) result[row] = (a[row][n] - a[row].slice(row + 1, n).reduce((sum, value, offset) => sum + value * result[row + 1 + offset], 0)) / a[row][row];
  return result;
};
const nnls = (target, templates, names) => {
  let best = null;
  for (let mask = 1; mask < 2 ** names.length; mask += 1) {
    const active = names.map((_, index) => index).filter(index => mask & (1 << index));
    const fit = solve(active.map(i => active.map(j => dot(templates[i], templates[j]))), active.map(i => dot(templates[i], target)));
    if (!fit || fit.some(value => value < -1e-12)) continue;
    const coefficients = Array(names.length).fill(0); active.forEach((phaseIndex, index) => { coefficients[phaseIndex] = Math.max(0, fit[index]); });
    const prediction = target.map((_, row) => templates.reduce((sum, template, index) => sum + coefficients[index] * template[row], 0));
    const residual = target.reduce((sum, value, row) => sum + (value - prediction[row]) ** 2, 0);
    if (!best || residual < best.residual) best = { coefficients, prediction, residual, active: active.map(index => names[index]) };
  }
  if (!best) throw new Error("no nonnegative solution");
  return { ...best, normalizedResidual: Math.sqrt(best.residual / dot(target, target)), coefficientMap: Object.fromEntries(names.map((name, index) => [name, best.coefficients[index]])) };
};
const targetPoints = maps.target.get("cpd-3.prn"), targetProcessed = baseline(targetPoints), targetSegment = segment(targetProcessed), targetVector = targetSegment.map(row => row[1]);
const knownProcessed = known.map(name => baseline(maps.reference.get(`${name}.prn`))), knownVectors = knownProcessed.map(values);
const knownFit = nnls(targetVector, knownVectors, known);
const frozen = spec.frozenRc22Detector;
const knownMass = 100 * knownFit.coefficients.reduce((sum, value) => sum + value, 0) / frozen.absoluteCoefficientScale;
const blind = { knownMass, missingMass: 100 - knownMass, normalizedResidual: knownFit.normalizedResidual };
blind.alarmByMass = blind.missingMass > frozen.massAlarmThresholdPercentagePoints;
blind.alarmByResidual = blind.normalizedResidual > frozen.residualAlarmThreshold;
blind.alarm = blind.alarmByMass || blind.alarmByResidual;

const peakArea = (points, center) => {
  const contract = rc20Spec.peakAreaContract, signal = points.filter(([x]) => Math.abs(x - center) <= contract.signalHalfWidthDegrees2Theta);
  const low = points.filter(([x]) => x >= center - contract.sidebandOuterHalfWidthDegrees2Theta && x <= center - contract.sidebandInnerHalfWidthDegrees2Theta);
  const high = points.filter(([x]) => x >= center + contract.sidebandInnerHalfWidthDegrees2Theta && x <= center + contract.sidebandOuterHalfWidthDegrees2Theta);
  const a = [median(low.map(row => row[0])), median(low.map(row => row[1]))], b = [median(high.map(row => row[0])), median(high.map(row => row[1]))];
  const net = signal.map(([x, y]) => [x, Math.max(y - interpolate(a, b, x), 0)]);
  return net.slice(1).reduce((sum, row, index) => sum + (row[0] - net[index][0]) * (row[1] + net[index][1]) / 2, 0);
};
const normalizeComposition = (input, response) => { const raw = Object.fromEntries(known.map(name => [name, input[name] / response[name]])), total = Object.values(raw).reduce((sum, value) => sum + value, 0); return Object.fromEntries(known.map(name => [name, 100 * raw[name] / total])); };
const primary = normalizeComposition(Object.fromEntries(known.map(name => [name, peakArea(targetPoints, rc20Spec.peakAreaContract.primaryCentersDegrees2Theta[name])])), rc20Result.calibrations.primary.responseRatios);
const whole = normalizeComposition(knownFit.coefficientMap, rc21Result.fullPatternCalibration.responseRatios);

const candidateRows = [];
const fits = {};
for (const candidate of candidates) {
  const candidateVector = values(baseline(maps.candidate.get(`${candidate}.prn`)));
  const fit = nnls(targetVector, [...knownVectors, candidateVector], [...known, candidate]);
  fits[candidate] = fit;
  candidateRows.push({
    candidate, active: fit.active, coefficient: fit.coefficientMap[candidate], diagnosticMass: 100 * fit.coefficientMap[candidate] / frozen.absoluteCoefficientScale,
    normalizedResidual: fit.normalizedResidual, squaredResidualReduction: 1 - fit.residual / knownFit.residual, residual: fit.residual
  });
}
candidateRows.sort((a, b) => a.normalizedResidual - b.normalizedResidual);
const selected = Math.abs(candidateRows[0].normalizedResidual - candidateRows[1].normalizedResidual) <= 1e-9 ? null : candidateRows[0].candidate;
const silica = candidateRows.find(row => row.candidate === "silica"), brucite = candidateRows.find(row => row.candidate === "brucite");

let haloImprovement = 0, outsideImprovement = 0;
for (let index = 0; index < targetVector.length; index += 1) {
  const knownError = (targetVector[index] - knownFit.prediction[index]) ** 2;
  const silicaError = (targetVector[index] - fits.silica.prediction[index]) ** 2;
  const improvement = knownError - silicaError, angle = targetSegment[index][0];
  if (angle >= spec.localizationContract.haloDegrees2Theta[0] && angle <= spec.localizationContract.haloDegrees2Theta[1]) haloImprovement += improvement;
  else outsideImprovement += improvement;
}
const totalImprovement = haloImprovement + outsideImprovement, haloShare = haloImprovement / totalImprovement;

// Official truth is joined only after blind, closed, candidate, and localization outputs are fixed.
const truth = spec.officialTruthWeightPercent.sample3;
const errors = composition => ({ ...Object.fromEntries(known.map(name => [name, Math.abs(composition[name] - truth[name])])), amorphousSilica: truth.amorphousSilica });
const controlsRemainClean = rc22Result.blindCalibration.knownOnlyControls.every(row => !row.alarm);
const decisions = {
  H1_closedThreePhaseSilentlyHidesAmorphous: [primary, whole].every(row => Math.abs(Object.values(row).reduce((sum, value) => sum + value, 0) - 100) < 1e-8) && Math.max(...Object.values(errors(primary))) > 5 && Math.max(...Object.values(errors(whole))) > 5,
  H2_frozenBlindDetectorTransportsToAmorphous: controlsRemainClean && blind.alarm,
  H3_candidateLibraryReversesToSilica: selected === "silica" && silica.coefficient > 0 && silica.squaredResidualReduction >= 0.5 && silica.normalizedResidual < frozen.residualAlarmThreshold && silica.squaredResidualReduction >= 2 * brucite.squaredResidualReduction,
  H4_frozenScaleQuantifiesAmorphousMass: Math.abs(silica.diagnosticMass - truth.amorphousSilica) <= 10,
  H5_gainLocalizesToOfficialHalo: haloImprovement > 0 && haloShare >= 0.5,
  independentPhysicalRungQualified: false
};
const cleanComposition = row => Object.fromEntries(known.map(name => [name, round(row[name], 6)]));
const result = {
  benchmarkId: spec.benchmarkId, generatedOn: "2026-08-14",
  source: { referenceManifestId: referenceManifest.manifestId, holdoutManifestId: holdoutManifest.manifestId, candidateManifestId: candidateManifest.manifestId, targetManifestId: targetManifest.manifestId, frozenBenchmarkId: frozen.benchmarkId },
  denominators: { calibrationMixtures: 3, knownOnlyControls: 5, priorCrystallinePositives: 1, externalAmorphousPositives: 1, knownTemplates: 3, candidateTemplates: 2, pointsPerProfile: 7251, fitPoints: targetVector.length, haloPoints: targetSegment.filter(([x]) => x >= 15 && x <= 30).length },
  frozenDetector: { absoluteScale: frozen.absoluteCoefficientScale, massThresholdPercentagePoints: frozen.massAlarmThresholdPercentagePoints, residualThreshold: frozen.residualAlarmThreshold, knownOnlyFalseAlarms: rc22Result.blindCalibration.knownOnlyControls.filter(row => row.alarm).length },
  blindTargetBeforeCandidateDisclosure: { active: knownFit.active, coefficients: Object.fromEntries(known.map(name => [name, round(knownFit.coefficientMap[name])])), knownMass: round(blind.knownMass, 6), missingMass: round(blind.missingMass, 6), normalizedResidual: round(blind.normalizedResidual), alarmByMass: blind.alarmByMass, alarmByResidual: blind.alarmByResidual, alarm: blind.alarm },
  closedThreePhase: {
    primaryPeakRir: { composition: cleanComposition(primary), absoluteErrorsIncludingOmittedPhase: Object.fromEntries(Object.entries(errors(primary)).map(([name, value]) => [name, round(value, 6)])) },
    wholePattern: { composition: cleanComposition(whole), absoluteErrorsIncludingOmittedPhase: Object.fromEntries(Object.entries(errors(whole)).map(([name, value]) => [name, round(value, 6)])) }
  },
  candidateReversal: { selected, ranking: candidateRows.map(row => ({ ...row, coefficient: round(row.coefficient), diagnosticMass: round(row.diagnosticMass, 6), normalizedResidual: round(row.normalizedResidual), squaredResidualReduction: round(row.squaredResidualReduction), residual: round(row.residual, 3) })), silicaToBruciteImprovementRatio: round(silica.squaredResidualReduction / brucite.squaredResidualReduction) },
  signalLocalization: { intervalDegrees2Theta: spec.localizationContract.haloDegrees2Theta, haloImprovementSse: round(haloImprovement, 3), outsideImprovementSse: round(outsideImprovement, 3), totalImprovementSse: round(totalImprovement, 3), haloShare: round(haloShare) },
  finalAdjudication: { officialWeighedTruth: truth, officialXrfAsReported: spec.officialXrfWeightPercentAsReported.sample3, publishedAuthorQpa: spec.publishedAuthorQpaWeightPercent, diagnosticSilicaMassAbsoluteError: round(Math.abs(silica.diagnosticMass - truth.amorphousSilica), 6) },
  decisions,
  interpretation: [
    "The RC22 detector, candidate pool, thresholds, and reduction are reused without Sample 3 tuning.",
    "Sample 3 is an external positive for omitted-component morphology but shares the historical instrument and known phases.",
    "Correct candidate reversal does not qualify mass unless H4 independently passes.",
    "The 15-30 degree partition localizes fit improvement without refitting and cannot alone prove chemical identity."
  ]
};
const destination = path.join(root, "research", "reproducibility", "iucr-qarr-amorphous-holdout-result.json");
if (write) { fs.writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`); console.log(`Wrote ${path.relative(root, destination)}.`); }
else console.log(JSON.stringify(result, null, 2));
