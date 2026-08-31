import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputIndex = process.argv.indexOf("--download-dir");
const downloadDir = path.resolve(root, outputIndex >= 0 ? process.argv[outputIndex + 1] : ".cache/rc68-target-first");
const write = process.argv.includes("--write");
const subpixels = 32;
const shiftXArcsec = 0.02;
const shiftYArcsec = -0.08;

const bands = {
  F090W: { stem: "f090w", reference: { radius: 2.3332438, inner: 8, outer: 13, correction: 1.4367015 }, sensitivity: { radius: 1.3864133, inner: 6, outer: 10, correction: 2.0056102 } },
  F150W: { stem: "f150w", reference: { radius: 2.7442563, inner: 8, outer: 13, correction: 1.4373972 }, sensitivity: { radius: 1.5689266, inner: 6, outer: 10, correction: 2.0056353 } }
};

function parseValue(card) {
  const raw = card.slice(10).trimStart();
  if (raw.startsWith("'")) {
    const end = raw.indexOf("'", 1);
    return raw.slice(1, end).trim();
  }
  const value = raw.split("/")[0].trim();
  if (value === "T") return true;
  if (value === "F") return false;
  const numeric = Number(value.replace(/[dD]/g, "E"));
  return Number.isNaN(numeric) ? value : numeric;
}

function readHeader(fd, offset) {
  const cards = [];
  let cursor = offset;
  let ended = false;
  while (!ended) {
    const block = Buffer.allocUnsafe(2880);
    const bytes = fs.readSync(fd, block, 0, block.length, cursor);
    if (bytes !== block.length) throw new Error(`Short FITS header block at ${cursor}`);
    cursor += block.length;
    for (let index = 0; index < 36; index += 1) {
      const card = block.toString("ascii", index * 80, (index + 1) * 80);
      cards.push(card);
      if (card.startsWith("END     ")) { ended = true; break; }
    }
  }
  const values = {};
  for (const card of cards) {
    if (card[8] !== "=") continue;
    values[card.slice(0, 8).trim()] = parseValue(card);
  }
  return { values, bytes: cursor - offset };
}

function openFits(file) {
  const fd = fs.openSync(file, "r");
  const fileSize = fs.fstatSync(fd).size;
  const hdus = [];
  let offset = 0;
  while (offset < fileSize) {
    const header = readHeader(fd, offset);
    const h = header.values;
    const axes = Array.from({ length: Number(h.NAXIS || 0) }, (_, index) => Number(h[`NAXIS${index + 1}`]));
    const elements = axes.length ? axes.reduce((a, b) => a * b, 1) : 0;
    const dataBytes = elements * Math.abs(Number(h.BITPIX || 8)) / 8 + Number(h.PCOUNT || 0);
    const dataOffset = offset + header.bytes;
    hdus.push({ name: h.EXTNAME || (hdus.length ? `HDU${hdus.length}` : "PRIMARY"), header: h, axes, dataOffset, dataBytes });
    const padded = Math.ceil(dataBytes / 2880) * 2880;
    offset = dataOffset + padded;
    if (!dataBytes && offset >= fileSize) break;
  }
  const byName = Object.fromEntries(hdus.map(hdu => [hdu.name, hdu]));
  return { fd, hdus, byName, close: () => fs.closeSync(fd) };
}

function readPatch(product, hdu, x0, y0, size, kind) {
  const width = hdu.axes[0];
  const bytesPer = Math.abs(Number(hdu.header.BITPIX)) / 8;
  const output = Array.from({ length: size }, () => Array(size));
  const buffer = Buffer.allocUnsafe(size * bytesPer);
  for (let row = 0; row < size; row += 1) {
    const offset = hdu.dataOffset + ((y0 + row) * width + x0) * bytesPer;
    const bytes = fs.readSync(product.fd, buffer, 0, buffer.length, offset);
    if (bytes !== buffer.length) throw new Error(`Short FITS data read at ${offset}`);
    for (let col = 0; col < size; col += 1) {
      const cursor = col * bytesPer;
      if (kind === "float") output[row][col] = buffer.readFloatBE(cursor);
      else if (kind === "uint-scaled") output[row][col] = buffer.readInt32BE(cursor) + Number(hdu.header.BZERO || 0);
      else if (kind === "uint") output[row][col] = buffer.readUInt32BE(cursor);
      else output[row][col] = buffer.readInt32BE(cursor);
    }
  }
  return output;
}

function parseMrt(file) {
  const pattern = /^(N3447(?:Spiral|A)?)\s+(\d+(?:\.\d+)?)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)/;
  return fs.readFileSync(file, "utf8").split(/\r?\n/).flatMap(line => {
    const match = line.match(pattern);
    if (!match) return [];
    const host = match[1];
    return [{
      host,
      component: host === "N3447Spiral" ? "spiral" : host === "N3447A" ? "tidal" : "other",
      authorId: Math.round(Number(match[2])), ra: Number(match[3]), dec: Number(match[4])
    }];
  });
}

