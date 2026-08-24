import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repro = path.join(root, "research", "reproducibility");
const read = name => JSON.parse(fs.readFileSync(path.join(repro, name), "utf8"));
const python = read("rc47-self-deletion-python.json");
const node = read("rc47-self-deletion-node.json");
const pythonTrials = read("rc47-self-deletion-python-trials.json");
const nodeTrials = read("rc47-self-deletion-node-trials.json");
const blocks = ["1", "2", "4", "8"];

let maximumNumericDifference = 0;
const exactFailures = [];
const compareNumber = (left, right, label) => {
  maximumNumericDifference = Math.max(maximumNumericDifference, Math.abs(left - right));
  if (Math.abs(left - right) > 1e-9) exactFailures.push(`${label}: ${left} != ${right}`);
};
const compareTrials = (left, right, label) => {
  if (left.length !== right.length) exactFailures.push(`${label}: trial count`);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    for (const key of ["trial", "truthStart", "truthRightSlot", "callRightSlot", "correct", "falseDiscovery", "intensityStratum"]) {
      if (left[index][key] !== right[index][key]) exactFailures.push(`${label}[${index}].${key}`);
    }
    compareNumber(left[index].topScore, right[index].topScore, `${label}[${index}].topScore`);
  }
};

if (python.inputs.rawSha256 !== node.inputs.rawSha256 || python.inputs.rawBytes !== node.inputs.rawBytes) exactFailures.push("input identity");
for (const block of blocks) {
  if (python.selectedModels[block].family !== node.selectedModels[block].family) exactFailures.push(`selected family ${block}`);
  compareNumber(python.selectedModels[block].threshold, node.selectedModels[block].threshold, `threshold ${block}`);
  for (const key of ["mean", "scale", "weight"]) {
    const left = python.selectedModels[block][key];
    const right = node.selectedModels[block][key];
    if (left.length !== right.length) exactFailures.push(`${key} length ${block}`);
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) compareNumber(left[index], right[index], `${key} ${block}.${index}`);
  }
  for (const key of ["recallWithinOne", "falseDiscoveryRate"]) compareNumber(python.sealedTest[block][key], node.sealedTest[block][key], `sealed ${block}.${key}`);
  for (const key of ["calls", "maximumScore", "firstMaximumStart"]) compareNumber(python.sealedTest[block].unmodifiedControl[key], node.sealedTest[block].unmodifiedControl[key], `control ${block}.${key}`);
  compareTrials(pythonTrials.validation[block], nodeTrials.validation[block], `validation.${block}`);
  compareTrials(pythonTrials.sealedTest[block], nodeTrials.sealedTest[block], `sealedTest.${block}`);
}

const decision = {
  adjudicationId: "RC47-X16-SELF-DELETION-ADJUDICATION-0.1",
  cycleId: "RC-2026-47",
  createdOn: new Date().toISOString(),
  preregistration: "research/reproducibility/rc47-self-deletion-precommit.json",
  inputs: [
    "research/reproducibility/rc47-self-deletion-python.json",
    "research/reproducibility/rc47-self-deletion-node.json",
    "research/reproducibility/rc47-self-deletion-python-trials.json",
    "research/reproducibility/rc47-self-deletion-node-trials.json"
  ],
  implementationAgreement: {
    pass: exactFailures.length === 0,
    tolerance: 1e-9,
    maximumNumericDifference,
    exactTrialTruthAndCalls: exactFailures.every(item => !item.includes("trial") && !item.includes("truth") && !item.includes("call")),
    failures: exactFailures.slice(0, 20)
  },
  selectedFamilies: Object.fromEntries(blocks.map(block => [block, python.selectedModels[block].family])),
  sealedTest: Object.fromEntries(blocks.map(block => [block, {
    recallWithinOne: python.sealedTest[block].recallWithinOne,
    falseDiscoveryRate: python.sealedTest[block].falseDiscoveryRate,
    unmodifiedCalls: python.sealedTest[block].unmodifiedControl.calls,
    firstNaturalMaximumStart: python.sealedTest[block].unmodifiedControl.firstMaximumStart
  }])),
  aggregate: python.aggregate,
  hypothesisDecision: "S0-supported-for-fixed-family",
  gatePassed: false,
  independentLayerPixelsAuthorized: false,
  naturalL0001Authorized: false,
  interpretation: "The fixed multiscale cadence families cannot separate synthetic one-to-eight-frame gaps from natural L0002 regime changes at the preregistered whole-partition false-alarm level. This rejects the detector family, not every possible image or auxiliary-sensor method.",
  next: "Characterize the repeated natural maximum as a regime-boundary confounder using command and DAQ state only; then preregister either a state-conditioned abstention test with an external timing channel or stop image-only identification."
};

if (process.argv.includes("--write")) fs.writeFileSync(path.join(repro, "rc47-self-deletion-adjudication.json"), `${JSON.stringify(decision, null, 2)}\n`);
console.log(JSON.stringify(decision, null, 2));
if (!decision.implementationAgreement.pass) process.exitCode = 2;
