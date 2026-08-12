import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const source = load("research/reproducibility/scattering-round-robin-source.json");
const spec = load("research/reproducibility/scattering-spec.json");
const result = load("research/reproducibility/scattering-result.json");
const coset = load("research/external-audit/two-phase-design-2017/audit-result.json");
const repeatAudit = load("research/external-audit/repeat-data-availability-2026/audit-result.json");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(result.benchmarkId === spec.benchmarkId, "benchmark IDs differ");
check(source.reportedCampaign.totalProfiles === 247, "round-robin total must remain 247");
check(source.reportedCampaign.saxsProfiles === 171 && source.reportedCampaign.sansProfiles === 76, "technique totals changed");
check(source.saxs.length === 10 && source.sans.length === 10, "transcribed table width changed");
check(result.adjudication.secWins === 9 && result.adjudication.secExceptions[0] === "Urate oxidase/Guinier", "SEC exception changed");
check(result.adjudication.combinedBestOrTied === 7 && result.adjudication.combinedFailures.length === 3, "combined-mode adjudication changed");
check(Object.values(result.findings).every(Boolean), "not every scattering finding is adjudicated true");
for (const row of result.saxs) {
  const original = source.saxs.find(item => item.protein === row.protein && item.metric === row.metric);
  check(Math.abs(row.secToBatchSigmaRatio - original.sec.sigma / original.batch.sigma) < 1e-6, `${row.protein}/${row.metric}: ratio mismatch`);
  for (const mode of ["batch", "sec", "combined"]) {
    const expected = 1.96 * Math.sqrt(2) * original[mode].sigma;
    check(Math.abs(row[mode].reproducibilityLimitAngstrom - expected) < 1e-6, `${row.protein}/${row.metric}/${mode}: limit mismatch`);
  }
}
check(coset.publishedDesign.initialRandomSample === 10000 && coset.publishedDesign.randomNonrespondentSubsample === 500, "Coset denominators changed");
check(coset.publishedDesign.approximateComplementaryRespondents === 313, "Coset complementary response count changed");
check(coset.targetDesignAudit.targetGammaCalibrationFromPublicAggregatesPossible === false, "Coset aggregates cannot identify target Gamma");
check(Object.values(coset.findings).every(Boolean), "not every Coset audit finding is true");
check(repeatAudit.opxrd.canonicalSameSpecimenRepeatKeyDocumented === false, "opXRD replicate key must remain unverified");
check(repeatAudit.stanfordSpinGlass.reportedScansPerCapillary === 30 && repeatAudit.stanfordSpinGlass.publicFileCount === 1, "Stanford acquisition/public-file contrast changed");
check(Object.values(repeatAudit.findings).every(Boolean), "not every repeat-data audit finding is true");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Reproducibility-cycle verification passed: two-phase design sufficiency, repeat-data availability, and scattering noise floors are consistent.");
