import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const workDir = path.resolve(process.argv[2] || ".cache/rc69-phost-ast/dolphot-work");
const reproDir = path.resolve("research/reproducibility");
const root = "rc70-nrcb2.phot";
const sourceFiles = {
  log: path.join(workDir, "rc70-nrcb2.log"),
  warnings: path.join(workDir, `${root}.warnings`),
  psfs: path.join(workDir, `${root}.psfs`),
  apcor: path.join(workDir, `${root}.apcor`),
  info: path.join(workDir, `${root}.info`),
  timing: path.join(workDir, "rc70-nrcb2.time.log")
};

for (const [kind, file] of Object.entries(sourceFiles)) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${kind} receipt: ${file}`);
}

const text = file => fs.readFileSync(file, "utf8");
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const lines = file => text(file).split(/\r?\n/).filter(line => line.trim());
const log = text(sourceFiles.log);
const timeLog = text(sourceFiles.timing);
if (!log.includes("Aperture corrections:") || !/\d+ stars written; \d+ stars deleted/.test(log) || !/Exit status:\s*0/.test(timeLog)) {
  throw new Error("DOLPHOT log is incomplete; refusing to adjudicate a partial run");
}

const design = JSON.parse(text(path.join(reproDir, "rc70-detector-tile-design.json")));
const tile = design.tiles.find(row => row.id === "nrcb2");
const expected = new Set(tile.expectedImageIndices);

const alignment = [...log.matchAll(/^image (\d+): (\d+) matched, (\d+) used, .*sig=([\d.]+)/gm)].slice(0, 32).map(match => ({
  imageIndex: Number(match[1]),
  matched: Number(match[2]),
  used: Number(match[3]),
  sigmaPixels: Number(match[4]),
  expected: expected.has(Number(match[1]))
}));
if (alignment.length !== 32) throw new Error(`Expected 32 alignment rows, found ${alignment.length}`);

const psfBlock = log.split("Central pixel PSF adjustments:")[1]?.split("Aperture corrections:")[0] || "";
const psf = [...psfBlock.matchAll(/^image (\d+): (\d+) stars,\s*([-+\d.]+)/gm)].map(match => ({
  imageIndex: Number(match[1]),
  stars: Number(match[2]),
  centralPixelAdjustment: Number(match[3]),
  expected: expected.has(Number(match[1]))
}));
if (psf.length !== 32) throw new Error(`Expected 32 PSF rows, found ${psf.length}`);

const apertureBlock = log.split("Aperture corrections:")[1] || "";
const aperture = [...apertureBlock.matchAll(/^image (\d+): (\d+) total aperture stars/gm)].map(match => ({
  imageIndex: Number(match[1]),
  stars: Number(match[2]),
  expected: expected.has(Number(match[1]))
}));
if (aperture.length !== 32) throw new Error(`Expected 32 aperture rows, found ${aperture.length}`);

const supportedAlignment = alignment.filter(row => row.expected);
const supportedPsf = psf.filter(row => row.expected);
const supportedAperture = aperture.filter(row => row.expected);
const unsupportedAlignment = alignment.filter(row => !row.expected);
const geometryPass = unsupportedAlignment.length === 24 && unsupportedAlignment.every(row => row.matched === 0);
const alignmentPass = supportedAlignment.length === 8 && supportedAlignment.every(row => row.matched >= 100 && row.sigmaPixels < 0.30);
const psfPass = supportedPsf.length === 8 && supportedPsf.every(row => row.stars >= 100 && Math.abs(row.centralPixelAdjustment) < 0.05);
const aperturePass = supportedAperture.length === 8 && supportedAperture.every(row => row.stars >= 100);

const warningLines = lines(sourceFiles.warnings);
const warningText = text(sourceFiles.warnings);
const warningIndices = pattern => [...warningText.matchAll(pattern)].map(match => Number(match[1]));
const noAlignmentIndices = warningIndices(/No alignment stars matched for image (\d+)/g);
const lowPsfIndices = warningIndices(/Only \d+ stars for PSF measurement in image (\d+)/g);
const lowApertureIndices = warningIndices(/Only \d+ aperture stars in image (\d+)/g);
const typedWarningIndices = [...noAlignmentIndices, ...lowPsfIndices, ...lowApertureIndices];
const warningCountByImage = Object.fromEntries(Array.from({ length: 32 }, (_, index) => [String(index + 1), typedWarningIndices.filter(value => value === index + 1).length]));
const expectedExposureWarnings = typedWarningIndices.filter(index => expected.has(index)).length;
const unclassifiedWarningLines = warningLines.length - typedWarningIndices.length;
const typedWarningPass = expectedExposureWarnings === 0 && unclassifiedWarningLines === 0 && alignment.filter(row => !row.expected).every(row => warningCountByImage[String(row.imageIndex)] === 3);

fs.mkdirSync(reproDir, { recursive: true });
const committedReceipts = [];
for (const [kind, source] of Object.entries(sourceFiles)) {
  const destination = path.join(reproDir, `rc71-nrcb2-baseline-${kind}.txt`);
  if (kind === "info") {
    fs.writeFileSync(destination, `${text(source).trimEnd()}\n`);
  } else {
    fs.copyFileSync(source, destination);
  }
  committedReceipts.push({
    kind,
    file: path.relative(process.cwd(), destination).replaceAll("\\", "/"),
    bytes: fs.statSync(destination).size,
    sha256: sha256(destination),
    rows: lines(destination).length
  });
}

const prior = JSON.parse(text(path.join(reproDir, "rc70-nrcb1-detector-baseline-result.json")));
const currentPass = geometryPass && alignmentPass && psfPass && aperturePass && typedWarningPass;
const result = {
  cycleId: "RC-2026-71",
  experimentId: "PHOST-DETECTOR-BASELINE-1-NRCB2",
  reviewedOn: "2026-09-01",
  software: {
    name: "DOLPHOT",
    version: "3.0",
    binarySha256: "b0a3f74cddda42c24e7265fc5a8e0f94a2fbc147abc770e9cd21d330207c0c06",
    parameterFile: "research/reproducibility/rc70-detector-baseline-nrcb2.param",
    parameterSha256: sha256(path.join(reproDir, "rc70-detector-baseline-nrcb2.param"))
  },
  tile: {
    id: tile.id,
    detector: tile.detector,
    photsec: tile.photsec,
    expectedImageIndices: tile.expectedImageIndices,
    unexpectedImageIndices: alignment.filter(row => !row.expected).map(row => row.imageIndex)
  },
  alignment,
  psf,
  aperture,
  gates: {
    geometry: { pass: geometryPass, criterion: "Exactly the predeclared eight NRCB2 exposures match; the other 24 are structural zeros." },
    alignment: { pass: alignmentPass, criterion: "Each expected image has at least 100 matched stars and sigma below 0.30 pixels." },
    psf: { pass: psfPass, criterion: "Each expected image has at least 100 PSF stars and absolute central-pixel adjustment below 0.05." },
    aperture: { pass: aperturePass, criterion: "Each expected image has at least 100 total aperture stars." },
    typedWarnings: { pass: typedWarningPass, criterion: "Supported images have no typed warning, every unsupported image has exactly the three expected structural warnings, and no warning line is unclassified." },
    nrcb2Baseline: { pass: currentPass },
    twoDetectorBaseline: { pass: Boolean(prior.gates.nrcb1Pilot.pass) && currentPass, criterion: "Both NRCB1 and NRCB2 pass their frozen detector-level gates." },
    fourDetectorBaseline: { pass: false, criterion: "NRCB1-4 must all pass; NRCB3 and NRCB4 remain unexecuted." },
    sealedAst: { pass: false, criterion: "The 3,072-row AST remains closed until all four detector baselines and independent receipt parsers pass." }
  },
  warnings: {
    totalLines: warningLines.length,
    noAlignmentStars: noAlignmentIndices.length,
    lowPsfStars: lowPsfIndices.length,
    lowApertureStars: lowApertureIndices.length,
    expectedExposureWarnings,
    unclassifiedWarningLines,
    warningCountByImage,
    warningsOnlyOutsideSupport: typedWarningIndices.every(index => !expected.has(index))
  },
  output: {
    catalogueRows: lines(path.join(workDir, root)).length,
    timing: {
      elapsed: timeLog.match(/Elapsed \(wall clock\) time \(h:mm:ss or m:ss\):\s*([^\r\n]+)/)?.[1]?.trim() || null,
      userSeconds: Number(timeLog.match(/User time \(seconds\):\s*([\d.]+)/)?.[1] || NaN),
      systemSeconds: Number(timeLog.match(/System time \(seconds\):\s*([\d.]+)/)?.[1] || NaN),
      maximumResidentKb: Number(timeLog.match(/Maximum resident set size \(kbytes\):\s*(\d+)/)?.[1] || NaN)
    },
    receipts: committedReceipts
  },
  inferenceBoundary: "This run qualifies detector support and measurement-operator quality for NRCB2. It estimates no artificial-star recovery effect, Cepheid distance contrast, or Hubble-constant shift.",
  nextDecision: currentPass
    ? "Run the unchanged NRCB3 tile and require the same gates before any sealed injection."
    : "Keep the sealed AST closed and diagnose the first failed NRCB2 gate without reading any artificial-star outcome."
};

const output = path.join(reproDir, "rc71-nrcb2-detector-baseline-result.json");
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(process.cwd(), output), gates: result.gates, timing: result.output.timing }, null, 2));
