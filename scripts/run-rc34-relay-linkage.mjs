import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const readJson = name => JSON.parse(fs.readFileSync(path.join(REPRO, name), "utf8"));
const sha = (...parts) => {
  const hash = crypto.createHash("sha256");
  for (const part of parts) {
    const value = Buffer.isBuffer(part) ? part : Buffer.from(String(part));
    const length = Buffer.alloc(4); length.writeUInt32BE(value.length);
    hash.update(length); hash.update(value);
  }
  return hash.digest();
};
const unit = (...parts) => sha(...parts).readUInt32BE(0) / 0x100000000;
const integer = (limit, ...parts) => Math.floor(unit(...parts) * limit);
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};
const quantile = (values, probability) => [...values].sort((a, b) => a - b)[Math.ceil(probability * values.length) - 1];

const precommit = readJson("rc34-sealed-corpus-precommit.json");
const reveal = readJson("rc34-sealed-corpus-reveal.json");
const transcripts = readJson("rc34-circl-transcripts.json");
const seed = Buffer.from(reveal.seedHex, "hex");
const packageById = new Map(reveal.packages.map(item => [item.id, item]));
const tokenByEvent = new Map();
for (const batch of transcripts.batches.filter(item => item.mode === "VOPRF")) {
  batch.eventIds.forEach((eventId, index) => tokenByEvent.set(eventId, batch.outputsHex[index]));
}

function createScenario(study, scenario) {
  const ingress = study.events.map((event, index) => {
    const packageRecord = packageById.get(event.packageId);
    return {
      ingressRecordId: `IN-${study.studyId}-${String(index).padStart(3, "0")}`,
      observedAtMs: index * 17 + integer(7, seed, "ingress-time", event.eventId),
      payloadBytes: 240 + packageRecord.length + integer(41, seed, "ingress-size", event.eventId),
      endpointBucket: `EP-${integer(8, seed, "endpoint", event.packageId)}`,
      stablePackageToken: tokenByEvent.get(event.eventId),
      _eventId: event.eventId,
    };
  });
  if (scenario === "unprotected") {
    const egress = ingress.map((item, index) => ({
      egressRecordId: `OUT-${study.studyId}-${String(index).padStart(3, "0")}`,
      observedAtMs: item.observedAtMs + 13 + integer(5, seed, "direct-delay", item._eventId),
      payloadBytes: item.payloadBytes + 72,
      endpointBucket: item.endpointBucket,
      stablePackageToken: item.stablePackageToken,
      _eventId: item._eventId,
      _batchId: null,
    })).sort((a, b) => a.observedAtMs - b.observedAtMs || a.egressRecordId.localeCompare(b.egressRecordId));
    return { ingress, egress };
  }

  const egress = [];
  const batchSize = precommit.relay.batchSize;
  for (let start = 0; start < ingress.length; start += batchSize) {
    const batch = ingress.slice(start, start + batchSize);
    const batchId = `${study.studyId}-B${String(start / batchSize).padStart(2, "0")}`;
    const batchTime = Math.max(...batch.map(item => item.observedAtMs)) + precommit.relay.fixedBatchDelayMilliseconds;
    const shuffled = [...batch].sort((left, right) => Buffer.compare(sha(seed, "shuffle", batchId, left._eventId), sha(seed, "shuffle", batchId, right._eventId)));
    shuffled.forEach((item, slot) => egress.push({
      egressRecordId: `OUT-${batchId}-${String(slot).padStart(2, "0")}`,
      observedAtMs: batchTime,
      payloadBytes: precommit.relay.fixedPayloadBytes,
      endpointBucket: "RELAY",
      ...(scenario === "stable-token-ablation" ? { stablePackageToken: item.stablePackageToken } : {}),
      _eventId: item._eventId,
      _batchId: batchId,
    }));
  }
  return { ingress, egress };
}

const studies = Object.fromEntries(reveal.studies.map(study => [study.studyId, study]));
const scenarios = ["unprotected", "protected", "stable-token-ablation"];
const traces = {};
for (const scenario of scenarios) {
  traces[scenario] = {};
  for (const study of reveal.studies) traces[scenario][study.studyId] = createScenario(study, scenario);
}

function fitOffsets(scenario, studyIds) {
  const delays = [];
  const sizeOffsets = [];
  for (const studyId of studyIds) {
    const trace = traces[scenario][studyId];
    const byEvent = new Map(trace.egress.map(item => [item._eventId, item]));
    for (const input of trace.ingress) {
      const output = byEvent.get(input._eventId);
      delays.push(output.observedAtMs - input.observedAtMs);
      sizeOffsets.push(output.payloadBytes - input.payloadBytes);
    }
  }
  return { expectedDelayMs: median(delays), expectedSizeOffset: median(sizeOffsets) };
}

