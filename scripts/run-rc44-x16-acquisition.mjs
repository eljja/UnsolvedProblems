import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const layer = Number(args.find(value => value.startsWith("--layer="))?.split("=")[1]);
const shouldWrite = args.includes("--write");
if (![1, 2].includes(layer)) throw new Error("--layer=1 or --layer=2 is required");

const CACHE = path.join(root, ".cache", "rc44-x16", `l${String(layer).padStart(4, "0")}`);
const SEVEN_ZIP = "C:\\Program Files\\AMD\\CIM\\Bin64\\7z.exe";
const LIMIT = 402_653_184;
const SOURCES = {
  1: {
    role: "natural-holdout",
    xypt: { url: "https://data.nist.gov/od/ds/ark:/88434/mds2-2309/XYPT_L001-025.zip", archiveBytes: 159_164_372, name: "XYPT_L0001.csv", start: 0, headerBytes: 44, compressedSize: 6_518_714, uncompressedSize: 72_015_733, crc32: "0af07559", expectedTextSha256: "149443c27a88f4faa513fdee7ee9e523aee85a246aeae726c1cdaf164f82bf47" },
    avi: { url: "https://data.nist.gov/od/ds/ark:/88434/mds2-2309/MPMcameraAVI_L001-025.zip", archiveBytes: 5_037_696_861, name: "MPMcamera_L0001.avi", start: 0, headerBytes: 49, compressedSize: 181_048_432, uncompressedSize: 183_130_242, crc32: "d42f4023" }
  },
  2: {
    role: "development",
    xypt: { url: "https://data.nist.gov/od/ds/ark:/88434/mds2-2309/XYPT_L001-025.zip", archiveBytes: 159_164_372, name: "XYPT_L0002.csv", start: 6_518_758, headerBytes: 44, compressedSize: 5_801_886, uncompressedSize: 64_749_624, crc32: "3bb9c502", expectedTextSha256: "576d1e19cc4aee87ab60dcde4376ce21faa3c42342a9a7653d9bf5af4a3a1c7c" },
    avi: { url: "https://data.nist.gov/od/ds/ark:/88434/mds2-2309/MPMcameraAVI_L001-025.zip", archiveBytes: 5_037_696_861, name: "MPMcamera_L0002.avi", start: 181_048_481, headerBytes: 49, compressedSize: 170_506_288, uncompressedSize: 172_605_872, crc32: "e85e3962" }
  }
};

