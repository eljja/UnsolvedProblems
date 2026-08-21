import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, ".cache", "rc46-x16");
const output = path.join(cacheDir, "XYPT_L001-025.zip");
const partial = `${output}.part`;
const manifestPath = path.join(root, "research", "reproducibility", "rc46-xypt-acquisition.json");
const expected = {
  url: "https://data.nist.gov/od/ds/ark:/88434/mds2-2309/XYPT_L001-025.zip",
  mementoUrl: "https://web.archive.org/web/20210507202033id_/https://data.nist.gov/od/ds/ark:/88434/mds2-2309/XYPT_L001-025.zip",
  mementoDatetime: "2021-05-07T20:20:33Z",
  bytes: 159_164_372,
  sha256: "7b2b863c843aeabe19f308a5886d57ae241cd386f38c95a7e7ce01e9bc34d007",
  centralDirectorySha256: "0967318be4ea6413c605bf0ca55e810952a280b07b11407262a2a73b69b92a5d"
};

const officialSessionCookie = async () => {
  const response = await fetch(expected.url, { method: "HEAD" });
  if (!response.ok) throw new Error(`NIST session HEAD ${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (length !== expected.bytes) throw new Error(`NIST object length ${length} != ${expected.bytes}`);
  const setCookie = response.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";", 1)[0];
  if (!cookie) throw new Error("NIST session cookie missing");
  return cookie;
};

const sha256File = async file => {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};

const inspectDirectory = file => {
  const data = fs.readFileSync(file);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65_557); i -= 1) {
    if (data.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("EOCD not found");
  const entryCount = data.readUInt16LE(eocd + 10);
  const size = data.readUInt32LE(eocd + 12);
  const offset = data.readUInt32LE(eocd + 16);
  const central = data.subarray(offset, offset + size);
  if (crypto.createHash("sha256").update(central).digest("hex") !== expected.centralDirectorySha256) throw new Error("central directory hash mismatch");
  const names = [];
  for (let cursor = 0; cursor < central.length;) {
    if (central.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`bad central entry at ${cursor}`);
    const nameLength = central.readUInt16LE(cursor + 28);
    const extraLength = central.readUInt16LE(cursor + 30);
    const commentLength = central.readUInt16LE(cursor + 32);
    names.push(central.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return { entryCount, centralDirectoryBytes: size, centralDirectoryOffset: offset, names };
};

fs.mkdirSync(cacheDir, { recursive: true });
let reused = false;
let chargedNetworkBytes = 0;
if (fs.existsSync(output) && fs.statSync(output).size === expected.bytes && await sha256File(output) === expected.sha256) {
  reused = true;
} else {
  const chunkSize = 1 * 1024 * 1024;
  const observedPartialBytes = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
  const resumeAt = Math.floor(observedPartialBytes / chunkSize) * chunkSize;
  if (fs.existsSync(partial)) fs.truncateSync(partial, resumeAt);
  const handle = await fs.promises.open(partial, fs.existsSync(partial) ? "r+" : "w");
  let bytes = resumeAt;
  chargedNetworkBytes = observedPartialBytes;
  const cookie = await officialSessionCookie();
  try {
    for (let start = resumeAt; start < expected.bytes; start += chunkSize) {
      const end = Math.min(expected.bytes - 1, start + chunkSize - 1);
      let completed = false;
      for (let attempt = 1; attempt <= 3 && !completed; attempt += 1) {
        let position = start;
        try {
          const response = await fetch(expected.url, { headers: { Range: `bytes=${start}-${end}`, "Accept-Encoding": "identity", Cookie: cookie } });
          if (response.status !== 206 || !response.body) throw new Error(`NIST range response ${response.status}`);
          const contentRange = response.headers.get("content-range");
          if (contentRange !== `bytes ${start}-${end}/${expected.bytes}`) throw new Error(`unexpected Content-Range ${contentRange}`);
          for await (const chunk of response.body) {
            chargedNetworkBytes += chunk.length;
            if (chargedNetworkBytes > 260_000_000) throw new Error("amended network budget exceeded");
            await handle.write(chunk, 0, chunk.length, position);
            position += chunk.length;
          }
          if (position !== end + 1) throw new Error(`short range at ${start}-${end}`);
          completed = true;
        } catch (error) {
          await handle.truncate(start);
          if (attempt === 3 || String(error.message).includes("budget exceeded")) throw error;
          process.stdout.write(`retry ${attempt} for ${start}-${end}: ${error.message}\n`);
          await new Promise(resolve => setTimeout(resolve, attempt * 5_000));
        }
      }
      bytes = end + 1;
      process.stdout.write(`downloaded ${end + 1}/${expected.bytes}\n`);
      await new Promise(resolve => setTimeout(resolve, 750));
    }
  } finally {
    await handle.close();
  }
  if (bytes !== expected.bytes) throw new Error(`byte count ${bytes} != ${expected.bytes}`);
  const digest = await sha256File(partial);
  if (digest !== expected.sha256) throw new Error(`archive hash ${digest} != ${expected.sha256}`);
  fs.renameSync(partial, output);
}

const directory = inspectDirectory(output);
if (directory.entryCount !== 25 || directory.names.length !== 25) throw new Error("expected exactly 25 members");
for (let layer = 1; layer <= 25; layer += 1) {
  const expectedName = `XYPT_L${String(layer).padStart(4, "0")}.csv`;
  if (!directory.names.includes(expectedName)) throw new Error(`missing ${expectedName}`);
}

const manifest = {
  acquisitionId: "RC46-X16-XYPT-ACQUISITION-0.1",
  cycleId: "RC-2026-46",
  createdOn: new Date().toISOString(),
  source: expected,
  observed: {
    bytes: fs.statSync(output).size,
    sha256: await sha256File(output),
    ...directory
  },
  transfer: { reusedAuthenticatedCache: reused, responseBodyBytesObservedByCompletingProcess: reused ? 0 : chargedNetworkBytes, conservativeCrossProcessUpperBoundBytes: reused ? 0 : 260000000, completedArchiveBytes: expected.bytes },
  provenance: { publisherUrl: expected.url, retrievalUrl: expected.url, sessionRule: "One successful HEAD request established the Cloudflare session used for every subsequent byte range.", identityRule: "The completed object is accepted only after its byte count, full SHA-256, central-directory SHA-256, and all member CRC values match the NIST identities sealed before analysis." },
  localPathExcludedFromGit: path.relative(root, output).replaceAll("\\", "/"),
  boundary: "Only the public 159 MB XYPT command archive was acquired; no AVI, TIFF, layer-image, or natural-pixel member was requested."
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, reused, bytes: manifest.observed.bytes, sha256: manifest.observed.sha256, entries: directory.entryCount }, null, 2));
