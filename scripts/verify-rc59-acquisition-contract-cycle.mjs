import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));

const schema = read("research/reproducibility/rc59-acquisition-manifest.schema.json");
const python = read("research/reproducibility/rc59-48-cell-manifest-python.json");
const node = read("research/reproducibility/rc59-48-cell-manifest-node.json");
const metrology = read("research/reproducibility/rc59-metrology-intervention-contract.json");
const expansion = read("research/reproducibility/rc59-expansion-repeatability-contract.json");
const audit = read("research/reproducibility/rc59-acquisition-contract-independent-audit.json");
const priorArt = read("research/reproducibility/rc59-intervention-expansion-prior-art.json");
const connectionEvidence = read("research/reproducibility/rc59-physical-randomization-connection-evidence.json");
const result = read("research/reproducibility/rc59-acquisition-contract-cycle-result.json");

assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "RC59 schema must use JSON Schema 2020-12");
assert(schema.properties.specimens.minItems === 48 && schema.properties.specimens.maxItems === 48, "RC59 schema must require 48 specimens");
assert(schema.properties.approvals.properties.allSignedBeforePhysicalUse.type === "boolean", "RC59 schema must require a physical-use approval state");
assert(python.randomization.allocationHashSha256 === "E03D97B2F4EA042E6D4023A3E5595A224DF59DD83636048AA953A8CEACEF1540", "RC59 allocation hash changed");
assert(python.randomization.allocationHashSha256 === node.randomization.allocationHashSha256, "Python and Node allocation hashes disagree");
assert(JSON.stringify(python.allocation) === JSON.stringify(node.allocation), "Python and Node allocation records disagree");
assert(python.allocation.length === 48 && new Set(python.allocation.map((row) => row.channelId)).size === 48, "RC59 requires 48 cells on 48 unique channels");

const containment = Object.fromEntries(python.failureContainment.map((item) => [item.field, item]));
assert(containment.chamberId.usableAfterWorstSingleDomainLoss === 24 && containment.chamberId.sealedBranch === "25-cycle", "Chamber-loss fallback changed");
assert(containment.fixtureGroupId.usableAfterWorstSingleDomainLoss === 36 && containment.fixtureGroupId.sealedBranch === "50-cycle", "Fixture-loss containment changed");
assert(containment.startWave.usableAfterWorstSingleDomainLoss === 40, "Wave-loss containment changed");
assert(containment.manufacturingBlockId.usableAfterWorstSingleDomainLoss === 44, "Block-loss containment changed");
assert(containment["chamberId+fixtureGroupId"].usableAfterWorstSingleDomainLoss === 42, "Intersection-loss containment changed");

assert(metrology.metricRegistry.length === 4, "RC59 requires four co-primary equivalence metrics");
assert(metrology.metricRegistry.every((metric) => metric.equivalenceMarginM === null && metric.status === "blocked"), "Unsupported numeric margins must remain absent");
assert(metrology.acuteSentinel.forbiddenConclusion.includes("not evidence"), "RC59 must forbid acute-null-to-lifetime-equivalence promotion");
assert(expansion.twoLayerStudy.stableArtifactLayer.objects.includes("Twelve stable inert"), "RC59 needs a stable-artifact layer");
assert(expansion.twoLayerStudy.sacrificialCellLayer.objects.includes("Twelve disjoint"), "RC59 needs a disjoint live-cell layer");
assert(expansion.pressureGate.publishedBenchmark.includes("comparison points only"), "Published pressure performance must not become an automatic margin");
assert(audit.status === "pass-computational-contract-physical-work-blocked" && audit.outcomeValuesUsed === 0, "RC59 independent verdict changed");
assert(priorArt.status === "prior-art-bounded-no-novelty-claim", "RC59 must not assert unsupported novelty");
assert(connectionEvidence.validationStatus.includes("No physical resource"), "RC59 connection must preserve physical limits");
assert(result.status === "complete-software-contract-positive-physical-evidence-not-started", "RC59 cycle result status changed");
assert(result.hypotheses["H59-0"].verdict === "supported-in-software", "RC59 randomization hypothesis changed");
assert(result.hypotheses["H59-2"].verdict === "not-yet-identifiable", "RC59 margin hypothesis changed");
assert(result.hypotheses["H59-3"].verdict === "protocol-ready-evidence-untested", "RC59 expansion hypothesis changed");

