#!/usr/bin/env node
/* Independent, dependency-free RC61 audit of the DESI DR2 flat-LambdaCDM fit. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "research", "reproducibility");
const MEAN_PATH = path.join(DATA_DIR, "rc61-desi-dr2-bao-mean.txt");
const COV_PATH = path.join(DATA_DIR, "rc61-desi-dr2-bao-cov.txt");
const SPEC_PATH = path.join(DATA_DIR, "rc61-bao-analysis-spec.json");
const PYTHON_RESULT_PATH = path.join(DATA_DIR, "rc61-bao-tension-result.json");
const AUDIT_PATH = path.join(DATA_DIR, "rc61-bao-node-audit.json");
const C_OVER_100 = 2997.92458;

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
const rows = fs.readFileSync(MEAN_PATH, "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#")).map((line) => {
  const [z, value, observable] = line.trim().split(/\s+/);
  return { z: Number(z), value: Number(value), observable };
});
const covariance = fs.readFileSync(COV_PATH, "utf8").trim().split(/\r?\n/).map((line) => line.trim().split(/\s+/).map(Number));
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));

function invert(matrix) {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => Number(i === j))]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-15) throw new Error("singular covariance");
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const scale = a[col][col];
    for (let j = 0; j < 2 * n; j += 1) a[col][j] /= scale;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = 0; j < 2 * n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

function quadratic(left, matrix, right) {
  let total = 0;
  for (let i = 0; i < left.length; i += 1) for (let j = 0; j < right.length; j += 1) total += left[i] * matrix[i][j] * right[j];
  return total;
}

function expansion(z, omegaM) {
  return Math.sqrt(omegaM * (1 + z) ** 3 + 1 - omegaM);
}

function integrateInverseExpansion(z, omegaM) {
  const n = 4096;
  const h = z / n;
  let sum = 1 / expansion(0, omegaM) + 1 / expansion(z, omegaM);
  for (let i = 1; i < n; i += 1) sum += (i % 2 ? 4 : 2) / expansion(i * h, omegaM);
  return sum * h / 3;
}

function basisFor(inputRows, omegaM) {
  const cache = new Map();
  return inputRows.map((row) => {
    if (!cache.has(row.z)) cache.set(row.z, { integral: integrateInverseExpansion(row.z, omegaM), e: expansion(row.z, omegaM) });
    const { integral, e } = cache.get(row.z);
    let dimensionless;
    if (row.observable === "DM_over_rs") dimensionless = integral;
    else if (row.observable === "DH_over_rs") dimensionless = 1 / e;
    else if (row.observable === "DV_over_rs") dimensionless = (integral * integral * row.z / e) ** (1 / 3);
    else throw new Error(`unknown observable ${row.observable}`);
    return C_OVER_100 * dimensionless;
  });
}

function profileScale(inputRows, inverse, omegaM) {
  const basis = basisFor(inputRows, omegaM);
  const observed = inputRows.map((row) => row.value);
  const amplitude = quadratic(basis, inverse, observed) / quadratic(basis, inverse, basis);
  const residual = observed.map((value, i) => value - amplitude * basis[i]);
  return { chi2: quadratic(residual, inverse, residual), hTimesRdMpc: 1 / amplitude };
}

function fixedScaleChi2(inputRows, inverse, omegaM, hTimesRdMpc) {
  const prediction = basisFor(inputRows, omegaM).map((value) => value / hTimesRdMpc);
  const residual = inputRows.map((row, i) => row.value - prediction[i]);
  return quadratic(residual, inverse, residual);
}

function goldenMin(fn, lower, upper, tolerance = 1e-11) {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = lower;
  let b = upper;
  let c = b - ratio * (b - a);
  let d = a + ratio * (b - a);
  let fc = fn(c);
  let fd = fn(d);
  while (Math.abs(b - a) > tolerance) {
    if (fc < fd) {
      b = d; d = c; fd = fc; c = b - ratio * (b - a); fc = fn(c);
    } else {
      a = c; c = d; fc = fd; d = a + ratio * (b - a); fd = fn(d);
    }
  }
  const x = (a + b) / 2;
  return { x, value: fn(x) };
}

function bisectRoot(fn, lower, upper, tolerance = 1e-10) {
  let a = lower;
  let b = upper;
  let fa = fn(a);
  let fb = fn(b);
  if (fa * fb > 0) throw new Error(`root is not bracketed: ${fa}, ${fb}`);
  while (Math.abs(b - a) > tolerance) {
    const middle = (a + b) / 2;
    const fm = fn(middle);
    if (fa * fm <= 0) { b = middle; fb = fm; } else { a = middle; fa = fm; }
  }
  return (a + b) / 2;
}

function subsetMatrix(matrix, keep) {
  return keep.map((i) => keep.map((j) => matrix[i][j]));
}

function fitLcdm(inputRows, inputCovariance) {
  const inverse = invert(inputCovariance);
  const optimization = goldenMin((omegaM) => profileScale(inputRows, inverse, omegaM).chi2, 0.1, 0.5);
  const best = profileScale(inputRows, inverse, optimization.x);
  const target = best.chi2 + 1;
  const omLow = bisectRoot((omegaM) => profileScale(inputRows, inverse, omegaM).chi2 - target, 0.1, optimization.x);
  const omHigh = bisectRoot((omegaM) => profileScale(inputRows, inverse, omegaM).chi2 - target, optimization.x, 0.5);
  const profileP = (p) => goldenMin((omegaM) => fixedScaleChi2(inputRows, inverse, omegaM, p), 0.1, 0.5).value - target;
  const pLow = bisectRoot(profileP, 80, best.hTimesRdMpc);
  const pHigh = bisectRoot(profileP, best.hTimesRdMpc, 120);
  return {
    Omega_m: optimization.x,
    Omega_mSigma: (omHigh - omLow) / 2,
    hTimesRdMpc: best.hTimesRdMpc,
    hTimesRdSigmaMpc: (pHigh - pLow) / 2,
    chi2: best.chi2,
  };
}

function propagatedProduct(a, sa, b, sb) {
  const value = a * b;
  return { value, sigma: Math.abs(value) * Math.hypot(sa / a, sb / b) };
}

function propagatedRatio(a, sa, b, sb) {
  const value = a / b;
  return { value, sigma: Math.abs(value) * Math.hypot(sa / a, sb / b) };
}

const full = fitLcdm(rows, covariance);
const leaveOneOut = [...new Set(rows.map((row) => row.z))].sort((a, b) => a - b).map((z) => {
  const keep = rows.map((_, i) => i).filter((i) => rows[i].z !== z);
  const fit = fitLcdm(keep.map((i) => rows[i]), subsetMatrix(covariance, keep));
  return { omittedRedshift: z, ...fit, hTimesRdShiftInFullSigma: Math.abs(fit.hTimesRdMpc - full.hTimesRdMpc) / full.hTimesRdSigmaMpc };
});

const planck = spec.externalCalibration.planckBaseLambdaCDM;
const shoes = spec.externalCalibration.shoesHstFull2024;
const planckProduct = propagatedProduct(planck.H0 / 100, planck.H0Sigma / 100, planck.rDragMpc, planck.rDragSigmaMpc);
const shoesStandard = propagatedProduct(shoes.H0 / 100, shoes.H0Sigma / 100, planck.rDragMpc, planck.rDragSigmaMpc);
const requiredRuler = propagatedRatio(100 * full.hTimesRdMpc, 100 * full.hTimesRdSigmaMpc, shoes.H0, shoes.H0Sigma);
const tension = (a, sa, b, sb) => Math.abs(a - b) / Math.hypot(sa, sb);
const diagnostics = {
  planckProductTensionSigma: tension(full.hTimesRdMpc, full.hTimesRdSigmaMpc, planckProduct.value, planckProduct.sigma),
  shoesStandardRulerTensionSigma: tension(full.hTimesRdMpc, full.hTimesRdSigmaMpc, shoesStandard.value, shoesStandard.sigma),
  requiredRdragMpc: requiredRuler.value,
  requiredRdragSigmaMpc: requiredRuler.sigma,
  requiredRdragTensionWithPlanckSigma: tension(requiredRuler.value, requiredRuler.sigma, planck.rDragMpc, planck.rDragSigmaMpc),
};

const pythonResult = JSON.parse(fs.readFileSync(PYTHON_RESULT_PATH, "utf8"));
const pythonFull = pythonResult.fits.flatLambdaCDM;
const pythonDiagnostics = pythonResult.externalScaleDiagnostics;
const tolerances = spec.predeclaredTests.crossImplementation;
const comparisons = {
  Omega_m: { difference: Math.abs(full.Omega_m - pythonFull.parameters.Omega_m), tolerance: tolerances.omegaMTolerance },
  hTimesRdMpc: { difference: Math.abs(full.hTimesRdMpc - pythonFull.parameters.h_times_r_d_Mpc), tolerance: tolerances.hTimesRdToleranceMpc },
  chi2: { difference: Math.abs(full.chi2 - pythonFull.chi2), tolerance: tolerances.chi2Tolerance },
  shoesStandardRulerTensionSigma: { difference: Math.abs(diagnostics.shoesStandardRulerTensionSigma - pythonDiagnostics.shoesWithStandardRuler.tensionWithDesiSigma), tolerance: tolerances.derivedTensionToleranceSigma },
};
for (const value of Object.values(comparisons)) value.pass = value.difference <= value.tolerance;
const audit = {
  cycleId: "RC-2026-61",
  implementation: "dependency-free-node-simpson4096-golden-profile",
  sourceIntegrity: { meanSha256: sha256(MEAN_PATH), covarianceSha256: sha256(COV_PATH), specSha256: sha256(SPEC_PATH) },
  fullFit: full,
  leaveOneRedshiftBlockOut: leaveOneOut,
  diagnostics,
  comparisonWithPython: comparisons,
  exactDecisionAgreement: Object.values(comparisons).every((value) => value.pass),
  limitations: [
    "This implementation audits the flat-LambdaCDM core, leave-one-redshift-block influence, and product diagnostics; it does not duplicate SciPy model-extension optimization.",
    "Simpson quadrature and matrix inversion are independent of the Python quadrature and optimizer but operate on the same frozen Gaussian likelihood.",
  ],
};

if (process.argv.includes("--write")) fs.writeFileSync(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify(audit, null, 2));
if (!audit.exactDecisionAgreement) process.exitCode = 1;
