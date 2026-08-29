import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SEED = "RC59-48-CELL-ACQUISITION-V1";
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const seed = args.seed || DEFAULT_SEED;
const output = args.output || "research/reproducibility/rc59-48-cell-manifest-node.json";

const sha256 = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const digest = (namespace, item) => sha256(`${seed}|${namespace}|${item}`);
const ranked = (values, namespace) => [...values].sort((a, b) => {
  const da = digest(namespace, String(a));
  const db = digest(namespace, String(b));
  return da.localeCompare(db) || String(a).localeCompare(String(b));
});
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

const blocks = Array.from({ length: 12 }, (_, index) => `B${String(index + 1).padStart(2, "0")}`);
const fixtures = ["F1", "F2", "F3", "F4"];
const chambers = ["C1", "C2"];
const patterns = [];
for (let left = 0; left < fixtures.length; left += 1) {
  for (let right = left + 1; right < fixtures.length; right += 1) patterns.push(`${fixtures[left]}+${fixtures[right]}`);
}
const orderedBlocks = ranked(blocks, "manufacturing-block-order");
const allocation = [];

for (let waveIndex = 0; waveIndex < 6; waveIndex += 1) {
  const wave = waveIndex + 1;
  const pair = orderedBlocks.slice(2 * waveIndex, 2 * waveIndex + 2);
  const pattern = ranked(patterns, `wave-${wave}-chamber-pattern`)[0].split("+");
  pair.forEach((block, blockIndex) => {
    const specimenOrdinals = ranked([1, 2, 3, 4], `${block}-specimen-to-fixture`);
    fixtures.forEach((fixture, fixtureIndex) => {
      const chamberOne = pattern.includes(fixture);
      const chamber = chamberOne !== Boolean(blockIndex) ? chambers[0] : chambers[1];
      const ordinal = specimenOrdinals[fixtureIndex];
      const positions = ranked([1, 2, 3, 4, 5, 6], `${chamber}-${fixture}-channel-position`);
      const position = positions[waveIndex];
      allocation.push({
        specimenId: `RC59-${block}-S${ordinal}`,
        manufacturingBlockId: block,
        conditionId: "RC59-CONDITION-01",
        startWave: wave,
        chamberId: chamber,
        fixtureGroupId: fixture,
        channelPosition: position,
        channelId: `${chamber}-${fixture}-P${position}`,
        outcomeAccess: "closed",
        cycle480QcStatus: "pending",
      });
    });
  });
}
allocation.sort((a, b) => a.specimenId.localeCompare(b.specimenId));

const failureContainment = [];
for (const [field, domain] of [
  ["chamberId", "single chamber"],
  ["fixtureGroupId", "single fixture group"],
  ["startWave", "single start wave"],
  ["manufacturingBlockId", "single manufacturing block"],
  ["channelId", "single channel"],
]) {
  const values = [...new Set(allocation.map((row) => row[field]))].sort((a, b) => String(a).localeCompare(String(b)));
  const sizes = values.map((value) => allocation.filter((row) => row[field] === value).length);
  const largestDomainSize = Math.max(...sizes);
  const usableAfterWorstSingleDomainLoss = allocation.length - largestDomainSize;
  failureContainment.push({
    domain,
    field,
    domainCount: values.length,
    largestDomainSize,
    usableAfterWorstSingleDomainLoss,
    sealedBranch: usableAfterWorstSingleDomainLoss >= 36 ? "50-cycle" : usableAfterWorstSingleDomainLoss >= 24 ? "25-cycle" : "stop",
  });
}
const intersections = chambers.flatMap((chamber) => fixtures.map((fixture) => allocation.filter((row) => row.chamberId === chamber && row.fixtureGroupId === fixture).length));
const intersectionLoss = Math.max(...intersections);
failureContainment.push({
  domain: "single chamber-fixture intersection",
  field: "chamberId+fixtureGroupId",
  domainCount: intersections.length,
  largestDomainSize: intersectionLoss,
  usableAfterWorstSingleDomainLoss: allocation.length - intersectionLoss,
  sealedBranch: "50-cycle",
});