const sandbox = { window: {} };
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 57 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), "utf8"), sandbox, { filename: file });
}
const cycle = sandbox.window.RESEARCH_CYCLES.find((item) => item.id === "RC-2026-59");
const connection = sandbox.window.RESEARCH_CONNECTIONS.find((item) => item.id === "CONN-EVIDENCE-032");
assert(sandbox.window.RESEARCH_CYCLES.length === 59, "Site must expose 59 research cycles");
assert(sandbox.window.RESEARCH_CONNECTIONS.length === 62, "Site must expose 62 structural connections");
assert(Object.keys(sandbox.window.CATALOG_SOURCES).length === 343, "Site must expose 343 catalog sources");
assert(sandbox.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 190, "Site must expose 190 problem-cycle records");
assert(cycle?.problemIds.join(",") === "UP-219,UP-233,UP-234,UP-572", "RC59 problem mapping changed");
assert(cycle?.verifiedFindings.length === 10 && cycle?.artifacts.length === 11, "RC59 public record is incomplete");
assert(connection?.problemIds.join(",") === cycle?.problemIds.join(","), "RC59 structural connection mapping changed");
for (const problemId of cycle?.problemIds || []) {
  const problem = sandbox.window.PROBLEMS.find((item) => item.id === problemId);
  assert(problem?.cycleResearch?.cycleId === "RC-2026-59", `${problemId} must show RC59 as current research`);
  assert(problem?.cycleResearch?.updatedDefinition?.text?.length > 180 && problem?.cycleResearch?.updatedDefinition?.textEn?.length > 350, `${problemId} needs a substantive bilingual updated definition`);
  assert(problem?.cycleResearch?.causalChain?.length === 5, `${problemId} needs a five-link problem-specific causal chain`);
  assert(problem?.cycleResearch?.causalChain?.every((item) => item.title?.text && item.title?.textEn && item.claim?.text && item.claim?.textEn && item.failure?.text && item.failure?.textEn), `${problemId} causal links must be bilingual`);
  assert(problem?.cycleResearch?.workPackages?.length === 5, `${problemId} needs five work packages`);
  assert(problem?.cycleResearch?.uncertaintyBudget?.length === 8, `${problemId} needs eight uncertainty entries`);
  assert(problem?.cycleResearch?.decisionTree?.length === 6, `${problemId} needs six decision branches`);
}

for (const page of ["index.html", "solve.html", "research-log.html"]) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  assert(html.includes("research-cycle-59-data.js?v=20260829-cycle59"), `${page} must load RC59 data`);
}
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const readmeCount = pattern => Number(readme.match(pattern)?.[1].replaceAll(",", ""));
assert(readmeCount(/([\d,]+)개 누적 연구 사이클/) >= 65, "README must retain the RC65 cycle baseline");
assert(readmeCount(/심층 연구 문제의 ([\d,]+)개 사이클 기록/) >= 210, "README must retain the RC65 record baseline");
assert(readmeCount(/([\d,]+)개 구조적 연결/) >= 68, "README must retain the RC65 connection baseline");
assert(readmeCount(/([\d,]+)개 기관·로드맵·원 연구 출처/) >= 367, "README must retain the RC65 source baseline");
const publicCopy = fs.readFileSync(path.join(ROOT, "research-cycle-59-data.js"), "utf8");
for (const prohibited of ["전공자 포인트", "1단계 · 처음 읽는 사람", "2단계 · 전공자 핵심", "개수를 맞추지", "아래 시도는 개별 논문"]) {
  assert(!publicCopy.includes(prohibited), `RC59 public copy contains prohibited phrase: ${prohibited}`);
}
const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
assert(sitemap.includes("cycle=RC-2026-59&amp;lang=ko") && sitemap.includes("cycle=RC-2026-59&amp;lang=en"), "Sitemap missing RC59 localized URLs");

if (failures.length) {
  console.error(`RC59 verification failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("RC59 verification passed: 48 exact assignments, fixture-loss 36, chamber-loss 24, four margins blocked, outcomes 0.");
