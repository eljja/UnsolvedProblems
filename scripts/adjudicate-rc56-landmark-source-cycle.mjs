#!/usr/bin/env node

/** Cross-runtime and outcome-boundary adjudication for RC56. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const read = async (name) => JSON.parse(await readFile(path.join(REPRO, name), "utf8"));

const source = await read("rc56-aurora-source-audit.json");
const python = await read("rc56-rwth-landmark-development-python.json");
const node = await read("rc56-rwth-landmark-development-node.json");
const explicitLfp = source.metadata.filter((item) => item.matchedLeaves.some((leaf) => String(leaf.value).toLowerCase().includes("lifepo4")));
const cellId = (name) => Number(name.match(/ccid(\d+)/)?.[1]);
const comparisons = python.results.map((primary, index) => {
  const independent = node.results[index];
  return {
    name: primary.name,
    sameName: primary.name === independent.name,
    concordanceAbsDifference: Math.abs(primary.withinHeldBatchConcordance - independent.withinHeldBatchConcordance),
    betaAbsDifference: Math.abs(primary.fullCohortBeta - independent.fullCohortBeta),
    sameComparablePairs: primary.withinHeldBatchComparablePairs === independent.withinHeldBatchComparablePairs,
    sameFoldSigns: JSON.stringify(primary.foldBetaSigns) === JSON.stringify(independent.foldBetaSigns),
    sameGates: JSON.stringify(primary.gates) === JSON.stringify(independent.gates),
    sameVerdict: primary.passesAllGates === independent.passesAllGates,
  };
});
const maxConcordanceDifference = Math.max(...comparisons.map((item) => item.concordanceAbsDifference));
const maxBetaDifference = Math.max(...comparisons.map((item) => item.betaAbsDifference));
const agreementPass = comparisons.every((item) => item.sameName
  && item.concordanceAbsDifference <= 1e-12
  && item.betaAbsDifference <= 1e-6
  && item.sameComparablePairs
  && item.sameFoldSigns
  && item.sameGates
  && item.sameVerdict);
const output = {
  auditId: "RC56-LANDMARK-SOURCE-INDEPENDENT-AUDIT-0.1",
  cycleId: "RC-2026-56",
  completedOn: "2026-08-29",
  status: agreementPass ? "pass-negative-stop" : "implementation-disagreement-stop",
  implementationAgreement: {
    pass: agreementPass,
    selectedCandidatePython: python.selectedCandidate,
    selectedCandidateNode: node.selectedCandidate,
    maxConcordanceAbsDifference: maxConcordanceDifference,
    maxFullCohortBetaAbsDifference: maxBetaDifference,
    comparisons,
  },
  sourceBoundary: {
    officialZipEntries: source.directory.entryCount,
    metadataFiles: source.metadataFileCount,
    csvFiles: source.entryClasses.find((item) => item.suffix === ".bdf.csv")?.count,
    parquetFiles: source.entryClasses.find((item) => item.suffix === ".bdf.parquet")?.count,
    explicitLiFePO4MetadataCount: explicitLfp.length,
    explicitLiFePO4CellIds: explicitLfp.map((item) => cellId(item.name)),
    paperReportedLongTermLfpCells: 36,
    unresolvedCountDifference: 36 - explicitLfp.length,
    cyclingDataEntriesOpened: source.outcomeBoundary.cyclingDataEntriesOpened,
    cellCapacityValuesObserved: source.outcomeBoundary.cellCapacityValuesObserved,
    cellEolValuesObserved: source.outcomeBoundary.cellEolValuesObserved,
  },
  decision: {
    rwthCandidateEarned: python.selectedCandidate !== null && node.selectedCandidate !== null,
    auroraMinimumCountGate: explicitLfp.length >= 36,
    auroraCyclingAccessAuthorized: false,
    reason: "No RWTH coordinate satisfied every registered gate, and the official Aurora archive exposed 32 explicit LiFePO4 metadata records rather than the paper's 36-cell long-term cohort. The outcome boundary therefore remains closed.",
  },
  preservedSignals: [
    {
      candidate: "R2_recent_log_slope",
      concordance: python.results.find((item) => item.name === "R2_recent_log_slope").withinHeldBatchConcordance,
      comparablePairs: python.results.find((item) => item.name === "R2_recent_log_slope").withinHeldBatchComparablePairs,
      interpretation: "candidate-generation signal only; fails the registered 60-pair gate",
    },
    {
      candidate: "R3_capacity_level",
      concordance: python.results.find((item) => item.name === "R3_capacity_level").withinHeldBatchConcordance,
      comparablePairs: python.results.find((item) => item.name === "R3_capacity_level").withinHeldBatchComparablePairs,
      interpretation: "strongest outcome-open signal; fails the registered 60-pair gate and cannot be called confirmation",
    },
  ],
  nextAction: "Resolve the 36-versus-32 Aurora cohort lineage from an official manifest or author clarification. Independently, acquire or identify a same-condition source with denser endpoint timing so blocked validation yields at least 60 non-tied pairs; do not reopen selection on RWTH outcomes.",
};
await writeFile(path.join(REPRO, "rc56-landmark-source-independent-audit.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`RC56 adjudication: agreement=${agreementPass}, LFP metadata=${explicitLfp.length}, candidate=${python.selectedCandidate ?? "none"}, Aurora cycling opened=0`);
