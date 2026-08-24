#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const N = 94_736;
const M = 94_713;
const missing = 23;
const periods = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 94712];

function choose(n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || n < 0 || k > n) return 0n;
  k = Math.min(k, n - k);
  let value = 1n;
  for (let i = 1; i <= k; i += 1) {
    value = (value * BigInt(n - k + i)) / BigInt(i);
  }
  return value;
}

function log2BigInt(value) {
  if (value <= 0n) throw new Error("log2 requires a positive integer");
  const bits = value.toString(2).length;
  const shift = Math.max(0, bits - 53);
  return Math.log2(Number(value >> BigInt(shift))) + shift;
}

function ceilLog2(value) {
  if (value <= 1n) return 0;
  const bitLength = value.toString(2).length;
  return (value & (value - 1n)) === 0n ? bitLength - 1 : bitLength;
}

function summarize(value) {
  return {
    histories: value.toString(),
    log2Histories: log2BigInt(value),
    minimumAggregateIdentityBits: ceilLog2(value),
  };
}

function anchorsForPeriod(period) {
  const anchors = [1];
  for (let exported = 1 + period; exported < M; exported += period) anchors.push(exported);
  if (anchors.at(-1) !== M) anchors.push(M);
  return anchors;
}

function intervalProfile(anchors) {
  const intervals = [];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    intervals.push({
      intervalIndex: index,
      leftExportedIndex: anchors[index],
      rightExportedIndex: anchors[index + 1],
      unanchoredSurvivors: anchors[index + 1] - anchors[index] - 1,
    });
  }
  return intervals;
}

function worstPeriodicClass(period) {
  const anchors = anchorsForPeriod(period);
  const intervals = intervalProfile(anchors);
  const bySurvivors = new Map();
  for (const interval of intervals) {
    const key = interval.unanchoredSurvivors;
    const group = bySurvivors.get(key) ?? { count: 0, representatives: [] };
    group.count += 1;
    if (group.representatives.length < missing) group.representatives.push(interval);
    bySurvivors.set(key, group);
  }
  const effectiveIntervals = [...bySurvivors.entries()]
    .sort((left, right) => left[0] - right[0])
    .flatMap(([, group]) => group.representatives);

  let states = Array(missing + 1).fill(null);
  states[0] = { value: 1n, allocation: [] };
  for (const interval of effectiveIntervals) {
    const next = Array(missing + 1).fill(null);
    for (let used = 0; used <= missing; used += 1) {
      const state = states[used];
      if (!state) continue;
      for (let added = 0; used + added <= missing; added += 1) {
        const candidate = state.value * choose(interval.unanchoredSurvivors + added, added);
        const target = used + added;
        if (!next[target] || candidate > next[target].value) {
          next[target] = {
            value: candidate,
            allocation: added > 0
              ? [...state.allocation, { ...interval, missing: added }]
              : state.allocation,
          };
        }
      }
    }
    states = next;
  }
  const optimum = states[missing];
  if (!optimum) throw new Error(`no allocation for period ${period}`);
  const profile = [...bySurvivors.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([unanchoredSurvivors, group]) => ({ unanchoredSurvivors, intervalCount: group.count }));
  return {
    period,
    authenticatedAnchorCount: anchors.length,
    intervalCount: intervals.length,
    intervalProfile: profile,
    ...summarize(optimum.value),
    worstMissingByInterval: optimum.allocation,
  };
}

function buildResult() {
  const countOnlyValue = choose(N, missing);
  const firstFrameAnchors = [];
  for (let triggerOrdinal = 1; triggerOrdinal <= missing + 1; triggerOrdinal += 1) {
    const leadingMissing = triggerOrdinal - 1;
    const value = choose(N - triggerOrdinal, missing - leadingMissing);
    firstFrameAnchors.push({ triggerOrdinal, leadingMissing, ...summarize(value) });
  }
  const lastFrameAnchors = [];
  for (let triggerOrdinal = M; triggerOrdinal <= N; triggerOrdinal += 1) {
    const missingBefore = triggerOrdinal - M;
    const trailingMissing = N - triggerOrdinal;
    const value = choose(triggerOrdinal - 1, missingBefore);
    lastFrameAnchors.push({ triggerOrdinal, missingBefore, trailingMissing, ...summarize(value) });
  }
  const periodicAnchors = periods.map(worstPeriodicClass);
  const checks = {
    inheritedCountMatches: countOnlyValue.toString() === "111222247780697737811569949505047670092175708162872419433827601154009970755623534825120294400",
    inheritedLog2Difference: Math.abs(log2BigInt(countOnlyValue) - 305.7708301287824),
    period1IsUnique: periodicAnchors.find((item) => item.period === 1).histories === "1",
    period2Is2Pow23: periodicAnchors.find((item) => item.period === 2).histories === (2n ** 23n).toString(),
    period4Is4Pow23: periodicAnchors.find((item) => item.period === 4).histories === (4n ** 23n).toString(),
    perExposureCounterIsUnique: true,
  };
  if (!checks.inheritedCountMatches || checks.inheritedLog2Difference > 1e-12 || !checks.period1IsUnique || !checks.period2Is2Pow23 || !checks.period4Is4Pow23) {
    throw new Error(`internal theorem check failed: ${JSON.stringify(checks)}`);
  }
  return {
    resultId: "RC48-X16-IDENTITY-BUDGET-NODE-0.1",
    cycleId: "RC-2026-48",
    computedOn: "2026-08-25",
    implementation: "Node.js BigInt primary implementation",
    inputs: { cameraTriggerCount: N, exportedFrameCount: M, missing },
    assumptions: [
      "The trigger roster is complete and totally ordered.",
      "Exported frames preserve acquisition order.",
      "Exactly 23 frames are missing, with no duplicates, insertions, or reorderings.",
      "Every anchor is an independently authenticated exact trigger identity for the named exported frame."
    ],
    countOnly: summarize(countOnlyValue),
    firstFrameAnchors,
    lastFrameAnchors,
    periodicAnchors,
    perExposureCounter: {
      histories: "1",
      log2Histories: 0,
      minimumAggregateIdentityBits: 0,
      conditions: "Authenticated, non-wrapping, non-resetting, unique exposure counter with no duplicate or reordered exports."
    },
    theoremChecks: checks,
  };
}

const outputIndex = process.argv.indexOf("--output");
if (outputIndex < 0 || !process.argv[outputIndex + 1]) throw new Error("usage: compute-rc48-identity-budget.mjs --output FILE");
const output = path.resolve(process.argv[outputIndex + 1]);
fs.mkdirSync(path.dirname(output), { recursive: true });
const result = buildResult();
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  output,
  countOnly: result.countOnly,
  periods: result.periodicAnchors.map(({ period, authenticatedAnchorCount, histories, minimumAggregateIdentityBits }) => ({ period, authenticatedAnchorCount, histories, minimumAggregateIdentityBits })),
  theoremChecks: result.theoremChecks,
}));
