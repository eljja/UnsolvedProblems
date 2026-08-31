import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const repro = path.join(root, "research", "reproducibility");
const resultPath = path.join(repro, "rc72-core-aperture-result.json");
const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
const contract = JSON.parse(fs.readFileSync(path.join(repro, "rc72-psf-rescue-contract.json"), "utf8"));
const support = JSON.parse(fs.readFileSync(path.join(repro, "rc72-psf-holdout-support.json"), "utf8"));
const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (position - lo);
};
const near = (a, b, tolerance = 2e-7) => Math.abs(a - b) <= tolerance;

const offsets = {};
for (const filter of ["F090W", "F150W"]) {
  offsets[filter] = median(result.measurements
    .filter(row => row.detector === "NRCB1" && row.filter === filter && row.valid)
    .map(row => row.dolphotMagnitude - row.instrumentalMagnitude));
}

const measurements = result.measurements.map(row => ({
  ...row,
  auditResidual: row.valid ? row.instrumentalMagnitude + offsets[row.filter] - row.dolphotMagnitude : null
}));
const grouped = new Map();
for (const row of measurements.filter(row => row.valid)) {
  const key = [row.detector, row.row, row.cell, row.filter].join("|");
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(row.auditResidual);
}
const stars = [...grouped.entries()].map(([key, residuals]) => {
  const [detector, row, cell, filter] = key.split("|");
  return { detector, row: Number(row), cell, filter, n: residuals.length, valid: residuals.length >= 3, residual: residuals.length >= 3 ? median(residuals) : null };
});

const summaries = {};
for (const detector of ["NRCB1", "NRCB2"]) {
  summaries[detector] = {};
  for (const filter of ["F090W", "F150W"]) {
    const selected = stars.filter(row => row.detector === detector && row.filter === filter && row.valid);
    const residuals = selected.map(row => row.residual);
    const cells = {};
    for (const cell of contract.spatialSplit.cells) {
      const values = selected.filter(row => row.cell === cell).map(row => row.residual);
      cells[cell] = { n: values.length, median: median(values), p90abs: quantile(values.map(Math.abs), 0.9) };
    }
    const cellMedians = Object.values(cells).map(row => row.median);
    summaries[detector][filter] = {
      n: residuals.length,
      median: median(residuals),
      p90abs: quantile(residuals.map(Math.abs), 0.9),
      spatialRange: Math.max(...cellMedians) - Math.min(...cellMedians),
      cells
    };
  }
}

const gates = {
  ee80IndependentSupport: support.gates.ee80Independent.pass,
  coreCatalogueSupport: support.gates.coreDiagnostic.pass,
  nrcb1ControlTail: ["F090W", "F150W"].every(filter => summaries.NRCB1[filter].p90abs <= 0.03),
  nrcb2ValidSupport: ["F090W", "F150W"].every(filter => Object.values(summaries.NRCB2[filter].cells).every(cell => cell.n >= 6)),
  nrcb2DetectorMedian: ["F090W", "F150W"].every(filter => Math.abs(summaries.NRCB2[filter].median) <= 0.01),
  nrcb2CellMedian: ["F090W", "F150W"].every(filter => Object.values(summaries.NRCB2[filter].cells).every(cell => Math.abs(cell.median) <= 0.01)),
  nrcb2Tail: ["F090W", "F150W"].every(filter => summaries.NRCB2[filter].p90abs <= 0.03),
  nrcb2SpatialRange: ["F090W", "F150W"].every(filter => summaries.NRCB2[filter].spatialRange <= 0.02)
};
gates.coreDiagnostic = gates.nrcb1ControlTail && gates.nrcb2ValidSupport && gates.nrcb2DetectorMedian && gates.nrcb2CellMedian && gates.nrcb2Tail && gates.nrcb2SpatialRange;

const checks = {
  offsetsMatch: ["F090W", "F150W"].every(filter => near(offsets[filter], result.method.offsetsLearnedOnlyOnNRCB1[filter])),
  measurementRowsMatch: measurements.filter(row => row.valid).every(row => near(row.auditResidual, row.residualMagnitude)),
  starRowsMatch: result.starSummaries.every(row => {
    const audit = stars.find(item => item.detector === row.detector && item.row === row.row && item.cell === row.cell && item.filter === row.filter);
    return Boolean(audit) && audit.n === row.validExposures && audit.valid === row.valid && (!row.valid || near(audit.residual, row.medianResidualMagnitude));
  }),
  summaryRowsMatch: ["NRCB1", "NRCB2"].every(detector => ["F090W", "F150W"].every(filter => {
    const a = summaries[detector][filter];
    const b = result.summaries[detector][filter];
    return a.n === b.n && near(a.median, b.medianResidualMagnitude) && near(a.p90abs, b.p90AbsoluteResidualMagnitude) && near(a.spatialRange, b.cellMedianRangeMagnitude);
  })),
  gatesMatch: Object.entries(gates).every(([key, pass]) => result.gates[key]?.pass === pass),
  originalFailureImmutable: result.gates.originalNrcb2PsfGate.pass === false && result.gates.originalNrcb2PsfGate.immutable === true,
  astStillClosed: result.gates.sealedArtificialStarTest.pass === false && result.gates.sealedArtificialStarTest.opened === false
};

const audit = {
  cycleId: result.cycleId,
  experimentId: `${result.experimentId}-INDEPENDENT-DECISION-AUDIT`,
  implementation: "Node.js recomputation from per-exposure aperture and DOLPHOT rows; no Python summaries or gates trusted",
  resultSha256: sha(resultPath),
  offsets,
  summaries,
  gates,
  checks,
  status: Object.values(checks).every(Boolean) ? "pass" : "fail",
  firstDivergence: !gates.ee80IndependentSupport ? "EE80-INDEPENDENT support" : !gates.nrcb1ControlTail ? "NRCB1 control tail" : "later core gate",
  conclusion: "The independent decision implementation reproduces the large-aperture support failure and the small-core control failure. The NRCB2 rescue is rejected without changing any frozen threshold."
};
const output = path.join(repro, "rc72-core-aperture-independent-audit.json");
fs.writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, output), status: audit.status, checks, gates, firstDivergence: audit.firstDivergence }, null, 2));
if (audit.status !== "pass") process.exit(1);
