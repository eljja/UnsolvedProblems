import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), write = args.includes("--write");
const after = flag => { const index = args.indexOf(flag); return index < 0 ? null : args[index + 1]; };
const referenceDir = path.resolve(after("--reference-dir") || process.env.IUCR_QARR_REFERENCE_DIR || path.join(os.tmpdir(), "unsolved-rc20-qarr-reference"));
const targetDir = path.resolve(after("--microabsorption-dir") || process.env.IUCR_QARR_MICROABSORPTION_DIR || path.join(os.tmpdir(), "unsolved-rc24-qarr-microabsorption"));
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/iucr-qarr-microabsorption-adversary-spec.json");
const referenceManifest = load("research/reproducibility/iucr-qarr-reference-pattern-manifest.json");
const targetManifest = load("research/reproducibility/iucr-qarr-microabsorption-adversary-manifest.json");
const rc22 = load("research/reproducibility/iucr-qarr-open-world-result.json");
const rc23 = load("research/reproducibility/iucr-qarr-amorphous-holdout-result.json");
const phases = ["corundum", "magnetite", "zircon"];
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
const corundumContract = referenceManifest.files.find(file => file.name === "corundum.prn");
const targetContract = targetManifest.files.find(file => file.name === "cpd-4.prn");
const magnetiteContract = targetManifest.files.find(file => file.name === "magnetit.prn");
const zirconContract = targetManifest.files.find(file => file.name === "zircon.prn");
const raw = {
  target: parse(targetDir, targetContract),
  corundum: parse(referenceDir, corundumContract),
  magnetite: parse(targetDir, magnetiteContract),
  zircon: parse(targetDir, zirconContract)
};
const interpolate = (a, b, x) => a[0] === b[0] ? (a[1] + b[1]) / 2 : a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
const baseline = points => {
  const bins = Array.from({ length: 73 }, () => []);
  for (const point of points) bins[Math.min(72, Math.floor((point[0] - 5) / 2))].push(point);
  const anchors = bins.filter(bin => bin.length).map(bin => [median(bin.map(row => row[0])), percentile(bin.map(row => row[1]), 0.05)]);
  let anchor = 0;
  return points.map(([x, y]) => { while (anchor + 1 < anchors.length && x > anchors[anchor + 1][0]) anchor += 1; return [x, Math.max(y - interpolate(anchors[anchor], anchors[Math.min(anchor + 1, anchors.length - 1)], x), 0)]; });
};
const segment = points => points.filter(([x]) => x >= spec.frozenDetector.fitRangeDegrees2Theta[0] && x <= spec.frozenDetector.fitRangeDegrees2Theta[1]);
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

// Blind reduction: no Sample 4 truth or challenge metadata is accessed above this line.
const targetProcessed = segment(baseline(raw.target));
const targetVector = targetProcessed.map(row => row[1]);
const templateVectors = phases.map(phase => values(baseline(raw[phase])));
const fit = nnls(targetVector, templateVectors, phases);
const coefficientSum = fit.coefficients.reduce((sum, value) => sum + value, 0);
const knownMass = 100 * coefficientSum / spec.frozenDetector.absoluteCoefficientScale;
const missingMass = 100 - knownMass;
const alarmByMass = missingMass > spec.frozenDetector.massAlarmThresholdPercentagePoints;
const alarmByResidual = fit.normalizedResidual > spec.frozenDetector.residualAlarmThreshold;
const alarm = alarmByMass || alarmByResidual;
const normalizedComposition = Object.fromEntries(phases.map(phase => [phase, 100 * fit.coefficientMap[phase] / coefficientSum]));

const dominantResidual = Object.fromEntries(phases.map(phase => [phase, { points: 0, sse: 0 }]));
for (let row = 0; row < targetVector.length; row += 1) {
  const dominant = phases[templateVectors.map(template => template[row]).indexOf(Math.max(...templateVectors.map(template => template[row])))];
  dominantResidual[dominant].points += 1;
  dominantResidual[dominant].sse += (targetVector[row] - fit.prediction[row]) ** 2;
}
for (const phase of phases) dominantResidual[phase].share = dominantResidual[phase].sse / fit.residual;

