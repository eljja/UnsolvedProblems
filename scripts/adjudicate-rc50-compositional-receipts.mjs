import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const writeJson = (relative, value) => fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
const canonical = value => JSON.stringify(value);
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const precommit = readJson("research/reproducibility/rc50-compositional-receipts-precommit.json");
const node = readJson("research/reproducibility/rc50-compositional-receipts-node.json");
const python = readJson("research/reproducibility/rc50-compositional-receipts-python.json");
const wire = readJson("research/reproducibility/rc50-compositional-receipts-third-wire-audit.json");

check(precommit.precommitId === "RC50-COMPOSITIONAL-RECEIPTS-PRECOMMIT-0.1", "precommit ID changed");
check(node.cycleId === precommit.cycleId && python.cycleId === precommit.cycleId && wire.cycleId === precommit.cycleId, "cycle IDs disagree");
for (const field of ["eventCount", "placements", "payloadDigest", "referenceManifestRoot"]) {
  check(canonical(node.corpus[field]) === canonical(python.corpus[field]), `scientific corpus mismatch: ${field}`);
}
check(canonical(node.publicKeys) === canonical(python.publicKeys), "public-key fixtures disagree");
check(canonical(node.trials) === canonical(python.trials), "44 trial verdicts disagree");
check(canonical(node.summaries) === canonical(python.summaries), "arm summaries disagree");
check(canonical(node.h1Gate) === canonical(python.h1Gate), "H1 gate disagrees");
check(node.trials.length === 44 && node.h1Gate.pass && node.h1Gate.failures.length === 0, "preregistered H1 gate failed");
check(wire.allPassed && wire.exactExpectedCounts && wire.failures.length === 0, "standalone wire audit failed");
const expectedWire = {
  signedStatementPositive: precommit.corpus.standardsVectors.positiveSignedStatements,
  inclusionReceiptPositive: precommit.corpus.standardsVectors.positiveInclusionReceipts,
  consistencyReceiptPositive: precommit.corpus.standardsVectors.positiveConsistencyReceipts,
  statementSignatureMutationRejected: precommit.corpus.standardsVectors.negativeStatementSignatureMutations,
  receiptSignatureMutationRejected: precommit.corpus.standardsVectors.negativeReceiptSignatureMutations,
  wrongLeafRejected: precommit.corpus.standardsVectors.negativeWrongLeafChecks,
  inclusionPathMutationRejected: precommit.corpus.standardsVectors.negativeInclusionPathMutations,
  consistencyPathMutationRejected: precommit.corpus.standardsVectors.negativeConsistencyPathMutations
};
check(canonical(wire.checks) === canonical(expectedWire), "wire counts differ from preregistration");
check(wire.transparentStatement.issuerSignatureValid && wire.transparentStatement.twoIndependentReceiptsValid, "transparent-statement receipt attachment failed");

const summaries = node.summaries;
check(summaries.crossViewCausal.statuses["exact-composite"] === 27, "exact composite count changed");
check(summaries.crossViewCausal.statuses["set-valued-shadow"] === 3, "shadow ambiguity count changed");
check(summaries.crossViewCausal.statuses["outside-independent-boundary"] === 2, "collusion boundary count changed");
check(summaries.crossViewCausal.statuses["refuse-rollback"] === 3, "rollback refusal count changed");
check(summaries.crossViewCausal.statuses["refuse-issuer-equivocation"] === 2, "issuer equivocation refusal count changed");
check(summaries.crossViewCausal.statuses["refuse-log-equivocation"] === 2, "log equivocation refusal count changed");
check(summaries.crossViewCausal.statuses["reject-bridge-replay"] === 1 && summaries.crossViewCausal.statuses["reject-bridge-fork"] === 1, "bridge state checks changed");
check(summaries.receiptLocal.statuses["accepted-valid-local-receipt"] === 7, "local receipt counterexamples changed");
check(summaries.receiptLocal.statuses["accepted-valid-signatures"] === 2, "stateless bridge counterexamples changed");

const comparisons = {
  scientificCorpusFields: 4,
  publicKeyFixture: 1,
  trialVerdicts: node.trials.length,
  armSummaries: Object.keys(node.summaries).length,
  preregisteredGate: 1,
  wireCountFamilies: Object.keys(wire.checks).length,
  transparentStatementChecks: Object.keys(wire.transparentStatement).length
};
comparisons.totalExactStructuredComparisons = Object.values(comparisons).reduce((sum, count) => sum + count, 0);

