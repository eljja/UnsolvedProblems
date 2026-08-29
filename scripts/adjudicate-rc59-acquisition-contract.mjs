import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
const python = read("research/reproducibility/rc59-48-cell-manifest-python.json");
const node = read("research/reproducibility/rc59-48-cell-manifest-node.json");
const metrology = read("research/reproducibility/rc59-metrology-intervention-contract.json");
const expansion = read("research/reproducibility/rc59-expansion-repeatability-contract.json");
const output = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length)
  || "research/reproducibility/rc59-acquisition-contract-independent-audit.json";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
assert(python.randomization.allocationHashSha256 === node.randomization.allocationHashSha256, "Python and Node allocation hashes disagree");
assert(JSON.stringify(python.allocation) === JSON.stringify(node.allocation), "Python and Node allocations disagree");
assert(python.allocation.length === 48, "allocation must contain 48 cells");
assert(new Set(python.allocation.map((row) => row.specimenId)).size === 48, "specimen IDs must be unique");
assert(new Set(python.allocation.map((row) => row.channelId)).size === 48, "channel IDs must be unique");

const expectedContainment = {
  chamberId: [24, "25-cycle"],
  fixtureGroupId: [36, "50-cycle"],
  startWave: [40, "50-cycle"],
  manufacturingBlockId: [44, "50-cycle"],
  channelId: [47, "50-cycle"],
  "chamberId+fixtureGroupId": [42, "50-cycle"],
};
for (const item of python.failureContainment) {
  const expected = expectedContainment[item.field];
  assert(Boolean(expected), `unexpected failure domain ${item.field}`);
  assert(item.usableAfterWorstSingleDomainLoss === expected?.[0], `${item.field} survivorship changed`);
  assert(item.sealedBranch === expected?.[1], `${item.field} branch changed`);
}

assert(metrology.status.includes("physical-work-blocked"), "metrology contract must block physical work");
assert(metrology.metricRegistry.length === 4, "four co-primary metrics are required");
assert(metrology.metricRegistry.every((metric) => metric.equivalenceMarginM === null && metric.status === "blocked"), "unjustified numerical margins must remain unset");
assert(metrology.marginRule.formula.includes("U95_i < M_i"), "fit-for-purpose interval is missing");
assert(expansion.status.includes("physical-work-blocked"), "expansion contract must block physical work");
assert(expansion.twoLayerStudy.stableArtifactLayer.objects.includes("Twelve stable inert"), "stable-artifact layer is missing");
assert(expansion.twoLayerStudy.sacrificialCellLayer.objects.includes("Twelve disjoint"), "disjoint-cell layer is missing");
assert(expansion.uncertaintyModel.decisionFormula.includes("U95_exp < M_exp"), "expansion resolution gate is missing");

const audit = {
  auditId: "RC59-ACQUISITION-CONTRACT-INDEPENDENT-AUDIT-0.1",
  cycleId: "RC-2026-59",
  completedOn: "2026-08-29",
  status: failures.length ? "fail" : "pass-computational-contract-physical-work-blocked",
  outcomeValuesUsed: 0,
  allocationAgreement: {
    hashSha256: python.randomization.allocationHashSha256,
    exactRecordAgreement: JSON.stringify(python.allocation) === JSON.stringify(node.allocation),
    specimens: python.allocation.length,
    uniqueChannels: new Set(python.allocation.map((row) => row.channelId)).size,
  },
  singleFailureContainment: Object.fromEntries(python.failureContainment.map((item) => [item.field, {
    usable: item.usableAfterWorstSingleDomainLoss,
    branch: item.sealedBranch,
  }])),
  interventionVerdict: {
    acuteSentinel: "preregistered-but-not-executed",
    longTermEquivalence: "blocked-until-four-external-fit-for-purpose-margins-and-U95-are-signed",
    unsupportedMarginsInserted: 0,
  },
  expansionVerdict: {
    stableArtifactGaugeStudy: "preregistered-but-not-executed",
    sacrificialCellCrossover: "preregistered-but-not-executed",
    pressureAdjustedResidual: "untested",
  },
  claimBoundary: "This audit confirms deterministic balance, single-domain containment arithmetic, and logical stop gates. It does not validate physical resources, measurement equivalence, expansion repeatability, battery lifetime prediction, or safety.",
  failures,
};

fs.writeFileSync(path.join(ROOT, output), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
if (failures.length) {
  console.error(`RC59 adjudication failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`RC59 adjudication passed: hash=${audit.allocationAgreement.hashSha256}, chamber-loss->24, fixture-loss->36; physical work remains blocked.`);
