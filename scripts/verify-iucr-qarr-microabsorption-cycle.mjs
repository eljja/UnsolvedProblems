import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/iucr-qarr-microabsorption-adversary-spec.json");
const manifest = load("research/reproducibility/iucr-qarr-microabsorption-adversary-manifest.json");
const result = load("research/reproducibility/iucr-qarr-microabsorption-adversary-result.json");
const audit = load("research/reproducibility/iucr-qarr-microabsorption-python-audit.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const close = (left, right, tolerance = 1e-8) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;

check(spec.benchmarkId === result.benchmarkId && spec.status === "sealed-before-sample-4-numerical-computation", "RC24 seal or benchmark differs");
check(spec.competingHypotheses.length === 5 && spec.stopConditions.length >= 6 && spec.causalChain.length === 5, "RC24 hypotheses, causal chain, or stop rules changed");
check(spec.scopeBoundary.claim.includes("not an estimate of within-dictionary specificity") && spec.knowledgeFirewall.finalAdjudication.includes("Only after"), "RC24 scope or knowledge firewall is incomplete");
check(close(spec.frozenDetector.absoluteCoefficientScale, 0.993912948) && close(spec.frozenDetector.massAlarmThresholdPercentagePoints, 10) && close(spec.frozenDetector.residualAlarmThreshold, 0.336902813), "frozen RC23 detector changed");

check(manifest.status === "source-lineage-fixed-after-spec-seal-before-sample-4-computation" && manifest.files.length === 3, "Sample 4 lineage is not fixed");
const expectedFiles = {
  "cpd-4.prn": [137770, "320aa28edbbc4e016f6f150345f4f5da08a322d65d604e6126de47c8189d9cba", "20090728005526", "6RHPFKZMK47MWFB26XRJTL5CMXNMTIPU"],
  "magnetit.prn": [137770, "6fdf5d1d55dea9f49f23f8b32cae4c582ba205cab8c5c58f1316402a805f4991", "20090728005542", "ABROWWO7JMK6ROPIOT2H3BU2OHEMU6XN"],
  "zircon.prn": [137770, "769649b8d727847060fe34d2062a5fe0dda6f3f5fab76b5bca1a70d02713fc80", "20090728004739", "7SPSIJ77UFYPC6URU2SHMRWHTI3UUG7G"]
};
for (const [name, expected] of Object.entries(expectedFiles)) {
  const file = manifest.files.find(row => row.name === name);
  check(file?.points === 7251 && file.bytes === expected[0] && file.sha256 === expected[1], `${name} numerical identity changed`);
  check(file?.archive.timestamp === expected[2] && file?.archive.warcDigest === expected[3], `${name} archive identity changed`);
}
check(manifest.inheritedReference.sha256 === "bd53b325233838ccf91070c43f239b1762e616cd6a3dffd6a7cde479a096ec80", "corundum reference identity changed");

check(result.denominators.targetProfiles === 1 && result.denominators.pureReferences === 3 && result.denominators.fitPoints === 4501, "RC24 denominators changed");
const blind = result.blindTargetBeforeChallengeDisclosure;
check(blind.alarm && blind.alarmByMass && blind.alarmByResidual && blind.interpretedAsFalseUnknownAlarmAfterTruthJoin, "RC24 alarm path changed");
check(close(blind.coefficientSum, 0.722613753) && close(blind.missingMass, 27.296072, 1e-6) && close(blind.normalizedResidual, 0.380179283), "RC24 blind target result changed");
check(close(result.closedComposition.closureNormalizedWeightProxy.corundum, 38.547002, 1e-6) && close(result.closedComposition.closureNormalizedWeightProxy.magnetite, 27.333292, 1e-6) && close(result.closedComposition.closureNormalizedWeightProxy.zircon, 34.119705, 1e-6), "RC24 closed composition changed");
check(close(result.closedComposition.maximumAbsoluteErrorPercentagePoints, 11.912998, 1e-6) && close(result.physicalAdjudication.xrfTotalWeightPercent, 99.5), "RC24 physical adjudication changed");
check(!result.decisions.H1_completeDictionaryQuantitativelySafe && !result.decisions.H2_frozenGateSpecificAfterDictionaryTransport && !result.decisions.H3_biasMatchesMicroabsorptionDirection && result.decisions.H4_residualWarnsOnUnsafeComposition && result.decisions.H5_xrfDistinguishesNuisanceFromMissingMass && !result.decisions.independentPhysicalRungQualified, "RC24 hypothesis decisions changed");
const fingerprints = result.alarmFingerprintComparison;
check(fingerprints.omittedCrystallineBruciteRC22.unknownComponent && fingerprints.omittedCrystallineBruciteRC22.massAlarm && fingerprints.omittedCrystallineBruciteRC22.residualAlarm, "RC22 positive fingerprint changed");
check(!fingerprints.completeDictionaryMicroabsorptionRC24.unknownComponent && fingerprints.completeDictionaryMicroabsorptionRC24.massAlarm && fingerprints.completeDictionaryMicroabsorptionRC24.residualAlarm, "RC24 nuisance fingerprint changed");

check(close(audit.blindTarget.coefficientSum, blind.coefficientSum) && close(audit.blindTarget.missingMass, blind.missingMass, 1e-6) && close(audit.blindTarget.normalizedResidual, blind.normalizedResidual), "Python blind audit differs");
check(close(audit.closedComposition.corundum, result.closedComposition.closureNormalizedWeightProxy.corundum, 1e-6) && close(audit.maximumAbsoluteErrorPercentagePoints, result.closedComposition.maximumAbsoluteErrorPercentagePoints, 1e-6), "Python composition audit differs");
check(JSON.stringify(audit.decisions) === JSON.stringify(result.decisions), "Python hypothesis decisions differ");

const context = { window: {} };
vm.createContext(context);
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 22 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const dataFile of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInContext(fs.readFileSync(path.join(root, dataFile), "utf8"), context, { filename: dataFile });
}
const cycle = context.window.RESEARCH_CYCLES.find(row => row.id === "RC-2026-24");
const connection = context.window.RESEARCH_CONNECTIONS.find(row => row.id === "CONN-AMBIGUITY-001");
check(cycle?.problemIds.join("|") === "UP-182|UP-184|UP-185" && cycle.artifacts.length === 8, "RC24 cycle record is incomplete");
check(cycle?.verifiedFindings.length >= 11 && cycle?.log.length >= 8 && cycle?.resultMatrix.rows.length >= 7, "RC24 evidence, log, or matrix is incomplete");
check(connection?.problemIds.join("|") === "UP-182|UP-184|UP-185" && connection.mapping.textEn && connection.minimumTest.textEn && connection.failureBoundary.textEn, "ambiguity connection is incomplete");
for (const id of cycle?.problemIds || []) {
  const record = context.window.PROBLEMS.find(row => row.id === id)?.researchHistory?.find(row => row.cycleId === "RC-2026-24");
  check(record?.hypotheses.length === 3 && record.updatedDefinition.textEn && record.decisiveTest.textEn && record.unresolved.textEn, `RC24 bilingual record incomplete for ${id}`);
}
check(Object.keys(context.window.CATALOG_SOURCES).length === 169, "source count is not 169");
check(context.window.RESEARCH_CYCLES.length === 24 && context.window.RESEARCH_CONNECTIONS.length === 27, "cycle or connection count changed");
check(context.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 81, "research-record count is not 81");
for (const page of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, page), "utf8").includes("research-cycle-24-data.js"), `${page} does not load RC24`);

if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("RC24 verification passed: a complete phase dictionary produces the same mass-plus-residual alarm as a true omitted crystal, XRF closes independently, three preregistered hypotheses fail, and independent implementations agree.");
