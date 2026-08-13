import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = process.env.IUCR_QARR_AMORPHOUS_DIR || path.join(os.tmpdir(), "unsolved-rc23-qarr-amorphous");
const name = "cpd-3.prn";
const officialUrl = `https://www.iucr.org/__data/iucr/powder/QARR/col/${name}`;
const archive = {
  timestamp: "20090728004713",
  original: "http://www.iucr.org:80/__data/iucr/powder/QARR/col/cpd-3.prn",
  warcDigest: "RRWIRTL2IH4COULSZIQA2LZ6GWUA6Z4W",
  cdxLength: 28554
};
const write = process.argv.includes("--write");
const sha256 = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const parseRows = text => text.trim().split(/\r?\n/).map((line, index) => {
  const values = line.trim().split(/\s+/).map(Number);
  if (values.length !== 2 || !values.every(Number.isFinite)) throw new Error(`invalid numerical row ${index + 1}`);
  return values;
});
const validate = rows => {
  if (rows.length !== 7251) throw new Error(`expected 7,251 points, found ${rows.length}`);
  if (!rows.every((row, index) => Math.abs(row[0] - (5 + 0.02 * index)) <= 2e-5)) throw new Error("angle differs materially from nominal grid");
};
const normalize = rows => `${rows.map(([angle, count]) => `${angle.toFixed(3).padStart(8)}${String(count).padStart(10)}`).join("\n")}\n\n`;

fs.mkdirSync(outputDir, { recursive: true });
const target = path.join(outputDir, name);
let transportUsed = "local-cache";
if (!fs.existsSync(target)) {
  let response = await fetch(officialUrl, { headers: { "User-Agent": "UnsolvedProblems research audit (https://github.com/eljja/UnsolvedProblems)" } });
  transportUsed = "current-official";
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || contentType.includes("text/html")) {
    const archiveUrl = `https://web.archive.org/web/${archive.timestamp}id_/${archive.original}`;
    response = await fetch(archiveUrl, { headers: { "User-Agent": "UnsolvedProblems research audit (https://github.com/eljja/UnsolvedProblems)" } });
    transportUsed = "fixed-wayback-fallback";
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${archiveUrl}`);
  }
  const rows = parseRows(await response.text());
  validate(rows);
  fs.writeFileSync(target, normalize(rows.map((row, index) => [Number((5 + 0.02 * index).toFixed(3)), row[1]])));
}
const buffer = fs.readFileSync(target), rows = parseRows(buffer.toString("utf8"));
validate(rows);
const file = {
  name, sample: "3", role: "external-amorphous-positive", officialUrl, archive,
  transportUsed,
  transport: "Current official numerical response when available; otherwise the fixed archived IUCr response identified by timestamp, original URL, WARC digest, and CDX length.",
  bytes: buffer.length, sha256: sha256(buffer), points: rows.length,
  angleStartDegrees2Theta: rows[0][0], angleEndDegrees2Theta: rows.at(-1)[0], stepDegrees2Theta: 0.02
};
const manifest = {
  manifestId: "IUCR-QARR-AMORPHOUS-HOLDOUT-MANIFEST-0.1", reviewedOn: "2026-08-14",
  status: "source-lineage-fixed-after-spec-seal-before-sample-3-computation",
  source: {
    dataPage: "https://www.iucr.org/resources/commissions/powder-diffraction/projects/qarr/data",
    sampleDescription: "https://www.iucr.org/__data/iucr/powder/QARR/samples.htm",
    outcomes: "https://doi.org/10.1107/S0021889802008798",
    archiveIndex: "https://web.archive.org/cdx/"
  },
  transportRule: "Parse exactly 7,251 rows. Accept historical printed angle drift only within 0.00002 degree of 5+0.02*i, canonicalize the nominal angle to three decimals, preserve counts, and hash deterministic UTF-8/LF output.",
  calibrationExclusion: "Sample 3 may not set or change detector scale, thresholds, baseline, fit range, templates, candidate pool, success gates, or the 15-30 degree localization interval.",
  files: [file],
  verified: { files: 1, uniqueHashes: 1, totalBytes: buffer.length, everyFileTwoColumnMonotone: true },
  localCache: "Temporary analysis input only; the numerical profile is not redistributed by this repository."
};
if (write) {
  const destination = path.join(root, "research", "reproducibility", "iucr-qarr-amorphous-holdout-manifest.json");
  fs.writeFileSync(destination, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, destination)} from ${transportUsed}.`);
} else console.log(JSON.stringify(manifest, null, 2));
