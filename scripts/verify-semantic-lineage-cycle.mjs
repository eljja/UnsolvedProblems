import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const metadata = load("research/reproducibility/nist-metadata-fetch-manifest.json");
const semanticsSpec = load("research/reproducibility/nist-label-semantics-spec.json");
const semantics = load("research/reproducibility/nist-label-semantics-result.json");
const phaseSchema = load("research/reproducibility/nist-phase-adjudication.schema.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(metadata.response.status === 200 && metadata.response.contentType === "application/json", "official metadata response contract changed");
check(/^[a-f0-9]{64}$/.test(metadata.response.sha256), "raw metadata response hash is missing");
check(metadata.canonicalRecord.sha256 === "8d1ae3f4adad41e3b4eee740827c194e9b3fb4a6b49a94cb61f52e46b6747cee", "canonical NIST metadata record changed");
check(metadata.record.version === "1.0.2" && metadata.record.status === "available", "NIST record version or availability changed");
check(metadata.files.length === 4 && metadata.files.every(file => file.expectedUrlMatchesMetadata && file.expectedSha256MatchesSidecar), "one or more official source files no longer match metadata and sidecar contracts");
check(metadata.allGatesPass && Object.values(metadata.gates).every(Boolean), "metadata retrieval audit has a failed gate");

check(semantics.auditId === semanticsSpec.auditId, "label-semantics spec/result IDs differ");
check(semantics.labelCounts.HL3[1] === 8 && semantics.labelCounts.HL4[1] === 68 && semantics.labelCounts.HL5[1] === 56, "label-use denominators changed");
check(semantics.lowMixedUseCandidate.labeler === "HL3" && !semantics.findings.candidateIdentityWithPaperExcludedLabelerIsProven, "anonymous labeler identity is overstated");
check(semantics.panels.legacySealedHL3HL5.auc === 0.755362 && semantics.panels.legacySealedHL3HL5.boundaryEdges === 36, "legacy RC13-RC14 adjudication no longer reproduces");
check(semantics.panels.sealedHL3HL5Strict.excludedTies === 1 && semantics.panels.sealedHL3HL5Strict.auc === 0.752381, "strict tie-abstention result changed");
check(semantics.panels.allFive.auc === 0.801975, "all-five panel AUC changed");
check(semantics.comparisonsWithSealedPanel.allFive.boundaryJaccard === 0.301887, "all-five boundary Jaccard changed");
check(semantics.comparisonsWithSealedPanel.leaveOutHL5.boundaryJaccard === 0.020833, "minimum leave-one-labeler boundary Jaccard changed");
check(semantics.sealedPanelTransitionResults["0-1"].auc === 0.894439 && semantics.sealedPanelTransitionResults["1-2"].auc === 0.666858, "transition-specific AUC changed");
check(semantics.sealedPanelTemperatureResults[50].mannWhitneyNumeratorShare === 0.323636 && semantics.sealedPanelTemperatureResults[50].aucAfterDeletingIncidentEdges === 0.706184, "50 C influence result changed");
check(semantics.findings.semanticsDominanceFlag && !semantics.findings.transitionDominanceFlag && !semantics.findings.fiftyDegreeDominanceFlag, "predeclared semantic or dominance decision changed");
check(semantics.findings.fixedObservableAboveChanceForEveryPanel, "fixed observable failed one or more semantic panels");
check(semantics.decision.includes("stop calling any label panel physical truth"), "physical-ground-truth refusal is missing");

check(phaseSchema.properties.ontology.properties.mixedPhaseAllowed.const === true, "phase ontology no longer permits mixed phase");
check(phaseSchema.properties.ontology.properties.unresolvedAction.const === "abstain-with-reason-code", "tie abstention contract changed");
check(phaseSchema.properties.annotationSensitivity.properties.tieRule.const === "exclude-from-panel-specific-binary-adjudication", "annotation tie rule changed");
check(phaseSchema.properties.independence.properties.physicalHoldout.const === true, "independent physical holdout is no longer mandatory");
check(phaseSchema.properties.independence.properties.reductionImplementations.minItems === 2, "two independent reductions are no longer mandatory");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("RC15 verification passed: canonical source lineage is sealed, fixed ranking survives every annotation panel, boundary semantics remain explicitly unstable, and physical adjudication requires an independent holdout.");
