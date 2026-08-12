import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/nist-phase-fraction-identifiability-spec.json");
const result = load("research/reproducibility/nist-phase-fraction-identifiability-result.json");
const independent = load("research/reproducibility/nist-phase-fraction-independent-audit.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(result.benchmarkId === spec.benchmarkId, "phase-fraction spec/result IDs differ");
check(result.source.rawProfilesSha256 === "3b47bf36b2abaef376730226e2616a353ba07571c46e71bce464cf9e9bfbe348", "raw-profile source contract changed");
check(result.denominators.eligibleCompositions.join("|") === "92|93|94|95|96|97", "eligible endpoint compositions changed");
check(result.denominators.endpointProfiles === 12 && result.denominators.anglePointsPerProfile === 3841 && result.denominators.fractions === 9 && result.denominators.totalCases === 2277, "benchmark denominators changed");
check(result.scenarioResults.clean.maximumAbsoluteError === 0 && result.scenarioResults.affineBackground.maximumAbsoluteError === 0, "same-composition exact controls changed");
check(result.scenarioResults.peakShift1Bin.maximumAbsoluteError === 0.07298, "one-bin shift sensitivity changed");
check(result.scenarioResults.peakShift2Bin.maximumAbsoluteError === 0.179876, "two-bin shift sensitivity changed");
check(result.scenarioResults.peakShiftAware1Bin.maximumAbsoluteError === 0 && result.scenarioResults.peakShiftAware2Bin.maximumAbsoluteError === 0, "exploratory shift-aware replay changed");
check(result.scenarioResults.textureLikeWarp2Percent.maximumAbsoluteError === 0.009563 && result.scenarioResults.textureLikeWarp5Percent.maximumAbsoluteError === 0.02518, "texture-like stress result changed");
check(result.scenarioResults.transferredTemplates.maximumAbsoluteError === 0.206121, "nearest-composition transfer result changed");
check(result.scenarioResults.interpolatedTemplates.maximumAbsoluteError === 0.140102, "within-support interpolation result changed");
check(result.scenarioResults.interpolatedDualShiftTemplates.maximumAbsoluteError === 0.143806, "dual-shift interpolation result changed");
check(result.trajectorySummary.compositionsWithAnyDecrease === 1 && result.trajectorySummary.compositionsWithDecreaseLargerThan005 === 0, "observed trajectory monotonicity changed");
check(result.trajectorySummary.labelFractionRanges[1].maximum === 0.827963 && result.trajectorySummary.labelFractionRanges[2].minimum === 0.689345, "phase-label fraction overlap changed");
check(result.trajectorySummary.fixedFractionThresholdSeparatesPhase1And2 === false, "fixed-threshold refusal changed");
check(result.gates.sameCompositionCleanAndAffinePass && result.gates.twoPercentTextureLikeWarpPass, "prespecified same-composition gate failed");
check(!result.gates.oneAndTwoBinShiftPass && !result.gates.neighboringCompositionTransferPass, "failed shift or transfer gate was incorrectly promoted");
check(result.gates.exploratoryShiftAwareRemediationPass && !result.gates.exploratoryWithinSupportInterpolationPass && !result.gates.exploratoryInterpolationWithDualShiftPass, "exploratory remediation decisions changed");
check(result.gates.outOfSupportComposition97Refused && result.decision.includes("refuse out-of-support extrapolation"), "out-of-support refusal is missing");
check(independent.source.spectra === 352 && independent.source.columns === 3841, "independent Python source shape changed");
check(independent.independentReplay.allComparisonsPass && Object.values(independent.independentReplay.comparisonsWithJavaScript).every(Boolean), "independent Python replay disagrees with JavaScript");
check(Math.abs(independent.independentReplay.oneBinShiftMaximumAbsoluteError - 0.07298041181459647) < 1e-12, "independent one-bin result changed");
check(Math.abs(independent.localTangentAudit.summary.maximumTargetVsHighShiftAbsCosine - 0.043638350572158174) < 1e-12, "local shift-tangent alignment changed");
check(Math.abs(independent.localTangentAudit.summary.maximumFourDirectionConditionNumber - 1.2113666847783706) < 1e-12, "local tangent condition number changed");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("RC16 verification passed: independent Python replay matches, local first-order tangents do not explain finite-shift bias, unmodeled peak shift and composition transfer fail, and out-of-support extrapolation is refused.");
