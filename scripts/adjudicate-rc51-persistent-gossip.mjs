import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const write = (relative, value) => fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const canonical = value => JSON.stringify(value);

const precommit = read("research/reproducibility/rc51-persistent-gossip-precommit.json");
const priorArt = read("research/reproducibility/rc51-persistent-gossip-prior-art.json");
const contract = read("research/reproducibility/rc51-blind-replay-contract.json");
const node = read("research/reproducibility/rc51-persistent-gossip-node.json");
const python = read("research/reproducibility/rc51-persistent-gossip-python.json");
const blind = read("research/reproducibility/rc51-blind-replay-audit.json");

check(precommit.precommitId === "RC51-PERSISTENT-GOSSIP-PRECOMMIT-0.1", "precommit ID changed");
check(precommit.selection.problemIds.join("|") === "UP-605|UP-602|UP-315", "problem scope changed");
check(precommit.fixtureSchedule.length === 16 && precommit.competingHypotheses.length === 6 && precommit.hardGates.length === 13, "preregistered schedule changed");
check(priorArt.sources.length === 12 && priorArt.repositoryInheritance.length === 3, "prior-art audit incomplete");
check(contract.contractId === blind.contractId && blind.withheldFieldsAbsent && !blind.fixtureLabelsRead && !blind.expectedVerdictsRead && !blind.generatorOutcomesRead, "blind contract violated");
check(node.cycleId === precommit.cycleId && python.cycleId === precommit.cycleId && blind.cycleId === precommit.cycleId, "cycle IDs disagree");
check(node.preregistrationCommit === "5a2f847" && python.preregistrationCommit === "5a2f847", "preregistration commit changed");
check(node.fixtures.length === 16 && python.fixtures.length === 16 && blind.cases.length === 16, "fixture denominator changed");

const nodeComparable = node.fixtures.map(({ id, opaqueCaseId, verdict, stateDigest, armVerdicts }) => ({ id, opaqueCaseId, verdict, stateDigest, armVerdicts }));
check(canonical(nodeComparable) === canonical(python.fixtures), "Node/Python fixture or state-digest mismatch");
for (const blindCase of blind.cases) {
  const reference = node.fixtures.find(item => item.opaqueCaseId === blindCase.opaqueCaseId);
  check(Boolean(reference), `blind case missing from Node result: ${blindCase.opaqueCaseId}`);
  check(reference?.verdict === blindCase.verdict && reference?.stateDigest === blindCase.stateDigest, `blind replay mismatch: ${blindCase.opaqueCaseId}`);
}
for (const implementation of [node, python]) {
  check(Object.values(implementation.gates).every(Boolean), `${implementation.resultId} gate failed`);
  check(implementation.pragmaChecks.length === 20, `${implementation.resultId} pragma denominator changed`);
  check(implementation.pragmaChecks.every(item => item.journalMode === "wal" && item.synchronous === 2 && item.foreignKeys === 1 && item.integrity === "ok"), `${implementation.resultId} SQLite configuration or integrity failed`);
  check(implementation.processCrashScope && !implementation.powerLossScope && !implementation.operatorIndependenceScope && implementation.physicalAcquisitions === 0, `${implementation.resultId} scope boundary changed`);
}

const fixture = id => node.fixtures.find(item => item.id === id);
check(fixture("F03").verdict === "retry-accepted-once" && fixture("F04").verdict === "retry-rejected-replay", "transition crash boundary failed");
check(fixture("F10").verdict === "retry-accepted-rotation" && fixture("F11").verdict === "retry-rejected-rotation", "rotation crash boundary failed");
check(fixture("F12").armVerdicts.singlePersistentRegistry === "accept-internally-valid-old-state" && fixture("F12").verdict === "refuse-backup-rollback", "backup rollback boundary failed");
check(fixture("F13").verdict === "refuse-stale-view" && fixture("F14").verdict === "refuse-log-equivocation" && fixture("F15").verdict === "refuse-issuer-equivocation" && fixture("F16").verdict === "accept-cross-view", "cross-view boundary failed");

