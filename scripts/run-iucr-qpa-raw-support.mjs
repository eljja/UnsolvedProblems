import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const rawDir = valueAfter("--raw-dir") ? path.resolve(valueAfter("--raw-dir")) : null;
const summaryDir = valueAfter("--summary-dir") ? path.resolve(valueAfter("--summary-dir")) : null;
const write = args.includes("--write");
if (!rawDir || !summaryDir) throw new Error("Pass --raw-dir with 208 XY profiles and --summary-dir with eight summary CSV files.");

const spec = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/iucr-qpa-raw-support-spec.json"), "utf8"));
const rawManifest = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/iucr-qpa-raw-source-manifest.json"), "utf8"));
const summaryManifest = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/iucr-qpa-summary-source-manifest.json"), "utf8"));
const transferSpec = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/iucr-qpa-transfer-spec.json"), "utf8"));
const phases = ["corundum", "fluorite", "zincite"];
const prefixes = { corundum: "cor", fluorite: "flu", zincite: "zin" };
const truth = transferSpec.truthWeightPercent;
const errorGate = transferSpec.design.unsafeGatePercentagePoints;
const round = (value, digits = 9) => Number(value.toFixed(digits));
const ratio = (numerator, denominator) => denominator ? round(numerator / denominator) : null;
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const quantile = (values, probability) => {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position), upper = Math.ceil(position), weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const key = (sample, nominalMaximumIntensity, nominalStepSize, highAngleLimit) =>
  [sample, nominalMaximumIntensity, Number(nominalStepSize).toFixed(3), highAngleLimit].join("|");

const parseRawFile = contract => {
  const file = path.join(rawDir, contract.name);
  if (!fs.existsSync(file)) throw new Error(`Missing raw file ${contract.name}`);
  if (fs.statSync(file).size !== contract.bytes) throw new Error(`Byte count changed for ${contract.name}`);
  if (sha256(file) !== contract.sha256) throw new Error(`SHA-256 changed for ${contract.name}`);
  const points = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).map((line, index) => {
    const fields = line.trim().split(/\s+/).map(Number);
    if (fields.length !== 2 || !fields.every(Number.isFinite)) throw new Error(`Invalid raw line ${contract.name}:${index + 1}`);
    return fields;
  });
  return points;
};

const trapezoid = (points, transform = value => value) => {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index][0] - points[index - 1][0];
    total += dx * (transform(points[index - 1][1]) + transform(points[index][1])) / 2;
  }
  return total;
};

const phaseWindowSnr = (points, contract) => {
  const signal = points.filter(point => Math.abs(point[0] - contract.centerDegrees2Theta) <= contract.signalHalfWidth);
  const sideband = points.filter(point => {
    const distance = Math.abs(point[0] - contract.centerDegrees2Theta);
    return distance >= contract.backgroundInnerHalfWidth && distance <= contract.backgroundOuterHalfWidth;
  });
  if (!signal.length || !sideband.length) return 0;
  const background = median(sideband.map(point => point[1]));
  const net = Math.max(0, signal.reduce((sum, point) => sum + point[1] - background, 0));
  const variance = Math.max(1, signal.reduce((sum, point) => sum + Math.max(point[1], 0), 0) + background * signal.length);
  return net / Math.sqrt(variance);
};

const rawFeatures = [];
for (const contract of rawManifest.rawFiles) {
  const full = parseRawFile(contract);
  for (const highAngleLimit of spec.expectedRawGrid.highAngleLimitsDegrees2Theta) {
    const points = full.filter(point => point[0] <= highAngleLimit + 1e-7);
    if (points.length < 2) throw new Error(`Too few points for ${contract.name} at HAL ${highAngleLimit}`);
    const steps = points.slice(1).map((point, index) => point[0] - points[index][0]);
    const counts = points.map(point => point[1]);
    const background = quantile(counts, 0.2);
    const netValues = counts.map(value => Math.max(value - background, 0));
    const netSum = netValues.reduce((sum, value) => sum + value, 0);
    const probabilities = netSum ? netValues.filter(value => value > 0).map(value => value / netSum) : [];
    const windowSnr = Object.fromEntries(Object.entries(spec.rawFeatureContract.phaseWindows).map(([name, window]) => [name, phaseWindowSnr(points, window)]));
    rawFeatures.push({
      conditionKey: key(contract.sample, contract.nominalMaximumIntensity, contract.nominalStepSize, highAngleLimit),
      sample: contract.sample,
      nominalMaximumIntensity: contract.nominalMaximumIntensity,
      nominalStepSize: contract.nominalStepSize,
      highAngleLimit,
      rawFile: contract.name,
      rawSha256: contract.sha256,
      points: points.length,
      actualStep: median(steps),
      observedMaximum: Math.max(...counts),
      integratedCounts: trapezoid(points, value => Math.max(value, 0)),
      backgroundQ20: background,
      netIntegratedCounts: trapezoid(points, value => Math.max(value - background, 0)),
      effectiveIntensityBins: probabilities.length ? Math.exp(-probabilities.reduce((sum, probability) => sum + probability * Math.log(probability), 0)) : 0,
      phaseWindowSnr: windowSnr,
      phaseSupportScore: Math.min(...Object.values(windowSnr))
    });
  }
}

