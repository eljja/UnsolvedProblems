import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = process.env.IUCR_QARR_HOLDOUT_DIR || path.join(os.tmpdir(), "unsolved-rc21-qarr-holdout");
const officialBase = "https://www.iucr.org/__data/iucr/powder/QARR/col/";
const archived = {
  "cpd-1d.prn": { timestamp: "20090728004658", original: "http://www.iucr.org:80/__data/iucr/powder/QARR/col/cpd-1d.prn", warcDigest: "7GTEW6VARNCC2Q77AMMAPKIIJG7F2VVT", cdxLength: 28284 },
  "cpd-1e.prn": { timestamp: "20090728005511", original: "http://www.iucr.org:80/__data/iucr/powder/QARR/col/cpd-1e.prn", warcDigest: "33QA7RZO6SOEXV7V7DYAUSDV5AQ3FAOP", cdxLength: 28625 },
  "cpd-1f.prn": { timestamp: "20090728004703", original: "http://www.iucr.org:80/__data/iucr/powder/QARR/col/cpd-1f.prn", warcDigest: "JU326JW3LBQYUCZQ4XWZWHHUMKAZPZUV", cdxLength: 28739 },
  "cpd-1g.prn": { timestamp: "20090728005517", original: "http://www.iucr.org:80/__data/iucr/powder/QARR/col/cpd-1g.prn", warcDigest: "Q3SS4IV25GPZE3RXB2K7U35Z565VXTWE", cdxLength: 28648 },
  "cpd-1h.prn": { timestamp: "20090728005522", original: "http://www.iucr.org:80/__data/iucr/powder/QARR/col/cpd-1h.prn", warcDigest: "FH44BVIT3S2K7DDHFDLE2RRHWLZLZ4PC", cdxLength: 28550 }
};
const write = process.argv.includes("--write");
const sha256 = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const parseRows = text => text.trim().split(/\r?\n/).map((line, index) => {
  const values = line.trim().split(/\s+/).map(Number);
  if (values.length !== 2 || !values.every(Number.isFinite)) throw new Error(`invalid numerical row ${index + 1}`);
  return values;
});
const normalizeRows = rows => `${rows.map(([angle, count]) => `${angle.toFixed(3).padStart(8)}${String(count).padStart(10)}`).join("\n")}\n\n`;
const validateRows = (name, rows) => {
  if (rows.length !== 7251) throw new Error(`${name}: expected 7,251 points, found ${rows.length}`);
  if (rows[0][0] !== 5 || rows.at(-1)[0] !== 150) throw new Error(`${name}: angle endpoints changed`);
  if (!rows.every((row, index) => Math.abs(row[0] - (5 + 0.02 * index)) <= 2e-5)) throw new Error(`${name}: angle differs materially from the nominal grid`);
};

fs.mkdirSync(outputDir, { recursive: true });
const files = [];
for (const [name, archive] of Object.entries(archived)) {
  const target = path.join(outputDir, name);
  if (!fs.existsSync(target)) {
    let response = await fetch(`${officialBase}${name}`, { headers: { "User-Agent": "UnsolvedProblems research audit (https://github.com/eljja/UnsolvedProblems)" } });
    if (!response.ok) {
      const archiveUrl = `https://web.archive.org/web/${archive.timestamp}id_/${archive.original}`;
      response = await fetch(archiveUrl, { headers: { "User-Agent": "UnsolvedProblems research audit (https://github.com/eljja/UnsolvedProblems)" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${archiveUrl}`);
    }
    const rows = parseRows(await response.text());
    validateRows(name, rows);
    const canonicalRows = rows.map((row, index) => [Number((5 + 0.02 * index).toFixed(3)), row[1]]);
    fs.writeFileSync(target, normalizeRows(canonicalRows));
  }
  const buffer = fs.readFileSync(target);
  const rows = parseRows(buffer.toString("utf8"));
  validateRows(name, rows);
  files.push({
    name, sample: name.slice(4, 6), role: "external-composition-holdout",
    officialUrl: `${officialBase}${name}`, archive,
    transport: "Current official URL with the fixed Internet Archive replay as an HTTP-refusal fallback; local cache reuse does not change source provenance.",
    bytes: buffer.length, sha256: sha256(buffer), points: rows.length,
    angleStartDegrees2Theta: rows[0][0], angleEndDegrees2Theta: rows.at(-1)[0], stepDegrees2Theta: 0.02
  });
}

const manifest = {
  manifestId: "IUCR-QARR-EXTERNAL-HOLDOUT-MANIFEST-0.1",
  reviewedOn: "2026-08-14",
  status: "source-lineage-fixed-before-holdout-computation",
  source: {
    currentDataPage: "https://www.iucr.org/resources/commissions/powder-diffraction/projects/qarr/data",
    currentWeighedValues: "https://www.iucr.org/resources/commissions/powder-diffraction/projects/qarr/values",
    archiveIndex: "https://web.archive.org/cdx/"
  },
  transportRule: "Try the current official numerical response first. If automated access returns an HTTP refusal, replay the recorded IUCr response identified by the fixed Wayback timestamp, original URL, WARC digest, and CDX length. In either case parse exactly 7,251 numerical rows. Accept an archived printed angle only when it lies within 0.00002 degree of 5+0.02*i, write that nominal angle to three decimals, preserve the count, and hash the deterministic UTF-8/LF representation. The repository records hashes and does not redistribute the profiles.",
  currentSourceCrossCheck: "The current IUCr data page lists PRN files 1d-1h, the current search crawl reports 7,251 lines for accessible text responses, and the official collection contract fixes 5-150 degrees at 0.02-degree steps. Archive replay is transport evidence, not a substitute scientific source.",
  calibrationExclusion: "No file in this manifest may set, tune, or select a peak, background rule, response ratio, full-pattern preprocessing parameter, hypothesis, or safety threshold.",
  files,
  verified: {
    files: files.length, samples: files.map(file => file.sample), uniqueHashes: new Set(files.map(file => file.sha256)).size,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), everyFileTwoColumnMonotone: true
  },
  localCache: "Temporary analysis input only; holdout profiles are not redistributed by this repository."
};

if (write) {
  const target = path.join(root, "research", "reproducibility", "iucr-qarr-external-holdout-manifest.json");
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, target)} from ${files.length} external holdout profiles.`);
} else console.log(JSON.stringify(manifest, null, 2));
