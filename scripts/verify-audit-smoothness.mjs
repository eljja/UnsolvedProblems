import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCampaign } from "./audit/completeness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "research/audit/synthetic-audit-fixture.json"), "utf8"));
const audit = JSON.parse(fs.readFileSync(path.join(root, "research/audit/calibration-result.json"), "utf8"));
const smooth = JSON.parse(fs.readFileSync(path.join(root, "research/smoothness/sealed-family-result.json"), "utf8"));
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(validateCampaign(fixture).length === 0, "frozen completeness fixture must validate");
assert(Object.values(audit.findings).every(Boolean), "all audit calibration findings must be true");
assert(audit.fixture.mutationDetection.length === 7 && audit.fixture.mutationDetection.every(item => item.detected), "seven integrity mutations must be detected");
assert(audit.scenarios.filter(item => item.sampleSize === 0).every(item => item.meanWidth === 0.4), "stage counts alone must retain logical missing-data width");
assert(audit.scenarios.filter(item => item.sampleSize === 100).every(item => item.passesGate), "100 random rescues must pass every frozen Gamma scenario");
assert(Object.values(smooth.findings).every(Boolean), "all smoothness benchmark findings must be true");
assert(smooth.scenarios.find(item => item.worldId === "globally-smooth" && item.safetyFactor === 1).coverage === 1, "global smoothness must cover the sealed grid");
assert(smooth.scenarios.find(item => item.worldId === "hidden-phase-boundary" && item.safetyFactor === 2).coverage < 0.95, "hidden phase boundary must fail despite doubling L");

if (failures.length) {
  console.error(`Audit/smoothness verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Audit/smoothness verification passed: ledger mutations, rescue-sample gates, and sealed-boundary refusal are consistent.");
