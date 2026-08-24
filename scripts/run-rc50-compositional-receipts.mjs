import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const precommit = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/rc50-compositional-receipts-precommit.json"), "utf8"));
const outputArg = process.argv.indexOf("--output");
const wireArg = process.argv.indexOf("--wire-output");
const outputPath = path.join(root, outputArg >= 0 ? process.argv[outputArg + 1] : "research/reproducibility/rc50-compositional-receipts-node.json");
const wirePath = path.join(root, wireArg >= 0 ? process.argv[wireArg + 1] : "research/reproducibility/rc50-compositional-receipts-wire-vectors.json");

const sha256 = value => crypto.createHash("sha256").update(value).digest();
const hex = value => Buffer.from(value).toString("hex");
const b64 = value => Buffer.from(value).toString("base64");
const u64 = value => {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(BigInt(value));
  return out;
};
const canonical = value => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
};

function makeKey(label) {
  const seed = sha256(Buffer.from(`RC50-PUBLIC-DEMO-KEY:${label}`, "utf8"));
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]),
    format: "der",
    type: "pkcs8"
  });
  const publicKey = crypto.createPublicKey(privateKey);
  return {
    label,
    kid: Buffer.from(`rc50-${label}`, "utf8"),
    privateKey,
    publicKey,
    publicRaw: publicKey.export({ format: "der", type: "spki" }).subarray(-32)
  };
}

const keys = Object.fromEntries(["event-issuer", "pre-capture-witness", "capture-writer", "reset-authority", "reset-witness", "log-a", "log-b"].map(label => [label, makeKey(label)]));

function cborHead(major, value) {
  const n = BigInt(value);
  if (n < 24n) return Buffer.from([(major << 5) | Number(n)]);
  if (n <= 0xffn) return Buffer.from([(major << 5) | 24, Number(n)]);
  if (n <= 0xffffn) {
    const out = Buffer.alloc(3);
    out[0] = (major << 5) | 25;
    out.writeUInt16BE(Number(n), 1);
    return out;
  }
  if (n <= 0xffffffffn) {
    const out = Buffer.alloc(5);
    out[0] = (major << 5) | 26;
    out.writeUInt32BE(Number(n), 1);
    return out;
  }
  if (n <= 0xffffffffffffffffn) {
    const out = Buffer.alloc(9);
    out[0] = (major << 5) | 27;
    out.writeBigUInt64BE(n, 1);
    return out;
  }
  throw new Error("CBOR integer outside uint64");
}

const tag18 = value => ({ __cborTag: 18, value });

function encodeCbor(value) {
  if (value && typeof value === "object" && value.__cborTag !== undefined) return Buffer.concat([cborHead(6, value.__cborTag), encodeCbor(value.value)]);
  if (value === null) return Buffer.from([0xf6]);
  if (value === false) return Buffer.from([0xf4]);
  if (value === true) return Buffer.from([0xf5]);
  if (typeof value === "number" || typeof value === "bigint") {
    const n = BigInt(value);
    return n >= 0n ? cborHead(0, n) : cborHead(1, -1n - n);
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([cborHead(2, bytes.length), bytes]);
  }
  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([cborHead(3, bytes.length), bytes]);
  }
  if (Array.isArray(value)) return Buffer.concat([cborHead(4, value.length), ...value.map(encodeCbor)]);
  if (value instanceof Map) {
    const pairs = [...value.entries()].map(([key, member]) => ({ key: encodeCbor(key), member: encodeCbor(member) }));
    pairs.sort((a, b) => Buffer.compare(a.key, b.key));
    return Buffer.concat([cborHead(5, pairs.length), ...pairs.flatMap(pair => [pair.key, pair.member])]);
  }
  throw new Error(`unsupported CBOR value: ${typeof value}`);
}

function decodeCbor(buffer) {
  const bytes = Buffer.from(buffer);
  let offset = 0;
  const readLength = additional => {
    if (additional < 24) return BigInt(additional);
    if (additional === 24) return BigInt(bytes[offset++]);
    if (additional === 25) { const n = bytes.readUInt16BE(offset); offset += 2; return BigInt(n); }
    if (additional === 26) { const n = bytes.readUInt32BE(offset); offset += 4; return BigInt(n); }
    if (additional === 27) { const n = bytes.readBigUInt64BE(offset); offset += 8; return n; }
    throw new Error("indefinite or reserved CBOR length");
  };
  const parse = () => {
    if (offset >= bytes.length) throw new Error("truncated CBOR");
    const initial = bytes[offset++];
    const major = initial >> 5;
    const additional = initial & 31;
    if (major === 7) {
      if (additional === 20) return false;
      if (additional === 21) return true;
      if (additional === 22) return null;
      throw new Error("unsupported CBOR simple value");
    }
    const length = readLength(additional);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CBOR length outside safe range");
    const n = Number(length);
    if (major === 0) return n;
    if (major === 1) return -1 - n;
    if (major === 2) { const out = bytes.subarray(offset, offset + n); if (out.length !== n) throw new Error("truncated bstr"); offset += n; return Buffer.from(out); }
    if (major === 3) { const out = bytes.subarray(offset, offset + n); if (out.length !== n) throw new Error("truncated tstr"); offset += n; return out.toString("utf8"); }
    if (major === 4) return Array.from({ length: n }, parse);
    if (major === 5) {
      const out = new Map();
      const encodedKeys = new Set();
      for (let i = 0; i < n; i += 1) {
        const start = offset;
        const key = parse();
        const encoded = hex(bytes.subarray(start, offset));
        if (encodedKeys.has(encoded)) throw new Error("duplicate CBOR map key");
        encodedKeys.add(encoded);
        out.set(key, parse());
      }
      return out;
    }
    if (major === 6) return { __cborTag: n, value: parse() };
    throw new Error("unsupported CBOR major type");
  };
  const value = parse();
  if (offset !== bytes.length) throw new Error("trailing CBOR bytes");
  if (!encodeCbor(value).equals(bytes)) throw new Error("non-deterministic CBOR encoding");
  return value;
}

