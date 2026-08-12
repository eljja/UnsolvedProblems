import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const manifest = load("research/reproducibility/sasbdb-raw-source-manifest.json");
const snapshot = load("research/reproducibility/sasbdb-filter-input.json");
const filterSpec = load("research/reproducibility/sasbdb-filter-spec.json");
const filterResult = load("research/reproducibility/sasbdb-filter-result.json");
const powerSpec = load("research/reproducibility/nist-repeat-power-spec.json");
const powerResult = load("research/reproducibility/nist-repeat-power-result.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const expectedArchiveHashes = {
  SASDPP4: "ff4b70588c0644d9df585d2efc1621a349f589f2b7cfa510b6046e220ee28763",
  SASDPQ4: "cd30ce9187b44c91dec7b5120834e68cb08e6863ab4670c04affeb10071f8fda",
  SASDPR4: "317baf16dc627becf56ba6ce631f0c94be7e39971cf40252eb7847a3fbbbd1ff",
  SASDPS4: "c4bebf280ba0caf538dd1a57b1d83faf5749d874c387b63b1da95ed0f5ecdf1a",
  SASDPT4: "b2ff9fc29d262551d327588e285fa20d28f3cd3e54fbf856a2df350096ac241d"
};
check(manifest.auditId === "SASBDB-ROUND-ROBIN-RAW-LINEAGE-0.1", "raw-lineage audit ID changed");
check(manifest.totals.consensusInputProfiles === 48 && manifest.totals.physicalInstruments === 12, "SASBDB input or instrument denominator changed");
check(manifest.totals.secOnly === 15 && manifest.totals.batchOnly === 14 && manifest.totals.mergedSecBatch === 19, "SASBDB input-mode partition changed");
check(manifest.totals.singleModeInstrumentConfigurations === 8, "single-mode instrument-configuration denominator changed");
for (const archive of manifest.archives) check(archive.archiveSha256 === expectedArchiveHashes[archive.id], `${archive.id}: official archive hash changed`);
check(Object.values(manifest.findings).every(Boolean), "not every raw-lineage finding is true");

check(snapshot.datasetId === "SASBDB-ROUND-ROBIN-FILTER-SNAPSHOT-0.1", "filter snapshot ID changed");
check(snapshot.proteins.reduce((sum, protein) => sum + protein.rows.length, 0) === 497, "filter snapshot must retain 497 common q points");
check(filterResult.benchmarkId === filterSpec.benchmarkId, "filter sensitivity IDs differ");
check(filterResult.adjudication.universalGuinierPipelineInvariancePasses === false, "universal low-q pipeline invariance must remain rejected");
check(filterResult.adjudication.proteinsBelowOnePercentGuinierP95.join("|") === "RNase A|Xylose isomerase|Xylanase", "sub-one-percent Guinier set changed");
check(filterResult.adjudication.guinierExceptions.join("|") === "Urate oxidase|Lysozyme", "Guinier exception set changed");
check(filterResult.adjudication.largestGuinierP95RangePercent === 3.638338, "largest Guinier filter envelope changed");
check(filterResult.adjudication.largestStructuralP95RangePercent === 36.376517, "largest structural filter envelope changed");
check(Object.values(filterResult.findings).every(Boolean), "not every filter-sensitivity finding is true");

check(powerResult.benchmarkId === powerSpec.benchmarkId, "NIST repeat-power IDs differ");
check(powerResult.design.totalAcquisitions === 1176 && powerResult.stagedDecision.pilotAcquisitions === 392, "NIST acquisition denominator changed");
check(powerResult.primaryScenario.designEffect === 7.6 && powerResult.primaryScenario.effectiveSampleSizePerGroup === 77.368421, "primary clustered-power design effect changed");
check(powerResult.primaryScenario.approximatePower === 0.825486, "primary clustered-power result changed");
check(powerResult.primaryScenario.maximumIccRetaining80PercentPower === 0.647577, "sealed ICC boundary changed");
check(Object.values(powerResult.findings).every(Boolean), "not every repeat-power finding is true");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Raw-repeat cycle verification passed: five SASBDB archives, 48 consensus inputs, 497 filter-envelope points, and the 1,176-acquisition NIST power gate are consistent.");