const hypotheses = [
  {
    code: "H0", verdict: "rejected",
    reason: "Three shadowed mutation-then-omission cases and four signed equivocation cases leave more than one causal history. Universal exact composition is false even in the frozen grammar."
  },
  {
    code: "H1", verdict: failures.length ? "not-supported" : "supported-in-synthetic-scope",
    reason: "The witness-bounded causal graph returned the preregistered 3 clean, 27 exact, 3 set-valued, 7 refusal, 2 bridge rejection, and 2 outside-boundary verdicts with independent Node/Python agreement."
  },
  {
    code: "H2", verdict: "rejected",
    reason: "Seven rollback or equivocation fixtures retained valid local receipts or signatures while failing current or cross-view uniqueness."
  },
  {
    code: "H3", verdict: "rejected",
    reason: "A stateless verifier accepted one replayed and one forked, correctly signed reset bridge; the nonce became one-time only when retained registry state was consulted."
  },
  {
    code: "H4", verdict: "supported-in-synthetic-scope",
    reason: "Separate witness and writer commitments localized all eighteen observable payload-mutation composites, while two collusion fixtures remained explicitly outside the independent-witness boundary."
  }
];

const audit = {
  auditId: "RC50-COMPOSITIONAL-RECEIPTS-INDEPENDENT-ADJUDICATION-0.1",
  cycleId: precommit.cycleId,
  reviewedOn: "2026-08-25",
  implementations: [node.implementation, python.implementation, wire.implementation],
  comparisons,
  wireChecks: { ...wire.checks, total: Object.values(wire.checks).reduce((sum, count) => sum + count, 0), transparentStatement: wire.transparentStatement },
  preregisteredGate: node.h1Gate,
  hypothesisAdjudication: hypotheses,
  verdict: failures.length ? "fail" : "pass",
  failures,
  interpretation: failures.length
    ? "At least one preregistered comparison or independent control failed; no RC50 scientific result should be integrated."
    : "Two independent scientific generators agree on every frozen fixture and verdict, and a third no-shared-code parser accepts all positive RFC 9942/9943 subset vectors while rejecting every frozen mutation. The result identifies which synthetic causal histories are unique, set-valued, refused, or outside the first-witness boundary; it does not validate physical acquisition or general SCITT interoperability.",
  preservedLimits: node.limitations
};

const connectionEvidence = {
  connectionId: "CONN-EVIDENCE-023",
  cycleId: precommit.cycleId,
  problemIds: ["UP-605", "UP-315"],
  reviewedOn: "2026-08-25",
  type: "Local cryptographic validity × retained state × cross-view causal identifiability",
  commonStructure: "Both process-twin lineage and finite-history reconstruction observe signed records produced by a hidden sequence of physical events and transformations. Event identity, byte integrity, reset continuity, freshness, and observer agreement are independent coordinates; collapsing them into one valid/invalid receipt loses causal information.",
  variableMapping: [
    { processLineage: "wafer/chamber trigger ordinal", finiteHistory: "physical event index", sharedVariable: "event identity" },
    { processLineage: "capture/export/package commitment", finiteHistory: "observation boundary", sharedVariable: "first changed boundary" },
    { processLineage: "equipment restart and lot-domain change", finiteHistory: "counter-domain reset", sharedVariable: "state transition with one-time nonce" },
    { processLineage: "fab/vendor receipt views", finiteHistory: "competing retained histories", sharedVariable: "cross-view consistency" },
    { processLineage: "independent receiver digest", finiteHistory: "earliest independent measurement", sharedVariable: "truth boundary" }
  ],
  holdsWhen: [
    "Every evidence object names the same event and transformation domain.",
    "A relying party retains the newest accepted state and a spent-nonce registry.",
    "At least two independent observers can compare signed roots or consistency receipts.",
    "The candidate transformation grammar contains the true in-scope operations.",
    "The earliest witness and writer do not share the same hidden failure."
  ],
  breaksWhen: [
    "A mutation is erased by omission before any boundary commitment.",
    "Witness and writer collude or fail from one common cause.",
    "A verifier has no prior state against which to detect rollback or bridge replay.",
    "All observers receive the same fork and never exchange views.",
    "Unmodeled many-to-many or asynchronous transformations create additional histories."
  ],
  minimumValidation: "Reproduce all 44 fixtures independently, then repeat the bridge and split-view tests with persistent state and independently administered keys; only afterward introduce one untouched acquisition whose witness is generated before the normal capture path.",
  validationStatus: "Strong synthetic structural connection. Node and Python agree on 44 causal verdicts; the third verifier passes 81 wire checks. Physical acquisitions: 0; organizational-independence tests: 0.",
  transferableMethod: "Use a verdict lattice—exact history, candidate set, refuse, or outside boundary—backed by retained monotone state and shared views, instead of treating a valid receipt as a universal truth certificate."
};

