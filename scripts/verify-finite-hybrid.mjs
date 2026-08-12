import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const finiteSpec = JSON.parse(fs.readFileSync(path.join(root, "research/two-phase/finite-spec.json"), "utf8"));
const finite = JSON.parse(fs.readFileSync(path.join(root, "research/two-phase/finite-result.json"), "utf8"));
const hybridSpec = JSON.parse(fs.readFileSync(path.join(root, "research/active-boundary/hybrid-spec.json"), "utf8"));
const hybrid = JSON.parse(fs.readFileSync(path.join(root, "research/active-boundary/hybrid-result.json"), "utf8"));
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const near = (actual, expected, tolerance = 1e-6) => Math.abs(actual - expected) <= tolerance;

assert(finite.studyId === finiteSpec.studyId, "finite rescue result must match its specification");
assert(finite.worlds.length === 3, "finite rescue must retain three first-stage Gamma worlds");
for (const world of finite.worlds) {
  assert(world.samples.length === 3, `Gamma ${world.firstGamma}: requires three invitation counts`);
  for (const sample of world.samples) {
    const expectedTables = (sample.invitationCount + 1) * (sample.invitationCount + 2) / 2;
    assert(sample.enumeratedTables === expectedTables, `Gamma ${world.firstGamma}/n=${sample.invitationCount}: incomplete multinomial enumeration`);
    assert(near(sample.probabilityTotal, 1), `Gamma ${world.firstGamma}/n=${sample.invitationCount}: probability mass must sum to one`);
    assert(sample.exactCoverage >= finiteSpec.decisionGates.minimumExactCoverage, `Gamma ${world.firstGamma}/n=${sample.invitationCount}: coverage gate failed`);
  }
  for (let index = 1; index < world.samples.length; index += 1) {
    assert(world.samples[index].expectedPopulationWidth < world.samples[index - 1].expectedPopulationWidth, `Gamma ${world.firstGamma}: expected width must fall with invitation count`);
  }
}
assert(finite.worlds.find(world => world.firstGamma === 1).samples.find(sample => sample.invitationCount === 500).expectedPopulationWidth < 0.12, "Gamma-1/n=500 should pass the expected-width gate");
assert(finite.worlds.find(world => world.firstGamma === 4).samples.every(sample => sample.expectedPopulationWidth > 0.12), "Gamma-4 sampling expansion must not erase the identification-width failure");

assert(hybrid.benchmarkId === hybridSpec.benchmarkId, "hybrid boundary result must match its specification");
assert(hybrid.design.totalRuns === 35400, "hybrid benchmark must preserve all sealed strategy-world replicates");
const row = (section, strategy) => hybrid[section].find(item => item.strategy === strategy);
const uniform = row("singleBoundary", "uniform-16");
const active = row("singleBoundary", "explore-8-refine-8");
const bridge = row("singleBoundary", "hybrid-12-refine-4");
assert(near(uniform.maximumWorstGap, 0.4 / 15), "uniform gap must equal its analytic spacing");
assert(near(active.maximumWorstGap, 0.4 / 7), "8-point exploration gap must equal its analytic spacing");
assert(near(bridge.maximumWorstGap, 0.4 / 11), "12-point exploration gap must equal its analytic spacing");
assert(active.meanLocalizedBoundaryBracket < bridge.meanLocalizedBoundaryBracket && bridge.meanLocalizedBoundaryBracket < uniform.meanLocalizedBoundaryBracket, "localization must order active, hybrid, uniform");
assert(row("multipleBoundary", "hybrid-12-refine-4").allBoundariesLocalizedRate >= 0.95, "hybrid must localize both noisy boundaries in at least 95% of runs");
assert(row("noChange", "hybrid-12-refine-4").falsePositiveRate <= hybridSpec.gates.maximumNoChangeFalsePositiveRate, "hybrid must pass the no-change false-positive gate");
assert(hybrid.pareto.find(item => item.strategy === "hybrid-12-refine-4").dominatedBy.length === 0, "hybrid must remain Pareto non-dominated");
assert(Object.values(hybrid.findings).every(Boolean), "every preregistered hybrid finding must be true");

if (failures.length) {
  console.error(`Finite/hybrid verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Finite/hybrid verification passed: multinomial coverage, identification floors, and noisy Pareto tradeoffs are internally consistent.");
