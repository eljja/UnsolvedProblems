import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceIndex = process.argv.indexOf("--source-dir");
const sourceDir = sourceIndex >= 0 ? path.resolve(process.argv[sourceIndex + 1]) : null;
if (!sourceDir) throw new Error("Pass --source-dir containing the official NIST raw profile file.");

const reviewedOn = "2026-08-12";
const compositions = [92, 93, 94, 95, 96, 97];
const developmentCompositions = [92, 94, 96];
const holdoutCompositions = [93, 95, 97];
const fractions = Array.from({ length: 99 }, (_, index) => (index + 1) / 100);
const shiftMagnitudesDegrees = Array.from({ length: 41 }, (_, index) => index * 0.00025);
const errorGate = 0.05;

const spec = {
  benchmarkId: "NIST-VO2-DRIFT-ENVELOPE-0.1",
  reviewedOn,
  purpose: "Resolve the RC16 one-bin failure into a continuous envelope for unmodeled relative peak drift, active-set changes, curvature, and residual-based refusal before a physical pilot.",
  sourceContract: {
    datasetDoi: "10.18434/mds2-2301",
    rawProfilesSha256: "3b47bf36b2abaef376730226e2616a353ba07571c46e71bce464cf9e9bfbe348",
    labelsSha256: "0056a45f7d45694368597fe7804569339745214530584dae10652873fed38cd2"
  },
  endpointRule: "Reuse the RC16 strict-all-five-majority endpoints at 23 C and 68 C for compositions 92-97 at.% V.",
  split: {
    developmentCompositions,
    holdoutCompositions,
    rule: "Freeze the alternating composition split from RC16. Choose the residual refusal threshold on development compositions only and open holdout compositions once."
  },
  design: {
    fractionGrid: { minimum: 0.01, maximum: 0.99, step: 0.01, values: fractions.length },
    shiftGrid: { minimumDegrees: 0, maximumDegrees: 0.01, stepDegrees: 0.00025, magnitudes: shiftMagnitudesDegrees.length, directions: "both signs except one zero case" },
    generator: "(1-f) times the observed low endpoint plus f times a linearly interpolated relative shift of the observed high endpoint.",
    estimator: "Fixed same-composition low/high endpoints with nonnegative endpoint coefficients plus constant and linear background.",
    errorGate,
    residualRefusalRule: "On development compositions, find the smallest normalized residual among cases whose absolute fraction error exceeds 0.05. Refuse cases at or above that threshold; do not optimize on holdouts.",
    safeDriftRule: "Largest shift-grid prefix for which every composition, fraction, and direction remains within absolute fraction error 0.05."
  },
  interpretationLimits: [
    "The envelope bounds the synthetic mixing coefficient between observed endpoint profiles, not certified physical phase fraction.",
    "Relative peak drift combines specimen and instrument effects; an SRM line-position check can qualify the instrument contribution but cannot remove specimen-induced lattice change.",
    "A grid boundary is not a universal material constant. It is a planning bound for the frozen NIST VO2 profiles and model.",
    "Residual refusal may detect model failure without repairing the estimate; its holdout sensitivity and retained coverage must both be reported."
  ]
};

const rawPath = path.join(sourceDir, "VO2-Nb2O3-XRD-Combiview.txt");
const spectra = fs.readFileSync(rawPath, "utf8").trim().split(/\r?\n/).slice(1).map(line => line.split("\t").map(Number));
const labelRows = JSON.parse(fs.readFileSync(path.join(root, "research/external-audit/nist-vo2-2020/human-labels.json"), "utf8")).records;
const byCoordinate = new Map(labelRows.map(row => [`${row.vanadiumAtomicPercent}|${row.temperatureC}`, row]));
const endpoints = Object.fromEntries(compositions.map(composition => {
  const lowRow = byCoordinate.get(`${composition}|23`);
  const highRow = byCoordinate.get(`${composition}|68`);
  if (!lowRow || !highRow) throw new Error(`Missing endpoint for composition ${composition}`);
  return [composition, {
    low: spectra[lowRow.measurementId - 1],
    high: spectra[highRow.measurementId - 1],
    lowMeasurementId: lowRow.measurementId,
    highMeasurementId: highRow.measurementId
  }];
}));