const cycleResult = {
  resultId: "RC50-COMPOSITIONAL-RECEIPTS-CYCLE-RESULT-0.1",
  cycleId: precommit.cycleId,
  reviewedOn: "2026-08-25",
  precommit: { path: "research/reproducibility/rc50-compositional-receipts-precommit.json", gitCommit: "7354dda" },
  verifiedFindings: [
    "The preregistered cross-view arm returns exactly 3 clean, 27 exact composite, 3 set-valued shadow, 7 refusal, 2 bridge rejection, and 2 outside-boundary verdicts across 44 fixtures.",
    "Node and Python independently regenerate identical payload and manifest digests, seven public-key fixtures, all 44 trial records, three arm summaries, and the H1 gate.",
    "A code-independent parser passes 27 positive signed-statement, inclusion, and consistency checks and rejects 54 mutated-signature, wrong-leaf, and mutated-path controls.",
    "Three mutation-then-omission shadows are byte-identical to omission-only histories, so the correct result is a two-candidate set rather than a fabricated exact cause.",
    "Seven rollback or equivocation views retain locally valid receipts or signatures; local authenticity therefore does not establish freshness or one globally unique history.",
    "One replayed and one forked reset bridge remain cryptographically valid but are rejected once a spent-nonce and accepted-domain registry is retained.",
    "Separate witness and writer commitments exactly identify all eighteen observable payload-mutation composites in the frozen grammar.",
    "Two witness/writer collusion fixtures remain outside the independent-witness boundary even though all downstream signatures verify.",
    "A Transparent Statement keeps its issuer signature valid while carrying two independently valid receipts, confirming the frozen multi-service transport pattern.",
    "No physical acquisition or historical X16 identity artifact was used; both boundaries remain open."
  ],
  hypothesisAdjudication: hypotheses,
  newSolutionPath: {
    name: "Witness-bounded monotone causal receipt",
    status: "Experiment-specific application policy; not claimed as a new cryptographic primitive, SCITT profile registration, or production interoperability result.",
    claim: "A research record should carry separate evidence for event identity, committed bytes, reset continuity, retained freshness, cross-view agreement, and earliest independent witness. The adjudicator then returns an exact history only when all coordinates meet; otherwise it returns the surviving candidate set, refuses freshness or uniqueness, rejects consumed state transitions, or marks truth outside the witness boundary.",
    exactBottleneck: "A conventional receipt authenticates one statement and one log view but cannot by itself distinguish stale, forked, erased, or pre-witness histories.",
    minimumDecisiveTest: "Run the reset bridge and two-service split-view fixture through persistent stores controlled by separate operators, blind one verifier to the development vectors, and require exact agreement on current state, consumed nonces, and candidate histories before opening one physical acquisition.",
    success: "No replay or fork is accepted; every observable composite is exact; observationally identical shadows remain explicitly set-valued; collusion is not misreported as verified truth.",
    rejection: "Reject this path if an independent implementation can construct two in-scope histories with identical retained evidence that the policy nevertheless labels exact, or if valid clean histories are rejected under the frozen assumptions.",
    stop: "Stop deployment claims if keys are not independently administered, observers cannot exchange views, persistent state can roll back, or physical-event semantics are not bound before the ordinary capture path."
  },
  workPackages: [
    { id: "WP50-1", purpose: "Reproducible baseline", method: "Freeze 44 causal fixtures and 27 positive plus 54 negative wire checks.", output: "Three implementation artifacts and one adjudication report", pass: "Exact scientific agreement and all wire controls pass", failNext: "Isolate generator, parser, or standards-profile divergence before site integration" },
    { id: "WP50-2", purpose: "Persistent reset continuity", method: "Move the spent-nonce and accepted-domain registry into a transactional store and inject crash/replay/fork schedules.", output: "Durable bridge-state trace", pass: "No committed nonce is reused and no domain forks after restart", failNext: "Add atomic compare-and-set or reject cross-domain continuation" },
    { id: "WP50-3", purpose: "Cross-view freshness", method: "Operate two transparency views and a gossip monitor with retained signed heads and consistency receipts.", output: "View-comparison transcript", pass: "Rollback and inconsistent roots are detected without trusting one service", failNext: "Increase observer diversity or downgrade uniqueness to single-view validity" },
    { id: "WP50-4", purpose: "Independent physical witness", method: "Have a pre-capture device sign trigger and payload digest before the normal acquisition writer.", output: "One untouched bench acquisition with role-separated receipts", pass: "Blind verifiers join the same event and bytes across both paths", failNext: "Measure common-cause and clock envelopes before increasing sample size" },
    { id: "WP50-5", purpose: "Many-to-many generalization", method: "Replace one-event/one-record order with an interval bipartite graph and enumerate residual histories.", output: "Candidate-history bounds under asynchronous sampling", pass: "Exact claims occur only when the graph has one admissible history", failNext: "Report equivalence classes and design a discriminating measurement" }
  ],
  uncertaintyBudget: [
    { source: "measurement", current: "No physical measurement; n=0", reduction: "One preregistered untouched acquisition with a pre-capture witness" },
    { source: "model", current: "Finite causal grammar with one-to-one ordered records", reduction: "Inject unmodeled and many-to-many transformations" },
    { source: "computation", current: "Exact deterministic fixtures but only a strict CBOR/COSE subset", reduction: "Interop corpus against an external implementation" },
    { source: "organizational", current: "Distinct deterministic keys do not prove independent custody", reduction: "Separate operators, hardware-backed keys, rotation and revocation drill" },
    { source: "extrapolation", current: "Synthetic result cannot establish fab or X16 validity", reduction: "Keep application claims scoped until untouched physical replication" }
  ],
  failedAttempts: [
    "Universal exact composition fails when a mutation is deleted before commitment; three cases have two indistinguishable histories.",
    "Local receipt validity fails as a freshness test in three rollback cases.",
    "One log view fails as a global uniqueness test in two log-equivocation cases.",
    "Issuer signature validity fails as a single-statement uniqueness test in two issuer-equivocation cases.",
    "Two valid signatures fail to make a reset bridge one-time without retained nonce state.",
    "Role-separated public keys fail to establish organizational independence under two collusion fixtures."
  ],
  unresolved: [
    "Whether an operational pre-capture witness can be independent of the acquisition writer in hardware, administration, time, and power domains.",
    "Whether persistent bridge state remains monotone across crash recovery, backup restoration, and key rotation.",
    "Whether independently operated transparency services and gossip expose real split views within a bounded time.",
    "How candidate-history enumeration scales under asynchronous many-to-many wafer and metrology relations.",
    "Whether the frozen RFC 9942/9943 subset interoperates with an unrelated production implementation.",
    "The filename, digest, semantics, and direct join for any historical X16 identity artifact."
  ],
  nextCycleStart: "RC51 should move only the reset registry and cross-view monitor from deterministic fixtures into crash-tested persistent services with separately administered keys. Do not increase synthetic counts first. Open one untouched physical acquisition only after rollback, fork, nonce replay, backup restore, and blind external verification gates pass."
};

writeJson("research/reproducibility/rc50-compositional-receipts-independent-audit.json", audit);
writeJson("research/reproducibility/rc50-compositional-receipts-connection-evidence.json", connectionEvidence);
writeJson("research/reproducibility/rc50-compositional-receipts-cycle-result.json", cycleResult);
if (failures.length) throw new Error(`RC50 adjudication failed: ${failures.join("; ")}`);
console.log(`RC50 independent adjudication PASS: ${comparisons.totalExactStructuredComparisons} exact structures and ${audit.wireChecks.total} wire checks.`);
