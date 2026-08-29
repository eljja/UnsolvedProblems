import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = relative => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));

const contract = read("research/reproducibility/rc60-preflight-contract.json");
const fixtures = read("research/reproducibility/rc60-preflight-fixtures.json");
const nodeResult = read("research/reproducibility/rc60-preflight-node.json");
const pythonResult = read("research/reproducibility/rc60-preflight-python.json");
const audit = read("research/reproducibility/rc60-preflight-independent-audit.json");
const priorArt = read("research/reproducibility/rc60-preflight-prior-art-boundary.json");
const connectionEvidence = read("research/reproducibility/rc60-gate-connection-evidence.json");
const result = read("research/reproducibility/rc60-preflight-cycle-result.json");

assert(contract.gateOrder.length === 14, "RC60 must freeze fourteen ordered gates");
assert(contract.canonicalizationProfile.fullRfc8785ConformanceClaimed === false, "RC60 must not overclaim full RFC 8785 conformance");
assert(contract.receiptSemantics.syntheticPass === "synthetic-pass-no-physical-authorization", "Synthetic pass boundary changed");
assert(fixtures.cases.length === 18 && fixtures.cases[0].id === "SYNTHETIC-VALID", "RC60 fixture inventory changed");
assert(fixtures.claimBoundary.includes("artificial software fixtures"), "Synthetic fixtures must be explicitly labelled");
assert(nodeResult.fixtureSpecHashSha256 === pythonResult.fixtureSpecHashSha256, "Node and Python fixture hashes disagree");
assert(nodeResult.contractHashSha256 === pythonResult.contractHashSha256, "Node and Python contract hashes disagree");
assert(nodeResult.cases.length === 18 && pythonResult.cases.length === 18, "Both implementations must emit eighteen receipts");
for (const fixtureCase of fixtures.cases) {
  const nodeReceipt = nodeResult.cases.find(item => item.caseId === fixtureCase.id);
  const pythonReceipt = pythonResult.cases.find(item => item.caseId === fixtureCase.id);
  assert(JSON.stringify(nodeReceipt) === JSON.stringify(pythonReceipt), `${fixtureCase.id} receipt differs across implementations`);
  assert(nodeReceipt?.firstFailedGate === fixtureCase.expectedFirstFailedGate, `${fixtureCase.id} first failure changed`);
  assert(nodeReceipt?.physicalAuthorization === false, `${fixtureCase.id} must not authorize physical work`);
}
assert(audit.exactAgreementCases === 18 && audit.totalCases === 18, "Independent audit agreement count changed");
assert(audit.decisiveResults.adversarialCasesRefused === 17, "RC60 must refuse all seventeen non-valid cases");
assert(audit.decisiveResults.multiFaultFirstFailure === "G05-RESOURCE-READINESS", "Compound fault order changed");
assert(audit.decisiveResults.rc59PlanningFirstFailure === "G02-FROZEN-DOMAIN", "RC59 planning refusal changed");
assert(audit.decisiveResults.physicalAuthorizations === 0, "RC60 must emit zero physical authorizations");
assert(priorArt.noveltyClaim.startsWith("No claim of methodological novelty"), "RC60 prior-art boundary must avoid a novelty claim");
assert(connectionEvidence.connectionId === "CONN-EVIDENCE-033" && connectionEvidence.variableMapping.length === 4, "RC60 connection evidence is incomplete");
assert(result.status === "complete-software-refusal-order-confirmed-physical-evidence-not-started", "RC60 result status changed");
assert(result.hypotheses["H60-2"].verdict === "rejected" && result.hypotheses["H60-3"].verdict === "rejected-by-design", "RC60 rejected hypotheses changed");
assert(result.nextCycleStart.includes("real, outcome-blind chemistry-build"), "RC60 exact next start is missing");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 58 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox, { filename: file });
}
const cycle = sandbox.window.RESEARCH_CYCLES.find(item => item.id === "RC-2026-60");
const connection = sandbox.window.RESEARCH_CONNECTIONS.find(item => item.id === "CONN-EVIDENCE-033");
assert(sandbox.window.RESEARCH_CYCLES.length === 60, "Site must expose 60 research cycles");
assert(sandbox.window.RESEARCH_CONNECTIONS.length === 63, "Site must expose 63 structural connections");
assert(Object.keys(sandbox.window.CATALOG_SOURCES).length === 343, "Site must retain 343 catalog sources without duplicating reviewed standards");
assert(sandbox.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 194, "Site must expose 194 problem-cycle records");
assert(cycle?.problemIds.join(",") === "UP-219,UP-233,UP-234,UP-572", "RC60 problem mapping changed");
assert(cycle?.verifiedFindings.length === 7 && cycle?.artifacts.length === 8, "RC60 public record is incomplete");
assert(connection?.problemIds.join(",") === cycle?.problemIds.join(","), "RC60 connection mapping changed");
for (const problemId of cycle?.problemIds || []) {
  const problem = sandbox.window.PROBLEMS.find(item => item.id === problemId);
  const record = problem?.cycleResearch;
  assert(record?.cycleId === "RC-2026-60", `${problemId} must show RC60 as current research`);
  assert(record?.updatedDefinition?.text?.length > 220 && record?.updatedDefinition?.textEn?.length > 300, `${problemId} needs a substantive bilingual definition`);
  assert(record?.causalChain?.length === 5 && record.causalChain.every(item => item.title?.text && item.claim?.text && item.failure?.text && item.title?.textEn && item.claim?.textEn && item.failure?.textEn), `${problemId} needs five complete bilingual causal links`);
  assert(record?.hypotheses?.length === 3 && new Set(record.hypotheses.map(item => item.code)).size === 3, `${problemId} needs three distinct hypotheses`);
  assert(record?.workPackages?.length === 3 && record.workPackages.every(item => item.objective?.text && item.method?.text && item.deliverable?.text && item.gate?.text), `${problemId} needs three executable work packages`);
  assert(record?.uncertaintyBudget?.length === 4, `${problemId} needs four uncertainty entries`);
  assert(record?.decisionTree?.length === 3 && record.decisionTree.every(item => item.condition?.text && item.action?.text && item.meaning?.text), `${problemId} needs three adjudicable decision branches`);
}

