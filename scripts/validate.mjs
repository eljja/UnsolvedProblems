import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const sandbox = { window: {} };
for (const file of ["data.js", "expansion-data.js", "translations.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
}

const { PROBLEMS, CATALOG_META: meta, CATALOG_SOURCES: sources } = sandbox.window;
assert(Array.isArray(PROBLEMS), "PROBLEMS must be an array");
assert(PROBLEMS.length === 555, `expected 555 problems, received ${PROBLEMS.length}`);
assert(new Set(PROBLEMS.map(item => item.id)).size === PROBLEMS.length, "problem IDs must be unique");
assert(new Set(PROBLEMS.map(item => item.question)).size === PROBLEMS.length, "Korean problem questions must be unique");
assert(new Set(PROBLEMS.map(item => item.questionEn)).size === PROBLEMS.length, "English problem questions must be unique");

for (const problem of PROBLEMS) {
  assert(/^UP-\d{3}$/.test(problem.id), `${problem.id}: invalid ID`);
  assert(problem.question?.endsWith("?"), `${problem.id}: question must end with ?`);
  assert(problem.questionEn?.endsWith("?"), `${problem.id}: English question must end with ?`);
  assert(problem.subfieldEn?.length > 2, `${problem.id}: missing English subfield`);
  assert(Boolean(meta.disciplines[problem.discipline]), `${problem.id}: unknown discipline`);
  assert(Boolean(meta.approaches[problem.approach]), `${problem.id}: unknown approach`);
  assert(Boolean(meta.natures[problem.nature]), `${problem.id}: unknown nature`);
  assert(Boolean(meta.feasibility[problem.feasibility]), `${problem.id}: unknown feasibility`);
  assert(problem.sourceIds.length > 0, `${problem.id}: requires at least one source`);
  for (const sourceId of problem.sourceIds) assert(Boolean(sources[sourceId]), `${problem.id}: unknown source ${sourceId}`);
  assert(problem.whyOpen?.length > 20, `${problem.id}: missing rationale`);
  assert(problem.solvedWhen?.length > 20, `${problem.id}: missing resolution criterion`);
  assert(problem.whyOpenEn?.length > 20, `${problem.id}: missing English rationale`);
  assert(problem.solvedWhenEn?.length > 20, `${problem.id}: missing English resolution criterion`);
  assert(Array.isArray(problem.themes), `${problem.id}: themes must be an array`);
  for (const theme of problem.themes) assert(Boolean(meta.themes[theme]), `${problem.id}: unknown theme ${theme}`);
}

const expectedDisciplineCounts = {
  physics: 63, chemistry: 63, biology: 63, materials: 63, semiconductor: 63,
  mathematics: 30, computer: 30, earth: 30, medicine: 30,
  mechanical: 30, cognitive: 30, agriculture: 30, social: 30
};
for (const discipline of Object.keys(meta.disciplines)) {
  const count = PROBLEMS.filter(item => item.discipline === discipline).length;
  assert(count === expectedDisciplineCounts[discipline], `${discipline}: expected ${expectedDisciplineCounts[discipline]} entries, received ${count}`);
  assert(meta.disciplines[discipline].labelEn?.length > 2, `${discipline}: missing English label`);
}

for (const [sourceId, source] of Object.entries(sources)) {
  assert(Boolean(meta.disciplines[source.discipline]), `${sourceId}: source has unknown discipline`);
  assert(/^https:\/\//.test(source.url), `${sourceId}: source must use HTTPS`);
}

for (const collectionName of ["approaches", "natures", "feasibility", "themes"]) {
  for (const [key, item] of Object.entries(meta[collectionName])) {
    assert(/^#[0-9a-f]{6}$/i.test(item.color), `${collectionName}.${key}: missing chart color`);
    assert(item.labelEn?.length > 0, `${collectionName}.${key}: missing English label`);
  }
}
for (const theme of Object.keys(meta.themes)) {
  assert(PROBLEMS.some(item => item.themes.includes(theme)), `${theme}: theme has no catalog entries`);
}

const boundaryCount = PROBLEMS.filter(item => item.nature === "boundary").length;
assert(boundaryCount === 31, `expected 31 boundary entries, received ${boundaryCount}`);
assert(PROBLEMS.filter(item => item.feasibility === "impossible").every(item => item.nature === "boundary"), "theoretically impossible entries must be boundaries");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const asset of ["styles.css", "data.js", "expansion-data.js", "translations.js", "app.js", "assets/mark.svg", "assets/og.png"]) {
  assert(fs.existsSync(path.join(root, asset)), `missing asset ${asset}`);
  assert(html.includes(asset), `index.html does not reference ${asset}`);
}
for (const id of ["language-switch", "map", "map-lens", "map-legend", "taxonomy", "catalog", "theme-filter", "sources", "problem-dialog", "hover-tooltip"]) {
  assert(html.includes(`id="${id}"`), `index.html missing #${id}`);
}

if (failures.length) {
  console.error(`Validation failed with ${failures.length} issue(s):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validated ${PROBLEMS.length} entries, ${Object.keys(meta.disciplines).length} disciplines, ${Object.keys(sources).length} sources, and site assets.`);
