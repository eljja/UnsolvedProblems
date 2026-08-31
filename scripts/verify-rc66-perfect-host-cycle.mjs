import fs from "node:fs";
import vm from "node:vm";

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const near = (actual, expected, tolerance = 1e-10) => Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
const readText = file => fs.readFileSync(file, "utf8");
const read = file => JSON.parse(readText(file));

const spec = read("research/reproducibility/rc66-perfect-host-closure-spec.json");
const manifest = read("research/reproducibility/rc66-perfect-host-source-manifest.json");
const py = read("research/reproducibility/rc66-perfect-host-closure-python.json");
const js = read("research/reproducibility/rc66-perfect-host-closure-node.json");
const cycleResult = read("research/reproducibility/rc66-perfect-host-cycle-result.json");
const connectionArtifact = read("research/reproducibility/rc66-shared-nuisance-selection-connection.json");
const releaseContract = read("research/reproducibility/rc66-perfect-host-minimal-release-request.json");
const priorArt = read("research/reproducibility/rc66-prior-art-boundary.json");

assert(spec.cycleId === "RC-2026-66" && spec.selectedProblems.join(",") === "UP-003,UP-625,UP-626", "RC66 research scope changed");
assert(spec.nineteenHostGate.deletionGateSigma === 3 && spec.regionReplayGate.spiral.majorSemiaxisArcmin === 1.6, "RC66 host or geometry gate changed");
assert(spec.phaseLineageGate.reportedPhaseCorrections === 154 && spec.phaseLineageGate.reportedAllFitObjects === 144 && spec.phaseLineageGate.releasedObjectRows === 142, "RC66 phase-lineage counts changed");
assert(spec.independentImplementationGate.implementations.length === 2 && spec.independentImplementationGate.tolerance === 1e-10, "RC66 independent implementation gate changed");

assert(manifest.files.length === 2 && manifest.frozenPredecessors.length === 3, "RC66 manifest inventory changed");
assert(manifest.files[0].bytes === 3447 && manifest.files[0].sha256 === "8822f7470eddb30c5cd0f0614b5f03b41ba087446b79ec2dc14ce2fc41cabfb9", "RC66 NGC 4038 table bytes changed");
assert(manifest.files[1].bytes === 18416991 && manifest.files[1].sha256 === "fefae8d124cb178c22cc90a3984cc1838d999b8b17d7d2e019170dd9c740e33e", "RC66 author archive bytes changed");
assert(manifest.files[1].archiveMembers === 16 && manifest.files[1].mainTexSha256 === "8effae414f274a706c5a8accf06d013d2bb1d090b37b95483297cf5d7ded5d90", "RC66 source archive inventory changed");

assert(py.sourceAudit.allHashesMatch && py.sourceAudit.authorSourceArchive.memberCount === 16, "RC66 source audit failed");
assert(py.sourceAudit.authorSourceArchive.inlineTableBPhotometryRows === 1 && py.sourceAudit.authorSourceArchive.containsPhaseTransform, "RC66 deposited method audit changed");
assert(!py.sourceAudit.authorSourceArchive.containsExecutablePerObjectCorrectionLedger, "RC66 source archive unexpectedly closes the correction ledger");

const host = py.nineteenHostClosure;
assert(host.hostCount === 19 && host.addedRow.host === "NGC4038" && host.addedRow.source === "2024-table-a2-shoes", "RC66 nineteenth host row changed");
assert(near(host.addedRow.hst, 31.612) && near(host.addedRow.jwst, 31.67) && near(host.addedRow.jwstSigma, 0.035), "RC66 NGC 4038 values changed");
assert(near(host.glsMeanMag, -0.019907736918756382) && near(host.glsMeanStandardErrorMag, 0.027490248717688116), "RC66 nineteen-host mean changed");
assert(near(host.glsDistanceSlopeMagPerMag, -0.004937865054505372) && near(host.glsDistanceSlopeStandardError, 0.015395458212750967), "RC66 nineteen-host slope changed");
assert(near(host.requiredCrowdingSlopeExclusionSigma, 4.867530671639228) && host.publishedMeanAndSlopeReproduced, "RC66 aggregate decision changed");
assert(host.leaveOneHostOut.length === 19 && host.maximumMeanInfluence.removedHost === "NGC1448" && near(host.maximumMeanInfluence.meanMovementMag, -0.012850229226166233), "RC66 influence ordering changed");
assert(near(host.minimumLeaveOneOutRequiredSlopeExclusionSigma, 3.7010724665041987), "RC66 deletion robustness changed");
const drop4038 = host.leaveOneHostOut.find(row => row.removedHost === "NGC4038");
assert(drop4038 && near(drop4038.meanMag, -0.020824018568800687) && near(drop4038.meanMovementMag, -0.0009162816500443045), "RC66 NGC 4038 leverage changed");