const hypotheses = [
  {
    code: "H0", verdict: "rejected",
    reason: "The signature-only arm accepts the correctly signed replay and same-nonce fork in F05-F06. One-time use appears only after the spent-nonce and accepted-domain state is retained."
  },
  {
    code: "H1", verdict: failures.length ? "not-supported" : "supported-in-process-crash-scope",
    reason: "Both SQLite implementations expose the complete old tuple after pre-commit termination and the complete new tuple after post-commit response loss for transition and key-rotation cases; no mixed tuple appears and every reopened database passes integrity_check."
  },
  {
    code: "H2", verdict: "rejected",
    reason: "After a safe restore, the single database is internally valid at generation one and cannot know that generation two once existed. The rollback is refused only because a generation-two digest survives in the separate anchor."
  },
  {
    code: "H3", verdict: failures.length ? "not-supported" : "supported-in-process-crash-scope",
    reason: "Exact N+1 rotation with both predecessor and proposed-key signatures is accepted; either missing continuity signature is rejected; pre- and post-commit termination preserve complete key epochs."
  },
  {
    code: "H4", verdict: "rejected",
    reason: "F13-F15 contain locally valid signatures while presenting a stale head, same-size/different-root log fork, or same-issuer/subject/sequence statement fork. A local view is not a global uniqueness proof."
  },
  {
    code: "H5", verdict: failures.length ? "not-supported" : "supported-in-local-multi-process-scope",
    reason: "The separately retained anchor refuses the restored primary, and exchanged views refuse all three stale or equivocation cases while accepting the nonconflicting two-log advance. The blind replay independently reconstructs all sixteen verdicts and state digests."
  }
];

const comparisons = {
  nodePythonFixtureStructures: 16,
  blindVerdictAndStatePairs: 16,
  nodePragmaAndIntegritySnapshots: node.pragmaChecks.length,
  pythonPragmaAndIntegritySnapshots: python.pragmaChecks.length,
  implementationGateFamilies: Object.keys(node.gates).length
};
comparisons.total = Object.values(comparisons).reduce((sum, count) => sum + count, 0);

const audit = {
  auditId: "RC51-PERSISTENT-GOSSIP-INDEPENDENT-ADJUDICATION-0.1",
  cycleId: precommit.cycleId,
  reviewedOn: "2026-08-25",
  preregistrationCommit: "5a2f847",
  runtimes: { node: node.runtime, python: python.runtime },
  comparisons,
  hypothesisAdjudication: hypotheses,
  verdict: failures.length ? "fail" : "pass",
  failures,
  interpretation: failures.length
    ? "At least one preregistered persistence, cross-view, or blind-replay gate failed; RC51 must not be integrated."
    : "Two independent file-backed SQLite implementations agree on every preregistered verdict and state digest after actual process termination. A blind verifier reading only opaque events reconstructs the same results. This establishes application-process crash atomicity and local multi-process rollback/fork detection under the frozen schedule; it does not establish storage-device power-loss safety, operator independence, production protocol interoperability, or physical provenance.",
  preservedLimits: [
    "Process termination is not a power cut, torn write, filesystem failure, or disk-controller fault.",
    "SQLite's FULL/WAL guarantee relies on VFS, operating-system, filesystem, and storage behavior.",
    "Separate files, processes, and deterministic test keys on one host are not separately administered services.",
    "The sixteen cases are falsification fixtures, not a field error-rate sample.",
    "Physical acquisitions and chiplet specimens: 0."
  ]
};

