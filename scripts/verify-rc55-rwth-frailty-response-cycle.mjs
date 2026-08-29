import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = relative => fs.readFileSync(path.join(root, relative), "utf8");
const read = relative => JSON.parse(readText(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const close = (actual, expected, tolerance = 1e-9) => assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const repro = name => `research/reproducibility/${name}`;

const precommit = read(repro("rc55-rwth-frailty-response-precommit.json"));
const amendment = read(repro("rc55-rwth-frailty-response-amendment-01.json"));
const prior = read(repro("rc55-rwth-frailty-response-prior-art.json"));
const features = read(repro("rc55-rwth-frailty-response-feature-table.json"));
const python = read(repro("rc55-rwth-frailty-response-python.json"));
const node = read(repro("rc55-rwth-frailty-response-node.json"));
const audit = read(repro("rc55-rwth-frailty-response-independent-audit.json"));
const diagnostic = read(repro("rc55-rwth-frailty-response-boundary-diagnostic.json"));
const connectionEvidence = read(repro("rc55-rwth-frailty-response-connection-evidence.json"));
const cycleResult = read(repro("rc55-rwth-frailty-response-cycle-result.json"));

assert(precommit.cycleId === "RC-2026-55" && precommit.status.startsWith("sealed-"), "RC55 preregistration is not sealed");
assert(precommit.status.includes("before-any-cell-level"), "RC55 outcome chronology boundary is missing");
assert(precommit.cohortAndSplit.pilot.modelWeight === 0 && precommit.cohortAndSplit.pilot.cellIds.join(",") === "1,2", "RC55 pilot boundary changed");
assert(precommit.cohortAndSplit.development.candidateCount === 30 && precommit.cohortAndSplit.untouchedTarget.candidateCount === 16, "RC55 split contract changed");
assert(precommit.competingHypotheses.length === 3 && prior.sources.length === 7, "RC55 hypothesis or prior-art boundary changed");

assert(amendment.status.includes("before-any-non-pilot"), "RC55 amendment chronology is missing");
assert(amendment.sourceIntegrity.repositoryCommit === "488eb68c23898f46308f58b9299088c287b9380d", "RC55 source commit changed");
assert(amendment.sourceIntegrity.processedP001GitTree === "0b525ffafd634535b5af81d629fc4c09b1b8ec5e", "RC55 processed source tree changed");
assert(amendment.identifierMapping.count === 48 && amendment.identifierMapping.bijective, "RC55 cell mapping is not bijective");
assert(amendment.pulseMapping.availability === "unavailable" && amendment.pulseMapping.consequence.includes("substitute is prohibited"), "RC55 pulse abstention changed");

assert(features.rows.length === 48 && features.sourceCommit === amendment.sourceIntegrity.repositoryCommit, "RC55 feature-table source or row count changed");
const counts = features.rows.reduce((out, row) => ((out[row.split] = (out[row.split] || 0) + 1), out), {});
assert(counts.pilot === 2 && counts.development === 30 && counts.target === 16, "RC55 feature-table split changed");
assert(features.pulseArm.available === false, "RC55 unavailable pulse arm was silently activated");

assert(python.cohort.sourceCells === 48 && python.cohort.denominators.B.development === 30 && python.cohort.denominators.B.target === 16, "RC55 modeled cohort changed");
assert(python.cohort.targetEventsB === 16 && python.cohort.targetCensoredB === 0, "RC55 target endpoint denominator changed");
close(python.metrics.A.medianAbsoluteErrorCycles, 80);
close(python.metrics.B.medianAbsoluteErrorCycles, 90.30922474171604, 1e-8);
close(python.metrics.B.harrellConcordance.value, 0.4155844155844156);
assert(python.metrics.B.harrellConcordance.comparablePairs === 77, "RC55 comparable-pair denominator changed");
close(python.metrics.B.maximumCalibrationError, 0.23907647913418473, 1e-9);
close(python.comparison.BvsA.relativeMdAEImprovement, -0.12886530927145046, 1e-9);
assert(python.comparison.BvsA.bootstrapReplicates === 2000 && python.comparison.BvsA.percentile95Interval[0] < 0 && python.comparison.BvsA.percentile95Interval[1] > 0, "RC55 bootstrap boundary changed");
assert(python.hypotheses.H0.verdict === "retained" && python.hypotheses.H1.verdict === "rejected" && python.hypotheses.H2.verdict === "unavailable", "RC55 verdicts changed");

assert(node.cohort.denominators.B.target === 16 && node.metrics.B.harrellConcordance.comparablePairs === 77, "RC55 independent denominator changed");
assert(audit.pass && audit.hypothesisMatch && audit.denominatorMatch && audit.comparedScalarCount === 49 && audit.maxAbsoluteDifference <= 1e-5, "RC55 independent audit failed");
assert(diagnostic.status.startsWith("post-verdict"), "RC55 diagnostic crossed the confirmatory boundary");
close(diagnostic.registeredSplit.development.responseLifetimeAssociation.spearmanRho, 0.3688329682489874, 1e-9);
close(diagnostic.registeredSplit.target.responseLifetimeAssociation.spearmanRho, -0.16676362912943402, 1e-9);
assert(diagnostic.moduloSplitSensitivity.every(item => item.capacityConcordance.value < 0.65), "RC55 post-verdict split diagnosis changed");
assert(connectionEvidence.connections.length === 3 && connectionEvidence.connections.every(item => item.problems.length === 2), "RC55 connection evidence is incomplete");
assert(cycleResult.status === "complete-negative-result" && cycleResult.hypotheses.H1.verdict === "rejected" && cycleResult.hypotheses.H2.verdict === "unavailable", "RC55 cycle record contradicts the registered verdicts");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 53 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInNewContext(readText(file), sandbox, { filename: file });
}
const problems = sandbox.window.PROBLEMS;
const sources = sandbox.window.CATALOG_SOURCES;
const cycles = sandbox.window.RESEARCH_CYCLES;
const connections = sandbox.window.RESEARCH_CONNECTIONS;
const cycle = cycles.find(item => item.id === "RC-2026-55");
assert(problems.length === 744 && Object.keys(sources).length === 326, "RC55 catalog/source counts changed");
assert(cycles.length === 55 && connections.length === 58, "RC55 cycle/connection counts changed");
assert(problems.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 175, "RC55 research-record count changed");
assert(cycle && cycle.problemIds.join(",") === "UP-219,UP-233,UP-234", "RC55 public cycle problem set changed");
assert(cycle.verifiedFindings.length >= 6 && cycle.resultMatrix.rows.length >= 6 && cycle.artifacts.length >= 10 && cycle.log.length >= 8, "RC55 public cycle is incomplete");
for (const id of cycle.problemIds) {
  const record = problems.find(problem => problem.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record, `RC55 public record missing for ${id}`);
  assert(record.reviewedOn === "2026-08-29", `RC55 review date changed for ${id}`);
  assert(record.hypotheses.length === 3 && record.causalChain.length === 4 && record.workPackages.length === 4, `RC55 research structure missing for ${id}`);
  assert(record.uncertaintyBudget.length === 4 && record.decisionTree.length >= 3, `RC55 adjudication structure missing for ${id}`);
  for (const field of [record.updatedDefinition, record.knownBoundary, record.bottleneck, record.minimumAdvance, record.decisiveTest, record.unresolved]) {
    assert(field?.text?.length > 40 && field?.textEn?.length > 40, `RC55 bilingual explanation too thin for ${id}`);
  }
}
assert(connections.some(item => item.id === "CONN-EVIDENCE-028"), "RC55 public structural connection is missing");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(readText(page).includes("research-cycle-55-data.js"), `${page} does not load RC55`);
const publicText = readText("research-cycle-55-data.js");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추"]) assert(!publicText.includes(phrase), `Forbidden editorial phrase remains: ${phrase}`);
assert(readText("sitemap.xml").includes("cycle=RC-2026-55&amp;lang=ko") && readText("sitemap.xml").includes("cycle=RC-2026-55&amp;lang=en"), "RC55 sitemap URLs are missing");
const pkg = read("package.json");
for (const command of ["research:rc55-python", "research:rc55-node", "research:rc55-adjudicate", "research:rc55-diagnostic", "verify:rc55"]) assert(pkg.scripts[command], `Missing package command ${command}`);
assert(pkg.scripts.pretest?.includes("verify-rc55-rwth-frailty-response-cycle.mjs"), "RC55 verifier is not in the default test path");

console.log("RC55 RWTH same-condition frailty-response cycle verification passed.");
