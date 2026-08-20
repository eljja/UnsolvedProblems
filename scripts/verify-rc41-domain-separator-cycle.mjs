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

const precommit = readJson("research/reproducibility/rc41-domain-separator-precommit.json");
assert(precommit.precommitId === "RC41-PAIRWISE-DOMAIN-SEPARATOR-V1" && precommit.resultStateAtSeal.includes("No RC41 domain-separator model result"), "RC41 preregistration was not sealed before results.");
assert(precommit.selection.problemIds.join("|") === "UP-605|UP-602|UP-315|UP-629" && precommit.hypotheses.length === 5 && precommit.criteria.length === 16, "RC41 preregistered scope changed.");
assert(precommit.frozenDesign.binarySweep.cells === 1134 && precommit.frozenDesign.expectedIndependentAuditChecks === 6966, "RC41 frozen denominators changed.");
for (const [file, hash] of Object.entries(precommit.codeHashes)) assert(sha(file) === hash, `RC41 frozen artifact changed: ${file}`);

const model = readJson("research/reproducibility/rc41-domain-separator-model-result.json");
const audit = readJson("research/reproducibility/rc41-domain-separator-python-audit.json");
assert(model.qualifies && Object.values(model.criteria).every(Boolean) && Object.keys(model.criteria).length === 16, "RC41 preregistered criteria no longer qualify.");
assert(model.binarySweep.length === 1134 && model.binarySweep.every(item => item.identifiesExactTruth === item.theoremPrediction), "RC41 pairwise-separator theorem sweep changed.");
const profiles = Object.fromEntries(model.profiles.map(item => [item.name, item]));
assert(model.profiles.length === 7, "RC41 profile denominator changed.");
assert(!profiles.HETEROGENEOUS_WEAK.identifiesExactTruth && profiles.HETEROGENEOUS_WEAK.minimumPairwiseSeparators === 3 && profiles.HETEROGENEOUS_WEAK.collisionCount === 6, "RC41 weak heterogeneous boundary changed.");
assert(profiles.HETEROGENEOUS_STRONG.identifiesExactTruth && profiles.HETEROGENEOUS_STRONG.minimumPairwiseSeparators === 4 && profiles.HETEROGENEOUS_STRONG.collisionCount === 0, "RC41 strong heterogeneous boundary changed.");
assert(profiles.POLARITY_INDEXED.identifiesExactTruth && !profiles.POLARITY_ANONYMOUS.identifiesExactTruth && profiles.POLARITY_ANONYMOUS.shortestCollision.truths.join("|") === "0|1", "RC41 identity-ablation counterexample changed.");
assert(profiles.RAW_CHANNEL_NAIVE.identifiesExactTruth && profiles.RAW_CHANNEL_NAIVE.domainCount === 6, "RC41 raw-channel naive verdict changed.");
assert(!profiles.THREE_CORRELATED_DOMAINS.identifiesExactTruth && profiles.THREE_CORRELATED_DOMAINS.collisionCount === 18, "RC41 calibration-domain collapse changed.");
assert(profiles.THREE_DOMAINS_PLUS_ANCHOR.identifiesExactTruth && profiles.THREE_DOMAINS_PLUS_ANCHOR.collisionCount === 0, "RC41 independent-anchor result changed.");
assert(model.population.N === 6 && model.population.summaries.length === 28 && model.population.missingSummaryCount === 21 && model.population.missingButThresholdIdentifiedCount === 6, "RC41 population denominators changed.");
assert(model.population.summaries.every(item => item.identifiedWidth === item.missing), "RC41 population identified-width result changed.");
assert(model.population.decisiveBeforeAudit.decision === "inconclusive" && model.population.afterAuditRevealZero.decision === "inconclusive" && model.population.afterAuditRevealOne.decision === "above", "RC41 audit-branch decision changed.");
assert(model.implementationBoundary.actualHardwareInLoop === false && model.implementationBoundary.physicalSensors === 0 && model.implementationBoundary.calibratedSupportSets === 0 && model.implementationBoundary.auditedHumanRecords === 0, "RC41 non-physical boundary changed.");
assert(audit.qualifies && audit.passed === 6966 && audit.total === 6966 && audit.checks.every(item => item.pass), "RC41 independent Python audit incomplete.");

const schema = readJson("research/reproducibility/rc41-separator-certificate.schema.json");
for (const field of ["certificateId", "adjudicand", "truthStates", "domains", "pairwiseSeparators", "corruptionBudget", "omissionBudget", "identityBinding", "calibrationCovariance", "missingnessMechanism", "identifiedSet", "decision", "independentAudit"]) assert(schema.required.includes(field), `RC41 certificate schema missing required field: ${field}`);

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 39 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-41");
assert(cycle?.problemIds.join("|") === "UP-605|UP-602|UP-315|UP-629" && cycle.connectionIds.join("|") === "CONN-ATTESTATION-014", "RC41 public scope changed.");
assert(cycle.verifiedFindings.length === 13 && cycle.resultMatrix.rows.length === 12 && cycle.artifacts.length === 5 && cycle.log.length === 12, "RC41 public research record incomplete.");
assert(cycle.nextCycle.text.includes("RC42") && cycle.nextCycle.textEn.includes("RC42"), "RC41 next-cycle starting point is not exact.");
for (const artifact of cycle.artifacts) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC41 artifact: ${artifact.url}`);
const connection = connections.find(item => item.id === "CONN-ATTESTATION-014");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 350 && connection.failureBoundary.textEn.length > 450, "RC41 structural connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length === 16, `${id}: RC41 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text.length > (field === "role" ? 45 : 170) && record[field].textEn.length > (field === "role" ? 85 : 280), `${id}: RC41 ${field} is not substantive and bilingual.`);
  }
  for (const item of record.hypotheses) for (const field of ["claim", "prediction", "test", "reject"]) assert(item[field].text.length > 18 && item[field].textEn.length > 30, `${id}: RC41 hypothesis ${item.code} ${field} is not specific and bilingual.`);
}
for (const id of ["jcgm_100_2008", "jcgm_gum5_2026", "rubin_inference_missing_1976", "fawzi_secure_estimation_2014", "brooks_iyengar_sensor_fusion_1996"]) assert(sources[id]?.reviewedOn === "2026-08-20" && /^https:\/\//.test(sources[id].url), `RC41 source missing or stale: ${id}`);
assert(Object.keys(sources).length === 256 && cycles.length === 41 && connections.length === 44, "RC41 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 140, "RC41 curated-problem or record counts changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-41-data.js"), `${page} does not load RC41.`);
const publicText = read("research-cycle-41-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추"]) assert(!publicText.includes(phrase), `RC41 contains forbidden mechanical phrasing: ${phrase}`);
console.log("RC41 verified: 1,134/1,134 pairwise-separator cells, calibration-domain and identity counterexamples, and N=6 partial-identification bounds independently audited 6,966/6,966; real sensors and human records remain n=0.");
