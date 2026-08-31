import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repro = path.resolve("research/reproducibility");
const inputFiles = {
  nrcb1: path.join(repro, "rc70-nrcb1-detector-baseline-result.json"),
  nrcb2: path.join(repro, "rc71-nrcb2-detector-baseline-result.json")
};
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const range = values => [Math.min(...values), Math.max(...values)];
const summarize = result => {
  const alignment = result.alignment.filter(row => row.expected);
  const psf = result.psf.filter(row => row.expected);
  const aperture = result.aperture.filter(row => row.expected);
  return {
    detector: result.tile.detector,
    expectedImageIndices: result.tile.expectedImageIndices,
    catalogueRows: result.output.catalogueRows,
    matchedRange: range(alignment.map(row => row.matched)),
    sigmaRangePixels: range(alignment.map(row => row.sigmaPixels)),
    psfStarRange: range(psf.map(row => row.stars)),
    maxAbsolutePsfAdjustment: Math.max(...psf.map(row => Math.abs(row.centralPixelAdjustment))),
    apertureStarRange: range(aperture.map(row => row.stars)),
    elapsed: result.output.timing.elapsed,
    maximumResidentKb: result.output.timing.maximumResidentKb,
    gates: {
      geometry: result.gates.geometry.pass,
      alignment: result.gates.alignment.pass,
      psf: result.gates.psf.pass,
      aperture: result.gates.aperture.pass
    }
  };
};

const first = read(inputFiles.nrcb1);
const second = read(inputFiles.nrcb2);
const summaries = [summarize(first), summarize(second)];
const comparison = {
  cycleId: "RC-2026-71",
  experimentId: "PHOST-DETECTOR-BASELINE-1-NRCB1-NRCB2-COMPARISON",
  reviewedOn: "2026-09-01",
  inputs: Object.fromEntries(Object.entries(inputFiles).map(([key, file]) => [key, {
    file: path.relative(process.cwd(), file).replaceAll("\\", "/"),
    sha256: hash(file)
  }])),
  detectors: summaries,
  exactContrasts: {
    catalogueRowRatioNrcb2OverNrcb1: summaries[1].catalogueRows / summaries[0].catalogueRows,
    minimumMatchedStarDifference: summaries[1].matchedRange[0] - summaries[0].matchedRange[0],
    maximumMatchedStarDifference: summaries[1].matchedRange[1] - summaries[0].matchedRange[1],
    minimumPsfStarDifference: summaries[1].psfStarRange[0] - summaries[0].psfStarRange[0],
    maximumPsfStarDifference: summaries[1].psfStarRange[1] - summaries[0].psfStarRange[1]
  },
  verifiedBoundary: "In these two frozen 800-by-800 tiles, NRCB2 has more catalogue rows and alignment matches but fewer usable PSF stars than NRCB1. Total detections or alignment matches therefore cannot substitute for the detector-specific PSF-star gate in this experiment.",
  inferenceBoundary: "Two tiles do not establish a universal relation between crowding and PSF support. NRCB3, NRCB4, spatially disjoint validation tiles, and a preregistered rescue design remain necessary.",
  decision: "NRCB2 fails only the PSF-star-count portion of the measurement-operator qualification. Keep the four-detector and artificial-star gates closed and design a fresh PSF-support validation rather than relaxing the documented threshold."
};

const output = path.join(repro, "rc71-nrcb1-nrcb2-cross-detector-comparison.json");
fs.writeFileSync(output, `${JSON.stringify(comparison, null, 2)}\n`);
console.log(JSON.stringify(comparison, null, 2));
