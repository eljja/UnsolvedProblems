import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/scattering-round-robin-source.json"), "utf8"));
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/scattering-spec.json"), "utf8"));
const round = value => Number(value.toFixed(6));
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};
const summarize = item => {
  const midpoint = (item.min + item.max) / 2;
  const reproducibilityLimit = 1.96 * Math.sqrt(2) * item.sigma;
  return {
    range: [item.min, item.max],
    sigma: item.sigma,
    midpointProxy: round(midpoint),
    relativeSigmaPercent: round(100 * item.sigma / midpoint),
    reproducibilityLimitAngstrom: round(reproducibilityLimit),
    relativeReproducibilityLimitPercent: round(100 * reproducibilityLimit / midpoint)
  };
};

const saxs = source.saxs.map(row => ({
  protein: row.protein,
  metric: row.metric,
  batch: summarize(row.batch),
  sec: summarize(row.sec),
  combined: summarize(row.combined),
  secToBatchSigmaRatio: round(row.sec.sigma / row.batch.sigma),
  secHasLowerSigma: row.sec.sigma < row.batch.sigma,
  combinedNoWorseThanBestMode: row.combined.sigma <= Math.min(row.batch.sigma, row.sec.sigma)
}));
const sans = source.sans.map(row => ({
  protein: row.protein,
  metric: row.metric,
  d2o: summarize(row.d2o),
  h2o: summarize(row.h2o),
  lowerSigmaSolvent: row.d2o.sigma === row.h2o.sigma ? "tie" : row.d2o.sigma < row.h2o.sigma ? "D2O" : "H2O"
}));

const secWins = saxs.filter(row => row.secHasLowerSigma).length;
const combinedWins = saxs.filter(row => row.combinedNoWorseThanBestMode).length;
const allSaxsRelativeLimits = saxs.flatMap(row => [row.batch, row.sec, row.combined].map(item => item.relativeReproducibilityLimitPercent));
const allSansRelativeLimits = sans.flatMap(row => [row.d2o, row.h2o].map(item => item.relativeReproducibilityLimitPercent));
const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: "2026-08-12",
  denominators: source.reportedCampaign,
  saxs,
  sans,
  adjudication: {
    secWins,
    secLosses: saxs.length - secWins,
    secExceptions: saxs.filter(row => !row.secHasLowerSigma).map(row => `${row.protein}/${row.metric}`),
    combinedBestOrTied: combinedWins,
    combinedFailures: saxs.filter(row => !row.combinedNoWorseThanBestMode).map(row => `${row.protein}/${row.metric}`),
    medianSaxsRelativeReproducibilityLimitPercent: round(median(allSaxsRelativeLimits)),
    medianSansRelativeReproducibilityLimitPercent: round(median(allSansRelativeLimits)),
    maximumSaxsRelativeReproducibilityLimitPercent: round(Math.max(...allSaxsRelativeLimits)),
    maximumSansRelativeReproducibilityLimitPercent: round(Math.max(...allSansRelativeLimits))
  },
  findings: {
    campaignDenominatorsReconcile: source.reportedCampaign.saxsProfiles + source.reportedCampaign.sansProfiles === source.reportedCampaign.totalProfiles,
    universalSecReductionRejected: secWins < spec.gates.requiredComparisons,
    selectiveSecReductionSurvives: secWins >= spec.gates.minimumSecWins,
    combinedAlwaysBestRejected: combinedWins < spec.gates.requiredComparisons,
    reproducibilityFloorDependsOnProteinModeMetricAndSolvent: new Set([...allSaxsRelativeLimits, ...allSansRelativeLimits]).size > 2,
    aggregateTablesCannotDecomposeInstrumentPreparationAndReductionVariance: true,
    numericTransferToNistVo2Rejected: true
  },
  decision: "Use mode- and target-specific reproducibility limits as a minimum resolvable-effect gate. SEC-SAXS lowers reported sigma in 9/10 comparisons but reverses for urate-oxidase Guinier Rg; combined profiles are best or tied in only 7/10 comparisons. Retain the exceptions and require raw coordinate-level repeats before applying any numerical threshold to the NIST Nb-VO2 grid."
};

if (process.argv.includes("--write")) {
  const output = path.join(root, "research/reproducibility/scattering-result.json");
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, output)}`);
} else {
  console.log(JSON.stringify(result, null, 2));
}