function parseEcsv(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const headerIndex = lines.findIndex(line => line.startsWith("label "));
  const columns = lines[headerIndex].trim().split(/\s+/);
  const wanted = Object.fromEntries(["label", "xcentroid", "ycentroid"].map(name => [name, columns.indexOf(name)]));
  return lines.slice(headerIndex + 1).flatMap(line => {
    if (!line.trim() || line.startsWith("#")) return [];
    const values = line.trim().split(/\s+/);
    return [{ label: Number(values[wanted.label]), x: Number(values[wanted.xcentroid]), y: Number(values[wanted.ycentroid]) }];
  });
}

function shifted(ra, dec) {
  return [ra + shiftXArcsec / (3600 * Math.cos(dec * Math.PI / 180)), dec + shiftYArcsec / 3600];
}

function worldToPixel(header, raDeg, decDeg) {
  const rad = Math.PI / 180;
  const ra = raDeg * rad, dec = decDeg * rad;
  const ra0 = Number(header.CRVAL1) * rad, dec0 = Number(header.CRVAL2) * rad;
  const dra = ra - ra0;
  const denominator = Math.sin(dec) * Math.sin(dec0) + Math.cos(dec) * Math.cos(dec0) * Math.cos(dra);
  const xi = Math.cos(dec) * Math.sin(dra) / denominator / rad;
  const eta = (Math.sin(dec) * Math.cos(dec0) - Math.cos(dec) * Math.sin(dec0) * Math.cos(dra)) / denominator / rad;
  const a = Number(header.CDELT1) * Number(header.PC1_1);
  const b = Number(header.CDELT1) * Number(header.PC1_2);
  const c = Number(header.CDELT2) * Number(header.PC2_1);
  const d = Number(header.CDELT2) * Number(header.PC2_2);
  const determinant = a * d - b * c;
  const dx = (d * xi - b * eta) / determinant;
  const dy = (-c * xi + a * eta) / determinant;
  return [dx + Number(header.CRPIX1) - 1, dy + Number(header.CRPIX2) - 1];
}

function pixelWeight(px, py, x, y, radius) {
  const centerDistance = Math.hypot(px - x, py - y);
  const halfDiagonal = Math.SQRT1_2;
  if (centerDistance + halfDiagonal <= radius) return 1;
  if (centerDistance - halfDiagonal >= radius) return 0;
  let inside = 0;
  for (let sx = 0; sx < subpixels; sx += 1) {
    const xx = px + (sx + 0.5) / subpixels - 0.5;
    for (let sy = 0; sy < subpixels; sy += 1) {
      const yy = py + (sy + 0.5) / subpixels - 0.5;
      if ((xx - x) ** 2 + (yy - y) ** 2 <= radius ** 2) inside += 1;
    }
  }
  return inside / (subpixels ** 2);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clippedBackground(values) {
  let kept = values.filter(Number.isFinite);
  if (!kept.length) return { background: null, sigma: null, count: 0 };
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const center = median(kept);
    const sigma = 1.4826 * median(kept.map(value => Math.abs(value - center)));
    if (!sigma) break;
    const next = kept.filter(value => Math.abs(value - center) <= 3 * sigma);
    if (!next.length || next.length === kept.length) break;
    kept = next;
  }
  const background = median(kept);
  const sigma = 1.4826 * median(kept.map(value => Math.abs(value - background)));
  return { background, sigma, count: kept.length };
}

