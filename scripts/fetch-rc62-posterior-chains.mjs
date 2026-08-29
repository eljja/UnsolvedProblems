#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = path.join(ROOT, "research", "reproducibility", "rc62-posterior-analysis-spec.json");
const MANIFEST_PATH = path.join(ROOT, "research", "reproducibility", "rc62-posterior-chain-manifest.json");
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--download-dir");
const downloadDir = outputIndex >= 0 ? path.resolve(args[outputIndex + 1]) : null;

const sha256Buffer = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();

async function checkedFetch(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "User-Agent": "UnsolvedProblems-RC62", ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
}

const checksumResponse = await checkedFetch(spec.officialCatalog.checksumManifest);
const checksumBytes = Buffer.from(await checksumResponse.arrayBuffer());
if (sha256Buffer(checksumBytes) !== spec.officialCatalog.checksumManifestSha256) throw new Error("official checksum manifest hash changed");
const checksumLines = checksumBytes.toString("utf8").trim().split(/\r?\n/);
const checksumByPath = new Map(checksumLines.map((line) => {
  const match = line.match(/^([0-9a-f]{64})\s+(.+)$/);
  return match ? [match[2], match[1].toUpperCase()] : ["", ""];
}));

const files = [];
for (const group of spec.eligibleGroups) {
  for (let chain = 1; chain <= 4; chain += 1) {
    const relativePath = `cobaya/base_w_wa/${group.path}chain.${chain}.txt`;
    const expectedSha256 = checksumByPath.get(relativePath);
    if (!expectedSha256) throw new Error(`missing official checksum for ${relativePath}`);
    const url = `${spec.officialCatalog.root}${group.path}chain.${chain}.txt`;
    const head = await checkedFetch(url, { method: "HEAD" });
    files.push({
      source: "DESI DR2 official catalog",
      groupId: group.id,
      chain,
      relativePath,
      url,
      bytes: Number(head.headers.get("content-length")),
      lastModified: head.headers.get("last-modified"),
      expectedSha256
    });
  }
}

const githubApi = `https://api.github.com/repos/des-science/DES-SN5YR/contents/${spec.externalStateCheck.path}?ref=${spec.externalStateCheck.commit}`;
const githubItem = await (await checkedFetch(githubApi)).json();
const dovekieUrl = `https://raw.githubusercontent.com/des-science/DES-SN5YR/${spec.externalStateCheck.commit}/${spec.externalStateCheck.path}`;
files.push({
  source: "DES Dovekie official repository",
  groupId: spec.externalStateCheck.id,
  chain: 1,
  relativePath: spec.externalStateCheck.path,
  url: dovekieUrl,
  bytes: Number(githubItem.size),
  lastModified: null,
  gitCommit: spec.externalStateCheck.commit,
  expectedGitBlobSha: githubItem.sha
});

const manifest = {
  cycleId: spec.cycleId,
  frozenOn: spec.frozenOn,
  generatedFromPredeclaredSpec: "research/reproducibility/rc62-posterior-analysis-spec.json",
  checksumManifestSha256: spec.officialCatalog.checksumManifestSha256,
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files
};

if (downloadDir) {
  fs.mkdirSync(downloadDir, { recursive: true });
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const file = files[next++];
      const filename = `${file.groupId}__chain-${file.chain}.txt`;
      const destination = path.join(downloadDir, filename);
      if (!fs.existsSync(destination) || fs.statSync(destination).size !== file.bytes) {
        const response = await checkedFetch(file.url);
        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
      }
      if (fs.statSync(destination).size !== file.bytes) throw new Error(`size mismatch: ${filename}`);
      file.localFilename = filename;
      file.observedSha256 = sha256File(destination);
      if (file.expectedSha256 && file.observedSha256 !== file.expectedSha256) throw new Error(`SHA-256 mismatch: ${filename}`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()));
  manifest.downloadAudit = { directoryArgument: downloadDir, verifiedOn: new Date().toISOString(), allOfficialSha256Matched: true };
}

fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ manifest: path.relative(ROOT, MANIFEST_PATH), fileCount: files.length, totalBytes: manifest.totalBytes, downloaded: Boolean(downloadDir) }, null, 2));
