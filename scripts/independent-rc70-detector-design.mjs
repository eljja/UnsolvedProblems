import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repro = path.join(root, "research", "reproducibility");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(repro, name), "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const design = readJson("rc70-detector-tile-design.json");
const run = readJson("rc70-detector-baseline-run-manifest.json");
const exposureManifest = readJson("rc69-phost-cal-source-manifest.json");

assert(design.cycleId === "RC-2026-70", "Wrong detector-design cycle");
assert(design.inputBoundary.calExposureCount === 32, "Detector design must contain 32 CAL files");
assert(design.tiles.length === 4 && run.tiles.length === 4, "Expected four detector tiles");
assert(new Set(design.exposures.map((row) => row.filename)).size === 32, "CAL filenames are not unique");

const allIndices = design.tiles.flatMap((tile) => tile.expectedImageIndices).sort((a, b) => a - b);
assert(allIndices.length === 32, "Expected-image partition does not contain 32 indices");
assert(allIndices.every((value, index) => value === index + 1), "Expected-image partition is not exactly 1..32");

const tileAudit = design.tiles.map((tile, index) => {
  const runTile = run.tiles[index];
  assert(tile.id === runTile.tileId, `${tile.id}: run-manifest order changed`);
  assert(JSON.stringify(tile.photsec) === JSON.stringify(runTile.photsec), `${tile.id}: photsec changed`);
  assert(tile.expectedImageIndices.length === 8, `${tile.id}: expected-image count changed`);
  assert(tile.filterCounts.F090W === 4 && tile.filterCounts.F150W === 4, `${tile.id}: filter balance changed`);
  assert(tile.dithers.length === 4 && tile.dithers.every((value, i) => value === i + 1), `${tile.id}: dither balance changed`);
  const [extension, chip, xmin, ymin, xmax, ymax] = tile.photsec;
  assert(extension === 1 && chip === 1 && xmax - xmin === 800 && ymax - ymin === 800, `${tile.id}: tile geometry changed`);
  const parameterPath = path.join(root, runTile.parameterFile);
  const parameterText = fs.readFileSync(parameterPath, "utf8");
  const photsec = parameterText.match(/^photsec\s*=\s*(.+)$/m)?.[1]?.trim();
  assert(photsec === tile.photsec.join(" "), `${tile.id}: parameter photsec disagrees with design`);
  for (const invariant of ["Nimg = 32", "FitSky = 2", "SecondPass = 5", "ApCor = 1", "UseWCS = 2", "PSFres = 1"]) {
    assert(parameterText.includes(invariant), `${tile.id}: missing invariant ${invariant}`);
  }
  return {
    tileId: tile.id,
    detector: tile.detector,
    parameterSha256: sha256(parameterPath),
    photsec: tile.photsec,
    expectedImageIndices: tile.expectedImageIndices
  };
});

const calEntries = exposureManifest.exposureFiles || [];
assert(Array.isArray(calEntries) && calEntries.length === 32, "RC69 CAL manifest no longer exposes 32 products");

const result = {
  cycleId: "RC-2026-70",
  experimentId: "PHOST-DETECTOR-BASELINE-1-DESIGN-AUDIT",
  reviewedOn: "2026-09-01",
  verified: {
    exposureCount: 32,
    detectorCount: 4,
    exposuresPerDetector: 8,
    imageIndexPartition: allIndices,
    tileSize: [800, 800],
    parameterChange: "photsec only",
    inputOutcomeSeparation: design.tiles.every((tile) => /no source catalogue or AST outcome/i.test(tile.selectionBasis))
  },
  tiles: tileAudit,
  inferenceBoundary: "This dependency-free audit verifies the frozen partition and parameters, not the FITS WCS transform or the photometric outcome. DOLPHOT alignment provides the empirical overlap check."
};

fs.writeFileSync(path.join(repro, "rc70-detector-design-node-audit.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
