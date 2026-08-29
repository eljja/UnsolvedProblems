import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPRO = path.join(ROOT, "research", "reproducibility");
const read = name => JSON.parse(fs.readFileSync(path.join(REPRO, name), "utf8"));
const nodeResult = read("rc60-preflight-node.json");
const pythonResult = read("rc60-preflight-python.json");
const fixtures = read("rc60-preflight-fixtures.json");

const canonical = value => {
  if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
};
const sha256 = value => crypto.createHash("sha256").update(canonical(value), "utf8").digest("hex").toUpperCase();
const fail = message => { throw new Error(message); };

if (nodeResult.fixtureSpecHashSha256 !== pythonResult.fixtureSpecHashSha256) fail("Fixture-spec hashes differ");
if (nodeResult.contractHashSha256 !== pythonResult.contractHashSha256) fail("Contract hashes differ");
if (nodeResult.cases.length !== fixtures.cases.length || pythonResult.cases.length !== fixtures.cases.length) fail("Case count differs");

const agreement = [];
for (const fixtureCase of fixtures.cases) {
  const nodeReceipt = nodeResult.cases.find(item => item.caseId === fixtureCase.id);
  const pythonReceipt = pythonResult.cases.find(item => item.caseId === fixtureCase.id);
  if (!nodeReceipt || !pythonReceipt) fail(`Missing receipt for ${fixtureCase.id}`);
  const equal = canonical(nodeReceipt) === canonical(pythonReceipt);
  if (!equal) fail(`Implementations disagree for ${fixtureCase.id}`);
  if (nodeReceipt.firstFailedGate !== fixtureCase.expectedFirstFailedGate) fail(`Unexpected first failure for ${fixtureCase.id}`);
  if (nodeReceipt.physicalAuthorization !== false) fail(`${fixtureCase.id} emitted a forbidden physical authorization`);
  agreement.push({
    caseId: fixtureCase.id,
    expectedFirstFailedGate: fixtureCase.expectedFirstFailedGate,
    verdict: nodeReceipt.verdict,
    receiptHashSha256: nodeReceipt.receiptHashSha256,
    exactAgreement: equal
  });
}

const multiFault = agreement.find(item => item.caseId === "ADV-MULTI-G05-G09");
const planning = agreement.find(item => item.caseId === "RC59-PLANNING-PHYSICAL");
const valid = agreement.find(item => item.caseId === "SYNTHETIC-VALID");
const auditPayload = {
  auditId: "RC60-PREFLIGHT-INDEPENDENT-AUDIT-1.0",
  cycleId: "RC-2026-60",
  adjudicatedOn: "2026-08-29",
  status: "complete-software-refusal-order-confirmed-physical-work-blocked",
  exactAgreementCases: agreement.length,
  totalCases: fixtures.cases.length,
  fixtureSpecHashSha256: nodeResult.fixtureSpecHashSha256,
  contractHashSha256: nodeResult.contractHashSha256,
  agreement,
  decisiveResults: {
    syntheticValidVerdict: valid.verdict,
    syntheticValidPhysicalAuthorization: false,
    adversarialCasesRefused: agreement.filter(item => item.expectedFirstFailedGate).length,
    multiFaultFirstFailure: multiFault.expectedFirstFailedGate,
    laterFaultNotEvaluatedBeforeRetry: "G09-SAFETY-READINESS",
    rc59PlanningFirstFailure: planning.expectedFirstFailedGate,
    physicalAuthorizations: 0
  },
  interpretation: "Two independent dependency-free implementations agree on every receipt and first-failure position. This verifies deterministic software refusal semantics only. It does not populate RC59 physical resources, margins, safety approvals, owner authenticity, sentinel evidence, expansion qualification, or lifetime outcomes.",
  nextDecision: "Keep the physical branch closed. The next admissible input is a real accountable domain and laboratory specification that replaces RC59 placeholders without exposing outcomes."
};
const audit = { ...auditPayload, auditHashSha256: sha256(auditPayload) };
fs.writeFileSync(path.join(REPRO, "rc60-preflight-independent-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({ exactAgreementCases: audit.exactAgreementCases, firstPlanningFailure: audit.decisiveResults.rc59PlanningFirstFailure, physicalAuthorizations: 0 }));
