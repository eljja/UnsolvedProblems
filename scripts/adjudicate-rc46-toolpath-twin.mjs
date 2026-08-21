import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repro = path.join(root, "research", "reproducibility");
const read = name => JSON.parse(fs.readFileSync(path.join(repro, name), "utf8"));
const node = read("rc46-toolpath-twin-node.json");
const python = read("rc46-toolpath-twin-python.json");
const tolerance = 1e-9;
let maximumNumericDifference = 0;
const disagreements = [];

function compare(a, b, trail) {
  if (typeof a === "number" && typeof b === "number") {
    const difference = Math.abs(a - b);
    maximumNumericDifference = Math.max(maximumNumericDifference, difference);
    if (difference > tolerance) disagreements.push({ trail, node: a, python: b, difference });
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { disagreements.push({ trail, nodeLength: a.length, pythonLength: b.length }); return; }
    for (let i = 0; i < a.length; i += 1) compare(a[i], b[i], `${trail}[${i}]`);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => !["createdOn", "implementation", "resultId"].includes(key)).sort();
    for (const key of keys) {
      if (!(key in a) || !(key in b)) disagreements.push({ trail: `${trail}.${key}`, nodePresent: key in a, pythonPresent: key in b });
      else compare(a[key], b[key], `${trail}.${key}`);
    }
    return;
  }
  if (a !== b) disagreements.push({ trail, node: a, python: b });
}

compare(node.input, python.input, "input");
compare(node.target, python.target, "target");
compare(node.candidates, python.candidates, "candidates");
compare(node.ranking, python.ranking, "ranking");
compare(node.adjudication, python.adjudication, "adjudication");
if (disagreements.length) throw new Error(`RC46 implementations disagree: ${JSON.stringify(disagreements.slice(0, 5))}`);

const passing = node.candidates.filter(row => row.eligible);
const top = node.candidates[0];
const aggregateCloseLocalFail = node.candidates.filter(row => row.gates.count && row.gates.positiveFraction && row.gates.xy && row.gates.power && row.gates.laserOn && row.gates.spatialAll && row.gates.spatialOn && row.gates.direction && !row.gates.local).map(row => row.layer);
const acquisition = read("rc46-xypt-acquisition.json");
const adjudication = {
  adjudicationId: "RC46-X16-TOOLPATH-TWIN-ADJUDICATION-0.1",
  cycleId: "RC-2026-46",
  createdOn: new Date().toISOString(),
  preregistration: "research/reproducibility/rc46-toolpath-twin-precommit.json",
  amendments: [
    "research/reproducibility/rc46-toolpath-twin-amendment-01.json",
    "research/reproducibility/rc46-toolpath-twin-amendment-02.json",
    "research/reproducibility/rc46-toolpath-twin-amendment-03.json",
    "research/reproducibility/rc46-toolpath-twin-amendment-04.json",
    "research/reproducibility/rc46-toolpath-twin-amendment-05.json"
  ],
  inputs: ["research/reproducibility/rc46-toolpath-twin-node.json", "research/reproducibility/rc46-toolpath-twin-python.json"],
  archive: { bytes: acquisition.observed.bytes, sha256: acquisition.observed.sha256, officialIdentityMatched: acquisition.observed.sha256 === acquisition.source.sha256, memberCount: acquisition.observed.entryCount, transport: acquisition.provenance },
  implementationAgreement: { pass: true, tolerance, maximumNumericDifference, candidateCount: node.candidates.length, memberHashesExact: node.candidates.every((row, index) => row.member.sha256 === python.candidates[index].member.sha256) && node.target.member.sha256 === python.target.member.sha256, rankingExact: node.ranking.every((row, index) => row.layer === python.ranking[index].layer), gatesExact: node.candidates.every((row, index) => JSON.stringify(row.gates) === JSON.stringify(python.candidates[index].gates)) },
  decision: {
    hypothesis: passing.length ? "T1" : "T0",
    passingLayers: passing.map(row => row.layer),
    topRankedLayer: top.layer,
    topRankedScore: top.score,
    topRankedEligible: top.eligible,
    topRankedFailedGates: Object.entries(top.gates).filter(([, pass]) => !pass).map(([name]) => name),
    aggregateCloseButLocalFailLayers: aggregateCloseLocalFail,
    releaseCandidateAviThisCycle: false,
    naturalL0001PixelBytes: 0,
    naturalMissingPositionsAdjudicated: 0
  },
  hypotheses: {
    T0_noFirst25CommandTwin: passing.length ? "rejected" : "supported-within-layers-2-through-25",
    T1_atLeastOneEligibleTwin: passing.length ? `supported-by-layers-${passing.map(row => row.layer).join("-")}` : "rejected",
    T2_globalSimilarityWithoutLocalCorrespondence: aggregateCloseLocalFail.length ? `supported-by-layers-${aggregateCloseLocalFail.join("-")}` : "not-observed-under-the-full-aggregate-gate"
  },
  causalChain: [
    { link: "official command archive -> authenticated layer members", status: "pass", fastestFailureTest: "NIST byte count and SHA-256 plus per-member CRC-32 and SHA-256" },
    { link: "layer members -> command-only candidate metrics", status: "pass", fastestFailureTest: "two independent parsers and T-bit/nonzero-T equality" },
    { link: "candidate metrics -> frame-correspondable command twin", status: passing.length ? "pass-for-future-image-eligibility-only" : "fail", fastestFailureTest: "all nine independent hard gates; composite score cannot override a failure" },
    { link: "command twin -> image-distribution exchangeability", status: "unadjudicated", fastestFailureTest: "prospective synthetic deletion and thermal/context covariate audit on separate development and holdout layers" },
    { link: "image benchmark -> natural L0001 omission identities", status: "sealed", fastestFailureTest: "only a separately preregistered release may open L0001 pixels" }
  ],
  uncertainty: {
    measurement: "XYPT contains commanded position, power, and trigger state, not encoder motion, shutter-open time, interlayer temperature, or frame identity.",
    model: "One proper rotation and ordinal bins deliberately reject nonlinear or temporally warped similarity.",
    sampling: "The search covers layers 2-25 only.",
    implementation: `Independent numeric outputs agree within ${maximumNumericDifference}; both implement the same specification and consume the same bytes.`,
    extrapolation: "Command eligibility does not prove image exchangeability or locate any natural omission."
  },
  nextDecision: passing.length
    ? "Preregister an image-only synthetic-deletion benchmark on the top passing layer, use the second passing layer as untouched holdout when available, and include DAQ encoder/power covariates without opening L0001."
    : "Do not acquire a candidate AVI as a cross-layer twin. Audit same-layer blocked synthetic deletion or seek author-held camera tick/export records; DAQ encoder/power data may improve registration but cannot supply frame identities."
};
fs.writeFileSync(path.join(repro, "rc46-toolpath-twin-adjudication.json"), `${JSON.stringify(adjudication, null, 2)}\n`);
console.log(JSON.stringify(adjudication.decision, null, 2));
