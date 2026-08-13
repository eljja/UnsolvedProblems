import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const protocol = readJson("research/reproducibility/role-separated-enrollment-protocol.json");
const SYNTHETIC_CUSTODY_KEY = "rc32-public-synthetic-custody-key";
const SYNTHETIC_STUDY_KEYS = {
  "STUDY-A": "rc32-public-synthetic-study-key-a",
  "STUDY-B": "rc32-public-synthetic-study-key-b",
  "STUDY-C": "rc32-public-synthetic-study-key-c"
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const hash = value => crypto.createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
const hmac = (key, value) => crypto.createHmac("sha256", key).update(value).digest("hex");
const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

const studies = protocol.matrix.studies;
const columns = [
  { column: "PACKAGE-X-FIRST", rawPackageId: "SYNTHETIC-PACKAGE-X", vendorCode: "VENDOR-GAMMA", outcomeClass: "genuine" },
  { column: "PACKAGE-X-REPEAT", rawPackageId: "SYNTHETIC-PACKAGE-X", vendorCode: "VENDOR-GAMMA", outcomeClass: "genuine" },
  { column: "PACKAGE-Y-FIRST", rawPackageId: "SYNTHETIC-PACKAGE-Y", vendorCode: "VENDOR-DELTA", outcomeClass: "substitution" }
];

const custodyRecords = [];
const pseudonymizerRecords = [];
const outcomeRecords = [];
const publicRecords = [];
for (let studyIndex = 0; studyIndex < studies.length; studyIndex++) {
  const studyId = studies[studyIndex];
  const studyLetter = String.fromCharCode(65 + studyIndex);
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const item = columns[columnIndex];
    const enrollmentId = `ENR-${studyLetter}-${columnIndex + 1}`;
    const custodyObservationId = `CUSTODY-${studyLetter}-${columnIndex + 1}`;
    const observedAt = `2026-08-14T02:${String(studyIndex * 3 + columnIndex).padStart(2, "0")}:00Z`;
    const normalized = item.rawPackageId.toUpperCase();
    const custodyToken = hmac(SYNTHETIC_CUSTODY_KEY, `custody-token-v1\u0000${studyId}\u0000${normalized}`);
    const packageCommitment = hmac(SYNTHETIC_STUDY_KEYS[studyId], `study-package-v1\u0000${studyId}\u0000${custodyToken}`);
    const custodyObservationDigest = hash({ custodyObservationId, studyId, normalized, observedAt });
    custodyRecords.push({ enrollmentId, studyId, syntheticRawPackageId: item.rawPackageId, custodyObservationId, observedAt, studyScopedCustodyToken: custodyToken });
    pseudonymizerRecords.push({ enrollmentId, studyId, studyScopedCustodyToken: custodyToken, scopeKeyId: `KEY-STUDY-${studyLetter}`, finalPackageCommitment: packageCommitment });
    outcomeRecords.push({ enrollmentId, finalPackageCommitment: packageCommitment, vendorCode: item.vendorCode, outcomeClass: item.outcomeClass });
    publicRecords.push({ enrollmentId, studyId, packageCommitment, duplicateOf: columnIndex === 1 ? `ENR-${studyLetter}-1` : null, scopeKeyId: `KEY-STUDY-${studyLetter}`, custodyObservationDigest });
  }
}

const custodyView = { viewId: "RC32-CUSTODY-VIEW", role: "custodyObserver", synthetic: true, records: custodyRecords };
const pseudonymizerView = { viewId: "RC32-PSEUDONYMIZER-VIEW", role: "studyPseudonymizer", synthetic: true, records: pseudonymizerRecords };
const outcomeView = { viewId: "RC32-OUTCOME-VIEW", role: "outcomeHolder", synthetic: true, records: outcomeRecords };
const publicLedger = {
  profile: "urn:unsolved-problems:role-separated-enrollment-ledger:0.7",
  protocolId: protocol.protocolId,
  frozenAt: "2026-08-14T02:15:00Z",
  records: publicRecords,
  ledgerDigest: "",
  qualification: "synthetic-only"
};
publicLedger.ledgerDigest = hash(without(publicLedger, "ledgerDigest"));