const connectionEvidence = {
  connectionId: "CONN-EVIDENCE-024",
  cycleId: precommit.cycleId,
  problemIds: ["UP-605", "UP-602", "UP-315"],
  reviewedOn: "2026-08-25",
  type: "Transactional monotone state × external anti-rollback anchor × cross-view identifiability",
  commonStructure: "Fab lineage, chiplet provenance, and finite-history reconstruction all receive signed observations of a hidden sequence. A signature fixes authorship and bytes, a local transaction fixes one process's state transition, and an independently retained checkpoint plus exchanged views determines whether that state is current and non-forked. These are different predicates and must not be collapsed.",
  variableMapping: [
    { processLineage: "accepted wafer-event tree head", chipletProvenance: "newest accepted pedigree checkpoint", finiteHistory: "maximum observed history prefix", shared: "retained monotone frontier" },
    { processLineage: "restart-domain nonce", chipletProvenance: "shipment or enrollment transition token", finiteHistory: "one-use transition witness", shared: "consumed edge identifier" },
    { processLineage: "equipment/writer key epoch", chipletProvenance: "manufacturer or inspection-authority key epoch", finiteHistory: "trusted observation-rule version", shared: "versioned trust continuity" },
    { processLineage: "restored process database", chipletProvenance: "replayed old pedigree ledger", finiteHistory: "shorter admissible prefix", shared: "internally valid rollback" },
    { processLineage: "fab/customer log view", chipletProvenance: "vendor/customer transparency view", finiteHistory: "observer-specific evidence set", shared: "split observation" },
    { processLineage: "same event sequence with different payload", chipletProvenance: "same device/lot sequence with different pedigree", finiteHistory: "same index with incompatible state", shared: "issuer equivocation" }
  ],
  holdsWhen: [
    "The state tuple is committed in one local transaction and database integrity survives restart.",
    "The anchor that remembers the newest generation is not restored with the primary database.",
    "Rotation is exactly sequential and authorized by both the immediately trusted and proposed key sets.",
    "Observers exchange signed views with stable log, issuer, subject, sequence, and digest semantics.",
    "At least one retained observer or anchor remains outside the rollback or fork fault."
  ],
  breaksWhen: [
    "Primary and anchor are rolled back together or all observers receive the same fork.",
    "A compromised signer creates false but mutually consistent physical claims.",
    "Operational keys, administrators, power, or storage share an unmeasured common cause.",
    "Tree size, generation, subject, or sequence have different meanings across services.",
    "The hidden physical event occurs before every independent witness or is absent from the modeled lineage."
  ],
  minimumValidation: "Repeat F03-F16 with an anchor under a separate administrator and host, hardware-backed operational keys, and a storage fault-injection or controlled power-interruption protocol. Exchange views through an independently implemented monitor, then open one preregistered untouched acquisition only if no rollback, replay, or fork passes.",
  validationStatus: "Strong software-structural connection in local multi-process scope: Node SQLite 3.52.0 and Python SQLite 3.41.2 agree on sixteen fixtures, forty integrity/configuration snapshots pass, and blind replay matches sixteen verdict/state pairs. Separate operators: 0; storage power cuts: 0; physical acquisitions: 0.",
  transferableMethod: "Transfer TUF-style exact-version and dual-key continuity plus CT-style retained-head comparison into scientific and hardware provenance, while using one transactional causal tuple locally and an external anchor only for facts the local backup cannot remember."
};

