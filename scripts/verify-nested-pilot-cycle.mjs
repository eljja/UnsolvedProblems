import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const audit = load("research/reproducibility/pxrd-round-robin-audit.json");
const spec = load("research/reproducibility/nist-micro-pilot-spec.json");
const result = load("research/reproducibility/nist-micro-pilot-result.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(audit.auditId === "DIFFRACTION-MULTIFACILITY-LINEAGE-AUDIT-0.1", "diffraction audit ID changed");
check(audit.candidates.length === 4, "diffraction audit candidate denominator changed");
check(audit.candidates.every(candidate => candidate.admissibleForFullVarianceDecomposition === false), "an audited public dataset unexpectedly passes full decomposition");
check(result.benchmarkId === spec.benchmarkId, "micro-pilot spec/result IDs differ");
check(result.grid.points === 192 && result.grid.temperatures === 8 && result.grid.compositions === 24, "NIST grid denominator changed");
check(result.dataSeparation.selectionFunctionReadsHeldOutLabels === false, "held-out adjudication leaked into selection");
check(result.findings.twentyFourIsNestedInThirtyTwo, "24-coordinate checkpoint is no longer nested in 32");
check(result.findings.onePreparationCannotIdentifyPreparationVariance, "one preparation must not identify preparation variance");
check(result.findings.twoPreparationsRestorePreparationContrast, "two preparations should restore the preparation contrast");
check(result.findings.thirtyTwoTwoPreparationAcquisitions, "32-coordinate nested pilot must have 256 acquisitions");
check(result.findings.allTemperaturesCovered, "candidate pilot lost temperature coverage");
check(result.exactControlGate.minimumIndependentControlsWithZeroFailures === 29, "exact zero-failure control denominator changed");
check(result.findings.binaryGateDeferred, "micro-pilot must not claim the 0.10 binary control gate");
for (const budget of result.budgets) {
  check(budget.frontierCoordinates.length === budget.budget / 2, `${budget.budget}: frontier allocation changed`);
  check(budget.controlCoordinates.length === budget.budget / 2, `${budget.budget}: control allocation changed`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Nested-pilot cycle verification passed: four public-data candidates audited, held-out labels sealed, 24/32 coordinates nested, and the 256-acquisition two-preparation design is identifiable.");
