import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const sandbox = { window: {} };
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
}

const { PROBLEMS, CATALOG_META: meta, CATALOG_SOURCES: sources, CATALOG_PRIZES: prizes } = sandbox.window;
assert(Array.isArray(PROBLEMS), "PROBLEMS must be an array");
assert(PROBLEMS.length > 0, "catalog must contain at least one problem");
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
  assert(Boolean(meta.importance[problem.importance]), `${problem.id}: unknown importance`);
  assert(problem.sourceIds.length > 0, `${problem.id}: requires at least one source`);
  for (const sourceId of problem.sourceIds) assert(Boolean(sources[sourceId]), `${problem.id}: unknown source ${sourceId}`);
  assert(problem.whyOpen?.length > 20, `${problem.id}: missing rationale`);
  assert(problem.solvedWhen?.length > 20, `${problem.id}: missing resolution criterion`);
  assert(problem.whyOpenEn?.length > 20, `${problem.id}: missing English rationale`);
  assert(problem.solvedWhenEn?.length > 20, `${problem.id}: missing English resolution criterion`);
  assert(Array.isArray(problem.themes), `${problem.id}: themes must be an array`);
  assert(Array.isArray(problem.prizeIds), `${problem.id}: prizeIds must be an array`);
  for (const prizeId of problem.prizeIds) assert(Boolean(prizes[prizeId]), `${problem.id}: unknown prize ${prizeId}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(problem.reviewedOn), `${problem.id}: missing review date`);
  assert(problem.selectionBasis?.length > 5, `${problem.id}: missing selection basis`);
  for (const theme of problem.themes) assert(Boolean(meta.themes[theme]), `${problem.id}: unknown theme ${theme}`);
}

for (const discipline of Object.keys(meta.disciplines)) {
  const count = PROBLEMS.filter(item => item.discipline === discipline).length;
  assert(count > 0, `${discipline}: requires at least one evidence-backed entry`);
  assert(meta.disciplines[discipline].labelEn?.length > 2, `${discipline}: missing English label`);
}

for (const [sourceId, source] of Object.entries(sources)) {
  assert(Boolean(meta.disciplines[source.discipline]), `${sourceId}: source has unknown discipline`);
  assert(/^https:\/\//.test(source.url), `${sourceId}: source must use HTTPS`);
}

for (const collectionName of ["approaches", "natures", "feasibility", "themes", "importance", "prizeStatuses"]) {
  for (const [key, item] of Object.entries(meta[collectionName])) {
    assert(/^#[0-9a-f]{6}$/i.test(item.color), `${collectionName}.${key}: missing chart color`);
    assert(item.labelEn?.length > 0, `${collectionName}.${key}: missing English label`);
  }
}

assert(prizes && Object.keys(prizes).length > 0, "catalog must expose prize definitions");
for (const [prizeId, prize] of Object.entries(prizes || {})) {
  assert(Boolean(meta.prizeStatuses[prize.status]), `${prizeId}: unknown prize status`);
  assert(Boolean(meta.prizeTypes[prize.type]), `${prizeId}: unknown prize type`);
  assert(Boolean(sources[prize.sourceId]), `${prizeId}: unknown prize source`);
  assert(/^https:\/\//.test(prize.rulesUrl), `${prizeId}: official rules must use HTTPS`);
  assert(prize.amount?.length > 2 && prize.amountEn?.length > 2, `${prizeId}: missing bilingual amount`);
  assert(prize.conditions?.length > 20 && prize.conditionsEn?.length > 20, `${prizeId}: missing bilingual conditions`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(prize.reviewedOn), `${prizeId}: missing review date`);
  assert(PROBLEMS.some(problem => problem.prizeIds.includes(prizeId)), `${prizeId}: prize has no linked catalog item`);
}
for (const theme of Object.keys(meta.themes)) {
  assert(PROBLEMS.some(item => item.themes.includes(theme)), `${theme}: theme has no catalog entries`);
}

const boundaryCount = PROBLEMS.filter(item => item.nature === "boundary").length;
assert(boundaryCount > 0, "catalog must preserve clearly labeled boundary examples");
assert(PROBLEMS.filter(item => item.feasibility === "impossible").every(item => item.nature === "boundary"), "theoretically impossible entries must be boundaries");
assert(PROBLEMS.filter(item => item.nature === "boundary").every(item => item.importance === "boundary"), "boundary entries must use boundary importance");
assert(PROBLEMS.filter(item => item.nature !== "boundary").every(item => item.importance !== "boundary"), "open research entries cannot use boundary importance");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
for (const asset of ["styles.css", "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "app.js", "assets/mark.svg", "assets/og-744.png"]) {
  assert(fs.existsSync(path.join(root, asset)), `missing asset ${asset}`);
  assert(html.includes(asset), `index.html does not reference ${asset}`);
}
for (const id of ["language-switch", "hero-poster", "priority-count", "prize-count", "map", "map-lens", "map-legend", "taxonomy", "catalog", "importance-filter", "prize-filter", "theme-filter", "sources", "problem-dialog", "hover-tooltip"]) {
  assert(html.includes(`id="${id}"`), `index.html missing #${id}`);
}
assert(html.includes("<span>인류가 아직 모르는 것을</span>"), "hero title must preserve its semantic first line");
assert(css.includes("word-break: keep-all"), "hero title must prevent character-by-character Korean wrapping");
assert(css.includes("@media (max-width: 900px)"), "site must include a tablet hero breakpoint");

if (failures.length) {
  console.error(`Validation failed with ${failures.length} issue(s):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validated ${PROBLEMS.length} entries, ${Object.keys(meta.disciplines).length} disciplines, ${Object.keys(sources).length} sources, and site assets.`);
