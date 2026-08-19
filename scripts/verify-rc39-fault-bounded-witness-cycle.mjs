import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative));
const readJson = relative => JSON.parse(read(relative).toString("utf8"));
const sha = relative => crypto.createHash("sha256").update(read(relative)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const precommit = readJson("research/reproducibility/rc39-fault-bounded-witness-precommit.json");
assert(precommit.precommitId === "RC39-FAULT-BOUNDED-PHYSICAL-WITNESS-V1" && precommit.resultStateAtSeal.includes("No RC39 model result"), "RC39 preregistration was not sealed before results.");
for (const [file, hash] of Object.entries(precommit.codeHashes)) assert(sha(file) === hash, `RC39 frozen artifact changed: ${file}`);

const model = readJson("research/reproducibility/rc39-fault-bounded-witness-model-result.json");
const audit = readJson("research/reproducibility/rc39-fault-bounded-witness-python-audit.json");
const architecture = Object.fromEntries(model.architectures.map(item => [item.name, item]));
assert(model.qualifies && Object.values(model.criteria).every(Boolean) && Object.keys(model.criteria).length === 12, "RC39 preregistered criteria no longer qualify.");
assert(model.architectures.length === 10 && model.thresholdGrid.length === 15 && model.commonCauseSweep.length === 7, "RC39 model denominators changed.");
assert(architecture.SOURCE_MARKER.shortestCollision.truths.join("|") === "0|1|2", "RC39 source-marker collision changed.");
assert(architecture.COMMAND_ACCEPTANCE_BEFORE_ACTION.shortestCollision.truths.join("|") === "0|1", "RC39 acceptance-before-action collision changed.");
assert(architecture.ONE_EVENT_BOUND_WITNESS_F0.identifiesExactEventCount && architecture.ONE_EVENT_BOUND_WITNESS_F0.collisionCount === 0, "RC39 zero-fault single-witness verdict changed.");
assert(!architecture.TWO_DIVERSE_WITNESSES_F1.identifiesExactEventCount && architecture.TWO_DIVERSE_WITNESSES_F1.worldCount === 15 && architecture.TWO_DIVERSE_WITNESSES_F1.collisionCount === 6, "RC39 two-witness lower bound changed.");
assert(architecture.THREE_DIVERSE_WITNESSES_F1.identifiesExactEventCount && architecture.THREE_DIVERSE_WITNESSES_F1.worldCount === 21 && architecture.THREE_DIVERSE_WITNESSES_F1.collisionCount === 0, "RC39 three-witness result changed.");
assert(!architecture.SIGNED_CURRENT_TOKEN_UNBOUND_CLAIM_TIME.identifiesExactEventCount && architecture.SIGNED_CURRENT_TOKEN_UNBOUND_CLAIM_TIME.collisionCount === 3, "RC39 claim-freshness boundary changed.");
assert(!architecture.RESETTABLE_CURRENT_COUNTER.identifiesExactEventCount && architecture.RESETTABLE_CURRENT_COUNTER.shortestCollision.truths.join("|") === "0|1|2", "RC39 reset boundary changed.");
assert(model.thresholdGrid.every(item => item.identifiesExactEventCount === (item.n >= 2 * item.f + 1)), "RC39 strict-majority grid changed.");
assert(model.commonCauseSweep.every(item => !item.identifiesExactEventCount && item.collisionClasses === 3), "RC39 common-cause sweep changed.");
assert(model.minimumCertificates.unconstrainedCommonCauseFault === null, "RC39 common-cause impossibility boundary changed.");
assert(model.implementationBoundary.actualHardwareInLoop === false && model.implementationBoundary.physicalEventsObserved === 0 && model.implementationBoundary.physicalHosts === 1, "RC39 non-physical boundary changed.");
assert(audit.qualifies && audit.passed === 95 && audit.total === 95 && audit.checks.every(item => item.pass), "RC39 independent Python audit incomplete.");

const certificate = readJson("research/reproducibility/rc39-physical-evidence-certificate.schema.json");
const hilPlan = readJson("research/reproducibility/rc39-hil-qualification-plan.json");
for (const field of ["event", "adjudicand", "faultModel", "witnesses", "freshness", "retention", "uncertainty", "independentAdjudication", "verdict"]) assert(certificate.required.includes(field), `RC39 certificate missing required field: ${field}`);
assert(hilPlan.status === "design-only-no-hardware-executed" && hilPlan.minimumRig.physicalHosts === 3 && hilPlan.faultMatrix.length === 10, "RC39 HIL plan boundary or denominator changed.");
assert(hilPlan.calibrationBeforeFaultInjection.blindTrialsPerClassMinimum === 100 && hilPlan.minimumRig.witnesses.length === 3, "RC39 calibration or witness plan changed.");

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 37 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-39");
assert(cycle?.problemIds.join("|") === "UP-605|UP-602|UP-315" && cycle.connectionIds.join("|") === "CONN-ATTESTATION-012", "RC39 public scope changed.");
assert(cycle.verifiedFindings.length === 17 && cycle.resultMatrix.rows.length === 14 && cycle.artifacts.length === 7 && cycle.log.length === 13, "RC39 public research record incomplete.");
assert(cycle.nextCycle.text.includes("F01–F10") && cycle.nextCycle.textEn.includes("F01-F10"), "RC39 next-cycle starting point is not exact.");
for (const artifact of cycle.artifacts) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC39 artifact: ${artifact.url}`);
const connection = connections.find(item => item.id === "CONN-ATTESTATION-012");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 250 && connection.failureBoundary.textEn.length > 350, "RC39 structural connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length === 8, `${id}: RC39 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text.length > (field === "role" ? 40 : 180) && record[field].textEn.length > (field === "role" ? 80 : 320), `${id}: RC39 ${field} is not substantive and bilingual.`);
  }
  for (const item of record.hypotheses) for (const field of ["claim", "prediction", "test", "reject"]) assert(item[field].text.length > 25 && item[field].textEn.length > 50, `${id}: RC39 hypothesis ${item.code} ${field} is not specific and bilingual.`);
}
for (const id of ["rfc_rats_9334_2023", "rfc_eat_9711_2025", "rfc_charra_9684_2024", "tcg_tpm2_library_v185_2026", "opcua_safety_10504_2024", "nasa_common_cause_redundancy_2025", "nrc_nureg_cr7313_2026", "nist_metrological_traceability_policy"]) assert(sources[id]?.reviewedOn === "2026-08-20" && /^https:\/\//.test(sources[id].url), `RC39 source missing or stale: ${id}`);
assert(Object.keys(sources).length === 247 && cycles.length === 39 && connections.length === 42, "RC39 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 133, "RC39 curated-problem or record counts changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-39-data.js"), `${page} does not load RC39.`);
const publicText = read("research-cycle-39-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추"]) assert(!publicText.includes(phrase), `RC39 contains forbidden mechanical phrasing: ${phrase}`);
console.log("RC39 verified: ten architectures, 15/15 majority-grid cells and common-cause limits independently audited 95/95; actual sensors and physical events remain n=0.");
