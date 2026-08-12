import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceIndex = process.argv.indexOf("--source-dir");
const sourceDir = sourceIndex >= 0 ? path.resolve(process.argv[sourceIndex + 1]) : null;
const write = process.argv.includes("--write");
if (!sourceDir) throw new Error("Pass --source-dir containing the eight extracted IUCr summary CSV files.");

const spec = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/iucr-qpa-transfer-spec.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/iucr-qpa-summary-source-manifest.json"), "utf8"));
const truth = spec.truthWeightPercent;
const phases = ["corundum", "fluorite", "zincite"];
const prefixes = { corundum: "cor", fluorite: "flu", zincite: "zin" };
const errorGate = spec.design.unsafeGatePercentagePoints;
const round = (value, digits = 9) => Number(value.toFixed(digits));
const ratio = (numerator, denominator) => denominator ? round(numerator / denominator) : null;
const median = values => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};
const sha256 = file => {
  const digest = crypto.createHash("sha256");
  digest.update(fs.readFileSync(file));
  return digest.digest("hex");
};

const requiredColumns = [
  "sample", "reftype", "HAL", "maxint", "maxintfactor", "stepsize", "stepsizefactor", "Rwp_mean", "gof_mean",
  ...phases.flatMap(phase => {
    const prefix = prefixes[phase];
    return [`${prefix}_wt_mean`, `${prefix}_wt_err_mean`, `${prefix}_wt_sd`];
  })
];

const parseFile = async contract => {
  const file = path.join(sourceDir, contract.name);
  if (!fs.existsSync(file)) throw new Error(`Missing source file ${contract.name}`);
  const stats = fs.statSync(file);
  if (stats.size !== contract.bytes) throw new Error(`Byte count changed for ${contract.name}`);
  if (sha256(file) !== contract.sha256) throw new Error(`SHA-256 changed for ${contract.name}`);
  const input = fs.createReadStream(file, "utf8");
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let indices = null;
  const rows = [];
  for await (const line of lines) {
    if (!indices) {
      const header = line.split(",");
      indices = Object.fromEntries(requiredColumns.map(column => {
        const index = header.indexOf(column);
        if (index < 0) throw new Error(`Missing ${column} in ${contract.name}`);
        return [column, index];
      }));
      continue;
    }
    if (!line.trim()) continue;
    const values = line.split(",");
    const value = column => values[indices[column]];
    const number = column => Number(value(column));
    const sample = value("sample");
    const estimates = {};
    const formalUncertainty = {};
    const randomizedStartSd = {};
    for (const phase of phases) {
      const prefix = prefixes[phase];
      estimates[phase] = number(`${prefix}_wt_mean`);
      formalUncertainty[phase] = number(`${prefix}_wt_err_mean`);
      randomizedStartSd[phase] = number(`${prefix}_wt_sd`);
    }
    const errors = Object.fromEntries(phases.map(phase => [phase, Math.abs(estimates[phase] - truth[sample][phase])]));
    const combinedUncertainty = Object.fromEntries(phases.map(phase => [phase, Math.hypot(formalUncertainty[phase], randomizedStartSd[phase])]));
    rows.push({
      sample,
      refinementType: number("reftype"),
      highAngleLimit: number("HAL"),
      maximumIntensity: number("maxint"),
      nominalMaximumIntensity: number("maxintfactor"),
      stepSize: number("stepsize"),
      nominalStepSize: number("stepsizefactor"),
      rwp: number("Rwp_mean"),
      gof: number("gof_mean"),
      estimates,
      formalUncertainty,
      randomizedStartSd,
      combinedUncertainty,
      maximumAbsoluteError: Math.max(...Object.values(errors)),
      maximumFormalUncertainty: Math.max(...Object.values(formalUncertainty)),
      maximumCombinedUncertainty: Math.max(...Object.values(combinedUncertainty)),
      formalBandCoversAll: phases.every(phase => errors[phase] <= 1.96 * formalUncertainty[phase]),
      combinedBandCoversAll: phases.every(phase => errors[phase] <= 1.96 * combinedUncertainty[phase])
    });
  }
  if (rows.length !== 728) throw new Error(`${contract.name} has ${rows.length} rows, expected 728`);
  return rows;
};

