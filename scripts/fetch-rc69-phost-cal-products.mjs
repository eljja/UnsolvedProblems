import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirIndex = process.argv.indexOf("--download-dir");
const downloadDir = path.resolve(root, dirIndex >= 0 ? process.argv[dirIndex + 1] : ".cache/rc69-phost-ast/cal");
const write = process.argv.includes("--write");
const expectedBytes = 117_573_120;
const sourceBase = "http://americano.dolphinsim.com/dolphot/";

const products = [];
for (const [sequence, band] of [["02101", "F090W"], ["04101", "F150W"]]) {
  for (let dither = 1; dither <= 4; dither += 1) {
    for (let detector = 1; detector <= 4; detector += 1) {
      const filename = `jw02875012001_${sequence}_${String(dither).padStart(5, "0")}_nrcb${detector}_cal.fits`;
      products.push({
        band,
        dither,
        detector: `NRCB${detector}`,
        filename,
        dataUri: `mast:JWST/product/${filename}`,
        expectedBytes
      });
    }
  }
}

const software = [
  ["dolphot3.0.tar.gz", "reference base source", "stable release updated 2026-04-03"],
  ["dolphot3.0.NIRCAM.tar.gz", "reference NIRCam module", "stable release updated 2026-04-03"],
  ["dolphot3.1.tar.gz", "candidate sensitivity base source", "candidate release posted 2026-08-01"],
  ["dolphot3.1.NIRCAM.tar.gz", "candidate sensitivity NIRCam module", "candidate release posted 2026-08-01"],
  ["nircam_F090W.tar.gz", "F090W PSF library", "official PSF archive updated 2025-05-12"],
  ["nircam_F150W.tar.gz", "F150W PSF library", "official PSF archive updated 2025-05-12"],
  ["dolphot.pdf", "DOLPHOT manual", "manual retrieved with the pinned release"],
  ["dolphotNIRCAM.pdf", "NIRCam module manual", "manual retrieved with the pinned module"]
];

function sha256(filename) {
  const hash = crypto.createHash("sha256");
  const handle = fs.openSync(filename, "r");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  try {
    for (;;) {
      const bytes = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (!bytes) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest("hex");
}

function parseFitsHeader(filename) {
  const handle = fs.openSync(filename, "r");
  const buffer = Buffer.alloc(2880 * 24);
  const bytes = fs.readSync(handle, buffer, 0, buffer.length, 0);
  fs.closeSync(handle);
  const cards = {};
  for (let offset = 0; offset + 80 <= bytes; offset += 80) {
    const card = buffer.subarray(offset, offset + 80).toString("ascii");
    const key = card.slice(0, 8).trim();
    if (key === "END") break;
    if (card[8] !== "=") continue;
    cards[key] = card.slice(10).split("/")[0].trim().replace(/^'|'$/g, "").trim();
  }
  const keys = ["TELESCOP", "INSTRUME", "DETECTOR", "FILTER", "PROGRAM", "OBSERVTN", "VISIT", "EXPOSURE", "DATE-BEG", "CAL_VER", "CRDS_CTX"];
  return Object.fromEntries(keys.map((key) => [key, cards[key] ?? null]));
}

async function probe(product) {
  const url = `https://mast.stsci.edu/api/v0.1/Download/file?uri=${encodeURIComponent(product.dataUri)}`;
  const response = await fetch(url, { headers: { Range: "bytes=0-2879" } });
  if (response.status !== 206) throw new Error(`${product.filename}: range probe returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.subarray(0, 8).equals(Buffer.from("SIMPLE  "))) throw new Error(`${product.filename}: response is not FITS`);
  const total = Number(response.headers.get("content-range")?.split("/")[1] ?? 0);
  if (total !== product.expectedBytes) throw new Error(`${product.filename}: expected ${product.expectedBytes} bytes, archive reports ${total}`);
  return { ...product, url, archiveBytes: total, mode: "range-probe" };
}

async function download(product) {
  const target = path.join(downloadDir, product.filename);
  const url = `https://mast.stsci.edu/api/v0.1/Download/file?uri=${encodeURIComponent(product.dataUri)}`;
  fs.mkdirSync(downloadDir, { recursive: true });
  if (fs.existsSync(target) && fs.statSync(target).size !== product.expectedBytes) {
    throw new Error(`${product.filename}: existing file has an unexpected size; preserve it for diagnosis`);
  }
  if (!fs.existsSync(target)) {
    const partial = `${target}.partial`;
    const have = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
    const headers = have ? { Range: `bytes=${have}-` } : {};
    const response = await fetch(url, { headers });
    if (!response.ok || !response.body) throw new Error(`${product.filename}: download returned ${response.status}`);
    const append = have > 0 && response.status === 206;
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial, { flags: append ? "a" : "w" }));
    if (fs.statSync(partial).size !== product.expectedBytes) throw new Error(`${product.filename}: partial download has ${fs.statSync(partial).size} bytes`);
    fs.renameSync(partial, target);
  }
  return {
    ...product,
    url,
    archiveBytes: fs.statSync(target).size,
    sha256: sha256(target),
    header: parseFitsHeader(target),
    mode: "download"
  };
}

async function mapConcurrent(items, limit, callback) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      output[index] = await callback(items[index]);
      console.log(`${index + 1}/${items.length} ${items[index].filename}`);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return output;
}

const exposureFiles = await mapConcurrent(products, write ? 4 : 8, write ? download : probe);
const softwareFiles = software.map(([filename, role, releaseState]) => {
  const local = path.join(root, ".cache/rc69-phost-ast/sources", filename);
  if (!fs.existsSync(local)) throw new Error(`Missing pinned software asset ${filename}`);
  return {
    filename,
    role,
    releaseState,
    url: `${sourceBase}${filename}`,
    bytes: fs.statSync(local).size,
    sha256: sha256(local)
  };
});

const manifest = {
  cycleId: "RC-2026-69",
  reviewedOn: "2026-09-01",
  observation: "JWST GO-2875 observation 012 visit 001; NGC 3447 NIRCam module B",
  exposureCount: exposureFiles.length,
  totalExposureBytes: exposureFiles.reduce((sum, item) => sum + item.archiveBytes, 0),
  bands: { F090W: 16, F150W: 16 },
  exposureFiles,
  softwareFiles,
  releaseDecision: "DOLPHOT 3.0 is the frozen reference. The newly posted 3.1 candidate is a sensitivity branch and cannot silently replace the reference.",
  claimBoundary: "A complete, hash-pinned exposure and software manifest makes the collision AST executable. It does not itself validate alignment, PSF adequacy, artificial-star transport, or target-specific photometry."
};

if (write) {
  const output = path.join(root, "research/reproducibility/rc69-phost-cal-source-manifest.json");
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, output)}`);
}
console.log(JSON.stringify({ exposureCount: manifest.exposureCount, totalExposureBytes: manifest.totalExposureBytes, releaseDecision: manifest.releaseDecision }, null, 2));
