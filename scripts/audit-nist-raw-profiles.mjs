import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirIndex = process.argv.indexOf("--source-dir");
const sourceDir = sourceDirIndex >= 0 ? path.resolve(process.argv[sourceDirIndex + 1]) : null;
if (!sourceDir) throw new Error("Pass --source-dir containing the official NIST raw profile and composition-temperature files.");

const rawPath = path.join(sourceDir, "VO2-Nb2O3-XRD-Combiview.txt");
const labels = JSON.parse(fs.readFileSync(path.join(root, "research/external-audit/nist-vo2-2020/human-labels.json"), "utf8")).records;
const lines = fs.readFileSync(rawPath, "utf8").trim().split(/\r?\n/);
const angles = lines[0].split("\t").map(Number);
const spectra = lines.slice(1).map(line => line.split("\t").map(Number));
const round = (value, digits = 6) => Number(value.toFixed(digits));

if (spectra.length !== 352 || angles.length !== 3841 || spectra.some(row => row.length !== angles.length)) {
  throw new Error(`Unexpected raw profile shape: ${spectra.length} spectra x ${angles.length} angles`);
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const centeredCosineDistance = (left, right) => {
  const lm = mean(left), rm = mean(right);
  let dot = 0, ll = 0, rr = 0;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i] - lm, r = right[i] - rm;
    dot += l * r; ll += l * l; rr += r * r;
  }
  return 1 - dot / Math.sqrt(ll * rr);
};
const cosineDistance = (left, right) => {
  let dot = 0, ll = 0, rr = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i]; ll += left[i] * left[i]; rr += right[i] * right[i];
  }
  return 1 - dot / Math.sqrt(ll * rr);
};
const smoothDerivative = values => {
  const smoothed = values.map((_, index) => {
    let total = 0, count = 0;
    for (let j = Math.max(0, index - 2); j <= Math.min(values.length - 1, index + 2); j += 1) {
      total += values[j]; count += 1;
    }
    return total / count;
  });
  return smoothed.slice(1).map((value, index) => value - smoothed[index]);
};

const mode = values => [...new Map(values.map(value => [value, values.filter(item => item === value).length])).entries()]
  .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
const enriched = labels.map(row => ({
  ...row,
  development: row.labels.HL1 === row.labels.HL2 ? row.labels.HL1 : null,
  adjudication: mode([row.labels.HL3, row.labels.HL4, row.labels.HL5]),
  spectrum: spectra[row.measurementId - 1]
}));
const compositions = [...new Set(enriched.map(row => row.vanadiumAtomicPercent))].sort((a, b) => a - b);
const temperatures = [...new Set(enriched.map(row => row.temperatureC))].sort((a, b) => a - b);
const grid = new Map(enriched.map(row => [`${row.vanadiumAtomicPercent}|${row.temperatureC}`, row]));
const edges = [];
for (const row of enriched) {
  const x = compositions.indexOf(row.vanadiumAtomicPercent);
  const y = temperatures.indexOf(row.temperatureC);
  for (const [nx, ny, axis] of [[x + 1, y, "composition"], [x, y + 1, "temperature"]]) {
    if (nx >= compositions.length || ny >= temperatures.length) continue;
    const neighbor = grid.get(`${compositions[nx]}|${temperatures[ny]}`);
    edges.push({
      edgeId: `${row.measurementId}-${neighbor.measurementId}`,
      axis,
      developmentTruth: row.development === null || neighbor.development === null ? null : Number(row.development !== neighbor.development),
      adjudicationTruth: Number(row.adjudication !== neighbor.adjudication),
      metrics: {
        cosine: cosineDistance(row.spectrum, neighbor.spectrum),
        centeredCosine: centeredCosineDistance(row.spectrum, neighbor.spectrum),
        derivativeCosine: cosineDistance(smoothDerivative(row.spectrum), smoothDerivative(neighbor.spectrum))
      }
    });
  }
}

