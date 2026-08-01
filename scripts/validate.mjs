import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "data.js"), "utf8"), sandbox, { filename: "data.js" });

const { PROBLEMS, CATALOG_META: meta, CATALOG_SOURCES: sources } = sandbox.window;
assert(Array.isArray(PROBLEMS), "PROBLEMS must be an array");
assert(PROBLEMS.length === 315, `expected 315 problems, received ${PROBLEMS.length}`);
assert(new Set(PROBLEMS.map(item => item.id)).size === PROBLEMS.length, "problem IDs must be unique");

for (const problem of PROBLEMS) {
  assert(/^UP-\d{3}$/.test(problem.id), `${problem.id}: invalid ID`);
  assert(problem.question?.endsWith("?"), `${problem.id}: question must end with ?`);
  assert(Boolean(meta.disciplines[problem.discipline]), `${problem.id}: unknown discipline`);
  assert(Boolean(meta.approaches[problem.approach]), `${problem.id}: unknown approach`);
  assert(Boolean(meta.natures[problem.nature]), `${problem.id}: unknown nature`);
  assert(Boolean(meta.feasibility[problem.feasibility]), `${problem.id}: unknown feasibility`);
  assert(problem.sourceIds.length > 0, `${problem.id}: requires at least one source`);
  for (const sourceId of problem.sourceIds) assert(Boolean(sources[sourceId]), `${problem.id}: unknown source ${sourceId}`);
  assert(problem.whyOpen?.length > 20, `${problem.id}: missing rationale`);
  assert(problem.solvedWhen?.length > 20, `${problem.id}: missing resolution criterion`);
}

for (const discipline of Object.keys(meta.disciplines)) {
  const count = PROBLEMS.filter(item => item.discipline === discipline).length;
  assert(count === 63, `${discipline}: expected 63 entries, received ${count}`);
}

const boundaryCount = PROBLEMS.filter(item => item.nature === "boundary").length;
assert(boundaryCount === 15, `expected 15 boundary entries, received ${boundaryCount}`);
assert(PROBLEMS.filter(item => item.feasibility === "impossible").every(item => item.nature === "boundary"), "theoretically impossible entries must be boundaries");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const asset of ["styles.css", "data.js", "app.js", "assets/mark.svg"]) {
  assert(fs.existsSync(path.join(root, asset)), `missing asset ${asset}`);
  assert(html.includes(asset), `index.html does not reference ${asset}`);
}
for (const id of ["map", "taxonomy", "catalog", "sources", "problem-dialog"]) {
  assert(html.includes(`id="${id}"`), `index.html missing #${id}`);
}

if (failures.length) {
  console.error(`Validation failed with ${failures.length} issue(s):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validated ${PROBLEMS.length} entries, ${Object.keys(meta.disciplines).length} disciplines, ${Object.keys(sources).length} sources, and site assets.`);
