import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repro = path.join(root, "research", "reproducibility");
const csvPath = path.join(repro, "rc69-collision-injection-manifest.csv");
const manifestPath = path.join(repro, "rc69-dolphot-smoke-selection.json");
const baseParamPath = path.join(repro, "rc69-dolphot-smoke.param");

const lines = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
const header = lines.shift().split(",");
const rows = lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [header[index], value])));
const drawIds = new Set([1, 4, 5, 8]);
const windows = [
  { id: "blank", bounds: [5980, 3890, 6120, 4040], states: ["blank"] },
  { id: "isolated", bounds: [5880, 3075, 6020, 3220], states: ["isolated"] },
  { id: "collision", bounds: [5780, 2400, 5940, 2590], states: ["large-collision"] }
];
const inside = (row, bounds) => Number(row.referenceX) >= bounds[0] && Number(row.referenceX) < bounds[2] && Number(row.referenceY) >= bounds[1] && Number(row.referenceY) < bounds[3];
const selected = rows.filter((row) => windows.some((window) => inside(row, window.bounds) && window.states.includes(row.collisionState)) && Number(row.offsetIndex) === 1 && drawIds.has(Number(row.drawIndex)));

const countBy = (key) => selected.reduce((out, row) => {
  out[row[key]] = (out[row[key]] || 0) + 1;
  return out;
}, {});
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(selected.length === 16, `Expected 16 smoke injections, found ${selected.length}`);
assert(new Set(selected.map((row) => row.authorId)).size === 4, "Expected four smoke environments");
assert(Object.values(countBy("collisionState")).every((count) => count >= 4), "All collision states must be represented");
assert(new Set(selected.map((row) => row.inputF150WVegaMag)).size >= 12, "Smoke set must span multiple environment-relative magnitudes");

const baseParam = fs.readFileSync(baseParamPath, "utf8");
const windowRecords = windows.map((window) => {
  const subset = selected.filter((row) => inside(row, window.bounds) && window.states.includes(row.collisionState));
  const fake = subset.map((row) => [
    1, 1,
    Number(row.referenceX).toFixed(6),
    Number(row.referenceY).toFixed(6),
    Number(row.inputF090WVegaMag).toFixed(6),
    Number(row.inputF150WVegaMag).toFixed(6)
  ].join(" "));
  const inputName = `rc69-dolphot-smoke-${window.id}-input.txt`;
  const paramName = `rc69-dolphot-smoke-${window.id}.param`;
  fs.writeFileSync(path.join(repro, inputName), `${fake.join("\n")}\n`);
  const [xmin, ymin, xmax, ymax] = window.bounds;
  const param = baseParam.replace(/^photsec\s*=.*$/m, `photsec = 1 1 ${xmin} ${ymin} ${xmax} ${ymax}`);
  fs.writeFileSync(path.join(repro, paramName), param);
  return {
    id: window.id,
    photsec: [1, 1, ...window.bounds],
    states: window.states,
    environmentCount: new Set(subset.map((row) => row.authorId)).size,
    injectionCount: subset.length,
    injectionIds: subset.map((row) => row.injectionId),
    input: `research/reproducibility/${inputName}`,
    parameterFile: `research/reproducibility/${paramName}`
  };
});

const manifest = {
  cycleId: "RC-2026-69",
  experimentId: "PHOST-COLLISION-AST-1-SMOKE",
  reviewedOn: "2026-09-01",
  purpose: "Exercise the real DOLPHOT artificial-star path across all observed collision states before spending the sealed 3,072-row confirmatory ledger.",
  selectionRule: "Within three frozen state-specific windows, retain offset 1 and draw indices 1, 4, 5, and 8 for every included environment. This rule was chosen without recovery outcomes.",
  windows: windowRecords,
  environmentCount: new Set(selected.map((row) => row.authorId)).size,
  injectionCount: selected.length,
  collisionStateCounts: countBy("collisionState"),
  componentCounts: countBy("component"),
  splitCounts: countBy("split"),
  selectedInjectionIds: selected.map((row) => row.injectionId),
  success: "DOLPHOT emits exactly one typed output row per selected injection and completes without changing the frozen image, PSF, sky, alignment, or photometry parameters.",
  failure: "Any lost or duplicate row, unreadable source, parameter fallback, PSF lookup failure, coordinate rejection, or non-finite output blocks the full pilot.",
  inferenceBoundary: "The smoke set tests executable plumbing and output semantics only. Its 16 outcomes are not powered or balanced for a collision-effect estimate and cannot open the preregistered 0.02/0.01-mag scientific gates."
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
