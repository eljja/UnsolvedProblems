import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archivePath = path.join(root, ".cache", "rc46-x16", "XYPT_L001-025.zip");
const outputPath = path.join(root, "research", "reproducibility", "rc46-toolpath-twin-node.json");
const ARCHIVE_SHA = "7b2b863c843aeabe19f308a5886d57ae241cd386f38c95a7e7ce01e9bc34d007";
const BINS = 1024;
const LOCAL_BINS = 4096;
const EPS = 1e-15;
if (!fs.existsSync(archivePath)) throw new Error("Run fetch-rc46-x16-xypt.mjs first");

const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const archive = fs.readFileSync(archivePath);
if (archive.length !== 159_164_372 || sha(archive) !== ARCHIVE_SHA) throw new Error("official archive identity mismatch");

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
const crc32 = data => {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function entries() {
  let eocd = -1;
  for (let i = archive.length - 22; i >= archive.length - 65_557; i -= 1) if (archive.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("EOCD missing");
  const count = archive.readUInt16LE(eocd + 10);
  let cursor = archive.readUInt32LE(eocd + 16);
  const found = [];
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error("central directory malformed");
    const method = archive.readUInt16LE(cursor + 10);
    const crc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    found.push({ name, method, crc, compressedSize, uncompressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return found;
}

function inflate(entry) {
  if (archive.readUInt32LE(entry.localOffset) !== 0x04034b50) throw new Error(`bad local header ${entry.name}`);
  const nameLength = archive.readUInt16LE(entry.localOffset + 26);
  const extraLength = archive.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = archive.subarray(start, start + entry.compressedSize);
  const data = entry.method === 8 ? zlib.inflateRawSync(compressed) : entry.method === 0 ? Buffer.from(compressed) : null;
  if (!data) throw new Error(`unsupported method ${entry.method}`);
  if (data.length !== entry.uncompressedSize || crc32(data) !== entry.crc) throw new Error(`member integrity failed ${entry.name}`);
  return data;
}

function parseNumber(data, state, end) {
  let i = state.i;
  while (i < end && (data[i] === 32 || data[i] === 9)) i += 1;
  let sign = 1;
  if (data[i] === 45) { sign = -1; i += 1; }
  let value = 0;
  let digits = 0;
  while (i < end && data[i] >= 48 && data[i] <= 57) { value = value * 10 + data[i] - 48; i += 1; digits += 1; }
  if (i < end && data[i] === 46) {
    i += 1;
    let place = 0.1;
    while (i < end && data[i] >= 48 && data[i] <= 57) { value += (data[i] - 48) * place; place *= 0.1; i += 1; digits += 1; }
  }
  if (!digits) throw new Error(`non-numeric row byte ${state.i}`);
  while (i < end && (data[i] === 32 || data[i] === 9)) i += 1;
  state.i = i;
  return sign * value;
}

function parseLayer(entry) {
  const data = inflate(entry);
  const x = [], y = [], p = [];
  let totalRows = 0, nonzeroT = 0, cameraRows = 0;
  let start = 0;
  for (let end = 0; end <= data.length; end += 1) {
    if (end < data.length && data[end] !== 10) continue;
    let lineEnd = end;
    if (lineEnd > start && data[lineEnd - 1] === 13) lineEnd -= 1;
    if (lineEnd > start) {
      const state = { i: start };
      const values = [];
      for (let field = 0; field < 4; field += 1) {
        values.push(parseNumber(data, state, lineEnd));
        if (field < 3) {
          if (data[state.i] !== 44) throw new Error(`${entry.name}: expected comma row ${totalRows + 1}`);
          state.i += 1;
        }
      }
      while (state.i < lineEnd && (data[state.i] === 32 || data[state.i] === 9)) state.i += 1;
      if (state.i !== lineEnd || !values.every(Number.isFinite) || !Number.isInteger(values[3])) throw new Error(`${entry.name}: malformed row ${totalRows + 1}`);
      totalRows += 1;
      const t = values[3];
      if (t !== 0) nonzeroT += 1;
      if ((t & 2) !== 0) { x.push(values[0]); y.push(values[1]); p.push(values[2]); cameraRows += 1; }
    }
    start = end + 1;
  }
  if (cameraRows !== nonzeroT) throw new Error(`${entry.name}: camera-bit count differs from nonzero T count`);
  return {
    layer: Number(entry.name.match(/L(\d{4})/)[1]), member: { name: entry.name, bytes: data.length, sha256: sha(data), crc32: entry.crc.toString(16).padStart(8, "0") },
    totalRows, cameraRows, nonzeroT, x: Float64Array.from(x), y: Float64Array.from(y), p: Float64Array.from(p)
  };
}

const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const median = values => { const sorted = [...values].sort((a, b) => a - b); const m = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2; };
const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos), f = pos - lo;
  return sorted[lo] * (1 - f) + sorted[hi] * f;
};

function targetScale(layer) {
  const cx = mean(layer.x), cy = mean(layer.y);
  let radius2 = 0;
  for (let i = 0; i < layer.cameraRows; i += 1) radius2 += (layer.x[i] - cx) ** 2 + (layer.y[i] - cy) ** 2;
  const speeds = [];
  for (let i = 1; i < layer.cameraRows; i += 1) { const s = Math.hypot(layer.x[i] - layer.x[i - 1], layer.y[i] - layer.y[i - 1]); if (s > 0) speeds.push(s); }
  return { cx, cy, rmsRadius: Math.sqrt(radius2 / layer.cameraRows), maxPower: Math.max(...layer.p), medianPositiveStep: median(speeds) };
}

function profile(layer, bins, scale) {
  const cx = mean(layer.x), cy = mean(layer.y);
  const sums = Array.from({ length: bins }, () => ({ n: 0, x: 0, y: 0, p: 0, on: 0, speed: 0, speedN: 0, dx: 0, dy: 0, dirN: 0 }));
  for (let i = 0; i < layer.cameraRows; i += 1) {
    const b = Math.min(bins - 1, Math.floor(i * bins / layer.cameraRows));
    const row = sums[b]; row.n += 1; row.x += (layer.x[i] - cx) / scale.rmsRadius; row.y += (layer.y[i] - cy) / scale.rmsRadius; row.p += layer.p[i] / scale.maxPower; row.on += layer.p[i] > 0 ? 1 : 0;
    if (i > 0) {
      const dx = layer.x[i] - layer.x[i - 1], dy = layer.y[i] - layer.y[i - 1], speed = Math.hypot(dx, dy);
      if (speed > 0) { row.speed += speed / scale.medianPositiveStep; row.speedN += 1; row.dx += dx / speed; row.dy += dy / speed; row.dirN += 1; }
    }
  }
  return sums.map(row => ({ x: row.x / row.n, y: row.y / row.n, p: row.p / row.n, on: row.on / row.n, speed: row.speedN ? row.speed / row.speedN : 0, dx: row.dirN ? row.dx / row.dirN : 0, dy: row.dirN ? row.dy / row.dirN : 0, directionDefined: row.dirN > 0 }));
}

function rotation(target, candidate) {
  let a = 0, b = 0;
  for (let i = 0; i < target.length; i += 1) { a += candidate[i].x * target[i].x + candidate[i].y * target[i].y; b += candidate[i].x * target[i].y - candidate[i].y * target[i].x; }
  const theta = Math.atan2(b, a);
  return { theta, cos: Math.cos(theta), sin: Math.sin(theta) };
}
const rotate = (x, y, r) => ({ x: r.cos * x - r.sin * y, y: r.sin * x + r.cos * y });
const rmse = values => Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
const hellinger = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (Math.sqrt(v) - Math.sqrt(b[i])) ** 2, 0)) / Math.sqrt(2);
const gridIndex = (value, lower, upper) => {
  let scaled = (value - lower) / Math.max(upper - lower, EPS) * 32;
  const nearest = Math.round(scaled);
  if (Math.abs(scaled - nearest) <= 1e-12) scaled = nearest;
  return Math.max(0, Math.min(31, Math.floor(scaled)));
};

