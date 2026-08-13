import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const spec = load("research/reproducibility/intervention-batch-certificate-spec.json");
const schema = load("research/reproducibility/intervention-batch-ledger.schema.json");
const result = load("research/reproducibility/intervention-batch-certificate-result.json");
const audit = load("research/reproducibility/intervention-batch-python-audit.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const close = (left, right, tolerance = 1e-12) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= k; index += 1) value = value * (n - k + index) / index;
  return value;
}
function tail(n, k, p) {
  let value = 0;
  for (let successes = k; successes <= n; successes += 1) value += choose(n, successes) * p ** successes * (1 - p) ** (n - successes);
  return value;
}

check(spec.benchmarkId === result.benchmarkId && spec.status === "criteria-fixed-after-rc25-before-any-physical-outcomes", "RC26 benchmark identity or prospective status changed");
check(spec.claimBoundary.unit.includes("at most one binary result") && spec.claimBoundary.retrospectiveLimit.includes("prospective only"), "RC26 physical unit or retrospective boundary is missing");
check(spec.primarySources.includes("https://doi.org/10.1107/S1600576722009888") && !spec.primarySources.some(url => url.includes("S1600576722008603")), "pyrite primary-source DOI is not corrected");
check(spec.exactDesign.endpointAlpha === 0.025 && spec.exactDesign.familywiseAlpha === 0.05 && spec.exactDesign.targetEndpointPower === 0.9, "RC26 sealed error or power targets changed");
check(spec.causalChain.length === 5 && spec.stopConditions.length >= 6 && Object.keys(spec.uncertaintyBudget).length >= 6, "RC26 causal chain, uncertainty budget, or stop rules are incomplete");

check(result.denominators.searchedBatchCounts === 48 && result.denominators.candidateRules === 1320 && result.denominators.endpoints === 2, "RC26 search denominator changed");
check(close(tail(3, 3, 0.5), 0.125) && close(result.threeBatchAudit.endpointAlpha, 0.125) && !result.threeBatchAudit.qualifies, "three-batch exact falsification changed");
check(result.selectedDesign.n === 15 && result.selectedDesign.k === 12, "minimum exact design is no longer 12 of 15");
check(close(tail(15, 12, 0.5), result.selectedDesign.endpointAlpha) && close(result.selectedDesign.endpointAlpha, 0.017578125), "selected endpoint alpha changed");
check(close(2 * result.selectedDesign.endpointAlpha, result.selectedDesign.familywiseAlphaBound) && close(result.selectedDesign.familywiseAlphaBound, 0.03515625), "familywise bound changed");
check(close(tail(15, 12, 0.9), result.selectedDesign.endpointPowerAtPointNine) && close(result.selectedDesign.endpointPowerAtPointNine, 0.944444369992), "endpoint power changed");
check(close(2 * result.selectedDesign.endpointPowerAtPointNine - 1, result.selectedDesign.worstDependenceJointPowerLowerBound) && close(result.selectedDesign.worstDependenceJointPowerLowerBound, 0.888888739985), "joint-power lower bound changed");
check(result.futilityOnlySequence.stopAt5WhenEitherSuccessCountAtMost === 1 && result.futilityOnlySequence.stopAt10WhenEitherSuccessCountAtMost === 6, "futility boundary changed");
for (let firstFive = 0; firstFive <= 5; firstFive += 1) if (firstFive <= 1) check(firstFive + 10 < 12, "five-batch futility can stop a successful path");
for (let firstTen = 0; firstTen <= 10; firstTen += 1) if (firstTen <= 6) check(firstTen + 5 < 12, "ten-batch futility can stop a successful path");
check(JSON.stringify(result.decisions) === JSON.stringify({
  H1_threeBatchesFinalQualificationAdequate: false,
  H2_minimumExactDesignFound: true,
  H3_endpointPowerTargetMet: true,
  H4_worstDependenceJointPowerTargetMet: true,
  H5_arbitraryShiftGuaranteeQualified: false,
  H6_analysisRerunsIncreaseEffectiveN: false
}), "RC26 decision vector changed");
check(audit.passed && Object.values(audit.checks).every(Boolean) && audit.independenceBoundary.includes("does not supply independent physical batches"), "independent Python audit failed or overclaims physical evidence");

