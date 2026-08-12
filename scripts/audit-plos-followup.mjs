import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { clopperPearson } from "./identification/bounds.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "research/external-audit/plos-followup-2019/pone.0213822.s003.xlsx");
const resultPath = path.join(root, "research/external-audit/plos-followup-2019/audit-result.json");
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const sheet = workbook.worksheets.getItem("import data SPSS (2)");
const rows = sheet.getRange("A1:AB729").values;
const headers = rows[0].map(value => String(value));
const data = rows.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
const countBy = field => Object.fromEntries([...new Set(data.map(row => String(row[field])))].sort().map(value => [value, data.filter(row => String(row[field]) === value).length]));
const nonempty = field => data.filter(row => row[field] !== null && row[field] !== "").length;
const contactSuccess = row => row.source !== null && row.source !== "";
const survivalKnown = row => row["dead per April 2011"] !== null && row["dead per April 2011"] !== "";
const healthObserved = row => row["health status"] !== null && row["health status"] !== "";
const odds = probability => probability === 1 ? Infinity : probability === 0 ? 0 : probability / (1 - probability);

function mortalityResponseCalibration(subset, label) {
  const dead = subset.filter(row => row["dead per April 2011"] === 1 || row["dead per April 2011"] === true);
  const alive = subset.filter(row => row["dead per April 2011"] === 0 || row["dead per April 2011"] === false);
  const deadObserved = dead.filter(healthObserved).length;
  const aliveObserved = alive.filter(healthObserved).length;
  const deadRate = deadObserved / dead.length;
  const aliveRate = aliveObserved / alive.length;
  const deadInterval = clopperPearson(deadObserved, dead.length, 0.025);
  const aliveInterval = clopperPearson(aliveObserved, alive.length, 0.025);
  const pointOddsRatio = odds(aliveRate) / odds(deadRate);
  const upperGamma = odds(aliveInterval.upper) / odds(deadInterval.lower);
  return {
    label,
    dead: dead.length,
    deadHealthObserved: deadObserved,
    deadHealthResponseRate: Number(deadRate.toFixed(6)),
    alive: alive.length,
    aliveHealthObserved: aliveObserved,
    aliveHealthResponseRate: Number(aliveRate.toFixed(6)),
    aliveToDeadResponseOddsRatio: Number.isFinite(pointOddsRatio) ? Number(pointOddsRatio.toFixed(6)) : "unbounded",
    simultaneous95UpperGamma: Number.isFinite(upperGamma) ? Number(upperGamma.toFixed(6)) : "unbounded"
  };
}

const groups = [1, 2, 3].map(group => {
  const subset = data.filter(row => row.Gruppe_RCT === group);
  return {
    group,
    records: subset.length,
    contactOutcomeObserved: subset.filter(contactSuccess).length,
    mortalityRecorded: subset.filter(row => row["dead per April 2011"] === 1).length,
    survivalStatusIndependentlyAvailable: subset.filter(survivalKnown).length,
    meanCorrectCalls: Number((subset.reduce((sum, row) => sum + Number(row["n correct calls"] || 0), 0) / subset.length).toFixed(6))
  };
});

const result = {
  auditId: "PLOS-FOLLOWUP-PUBLIC-DATA-2019-0.1",
  reviewedOn: "2026-08-12",
  source: {
    articleDoi: "10.1371/journal.pone.0213822",
    repositoryUrl: "https://plos.figshare.com/articles/dataset/7858442",
    fileId: 14631221,
    fileName: "pone.0213822.s003.xlsx",
    expectedMd5: "ec7a4933158f1c03dc90dfccbe787a3f",
    license: "CC BY 4.0"
  },
  workbook: {
    sheets: 1,
    records: data.length,
    variables: headers.length,
    uniquePatientIds: new Set(data.map(row => row.DID)).size,
    duplicateFlagCounts: countBy("duplicate (pat)"),
    randomizedGroupCounts: countBy("Gruppe_RCT"),
    studyFlagCounts: countBy("study Tinner"),
    deathStatusCounts: countBy("dead per April 2011")
  },
  fieldCoverage: {
    randomizedContactStrategy: nonempty("Gruppe_RCT"),
    correctCallAttempts: nonempty("n correct calls"),
    wrongCallAttempts: nonempty("wrong calls"),
    informationSource: nonempty("source"),
    deathStatus: nonempty("dead per April 2011"),
    deathDate: nonempty("death (date)"),
    lastKnownAliveDate: nonempty("last kn alive (date)"),
    healthStatus: nonempty("health status")
  },
  groups,
  externalMortalityCalibration: [mortalityResponseCalibration(data, "all"), ...[1, 2, 3].map(group => mortalityResponseCalibration(data.filter(row => row.Gruppe_RCT === group), `group-${group}`))],
  targetDesignAudit: {
    initialNonrespondentFramePresent: false,
    probabilitySubsampleIndicatorPresent: false,
    invitationProbabilityPresent: false,
    postInvitationResponseIndicatorReconstructable: true,
    independentMortalityOutcomePresent: true,
    independentOutcomeForHealthStatusPresent: false,
    developmentValidationCohortIndicatorReconstructable: true,
    patientLevelGammaCalibrationForMortalityPossible: true,
    reason: "The workbook starts with the 728 included vascular patients and randomizes contact strategy or validation cohort. It does not expose an initial nonrespondent frame, probability invitation indicator, or invitation probability for a second-phase subsample. Nearly complete independent mortality can calibrate how availability of self-reported health differs by death status, but it cannot reveal missing health status itself among contact failures."
  },
  findings: {
    publishedDenominatorReconciled: data.length === 728 && new Set(data.map(row => row.DID)).size === 728,
    randomizedGroupsReconciled: groups.reduce((sum, group) => sum + group.records, 0) === 728,
    independentMortalityCanAuditContactCompleteness: groups.every(group => group.survivalStatusIndependentlyAvailable / group.records > 0.98),
    mortalityRevealsOutcomeDependentHealthAvailability: mortalityResponseCalibration(data, "all").aliveToDeadResponseOddsRatio !== 1,
    workbookCannotIdentifySecondPhaseGammaForHealthStatus: true,
    datasetIsAUsefulExternalControlButNotTheRequiredTwoPhaseCalibrationSet: true
  },
  decision: "Use independent mortality to quantify outcome-dependent availability of self-reported health and to benchmark randomized contact burden and development-versus-validation separation. Do not transfer that mortality-specific Gamma to health status itself or claim a probability-subsampled nonrespondent rescue design."
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, resultPath)}`);
} else console.log(JSON.stringify(result, null, 2));

export { result };
