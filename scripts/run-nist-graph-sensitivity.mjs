import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceIndex = process.argv.indexOf("--source-dir");
const sourceDir = sourceIndex >= 0 ? path.resolve(process.argv[sourceIndex + 1]) : null;
if (!sourceDir) throw new Error("Pass --source-dir containing the official NIST raw profile file.");

const spec = {
  benchmarkId: "NIST-VO2-GRAPH-SENSITIVITY-0.1",
  reviewedOn: "2026-08-12",
  selectedObservable: "centeredCosine",
  selectionHistory: "Selected using HL1-HL2 in RC13 before opening majority HL3-HL5 adjudication.",
  adjudicationLabels: ["HL3", "HL4", "HL5"],
  perturbations: {
    leaveOneCoordinateOut: "Remove every edge incident to one coordinate, once per each of 192 coordinates.",
    leaveOneTemperatureOut: "Remove every edge incident to one of eight temperature rows.",
    leaveOneCompositionOut: "Remove every edge incident to one of 24 composition columns.",
    vertexMultiplier: "Multinomially resample 192 coordinates and weight each original edge by the product of endpoint multiplicities.",
    spatialBlockMultiplier: "Sample enough overlapping h-by-w coordinate blocks to cover 192 node slots and weight each original edge by endpoint multiplicity product."
  },
  bootstrap: { replicates: 5000, seed: "RC14-NIST-GRAPH-20260812", spatialBlockShapes: [[2, 4], [2, 6], [3, 4]] },
  retentionGate: {
    fullAucAboveChance: true,
    everyLeaveOneTemperatureAucAboveChance: true,
    everyLeaveOneCompositionAucAboveChance: true,
    bothEdgeAxesAucAboveChance: true,
    vertexMultiplierLowerSensitivityQuantileAboveChance: true,
    everySpatialBlockLowerSensitivityQuantileAboveChance: true
  },
  interpretationLimit: "Multiplier percentile ranges are dependency-aware sensitivity intervals, not confidence intervals with guaranteed frequentist coverage, because the composition-temperature grid is a fixed designed domain rather than an iid sample."
};

const labels = JSON.parse(fs.readFileSync(path.join(root, "research/external-audit/nist-vo2-2020/human-labels.json"), "utf8")).records;
const rawLines = fs.readFileSync(path.join(sourceDir, "VO2-Nb2O3-XRD-Combiview.txt"), "utf8").trim().split(/\r?\n/);
const spectra = rawLines.slice(1).map(line => line.split("\t").map(Number));
const round = (value, digits = 6) => Number(value.toFixed(digits));
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
const mode = values => [...new Set(values)].map(value => [value, values.filter(item => item === value).length]).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
const nodes = labels.map((row, index) => ({
  nodeIndex: index,
  measurementId: row.measurementId,
  composition: row.vanadiumAtomicPercent,
  temperature: row.temperatureC,
  phase: mode([row.labels.HL3, row.labels.HL4, row.labels.HL5]),
  spectrum: spectra[row.measurementId - 1]
}));
const compositions = [...new Set(nodes.map(node => node.composition))].sort((a, b) => a - b);
const temperatures = [...new Set(nodes.map(node => node.temperature))].sort((a, b) => a - b);
const grid = new Map(nodes.map(node => [`${node.composition}|${node.temperature}`, node]));
const edges = [];
for (const node of nodes) {
  const x = compositions.indexOf(node.composition), y = temperatures.indexOf(node.temperature);
  for (const [nx, ny, axis] of [[x + 1, y, "composition"], [x, y + 1, "temperature"]]) {
    if (nx >= compositions.length || ny >= temperatures.length) continue;
    const neighbor = grid.get(`${compositions[nx]}|${temperatures[ny]}`);
    edges.push({
      left: node.nodeIndex,
      right: neighbor.nodeIndex,
      axis,
      truth: Number(node.phase !== neighbor.phase),
      score: centeredCosineDistance(node.spectrum, neighbor.spectrum)
    });
  }
}