const auc = samples => {
  const positives = samples.filter(sample => sample.truth === 1);
  const negatives = samples.filter(sample => sample.truth === 0);
  let wins = 0;
  for (const positive of positives) for (const negative of negatives) wins += positive.value > negative.value ? 1 : positive.value === negative.value ? 0.5 : 0;
  return wins / (positives.length * negatives.length);
};
const confusion = (samples, threshold) => {
  const counts = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
  for (const sample of samples) {
    const prediction = Number(sample.value >= threshold);
    if (prediction && sample.truth) counts.truePositive += 1;
    else if (prediction) counts.falsePositive += 1;
    else if (sample.truth) counts.falseNegative += 1;
    else counts.trueNegative += 1;
  }
  const sensitivity = counts.truePositive / (counts.truePositive + counts.falseNegative);
  const specificity = counts.trueNegative / (counts.trueNegative + counts.falsePositive);
  return { ...counts, sensitivity, specificity, balancedAccuracy: (sensitivity + specificity) / 2 };
};
const chooseThreshold = samples => {
  const values = [...new Set(samples.map(sample => sample.value))].sort((a, b) => a - b);
  return values.map(threshold => ({ threshold, ...confusion(samples, threshold) }))
    .sort((a, b) => b.balancedAccuracy - a.balancedAccuracy || a.threshold - b.threshold)[0];
};

const metricNames = ["cosine", "centeredCosine", "derivativeCosine"];
const metrics = Object.fromEntries(metricNames.map(name => {
  const development = edges.filter(edge => edge.developmentTruth !== null).map(edge => ({ value: edge.metrics[name], truth: edge.developmentTruth }));
  const adjudication = edges.map(edge => ({ value: edge.metrics[name], truth: edge.adjudicationTruth }));
  const selected = chooseThreshold(development);
  return [name, {
    development: { edges: development.length, boundaryEdges: development.filter(row => row.truth).length, auc: round(auc(development)), selectedThreshold: round(selected.threshold, 9), balancedAccuracyAtSelection: round(selected.balancedAccuracy) },
    sealedAdjudication: { edges: adjudication.length, boundaryEdges: adjudication.filter(row => row.truth).length, auc: round(auc(adjudication)), ...Object.fromEntries(Object.entries(confusion(adjudication, selected.threshold)).map(([key, value]) => [key, Number.isInteger(value) ? value : round(value)])) }
  }];
}));
const selectedMetric = metricNames.map(name => ({ name, auc: metrics[name].development.auc })).sort((a, b) => b.auc - a.auc || a.name.localeCompare(b.name))[0].name;

const result = {
  auditId: "NIST-VO2-RAW-PROFILE-AUDIT-0.1",
  reviewedOn: "2026-08-12",
  source: {
    datasetDoi: "10.18434/mds2-2301",
    rawProfileUrl: "https://data.nist.gov/od/ds/mds2-2301/VO2%20-Nb2O3%20XRD%20Combiview.txt",
    rawProfileSha256: "3b47bf36b2abaef376730226e2616a353ba07571c46e71bce464cf9e9bfbe348",
    rawFileRepublished: false
  },
  shape: { spectra: spectra.length, labeledSpectra: enriched.length, twoThetaPoints: angles.length, twoThetaStartDegrees: angles[0], twoThetaEndDegrees: angles.at(-1), nominalStepDegrees: round(angles[1] - angles[0], 9), nearestNeighborEdges: edges.length },
  protocol: {
    developmentLabels: ["HL1", "HL2"],
    sealedAdjudicationLabels: ["HL3", "HL4", "HL5"],
    metrics: {
      cosine: "One minus cosine similarity of unmodified intensity vectors.",
      centeredCosine: "One minus Pearson-equivalent centered cosine similarity.",
      derivativeCosine: "One minus cosine similarity after fixed five-point smoothing and first differencing."
    },
    selection: "Choose both metric and threshold using development labels only; report the frozen pair on majority HL3-HL5 edge transitions."
  },
  metrics,
  selectedMetric,
  selectedResult: metrics[selectedMetric],
  interpretation: {
    supported: "The public single-acquisition profiles can rank prespecified full-profile observables against independently adjudicated phase-transition edges.",
    notSupported: "The dataset cannot estimate technical, preparation, facility, or reduction variance and therefore cannot define a physical minimum detectable phase-change signal.",
    dependenceWarning: "Edges share coordinates. Edge-level confusion counts are descriptive and must not be treated as independent binomial trials."
  }
};

const output = path.join(root, "research/reproducibility/nist-raw-profile-audit.json");
if (process.argv.includes("--write")) {
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, output)}`);
} else console.log(JSON.stringify(result, null, 2));

export { result };
