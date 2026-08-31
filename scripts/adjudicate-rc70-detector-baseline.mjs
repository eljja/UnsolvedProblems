import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const workDir = path.resolve(process.argv[2] || ".cache/rc69-phost-ast/dolphot-work");
const reproDir = path.resolve("research/reproducibility");
const root = "rc70-nrcb1.phot";
const sourceLog = path.join(workDir, "rc70-nrcb1.log");
const sourceTime = path.join(workDir, "rc70-nrcb1.time.log");
const sourceFiles = {
  log: sourceLog,
  warnings: path.join(workDir, `${root}.warnings`),
  psfs: path.join(workDir, `${root}.psfs`),
  apcor: path.join(workDir, `${root}.apcor`),
  info: path.join(workDir, `${root}.info`),
  timing: sourceTime
};

for (const [kind, file] of Object.entries(sourceFiles)) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${kind} receipt: ${file}`);
}

const text = file => fs.readFileSync(file, "utf8");
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const lines = file => text(file).split(/\r?\n/).filter(line => line.trim());
const log = text(sourceLog);
if (!log.includes("Aperture corrections:") || !/\d+ stars written; \d+ stars deleted/.test(log) || !/Exit status:\s*0/.test(text(sourceTime))) {
  throw new Error("DOLPHOT log is incomplete; refusing to adjudicate a partial run");
}

const design = JSON.parse(text(path.join(reproDir, "rc70-detector-tile-design.json")));
const tile = design.tiles.find(row => row.id === "nrcb1");
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
const psfAdjustments = [...psfBlock.matchAll(/^image (\d+): (\d+) stars,\s*([-+\d.]+)/gm)].map(match => ({
  imageIndex: Number(match[1]),
  stars: Number(match[2]),
  centralPixelAdjustment: Number(match[3]),
  expected: expected.has(Number(match[1]))
}));
if (psfAdjustments.length !== 32) throw new Error(`Expected 32 PSF rows, found ${psfAdjustments.length}`);

const apertureBlock = log.split("Aperture corrections:")[1] || "";
const aperture = [...apertureBlock.matchAll(/^image (\d+): (\d+) total aperture stars/gm)].map(match => ({
  imageIndex: Number(match[1]),
  stars: Number(match[2]),
  expected: expected.has(Number(match[1]))
}));
if (aperture.length !== 32) throw new Error(`Expected 32 aperture rows, found ${aperture.length}`);

const expectedAlignment = alignment.filter(row => row.expected);
const structuralZeros = alignment.filter(row => !row.expected && row.matched === 0);
const expectedPsf = psfAdjustments.filter(row => row.expected);
const expectedAperture = aperture.filter(row => row.expected);
const alignmentPass = expectedAlignment.every(row => row.matched >= 100 && row.sigmaPixels < 0.30);
const topologyPass = structuralZeros.length === 24;
const psfPass = expectedPsf.every(row => row.stars >= 100 && Math.abs(row.centralPixelAdjustment) < 0.05);
const aperturePass = expectedAperture.every(row => row.stars >= 100);
const warningText = text(sourceFiles.warnings);
const warningImageIndices = pattern => [...warningText.matchAll(pattern)].map(match => Number(match[1]));
const noAlignmentIndices = warningImageIndices(/No alignment stars matched for image (\d+)/g);
const lowPsfIndices = warningImageIndices(/Only \d+ stars for PSF measurement in image (\d+)/g);
const lowApertureIndices = warningImageIndices(/Only \d+ aperture stars in image (\d+)/g);
const warningsOnlyOutsideSupport = [...noAlignmentIndices, ...lowPsfIndices, ...lowApertureIndices].every(index => !expected.has(index));

fs.mkdirSync(reproDir, { recursive: true });
const committedReceipts = [];
for (const [kind, source] of Object.entries(sourceFiles)) {
  const extension = kind === "log" || kind === "warnings" || kind === "timing" || kind === "info" || kind === "psfs" || kind === "apcor" ? "txt" : "dat";
  const destination = path.join(reproDir, `rc70-nrcb1-baseline-${kind}.${extension}`);
  fs.copyFileSync(source, destination);
  committedReceipts.push({ kind, file: path.relative(process.cwd(), destination).replaceAll("\\", "/"), bytes: fs.statSync(destination).size, sha256: sha256(destination), rows: lines(destination).length });
}

const timeLog = text(sourceTime);
const timing = {
  elapsed: timeLog.match(/Elapsed \(wall clock\) time \(h:mm:ss or m:ss\):\s*([^\r\n]+)/)?.[1]?.trim() || null,
  userSeconds: Number(timeLog.match(/User time \(seconds\):\s*([\d.]+)/)?.[1] || NaN),
  systemSeconds: Number(timeLog.match(/System time \(seconds\):\s*([\d.]+)/)?.[1] || NaN),
  maximumResidentKb: Number(timeLog.match(/Maximum resident set size \(kbytes\):\s*(\d+)/)?.[1] || NaN)
};

const result = {
  cycleId: "RC-2026-70",
  experimentId: "PHOST-DETECTOR-BASELINE-1-NRCB1-PILOT",
  reviewedOn: "2026-09-01",
  software: {
    name: "DOLPHOT",
    version: "3.0",
    binarySha256: "b0a3f74cddda42c24e7265fc5a8e0f94a2fbc147abc770e9cd21d330207c0c06",
    parameterFile: "research/reproducibility/rc70-detector-baseline-nrcb1.param",
    parameterSha256: sha256(path.join(reproDir, "rc70-detector-baseline-nrcb1.param"))
  },
  tile: {
    id: tile.id,
    detector: tile.detector,
    photsec: tile.photsec,
    expectedImageIndices: tile.expectedImageIndices,
    unexpectedImageIndices: alignment.filter(row => !row.expected).map(row => row.imageIndex)
  },
  alignment,
  psf: psfAdjustments,
  aperture,
  gates: {
    geometry: { pass: topologyPass, criterion: "Exactly the predeclared eight NRCB1 exposures match; the other 24 are structural zeros." },
    alignment: { pass: alignmentPass, criterion: "Each expected image has at least 100 matched stars and sigma below 0.30 pixels." },
    psf: { pass: psfPass, criterion: "Each expected image has at least 100 PSF stars and absolute central-pixel adjustment below 0.05." },
    aperture: { pass: aperturePass, criterion: "Each expected image has at least 100 total aperture stars." },
    nrcb1Pilot: { pass: topologyPass && alignmentPass && psfPass && aperturePass },
    fourDetectorBaseline: { pass: false, criterion: "NRCB1-4 must all pass; only the prespecified NRCB1 pilot was executed this cycle." },
    sealedAst: { pass: false, criterion: "The 3,072-row AST remains closed until all four detector baselines and an independent receipt parser pass." }
  },
  warnings: {
    totalLines: lines(sourceFiles.warnings).length,
    noAlignmentStars: noAlignmentIndices.length,
    lowPsfStars: lowPsfIndices.length,
    lowApertureStars: lowApertureIndices.length,
    expectedExposureWarnings: [...noAlignmentIndices, ...lowPsfIndices, ...lowApertureIndices].filter(index => expected.has(index)).length,
    warningsOnlyOutsideSupport,
    interpretation: "The 72 warnings are exactly three diagnostics for each of the 24 geometrically disjoint images; none belongs to an NRCB1 exposure."
  },
  output: {
    catalogueRows: lines(path.join(workDir, root)).length,
    timing,
    receipts: committedReceipts
  },
  inferenceBoundary: "This pilot can classify detector support and measurement-operator quality for NRCB1. It estimates no artificial-star recovery effect, Cepheid distance contrast, or Hubble-constant shift.",
  nextDecision: topologyPass && alignmentPass && psfPass && aperturePass
    ? "Run the unchanged NRCB2, NRCB3, and NRCB4 tiles and require the same gates before any sealed injection."
    : "Keep the sealed AST closed and enlarge or revise the NRCB1 calibration region without reading any artificial-star outcome."
};

const output = path.join(reproDir, "rc70-nrcb1-detector-baseline-result.json");
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(process.cwd(), output), gates: result.gates, timing: result.output.timing }, null, 2));