const requiredColumns = [
  "sample", "reftype", "HAL", "maxint", "maxintfactor", "stepsize", "stepsizefactor", "Rwp_mean",
  ...phases.map(phase => `${prefixes[phase]}_wt_mean`)
];
const parseSummaryFile = async contract => {
  const file = path.join(summaryDir, contract.name);
  if (!fs.existsSync(file)) throw new Error(`Missing summary file ${contract.name}`);
  if (fs.statSync(file).size !== contract.bytes || sha256(file) !== contract.sha256) throw new Error(`Summary source changed for ${contract.name}`);
  const lines = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
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
    const estimates = Object.fromEntries(phases.map(phase => [phase, number(`${prefixes[phase]}_wt_mean`)]));
    const maximumAbsoluteError = Math.max(...phases.map(phase => Math.abs(estimates[phase] - truth[sample][phase])));
    rows.push({
      sample,
      refinementType: number("reftype"),
      highAngleLimit: number("HAL"),
      maximumIntensity: number("maxint"),
      nominalMaximumIntensity: number("maxintfactor"),
      stepSize: number("stepsize"),
      nominalStepSize: number("stepsizefactor"),
      rwp: number("Rwp_mean"),
      estimates,
      maximumAbsoluteError,
      unsafe: maximumAbsoluteError > errorGate
    });
  }
  if (rows.length !== 728) throw new Error(`${contract.name} has ${rows.length} rows, expected 728`);
  return rows;
};

const rows = (await Promise.all(summaryManifest.files.map(parseSummaryFile))).flat();
const featureMap = new Map(rawFeatures.map(feature => [feature.conditionKey, feature]));
for (const row of rows) {
  const conditionKey = key(row.sample, row.nominalMaximumIntensity, row.nominalStepSize, row.highAngleLimit);
  row.conditionKey = conditionKey;
  row.raw = featureMap.get(conditionKey);
  if (!row.raw) throw new Error(`No raw profile maps to ${conditionKey}`);
}

const groups = new Map();
for (const row of rows) {
  if (!groups.has(row.conditionKey)) groups.set(row.conditionKey, { ...row.raw, rows: [] });
  groups.get(row.conditionKey).rows.push(row);
}
const conditions = [...groups.values()].map(condition => ({
  ...condition,
  unsafe: condition.rows.some(row => row.unsafe),
  allUnsafe: condition.rows.every(row => row.unsafe),
  discordant: condition.rows.some(row => row.unsafe) && condition.rows.some(row => !row.unsafe),
  maximumAbsoluteError: Math.max(...condition.rows.map(row => row.maximumAbsoluteError)),
  medianModelMaximumAbsoluteError: Math.max(...phases.map(phase => Math.abs(median(condition.rows.map(row => row.estimates[phase])) - truth[condition.sample][phase])))
}));
if (rawFeatures.length !== 1456 || rows.length !== 5824 || conditions.length !== 1456) throw new Error("Joined denominator changed");
if (conditions.some(condition => condition.rows.length !== 4)) throw new Error("Every acquisition condition must have four refinement children");

const developmentConditions = conditions.filter(condition => condition.sample === spec.split.developmentSample);
const holdoutConditions = conditions.filter(condition => condition.sample === spec.split.holdoutSample);
const developmentRows = rows.filter(row => row.sample === spec.split.developmentSample);
const holdoutRows = rows.filter(row => row.sample === spec.split.holdoutSample);
const nominalArticleGate = condition => condition.nominalStepSize <= 0.04 && condition.highAngleLimit >= 70 && condition.nominalMaximumIntensity >= 20000;
const observedArticleGate = condition => condition.actualStep <= 0.04 && condition.highAngleLimit >= 70 && condition.observedMaximum >= 20000;
const thresholdAboveUnsafe = (selected, feature) => Math.max(...selected.filter(condition => condition.unsafe).map(feature));
const netCountThreshold = thresholdAboveUnsafe(developmentConditions, condition => condition.netIntegratedCounts);
const phaseSupportThreshold = thresholdAboveUnsafe(developmentConditions, condition => condition.phaseSupportScore);
const netCountGate = condition => condition.netIntegratedCounts > netCountThreshold;
const phaseSupportGate = condition => condition.phaseSupportScore > phaseSupportThreshold;
const rwpGate = row => row.rwp < 8.043046005815;

