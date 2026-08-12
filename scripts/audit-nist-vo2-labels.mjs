import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "research/external-audit/nist-vo2-2020/human-labels.json");
const resultPath = path.join(root, "research/external-audit/nist-vo2-2020/audit-result.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const records = data.records;
const labelers = ["HL1", "HL2", "HL3", "HL4", "HL5"];
const mode = values => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
};
const entropy = values => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return -[...counts.values()].reduce((sum, count) => {
    const p = count / values.length;
    return sum + p * Math.log(p);
  }, 0);
};
const round = value => Number(value.toFixed(6));
const temperatures = [...new Set(records.map(row => row.temperatureC))].sort((a, b) => a - b);
const compositions = [...new Set(records.map(row => row.vanadiumAtomicPercent))].sort((a, b) => a - b);
const enriched = records.map(row => {
  const labels = labelers.map(labeler => row.labels[labeler]);
  const adjudication = [row.labels.HL3, row.labels.HL4, row.labels.HL5];
  return { ...row, consensus: mode(labels), entropy: entropy(labels), adjudicationConsensus: mode(adjudication), developmentDisagrees: row.labels.HL1 !== row.labels.HL2 };
});
const byCoordinate = new Map(enriched.map(row => [`${row.vanadiumAtomicPercent}|${row.temperatureC}`, row]));
const boundary = enriched.filter(row => {
  const xIndex = compositions.indexOf(row.vanadiumAtomicPercent);
  const yIndex = temperatures.indexOf(row.temperatureC);
  const neighbors = [[xIndex - 1, yIndex], [xIndex + 1, yIndex], [xIndex, yIndex - 1], [xIndex, yIndex + 1]]
    .filter(([x, y]) => x >= 0 && x < compositions.length && y >= 0 && y < temperatures.length)
    .map(([x, y]) => byCoordinate.get(`${compositions[x]}|${temperatures[y]}`));
  return neighbors.some(neighbor => neighbor.adjudicationConsensus !== row.adjudicationConsensus);
});
const entropyValues = enriched.map(row => row.entropy).sort((a, b) => a - b);
const phaseCounts = Object.fromEntries([0, 1, 2].map(label => [label, enriched.filter(row => row.adjudicationConsensus === label).length]));
const result = {
  auditId: "NIST-VO2-LABEL-GRID-0.1",
  reviewedOn: "2026-08-12",
  source: {
    datasetDoi: "10.18434/mds2-2301",
    landingPage: "https://data.nist.gov/od/id/mds2-2301",
    articleDoi: "10.1007/s40192-021-00213-8",
    license: "NIST public-domain/open data terms",
    humanLabelsSha256: "0056a45f7d45694368597fe7804569339745214530584dae10652873fed38cd2"
  },
  grid: {
    records: enriched.length,
    temperaturesC: temperatures,
    temperatureLevels: temperatures.length,
    vanadiumAtomicPercent: compositions,
    compositionLevels: compositions.length,
    completeRectangularGrid: enriched.length === temperatures.length * compositions.length,
    humanLabelers: labelers.length
  },
  uncertainty: {
    unanimousPoints: enriched.filter(row => row.entropy === 0).length,
    nonUnanimousPoints: enriched.filter(row => row.entropy > 0).length,
    maximumEntropy: round(Math.max(...entropyValues)),
    medianEntropy: round(entropyValues[Math.floor(entropyValues.length / 2)]),
    developmentLabelDisagreementPoints: enriched.filter(row => row.developmentDisagrees).length,
    independentAdjudicationPhaseCounts: phaseCounts,
    independentAdjudicationBoundaryPoints: boundary.length
  },
  targetDesignAudit: {
    twoDimensionalCompositionTemperatureGridPresent: true,
    multipleIndependentHumanLabelsPresent: true,
    rawDiffractionPubliclyAvailable: true,
    repeatedPhysicalMeasurementsAtSameCoordinatePresent: false,
    heteroscedasticAnnotationNoiseEstimable: true,
    developmentAdjudicationSplitPossible: true,
    faithfulDirectImplementationOfOneDimensionalTrackAndStopPossible: false,
    reason: "The grid supports a real two-dimensional boundary-label benchmark with point-specific human disagreement. It contains one ten-minute diffraction spectrum per coordinate, not physical replicate spectra. A label-acquisition policy can be tested with HL1-HL2 for development and HL3-HL5 for adjudication, but instrumental repeatability and a direct 1-D piecewise-constant Track-and-Stop comparison remain outside scope."
  },
  findings: {
    publishedHumanSubsetReconciled: enriched.length === 192 && temperatures.length === 8 && compositions.length === 24,
    annotationNoiseIsSpatiallyHeterogeneous: enriched.some(row => row.entropy === 0) && enriched.some(row => row.entropy > 0),
    independentAdjudicationHasMultiplePhasesAndBoundaries: Object.values(phaseCounts).every(count => count > 0) && boundary.length > 0,
    datasetSupportsIndependentLabelAdjudication: true,
    datasetDoesNotMeasurePhysicalRepeatability: true
  },
  decision: "Use the NIST grid for an independently adjudicated two-dimensional annotation-acquisition benchmark. Describe its heteroscedasticity as expert-label disagreement, not instrument or synthesis noise, and refuse claims about physical repeatability."
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, resultPath)}`);
} else console.log(JSON.stringify(result, null, 2));

export { result };
