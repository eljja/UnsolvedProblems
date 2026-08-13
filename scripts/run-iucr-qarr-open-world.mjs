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
const openDir = path.resolve(after("--open-dir") || process.env.IUCR_QARR_OPEN_WORLD_DIR || path.join(os.tmpdir(), "unsolved-rc22-qarr-open-world"));
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/iucr-qarr-open-world-spec.json");
const referenceManifest = load("research/reproducibility/iucr-qarr-reference-pattern-manifest.json");
const holdoutManifest = load("research/reproducibility/iucr-qarr-external-holdout-manifest.json");
const openManifest = load("research/reproducibility/iucr-qarr-open-world-manifest.json");
const rc20Spec = load("research/reproducibility/iucr-qpa-independent-reduction-spec.json");
const rc20Result = load("research/reproducibility/iucr-qpa-independent-reduction-result.json");
const rc21Result = load("research/reproducibility/iucr-qarr-external-holdout-result.json");
const known = spec.knownPhases, candidates = spec.candidatePhases;
const round = (value, digits = 9) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const median = values => { const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const percentile = (values, probability) => { const sorted = [...values].sort((a, b) => a - b), position = probability * (sorted.length - 1), low = Math.floor(position), high = Math.ceil(position); return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (position - low); };
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const parseProfile = (directory, contract) => {
  const file = path.join(directory, contract.name);
  if (!fs.existsSync(file) || fs.statSync(file).size !== contract.bytes || sha256(file) !== contract.sha256) throw new Error(`profile contract changed for ${contract.name}`);
  const rows = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).map(line => line.trim().split(/\s+/).map(Number));
  if (rows.length !== 7251 || rows.some((row, index) => row.length !== 2 || !row.every(Number.isFinite) || Math.abs(row[0] - (5 + 0.02 * index)) >= 1e-9)) throw new Error(`grid changed for ${contract.name}`);
  return rows;
};
const profileMap = (manifest, directory) => new Map(manifest.files.map(contract => [contract.name, parseProfile(directory, contract)]));
const references = profileMap(referenceManifest, referenceDir), controls = profileMap(holdoutManifest, holdoutDir), open = profileMap(openManifest, openDir);
const interpolate = (x0, y0, x1, y1, x) => x0 === x1 ? (y0 + y1) / 2 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
const baselineSubtract = points => {
  const bins = Array.from({ length: 73 }, () => []);
  for (const point of points) bins[Math.min(72, Math.floor((point[0] - 5) / 2))].push(point);
  const anchors = bins.filter(bin => bin.length).map(bin => [median(bin.map(row => row[0])), percentile(bin.map(row => row[1]), 0.05)]);
  let anchor = 0;
  return points.map(([x, y]) => {
    while (anchor + 1 < anchors.length && x > anchors[anchor + 1][0]) anchor += 1;
    const left = anchors[Math.min(anchor, anchors.length - 1)], right = anchors[Math.min(anchor + 1, anchors.length - 1)];
    return [x, Math.max(y - interpolate(left[0], left[1], right[0], right[1], x), 0)];
  });
};
const vector = (points, mask = null) => points.filter(([x]) => x >= 10 && x <= 100 && (!mask || x < mask[0] || x > mask[1])).map(row => row[1]);
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
    const residual = target.reduce((sum, value, row) => sum + (value - templates.reduce((total, template, index) => total + coefficients[index] * template[row], 0)) ** 2, 0);
    if (!best || residual < best.residual) best = { coefficients, active: active.map(index => names[index]), residual };
  }
  if (!best) throw new Error("no nonnegative solution");
  return { ...best, normalizedResidual: Math.sqrt(best.residual / dot(target, target)) };
};
const fit = (points, templatePoints, names, mask = null) => {
  const result = nnls(vector(baselineSubtract(points), mask), templatePoints.map(item => vector(item, mask)), names);
  return { ...result, coefficientMap: Object.fromEntries(names.map((name, index) => [name, result.coefficients[index]])) };
};
const knownTemplatePoints = known.map(name => baselineSubtract(references.get(`${name}.prn`)));
const calibrationFits = ["1a", "1b", "1c"].map(sample => ({ sample, ...fit(references.get(`cpd-${sample}.prn`), knownTemplatePoints, known) }));
const coefficientSums = calibrationFits.map(row => row.coefficients.reduce((sum, value) => sum + value, 0));
const s0 = median(coefficientSums);
const diagnostic = fitted => ({ knownMass: 100 * fitted.coefficients.reduce((sum, value) => sum + value, 0) / s0, missingMass: 100 - 100 * fitted.coefficients.reduce((sum, value) => sum + value, 0) / s0, normalizedResidual: fitted.normalizedResidual });
const calibrationDiagnostics = calibrationFits.map(row => ({ sample: row.sample, coefficientSum: row.coefficients.reduce((sum, value) => sum + value, 0), ...diagnostic(row) }));
const massThreshold = Math.max(10, 2 * Math.max(...calibrationDiagnostics.map(row => Math.abs(row.missingMass))));
const residualThreshold = 2 * Math.max(...calibrationDiagnostics.map(row => row.normalizedResidual));
const alarm = row => row.missingMass > massThreshold || row.normalizedResidual > residualThreshold;
const controlDiagnostics = holdoutManifest.files.map(contract => {
  const fitted = fit(controls.get(contract.name), knownTemplatePoints, known), values = diagnostic(fitted);
  return { sample: contract.sample, coefficientSum: fitted.coefficients.reduce((sum, value) => sum + value, 0), ...values, alarm: alarm(values) };
});

