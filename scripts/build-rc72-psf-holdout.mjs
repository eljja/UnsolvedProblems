import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const root = path.resolve(process.cwd());
const repro = path.join(root, "research", "reproducibility");
const work = path.join(root, ".cache", "rc69-phost-ast", "dolphot-work");
const contractPath = path.join(repro, "rc72-psf-rescue-contract.json");
const dagPath = path.join(repro, "rc72-adaptation-dag.json");
const designPath = path.join(repro, "rc70-detector-tile-design.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const design = JSON.parse(fs.readFileSync(designPath, "utf8"));

const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const round = (value, digits = 6) => Number(value.toFixed(digits));

function psfCoordinates(detector) {
  const file = path.join(work, `rc70-${detector.toLowerCase()}.phot.psfs`);
  return fs.readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean).map(line => {
    const values = line.trim().split(/\s+/).map(Number);
    return { x: values[2], y: values[3] };
  });
}

function excludedByPsf(x, y, psf) {
  return psf.some(star => Math.hypot(x - star.x, y - star.y) <= contract.eligibility.psfTrainingExclusionRadiusReferencePixels);
}

function parseExposure(values, imageIndex, filename, filter) {
  const base = 38 + (imageIndex - 1) * 13;
  return {
    imageIndex,
    filename: `${filename}.fits`,
    filter,
    normalizedRate: values[base + 2],
    magnitude: values[base + 4],
    magnitudeError: values[base + 6],
    snr: values[base + 8],
    sharpness: values[base + 9],
    crowding: values[base + 11],
    flag: values[base + 12]
  };
}

async function parseCatalogue(detector) {
  const tile = design.tiles.find(item => item.detector === detector);
  const catalogue = path.join(work, `rc70-${detector.toLowerCase()}.phot`);
  const psf = psfCoordinates(detector);
  const [xMin, yMin, xMax, yMax] = [tile.photsec[2], tile.photsec[3], tile.photsec[4], tile.photsec[5]];
  const xMid = (xMin + xMax) / 2;
  const yMid = (yMin + yMax) / 2;
  const neighbors = [];
  const eligible = [];
  const input = fs.createReadStream(catalogue);
  const reader = readline.createInterface({ input, crlfDelay: Infinity });
  let row = 0;
  for await (const line of reader) {
    if (!line.trim()) continue;
    row += 1;
    const values = line.trim().split(/\s+/).map(Number);
    const x = values[2];
    const y = values[3];
    const type = values[10];
    const snr090 = values[20];
    const sharp090 = values[21];
    const crowd090 = values[23];
    const flag090 = values[24];
    const snr150 = values[33];
    const sharp150 = values[34];
    const crowd150 = values[36];
    const flag150 = values[37];
    if (type <= 2 && Math.max(snr090, snr150) >= 4) neighbors.push({ row, x, y });
    const inside = x >= xMin + 20 && x <= xMax - 20 && y >= yMin + 20 && y <= yMax - 20;
    const quality = type <= 2 && snr090 >= 10 && snr150 >= 10 && sharp090 ** 2 <= 0.01 && sharp150 ** 2 <= 0.01 && crowd090 <= 0.5 && crowd150 <= 0.5 && flag090 <= 2 && flag150 <= 2;
    if (!inside || !quality || excludedByPsf(x, y, psf)) continue;
    const cell = `x${x >= xMid ? 1 : 0}y${y >= yMid ? 1 : 0}`;
    const exposures = tile.expectedImageIndices.map((imageIndex, index) => parseExposure(values, imageIndex, tile.expectedImages[index], index < 4 ? "F090W" : "F150W"));
    eligible.push({
      row,
      detector,
      x: round(x, 3),
      y: round(y, 3),
      cell,
      type,
      combined: {
        F090W: { snr: snr090, sharpness: sharp090, crowding: crowd090, flag: flag090 },
        F150W: { snr: snr150, sharpness: sharp150, crowding: crowd150, flag: flag150 }
      },
      exposures
    });
  }
  for (const source of eligible) {
    let nearest = Infinity;
    for (const other of neighbors) {
      if (other.row === source.row) continue;
      const distance = Math.hypot(source.x - other.x, source.y - other.y);
      if (distance < nearest) nearest = distance;
    }
    source.nearestNeighborPixels = round(nearest, 4);
    source.hash = digest(`RC72|CORE-DIAGNOSTIC|${detector}|${source.cell}|${source.x.toFixed(3)}|${source.y.toFixed(3)}`);
  }
  return { tile, catalogue, psfCount: psf.length, eligible };
}

function cellCounts(rows, radius) {
  const cells = Object.fromEntries(contract.spatialSplit.cells.map(cell => [cell, 0]));
  for (const row of rows.filter(item => item.nearestNeighborPixels >= radius)) cells[row.cell] += 1;
  return cells;
}