const n = endpoints[92].low.length;
const x = Array.from({ length: n }, (_, index) => -1 + 2 * index / (n - 1));
const round = (value, digits = 9) => Number(value.toFixed(digits));
const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);
const solve = (matrix, vector) => {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    if (Math.abs(augmented[column][column]) < 1e-12) return null;
    const divisor = augmented[column][column];
    for (let position = column; position <= size; position += 1) augmented[column][position] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let position = column; position <= size; position += 1) augmented[row][position] -= factor * augmented[column][position];
    }
  }
  return augmented.map(row => row[size]);
};
const leastSquares = (basis, y) => solve(
  basis.map(left => basis.map(right => dot(left, right))),
  basis.map(vector => dot(vector, y))
);
const fit = (y, low, high) => {
  const fullBasis = [low, high, Array(n).fill(1), x];
  const candidates = [];
  for (const active of [[0, 1, 2, 3], [0, 2, 3], [1, 2, 3], [2, 3]]) {
    const coefficients = leastSquares(active.map(index => fullBasis[index]), y);
    if (!coefficients) continue;
    const full = [0, 0, 0, 0];
    active.forEach((index, position) => { full[index] = coefficients[position]; });
    if (full[0] < -1e-10 || full[1] < -1e-10) continue;
    const residual = y.map((value, index) => value - full.reduce((sum, coefficient, basisIndex) => sum + coefficient * fullBasis[basisIndex][index], 0));
    candidates.push({ coefficients: full, sse: dot(residual, residual) });
  }
  if (!candidates.length) throw new Error("No nonnegative endpoint solution");
  const best = candidates.sort((left, right) => left.sse - right.sse)[0];
  const signal = best.coefficients[0] + best.coefficients[1];
  return {
    fraction: signal > 0 ? best.coefficients[1] / signal : null,
    normalizedResidual: Math.sqrt(best.sse / n) / (Math.sqrt(dot(y, y) / n) || 1),
    activeSet: `${best.coefficients[0] > 1e-10 ? "L" : "-"}${best.coefficients[1] > 1e-10 ? "H" : "-"}`
  };
};
const shiftDegrees = (vector, degrees) => {
  const bins = degrees / 0.005;
  return vector.map((_, index) => {
    const source = index - bins;
    if (source <= 0) return vector[0];
    if (source >= vector.length - 1) return vector.at(-1);
    const left = Math.floor(source);
    const right = Math.ceil(source);
    const weight = source - left;
    return vector[left] * (1 - weight) + vector[right] * weight;
  });
};
const mix = (low, high, fraction) => low.map((value, index) => (1 - fraction) * value + fraction * high[index]);
const quantile = (sorted, probability) => {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position), upper = Math.ceil(position), weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};
const summarize = rows => {
  const errors = rows.map(row => row.absoluteError).sort((a, b) => a - b);
  return {
    cases: rows.length,
    maximumAbsoluteError: round(errors.at(-1)),
    q95AbsoluteError: round(quantile(errors, 0.95)),
    fractionWithin005: round(rows.filter(row => row.absoluteError <= errorGate).length / rows.length),
    activeBoundaryCases: rows.filter(row => row.activeSet !== "LH").length
  };
};

const cases = [];
for (const composition of compositions) {
  const { low, high } = endpoints[composition];
  for (const fraction of fractions) {
    for (const magnitude of shiftMagnitudesDegrees) {
      const directions = magnitude === 0 ? [0] : [-1, 1];
      for (const direction of directions) {
        const signedShiftDegrees = direction * magnitude;
        const y = mix(low, shiftDegrees(high, signedShiftDegrees), fraction);
        const estimate = fit(y, low, high);
        cases.push({
          composition,
          fraction,
          shiftMagnitudeDegrees: magnitude,
          signedShiftDegrees,
          estimatedFraction: estimate.fraction,
          bias: estimate.fraction - fraction,
          absoluteError: Math.abs(estimate.fraction - fraction),
          normalizedResidual: estimate.normalizedResidual,
          activeSet: estimate.activeSet
        });
      }
    }
  }
}

const byShift = shiftMagnitudesDegrees.map(magnitude => {
  const rows = cases.filter(row => row.shiftMagnitudeDegrees === magnitude);
  const summary = summarize(rows);
  const paired = [];
  if (magnitude > 0) {
    for (const composition of compositions) for (const fraction of fractions) {
      const plus = rows.find(row => row.composition === composition && row.fraction === fraction && row.signedShiftDegrees > 0);
      const minus = rows.find(row => row.composition === composition && row.fraction === fraction && row.signedShiftDegrees < 0);
      paired.push({ odd: (plus.bias - minus.bias) / 2, even: (plus.bias + minus.bias) / 2 });
    }
  }
  return {
    shiftMagnitudeDegrees: round(magnitude, 6),
    ...summary,
    maximumAbsoluteOddBias: paired.length ? round(Math.max(...paired.map(row => Math.abs(row.odd)))) : 0,
    maximumAbsoluteEvenBias: paired.length ? round(Math.max(...paired.map(row => Math.abs(row.even)))) : 0
  };
});

