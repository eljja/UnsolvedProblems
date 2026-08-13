import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = process.env.IUCR_QARR_REFERENCE_DIR || path.join(os.tmpdir(), "unsolved-rc20-qarr-reference");
const baseUrl = "https://www.iucr.org/__data/iucr/powder/QARR/col/";
const names = [
  "corundum.prn", "fluorite.prn", "zincite.prn",
  ...["a", "b", "c"].map(letter => `cpd-1${letter}.prn`)
];
const write = process.argv.includes("--write");

fs.mkdirSync(outputDir, { recursive: true });
const sha256 = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const parse = text => text.trim().split(/\r?\n/).map((line, index) => {
  const parts = line.trim().split(/\s+/).map(Number);
  if (parts.length !== 2 || !parts.every(Number.isFinite)) throw new Error(`invalid two-column row ${index + 1}`);
  return parts;
});

const records = [];
for (const name of names) {
  const url = `${baseUrl}${name}`;
  const target = path.join(outputDir, name);
  let buffer;
  if (fs.existsSync(target)) buffer = fs.readFileSync(target);
  else {
    const response = await fetch(url, { headers: { "User-Agent": "UnsolvedProblems research-reproducibility audit (https://github.com/eljja/UnsolvedProblems)" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
    buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(target, buffer);
  }
  const rows = parse(buffer.toString("utf8"));
  if (rows.length !== 7251) throw new Error(`${name}: expected 7,251 points, found ${rows.length}`);
  if (!rows.every((row, index) => index === 0 || row[0] > rows[index - 1][0])) throw new Error(`${name}: angle grid is not monotone`);
  records.push({
    name, role: name.startsWith("cpd-") ? "calibration-mixture" : "pure-phase-reference",
    url, bytes: buffer.length, sha256: sha256(buffer), points: rows.length,
    angleStartDegrees2Theta: rows[0][0], angleEndDegrees2Theta: rows.at(-1)[0],
    medianStepDegrees2Theta: rows[Math.floor(rows.length / 2)][0] - rows[Math.floor(rows.length / 2) - 1][0]
  });
}

const manifest = {
  manifestId: "IUCR-QARR-REFERENCE-PATTERN-MANIFEST-0.1",
  reviewedOn: "2026-08-12",
  source: {
    dataKit: "https://www.iucr.org/__data/iucr/powder/QARR/data-kit.htm",
    weighedValues: "https://www.iucr.org/resources/commissions/powder-diffraction/projects/qarr/values",
    outcomesPaper: "https://doi.org/10.1107/S0021889801007476"
  },
  officialCollectionContract: {
    geometry: "Flat-plate Bragg-Brentano reflection geometry on a Philips 3020 goniometer with PW3710 controller",
    source: "Copper long-fine-focus tube at 40 kV and 40 mA with curved graphite monochromator and proportional counter",
    scan: "5 to 150 degrees 2theta, 0.02-degree step, 3 seconds per step",
    webReleaseOfTruth: "1999-11-08",
    historicalCorrectionNotice: "The official kit states that Bruker/Siemens RAW and XDA conversions downloaded before 1998-01-27 must be replaced; this cycle uses the ASCII column PRN files."
  },
  calibrationSelection: "Mixtures 1a, 1b, and 1c form the three phase-dominant simplex vertices: fluorite-, corundum-, and zincite-rich respectively. Mixtures 1d-1h are excluded from calibration rather than used after seeing Rowles outcomes.",
  byteLineage: "When Cloudflare prevents direct scripted transfer, the visible official two-column response is extracted through an interactive browser and normalized to UTF-8 with one LF-terminated line per data point. The hashes below bind that normalized numerical text, not the server's transport bytes.",
  files: records,
  verified: {
    files: records.length,
    purePhaseReferences: records.filter(row => row.role === "pure-phase-reference").length,
    calibrationMixtures: records.filter(row => row.role === "calibration-mixture").length,
    uniqueHashes: new Set(records.map(row => row.sha256)).size,
    totalBytes: records.reduce((sum, row) => sum + row.bytes, 0),
    everyFileTwoColumnMonotone: true
  },
  localCache: "Temporary analysis input only; raw profiles are not redistributed by this repository."
};

if (write) {
  const target = path.join(root, "research", "reproducibility", "iucr-qarr-reference-pattern-manifest.json");
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, target)} from ${records.length} official profiles.`);
} else console.log(JSON.stringify(manifest, null, 2));
