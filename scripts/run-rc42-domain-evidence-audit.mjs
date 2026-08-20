import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "research", "reproducibility", "rc42-domain-evidence-source-manifest.json");
const outputPath = path.join(root, "research", "reproducibility", "rc42-domain-evidence-result.json");
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const normalizedHash = bytes => crypto.createHash("sha256").update(bytes.toString("utf8").replace(/\r\n/g, "\n")).digest("hex");

const qualifications = {};
for (const [ruleId, rule] of Object.entries(manifest.qualificationRules)) {
  qualifications[ruleId] = manifest.candidates.map(candidate => {
    const fields = Object.fromEntries(rule.requires.map(field => [field, candidate.scores[field]]));
    const failed = rule.requires.filter(field => candidate.scores[field] < rule.minimumEach);
    return { candidateId: candidate.id, qualified: failed.length === 0, fields, failed };
  });
}

const counts = Object.fromEntries(Object.entries(qualifications).map(([ruleId, rows]) => [ruleId, rows.filter(row => row.qualified).length]));
const permissiveCounts = Object.fromEntries(Object.entries(manifest.qualificationRules).map(([ruleId, rule]) => {
  const count = manifest.candidates.filter(candidate => rule.requires.every(field => candidate.scores[field] > 0)).length;
  return [ruleId, count];
}));

const x4 = manifest.candidates.find(candidate => candidate.id === manifest.calibrationAdjudicand.candidateId);
const residualRows = x4.localCalibrationExtract.measuredPairs.map(pair => {
  const signedCelsius = pair.curveCelsius - pair.referenceCelsius;
  return { ...pair, signedCelsius, absoluteCelsius: Math.abs(signedCelsius) };
});
const n = residualRows.length;
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const signed = residualRows.map(row => row.signedCelsius);
const calibrationResiduals = {
  points: n,
  meanSignedCelsius: mean(signed),
  meanAbsoluteCelsius: mean(signed.map(Math.abs)),
  rmsCelsius: Math.sqrt(mean(signed.map(value => value * value))),
  maxAbsoluteCelsius: Math.max(...signed.map(Math.abs)),
  minSignedCelsius: Math.min(...signed),
  maxSignedCelsius: Math.max(...signed),
  rows: residualRows,
  admissibleClaim: "Five published calibration-pair residuals for one Mikrotron camera chain.",
  forbiddenClaims: ["independent validation", "cross-domain independence", "in-process true-temperature accuracy"]
};

const commonInputGraphs = {
  "NIST-AMMT-X16-2019": {
    nodes: ["XYPT command stream", "AMMT controller and 10 us timebase", "melt-pool camera", "layer camera", "DAQ channels 1-4", "shared build and material", "X4 camera calibration lineage"],
    knownSharedEdges: [
      ["XYPT command stream", "AMMT controller and 10 us timebase"],
      ["AMMT controller and 10 us timebase", "melt-pool camera"],
      ["AMMT controller and 10 us timebase", "DAQ channels 1-4"],
      ["shared build and material", "melt-pool camera"],
      ["shared build and material", "layer camera"],
      ["shared build and material", "DAQ channels 1-4"],
      ["X4 camera calibration lineage", "melt-pool camera"]
    ],
    unresolvedEdges: [
      ["melt-pool camera", "layer camera", "independent calibration standards not established"],
      ["melt-pool camera", "DAQ channels 1-4", "common power, processor, and clock faults not fully enumerated"],
      ["layer camera", "DAQ channels 1-4", "cross-system covariance not published"]
    ],
    evidencedIndependentDomainPairs: 0,
    conservativeCommonCauseGroups: 1,
    interpretation: "The release supports a real common-input graph but no pairwise independence certificate. Four DAQ columns and two cameras are not six resilience domains."
  },
  "NSFG-2011-2015-PHASE2": {
    nodes: ["week-10 nonrespondent roster", "probability phase-2 selection", "enhanced effort and incentive", "later response outcome", "public respondent file", "restricted all-case paradata"],
    knownSharedEdges: [
      ["week-10 nonrespondent roster", "probability phase-2 selection"],
      ["probability phase-2 selection", "enhanced effort and incentive"],
      ["enhanced effort and incentive", "later response outcome"],
      ["later response outcome", "public respondent file"],
      ["week-10 nonrespondent roster", "restricted all-case paradata"]
    ],
    inaccessibleAdjudicationLinks: [
      ["probability phase-2 selection", "public respondent file", "selection flag and all-case roster not public"],
      ["restricted all-case paradata", "later response outcome", "record linkage requires RDC access"]
    ],
    temporallyOutcomeBlindSelection: true,
    publicBoundReconstruction: false,
    interpretation: "The design is a valid candidate for double-sampling analysis, but the public bytes cannot adjudicate the narrowing."
  }
};

