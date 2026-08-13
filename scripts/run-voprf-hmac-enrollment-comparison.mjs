import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const fixture = readJson("research/reproducibility/rfc9497-p256-voprf-vectors.json");
const pythonVoprf = readJson("research/reproducibility/rfc9497-p256-voprf-result.json");
const javascriptVoprf = readJson("research/reproducibility/rfc9497-p256-voprf-js-audit.json");
const messageGraph = readJson("research/reproducibility/pairwise-unlinkable-dispute-result.json");
const HMAC_KEY = "rc33-public-synthetic-comparison-custody-key";
const STUDY_KEYS = {
  "STUDY-A": "rc33-public-synthetic-comparison-study-a",
  "STUDY-B": "rc33-public-synthetic-comparison-study-b",
  "STUDY-C": "rc33-public-synthetic-comparison-study-c"
};
const hmac = (key, value) => crypto.createHmac("sha256", key).update(value).digest("hex");
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);

const voprfOutputs = {
  "SYNTHETIC-PACKAGE-X": fixture.vectors[0].outputs[0],
  "SYNTHETIC-PACKAGE-Y": fixture.vectors[1].outputs[0]
};
const columns = [
  { column: "X-FIRST", raw: "SYNTHETIC-PACKAGE-X" },
  { column: "X-REPEAT", raw: "SYNTHETIC-PACKAGE-X" },
  { column: "Y-FIRST", raw: "SYNTHETIC-PACKAGE-Y" }
];
const rows = [];
for (const studyId of Object.keys(STUDY_KEYS)) for (const item of columns) {
  const hmacToken = hmac(HMAC_KEY, `hmac-relay-v1\0${studyId}\0${item.raw}`);
  const vectorVoprfToken = voprfOutputs[item.raw];
  rows.push({
    studyId,
    column: item.column,
    syntheticRawPackageId: item.raw,
    hmacRelayToken: hmacToken,
    hmacFinalCommitment: hmac(STUDY_KEYS[studyId], `comparison-final-v1\0${studyId}\0${hmacToken}`),
    vectorBackedVoprfToken: vectorVoprfToken,
    voprfFinalCommitment: hmac(STUDY_KEYS[studyId], `comparison-final-v1\0${studyId}\0${vectorVoprfToken}`)
  });
}

function metrics(tokenField, commitmentField) {
  const within = Object.keys(STUDY_KEYS).map(studyId => {
    const set = rows.filter(row => row.studyId === studyId);
    const x = set.filter(row => row.syntheticRawPackageId.endsWith("X"));
    const y = set.find(row => row.syntheticRawPackageId.endsWith("Y"));
    return { studyId, repeatDetected: x[0][commitmentField] === x[1][commitmentField], differentPackageSeparated: x[0][commitmentField] !== y[commitmentField] };
  });
  const crossStudyTokenCardinality = Object.fromEntries(["SYNTHETIC-PACKAGE-X", "SYNTHETIC-PACKAGE-Y"].map(raw => [raw, new Set(rows.filter(row => row.syntheticRawPackageId === raw).map(row => row[tokenField])).size]));
  const crossStudyCommitmentCardinality = Object.fromEntries(["SYNTHETIC-PACKAGE-X", "SYNTHETIC-PACKAGE-Y"].map(raw => [raw, new Set(rows.filter(row => row.syntheticRawPackageId === raw).map(row => row[commitmentField])).size]));
  return {
    sameStudyDuplicateRecall: within.filter(item => item.repeatDetected).length,
    sameStudyDuplicateTrials: within.length,
    differentPackageFalseCollisions: within.filter(item => !item.differentPackageSeparated).length,
    differentPackageTrials: within.length,
    crossStudyTokenCardinality,
    crossStudyFinalCommitmentCardinality: crossStudyCommitmentCardinality
  };
}