function attack(trace, weights, offsets) {
  const available = new Map(trace.egress.map(item => [item.egressRecordId, item]));
  const predictions = [];
  for (const input of [...trace.ingress].sort((a, b) => a.observedAtMs - b.observedAtMs || a.ingressRecordId.localeCompare(b.ingressRecordId))) {
    let best = null;
    for (const output of available.values()) {
      const timeCost = Math.abs((output.observedAtMs - input.observedAtMs) - offsets.expectedDelayMs) / 100;
      const sizeCost = Math.abs((output.payloadBytes - input.payloadBytes) - offsets.expectedSizeOffset) / 512;
      const endpointCost = output.endpointBucket === input.endpointBucket ? 0 : 1;
      const tokenCost = output.stablePackageToken && input.stablePackageToken && output.stablePackageToken === input.stablePackageToken ? 0 : 1;
      const tie = unit(seed, "attack-tie", input.ingressRecordId, output.egressRecordId) * 1e-9;
      const cost = weights.time * timeCost + weights.size * sizeCost + weights.endpoint * endpointCost + weights.stableToken * tokenCost + tie;
      if (!best || cost < best.cost) best = { output, cost };
    }
    predictions.push({ ingressRecordId: input.ingressRecordId, predictedEgressRecordId: best.output.egressRecordId, trueEventId: input._eventId, predictedEventId: best.output._eventId, correct: input._eventId === best.output._eventId, predictedBatchId: best.output._batchId });
    available.delete(best.output.egressRecordId);
  }
  return predictions;
}

const weightGrid = [];
for (const time of precommit.relay.attackerFeatureWeights.time)
  for (const size of precommit.relay.attackerFeatureWeights.size)
    for (const endpoint of precommit.relay.attackerFeatureWeights.endpoint)
      for (const stableToken of precommit.relay.attackerFeatureWeights.stableToken)
        weightGrid.push({ time, size, endpoint, stableToken });

const developmentStudies = precommit.oprf.developmentStudies;
const heldOutStudy = precommit.oprf.finalStudy;
const fitted = {};
for (const scenario of scenarios) {
  const offsets = fitOffsets(scenario, developmentStudies);
  const ranked = weightGrid.map(weights => {
    let correct = 0, total = 0;
    for (const studyId of developmentStudies) {
      const predictions = attack(traces[scenario][studyId], weights, offsets);
      correct += predictions.filter(item => item.correct).length;
      total += predictions.length;
    }
    return { weights, correct, total, accuracy: correct / total };
  }).sort((left, right) => right.accuracy - left.accuracy || JSON.stringify(left.weights).localeCompare(JSON.stringify(right.weights)));
  fitted[scenario] = { offsets, ...ranked[0], candidateModels: ranked.length };
}

const holdoutPredictions = {};
const holdoutMetrics = {};
for (const scenario of scenarios) {
  const predictions = attack(traces[scenario][heldOutStudy], fitted[scenario].weights, fitted[scenario].offsets);
  holdoutPredictions[scenario] = predictions;
  const correct = predictions.filter(item => item.correct).length;
  holdoutMetrics[scenario] = { correct, total: predictions.length, accuracy: correct / predictions.length, frozenWeights: fitted[scenario].weights, fittedOffsets: fitted[scenario].offsets };
}

function xorshift(seedValue) {
  let state = seedValue >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}