// The blind output is complete before candidate profiles or Sample 2 truth are used.
const targetPoints = open.get("cpd-2.prn"), targetKnownFit = fit(targetPoints, knownTemplatePoints, known), targetDiagnostic = diagnostic(targetKnownFit);
const blindTarget = { ...targetDiagnostic, alarm: alarm(targetDiagnostic), active: targetKnownFit.active, coefficients: targetKnownFit.coefficientMap };

const peakArea = (points, center) => {
  const contract = rc20Spec.peakAreaContract;
  const signal = points.filter(([x]) => Math.abs(x - center) <= contract.signalHalfWidthDegrees2Theta);
  const low = points.filter(([x]) => x >= center - contract.sidebandOuterHalfWidthDegrees2Theta && x <= center - contract.sidebandInnerHalfWidthDegrees2Theta);
  const high = points.filter(([x]) => x >= center + contract.sidebandInnerHalfWidthDegrees2Theta && x <= center + contract.sidebandOuterHalfWidthDegrees2Theta);
  const x0 = median(low.map(row => row[0])), x1 = median(high.map(row => row[0])), y0 = median(low.map(row => row[1])), y1 = median(high.map(row => row[1]));
  const net = signal.map(([x, y]) => [x, Math.max(y - interpolate(x0, y0, x1, y1, x), 0)]);
  return net.slice(1).reduce((sum, row, index) => sum + (row[0] - net[index][0]) * (row[1] + net[index][1]) / 2, 0);
};
const normalizedComposition = (values, responses) => {
  const raw = Object.fromEntries(known.map(name => [name, values[name] / responses[name]])), total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(known.map(name => [name, 100 * raw[name] / total]));
};
const primaryAreas = Object.fromEntries(known.map(name => [name, peakArea(targetPoints, rc20Spec.peakAreaContract.primaryCentersDegrees2Theta[name])]));
const closedPeak = normalizedComposition(primaryAreas, rc20Result.calibrations.primary.responseRatios);
const closedWhole = normalizedComposition(targetKnownFit.coefficientMap, rc21Result.fullPatternCalibration.responseRatios);

const candidateRuns = {};
const runCandidates = mask => {
  const base = fit(targetPoints, knownTemplatePoints, known, mask), rows = [];
  for (const candidate of candidates) {
    const names = [...known, candidate], templates = [...knownTemplatePoints, baselineSubtract(open.get(`${candidate}.prn`))];
    const fitted = fit(targetPoints, templates, names, mask), reduction = 1 - fitted.residual / base.residual;
    rows.push({ candidate, active: fitted.active, coefficient: fitted.coefficientMap[candidate], diagnosticMass: 100 * fitted.coefficientMap[candidate] / s0, normalizedResidual: fitted.normalizedResidual, squaredResidualReduction: reduction, residual: fitted.residual });
  }
  rows.sort((a, b) => a.normalizedResidual - b.normalizedResidual);
  return { baseResidual: base.residual, baseNormalizedResidual: base.normalizedResidual, ranking: rows, selected: Math.abs(rows[0].normalizedResidual - rows[1].normalizedResidual) <= 1e-9 ? null : rows[0].candidate };
};
candidateRuns.full = runCandidates(null);
candidateRuns.masked = runCandidates(spec.numericalContract.dominantBrucite001MaskDegrees2Theta);

