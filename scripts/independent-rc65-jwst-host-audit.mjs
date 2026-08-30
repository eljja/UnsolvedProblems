import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, match => match.slice(1))), "..");
const dirIndex = process.argv.indexOf("--download-dir");
const sourceDir = path.resolve(dirIndex >= 0 ? process.argv[dirIndex + 1] : ".cache/rc65-jwst-host-source");
const write = process.argv.includes("--write");
const tauPrimary = Math.hypot(0.017, 0.017);
const requiredSlope = 0.07;

const readText = file => fs.readFileSync(path.join(sourceDir, file), "utf8");
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(path.join(sourceDir, file))).digest("hex");
const clean = value => value
  .replace(/<annotation[\s\S]*?<\/annotation>/g, "")
  .replace(/<[^>]+>/g, "")
  .replaceAll("&minus;", "-").replaceAll("&#x2212;", "-").replaceAll("−", "-").replaceAll("–", "-")
  .replaceAll("&nbsp;", " ").replaceAll("&#160;", " ").replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&")
  .replace(/\s+/g, " ").trim();

function parseTable1() {
  return readText("apjlae0ad6t1_ascii.txt").split(/\r?\n/).flatMap(line => {
    const fields = line.split("\t").map(value => value.trim());
    if (fields.length < 5 || !/^(?:HST |JWST )/.test(fields[0])) return [];
    return [{ label: fields[0], mu: Number(fields[1]), sigma: Number(fields[2].match(/[0-9.]+/)[0]), n: Number(fields[3]), scatter: Number(fields[4]) }];
  });
}

function parseTableA1() {
  return readText("apjlae0ad6t2_ascii.txt").split(/\r?\n/).flatMap(line => {
    const fields = line.split("\t").map(value => value.trim());
    if (fields.length < 6 || !/^(?:NGC \d+|M101)$/.test(fields[0])) return [];
    return [{ host: fields[0].replaceAll(" ", ""), jwst: Number(fields[1]), jwstSigma: Number(fields[2]), hst: Number(fields[3]), hstSigma: Number(fields[4]), filter: fields[5] }];
  });
}

function parseMrt() {
  const pattern = /^(N3447(?:Spiral|A)?)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)/;
  return readText("apjlae0ad6t3_mrt.txt").split(/\r?\n/).flatMap(line => {
    const match = line.match(pattern);
    if (!match) return [];
    return [{ host: match[1], id: match[2], ra: Number(match[3]), dec: Number(match[4]), logP: Number(match[5]), f150w: Number(match[6]), f150wSigma: Number(match[7]), color: Number(match[8]), colorSigma: Number(match[9]) }];
  });
}

function parsePriorTable() {
  const html = readText("2401.04773v1.html");
  const table = html.match(/<table id="S3\.T3\.6"[\s\S]*?<\/table>/)[0];
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(match => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cell => clean(cell[1])));
  const anchor = rows.find(cells => cells[0] === "n4258");
  const hosts = rows.filter(cells => cells.length === 17 && cells[0]?.startsWith("n") && cells[0] !== "n4258").map(cells => ({ host: cells[0].toUpperCase(), jwst: Number(cells[7]), hst: Number(cells[13]), delta: Number(cells[15]), deltaSigma: Number(cells[16]), filter: "F150W" }));
  return { hosts, anchor: { jwstInterceptSigma: Number(anchor[5]), hstInterceptSigma: Number(anchor[11]) } };
}

function solve(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    if (Math.abs(a[pivot][column]) < 1e-15) throw new Error("singular matrix");
    [a[column], a[pivot]] = [a[pivot], a[column]];
    const scale = a[column][column];
    for (let item = 0; item <= n; item += 1) a[column][item] /= scale;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = a[row][column];
      for (let item = 0; item <= n; item += 1) a[row][item] -= factor * a[column][item];
    }
  }
  return a.map(row => row[n]);
}

function inverse(matrix) {
  const columns = matrix.map((_, index) => solve(matrix, matrix.map((__, row) => Number(row === index))));
  return matrix.map((_, row) => columns.map(column => column[row]));
}

const transpose = matrix => matrix[0].map((_, column) => matrix.map(row => row[column]));
const matmul = (left, right) => {
  const rightT = transpose(right);
  return left.map(row => rightT.map(column => row.reduce((sum, value, index) => sum + value * column[index], 0)));
};
const matvec = (matrix, vector) => matrix.map(row => row.reduce((sum, value, index) => sum + value * vector[index], 0));