const withinStudyChecks = studies.map((studyId, index) => {
  const records = publicRecords.filter(item => item.studyId === studyId);
  return {
    studyId,
    repeatMatches: records[0].packageCommitment === records[1].packageCommitment,
    differentPackageDiffers: records[0].packageCommitment !== records[2].packageCommitment,
    duplicatePointerCorrect: records[1].duplicateOf === records[0].enrollmentId && records[0].duplicateOf === null && records[2].duplicateOf === null,
    scopeKeyMatchesStudy: records.every(item => item.scopeKeyId === `KEY-STUDY-${String.fromCharCode(65 + index)}`)
  };
});
const rawPackageCommitments = Object.fromEntries(columns.filter(item => !item.column.endsWith("REPEAT")).map(item => [item.rawPackageId, studies.map(studyId => {
  const custodyToken = hmac(SYNTHETIC_CUSTODY_KEY, `custody-token-v1\u0000${studyId}\u0000${item.rawPackageId}`);
  return hmac(SYNTHETIC_STUDY_KEYS[studyId], `study-package-v1\u0000${studyId}\u0000${custodyToken}`);
})]));
const crossStudyUnlinkable = Object.values(rawPackageCommitments).every(values => new Set(values).size === studies.length);
const forbiddenFields = {
  custodyHasVendorOrOutcome: custodyRecords.some(item => "vendorCode" in item || "outcomeClass" in item || "finalPackageCommitment" in item),
  pseudonymizerHasRawOrOutcome: pseudonymizerRecords.some(item => "syntheticRawPackageId" in item || "vendorCode" in item || "outcomeClass" in item),
  outcomeHasRawTokenOrKeys: outcomeRecords.some(item => "syntheticRawPackageId" in item || "studyScopedCustodyToken" in item || "scopeKeyId" in item)
};
const result = {
  resultId: "ROLE-SEPARATED-PACKAGE-ENROLLMENT-RESULT-0.7",
  computedOn: "2026-08-14",
  protocolId: protocol.protocolId,
  records: publicRecords.length,
  studies: studies.length,
  columns: columns.length,
  withinStudyChecks,
  crossStudyUnlinkable,
  forbiddenFields,
  viewDigests: {
    custody: hash(custodyView),
    pseudonymizer: hash(pseudonymizerView),
    outcome: hash(outcomeView),
    publicLedger: hash(publicLedger)
  },
  hypotheses: {
    E1_sameStudyEqualityAndCrossStudyUnlinkability: withinStudyChecks.every(item => item.repeatMatches && item.differentPackageDiffers && item.duplicatePointerCorrect && item.scopeKeyMatchesStudy) && crossStudyUnlinkable,
    E2_singleRoleFieldSeparation: Object.values(forbiddenFields).every(value => value === false),
    E3_syntheticPassEstablishesRealPrivacyAndCustody: false
  },
  qualification: {
    syntheticMatrix: "pass",
    productionPrivacy: "unqualified",
    physicalCustody: "unqualified",
    twoRoleCollusionResistance: "unqualified",
    voprf: "not-implemented"
  },
  realPackages: 0,
  productionKeys: 0,
  conclusion: "The 3x3 synthetic matrix detects within-study repeats, separates different packages, prevents direct cross-study commitment equality, and keeps raw identity apart from vendor outcomes in every single role view. Public demo keys, synthetic custody, and enrollmentId joins leave real privacy and collusion resistance unqualified."
};

const outputs = {
  "research/reproducibility/enrollment-custody-view.json": custodyView,
  "research/reproducibility/enrollment-pseudonymizer-view.json": pseudonymizerView,
  "research/reproducibility/enrollment-outcome-view.json": outcomeView,
  "research/reproducibility/role-separated-enrollment-ledger.json": publicLedger,
  "research/reproducibility/role-separated-enrollment-result.json": result
};
for (const [relative, value] of Object.entries(outputs)) {
  const file = path.join(root, relative);
  if (process.argv.includes("--write")) fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  else if (canonical(readJson(relative)) !== canonical(value)) throw new Error(`${relative} differs from the committed enrollment artifact.`);
}
if (!result.hypotheses.E1_sameStudyEqualityAndCrossStudyUnlinkability || !result.hypotheses.E2_singleRoleFieldSeparation || result.hypotheses.E3_syntheticPassEstablishesRealPrivacyAndCustody) throw new Error("Enrollment hypothesis adjudication failed.");
console.log("RC32 enrollment reproduced: 9/9 records, 3/3 within-study duplicate checks, cross-study unlinkability, single-role separation; physical n=0.");
