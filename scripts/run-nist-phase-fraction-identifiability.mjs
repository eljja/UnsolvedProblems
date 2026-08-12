import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceIndex = process.argv.indexOf("--source-dir");
const sourceDir = sourceIndex >= 0 ? path.resolve(process.argv[sourceIndex + 1]) : null;
if (!sourceDir) throw new Error("Pass --source-dir containing the official NIST raw profile file.");

const spec = {
  benchmarkId: "NIST-VO2-PHASE-FRACTION-ID-0.1",
  reviewedOn: "2026-08-12",
  purpose: "Test numerical identifiability of a known synthetic fraction between observed low/high endpoint profiles before any claim about physical phase fraction.",
  endpointRule: "Use compositions 92-97 at 23 C and 68 C only when strict all-five majority assigns phase 0 and 2 respectively. Do not use intermediate labels to choose endpoints.",
  split: { developmentCompositions: [92, 94, 96], holdoutCompositions: [93, 95, 97], rule: "alternating ordered eligible compositions, fixed before nuisance results" },
  fractionGrid: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
  estimator: "Nonnegative least squares for low endpoint, high endpoint, constant background, and linear background; fraction is high/(low+high).",
  scenarios: {
    clean: "Exact linear mixtures in the same-composition endpoint basis.",
    affineBackground: "Scale 0.93 or 1.07 plus constant and linear background at +/-1% of profile range; included in estimator.",
    peakShift: "Shift only the high-endpoint contribution by +/-1 or +/-2 bins (0.005 or 0.010 degree 2theta); not included in estimator.",
    shiftAwareRemediation: "Exploratory post-failure remedy: search a frozen -2 to +2 bin high-endpoint shift grid and choose minimum residual before estimating fraction.",
    textureLikeWarp: "Apply opposite eight-block intensity warps to low and high contributions at +/-2% or +/-5%; a stress test, not a calibrated texture model.",
    empiricalDiscrepancy: "Add +/-25% or +/-50% of an intermediate-profile residual after projection onto its same-composition endpoints. This orthogonal lack-of-fit control should raise residual without biasing fraction.",
    transferredTemplates: "Generate clean mixtures from holdout endpoints but fit with the nearest development-composition endpoint pair.",
    interpolatedTemplateRemediation: "Exploratory post-failure remedy: linearly interpolate bracketing development endpoints for holdout compositions 93 and 95, then separately test a frozen -2 to +2 bin shift grid for both endpoint phases; refuse composition 97 because it lies outside development support."
  },
  gates: {
    sameCompositionCleanAndAffineMaxAbsoluteError: 0.02,
    oneAndTwoBinShiftMaxAbsoluteError: 0.05,
    twoPercentTextureLikeWarpMaxAbsoluteError: 0.05,
    neighboringCompositionTransferMaxAbsoluteError: 0.05
  },
  interpretationLimits: [
    "Synthetic fraction is known by construction between two measured curves; it is not a certified crystallographic phase fraction.",
    "The public dataset has no physical replicate, independent structure measurement, or texture measurement.",
    "Passing a scenario establishes numerical recoverability under that perturbation only. Failing identifies a confounding direction for the physical pilot."
  ]
};

const labelRows = JSON.parse(fs.readFileSync(path.join(root, "research/external-audit/nist-vo2-2020/human-labels.json"), "utf8")).records;
const spectra = fs.readFileSync(path.join(sourceDir, "VO2-Nb2O3-XRD-Combiview.txt"), "utf8").trim().split(/\r?\n/).slice(1).map(line => line.split("\t").map(Number));
const labelers = ["HL1", "HL2", "HL3", "HL4", "HL5"];
const strictMajority = values => {
  const counts = [...new Set(values)].map(value => [value, values.filter(item => item === value).length]).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return counts[0][1] > values.length / 2 ? counts[0][0] : null;
};
const phase = row => strictMajority(labelers.map(labeler => row.labels[labeler]));
const rowByCoordinate = new Map(labelRows.map(row => [`${row.vanadiumAtomicPercent}|${row.temperatureC}`, row]));
const eligible = [];
for (let composition = 75; composition <= 99; composition += 1) {
  const low = rowByCoordinate.get(`${composition}|23`), high = rowByCoordinate.get(`${composition}|68`);
  if (low && high && phase(low) === 0 && phase(high) === 2) eligible.push(composition);
}
if (eligible.join("|") !== "92|93|94|95|96|97") throw new Error(`Endpoint eligibility changed: ${eligible.join("|")}`);

