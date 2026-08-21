import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const readJson = relative => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const precommit = readJson("research/reproducibility/rc46-toolpath-twin-precommit.json");
assert(precommit.cycleId === "RC-2026-46" && precommit.problems.join("|") === "UP-605|UP-315", "RC46 scope changed.");
assert(precommit.candidateSet.target === "L0001" && precommit.fixedFingerprints.ordinalProfile.bins === 1024 && precommit.fixedFingerprints.localCorrespondence.bins === 4096, "RC46 target or bins changed.");
assert(precommit.rankingAndGate.hardEligibility.length === 6 && precommit.candidateSet.dataAllowedForRanking.startsWith("Only each candidate's complete XYPT"), "RC46 gates or pixel boundary changed.");

for (let index = 1; index <= 5; index += 1) {
  const amendment = readJson(`research/reproducibility/rc46-toolpath-twin-amendment-${String(index).padStart(2, "0")}.json`);
  assert(amendment.cycleId === "RC-2026-46", `RC46 amendment ${index} changed cycle.`);
}
const numericAmendment = readJson("research/reproducibility/rc46-toolpath-twin-amendment-05.json");
assert(numericAmendment.observedBeforeChange.maximumSpatialHellingerDifference > 0.0034 && numericAmendment.clarification.includes("1e-12"), "RC46 numeric discrepancy is not preserved.");

const acquisition = readJson("research/reproducibility/rc46-xypt-acquisition.json");
assert(acquisition.observed.bytes === 159164372 && acquisition.observed.sha256 === "7b2b863c843aeabe19f308a5886d57ae241cd386f38c95a7e7ce01e9bc34d007", "RC46 archive identity changed.");
assert(acquisition.observed.centralDirectorySha256 === "0967318be4ea6413c605bf0ca55e810952a280b07b11407262a2a73b69b92a5d" && acquisition.observed.entryCount === 25, "RC46 central directory changed.");
assert(acquisition.provenance.publisherUrl === acquisition.provenance.retrievalUrl && acquisition.transfer.conservativeCrossProcessUpperBoundBytes === 260000000, "RC46 official provenance or budget changed.");

const nodeFirst = readJson("research/reproducibility/rc46-toolpath-twin-node-first-run.json");
const pythonFirst = readJson("research/reproducibility/rc46-toolpath-twin-python-first-run.json");
assert(nodeFirst.adjudication.passingLayers.length === 0 && pythonFirst.adjudication.passingLayers.length === 0 && nodeFirst.adjudication.topRankedLayer === 13 && pythonFirst.adjudication.topRankedLayer === 13, "RC46 first-run common decision changed.");
const firstNodeL2 = nodeFirst.candidates.find(row => row.layer === 2);
const firstPythonL2 = pythonFirst.candidates.find(row => row.layer === 2);
assert(Math.abs(firstNodeL2.metrics.allHellinger - firstPythonL2.metrics.allHellinger) > 0.0033, "RC46 first-run grid discrepancy disappeared from history.");

const node = readJson("research/reproducibility/rc46-toolpath-twin-node.json");
const python = readJson("research/reproducibility/rc46-toolpath-twin-python.json");
for (const result of [node, python]) {
  assert(result.input.sha256 === acquisition.observed.sha256 && result.input.memberCount === 25, "RC46 model input identity changed.");
  assert(result.target.counts.totalRows === 1658275 && result.target.counts.cameraRows === 94736, "RC46 L0001 target changed.");
  assert(result.candidates.length === 24 && result.candidates.every(row => !row.eligible), "RC46 candidate was added, removed, or promoted.");
  assert(result.ranking[0].layer === 13 && result.ranking[1].layer === 25, "RC46 ranking changed.");
}
let maximumDifference = 0;
function compare(a, b, trail) {
  if (typeof a === "number" && typeof b === "number") {
    const difference = Math.abs(a - b); maximumDifference = Math.max(maximumDifference, difference);
    assert(difference <= 1e-9, `${trail}: RC46 implementations differ by ${difference}.`); return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    assert(a.length === b.length, `${trail}: array lengths differ.`);
    for (let index = 0; index < a.length; index += 1) compare(a[index], b[index], `${trail}[${index}]`);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => !["createdOn", "implementation", "resultId"].includes(key));
    for (const key of keys) { assert(key in a && key in b, `${trail}.${key}: field missing.`); compare(a[key], b[key], `${trail}.${key}`); }
    return;
  }
  assert(a === b, `${trail}: RC46 implementations disagree.`);
}
for (const key of ["input", "target", "candidates", "ranking", "adjudication"]) compare(node[key], python[key], key);
assert(maximumDifference < 3.3e-13, "RC46 final numeric agreement weakened.");

