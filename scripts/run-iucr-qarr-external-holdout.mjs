import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueAfter = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : null; };
const calibrationDir = path.resolve(valueAfter("--calibration-dir") || process.env.IUCR_QARR_REFERENCE_DIR || path.join(os.tmpdir(), "unsolved-rc20-qarr-reference"));
const holdoutDir = path.resolve(valueAfter("--holdout-dir") || process.env.IUCR_QARR_HOLDOUT_DIR || path.join(os.tmpdir(), "unsolved-rc21-qarr-holdout"));
const write = args.includes("--write");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/iucr-qarr-external-holdout-spec.json");
const calibrationManifest = load("research/reproducibility/iucr-qarr-reference-pattern-manifest.json");
const holdoutManifest = load("research/reproducibility/iucr-qarr-external-holdout-manifest.json");
const rc20Spec = load("research/reproducibility/iucr-qpa-independent-reduction-spec.json");
const rc20Result = load("research/reproducibility/iucr-qpa-independent-reduction-result.json");
const phases = spec.phaseOrder;
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const round = (value, digits = 9) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const median = values => { const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const percentile = (values, probability) => {
  const sorted = [...values].sort((a, b) => a - b), position = probability * (sorted.length - 1), low = Math.floor(position), high = Math.ceil(position);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (position - low);
};

const parseProfile = (directory, contract) => {
  const file = path.join(directory, contract.name);
  if (!fs.existsSync(file) || fs.statSync(file).size !== contract.bytes || sha256(file) !== contract.sha256) throw new Error(`Profile contract changed for ${contract.name}`);
  const rows = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).map((line, index) => {
    const values = line.trim().split(/\s+/).map(Number);
    if (values.length !== 2 || !values.every(Number.isFinite)) throw new Error(`Invalid row ${contract.name}:${index + 1}`);
    return values;
  });
  if (rows.length !== 7251 || !rows.every((row, index) => Math.abs(row[0] - (5 + 0.02 * index)) < 1e-9)) throw new Error(`Grid changed for ${contract.name}`);
  return rows;
};
const calibrationProfiles = new Map(calibrationManifest.files.map(contract => [contract.name, parseProfile(calibrationDir, contract)]));
const holdoutProfiles = new Map(holdoutManifest.files.map(contract => [contract.name, parseProfile(holdoutDir, contract)]));