const region = py.regionReplay;
assert(region.releasedRows === 142 && region.labelCounts.N3447Spiral === 63 && region.labelCounts.N3447A === 55 && region.labelCounts.N3447 === 24, "RC66 region population changed");
assert(region.allSpiralLabelsInsideSpiralOnly && region.allTidalLabelsInsideTidalOnly && region.analyticEllipseLabelsClosed, "RC66 analytic ellipse replay failed");
assert(region.figureDefinedChordExclusions.map(row => row.id).join(",") === "135027.00,136273.00" && region.otherRowsOutsideBothEllipses === 22, "RC66 chord ambiguity localization changed");
assert(!region.numericChordBoundaryAvailable, "RC66 chord boundary was marked closed without a numerical rule");

const covariance = py.summaryCovarianceClosure;
assert(near(covariance.impliedCovarianceMag2, 0.0003705) && near(covariance.impliedCorrelation, 0.494), "RC66 summary covariance changed");
assert(near(covariance.impliedCommonModeSigmaMag, 0.01924837655492016) && near(covariance.reconstructedContrastSigmaMag, 0.028), "RC66 common-mode reconstruction changed");
assert(near(covariance.naiveIndependentContrastSigmaMag, 0.03905124837953327) && near(covariance.naiveOverstatementFraction, 0.3946874421261881), "RC66 independence counterfactual changed");
assert(covariance.closesPublishedContrastError, "RC66 published contrast error no longer closes");

const phase = py.phaseCorrectionLineage;
assert(phase.reportedPhaseCorrections === 154 && phase.reportedAllFitObjects === 144 && phase.releasedObjectRows === 142, "RC66 phase populations changed");
assert(near(phase.wholeSampleEffectiveSizeMultiplier, 1.2491349480968859) && near(phase.spiralQuadratureScatterRemovedMag, 0.05258326730053966) && near(phase.tidalQuadratureScatterRemovedMag, 0.06424951361683608), "RC66 phase aggregate diagnostics changed");
assert(!phase.identityMappingExecutable && !py.gates.numericChordBoundary && !py.gates.objectPhaseLineage && !py.gates.objectLevelFitClosure && !py.gates.globalH0Refit, "RC66 claim boundary changed");
assert(py.gates.completeNineteenHostNumericalFixture && py.gates.crowdingSlopeUnderEveryDeletion && py.gates.componentEllipseReplay && py.gates.summaryCovarianceClosure, "RC66 closed gates regressed");

assert(js.implementation === "dependency-free-node" && js.sourceAudit.allHashesMatch, "RC66 independent source audit changed");
for (const key of ["glsMeanMag", "glsMeanStandardErrorMag", "glsDistanceInterceptMag", "glsDistanceSlopeMagPerMag", "glsDistanceSlopeStandardError", "requiredCrowdingSlopeExclusionSigma", "minimumLeaveOneOutRequiredSlopeExclusionSigma"]) {
  assert(near(js.nineteenHostClosure[key], host[key]), `RC66 independent host mismatch: ${key}`);
}
for (let index = 0; index < host.leaveOneHostOut.length; index += 1) {
  const left = host.leaveOneHostOut[index];
  const right = js.nineteenHostClosure.leaveOneHostOut[index];
  assert(left.removedHost === right.removedHost && near(left.meanMovementMag, right.meanMovementMag) && near(left.slopeMagPerMag, right.slopeMagPerMag), `RC66 independent deletion mismatch: ${left.removedHost}`);
}
assert(js.regionReplay.figureDefinedChordExclusions.map(row => row.id).join(",") === region.figureDefinedChordExclusions.map(row => row.id).join(","), "RC66 independent chord localization changed");
for (const key of ["impliedCovarianceMag2", "impliedCorrelation", "impliedCommonModeSigmaMag", "reconstructedContrastSigmaMag", "naiveIndependentContrastSigmaMag", "naiveOverstatementFraction"]) {
  assert(near(js.summaryCovarianceClosure[key], covariance[key]), `RC66 independent covariance mismatch: ${key}`);
}
for (const key of ["wholeSampleEffectiveSizeMultiplier", "spiralQuadratureScatterRemovedMag", "tidalQuadratureScatterRemovedMag"]) {
  assert(near(js.phaseCorrectionLineage[key], phase[key]), `RC66 independent phase mismatch: ${key}`);
}