const weightedAuc = (selectedEdges, weights = null) => {
  const positives = [], negatives = [];
  selectedEdges.forEach((edge, index) => {
    const weight = weights ? weights[index] : 1;
    if (weight <= 0) return;
    (edge.truth ? positives : negatives).push({ score: edge.score, weight });
  });
  const positiveWeight = positives.reduce((sum, item) => sum + item.weight, 0);
  const negativeWeight = negatives.reduce((sum, item) => sum + item.weight, 0);
  if (!positiveWeight || !negativeWeight) return null;
  let wins = 0;
  for (const positive of positives) for (const negative of negatives) {
    wins += positive.weight * negative.weight * (positive.score > negative.score ? 1 : positive.score === negative.score ? 0.5 : 0);
  }
  return wins / (positiveWeight * negativeWeight);
};
const summarize = values => {
  const finite = values.filter(value => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  const quantile = probability => {
    const position = (finite.length - 1) * probability;
    const lower = Math.floor(position), upper = Math.ceil(position), fraction = position - lower;
    return finite[lower] * (1 - fraction) + finite[upper] * fraction;
  };
  return { validReplicates: finite.length, minimum: round(finite[0]), q025: round(quantile(0.025)), median: round(quantile(0.5)), q975: round(quantile(0.975)), maximum: round(finite.at(-1)) };
};
const fullAuc = weightedAuc(edges);

const coordinateDelete = nodes.map(node => {
  const kept = edges.filter(edge => edge.left !== node.nodeIndex && edge.right !== node.nodeIndex);
  return { measurementId: node.measurementId, composition: node.composition, temperature: node.temperature, auc: weightedAuc(kept), deltaFromFull: weightedAuc(kept) - fullAuc };
});
const temperatureDelete = temperatures.map(temperature => {
  const removed = new Set(nodes.filter(node => node.temperature === temperature).map(node => node.nodeIndex));
  const auc = weightedAuc(edges.filter(edge => !removed.has(edge.left) && !removed.has(edge.right)));
  return { temperatureC: temperature, auc, deltaFromFull: auc - fullAuc };
});
const compositionDelete = compositions.map(composition => {
  const removed = new Set(nodes.filter(node => node.composition === composition).map(node => node.nodeIndex));
  const auc = weightedAuc(edges.filter(edge => !removed.has(edge.left) && !removed.has(edge.right)));
  return { vanadiumAtomicPercent: composition, auc, deltaFromFull: auc - fullAuc };
});

const seedBuffer = crypto.createHash("sha256").update(spec.bootstrap.seed).digest();
let rngState = seedBuffer.readUInt32LE(0) || 1;
const random = () => { rngState ^= rngState << 13; rngState ^= rngState >>> 17; rngState ^= rngState << 5; return (rngState >>> 0) / 2 ** 32; };
const drawVertexWeights = () => {
  const counts = Array(nodes.length).fill(0);
  for (let draw = 0; draw < nodes.length; draw += 1) counts[Math.floor(random() * nodes.length)] += 1;
  return counts;
};
const aucFromNodeWeights = counts => weightedAuc(edges, edges.map(edge => counts[edge.left] * counts[edge.right]));
const vertexReplicates = Array.from({ length: spec.bootstrap.replicates }, () => aucFromNodeWeights(drawVertexWeights()));

const blockReplicates = Object.fromEntries(spec.bootstrap.spatialBlockShapes.map(([height, width]) => {
  const blocks = [];
  for (let y = 0; y <= temperatures.length - height; y += 1) for (let x = 0; x <= compositions.length - width; x += 1) {
    const members = [];
    for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) members.push(grid.get(`${compositions[x + dx]}|${temperatures[y + dy]}`).nodeIndex);
    blocks.push(members);
  }
  const draws = Math.ceil(nodes.length / (height * width));
  const values = Array.from({ length: spec.bootstrap.replicates }, () => {
    const counts = Array(nodes.length).fill(0);
    for (let draw = 0; draw < draws; draw += 1) for (const nodeIndex of blocks[Math.floor(random() * blocks.length)]) counts[nodeIndex] += 1;
    return aucFromNodeWeights(counts);
  });
  return [`${height}x${width}`, { blockHeight: height, blockWidth: width, availableBlocks: blocks.length, blocksDrawnPerReplicate: draws, ...summarize(values) }];
}));

