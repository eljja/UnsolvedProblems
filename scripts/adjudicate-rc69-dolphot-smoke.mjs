import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const repro = path.join(root, "research", "reproducibility");
const work = path.join(root, ".cache", "rc69-phost-ast", "dolphot-work");
const runtime = path.join(root, ".cache", "rc69-phost-ast", "runtime30", "dolphot3.0", "bin");
const sources = path.join(root, ".cache", "rc69-phost-ast", "sources");
const readJson = (filename) => JSON.parse(fs.readFileSync(path.join(repro, filename), "utf8"));
const hash = (filename) => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};
const round = (value, digits = 6) => Number(Number(value).toFixed(digits));

function parseCsv(filename) {
  const lines = fs.readFileSync(filename, "utf8").trim().split(/\r?\n/);
  const header = lines.shift().split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [header[index], value])));
}

const selection = readJson("rc69-dolphot-smoke-selection.json");
const ledger = parseCsv(path.join(repro, "rc69-collision-injection-manifest.csv"));
const ledgerById = new Map(ledger.map((row) => [row.injectionId, row]));
const allRows = [];
const receipts = [];

for (const window of selection.windows) {
  const rawName = `rc69${window.id}out`;
  const rawPath = path.join(work, rawName);
  const rawLines = fs.readFileSync(rawPath, "utf8").trim().split(/\r?\n/);
  assert(rawLines.length === window.injectionCount, `${window.id}: output row count changed`);

  for (let index = 0; index < rawLines.length; index += 1) {
    const injectionId = window.injectionIds[index];
    const sourceRow = ledgerById.get(injectionId);
    assert(sourceRow, `${window.id}: missing ledger row ${injectionId}`);
    const values = rawLines[index].trim().split(/\s+/).map(Number);
    assert(values.length > 105, `${window.id}: truncated DOLPHOT row ${index + 1}`);

    const input = values.slice(0, 68);
    const measured = values.slice(68);
    assert(input[0] === 1 && input[1] === 1 && measured[0] === 1 && measured[1] === 1, `${window.id}: extension/chip mismatch`);
    assert(Math.abs(input[2] - Number(sourceRow.referenceX)) < 0.011 && Math.abs(input[3] - Number(sourceRow.referenceY)) < 0.011, `${window.id}: input position mismatch`);
    const f090InputMags = Array.from({ length: 16 }, (_, image) => input[5 + 2 * image]);
    const f150InputMags = Array.from({ length: 16 }, (_, image) => input[37 + 2 * image]);
    assert(f090InputMags.every((value) => Math.abs(value - Number(sourceRow.inputF090WVegaMag)) < 0.0011), `${window.id}: F090W input propagation mismatch`);
    assert(f150InputMags.every((value) => Math.abs(value - Number(sourceRow.inputF150WVegaMag)) < 0.0011), `${window.id}: F150W input propagation mismatch`);

    // Artificial-star output inserts "Pass Detected" after the 11 combined
    // object columns.  The generated .columns receipt is therefore the
    // authority for these zero-based positions, not the regular catalog map.
    const outputF090W = measured[16];
    const outputF150W = measured[29];
    const recoveredF090W = Number.isFinite(outputF090W) && outputF090W < 90;
    const recoveredF150W = Number.isFinite(outputF150W) && outputF150W < 90;
    allRows.push({
      injectionId,
      window: window.id,
      authorId: Number(sourceRow.authorId),
      split: sourceRow.split,
      component: sourceRow.component,
      collisionState: sourceRow.collisionState,
      referenceX: Number(sourceRow.referenceX),
      referenceY: Number(sourceRow.referenceY),
      inputF090WVegaMag: Number(sourceRow.inputF090WVegaMag),
      inputF150WVegaMag: Number(sourceRow.inputF150WVegaMag),
      outputF090WVegaMag: outputF090W,
      outputF150WVegaMag: outputF150W,
      residualF090WMag: recoveredF090W ? round(outputF090W - Number(sourceRow.inputF090WVegaMag)) : null,
      residualF150WMag: recoveredF150W ? round(outputF150W - Number(sourceRow.inputF150WVegaMag)) : null,
      recoveredF090W,
      recoveredF150W,
      globalChi: measured[4],
      globalSignalToNoise: measured[5],
      globalSharpness: measured[6],
      globalCrowding: measured[9],
      objectType: measured[10],
      f090wMagnitudeUncertainty: measured[18],
      f090wSignalToNoise: measured[20],
      f090wSharpness: measured[21],
      f090wCrowding: measured[23],
      f090wFlag: measured[24],
      f150wMagnitudeUncertainty: measured[31],
      f150wSignalToNoise: measured[33],
      f150wSharpness: measured[34],
      f150wCrowding: measured[36],
      f150wFlag: measured[37]
    });
  }

  const copyMap = [
    [rawName, `rc69-dolphot-smoke-${window.id}-raw.txt`],
    [`rc69-${window.id}.phot.info`, `rc69-dolphot-smoke-${window.id}.info.txt`],
    [`rc69-${window.id}.phot.align`, `rc69-dolphot-smoke-${window.id}.align.txt`],
    [`rc69-${window.id}.phot.apcor`, `rc69-dolphot-smoke-${window.id}.apcor.txt`],
    [`rc69-${window.id}.phot.warnings`, `rc69-dolphot-smoke-${window.id}.warnings.txt`],
    [`rc69-${window.id}.phot.columns`, `rc69-dolphot-smoke-${window.id}.columns.txt`]
  ];
  for (const [from, to] of copyMap) fs.copyFileSync(path.join(work, from), path.join(repro, to));

  const baselinePath = path.join(work, `rc69-${window.id}.phot`);
  const warningsPath = path.join(work, `rc69-${window.id}.phot.warnings`);
  const warningsText = fs.readFileSync(warningsPath, "utf8");
  receipts.push({
    window: window.id,
    baselineCatalogRows: fs.readFileSync(baselinePath, "utf8").trim().split(/\r?\n/).length,
    baselineCatalogBytes: fs.statSync(baselinePath).size,
    baselineCatalogSha256: hash(baselinePath),
    rawAstBytes: fs.statSync(rawPath).size,
    rawAstSha256: hash(rawPath),
    warningLines: warningsText.trim() ? warningsText.trim().split(/\r?\n/).length : 0,
    noCoverageAlignmentWarnings: (warningsText.match(/No alignment stars matched/g) || []).length,
    lowPsfStarWarning: /Only \d+ stars for PSF measurement/.test(warningsText)
  });
}

