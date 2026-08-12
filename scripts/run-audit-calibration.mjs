import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { campaignDigest, manifestFor, recordDigest, sha256, validateCampaign } from "./audit/completeness.mjs";
import { clopperPearson, selectionOdds, selectionSensitivityBounds } from "./identification/bounds.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/audit/calibration-spec.json"), "utf8"));
const fixturePath = path.join(root, "research/audit/synthetic-audit-fixture.json");
const resultPath = path.join(root, "research/audit/calibration-result.json");
const round = (value, digits = 6) => Number(value.toFixed(digits));
const hash = label => sha256(`MNAR-AUDIT-RESCUE-0.1:${label}`);

function stage(status, occurredAt, artifactHash = null, reasonCode = null, reasonRecordedAt = null, outcomeKnownWhenReasonRecorded = null) {
  return { status, occurredAt, artifactHash, reasonCode, reasonRecordedAt, outcomeKnownWhenReasonRecorded };
}

function buildFixture() {
  const statuses = [
    ["completed", "present", "recorded", "released", "success"],
    ["completed", "present", "recorded", "released", "failure"],
    ["not-run", "absent", "not-applicable", "withheld", null],
    ["failed", "absent", "not-applicable", "withheld", null],
    ["completed", "absent", "not-applicable", "withheld", null],
    ["completed", "present", "recorded", "withheld", "inconclusive"],
    ["completed", "present", "recorded", "released", "success"],
    ["completed", "present", "recorded", "released", "failure"]
  ];
  const records = statuses.map((values, index) => {
    const [executionStatus, rawStatus, adjudicationStatus, releaseStatus, outcome] = values;
    const day = String(index + 1).padStart(2, "0");
    const base = `2026-07-${day}`;
    const missingExecution = executionStatus !== "completed";
    const missingRaw = rawStatus !== "present";
    const missingAdjudication = adjudicationStatus !== "recorded";
    const withheld = releaseStatus !== "released";
    const record = {
      experimentId: `AUD-${String(index + 1).padStart(3, "0")}`,
      registeredAt: `${base}T00:00:00Z`,
      targetHash: hash(`target-${index}`),
      stages: {
        decision: stage("recorded", `${base}T00:05:00Z`, hash(`decision-${index}`)),
        execution: missingExecution
          ? stage(executionStatus, executionStatus === "failed" ? `${base}T02:00:00Z` : null, null, executionStatus === "failed" ? "equipment-interlock" : "capacity-hold", `${base}T00:30:00Z`, false)
          : stage("completed", `${base}T02:00:00Z`, hash(`execution-${index}`)),
        rawObservation: missingRaw
          ? stage("absent", null, null, executionStatus === "completed" ? "raw-file-loss" : "execution-not-completed", `${base}T02:05:00Z`, false)
          : stage("present", `${base}T02:15:00Z`, hash(`raw-${index}`)),
        adjudication: missingAdjudication
          ? stage("not-applicable", null, null, "raw-unavailable", `${base}T02:10:00Z`, false)
          : stage("recorded", `${base}T04:00:00Z`, hash(`adjudication-${index}`)),
        release: withheld
          ? stage("withheld", null, null, outcome === "inconclusive" ? "inconclusive-review" : "incomplete-record", `${base}T03:00:00Z`, false)
          : stage("released", `${base}T05:00:00Z`, hash(`release-${index}`))
      },
      outcome,
      recordDigest: ""
    };
    record.recordDigest = recordDigest(record);
    return record;
  });
  const campaign = {
    schemaVersion: "0.1.0",
    campaignId: "SYNTHETIC-COMPLETENESS-0.1",
    sealedAt: "2026-08-01T00:00:00Z",
    expectedExperimentCount: records.length,
    records,
    manifest: manifestFor(records),
    campaignDigest: ""
  };
  campaign.campaignDigest = campaignDigest(campaign);
  return campaign;
}

function binomialProbability(n, k, p) {
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  let logChoose = 0;
  for (let i = 1; i <= Math.min(k, n - k); i += 1) logChoose += Math.log(n - Math.min(k, n - k) + i) - Math.log(i);
  return Math.exp(logChoose + k * Math.log(p) + (n - k) * Math.log1p(-p));
}

function gammaUpperFromMeanInterval(lower, upper, observedPositive, observedNegative) {
  const candidates = [lower, upper].flatMap(mean => {
    const odds = selectionOdds(mean, observedPositive, observedNegative);
    return [odds, 1 / odds];
  });
  return Math.max(...candidates);
}

