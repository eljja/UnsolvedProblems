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

const precommit = readJson("research/reproducibility/rc40-interval-fault-tree-precommit.json");
assert(precommit.precommitId === "RC40-INTERVAL-FAULT-TREE-V1" && precommit.resultStateAtSeal.includes("No RC40 interval/fault-tree result"), "RC40 preregistration was not sealed before results.");
assert(precommit.hypotheses.length === 5 && precommit.criteria.length === 14 && precommit.intervalModel.grid.cells === 54, "RC40 preregistered scope changed.");
for (const [file, hash] of Object.entries(precommit.codeHashes)) assert(sha(file) === hash, `RC40 frozen artifact changed: ${file}`);

const model = readJson("research/reproducibility/rc40-interval-fault-tree-model-result.json");
const audit = readJson("research/reproducibility/rc40-interval-fault-tree-python-audit.json");
assert(model.qualifies && Object.values(model.criteria).every(Boolean) && Object.keys(model.criteria).length === 14, "RC40 preregistered criteria no longer qualify.");
assert(model.narrowGrid.length === 54 && model.narrowGrid.every(item => item.identifiesExactEventCount === (item.n >= 2 * item.f + item.m + 1)), "RC40 interval quorum grid changed.");
assert(model.radiusSweep.length === 4, "RC40 radius sweep denominator changed.");
for (const item of model.radiusSweep.filter(item => item.radius < 1)) assert(item.identifiesExactEventCount && item.collisionCount === 0, `RC40 sub-spacing radius ${item.radius} changed.`);
for (const item of model.radiusSweep.filter(item => item.radius >= 1)) assert(!item.identifiesExactEventCount && item.collisionCount === 3, `RC40 overlapping radius ${item.radius} changed.`);
assert(model.decisiveCases.threeOneFaultNoMissing.identifiesExactEventCount && model.decisiveCases.threeOneFaultNoMissing.collisionCount === 0, "RC40 n=3,f=1,m=0 case changed.");
assert(!model.decisiveCases.threeOneFaultOneMissing.identifiesExactEventCount && model.decisiveCases.threeOneFaultOneMissing.collisionCount === 18, "RC40 n=3,f=1,m=1 lower bound changed.");
assert(model.decisiveCases.fourOneFaultOneMissing.identifiesExactEventCount && model.decisiveCases.fourOneFaultOneMissing.observationCount === 111, "RC40 n=4,f=1,m=1 result changed.");
assert(model.decisiveCases.oneBroadNoFault.shortestCollision.truths.join("|") === "0|1", "RC40 no-fault interval-overlap counterexample changed.");
assert(model.faultTree.minimalCutSets.length === 7 && model.faultTree.safeguards.length === 8, "RC40 fault-tree denominators changed.");
assert(model.faultTree.minimumSize === 5 && model.faultTree.minimumHittingSets.length === 3 && model.faultTree.inclusionMinimalHittingSets.length === 3, "RC40 minimum safeguard result changed.");
const forced = ["S_PROCESSOR", "S_EPOCH", "S_IDENTITY", "S_CALIBRATION"];
const vetoes = ["W_MECHANICAL", "W_OPTICAL", "W_ENERGY"];
for (const set of model.faultTree.minimumHittingSets) {
  assert(forced.every(id => set.includes(id)), "RC40 minimum safeguard set lost a forced control.");
  assert(vetoes.filter(id => set.includes(id)).length === 1, "RC40 minimum safeguard set must contain exactly one outside veto.");
}
assert(model.vetoCounterexample.truth === 1 && model.vetoCounterexample.naivePluralityVerdict === 0 && model.vetoCounterexample.vetoPolicyVerdict === "inconclusive", "RC40 safe-refusal counterexample changed.");
assert(model.implementationBoundary.actualHardwareInLoop === false && model.implementationBoundary.physicalSensors === 0 && model.implementationBoundary.physicalEventsObserved === 0 && model.implementationBoundary.calibratedIntervals === 0, "RC40 non-physical boundary changed.");
assert(audit.qualifies && audit.passed === 296 && audit.total === 296 && audit.checks.every(item => item.pass), "RC40 independent Python audit incomplete.");

const ledgerSchema = readJson("research/reproducibility/rc40-fault-domain-ledger.schema.json");
for (const field of ["ledgerId", "topEvent", "eventCountSpacing", "witnesses", "basicFaults", "minimalCutSets", "safeguards", "decisionPolicy", "independentAudit"]) assert(ledgerSchema.required.includes(field), `RC40 ledger schema missing required field: ${field}`);

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 38 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-40");
assert(cycle?.problemIds.join("|") === "UP-605|UP-602|UP-315" && cycle.connectionIds.join("|") === "CONN-ATTESTATION-013", "RC40 public scope changed.");
assert(cycle.verifiedFindings.length === 11 && cycle.resultMatrix.rows.length === 10 && cycle.artifacts.length === 5 && cycle.log.length === 10, "RC40 public research record incomplete.");
assert(cycle.nextCycle.text.includes("M1–M7") && cycle.nextCycle.textEn.includes("M1-M7"), "RC40 next-cycle starting point is not exact.");
for (const artifact of cycle.artifacts) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC40 artifact: ${artifact.url}`);
const connection = connections.find(item => item.id === "CONN-ATTESTATION-013");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 250 && connection.failureBoundary.textEn.length > 350, "RC40 structural connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length === 11, `${id}: RC40 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text.length > (field === "role" ? 40 : 170) && record[field].textEn.length > (field === "role" ? 80 : 280), `${id}: RC40 ${field} is not substantive and bilingual.`);
  }
  for (const item of record.hypotheses) for (const field of ["claim", "prediction", "test", "reject"]) assert(item[field].text.length > 20 && item[field].textEn.length > 30, `${id}: RC40 hypothesis ${item.code} ${field} is not specific and bilingual.`);
}
for (const id of ["jcgm_106_2012", "nasa_marzullo_continuous_sensors_1990", "nasa_fault_tree_handbook_2002", "nrc_nureg_cr7007_2010"]) assert(sources[id]?.reviewedOn === "2026-08-20" && /^https:\/\//.test(sources[id].url), `RC40 source missing or stale: ${id}`);
assert(Object.keys(sources).length === 251 && cycles.length === 40 && connections.length === 43, "RC40 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 136, "RC40 curated-problem or record counts changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-40-data.js"), `${page} does not load RC40.`);
const publicText = read("research-cycle-40-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추"]) assert(!publicText.includes(phrase), `RC40 contains forbidden mechanical phrasing: ${phrase}`);
console.log("RC40 verified: 54/54 interval-omission cells, three minimum size-five safeguard sets, and safe-refusal boundaries independently audited 296/296; physical calibration and HIL remain n=0.");
