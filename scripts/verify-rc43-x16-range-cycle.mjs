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

const precommit = readJson("research/reproducibility/rc43-x16-trigger-frame-precommit.json");
const plan = readJson("research/reproducibility/rc43-x16-independent-holdout-plan.json");
const release = readJson("research/reproducibility/rc43-x16-holdout-release.json");
assert(precommit.cycleId === "RC-2026-43" && precommit.problems.join("|") === "UP-605|UP-315", "RC43 preregistered scope changed.");
assert(plan.executionOrder.length === 3 && plan.fixedHoldoutProcedure.layer === 2 && plan.stopRules.length === 5, "RC43 independent holdout plan incomplete.");
assert(sha(plan.frozenImplementations.javascript.path) === plan.frozenImplementations.javascript.normalizedLfSha256, "RC43 frozen JavaScript changed.");
assert(sha(plan.frozenImplementations.python.path) === plan.frozenImplementations.python.normalizedLfSha256, "RC43 frozen Python changed.");
assert(release.developmentAgreement.sevenChecksPassed && release.transferBeforeHoldout.conservativeCumulativeUpperBound === 65155387, "RC43 holdout was not released through the independent gate.");

const js1 = readJson("research/reproducibility/rc43-x16-layer-0001-result.json");
const py1 = readJson("research/reproducibility/rc43-x16-layer-0001-python-audit.json");
const js2 = readJson("research/reproducibility/rc43-x16-layer-0002-result.json");
const py2 = readJson("research/reproducibility/rc43-x16-layer-0002-python-audit.json");
for (const [layer, js, py] of [[1, js1, py1], [2, js2, py2]]) {
  assert(py.layer === layer && py.comparisonToJavaScript.passed, `RC43 L000${layer} independent comparison failed.`);
  assert(Object.keys(py.comparisonToJavaScript.checks).length === 7 && Object.values(py.comparisonToJavaScript.checks).every(Boolean), `RC43 L000${layer} seven-check denominator changed.`);
  assert(js.xypt.textSha256 === py.xypt.textSha256 && js.avi.retainedASha256 === py.avi.retainedASha256, `RC43 L000${layer} source or retained-prefix hash changed.`);
  assert(JSON.stringify(js.avi.counters) === JSON.stringify(py.avi.counters), `RC43 L000${layer} native AVI counters changed.`);
  assert(js.avi.nestedRetainedPrefixAgreement && py.avi.nestedRetainedPrefixAgreement, `RC43 L000${layer} nested prefix no longer agrees.`);
}
assert(js1.adjudication.triggerCount === 94736 && js1.adjudication.frameCount === 94713 && js1.adjudication.triggerMinusFrame === 23, "RC43 L0001 count result changed.");
assert(js2.adjudication.triggerCount === 95504 && js2.adjudication.frameCount === 95504 && js2.adjudication.triggerMinusFrame === 0, "RC43 L0002 count result changed.");
assert(js1.adjudication.exactNullLedger === false && js2.adjudication.exactNullLedger === false, "RC43 aggregate counts were incorrectly promoted to identity ledgers.");
assert(js1.adjudication.hypotheses.H2 === "rejected-on-development" && js2.adjudication.hypotheses.H2.startsWith("count-bound-supported"), "RC43 layer-specific less-than-twenty verdict changed.");
assert(js2.transfer.conservativePriorUpperBound === 65155387 && py2.transfer.conservativePriorUpperBound === 85640647 && py2.transfer.cumulativeUpperBound === 106125907, "RC43 cumulative transfer chain changed.");
assert(py2.transfer.cumulativeUpperBound <= py2.transfer.maximumCumulativeBytes && py2.transfer.remainingConservativeBytes === 28091821, "RC43 transfer budget exceeded or changed.");

const result = readJson("research/reproducibility/rc43-x16-cycle-result.json");
assert(result.layers.length === 2 && result.layers[0].triggerMinusFrame === 23 && result.layers[1].triggerMinusFrame === 0, "RC43 integrated layer result changed.");
assert(result.hypotheses.H5_independentReproductionWithoutRuleChange === "supported-for-both-layers", "RC43 independent-reproduction verdict changed.");
assert(result.status === "aggregate-count-reproduced-identity-ledger-unresolved" && result.uncertaintyAndIndependence.implementation.includes("7-Zip 22.01"), "RC43 resolution or decoder-independence boundary changed.");
for (const layer of result.layers) {
  const jsPath = `research/reproducibility/rc43-x16-layer-${String(layer.layer).padStart(4, "0")}-result.json`;
  const pyPath = `research/reproducibility/rc43-x16-layer-${String(layer.layer).padStart(4, "0")}-python-audit.json`;
  assert(sha(jsPath) === layer.javascriptSha256 && sha(pyPath) === layer.pythonSha256, `RC43 L000${layer.layer} integrated artifact hash changed.`);
}

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 41 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-43");
assert(cycle?.problemIds.join("|") === "UP-605|UP-315" && cycle.connectionIds.join("|") === "CONN-EVIDENCE-016", "RC43 public scope changed.");
assert(cycle.verifiedFindings.length === 8 && cycle.resultMatrix.rows.length === 7 && cycle.artifacts.length === 10 && cycle.log.length === 10, "RC43 public research record incomplete.");
assert(cycle.nextCycle.text.includes("95%") && cycle.nextCycle.textEn.includes("1% FDR"), "RC43 next-cycle decisive thresholds are not exact.");
for (const artifact of cycle.artifacts) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC43 artifact: ${artifact.url}`);
const connection = connections.find(item => item.id === "CONN-EVIDENCE-016");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 400 && connection.failureBoundary.textEn.length > 500, "RC43 structural connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length === 3, `${id}: RC43 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text.length > (field === "role" ? 45 : 210) && record[field].textEn.length > (field === "role" ? 80 : 330), `${id}: RC43 ${field} is not substantive and bilingual.`);
  }
  for (const item of record.hypotheses) for (const field of ["claim", "prediction", "test", "reject"]) assert(item[field].text.length > 18 && item[field].textEn.length > 30, `${id}: RC43 hypothesis ${item.code} ${field} is not specific and bilingual.`);
}
for (const id of ["nist_ammt_x16_pdr_2020", "nist_ammt_x16_notes_2020", "nist_ammt_x4_paper_2020"]) assert(sources[id]?.reviewedOn === "2026-08-21" && /^https:\/\//.test(sources[id].url), `RC43 source missing or stale: ${id}`);
assert(Object.keys(sources).length === 264 && cycles.length === 43 && connections.length === 46, "RC43 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 146, "RC43 curated-problem or record counts changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-43-data.js"), `${page} does not load RC43.`);
const publicText = read("research-cycle-43-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추"]) assert(!publicText.includes(phrase), `RC43 contains forbidden mechanical phrasing: ${phrase}`);
console.log("RC43 verified: L0001 deficit 23 and L0002 deficit 0 independently reproduced in 7/7 comparisons per layer; aggregate counts remain distinct from an identity-indexed null ledger.");