function calibrate() {
  const responseRate = spec.observedDistribution.responseRate;
  const observedRate = spec.observedDistribution.positiveRateAmongObserved;
  const observedPositive = responseRate * observedRate;
  const observedNegative = responseRate * (1 - observedRate);
  const missingFraction = 1 - responseRate;
  const scenarios = [];
  for (const gamma of spec.trueSelectionOddsGamma) {
    const trueMean = selectionSensitivityBounds(responseRate, observedRate, gamma).lower;
    const missingPositiveRate = (trueMean - observedPositive) / missingFraction;
    for (const sampleSize of spec.randomRescueSampleSizes) {
      if (sampleSize === 0) {
        scenarios.push({
          gamma, sampleSize, trueMean: round(trueMean), missingPositiveRate: round(missingPositiveRate),
          meanLower: round(observedPositive), meanUpper: round(1 - observedNegative), meanWidth: round(missingFraction),
          coverage: 1, finiteGammaUpperRate: 0, medianFiniteGammaUpper: null, passesGate: false
        });
        continue;
      }
      let lowerTotal = 0;
      let upperTotal = 0;
      let covered = 0;
      let finiteRate = 0;
      const finiteGammas = [];
      for (let successes = 0; successes <= sampleSize; successes += 1) {
        const probability = binomialProbability(sampleSize, successes, missingPositiveRate);
        const interval = clopperPearson(successes, sampleSize, 1 - spec.confidenceLevel);
        const lower = observedPositive + missingFraction * interval.lower;
        const upper = observedPositive + missingFraction * interval.upper;
        lowerTotal += probability * lower;
        upperTotal += probability * upper;
        if (lower <= trueMean && trueMean <= upper) covered += probability;
        const gammaUpper = gammaUpperFromMeanInterval(lower, upper, observedPositive, observedNegative);
        if (Number.isFinite(gammaUpper)) {
          finiteRate += probability;
          finiteGammas.push({ value: gammaUpper, probability });
        }
      }
      finiteGammas.sort((a, b) => a.value - b.value);
      let cumulative = 0;
      let median = null;
      for (const item of finiteGammas) {
        cumulative += item.probability;
        if (cumulative >= finiteRate / 2) { median = item.value; break; }
      }
      const meanLower = lowerTotal;
      const meanUpper = upperTotal;
      const meanWidth = meanUpper - meanLower;
      const coverage = covered;
      scenarios.push({
        gamma, sampleSize, trueMean: round(trueMean), missingPositiveRate: round(missingPositiveRate),
        meanLower: round(meanLower), meanUpper: round(meanUpper), meanWidth: round(meanWidth), coverage: round(coverage),
        finiteGammaUpperRate: round(finiteRate), medianFiniteGammaUpper: median === null ? null : round(median),
        passesGate: meanWidth <= spec.decisionGates.maximumMeanPopulationWidth
          && coverage >= spec.decisionGates.minimumCoverage
          && finiteRate >= spec.decisionGates.minimumFiniteGammaUpperRate
      });
    }
  }
  return scenarios;
}

function mutationChecks(fixture) {
  const clone = () => structuredClone(fixture);
  const mutations = [
    ["duplicate-id", campaign => { campaign.records[1].experimentId = campaign.records[0].experimentId; }],
    ["missing-planned-record", campaign => { campaign.records.pop(); }],
    ["late-registration", campaign => { campaign.records[0].registeredAt = "2026-07-01T03:00:00Z"; }],
    ["outcome-aware-missing-reason", campaign => { campaign.records[4].stages.rawObservation.outcomeKnownWhenReasonRecorded = true; }],
    ["release-without-adjudication", campaign => { campaign.records[0].stages.adjudication.status = "not-applicable"; }],
    ["tampered-record", campaign => { campaign.records[0].targetHash = hash("tampered"); }],
    ["false-manifest", campaign => { campaign.manifest.rawObservation.present += 1; }]
  ];
  return mutations.map(([id, mutate]) => {
    const campaign = clone();
    mutate(campaign);
    const errors = validateCampaign(campaign);
    return { id, detected: errors.length > 0, errorCodes: [...new Set(errors.map(error => error.code))] };
  });
}

const fixture = buildFixture();
const fixtureErrors = validateCampaign(fixture);
const scenarios = calibrate();
const mutations = mutationChecks(fixture);
const result = {
  calibrationId: spec.calibrationId,
  generatedOn: spec.reviewedOn,
  fixture: {
    campaignId: fixture.campaignId,
    records: fixture.records.length,
    manifest: fixture.manifest,
    valid: fixtureErrors.length === 0,
    mutationDetection: mutations
  },
  scenarios,
  findings: {
    stageCountsAloneLeaveLogicalWidth: scenarios.filter(item => item.sampleSize === 0).every(item => item.meanWidth === 0.4),
    randomRescuePreservesCoverage: scenarios.filter(item => item.sampleSize > 0).every(item => item.coverage >= 0.95),
    oneHundredPassesAllScenarios: scenarios.filter(item => item.sampleSize === 100).every(item => item.passesGate),
    twentyFailsAtLeastOneScenario: scenarios.filter(item => item.sampleSize === 20).some(item => !item.passesGate),
    allIntegrityMutationsDetected: mutations.every(item => item.detected)
  },
  decision: "Use the prospective manifest to prove denominators and detect selective release, but use an independently randomized rescue sample to constrain outcome-dependent selection. Under this design, 100 rescued missing outcomes pass the frozen width, coverage, and finite-Gamma gates in all three worlds."
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, fixturePath)} and ${path.relative(root, resultPath)}`);
} else {
  console.log(JSON.stringify(result, null, 2));
}

export { buildFixture, calibrate, result };
