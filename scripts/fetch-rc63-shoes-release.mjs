#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = path.join(ROOT, "research", "reproducibility", "rc63-shoes-release-audit-spec.json");
const MANIFEST_PATH = path.join(ROOT, "research", "reproducibility", "rc63-shoes-release-manifest.json");
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--download-dir");
const downloadDir = outputIndex >= 0 ? path.resolve(args[outputIndex + 1]) : null;

const blobId = (buffer) => crypto.createHash("sha1").update(`blob ${buffer.length}\0`).update(buffer).digest("hex");

async function checkedFetch(url) {
  const response = await fetch(url, { headers: { "User-Agent": "UnsolvedProblems-RC63" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
}

const files = [];
if (downloadDir) fs.mkdirSync(downloadDir, { recursive: true });
for (const item of spec.files) {
  const filename = path.basename(item.path);
  const rawUrl = `https://raw.githubusercontent.com/PantheonPlusSH0ES/DataRelease/${spec.officialRelease.commit}/${item.path}`;
  let url = rawUrl;
  let response = await checkedFetch(url);
  let buffer = Buffer.from(await response.arrayBuffer());
  const pointer = buffer.toString("utf8").match(/^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([0-9a-f]{64})\nsize (\d+)\n$/);
  let lfs = null;
  if (pointer) {
    url = `https://media.githubusercontent.com/media/PantheonPlusSH0ES/DataRelease/${spec.officialRelease.commit}/${item.path}`;
    response = await checkedFetch(url);
    buffer = Buffer.from(await response.arrayBuffer());
    lfs = { oidSha256: pointer[1].toUpperCase(), declaredBytes: Number(pointer[2]), pointerGitBlobSha: blobId(Buffer.from(pointer[0])) };
    if (buffer.length !== lfs.declaredBytes) throw new Error(`Git LFS size mismatch for ${item.path}`);
    const observed = crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();
    if (observed !== lfs.oidSha256) throw new Error(`Git LFS SHA-256 mismatch for ${item.path}`);
  }
  const destination = downloadDir ? path.join(downloadDir, filename) : null;
  if (destination) {
    fs.writeFileSync(destination, buffer);
  }
  const observedBytes = buffer.length;
  files.push({
    ...item,
    filename,
    url,
    bytes: observedBytes,
    gitBlobSha: lfs ? lfs.pointerGitBlobSha : blobId(buffer),
    sha256: crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase(),
    lfs,
  });
}

const manifest = {
  cycleId: spec.cycleId,
  frozenOn: spec.frozenOn,
  repository: spec.officialRelease.repository,
  commit: spec.officialRelease.commit,
  generatedFromPredeclaredSpec: "research/reproducibility/rc63-shoes-release-audit-spec.json",
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  downloaded: Boolean(downloadDir),
  files,
};
fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ manifest: path.relative(ROOT, MANIFEST_PATH), fileCount: files.length, totalBytes: manifest.totalBytes }, null, 2));