const assessConditions = (selected, accept) => {
  const accepted = selected.filter(accept);
  const safe = selected.filter(condition => !condition.unsafe);
  const unsafeAccepted = accepted.filter(condition => condition.unsafe);
  return {
    conditions: selected.length,
    unsafeConditions: selected.filter(condition => condition.unsafe).length,
    acceptedConditions: accepted.length,
    acceptedFraction: ratio(accepted.length, selected.length),
    unsafeAccepted: unsafeAccepted.length,
    unsafeAcceptedFraction: ratio(unsafeAccepted.length, accepted.length),
    safeRetention: ratio(accepted.filter(condition => !condition.unsafe).length, safe.length),
    maximumAcceptedError: accepted.length ? round(Math.max(...accepted.map(condition => condition.maximumAbsoluteError))) : null
  };
};
const assessRows = (selected, accept) => {
  const accepted = selected.filter(accept);
  const safe = selected.filter(row => !row.unsafe);
  const unsafeAccepted = accepted.filter(row => row.unsafe);
  return {
    rows: selected.length,
    unsafeRows: selected.filter(row => row.unsafe).length,
    acceptedRows: accepted.length,
    acceptedFraction: ratio(accepted.length, selected.length),
    unsafeAccepted: unsafeAccepted.length,
    unsafeAcceptedFraction: ratio(unsafeAccepted.length, accepted.length),
    safeRetention: ratio(accepted.filter(row => !row.unsafe).length, safe.length),
    maximumAcceptedError: accepted.length ? round(Math.max(...accepted.map(row => row.maximumAbsoluteError))) : null
  };
};
const summarizeConditionLabels = selected => ({
  conditions: selected.length,
  unsafe: selected.filter(condition => condition.unsafe).length,
  allUnsafe: selected.filter(condition => condition.allUnsafe).length,
  discordant: selected.filter(condition => condition.discordant).length,
  safe: selected.filter(condition => !condition.unsafe).length,
  safeRowsInsideDiscordantConditions: selected.filter(condition => condition.discordant).flatMap(condition => condition.rows).filter(row => !row.unsafe).length
});
const summarizeFeatures = selected => ({
  actualStepRatioMedian: round(median(selected.map(condition => condition.actualStep / condition.nominalStepSize))),
  observedToNominalMaximumMedian: round(median(selected.map(condition => condition.observedMaximum / condition.nominalMaximumIntensity))),
  observedToNominalMaximumRange: [round(Math.min(...selected.map(condition => condition.observedMaximum / condition.nominalMaximumIntensity))), round(Math.max(...selected.map(condition => condition.observedMaximum / condition.nominalMaximumIntensity)))],
  phaseSupportMedian: round(median(selected.map(condition => condition.phaseSupportScore))),
  netIntegratedCountsMedian: round(median(selected.map(condition => condition.netIntegratedCounts)), 3)
});

const selectors = {
  nominalArticleGate: {
    rule: "nominal step <= 0.04 degrees, HAL >= 70 degrees, nominal maximum >= 20,000",
    development: assessConditions(developmentConditions, nominalArticleGate),
    holdout: assessConditions(holdoutConditions, nominalArticleGate)
  },
  observedArticleGate: {
    rule: "actual median step <= 0.04 degrees, HAL >= 70 degrees, observed maximum >= 20,000",
    development: assessConditions(developmentConditions, observedArticleGate),
    holdout: assessConditions(holdoutConditions, observedArticleGate)
  },
  netCountGate: {
    threshold: round(netCountThreshold, 6),
    development: assessConditions(developmentConditions, netCountGate),
    holdout: assessConditions(holdoutConditions, netCountGate)
  },
  phaseSupportGate: {
    threshold: round(phaseSupportThreshold, 9),
    development: assessConditions(developmentConditions, phaseSupportGate),
    holdout: assessConditions(holdoutConditions, phaseSupportGate)
  }
};

const rowSelectors = {
  rc18RwpGate: {
    threshold: 8.043046005815,
    development: assessRows(developmentRows, rwpGate),
    holdout: assessRows(holdoutRows, rwpGate)
  },
  phaseSupportConditionGate: {
    development: assessRows(developmentRows, row => phaseSupportGate(row.raw)),
    holdout: assessRows(holdoutRows, row => phaseSupportGate(row.raw))
  },
  twoStageGate: {
    development: assessRows(developmentRows, row => phaseSupportGate(row.raw) && rwpGate(row)),
    holdout: assessRows(holdoutRows, row => phaseSupportGate(row.raw) && rwpGate(row))
  }
};