const endpoints = Object.fromEntries(eligible.map(composition => {
  const lowRow = rowByCoordinate.get(`${composition}|23`), highRow = rowByCoordinate.get(`${composition}|68`);
  return [composition, { lowRow, highRow, low: spectra[lowRow.measurementId - 1], high: spectra[highRow.measurementId - 1] }];
}));
const n = endpoints[92].low.length;
const x = Array.from({ length: n }, (_, index) => -1 + 2 * index / (n - 1));
const round = (value, digits = 6) => Number(value.toFixed(digits));
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const norm = values => Math.sqrt(dot(values, values));
const add = (...vectors) => vectors[0].map((_, index) => vectors.reduce((sum, vector) => sum + vector[index], 0));
const scale = (vector, multiplier) => vector.map(value => value * multiplier);
const range = vector => Math.max(...vector) - Math.min(...vector);
const solve = (matrix, vector) => {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    if (Math.abs(augmented[column][column]) < 1e-12) return null;
    const divisor = augmented[column][column];
    for (let j = column; j <= size; j += 1) augmented[column][j] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let j = column; j <= size; j += 1) augmented[row][j] -= factor * augmented[column][j];
    }
  }
  return augmented.map(row => row[size]);
};
const leastSquares = (basis, y) => {
  const gram = basis.map(left => basis.map(right => dot(left, right)));
  const rhs = basis.map(vector => dot(vector, y));
  return solve(gram, rhs);
};
const fit = (y, low, high) => {
  const candidates = [];
  for (const active of [[0, 1, 2, 3], [0, 2, 3], [1, 2, 3], [2, 3]]) {
    const fullBasis = [low, high, Array(n).fill(1), x];
    const basis = active.map(index => fullBasis[index]);
    const coefficients = leastSquares(basis, y);
    if (!coefficients) continue;
    const full = [0, 0, 0, 0];
    active.forEach((index, position) => { full[index] = coefficients[position]; });
    if (full[0] < -1e-10 || full[1] < -1e-10) continue;
    const prediction = fullBasis[0].map((_, index) => full.reduce((sum, coefficient, basisIndex) => sum + coefficient * fullBasis[basisIndex][index], 0));
    const residual = y.map((value, index) => value - prediction[index]);
    candidates.push({ coefficients: full, prediction, residual, sse: dot(residual, residual) });
  }
  if (!candidates.length) throw new Error("No nonnegative fit candidate.");
  const best = candidates.sort((a, b) => a.sse - b.sse)[0];
  const signal = best.coefficients[0] + best.coefficients[1];
  return { ...best, fraction: signal > 0 ? best.coefficients[1] / signal : null, normalizedResidual: Math.sqrt(best.sse / n) / (Math.sqrt(dot(y, y) / n) || 1) };
};
const fitShiftAware = (y, low, high) => [-2, -1, 0, 1, 2]
  .map(bins => ({ bins, result: fit(y, low, shiftBins(high, bins)) }))
  .sort((a, b) => a.result.sse - b.result.sse)[0];
const fitDualShiftAware = (y, low, high) => {
  const candidates = [];
  for (const lowBins of [-2, -1, 0, 1, 2]) for (const highBins of [-2, -1, 0, 1, 2]) candidates.push({ lowBins, highBins, result: fit(y, shiftBins(low, lowBins), shiftBins(high, highBins)) });
  return candidates.sort((a, b) => a.result.sse - b.result.sse)[0];
};
const mix = (low, high, fraction) => add(scale(low, 1 - fraction), scale(high, fraction));
const shiftBins = (vector, bins) => vector.map((_, index) => {
  const source = index - bins;
  if (source <= 0) return vector[0];
  if (source >= vector.length - 1) return vector.at(-1);
  const left = Math.floor(source), right = Math.ceil(source), weight = source - left;
  return vector[left] * (1 - weight) + vector[right] * weight;
});
const blockWarp = (amplitude, sign) => x.map((_, index) => 1 + sign * amplitude * (Math.floor(index / Math.ceil(n / 8)) % 2 === 0 ? 1 : -1));
const profileMultiply = (left, right) => left.map((value, index) => value * right[index]);
const makeCase = ({ scenario, composition, fraction, y, fitLow = endpoints[composition].low, fitHigh = endpoints[composition].high, fitFunction = fit, detail = {} }) => {
  const fitted = fitFunction(y, fitLow, fitHigh);
  const estimate = fitted.result || fitted;
  return { scenario, composition, fraction, estimatedFraction: estimate.fraction, absoluteError: Math.abs(estimate.fraction - fraction), normalizedResidual: estimate.normalizedResidual, ...(fitted.result && "bins" in fitted ? { selectedShiftBins: fitted.bins } : {}), ...(fitted.result && "lowBins" in fitted ? { selectedLowShiftBins: fitted.lowBins, selectedHighShiftBins: fitted.highBins } : {}), ...detail };
};