const plan = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  manifestId: "RC59-48-CELL-ACQUISITION-MANIFEST-0.1",
  cycleId: "RC-2026-59",
  generatedOn: "2026-08-29",
  status: "planning-only-no-cells-acquired-outcomes-closed",
  claimBoundary: "This is a deterministic allocation and failure-containment design. It does not claim that cells, chambers, fixtures, channels, calibrations, or safety approvals exist.",
  randomization: {
    algorithm: "SHA-256 lexical ranking without replacement",
    algorithmVersion: "rc59-v1",
    seed,
    allocationHashSha256: sha256(stable(allocation)).toUpperCase(),
    balanceDesign: "Six waves each pair two four-cell manufacturing blocks; every block occupies all four fixture groups with two cells per chamber, and paired blocks use complementary chambers. Each chamber-fixture intersection receives one cell per wave and six unique channel positions.",
  },
  frozenDomain: {
    conditionId: "RC59-CONDITION-01",
    chemistry: "TO_BE_FROZEN_BEFORE_ACQUISITION",
    cellDesign: "TO_BE_FROZEN_BEFORE_ACQUISITION",
    manufacturingLotDefinition: "TO_BE_FROZEN_BEFORE_ACQUISITION",
    formationRecipeId: "TO_BE_FROZEN_BEFORE_ACQUISITION",
    temperatureSetpointAndTolerance: "TO_BE_FROZEN_BEFORE_ACQUISITION",
    chargeProtocolId: "TO_BE_FROZEN_BEFORE_ACQUISITION",
    dischargeProtocolId: "TO_BE_FROZEN_BEFORE_ACQUISITION",
    voltageWindow: "TO_BE_FROZEN_BEFORE_ACQUISITION",
    endpointDefinitionId: "TO_BE_FROZEN_BEFORE_ACQUISITION",
  },
  resourceModel: {
    planningExample: true,
    chambers: 2,
    fixtureGroupsPerChamber: 4,
    channelPositionsPerFixtureGroup: 6,
    manufacturingBlocks: 12,
    cellsPerManufacturingBlock: 4,
    startWaves: 6,
    cellsPerStartWave: 8,
    replacementEnrollment: "forbidden-after-randomization",
  },
  cycle480BranchRegister: {
    decisionTime: "after nominal cycle-480 QC and before any target lifetime order or candidate score is opened",
    allowedInputs: ["specimenId", "cycle480QcStatus", "administrative censoring reason"],
    forbiddenInputs: ["lifetime", "EOL cycle", "capacity trajectory after feature lock", "candidate score", "within-cohort rank"],
    branches: [
      { minimumUsable: 36, maximumUsable: 48, endpointCadenceCycles: 50, decision: "continue-low-burden" },
      { minimumUsable: 24, maximumUsable: 35, endpointCadenceCycles: 25, decision: "continue-resolution-rescue" },
      { minimumUsable: 0, maximumUsable: 23, endpointCadenceCycles: null, decision: "stop-confirmation" },
    ],
  },
  failureContainment,
  allocation,
  requiredBeforePhysicalUse: [
    "Replace every TO_BE_FROZEN value and hash the signed domain specification.",
    "Map each planning resource ID to an actual calibrated resource and maintenance record.",
    "Record battery laboratory safety approval and emergency-response ownership.",
    "Pass the RC59 metrology, acute-intervention, and expansion-fixture gates on disjoint sacrificial resources.",
    "Confirm that no outcome-capable role can read target lifetime before the registered opening event.",
  ],
};

const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(allocation.length === 48, "expected 48 allocations");
assert(new Set(allocation.map((row) => row.specimenId)).size === 48, "specimen IDs must be unique");
assert(new Set(allocation.map((row) => row.channelId)).size === 48, "channel IDs must be unique");
for (const block of blocks) {
  const rows = allocation.filter((row) => row.manufacturingBlockId === block);
  assert(rows.length === 4, `${block} must contain four cells`);
  assert(new Set(rows.map((row) => row.fixtureGroupId)).size === 4, `${block} must span all fixtures`);
  assert(rows.filter((row) => row.chamberId === "C1").length === 2, `${block} must split chambers 2/2`);
}
for (const chamber of chambers) {
  assert(allocation.filter((row) => row.chamberId === chamber).length === 24, `${chamber} must contain 24 cells`);
  for (const fixture of fixtures) {
    const rows = allocation.filter((row) => row.chamberId === chamber && row.fixtureGroupId === fixture);
    assert(rows.length === 6, `${chamber}-${fixture} must contain six cells`);
    assert(new Set(rows.map((row) => row.startWave)).size === 6, `${chamber}-${fixture} must cover all waves`);
    assert(new Set(rows.map((row) => row.channelPosition)).size === 6, `${chamber}-${fixture} must cover all positions`);
  }
}

if (args.write) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}
console.log(`RC59 Node allocation passed: 48 cells, hash=${plan.randomization.allocationHashSha256}`);
