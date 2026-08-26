import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const precommit = read("research/reproducibility/rc52-battery-domain-passport-precommit.json");
const schema = read("research/reproducibility/rc52-battery-schema-audit.json");
const features = read("research/reproducibility/rc52-battery-feature-table.json");
const python = read("research/reproducibility/rc52-battery-domain-passport-python.json");
const node = read("research/reproducibility/rc52-battery-domain-passport-node.json");
const failures = [];
let numericComparisons = 0;
let exactComparisons = 0;

function exact(condition, message) {
  exactComparisons += 1;
  if (!condition) failures.push(message);
}

function close(left, right, message, tolerance = 1e-10) {
  numericComparisons += 1;
  const allowed = tolerance + tolerance * Math.max(Math.abs(left), Math.abs(right));
  if (!(Number.isFinite(left) && Number.isFinite(right)) || Math.abs(left - right) > allowed) failures.push(`${message}: ${left} != ${right}`);
}

exact(precommit.precommitId === "RC52-BATTERY-DOMAIN-PASSPORT-PRECOMMIT-0.1", "precommit identity changed");
exact(precommit.status.includes("before-feature-extraction-model-fitting-or-performance-results"), "chronology boundary changed");
exact(precommit.selection.problemIds.join("|") === "UP-219|UP-233|UP-234", "problem scope changed");
exact(precommit.featureContract.featuresInOrder.join("|") === features.featureNames.join("|"), "feature order differs from precommit");
exact(schema.labelValuesRead === false && schema.totals.labelledFileCount === 55, "label-blind schema audit changed");
exact(features.rows.length === 52 && features.exclusions.length === 3, "eligible or excluded count changed");
exact(features.exclusions.every(item => item.reason === "official life label does not exceed 20-cycle horizon"), "unregistered feature or outcome exclusion found");
exact(python.archiveHashAudit.length === 6 && python.archiveHashAudit.every(item => item.matches), "archive hash gate failed");
exact(python.scopeBoundary.fieldPackCount === 0 && python.scopeBoundary.safetyFailureCount === 0 && python.scopeBoundary.multimodalInternalStateCount === 0 && python.scopeBoundary.independentLaboratoryReplicationCount === 0, "scope denominator changed");

const preregFiles = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "bd5a4ae"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).sort();
const expectedPreregFiles = [
  "research/reproducibility/rc52-battery-domain-passport-precommit.json",
  "research/reproducibility/rc52-battery-domain-passport-prior-art.json",
  "research/reproducibility/rc52-battery-schema-audit.json",
  "scripts/audit_rc52_battery_schema.py"
].sort();
exact(preregFiles.join("|") === expectedPreregFiles.join("|"), "precommit commit contains implementation or outcome files");
for (const outcome of [
  "research/reproducibility/rc52-battery-feature-table.json",
  "research/reproducibility/rc52-battery-domain-passport-python.json",
  "research/reproducibility/rc52-battery-domain-passport-node.json",
  "scripts/run_rc52_battery_domain_passport.py",
  "scripts/independent-rc52-battery-domain-passport.mjs"
]) {
  const existed = spawnSync("git", ["cat-file", "-e", `bd5a4ae:${outcome}`], { cwd: root });
  exact(existed.status !== 0, `outcome existed at preregistration: ${outcome}`);
}

exact(node.eligibleCellCount === python.eligibleCellCount && node.featureCount === python.featureCount, "implementation cohort differs");
exact(node.randomSplit.repeatCount === 200 && python.randomSplit.repeatCount === 200, "random repeat count differs");
for (let index = 0; index < 200; index += 1) {
  const left = python.randomSplit.results[index];
  const right = node.randomSplit.results[index];
  exact(left.repeat === right.repeat && left.testCellIds.join("|") === right.testCellIds.join("|"), `random split ${index} assignment differs`);
  for (const field of ["mdape", "rmseLogLife", "catastrophicFraction", "meanAbsolutePercentageError"]) close(left[field], right[field], `random split ${index} ${field}`);
}

const nodeCells = new Map(node.leaveSourceOut.cellPredictions.map(item => [`${item.source}|${item.cellId}`, item]));
for (const left of python.leaveSourceOut.cellPredictions) {
  const right = nodeCells.get(`${left.source}|${left.cellId}`);
  exact(Boolean(right), `Node cell missing: ${left.source}/${left.cellId}`);
  for (const field of ["life", "logPrediction", "supportDistance", "absolutePercentageError"]) close(left[field], right[field], `${left.source}/${left.cellId} ${field}`);
  exact(left.accepted === right.accepted && left.intervalCovered === right.intervalCovered, `${left.source}/${left.cellId} verdict differs`);
}