assert(allRows.length === 16 && new Set(allRows.map((row) => row.injectionId)).size === 16, "Smoke output does not preserve the 16-row identity ledger");

const stateSummary = {};
for (const state of ["blank", "isolated", "large-collision"]) {
  const subset = allRows.filter((row) => row.collisionState === state);
  stateSummary[state] = {
    n: subset.length,
    recoveryF090W: subset.filter((row) => row.recoveredF090W).length / subset.length,
    recoveryF150W: subset.filter((row) => row.recoveredF150W).length / subset.length,
    medianResidualF090WMag: round(median(subset.map((row) => row.residualF090WMag))),
    medianResidualF150WMag: round(median(subset.map((row) => row.residualF150WMag))),
    residualRangeF090WMag: [round(Math.min(...subset.map((row) => row.residualF090WMag))), round(Math.max(...subset.map((row) => row.residualF090WMag)))],
    residualRangeF150WMag: [round(Math.min(...subset.map((row) => row.residualF150WMag))), round(Math.max(...subset.map((row) => row.residualF150WMag)))]
  };
}

const runtimeReceipts = [
  [path.join(runtime, "dolphot"), "dolphot-3.0-binary"],
  [path.join(runtime, "nircammask"), "nircammask-3.0-binary"],
  [path.join(runtime, "calcsky"), "calcsky-3.0-binary"],
  [path.join(sources, "dolphot3.0.tar.gz"), "dolphot-3.0-source"],
  [path.join(sources, "dolphot3.0.NIRCAM.tar.gz"), "nircam-3.0-module"],
  [path.join(sources, "nircam_F090W.tar.gz"), "f090w-psf-library"],
  [path.join(sources, "nircam_F150W.tar.gz"), "f150w-psf-library"]
].map(([filename, role]) => ({ role, bytes: fs.statSync(filename).size, sha256: hash(filename) }));

const result = {
  cycleId: "RC-2026-69",
  experimentId: "PHOST-COLLISION-AST-1-SMOKE",
  reviewedOn: "2026-09-01",
  status: "executable-smoke-pass-scientific-gates-remain-closed",
  engine: "DOLPHOT 3.0 stable release with 2025 NIRCam PSF archives; eight OpenMP threads under WSL Ubuntu 24.04",
  dataCalibrationLineage: "All 32 CAL products report JWST pipeline 2.0.1 and CRDS jwst_1535.pmap. The NIRCam module homepage describes its calibration against jwst_1126.pmap, so calibration transport remains an explicit sensitivity branch.",
  ledger: { expectedRows: 16, outputRows: allRows.length, uniqueInjectionIds: new Set(allRows.map((row) => row.injectionId)).size, typedNonDetections: allRows.filter((row) => !row.recoveredF090W || !row.recoveredF150W).length },
  stateSummary,
  baselineReceipts: receipts,
  runtimeReceipts,
  rows: allRows,
  adjudication: {
    plumbingGate: "pass: all three state-specific windows completed and every selected injection produced exactly one parseable row",
    scientificGate: "not tested: the smoke subset is unbalanced, its windows contain only the NRCB3 footprint, every baseline reports too few PSF/aperture stars for a reference reduction, and no independent scene-model result exists",
    fullPilot: "open: execute all 3,072 sealed injections with a field-wide reference reduction and a genuinely independent fixed-scene pipeline before testing 0.02 inclusion or 0.01-mag residual agreement"
  },
  failureLedger: [
    "A first 650-by-2650-pixel smoke rectangle produced 226,459 candidates and was stopped before measurement; three state-specific windows replaced it without looking at artificial-star outcomes.",
    "DOLPHOT 3.0 accepts image-wide RSky2 and apsky only as img_RSky2 and img_apsky; the initial lowercase global names were rejected and the frozen parameter files were corrected before the recorded runs.",
    "The documented -etctime nircammask spelling is absent from the DOLPHOT 3.0 executable; its default effective-exposure-time behavior was used.",
    "calcsky overflowed when given a long absolute basename; invoking the same binary from the working directory with a short basename completed for all 33 images.",
    "The small windows intersect NRCB3 only, so warnings for the other 24 detector-frame combinations are expected but make these baselines unsuitable for scientific calibration."
  ],
  uncertaintyBoundary: "Residual summaries are execution diagnostics, not estimates of collision bias. They combine only 16 deliberately sparse injections, local-window PSF/aperture calibration, one software stack, and no external scene model.",
  exactNextStart: "Run one field-wide DOLPHOT baseline with the corrected frozen parameter file, preserve its alignment/PSF/aperture receipts, then execute the full 3,072-row list. In parallel implement a fixed-scene model that shares only CAL hashes and injection coordinates, and adjudicate identical rows with non-detections retained."
};

fs.writeFileSync(path.join(repro, "rc69-dolphot-smoke-result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, ledger: result.ledger, stateSummary, receipts }, null, 2));