function measure(patches, x0, y0, x, y, pixarSr, config) {
  const entries = [];
  const backgroundClean = [];
  const backgroundAll = [];
  for (let row = 0; row < patches.sci.length; row += 1) {
    for (let col = 0; col < patches.sci[row].length; col += 1) {
      const px = x0 + col, py = y0 + row;
      const sci = patches.sci[row][col], err = patches.err[row][col], label = patches.segm[row][col];
      const finite = Number.isFinite(sci) && Number.isFinite(err);
      const weight = pixelWeight(px, py, x, y, config.radius);
      entries.push({ sci, err, label, finite, weight });
      const distance = Math.hypot(px - x, py - y);
      if (finite && distance >= config.inner && distance <= config.outer) {
        backgroundAll.push(sci);
        if (label === 0) backgroundClean.push(sci);
      }
    }
  }
  const fallback = backgroundClean.length < 30;
  const { background, sigma, count } = clippedBackground(fallback ? backgroundAll : backgroundClean);
  let fluxSum = 0, errorSquared = 0, weightSquared = 0, weightSum = 0, nominalWeight = 0, segmentedWeight = 0;
  for (const entry of entries) {
    nominalWeight += entry.weight;
    if (!entry.finite) continue;
    weightSum += entry.weight;
    weightSquared += entry.weight ** 2;
    fluxSum += entry.weight * (entry.sci - background);
    errorSquared += (entry.weight * entry.err) ** 2;
    if (entry.label !== 0) segmentedWeight += entry.weight;
  }
  const conversion = pixarSr * 1e6 * config.correction;
  const fluxJy = fluxSum * conversion;
  const pipelineErrorJy = Math.sqrt(errorSquared) * conversion;
  const annulusNoiseJy = (sigma || 0) * Math.sqrt(weightSquared) * conversion;
  const backgroundLevelErrorJy = (sigma || 0) / Math.sqrt(Math.max(1, count)) * weightSum * conversion;
  const combinedErrorJy = Math.hypot(pipelineErrorJy, annulusNoiseJy, backgroundLevelErrorJy);
  return {
    fluxJy, pipelineErrorJy, annulusNoiseJy, backgroundLevelErrorJy, combinedErrorJy,
    signalToNoise: combinedErrorJy ? fluxJy / combinedErrorJy : null,
    backgroundMJySr: background, backgroundRobustSigmaMJySr: sigma, backgroundPixels: count,
    backgroundFallback: fallback, finiteWeightFraction: weightSum / nominalWeight,
    apertureSegmentedFraction: segmentedWeight / weightSum
  };
}

function nearest(catalog, x, y, scale) {
  let first = null, second = null;
  for (const source of catalog) {
    const distance = Math.hypot(source.x - x, source.y - y);
    if (!first || distance < first.distance) { second = first; first = { source, distance }; }
    else if (!second || distance < second.distance) second = { source, distance };
  }
  return { label: first.source.label, arcsec: first.distance * scale, secondArcsec: second.distance * scale, matched: first.distance * scale <= 0.3 };
}

function popcount(value) {
  value >>>= 0;
  let count = 0;
  while (value) { value &= value - 1; count += 1; }
  return count;
}

const objects = parseMrt(path.join(root, ".cache/rc65-jwst-host-source/apjlae0ad6t3_mrt.txt"));
if (objects.length !== 142) throw new Error(`Expected 142 objects, found ${objects.length}`);
const independentRows = [];

for (const [band, settings] of Object.entries(bands)) {
  const image = openFits(path.join(downloadDir, `${settings.stem}_i2d.fits`));
  const segmentation = openFits(path.join(downloadDir, `${settings.stem}_segm.fits`));
  const catalog = parseEcsv(path.join(root, `.cache/rc67-mast/${settings.stem}_cat.ecsv`));
  try {
    const header = image.byName.SCI.header;
    const pixelScale = Math.sqrt(Number(header.PIXAR_A2));
    for (const object of objects) {
      const [ra, dec] = shifted(object.ra, object.dec);
      const [x, y] = worldToPixel(header, ra, dec);
      const margin = 14, size = 29;
      const x0 = Math.floor(x) - margin, y0 = Math.floor(y) - margin;
      const patches = {
        sci: readPatch(image, image.byName.SCI, x0, y0, size, "float"),
        err: readPatch(image, image.byName.ERR, x0, y0, size, "float"),
        wht: readPatch(image, image.byName.WHT, x0, y0, size, "float"),
        con: readPatch(image, image.byName.CON, x0, y0, size, "uint"),
        segm: readPatch(segmentation, segmentation.byName.SCI, x0, y0, size, "uint-scaled")
      };
      const cx = Math.round(x) - x0, cy = Math.round(y) - y0;
      const source = nearest(catalog, x, y, pixelScale);
      independentRows.push({
        band, authorId: object.authorId, component: object.component, x, y,
        centerScienceMJySr: patches.sci[cy][cx], centerErrorMJySr: patches.err[cy][cx], centerWeight: patches.wht[cy][cx],
        centerContextValue: patches.con[cy][cx], centerContributionCount: popcount(patches.con[cy][cx]),
        centerSegmentationLabel: patches.segm[cy][cx], nearestCatalogLabel: source.label,
        nearestCatalogDistanceArcsec: source.arcsec, secondCatalogDistanceArcsec: source.secondArcsec,
        catalogMatchedAt0_3Arcsec: source.matched,
        validCoverage: Number.isFinite(patches.sci[cy][cx]) && Number.isFinite(patches.err[cy][cx]) && patches.wht[cy][cx] > 0 && patches.con[cy][cx] !== 0,
        reference: measure(patches, x0, y0, x, y, Number(header.PIXAR_SR), settings.reference),
        sensitivity: measure(patches, x0, y0, x, y, Number(header.PIXAR_SR), settings.sensitivity)
      });
    }
  } finally {
    image.close();
    segmentation.close();
  }
}