const interpolate = (leftX, leftY, rightX, rightY, x) => leftX === rightX ? (leftY + rightY) / 2 : leftY + (rightY - leftY) * (x - leftX) / (rightX - leftX);
const peakArea = (points, center) => {
  const contract = rc20Spec.peakAreaContract;
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
const peakAreas = (points, centers) => Object.fromEntries(phases.map(phase => [phase, peakArea(points, centers[phase])]));
const estimateFromResponse = (values, responses) => {
  if (phases.some(phase => !Number.isFinite(values[phase]) || values[phase] <= 0 || !Number.isFinite(responses[phase]) || responses[phase] <= 0)) return null;
  const raw = Object.fromEntries(phases.map(phase => [phase, values[phase] / responses[phase]]));
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(phases.map(phase => [phase, 100 * raw[phase] / total]));
};

const baselineSubtract = points => {
  const bins = Array.from({ length: 73 }, () => []);
  for (const point of points) bins[Math.min(72, Math.floor((point[0] - 5) / 2))].push(point);
  const anchors = bins.filter(bin => bin.length).map(bin => ({ x: median(bin.map(row => row[0])), y: percentile(bin.map(row => row[1]), 0.05) }));
  let anchor = 0;
  return points.map(([x, y]) => {
    while (anchor + 1 < anchors.length && x > anchors[anchor + 1].x) anchor += 1;
    const left = anchors[Math.max(0, Math.min(anchor, anchors.length - 1))], right = anchors[Math.max(0, Math.min(anchor + 1, anchors.length - 1))];
    return [x, Math.max(y - interpolate(left.x, left.y, right.x, right.y, x), 0)];
  });
};
const segment = points => points.filter(([x]) => x >= 20 && x <= 100).map(row => row[1]);
const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);
const solveLinear = (matrix, vector) => {
  const n = vector.length, augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-12) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    for (let row = column + 1; row < n; row += 1) {
      const factor = augmented[row][column] / augmented[column][column];
      for (let index = column; index <= n; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  const solution = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) solution[row] = (augmented[row][n] - augmented[row].slice(row + 1, n).reduce((sum, value, offset) => sum + value * solution[row + 1 + offset], 0)) / augmented[row][row];
  return solution;
};
const nnls = (target, templates) => {
  let best = null;
  for (let mask = 1; mask < 2 ** phases.length; mask += 1) {
    const active = phases.map((_, index) => index).filter(index => mask & (1 << index));
    const gram = active.map(i => active.map(j => dot(templates[i], templates[j]))), rhs = active.map(i => dot(templates[i], target));
    const fit = solveLinear(gram, rhs);
    if (!fit || fit.some(value => value < 0)) continue;
    const coefficients = Array(phases.length).fill(0); active.forEach((phaseIndex, index) => { coefficients[phaseIndex] = fit[index]; });
    const residual = target.reduce((sum, value, row) => {
      const predicted = templates.reduce((total, template, phase) => total + coefficients[phase] * template[row], 0);
      return sum + (value - predicted) ** 2;
    }, 0);
    if (!best || residual < best.residual) best = { coefficients, residual, active: active.map(index => phases[index]) };
  }
  if (!best) return null;
  return { ...best, normalizedResidual: Math.sqrt(best.residual / dot(target, target)) };
};

const pureTemplates = phases.map(phase => segment(baselineSubtract(calibrationProfiles.get(`${phase}.prn`))));
const fullCalibrationFits = {};
for (const sample of spec.calibrationSamples) fullCalibrationFits[sample] = nnls(segment(baselineSubtract(calibrationProfiles.get(`cpd-${sample}.prn`))), pureTemplates);
const fullResponses = { fluorite: 1 };
for (const phase of phases.filter(name => name !== "fluorite")) {
  const phaseIndex = phases.indexOf(phase), fluoriteIndex = phases.indexOf("fluorite");
  const values = spec.calibrationSamples.map(sample => {
    const coefficients = fullCalibrationFits[sample].coefficients, truth = spec.truthWeightPercent[sample];
    return (coefficients[phaseIndex] / coefficients[fluoriteIndex]) / (truth[phase] / truth.fluorite);
  });
  fullResponses[phase] = Math.exp(median(values.map(Math.log)));
}

const errors = (estimate, truth) => {
  if (!estimate) return { byPhase: Object.fromEntries(phases.map(phase => [phase, null])), signedByPhase: Object.fromEntries(phases.map(phase => [phase, null])), maximum: null, unsafe: true };
  const byPhase = Object.fromEntries(phases.map(phase => [phase, Math.abs(estimate[phase] - truth[phase])]));
  return { byPhase, signedByPhase: Object.fromEntries(phases.map(phase => [phase, estimate[phase] - truth[phase]])), maximum: Math.max(...Object.values(byPhase)), unsafe: Math.max(...Object.values(byPhase)) > 5 };
};
const rank = values => values.map(value => {
  const sorted = [...values].sort((a, b) => a - b), indices = sorted.map((entry, index) => entry === value ? index + 1 : null).filter(Boolean);
  return indices.reduce((sum, entry) => sum + entry, 0) / indices.length;
});
const correlation = (left, right) => {
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length, meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;
  const numerator = left.reduce((sum, value, index) => sum + (value - meanLeft) * (right[index] - meanRight), 0);
  const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - meanLeft) ** 2, 0) * right.reduce((sum, value) => sum + (value - meanRight) ** 2, 0));
  return denominator ? numerator / denominator : null;
};

