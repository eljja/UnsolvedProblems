import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputArg = process.argv.findIndex(value => value === "--output");
const outputPath = outputArg >= 0 ? process.argv[outputArg + 1] : "research/reproducibility/rc49-identity-plane-independent-audit.json";
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const canonical = value => JSON.stringify(value);
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const precommit = readJson("research/reproducibility/rc49-identity-plane-precommit.json");
const node = readJson("research/reproducibility/rc49-identity-plane-node.json");
const python = readJson("research/reproducibility/rc49-identity-plane-python.json");

check(node.precommitId === precommit.precommitId && python.precommitId === precommit.precommitId, "precommit ID mismatch");
check(!node.implementation.importedOtherOutcome && !python.implementation.importedOtherOutcome, "an implementation imported another outcome");
for (const field of ["corpus", "cryptography", "summaries", "h1Gate", "hypothesisAdjudication", "trials", "receipts", "limitations"]) {
  check(canonical(node[field]) === canonical(python[field]), `independent mismatch: ${field}`);
}
check(node.corpus.eventCount === 10000 && node.corpus.trialCount === 80 && node.corpus.armRegimeEvaluations === 400, "corpus or evaluation count changed");
check(node.receipts.length === 480 && node.cryptography.signatureSelfChecksPassed === 480 && node.cryptography.merkleSelfChecksPassed === 480, "positive cryptographic checks incomplete");
check(node.cryptography.mutatedSignatureRejections === 480 && node.cryptography.mutatedSignedRootRejections === 480, "negative cryptographic controls incomplete");
check(node.h1Gate.pass && node.h1Gate.exactObservable === 55 && node.h1Gate.resetRefusals === 15 && node.h1Gate.precommitAbstentions === 5 && node.h1Gate.cleanAccepted === 5, "H1 preregistered gate failed");
const byArm = Object.fromEntries(node.summaries.map(item => [`${item.arm}:${item.regime || "none"}`, item]));
check(byArm["counter-only:none"].exactEventAndStage === 0 && byArm["counter-only:none"].statuses["event-only"] === 45, "counter-only boundary changed");
check(byArm["signature-only:none"].exactEventAndStage === 0 && byArm["signature-only:none"].exactStageAnyEvent === 50, "signature-only boundary changed");
check(byArm["clock-only:tight-40us"].exactEventAnyStage === 45 && byArm["clock-only:loose-60us"].statuses["ambiguous-clock"] === 80, "clock-envelope result changed");
check(byArm["counter-plus-merkle:none"].exactEventAndStage === 55 && byArm["counter-plus-merkle:none"].cleanFalseCalls === 0, "combined-arm result changed");

const audit = {
  auditId: "RC49-COUNTER-MERKLE-INDEPENDENT-ADJUDICATION-0.1",
  cycleId: precommit.cycleId,
  reviewedOn: "2026-08-25",
  implementations: [node.implementation, python.implementation],
  comparisons: {
    corpusDigests: 2,
    trialVerdicts: node.trials.length,
    receiptStatements: node.receipts.length,
    receiptSignatures: node.receipts.length,
    aggregateSummaries: node.summaries.length,
    totalExactStructuredComparisons: 2 + node.trials.length + node.receipts.length * 2 + node.summaries.length
  },
  cryptographicControls: {
    validSignaturesAcceptedByEachImplementation: node.cryptography.signatureSelfChecksPassed,
    validMerkleRootsRecomputedByEachImplementation: node.cryptography.merkleSelfChecksPassed,
    mutatedSignaturesRejectedByEachImplementation: node.cryptography.mutatedSignatureRejections,
    mutatedSignedRootsRejectedByEachImplementation: node.cryptography.mutatedSignedRootRejections,
    publicDemoKeyOnly: true
  },
  preregisteredGate: node.h1Gate,
  verdict: failures.length === 0 ? "pass" : "fail",
  failures,
  interpretation: failures.length === 0
    ? "Two independent implementations exactly agree on corpus identities, 400 arm/regime verdicts, 480 chained receipt statements, 480 Ed25519 signatures, aggregate counts, and all positive and negative cryptographic controls. This validates the synthetic stage-bounded identity claim, not a production or historical X16 identity plane."
    : "Independent agreement or a preregistered gate failed; no RC49 scientific claim is integrated.",
  preservedLimits: [
    "Five capture payload mutations are intentionally not detected because no independent payload witness exists before the first commitment.",
    "Fifteen unannounced resets are localized to a boundary and start position but downstream identity is refused.",
    "The deterministic public Ed25519 seed demonstrates verification behavior and cannot establish operational signer identity.",
    "One synthetic fault per trial, a complete reference roster, and one-record-per-trigger semantics remain assumptions."
  ]
};

fs.writeFileSync(path.join(root, outputPath), `${JSON.stringify(audit, null, 2)}\n`);
if (failures.length) throw new Error(`RC49 independent adjudication failed: ${failures.join("; ")}`);
console.log(`RC49 independent adjudication PASS: ${audit.comparisons.totalExactStructuredComparisons} exact structured comparisons.`);