function gls(rows, tau, withSlope) {
  const covariance = rows.map((row, i) => rows.map((_, j) => i === j ? row.sigma ** 2 : tau ** 2));
  const cInverse = inverse(covariance);
  const design = rows.map(row => withSlope ? [1, row.hst - 29.397] : [1]);
  const designT = transpose(design);
  const normalInverse = inverse(matmul(matmul(designT, cInverse), design));
  const beta = matvec(normalInverse, matvec(matmul(designT, cInverse), rows.map(row => row.delta)));
  return { coefficients: beta, standardErrors: beta.map((_, index) => Math.sqrt(normalInverse[index][index])) };
}

function assembleHosts(table1, tableA1, prior) {
  const rows = tableA1.map(item => ({ ...item, delta: item.jwst - item.hst, sigma: Math.hypot(item.jwstSigma, item.hstSigma), source: "2025-table-a1" }));
  const hst = table1.find(item => item.label.startsWith("HST Refit"));
  const jwst = table1.find(item => item.label === "JWST N3447 All");
  rows.push({ host: "NGC3447", jwst: jwst.mu, hst: hst.mu, delta: jwst.mu - hst.mu, sigma: Math.hypot(jwst.sigma, hst.sigma), filter: "F150W", source: "2025-table1" });
  const existing = new Set(rows.map(row => row.host));
  for (const item of prior) {
    const host = item.host.replace(/^N/, "NGC");
    if (!existing.has(host)) rows.push({ ...item, host, sigma: item.deltaSigma, source: "2024-table3" });
  }
  return rows;
}

