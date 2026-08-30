import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, match => match.slice(1))), "..");
const dirIndex = process.argv.indexOf("--download-dir");
const sourceDir = path.resolve(dirIndex >= 0 ? process.argv[dirIndex + 1] : ".cache/rc66-perfect-host-source");
const write = process.argv.includes("--write");
const tau = Math.hypot(0.017, 0.017);
const requiredSlope = 0.07;
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

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

function gls(rows, withSlope) {
  const covariance = rows.map((row, i) => rows.map((_, j) => i === j ? row.sigma ** 2 : tau ** 2));
  const cInverse = inverse(covariance);
  const design = rows.map(row => withSlope ? [1, row.hst - 29.397] : [1]);
  const designT = transpose(design);
  const normalInverse = inverse(matmul(matmul(designT, cInverse), design));
  const coefficients = matvec(normalInverse, matvec(matmul(designT, cInverse), rows.map(row => row.delta)));
  return { coefficients, standardErrors: coefficients.map((_, index) => Math.sqrt(normalInverse[index][index])) };
}

function parseNgc4038(file) {
  const fields = fs.readFileSync(file, "utf8").split(/\r?\n/).find(line => line.startsWith("N4038\t")).split("\t");
  const hst = Number(fields[1]);
  const hstSigma = Number(fields[2]);
  const jwst = Number(fields[5]);
  const jwstSigma = Number(fields[6]);
  return { host: "NGC4038", hst, hstSigma, jwst, jwstSigma, delta: jwst - hst, sigma: Math.hypot(jwstSigma, hstSigma), filter: "F150W", source: "2024-table-a2-shoes" };
}

function parseMrt(file) {
  const pattern = /^(N3447(?:Spiral|A)?)[ ]+([0-9.]+)[ ]+([0-9.]+)[ ]+([0-9.]+)/;
  return fs.readFileSync(file, "utf8").split(/\r?\n/).flatMap(line => {
    const match = line.match(pattern);
    return match ? [{ host: match[1], id: match[2], ra: Number(match[3]), dec: Number(match[4]) }] : [];
  });
}

