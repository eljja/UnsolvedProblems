import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative));
const readJson = relative => JSON.parse(read(relative).toString("utf8"));
const sha = relative => crypto.createHash("sha256").update(read(relative).toString("utf8").replace(/\r\n/g, "\n")).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const precommit = readJson("research/reproducibility/rc42-domain-evidence-precommit.json");
const amendment1 = readJson("research/reproducibility/rc42-domain-evidence-amendment-01.json");
const amendment2 = readJson("research/reproducibility/rc42-domain-evidence-amendment-02.json");
const amendment3 = readJson("research/reproducibility/rc42-domain-evidence-amendment-03.json");
assert(precommit.cycleId === "RC-2026-42" && precommit.problemIds.join("|") === "UP-605|UP-602|UP-315|UP-629", "RC42 preregistered scope changed.");
assert(precommit.hypotheses.length === 5 && precommit.adjudicands.length === 6 && precommit.minimumDecisiveTests.length === 4, "RC42 preregistration is incomplete.");
assert(precommit.frozenNormalizedSha256["research/reproducibility/rc42-domain-evidence-source-manifest.json"] === amendment2.sourceManifest.beforeNormalizedSha256, "RC42 source-date amendment does not bind the frozen manifest.");
assert(sha("research/reproducibility/rc42-domain-evidence-source-manifest.json") === amendment2.sourceManifest.afterNormalizedSha256, "RC42 corrected manifest hash changed.");
assert(precommit.frozenNormalizedSha256["scripts/run-rc42-domain-evidence-audit.mjs"] === amendment1.change.beforeNormalizedSha256, "RC42 first amendment does not bind the frozen JavaScript.");
assert(sha("scripts/run-rc42-domain-evidence-audit.mjs") === amendment1.change.afterNormalizedSha256, "RC42 amended JavaScript hash changed.");
assert(sha("scripts/independent_rc42_domain_evidence_audit.py") === precommit.frozenNormalizedSha256["scripts/independent_rc42_domain_evidence_audit.py"], "RC42 frozen Python changed.");

const firstRun = readJson("research/reproducibility/rc42-domain-evidence-first-run.json");
assert(firstRun.passedCriteria === 11 && firstRun.totalCriteria === 12 && !firstRun.criteria.partialAsCompleteWouldChangeVerdict, "RC42 first-run failure is not preserved.");
assert(amendment1.firstRun.sha256 === sha("research/reproducibility/rc42-domain-evidence-first-run.json"), "RC42 amendment 01 first-run hash changed.");
const preDateResult = readJson("research/reproducibility/rc42-domain-evidence-result-before-date-correction.json");
assert(preDateResult.manifest.normalizedSha256 === amendment2.sourceManifest.beforeNormalizedSha256 && preDateResult.passedCriteria === 12, "RC42 pre-date-correction result is not preserved.");
assert(amendment3.correction.hashMode.includes("CRLF normalized") && amendment2.hashMode === amendment3.correction.hashMode, "RC42 portable hash amendment is incomplete.");
assert(amendment2.preservedResults[0].normalizedSha256 === sha(amendment2.preservedResults[0].path), "RC42 preserved JS result hash changed.");
assert(amendment2.preservedResults[1].normalizedSha256 === sha(amendment2.preservedResults[1].path), "RC42 preserved Python result hash changed.");

const manifest = readJson("research/reproducibility/rc42-domain-evidence-source-manifest.json");
assert(manifest.candidates.length === 6 && Object.keys(manifest.requiredFields).length === 9 && Object.keys(manifest.qualificationRules).length === 4, "RC42 candidate or rule denominator changed.");
const x16 = manifest.candidates.find(item => item.id === "NIST-AMMT-X16-2019");
const x4 = manifest.candidates.find(item => item.id === "NIST-AMMT-X4-2019");
const nsfg = manifest.candidates.find(item => item.id === "NSFG-2011-2015-PHASE2");
assert(x16.releaseDate === "2020-10-16" && x16.resultDate === "2019-07-03" && x16.scores.explicitNullSlots === 0.5, "RC42 X16 date or missing-slot boundary changed.");
assert(x4.localCalibrationExtract.archiveSha256 === "fa2f22efeff4407545bfa4e7c064b82c9598366439f87ae56182687b83fe1683" && x4.localCalibrationExtract.measuredPairs.length === 5, "RC42 X4 calibration input changed.");
assert(nsfg.scores.blindPartition === 1 && nsfg.scores.publicBytes === 0.5 && nsfg.boundary.includes("restricted"), "RC42 NSFG access boundary changed.");

