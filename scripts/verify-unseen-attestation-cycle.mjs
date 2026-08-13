import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative));
const readJson = relative => JSON.parse(read(relative).toString("utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const protocol = readJson("research/reproducibility/unseen-attestation-protocol.json");
const manifest = readJson("research/reproducibility/unseen-attestation-corpus-manifest.json");
const precommit = readJson("research/reproducibility/unseen-attestation-precommit.json");
const reveal = readJson("research/reproducibility/unseen-attestation-reveal.json");
const js = readJson("research/reproducibility/unseen-attestation-js-predictions.json");
const py = readJson("research/reproducibility/unseen-attestation-python-predictions.json");
const corpusBytes = read("research/reproducibility/unseen-attestation-corpus.json.gz");
const corpus = JSON.parse(zlib.gunzipSync(corpusBytes).toString("utf8"));

assert(protocol.inputContract.caseCount >= 20, "RC31 must contain at least twenty unseen cases.");
assert(manifest.caseCount === protocol.inputContract.caseCount && corpus.cases.length === manifest.caseCount, "Corpus case count mismatch.");
assert(corpus.oldFixtureCatalogueUsedAsTraining === false && corpus.expectedOutcomesIncluded === false && manifest.oldFixtureCatalogueUsedAsTraining === false && manifest.expectedOutcomesIncluded === false, "Sealed corpus must exclude old training fixtures and expected outcomes.");
assert(sha256(corpusBytes) === manifest.compressedSha256 && sha256(corpusBytes) === precommit.corpus.sha256, "Corpus digest mismatch.");
assert(precommit.predictionsAgreeBeforeReveal && precommit.javascript.predictionDigest === js.predictionDigest && precommit.python.predictionDigest === py.predictionDigest, "Prediction precommit mismatch.");
assert(js.expectedOutcomesRead === false && py.expectedOutcomesRead === false && js.oldFixtureCatalogueRead === false && py.oldFixtureCatalogueRead === false, "Pre-reveal implementations report forbidden input use.");
assert(js.predictionDigest === sha256(Buffer.from(canonical(js.predictions), "utf8")) && py.predictionDigest === sha256(Buffer.from(canonical(py.predictions), "utf8")), "Prediction digest is not reproducible.");
assert(canonical(js.predictions) === canonical(py.predictions), "JavaScript and Python pre-reveal predictions disagree.");
assert(reveal.preRevealCommit === "b2119ea8ec4e91e13cbed41d46aa165f98037373" && reveal.preRevealPredictionDigest === js.predictionDigest, "Reveal is not bound to the pushed pre-reveal commit and output digest.");
assert(reveal.cases.length === manifest.caseCount && new Set(reveal.cases.map(item => item.caseId)).size === manifest.caseCount, "Reveal is incomplete or duplicated.");

const truth = new Map(reveal.cases.map(item => [item.caseId, item]));
const comparisons = js.predictions.map(prediction => {
  const expected = truth.get(prediction.caseId);
  const matched = expected?.expectedVerdict === prediction.verdict && expected?.expectedFirstCode === prediction.firstCode;
  return {
    caseId: prediction.caseId,
    expectedVerdict: expected?.expectedVerdict,
    observedVerdict: prediction.verdict,
    expectedFirstCode: expected?.expectedFirstCode ?? null,
    observedFirstCode: prediction.firstCode,
    matched,
    mismatchClass: matched ? null : "unexplained-pending-triage"
  };
});
assert(comparisons.every(item => item.matched), `Reveal mismatch: ${JSON.stringify(comparisons.filter(item => !item.matched))}`);

const forbiddenPath = "hidden-vendor-adversarial-fixtures";
for (const file of ["scripts/generate-unseen-attestation-corpus.mjs", "scripts/adjudicate-unseen-attestation-js.mjs", "scripts/adjudicate_unseen_attestation_python.py"]) {
  assert(!read(file).toString("utf8").includes(forbiddenPath), `${file} imports or names the RC30 fixture catalogue.`);
}

const sandbox = { window: {} };
const siteFiles = [
  "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js",
  ...Array.from({ length: 29 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)
];
for (const file of siteFiles) vm.runInNewContext(read(file).toString("utf8"), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const publicCycle = cycles.find(item => item.id === "RC-2026-31");
assert(publicCycle?.problemIds.join("|") === "UP-602|UP-605|UP-625|UP-315", "RC31 public problem scope changed.");
assert(publicCycle?.connectionIds.join("|") === "CONN-ATTESTATION-004", "RC31 connection scope changed.");
assert(publicCycle?.verifiedFindings.length === 19 && publicCycle?.resultMatrix.rows.length === 28 && publicCycle?.artifacts.length === 11 && publicCycle?.log.length === 15, "RC31 public record is incomplete.");
assert(publicCycle?.nextCycle.text.includes("3×3 equality matrix") && publicCycle?.nextCycle.textEn.includes("three-by-three equality matrix"), "RC31 next starting point is not exact.");
for (const artifact of publicCycle?.artifacts || []) assert(fs.existsSync(path.join(root, artifact.url)), `Missing RC31 artifact: ${artifact.url}`);
const publicConnection = connections.find(item => item.id === "CONN-ATTESTATION-004");
assert(publicConnection?.problemIds.join("|") === publicCycle?.problemIds.join("|") && publicConnection?.strength === "moderate", "RC31 connection participants or strength changed.");
assert(publicConnection?.minimumTest.text.length > 100 && publicConnection?.failureBoundary.text.length > 100, "RC31 connection test or failure boundary is too weak.");
for (const id of publicCycle?.problemIds || []) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === publicCycle.id);
  assert(record?.hypotheses.length === 3 && record?.sourceIds.length >= 7, `${id}: RC31 hypotheses or sources are incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) assert(record?.[field]?.text?.length > 45 && record?.[field]?.textEn?.length > 70, `${id}: RC31 ${field} is not substantive and bilingual.`);
}
for (const id of ["rfc_json_patch_6902_2013", "rfc_jcs_8785_2020", "rfc_tsp_3161_2001", "rfc_ct_9162_2021", "rfc_hmac_2104_1997", "rfc_hkdf_5869_2010"]) assert(sources[id]?.reviewedOn === "2026-08-14" && /^https:\/\//.test(sources[id]?.url), `RC31 source ${id} is missing or stale.`);
assert(Object.keys(sources).length === 213 && cycles.length === 31 && connections.length === 34, "RC31 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 106, "RC31 curated-problem or research-record count changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).toString("utf8").includes("research-cycle-31-data.js"), `${page} does not load RC31.`);
const cycleText = read("research-cycle-31-data.js").toString("utf8");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지"]) assert(!cycleText.includes(phrase), `RC31 contains forbidden mechanical phrasing: ${phrase}`);

let history = { checked: false, preRevealCommitIsAncestor: null, revealAbsentAtPreRevealCommit: null };
if (process.argv.includes("--verify-git-history")) {
  execFileSync("git", ["merge-base", "--is-ancestor", reveal.preRevealCommit, "HEAD"], { cwd: root, stdio: "ignore" });
  let revealAbsent = false;
  try {
    execFileSync("git", ["cat-file", "-e", `${reveal.preRevealCommit}:research/reproducibility/unseen-attestation-reveal.json`], { cwd: root, stdio: "ignore" });
  } catch {
    revealAbsent = true;
  }
  assert(revealAbsent, "Reveal file existed in the alleged pre-reveal commit.");
  history = { checked: true, preRevealCommitIsAncestor: true, revealAbsentAtPreRevealCommit: true };
}

const counts = {};
for (const prediction of js.predictions) counts[prediction.verdict] = (counts[prediction.verdict] || 0) + 1;
const result = {
  resultId: "UNSEEN-ATTESTATION-COMMIT-REVEAL-RESULT-0.6",
  computedOn: "2026-08-14",
  status: "synthetic-precommit-reveal-complete",
  protocolId: protocol.protocolId,
  preRevealCommit: reveal.preRevealCommit,
  caseCount: comparisons.length,
  matchedExpectedOutcomes: comparisons.filter(item => item.matched).length,
  javascriptPythonPredictionDigest: js.predictionDigest,
  implementationAgreementBeforeReveal: canonical(js.predictions) === canonical(py.predictions),
  verdictCounts: counts,
  comparisons,
  mismatchClassification: { profileAmbiguity: 0, parserOrImplementationError: 0, threatModelDisagreement: 0, revealError: 0, unexplained: 0 },
  chronology: history,
  timestampQualification: {
    gitAnchoredCases: js.predictions.filter(item => item.timestampQualification === "git-anchor-only").length,
    rfc3161VerifiedCases: 0,
    invalidRfc3161ClaimDetected: truth.get("C23").expectedFirstCode === "A_TIMESTAMP_QUALIFICATION",
    claim: "Git ancestry establishes repository ordering only; no trusted time-stamp token was minted or verified."
  },
  packagePseudonymQualification: {
    construction: "HMAC-SHA-256 with a public synthetic demo key in the corpus generator",
    publicIdHashQuarantined: truth.get("C24").expectedFirstCode === "Q_COMMITMENT_PRIVACY",
    crossStudyScopeRejectedStructurally: truth.get("C25").expectedFirstCode === "S_PACKAGE_CONST",
    realSecretKeyUsed: false,
    physicalCustodyVerified: false
  },
  hypotheses: {
    boundarySemanticsAreUnambiguousAcrossTwoImplementations: comparisons.every(item => item.matched) && js.predictionDigest === py.predictionDigest,
    gitCommitIsTrustedTimestamp: false,
    publicIdentifierHashIsPrivacyPreserving: false,
    balancedCellCountsDetectEnrollmentLabelSwap: false,
    sameRepositoryImplementationsEstablishInstitutionalIndependence: false
  },
  established: "Twenty-eight previously unused synthetic bundles were frozen without expected labels; two separately implemented adjudicators committed the same ordered prediction digest before the reveal file entered Git history, and all twenty-eight verdict/first-code pairs matched the later reveal.",
  unresolved: "External parser authorship, production JSON Schema libraries, RFC 3161 token verification, append-only transparency receipts, secret-key enrollment, physical custody, real packages, hidden vendors, and hardware error rates remain untested.",
  nextGate: "Give the seven schemas, protocol, and an outcome-free corpus generator interface to an external team; require at least twenty privately generated cases, independent parser libraries, RFC 3161 or equivalent externally verifiable ordering, and signed prediction commitments before any reveal."
};
const resultPath = path.join(root, "research/reproducibility/unseen-attestation-result.json");
if (process.argv.includes("--write")) fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
else {
  const expected = readJson("research/reproducibility/unseen-attestation-result.json");
  const normalized = { ...result, chronology: expected.chronology };
  assert(canonical(normalized) === canonical(expected), "RC31 result differs from committed artifact.");
}
console.log(`RC31 reveal verified: ${result.matchedExpectedOutcomes}/${result.caseCount} predictions matched; no mismatch remained; hardware n=0.`);
