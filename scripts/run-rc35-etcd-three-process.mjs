import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_ROOT = path.join(ROOT, ".cache", "rc35-etcd");
const RUN_ROOT = path.join(CACHE_ROOT, "live-three-process");
const REPRO = path.join(ROOT, "research", "reproducibility");
const WRITE = process.argv.includes("--write");
const PHASE_ARG = process.argv.find(arg => arg.startsWith("--phase="));
const RUN_PHASE = PHASE_ARG ? PHASE_ARG.slice("--phase=".length) : "exploratory";
if (!/^(exploratory|confirmatory)$/.test(RUN_PHASE)) throw new Error(`Unsupported phase: ${RUN_PHASE}`);
const RELEASE = "v3.7.1";
const ARCHIVE = path.join(CACHE_ROOT, `etcd-${RELEASE}-windows-amd64.zip`);
const BIN_ROOT = path.join(CACHE_ROOT, RELEASE, `etcd-${RELEASE}-windows-amd64`);
const ETCD = process.env.RC35_ETCD_BIN || path.join(BIN_ROOT, "etcd.exe");
const ETCDCTL = process.env.RC35_ETCDCTL_BIN || path.join(BIN_ROOT, "etcdctl.exe");
const EXPECTED_ARCHIVE_SHA256 = "228d600d103e0f48715687c768de8dcaeacb19eef2006261160a9a677e36cc59";
const NODES = [
  { name: "r0", clientPort: 23791, peerPort: 23801 },
  { name: "r1", clientPort: 23792, peerPort: 23802 },
  { name: "r2", clientPort: 23793, peerPort: 23803 }
];
const INITIAL_CLUSTER = NODES.map(node => `${node.name}=http://127.0.0.1:${node.peerPort}`).join(",");
const startedAt = new Date().toISOString();
const processes = new Map();
const logStreams = new Map();
const history = [];

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function assertCachePath(target) {
  const resolved = path.resolve(target);
  const allowed = `${path.resolve(CACHE_ROOT)}${path.sep}`;
  if (!resolved.startsWith(allowed)) throw new Error(`Refusing cache mutation outside ${CACHE_ROOT}: ${resolved}`);
}

function endpoint(node) {
  return `http://127.0.0.1:${node.clientPort}`;
}

function endpoints(nodes = NODES) {
  return nodes.map(endpoint).join(",");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runFile(file, args, { input = "", timeout = 10000, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: ROOT, windowsHide: true, env: { ...process.env } });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout);
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", code => {
      clearTimeout(timer);
      const result = { code, stdout: stdout.trim(), stderr: stderr.trim(), timedOut };
      if (!allowFailure && (code !== 0 || timedOut)) reject(new Error(`${path.basename(file)} failed (${code}): ${stderr || stdout}`));
      else resolve(result);
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

async function ctl(args, options = {}) {
  return runFile(ETCDCTL, args, options);
}

function txnInput(compare, success, failure) {
  return [...compare, "", ...success, "", ...failure, "", ""].join("\n");
}

async function txn(label, targetEndpoints, compare, success, failure = []) {
  const result = await ctl([`--endpoints=${targetEndpoints}`, "--command-timeout=4s", "txn"], {
    input: txnInput(compare, success, failure),
    timeout: 7000,
    allowFailure: true
  });
  const succeeded = result.code === 0 && /^SUCCESS\b/m.test(result.stdout);
  history.push({ at: new Date().toISOString(), type: "txn", label, targetEndpoints, compare, success, failure, succeeded, result });
  return { ...result, succeeded };
}

async function getKey(label, key, targetEndpoints = endpoints()) {
  const result = await ctl([`--endpoints=${targetEndpoints}`, "--command-timeout=4s", "get", key, "--write-out=json"], { timeout: 7000, allowFailure: true });
  let parsed = null;
  if (result.code === 0 && result.stdout) parsed = JSON.parse(result.stdout);
  const kvs = (parsed?.kvs || []).map(kv => ({
    key: Buffer.from(kv.key, "base64").toString("utf8"),
    value: Buffer.from(kv.value, "base64").toString("utf8"),
    createRevision: Number(kv.create_revision),
    modRevision: Number(kv.mod_revision),
    version: Number(kv.version)
  }));
  history.push({ at: new Date().toISOString(), type: "read", label, key, targetEndpoints, result, kvs });
  return { result, kvs };
}