const result = readJson("research/reproducibility/rc42-domain-evidence-result.json");
const audit = readJson("research/reproducibility/rc42-domain-evidence-python-audit.json");
assert(result.manifest.normalizedSha256 === sha("research/reproducibility/rc42-domain-evidence-source-manifest.json"), "RC42 result does not bind the corrected manifest.");
assert(result.passedCriteria === 12 && result.totalCriteria === 12 && Object.values(result.criteria).every(Boolean), "RC42 final criteria incomplete.");
assert(JSON.stringify(result.counts) === JSON.stringify({ empiricalSeparatorCertificate: 0, singleDomainCalibrationSupport: 2, missingnessAlignmentAudit: 0, outcomeBlindNonresponseValidation: 0 }), "RC42 strict qualification counts changed.");
assert(JSON.stringify(result.permissiveCounterfactualCounts) === JSON.stringify({ empiricalSeparatorCertificate: 0, singleDomainCalibrationSupport: 4, missingnessAlignmentAudit: 1, outcomeBlindNonresponseValidation: 0 }), "RC42 permissive ablation counts changed.");
assert(result.calibrationResiduals.points === 5 && Math.abs(result.calibrationResiduals.rmsCelsius - 0.7449862327822953) < 1e-12 && Math.abs(result.calibrationResiduals.maxAbsoluteCelsius - 0.9145539999999528) < 1e-12, "RC42 calibration residuals changed.");
assert(result.commonInputGraphs["NIST-AMMT-X16-2019"].evidencedIndependentDomainPairs === 0 && !result.commonInputGraphs["NSFG-2011-2015-PHASE2"].publicBoundReconstruction, "RC42 common-input or public-bound boundary changed.");
assert(audit.allPassed && audit.passedComparisonChecks === 15 && audit.comparisonChecks === 15 && audit.fieldComparisons === 165 && audit.manifestNormalizedSha256 === result.manifest.normalizedSha256, "RC42 independent Python audit incomplete.");

const schema = readJson("research/reproducibility/rc42-domain-evidence-certificate.schema.json");
for (const field of ["certificateId", "dataset", "adjudicand", "roster", "observations", "calibrationLineage", "commonInputGraph", "reference", "partition", "missingness", "uncertaintyBudget", "independentAdjudication"]) assert(schema.required.includes(field), `RC42 certificate schema missing required field: ${field}`);
const relay = readJson("research/reproducibility/rc42-relay-rig-protocol.json");
assert(relay.status.includes("no hardware events") && relay.measurementDomains.length === 4 && relay.trialPlan.development.trials === 180 && relay.trialPlan.holdout.trials === 90, "RC42 relay protocol denominator changed.");
assert(relay.faultAndOmissionChallenge.budget.requiredMinimumSeparatorsPerTruthPair === 4 && relay.successCriteria.length === 5 && relay.rejectionAndStopRules.length === 6, "RC42 relay challenge or stop rules incomplete.");

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 40 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-42");
assert(cycle?.problemIds.join("|") === "UP-605|UP-602|UP-315|UP-629" && cycle.connectionIds.join("|") === "CONN-EVIDENCE-015", "RC42 public scope changed.");
assert(cycle.verifiedFindings.length === 13 && cycle.resultMatrix.rows.length === 8 && cycle.artifacts.length === 10 && cycle.log.length === 14, "RC42 public research record incomplete.");
assert(cycle.nextCycle.text.includes("HTTP range") && cycle.nextCycle.textEn.includes("HTTP ranges"), "RC42 next-cycle starting point is not exact.");
for (const artifact of cycle.artifacts) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC42 artifact: ${artifact.url}`);
const connection = connections.find(item => item.id === "CONN-EVIDENCE-015");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 450 && connection.failureBoundary.textEn.length > 550, "RC42 structural connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length >= 3, `${id}: RC42 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text.length > (field === "role" ? 45 : 210) && record[field].textEn.length > (field === "role" ? 80 : 330), `${id}: RC42 ${field} is not substantive and bilingual.`);
  }
  for (const item of record.hypotheses) for (const field of ["claim", "prediction", "test", "reject"]) assert(item[field].text.length > 18 && item[field].textEn.length > 30, `${id}: RC42 hypothesis ${item.code} ${field} is not specific and bilingual.`);
}
for (const id of ["nist_ammt_x16_pdr_2020", "nist_ammt_x16_notes_2020", "nist_ammt_x4_pdr_2020", "nist_ammt_x4_paper_2020", "nist_amb2018_thermography_pdr", "nist_amb_data_management_2023", "nchs_nsfg_nonresponse_2017", "nchs_nsfg_paradata_access_2026"]) assert(sources[id]?.reviewedOn === "2026-08-20" && /^https:\/\//.test(sources[id].url), `RC42 source missing or stale: ${id}`);
assert(Object.keys(sources).length === 264 && cycles.length === 42 && connections.length === 45, "RC42 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 144, "RC42 curated-problem or record counts changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-42-data.js"), `${page} does not load RC42.`);
const publicText = read("research-cycle-42-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추"]) assert(!publicText.includes(phrase), `RC42 contains forbidden mechanical phrasing: ${phrase}`);
console.log("RC42 verified: six official candidates audited over nine evidence fields; strict promotion counts 0/2/0/0, five X4 calibration residuals independently reproduced, and the four-principle relay protocol remains design-only with 0 acquired events.");
