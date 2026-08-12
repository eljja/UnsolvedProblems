import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const independent = load("research/reproducibility/nist-independent-source-audit.json");
const graphSpec = load("research/reproducibility/nist-graph-sensitivity-spec.json");
const graph = load("research/reproducibility/nist-graph-sensitivity-result.json");
const geometry = load("research/reproducibility/nist-geometry-reference-audit.json");
const manifest = load("research/reproducibility/nist-acquisition-manifest.json");
const preregistration = load("research/reproducibility/nist-instrument-preregistration.schema.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(Object.values(independent.findings).every(Boolean), "independent source audit has a failed finding");
check(independent.hashMismatches.length === 0, "official source hash mismatch remains");
check(independent.workbook.recordsCompared === 192 && independent.workbook.cellValueMismatchRows === 0, "independent workbook replay changed");
check(independent.compositionTemperature.rows === 352 && independent.compositionTemperature.mappingMismatchRows === 0, "composition-row mapping changed");
check(independent.rawProfiles.spectra === 352 && independent.rawProfiles.columns === 3841 && independent.rawProfiles.stepMismatchCount === 0, "raw-profile independent shape changed");

check(graph.benchmarkId === graphSpec.benchmarkId, "graph-sensitivity spec/result IDs differ");
check(graphSpec.bootstrap.replicates === 5000, "graph-sensitivity replicate count changed");
check(graph.fullAuc === 0.755362, "RC13 full AUC did not reproduce");
check(graph.axisResults.composition.auc === 0.704903 && graph.axisResults.temperature.auc === 0.791004, "axis-specific AUC changed");
check(graph.deletionSensitivity.coordinate.minimum === 0.745972, "coordinate-deletion minimum changed");
check(graph.deletionSensitivity.temperature.minimum === 0.706184, "temperature-deletion minimum changed");
check(graph.deletionSensitivity.composition.minimum === 0.736159, "composition-deletion minimum changed");
check(graph.multiplierSensitivity.vertex.q025 === 0.616828, "vertex lower sensitivity quantile changed");
check(graph.multiplierSensitivity.spatialBlocks["2x6"].q025 === 0.530209, "widest block lower sensitivity quantile changed");
check(Object.values(graph.gates).every(Boolean) && graph.allRetentionGatesPass, "one or more preregistered ranking-retention gates failed");
check(graph.limitations.some(text => text.includes("not confidence intervals")), "fixed-design sensitivity limitation missing");

check(geometry.originalAcquisition.instrument === "Bruker D8 Discover powder diffractometer", "primary-paper instrument changed");
check(geometry.originalAcquisition.fixedIncidentAngleDegrees === 14, "primary-paper incident angle changed");
check(geometry.originalAcquisition.twoThetaRangeDegrees.join("|") === "18|37.2", "primary-paper detector window changed");
check(geometry.originalAcquisition.integrationMinutesPerPattern === 10, "primary-paper integration time changed");
check(geometry.currentOfficialReferenceCandidates.length === 3, "reference-candidate denominator changed");
check(geometry.decision.includes("Do not preregister"), "geometry-compatibility refusal missing");

const calibrationRows = manifest.operatorSessions.flatMap(session => session.calibrationAcquisitions);
check(calibrationRows.length === 24, "calibration-frame denominator changed");
check(calibrationRows.filter(row => row.referenceRole === "same-geometry transfer monitor").length === 16, "same-geometry transfer-monitor allocation changed");
check(calibrationRows.filter(row => row.referenceRole === "traceable anchor").length === 8, "traceable-anchor allocation changed");
check(calibrationRows.every(row => !["NIST SRM 640f", "NIST SRM 1976c", "NIST SRM 2000"].includes(row.referenceMaterial)), "manifest prematurely fixes an SRM before geometry audit");
check(manifest.currentReferenceMaterials.referenceSelectionStatus === "unresolved by design", "reference selection must remain unresolved before instrument audit");

check(preregistration.required.includes("configurationBridge") && preregistration.required.includes("uncertaintyBudget"), "preregistration schema omits bridge or uncertainty budget");
check(preregistration.properties.configurationBridge.properties.abaCycles.minimum === 6, "A-B-A minimum cycles changed");
check(preregistration.properties.traceableAnchor.required.includes("certificateSha256"), "certificate content seal missing");
check(preregistration.properties.specimenGeometry.required.includes("configurationHash"), "instrument configuration seal missing");
check(preregistration.properties.checkpointGates.properties.unlockAction.const === "acquire-final-64-specimen-frames", "checkpoint unlock action changed");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("RC14 verification passed: independent source replay has zero mismatch, graph-dependent ranking gates survive, and calibration now bridges traceable and specimen geometries without prematurely fixing an SRM.");
