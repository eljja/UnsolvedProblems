#!/usr/bin/env node
// RC63 independent dependency-free solve from exported sufficient statistics.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repro = path.join(root, "research", "reproducibility");
const sufficientPath = path.join(repro, "rc63-shoes-sufficient-statistics.json");
const outputPath = path.join(repro, "rc63-shoes-node-audit.json");
const write = process.argv.includes("--write");

const source = JSON.parse(fs.readFileSync(sufficientPath, "utf8"));

function cloneMatrix(matrix) {
  return matrix.map(row => row.slice());
}

function solve(matrix, rhs) {
  const a = cloneMatrix(matrix);
  const b = rhs.slice();
  const n = b.length;
  let minPivot = Infinity;
  let maxPivot = 0;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    const scale = Math.max(...a[pivot].map(Math.abs));
    if (!Number.isFinite(a[pivot][col]) || Math.abs(a[pivot][col]) <= Math.max(1e-13, scale * 1e-13)) {
      throw new Error(`singular pivot at column ${col}`);
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    minPivot = Math.min(minPivot, Math.abs(a[col][col]));
    maxPivot = Math.max(maxPivot, Math.abs(a[col][col]));
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / a[col][col];
      a[row][col] = 0;
      for (let k = col + 1; k < n; k += 1) a[row][k] -= factor * a[col][k];
      b[row] -= factor * b[col];
    }
  }
  const x = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let value = b[row];
    for (let col = row + 1; col < n; col += 1) value -= a[row][col] * x[col];
    x[row] = value / a[row][row];
  }
  return { x, minPivot, maxPivot };
}

function inverseDiagonal(matrix) {
  const n = matrix.length;
  const diagonal = [];
  for (let column = 0; column < n; column += 1) {
    const basis = Array(n).fill(0);
    basis[column] = 1;
    diagonal.push(solve(matrix, basis).x[column]);
  }
  return diagonal;
}

function h0FromParameters(parameters) {
  return 10 ** (parameters.at(-1) / 5);
}

function deletionSystem(normal, rhs, constraint) {
  const n = normal.length;
  const reduced = cloneMatrix(normal);
  const reducedRhs = rhs.slice();
  const v = constraint.precisionDesign;
  const w = constraint.precisionDiagonal;
  for (let row = 0; row < n; row += 1) {
    reducedRhs[row] -= (v[row] * constraint.precisionY) / w;
    for (let col = 0; col < n; col += 1) reduced[row][col] -= (v[row] * v[col]) / w;
  }
  return { reduced, reducedRhs };
}

const baselineSolve = solve(source.normalMatrix, source.normalRhs);
const parameters = baselineSolve.x;
const covarianceDiagonal = inverseDiagonal(source.normalMatrix);
const h0 = h0FromParameters(parameters);
const h0Derivative = Math.log(10) * h0 / 5;
const h0Sigma = h0Derivative * Math.sqrt(covarianceDiagonal.at(-1));
const constraints = source.anonymousConstraints.map(constraint => {
  const systems = deletionSystem(source.normalMatrix, source.normalRhs, constraint);
  try {
    const deleted = solve(systems.reduced, systems.reducedRhs).x;
    const deletedH0 = h0FromParameters(deleted);
    return {
      anonymousId: constraint.anonymousId,
      status: "identified",
      deletedH0,
      pythonDeletedH0: constraint.pythonDeletedH0,
      absoluteH0Difference: Math.abs(deletedH0 - constraint.pythonDeletedH0),
    };
  } catch (error) {
    return {
      anonymousId: constraint.anonymousId,
      status: "not-identifiable-after-deletion",
      pythonDeletedH0: constraint.pythonDeletedH0,
      error: error.message,
    };
  }
});

const maximumParameterDifference = Math.max(...parameters.map((value, index) => Math.abs(value - source.pythonParameters[index])));
const identifiedConstraints = constraints.filter(item => item.status === "identified");
const result = {
  cycleId: source.cycleId,
  implementation: "dependency-free Node Gaussian elimination with partial pivoting",
  input: "Python-exported normal matrix, right-hand side, and anonymous constraint sufficient statistics",
  parameterCount: parameters.length,
  H0: h0,
  H0Sigma: h0Sigma,
  pythonH0: source.pythonH0,
  absoluteH0Difference: Math.abs(h0 - source.pythonH0),
  maximumParameterDifference,
  pivotRatio: baselineSolve.maxPivot / baselineSolve.minPivot,
  constraintDeletionMaximumH0Difference: Math.max(...identifiedConstraints.map(item => item.absoluteH0Difference)),
  constraints,
  gates: {
    H0Agreement: Math.abs(h0 - source.pythonH0) <= 1e-6,
    parameterAgreement: maximumParameterDifference <= 1e-5,
    constraintDeletionAgreement: Math.max(...identifiedConstraints.map(item => item.absoluteH0Difference)) <= 1e-6,
    singularConstraintAgreement: constraints.filter(item => item.status !== "identified").length === source.anonymousConstraints.filter(item => item.pythonDeletedH0 === null).length,
  },
};
result.passed = Object.values(result.gates).every(Boolean);

if (write) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
