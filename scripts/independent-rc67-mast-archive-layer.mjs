import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirIndex = process.argv.indexOf("--download-dir");
const downloadDir = path.resolve(root, dirIndex >= 0 ? process.argv[dirIndex + 1] : ".cache/rc67-mast");
const write = process.argv.includes("--write");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const spec = read(path.join(root, "research/reproducibility/rc67-archive-layer-spec.json"));
const manifest = read(path.join(root, "research/reproducibility/rc67-mast-source-manifest.json"));
const originRa = 163.36;
const originDec = 16.78;
const cosDec = Math.cos(originDec * Math.PI / 180);
const cell = 0.1;
const project = (ra, dec) => [(ra - originRa) * cosDec * 3600, (dec - originDec) * 3600];
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function parseMrt(file) {
  const pattern = /^(N3447(?:Spiral|A)?)\s+(\d+(?:\.\d+)?)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)/;
  const rows = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(pattern);
    if (!match) continue;
    const [, host, id, ra, dec, logPeriod, f150w, f150wError, colour, colourError] = match;
    const [x, y] = project(Number(ra), Number(dec));
    rows.push({
      host, component: host === "N3447Spiral" ? "spiral" : host === "N3447A" ? "tidal" : "other",
      id: Math.round(Number(id)), ra: Number(ra), dec: Number(dec), x, y,
      logPeriod: Number(logPeriod), phaseCorrectedF150W: Number(f150w), f150wError: Number(f150wError),
      colour: Number(colour), colourError: Number(colourError)
    });
  }
  if (rows.length !== 142) throw new Error(`Expected 142 MRT rows, found ${rows.length}`);
  return rows;
}

function parseEcsv(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const headerIndex = lines.findIndex(line => line.startsWith("label "));
  const columns = lines[headerIndex].trim().split(/\s+/);
  const at = Object.fromEntries(["label", "sky_centroid.ra", "sky_centroid.dec", "aper_total_vegamag", "is_extended"].map(name => [name, columns.indexOf(name)]));
  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const values = line.trim().split(/\s+/);
    const ra = Number(values[at["sky_centroid.ra"]]);
    const dec = Number(values[at["sky_centroid.dec"]]);
    const [x, y] = project(ra, dec);
    const magnitude = Number(values[at.aper_total_vegamag]);
    rows.push({ label: Number(values[at.label]), ra, dec, x, y, aperTotalVegaMag: Number.isFinite(magnitude) ? magnitude : null, isExtended: values[at.is_extended].toLowerCase() === "true" });
  }
  const dateLine = lines.find(line => line.includes("date:")) || "";
  const versionLine = lines.find(line => line.startsWith("# - version:")) || "";
  return { rows, columns, generatedOn: dateLine.match(/date: '([^']+)'/)?.[1] || null, versionLine: versionLine.slice(2).trim() };
}

const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
function buildIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    const bucket = key(row.x, row.y);
    if (!index.has(bucket)) index.set(bucket, []);
    index.get(bucket).push(row);
  }
  return index;
}

function nearest(index, x, y, radius) {
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  const span = Math.ceil(radius / cell);
  let source = null;
  let distanceArcsec = Infinity;
  for (let dx = -span; dx <= span; dx += 1) {
    for (let dy = -span; dy <= span; dy += 1) {
      for (const row of index.get(`${cx + dx},${cy + dy}`) || []) {
        const distance = Math.hypot(row.x - x, row.y - y);
        if (distance < distanceArcsec) ({ source, distanceArcsec } = { source: row, distanceArcsec: distance });
      }
    }
  }
  return { source, distanceArcsec };
}

function chooseShift(development, index) {
  const candidates = [];
  for (let xi = -25; xi <= 25; xi += 1) {
    for (let yi = -25; yi <= 25; yi += 1) {
      const sx = xi * 0.02;
      const sy = yi * 0.02;
      const distances = development.map(row => nearest(index, row.x + sx, row.y + sy, 0.1).distanceArcsec).filter(distance => distance <= 0.1);
      candidates.push({ count: distances.length, rss: distances.reduce((sum, value) => sum + value * value, 0), l1: Math.abs(sx) + Math.abs(sy), sx, sy });
    }
  }
  candidates.sort((a, b) => b.count - a.count || a.rss - b.rss || a.l1 - b.l1 || a.sx - b.sx || a.sy - b.sy);
  const selected = candidates[0];
  return { xArcsec: selected.sx, yArcsec: selected.sy, developmentMatchesAt0_1: selected.count, matchedSquaredResidual: selected.rss };
}

