import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const layer = Number(args.find((arg) => arg.startsWith("--layer="))?.split("=")[1] || "1");
const shouldWrite = args.includes("--write");
const inventoryOnly = args.includes("--inventory-only");
const prefixOnly = args.includes("--prefix-only");
const maxBytes = 134_217_728;
if (!Number.isInteger(layer) || layer < 1 || layer > 25) throw new Error("--layer must be an integer from 1 through 25");

const pad4 = (value) => String(value).padStart(4, "0");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const asSafeNumber = (value, label) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} exceeds Number.MAX_SAFE_INTEGER`);
  return Number(value);
};

class RangeReader {
  constructor(url, officialBytes, archiveLabel) {
    this.url = url;
    this.officialBytes = officialBytes;
    this.archiveLabel = archiveLabel;
    this.transferredBytes = 0;
    this.receipts = [];
  }

  async read(start, end, purpose) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= this.officialBytes) {
      throw new Error(`invalid range ${start}-${end} for ${this.archiveLabel}`);
    }
    const requestedBytes = end - start + 1;
    if (this.transferredBytes + requestedBytes > maxBytes) {
      throw new Error(`transfer budget would be exceeded for ${this.archiveLabel}: ${this.transferredBytes}+${requestedBytes}>${maxBytes}`);
    }
    const response = await fetch(this.url, { headers: { Range: `bytes=${start}-${end}` } });
    if (response.status !== 206) throw new Error(`${this.archiveLabel} ignored range ${start}-${end}: HTTP ${response.status}`);
    const contentRange = response.headers.get("content-range");
    const expected = `bytes ${start}-${end}/${this.officialBytes}`;
    if (contentRange !== expected) throw new Error(`${this.archiveLabel} content-range mismatch: ${contentRange} != ${expected}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== requestedBytes) throw new Error(`${this.archiveLabel} body length ${bytes.length} != ${requestedBytes}`);
    this.transferredBytes += bytes.length;
    this.receipts.push({ purpose, start, end, bytes: bytes.length, contentRange, bodySha256: sha256(bytes) });
    return bytes;
  }
}

const findLastSignature = (bytes, signature) => {
  for (let offset = bytes.length - 4; offset >= 0; offset -= 1) {
    if (bytes.readUInt32LE(offset) === signature) return offset;
  }
  return -1;
};

const parseZip64Extra = (extra, needs) => {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    const data = extra.subarray(cursor + 4, cursor + 4 + size);
    if (id === 0x0001) {
      let pos = 0;
      const out = {};
      for (const field of ["uncompressedSize", "compressedSize", "localHeaderOffset"]) {
        if (needs[field]) {
          if (pos + 8 > data.length) throw new Error(`truncated ZIP64 ${field}`);
          out[field] = asSafeNumber(data.readBigUInt64LE(pos), field);
          pos += 8;
        }
      }
      if (needs.diskStart) {
        if (pos + 4 > data.length) throw new Error("truncated ZIP64 diskStart");
        out.diskStart = data.readUInt32LE(pos);
      }
      return out;
    }
    cursor += 4 + size;
  }
  return {};
};