function spatial(target, candidate, scale, r) {
  const tcx = mean(target.x), tcy = mean(target.y), ccx = mean(candidate.x), ccy = mean(candidate.y);
  const tx = [], ty = [], cx = [], cy = [];
  for (let i = 0; i < target.cameraRows; i += 1) { tx.push((target.x[i] - tcx) / scale.rmsRadius); ty.push((target.y[i] - tcy) / scale.rmsRadius); }
  for (let i = 0; i < candidate.cameraRows; i += 1) { const q = rotate((candidate.x[i] - ccx) / scale.rmsRadius, (candidate.y[i] - ccy) / scale.rmsRadius, r); cx.push(q.x); cy.push(q.y); }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const values of [[tx, ty], [cx, cy]]) for (let i = 0; i < values[0].length; i += 1) {
    minX = Math.min(minX, values[0][i]); maxX = Math.max(maxX, values[0][i]); minY = Math.min(minY, values[1][i]); maxY = Math.max(maxY, values[1][i]);
  }
  const make = (xs, ys, power, onlyOn) => {
    const h = new Float64Array(1024); let n = 0;
    for (let i = 0; i < xs.length; i += 1) { if (onlyOn && power[i] <= 0) continue; const gx = gridIndex(xs[i], minX, maxX); const gy = gridIndex(ys[i], minY, maxY); h[gy * 32 + gx] += 1; n += 1; }
    return Array.from(h, v => v / n);
  };
  return { allHellinger: hellinger(make(tx, ty, target.p, false), make(cx, cy, candidate.p, false)), onHellinger: hellinger(make(tx, ty, target.p, true), make(cx, cy, candidate.p, true)), outOfGridMass: 0 };
}