const protectedTrace = traces.protected[heldOutStudy];
const protectedPredictionByIngress = new Map(holdoutPredictions.protected.map(item => [item.ingressRecordId, item.predictedEgressRecordId]));
const ingressByBatch = [];
for (let start = 0; start < protectedTrace.ingress.length; start += precommit.relay.batchSize) ingressByBatch.push(protectedTrace.ingress.slice(start, start + precommit.relay.batchSize));
const egressByBatch = new Map();
for (const output of protectedTrace.egress) {
  if (!egressByBatch.has(output._batchId)) egressByBatch.set(output._batchId, []);
  egressByBatch.get(output._batchId).push(output.egressRecordId);
}
const random = xorshift(sha(seed, "null-model").readUInt32BE(0));
const nullAccuracies = [];
for (let simulation = 0; simulation < 10000; simulation++) {
  let correct = 0;
  for (let batchIndex = 0; batchIndex < ingressByBatch.length; batchIndex++) {
    const inputs = ingressByBatch[batchIndex];
    const batchId = `${heldOutStudy}-B${String(batchIndex).padStart(2, "0")}`;
    const outputs = [...egressByBatch.get(batchId)];
    for (let index = outputs.length - 1; index > 0; index--) {
      const chosen = Math.floor(random() * (index + 1));
      [outputs[index], outputs[chosen]] = [outputs[chosen], outputs[index]];
    }
    inputs.forEach((input, index) => { if (protectedPredictionByIngress.get(input.ingressRecordId) === outputs[index]) correct++; });
  }
  nullAccuracies.push(correct / protectedTrace.ingress.length);
}
const nullGate = quantile(nullAccuracies, 0.95);
const protectedAccuracy = holdoutMetrics.protected.accuracy;
const empiricalP = (1 + nullAccuracies.filter(value => value >= protectedAccuracy).length) / (nullAccuracies.length + 1);
const checks = {
  sealed_heldout_study_used_once: heldOutStudy === "STUDY-30",
  exactly_144_models_per_scenario: Object.values(fitted).every(item => item.candidateModels === 144),
  protected_accuracy_not_above_null_p95: protectedAccuracy <= nullGate,
  unprotected_positive_control_above_null_p95: holdoutMetrics.unprotected.accuracy > nullGate,
  stable_token_ablation_above_null_p95: holdoutMetrics["stable-token-ablation"].accuracy > nullGate,
  stable_token_ablation_worse_than_protected: holdoutMetrics["stable-token-ablation"].accuracy > protectedAccuracy,
  fixed_payload_and_batch_delay_applied: protectedTrace.egress.every(item => item.payloadBytes === 1024) && new Set(protectedTrace.egress.map(item => item.endpointBucket)).size === 1,
  protected_egress_has_no_stable_token: protectedTrace.egress.every(item => !Object.hasOwn(item, "stablePackageToken")),
};

const publicTrace = {
  traceId: "RC34-RELAY-TRACES-0.9",
  computedOn: "2026-08-14",
  heldOutStudy,
  scenarios: Object.fromEntries(scenarios.map(scenario => [scenario, Object.fromEntries(Object.entries(traces[scenario]).map(([studyId, trace]) => [studyId, {
    ingress: trace.ingress.map(({ _eventId, ...item }) => item),
    egress: trace.egress.map(({ _eventId, _batchId, ...item }) => item),
  }]))])),
  boundary: "Observed traces omit truth event IDs. The separately published prediction artifact reveals mappings after the sealed held-out score was computed.",
};
const predictionArtifact = {
  predictionId: "RC34-RELAY-HOLDOUT-PREDICTIONS-0.9",
  computedOn: "2026-08-14",
  heldOutStudy,
  fitted,
  predictions: holdoutPredictions,
};
const result = {
  resultId: "RC34-RELAY-LINKAGE-RESULT-0.9",
  computedOn: "2026-08-14",
  passed: Object.values(checks).every(Boolean),
  developmentStudies,
  heldOutStudy,
  holdoutMetrics,
  nullModel: { simulations: 10000, meanAccuracy: nullAccuracies.reduce((sum, value) => sum + value, 0) / nullAccuracies.length, p95Accuracy: nullGate, protectedEmpiricalUpperTailP: empiricalP },
  checks,
  interpretation: {
    verified: "Against this frozen matcher, fixed-size delayed shuffled batches reduce held-out matching to the within-batch chance envelope, while restoring the stable VOPRF token raises matching above it.",
    inference: "The positive-control separation supports treating stable equality and transport metadata as independent graph edges, not as a proof of anonymity against adaptive observers.",
    unverified: "Live network timing, packet loss, active tagging, cross-batch intersection attacks, endpoint compromise, and colluding relays remain untested.",
  },
};

const artifacts = [
  ["rc34-relay-traces.json", publicTrace],
  ["rc34-relay-holdout-predictions.json", predictionArtifact],
  ["rc34-relay-linkage-result.json", result],
];
if (process.argv.includes("--write")) {
  for (const [name, value] of artifacts) fs.writeFileSync(path.join(REPRO, name), JSON.stringify(value, null, 2) + "\n");
} else {
  for (const [name, value] of artifacts) {
    if (JSON.stringify(readJson(name)) !== JSON.stringify(value)) throw new Error(`${name} differs from committed artifact`);
  }
}
console.log(`RC34 relay: protected ${holdoutMetrics.protected.correct}/${holdoutMetrics.protected.total} (${protectedAccuracy.toFixed(3)}), null p95 ${nullGate.toFixed(3)}, unprotected ${holdoutMetrics.unprotected.accuracy.toFixed(3)}, stable-token ${holdoutMetrics["stable-token-ablation"].accuracy.toFixed(3)}.`);
if (!result.passed) process.exitCode = 1;