assert(cycleResult.newVerifiedFacts.length === 12 && cycleResult.hypothesisAdjudication.length === 6 && cycleResult.workPackages.length === 3, "RC66 research record is incomplete");
assert(cycleResult.failedOrRejectedAttempts.length === 6 && cycleResult.exactNextStart.includes("PHOST-SEMANTIC-2"), "RC66 failure history or exact handoff is missing");
assert(connectionArtifact.id === "CONN-EVIDENCE-039" && connectionArtifact.problemIds.join(",") === "UP-003,UP-625,UP-626", "RC66 structural connection changed");
assert(connectionArtifact.validWhen.length === 5 && connectionArtifact.breaksWhen.length === 5 && connectionArtifact.minimumValidationTest.length > 300, "RC66 connection lacks falsifiable conditions");
assert(releaseContract.contractId === "PHOST-SEMANTIC-2" && releaseContract.identityCrosswalk.rows === 154 && releaseContract.fitReceipt.fixtures.length === 4, "RC66 semantic release contract changed");
assert(releaseContract.identityCrosswalk.knownBoundaryCases.join(",") === "135027,136273" && releaseContract.prospectiveCrossover.primaryAdjudicand.includes("two-epoch"), "RC66 boundary or prospective adjudicand missing");
assert(priorArt.queries.length === 5 && priorArt.found.length === 4 && priorArt.notVerifiedInReviewedSources.length === 4, "RC66 prior-art boundary changed");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 64 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) vm.runInNewContext(readText(file), sandbox, { filename: file });
const problems = sandbox.window.PROBLEMS || [];
const sources = sandbox.window.CATALOG_SOURCES || {};
const cycles = sandbox.window.RESEARCH_CYCLES || [];
const connections = sandbox.window.RESEARCH_CONNECTIONS || [];
assert(problems.length === 744 && Object.keys(sources).length === 369 && cycles.length === 66 && connections.length === 69, "RC66 site catalogue totals changed");
assert(problems.reduce((sum, problem) => sum + (problem.researchHistory || []).length, 0) === 213, "RC66 problem-cycle record total changed");
assert(problems.filter(problem => (problem.researchHistory || []).length > 0).length === 20, "RC66 deeply researched problem total changed");
const siteCycle = cycles.find(item => item.id === "RC-2026-66");
assert(siteCycle?.problemIds.join(",") === "UP-003,UP-625,UP-626" && siteCycle.connectionIds[0] === "CONN-EVIDENCE-039", "RC66 site cycle missing");
assert(siteCycle.verifiedFindings.length === 10 && siteCycle.resultMatrix.rows.length === 9 && siteCycle.artifacts.length === 8 && siteCycle.log.length === 9, "RC66 public cycle record incomplete");
for (const id of siteCycle.problemIds) {
  const problem = problems.find(item => item.id === id);
  const record = (problem.researchHistory || []).find(item => item.cycleId === "RC-2026-66");
  assert(record?.focusedPage && record.causalChain.length === 5 && record.hypotheses.length === 4 && record.workPackages.length === 3 && record.uncertaintyBudget.length === 4 && record.decisionTree.length === 4, `${id}: RC66 focused research record incomplete`);
}
const updatedDefinitions = siteCycle.problemIds.map(id => problems.find(item => item.id === id).cycleResearch.updatedDefinition.text);
const EnglishDefinitions = siteCycle.problemIds.map(id => problems.find(item => item.id === id).cycleResearch.updatedDefinition.textEn);
assert(new Set(updatedDefinitions).size === 3 && new Set(EnglishDefinitions).size === 3, "RC66 problem narratives are duplicated");
assert(sources.shoes_jwst_validation_tables_2024.publishedOn === "2024-12-10" && sources.shoes_perfect_host_source_2025.publishedOn === "2025-09-01", "RC66 primary sources missing or stale");

for (const page of ["index.html", "solve.html", "research-log.html"]) assert(readText(page).includes("research-cycle-66-data.js?v=20260831-cycle66"), `${page}: RC66 script missing`);
assert(/length:\s*(?:6[4-9]|[7-9]\d|\d{3,})/.test(readText("scripts/generate-sitemap.mjs")), "Sitemap generator omits RC66");
const publicProse = readText("research-cycle-66-data.js");
for (const forbidden of ["전공자 포인트", "1단계", "개수를 맞", "아래 시도는 개별 논문"]) assert(!publicProse.includes(forbidden), `RC66 public prose contains forbidden wording: ${forbidden}`);

if (failures.length) {
  console.error(`RC66 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC66 perfect-host cycle verified: nineteen-host GLS, ellipse replay, shared-covariance closure, phase-lineage boundary, independent implementations, and bilingual site records agree.");