const cycleResult = {
  resultId: "RC51-PERSISTENT-GOSSIP-CYCLE-RESULT-0.1",
  cycleId: precommit.cycleId,
  reviewedOn: "2026-08-25",
  precommit: { path: "research/reproducibility/rc51-persistent-gossip-precommit.json", gitCommit: "5a2f847" },
  selectedProblems: [
    { id: "UP-605", reason: "Process-twin residuals are scientifically meaningful only if the input lineage survives restart and is current rather than a restored or forked history." },
    { id: "UP-602", reason: "Chiplet pedigree has the same anti-rollback and trust-rotation problem; TUF supplies a concrete cross-field transfer with exact N+1 and old/new key continuity." },
    { id: "UP-315", reason: "The experiment isolates the observation needed to distinguish two otherwise valid hidden histories: an independently retained later checkpoint or a conflicting peer view." }
  ],
  newlyVerifiedFacts: [
    "Node SQLite 3.52.0 and Python SQLite 3.41.2 independently agree on all sixteen verdicts and final causal-state digests.",
    "Termination before COMMIT leaves the complete old tuple and a retry accepts once; termination after COMMIT but before response leaves the complete new tuple and a retry is rejected.",
    "The same atomic boundary holds for accepted head, domain generation, spent nonce, and for exact-successor key rotation.",
    "A safe SQLite backup restored while connections are closed remains internally valid and passes integrity_check, but the single database cannot know that a later generation existed.",
    "An unrestored generation-two anchor refuses the restored generation-one primary.",
    "Locally valid signatures do not prevent nonce replay, nonce fork, stale tree heads, same-size/different-root log forks, or same-sequence issuer forks.",
    "Exchanging retained views refuses all three preregistered stale/equivocation cases and accepts the nonconflicting advance.",
    "The blind verifier reconstructs sixteen of sixteen verdicts and state digests without fixture labels, expected verdicts, or generator outcomes.",
    "All forty Node/Python database snapshots report WAL, synchronous=FULL, foreign keys enabled, and integrity_check=ok.",
    "No power-loss, multi-host operator-independence, production protocol, or physical-provenance test occurred."
  ],
  hypothesisAdjudication: hypotheses,
  mostPromisingPath: {
    name: "Externally anchored causal checkpoint",
    status: "A tested composition of established transaction, update-security, and transparency ideas; not claimed as a new primitive or production profile.",
    claim: "Keep the accepted head, domain generation, spent nonce, and key epoch in one local transaction. Publish only its digest and monotone generation to a fault-separated anchor, and require exact predecessor/new-key continuity plus peer-view comparison before accepting a successor. The local database supplies atomicity; the external memory supplies anti-rollback; exchanged views supply fork evidence.",
    exactBottleneck: "A crash can interrupt one transition, a response can be lost after it commits, and a valid old backup can erase the fact that a nonce, key epoch, or tree head was already superseded. No signature answers all three questions.",
    decisiveTest: "Run the same frozen schedule on two hosts under separate administrators, with an anchor excluded from primary backups and hardware-backed operational keys. Add controlled storage-fault injection, independently exchange signed heads, and require the blind verifier to reject rollback, replay, stale views, and both fork types without rejecting the consistent advance.",
    success: "No mixed tuple after any injected failure; no committed nonce or rotation accepted twice; restored primary refused by the external anchor; all conflicting views yield signed evidence; independent monitor and verifier agree.",
    rejection: "Reject the architecture if a fault inside the declared model advances only part of the tuple, if primary and fault-separated anchor can both regress undetected, or if two conflicting valid views are accepted after exchange.",
    stop: "Stop physical-provenance claims if anchor custody is not independent, view semantics differ, operational key rotation is not rehearsed, or power/storage behavior remains untested."
  },
  workPackages: [
    { id: "WP51-1", status: "complete-in-process-crash-scope", purpose: "Persistent causal baseline", method: "Two file-backed SQLite implementations inject termination before and after transaction and rotation commit.", output: "Sixteen matched verdict/state pairs and forty integrity snapshots", pass: "All preregistered gates pass", failNext: "Isolate transaction, signature, or state-digest divergence" },
    { id: "WP51-2", status: "next", purpose: "Storage durability boundary", method: "Use an approved SQLite crash-test VFS or controlled power-interruption rig across commit and checkpoint boundaries.", output: "Torn-write/power-loss matrix with storage-stack metadata", pass: "Old or new complete tuple only; no corruption or silent mixed state", failNext: "Change journal/VFS/storage design and bound the unsupported platform" },
    { id: "WP51-3", status: "next", purpose: "Administrative fault separation", method: "Place primary, anchor, and monitor on separately administered hosts with hardware-backed keys and independent backups.", output: "Custody diagram, rotation/revocation transcript, split-view exchange evidence", pass: "One-domain rollback or key loss does not erase every checkpoint", failNext: "Reduce guarantee to the measured common-cause domain" },
    { id: "WP51-4", status: "gated", purpose: "Untouched physical witness", method: "After WP51-2/3, preregister one pre-capture hardware receipt and one ordinary acquisition without exposing the event map to adjudicators.", output: "One independently joined physical event", pass: "Both paths bind the same event and payload before ordinary capture", failNext: "Audit clocks, power, firmware, and administrator common causes" },
    { id: "WP51-5", status: "later", purpose: "Many-to-many lineage", method: "Replace one transition chain with a time-bounded bipartite graph and retain a digest of the admissible-history set.", output: "Exact or set-valued histories under asynchronous sampling", pass: "Singleton claims occur only when one graph survives", failNext: "Report equivalence classes and design a separating measurement" }
  ],
  uncertaintyBudget: [
    { source: "measurement", current: "Physical acquisitions n=0", reduction: "One untouched pre-capture/ordinary-path acquisition after software and custody gates" },
    { source: "storage", current: "Application process termination only", reduction: "Fault-injected VFS or controlled power interruption on documented storage hardware" },
    { source: "implementation", current: "Two languages and SQLite builds on one Windows host", reduction: "Independent host, implementation, and monitoring stack" },
    { source: "model", current: "Sixteen frozen cases and one-to-one transitions", reduction: "Partial-order and many-to-many adversarial schedules" },
    { source: "organizational", current: "Separate test processes and keys; independent operators 0", reduction: "Documented custody, backup, rotation, revocation, and non-colluding administration" },
    { source: "extrapolation", current: "No production SCITT, Rekor, TUF, fab, or chiplet deployment", reduction: "Standards interoperability and controlled domain pilot" }
  ],
  failedOrRejectedApproaches: [
    "Signature-only one-time semantics is rejected by the valid nonce replay and fork.",
    "A single persistent database as its own anti-rollback oracle is rejected by the valid old-backup restore.",
    "Old-key-only rotation and new-key-only rotation are each rejected; continuity needs both sides of the immediate transition.",
    "One locally valid tree head as global uniqueness proof is rejected by stale and split-view fixtures.",
    "Separate local processes and keys are insufficient evidence of operator independence.",
    "Process-crash success is not accepted as evidence of physical power-loss durability."
  ],
  unresolved: [
    "Whether the causal tuple survives real power interruption, torn sectors, and faulty flush semantics on the target storage stack.",
    "Whether primary, anchor, monitor, and key custody can be separated across real organizations without a common backup or administrative rollback path.",
    "Whether a production transparency implementation exchanges semantically compatible heads and conflict evidence within a bounded time.",
    "Whether a physical witness binds the event before the ordinary writer and remains independent in firmware, power, clock, and administration.",
    "How the monotone tuple generalizes to asynchronous many-to-many wafer, metrology, shipment, and inspection relations.",
    "The prevalence and cost distribution of replay, rollback, fork, false refusal, and unavailable-anchor events in field operation."
  ],
  nextCycleStart: "RC52 should not repeat the process-termination fixtures or increase their count. First move the primary and anchor to fault-separated hosts and inject a documented storage-level failure at the frozen commit/checkpoint boundaries, with operational rotation and an independently implemented view monitor. Keep physical acquisition and X16 closed until the storage and administrative common-cause gates pass."
};

write("research/reproducibility/rc51-persistent-gossip-independent-audit.json", audit);
write("research/reproducibility/rc51-persistent-gossip-connection-evidence.json", connectionEvidence);
write("research/reproducibility/rc51-persistent-gossip-cycle-result.json", cycleResult);
if (failures.length) throw new Error(`RC51 adjudication failed: ${failures.join("; ")}`);
console.log(`RC51 independent adjudication PASS: ${comparisons.total} structured checks; 16/16 blind verdict/state pairs.`);