function metric(row, definition) {
  const x = (row.ra - definition.raDeg) * 60 * Math.cos(definition.decDeg * Math.PI / 180);
  const y = (row.dec - definition.decDeg) * 60;
  const angle = definition.positionAngleDeg * Math.PI / 180;
  const major = x * Math.cos(angle) + y * Math.sin(angle);
  const minor = -x * Math.sin(angle) + y * Math.cos(angle);
  return (major / definition.majorSemiaxisArcmin) ** 2 + (minor / definition.minorSemiaxisArcmin) ** 2;
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/rc66-perfect-host-source-manifest.json"), "utf8"));
const predecessor = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/rc65-jwst-host-audit-node.json"), "utf8"));
const sourceHashes = manifest.files.map(item => {
  const file = path.join(sourceDir, item.file);
  const bytes = fs.statSync(file).size;
  const hash = sha256(file);
  return { file: item.file, bytes, sha256: hash, matchesManifest: bytes === item.bytes && hash === item.sha256 };
});
const predecessorHashes = manifest.frozenPredecessors.map(item => {
  const file = path.join(root, item.file);
  const hash = sha256(file);
  return { file: item.file, sha256: hash, matchesManifest: hash === item.sha256 };
});
const mainTexPath = path.join(sourceDir, "2509.01667v1", "main.tex");
const mainTex = fs.readFileSync(mainTexPath);
const mainText = mainTex.toString("utf8");

const ngc4038 = parseNgc4038(path.join(sourceDir, "apjad8c21t6_ascii.txt"));
const rows = [...predecessor.hostSummary.hosts.map(row => ({ ...row })), ngc4038];
const meanFit = gls(rows, false);
const slopeFit = gls(rows, true);
const deletions = rows.map(removed => {
  const reduced = rows.filter(row => row.host !== removed.host);
  const mean = gls(reduced, false);
  const slope = gls(reduced, true);
  return {
    removedHost: removed.host,
    meanMag: mean.coefficients[0],
    meanMovementMag: mean.coefficients[0] - meanFit.coefficients[0],
    slopeMagPerMag: slope.coefficients[1],
    slopeStandardError: slope.standardErrors[1],
    requiredSlopeExclusionSigma: (requiredSlope - slope.coefficients[1]) / slope.standardErrors[1]
  };
}).sort((a, b) => Math.abs(b.meanMovementMag) - Math.abs(a.meanMovementMag));

const objects = parseMrt(path.join(root, ".cache/rc65-jwst-host-source/apjlae0ad6t3_mrt.txt"));
const spiralDefinition = { raDeg: 163.350, decDeg: 16.774, positionAngleDeg: 95, majorSemiaxisArcmin: 1.6, minorSemiaxisArcmin: 0.7 };
const tidalDefinition = { raDeg: 163.372, decDeg: 16.786, positionAngleDeg: -30, majorSemiaxisArcmin: 0.6, minorSemiaxisArcmin: 0.5 };
const classified = objects.map(row => {
  const spiralMetric = metric(row, spiralDefinition);
  const tidalMetric = metric(row, tidalDefinition);
  return { ...row, spiralMetric, tidalMetric, insideSpiral: spiralMetric <= 1, insideTidal: tidalMetric <= 1 };
});
const chordRows = classified.filter(row => row.host === "N3447" && row.insideTidal);
const regionReplay = {
  releasedRows: classified.length,
  labelCounts: Object.fromEntries(["N3447Spiral", "N3447A", "N3447"].map(host => [host, classified.filter(row => row.host === host).length])),
  allSpiralLabelsInsideSpiralOnly: classified.filter(row => row.host === "N3447Spiral").every(row => row.insideSpiral && !row.insideTidal),
  allTidalLabelsInsideTidalOnly: classified.filter(row => row.host === "N3447A").every(row => row.insideTidal && !row.insideSpiral),
  figureDefinedChordExclusions: chordRows.map(row => ({ id: row.id, ra: row.ra, dec: row.dec, tidalEllipseMetric: row.tidalMetric })),
  otherRowsOutsideBothEllipses: classified.filter(row => row.host === "N3447" && !row.insideSpiral && !row.insideTidal).length,
  analyticEllipseLabelsClosed: chordRows.length === 2 && classified.filter(row => row.host === "N3447Spiral").every(row => row.insideSpiral) && classified.filter(row => row.host === "N3447A").every(row => row.insideTidal),
  numericChordBoundaryAvailable: false
};

const spiralSe = 0.030;
const tidalSe = 0.025;
const contrastSe = 0.028;
const covariance = (spiralSe ** 2 + tidalSe ** 2 - contrastSe ** 2) / 2;
const commonSigma = Math.sqrt(covariance);
const spiralUnique = Math.sqrt(spiralSe ** 2 - covariance);
const tidalUnique = Math.sqrt(tidalSe ** 2 - covariance);
const reconstructed = Math.hypot(spiralUnique, tidalUnique);
const covarianceClosure = {
  impliedCovarianceMag2: covariance,
  impliedCorrelation: covariance / (spiralSe * tidalSe),
  impliedCommonModeSigmaMag: commonSigma,
  spiralSpecificSigmaMag: spiralUnique,
  tidalSpecificSigmaMag: tidalUnique,
  reconstructedContrastSigmaMag: reconstructed,
  naiveIndependentContrastSigmaMag: Math.hypot(spiralSe, tidalSe),
  naiveOverstatementFraction: Math.hypot(spiralSe, tidalSe) / contrastSe - 1,
  closesPublishedContrastError: Math.abs(reconstructed - contrastSe) <= 1e-12
};
const phaseLineage = {
  reportedPhaseCorrections: 154,
  reportedAllFitObjects: 144,
  releasedObjectRows: objects.length,
  releasedMinusAll: objects.length - 144,
  releasedMinusCorrections: objects.length - 154,
  wholeSampleEffectiveSizeMultiplier: (0.19 / 0.17) ** 2,
  spiralQuadratureScatterRemovedMag: Math.sqrt(0.201 ** 2 - 0.194 ** 2),
  tidalQuadratureScatterRemovedMag: Math.sqrt(0.137 ** 2 - 0.121 ** 2),
  identityMappingExecutable: false,
  reason: "The version-of-record MRT publishes corrected F150W only; the source archive contains one illustrative Table B row and no per-object correction ledger, uncorrected photometry, phase estimates, or fit flags."
};
const sourceArchive = {
  memberCount: manifest.files.find(item => item.file === "2509.01667v1.tar").archiveMembers,
  mainTexBytes: mainTex.length,
  mainTexSha256: sha256(mainTexPath),
  inlineTableBPhotometryRows: (mainText.match(/^N3447\s*&/gm) || []).length,
  containsPhaseTransform: mainText.includes("F090W = 1.18(F814W)-0.18(F555W)"),
  containsReportedPhaseCount: mainText.includes("set of 154 individual phase corrections"),
  containsExecutablePerObjectCorrectionLedger: false
};

const minimumDeletionSigma = Math.min(...deletions.map(item => item.requiredSlopeExclusionSigma));
const allHashesMatch = [...sourceHashes, ...predecessorHashes].every(item => item.matchesManifest);
const result = {
  cycleId: "RC-2026-66",
  implementation: "dependency-free-node",
  sourceAudit: { newSourceHashes: sourceHashes, predecessorHashes, allHashesMatch, authorSourceArchive: sourceArchive },
  nineteenHostClosure: {
    hostCount: rows.length, addedRow: ngc4038,
    glsMeanMag: meanFit.coefficients[0], glsMeanStandardErrorMag: meanFit.standardErrors[0],
    glsDistanceInterceptMag: slopeFit.coefficients[0], glsDistanceSlopeMagPerMag: slopeFit.coefficients[1], glsDistanceSlopeStandardError: slopeFit.standardErrors[1],
    requiredCrowdingSlopeMagPerMag: requiredSlope, requiredCrowdingSlopeExclusionSigma: (requiredSlope - slopeFit.coefficients[1]) / slopeFit.standardErrors[1],
    leaveOneHostOut: deletions, maximumMeanInfluence: deletions[0], minimumLeaveOneOutRequiredSlopeExclusionSigma: minimumDeletionSigma,
    publishedMeanAndSlopeReproduced: Math.abs(meanFit.coefficients[0] + 0.022) <= 0.005 && Math.abs(slopeFit.coefficients[1] + 0.005) <= 0.005
  },
  regionReplay,
  summaryCovarianceClosure: covarianceClosure,
  phaseCorrectionLineage: phaseLineage,
  gates: {
    sourceIntegrity: allHashesMatch,
    completeNineteenHostNumericalFixture: rows.length === 19,
    publishedNineteenHostSummary: Math.abs(meanFit.coefficients[0] + 0.022) <= 0.005 && Math.abs(slopeFit.coefficients[1] + 0.005) <= 0.005,
    crowdingSlopeUnderEveryDeletion: minimumDeletionSigma >= 3,
    componentEllipseReplay: regionReplay.analyticEllipseLabelsClosed,
    numericChordBoundary: regionReplay.numericChordBoundaryAvailable,
    summaryCovarianceClosure: covarianceClosure.closesPublishedContrastError,
    objectPhaseLineage: phaseLineage.identityMappingExecutable,
    objectLevelFitClosure: false,
    globalH0Refit: false
  },
  claimBoundary: "The numerical nineteen-host summary, analytic ellipse memberships, and summary-level component covariance now close. The figure-defined chord, 154-to-144-to-142 identity transitions, per-object phase corrections, object-level component likelihood, and current global H0 refit do not."
};

if (write) fs.writeFileSync(path.join(root, "research/reproducibility/rc66-perfect-host-closure-node.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
