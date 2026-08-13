import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/intervention-batch-certificate-spec.json"), "utf8"));
const args = new Set(process.argv.slice(2));
const round = (value, digits = 12) => Number(value.toFixed(digits));

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= k; index += 1) value = value * (n - k + index) / index;
  return value;
}

function binomialTail(n, k, probability) {
  let value = 0;
  for (let successes = k; successes <= n; successes += 1) {
    value += choose(n, successes) * probability ** successes * (1 - probability) ** (n - successes);
  }
  return value;
}

const design = spec.exactDesign;
const candidates = [];
for (let n = design.search.minimumBatches; n <= design.search.maximumBatches; n += 1) {
  for (let k = 0; k <= n; k += 1) {
    const endpointAlpha = binomialTail(n, k, 0.5);
    const endpointPower = binomialTail(n, k, 0.9);
    const jointPowerLowerBound = Math.max(0, 2 * endpointPower - 1);
    candidates.push({ n, k, endpointAlpha, familywiseAlphaBound: Math.min(1, 2 * endpointAlpha), endpointPower, jointPowerLowerBound });
  }
}
const qualifying = candidates.filter(row => row.endpointAlpha <= design.endpointAlpha && row.endpointPower >= design.targetEndpointPower && row.jointPowerLowerBound >= design.targetWorstDependenceJointPowerLowerBound);
if (!qualifying.length) throw new Error("No qualifying exact design in the sealed search range");
const selected = qualifying.sort((left, right) => left.n - right.n || left.k - right.k)[0];

const threeBatch = {
  n: 3,
  strictestCriticalValue: 3,
  endpointAlpha: binomialTail(3, 3, 0.5),
  familywiseAlphaBound: Math.min(1, 2 * binomialTail(3, 3, 0.5)),
  endpointPowerAtPointNine: binomialTail(3, 3, 0.9),
  qualifies: false
};

function expectedBatches(probability) {
  const reachTenOneEndpoint = binomialTail(5, 2, probability);
  const reachFifteenOneEndpoint = binomialTail(10, selected.k - 5, probability);
  const reachTenBoth = reachTenOneEndpoint ** 2;
  const reachFifteenBoth = reachFifteenOneEndpoint ** 2;
  return {
    probabilityReach10: reachTenBoth,
    probabilityReach15: reachFifteenBoth,
    expectedBatches: 5 + 5 * reachTenBoth + 5 * reachFifteenBoth
  };
}

const selectedSummary = {
  n: selected.n,
  k: selected.k,
  endpointAlpha: selected.endpointAlpha,
  familywiseAlphaBound: selected.familywiseAlphaBound,
  endpointPowerAtPointNine: selected.endpointPower,
  worstDependenceJointPowerLowerBound: selected.jointPowerLowerBound
};
const output = {
  benchmarkId: spec.benchmarkId,
  computedOn: "2026-08-14",
  status: "exact-design-enumerated-before-physical-outcomes",
  denominators: { searchedBatchCounts: design.search.maximumBatches - design.search.minimumBatches + 1, candidateRules: candidates.length, endpoints: 2 },
  threeBatchAudit: Object.fromEntries(Object.entries(threeBatch).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])),
  selectedDesign: Object.fromEntries(Object.entries(selectedSummary).map(([key, value]) => [key, typeof value === "number" ? round(value) : value])),
  futilityOnlySequence: {
    checkpoints: [5, 10, selected.n],
    stopAt5WhenEitherSuccessCountAtMost: selected.k - 11,
    stopAt10WhenEitherSuccessCountAtMost: selected.k - 6,
    nullIndependentEndpointIllustration: Object.fromEntries(Object.entries(expectedBatches(0.5)).map(([key, value]) => [key, round(value)])),
    alternativeIndependentEndpointIllustration: Object.fromEntries(Object.entries(expectedBatches(0.9)).map(([key, value]) => [key, round(value)])),
    guarantee: "Futility only removes paths that cannot reach the final critical value and does not increase fixed-final type-I error. Expected sample sizes are illustrations requiring independence of endpoint indicators."
  },
  decisions: {
    H1_threeBatchesFinalQualificationAdequate: threeBatch.endpointAlpha <= design.endpointAlpha,
    H2_minimumExactDesignFound: selected.n === 15 && selected.k === 12,
    H3_endpointPowerTargetMet: selected.endpointPower >= design.targetEndpointPower,
    H4_worstDependenceJointPowerTargetMet: selected.jointPowerLowerBound >= design.targetWorstDependenceJointPowerLowerBound,
    H5_arbitraryShiftGuaranteeQualified: false,
    H6_analysisRerunsIncreaseEffectiveN: false
  },
  interpretation: {
    established: "Three independent batches cannot qualify even one endpoint at alpha 0.025; the minimum sealed exact design is twelve successes among fifteen independent exchangeable batches for each endpoint.",
    assumptionBound: "The exact certificate is finite-sample only under the operational p<=0.5 null and independent exchangeable batches. It is not robust to arbitrary unknown institution shift.",
    nextPhysicalStep: "Use three batches only to debug preparation and integrity gates, then freeze the protocol before expanding to the fifteen-batch confirmatory sequence."
  }
};

for (const section of [output.threeBatchAudit, output.selectedDesign]) {
  for (const [key, value] of Object.entries(section)) if (typeof value === "number") section[key] = round(value);
}
if (args.has("--emit")) console.log(JSON.stringify(output, null, 2));
else {
  const expected = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/intervention-batch-certificate-result.json"), "utf8"));
  if (JSON.stringify(output) !== JSON.stringify(expected)) throw new Error("exact batch-certificate result differs from committed artifact");
  console.log("RC26 exact batch-certificate enumeration reproduced.");
}
