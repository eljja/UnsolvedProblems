import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const CACHE_ROOT = path.join(ROOT, ".cache");
const WORK_ROOT = path.join(CACHE_ROOT, "rc34-resolver-race");
const WRITE = process.argv.includes("--write");
const PYTHON = process.env.PYTHON || "python";
const inputs = {
  capability: path.join(REPRO, "dispute-opening-capability.json"),
  registry: path.join(REPRO, "pairwise-auditor-registry.json"),
  outcomes: path.join(REPRO, "pairwise-outcome-view.json"),
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : canonical(value));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function leafHash(receipt) {
  return sha(Buffer.concat([Buffer.from([0]), Buffer.from(canonical(receipt))]));
}

function nodeHash(left, right) {
  return sha(Buffer.concat([Buffer.from([1]), Buffer.from(left, "hex"), Buffer.from(right, "hex")]));
}

function assertSafeWorkRoot(target) {
  const resolved = path.resolve(target);
  const expectedPrefix = `${path.resolve(CACHE_ROOT)}${path.sep}`;
  if (!resolved.startsWith(expectedPrefix) || resolved === path.resolve(CACHE_ROOT)) {
    throw new Error(`refusing unsafe work directory: ${resolved}`);
  }
  return resolved;
}

function resetDirectory(target) {
  const safe = assertSafeWorkRoot(target);
  if (fs.existsSync(safe)) fs.rmSync(safe, { recursive: true, force: true });
  fs.mkdirSync(safe, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, windowsHide: true, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", chunk => { stdout += chunk; });
    child.stderr?.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

function commonArgs(store, response, resolver, attempts, mode, gate) {
  const args = [
    "--store", store,
    "--attempts", String(attempts),
    "--resolver", resolver,
    "--mode", mode,
    "--response", response,
    "--capability", inputs.capability,
    "--registry", inputs.registry,
    "--outcomes", inputs.outcomes,
  ];
  if (gate) args.push("--start-gate", gate);
  return args;
}

function expectedOutcome() {
  const capability = readJson(inputs.capability);
  const payloadPart = capability.token.split(".")[0];
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  const registry = readJson(inputs.registry);
  const outcomes = readJson(inputs.outcomes);
  const bridge = registry.records.find(item => item.auditRecordId === payload.auditRecordId);
  const outcome = outcomes.records.find(item => item.pseudonymizerToOutcomeHandle === bridge?.pseudonymizerToOutcomeHandle);
  if (!bridge || !outcome) throw new Error("authorized outcome is unresolved");
  return { capability, payload, bridge, outcome };
}

async function normalRace() {
  const store = path.join(WORK_ROOT, "normal");
  fs.mkdirSync(store, { recursive: true });
  const gate = path.join(store, "start.gate");
  const nodeResponse = path.join(store, "node-responses.json");
  const pythonResponse = path.join(store, "python-responses.json");
  const nodeRun = run(process.execPath, [path.join(ROOT, "scripts", "rc34_node_resolver.mjs"), ...commonArgs(store, nodeResponse, "NODE-RESOLVER", 50, "race", gate)]);
  const pythonRun = run(PYTHON, [path.join(ROOT, "scripts", "rc34_python_resolver.py"), ...commonArgs(store, pythonResponse, "PYTHON-RESOLVER", 50, "race", gate)]);
  await new Promise(resolve => setTimeout(resolve, 50));
  fs.writeFileSync(gate, "release");
  const [nodeProcess, pythonProcess] = await Promise.all([nodeRun, pythonRun]);
  if (nodeProcess.code !== 0 || pythonProcess.code !== 0) {
    throw new Error(`normal race failed: node=${canonical(nodeProcess)} python=${canonical(pythonProcess)}`);
  }
  const responses = [...readJson(nodeResponse), ...readJson(pythonResponse)];
  return {
    processes: { node: nodeProcess, python: pythonProcess },
    responses,
    claim: readJson(path.join(store, "claim.json")),
    receipt: readJson(path.join(store, "receipt.json")),
    outcome: readJson(path.join(store, "outcome.json")),
  };
}

async function crashRecovery() {
  const store = path.join(WORK_ROOT, "crash-recovery");
  fs.mkdirSync(store, { recursive: true });
  const crashResponse = path.join(store, "crash-response.json");
  const recoveryResponse = path.join(store, "recovery-response.json");
  const crashed = await run(process.execPath, [
    path.join(ROOT, "scripts", "rc34_node_resolver.mjs"),
    ...commonArgs(store, crashResponse, "NODE-CRASH-RESOLVER", 1, "crash-after-claim"),
  ]);
  const beforeRecovery = {
    claimExists: fs.existsSync(path.join(store, "claim.json")),
    receiptExists: fs.existsSync(path.join(store, "receipt.json")),
    outcomeExists: fs.existsSync(path.join(store, "outcome.json")),
  };
  if (crashed.code !== 86) throw new Error(`expected crash exit 86, received ${canonical(crashed)}`);
  const recovered = await run(PYTHON, [
    path.join(ROOT, "scripts", "rc34_python_resolver.py"),
    ...commonArgs(store, recoveryResponse, "PYTHON-RECOVERY-RESOLVER", 1, "recover"),
  ]);
  if (recovered.code !== 0) throw new Error(`recovery failed: ${canonical(recovered)}`);
  return {
    processes: { crashed, recovered },
    beforeRecovery,
    responses: { crash: readJson(crashResponse), recovery: readJson(recoveryResponse) },
    claim: readJson(path.join(store, "claim.json")),
    receipt: readJson(path.join(store, "receipt.json")),
    outcome: readJson(path.join(store, "outcome.json")),
  };
}

function buildLedger(normalReceipt, crashReceipt) {
  const receipts = [normalReceipt, crashReceipt];
  const leaves = receipts.map(leafHash);
  const rootSize1 = leaves[0];
  const rootSize2 = nodeHash(leaves[0], leaves[1]);
  return {
    profile: "urn:unsolved-problems:rc34-receipt-transparency-ledger:1.0",
    synthetic: true,
    construction: "RFC 9162 domain-separated Merkle hashing over canonical JSON receipts",
    receipts,
    leaves,
    treeHeads: [
      { size: 1, rootHash: rootSize1 },
      { size: 2, rootHash: rootSize2 },
    ],
    inclusionProofs: [
      { leafIndex: 0, treeSize: 2, auditPath: [{ side: "right", hash: leaves[1] }], expectedRoot: rootSize2 },
      { leafIndex: 1, treeSize: 2, auditPath: [{ side: "left", hash: leaves[0] }], expectedRoot: rootSize2 },
    ],
    consistencyProof: { oldSize: 1, newSize: 2, oldRoot: rootSize1, appendedSubtree: leaves[1], expectedNewRoot: rootSize2 },
  };
}

function checkDigest(record, digestField) {
  const { [digestField]: digest, ...unsigned } = record;
  return digest === sha(unsigned);
}

function adjudicate(normal, crash, ledger) {
  const expected = expectedOutcome();
  const statuses = normal.responses.map(item => item.status);
  const opened = statuses.filter(status => status === "opened-one").length;
  const replay = statuses.filter(status => status === "replay").length;
  const openedResponse = normal.responses.find(item => item.status === "opened-one");
  const recoveryStatuses = crash.responses.recovery.map(item => item.status);
  const checks = {
    normalProducedOneHundredResponses: normal.responses.length === 100,
    normalOpenedExactlyOnce: opened === 1,
    normalRejectedNinetyNineReplays: replay === 99,
    claimDigestValid: checkDigest(normal.claim, "claimDigest"),
    receiptDigestValid: checkDigest(normal.receipt, "receiptDigest"),
    openedResponseMatchesDurableOutcome: canonical(openedResponse?.outcome) === canonical(normal.outcome),
    authorizedOutcomeReleased: normal.outcome.eventOutcomeBinding === expected.outcome.eventOutcomeBinding && normal.outcome.vendorCode === expected.outcome.vendorCode && normal.outcome.outcomeClass === expected.outcome.outcomeClass,
    receiptPrecedesOutcomeByProtocol: canonical(normal.outcome.releaseOrder) === canonical(["claim", "receipt", "outcome"]) && normal.outcome.receiptDigest === normal.receipt.receiptDigest,
    crashOccurredAfterClaim: crash.processes.crashed.code === 86 && crash.beforeRecovery.claimExists,
    crashReleasedNothing: !crash.beforeRecovery.receiptExists && !crash.beforeRecovery.outcomeExists,
    recoveryOpenedExactlyOnce: recoveryStatuses.length === 1 && recoveryStatuses[0] === "recovered-opened-one",
    recoveryPreservedOriginalClaim: crash.claim.resolverId === "NODE-CRASH-RESOLVER" && crash.receipt.claimDigest === crash.claim.claimDigest,
    recoveryReceiptDigestValid: checkDigest(crash.receipt, "receiptDigest"),
    recoveryReleasedAuthorizedOutcome: crash.outcome.eventOutcomeBinding === expected.outcome.eventOutcomeBinding && crash.outcome.receiptDigest === crash.receipt.receiptDigest,
    twoReceiptsHaveValidInclusionProofs: ledger.inclusionProofs.every(proof => {
      let current = ledger.leaves[proof.leafIndex];
      for (const step of proof.auditPath) current = step.side === "left" ? nodeHash(step.hash, current) : nodeHash(current, step.hash);
      return current === proof.expectedRoot;
    }),
    ledgerExtensionIsConsistent: nodeHash(ledger.consistencyProof.oldRoot, ledger.consistencyProof.appendedSubtree) === ledger.consistencyProof.expectedNewRoot,
  };
  return { expected, opened, replay, checks };
}

resetDirectory(WORK_ROOT);
const normal = await normalRace();
const crash = await crashRecovery();
const ledger = buildLedger(normal.receipt, crash.receipt);
const adjudication = adjudicate(normal, crash, ledger);
const passed = Object.values(adjudication.checks).filter(Boolean).length;
const total = Object.keys(adjudication.checks).length;
const result = {
  profile: "urn:unsolved-problems:rc34-dual-runtime-resolver-race:1.0",
  synthetic: true,
  implementations: ["Node.js exclusive-create resolver", "Python exclusive-create resolver and crash recovery"],
  normalRace: {
    attempts: normal.responses.length,
    opened: adjudication.opened,
    replay: adjudication.replay,
    winner: normal.claim.resolverId,
    receiptDigest: normal.receipt.receiptDigest,
  },
  crashRecovery: {
    crashExitCode: crash.processes.crashed.code,
    stateBeforeRecovery: crash.beforeRecovery,
    recoveryStatus: crash.responses.recovery[0]?.status,
    originalClaimant: crash.claim.resolverId,
    recoveryResolver: crash.receipt.resolverId,
    receiptDigest: crash.receipt.receiptDigest,
  },
  transparencyLedger: { receiptCount: ledger.receipts.length, latestRoot: ledger.treeHeads.at(-1).rootHash, inclusionProofs: 2, consistencyProofs: 1 },
  checks: adjudication.checks,
  passedChecks: passed,
  totalChecks: total,
  qualification: {
    supported: "A shared-filesystem exclusive-create linearization point admitted exactly one opening across two runtimes, preserved a pre-release crash claim, and emitted inclusion-verifiable receipts.",
    notEstablished: [
      "multi-host or multi-region linearizability",
      "consensus safety under network partition",
      "protection of the deliberately public synthetic bearer token or HMAC key",
      "institutionally independent adjudication",
      "physical custody or hardware security; physical sample size is zero",
    ],
  },
};
const evidence = {
  profile: "urn:unsolved-problems:rc34-resolver-race-evidence:1.0",
  synthetic: true,
  normal: { responses: normal.responses, claim: normal.claim, receipt: normal.receipt, outcome: normal.outcome },
  crashRecovery: { beforeRecovery: crash.beforeRecovery, responses: crash.responses, claim: crash.claim, receipt: crash.receipt, outcome: crash.outcome },
};

if (passed !== total) throw new Error(`RC34 resolver adjudication failed: ${passed}/${total} checks`);
if (WRITE) {
  fs.writeFileSync(path.join(REPRO, "rc34-resolver-race-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  fs.writeFileSync(path.join(REPRO, "rc34-resolver-receipt-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`);
  fs.writeFileSync(path.join(REPRO, "rc34-resolver-race-result.json"), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(`RC34 dual-runtime resolver race: ${passed}/${total} checks; ${adjudication.opened} opened, ${adjudication.replay} replayed; crash recovery ${crash.responses.recovery[0]?.status}.`);