const stagePartition = Object.fromEntries([developmentRows, holdoutRows].map((selected, index) => {
  const sample = index === 0 ? spec.split.developmentSample : spec.split.holdoutSample;
  const counts = { bothPass: 0, rawPassRwpFail: 0, rawFailRwpPass: 0, bothFail: 0 };
  const unsafeCounts = { bothPass: 0, rawPassRwpFail: 0, rawFailRwpPass: 0, bothFail: 0 };
  for (const row of selected) {
    const rawPass = phaseSupportGate(row.raw), residualPass = rwpGate(row);
    const group = rawPass ? (residualPass ? "bothPass" : "rawPassRwpFail") : (residualPass ? "rawFailRwpPass" : "bothFail");
    counts[group] += 1;
    if (row.unsafe) unsafeCounts[group] += 1;
  }
  return [sample, { counts, unsafeCounts }];
}));

const nominalObservedDisagreement = selected => ({
  nominalOnly: selected.filter(condition => nominalArticleGate(condition) && !observedArticleGate(condition)).length,
  observedOnly: selected.filter(condition => !nominalArticleGate(condition) && observedArticleGate(condition)).length,
  bothAccept: selected.filter(condition => nominalArticleGate(condition) && observedArticleGate(condition)).length,
  bothReject: selected.filter(condition => !nominalArticleGate(condition) && !observedArticleGate(condition)).length
});

const decision = {
  H1_observedGateImprovesNominal: selectors.observedArticleGate.holdout.unsafeAccepted === 0 && selectors.observedArticleGate.holdout.safeRetention > selectors.nominalArticleGate.holdout.safeRetention,
  H2_sameProfileModelChoiceFailure: holdoutConditions.some(condition => condition.discordant),
  H3_phaseSupportBeatsNetCounts: selectors.phaseSupportGate.holdout.unsafeAccepted === 0 && selectors.phaseSupportGate.holdout.safeRetention > selectors.netCountGate.holdout.safeRetention,
  H4_twoStagesDiagnoseDistinctFailure: rowSelectors.twoStageGate.holdout.unsafeAccepted === 0 && stagePartition[spec.split.holdoutSample].counts.rawPassRwpFail > 0 && stagePartition[spec.split.holdoutSample].counts.rawFailRwpPass > 0,
  stableMixtureRungQualified: false
};

const result = {
  benchmarkId: spec.benchmarkId,
  generatedOn: "2026-08-12",
  source: {
    rawManifestId: rawManifest.manifestId,
    summaryManifestId: summaryManifest.manifestId,
    rawFiles: rawManifest.rawFiles.length,
    rawBytes: rawManifest.verified.totalRawBytes,
    topasLineageFiles: rawManifest.lineageFiles.length
  },
  denominators: { rawFiles: 208, rawHalConditions: rawFeatures.length, joinedConditions: conditions.length, joinedRefinementRows: rows.length },
  joinAudit: {
    everyConditionHasFourRefinementChildren: conditions.every(condition => condition.rows.length === 4),
    uniqueRawHashes: new Set(rawManifest.rawFiles.map(file => file.sha256)).size,
    development: summarizeConditionLabels(developmentConditions),
    holdout: summarizeConditionLabels(holdoutConditions)
  },
  observedRawFeatures: {
    development: summarizeFeatures(developmentConditions),
    holdout: summarizeFeatures(holdoutConditions),
    nominalObservedGateDisagreement: {
      development: nominalObservedDisagreement(developmentConditions),
      holdout: nominalObservedDisagreement(holdoutConditions)
    }
  },
  selectors,
  rowSelectors,
  stagePartition,
  decision,
  interpretation: [
    "Raw lineage is now complete from 208 official XY profiles through eight TOPAS input families to 5,824 published summary rows.",
    "A raw-only gate acts on an acquisition block, so discordant refinement types within the same block expose a structural limit: measurement support cannot identify model-choice error.",
    "Phase-window support uses known phase identities and cannot be transferred to unknown-phase discovery without a separate detection stage.",
    "All thresholds remain within one instrument and preparation lineage; independent physical replication is still required before qualifying the stable-mixture rung."
  ]
};

const output = path.join(root, "research/reproducibility/iucr-qpa-raw-support-result.json");
if (write) fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
else console.log(JSON.stringify(result, null, 2));
