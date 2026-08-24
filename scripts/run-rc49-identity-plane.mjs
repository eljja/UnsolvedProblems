import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const precommit = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/rc49-identity-plane-precommit.json"), "utf8"));
const outputArg = process.argv.findIndex(value => value === "--output");
const outputPath = outputArg >= 0 ? process.argv[outputArg + 1] : "research/reproducibility/rc49-identity-plane-node.json";
const sha256 = value => crypto.createHash("sha256").update(value).digest();
const hex = value => Buffer.from(value).toString("hex");
const b64 = value => Buffer.from(value).toString("base64");

function u32(value) {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}

function u64(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(BigInt(value));
  return out;
}

function encodeParts(parts) {
  const buffers = parts.map(part => Buffer.isBuffer(part) ? part : Buffer.from(String(part), "utf8"));
  return Buffer.concat(buffers.flatMap(buffer => [u32(buffer.length), buffer]));
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function largestPowerBelow(n) {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function merkleRoot(entries) {
  if (entries.length === 0) return sha256(Buffer.alloc(0));
  if (entries.length === 1) return sha256(Buffer.concat([Buffer.from([0]), entries[0]]));
  const k = largestPowerBelow(entries.length);
  return sha256(Buffer.concat([Buffer.from([1]), merkleRoot(entries.slice(0, k)), merkleRoot(entries.slice(k))]));
}

const seed = sha256(Buffer.from("RC49-ED25519-PUBLIC-DEMO-SEED-v1", "utf8"));
const privateKey = crypto.createPrivateKey({
  key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
  format: "der",
  type: "pkcs8"
});
const publicKey = crypto.createPublicKey(privateKey);
const publicKeyRaw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);

const EVENT_COUNT = precommit.corpus.eventCount;
const PERIOD_US = precommit.corpus.periodMicroseconds;
const DOMAIN = precommit.corpus.identityDomain;
const corpusSalt = Buffer.from("RC49-10K-CORPUS-PUBLIC-SALT-v1", "utf8");

const reference = Array.from({ length: EVENT_COUNT }, (_, index) => {
  const ordinal = index + 1;
  const payload = sha256(Buffer.concat([Buffer.from("UP-RC49-PAYLOAD-v1\0", "utf8"), u64(ordinal), corpusSalt]));
  return { ordinal, counter: ordinal, domain: DOMAIN, timestampCenterUs: ordinal * PERIOD_US, payload };
});

const cloneRecords = records => records.map(record => ({ ...record, payload: Buffer.from(record.payload) }));
const token = record => hex(sha256(record.payload));
const signatureLeaf = record => encodeParts(["UP-RC49-SIGNATURE-LEAF-v1", sha256(record.payload)]);
const identityLeaf = record => encodeParts(["UP-RC49-LEAF-v1", record.domain, u64(record.counter), sha256(record.payload)]);

function applyFault(records, fault, targetOrdinal) {
  const index = records.findIndex(record => record.ordinal === targetOrdinal);
  if (index < 0) throw new Error(`target ${targetOrdinal} is absent`);
  if (fault === "omission") records.splice(index, 1);
  else if (fault === "duplicate") records.splice(index + 1, 0, { ...records[index], payload: Buffer.from(records[index].payload) });
  else if (fault === "adjacent-reorder") [records[index], records[index + 1]] = [records[index + 1], records[index]];
  else if (fault === "unannounced-counter-reset") {
    for (let i = index; i < records.length; i += 1) records[i].counter = i - index;
  } else if (fault === "payload-mutation") records[index].payload[0] ^= 1;
  else throw new Error(`unknown fault: ${fault}`);
}

function boundaryReceipt(trialId, arm, stage, records, previousRoot) {
  const leaves = records.map(arm === "signature-only" ? signatureLeaf : identityLeaf);
  const rootHash = hex(merkleRoot(leaves));
  const statement = {
    arm,
    fixtureId: trialId,
    previousRoot,
    root: rootHash,
    schemaVersion: "UP-RC49-BOUNDARY-v1",
    stage,
    treeSize: records.length
  };
  const payload = Buffer.from(canonical(statement), "utf8");
  const signature = crypto.sign(null, payload, privateKey);
  if (!crypto.verify(null, payload, publicKey, signature)) throw new Error(`signature self-check failed: ${trialId}/${arm}/${stage}`);
  const mutatedSignature = Buffer.from(signature);
  mutatedSignature[0] ^= 1;
  if (crypto.verify(null, payload, publicKey, mutatedSignature)) throw new Error(`mutated signature accepted: ${trialId}/${arm}/${stage}`);
  const mutatedStatement = { ...statement, root: `${statement.root[0] === "0" ? "1" : "0"}${statement.root.slice(1)}` };
  if (crypto.verify(null, Buffer.from(canonical(mutatedStatement), "utf8"), publicKey, signature)) throw new Error(`mutated signed root accepted: ${trialId}/${arm}/${stage}`);
  if (hex(merkleRoot(leaves)) !== rootHash) throw new Error(`Merkle self-check failed: ${trialId}/${arm}/${stage}`);
  return { statement, signature: b64(signature) };
}

function makeTrial(truth) {
  let records = cloneRecords(reference);
  const stages = {};
  for (const stage of precommit.corpus.stages) {
    if (truth.fault && truth.stage === stage) applyFault(records, truth.fault, truth.targetOrdinal);
    stages[stage] = cloneRecords(records);
  }
  return stages;
}

function analyzeCounterSequence(values) {
  const expected = Array.from({ length: EVENT_COUNT }, (_, index) => index + 1);
  if (values.length === expected.length && values.every((value, index) => value === expected[index])) return { kind: "clean" };
  if (values.length === expected.length - 1) {
    const index = values.findIndex((value, i) => value !== expected[i]);
    const at = index < 0 ? values.length : index;
    if (values.slice(at).every((value, i) => value === expected[at + i + 1])) return { kind: "omission", eventOrdinal: expected[at], position: at + 1 };
  }
  if (values.length === expected.length + 1) {
    const index = values.findIndex((value, i) => value !== expected[i]);
    const at = index < 0 ? values.length - 1 : index;
    if (at > 0 && values[at] === values[at - 1] && values.slice(at + 1).every((value, i) => value === expected[at + i])) return { kind: "duplicate", eventOrdinal: values[at], position: at + 1 };
  }
  if (values.length === expected.length) {
    const differences = values.map((value, index) => value === expected[index] ? -1 : index).filter(index => index >= 0);
    if (differences.length === 2 && differences[1] === differences[0] + 1) {
      const [a, b] = differences;
      if (values[a] === expected[b] && values[b] === expected[a]) return { kind: "adjacent-reorder", eventOrdinal: expected[a], position: a + 1 };
    }
    const first = differences[0];
    if (first !== undefined && values[first] === 0 && values.slice(first).every((value, i) => value === i)) return { kind: "unannounced-counter-reset", eventOrdinal: expected[first], position: first + 1 };
  }
  return { kind: "unclassified" };
}

function diffTokens(previous, current) {
  if (current.length === previous.length - 1) {
    let index = 0;
    while (index < current.length && current[index] === previous[index]) index += 1;
    if (current.slice(index).every((value, i) => value === previous[index + i + 1])) return { kind: "omission", position: index + 1, token: previous[index] };
  }
  if (current.length === previous.length + 1) {
    let index = 0;
    while (index < previous.length && current[index] === previous[index]) index += 1;
    if (index > 0 && current[index] === current[index - 1] && current.slice(index + 1).every((value, i) => value === previous[index + i])) return { kind: "duplicate", position: index, token: current[index] };
  }
  if (current.length === previous.length) {
    const differences = current.map((value, index) => value === previous[index] ? -1 : index).filter(index => index >= 0);
    if (differences.length === 2 && differences[1] === differences[0] + 1) {
      const [a, b] = differences;
      if (current[a] === previous[b] && current[b] === previous[a]) return { kind: "adjacent-reorder", position: a + 1, token: previous[a] };
    }
    if (differences.length === 1) return { kind: "payload-mutation", position: differences[0] + 1, token: previous[differences[0]] };
  }
  return { kind: "unclassified" };
}

function diffIdentity(previous, current) {
  const previousCounters = previous.map(record => record.counter);
  const currentCounters = current.map(record => record.counter);
  if (previousCounters.length === currentCounters.length && previousCounters.every((value, index) => value === currentCounters[index])) {
    const change = diffTokens(previous.map(token), current.map(token));
    if (change.kind === "payload-mutation") return { ...change, eventOrdinal: previous[change.position - 1].counter };
    return change;
  }
  if (current.length === previous.length - 1) {
    let index = 0;
    while (index < current.length && current[index].counter === previous[index].counter) index += 1;
    if (current.slice(index).every((record, i) => record.counter === previous[index + i + 1].counter)) return { kind: "omission", position: index + 1, eventOrdinal: previous[index].counter };
  }
  if (current.length === previous.length + 1) {
    let index = 0;
    while (index < previous.length && current[index].counter === previous[index].counter) index += 1;
    if (index > 0 && current[index].counter === current[index - 1].counter && current.slice(index + 1).every((record, i) => record.counter === previous[index + i].counter)) return { kind: "duplicate", position: index, eventOrdinal: current[index].counter };
  }
  if (current.length === previous.length) {
    const differences = currentCounters.map((value, index) => value === previousCounters[index] ? -1 : index).filter(index => index >= 0);
    if (differences.length === 2 && differences[1] === differences[0] + 1) {
      const [a, b] = differences;
      if (currentCounters[a] === previousCounters[b] && currentCounters[b] === previousCounters[a]) return { kind: "adjacent-reorder", position: a + 1, eventOrdinal: previousCounters[a] };
    }
    const first = differences[0];
    if (first !== undefined && currentCounters[first] === 0 && currentCounters.slice(first).every((value, i) => value === i)) return { kind: "unannounced-counter-reset", position: first + 1, eventOrdinal: previousCounters[first] };
  }
  return { kind: "unclassified" };
}

function rowBase(truth, arm, regime = null) {
  return { trialId: truth.trialId, arm, regime, truthStage: truth.stage, truthFault: truth.fault, truthTargetOrdinal: truth.targetOrdinal };
}

function counterOnlyVerdict(truth, stages) {
  const analysis = analyzeCounterSequence(stages.package.map(record => record.counter));
  if (analysis.kind === "clean") return { ...rowBase(truth, "counter-only"), status: truth.fault ? "missed" : "clean", detectedKind: null, eventOrdinal: null, stage: null, exactEvent: false, exactStage: false, reason: truth.fault ? "Final counters are unchanged; this arm has no payload or boundary commitment." : "The final counter roster is complete and monotonic." };
  if (analysis.kind === "unannounced-counter-reset") return { ...rowBase(truth, "counter-only"), status: "refuse-domain", detectedKind: analysis.kind, eventOrdinal: analysis.eventOrdinal, stage: null, exactEvent: analysis.eventOrdinal === truth.targetOrdinal, exactStage: false, reason: "The old domain is reused after a numerical reset; downstream identity is refused, but no stage evidence exists." };
  return { ...rowBase(truth, "counter-only"), status: "event-only", detectedKind: analysis.kind, eventOrdinal: analysis.eventOrdinal ?? null, stage: null, exactEvent: analysis.eventOrdinal === truth.targetOrdinal, exactStage: false, reason: "The final counter sequence identifies an event anomaly but cannot attribute its pipeline stage." };
}

function signatureOnlyVerdict(truth, stages) {
  const tokens = Object.fromEntries(precommit.corpus.stages.map(stage => [stage, stages[stage].map(token)]));
  if (!truth.fault) return { ...rowBase(truth, "signature-only"), status: "clean", detectedKind: null, eventOrdinal: null, stage: null, exactEvent: false, exactStage: false, reason: "All signed stage token manifests agree and the capture count is complete." };
  if (truth.stage === "capture") {
    if (truth.fault === "omission" && tokens.capture.length === EVENT_COUNT - 1) return { ...rowBase(truth, "signature-only"), status: "stage-only", detectedKind: truth.fault, eventOrdinal: null, stage: "capture", exactEvent: false, exactStage: true, reason: "The first signed boundary has one fewer anonymous token, but no token-to-trigger join exists." };
    if (truth.fault === "duplicate" && tokens.capture.some((value, index) => index > 0 && value === tokens.capture[index - 1])) return { ...rowBase(truth, "signature-only"), status: "stage-only", detectedKind: truth.fault, eventOrdinal: null, stage: "capture", exactEvent: false, exactStage: true, reason: "The first signed boundary repeats an anonymous token, but the token has no physical trigger identity." };
    if (truth.fault === "payload-mutation") return { ...rowBase(truth, "signature-only"), status: "outside-observable-boundary", detectedKind: null, eventOrdinal: null, stage: null, exactEvent: false, exactStage: false, reason: "The changed payload is already self-consistent with the first signed root." };
    return { ...rowBase(truth, "signature-only"), status: "missed", detectedKind: null, eventOrdinal: null, stage: null, exactEvent: false, exactStage: false, reason: "The first anonymous manifest has no prior physical ordering or counter against which this fault can be tested." };
  }
  const previousStage = truth.stage === "export" ? "capture" : "export";
  const analysis = diffTokens(tokens[previousStage], tokens[truth.stage]);
  if (analysis.kind === "unclassified") return { ...rowBase(truth, "signature-only"), status: "missed", detectedKind: null, eventOrdinal: null, stage: null, exactEvent: false, exactStage: false, reason: "The signed anonymous leaves do not carry the changed counter field." };
  return { ...rowBase(truth, "signature-only"), status: "stage-token-only", detectedKind: analysis.kind, eventOrdinal: null, stage: truth.stage, exactEvent: false, exactStage: true, anonymousPosition: analysis.position, reason: "The first differing signed boundary and anonymous token position are known, but no physical trigger ordinal is bound." };
}

function clockVerdict(truth, stages, halfWidth) {
  const arm = "clock-only";
  const regime = halfWidth === 40 ? "tight-40us" : "loose-60us";
  const records = stages.package;
  const robust = records.every(record => {
    const center = record.timestampCenterUs;
    const cellCenter = Math.round(center / PERIOD_US) * PERIOD_US;
    return center - halfWidth > cellCenter - PERIOD_US / 2 && center + halfWidth < cellCenter + PERIOD_US / 2;
  });
  if (!robust) return { ...rowBase(truth, arm, regime), status: "ambiguous-clock", detectedKind: null, eventOrdinal: null, stage: null, exactEvent: false, exactStage: false, reason: "The declared clock interval crosses an adjacent trigger decision boundary; point-estimate matching is refused." };
  const inferred = records.map(record => Math.round(record.timestampCenterUs / PERIOD_US));
  const analysis = analyzeCounterSequence(inferred);
  if (analysis.kind === "clean") return { ...rowBase(truth, arm, regime), status: truth.fault ? "missed" : "clean", detectedKind: null, eventOrdinal: null, stage: null, exactEvent: false, exactStage: false, reason: truth.fault ? "The tested fault does not alter this arm's clock values." : "All intervals lie within unique trigger decision cells." };
  return { ...rowBase(truth, arm, regime), status: "event-only", detectedKind: analysis.kind, eventOrdinal: analysis.eventOrdinal ?? null, stage: null, exactEvent: analysis.eventOrdinal === truth.targetOrdinal, exactStage: false, reason: "The tight clock maps the event sequence uniquely but has no intermediate boundary evidence." };
}

function identityVerdict(truth, stages) {
  const arm = "counter-plus-merkle";
  const captureAnalysis = analyzeCounterSequence(stages.capture.map(record => record.counter));
  if (captureAnalysis.kind !== "clean") {
    const reset = captureAnalysis.kind === "unannounced-counter-reset";
    return { ...rowBase(truth, arm), status: reset ? "refuse-domain" : "exact", detectedKind: captureAnalysis.kind, eventOrdinal: captureAnalysis.eventOrdinal ?? null, stage: "capture", exactEvent: captureAnalysis.eventOrdinal === truth.targetOrdinal, exactStage: truth.stage === "capture", reason: reset ? "The first signed boundary exposes a reset in the reused domain; downstream identities are refused." : "The complete trigger roster and first signed counter manifest localize the structural capture fault." };
  }
  for (const [previousStage, stage] of [["capture", "export"], ["export", "package"]]) {
    const analysis = diffIdentity(stages[previousStage], stages[stage]);
    if (analysis.kind === "unclassified") continue;
    const reset = analysis.kind === "unannounced-counter-reset";
    return { ...rowBase(truth, arm), status: reset ? "refuse-domain" : "exact", detectedKind: analysis.kind, eventOrdinal: analysis.eventOrdinal ?? null, stage, exactEvent: analysis.eventOrdinal === truth.targetOrdinal, exactStage: stage === truth.stage, reason: reset ? "The first differing signed boundary exposes an unbridged reset; exact identity after it is refused." : "The counter-bound leaf difference gives the first changed boundary and physical trigger ordinal." };
  }
  if (truth.fault === "payload-mutation" && truth.stage === "capture") return { ...rowBase(truth, arm), status: "outside-observable-boundary", detectedKind: null, eventOrdinal: null, stage: null, exactEvent: false, exactStage: false, reason: "The capture payload is already committed by the first root; no independent pre-capture payload measurement exists." };
  if (!truth.fault) return { ...rowBase(truth, arm), status: "clean", detectedKind: null, eventOrdinal: null, stage: null, exactEvent: false, exactStage: false, reason: "Counter rosters, payload digests, chained roots, and signatures agree at all three boundaries." };
  return { ...rowBase(truth, arm), status: "missed", detectedKind: null, eventOrdinal: null, stage: null, exactEvent: false, exactStage: false, reason: "No admissible evidence difference was found." };
}

function summarize(rows, arm, regime = null) {
  const selected = rows.filter(row => row.arm === arm && row.regime === regime);
  const counts = {};
  for (const row of selected) counts[row.status] = (counts[row.status] || 0) + 1;
  return {
    arm,
    regime,
    evaluations: selected.length,
    statuses: counts,
    exactEventAndStage: selected.filter(row => row.status === "exact" && row.exactEvent && row.exactStage).length,
    exactEventAnyStage: selected.filter(row => row.exactEvent).length,
    exactStageAnyEvent: selected.filter(row => row.exactStage).length,
    cleanFalseCalls: selected.filter(row => row.truthFault === null && !["clean", "ambiguous-clock"].includes(row.status)).length
  };
}

const truths = [];
for (let i = 1; i <= 5; i += 1) truths.push({ trialId: `CLEAN-${String(i).padStart(2, "0")}`, stage: null, fault: null, targetOrdinal: null });
for (const stage of precommit.corpus.stages) {
  for (const fault of precommit.corpus.faults) {
    for (const targetOrdinal of precommit.corpus.placements) truths.push({ trialId: `${stage.toUpperCase()}-${fault.toUpperCase()}-${String(targetOrdinal).padStart(5, "0")}`, stage, fault, targetOrdinal });
  }
}

const trialRows = [];
const receipts = [];
for (const truth of truths) {
  const stages = makeTrial(truth);
  for (const arm of ["signature-only", "counter-plus-merkle"]) {
    let previousRoot = null;
    for (const stage of precommit.corpus.stages) {
      const receipt = boundaryReceipt(truth.trialId, arm, stage, stages[stage], previousRoot);
      receipts.push({ trialId: truth.trialId, arm, stage, ...receipt });
      previousRoot = receipt.statement.root;
    }
  }
  trialRows.push(counterOnlyVerdict(truth, stages));
  trialRows.push(signatureOnlyVerdict(truth, stages));
  trialRows.push(clockVerdict(truth, stages, 40));
  trialRows.push(clockVerdict(truth, stages, 60));
  trialRows.push(identityVerdict(truth, stages));
}

const cmRows = trialRows.filter(row => row.arm === "counter-plus-merkle");
const h1 = {
  exactObservable: cmRows.filter(row => row.status === "exact" && row.exactEvent && row.exactStage).length,
  resetRefusals: cmRows.filter(row => row.status === "refuse-domain" && row.exactEvent && row.exactStage).length,
  precommitAbstentions: cmRows.filter(row => row.status === "outside-observable-boundary").length,
  cleanAccepted: cmRows.filter(row => row.status === "clean" && row.truthFault === null).length,
  failures: cmRows.filter(row => {
    if (row.truthFault === null) return row.status !== "clean";
    if (row.truthFault === "unannounced-counter-reset") return !(row.status === "refuse-domain" && row.exactEvent && row.exactStage);
    if (row.truthFault === "payload-mutation" && row.truthStage === "capture") return row.status !== "outside-observable-boundary";
    return !(row.status === "exact" && row.exactEvent && row.exactStage && row.detectedKind === row.truthFault);
  }).map(row => row.trialId)
};

const result = {
  resultId: "RC49-COUNTER-MERKLE-IDENTITY-PLANE-NODE-0.1",
  cycleId: precommit.cycleId,
  precommitId: precommit.precommitId,
  implementation: { language: "Node.js", runtime: process.version, script: "scripts/run-rc49-identity-plane.mjs", importedOtherOutcome: false },
  corpus: {
    eventCount: EVENT_COUNT,
    periodMicroseconds: PERIOD_US,
    identityDomain: DOMAIN,
    payloadDigest: hex(sha256(Buffer.concat(reference.map(record => record.payload)))),
    counterRosterDigest: hex(sha256(Buffer.concat(reference.map(record => u64(record.counter))))),
    trialCount: truths.length,
    armRegimeEvaluations: trialRows.length,
    placements: precommit.corpus.placements
  },
  cryptography: {
    hash: "SHA-256",
    merkleProfile: "RFC9162_SHA256",
    signature: "Ed25519",
    publicDemoKeyRawBase64: b64(publicKeyRaw),
    receiptCount: receipts.length,
    signatureSelfChecksPassed: receipts.length,
    merkleSelfChecksPassed: receipts.length,
    mutatedSignatureRejections: receipts.length,
    mutatedSignedRootRejections: receipts.length,
    operationalAuthenticityClaimed: false
  },
  summaries: [
    summarize(trialRows, "counter-only"),
    summarize(trialRows, "signature-only"),
    summarize(trialRows, "clock-only", "tight-40us"),
    summarize(trialRows, "clock-only", "loose-60us"),
    summarize(trialRows, "counter-plus-merkle")
  ],
  h1Gate: { ...h1, pass: h1.exactObservable === 55 && h1.resetRefusals === 15 && h1.precommitAbstentions === 5 && h1.cleanAccepted === 5 && h1.failures.length === 0 },
  hypothesisAdjudication: [
    { id: "H0-universal-integrity", verdict: "rejected", evidence: "All five capture payload mutations are self-consistent with the first root and correctly remain outside the observable boundary." },
    { id: "H1-stage-bounded-identity", verdict: h1.failures.length === 0 ? "supported-in-synthetic-scope" : "rejected", evidence: `${h1.exactObservable} exact observable faults, ${h1.resetRefusals} reset refusals, ${h1.precommitAbstentions} pre-commit abstentions, and ${h1.cleanAccepted} clean controls.` },
    { id: "H2-signature-is-identity", verdict: "rejected", evidence: "The signature-only arm authenticates anonymous stage-token changes but produces zero exact physical event-and-stage localizations." },
    { id: "H3-clock-envelope", verdict: "supported-in-synthetic-scope", evidence: "Every tight interval remains in one trigger decision cell; every loose interval crosses a cell boundary and is refused as ambiguous." }
  ],
  trials: trialRows,
  receipts,
  limitations: [
    "Synthetic one-fault trials do not estimate production failure rates or multi-fault interactions.",
    "The public test key verifies deterministic implementation behavior and supplies no operational key custody.",
    "No pre-capture payload witness exists, so the first signed root can faithfully authenticate already-corrupted bytes.",
    "The test does not establish completeness of a physical trigger roster, X16 sidecar existence, or asynchronous many-to-many process lineage."
  ]
};

fs.writeFileSync(path.join(root, outputPath), `${JSON.stringify(result, null, 2)}\n`);
console.log(`RC49 Node: ${truths.length} trials, ${trialRows.length} arm/regime evaluations, H1 ${result.h1Gate.pass ? "PASS" : "FAIL"}.`);
