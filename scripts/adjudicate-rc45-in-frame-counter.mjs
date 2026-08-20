import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = name => JSON.parse(fs.readFileSync(path.join(root, "research", "reproducibility", name), "utf8"));
const python = read("rc45-x16-layer-0002-python-counter.json");
const javascript = read("rc45-x16-layer-0002-javascript-counter.json");
const comparable = value => ({
  frameCount: value.frameCount,
  boundaryRecordBytesPerFrame: value.boundaryRecordBytesPerFrame,
  rawBoundaryRecordSha256: value.rawBoundaryRecordSha256,
  candidates: value.candidates,
  passingCandidates: value.passingCandidates,
  gatePassedLocally: value.gatePassedLocally
});
const exactAgreement = JSON.stringify(comparable(python)) === JSON.stringify(comparable(javascript));
const passing = exactAgreement ? python.candidates.filter(item => item.exactUnitProgression && item.uniqueValueCount === python.frameCount && item.moduloSpan === python.frameCount - 1) : [];
const distinctSeries = new Set(passing.map(item => item.seriesUint32LeSha256));
const distinctBoundaryOrders = new Set(passing.map(item => `${item.boundary}:${item.byteOrder}`));
const onlyPlaneReplicas = passing.length > 0 && distinctSeries.size === 1 && distinctBoundaryOrders.size === 1;
const gatePassed = exactAgreement && python.frameCount === 95_504 && passing.length > 0 && onlyPlaneReplicas;
const frozen = gatePassed ? {
  boundary: passing[0].boundary,
  byteOrder: passing[0].byteOrder,
  equivalentPlanes: passing.map(item => item.plane).sort(),
  seriesUint32LeSha256: passing[0].seriesUint32LeSha256,
  firstValue: passing[0].firstValue,
  lastValue: passing[0].lastValue
} : null;
const result = {
  releaseId: "RC45-L0002-DEVELOPMENT-RELEASE-0.1", cycleId: "RC-2026-45", createdOn: "2026-08-21",
  precommit: "research/reproducibility/rc45-in-frame-counter-precommit.json",
  inputs: ["research/reproducibility/rc45-x16-layer-0002-python-counter.json", "research/reproducibility/rc45-x16-layer-0002-javascript-counter.json"],
  exactIndependentAgreement: exactAgreement, passingCandidates: passing.map(item => item.id), onlyPlaneReplicas,
  syntheticGatePassed: gatePassed, holdoutReleased: gatePassed, frozenCandidate: frozen,
  decision: gatePassed ? "release-exact-l0001-member-ranges-for-frozen-counter-only-analysis" : "stop-before-l0001-acquisition",
  caveat: "Both parsers share one hash-bound FFmpeg decoder. Agreement is independent at byte selection and arithmetic, not at codec implementation."
};
if (process.argv.includes("--write")) fs.writeFileSync(path.join(root, "research", "reproducibility", "rc45-development-release.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
