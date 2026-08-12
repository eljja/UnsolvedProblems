import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rescue = JSON.parse(fs.readFileSync(path.join(root, "research/two-phase/rescue-result.json"), "utf8"));
const active = JSON.parse(fs.readFileSync(path.join(root, "research/active-boundary/benchmark-result.json"), "utf8"));
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(Object.values(rescue.findings).every(Boolean), "all two-phase rescue findings must be true");
assert(rescue.scenarios.length === 6, "two-phase rescue must retain six frozen worlds");
assert(rescue.scenarios.filter(item => item.responseOddsRatio === 4).every(item => Math.abs(item.naiveBias) > 0.02), "outcome-dependent rescue must fail the naive bias gate");
assert(rescue.scenarios.every(item => item.sensitivity.find(bound => bound.assumedGamma === item.responseOddsRatio).containsTruth), "correct rescue Gamma must contain every truth");
assert(Object.values(active.findings).every(Boolean), "all active-boundary findings must be true");
const uniform = active.persistentStep.find(item => item.strategy === "uniform-16");
const adaptive = active.persistentStep.find(item => item.strategy === "explore-8-refine-8");
assert(adaptive.meanBoundaryBracket < uniform.meanBoundaryBracket, "active strategy must sharpen persistent-step localization");
assert(adaptive.maximumWorstGap > uniform.maximumWorstGap, "active strategy must retain its global coverage cost");

if (failures.length) {
  console.error(`Two-phase/active verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Two-phase/active verification passed: second-stage MNAR bounds and exploration-refinement tradeoffs are consistent.");
