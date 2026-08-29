#!/usr/bin/env node

/** Compare RC57 implementations and issue the outcome-opening decision. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "research", "reproducibility");
const read = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));
const write = process.argv.includes("--write");
const lineage = read("rc57-aurora-rocrate-lineage-audit.json");
const contract = read("rc57-lineage-pair-design-contract.json");
const python = read("rc57-endpoint-pair-design-python.json");
const node = read("rc57-endpoint-pair-design-node.json");

const differences = [];
const tolerance = 1e-12;
if (python.inputSha256 !== node.inputSha256) differences.push("input hash");
if (python.contractSha256 !== node.contractSha256) differences.push("contract hash");
if (python.futureExactDesigns.length !== node.futureExactDesigns.length) differences.push("design row count");
let maxProbabilityDifference = 0;
for (let index = 0; index < Math.min(python.futureExactDesigns.length, node.futureExactDesigns.length); index += 1) {
  const left = python.futureExactDesigns[index];
  const right = node.futureExactDesigns[index];
  for (const key of ["effectiveObservedEvents", "spreadScale", "intervalCycles", "passesPairPowerGate"]) {
    if (left[key] !== right[key]) differences.push(`row ${index} ${key}`);
  }
  for (const key of ["phase", "binCount", "lowerFivePercentPairCount", "medianPairCount"]) {
    if (left.worstPhase[key] !== right.worstPhase[key]) differences.push(`row ${index} worstPhase.${key}`);
  }
  maxProbabilityDifference = Math.max(
    maxProbabilityDifference,
    Math.abs(left.worstPhase.probabilityAtLeast100 - right.worstPhase.probabilityAtLeast100)
  );
}
if (maxProbabilityDifference > tolerance) differences.push(`probability difference ${maxProbabilityDifference}`);

const selection = (result, events) => result.conservativeSelections.find((item) => item.effectiveObservedEvents === events);
for (const events of [24, 36]) {
  const left = selection(python, events);
  const right = selection(node, events);
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    const probabilityDifference = Math.abs(left.worstPhaseProbabilityAtLeast100 - right.worstPhaseProbabilityAtLeast100);
    if (
      left.effectiveObservedEvents !== right.effectiveObservedEvents
      || left.selectedLargestPassingIntervalCycles !== right.selectedLargestPassingIntervalCycles
      || left.worstPhaseLowerFivePercentPairCount !== right.worstPhaseLowerFivePercentPairCount
      || probabilityDifference > tolerance
    ) differences.push(`selection ${events}`);
  }
}

const implementationPass = differences.length === 0;
const audit = {
  auditId: "RC57-LINEAGE-PAIR-INDEPENDENT-AUDIT-0.1",
  cycleId: "RC-2026-57",
  completedOn: "2026-08-29",
  status: implementationPass ? "pass-design-agreement-negative-target-stop" : "fail-implementation-disagreement",
  contractStatus: contract.status,
  implementationAgreement: {
    pass: implementationPass,
    comparedDesignRows: Math.min(python.futureExactDesigns.length, node.futureExactDesigns.length),
    maxProbabilityDifference,
    tolerance,
    differences,
  },
  invariantResults: {
    fourCellBlockUpperBound: 72,
    twentyFourObservedEvents: selection(python, 24),
    thirtySixObservedEvents: selection(python, 36),
  },
  lineageDecision: {
    roCrateGraphEntities: lineage.roCrate.graphEntityCount,
    inventoryCells: lineage.inventoryAgreement.crateCells,
    explicitLfpCells: lineage.paperToArchiveCohort.archiveExplicitLfpCells,
    paperLfpCells: lineage.paperToArchiveCohort.paperLongTermLfpCells,
    lineageGatePass: lineage.decision.lineageGatePass,
  },
  adjudication: {
    pairDesignPass: implementationPass
      && selection(python, 24).selectedLargestPassingIntervalCycles === 25
      && selection(python, 36).selectedLargestPassingIntervalCycles === 50,
    auroraTargetEligible: lineage.decision.lineageGatePass,
    auroraCyclingAccessAuthorized: false,
    verdict: "The prospective pair bottleneck is repairable by block size and cadence, but the public Aurora cohort lineage remains unresolved. Exclude Aurora and keep all target cycling outcomes closed."
  },
  claimBoundary: "Agreement verifies deterministic arithmetic and the stated public-metadata boundary. It does not validate a battery lifetime feature, prove schedule non-interference, or identify the four missing Aurora cohort members."
};

if (write) fs.writeFileSync(path.join(DIR, "rc57-lineage-pair-independent-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(
  `RC57 adjudication: implementations=${implementationPass ? "agree" : "disagree"}, max |Δp|=${maxProbabilityDifference.toExponential(4)}, lineage=${lineage.decision.lineageGatePass ? "pass" : "fail"}, target-open=false`
);
if (!implementationPass) process.exit(1);