const cases = [];
for (const composition of eligible) {
  const { low, high } = endpoints[composition];
  const profileRange = Math.max(range(low), range(high));
  for (const fraction of spec.fractionGrid) {
    const base = mix(low, high, fraction);
    cases.push(makeCase({ scenario: "clean", composition, fraction, y: base }));
    for (const direction of [-1, 1]) for (const profileScale of [0.93, 1.07]) {
      const y = base.map((value, index) => profileScale * value + direction * 0.01 * profileRange * (1 + x[index]));
      cases.push(makeCase({ scenario: "affineBackground", composition, fraction, y, detail: { direction, profileScale } }));
    }
    for (const bins of [-2, -1, 1, 2]) {
      const y = add(scale(low, 1 - fraction), scale(shiftBins(high, bins), fraction));
      cases.push(makeCase({ scenario: `peakShift${Math.abs(bins)}Bin`, composition, fraction, y, detail: { bins, twoThetaShiftDegrees: bins * 0.005 } }));
      cases.push(makeCase({ scenario: `peakShiftAware${Math.abs(bins)}Bin`, composition, fraction, y, fitFunction: fitShiftAware, detail: { generatedShiftBins: bins, twoThetaShiftDegrees: bins * 0.005 } }));
    }
    for (const amplitude of [0.02, 0.05]) for (const direction of [-1, 1]) {
      const lowWarp = blockWarp(amplitude, direction), highWarp = blockWarp(amplitude, -direction);
      const y = add(scale(profileMultiply(low, lowWarp), 1 - fraction), scale(profileMultiply(high, highWarp), fraction));
      cases.push(makeCase({ scenario: `textureLikeWarp${Math.round(amplitude * 100)}Percent`, composition, fraction, y, detail: { amplitude, direction } }));
    }
  }
  const separationNorm = norm(low.map((value, index) => value - high[index]));
  for (const temperature of [30, 36, 45, 50, 55, 62]) {
    const sourceRow = rowByCoordinate.get(`${composition}|${temperature}`);
    const observed = spectra[sourceRow.measurementId - 1];
    const projection = fit(observed, low, high);
    const residualNorm = norm(projection.residual);
    if (residualNorm <= 0) continue;
    const unitResidual = scale(projection.residual, separationNorm / residualNorm);
    for (const fraction of spec.fractionGrid) for (const amplitude of [0.25, 0.5]) for (const direction of [-1, 1]) {
      const y = add(mix(low, high, fraction), scale(unitResidual, amplitude * direction));
      cases.push(makeCase({ scenario: `empiricalDiscrepancy${Math.round(amplitude * 100)}Percent`, composition, fraction, y, detail: { sourceTemperatureC: temperature, amplitude, direction } }));
    }
  }
}
for (const composition of spec.split.holdoutCompositions) {
  const nearest = spec.split.developmentCompositions.toSorted((a, b) => Math.abs(a - composition) - Math.abs(b - composition) || a - b)[0];
  for (const fraction of spec.fractionGrid) cases.push(makeCase({ scenario: "transferredTemplates", composition, fraction, y: mix(endpoints[composition].low, endpoints[composition].high, fraction), fitLow: endpoints[nearest].low, fitHigh: endpoints[nearest].high, detail: { templateComposition: nearest } }));
}
for (const composition of [93, 95]) {
  const lower = spec.split.developmentCompositions.filter(value => value < composition).at(-1);
  const upper = spec.split.developmentCompositions.find(value => value > composition);
  const weight = (composition - lower) / (upper - lower);
  const interpolatedLow = add(scale(endpoints[lower].low, 1 - weight), scale(endpoints[upper].low, weight));
  const interpolatedHigh = add(scale(endpoints[lower].high, 1 - weight), scale(endpoints[upper].high, weight));
  for (const fraction of spec.fractionGrid) cases.push(makeCase({ scenario: "interpolatedTemplates", composition, fraction, y: mix(endpoints[composition].low, endpoints[composition].high, fraction), fitLow: interpolatedLow, fitHigh: interpolatedHigh, detail: { bracketCompositions: [lower, upper], interpolationWeight: weight } }));
  for (const fraction of spec.fractionGrid) cases.push(makeCase({ scenario: "interpolatedDualShiftTemplates", composition, fraction, y: mix(endpoints[composition].low, endpoints[composition].high, fraction), fitLow: interpolatedLow, fitHigh: interpolatedHigh, fitFunction: fitDualShiftAware, detail: { bracketCompositions: [lower, upper], interpolationWeight: weight } }));
}