function component(records, weighting) {
  const prepared = records.map(record => {
    const value = record.f150w - 0.4 * record.color + 3.25 * record.logP;
    if (weighting === "unweighted") return { value, weight: 1 };
    const sigma = weighting === "f150w" ? record.f150wSigma : Math.hypot(record.f150wSigma, 0.4 * record.colorSigma);
    return { value, weight: 1 / sigma ** 2 };
  });
  const intercept = prepared.reduce((sum, item) => sum + item.value * item.weight, 0) / prepared.reduce((sum, item) => sum + item.weight, 0);
  const rms = Math.sqrt(prepared.reduce((sum, item) => sum + (item.value - intercept) ** 2, 0) / prepared.length);
  return { n: records.length, intercept, rms };
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/rc65-jwst-host-source-manifest.json"), "utf8"));
const hashes = manifest.files.map(item => {
  const target = path.join(sourceDir, item.file);
  const bytes = fs.statSync(target).size;
  const hash = sha256(item.file);
  return { file: item.file, bytes, sha256: hash, matchesManifest: bytes === item.bytes && hash === item.sha256 };
});
const table1 = parseTable1();
const tableA1 = parseTableA1();
const cepheids = parseMrt();
const prior = parsePriorTable();
const rows = assembleHosts(table1, tableA1, prior.hosts);
const baselineMean = gls(rows, tauPrimary, false);
const baselineSlope = gls(rows, tauPrimary, true);
const leaveOneHostOut = rows.map(removed => {
  const reduced = rows.filter(row => row.host !== removed.host);
  const mean = gls(reduced, tauPrimary, false);
  const slope = gls(reduced, tauPrimary, true);
  return {
    removedHost: removed.host,
    meanMag: mean.coefficients[0],
    meanMovementMag: mean.coefficients[0] - baselineMean.coefficients[0],
    slopeMagPerMag: slope.coefficients[1],
    slopeStandardError: slope.standardErrors[1],
    requiredSlopeExclusionSigma: (requiredSlope - slope.coefficients[1]) / slope.standardErrors[1]
  };
}).sort((a, b) => Math.abs(b.meanMovementMag) - Math.abs(a.meanMovementMag));
const sensitivity = [0, 0.017, tauPrimary, 0.03].map(tau => {
  const mean = gls(rows, tau, false);
  const slope = gls(rows, tau, true);
  return { sharedAnchorSigmaMag: tau, meanMag: mean.coefficients[0], meanStandardErrorMag: mean.standardErrors[0], slopeMagPerMag: slope.coefficients[1], slopeStandardError: slope.standardErrors[1] };
});
const filterGroups = ["F115W", "F150W"].map(filter => {
  const subset = rows.filter(row => row.filter === filter);
  const fit = gls(subset, tauPrimary, false);
  return { filter, n: subset.length, meanMag: fit.coefficients[0], meanStandardErrorMag: fit.standardErrors[0] };
});
const groupCounts = Object.fromEntries(["N3447Spiral", "N3447A", "N3447"].map(host => [host, cepheids.filter(row => row.host === host).length]));
const objectFits = ["unweighted", "f150w", "propagated"].map(weighting => {
  const spiral = component(cepheids.filter(row => row.host === "N3447Spiral"), weighting);
  const tidal = component(cepheids.filter(row => row.host === "N3447A"), weighting);
  const contrast = tidal.intercept - spiral.intercept;
  return {
    weighting, spiral, tidal, tidalMinusSpiralMag: contrast,
    contrastResidualFromPublishedMag: contrast - 0.002,
    spiralScatterResidualMag: spiral.rms - 0.194,
    tidalScatterResidualMag: tidal.rms - 0.121,
    semanticClosure: Math.abs(contrast - 0.002) <= 0.01 && Math.abs(spiral.rms - 0.194) <= 0.01 && Math.abs(tidal.rms - 0.121) <= 0.01
  };
});
const slope = baselineSlope.coefficients[1];
const slopeSe = baselineSlope.standardErrors[1];
const minimumDeletionSigma = Math.min(...leaveOneHostOut.map(item => item.requiredSlopeExclusionSigma));
const anyClosure = objectFits.some(item => item.semanticClosure);

const result = {
  cycleId: "RC-2026-65",
  implementation: "dependency-free-node",
  sourceAudit: {
    hashes, table1Rows: table1.length, tableA1Rows: tableA1.length, table3PriorHostRows: prior.hosts.length,
    machineReadableCepheidRows: cepheids.length, machineReadableGroups: groupCounts,
    publishedAllCepheidCount: 144, publishedPhaseCorrectionCount: 154,
    rowShortfallVersusAll: 144 - cepheids.length, rowShortfallVersusPhaseCorrections: 154 - cepheids.length,
    allHashesMatch: hashes.every(item => item.matchesManifest)
  },
  hostSummary: {
    hostCount: rows.length, hosts: rows, missingNumericHost: "NGC4038", sharedAnchorSigmaMag: tauPrimary, anchorInterceptErrors: prior.anchor,
    glsMeanMag: baselineMean.coefficients[0], glsMeanStandardErrorMag: baselineMean.standardErrors[0],
    glsDistanceInterceptMag: baselineSlope.coefficients[0], glsDistanceSlopeMagPerMag: slope, glsDistanceSlopeStandardError: slopeSe,
    requiredCrowdingSlopeMagPerMag: requiredSlope, requiredCrowdingSlopeExclusionSigma: (requiredSlope - slope) / slopeSe,
    publishedSummaryReproduced: Math.abs(baselineMean.coefficients[0] + 0.022) <= 0.005 && Math.abs(baselineMean.standardErrors[0] - 0.029) <= 0.005 && Math.abs(slope + 0.005) <= 0.005 && Math.abs(slopeSe - 0.014) <= 0.005,
    leaveOneHostOut, maximumMeanInfluence: leaveOneHostOut[0], minimumLeaveOneOutRequiredSlopeExclusionSigma: minimumDeletionSigma,
    crowdingSlopeRejectedUnderEveryDeletion: minimumDeletionSigma >= 3, sharedAnchorSensitivity: sensitivity, filterGroupDiagnostic: filterGroups
  },
  perfectHostPublishedContrast: {
    tidalMinusSpiralMag: 0.002, standardErrorMag: 0.028, requiredCrowdingOffsetMag: 0.17,
    requiredOffsetExclusionSigma: 6, requiredOffsetRejectedAtFiveSigma: true
  },
  objectLevelSemanticClosure: {
    formula: "W_H=F150W-0.4*(V-I), slope=-3.25", declaredFits: objectFits, anyDeclaredFitCloses: anyClosure,
    decision: anyClosure ? "closed" : "stop-and-request-missing-transformation-selection-covariance-lineage"
  },
  gates: {
    sourceHashes: hashes.every(item => item.matchesManifest), publishedHostSummary: Math.abs(baselineMean.coefficients[0] + 0.022) <= 0.005 && Math.abs(slope + 0.005) <= 0.005,
    oneHostMeanStability: Math.abs(leaveOneHostOut[0].meanMovementMag) < 0.01, crowdingSlopeUnderDeletion: minimumDeletionSigma >= 3,
    publishedPerfectHostContrast: true, machineReadableCoverage: cepheids.length === 144, objectLevelSemanticClosure: anyClosure,
    completeNineteenHostReproduction: false, globalH0Refit: false
  },
  claimBoundary: "The public eighteen-host summaries and published NGC 3447 differential contrast are admissible. The complete nineteen-host fit, object-level perfect-host reconstruction, and current global H0 refit are not."
};

if (write) fs.writeFileSync(path.join(root, "research/reproducibility/rc65-jwst-host-audit-node.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