const shaFile = (file) => new Promise((resolve, reject) => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(file);
  stream.on("data", chunk => hash.update(chunk));
  stream.on("error", reject);
  stream.on("end", () => resolve(hash.digest("hex")));
});

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let bit = 0; bit < 8; bit += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crcFile = (file) => new Promise((resolve, reject) => {
  let crc = 0xffffffff;
  const stream = fs.createReadStream(file);
  stream.on("data", chunk => { for (const value of chunk) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8); });
  stream.on("error", reject);
  stream.on("end", () => resolve(((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0")));
});

async function rangeToFile(spec, output, purpose) {
  const bytes = spec.headerBytes + spec.compressedSize;
  if (bytes > LIMIT) throw new Error(`${purpose} exceeds total cycle ceiling`);
  const end = spec.start + bytes - 1;
  const response = await fetch(spec.url, { headers: { Range: `bytes=${spec.start}-${end}` } });
  if (response.status !== 206) throw new Error(`${purpose}: expected HTTP 206, received ${response.status}`);
  const expectedRange = `bytes ${spec.start}-${end}/${spec.archiveBytes}`;
  if (response.headers.get("content-range") !== expectedRange) throw new Error(`${purpose}: content-range mismatch`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temp = `${output}.download`;
  const writer = fs.createWriteStream(temp, { flags: "w" });
  const bodyHash = crypto.createHash("sha256");
  let received = 0;
  try {
    for await (const chunk of response.body) {
      const bytesChunk = Buffer.from(chunk);
      received += bytesChunk.length;
      bodyHash.update(bytesChunk);
      if (!writer.write(bytesChunk)) await new Promise(resolve => writer.once("drain", resolve));
    }
    await new Promise((resolve, reject) => { writer.end(resolve); writer.on("error", reject); });
  } catch (error) {
    writer.destroy();
    throw error;
  }
  if (received !== bytes) throw new Error(`${purpose}: received ${received}, expected ${bytes}`);
  fs.renameSync(temp, output);
  return { purpose, start: spec.start, end, bytes: received, contentRange: expectedRange, bodySha256: bodyHash.digest("hex") };
}

function extract(partialZip, outputDirectory, expectedName) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const result = spawnSync(SEVEN_ZIP, ["x", "-y", `-o${outputDirectory}`, partialZip], { encoding: "utf8", windowsHide: true });
  const output = path.join(outputDirectory, expectedName);
  if (!fs.existsSync(output)) throw new Error(`7-Zip did not produce ${expectedName}: ${result.stdout}\n${result.stderr}`);
  return { exitCode: result.status, stdoutTail: result.stdout.slice(-600), stderrTail: result.stderr.slice(-600), output };
}

async function acquireKind(kind, spec) {
  const partialZip = path.join(CACHE, `${kind}-member.partial.zip`);
  const receipt = await rangeToFile(spec, partialZip, `${spec.name} exact local member range`);
  const extraction = extract(partialZip, path.join(CACHE, "extracted"), spec.name);
  const stat = fs.statSync(extraction.output);
  const crc32 = await crcFile(extraction.output);
  if (stat.size !== spec.uncompressedSize) throw new Error(`${spec.name}: size ${stat.size} != ${spec.uncompressedSize}`);
  if (crc32 !== spec.crc32) throw new Error(`${spec.name}: CRC ${crc32} != ${spec.crc32}`);
  const sha256 = await shaFile(extraction.output);
  if (spec.expectedTextSha256 && sha256 !== spec.expectedTextSha256) throw new Error(`${spec.name}: SHA-256 changed from RC43`);
  return {
    member: { name: spec.name, method: kind === "avi" ? 9 : 8, crc32, compressedSize: spec.compressedSize, uncompressedSize: spec.uncompressedSize, localHeaderOffset: spec.start, localHeaderBytes: spec.headerBytes },
    receipt,
    extracted: { relativeCachePath: path.relative(root, extraction.output).replaceAll("\\", "/"), bytes: stat.size, sha256, crc32 },
    decoder: { path: SEVEN_ZIP, exitCode: extraction.exitCode, executableSha256: await shaFile(SEVEN_ZIP), stdoutTail: extraction.stdoutTail, stderrTail: extraction.stderrTail }
  };
}

const spec = SOURCES[layer];
if (layer === 1) {
  const sealPath = path.join(root, "research", "reproducibility", "rc44-development-release.json");
  if (!fs.existsSync(sealPath)) throw new Error("L0001 is sealed until rc44-development-release.json exists");
  const seal = JSON.parse(fs.readFileSync(sealPath, "utf8"));
  if (!seal.syntheticGatePassed || !seal.holdoutReleased) throw new Error("L0001 release gate is not passed");
}

const xypt = await acquireKind("xypt", spec.xypt);
const avi = await acquireKind("avi", spec.avi);
const result = {
  acquisitionId: `RC44-X16-L${String(layer).padStart(4, "0")}-ACQUISITION-0.1`,
  cycleId: "RC-2026-44",
  createdOn: new Date().toISOString(),
  layer,
  role: spec.role,
  precommit: "research/reproducibility/rc44-command-image-alignment-precommit.json",
  amendments: ["research/reproducibility/rc44-amendment-01.json"],
  xypt,
  avi,
  transfer: {
    maximumNistResponseBodyBytes: LIMIT,
    thisAcquisitionBytes: xypt.receipt.bytes + avi.receipt.bytes,
    receipts: [xypt.receipt, avi.receipt]
  },
  boundary: "The exact selected ZIP members were acquired; no full multi-gigabyte archive or TIFF member was downloaded. Acquisition alone makes no positional or physical claim."
};

if (shouldWrite) {
  const output = path.join(root, "research", "reproducibility", `rc44-x16-layer-${String(layer).padStart(4, "0")}-acquisition.json`);
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, output)}`);
}
console.log(JSON.stringify({ layer, xypt: result.xypt.extracted, avi: result.avi.extracted, transfer: result.transfer }, null, 2));
