import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const source = load("research/external-audit/nist-vo2-2020/source-manifest.json");
const audit = load("research/reproducibility/nist-raw-profile-audit.json");
const manifest = load("research/reproducibility/nist-acquisition-manifest.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(source.humanLabelsSha256 === "0056a45f7d45694368597fe7804569339745214530584dae10652873fed38cd2", "Human Labels.xlsx hash is not the official workbook hash");
check(source.compositionTemperatureSha256 === "6fcc4e862ea866286436a8624b2b82241ce80a08cc87eb0bb878f56ce6fdd027", "composition-temperature hash changed");
check(source.rawXrdSha256 === audit.source.rawProfileSha256, "raw-profile hashes disagree across manifest and audit");
check(new Set([source.humanLabelsSha256, source.compositionTemperatureSha256, source.rawXrdSha256, source.readmeSha256]).size === 4, "source roles do not have four distinct content hashes");

check(audit.shape.spectra === 352 && audit.shape.labeledSpectra === 192, "raw/labeled profile denominator changed");
check(audit.shape.twoThetaPoints === 3841 && audit.shape.nearestNeighborEdges === 352, "profile columns or grid-edge denominator changed");
check(audit.protocol.developmentLabels.join("|") === "HL1|HL2", "development-label split changed");
check(audit.protocol.sealedAdjudicationLabels.join("|") === "HL3|HL4|HL5", "sealed-label split changed");
check(audit.selectedMetric === "centeredCosine", "development-selected observable changed");
check(audit.selectedResult.sealedAdjudication.auc === 0.755362, "sealed-label AUC changed");
check(audit.selectedResult.sealedAdjudication.sensitivity === 0.333333, "frozen-threshold sensitivity changed");
check(audit.interpretation.notSupported.includes("cannot estimate"), "single-acquisition variance restriction missing");

check(manifest.design.sampleAcquisitions === 256 && manifest.design.calibrationAcquisitions === 24 && manifest.design.totalFrames === 280, "acquisition denominator changed");
check(manifest.design.checkpointSampleAcquisitions === 192 && manifest.design.extensionSampleAcquisitions === 64, "nested checkpoint changed");
check(manifest.operatorSessions.length === 4, "expected four preparation-by-condition sessions");
check(manifest.analysisMapping.length === 32, "analysis mapping must contain 32 coordinates");
check(manifest.analysisMapping.filter(row => row.stratum === "frontier").length === 16, "frontier allocation changed");
check(manifest.analysisMapping.filter(row => row.stratum === "control").length === 16, "control allocation changed");
check(manifest.analysisMapping.filter(row => row.stage === "checkpoint-24").length === 24, "checkpoint coordinate count changed");
check(manifest.blinding.publicScheduleIsDryRunTemplate === true, "public schedule must remain a dry-run template");
check(manifest.blinding.actualRunRequirement.includes("private seed"), "live private-seed requirement missing");

for (const session of manifest.operatorSessions) {
  check(session.sampleAcquisitions.length === 64, `${session.sessionId}: expected 64 sample acquisitions`);
  check(session.calibrationAcquisitions.length === 6, `${session.sessionId}: expected six calibration acquisitions`);
  check(session.sampleAcquisitions.slice(0, 48).every(row => row.stage === "checkpoint-24"), `${session.sessionId}: checkpoint is not a 48-frame prefix`);
  check(session.sampleAcquisitions.slice(48).every(row => row.stage === "extension-32"), `${session.sessionId}: extension is not the final 16 frames`);
  check(session.sampleAcquisitions.every((row, index, rows) => index === 0 || row.coordinateId !== rows[index - 1].coordinateId), `${session.sessionId}: adjacent technical repeats found`);
  check(session.sampleAcquisitions.every(row => !("stratum" in row) && !("labels" in row) && !("developmentLabel" in row) && !("developmentLabels" in row)), `${session.sessionId}: operator schedule leaks stratum or human labels`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("RC13 verification passed: source hashes are role-correct, the sealed-label threshold failure is frozen, and the 280-frame dry run satisfies nesting, calibration, and operator-blind constraints.");
