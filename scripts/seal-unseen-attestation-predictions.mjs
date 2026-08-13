import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative));
const readJson = relative => JSON.parse(read(relative).toString("utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const jsPath = "research/reproducibility/unseen-attestation-js-predictions.json";
const pyPath = "research/reproducibility/unseen-attestation-python-predictions.json";
const corpusPath = "research/reproducibility/unseen-attestation-corpus.json.gz";
const manifestPath = "research/reproducibility/unseen-attestation-corpus-manifest.json";
const protocolPath = "research/reproducibility/unseen-attestation-protocol.json";
const outputPath = "research/reproducibility/unseen-attestation-precommit.json";
const js = readJson(jsPath);
const py = readJson(pyPath);
const protocol = readJson(protocolPath);
const schemaFiles = protocol.inputContract.structuralSchemas;
const schemaSetDigest = sha256(Buffer.from(schemaFiles.map(file => `${file}:${sha256(read(file))}`).join("\n"), "utf8"));

const output = {
  commitmentId: "UNSEEN-ATTESTATION-PRECOMMIT-0.6",
  phase: "pre-reveal",
  sealedOn: "2026-08-14",
  parentPublicCommit: "95d504c8d67bb35d2a32df7aff040b8fad1437e3",
  protocol: { path: protocolPath, sha256: sha256(read(protocolPath)) },
  corpus: {
    path: corpusPath,
    sha256: sha256(read(corpusPath)),
    manifestPath,
    manifestSha256: sha256(read(manifestPath)),
    caseCount: js.predictions.length,
    expectedOutcomesIncluded: false
  },
  schemas: { count: schemaFiles.length, orderedSetSha256: schemaSetDigest, files: schemaFiles },
  javascript: { path: jsPath, fileSha256: sha256(read(jsPath)), predictionDigest: js.predictionDigest, expectedOutcomesRead: js.expectedOutcomesRead },
  python: { path: pyPath, fileSha256: sha256(read(pyPath)), predictionDigest: py.predictionDigest, expectedOutcomesRead: py.expectedOutcomesRead },
  predictionsAgreeBeforeReveal: js.predictionDigest === py.predictionDigest,
  revealPathReserved: "research/reproducibility/unseen-attestation-reveal.json",
  chronologyBoundary: "The commit that first contains this file must not contain the reveal path. Its Git parent and descendant relation can prove repository ordering, but not RFC 3161 trusted time or independent authorship.",
  hardwareDevicesTested: 0
};

if (!output.predictionsAgreeBeforeReveal || js.predictions.length !== protocol.inputContract.caseCount || py.predictions.length !== protocol.inputContract.caseCount) throw new Error("Pre-reveal predictions are incomplete or disagree.");
if (process.argv.includes("--write")) fs.writeFileSync(path.join(root, outputPath), `${JSON.stringify(output, null, 2)}\n`, "utf8");
else if (JSON.stringify(readJson(outputPath)) !== JSON.stringify(output)) throw new Error("Precommit ledger differs from committed bytes.");
console.log(`RC31 pre-reveal seal ready: ${output.corpus.caseCount} cases, matching digest ${js.predictionDigest}, seven schemas.`);