check(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "batch ledger is not JSON Schema 2020-12");
for (const key of ["protocolVersion", "sealedOn", "records", "splitContract"]) check(schema.required?.includes(key), `batch ledger root field ${key} is not required`);
for (const key of ["preparationBatchId", "specimenId", "aliquotId", "rawXrpdSha256", "negativeEndpoint", "positiveEndpoint", "integrityGate"]) check(schema.$defs?.batchRecord?.required?.includes(key), `batch record field ${key} is not required`);
check(schema.properties?.splitContract?.properties?.analysisRunCountNeverEqualsIndependentN?.const === true, "ledger does not forbid analysis-run pseudoreplication");

const context = { window: {} };
vm.createContext(context);
const cycleFiles = ["research-cycle-data.js", ...Array.from({ length: 24 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const dataFile of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", ...cycleFiles]) {
  vm.runInContext(fs.readFileSync(path.join(root, dataFile), "utf8"), context, { filename: dataFile });
}
const cycle = context.window.RESEARCH_CYCLES.find(row => row.id === "RC-2026-26");
const connection = context.window.RESEARCH_CONNECTIONS.find(row => row.id === "CONN-CERTIFICATE-001");
check(cycle?.problemIds.join("|") === "UP-182|UP-184|UP-185|UP-625" && cycle.artifacts.length === 7, "RC26 cycle scope or artifacts are incomplete");
check(cycle?.verifiedFindings.length >= 14 && cycle?.log.length >= 10 && cycle?.resultMatrix.rows.length >= 10, "RC26 findings, research log, or result matrix are incomplete");
check(connection?.problemIds.join("|") === "UP-182|UP-184|UP-185|UP-625" && connection.strength === "moderate", "RC26 structural connection is missing or overgraded");
check(connection?.mapping.text.includes("독립 제조배치") && connection?.mapping.textEn.includes("exchangeable statistical units") && connection?.failureBoundary.textEn, "RC26 connection lacks a variable mapping or failure boundary");
for (const id of cycle?.problemIds || []) {
  const record = context.window.PROBLEMS.find(row => row.id === id)?.researchHistory?.find(row => row.cycleId === "RC-2026-26");
  check(record?.hypotheses.length === 3 && record.updatedDefinition.textEn && record.decisiveTest.textEn && record.unresolved.textEn, `RC26 bilingual record incomplete for ${id}`);
  check(record?.sourceIds.length >= 4, `RC26 record has insufficient primary evidence for ${id}`);
}
for (const sourceId of ["mcdougall_pyrite_preparation_2022", "kamm_capillary_packing_2023", "kabova_pxrd_good_practice_2025", "barber_beyond_exchangeability_2023", "yang_doubly_robust_shift_2024", "gibbs_online_shift_2024", "gibbs_conditional_guarantees_2025"]) check(context.window.CATALOG_SOURCES[sourceId]?.reviewedOn === "2026-08-14", `RC26 source missing or stale: ${sourceId}`);
check(Object.keys(context.window.CATALOG_SOURCES).length === 178, "source count is not 178");
check(context.window.RESEARCH_CYCLES.length === 26 && context.window.RESEARCH_CONNECTIONS.length === 29, "cycle or connection count changed");
check(context.window.PROBLEMS.reduce((sum, problem) => sum + (problem.researchHistory?.length || 0), 0) === 88, "research-record count is not 88");
check(context.window.PROBLEMS.filter(problem => problem.researchHistory?.length).length === 9, "curated-problem count is not 9");
for (const page of ["index.html", "solve.html", "research-log.html"]) check(fs.readFileSync(path.join(root, page), "utf8").includes("research-cycle-26-data.js"), `${page} does not load RC26`);

if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("RC26 verification passed: three batches are pilot-only, twelve of fifteen is the first sealed two-endpoint exact design, reruns do not increase physical n, and arbitrary unknown institution shift remains outside the certificate.");