const hmacMetrics = metrics("hmacRelayToken", "hmacFinalCommitment");
const voprfMetrics = metrics("vectorBackedVoprfToken", "voprfFinalCommitment");
const result = {
  resultId: "VOPRF-HMAC-ENROLLMENT-COMPARISON-0.8",
  computedOn: "2026-08-14",
  records: rows.length,
  inputMapping: {
    "SYNTHETIC-PACKAGE-X": "RFC 9497 A.3.2 input 00",
    "SYNTHETIC-PACKAGE-Y": "RFC 9497 A.3.2 input 5a repeated 17 times",
    boundary: "The comparison reuses two published vector outputs; it does not run a live VOPRF service on arbitrary package identifiers."
  },
  hmacRelay: {
    construction: "HMAC-SHA-256(public synthetic key, studyId || normalized package ID), followed by a study-keyed final commitment",
    serverSeesUnblindedInput: true,
    proofOfConsistentServerKey: false,
    metrics: hmacMetrics
  },
  vectorBackedVoprf: {
    construction: "Published RFC 9497 P256-SHA256 VOPRF output, followed by the same study-keyed final commitment",
    protocolServerSeesUnblindedInput: false,
    proofOfConsistentServerKey: pythonVoprf.passed && javascriptVoprf.passed,
    officialVectorsVerifiedByPython: pythonVoprf.vectors.filter(item => item.dleqProofValid && item.outputsMatch).length,
    officialVectorsVerifiedByJavaScript: javascriptVoprf.vectors.filter(item => item.proofValid && item.outputMatches).length,
    metrics: voprfMetrics,
    stableClientOutputBoundary: "Standard VOPRF output is stable for the same private input and server key. In this fixture its cross-study token cardinality is one; study-scoped final commitments restore public separation but do not erase the stable client-side token."
  },
  transportResult: {
    normalPairLinkedOutcomeRecords: messageGraph.normalPairTotalLinkedOutcomeRecords,
    authorizedOpeningOutcomeRecords: messageGraph.disputeTests.openedUniqueOutcomeRecords,
    threeRoleLinkedOutcomeRecords: messageGraph.threeOperationalRoleLinkedOutcomeRecords,
    interpretation: "These counts come from role-specific transport handles and are unchanged by choosing HMAC or a vector-backed VOPRF token."
  },
  hypotheses: {
    C1_both_candidates_preserve_sameStudyDuplicateDetectionInThisFixture: hmacMetrics.sameStudyDuplicateRecall === 3 && voprfMetrics.sameStudyDuplicateRecall === 3 && hmacMetrics.differentPackageFalseCollisions === 0 && voprfMetrics.differentPackageFalseCollisions === 0,
    C2_voprf_automatically_provides_crossStudyTokenUnlinkability: false,
    C3_transportMessageGraph_not_prf_choice_determines_enumerated_pairwise_rawOutcomeJoins: messageGraph.normalPairTotalLinkedOutcomeRecords === 0
  },
  qualification: {
    publishedVoprfTranscriptConformance: "pass-two-independent-repository-implementations",
    arbitraryInputVoprfEvaluation: "untested",
    liveVoprfInteroperability: "untested",
    hmacProductionKeyCustody: "unqualified-public-key",
    voprfProductionKeyCustody: "unqualified-public-vector-key",
    sideChannelsAndMaliciousRoles: "untested",
    physicalPackages: 0
  },
  rowsDigest: crypto.createHash("sha256").update(canonical(rows)).digest("hex"),
  conclusion: "HMAC and the vector-backed VOPRF candidate both recover three of three within-study repeats with zero different-package collisions after study-scoped commitment. VOPRF adds input blindness and a verifiable server-key transcript, but its same-input output remains stable across studies in this fixture. Pairwise raw-to-outcome unlinkability comes from the transport message graph, not from substituting one PRF primitive for another."
};

const output = path.join(root, "research/reproducibility/voprf-hmac-enrollment-comparison-result.json");
if (process.argv.includes("--write")) fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
else if (JSON.stringify(readJson("research/reproducibility/voprf-hmac-enrollment-comparison-result.json")) !== JSON.stringify(result)) throw new Error("VOPRF-HMAC comparison differs from committed artifact.");
if (!result.hypotheses.C1_both_candidates_preserve_sameStudyDuplicateDetectionInThisFixture || result.hypotheses.C2_voprf_automatically_provides_crossStudyTokenUnlinkability || !result.hypotheses.C3_transportMessageGraph_not_prf_choice_determines_enumerated_pairwise_rawOutcomeJoins) throw new Error("VOPRF-HMAC comparison hypothesis adjudication failed.");
console.log("RC33 VOPRF/HMAC comparison: both 3/3 duplicate recall and 0 false collisions; VOPRF stable token cardinality=1; transport pair links=0.");
