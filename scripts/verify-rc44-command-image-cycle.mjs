import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const readJson = relative => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const precommit = readJson("research/reproducibility/rc44-command-image-alignment-precommit.json");
assert(precommit.cycleId === "RC-2026-44" && precommit.problems.join("|") === "UP-605|UP-315", "RC44 preregistered scope changed.");
assert(precommit.fixedSyntheticSuite.gate.length === 5 && precommit.naturalHoldoutSuccessAndLimits.stop.includes("synthetic gate fails"), "RC44 gate or stop rule incomplete.");
for (const amendment of [1, 2, 3]) assert(readJson(`research/reproducibility/rc44-amendment-0${amendment}.json`).cycleId === "RC-2026-44", `RC44 amendment ${amendment} missing.`);

const acquisition = readJson("research/reproducibility/rc44-x16-layer-0002-acquisition.json");
assert(acquisition.layer === 2 && acquisition.role === "development" && acquisition.transfer.thisAcquisitionBytes === 176308267, "RC44 acquisition receipt changed.");
assert(acquisition.xypt.extracted.sha256 === "576d1e19cc4aee87ab60dcde4376ce21faa3c42342a9a7653d9bf5af4a3a1c7c", "RC44 XYPT hash changed.");
assert(acquisition.avi.extracted.crc32 === "e85e3962" && acquisition.avi.extracted.bytes === 172605872, "RC44 AVI size or CRC changed.");

const python = readJson("research/reproducibility/rc44-x16-layer-0002-python-development-v02.json");
const trials = readJson("research/reproducibility/rc44-x16-layer-0002-python-trials-v02.json");
assert(python.resultId.endsWith("0.2") && python.features.train === 57302 && python.features.validation === 19101 && python.features.test === 19101, "RC44 split changed.");
assert(python.syntheticTest.totals.truth === 1232 && python.syntheticTest.totals.recoveredWithinOne === 105 && python.syntheticTest.totals.falseDiscoveries === 1127, "RC44 aggregate deletion result changed.");
assert(!python.gate.passed && python.holdoutDecision === "stop-before-l0001-pixel-acquisition", "RC44 failed gate was promoted.");
assert(trials.test.length === 176 && trials.test.every(item => Array.isArray(item.truthSlots) && Array.isArray(item.calledSlots)), "RC44 corrected trial ledger incomplete.");
const totals = trials.test.reduce((sum, item) => {
  for (const key of Object.keys(sum)) sum[key] += item[key];
  return sum;
}, { truth: 0, calls: 0, recoveredWithinOne: 0, falseDiscoveries: 0 });
assert(JSON.stringify(totals) === JSON.stringify(python.syntheticTest.totals), "RC44 trial and aggregate metrics disagree.");
const singles = trials.test.filter(item => item.case === "test-single");
assert(singles.length === 128 && singles.reduce((sum, item) => sum + item.recoveredWithinOne, 0) === 1, "RC44 Python singleton result changed.");

const independent = readJson("research/reproducibility/rc44-x16-layer-0002-independent-js-audit-v02.json");
assert(independent.singleton.recoveredWithinOne === 1 && independent.comparisonToPython.sameTruthSchedule, "RC44 independent truth or singleton result changed.");
assert(!independent.comparisonToPython.sameCalledSlots && independent.logicalGateBound.maximumOverallRecallIfEveryOtherCasePerfect < 0.95, "RC44 instability or logical bound changed.");
const sameCalls = independent.trials.reduce((sum, item, index) => sum + Number(item.call === singles[index].calledSlots[0]), 0);
assert(sameCalls === 9 && independent.verdict === "independently-confirms-primary-gate-cannot-pass", "RC44 independent called-slot comparison changed.");

const release = readJson("research/reproducibility/rc44-development-release.json");
assert(!release.syntheticGatePassed && !release.holdoutReleased && release.evidence.maximumOverallRecallIfEveryOtherDeletionWereRecovered < 0.95, "RC44 L0001 was improperly released.");
assert(!fs.existsSync(path.join(root, ".cache", "rc44-x16", "l0001")), "RC44 L0001 cache exists despite non-release.");
const nonlinear = readJson("research/reproducibility/rc44-x16-layer-0002-nonlinear-diagnostic.json");
assert(nonlinear.status.startsWith("exploratory") && nonlinear.single.totals.recoveredWithinOne === 11 && nonlinear.dispersed23.totals.recoveredWithinOne === 45, "RC44 post-gate diagnostic changed.");
const integrated = readJson("research/reproducibility/rc44-x16-cycle-result.json");
assert(integrated.status === "synthetic-gate-failed-natural-holdout-not-released" && integrated.hypotheses.N0_weakOrNonstationaryBridge === "supported", "RC44 integrated verdict changed.");

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 42 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-44");
assert(cycle?.problemIds.join("|") === "UP-605|UP-315" && cycle.connectionIds.join("|") === "CONN-EVIDENCE-017", "RC44 public scope changed.");
assert(cycle.verifiedFindings.length === 8 && cycle.resultMatrix.rows.length === 7 && cycle.artifacts.length === 12 && cycle.log.length === 10, "RC44 public record incomplete.");
for (const item of cycle.artifacts) assert(fs.existsSync(path.join(root, item.url)), `Missing RC44 artifact: ${item.url}`);
const connection = connections.find(item => item.id === "CONN-EVIDENCE-017");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 300, "RC44 connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record.sourceIds.length === 7, `${id}: RC44 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text.length > (field === "role" ? 45 : 250) && record[field].textEn.length > (field === "role" ? 80 : 380), `${id}: RC44 ${field} is not substantive and bilingual.`);
  }
}
for (const id of ["nist_mpm_registration_2020", "nist_spatiotemporal_mpm_2022", "nist_mpm_features_2022", "neurips_drop_dtw_2021"]) assert(sources[id]?.reviewedOn === "2026-08-21" && /^https:\/\//.test(sources[id].url), `RC44 source missing: ${id}`);
assert(Object.keys(sources).length === 268 && cycles.length === 44 && connections.length === 47, "RC44 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 148, "RC44 research record count changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).includes("research-cycle-44-data.js"), `${page} does not load RC44.`);
const publicText = read("research-cycle-44-data.js");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추"]) assert(!publicText.includes(phrase), `RC44 contains forbidden wording: ${phrase}`);
console.log("RC44 verified: the 8x8 command-image bridge fails at 105/1232 recovery and 91.48% FDR; independent singleton failure keeps L0001 sealed.");