const quantile = (sorted, probability) => {
  const position = (sorted.length - 1) * probability, lower = Math.floor(position), upper = Math.ceil(position), weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};
const summarize = selected => {
  const errors = selected.map(row => row.absoluteError).sort((a, b) => a - b);
  const residuals = selected.map(row => row.normalizedResidual).sort((a, b) => a - b);
  return {
    cases: selected.length,
    rmse: round(Math.sqrt(selected.reduce((sum, row) => sum + row.absoluteError ** 2, 0) / selected.length)),
    medianAbsoluteError: round(quantile(errors, 0.5)),
    q95AbsoluteError: round(quantile(errors, 0.95)),
    maximumAbsoluteError: round(errors.at(-1)),
    fractionWithin005: round(selected.filter(row => row.absoluteError <= 0.05).length / selected.length),
    medianNormalizedResidual: round(quantile(residuals, 0.5)),
    q95NormalizedResidual: round(quantile(residuals, 0.95)),
    worstCases: selected.toSorted((a, b) => b.absoluteError - a.absoluteError).slice(0, 5).map(row => ({ ...row, estimatedFraction: round(row.estimatedFraction), absoluteError: round(row.absoluteError), normalizedResidual: round(row.normalizedResidual) }))
  };
};
const scenarioNames = [...new Set(cases.map(row => row.scenario))];
const scenarioResults = Object.fromEntries(scenarioNames.map(name => [name, summarize(cases.filter(row => row.scenario === name))]));
const observedTrajectories = Object.fromEntries(eligible.map(composition => {
  const rows = [23, 30, 36, 45, 50, 55, 62, 68].map(temperatureC => {
    const sourceRow = rowByCoordinate.get(`${composition}|${temperatureC}`);
    const estimate = fit(spectra[sourceRow.measurementId - 1], endpoints[composition].low, endpoints[composition].high);
    return { temperatureC, measurementId: sourceRow.measurementId, strictMajorityPhase: phase(sourceRow), estimatedSyntheticFraction: round(estimate.fraction), normalizedResidual: round(estimate.normalizedResidual) };
  });
  const drops = rows.slice(1).map((row, index) => ({ fromC: rows[index].temperatureC, toC: row.temperatureC, change: row.estimatedSyntheticFraction - rows[index].estimatedSyntheticFraction })).filter(row => row.change < 0);
  return [composition, { rows, monotonicDecreaseCount: drops.length, decreasesLargerThan005: drops.filter(row => row.change < -0.05).map(row => ({ ...row, change: round(row.change) })), maximumNormalizedResidual: round(Math.max(...rows.map(row => row.normalizedResidual))) }];
}));
const trajectorySummary = {
  compositions: eligible.length,
  compositionsWithAnyDecrease: Object.values(observedTrajectories).filter(row => row.monotonicDecreaseCount > 0).length,
  compositionsWithDecreaseLargerThan005: Object.values(observedTrajectories).filter(row => row.decreasesLargerThan005.length > 0).length,
  maximumObservedNormalizedResidual: round(Math.max(...Object.values(observedTrajectories).map(row => row.maximumNormalizedResidual)))
};
const observedRows = Object.values(observedTrajectories).flatMap(row => row.rows).filter(row => row.strictMajorityPhase !== null);
const labelFractionRanges = Object.fromEntries([0, 1, 2].map(label => {
  const values = observedRows.filter(row => row.strictMajorityPhase === label).map(row => row.estimatedSyntheticFraction).sort((a, b) => a - b);
  return [label, { observations: values.length, minimum: round(values[0]), q25: round(quantile(values, 0.25)), median: round(quantile(values, 0.5)), q75: round(quantile(values, 0.75)), maximum: round(values.at(-1)) }];
}));
trajectorySummary.labelFractionRanges = labelFractionRanges;
trajectorySummary.fixedFractionThresholdSeparatesPhase1And2 = labelFractionRanges[1].maximum < labelFractionRanges[2].minimum;
const gates = {
  sameCompositionCleanAndAffinePass: Math.max(scenarioResults.clean.maximumAbsoluteError, scenarioResults.affineBackground.maximumAbsoluteError) <= spec.gates.sameCompositionCleanAndAffineMaxAbsoluteError,
  oneAndTwoBinShiftPass: Math.max(scenarioResults.peakShift1Bin.maximumAbsoluteError, scenarioResults.peakShift2Bin.maximumAbsoluteError) <= spec.gates.oneAndTwoBinShiftMaxAbsoluteError,
  exploratoryShiftAwareRemediationPass: Math.max(scenarioResults.peakShiftAware1Bin.maximumAbsoluteError, scenarioResults.peakShiftAware2Bin.maximumAbsoluteError) <= spec.gates.sameCompositionCleanAndAffineMaxAbsoluteError,
  twoPercentTextureLikeWarpPass: scenarioResults.textureLikeWarp2Percent.maximumAbsoluteError <= spec.gates.twoPercentTextureLikeWarpMaxAbsoluteError,
  neighboringCompositionTransferPass: scenarioResults.transferredTemplates.maximumAbsoluteError <= spec.gates.neighboringCompositionTransferMaxAbsoluteError,
  exploratoryWithinSupportInterpolationPass: scenarioResults.interpolatedTemplates.maximumAbsoluteError <= spec.gates.neighboringCompositionTransferMaxAbsoluteError,
  exploratoryInterpolationWithDualShiftPass: scenarioResults.interpolatedDualShiftTemplates.maximumAbsoluteError <= spec.gates.neighboringCompositionTransferMaxAbsoluteError,
  outOfSupportComposition97Refused: true
};
const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: "2026-08-12",
  source: { datasetDoi: "10.18434/mds2-2301", rawProfilesSha256: "3b47bf36b2abaef376730226e2616a353ba07571c46e71bce464cf9e9bfbe348", labelsSha256: "0056a45f7d45694368597fe7804569339745214530584dae10652873fed38cd2" },
  denominators: { eligibleCompositions: eligible, endpointProfiles: eligible.length * 2, anglePointsPerProfile: n, fractions: spec.fractionGrid.length, totalCases: cases.length },
  endpoints: Object.fromEntries(eligible.map(composition => [composition, { lowMeasurementId: endpoints[composition].lowRow.measurementId, lowTemperatureC: 23, lowLabels: labelers.map(labeler => endpoints[composition].lowRow.labels[labeler]), highMeasurementId: endpoints[composition].highRow.measurementId, highTemperatureC: 68, highLabels: labelers.map(labeler => endpoints[composition].highRow.labels[labeler]) }])),
  scenarioResults,
  observedTrajectories,
  trajectorySummary,
  gates,
  decision: gates.sameCompositionCleanAndAffinePass && gates.oneAndTwoBinShiftPass && gates.twoPercentTextureLikeWarpPass && gates.neighboringCompositionTransferPass
    ? "The synthetic inverse problem passes every prespecified numerical gate; proceed to blinded physical mixtures without interpreting this as physical validation."
    : "Do not use transferred endpoint templates or an unqualified two-endpoint model for physical phase fraction. The post-failure shift-grid and within-support interpolation remedies remain exploratory candidates for preregistration in blinded physical mixtures; refuse out-of-support extrapolation and require an independent structural holdout.",
  limitations: spec.interpretationLimits
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(path.join(root, "research/reproducibility/nist-phase-fraction-identifiability-spec.json"), `${JSON.stringify(spec, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "research/reproducibility/nist-phase-fraction-identifiability-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log("wrote NIST phase-fraction identifiability specification and result");
} else console.log(JSON.stringify(result, null, 2));

export { spec, result };