const rows = (await Promise.all(manifest.files.map(parseFile))).flat();
const unsafe = row => row.maximumAbsoluteError > errorGate;
const developmentRows = rows.filter(row => row.sample === spec.split.developmentSample);
const holdoutRows = rows.filter(row => row.sample === spec.split.holdoutSample);

const summarizeRows = selected => ({
  cases: selected.length,
  unsafeCases: selected.filter(unsafe).length,
  unsafeFraction: ratio(selected.filter(unsafe).length, selected.length),
  maximumAbsoluteError: round(Math.max(...selected.map(row => row.maximumAbsoluteError))),
  q95MaximumAbsoluteError: round(medianQuantile(selected.map(row => row.maximumAbsoluteError), 0.95)),
  formalBandAllPhaseCoverage: ratio(selected.filter(row => row.formalBandCoversAll).length, selected.length),
  combinedBandAllPhaseCoverage: ratio(selected.filter(row => row.combinedBandCoversAll).length, selected.length)
});

function medianQuantile(values, probability) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position), upper = Math.ceil(position), weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

const assessRowSelector = (selected, accept) => {
  const accepted = selected.filter(accept);
  const unsafeAccepted = accepted.filter(unsafe);
  const safe = selected.filter(row => !unsafe(row));
  return {
    cases: selected.length,
    unsafeCases: selected.filter(unsafe).length,
    acceptedCases: accepted.length,
    acceptedFraction: ratio(accepted.length, selected.length),
    unsafeAcceptedCases: unsafeAccepted.length,
    unsafeAcceptedFraction: ratio(unsafeAccepted.length, accepted.length),
    safeRetention: ratio(accepted.filter(row => !unsafe(row)).length, safe.length),
    maximumAcceptedAbsoluteError: accepted.length ? round(Math.max(...accepted.map(row => row.maximumAbsoluteError))) : null
  };
};

const thresholdSelector = (name, score) => {
  const developmentUnsafe = developmentRows.filter(unsafe);
  if (!developmentUnsafe.length) throw new Error(`No unsafe development rows for ${name}`);
  const threshold = Math.min(...developmentUnsafe.map(score));
  const accept = row => score(row) < threshold;
  return {
    name,
    thresholdSelectedOnDevelopment: round(threshold, 12),
    boundary: "accept score strictly below threshold",
    development: assessRowSelector(developmentRows, accept),
    holdout: assessRowSelector(holdoutRows, accept)
  };
};

const rowSelectors = {
  rwp: thresholdSelector("Rwp", row => row.rwp),
  formalUncertainty: thresholdSelector("maximum reported phase esd mean", row => row.maximumFormalUncertainty)
};
const acquisitionAccept = row => row.nominalStepSize <= 0.04 + 1e-12 && row.highAngleLimit >= 70 && row.nominalMaximumIntensity >= 20000;
rowSelectors.literatureAcquisitionGate = {
  name: "literature-fixed acquisition support",
  rule: "nominal step <= 0.04 degrees, HAL >= 70 degrees, nominal maximum intensity >= 20,000 counts",
  development: assessRowSelector(developmentRows, acquisitionAccept),
  holdout: assessRowSelector(holdoutRows, acquisitionAccept)
};