const hypotheses = {
  H1: { verdict: counts.empiricalSeparatorCertificate > 0 ? "supported" : "rejected", evidence: `${counts.empiricalSeparatorCertificate} fully qualified candidate(s)` },
  H2: { verdict: counts.singleDomainCalibrationSupport > 0 && n === 5 ? "supported-limited" : "rejected", evidence: `${counts.singleDomainCalibrationSupport} calibration-support candidate(s); ${n} X4 pairs` },
  H3: { verdict: manifest.candidates.find(candidate => candidate.id === "NIST-AMMT-X16-2019").scores.explicitNullSlots === 1 ? "supported" : "rejected", evidence: "Dropped frames are documented, but stable authenticated null records are not published." },
  H4: { verdict: counts.outcomeBlindNonresponseValidation > 0 ? "supported" : "rejected", evidence: `${counts.outcomeBlindNonresponseValidation} public validation candidate(s)` },
  H5: { verdict: commonInputGraphs["NIST-AMMT-X16-2019"].evidencedIndependentDomainPairs > 0 ? "supported" : "rejected", evidence: "Shared and unresolved common inputs prevent one-domain-per-channel assignment." }
};

const criteria = {
  sixCandidatesAudited: manifest.candidates.length === 6,
  noExactSeparatorCandidate: counts.empiricalSeparatorCertificate === 0,
  x4IsCalibrationSupport: qualifications.singleDomainCalibrationSupport.find(row => row.candidateId === "NIST-AMMT-X4-2019")?.qualified === true,
  x16NotNullLedger: qualifications.missingnessAlignmentAudit.find(row => row.candidateId === "NIST-AMMT-X16-2019")?.qualified === false,
  nsfgSelectionOutcomeBlind: commonInputGraphs["NSFG-2011-2015-PHASE2"].temporallyOutcomeBlindSelection === true,
  nsfgPublicNarrowingUnavailable: commonInputGraphs["NSFG-2011-2015-PHASE2"].publicBoundReconstruction === false,
  fiveCalibrationPairs: calibrationResiduals.points === 5,
  residualsFinite: Object.values(calibrationResiduals).filter(value => typeof value === "number").every(Number.isFinite),
  maxResidualBelowOneCelsius: calibrationResiduals.maxAbsoluteCelsius < 1,
  noIndependentPairAsserted: commonInputGraphs["NIST-AMMT-X16-2019"].evidencedIndependentDomainPairs === 0,
  partialAsCompleteWouldChangeVerdict: permissiveCounts.empiricalSeparatorCertificate > counts.empiricalSeparatorCertificate,
  calibratedDoesNotMeanValidated: calibrationResiduals.forbiddenClaims.includes("independent validation")
};

const result = {
  cycleId: "RC-2026-42",
  generatedOn: new Date().toISOString(),
  manifest: { id: manifest.manifestId, normalizedSha256: normalizedHash(manifestBytes), candidates: manifest.candidates.length },
  counts,
  permissiveCounterfactualCounts: permissiveCounts,
  qualifications,
  calibrationResiduals,
  commonInputGraphs,
  hypotheses,
  criteria,
  passedCriteria: Object.values(criteria).filter(Boolean).length,
  totalCriteria: Object.keys(criteria).length,
  decision: counts.empiricalSeparatorCertificate === 0
    ? "Do not promote RC41 to a real empirical separator certificate. Preserve NIST X4 as single-chain calibration evidence, use X16 to design an explicit slot ledger, and require restricted or newly released NSFG paradata before nonresponse narrowing."
    : "Promote only the fully qualifying candidate under its frozen partition and reference rule."
};

if (process.argv.includes("--write")) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));