const holdouts = [];
for (const contract of holdoutManifest.files) {
  const points = holdoutProfiles.get(contract.name), sample = contract.sample, truth = spec.truthWeightPercent[sample];
  const primary = estimateFromResponse(peakAreas(points, rc20Spec.peakAreaContract.primaryCentersDegrees2Theta), rc20Result.calibrations.primary.responseRatios);
  const secondary = estimateFromResponse(peakAreas(points, rc20Spec.peakAreaContract.secondaryCentersDegrees2Theta), rc20Result.calibrations.secondary.responseRatios);
  const fit = nnls(segment(baselineSubtract(points)), pureTemplates);
  const coefficientValues = fit ? Object.fromEntries(phases.map((phase, index) => [phase, fit.coefficients[index]])) : Object.fromEntries(phases.map(phase => [phase, null]));
  const fullPattern = fit ? estimateFromResponse(coefficientValues, fullResponses) : null;
  const xrf = spec.xrfWeightPercentAsReported[sample];
  holdouts.push({
    sample, name: contract.name, sha256: contract.sha256,
    primary: primary ? Object.fromEntries(phases.map(phase => [phase, round(primary[phase], 6)])) : null,
    secondary: secondary ? Object.fromEntries(phases.map(phase => [phase, round(secondary[phase], 6)])) : null,
    fullPattern: fullPattern ? Object.fromEntries(phases.map(phase => [phase, round(fullPattern[phase], 6)])) : null,
    primaryError: errors(primary, truth), secondaryError: errors(secondary, truth), fullPatternError: errors(fullPattern, truth),
    primarySecondaryAgreement: primary && secondary ? Math.max(...phases.map(phase => Math.abs(primary[phase] - secondary[phase]))) : null,
    fullPatternFit: fit ? { active: fit.active, coefficients: Object.fromEntries(phases.map((phase, index) => [phase, round(fit.coefficients[index])])), normalizedResidual: round(fit.normalizedResidual) } : null,
    xrfAsReported: xrf, primaryMaximumDifferenceFromXrf: primary ? Math.max(...phases.map(phase => Math.abs(primary[phase] - xrf[phase]))) : null,
    fullPatternMaximumDifferenceFromXrf: fullPattern ? Math.max(...phases.map(phase => Math.abs(fullPattern[phase] - xrf[phase]))) : null
  });
}
const maximumPrimaryError = Math.max(...holdouts.map(row => row.primaryError.maximum ?? Infinity));
const maximumFullPatternError = Math.max(...holdouts.map(row => row.fullPatternError.maximum ?? Infinity));
const spearman = correlation(rank(holdouts.map(row => row.primarySecondaryAgreement ?? Infinity)), rank(holdouts.map(row => row.primaryError.maximum ?? Infinity)));
const decision = {
  H1_frozenPeakRirTransports: holdouts.every(row => !row.primaryError.unsafe),
  H2_fullPatternReferenceTransports: holdouts.every(row => !row.fullPatternError.unsafe),
  H3_fullPatternMateriallyImprovesWorstError: holdouts.every(row => row.fullPattern) && maximumFullPatternError <= 5 && maximumFullPatternError <= 0.8 * maximumPrimaryError,
  H4_peakDisagreementRanksError: Number.isFinite(spearman) && spearman >= 0.8,
  independentPhysicalRungQualified: false
};