const python = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/rc68-target-first-ledger-python.json"), "utf8"));
const pythonRows = new Map(python.ledger.map(row => [`${row.band}|${row.authorId}`, row]));
const numericFields = [
  ["x", row => row.mosaicX], ["y", row => row.mosaicY], ["centerScienceMJySr", row => row.centerScienceMJySr],
  ["centerErrorMJySr", row => row.centerErrorMJySr], ["centerWeight", row => row.centerWeight],
  ["nearestCatalogDistanceArcsec", row => row.nearestCatalogDistanceArcsec], ["secondCatalogDistanceArcsec", row => row.secondCatalogDistanceArcsec]
];
const measurementFields = ["fluxJy", "pipelineErrorJy", "annulusNoiseJy", "backgroundLevelErrorJy", "combinedErrorJy", "signalToNoise", "backgroundMJySr", "backgroundRobustSigmaMJySr", "finiteWeightFraction", "apertureSegmentedFraction"];
const maxAbsoluteDifference = {};
const mismatches = [];
for (const row of independentRows) {
  const expected = pythonRows.get(`${row.band}|${row.authorId}`);
  if (!expected) { mismatches.push(`${row.band} ${row.authorId}: missing Python row`); continue; }
  for (const [name, getter] of numericFields) {
    const difference = Math.abs(row[name] - getter(expected));
    maxAbsoluteDifference[name] = Math.max(maxAbsoluteDifference[name] || 0, difference);
  }
  for (const name of ["centerContextValue", "centerContributionCount", "centerSegmentationLabel", "nearestCatalogLabel", "catalogMatchedAt0_3Arcsec", "validCoverage"]) {
    if (row[name] !== expected[name]) mismatches.push(`${row.band} ${row.authorId}: ${name}`);
  }
  for (const reduction of ["reference", "sensitivity"]) {
    for (const name of measurementFields) {
      const difference = Math.abs(row[reduction][name] - expected[reduction][name]);
      const key = `${reduction}.${name}`;
      maxAbsoluteDifference[key] = Math.max(maxAbsoluteDifference[key] || 0, difference);
    }
    for (const name of ["backgroundPixels", "backgroundFallback"]) {
      if (row[reduction][name] !== expected[reduction][name]) mismatches.push(`${row.band} ${row.authorId}: ${reduction}.${name}`);
    }
  }
}

const counts = {};
for (const band of Object.keys(bands)) {
  const rows = independentRows.filter(row => row.band === band);
  const misses = rows.filter(row => !row.catalogMatchedAt0_3Arcsec);
  counts[band] = {
    rows: rows.length,
    validCoverage: rows.filter(row => row.validCoverage).length,
    centerSegmented: rows.filter(row => row.centerSegmentationLabel !== 0).length,
    catalogMatched: rows.filter(row => row.catalogMatchedAt0_3Arcsec).length,
    catalogMisses: misses.length,
    catalogMissCenterSegmented: misses.filter(row => row.centerSegmentationLabel !== 0).length,
    catalogMissReferenceSnrAbove3: misses.filter(row => row.reference.signalToNoise >= 3).length,
    catalogMissReferenceSnrAbove5: misses.filter(row => row.reference.signalToNoise >= 5).length,
    referencePositiveFlux: rows.filter(row => row.reference.fluxJy > 0).length,
    sensitivityPositiveFlux: rows.filter(row => row.sensitivity.fluxJy > 0).length,
    fluxSignDiscordance: rows.filter(row => (row.reference.fluxJy > 0) !== (row.sensitivity.fluxJy > 0)).length
  };
}

const result = {
  cycleId: "RC-2026-68", experimentId: "PHOST-PF1A",
  implementation: "dependency-free-node-fits-tan-wcs-and-aperture-reduction",
  rows: independentRows.length, counts, maxAbsoluteDifference, mismatches,
  gates: {
    allRowsRecomputed: independentRows.length === 284,
    categoricalAgreement: mismatches.length === 0,
    wcsAgreementWithin1e_6Pixel: Math.max(maxAbsoluteDifference.x || 0, maxAbsoluteDifference.y || 0) <= 1e-6,
    fluxAgreementWithin1e_12Jy: Math.max(maxAbsoluteDifference["reference.fluxJy"] || 0, maxAbsoluteDifference["sensitivity.fluxJy"] || 0) <= 1e-12
  },
  claimBoundary: "The independent implementation reproduces FITS headers, TAN WCS, center states, catalog distances, sigma-clipped backgrounds, and both fixed-aperture fluxes. It is not an independent exposure-level PSF pipeline."
};
if (write) fs.writeFileSync(path.join(root, "research/reproducibility/rc68-target-first-ledger-node.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