function segments(layer, rotationValue = null) {
  const lengths = [], powers = [], speeds = [], histogram = new Float64Array(36); let inRun = false, length = 0, pathMass = 0;
  for (let i = 0; i < layer.cameraRows; i += 1) {
    const on = layer.p[i] > 0;
    if (on) { if (!inRun) { inRun = true; length = 0; } length += 1; powers.push(layer.p[i]); }
    if (inRun && (!on || i === layer.cameraRows - 1)) { lengths.push(length); inRun = false; }
    if (on && i > 0 && layer.p[i - 1] > 0) {
      let dx = layer.x[i] - layer.x[i - 1], dy = layer.y[i] - layer.y[i - 1]; const speed = Math.hypot(dx, dy);
      if (speed > 0) { if (rotationValue) ({ x: dx, y: dy } = rotate(dx, dy, rotationValue)); speeds.push(speed); let angle = Math.atan2(dy, dx); if (angle < 0) angle += 2 * Math.PI; histogram[Math.min(35, Math.floor(angle / (2 * Math.PI) * 36))] += speed; pathMass += speed; }
    }
  }
  const qs = values => [0.1, 0.25, 0.5, 0.75, 0.9].map(q => quantile(values, q));
  return { count: lengths.length, lengthQuantiles: qs(lengths), powerQuantiles: qs(powers), speedQuantiles: qs(speeds), direction: Array.from(histogram, v => v / pathMass) };
}

function compare(target, candidate, scale, target1024, target4096, targetSegments) {
  const candidate1024 = profile(candidate, BINS, scale), r = rotation(target1024, candidate1024);
  const rotated1024 = candidate1024.map(row => ({ ...row, ...rotate(row.x, row.y, r), dir: rotate(row.dx, row.dy, r) }));
  const xyRmse = Math.sqrt(target1024.reduce((s, row, i) => s + (row.x - rotated1024[i].x) ** 2 + (row.y - rotated1024[i].y) ** 2, 0) / BINS);
  const powerRmse = rmse(target1024.map((row, i) => row.p - candidate1024[i].p));
  const laserOnRmse = rmse(target1024.map((row, i) => row.on - candidate1024[i].on));
  const spatialResult = spatial(target, candidate, scale, r);
  const candidateSegments = segments(candidate, r);
  const directionHellinger = hellinger(targetSegments.direction, candidateSegments.direction);
  const candidate4096 = profile(candidate, LOCAL_BINS, scale);
  let matches = 0, run = 0, longest = 0, positionFailures = 0, powerFailures = 0, onFailures = 0, directionFailures = 0;
  for (let i = 0; i < LOCAL_BINS; i += 1) {
    const q = rotate(candidate4096[i].x, candidate4096[i].y, r);
    const positionOk = Math.hypot(target4096[i].x - q.x, target4096[i].y - q.y) <= 0.02;
    const powerOk = Math.abs(target4096[i].p - candidate4096[i].p) <= 0.05;
    const onOk = Math.abs(target4096[i].on - candidate4096[i].on) <= 0.05;
    let directionOk = true;
    if (target4096[i].directionDefined && candidate4096[i].directionDefined) {
      const d = rotate(candidate4096[i].dx, candidate4096[i].dy, r), tn = Math.hypot(target4096[i].dx, target4096[i].dy), cn = Math.hypot(d.x, d.y);
      directionOk = tn <= EPS || cn <= EPS ? true : (target4096[i].dx * d.x + target4096[i].dy * d.y) / (tn * cn) >= 0.95;
    }
    if (!positionOk) positionFailures += 1; if (!powerOk) powerFailures += 1; if (!onOk) onFailures += 1; if (!directionOk) directionFailures += 1;
    if (positionOk && powerOk && onOk && directionOk) { matches += 1; run += 1; longest = Math.max(longest, run); } else run = 0;
  }
  const countRelativeError = Math.abs(candidate.cameraRows - target.cameraRows) / target.cameraRows;
  const positiveFractionTarget = target.p.filter(v => v > 0).length / target.cameraRows, positiveFractionCandidate = candidate.p.filter(v => v > 0).length / candidate.cameraRows;
  const positiveFractionError = Math.abs(positiveFractionTarget - positiveFractionCandidate), localMatchFraction = matches / LOCAL_BINS;
  const gates = {
    count: countRelativeError <= 0.01,
    positiveFraction: positiveFractionError <= 0.02,
    xy: xyRmse <= 0.05,
    power: powerRmse <= 0.10,
    laserOn: laserOnRmse <= 0.05,
    spatialAll: spatialResult.allHellinger <= 0.10,
    spatialOn: spatialResult.onHellinger <= 0.10,
    direction: directionHellinger <= 0.10,
    local: localMatchFraction >= 0.95
  };
  const score = countRelativeError + positiveFractionError + xyRmse + powerRmse + laserOnRmse + spatialResult.allHellinger + spatialResult.onHellinger + directionHellinger + (1 - localMatchFraction);
  const relative = (a, b) => a.map((v, i) => Math.abs(b[i] - v) / Math.max(Math.abs(v), EPS));
  return {
    layer: candidate.layer, member: candidate.member, counts: { totalRows: candidate.totalRows, cameraRows: candidate.cameraRows, nonzeroT: candidate.nonzeroT, positiveCameraRows: candidate.p.filter(v => v > 0).length },
    rotationRadians: r.theta, metrics: { countRelativeError, positiveFractionError, xyRmse, powerRmse, laserOnRmse, ...spatialResult, directionHellinger, localMatchFraction, longestLocalMatchRun: longest, positionFailures, powerFailures, onFailures, directionFailures },
    segmentComparison: { countRelativeError: Math.abs(candidateSegments.count - targetSegments.count) / targetSegments.count, lengthQuantileRelativeErrors: relative(targetSegments.lengthQuantiles, candidateSegments.lengthQuantiles), powerQuantileRelativeErrors: relative(targetSegments.powerQuantiles, candidateSegments.powerQuantiles), speedQuantileRelativeErrors: relative(targetSegments.speedQuantiles, candidateSegments.speedQuantiles) },
    gates, eligible: Object.values(gates).every(Boolean), score
  };
}