const conditionKey = row => [row.sample, row.highAngleLimit, row.nominalMaximumIntensity, row.nominalStepSize].join("|");
const grouped = new Map();
for (const row of rows) {
  const key = conditionKey(row);
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(row);
}
const conditions = [...grouped.values()].map(group => {
  if (group.length !== 4 || new Set(group.map(row => row.refinementType)).size !== 4) throw new Error(`Incomplete refinement family ${conditionKey(group[0])}`);
  const first = group[0];
  const medianEstimate = Object.fromEntries(phases.map(phase => [phase, median(group.map(row => row.estimates[phase]))]));
  const ranges = Object.fromEntries(phases.map(phase => {
    const values = group.map(row => row.estimates[phase]);
    return [phase, Math.max(...values) - Math.min(...values)];
  }));
  const rawEnvelopeCoversAll = phases.every(phase => {
    const estimates = group.map(row => row.estimates[phase]);
    return truth[first.sample][phase] >= Math.min(...estimates) && truth[first.sample][phase] <= Math.max(...estimates);
  });
  const expandedEnvelopeCoversAll = phases.every(phase => {
    const lower = Math.min(...group.map(row => row.estimates[phase] - 1.96 * row.combinedUncertainty[phase]));
    const upper = Math.max(...group.map(row => row.estimates[phase] + 1.96 * row.combinedUncertainty[phase]));
    return truth[first.sample][phase] >= lower && truth[first.sample][phase] <= upper;
  });
  return {
    sample: first.sample,
    highAngleLimit: first.highAngleLimit,
    nominalMaximumIntensity: first.nominalMaximumIntensity,
    nominalStepSize: first.nominalStepSize,
    medianEstimate,
    maximumAbsoluteError: Math.max(...phases.map(phase => Math.abs(medianEstimate[phase] - truth[first.sample][phase]))),
    maximumModelSpread: Math.max(...Object.values(ranges)),
    rawEnvelopeCoversAll,
    expandedEnvelopeCoversAll
  };
});
const developmentConditions = conditions.filter(row => row.sample === spec.split.developmentSample);
const holdoutConditions = conditions.filter(row => row.sample === spec.split.holdoutSample);
const unsafeCondition = row => row.maximumAbsoluteError > errorGate;
const summarizeConditions = selected => ({
  conditions: selected.length,
  unsafeConditions: selected.filter(unsafeCondition).length,
  unsafeFraction: ratio(selected.filter(unsafeCondition).length, selected.length),
  maximumAbsoluteMedianError: round(Math.max(...selected.map(row => row.maximumAbsoluteError))),
  rawModelEnvelopeAllPhaseCoverage: ratio(selected.filter(row => row.rawEnvelopeCoversAll).length, selected.length),
  expandedModelEnvelopeAllPhaseCoverage: ratio(selected.filter(row => row.expandedEnvelopeCoversAll).length, selected.length)
});
const assessConditionSelector = (selected, accept) => {
  const accepted = selected.filter(accept);
  const safe = selected.filter(row => !unsafeCondition(row));
  return {
    conditions: selected.length,
    unsafeConditions: selected.filter(unsafeCondition).length,
    acceptedConditions: accepted.length,
    acceptedFraction: ratio(accepted.length, selected.length),
    unsafeAcceptedConditions: accepted.filter(unsafeCondition).length,
    safeRetention: ratio(accepted.filter(row => !unsafeCondition(row)).length, safe.length),
    maximumAcceptedAbsoluteError: accepted.length ? round(Math.max(...accepted.map(row => row.maximumAbsoluteError))) : null
  };
};
const unsafeDevelopmentConditions = developmentConditions.filter(unsafeCondition);
if (!unsafeDevelopmentConditions.length) throw new Error("No unsafe development conditions for model-spread selector");
const modelSpreadThreshold = Math.min(...unsafeDevelopmentConditions.map(row => row.maximumModelSpread));
const modelSpreadAccept = row => row.maximumModelSpread < modelSpreadThreshold;
const acquisitionConditionAccept = row => row.nominalStepSize <= 0.04 + 1e-12 && row.highAngleLimit >= 70 && row.nominalMaximumIntensity >= 20000;

