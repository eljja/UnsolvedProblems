import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const avi = path.join(root, ".cache", "rc44-x16", "l0002", "extracted", "MPMcamera_L0002.avi");
const ffmpeg = path.join(root, ".cache", "rc44-python", "imageio_ffmpeg", "binaries", "ffmpeg-win-x86_64-v7.1.exe");
const cacheDir = path.join(root, ".cache", "rc47-x16", "l0002");
const raw = path.join(cacheDir, "frames-32x32-gray.raw");
const manifestPath = path.join(root, "research", "reproducibility", "rc47-l0002-decode.json");
const expected = {
  aviBytes: 172_605_872,
  aviSha256: "54bc90814acf15304257ee4c9c56f029d50999ab38b9c27455137a12f884b53a",
  frames: 95_504,
  width: 32,
  height: 32,
  rawBytes: 95_504 * 32 * 32
};

const sha256File = async file => {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};

if (!fs.existsSync(avi)) throw new Error(`missing authenticated RC44 AVI: ${avi}`);
if (!fs.existsSync(ffmpeg)) throw new Error(`missing frozen FFmpeg: ${ffmpeg}`);
if (fs.statSync(avi).size !== expected.aviBytes) throw new Error("AVI byte count changed");
const aviSha256 = await sha256File(avi);
if (aviSha256 !== expected.aviSha256) throw new Error(`AVI hash changed: ${aviSha256}`);

fs.mkdirSync(cacheDir, { recursive: true });
let reused = false;
if (fs.existsSync(raw) && fs.statSync(raw).size === expected.rawBytes) {
  reused = true;
} else {
  const partial = `${raw}.part`;
  if (fs.existsSync(partial)) fs.rmSync(partial);
  const run = spawnSync(ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", avi,
    "-vf", "scale=32:32:flags=area,format=gray",
    "-frames:v", String(expected.frames), "-f", "rawvideo", partial
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`FFmpeg failed (${run.status}): ${run.stderr}`);
  if (!fs.existsSync(partial) || fs.statSync(partial).size !== expected.rawBytes) {
    throw new Error(`raw byte count ${fs.existsSync(partial) ? fs.statSync(partial).size : 0} != ${expected.rawBytes}`);
  }
  fs.renameSync(partial, raw);
}

const rawBytes = fs.statSync(raw).size;
if (rawBytes !== expected.rawBytes) throw new Error(`raw byte count ${rawBytes} != ${expected.rawBytes}`);
const manifest = {
  decodeId: "RC47-X16-L0002-DECODE-0.1",
  cycleId: "RC-2026-47",
  createdOn: new Date().toISOString(),
  preregistration: "research/reproducibility/rc47-self-deletion-precommit.json",
  source: {
    relativeCachePath: path.relative(root, avi).replaceAll("\\", "/"),
    bytes: fs.statSync(avi).size,
    sha256: aviSha256,
    publicRecord: "https://data.nist.gov/od/id/mds2-2309",
    acquisitionReceipt: "research/reproducibility/rc44-x16-layer-0002-acquisition.json"
  },
  decoder: {
    relativeCachePath: path.relative(root, ffmpeg).replaceAll("\\", "/"),
    bytes: fs.statSync(ffmpeg).size,
    sha256: await sha256File(ffmpeg),
    operation: "scale=32:32:flags=area,format=gray; rawvideo; first 95,504 frames"
  },
  output: {
    relativeCachePath: path.relative(root, raw).replaceAll("\\", "/"),
    reusedAuthenticatedDerivedCache: reused,
    frames: expected.frames,
    width: expected.width,
    height: expected.height,
    bytes: rawBytes,
    sha256: await sha256File(raw)
  },
  boundary: "This is a deterministic derived representation of the already authenticated L0002 development AVI. It contains no L0001 or independent-layer pixel."
};

if (process.argv.includes("--write")) fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