function nodeArgs(node) {
  const dataDir = path.join(RUN_ROOT, node.name);
  return [
    `--name=${node.name}`,
    `--data-dir=${dataDir}`,
    `--listen-client-urls=${endpoint(node)}`,
    `--advertise-client-urls=${endpoint(node)}`,
    `--listen-peer-urls=http://127.0.0.1:${node.peerPort}`,
    `--initial-advertise-peer-urls=http://127.0.0.1:${node.peerPort}`,
    `--initial-cluster=${INITIAL_CLUSTER}`,
    "--initial-cluster-state=new",
    "--initial-cluster-token=rc35-opening-2026-08-14",
    "--logger=zap",
    "--log-level=warn"
  ];
}

function startNode(node) {
  const existing = processes.get(node.name);
  if (existing && existing.exitCode === null && existing.signalCode === null) throw new Error(`${node.name} is already running`);
  fs.mkdirSync(path.join(RUN_ROOT, node.name), { recursive: true });
  const logPath = path.join(RUN_ROOT, `${node.name}.log`);
  const stream = fs.createWriteStream(logPath, { flags: "a" });
  const child = spawn(ETCD, nodeArgs(node), { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  processes.set(node.name, child);
  logStreams.set(node.name, stream);
  history.push({ at: new Date().toISOString(), type: "process", action: "start", node: node.name, pid: child.pid });
  return child;
}

async function stopNode(node, reason) {
  const child = processes.get(node.name);
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill();
  await Promise.race([
    exited,
    delay(5000)
  ]);
  if (child.exitCode === null && child.signalCode === null) throw new Error(`${node.name} did not terminate within 5 seconds`);
  logStreams.get(node.name)?.end();
  history.push({ at: new Date().toISOString(), type: "process", action: "stop", node: node.name, reason, exitCode: child.exitCode, signalCode: child.signalCode });
  processes.delete(node.name);
  logStreams.delete(node.name);
}

async function waitHealthy(nodes, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await ctl([`--endpoints=${endpoints(nodes)}`, "--command-timeout=2s", "endpoint", "health"], { timeout: 4000, allowFailure: true });
    const healthyLines = last.stdout.split(/\r?\n/).filter(line => line.includes("is healthy"));
    if (last.code === 0 && healthyLines.length === nodes.length) return last;
    await delay(350);
  }
  throw new Error(`Cluster did not become healthy: ${JSON.stringify(last)}`);
}

async function clusterStatus(nodes = NODES) {
  const result = await ctl([`--endpoints=${endpoints(nodes)}`, "--command-timeout=3s", "endpoint", "status", "--write-out=json"], { timeout: 6000 });
  return JSON.parse(result.stdout);
}

function leaderNode(status) {
  const leaderId = String(status[0]?.Status?.leader ?? status[0]?.Status?.Leader);
  const row = status.find(item => String(item.Status?.header?.member_id ?? item.Status?.header?.memberId) === leaderId);
  const leaderEndpoint = row?.Endpoint || row?.endpoint;
  return NODES.find(node => endpoint(node) === leaderEndpoint);
}

async function restartAndHeal(node) {
  startNode(node);
  await waitHealthy(NODES);
}

async function runCase(prefix, terminateAt) {
  const stageKey = `${prefix}/stage`;
  const ownerKey = `${prefix}/owner`;
  const receiptKey = `${prefix}/receipt`;
  const outcomeKey = `${prefix}/outcome`;
  const initialStatus = await clusterStatus();
  const initialLeader = leaderNode(initialStatus);
  if (!initialLeader) throw new Error("Could not identify initial leader");

  const claimAttempts = await Promise.all([
    txn(`${terminateAt}:claim-c0`, endpoint(NODES[0]), [`version(\"${stageKey}\") = \"0\"`], [`put ${stageKey} CLAIMED`, `put ${ownerKey} C0`], [`get ${stageKey}`]),
    txn(`${terminateAt}:claim-c1`, endpoint(NODES[1]), [`version(\"${stageKey}\") = \"0\"`], [`put ${stageKey} CLAIMED`, `put ${ownerKey} C1`], [`get ${stageKey}`])
  ]);
  const claimWinners = claimAttempts.filter(item => item.succeeded).length;
  if (claimWinners !== 1) throw new Error(`${terminateAt}: expected one claim winner, observed ${claimWinners}; ${JSON.stringify(claimAttempts)}`);

  let killedLeader = null;
  if (terminateAt === "CLAIMED") {
    killedLeader = leaderNode(await clusterStatus());
    await stopNode(killedLeader, "leader-termination-after-CLAIMED");
    await waitHealthy(NODES.filter(node => node.name !== killedLeader.name));
  }
  const liveAfterClaim = NODES.filter(node => node.name !== killedLeader?.name);
  const receipt = await txn(`${terminateAt}:receipt`, endpoints(liveAfterClaim), [`value(\"${stageKey}\") = \"CLAIMED\"`], [`put ${stageKey} RECEIPTED`, `put ${receiptKey} sha256:rc35-fixed-receipt`], [`get ${stageKey}`]);
  if (!receipt.succeeded) throw new Error(`${terminateAt}: receipt transition failed`);

  if (terminateAt === "RECEIPTED") {
    killedLeader = leaderNode(await clusterStatus());
    await stopNode(killedLeader, "leader-termination-after-RECEIPTED");
    await waitHealthy(NODES.filter(node => node.name !== killedLeader.name));
  }
  const liveForRelease = NODES.filter(node => node.name !== killedLeader?.name);
  const release = await txn(`${terminateAt}:release-response-discarded`, endpoints(liveForRelease), [`value(\"${stageKey}\") = \"RECEIPTED\"`], [`put ${stageKey} RELEASED`, `put ${outcomeKey} sha256:rc35-fixed-outcome`], [`get ${stageKey}`]);
  if (!release.succeeded) throw new Error(`${terminateAt}: release transition failed`);
  history.push({ at: new Date().toISOString(), type: "client-observation", label: `${terminateAt}:discard-success-response`, fact: "The coordinator deliberately treats the successful release response as unavailable before retry." });
  const retry = await txn(`${terminateAt}:retry-after-lost-response`, endpoints(liveForRelease), [`value(\"${stageKey}\") = \"RECEIPTED\"`], [`put ${stageKey} RELEASED`, `put ${outcomeKey} sha256:duplicate-would-differ`], [`get ${stageKey}`, `get ${receiptKey}`, `get ${outcomeKey}`]);
  if (retry.succeeded) throw new Error(`${terminateAt}: retry incorrectly re-executed release`);

  if (killedLeader) await restartAndHeal(killedLeader);
  const perReplica = [];
  for (const node of NODES) {
    const reads = {};
    for (const [name, key] of Object.entries({ stage: stageKey, owner: ownerKey, receipt: receiptKey, outcome: outcomeKey })) {
      reads[name] = (await getKey(`${terminateAt}:${node.name}:${name}`, key, endpoint(node))).kvs[0] || null;
    }
    perReplica.push({ node: node.name, reads });
  }
  return { terminateAt, prefix, initialLeader: initialLeader.name, killedLeader: killedLeader?.name || null, claimWinners, releaseCommitted: release.succeeded, retryReexecuted: retry.succeeded, perReplica };
}

async function minorityProbe() {
  const status = await clusterStatus();
  const leader = leaderNode(status);
  const survivor = NODES.find(node => node.name !== leader.name);
  const stopped = NODES.filter(node => node.name !== survivor.name);
  for (const node of stopped) await stopNode(node, "minority-unavailability-probe");
  await delay(1200);
  const key = "/rc35/minority/forbidden-write";
  const attempt = await txn("minority:write", endpoint(survivor), [`version(\"${key}\") = \"0\"`], [`put ${key} SHOULD_NOT_COMMIT`], [], { allowFailure: true });
  for (const node of stopped) startNode(node);
  await waitHealthy(NODES);
  const read = await getKey("minority:post-heal-read", key);
  return {
    survivor: survivor.name,
    stopped: stopped.map(node => node.name),
    attemptExitedSuccessfully: attempt.code === 0,
    attemptTimedOut: attempt.timedOut,
    transactionSucceeded: attempt.succeeded,
    keyPresentAfterHeal: read.kvs.length > 0
  };
}

async function cleanup() {
  for (const node of NODES) await stopNode(node, "final-cleanup");
}

async function main() {
  for (const file of [ETCD, ETCDCTL, ARCHIVE]) if (!fs.existsSync(file)) throw new Error(`Missing prerequisite: ${file}`);
  const archiveSha256 = sha256(ARCHIVE);
  if (archiveSha256 !== EXPECTED_ARCHIVE_SHA256) throw new Error(`Archive SHA-256 mismatch: ${archiveSha256}`);
  assertCachePath(RUN_ROOT);
  fs.rmSync(RUN_ROOT, { recursive: true, force: true });
  fs.mkdirSync(RUN_ROOT, { recursive: true });
  for (const node of NODES) startNode(node);
  await waitHealthy(NODES);
  const version = await ctl(["version"]);
  const baselineStatus = await clusterStatus();
  const cases = [
    await runCase("/rc35/case-claimed", "CLAIMED"),
    await runCase("/rc35/case-receipted", "RECEIPTED")
  ];
  const minority = await minorityProbe();
  const result = {
    cycle: "RC-2026-35",
    experiment: "same-host-three-process-etcd-staged-release",
    runPhase: RUN_PHASE,
    startedAt,
    completedAt: new Date().toISOString(),
    implementation: {
      release: RELEASE,
      releasePublishedAt: "2026-07-23T19:37:53Z",
      releaseUrl: "https://github.com/etcd-io/etcd/releases/tag/v3.7.1",
      archiveSha256,
      expectedArchiveSha256: EXPECTED_ARCHIVE_SHA256,
      versionOutput: version.stdout,
      replicas: NODES.length,
      processes: NODES.length,
      dataDirectories: NODES.length,
      physicalHosts: 1,
      transport: "three loopback client ports and three loopback peer ports"
    },
    boundary: {
      qualifies: "real etcd compare-and-swap transactions, leader process termination, persisted per-process data directories, and one-member minority unavailability on one Windows host",
      doesNotQualify: [
        "independent physical failure domains",
        "real network partition or packet reordering",
        "host, disk, rack, region, or institution failure",
        "unbounded linearizability proof",
        "exactly-once delivery of an outcome to an external recipient"
      ]
    },
    baselineStatus,
    cases,
    minority,
    criteria: {
      oneClaimWinnerPerCase: cases.every(item => item.claimWinners === 1),
      committedReleaseSurvivesLeaderTermination: cases.every(item => item.releaseCommitted && item.perReplica.every(replica => replica.reads.stage?.value === "RELEASED" && replica.reads.receipt?.value === "sha256:rc35-fixed-receipt" && replica.reads.outcome?.value === "sha256:rc35-fixed-outcome")),
      lostResponseRetryDoesNotReexecute: cases.every(item => item.retryReexecuted === false),
      minorityCannotCommit: minority.transactionSucceeded === false && minority.keyPresentAfterHeal === false
    },
    historyEvents: history.length
  };
  result.qualifies = Object.values(result.criteria).every(Boolean);
  if (WRITE) {
    fs.writeFileSync(path.join(REPRO, `rc35-etcd-three-process-${RUN_PHASE}-history.json`), `${JSON.stringify({ cycle: result.cycle, runPhase: RUN_PHASE, startedAt, completedAt: result.completedAt, history }, null, 2)}\n`);
    fs.writeFileSync(path.join(REPRO, `rc35-etcd-three-process-${RUN_PHASE}-result.json`), `${JSON.stringify(result, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.qualifies) process.exitCode = 1;
}

try {
  await main();
} finally {
  await cleanup();
}