const directory = entries().sort((a, b) => a.name.localeCompare(b.name));
if (directory.length !== 25) throw new Error("expected 25 members");
const targetEntry = directory.find(row => row.name === "XYPT_L0001.csv");
const target = parseLayer(targetEntry), scale = targetScale(target), target1024 = profile(target, BINS, scale), target4096 = profile(target, LOCAL_BINS, scale), targetSegments = segments(target);
const targetSummary = { layer: 1, member: target.member, counts: { totalRows: target.totalRows, cameraRows: target.cameraRows, nonzeroT: target.nonzeroT, positiveCameraRows: target.p.filter(v => v > 0).length }, scale, segmentCount: targetSegments.count };
const candidates = [];
for (const entry of directory.filter(row => row !== targetEntry)) {
  const candidate = parseLayer(entry);
  candidates.push(compare(target, candidate, scale, target1024, target4096, targetSegments));
  process.stdout.write(`L${String(candidate.layer).padStart(4, "0")} ${candidates.at(-1).eligible ? "PASS" : "fail"} score=${candidates.at(-1).score.toFixed(6)}\n`);
}
candidates.sort((a, b) => a.score - b.score || a.layer - b.layer);
const passing = candidates.filter(row => row.eligible);
const result = {
  resultId: "RC46-X16-TOOLPATH-TWIN-NODE-0.1", cycleId: "RC-2026-46", createdOn: new Date().toISOString(), implementation: "Node.js standard library; independent archive, CSV, metric, and gate implementation", preregistration: "research/reproducibility/rc46-toolpath-twin-precommit.json",
  input: { path: ".cache/rc46-x16/XYPT_L001-025.zip", bytes: archive.length, sha256: sha(archive), memberCount: directory.length },
  target: targetSummary, candidates, ranking: candidates.map((row, index) => ({ rank: index + 1, layer: row.layer, score: row.score, eligible: row.eligible, failedGates: Object.entries(row.gates).filter(([, pass]) => !pass).map(([name]) => name) })),
  adjudication: { passingLayers: passing.map(row => row.layer), topRankedLayer: candidates[0].layer, topRankedEligible: candidates[0].eligible, hypothesis: passing.length ? "T1-command-twin-eligible-for-future-image-benchmark" : "T0-no-first-25-layer-command-twin", releaseCandidateAviThisCycle: false, naturalL0001RemainsSealed: true },
  boundary: "Command-level similarity can qualify a prospective image benchmark but cannot establish image exchangeability, recover a natural missing position, or certify process truth."
};
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.adjudication, null, 2));
