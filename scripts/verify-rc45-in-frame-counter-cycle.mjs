import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const readJson = relative => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const precommit = readJson("research/reproducibility/rc45-in-frame-counter-precommit.json");
assert(precommit.cycleId === "RC-2026-45" && precommit.problems.join("|") === "UP-605|UP-315", "RC45 preregistered scope changed.");
assert(precommit.fixedDevelopmentProcedure.spatialCandidates.length === 4 && precommit.fixedDevelopmentProcedure.valueCandidates.includes("24 prespecified series"), "RC45 candidate search changed.");
assert(precommit.developmentGate.counterPositive.length === 4 && precommit.resourceBudget.L0001MaximumNistResponseBodyBytes === 200000000, "RC45 release gate or budget changed.");

const python = readJson("research/reproducibility/rc45-x16-layer-0002-python-counter.json");
const javascript = readJson("research/reproducibility/rc45-x16-layer-0002-javascript-counter.json");
for (const result of [python, javascript]) {
  assert(result.frameCount === 95504 && result.boundaryRecordBytesPerFrame === 48 && result.candidates.length === 24, "RC45 frame or candidate count changed.");
  assert(result.rawBoundaryRecordSha256 === "3f44e7d04842b0c10af4791a68ba9d109e17ce9ea885483249a628d203176e14", "RC45 boundary bytes changed.");
  assert(result.candidates.every(item => item.unitStepCount === 0 && !item.exactUnitProgression), "RC45 unexpectedly contains a unit-step counter candidate.");
  assert(Math.max(...result.candidates.map(item => item.uniqueValueCount)) === 80, "RC45 maximum unique-value count changed.");
  assert(result.passingCandidates.length === 0 && !result.gatePassedLocally, "RC45 failed candidate was promoted.");
}
const comparable = value => JSON.stringify({ frameCount: value.frameCount, boundaryRecordBytesPerFrame: value.boundaryRecordBytesPerFrame, rawBoundaryRecordSha256: value.rawBoundaryRecordSha256, candidates: value.candidates, passingCandidates: value.passingCandidates, gatePassedLocally: value.gatePassedLocally });
assert(comparable(python) === comparable(javascript), "RC45 independent parsers disagree.");

const release = readJson("research/reproducibility/rc45-development-release.json");
assert(release.exactIndependentAgreement && !release.syntheticGatePassed && !release.holdoutReleased && release.decision === "stop-before-l0001-acquisition", "RC45 L0001 release decision changed.");
assert(!fs.existsSync(path.join(root, ".cache", "rc44-x16", "l0001")) && !fs.existsSync(path.join(root, ".cache", "rc45-x16", "l0001")), "L0001 cache exists despite RC45 non-release.");
const connectionEvidence = readJson("research/reproducibility/rc45-counter-connection-evidence.json");
assert(connectionEvidence.connectionId === "CONN-EVIDENCE-018" && connectionEvidence.variableMapping["modulo counter difference minus one"], "RC45 connection evidence incomplete.");
const integrated = readJson("research/reproducibility/rc45-x16-cycle-result.json");
assert(integrated.status === "direct-counter-rejected-natural-holdout-not-released" && integrated.hypotheses.C1_exactCounterPreserved.startsWith("rejected"), "RC45 integrated verdict changed.");

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 43 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-45");
assert(cycle?.problemIds.join("|") === "UP-605|UP-315" && cycle.connectionIds.join("|") === "CONN-EVIDENCE-018", "RC45 public scope changed.");
assert(cycle.verifiedFindings.length === 7 && cycle.resultMatrix.rows.length === 6 && cycle.artifacts.length === 10 && cycle.log.length === 8, "RC45 public record incomplete.");
for (const item of cycle.artifacts) assert(fs.existsSync(path.join(root, item.url)), `Missing RC45 artifact: ${item.url}`);
const connection = connections.find(item => item.id === "CONN-EVIDENCE-018");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 250, "RC45 connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record.sourceIds.length === 6, `${id}: RC45 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text.length > (field === "role" ? 45 : 230) && record[field].textEn.length > (field === "role" ? 80 : 360), `${id}: RC45 ${field} is not substantive and bilingual.`);
  }
}
for (const id of ["mikrotron_eosens_3cl_reference_2020", "mikrotron_eosens_3cl_manual_2010"]) assert(sources[id]?.reviewedOn === "2026-08-21" && /^https:\/\//.test(sources[id].url), `RC45 source missing: ${id}`);
assert(Object.keys(sources).length === 270 && cycles.length === 45 && connections.length === 48, "RC45 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 150, "RC45 research record count changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).includes("research-cycle-45-data.js"), `${page} does not load RC45.`);
const publicText = read("research-cycle-45-data.js");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추"]) assert(!publicText.includes(phrase), `RC45 contains forbidden wording: ${phrase}`);
console.log("RC45 verified: all 24 direct-counter candidates have 0/95,503 unit steps; independent agreement keeps L0001 sealed.");
