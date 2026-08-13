import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = process.env.IUCR_QARR_OPEN_WORLD_DIR || path.join(os.tmpdir(), "unsolved-rc22-qarr-open-world");
const officialBase = "https://www.iucr.org/__data/iucr/powder/QARR/col/";
const sources = {
  "cpd-2.prn": { role: "open-world-target", timestamp: "20090728004708", original: "http://www.iucr.org:80/__data/iucr/powder/QARR/col/cpd-2.prn", warcDigest: "Q4X3VCV2QI6JL3NWHGXNIWFZMJQE5RFL", cdxLength: 28854 },
  "brucite.prn": { role: "candidate-phase-reference", timestamp: "20090728004638", original: "http://www.iucr.org:80/__data/iucr/powder/QARR/col/brucite.prn", warcDigest: "ALYCWLCRIKWV53MJTRQ6BZNMN3DVPLS2", cdxLength: 28132 },
  "silica.prn": { role: "candidate-phase-decoy", timestamp: "20090728005604", original: "http://www.iucr.org:80/__data/iucr/powder/QARR/col/silica.prn", warcDigest: "ZK7NLXMPZXH6TQ3RC6WQ5NFDUVR52WOB", cdxLength: 26797 }
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
  if (Math.abs(rows[0][0] - 5) > 2e-5 || Math.abs(rows.at(-1)[0] - 150) > 2e-5) throw new Error(`${name}: angle endpoints changed`);
  if (!rows.every((row, index) => Math.abs(row[0] - (5 + 0.02 * index)) <= 2e-5)) throw new Error(`${name}: angle differs materially from nominal grid`);
};

fs.mkdirSync(outputDir, { recursive: true });
const files = [];
for (const [name, source] of Object.entries(sources)) {
  const target = path.join(outputDir, name);
  if (!fs.existsSync(target)) {
    let response = await fetch(`${officialBase}${name}`, { headers: { "User-Agent": "UnsolvedProblems research audit (https://github.com/eljja/UnsolvedProblems)" } });
    if (!response.ok) {
      const archiveUrl = `https://web.archive.org/web/${source.timestamp}id_/${source.original}`;
      response = await fetch(archiveUrl, { headers: { "User-Agent": "UnsolvedProblems research audit (https://github.com/eljja/UnsolvedProblems)" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${archiveUrl}`);
    }
    const rows = parseRows(await response.text());
    validateRows(name, rows);
    fs.writeFileSync(target, normalizeRows(rows.map((row, index) => [Number((5 + 0.02 * index).toFixed(3)), row[1]])));
  }
  const buffer = fs.readFileSync(target), rows = parseRows(buffer.toString("utf8"));
  validateRows(name, rows);
  files.push({
    name, role: source.role, officialUrl: `${officialBase}${name}`,
    archive: { timestamp: source.timestamp, original: source.original, warcDigest: source.warcDigest, cdxLength: source.cdxLength },
    transport: "Current official URL with the fixed Internet Archive replay as an HTTP-refusal fallback; local cache reuse does not change source provenance.",
    bytes: buffer.length, sha256: sha256(buffer), points: rows.length,
    angleStartDegrees2Theta: rows[0][0], angleEndDegrees2Theta: rows.at(-1)[0], stepDegrees2Theta: 0.02
  });
}

const manifest = {
  manifestId: "IUCR-QARR-OPEN-WORLD-MANIFEST-0.1", reviewedOn: "2026-08-14",
  status: "source-lineage-fixed-before-sample-2-computation",
  source: { currentDataPage: "https://www.iucr.org/resources/commissions/powder-diffraction/projects/qarr/data", sampleDescription: "https://www.iucr.org/__data/iucr/powder/QARR/samples.htm", archiveIndex: "https://web.archive.org/cdx/" },
  transportRule: "Try the current official numerical response first, then the fixed archive record. Parse exactly 7,251 rows, tolerate archived angle printing drift only within 0.00002 degree, canonicalize the nominal angle, preserve counts, and hash deterministic UTF-8/LF output.",
  knowledgeFirewall: "The target and candidate hashes are fixed together, but detector calibration code may not load either candidate profile or official Sample 2 truth until its alarm is frozen.",
  files,
  verified: { files: files.length, uniqueHashes: new Set(files.map(file => file.sha256)).size, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), everyFileTwoColumnMonotone: true },
  localCache: "Temporary analysis input only; numerical profiles are not redistributed by this repository."
};
if (write) {
  const target = path.join(root, "research", "reproducibility", "iucr-qarr-open-world-manifest.json");
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, target)} from ${files.length} official profiles.`);
} else console.log(JSON.stringify(manifest, null, 2));
