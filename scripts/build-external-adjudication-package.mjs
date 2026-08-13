import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative));
const readJson = relative => JSON.parse(read(relative).toString("utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const protocolPath = "research/reproducibility/unseen-attestation-protocol.json";
const protocol = readJson(protocolPath);
const submissionSchema = "research/reproducibility/external-adjudication-submission.schema.json";
const included = [...protocol.inputContract.structuralSchemas, protocolPath, submissionSchema];
const manifest = {
  packageId: "EXTERNAL-ADJUDICATION-COLLABORATION-PACKAGE-0.7",
  builtOn: "2026-08-14",
  purpose: "Inputs sufficient for an external team to author an independent parser and return a signed, externally time-anchored prereveal prediction submission on at least twenty privately generated cases.",
  includedFiles: included.map(file => ({ path: file, sha256: sha256(read(file)), bytes: read(file).length })),
  excludedDevelopmentFiles: [
    "scripts/adjudicate-unseen-attestation-js.mjs",
    "scripts/adjudicate_unseen_attestation_python.py",
    "research/reproducibility/unseen-attestation-js-predictions.json",
    "research/reproducibility/unseen-attestation-python-predictions.json",
    "research/reproducibility/unseen-attestation-reveal.json"
  ],
  publicDevelopmentCorpus: {
    manifest: "research/reproducibility/unseen-attestation-corpus-manifest.json",
    corpus: "research/reproducibility/unseen-attestation-corpus.json.gz",
    use: "Parser-conformance development only; its reveal is public and it cannot serve as the private final audit."
  },
  privateAuditRequirements: {
    minimumCases: 20,
    generatorIndependentFromCurrentFixtureAndReveal: true,
    outcomesUnavailableUntilAllSignedSubmissionsAreExternallyTimeAnchored: true,
    differentParserLibrary: true,
    differentAuthors: true,
    unexplainedMismatchMaximum: 0,
    requiredMismatchClasses: ["profile-ambiguity", "parser-or-implementation-error", "threat-model-disagreement", "reveal-error"]
  },
  currentStatus: {
    externalTeamEnrolled: false,
    privateCasesReceived: 0,
    signedSubmissionReceived: false,
    externallyVerifiedTimeEvidenceReceived: false,
    reason: "The package freezes collaboration inputs; no external institution has participated in RC32."
  },
  safetyAndDisclosure: "Private cases must remain synthetic or use legally authorized hardware. Do not include production keys, customer identifiers, exploit instructions, or uncoordinated vulnerability details."
};
const outputPath = "research/reproducibility/external-adjudication-package-manifest.json";
if (process.argv.includes("--write")) fs.writeFileSync(path.join(root, outputPath), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
else if (JSON.stringify(readJson(outputPath)) !== JSON.stringify(manifest)) throw new Error("External collaboration package manifest differs from committed inputs.");
console.log(`RC32 external package frozen: ${included.length} files; external team enrolled=false; private cases=0.`);
