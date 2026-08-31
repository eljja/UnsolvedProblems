import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputIndex = process.argv.indexOf("--download-dir");
const downloadDir = path.resolve(root, outputIndex >= 0 ? process.argv[outputIndex + 1] : ".cache/rc68-target-first");
const write = process.argv.includes("--write");

const products = [
  ["f090w_i2d.fits", "mast:JWST/product/jw02875-o012_t009_nircam_clear-f090w_i2d.fits"],
  ["f090w_segm.fits", "mast:JWST/product/jw02875-o012_t009_nircam_clear-f090w_segm.fits"],
  ["f150w_i2d.fits", "mast:JWST/product/jw02875-o012_t009_nircam_clear-f150w_i2d.fits"],
  ["f150w_segm.fits", "mast:JWST/product/jw02875-o012_t009_nircam_clear-f150w_segm.fits"]
];

function sha256(file) {
  const hash = crypto.createHash("sha256");
  const handle = fs.openSync(file, "r");
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

async function fetchProduct(fileName, dataUri) {
  const destination = path.join(downloadDir, fileName);
  const url = `https://mast.stsci.edu/api/v0.1/Download/file?uri=${encodeURIComponent(dataUri)}`;
  if (!write) {
    const response = await fetch(url, { headers: { Range: "bytes=0-2879" } });
    if (response.status !== 206) throw new Error(`${fileName}: range probe returned ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.subarray(0, 8).equals(Buffer.from("SIMPLE  "))) throw new Error(`${fileName}: not a FITS product`);
    return { fileName, dataUri, url, mode: "range-probe", bytes: Number(response.headers.get("content-range")?.split("/")[1] ?? 0) };
  }

  fs.mkdirSync(downloadDir, { recursive: true });
  const partial = `${destination}.partial`;
  const expected = fs.existsSync(destination) ? fs.statSync(destination).size : 0;
  if (!expected) {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`${fileName}: download returned ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
    fs.renameSync(partial, destination);
  }
  const bytes = fs.statSync(destination).size;
  return { fileName, dataUri, url, mode: "download", bytes, sha256: sha256(destination) };
}

const results = [];
for (const [fileName, dataUri] of products) {
  const result = await fetchProduct(fileName, dataUri);
  results.push(result);
  console.log(JSON.stringify(result));
}
console.log(JSON.stringify({ downloadDir, products: results }, null, 2));
