#!/usr/bin/env node

/** Independent dependency-free replay of the RC57 exact endpoint pair design. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = path.join(ROOT, "research", "reproducibility", "rc55-rwth-frailty-response-feature-table.json");
const CONTRACT = path.join(ROOT, "research", "reproducibility", "rc57-lineage-pair-design-contract.json");
const OUTPUT = path.join(ROOT, "research", "reproducibility", "rc57-endpoint-pair-design-node.json");
const shouldWrite = process.argv.includes("--write");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function crossingProxy(row) {
  const threshold = Number(row.endpoint.thresholdAh);
  for (let index = 0; index < row.capacityRounds.length - 1; index += 1) {
    const left = row.capacityRounds[index];
    const right = row.capacityRounds[index + 1];
    const qLeft = Number(left.capacityAh);
    const qRight = Number(right.capacityAh);
    if (qLeft > threshold && threshold >= qRight) {
      const cLeft = Number(left.cycle);
      const cRight = Number(right.cycle);
      return cLeft + ((qLeft - threshold) / (qLeft - qRight)) * (cRight - cLeft);
    }
  }
  throw new Error(`cell ${row.id} has no bracketing capacity rounds`);
}

function exactPairDistribution(n, probabilities) {
  const factorials = [1];
  for (let value = 1; value <= n; value += 1) factorials.push(factorials[value - 1] * value);
  let states = new Map([["0|0", 1]]);
  for (const probability of probabilities) {
    const next = new Map();
    for (const [key, weight] of states) {
      const [assigned, collisions] = key.split("|").map(Number);
      for (let count = 0; count <= n - assigned; count += 1) {
        const nextAssigned = assigned + count;
        const nextCollisions = collisions + count * (count - 1) / 2;
        const nextKey = `${nextAssigned}|${nextCollisions}`;
        const increment = weight * probability ** count / factorials[count];
        next.set(nextKey, (next.get(nextKey) || 0) + increment);
      }
    }
    states = next;
  }
  const totalPairs = n * (n - 1) / 2;
  const distribution = new Map();
  for (const [key, weight] of states) {
    const [assigned, collisions] = key.split("|").map(Number);
    if (assigned !== n) continue;
    const pairs = totalPairs - collisions;
    distribution.set(pairs, (distribution.get(pairs) || 0) + weight * factorials[n]);
  }
  const normalization = [...distribution.values()].reduce((sum, value) => sum + value, 0);
  return new Map([...distribution].map(([pairs, probability]) => [pairs, probability / normalization]));
}

function distributionMetrics(distribution) {
  let passProbability = 0;
  for (const [pairs, probability] of distribution) if (pairs >= 100) passProbability += probability;
  let cumulative = 0;
  let lowerFive = null;
  let median = null;
  for (const [pairs, probability] of [...distribution].sort((left, right) => left[0] - right[0])) {
    cumulative += probability;
    if (lowerFive === null && cumulative >= 0.05) lowerFive = pairs;
    if (median === null && cumulative >= 0.5) {
      median = pairs;
      break;
    }
  }
  return { probabilityAtLeast100: passProbability, lowerFivePercentPairCount: lowerFive, medianPairCount: median };
}

function futureDesign(crossings, medianCrossing, n, spread, interval) {
  const phaseResults = [];
  for (let phase = 0; phase < interval; phase += 1) {
    const bins = new Map();
    for (const value of crossings) {
      const transformed = medianCrossing + spread * (value - medianCrossing);
      const bin = 480 + phase + Math.ceil((transformed - 480 - phase) / interval) * interval;
      bins.set(bin, (bins.get(bin) || 0) + 1);
    }
    const distribution = exactPairDistribution(n, [...bins.values()].map((count) => count / crossings.length));
    phaseResults.push({ phase, binCount: bins.size, ...distributionMetrics(distribution) });
  }
  phaseResults.sort((left, right) =>
    Math.round(left.probabilityAtLeast100 * 1e12) - Math.round(right.probabilityAtLeast100 * 1e12)
    || left.lowerFivePercentPairCount - right.lowerFivePercentPairCount
    || left.medianPairCount - right.medianPairCount
    || left.phase - right.phase
  );
  const worstPhase = phaseResults[0];
  return {
    effectiveObservedEvents: n,
    spreadScale: spread,
    intervalCycles: interval,
    phaseCount: interval,
    worstPhase,
    passesPairPowerGate: worstPhase.probabilityAtLeast100 >= 0.95 && worstPhase.lowerFivePercentPairCount >= 100,
  };
}

function existingBlockPairs(crossingsById, interval) {
  const phaseResults = [];
  for (let phase = 0; phase < interval; phase += 1) {
    const quantized = new Map(
      [...crossingsById].map(([cellId, value]) => [cellId, 480 + phase + Math.ceil((value - 480 - phase) / interval) * interval])
    );
    let pairs = 0;
    for (let batch = 1; batch <= 12; batch += 1) {
      const values = Array.from({ length: 4 }, (_, index) => quantized.get((batch - 1) * 4 + index + 1));
      for (let left = 0; left < values.length; left += 1) {
        for (let right = left + 1; right < values.length; right += 1) if (values[left] !== values[right]) pairs += 1;
      }
    }
    phaseResults.push({ phase, nonTiedPairs: pairs });
  }
  return {
    intervalCycles: interval,
    theoreticalMaximum: 72,
    minimumAcrossPhases: Math.min(...phaseResults.map((item) => item.nonTiedPairs)),
    maximumAcrossPhases: Math.max(...phaseResults.map((item) => item.nonTiedPairs)),
    phaseZeroPairs: phaseResults[0].nonTiedPairs,
    canReach100: false,
  };
}

const data = readJson(INPUT);
const contract = readJson(CONTRACT);
const crossingsById = new Map(data.rows.map((row) => [Number(row.id), crossingProxy(row)]));
const crossings = [...crossingsById.values()];
const sorted = [...crossings].sort((left, right) => left - right);
const medianCrossing = (sorted[23] + sorted[24]) / 2;
const intervals = contract.pairDesign.fixedIntervalsCycles;
const eventCounts = contract.pairDesign.effectiveObservedEventCounts;
const spreads = contract.pairDesign.spreadScales;
const existing = intervals.map((interval) => existingBlockPairs(crossingsById, interval));
const future = [];
for (const n of eventCounts) {
  for (const spread of spreads) {
    for (const interval of intervals) future.push(futureDesign(crossings, medianCrossing, n, spread, interval));
  }
}
const selections = eventCounts.map((n) => {
  const passing = future.filter((row) => row.effectiveObservedEvents === n && row.spreadScale === 0.25 && row.passesPairPowerGate);
  passing.sort((left, right) => right.intervalCycles - left.intervalCycles);
  const selected = passing[0] || null;
  return {
    effectiveObservedEvents: n,
    selectedLargestPassingIntervalCycles: selected?.intervalCycles ?? null,
    worstPhaseProbabilityAtLeast100: selected?.worstPhase.probabilityAtLeast100 ?? null,
    worstPhaseLowerFivePercentPairCount: selected?.worstPhase.lowerFivePercentPairCount ?? null,
  };
});

const output = {
  analysisId: "RC57-ENDPOINT-PAIR-DESIGN-NODE-0.1",
  cycleId: "RC-2026-57",
  completedOn: "2026-08-29",
  status: "independent-exact-design-analysis-not-confirmation",
  inputSha256: sha256(INPUT),
  contractSha256: sha256(CONTRACT),
  sourceCells: crossings.length,
  sourceObservedEvents: data.rows.filter((row) => Boolean(row.endpoint.event)).length,
  crossingProxy: {
    minimumCycle: Math.min(...crossings),
    medianCycle: medianCrossing,
    maximumCycle: Math.max(...crossings),
    method: "independent linear interpolation between adjacent standardized capacity rounds bracketing 80% of own BOL capacity",
    claimBoundary: "Outcome-open empirical design prior; not a reconstructed true EOL label.",
  },
  existingFourCellBlocks: existing,
  futureExactDesigns: future,
  conservativeSelections: selections,
  principalResult: {
    fourCellBlockUpperBound: 72,
    twentyFourEventDesign: selections.find((item) => item.effectiveObservedEvents === 24),
    thirtySixEventDesign: selections.find((item) => item.effectiveObservedEvents === 36),
  },
  auroraOutcomeAccessAuthorized: false,
};

if (shouldWrite) fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  `RC57 independent pair design: max-four-cell=72, n24=${output.principalResult.twentyFourEventDesign.selectedLargestPassingIntervalCycles} cycles, n36=${output.principalResult.thirtySixEventDesign.selectedLargestPassingIntervalCycles} cycles`
);