for (const left of python.leaveSourceOut.folds) {
  const right = node.leaveSourceOut.folds.find(item => item.source === left.source);
  exact(Boolean(right), `Node fold missing: ${left.source}`);
  for (const field of ["supportThreshold", "acceptedFraction", "intervalRadiusLogLife", "intervalMultiplicativeWidth", "intervalCoverage"]) close(left[field], right[field], `${left.source} ${field}`);
  for (const field of ["mdape", "rmseLogLife", "catastrophicFraction", "meanAbsolutePercentageError"]) close(left.metrics[field], right.metrics[field], `${left.source} metrics.${field}`);
  exact(left.acceptedCount === right.acceptedCount && left.intervalOrderRank === right.intervalOrderRank, `${left.source} count or interval rank differs`);
  if (left.pilot) {
    exact(left.pilot.pair.join("|") === right.pilot.pair.join("|"), `${left.source} pilot selection differs`);
    for (const field of ["offsetLogLife", "medianAllPairMdape", "relativeMdapeImprovement"]) close(left.pilot[field], right.pilot[field], `${left.source} pilot.${field}`);
    exact(left.pilot.passesTwentyPercent === right.pilot.passesTwentyPercent && left.pilot.noWorseThanMedianPair === right.pilot.noWorseThanMedianPair, `${left.source} pilot verdict differs`);
  }
}

for (const field of ["mdape", "rmseLogLife", "catastrophicFraction", "meanAbsolutePercentageError"]) close(python.adjudication.pooledLeaveSourceOut[field], node.adjudication.pooledLeaveSourceOut[field], `pooled ${field}`);
close(python.adjudication.randomMixtureMedian.mdape, node.adjudication.randomMixtureMedian.mdape, "random median MdAPE");
close(python.adjudication.randomMixtureMedian.catastrophicFraction, node.adjudication.randomMixtureMedian.catastrophicFraction, "random median catastrophic fraction");
for (const left of python.adjudication.hypotheses) {
  const right = node.adjudication.hypotheses.find(item => item.code === left.code);
  exact(left.verdict === right?.verdict, `${left.code} adjudication differs`);
}

const audit = {
  audit: "RC52 battery domain-passport independent adjudication",
  generatedOn: "2026-08-26",
  precommitGitCommit: "bd5a4ae",
  verdict: failures.length ? "fail" : "pass",
  failures,
  comparisons: { exact: exactComparisons, numeric: numericComparisons, total: exactComparisons + numericComparisons },
  chronology: {
    preregistrationFileCount: preregFiles.length,
    outcomeFilesAbsentAtSeal: true,
    outcomeBlindClaimed: false,
    note: "Life-label files had been inspected before sealing, but all feature, model, split-performance, support, interval, and pilot results were absent."
  },
  reproducibility: {
    pythonVersionFamily: "Python/NumPy",
    nodeVersionFamily: "Node.js without numerical dependencies",
    eligibleCells: features.rows.length,
    featureCount: features.featureNames.length,
    randomSplits: 200,
    leaveSourceOutCells: python.leaveSourceOut.cellPredictions.length,
    maximumAllowedLogPredictionDifference: 1e-8
  },
  registeredAdjudication: python.adjudication.hypotheses,
  decisiveBoundaries: {
    randomMedianMdape: python.adjudication.randomMixtureMedian.mdape,
    leaveSourceOutMdape: python.adjudication.pooledLeaveSourceOut.mdape,
    mdapeRatio: python.adjudication.hypotheses.find(item => item.code === "H0").mdapeRatio,
    supportAcceptedFraction: python.adjudication.hypotheses.find(item => item.code === "H1").acceptedFraction,
    intervalPooledCoverage: python.adjudication.hypotheses.find(item => item.code === "H2").pooledCoverage,
    pilotPassingSources: python.adjudication.hypotheses.find(item => item.code === "H3").passingSourceCount
  },
  scopeBoundary: python.scopeBoundary
};
fs.writeFileSync(path.join(root, "research/reproducibility/rc52-battery-domain-passport-independent-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
if (failures.length) {
  console.error(JSON.stringify(audit, null, 2));
  process.exit(1);
}
console.log(`RC52 independent adjudication passed: ${audit.comparisons.total} comparisons, 52 leave-source-out cells, 200 fixed random splits.`);