// Official truth and challenge physics join only after the blind outputs above are fixed.
const official = spec.officialDesignHeldUntilAdjudication;
const errors = Object.fromEntries(phases.map(phase => [phase, Math.abs(normalizedComposition[phase] - official.weighedWeightPercent[phase])]));
const signedErrors = Object.fromEntries(phases.map(phase => [phase, normalizedComposition[phase] - official.weighedWeightPercent[phase]]));
const maximumAbsoluteError = Math.max(...Object.values(errors));
const xrfTotal = Object.values(official.xrfWeightPercentAsReported).reduce((sum, value) => sum + value, 0);
const xrfErrors = Object.fromEntries(phases.map(phase => [phase, Math.abs(official.xrfWeightPercentAsReported[phase] - official.weighedWeightPercent[phase])]));
const decisions = {
  H1_completeDictionaryQuantitativelySafe: maximumAbsoluteError <= 5,
  H2_frozenGateSpecificAfterDictionaryTransport: !alarm,
  H3_biasMatchesMicroabsorptionDirection: signedErrors.corundum > 0 && signedErrors.magnetite < 0 && signedErrors.zircon < 0,
  H4_residualWarnsOnUnsafeComposition: maximumAbsoluteError <= 5 ? null : alarmByResidual,
  H5_xrfDistinguishesNuisanceFromMissingMass: xrfTotal >= 99 && Math.max(...Object.values(xrfErrors)) <= 1,
  independentPhysicalRungQualified: false
};
const result = {
  benchmarkId: spec.benchmarkId, generatedOn: "2026-08-14",
  source: { targetManifestId: targetManifest.manifestId, inheritedReferenceManifestId: referenceManifest.manifestId, frozenDetectorOrigin: spec.frozenDetector.originBenchmarkId },
  denominators: { targetProfiles: 1, pureReferences: 3, priorKnownOnlyControls: 5, priorUnknownPositives: 2, pointsPerProfile: 7251, fitPoints: targetVector.length },
  frozenDetector: { absoluteScale: spec.frozenDetector.absoluteCoefficientScale, massThresholdPercentagePoints: spec.frozenDetector.massAlarmThresholdPercentagePoints, residualThreshold: spec.frozenDetector.residualAlarmThreshold },
  blindTargetBeforeChallengeDisclosure: {
    active: fit.active, coefficients: Object.fromEntries(phases.map(phase => [phase, round(fit.coefficientMap[phase])])), coefficientSum: round(coefficientSum),
    knownMass: round(knownMass, 6), missingMass: round(missingMass, 6), normalizedResidual: round(fit.normalizedResidual),
    alarmByMass, alarmByResidual, alarm, interpretedAsFalseUnknownAlarmAfterTruthJoin: alarm
  },
  closedComposition: {
    closureNormalizedWeightProxy: Object.fromEntries(phases.map(phase => [phase, round(normalizedComposition[phase], 6)])),
    officialWeighedWeightPercent: official.weighedWeightPercent,
    signedErrorsPercentagePoints: Object.fromEntries(phases.map(phase => [phase, round(signedErrors[phase], 6)])),
    absoluteErrorsPercentagePoints: Object.fromEntries(phases.map(phase => [phase, round(errors[phase], 6)])),
    maximumAbsoluteErrorPercentagePoints: round(maximumAbsoluteError, 6)
  },
  physicalAdjudication: {
    particleSizeMicrometres: official.particleSizeMicrometres,
    cuKAlphaMassAbsorptionCoefficientCm2PerGram: official.cuKAlphaMassAbsorptionCoefficientCm2PerGram,
    xrfWeightPercentAsReported: official.xrfWeightPercentAsReported,
    xrfTotalWeightPercent: round(xrfTotal, 6),
    xrfAbsoluteErrorsFromGravimetryPercentagePoints: Object.fromEntries(phases.map(phase => [phase, round(xrfErrors[phase], 6)])),
    publishedAuthorQpaWeightPercent: official.publishedAuthorQpaWeightPercent
  },
  residualByDominantPureReference: Object.fromEntries(phases.map(phase => [phase, { points: dominantResidual[phase].points, sse: round(dominantResidual[phase].sse, 3), share: round(dominantResidual[phase].share) }])),
  alarmFingerprintComparison: {
    omittedCrystallineBruciteRC22: { unknownComponent: true, massAlarm: rc22.blindCalibration.targetBeforeCandidateDisclosure.missingMass > spec.frozenDetector.massAlarmThresholdPercentagePoints, residualAlarm: rc22.blindCalibration.targetBeforeCandidateDisclosure.normalizedResidual > spec.frozenDetector.residualAlarmThreshold },
    omittedAmorphousSilicaRC23: { unknownComponent: true, massAlarm: rc23.blindTargetBeforeCandidateDisclosure.alarmByMass, residualAlarm: rc23.blindTargetBeforeCandidateDisclosure.alarmByResidual },
    completeDictionaryMicroabsorptionRC24: { unknownComponent: false, massAlarm: alarmByMass, residualAlarm: alarmByResidual }
  },
  decisions,
  interpretation: [
    "The target contains every phase in the supplied dictionary; an alarm is false for unknown-component presence even when the composition is unsafe.",
    "The phase dictionary changes from RC23, so the result rejects universal scalar-closure specificity but does not estimate within-dictionary specificity.",
    "Bias direction is diagnostic evidence for attenuation only after official particle size and absorption contrast are disclosed; it is not a validated correction.",
    "XRF and gravimetry adjudicate component completeness independently of diffraction, while sharing phase-to-element conversion assumptions."
  ]
};
const destination = path.join(root, "research", "reproducibility", "iucr-qarr-microabsorption-adversary-result.json");
if (write) { fs.writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`); console.log(`Wrote ${path.relative(root, destination)}.`); }
else console.log(JSON.stringify(result, null, 2));
