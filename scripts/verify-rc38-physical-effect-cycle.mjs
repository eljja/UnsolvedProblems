import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative));
const readJson = relative => JSON.parse(read(relative).toString("utf8"));
const sha = relative => crypto.createHash("sha256").update(read(relative)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const precommit = readJson("research/reproducibility/rc38-physical-effect-precommit.json");
const modelAmendment = readJson("research/reproducibility/rc38-physical-effect-model-amendment-1.1.json");
const softwareAmendment = readJson("research/reproducibility/rc38-software-loop-amendment-1.1.json");
assert(precommit.precommitId === "RC38-PHYSICAL-EFFECT-FRONTIER-V1" && precommit.resultStateAtSeal.includes("No RC38 model result"), "RC38 preregistration was not sealed before results.");
for (const [file, hash] of Object.entries(precommit.codeHashes)) {
  if (["scripts/run-rc38-physical-effect-model.mjs", "scripts/independent_rc38_physical_effect_model_audit.py", "scripts/rc38-emulated-actuator.mjs"].includes(file)) continue;
  assert(sha(file) === hash, `RC38 frozen implementation changed: ${file}`);
}
assert(sha(modelAmendment.firstModelRun.artifact) === modelAmendment.firstModelRun.sha256, "RC38 first model result is not byte-exact.");
assert(sha(modelAmendment.firstIndependentAudit.artifact) === modelAmendment.firstIndependentAudit.sha256 && modelAmendment.firstIndependentAudit.score === "80/80", "RC38 first model audit is not preserved.");
assert(sha("scripts/run-rc38-physical-effect-model.mjs") === modelAmendment.codeHashesAfter.model, "RC38 amended model hash changed.");
assert(sha("scripts/independent_rc38_physical_effect_model_audit.py") === modelAmendment.codeHashesAfter.independentAudit, "RC38 amended independent-model hash changed.");
assert(sha(softwareAmendment.firstResult.artifact) === softwareAmendment.firstResult.sha256 && softwareAmendment.firstResult.passingCriteria === 9, "RC38 first software result is not preserved.");
assert(sha(softwareAmendment.firstHistory.artifact) === softwareAmendment.firstHistory.sha256 && softwareAmendment.firstHistory.events === 39, "RC38 first software history is not preserved.");
assert(sha("scripts/rc38-emulated-actuator.mjs") === softwareAmendment.codeHashAfter, "RC38 amended actuator hash changed.");
assert(fs.existsSync(path.join(root, softwareAmendment.rawArtifacts, "absolute-setpoint-retry/absolute-state.json.tmp")), "RC38 first-failure temporary state is missing.");

const model = readJson("research/reproducibility/rc38-physical-effect-model-result.json");
const modelAudit = readJson("research/reproducibility/rc38-physical-effect-model-python-audit.json");
assert(model.protocols.map(item => item.states).join("|") === "5|10|11|13|7|7|10", "RC38 model state counts changed.");
assert(model.protocols.map(item => item.transitions).join("|") === "4|9|10|12|6|6|9", "RC38 model transition counts changed.");
assert(model.gate.exactTransitionQualifiers.join("|") === "COUPLED_EVENT_COUNTER|ATOMIC_ACTUATOR_COMMAND_ID", "RC38 exact-transition qualifier changed.");
assert(model.gate.targetStateQualifiers.join("|") === "PULSE_THEN_MARKER|QOS2_ONCE_HANDLER_RETRY|LATE_SENSOR_AFTER_PULSE|COUPLED_EVENT_COUNTER|ATOMIC_ACTUATOR_COMMAND_ID|ABSOLUTE_SETPOINT_RETRY", "RC38 target-state qualifier changed.");
assert(JSON.stringify(model.minimumWitnessSets) === JSON.stringify([["physically_coupled_event_counter"]]), "RC38 minimum universal witness changed.");
const modeled = Object.fromEntries(model.protocols.map(item => [item.protocol, item]));
assert(modeled.MARKER_THEN_PULSE.invariants.T1_stable_marker_matches_one_execution.counterexample.trace.join("|") === "WRITE_MARKER|CRASH_RESTART", "RC38 marker-first counterexample changed.");
assert(modeled.PULSE_THEN_MARKER.invariants.T2_execution_at_most_once.counterexample.trace.join("|") === "PULSE|CRASH_RETRY|PULSE", "RC38 action-first counterexample changed.");
assert(modelAudit.qualifies && modelAudit.passed === 80 && modelAudit.total === 80, "RC38 independent model audit incomplete.");

const result = readJson("research/reproducibility/rc38-software-loop-result.json");
const history = readJson("research/reproducibility/rc38-software-loop-history.json");
const audit = readJson("research/reproducibility/rc38-software-loop-independent-audit.json");
assert(result.qualifies && Object.values(result.criteria).every(Boolean) && result.cases.length === 8, "RC38 confirmation no longer qualifies.");
assert(result.historyEvents === 39 && history.history.length === 39, "RC38 confirmation history denominator changed.");
assert(result.implementation.physicalHosts === 1 && result.implementation.actualHardwareInLoop === false, "RC38 one-host software-only boundary changed.");
const cases = Object.fromEntries(result.cases.map(item => [item.name, item]));
assert(cases["marker-before-action"].final.markers.length === 1 && cases["marker-before-action"].final.actuator.pulseCount === 0, "RC38 marker-first observation changed.");
assert(cases["action-before-marker"].final.markers.length === 1 && cases["action-before-marker"].final.actuator.pulseCount === 2, "RC38 action-first observation changed.");
assert(cases["qos2-once-handler-retry"].final.receipts.length === 1 && cases["qos2-once-handler-retry"].final.actuator.pulseCount === 2, "RC38 MQTT boundary changed.");
assert(cases["authoritative-counter-reconcile"].final.actuator.pulseCount === 1 && cases["stale-counter-reconcile"].final.actuator.pulseCount === 2 && cases["false-positive-counter"].final.actuator.pulseCount === 0, "RC38 counter freshness split changed.");
assert(cases["absolute-setpoint-retry"].final.actuator.absoluteInvocationCount === 2 && cases["absolute-setpoint-retry"].final.actuator.absoluteState.target === 1, "RC38 target-state reformulation changed.");
assert(cases["controller-command-id"].final.actuator.controllerEffects.length === 1 && cases["controller-command-id"].attempts[1].result.output.action.body.status === "replay", "RC38 controller-ID result changed.");
assert(audit.qualifies && audit.passed === 28 && audit.total === 28, "RC38 independent raw audit incomplete.");
for (const item of result.cases) {
  for (const database of ["sink.sqlite", "controller.sqlite"]) {
    const db = new DatabaseSync(path.join(root, item.caseDir, database), { readOnly: true });
    assert(db.prepare("PRAGMA integrity_check").get().integrity_check === "ok", `RC38 database integrity changed: ${item.name}/${database}`);
    db.close();
  }
}

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 36 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-38");
assert(cycle?.problemIds.join("|") === "UP-605|UP-602|UP-315" && cycle.connectionIds.join("|") === "CONN-ATTESTATION-011", "RC38 public scope changed.");
assert(cycle.verifiedFindings.length === 16 && cycle.resultMatrix.rows.length === 18 && cycle.artifacts.length === 18 && cycle.log.length === 13, "RC38 public research record incomplete.");
assert(cycle.nextCycle.text.includes("세 물리 host") && cycle.nextCycle.textEn.includes("three physical hosts"), "RC38 next-cycle starting point is not exact.");
for (const artifact of cycle.artifacts) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC38 artifact: ${artifact.url}`);
const connection = connections.find(item => item.id === "CONN-ATTESTATION-011");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 250 && connection.failureBoundary.textEn.length > 300, "RC38 structural connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length === 7, `${id}: RC38 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text.length > (field === "role" ? 40 : 120) && record[field].textEn.length > (field === "role" ? 80 : 220), `${id}: RC38 ${field} is not substantive and bilingual.`);
  }
  for (const item of record.hypotheses) for (const field of ["claim", "prediction", "test", "reject"]) assert(item[field].text.length > 25 && item[field].textEn.length > 55, `${id}: RC38 hypothesis ${item.code} ${field} is not specific and bilingual.`);
}
for (const id of ["andreakis_dual_write_2026", "oasis_mqtt_5_2019", "lee_rifl_sosp_2015", "liu_unum_nsdi_2023", "nist_hil_cps_2017", "nist_hidden_measurements_2020", "opcua_part6_10507_2026"]) assert(sources[id]?.reviewedOn === "2026-08-20" && /^https:\/\//.test(sources[id].url), `RC38 source missing or stale: ${id}`);
assert(Object.keys(sources).length === 241 && cycles.length === 38 && connections.length === 41, "RC38 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 130, "RC38 curated-problem or record counts changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-38-data.js"), `${page} does not load RC38.`);
const publicText = read("research-cycle-38-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추"]) assert(!publicText.includes(phrase), `RC38 contains forbidden mechanical phrasing: ${phrase}`);
console.log("RC38 verified: model 80/80, eight software-loop cases and 39 events audited 28/28; actual HIL and physical effects remain n=0.");
