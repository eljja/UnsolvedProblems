import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "research", "reproducibility", "rc47-history-equivalence-bound.json");
const triggerCount = 94_736;
const deficit = 23;

const choose = (n, k) => {
  let value = 1n;
  const reduced = Math.min(k, n - k);
  for (let index = 1; index <= reduced; index += 1) value = value * BigInt(n - reduced + index) / BigInt(index);
  return value;
};
const log2Choose = (n, k) => {
  let value = 0;
  for (let index = 1; index <= k; index += 1) value += Math.log2(n - k + index) - Math.log2(index);
  return value;
};

const arbitrarySubsets = choose(triggerCount, deficit);
const arbitraryLog2 = log2Choose(triggerCount, deficit);
const singleBlock = triggerCount - deficit + 1;
const result = {
  boundId: "RC47-X16-HISTORY-EQUIVALENCE-BOUND-0.1",
  cycleId: "RC-2026-47",
  createdOn: "2026-08-24",
  problem: "UP-315",
  inputs: { cameraTriggerCount: triggerCount, exportedFrameCount: triggerCount - deficit, deficit },
  models: {
    arbitraryOrderPreservingOmissions: {
      assumptions: "Exactly 23 trigger-associated frames are omitted, the surviving order is preserved, and no positional identity or image evidence is admitted.",
      possibleMissingSetsExact: arbitrarySubsets.toString(),
      log2PossibleMissingSets: arbitraryLog2,
      minimumAggregateIdentityBitsToSelectOneSet: Math.ceil(arbitraryLog2)
    },
    oneContiguousInternalBlock: {
      assumptions: "All 23 omissions form one internal contiguous block and its start is unknown.",
      possibleMissingSetsExact: String(singleBlock),
      log2PossibleMissingSets: Math.log2(singleBlock),
      minimumAggregateIdentityBitsToSelectOneSet: Math.ceil(Math.log2(singleBlock))
    },
    allTerminal: {
      assumptions: "All 23 missing frames are known independently to be the final 23 triggers.",
      possibleMissingSetsExact: "1",
      log2PossibleMissingSets: 0,
      minimumAggregateIdentityBitsToSelectOneSet: 0
    }
  },
  rc47Effect: "Because every image-only RC47 model fails the sealed recall and false-alarm gates, it safely removes no missing set from the arbitrary-subset equivalence class.",
  interpretation: "The 306-bit figure is an information-counting lower bound for distinguishing one subset under the stated combinatorial model, not a claim that any arbitrary 306-bit measurement is sufficient. A verified monotonic exposure ledger, authenticated frame timestamps, or an independently calibrated join key supplies structure that a generic bit string does not.",
  boundaries: [
    "The count model does not prove that the deficit arose in the camera; export, codec, or packaging loss remains possible.",
    "Duplicate frames, extra frames, reordered frames, and uncertain trigger semantics would enlarge or change the history class.",
    "A statement that losses usually occur at the tail is not evidence that the L0001 loss is terminal.",
    "Probabilistic image scores shrink the class only after an independently validated error rule authorizes exclusions."
  ]
};

if (process.argv.includes("--write")) fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