async function readCentralDirectory(reader) {
  const tailLength = Math.min(reader.officialBytes, 1_048_576);
  const tailStart = reader.officialBytes - tailLength;
  const tail = await reader.read(tailStart, reader.officialBytes - 1, "ZIP end records");
  const eocdAt = findLastSignature(tail, 0x06054b50);
  if (eocdAt < 0 || eocdAt + 22 > tail.length) throw new Error(`${reader.archiveLabel} EOCD not found`);
  const eocd = {
    disk: tail.readUInt16LE(eocdAt + 4),
    centralDirectoryDisk: tail.readUInt16LE(eocdAt + 6),
    entriesOnDisk: tail.readUInt16LE(eocdAt + 8),
    entries: tail.readUInt16LE(eocdAt + 10),
    centralDirectorySize: tail.readUInt32LE(eocdAt + 12),
    centralDirectoryOffset: tail.readUInt32LE(eocdAt + 16),
    commentLength: tail.readUInt16LE(eocdAt + 20)
  };
  const usesZip64 = eocd.entries === 0xffff || eocd.centralDirectorySize === 0xffffffff || eocd.centralDirectoryOffset === 0xffffffff;
  let directory = { ...eocd, usesZip64 };
  if (usesZip64) {
    const locatorAt = findLastSignature(tail.subarray(0, eocdAt), 0x07064b50);
    if (locatorAt < 0 || locatorAt + 20 > tail.length) throw new Error(`${reader.archiveLabel} ZIP64 locator not found`);
    const zip64Offset = asSafeNumber(tail.readBigUInt64LE(locatorAt + 8), "ZIP64 EOCD offset");
    const record = await reader.read(zip64Offset, zip64Offset + 55, "ZIP64 EOCD record");
    if (record.readUInt32LE(0) !== 0x06064b50) throw new Error(`${reader.archiveLabel} bad ZIP64 EOCD signature`);
    directory = {
      usesZip64: true,
      disk: record.readUInt32LE(16),
      centralDirectoryDisk: record.readUInt32LE(20),
      entriesOnDisk: asSafeNumber(record.readBigUInt64LE(24), "entriesOnDisk"),
      entries: asSafeNumber(record.readBigUInt64LE(32), "entries"),
      centralDirectorySize: asSafeNumber(record.readBigUInt64LE(40), "centralDirectorySize"),
      centralDirectoryOffset: asSafeNumber(record.readBigUInt64LE(48), "centralDirectoryOffset"),
      zip64Offset
    };
  }
  if (directory.disk !== 0 || directory.centralDirectoryDisk !== 0) throw new Error("multi-disk ZIP is unsupported");
  const centralBytes = await reader.read(
    directory.centralDirectoryOffset,
    directory.centralDirectoryOffset + directory.centralDirectorySize - 1,
    "ZIP central directory"
  );
  const entries = [];
  let cursor = 0;
  while (cursor < centralBytes.length) {
    if (cursor + 46 > centralBytes.length || centralBytes.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`${reader.archiveLabel} malformed central directory at ${cursor}`);
    }
    const flags = centralBytes.readUInt16LE(cursor + 8);
    const method = centralBytes.readUInt16LE(cursor + 10);
    const crc32 = centralBytes.readUInt32LE(cursor + 16);
    const compressed32 = centralBytes.readUInt32LE(cursor + 20);
    const uncompressed32 = centralBytes.readUInt32LE(cursor + 24);
    const nameLength = centralBytes.readUInt16LE(cursor + 28);
    const extraLength = centralBytes.readUInt16LE(cursor + 30);
    const commentLength = centralBytes.readUInt16LE(cursor + 32);
    const diskStart32 = centralBytes.readUInt16LE(cursor + 34);
    const localOffset32 = centralBytes.readUInt32LE(cursor + 42);
    const nameBytes = centralBytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const extra = centralBytes.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength);
    const zip64 = parseZip64Extra(extra, {
      uncompressedSize: uncompressed32 === 0xffffffff,
      compressedSize: compressed32 === 0xffffffff,
      localHeaderOffset: localOffset32 === 0xffffffff,
      diskStart: diskStart32 === 0xffff
    });
    entries.push({
      name: nameBytes.toString((flags & 0x0800) !== 0 ? "utf8" : "latin1"),
      flags,
      method,
      crc32: crc32.toString(16).padStart(8, "0"),
      compressedSize: zip64.compressedSize ?? compressed32,
      uncompressedSize: zip64.uncompressedSize ?? uncompressed32,
      localHeaderOffset: zip64.localHeaderOffset ?? localOffset32,
      diskStart: zip64.diskStart ?? diskStart32
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (entries.length !== directory.entries) throw new Error(`${reader.archiveLabel} parsed ${entries.length} entries != ${directory.entries}`);
  return { directory, centralDirectorySha256: sha256(centralBytes), entries };
}

async function readLocalHeader(reader, entry) {
  const fixed = await reader.read(entry.localHeaderOffset, entry.localHeaderOffset + 29, `${entry.name} local header`);
  if (fixed.readUInt32LE(0) !== 0x04034b50) throw new Error(`${entry.name} bad local header signature`);
  const flags = fixed.readUInt16LE(6);
  const method = fixed.readUInt16LE(8);
  const nameLength = fixed.readUInt16LE(26);
  const extraLength = fixed.readUInt16LE(28);
  const variable = await reader.read(
    entry.localHeaderOffset + 30,
    entry.localHeaderOffset + 30 + nameLength + extraLength - 1,
    `${entry.name} local name and extra`
  );
  const name = variable.subarray(0, nameLength).toString((flags & 0x0800) !== 0 ? "utf8" : "latin1");
  if (name !== entry.name || method !== entry.method || flags !== entry.flags) throw new Error(`${entry.name} local/central mismatch`);
  return { name, flags, method, dataOffset: entry.localHeaderOffset + 30 + nameLength + extraLength };
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();
const crc32Hex = (bytes) => {
  let crc = 0xffffffff;
  for (const value of bytes) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
};

async function extractCompleteMember(reader, entry) {
  const local = await readLocalHeader(reader, entry);
  const compressed = await reader.read(local.dataOffset, local.dataOffset + entry.compressedSize - 1, `${entry.name} complete compressed member`);
  let plain;
  if (entry.method === 0) plain = compressed;
  else if (entry.method === 8) plain = zlib.inflateRawSync(compressed);
  else throw new Error(`${entry.name} unsupported compression method ${entry.method}`);
  if (plain.length !== entry.uncompressedSize) throw new Error(`${entry.name} uncompressed size mismatch`);
  const actualCrc = crc32Hex(plain);
  if (actualCrc !== entry.crc32) throw new Error(`${entry.name} CRC mismatch ${actualCrc} != ${entry.crc32}`);
  return { bytes: plain, local };
}

const findEntry = (entries, expectedName) => {
  const exact = entries.find((entry) => entry.name === expectedName);
  if (exact) return exact;
  const byBase = entries.filter((entry) => path.posix.basename(entry.name) === expectedName);
  if (byBase.length !== 1) {
    const available = entries.map((entry) => entry.name).slice(0, 40);
    throw new Error(`expected one ${expectedName} member, found ${byBase.length}; available=${JSON.stringify(available)}`);
  }
  return byBase[0];
};

const parseXypt = (bytes) => {
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const preview = lines.slice(0, 8);
  const delimiter = preview.some((line) => line.includes(",")) ? "," : /\s+/;
  const tokenized = lines.map((line) => typeof delimiter === "string" ? line.split(delimiter).map((value) => value.trim()) : line.trim().split(delimiter));
  const normalizedToken = (value) => value.toLowerCase().replace(/[^a-z]/g, "");
  const isXyptHeader = (row) => {
    const normalized = row.map(normalizedToken);
    return normalized.length >= 4 && normalized[0].startsWith("x") && normalized[1].startsWith("y")
      && (normalized[2].startsWith("p") || normalized[2].includes("power"))
      && (normalized[3] === "t" || normalized[3].includes("trigger"));
  };
  const headerIndex = tokenized.findIndex((row) => row.some((value) => /trigger/i.test(value)) || isXyptHeader(row));
  if (headerIndex < 0) return { textSha256: sha256(bytes), bytes: bytes.length, lineCount: lines.length, preview, parseStatus: "no-trigger-header" };
  const header = tokenized[headerIndex];
  const triggerColumn = header.findIndex((value) => /trigger/i.test(value) || normalizedToken(value) === "t");
  const dataRows = tokenized.slice(headerIndex + 1).filter((row) => row.length > triggerColumn && Number.isFinite(Number(row[triggerColumn])));
  const nonzeroTriggerRows = dataRows.filter((row) => Number(row[triggerColumn]) !== 0);
  const triggerValueCounts = {};
  for (const row of dataRows) {
    const key = String(Number(row[triggerColumn]));
    triggerValueCounts[key] = (triggerValueCounts[key] || 0) + 1;
  }
  return {
    textSha256: sha256(bytes), bytes: bytes.length, lineCount: lines.length, preview,
    parseStatus: "parsed", delimiter: delimiter === "," ? "comma" : "whitespace", headerIndex, header,
    triggerColumn, numericDataRows: dataRows.length, nonzeroTriggerRows: nonzeroTriggerRows.length, triggerValueCounts,
    firstNonzeroDataIndex: dataRows.findIndex((row) => Number(row[triggerColumn]) !== 0),
    lastNonzeroDataIndex: dataRows.findLastIndex((row) => Number(row[triggerColumn]) !== 0)
  };
};

const scanAviHeader = (bytes) => {
  const fourcc = (offset) => bytes.toString("ascii", offset, offset + 4);
  if (bytes.length < 12 || fourcc(0) !== "RIFF" || fourcc(8) !== "AVI ") {
    return { parseStatus: "not-avi", prefixSha256: sha256(bytes), prefixBytes: bytes.length };
  }
  const counters = [];
  const chunkSignatures = {};
  for (let offset = 12; offset + 8 <= bytes.length; offset += 2) {
    const id = fourcc(offset);
    if (!/^[\x20-\x7e]{4}$/.test(id)) continue;
    if (["avih", "strh", "dmlh", "indx", "idx1", "movi", "LIST"].includes(id)) {
      chunkSignatures[id] = (chunkSignatures[id] || 0) + 1;
      if (id === "avih" && offset + 8 + 56 <= bytes.length) counters.push({ source: "avih.dwTotalFrames", value: bytes.readUInt32LE(offset + 8 + 16), offset });
      if (id === "strh" && offset + 8 + 56 <= bytes.length) {
        const streamType = fourcc(offset + 8);
        if (streamType === "vids") counters.push({ source: "strh.dwLength", value: bytes.readUInt32LE(offset + 8 + 32), offset });
      }
      if (id === "dmlh" && offset + 12 <= bytes.length) counters.push({ source: "dmlh.dwTotalFrames", value: bytes.readUInt32LE(offset + 8), offset });
    }
  }
  return { parseStatus: "parsed-prefix", prefixSha256: sha256(bytes), prefixBytes: bytes.length, riffDeclaredBytes: bytes.readUInt32LE(4) + 8, counters, chunkSignatures };
};

const summarizeEntry = (entry) => ({
  name: entry.name, method: entry.method, flags: entry.flags, crc32: entry.crc32,
  compressedSize: entry.compressedSize, uncompressedSize: entry.uncompressedSize, localHeaderOffset: entry.localHeaderOffset
});

const sevenZipCandidates = [
  "C:\\Program Files\\AMD\\CIM\\Bin64\\7z.exe",
  "C:\\Program Files\\NVIDIA Corporation\\NVIDIA App\\7z.exe",
  "C:\\Program Files (x86)\\AllDup\\dep\\7z.exe"
];

const decodeTruncatedDeflate64 = (archiveBytes, label) => {
  const sevenZip = sevenZipCandidates.find((candidate) => fs.existsSync(candidate));
  if (!sevenZip) throw new Error("No pinned-capability 7z.exe was found for Deflate64 prefix decoding");
  const cacheDirectory = path.join(root, ".cache", "rc43-x16", "prefix-decode");
  fs.mkdirSync(cacheDirectory, { recursive: true });
  const archivePath = path.join(cacheDirectory, `${label}.partial.zip`);
  fs.writeFileSync(archivePath, archiveBytes);
  const decoded = spawnSync(sevenZip, ["x", "-so", "-bso0", "-bsp0", "-bse2", archivePath], {
    encoding: null, windowsHide: true, maxBuffer: 512 * 1024 * 1024
  });
  const stdout = Buffer.from(decoded.stdout || []);
  const stderr = Buffer.from(decoded.stderr || []).toString("utf8");
  if (decoded.status !== 2 || !/Unexpected end of archive/i.test(stderr)) {
    throw new Error(`${label} truncated decode did not fail in the preregistered way: status=${decoded.status}, stderr=${stderr.slice(-500)}`);
  }
  return {
    decoderPath: sevenZip, exitCode: decoded.status, stderrTail: stderr.slice(-300),
    archiveBytes: archiveBytes.length, archivePrefixSha256: sha256(archiveBytes),
    decodedBytes: stdout.length, decodedSha256: sha256(stdout), bytes: stdout
  };
};

async function runPrefixAudit() {
  if (layer !== 1) throw new Error("--prefix-only is authorized only for development layer 1 before holdout sealing");
  const inventoryPath = path.join(root, "research", "reproducibility", "rc43-x16-layer-0001-inventory.json");
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  if (inventory.selected.xypt.method !== 8 || inventory.selected.avi.method !== 9) throw new Error("sealed inventory methods changed");
  const xyptReader = new RangeReader("https://data.nist.gov/od/ds/ark:/88434/mds2-2309/XYPT_L001-025.zip", 159_164_372, "XYPT_L001-025.zip");
  const xyptDirectory = await readCentralDirectory(xyptReader);
  if (xyptDirectory.centralDirectorySha256 !== inventory.directories.xypt.centralDirectorySha256) throw new Error("XYPT central directory changed after inventory seal");
  const xyptEntry = findEntry(xyptDirectory.entries, "XYPT_L0001.csv");
  const xyptExtract = await extractCompleteMember(xyptReader, xyptEntry);
  const xypt = parseXypt(xyptExtract.bytes);

  const aviReader = new RangeReader("https://data.nist.gov/od/ds/ark:/88434/mds2-2309/MPMcameraAVI_L001-025.zip", 5_037_696_861, "MPMcameraAVI_L001-025.zip");
  const prefixABytes = await aviReader.read(0, 4_194_303, "L0001 AVI archive prefix A");
  const prefixBBytes = await aviReader.read(0, 8_388_607, "L0001 AVI archive prefix B");
  const decodedA = decodeTruncatedDeflate64(prefixABytes, "l0001-prefix-a");
  const decodedB = decodeTruncatedDeflate64(prefixBBytes, "l0001-prefix-b");
  const discardBytes = 65_536;
  if (decodedA.bytes.length <= discardBytes || decodedB.bytes.length <= discardBytes) throw new Error("Deflate64 prefix emitted too few bytes for the fixed tail discard");
  const retainedA = decodedA.bytes.subarray(0, decodedA.bytes.length - discardBytes);
  const retainedB = decodedB.bytes.subarray(0, decodedB.bytes.length - discardBytes);
  if (retainedB.length < retainedA.length || !retainedB.subarray(0, retainedA.length).equals(retainedA)) {
    throw new Error("nested Deflate64 retained prefixes disagree");
  }
  const avi = scanAviHeader(retainedA);
  const distinctFrameCounts = [...new Set(avi.counters.map((counter) => counter.value))];
  const triggerCount = xypt.parseStatus === "parsed" ? xypt.nonzeroTriggerRows : null;
  const cameraMask2Rows = xypt.parseStatus === "parsed" ? xypt.triggerValueCounts?.["2"] ?? null : null;
  const frameCount = distinctFrameCounts.length === 1 ? distinctFrameCounts[0] : null;
  const triggerMinusFrame = triggerCount !== null && frameCount !== null ? triggerCount - frameCount : null;
  const thisExecutionBytes = xyptReader.transferredBytes + aviReader.transferredBytes;
  const conservativePriorUpperBound = 16_232_719;
  const cumulativeUpperBound = conservativePriorUpperBound + thisExecutionBytes;
  if (cumulativeUpperBound > maxBytes) throw new Error(`cumulative transfer upper bound ${cumulativeUpperBound} exceeds ${maxBytes}`);
  const countDirection = triggerMinusFrame === null ? "inconclusive" : triggerMinusFrame > 0 ? "fewer-frames-than-triggers" : triggerMinusFrame < 0 ? "more-frames-than-triggers" : "equal";
  const result = {
    resultId: "RC43-X16-L0001-PREFIX-AUDIT-0.1", cycleId: "RC-2026-43", createdOn: new Date().toISOString(),
    layer: 1, role: "development", precommit: "research/reproducibility/rc43-x16-trigger-frame-precommit.json",
    amendments: ["rc43-x16-amendment-01.json", "rc43-x16-amendment-02.json", "rc43-x16-amendment-03.json"],
    xypt: { ...xypt, selected: summarizeEntry(xyptEntry), cameraMask2Rows },
    avi: {
      ...avi, selected: inventory.selected.avi, discardBytes,
      prefixA: { ...decodedA, bytes: undefined }, prefixB: { ...decodedB, bytes: undefined },
      retainedABytes: retainedA.length, retainedASha256: sha256(retainedA),
      retainedBBytes: retainedB.length, nestedRetainedPrefixAgreement: true
    },
    adjudication: {
      triggerCount, cameraMask2Rows, frameCount, triggerMinusFrame, countDirection,
      nativeFrameCountersAgree: distinctFrameCounts.length === 1 && distinctFrameCounts.length > 0,
      publicHeaderExposesPerFrameSlotKey: false, tailOnlyLossEstablished: false, exactNullLedger: false,
      qualification: triggerCount !== null && frameCount !== null && distinctFrameCounts.length === 1
        ? "aggregate-count-reproduced-slot-placement-not-identifiable" : "inconclusive-native-counts",
      hypotheses: {
        H1: triggerMinusFrame === null ? "inconclusive" : triggerMinusFrame < 0 ? "supported-on-development" : "rejected-on-development",
        H2: triggerMinusFrame === null ? "inconclusive" : triggerMinusFrame >= 0 && triggerMinusFrame <= 20 ? "count-bound-supported-tail-placement-not-established" : "rejected-on-development",
        H3: "rejected-on-development-header-has-no-per-frame-slot-key",
        H4: "supported-for-stable-header-prefix-within-cumulative-budget",
        H5: "untested-holdout-sealed"
      }
    },
    transfer: {
      maximumCumulativeBytes: maxBytes, conservativePriorUpperBound, thisExecutionBytes, cumulativeUpperBound,
      remainingConservativeBytes: maxBytes - cumulativeUpperBound,
      receipts: { xypt: xyptReader.receipts, avi: aviReader.receipts }
    },
    boundaries: [
      "The complete AVI and TIFF members were not downloaded.",
      "Aggregate AVI counters do not locate a dropped frame among nonzero XYPT trigger slots.",
      "No image-content alignment, sensor-domain independence, process-temperature accuracy, or physical-event truth is claimed."
    ]
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (shouldWrite) {
    const output = path.join(root, "research", "reproducibility", "rc43-x16-layer-0001-result.json");
    fs.writeFileSync(output, json, "utf8");
    console.log(`Wrote ${path.relative(root, output)}`);
  }
  console.log(JSON.stringify({
    triggerCount, cameraMask2Rows, frameCounters: avi.counters, triggerMinusFrame, countDirection,
    qualification: result.adjudication.qualification, transfer: result.transfer
  }, null, 2));
}

async function main() {
  const archives = {
    xypt: new RangeReader("https://data.nist.gov/od/ds/ark:/88434/mds2-2309/XYPT_L001-025.zip", 159_164_372, "XYPT_L001-025.zip"),
    avi: new RangeReader("https://data.nist.gov/od/ds/ark:/88434/mds2-2309/MPMcameraAVI_L001-025.zip", 5_037_696_861, "MPMcameraAVI_L001-025.zip"),
    tiff: new RangeReader("https://data.nist.gov/od/ds/ark:/88434/mds2-2309/MPMcameraTIF_L001-025.zip", 5_740_968_223, "MPMcameraTIF_L001-025.zip")
  };
  const [xyptDirectory, aviDirectory, tiffDirectory] = await Promise.all([
    readCentralDirectory(archives.xypt), readCentralDirectory(archives.avi), readCentralDirectory(archives.tiff)
  ]);
  const xyptEntry = findEntry(xyptDirectory.entries, `XYPT_L${pad4(layer)}.csv`);
  const aviEntry = findEntry(aviDirectory.entries, `MPMcamera_L${pad4(layer)}.avi`);
  const tiffEntry = findEntry(tiffDirectory.entries, `MPMcamera_L${pad4(layer)}.tif`);
  if (inventoryOnly) {
    const result = {
      inventoryId: `RC43-X16-L${pad4(layer)}-INVENTORY-0.1`, cycleId: "RC-2026-43", createdOn: new Date().toISOString(),
      layer, role: layer === 1 ? "development" : layer === 2 ? "holdout" : "outside-precommit",
      selected: { xypt: summarizeEntry(xyptEntry), avi: summarizeEntry(aviEntry), tiff: summarizeEntry(tiffEntry) },
      directories: {
        xypt: { ...xyptDirectory.directory, centralDirectorySha256: xyptDirectory.centralDirectorySha256, entryCount: xyptDirectory.entries.length },
        avi: { ...aviDirectory.directory, centralDirectorySha256: aviDirectory.centralDirectorySha256, entryCount: aviDirectory.entries.length },
        tiff: { ...tiffDirectory.directory, centralDirectorySha256: tiffDirectory.centralDirectorySha256, entryCount: tiffDirectory.entries.length }
      },
      transfer: {
        maximumBytesPerLayer: maxBytes,
        thisExecutionBytes: archives.xypt.transferredBytes + archives.avi.transferredBytes + archives.tiff.transferredBytes,
        receipts: { xypt: archives.xypt.receipts, avi: archives.avi.receipts, tiff: archives.tiff.receipts }
      },
      boundary: "No local member header or member body was requested by inventory-only execution."
    };
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (shouldWrite) {
      const output = path.join(root, "research", "reproducibility", `rc43-x16-layer-${pad4(layer)}-inventory.json`);
      fs.writeFileSync(output, json, "utf8");
      console.log(`Wrote ${path.relative(root, output)}`);
    }
    console.log(json);
    return;
  }
  const xyptExtract = await extractCompleteMember(archives.xypt, xyptEntry);
  const aviLocal = await readLocalHeader(archives.avi, aviEntry);
  let aviPrefix;
  if (aviEntry.method === 0) {
    const prefixLength = Math.min(8_388_608, aviEntry.compressedSize);
    aviPrefix = await archives.avi.read(aviLocal.dataOffset, aviLocal.dataOffset + prefixLength - 1, `${aviEntry.name} stored prefix`);
  } else if (aviEntry.compressedSize + archives.avi.transferredBytes <= maxBytes) {
    aviPrefix = (await extractCompleteMember(archives.avi, aviEntry)).bytes;
  } else {
    throw new Error(`${aviEntry.name} method ${aviEntry.method} requires ${aviEntry.compressedSize} bytes and exceeds budget`);
  }
  const xypt = parseXypt(xyptExtract.bytes);
  const avi = scanAviHeader(aviPrefix);
  const distinctFrameCounts = [...new Set(avi.counters.map((counter) => counter.value))];
  const triggerCount = xypt.parseStatus === "parsed" ? xypt.nonzeroTriggerRows : null;
  const frameCount = distinctFrameCounts.length === 1 ? distinctFrameCounts[0] : null;
  const result = {
    resultId: `RC43-X16-L${pad4(layer)}-RANGE-AUDIT-0.1`, cycleId: "RC-2026-43", createdOn: new Date().toISOString(),
    layer, role: layer === 1 ? "development" : layer === 2 ? "holdout" : "outside-precommit",
    precommit: "research/reproducibility/rc43-x16-trigger-frame-precommit.json",
    directories: {
      xypt: { ...xyptDirectory.directory, centralDirectorySha256: xyptDirectory.centralDirectorySha256, entryCount: xyptDirectory.entries.length, selected: summarizeEntry(xyptEntry) },
      avi: { ...aviDirectory.directory, centralDirectorySha256: aviDirectory.centralDirectorySha256, entryCount: aviDirectory.entries.length, selected: summarizeEntry(aviEntry) }
    },
    xypt, avi,
    adjudication: {
      triggerCount, frameCount,
      triggerMinusFrame: triggerCount !== null && frameCount !== null ? triggerCount - frameCount : null,
      nativeFrameCountersAgree: distinctFrameCounts.length === 1 && distinctFrameCounts.length > 0,
      hasDocumentedPerFrameSlotKey: false,
      exactNullLedger: false,
      qualification: triggerCount !== null && frameCount !== null && distinctFrameCounts.length === 1 ? "count-comparison-only-slot-placement-not-identifiable" : "inconclusive-native-counts"
    },
    transfer: {
      maximumBytesPerLayer: maxBytes,
      xyptBytes: archives.xypt.transferredBytes,
      aviBytes: archives.avi.transferredBytes,
      totalBytes: archives.xypt.transferredBytes + archives.avi.transferredBytes,
      withinPerArchiveBudget: archives.xypt.transferredBytes <= maxBytes && archives.avi.transferredBytes <= maxBytes,
      receipts: { xypt: archives.xypt.receipts, avi: archives.avi.receipts }
    },
    caveats: [
      "Container-native frame totals establish only a count, not which nonzero XYPT trigger lacks a frame.",
      "The absence of a documented slot key in the reviewed header is not a claim that image-content alignment can never narrow placements.",
      "No sensor-domain independence, temperature accuracy, or physical-event truth is inferred."
    ]
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (shouldWrite) {
    const output = path.join(root, "research", "reproducibility", `rc43-x16-layer-${pad4(layer)}-result.json`);
    fs.writeFileSync(output, json, "utf8");
    console.log(`Wrote ${path.relative(root, output)}`);
  }
  console.log(JSON.stringify({
    layer, xyptMember: summarizeEntry(xyptEntry), aviMember: summarizeEntry(aviEntry),
    triggerCount, frameCounters: avi.counters, triggerMinusFrame: result.adjudication.triggerMinusFrame,
    qualification: result.adjudication.qualification, transfer: result.transfer
  }, null, 2));
}

if (prefixOnly) await runPrefixAudit();
else await main();