const axisResults = Object.fromEntries(["composition", "temperature"].map(axis => {
  const selected = edges.filter(edge => edge.axis === axis);
  return [axis, { edges: selected.length, boundaryEdges: selected.filter(edge => edge.truth).length, auc: round(weightedAuc(selected)) }];
}));
const coordinateSummary = summarize(coordinateDelete.map(row => row.auc));
const temperatureSummary = summarize(temperatureDelete.map(row => row.auc));
const compositionSummary = summarize(compositionDelete.map(row => row.auc));
const vertexSummary = summarize(vertexReplicates);
const gates = {
  fullAucAboveChance: fullAuc > 0.5,
  everyLeaveOneTemperatureAucAboveChance: Math.min(...temperatureDelete.map(row => row.auc)) > 0.5,
  everyLeaveOneCompositionAucAboveChance: Math.min(...compositionDelete.map(row => row.auc)) > 0.5,
  bothEdgeAxesAucAboveChance: Object.values(axisResults).every(row => row.auc > 0.5),
  vertexMultiplierLowerSensitivityQuantileAboveChance: vertexSummary.q025 > 0.5,
  everySpatialBlockLowerSensitivityQuantileAboveChance: Object.values(blockReplicates).every(row => row.q025 > 0.5)
};

const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: "2026-08-12",
  denominators: { coordinates: nodes.length, edges: edges.length, boundaryEdges: edges.filter(edge => edge.truth).length, nonBoundaryEdges: edges.filter(edge => !edge.truth).length },
  fullAuc: round(fullAuc),
  axisResults,
  deletionSensitivity: {
    coordinate: { ...coordinateSummary, mostNegative: coordinateDelete.sort((a, b) => a.deltaFromFull - b.deltaFromFull).slice(0, 5).map(row => ({ ...row, auc: round(row.auc), deltaFromFull: round(row.deltaFromFull) })) },
    temperature: { ...temperatureSummary, estimates: temperatureDelete.map(row => ({ ...row, auc: round(row.auc), deltaFromFull: round(row.deltaFromFull) })) },
    composition: { ...compositionSummary, estimates: compositionDelete.map(row => ({ ...row, auc: round(row.auc), deltaFromFull: round(row.deltaFromFull) })) }
  },
  multiplierSensitivity: { vertex: vertexSummary, spatialBlocks: blockReplicates },
  gates,
  allRetentionGatesPass: Object.values(gates).every(Boolean),
  decision: Object.values(gates).every(Boolean)
    ? "Retain centered cosine distance as a preregistered primary ranking observable for the 192-acquisition checkpoint, while estimating physical variance only from new repeats."
    : "Do not promote centered cosine distance to the sole primary ranking observable. Retain it as exploratory and preregister a metric panel whose physical transport is adjudicated by the new repeated experiment.",
  limitations: [
    spec.interpretationLimit,
    "Deletion and multiplier analyses address shared-coordinate and coarse spatial concentration; they do not create new instruments, preparations, facilities, or reduction pipelines.",
    "The observable was selected on HL1-HL2 and evaluated on HL3-HL5 from the same physical profiles. Label adjudication is separated, but physical-data independence is not."
  ]
};

if (Math.abs(result.fullAuc - 0.755362) > 1e-6) throw new Error(`RC13 AUC did not reproduce: ${result.fullAuc}`);
if (process.argv.includes("--write")) {
  fs.writeFileSync(path.join(root, "research/reproducibility/nist-graph-sensitivity-spec.json"), `${JSON.stringify(spec, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "research/reproducibility/nist-graph-sensitivity-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log("wrote NIST graph-sensitivity specification and result");
} else console.log(JSON.stringify(result, null, 2));

export { spec, result };
