import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repro = path.join(root, "research", "reproducibility");
const design = JSON.parse(fs.readFileSync(path.join(repro, "rc70-detector-tile-design.json"), "utf8"));
const referenceParam = fs.readFileSync(path.join(repro, "rc69-dolphot-reference.param"), "utf8");

if (design.cycleId !== "RC-2026-70" || design.tiles.length !== 4) {
  throw new Error("RC70 detector design is incomplete");
}

const records = [];
for (const tile of design.tiles) {
  const [extension, chip, xmin, ymin, xmax, ymax] = tile.photsec;
  const parameterName = `rc70-detector-baseline-${tile.id}.param`;
  const outputRoot = `rc70-${tile.id}.phot`;
  const parameterText = referenceParam.replace(
    /^photsec\s*=.*$/m,
    `photsec = ${extension} ${chip} ${xmin} ${ymin} ${xmax} ${ymax}`
  );
  if (parameterText === referenceParam) throw new Error("photsec replacement failed");
  fs.writeFileSync(path.join(repro, parameterName), parameterText);
  records.push({
    tileId: tile.id,
    detector: tile.detector,
    photsec: tile.photsec,
    expectedImageIndices: tile.expectedImageIndices,
    parameterFile: `research/reproducibility/${parameterName}`,
    outputRoot
  });
}

const manifest = {
  cycleId: "RC-2026-70",
  experimentId: "PHOST-DETECTOR-BASELINE-1",
  reviewedOn: "2026-09-01",
  sourceParameterFile: "research/reproducibility/rc69-dolphot-reference.param",
  invariantParameters: [
    "FitSky=2",
    "SecondPass=5",
    "PSFPhotIt=2",
    "ApCor=1",
    "UseWCS=2",
    "PSFres=1",
    "InterpPSFlib=1"
  ],
  changedParameter: "photsec only",
  tiles: records,
  executionContract: "Run each outputRoot with DOLPHOT 3.0 from the preprocessed working directory and capture stdout/stderr without modifying the parameter file.",
  inferenceBoundary: "These catalogues calibrate the measurement operator. No artificial-star outcome or Hubble-constant effect is estimated in this stage."
};

fs.writeFileSync(
  path.join(repro, "rc70-detector-baseline-run-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);
console.log(JSON.stringify(manifest, null, 2));
