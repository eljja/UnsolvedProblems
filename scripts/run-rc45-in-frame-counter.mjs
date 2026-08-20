import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const avi = path.join(root, ".cache", "rc44-x16", "l0002", "extracted", "MPMcamera_L0002.avi");
const ffmpeg = path.join(root, ".cache", "rc44-python", "imageio_ffmpeg", "binaries", "ffmpeg-win-x86_64-v7.1.exe");
const WIDTH = 120, HEIGHT = 120, PLANE_BYTES = WIDTH * HEIGHT, FRAME_BYTES = PLANE_BYTES * 3, EXPECTED_FRAMES = 95_504;
const boundaries = [
  ["top-left", [0, 1, 2, 3]],
  ["top-right", [116, 117, 118, 119]],
  ["bottom-left", [119 * WIDTH, 119 * WIDTH + 1, 119 * WIDTH + 2, 119 * WIDTH + 3]],
  ["bottom-right", [119 * WIDTH + 116, 119 * WIDTH + 117, 119 * WIDTH + 118, 119 * WIDTH + 119]]
];
const planes = [["g", 0], ["b", PLANE_BYTES], ["r", 2 * PLANE_BYTES]];
const shaFile = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const candidateId = (boundary, plane, byteOrder) => `${boundary}:${plane}:${byteOrder}`;

async function extract() {
  if (shaFile(avi) !== "54bc90814acf15304257ee4c9c56f029d50999ab38b9c27455137a12f884b53a" || shaFile(ffmpeg) !== "2ce797a0f88d7f067180338fb227f7b1928ea727bd9a4d7a1d022f7c52af71a3") throw new Error("RC45 hash-bound input or decoder changed");
  const command = ["-v", "error", "-i", avi, "-map", "0:v:0", "-fps_mode", "passthrough", "-pix_fmt", "gbrp", "-f", "rawvideo", "pipe:1"];
  const child = spawn(ffmpeg, command, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const chunks = [];
  const series = new Map();
  for (const [boundary] of boundaries) for (const [plane] of planes) for (const order of ["little", "big"]) series.set(candidateId(boundary, plane, order), []);
  const recordHash = crypto.createHash("sha256");
  let buffered = Buffer.alloc(0), frames = 0, stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk.toString("utf8"); });
  for await (const chunk of child.stdout) {
    buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk;
    while (buffered.length >= FRAME_BYTES) {
      const frame = buffered.subarray(0, FRAME_BYTES);
      buffered = buffered.subarray(FRAME_BYTES);
      const record = Buffer.allocUnsafe(48);
      let cursor = 0;
      for (const [, positions] of boundaries) for (const [, offset] of planes) for (const position of positions) record[cursor++] = frame[offset + position];
      recordHash.update(record);
      cursor = 0;
      for (const [boundary] of boundaries) for (const [plane] of planes) {
        const pixels = record.subarray(cursor, cursor + 4); cursor += 4;
        series.get(candidateId(boundary, plane, "little")).push(pixels.readUInt32LE(0));
        series.get(candidateId(boundary, plane, "big")).push(pixels.readUInt32BE(0));
      }
      frames += 1;
    }
  }
  const exitCode = await new Promise(resolve => child.on("close", resolve));
  if (exitCode !== 0 || buffered.length) throw new Error(`FFmpeg failed or ended mid-frame: ${exitCode}, ${buffered.length}, ${stderr.slice(-2000)}`);
  if (frames !== EXPECTED_FRAMES) throw new Error(`decoded ${frames} frames, expected ${EXPECTED_FRAMES}`);
  return { command: [ffmpeg, ...command], frames, recordHash: recordHash.digest("hex"), series };
}

function summarize(values) {
  let unit = 0, zero = 0, reverse = 0, greater = 0, maximumForward = 0, totalMissing = 0n;
  const valueHash = crypto.createHash("sha256");
  const packed = Buffer.allocUnsafe(4);
  for (let index = 0; index < values.length; index += 1) {
    packed.writeUInt32LE(values[index] >>> 0, 0); valueHash.update(packed);
    if (!index) continue;
    const difference = (values[index] - values[index - 1]) >>> 0;
    if (difference === 1) unit += 1;
    if (difference === 0) zero += 1;
    else if (difference > 0x7fffffff) reverse += 1;
    else if (difference > 1) { greater += 1; maximumForward = Math.max(maximumForward, difference); totalMissing += BigInt(difference - 1); }
  }
  return {
    firstValue: values[0], lastValue: values.at(-1), unitStepCount: unit, unitStepFraction: unit / (values.length - 1),
    zeroStepCount: zero, reverseOrWrapInconsistentCount: reverse, greaterThanOneForwardCount: greater,
    maximumForwardDifference: maximumForward || (unit ? 1 : 0), uniqueValueCount: new Set(values).size,
    moduloSpan: (values.at(-1) - values[0]) >>> 0, totalForwardMissing: totalMissing.toString(),
    seriesUint32LeSha256: valueHash.digest("hex"), exactUnitProgression: unit === values.length - 1
  };
}

const { command, frames, recordHash, series } = await extract();
const candidates = [];
for (const [id, values] of series) {
  const [boundary, plane, byteOrder] = id.split(":");
  candidates.push({ id, boundary, plane, byteOrder, ...summarize(values) });
}
const passingCandidates = candidates.filter(item => item.exactUnitProgression && item.uniqueValueCount === frames && item.moduloSpan === frames - 1).map(item => item.id);
const result = {
  resultId: "RC45-X16-L0002-JAVASCRIPT-COUNTER-0.1", cycleId: "RC-2026-45", createdOn: "2026-08-21",
  implementation: "JavaScript standard library", precommit: "research/reproducibility/rc45-in-frame-counter-precommit.json",
  input: { path: path.relative(root, avi).replaceAll("\\", "/"), sha256: shaFile(avi) },
  decoder: { path: path.relative(root, ffmpeg).replaceAll("\\", "/"), sha256: shaFile(ffmpeg), pixelFormat: "gbrp", sharedAcrossImplementations: true },
  command, frameCount: frames, boundaryRecordBytesPerFrame: 48, rawBoundaryRecordSha256: recordHash,
  candidates, passingCandidates, gatePassedLocally: passingCandidates.length > 0,
  boundary: "A passing sequence establishes a decoded direct marker under the documented counter rule; it does not by itself anchor the first value to the first XYPT trigger."
};
if (process.argv.includes("--write")) fs.writeFileSync(path.join(root, "research", "reproducibility", "rc45-x16-layer-0002-javascript-counter.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(Object.fromEntries(["resultId", "frameCount", "rawBoundaryRecordSha256", "passingCandidates", "gatePassedLocally"].map(key => [key, result[key]])), null, 2));
