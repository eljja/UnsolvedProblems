#!/usr/bin/env node

import fs from "node:fs";

const [primaryPath, independentPath, outputPath] = process.argv.slice(2);
if (!primaryPath || !independentPath || !outputPath) {
  throw new Error("usage: verify-rc48-identity-budget.mjs PRIMARY INDEPENDENT OUTPUT");
}
const primary = JSON.parse(fs.readFileSync(primaryPath, "utf8"));
const independent = JSON.parse(fs.readFileSync(independentPath, "utf8"));
const failures = [];

function compareSummary(label, left, right) {
  if (left.histories !== right.histories) failures.push(`${label}: exact histories differ`);
  if (left.minimumAggregateIdentityBits !== right.minimumAggregateIdentityBits) failures.push(`${label}: minimum bits differ`);
  if (Math.abs(left.log2Histories - right.log2Histories) > 1e-12) failures.push(`${label}: log2 differs by more than 1e-12`);
}

compareSummary("countOnly", primary.countOnly, independent.countOnly);
if (primary.firstFrameAnchors.length !== independent.firstFrameAnchors.length) failures.push("first anchor length differs");
primary.firstFrameAnchors.forEach((item, index) => compareSummary(`firstFrameAnchors[${index}]`, item, independent.firstFrameAnchors[index]));
if (primary.lastFrameAnchors.length !== independent.lastFrameAnchors.length) failures.push("last anchor length differs");
primary.lastFrameAnchors.forEach((item, index) => compareSummary(`lastFrameAnchors[${index}]`, item, independent.lastFrameAnchors[index]));
if (primary.periodicAnchors.length !== independent.periodicAnchors.length) failures.push("periodic anchor length differs");
primary.periodicAnchors.forEach((item, index) => {
  const peer = independent.periodicAnchors[index];
  if (item.period !== peer.period || item.authenticatedAnchorCount !== peer.authenticatedAnchorCount) failures.push(`periodicAnchors[${index}]: configuration differs`);
  compareSummary(`periodicAnchors[${index}]`, item, peer);
  if (JSON.stringify(item.intervalProfile) !== JSON.stringify(peer.intervalProfile)) failures.push(`periodicAnchors[${index}]: profile differs`);
  if (JSON.stringify(item.worstMissingByInterval) !== JSON.stringify(peer.worstMissingByInterval)) failures.push(`periodicAnchors[${index}]: allocation differs`);
});
compareSummary("perExposureCounter", primary.perExposureCounter, independent.perExposureCounter);

const result = {
  auditId: "RC48-X16-IDENTITY-BUDGET-INDEPENDENT-AUDIT-0.1",
  cycleId: "RC-2026-48",
  auditedOn: "2026-08-25",
  primary: primary.resultId,
  independent: independent.resultId,
  exactIntegerComparisons: 1 + primary.firstFrameAnchors.length + primary.lastFrameAnchors.length + primary.periodicAnchors.length + 1,
  log2Tolerance: 1e-12,
  failures,
  gate: failures.length === 0 ? "pass" : "fail",
};
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
if (failures.length) process.exit(1);