for (const page of ["index.html", "solve.html", "research-log.html"]) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  assert(html.includes("research-cycle-60-data.js?v=20260829-cycle60"), `${page} must load RC60 data`);
}
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
assert(readme.includes("61개 누적 연구 사이클"), "README cycle count must include RC61");
assert(readme.includes("197개 사이클 기록"), "README record count must include RC61");
assert(readme.includes("64개 구조적 연결"), "README connection count must include RC61");
assert(readme.includes("351개 기관·로드맵·원 연구 출처"), "README source count must include RC61");
assert(readme.includes("1,612개 현지화 URL"), "README sitemap count must be 1,612");
const publicCopy = fs.readFileSync(path.join(ROOT, "research-cycle-60-data.js"), "utf8");
for (const prohibited of ["전공자 포인트", "1단계 · 처음 읽는 사람", "2단계 · 전공자 핵심", "개수를 맞추지", "아래 시도는 개별 논문", "immutable receipt"]) {
  assert(!publicCopy.includes(prohibited), `RC60 public copy contains prohibited phrase: ${prohibited}`);
}
const packageJson = read("package.json");
assert(packageJson.scripts.pretest?.includes("verify-rc60-preflight-cycle.mjs"), "RC60 verifier is not in the default test path");
const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
assert(sitemap.includes("cycle=RC-2026-60&amp;lang=ko") && sitemap.includes("cycle=RC-2026-60&amp;lang=en"), "Sitemap missing RC60 localized URLs");

if (failures.length) {
  console.error(`RC60 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC60 verified: 18/18 exact receipts, 17 refusals, RC59 plan stops at G02, physical authorizations 0.");