const result = {
  benchmarkId: spec.benchmarkId, generatedOn: "2026-08-14",
  source: { calibrationManifestId: calibrationManifest.manifestId, holdoutManifestId: holdoutManifest.manifestId, rc20BenchmarkId: rc20Result.benchmarkId },
  denominators: { calibrationProfiles: 6, calibrationMixtures: 3, pureTemplates: 3, externalHoldoutProfiles: holdouts.length, numericalPointsPerProfile: 7251, fullPatternFitPoints: pureTemplates[0].length },
  frozenPeakResponses: { primary: rc20Result.calibrations.primary.responseRatios, secondary: rc20Result.calibrations.secondary.responseRatios },
  fullPatternCalibration: {
    responseRatios: Object.fromEntries(phases.map(phase => [phase, round(fullResponses[phase])])),
    fits: Object.fromEntries(Object.entries(fullCalibrationFits).map(([sample, fit]) => [sample, { active: fit.active, coefficients: Object.fromEntries(phases.map((phase, index) => [phase, round(fit.coefficients[index])])), normalizedResidual: round(fit.normalizedResidual) }]))
  },
  externalHoldouts: holdouts.map(row => ({
    ...row,
    primaryError: { ...row.primaryError, maximum: round(row.primaryError.maximum, 6), byPhase: Object.fromEntries(phases.map(phase => [phase, round(row.primaryError.byPhase[phase], 6)])), signedByPhase: Object.fromEntries(phases.map(phase => [phase, round(row.primaryError.signedByPhase[phase], 6)])) },
    secondaryError: { ...row.secondaryError, maximum: round(row.secondaryError.maximum, 6), byPhase: Object.fromEntries(phases.map(phase => [phase, round(row.secondaryError.byPhase[phase], 6)])), signedByPhase: Object.fromEntries(phases.map(phase => [phase, round(row.secondaryError.signedByPhase[phase], 6)])) },
    fullPatternError: { ...row.fullPatternError, maximum: round(row.fullPatternError.maximum, 6), byPhase: Object.fromEntries(phases.map(phase => [phase, round(row.fullPatternError.byPhase[phase], 6)])), signedByPhase: Object.fromEntries(phases.map(phase => [phase, round(row.fullPatternError.signedByPhase[phase], 6)])) },
    primarySecondaryAgreement: round(row.primarySecondaryAgreement, 6), primaryMaximumDifferenceFromXrf: round(row.primaryMaximumDifferenceFromXrf, 6), fullPatternMaximumDifferenceFromXrf: round(row.fullPatternMaximumDifferenceFromXrf, 6)
  })),
  aggregate: {
    peak: { estimable: holdouts.filter(row => row.primary).length, unsafe: holdouts.filter(row => row.primaryError.unsafe).length, maximumError: round(maximumPrimaryError, 6), medianError: round(median(holdouts.map(row => row.primaryError.maximum ?? Infinity)), 6) },
    fullPattern: { estimable: holdouts.filter(row => row.fullPattern).length, unsafe: holdouts.filter(row => row.fullPatternError.unsafe).length, maximumError: round(maximumFullPatternError, 6), medianError: round(median(holdouts.map(row => row.fullPatternError.maximum ?? Infinity)), 6) },
    xrfCrossCheck: { peakMaximumDifference: round(Math.max(...holdouts.map(row => row.primaryMaximumDifferenceFromXrf ?? Infinity)), 6), fullPatternMaximumDifference: round(Math.max(...holdouts.map(row => row.fullPatternMaximumDifferenceFromXrf ?? Infinity)), 6) },
    worstErrorReduction: round(1 - maximumFullPatternError / maximumPrimaryError),
    peakAgreementErrorSpearman: round(spearman)
  },
  decision,
  interpretation: [
    "The five composition holdouts never set or tune peak, baseline, response, residual, truth, hypothesis, or safety parameters.",
    "The full-pattern method is a preregistered empirical reference combination, not Rietveld refinement and not direct derivation; it shares the CPD instrument and historical specimens with the peak method.",
    "Official XRF measurements are reported as a separate measurement principle but are not blended with weighed truth or used to tune either estimator.",
    "No historical same-instrument result qualifies the prospective two-institution physical rung."
  ]
};

const target = path.join(root, "research", "reproducibility", "iucr-qarr-external-holdout-result.json");
if (write) { fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`); console.log(`Wrote ${path.relative(root, target)}.`); }
else console.log(JSON.stringify(result, null, 2));
