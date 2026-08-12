import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const input = load("research/reproducibility/sasbdb-filter-input.json");
const spec = load("research/reproducibility/sasbdb-filter-spec.json");
const round = (value, digits = 6) => Number(value.toFixed(digits));
const percentile = (values, probability) => {
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};

const results = input.proteins.map(protein => {
  const diagnostics = protein.rows.map(row => {
    const intensities = [row.noFilter, row.outlier, row.error, row.outlierError];
    const mean = intensities.reduce((sum, value) => sum + value, 0) / intensities.length;
    const pipelineRangePercent = 100 * (Math.max(...intensities) - Math.min(...intensities)) / mean;
    const jointVsNoFilterPercent = 100 * Math.abs(row.outlierError - row.noFilter) / mean;
    const alternativeDepartures = [row.noFilter, row.outlier, row.error].map(value => Math.abs(value - row.outlierError) / row.outlierErrorSigma);
    return {
      q: row.q,
      qRg: row.q * protein.consensusRgAngstrom,
      pipelineRangePercent,
      jointVsNoFilterPercent,
      maximumPointwiseDepartureZ: Math.max(...alternativeDepartures)
    };
  });
  const summarize = (name, rows) => ({
    name,
    points: rows.length,
    qMin: Math.min(...rows.map(row => row.q)),
    qMax: Math.max(...rows.map(row => row.q)),
    pipelineRangeMedianPercent: round(percentile(rows.map(row => row.pipelineRangePercent), 0.5)),
    pipelineRangeP95Percent: round(percentile(rows.map(row => row.pipelineRangePercent), 0.95)),
    jointVsNoFilterP95Percent: round(percentile(rows.map(row => row.jointVsNoFilterPercent), 0.95)),
    fractionWithAlternativeBeyondPointwise95: round(rows.filter(row => row.maximumPointwiseDepartureZ > spec.gates.pointwiseDepartureThreshold).length / rows.length),
    maximumDepartureZP95: round(percentile(rows.map(row => row.maximumPointwiseDepartureZ), 0.95))
  });
  return {
    id: protein.id,
    protein: protein.protein,
    consensusRgAngstrom: protein.consensusRgAngstrom,
    sourceArchiveSha256: protein.sourceArchiveSha256,
    guinier: summarize("qRg<=1.3", diagnostics.filter(row => row.qRg <= 1.3)),
    structural: summarize("q<=0.3 A^-1", diagnostics.filter(row => row.q <= 0.3))
  };
});
const guinierStable = results.filter(result => result.guinier.pipelineRangeP95Percent < spec.gates.universalPipelineInvarianceRequiresEveryGuinierP95RangeBelowPercent);
const guinierExceptions = results.filter(result => !guinierStable.includes(result));
const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: spec.reviewedOn,
  sourceDatasetId: input.datasetId,
  denominators: {
    proteins: results.length,
    structuralQPoints: results.reduce((sum, result) => sum + result.structural.points, 0),
    officialConsensusVariantsPerProtein: 4
  },
  proteins: results,
  adjudication: {
    universalGuinierPipelineInvariancePasses: guinierExceptions.length === 0,
    proteinsBelowOnePercentGuinierP95: guinierStable.map(result => result.protein),
    guinierExceptions: guinierExceptions.map(result => result.protein),
    largestGuinierP95RangePercent: Math.max(...results.map(result => result.guinier.pipelineRangeP95Percent)),
    largestStructuralP95RangePercent: Math.max(...results.map(result => result.structural.pipelineRangeP95Percent))
  },
  findings: {
    snapshotContains497CommonStructuralQPoints: results.reduce((sum, result) => sum + result.structural.points, 0) === 497,
    universalPipelineInvarianceIsRejected: guinierExceptions.length > 0,
    threeProteinsRemainBelowOnePercentInGuinierRegion: guinierStable.length === 3,
    everyProteinHasMajorityPointwiseDeparturesBeyondNominal95: results.every(result => result.guinier.fractionWithAlternativeBeyondPointwise95 > 0.5),
    pipelineEnvelopeIsNotAConfidenceInterval: true,
    numericalTransferToPXrdIsRefused: true
  },
  decision: "Treat the four official datcombine settings as an analysis-choice envelope. Seal the filter policy before adjudication, retain Urate oxidase and Lysozyme as low-q counterexamples to universal pipeline invariance, and do not interpret the envelope as independent physical repeatability or transfer its percentages to pXRD."
};

const output = path.join(root, "research/reproducibility/sasbdb-filter-result.json");
if (process.argv.includes("--write")) {
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, output)}`);
} else {
  console.log(JSON.stringify(result, null, 2));
}