const prefixSafeShift = rows => {
  let safe = 0;
  for (const magnitude of shiftMagnitudesDegrees) {
    const prior = rows.filter(row => row.shiftMagnitudeDegrees <= magnitude + 1e-12);
    if (Math.max(...prior.map(row => row.absoluteError)) > errorGate) break;
    safe = magnitude;
  }
  return round(safe, 6);
};
const byComposition = Object.fromEntries(compositions.map(composition => {
  const rows = cases.filter(row => row.composition === composition);
  const worst = rows.toSorted((left, right) => right.absoluteError - left.absoluteError)[0];
  return [composition, {
    safeShiftPrefixDegrees: prefixSafeShift(rows),
    fullGridMaximumAbsoluteError: round(worst.absoluteError),
    worstFraction: round(worst.fraction, 2),
    worstSignedShiftDegrees: round(worst.signedShiftDegrees, 6),
    activeBoundaryCases: rows.filter(row => row.activeSet !== "LH").length
  }];
}));

const developmentRows = cases.filter(row => developmentCompositions.includes(row.composition));
const holdoutRows = cases.filter(row => holdoutCompositions.includes(row.composition));
const unsafeDevelopment = developmentRows.filter(row => row.absoluteError > errorGate);
if (!unsafeDevelopment.length) throw new Error("No unsafe development cases; residual refusal threshold is undefined");
const residualThreshold = Math.min(...unsafeDevelopment.map(row => row.normalizedResidual));
const adjudicateRefusal = rows => {
  const accepted = rows.filter(row => row.normalizedResidual < residualThreshold);
  const refused = rows.filter(row => row.normalizedResidual >= residualThreshold);
  const unsafe = rows.filter(row => row.absoluteError > errorGate);
  const acceptedUnsafe = accepted.filter(row => row.absoluteError > errorGate);
  const refusedSafe = refused.filter(row => row.absoluteError <= errorGate);
  return {
    cases: rows.length,
    unsafeCases: unsafe.length,
    acceptedCases: accepted.length,
    refusedCases: refused.length,
    acceptedCoverage: round(accepted.length / rows.length),
    unsafeAcceptedCases: acceptedUnsafe.length,
    unsafeMissRate: unsafe.length ? round(acceptedUnsafe.length / unsafe.length) : 0,
    safeRefusedCases: refusedSafe.length,
    safeRefusalRate: rows.length - unsafe.length ? round(refusedSafe.length / (rows.length - unsafe.length)) : 0,
    maximumAcceptedAbsoluteError: accepted.length ? round(Math.max(...accepted.map(row => row.absoluteError))) : null
  };
};

const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: reviewedOn,
  source: spec.sourceContract,
  denominators: {
    compositions: compositions.length,
    endpointProfiles: compositions.length * 2,
    anglePointsPerProfile: n,
    fractions: fractions.length,
    shiftMagnitudes: shiftMagnitudesDegrees.length,
    totalCases: cases.length
  },
  globalSafeShiftPrefixDegrees: prefixSafeShift(cases),
  byComposition,
  byShift,
  residualRefusal: {
    thresholdSelectedOnDevelopment: round(residualThreshold, 12),
    thresholdRule: spec.design.residualRefusalRule,
    development: adjudicateRefusal(developmentRows),
    holdout: adjudicateRefusal(holdoutRows)
  },
  activeSet: {
    boundaryCases: cases.filter(row => row.activeSet !== "LH").length,
    fractionOfCases: round(cases.filter(row => row.activeSet !== "LH").length / cases.length),
    note: "A boundary case has at least one endpoint coefficient fixed to zero by the nonnegative fit."
  },
  gates: {
    continuousEnvelopeComputed: byShift.length === shiftMagnitudesDegrees.length,
    nonzeroSafeDriftPrefix: prefixSafeShift(cases) > 0,
    residualRefusalHasZeroUnsafeDevelopmentAcceptances: adjudicateRefusal(developmentRows).unsafeAcceptedCases === 0,
    residualRefusalHasZeroUnsafeHoldoutAcceptances: adjudicateRefusal(holdoutRows).unsafeAcceptedCases === 0
  },
  decision: "Treat the global safe shift prefix as a frozen synthetic planning bound for total unmodeled relative drift, not as an instrument specification or physical phase-fraction validation. Qualify instrument line position separately, monitor endpoint-mixture-endpoint drift, and refuse rather than repair estimates outside the bound until a metrological surrogate and target-system holdout pass.",
  limitations: spec.interpretationLimits
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(path.join(root, "research/reproducibility/nist-phase-fraction-drift-envelope-spec.json"), `${JSON.stringify(spec, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "research/reproducibility/nist-phase-fraction-drift-envelope-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log("wrote NIST phase-fraction drift-envelope specification and result");
} else console.log(JSON.stringify(result, null, 2));

export { spec, result };