const byNominalStep = Object.fromEntries([...new Set(rows.map(row => row.nominalStepSize))].sort((a, b) => a - b).map(step => [String(step), summarizeRows(rows.filter(row => row.nominalStepSize === step))]));
const byRefinementType = Object.fromEntries([1, 2, 3, 4].map(type => [String(type), summarizeRows(rows.filter(row => row.refinementType === type))]));

const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: "2026-08-12",
  source: {
    primaryArticleDoi: spec.sourceContract.primaryArticleDoi,
    rawDatasetDoi: spec.sourceContract.rawDatasetDoi,
    summaryArchiveSha256: spec.sourceContract.summaryArchiveSha256,
    extractedFilesVerified: manifest.files.length
  },
  denominators: {
    samples: 2,
    refinementTypes: 4,
    highAngleLimits: 7,
    nominalStepSizes: 8,
    nominalMaximumIntensities: 13,
    rows: rows.length,
    randomizedStartRefinementsRepresented: rows.length * 200,
    acquisitionConditions: conditions.length
  },
  truthWeightPercent: truth,
  errorGatePercentagePoints: errorGate,
  split: spec.split,
  bySample: Object.fromEntries(Object.keys(truth).map(sample => [sample, summarizeRows(rows.filter(row => row.sample === sample))])),
  byNominalStep,
  byRefinementType,
  rowSelectors,
  crossModelConditions: {
    development: summarizeConditions(developmentConditions),
    holdout: summarizeConditions(holdoutConditions),
    spreadSelector: {
      thresholdSelectedOnDevelopment: round(modelSpreadThreshold, 12),
      boundary: "accept maximum phase range across four models strictly below threshold",
      development: assessConditionSelector(developmentConditions, modelSpreadAccept),
      holdout: assessConditionSelector(holdoutConditions, modelSpreadAccept)
    },
    literatureAcquisitionGate: {
      development: assessConditionSelector(developmentConditions, acquisitionConditionAccept),
      holdout: assessConditionSelector(holdoutConditions, acquisitionConditionAccept)
    }
  },
  decision: {
    rwpTransfersSafely: rowSelectors.rwp.holdout.unsafeAcceptedCases === 0 && rowSelectors.rwp.holdout.acceptedCases > 0,
    formalUncertaintyTransfersSafely: rowSelectors.formalUncertainty.holdout.unsafeAcceptedCases === 0 && rowSelectors.formalUncertainty.holdout.acceptedCases > 0,
    modelSpreadTransfersSafely: unsafeDevelopmentConditions.length > 0 && assessConditionSelector(holdoutConditions, modelSpreadAccept).unsafeAcceptedConditions === 0 && assessConditionSelector(holdoutConditions, modelSpreadAccept).acceptedConditions > 0,
    literatureAcquisitionGateTransfersSafely: rowSelectors.literatureAcquisitionGate.holdout.unsafeAcceptedCases === 0 && rowSelectors.literatureAcquisitionGate.holdout.acceptedCases > 0,
    stableSurrogateRungQualified: false,
    whyNotQualified: "One experiment with no independent preparation, instrument, implementation, or physical-repeat split cannot qualify the stable-surrogate rung even if a within-dataset holdout gate passes."
  },
  interpretation: [
    "The weighed compositions are independent of the fitted scale factors, but both samples were measured and analysed within one published workflow.",
    "Formal esds and randomized-start spread omit specimen, acquisition, and shared-model error; their diagnostic-band inclusion is not a 95% new-specimen coverage guarantee.",
    "Cross-model agreement among four nested TOPAS refinements can miss common-mode crystallographic bias.",
    "The next decisive test must repeat the accepted acquisition gate across independently prepared aliquots, a second instrument, and an independent implementation before transfer to VO2."
  ]
};

const output = path.join(root, "research/reproducibility/iucr-qpa-diagnostic-transfer-result.json");
if (write) fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
else console.log(JSON.stringify(result, null, 2));