const top = node.candidates.find(row => row.layer === 13);
const countNearest = node.candidates.find(row => row.layer === 2);
assert(top.score === node.candidates.find(row => row.layer === 25).score && top.metrics.localMatchFraction === 0.1357421875, "RC46 top-candidate evidence changed.");
assert(!top.gates.count && !top.gates.direction && !top.gates.local && countNearest.metrics.localMatchFraction === 0 && countNearest.metrics.directionHellinger > 0.999999999, "RC46 decisive failures changed.");
for (const pair of [[8, 20], [10, 22], [12, 24], [13, 25]]) {
  const [first, second] = pair.map(layer => node.candidates.find(row => row.layer === layer));
  assert(first.member.sha256 === second.member.sha256, `RC46 duplicate pair ${pair.join("/")} changed.`);
}

const adjudication = readJson("research/reproducibility/rc46-toolpath-twin-adjudication.json");
assert(adjudication.implementationAgreement.pass && adjudication.implementationAgreement.candidateCount === 24 && adjudication.decision.passingLayers.length === 0, "RC46 adjudication changed.");
assert(adjudication.decision.topRankedLayer === 13 && !adjudication.decision.releaseCandidateAviThisCycle && adjudication.decision.naturalL0001PixelBytes === 0, "RC46 release boundary changed.");
const connectionEvidence = readJson("research/reproducibility/rc46-toolpath-connection-evidence.json");
assert(connectionEvidence.connectionId === "CONN-EVIDENCE-019" && connectionEvidence.status.includes("next-cycle proposal"), "RC46 structural connection overclaims validation.");
const integrated = readJson("research/reproducibility/rc46-x16-cycle-result.json");
assert(integrated.status === "first-25-layer-command-twin-rejected-natural-holdout-sealed" && integrated.hypotheses.T1_atLeastOneEligibleTwin === "rejected", "RC46 integrated verdict changed.");

const cacheRoot = path.join(root, ".cache", "rc46-x16");
if (fs.existsSync(cacheRoot)) {
  const cacheFiles = fs.readdirSync(cacheRoot, { recursive: true }).map(value => String(value).toLowerCase());
  assert(!cacheFiles.some(value => value.endsWith(".avi") || value.endsWith(".tif") || value.endsWith(".tiff")), "RC46 cache contains prohibited image data.");
}

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 44 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-46");
assert(cycle?.problemIds.join("|") === "UP-605|UP-315" && cycle.connectionIds.join("|") === "CONN-EVIDENCE-019", "RC46 public scope changed.");
assert(cycle.verifiedFindings.length === 8 && cycle.resultMatrix.rows.length === 8 && cycle.artifacts.length === 15 && cycle.log.length === 10, "RC46 public record incomplete.");
for (const item of cycle.artifacts) assert(fs.existsSync(path.join(root, item.url)), `Missing RC46 artifact: ${item.url}`);
const connection = connections.find(item => item.id === "CONN-EVIDENCE-019");
assert(connection?.strength === "moderate" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 250, "RC46 connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record.sourceIds.length === 10, `${id}: RC46 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text.length > (field === "role" ? 45 : 280) && record[field].textEn.length > (field === "role" ? 80 : 520), `${id}: RC46 ${field} is not substantive and bilingual.`);
  }
}
for (const id of ["wang_interlayer_morphology_2023", "mao_physics_guided_melt_pool_2024", "nist_melting_map_2025"]) assert(sources[id]?.reviewedOn === "2026-08-22" && /^https:\/\//.test(sources[id].url), `RC46 source missing: ${id}`);
assert(Object.keys(sources).length === 273 && cycles.length === 46 && connections.length === 49, "RC46 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 152, "RC46 research record count changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).includes("research-cycle-46-data.js"), `${page} does not load RC46.`);
const publicText = read("research-cycle-46-data.js");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추"]) assert(!publicText.includes(phrase), `RC46 contains forbidden wording: ${phrase}`);
console.log("RC46 verified: zero of 24 command twins pass; independent agreement keeps all candidate images and L0001 sealed.");