function match(objects, index, shift, radius) {
  return objects.map(object => {
    const found = nearest(index, object.x + shift.xArcsec, object.y + shift.yArcsec, radius);
    return { object, source: found.distanceArcsec <= radius ? found.source : null, distanceArcsec: found.distanceArcsec };
  });
}

function components(rows) {
  const result = Object.fromEntries(["spiral", "tidal", "other"].map(component => [component, { matched: 0, total: 0 }]));
  for (const row of rows) {
    result[row.object.component].total += 1;
    if (row.source) result[row.object.component].matched += 1;
  }
  return result;
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const sampleSd = values => Math.sqrt(values.reduce((sum, value) => sum + (value - mean(values)) ** 2, 0) / (values.length - 1));
function controls(objects, index, shift, radius) {
  const counts = Array.from({ length: 36 }, (_, angleIndex) => {
    const angle = angleIndex * 10 * Math.PI / 180;
    const controlShift = { xArcsec: shift.xArcsec + 5 * Math.cos(angle), yArcsec: shift.yArcsec + 5 * Math.sin(angle) };
    return match(objects, index, controlShift, radius).filter(row => row.source).length;
  });
  return { counts, mean: mean(counts), sampleStandardDeviation: sampleSd(counts) };
}

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= k; index += 1) value = value * (n - k + index) / index;
  return value;
}

function fisher(a, b, c, d) {
  const row1 = a + b;
  const column1 = a + c;
  const total = a + b + c + d;
  const probability = x => choose(column1, x) * choose(total - column1, row1 - x) / choose(total, row1);
  const minimum = Math.max(0, row1 - (total - column1));
  const maximum = Math.min(row1, column1);
  const observed = probability(a);
  const support = Array.from({ length: maximum - minimum + 1 }, (_, index) => [minimum + index, probability(minimum + index)]);
  return {
    oddsRatio: b * c === 0 ? Infinity : a * d / (b * c),
    greaterPValue: support.filter(([x]) => x >= a).reduce((sum, [, value]) => sum + value, 0),
    twoSidedPValue: Math.min(1, support.filter(([, value]) => value <= observed + 1e-15).reduce((sum, [, value]) => sum + value, 0))
  };
}

function numericSummary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { count: values.length, median, mean: mean(values), sampleStandardDeviation: sampleSd(values), rootMeanSquare: Math.sqrt(mean(values.map(value => value * value))) };
}

const sourceFiles = manifest.files.map(entry => {
  const file = path.join(root, entry.path);
  const bytes = fs.statSync(file).size;
  const hash = sha256(file);
  return { path: entry.path, bytes, sha256: hash, matchesManifest: bytes === entry.bytes && hash === entry.sha256 };
});
const mrt = parseMrt(path.join(root, ".cache/rc65-jwst-host-source/apjlae0ad6t3_mrt.txt"));
const catalogs = { f090w: parseEcsv(path.join(downloadDir, "f090w_cat.ecsv")), f150w: parseEcsv(path.join(downloadDir, "f150w_cat.ecsv")) };
const indices = Object.fromEntries(Object.entries(catalogs).map(([band, catalog]) => [band, buildIndex(catalog.rows)]));
const development = mrt.filter(row => row.id % 2 === 0);
const validation = mrt.filter(row => row.id % 2 === 1);
const translation = Object.fromEntries(Object.keys(catalogs).map(band => [band, chooseShift(development, indices[band])]));
const validationSensitivity = {};
const negativeControlSensitivity = {};
for (const band of Object.keys(catalogs)) {
  validationSensitivity[band] = spec.frozenDesign.validationRadiiArcsec.map(radiusArcsec => {
    const rows = match(validation, indices[band], translation[band], radiusArcsec);
    return { radiusArcsec, matched: rows.filter(row => row.source).length, total: validation.length, components: components(rows) };
  });
  negativeControlSensitivity[band] = spec.frozenDesign.validationRadiiArcsec.map(radiusArcsec => ({ radiusArcsec, ...controls(validation, indices[band], translation[band], radiusArcsec) }));
}