function signRaw(key, payload) {
  const signature = crypto.sign(null, payload, key.privateKey);
  if (!crypto.verify(null, payload, key.publicKey, signature)) throw new Error(`raw signature self-check failed: ${key.label}`);
  return signature;
}

function coseProtected(key, issuer, subject, contentType, receipt = false) {
  const map = new Map([
    [1, -8],
    [3, contentType],
    [4, key.kid],
    [15, new Map([[1, issuer], [2, subject]])],
    [16, receipt ? "application/scitt-receipt+cose" : "application/scitt-statement+cose"]
  ]);
  if (receipt) map.set(395, 1);
  return encodeCbor(map);
}

function coseSign1({ key, issuer, subject, contentType, payload, unprotected = new Map(), detached = false, receipt = false }) {
  const protectedBytes = coseProtected(key, issuer, subject, contentType, receipt);
  const toBeSigned = encodeCbor(["Signature1", protectedBytes, Buffer.alloc(0), payload]);
  const signature = signRaw(key, toBeSigned);
  const structure = [protectedBytes, unprotected, detached ? null : payload, signature];
  return { bytes: encodeCbor(tag18(structure)), protectedBytes, unprotected, payload, signature, structure };
}

function verifyCoseSign1(bytes, key, detachedPayload = null, requireReceipt = false) {
  const tagged = decodeCbor(bytes);
  if (tagged.__cborTag !== 18 || !Array.isArray(tagged.value) || tagged.value.length !== 4) return false;
  const [protectedBytes, unprotected, attached, signature] = tagged.value;
  if (!Buffer.isBuffer(protectedBytes) || !(unprotected instanceof Map) || !Buffer.isBuffer(signature)) return false;
  const protectedMap = decodeCbor(protectedBytes);
  if (!(protectedMap instanceof Map) || protectedMap.get(1) !== -8 || !Buffer.from(protectedMap.get(4) || []).equals(key.kid)) return false;
  const claims = protectedMap.get(15);
  if (!(claims instanceof Map) || typeof claims.get(1) !== "string" || typeof claims.get(2) !== "string") return false;
  if (requireReceipt && (protectedMap.get(395) !== 1 || protectedMap.get(16) !== "application/scitt-receipt+cose")) return false;
  const payload = attached === null ? detachedPayload : attached;
  if (!Buffer.isBuffer(payload)) return false;
  return crypto.verify(null, encodeCbor(["Signature1", protectedBytes, Buffer.alloc(0), payload]), key.publicKey, signature);
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

function inclusionProof(entries, index) {
  if (index < 0 || index >= entries.length) throw new Error("inclusion index outside tree");
  if (entries.length === 1) return [];
  const k = largestPowerBelow(entries.length);
  if (index < k) return [...inclusionProof(entries.slice(0, k), index), merkleRoot(entries.slice(k))];
  return [...inclusionProof(entries.slice(k), index - k), merkleRoot(entries.slice(0, k))];
}

function inclusionRoot(entry, index, size, proof) {
  if (index < 0 || index >= size) throw new Error("invalid inclusion coordinates");
  let fn = index;
  let sn = size - 1;
  let r = sha256(Buffer.concat([Buffer.from([0]), entry]));
  for (const p of proof) {
    if (sn === 0) throw new Error("long inclusion path");
    if ((fn & 1) === 1 || fn === sn) {
      r = sha256(Buffer.concat([Buffer.from([1]), p, r]));
      if ((fn & 1) === 0) {
        while ((fn & 1) === 0 && fn !== 0) { fn >>= 1; sn >>= 1; }
      }
    } else r = sha256(Buffer.concat([Buffer.from([1]), r, p]));
    fn >>= 1;
    sn >>= 1;
  }
  if (sn !== 0) throw new Error("short inclusion path");
  return r;
}

function consistencyProof(entries, first) {
  if (!(first > 0 && first < entries.length)) throw new Error("invalid consistency sizes");
  const subproof = (slice, m, complete) => {
    if (m === slice.length) return complete ? [] : [merkleRoot(slice)];
    const k = largestPowerBelow(slice.length);
    if (m <= k) return [...subproof(slice.slice(0, k), m, complete), merkleRoot(slice.slice(k))];
    return [...subproof(slice.slice(k), m - k, false), merkleRoot(slice.slice(0, k))];
  };
  return subproof(entries, first, true);
}

function verifyConsistency(first, second, firstRoot, secondRoot, path) {
  if (!(first > 0 && first < second) || path.length === 0) return false;
  const work = [...path];
  if ((first & (first - 1)) === 0) work.unshift(firstRoot);
  let fn = first - 1;
  let sn = second - 1;
  while ((fn & 1) === 1) { fn >>= 1; sn >>= 1; }
  let fr = work[0];
  let sr = work[0];
  for (const c of work.slice(1)) {
    if (sn === 0) return false;
    if ((fn & 1) === 1 || fn === sn) {
      fr = sha256(Buffer.concat([Buffer.from([1]), c, fr]));
      sr = sha256(Buffer.concat([Buffer.from([1]), c, sr]));
      if ((fn & 1) === 0) {
        while ((fn & 1) === 0 && fn !== 0) { fn >>= 1; sn >>= 1; }
      }
    } else sr = sha256(Buffer.concat([Buffer.from([1]), sr, c]));
    fn >>= 1;
    sn >>= 1;
  }
  return sn === 0 && fr.equals(firstRoot) && sr.equals(secondRoot);
}

const EVENT_COUNT = precommit.corpus.eventCount;
const OLD_DOMAIN = precommit.corpus.oldIdentityDomain;
const NEW_DOMAIN = precommit.corpus.newIdentityDomain;
const salt = Buffer.from("RC50-1024-CORPUS-PUBLIC-SALT-v1", "utf8");
const reference = Array.from({ length: EVENT_COUNT }, (_, index) => {
  const ordinal = index + 1;
  return {
    ordinal,
    domain: OLD_DOMAIN,
    counter: ordinal,
    payload: sha256(Buffer.concat([Buffer.from("UP-RC50-PAYLOAD-v1\0", "utf8"), u64(ordinal), salt]))
  };
});
const cloneRecords = records => records.map(record => ({ ...record, payload: Buffer.from(record.payload) }));
const recordView = record => ({ ordinal: record.ordinal, domain: record.domain, counter: record.counter, payload: hex(record.payload) });
const stateDigest = states => hex(sha256(Buffer.from(canonical(Object.fromEntries(Object.entries(states).map(([name, records]) => [name, records.map(recordView)]))), "utf8")));

function applyAuthorizedReset(records, ordinal) {
  for (const record of records) {
    if (record.ordinal >= ordinal) {
      record.domain = NEW_DOMAIN;
      record.counter = record.ordinal - ordinal;
    }
  }
}

function mutate(records, ordinal) {
  const record = records.find(item => item.ordinal === ordinal);
  if (!record) throw new Error(`mutation target absent: ${ordinal}`);
  record.payload[0] ^= 1;
}

function omit(records, ordinal) {
  const index = records.findIndex(item => item.ordinal === ordinal);
  if (index < 0) throw new Error(`omission target absent: ${ordinal}`);
  records.splice(index, 1);
}

function reorder(records, ordinal) {
  const index = records.findIndex(item => item.ordinal === ordinal);
  if (index < 0 || index + 1 >= records.length) throw new Error(`reorder target invalid: ${ordinal}`);
  [records[index], records[index + 1]] = [records[index + 1], records[index]];
}

function manifestRoot(records) {
  const entries = records.map(record => encodeCbor(new Map([
    [1, record.ordinal], [2, record.domain], [3, record.counter], [4, sha256(record.payload)]
  ])));
  return merkleRoot(entries);
}

function signEvidence(trialId, role, stage, records) {
  const statement = Buffer.from(canonical({ trialId, role, stage, treeSize: records.length, root: hex(manifestRoot(records)) }), "utf8");
  const signature = signRaw(keys[role], statement);
  const bad = Buffer.from(signature);
  bad[0] ^= 1;
  if (crypto.verify(null, statement, keys[role].publicKey, bad)) throw new Error(`mutated evidence signature accepted: ${trialId}/${role}/${stage}`);
  return { root: hex(manifestRoot(records)), signature: hex(signature) };
}

function bridgePayload(resetOrdinal, nonce, newDomain = NEW_DOMAIN) {
  const oldRecords = cloneRecords(reference.slice(0, resetOrdinal - 1));
  return {
    schemaVersion: "UP-RC50-RESET-BRIDGE-v1",
    subject: "urn:unsolved:rc50:trigger-stream",
    oldDomain: OLD_DOMAIN,
    oldRoot: hex(manifestRoot(oldRecords)),
    oldClosingCounter: resetOrdinal - 1,
    newDomain,
    newCounterOrigin: 0,
    newPhysicalOrdinal: resetOrdinal,
    reasonCode: "authorized-recorder-restart",
    nonce,
    policyDigest: hex(sha256(Buffer.from("UP-RC50-RESET-POLICY-v1", "utf8")))
  };
}

function signedBridge(resetOrdinal, nonce, newDomain = NEW_DOMAIN) {
  const payload = bridgePayload(resetOrdinal, nonce, newDomain);
  const bytes = Buffer.from(canonical(payload), "utf8");
  return {
    payload,
    digest: hex(sha256(bytes)),
    authoritySignature: hex(signRaw(keys["reset-authority"], bytes)),
    witnessSignature: hex(signRaw(keys["reset-witness"], bytes))
  };
}

function inferOps(previous, current, stage) {
  const previousMap = new Map(previous.map(record => [record.ordinal, record]));
  const currentMap = new Map(current.map(record => [record.ordinal, record]));
  const operations = [];
  for (const ordinal of [...previousMap.keys()].sort((a, b) => a - b)) {
    if (!currentMap.has(ordinal)) operations.push({ kind: "omission", ordinal, stage });
    else if (!previousMap.get(ordinal).payload.equals(currentMap.get(ordinal).payload)) operations.push({ kind: "payload-mutation", ordinal, stage });
  }
  const previousCommon = previous.map(record => record.ordinal).filter(ordinal => currentMap.has(ordinal));
  const currentCommon = current.map(record => record.ordinal).filter(ordinal => previousMap.has(ordinal));
  const differences = previousCommon.map((ordinal, index) => ordinal === currentCommon[index] ? -1 : index).filter(index => index >= 0);
  if (differences.length === 2 && differences[1] === differences[0] + 1) {
    const [a, b] = differences;
    if (previousCommon[a] === currentCommon[b] && previousCommon[b] === currentCommon[a]) operations.push({ kind: "adjacent-reorder", ordinal: Math.min(previousCommon[a], previousCommon[b]), stage });
  }
  return operations.sort((a, b) => a.ordinal - b.ordinal || a.kind.localeCompare(b.kind));
}

function firstEvidenceChange(states) {
  for (const [before, after, stage] of [["witness", "capture", "capture"], ["capture", "export", "export"], ["export", "package", "package"]]) {
    const operations = inferOps(states[before], states[after], stage);
    if (operations.length) return { stage, operations };
  }
  return { stage: null, operations: [] };
}

function buildStageTrial(spec, counterfactual = false) {
  let base = cloneRecords(reference);
  if (spec.resetOrdinal) applyAuthorizedReset(base, spec.resetOrdinal);
  if (spec.collusionOrdinal) mutate(base, spec.collusionOrdinal);
  const states = { witness: cloneRecords(base) };
  let records = cloneRecords(base);
  for (const stage of precommit.corpus.stages) {
    if (spec.stage === stage) {
      if (spec.kind === "mutation-reorder") { mutate(records, spec.target); reorder(records, spec.target + 1); }
      else if (spec.kind === "mutation-omission-disjoint") { mutate(records, spec.target); omit(records, spec.target + 2); }
      else if (spec.kind === "mutation-omission-shadow") { if (!counterfactual) mutate(records, spec.target); omit(records, spec.target); }
      else if (spec.kind === "reset-omission") omit(records, spec.target + 1);
    }
    states[stage] = cloneRecords(records);
  }
  return states;
}

function evidenceSignatures(trialId, states) {
  return {
    witness: signEvidence(trialId, "pre-capture-witness", "witness", states.witness),
    capture: signEvidence(trialId, "capture-writer", "capture", states.capture),
    export: signEvidence(trialId, "capture-writer", "export", states.export),
    package: signEvidence(trialId, "capture-writer", "package", states.package)
  };
}

function makeStageRow(spec) {
  const states = buildStageTrial(spec);
  const signatures = evidenceSignatures(spec.trialId, states);
  const observed = firstEvidenceChange(states);
  let status;
  let candidates;
  let operations = observed.operations;
  let bridge = null;
  if (spec.kind === "clean") {
    status = "clean";
    candidates = ["no-in-scope-transformation"];
  } else if (spec.kind === "reset-omission") {
    bridge = signedBridge(spec.resetOrdinal, `nonce-${spec.resetOrdinal}-${spec.stage}`);
    status = "exact-composite";
    operations = [{ kind: "authorized-reset", ordinal: spec.resetOrdinal, stage: "identity-transition" }, ...observed.operations];
    candidates = [`authorized-reset@${spec.resetOrdinal}+omission@${spec.target + 1}/${spec.stage}`];
  } else if (spec.kind === "mutation-reorder" || spec.kind === "mutation-omission-disjoint") {
    status = "exact-composite";
    candidates = [operations.map(op => `${op.kind}@${op.ordinal}/${op.stage}`).join("+")];
  } else if (spec.kind === "mutation-omission-shadow") {
    const counterfactual = buildStageTrial(spec, true);
    if (stateDigest(states) !== stateDigest(counterfactual)) throw new Error(`shadow counterfactual differs: ${spec.trialId}`);
    status = "set-valued-shadow";
    candidates = [`omission-only@${spec.target}/${spec.stage}`, `mutation-then-omission@${spec.target}/${spec.stage}`];
    operations = observed.operations;
  } else if (spec.kind === "collusion") {
    status = "outside-independent-boundary";
    candidates = [`payload-originated-as-observed@${spec.target}`, `witness-and-writer-common-cause@${spec.target}`];
    operations = [];
  } else throw new Error(`unknown stage trial kind: ${spec.kind}`);
  return {
    trialId: spec.trialId,
    kind: spec.kind,
    placement: spec.target ?? null,
    stage: spec.stage ?? null,
    evidenceDigest: stateDigest(states),
    earliestChangedBoundary: observed.stage,
    operations,
    candidates,
    bridgeDigest: bridge?.digest ?? null,
    evidenceSignatureDigest: hex(sha256(Buffer.from(canonical(signatures), "utf8"))),
    crossViewStatus: status,
    receiptLocalStatus: status === "clean" ? "authenticated-clean-snapshot" : "authenticated-no-causal-verdict",
    statefulSingleViewStatus: status
  };
}

const stageSpecs = [];
for (let i = 1; i <= 3; i += 1) stageSpecs.push({ trialId: `CLEAN-${String(i).padStart(2, "0")}`, kind: "clean" });
for (const stage of precommit.corpus.stages) for (const target of precommit.corpus.placements) stageSpecs.push({ trialId: `RESET-OMIT-${stage.toUpperCase()}-${target}`, kind: "reset-omission", stage, target, resetOrdinal: target });
for (const stage of precommit.corpus.stages) for (const target of precommit.corpus.placements) stageSpecs.push({ trialId: `MUTATE-REORDER-${stage.toUpperCase()}-${target}`, kind: "mutation-reorder", stage, target });
for (const stage of precommit.corpus.stages) for (const target of precommit.corpus.placements) stageSpecs.push({ trialId: `MUTATE-OMIT-DISJOINT-${stage.toUpperCase()}-${target}`, kind: "mutation-omission-disjoint", stage, target });
for (let i = 0; i < precommit.corpus.stages.length; i += 1) stageSpecs.push({ trialId: `MUTATE-OMIT-SHADOW-${precommit.corpus.stages[i].toUpperCase()}`, kind: "mutation-omission-shadow", stage: precommit.corpus.stages[i], target: precommit.corpus.placements[i] });
for (const [index, target] of [17, 998].entries()) stageSpecs.push({ trialId: `WITNESS-COLLUSION-${String(index + 1).padStart(2, "0")}`, kind: "collusion", target, collusionOrdinal: target });

const rows = stageSpecs.map(makeStageRow);

const cleanEntryBytes = reference.map(record => Buffer.from(canonical(recordView(record)), "utf8"));
const cleanRoot = merkleRoot(cleanEntryBytes);
for (const size of precommit.corpus.trialSchedule["signed-log-rollback"] ? [17, 257, 998] : []) {
  const prefixRoot = merkleRoot(cleanEntryBytes.slice(0, size));
  const head = Buffer.from(canonical({ log: "log-a", size, root: hex(prefixRoot) }), "utf8");
  const signature = signRaw(keys["log-a"], head);
  rows.push({
    trialId: `ROLLBACK-${size}`,
    kind: "rollback",
    placement: size,
    stage: null,
    evidenceDigest: hex(sha256(Buffer.concat([cleanRoot, prefixRoot, signature]))),
    earliestChangedBoundary: "retained-log-head",
    operations: [],
    candidates: ["stale-valid-prefix-replayed", "transparency-service-rolled-back"],
    bridgeDigest: null,
    evidenceSignatureDigest: hex(sha256(signature)),
    crossViewStatus: "refuse-rollback",
    receiptLocalStatus: "accepted-valid-local-receipt",
    statefulSingleViewStatus: "refuse-rollback"
  });
}

for (let i = 1; i <= 2; i += 1) {
  const subject = `urn:unsolved:rc50:equivocal-event:${i}`;
  const a = Buffer.from(canonical({ issuer: "event-issuer", subject, sequence: i, payload: `view-a-${i}` }), "utf8");
  const b = Buffer.from(canonical({ issuer: "event-issuer", subject, sequence: i, payload: `view-b-${i}` }), "utf8");
  const sa = signRaw(keys["event-issuer"], a);
  const sb = signRaw(keys["event-issuer"], b);
  rows.push({
    trialId: `ISSUER-EQUIVOCATION-${String(i).padStart(2, "0")}`,
    kind: "issuer-equivocation",
    placement: null,
    stage: null,
    evidenceDigest: hex(sha256(Buffer.concat([a, b, sa, sb]))),
    earliestChangedBoundary: "cross-service-subject-sequence",
    operations: [],
    candidates: [hex(sha256(a)), hex(sha256(b))],
    bridgeDigest: null,
    evidenceSignatureDigest: hex(sha256(Buffer.concat([sa, sb]))),
    crossViewStatus: "refuse-issuer-equivocation",
    receiptLocalStatus: "accepted-valid-local-receipt",
    statefulSingleViewStatus: "accepted-single-view"
  });
}

for (let i = 1; i <= 2; i += 1) {
  const size = 500 + i;
  const a = Buffer.from(canonical({ log: "log-a", size, root: hex(sha256(Buffer.from(`log-view-a-${i}`))) }), "utf8");
  const b = Buffer.from(canonical({ log: "log-a", size, root: hex(sha256(Buffer.from(`log-view-b-${i}`))) }), "utf8");
  const sa = signRaw(keys["log-a"], a);
  const sb = signRaw(keys["log-a"], b);
  rows.push({
    trialId: `LOG-EQUIVOCATION-${String(i).padStart(2, "0")}`,
    kind: "log-equivocation",
    placement: null,
    stage: null,
    evidenceDigest: hex(sha256(Buffer.concat([a, b, sa, sb]))),
    earliestChangedBoundary: "cross-observer-log-head",
    operations: [],
    candidates: [hex(sha256(a)), hex(sha256(b))],
    bridgeDigest: null,
    evidenceSignatureDigest: hex(sha256(Buffer.concat([sa, sb]))),
    crossViewStatus: "refuse-log-equivocation",
    receiptLocalStatus: "accepted-valid-local-receipt",
    statefulSingleViewStatus: "accepted-single-view"
  });
}

const acceptedBridge = signedBridge(257, "nonce-bridge-attack");
rows.push({
  trialId: "BRIDGE-REPLAY-01",
  kind: "bridge-replay",
  placement: 257,
  stage: null,
  evidenceDigest: acceptedBridge.digest,
  earliestChangedBoundary: "bridge-registry",
  operations: [],
  candidates: ["same-authorized-bridge-presented-twice"],
  bridgeDigest: acceptedBridge.digest,
  evidenceSignatureDigest: hex(sha256(Buffer.from(acceptedBridge.authoritySignature + acceptedBridge.witnessSignature, "utf8"))),
  crossViewStatus: "reject-bridge-replay",
  receiptLocalStatus: "accepted-valid-signatures",
  statefulSingleViewStatus: "reject-bridge-replay"
});
const forkA = signedBridge(257, "nonce-bridge-fork", NEW_DOMAIN);
const forkB = signedBridge(257, "nonce-bridge-fork", "RC50-SYNTHETIC-TRIGGER-DOMAIN-C");
rows.push({
  trialId: "BRIDGE-FORK-01",
  kind: "bridge-fork",
  placement: 257,
  stage: null,
  evidenceDigest: hex(sha256(Buffer.from(forkA.digest + forkB.digest, "utf8"))),
  earliestChangedBoundary: "bridge-registry",
  operations: [],
  candidates: [forkA.digest, forkB.digest],
  bridgeDigest: forkA.digest,
  evidenceSignatureDigest: hex(sha256(Buffer.from(forkA.authoritySignature + forkA.witnessSignature + forkB.authoritySignature + forkB.witnessSignature, "utf8"))),
  crossViewStatus: "reject-bridge-fork",
  receiptLocalStatus: "accepted-valid-signatures",
  statefulSingleViewStatus: "reject-bridge-fork"
});

function summarizeArm(field) {
  const statuses = {};
  for (const row of rows) statuses[row[field]] = (statuses[row[field]] || 0) + 1;
  return { evaluations: rows.length, statuses };
}

function buildStatement(record) {
  const payload = encodeCbor(new Map([
    [1, "UP-RC50-EVENT-v1"],
    [2, record.ordinal],
    [3, record.domain],
    [4, record.counter],
    [5, sha256(record.payload)]
  ]));
  return coseSign1({
    key: keys["event-issuer"],
    issuer: "urn:unsolved:rc50:event-issuer",
    subject: `urn:unsolved:rc50:event:${record.ordinal}`,
    contentType: "application/vnd.unsolved.rc50-event+cbor",
    payload
  });
}

const allStatements = reference.map(buildStatement);
const statementEntries = allStatements.map(statement => statement.bytes);
const statementRoot = merkleRoot(statementEntries);

function buildInclusionReceipt(index, logKey = keys["log-a"]) {
  const proof = inclusionProof(statementEntries, index);
  const proofContent = encodeCbor([statementEntries.length, index, proof]);
  const unprotected = new Map([[396, new Map([[-1, [proofContent]]])]]);
  const receipt = coseSign1({
    key: logKey,
    issuer: `urn:unsolved:rc50:${logKey.label}`,
    subject: `urn:unsolved:rc50:event:${index + 1}`,
    contentType: "application/vnd.unsolved.rc50-merkle-root",
    payload: statementRoot,
    unprotected,
    detached: true,
    receipt: true
  });
  return { receipt, proof, proofContent };
}

function buildConsistencyReceipt(oldSize) {
  const proof = consistencyProof(statementEntries, oldSize);
  const proofContent = encodeCbor([oldSize, statementEntries.length, proof]);
  const unprotected = new Map([[396, new Map([[-2, [proofContent]]])]]);
  const receipt = coseSign1({
    key: keys["log-a"],
    issuer: "urn:unsolved:rc50:log-a",
    subject: `urn:unsolved:rc50:log-head:${statementEntries.length}`,
    contentType: "application/vnd.unsolved.rc50-merkle-root",
    payload: statementRoot,
    unprotected,
    detached: true,
    receipt: true
  });
  return { receipt, proof, proofContent, oldRoot: merkleRoot(statementEntries.slice(0, oldSize)) };
}

function mutateLastByte(bytes) {
  const out = Buffer.from(bytes);
  out[out.length - 1] ^= 1;
  return out;
}

function mutateProofReceipt(receipt, proofLabel, proofContent) {
  const decoded = decodeCbor(proofContent);
  const path = decoded[decoded.length - 1].map(Buffer.from);
  if (!path.length) throw new Error("negative proof requires non-empty path");
  path[0][0] ^= 1;
  const changedContent = encodeCbor([...decoded.slice(0, -1), path]);
  const changedUnprotected = new Map([[396, new Map([[proofLabel, [changedContent]]])]]);
  return encodeCbor(tag18([receipt.protectedBytes, changedUnprotected, null, receipt.signature]));
}

function verifyInclusionReceipt(receiptBytes, entry, logKey) {
  const decoded = decodeCbor(receiptBytes);
  const unprotected = decoded.value[1];
  const proofBytes = unprotected.get(396)?.get(-1)?.[0];
  if (!Buffer.isBuffer(proofBytes)) return false;
  const [size, index, pathNodes] = decodeCbor(proofBytes);
  let rootHash;
  try { rootHash = inclusionRoot(entry, index, size, pathNodes); } catch { return false; }
  return verifyCoseSign1(receiptBytes, logKey, rootHash, true);
}

function verifyConsistencyReceipt(receiptBytes, oldSize, oldRoot, newSize, newRoot, logKey) {
  if (!verifyCoseSign1(receiptBytes, logKey, newRoot, true)) return false;
  const decoded = decodeCbor(receiptBytes);
  const proofBytes = decoded.value[1].get(396)?.get(-2)?.[0];
  if (!Buffer.isBuffer(proofBytes)) return false;
  const [proofOld, proofNew, pathNodes] = decodeCbor(proofBytes);
  return proofOld === oldSize && proofNew === newSize && verifyConsistency(oldSize, newSize, oldRoot, newRoot, pathNodes);
}

const inclusionVectors = [];
for (const index of precommit.corpus.standardsVectors.inclusionLeafIndices) {
  const statement = allStatements[index];
  const built = buildInclusionReceipt(index);
  const mutatedStatement = mutateLastByte(statement.bytes);
  const mutatedReceipt = mutateLastByte(built.receipt.bytes);
  const mutatedPathReceipt = mutateProofReceipt(built.receipt, -1, built.proofContent);
  const wrongEntry = statementEntries[index === 0 ? 1 : index - 1];
  if (!verifyCoseSign1(statement.bytes, keys["event-issuer"])) throw new Error(`statement verification failed at ${index}`);
  if (verifyCoseSign1(mutatedStatement, keys["event-issuer"])) throw new Error(`mutated statement accepted at ${index}`);
  if (!verifyInclusionReceipt(built.receipt.bytes, statement.bytes, keys["log-a"])) throw new Error(`inclusion verification failed at ${index}`);
  if (verifyInclusionReceipt(mutatedReceipt, statement.bytes, keys["log-a"])) throw new Error(`mutated receipt accepted at ${index}`);
  if (verifyInclusionReceipt(built.receipt.bytes, wrongEntry, keys["log-a"])) throw new Error(`wrong leaf accepted at ${index}`);
  if (verifyInclusionReceipt(mutatedPathReceipt, statement.bytes, keys["log-a"])) throw new Error(`mutated path accepted at ${index}`);
  inclusionVectors.push({
    id: `INCLUSION-${index}`,
    leafIndex: index,
    treeSize: statementEntries.length,
    statementCoseHex: hex(statement.bytes),
    statementPayloadHex: hex(statement.payload),
    statementSignatureMutationHex: hex(mutatedStatement),
    receiptCoseHex: hex(built.receipt.bytes),
    receiptSignatureMutationHex: hex(mutatedReceipt),
    wrongLeafEntryHex: hex(wrongEntry),
    pathMutationReceiptHex: hex(mutatedPathReceipt),
    expectedRootHex: hex(statementRoot)
  });
}

const consistencyVectors = [];
for (const oldSize of precommit.corpus.standardsVectors.consistencyOldSizes) {
  const built = buildConsistencyReceipt(oldSize);
  const mutatedReceipt = mutateLastByte(built.receipt.bytes);
  const mutatedPathReceipt = mutateProofReceipt(built.receipt, -2, built.proofContent);
  if (!verifyConsistencyReceipt(built.receipt.bytes, oldSize, built.oldRoot, statementEntries.length, statementRoot, keys["log-a"])) throw new Error(`consistency verification failed at ${oldSize}`);
  if (verifyConsistencyReceipt(mutatedReceipt, oldSize, built.oldRoot, statementEntries.length, statementRoot, keys["log-a"])) throw new Error(`mutated consistency signature accepted at ${oldSize}`);
  if (verifyConsistencyReceipt(mutatedPathReceipt, oldSize, built.oldRoot, statementEntries.length, statementRoot, keys["log-a"])) throw new Error(`mutated consistency path accepted at ${oldSize}`);
  consistencyVectors.push({
    id: `CONSISTENCY-${oldSize}-${statementEntries.length}`,
    oldSize,
    newSize: statementEntries.length,
    oldRootHex: hex(built.oldRoot),
    newRootHex: hex(statementRoot),
    receiptCoseHex: hex(built.receipt.bytes),
    receiptSignatureMutationHex: hex(mutatedReceipt),
    pathMutationReceiptHex: hex(mutatedPathReceipt)
  });
}

const dualIndex = 256;
const receiptA = buildInclusionReceipt(dualIndex, keys["log-a"]).receipt;
const receiptB = buildInclusionReceipt(dualIndex, keys["log-b"]).receipt;
const baseStatement = allStatements[dualIndex];
const transparentBytes = encodeCbor(tag18([
  baseStatement.protectedBytes,
  new Map([[394, [receiptA.bytes, receiptB.bytes]]]),
  baseStatement.payload,
  baseStatement.signature
]));
if (!verifyCoseSign1(transparentBytes, keys["event-issuer"])) throw new Error("receipt attachment changed issuer signature");

const wireVectors = {
  profileId: "UP-RC50-SCITT-EVENT-LINEAGE-v1",
  cycleId: precommit.cycleId,
  generatedOn: "2026-08-25",
  standards: ["RFC 8949", "RFC 9052", "RFC 9162", "RFC 9597", "RFC 9942", "RFC 9943"],
  publicKeys: Object.fromEntries(Object.entries(keys).map(([label, key]) => [label, { kidHex: hex(key.kid), ed25519PublicKeyHex: hex(key.publicRaw) }])),
  corpus: { entryCount: statementEntries.length, rootHex: hex(statementRoot), entriesDigest: hex(sha256(Buffer.concat(statementEntries.map(entry => sha256(entry))))) },
  inclusionVectors,
  consistencyVectors,
  transparentStatement: {
    leafIndex: dualIndex,
    coseHex: hex(transparentBytes),
    baseStatementCoseHex: hex(baseStatement.bytes),
    attachedReceiptCount: 2,
    logAReceiptHex: hex(receiptA.bytes),
    logBReceiptHex: hex(receiptB.bytes)
  },
  expectedCounts: precommit.corpus.standardsVectors,
  limitations: "Public deterministic test keys and an experiment-specific application profile; no live transparency service, IANA profile registration, operational custody, or physical accuracy claim."
};

const expectedCounts = precommit.expectedAdjudication.crossViewCounts;
const actualCounts = summarizeArm("crossViewStatus").statuses;
const failures = [];
for (const [status, count] of Object.entries(expectedCounts)) if ((actualCounts[status] || 0) !== count) failures.push(`${status}: expected ${count}, got ${actualCounts[status] || 0}`);
if (rows.length !== precommit.corpus.trialSchedule.total) failures.push(`trial count ${rows.length}`);

const result = {
  resultId: "RC50-COMPOSITIONAL-RECEIPTS-NODE-RESULT-0.1",
  cycleId: precommit.cycleId,
  generatedOn: "2026-08-25",
  implementation: "Node.js independent primary generator and adjudicator",
  precommitPath: "research/reproducibility/rc50-compositional-receipts-precommit.json",
  corpus: {
    eventCount: EVENT_COUNT,
    placements: precommit.corpus.placements,
    payloadDigest: hex(sha256(Buffer.concat(reference.map(record => record.payload)))),
    referenceManifestRoot: hex(manifestRoot(reference)),
    standardsStatementRoot: hex(statementRoot)
  },
  publicKeys: Object.fromEntries(Object.entries(keys).map(([label, key]) => [label, hex(key.publicRaw)])),
  trials: rows,
  summaries: {
    receiptLocal: summarizeArm("receiptLocalStatus"),
    statefulSingleView: summarizeArm("statefulSingleViewStatus"),
    crossViewCausal: summarizeArm("crossViewStatus")
  },
  standardsSelfCheck: {
    signedStatementPositive: inclusionVectors.length,
    inclusionReceiptPositive: inclusionVectors.length,
    consistencyReceiptPositive: consistencyVectors.length,
    statementSignatureMutationRejected: inclusionVectors.length,
    receiptSignatureMutationRejected: inclusionVectors.length + consistencyVectors.length,
    wrongLeafRejected: inclusionVectors.length,
    inclusionPathMutationRejected: inclusionVectors.length,
    consistencyPathMutationRejected: consistencyVectors.length,
    transparentStatementReceiptCount: 2
  },
  h1Gate: { pass: failures.length === 0, expected: expectedCounts, actual: actualCounts, failures },
  limitations: [
    "The two nominal evidence roles use different deterministic keys but no organizational independence is measured.",
    "The causal grammar is frozen and finite; unmodeled transformations can create additional equivalent histories.",
    "The COSE profile covers a strict deterministic subset and does not claim general interoperability or a live SCITT service.",
    "Physical acquisition count is zero and the historical X16 branch remains paused."
  ]
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
fs.writeFileSync(wirePath, `${JSON.stringify(wireVectors, null, 2)}\n`, "utf8");
console.log(`RC50 Node: ${rows.length} trials; H1 ${result.h1Gate.pass ? "PASS" : "FAIL"}; ${inclusionVectors.length} inclusion and ${consistencyVectors.length} consistency vectors.`);