const parsed = [];
for (const detector of ["NRCB1", "NRCB2"]) parsed.push(await parseCatalogue(detector));

const support = {
  cycleId: contract.cycleId,
  experimentId: contract.experimentId,
  openedData: "DOLPHOT catalogue coordinates and quality metrics only; no CAL-pixel aperture flux",
  supportRulesWereDevelopmentInspected: true,
  detectors: parsed.map(({ tile, catalogue, psfCount, eligible }) => ({
    detector: tile.detector,
    catalogue: path.relative(root, catalogue).replaceAll("\\", "/"),
    catalogueSha256: sha(catalogue),
    catalogueRows: fs.readFileSync(catalogue, "utf8").trim().split(/\r?\n/).length,
    psfTrainingStars: psfCount,
    purityEligibleBeforeIsolation: eligible.length,
    tracks: {
      "EE80-INDEPENDENT": {
        neighborExclusionRadiusPixels: 10.2,
        perCell: cellCounts(eligible, 10.2)
      },
      "CORE-DIAGNOSTIC": {
        neighborExclusionRadiusPixels: 6.0,
        perCell: cellCounts(eligible, 6.0)
      }
    }
  }))
};
for (const detector of support.detectors) {
  for (const track of Object.values(detector.tracks)) {
    track.total = Object.values(track.perCell).reduce((sum, value) => sum + value, 0);
    track.minimumCell = Math.min(...Object.values(track.perCell));
    track.supportPass = track.minimumCell >= contract.spatialSplit.selectionPerCell;
  }
}
support.gates = {
  ee80Independent: {
    pass: support.detectors.every(item => item.tracks["EE80-INDEPENDENT"].supportPass),
    criterion: "At least eight eligible non-overlapping EE80 stars in every 2x2 cell of both detectors."
  },
  coreDiagnostic: {
    pass: support.detectors.every(item => item.tracks["CORE-DIAGNOSTIC"].supportPass),
    criterion: "At least eight eligible six-pixel-isolated stars in every 2x2 cell of both detectors."
  }
};
support.firstDivergence = support.gates.ee80Independent.pass ? "none-before-EE80-residual" : "EE80-INDEPENDENT support";
support.decision = support.gates.ee80Independent.pass
  ? "A future large-aperture residual may be preregistered; RC72 still executes only the frozen core diagnostic."
  : "Stop the large-aperture route without reading a residual; continue only the separately bounded core diagnostic if its support gate passes.";

const candidates = [];
for (const item of parsed) {
  for (const cell of contract.spatialSplit.cells) {
    const pool = item.eligible.filter(row => row.cell === cell && row.nearestNeighborPixels >= 6).sort((a, b) => a.hash.localeCompare(b.hash));
    candidates.push(...pool.slice(0, contract.spatialSplit.selectionPerCell).map((row, rank) => ({ ...row, rankInCell: rank + 1 })));
  }
}
const manifest = {
  cycleId: contract.cycleId,
  experimentId: `${contract.experimentId}-CORE-HOLDOUT`,
  roleBoundary: contract.spatialSplit.role,
  selectionRule: contract.spatialSplit.hash,
  expectedPerDetector: contract.spatialSplit.selectionPerCell * contract.spatialSplit.cells.length,
  candidateCount: candidates.length,
  candidates
};

const supportPath = path.join(repro, "rc72-psf-holdout-support.json");
const manifestPath = path.join(repro, "rc72-core-holdout-manifest.json");
fs.writeFileSync(supportPath, `${JSON.stringify(support, null, 2)}\n`);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const receipt = {
  cycleId: contract.cycleId,
  sealedOn: contract.sealedOn,
  outcomeBoundary: "No CAL-pixel aperture flux or cross-method residual had been computed when these hashes were created.",
  developmentInspectionDisclosed: true,
  artifacts: [contractPath, dagPath, supportPath, manifestPath].map(file => ({
    file: path.relative(root, file).replaceAll("\\", "/"),
    bytes: fs.statSync(file).size,
    sha256: sha(file)
  })),
  candidateCounts: Object.fromEntries(["NRCB1", "NRCB2"].map(detector => [detector, candidates.filter(item => item.detector === detector).length])),
  authorizedNextAction: support.gates.coreDiagnostic.pass ? "Run exactly one frozen CORE-DIAGNOSTIC CAL-pixel integration." : "Stop without reading CAL-pixel outcomes."
};
const receiptPath = path.join(repro, "rc72-preregistration-receipt.json");
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

console.log(JSON.stringify({
  support: path.relative(root, supportPath),
  manifest: path.relative(root, manifestPath),
  receipt: path.relative(root, receiptPath),
  gates: support.gates,
  supportByDetector: support.detectors.map(item => ({ detector: item.detector, tracks: item.tracks })),
  candidates: receipt.candidateCounts,
  authorizedNextAction: receipt.authorizedNextAction
}, null, 2));
