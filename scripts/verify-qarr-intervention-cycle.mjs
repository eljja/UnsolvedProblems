import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/qarr-intervention-identifiability-spec.json");
const manifest = load("research/reproducibility/qarr-intervention-open-data-manifest.json");
const result = load("research/reproducibility/qarr-intervention-identifiability-result.json");
const audit = load("research/reproducibility/qarr-intervention-independent-audit.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const close = (left, right, tolerance = 1e-9) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;

check(spec.benchmarkId === result.benchmarkId && spec.status === "retrospective-source-audit-fixed-before-repository-computation", "RC25 benchmark or retrospective status changed");
check(spec.decisionRules.length === 6 && spec.causalChain.length === 5 && spec.fastFailureTests.length >= 5, "RC25 decisions, causal chain, or stop rules are incomplete");
check(spec.scopeBoundary.historicalAggregate.includes("not public specimen-level paired records") && spec.scopeBoundary.retrospectiveRule.includes("exploratory"), "RC25 causal or retrospective boundary is missing");
check(manifest.archive.bytes === 2256651 && manifest.archive.sha256 === "13018b4d137bf567f4451991fc1a92d5d667cd53ea3b77729210f175e41354eb", "Mendeley archive identity changed");
check(manifest.archive.memberCount === 80 && manifest.archive.uncompressedBytes === 8620656 && manifest.archive.inventorySha256 === "7610262785de0b0ce0692a91432eb30a7dcb938078976649c37e2919f43163d3", "Mendeley inventory changed");
check(manifest.analysisSubset.pairedCompositionLabels === 10 && manifest.analysisSubset.pairedProfiles.xrpd === 10 && manifest.analysisSubset.pairedProfiles.xrf === 10, "D1-D2 paired subset changed");

const aggregate = result.aggregate;
check(close(aggregate.strata.brindley.groundMinusAsReceived, -0.168) && close(aggregate.strata.brindley.relativeReduction, 0.672), "Brindley grinding result changed");
check(close(aggregate.strata.none.groundMinusAsReceived, -0.301) && close(aggregate.strata.none.relativeReduction, 0.734146341), "uncorrected grinding result changed");
check(aggregate.strata.brindley.conservativeDifferenceInterval[1] < 0 && aggregate.strata.none.conservativeDifferenceInterval[1] < 0, "grinding direction no longer clears conservative bounds");
check(close(aggregate.correctionAfterGrinding.absoluteImprovement, 0.027) && close(aggregate.correctionAfterGrinding.relativeImprovement, 0.247706422), "post-grinding correction result changed");
check(aggregate.participantCollected.neutronN === 5 && close(aggregate.participantCollected.neutronVersusNoneRelativeImprovement, 0.845), "neutron aggregate changed");

const raw = result.raw;
check(raw.pairs.length === 10 && raw.summary.graphiteFreeControls === 3 && raw.summary.graphiteAffectedPairs === 7, "D1-D2 pair denominators changed");
check(raw.summary.graphiteFreeControlsByteIdenticalBothModalities === 3 && raw.summary.graphiteAffectedXrpdPairsDifferent === 7, "control identity or graphite intervention encoding changed");
check(close(raw.summary.medianXrpdTotalVariation, 0.074621199) && close(raw.summary.medianXrfTotalVariation, 0.024090912) && close(raw.summary.medianDistanceRatio, 3.097483358), "modality distance summary changed");
check(JSON.stringify(result.decisions) === JSON.stringify({
  H1_grindingDirectionSupportedInPublishedAggregate: true,
  H2_materialBrindleyGainAfterGrinding: false,
  H3_neutronTransportQualified: false,
  H4_pairedCausalGrindingEffectIdentified: false,
  H5_openSameDesignBenchmarkExecutable: true,
  H6_xrpdShapeMoreSensitiveThanXrf: true
}), "RC25 decision vector changed");
check(audit.passed && Object.values(audit.checks).every(Boolean) && audit.independenceBoundary.includes("does not create new physical replicates"), "independent arithmetic audit failed or overclaims independence");

const context = { window: {} };
vm.createContext(context);
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 23 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const dataFile of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInContext(fs.readFileSync(path.join(root, dataFile), "utf8"), context, { filename: dataFile });
}
const cycle = context.window.RESEARCH_CYCLES.find(row => row.id === "RC-2026-25");
const connection = context.window.RESEARCH_CONNECTIONS.find(row => row.id === "CONN-INTERVENTION-001");
check(cycle?.problemIds.join("|") === "UP-182|UP-184|UP-185" && cycle.artifacts.length === 7, "RC25 cycle record is incomplete");
check(cycle?.verifiedFindings.length >= 12 && cycle?.log.length >= 8 && cycle?.resultMatrix.rows.length >= 8, "RC25 evidence, log, or result matrix is incomplete");
check(connection?.problemIds.join("|") === "UP-182|UP-184|UP-185" && connection.strength === "moderate" && connection.minimumTest.textEn && connection.failureBoundary.textEn, "intervention connection is incomplete or overgraded");
for (const id of cycle?.problemIds || []) {
  const record = context.window.PROBLEMS.find(row => row.id === id)?.researchHistory?.find(row => row.cycleId === "RC-2026-25");
  check(record?.hypotheses.length === 3 && record.updatedDefinition.textEn && record.decisiveTest.textEn && record.unresolved.textEn, `RC25 bilingual record incomplete for ${id}`);
}
check(Object.keys(context.window.CATALOG_SOURCES).length === 171, "source count is not 171");
check(context.window.RESEARCH_CYCLES.length === 25 && context.window.RESEARCH_CONNECTIONS.length === 28, "cycle or connection count changed");
check(context.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 84, "research-record count is not 84");
for (const page of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, page), "utf8").includes("research-cycle-25-data.js"), `${page} does not load RC25`);

if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("RC25 verification passed: grinding direction survives conservative aggregate bounds, post-grinding correction and neutron transport remain unqualified, and the fixed open archive provides an executable but unreplicated D1-D2 intervention contrast.");