const truth = spec.officialTruthWeightPercent.sample2;
const closedErrors = composition => ({ ...Object.fromEntries(known.map(name => [name, Math.abs(composition[name] - truth[name])])), brucite: truth.brucite });
const bruciteFull = candidateRuns.full.ranking.find(row => row.candidate === "brucite"), bruciteMasked = candidateRuns.masked.ranking.find(row => row.candidate === "brucite");
const decisions = {
  H1_closedThreePhaseSilentUnsafe: [closedPeak, closedWhole].every(row => Math.abs(Object.values(row).reduce((sum, value) => sum + value, 0) - 100) < 1e-8) && Math.max(...Object.values(closedErrors(closedPeak))) > 5,
  H2_blindClosureDetectsMissingMass: controlDiagnostics.every(row => !row.alarm) && blindTarget.alarm && Math.abs(blindTarget.missingMass - truth.brucite) <= 10,
  H3_candidateCompetitionIdentifiesBrucite: candidateRuns.full.selected === "brucite" && bruciteFull.coefficient > 0 && bruciteFull.squaredResidualReduction >= 0.5 && bruciteFull.normalizedResidual < residualThreshold,
  H4_attributionSurvivesDominantPeakMask: candidateRuns.masked.selected === "brucite" && bruciteMasked.squaredResidualReduction >= 0.5 && Math.abs(bruciteMasked.diagnosticMass - bruciteFull.diagnosticMass) / bruciteFull.diagnosticMass <= 0.2,
  independentPhysicalRungQualified: false
};
const cleanFit = row => ({ sample: row.sample, coefficientSum: round(row.coefficientSum), knownMass: round(row.knownMass, 6), missingMass: round(row.missingMass, 6), normalizedResidual: round(row.normalizedResidual), alarm: row.alarm });
const cleanRun = run => ({ baseNormalizedResidual: round(run.baseNormalizedResidual), selected: run.selected, ranking: run.ranking.map(row => ({ ...row, coefficient: round(row.coefficient), diagnosticMass: round(row.diagnosticMass, 6), normalizedResidual: round(row.normalizedResidual), squaredResidualReduction: round(row.squaredResidualReduction), residual: round(row.residual, 3) })) });
const result = {
  benchmarkId: spec.benchmarkId, generatedOn: "2026-08-14",
  source: { referenceManifestId: referenceManifest.manifestId, holdoutManifestId: holdoutManifest.manifestId, openWorldManifestId: openManifest.manifestId },
  denominators: { calibrationMixtures: 3, knownOnlyControls: 5, knownTemplates: 3, candidateTemplates: 2, targetPatterns: 1, pointsPerProfile: 7251, fullFitPoints: vector(knownTemplatePoints[0]).length, maskedFitPoints: vector(knownTemplatePoints[0], spec.numericalContract.dominantBrucite001MaskDegrees2Theta).length },
  blindCalibration: { s0: round(s0), massAlarmThresholdPercentagePoints: round(massThreshold, 6), residualAlarmThreshold: round(residualThreshold), calibration: calibrationDiagnostics.map(cleanFit), knownOnlyControls: controlDiagnostics.map(cleanFit), targetBeforeCandidateDisclosure: { ...blindTarget, knownMass: round(blindTarget.knownMass, 6), missingMass: round(blindTarget.missingMass, 6), normalizedResidual: round(blindTarget.normalizedResidual), coefficients: Object.fromEntries(known.map(name => [name, round(blindTarget.coefficients[name])])) } },
  closedThreePhase: { primaryPeakRir: { composition: Object.fromEntries(known.map(name => [name, round(closedPeak[name], 6)])), absoluteErrorsIncludingOmittedPhase: Object.fromEntries(Object.entries(closedErrors(closedPeak)).map(([name, value]) => [name, round(value, 6)])) }, wholePattern: { composition: Object.fromEntries(known.map(name => [name, round(closedWhole[name], 6)])), absoluteErrorsIncludingOmittedPhase: Object.fromEntries(Object.entries(closedErrors(closedWhole)).map(([name, value]) => [name, round(value, 6)])) } },
  candidateAttribution: { fullRange: cleanRun(candidateRuns.full), dominantBrucite001Masked: cleanRun(candidateRuns.masked), diagnosticWarning: "Candidate mass uses the known-phase absolute scale and is not a brucite-calibrated RIR estimate." },
  finalAdjudication: { officialWeighedTruth: truth, officialXrfAsReported: spec.officialXrfWeightPercentAsReported.sample2, publishedAuthorQpa: spec.publishedAuthorQpaWeightPercent },
  decisions,
  interpretation: [
    "The blind detector uses neither candidate templates nor Sample 2 truth to set its scale or thresholds.",
    "The candidate competition is a two-member attribution test, not unrestricted phase identification.",
    "The masked test removes the preferred-orientation-enhanced brucite 001 region but cannot make pure and mixture texture identical.",
    "All profiles share the historical CPD instrument, so this replay does not satisfy prospective physical independence."
  ]
};
const target = path.join(root, "research", "reproducibility", "iucr-qarr-open-world-result.json");
if (write) { fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`); console.log(`Wrote ${path.relative(root, target)}.`); }
else console.log(JSON.stringify(result, null, 2));