const dualBandValidation = spec.frozenDesign.validationRadiiArcsec.map(radiusArcsec => {
  const left = match(validation, indices.f090w, translation.f090w, radiusArcsec);
  const right = match(validation, indices.f150w, translation.f150w, radiusArcsec);
  const rows = left.map((row, index) => ({ object: row.object, source: row.source && right[index].source ? row.source : null }));
  return { radiusArcsec, matched: rows.filter(row => row.source).length, total: validation.length, components: components(rows) };
});

const dualControls = Array.from({ length: 36 }, (_, angleIndex) => {
  const angleDegrees = angleIndex * 10;
  const angle = angleDegrees * Math.PI / 180;
  const shifted = band => ({ xArcsec: translation[band].xArcsec + 5 * Math.cos(angle), yArcsec: translation[band].yArcsec + 5 * Math.sin(angle) });
  const left = match(validation, indices.f090w, shifted("f090w"), 0.3);
  const right = match(validation, indices.f150w, shifted("f150w"), 0.3);
  const found = left.map((row, index) => Boolean(row.source && right[index].source));
  return {
    angleDegrees, all: found.filter(Boolean).length,
    ...Object.fromEntries(["spiral", "tidal", "other"].map(component => [component, found.filter((flag, index) => flag && validation[index].component === component).length]))
  };
});
const dualControlSummary = Object.fromEntries(["all", "spiral", "tidal", "other"].map(keyName => {
  const values = dualControls.map(row => row[keyName]);
  return [keyName, { mean: mean(values), sampleStandardDeviation: sampleSd(values) }];
}));
const confirmatory = dualBandValidation.find(row => row.radiusArcsec === 0.3);
const spiral = confirmatory.components.spiral;
const tidal = confirmatory.components.tidal;
const exactTest = fisher(tidal.matched, tidal.total - tidal.matched, spiral.matched, spiral.total - spiral.matched);
const f150Matches = match(validation, indices.f150w, translation.f150w, 0.1).filter(row => row.source && row.source.aperTotalVegaMag !== null);
const residuals = f150Matches.map(row => row.source.aperTotalVegaMag - row.object.phaseCorrectedF150W);
const pointResiduals = f150Matches.filter(row => !row.source.isExtended).map(row => row.source.aperTotalVegaMag - row.object.phaseCorrectedF150W);

const result = {
  cycleId: "RC-2026-67", implementation: "dependency-free-node",
  sourceAudit: { files: sourceFiles, allHashesMatch: sourceFiles.every(row => row.matchesManifest) },
  catalogAudit: Object.fromEntries(Object.entries(catalogs).map(([band, catalog]) => [band, { rows: catalog.rows.length, columns: catalog.columns.length, generatedOn: catalog.generatedOn, versionLine: catalog.versionLine }])),
  split: { developmentRows: development.length, validationRows: validation.length, rule: "even author ID development; odd author ID validation" },
  translation, validationSensitivity, negativeControlSensitivity, dualBandValidation,
  dualBandControlsAt0_3: { rows: dualControls, summary: dualControlSummary },
  componentRecoveryExactTestAt0_3: exactTest,
  f150wResidualDiagnosticAt0_1: { all: numericSummary(residuals), unextendedOnly: numericSummary(pointResiduals) },
  identityAudit: {
    matchedCatalogLabelEqualsAuthorIdAt0_3: Object.fromEntries(Object.keys(catalogs).map(band => [band, match(mrt, indices[band], translation[band], 0.3).filter(row => row.source && row.source.label === row.object.id).length])),
    catalogLabelsAreAuthorStableIds: false
  },
  claimBoundary: "This independent implementation evaluates coordinate recovery only; it does not reinterpret first-pass aperture photometry as the publication's custom Cepheid measurement."
};
if (write) fs.writeFileSync(path.join(root, "research/reproducibility/rc67-archive-layer-node.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
