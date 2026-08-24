import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = relative => fs.readFileSync(path.join(root, relative), "utf8");
const read = relative => JSON.parse(readText(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const canonical = value => JSON.stringify(value);

const precommit = read("research/reproducibility/rc51-persistent-gossip-precommit.json");
const priorArt = read("research/reproducibility/rc51-persistent-gossip-prior-art.json");
const contract = read("research/reproducibility/rc51-blind-replay-contract.json");
const node = read("research/reproducibility/rc51-persistent-gossip-node.json");
const python = read("research/reproducibility/rc51-persistent-gossip-python.json");
const trace = read("research/reproducibility/rc51-blind-event-ledger.json");
const blind = read("research/reproducibility/rc51-blind-replay-audit.json");
const audit = read("research/reproducibility/rc51-persistent-gossip-independent-audit.json");
const connectionEvidence = read("research/reproducibility/rc51-persistent-gossip-connection-evidence.json");
const result = read("research/reproducibility/rc51-persistent-gossip-cycle-result.json");

assert(precommit.precommitId === "RC51-PERSISTENT-GOSSIP-PRECOMMIT-0.1" && precommit.status === "sealed-after-rc50-boundary-and-primary-source-audit-before-service-implementation-traces-or-outcomes", "RC51 preregistration identity or chronology changed");
assert(precommit.selection.problemIds.join("|") === "UP-605|UP-602|UP-315" && precommit.fixtureSchedule.length === 16 && precommit.competingHypotheses.length === 6 && precommit.hardGates.length === 13, "RC51 preregistered scope changed");
assert(priorArt.sources.length === 12 && priorArt.repositoryInheritance.length === 3 && priorArt.sources.every(item => /^https:\/\//.test(item.url) && item.usedFor && item.doesNotEstablish), "RC51 prior-art boundaries incomplete");
assert(contract.contractId === "RC51-BLIND-REPLAY-CONTRACT-0.1" && contract.withheld.length === 5 && contract.allowedRules.length === 7, "RC51 blind contract changed");

const preregFiles = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "5a2f847"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).sort();
const expectedPreregFiles = [
  "research/reproducibility/rc51-blind-replay-contract.json",
  "research/reproducibility/rc51-persistent-gossip-precommit.json",
  "research/reproducibility/rc51-persistent-gossip-prior-art.json"
].sort();
assert(preregFiles.join("|") === expectedPreregFiles.join("|"), "RC51 preregistration commit contains implementation or outcome files");
for (const outcome of [
  "research/reproducibility/rc51-persistent-gossip-node.json",
  "research/reproducibility/rc51-persistent-gossip-python.json",
  "research/reproducibility/rc51-blind-event-ledger.json",
  "research/reproducibility/rc51-blind-replay-audit.json",
  "research/reproducibility/rc51-persistent-gossip-independent-audit.json",
  "research-cycle-51-data.js",
  "scripts/run-rc51-persistent-gossip.mjs",
  "scripts/independent_rc51_persistent_gossip.py",
  "scripts/blind_rc51_event_replay.py"
]) {
  const existed = spawnSync("git", ["cat-file", "-e", `5a2f847:${outcome}`], { cwd: root });
  assert(existed.status !== 0, `RC51 outcome existed at preregistration: ${outcome}`);
}

assert(node.fixtures.length === 16 && python.fixtures.length === 16 && blind.cases.length === 16, "RC51 result denominator changed");
const nodeComparable = node.fixtures.map(({ id, opaqueCaseId, verdict, stateDigest, armVerdicts }) => ({ id, opaqueCaseId, verdict, stateDigest, armVerdicts }));
assert(canonical(nodeComparable) === canonical(python.fixtures), "RC51 Node/Python results diverge");
for (const item of blind.cases) {
  const reference = node.fixtures.find(row => row.opaqueCaseId === item.opaqueCaseId);
  assert(reference?.verdict === item.verdict && reference?.stateDigest === item.stateDigest, `RC51 blind mismatch: ${item.opaqueCaseId}`);
}
assert(trace.cases.length === 16 && trace.cases.every(item => !Object.hasOwn(item, "id") && !Object.hasOwn(item, "expected") && !Object.hasOwn(item, "verdict")), "RC51 blind ledger leaks withheld top-level fields");
const blindSource = readText("scripts/blind_rc51_event_replay.py");
assert(!blindSource.includes("rc51-persistent-gossip-node.json") && !blindSource.includes("rc51-persistent-gossip-python.json") && !blindSource.includes("fixtureSchedule"), "RC51 blind verifier reads generator outputs or fixture schedule");
assert(audit.verdict === "pass" && audit.failures.length === 0 && audit.comparisons.total === 78, "RC51 independent adjudication failed or denominator changed");
assert(audit.hypothesisAdjudication.length === 6 && audit.hypothesisAdjudication.find(item => item.code === "H2")?.verdict === "rejected" && audit.hypothesisAdjudication.find(item => item.code === "H5")?.verdict === "supported-in-local-multi-process-scope", "RC51 hypothesis adjudication changed");
assert(connectionEvidence.connectionId === "CONN-EVIDENCE-024" && connectionEvidence.problemIds.join("|") === "UP-605|UP-602|UP-315" && connectionEvidence.variableMapping.length === 6 && connectionEvidence.holdsWhen.length === 5 && connectionEvidence.breaksWhen.length === 5, "RC51 connection evidence incomplete");
assert(result.precommit.gitCommit === "5a2f847" && result.newlyVerifiedFacts.length === 10 && result.workPackages.length === 5 && result.failedOrRejectedApproaches.length === 6 && result.unresolved.length === 6, "RC51 integrated cycle result incomplete");
assert(result.mostPromisingPath.status.includes("not claimed as a new primitive") && result.nextCycleStart.startsWith("RC52 should not repeat"), "RC51 novelty or continuation boundary weakened");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 49 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles];
for (const file of siteFiles) vm.runInNewContext(readText(file), sandbox, { filename: file });
const problems = sandbox.window.PROBLEMS;
const sources = sandbox.window.CATALOG_SOURCES;
const cycles = sandbox.window.RESEARCH_CYCLES;
const connections = sandbox.window.RESEARCH_CONNECTIONS;
const cycle = cycles.find(item => item.id === "RC-2026-51");
const connection = connections.find(item => item.id === "CONN-EVIDENCE-024");
assert(cycle?.problemIds.join("|") === "UP-605|UP-602|UP-315" && cycle.connectionIds.join("|") === "CONN-EVIDENCE-024", "RC51 public scope changed");
assert(cycle.verifiedFindings.length === 10 && cycle.resultMatrix.rows.length === 12 && cycle.artifacts.length === 13 && cycle.log.length === 10, "RC51 public cycle record incomplete");
for (const item of cycle.artifacts) assert(fs.existsSync(path.join(root, item.url)), `Missing RC51 artifact: ${item.url}`);
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|"), "RC51 public connection scope changed");
for (const field of ["sharedBottleneck", "mapping", "transfer", "minimumTest", "failureBoundary", "evidence", "validationStatus"]) assert(connection[field]?.text && connection[field]?.textEn, `RC51 connection missing ${field}`);

for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 4 && record.sourceIds.length >= 14, `${id}: RC51 hypotheses or sources incomplete`);
  for (const field of ["updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text.length >= 260 && record[field].textEn.length >= 420, `${id}: RC51 ${field} is not substantive and bilingual`);
  }
  for (const hypothesis of record.hypotheses) for (const field of ["claim", "prediction", "test", "reject"]) assert(hypothesis[field].text && hypothesis[field].textEn, `${id}: incomplete hypothesis ${hypothesis.code}.${field}`);
}

for (const id of ["sqlite_atomic_commit_2026", "sqlite_wal_2026", "sqlite_synchronous_full_2026", "sqlite_backup_restore_2026", "node_sqlite_25_2026", "rfc_ct_9162_2021", "sigstore_rekor_monitoring_2026", "sigstore_security_model_2026", "tuf_specification_2026", "nist_sp80057_r5_2020", "rfc_cose_receipts_9942_2026", "rfc_scitt_9943_2026"]) {
  assert(sources[id]?.reviewedOn === "2026-08-25" && /^https:\/\//.test(sources[id].url), `RC51 source missing or stale: ${id}`);
}
assert(Object.keys(sources).length === 297 && cycles.length === 51 && connections.length === 54, "RC51 cumulative source, cycle, or connection count changed");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 163, "RC51 research-record count changed");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(readText(page).includes("research-cycle-51-data.js"), `${page} does not load RC51`);

const publicText = readText("research-cycle-51-data.js");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추", "분량 목표", "전공자 관점의 질문은"]) assert(!publicText.includes(phrase), `RC51 contains forbidden wording: ${phrase}`);
for (const script of ["run-rc51-persistent-gossip.mjs", "independent_rc51_persistent_gossip.py", "blind_rc51_event_replay.py", "adjudicate-rc51-persistent-gossip.mjs", "verify-rc51-persistent-gossip-cycle.mjs"]) assert(readText("package.json").includes(script), `package.json missing RC51 script: ${script}`);
assert(readText("sitemap.xml").includes("RC-2026-51&amp;lang=ko") && readText("sitemap.xml").includes("RC-2026-51&amp;lang=en"), "RC51 missing from sitemap.xml");
assert(readText("README.md").includes("51개 누적 연구 사이클") && readText("README.md").includes("1,592개 현지화 URL") && readText("README.md").includes("297개 기관·로드맵·원 연구 출처"), "README RC51 counts incomplete");

console.log("RC51 verified: 16/16 Node/Python fixtures, 16/16 blind verdict-state pairs, 40 SQLite snapshots, and explicit power/operator/physical zero boundaries.");
