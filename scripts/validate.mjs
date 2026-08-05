import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const sandbox = { window: {} };
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js"]) {
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
  assert(problem.overview?.length > 100 && problem.overview.length < 260, `${problem.id}: Korean overview must remain a concise elevator pitch`);
  assert(problem.overviewEn?.length > 300 && problem.overviewEn.length < 700, `${problem.id}: English overview must remain a concise elevator pitch`);
  assert(problem.plainDefinition?.length > 45 && problem.plainDefinitionEn?.length > 100, `${problem.id}: requires a bilingual undergraduate-level definition`);
  assert(problem.generalExplanation?.length > 120 && problem.generalExplanation.length < 300, `${problem.id}: requires a substantive Korean opening explanation`);
  assert(problem.generalExplanationEn?.length > 300 && problem.generalExplanationEn.length < 700, `${problem.id}: requires a substantive English opening explanation`);
  assert(problem.specialistExplanation?.length > 240 && problem.specialistExplanation.length < 600, `${problem.id}: requires a substantive Korean technical continuation`);
  assert(problem.specialistExplanationEn?.length > 600 && problem.specialistExplanationEn.length < 1400, `${problem.id}: requires a substantive English technical continuation`);
  assert(problem.technicalTopics?.length === 3, `${problem.id}: requires exactly 3 problem-specific research facets`);
  for (const topic of problem.technicalTopics || []) {
    assert(topic.text?.length > 20 && topic.textEn?.length > 45, `${problem.id}: research facet requires bilingual technical content`);
  }
  assert(problem.resolutionCriterion?.length > 20 && problem.resolutionCriterionEn?.length > 20, `${problem.id}: requires a bilingual specialist resolution criterion`);
  assert(problem.pitchItems?.length === 1, `${problem.id}: requires one concise, problem-specific resolution test`);
  for (const item of problem.pitchItems || []) {
    assert(item.label?.length > 3 && item.labelEn?.length > 3, `${problem.id}: diagnostic point requires a bilingual label`);
    assert(item.text?.length > 20 && item.textEn?.length > 20, `${problem.id}: diagnostic point requires bilingual content`);
  }
  assert(problem.importantAttempts?.length === 3, `${problem.id}: requires exactly 3 established approaches`);
  assert(problem.recentAttempts?.length === 3, `${problem.id}: requires exactly 3 current directions`);
  for (const attempt of [...problem.importantAttempts, ...problem.recentAttempts]) {
    assert(attempt.title?.length > 5 && attempt.titleEn?.length > 5, `${problem.id}: attempt requires a bilingual title`);
    assert(attempt.description?.length > 45 && attempt.description.length < 120, `${problem.id}: Korean attempt must be concise and substantive`);
    assert(attempt.descriptionEn?.length > 100 && attempt.descriptionEn.length < 260, `${problem.id}: English attempt must be concise and substantive`);
    assert(attempt.technicalDetail?.length > 80 && attempt.technicalDetail.length < 320, `${problem.id}: Korean attempt requires a problem-specific continuation`);
    assert(attempt.technicalDetailEn?.length > 200 && attempt.technicalDetailEn.length < 700, `${problem.id}: English attempt requires a problem-specific continuation`);
    assert(Boolean(sources[attempt.sourceId]), `${problem.id}: attempt has unknown source ${attempt.sourceId}`);
    assert(problem.sourceIds.includes(attempt.sourceId), `${problem.id}: attempt source must be linked to the problem`);
  }
  assert(/^\d{4}-\d{2}-\d{2}$/.test(problem.researchContextReviewedOn), `${problem.id}: missing research context review date`);
  for (const phrase of ["개별 논문 3편", "단일 논문 목록", "대표 연구축을 요약", "exhaustive paper bibliography", "ranking of three individual papers"]) {
    assert(![problem.overview, problem.overviewEn, ...problem.importantAttempts.map(item => item.description), ...problem.recentAttempts.map(item => item.description)].some(text => text?.includes(phrase)), `${problem.id}: contains editorial boilerplate: ${phrase}`);
  }
  assert(Array.isArray(problem.themes), `${problem.id}: themes must be an array`);
  assert(Array.isArray(problem.prizeIds), `${problem.id}: prizeIds must be an array`);
  for (const prizeId of problem.prizeIds) assert(Boolean(prizes[prizeId]), `${problem.id}: unknown prize ${prizeId}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(problem.reviewedOn), `${problem.id}: missing review date`);
  assert(problem.selectionBasis?.length > 5, `${problem.id}: missing selection basis`);
  for (const theme of problem.themes) assert(Boolean(meta.themes[theme]), `${problem.id}: unknown theme ${theme}`);
}

assert(new Set(PROBLEMS.map(problem => problem.plainDefinition)).size === PROBLEMS.length, "Korean problem definitions must be individually specific");
assert(new Set(PROBLEMS.map(problem => problem.plainDefinitionEn)).size === PROBLEMS.length, "English problem definitions must be individually specific");
assert(new Set(PROBLEMS.map(problem => problem.generalExplanation)).size === PROBLEMS.length, "Korean general-reader explanations must be individually specific");
assert(new Set(PROBLEMS.map(problem => problem.generalExplanationEn)).size === PROBLEMS.length, "English general-reader explanations must be individually specific");
assert(new Set(PROBLEMS.map(problem => problem.specialistExplanation)).size === PROBLEMS.length, "Korean technical continuations must be individually specific");
assert(new Set(PROBLEMS.map(problem => problem.specialistExplanationEn)).size === PROBLEMS.length, "English technical continuations must be individually specific");
for (const key of ["importantAttempts", "recentAttempts"]) {
  for (let index = 0; index < 3; index += 1) {
    assert(new Set(PROBLEMS.map(problem => problem[key][index].technicalDetail)).size === PROBLEMS.length, `Korean ${key}[${index}] continuations must be individually specific`);
    assert(new Set(PROBLEMS.map(problem => problem[key][index].technicalDetailEn)).size === PROBLEMS.length, `English ${key}[${index}] continuations must be individually specific`);
  }
}

const firstFacetBySubfield = new Map();
for (const problem of PROBLEMS) {
  if (!firstFacetBySubfield.has(problem.subfield)) {
    firstFacetBySubfield.set(problem.subfield, problem.technicalTopics[0].text.slice(`${problem.subfield}: `.length));
  }
}
assert(new Set(firstFacetBySubfield.values()).size === firstFacetBySubfield.size, "each subfield must have a distinct technical research core");

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
  assert(prize.amountShort?.length > 2 && prize.amountShortEn?.length > 2, `${prizeId}: missing bilingual card amount`);
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
const publicCopy = ["index.html", "app.js", "README.md", "priority-data.js", "research-context.js"]
  .map(file => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n");
for (const phrase of [
  "분야별 숫자를 맞추지",
  "개수를 맞추지",
  "수량 목표 없음",
  "숫자를 맞추기 위한",
  "편집적 판단",
  "Discipline totals are never equalized",
  "No count quotas",
  "Counts are not matched",
  "editorial judgment",
  "quota-limited",
  "1단계 · 처음 읽는 사람",
  "2단계 · 전공자 핵심",
  "전공자 관점",
  "전공자 포인트",
  "핵심 아이디어",
  "핵심 기술 영역",
  "Level 1",
  "Level 2",
  "Specialist focus",
  "Core idea"
]) {
  assert(!publicCopy.includes(phrase), `public copy contains process-oriented wording: ${phrase}`);
}
for (const asset of ["styles.css", "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "app.js", "assets/mark.svg", "assets/og-744.png"]) {
  assert(fs.existsSync(path.join(root, asset)), `missing asset ${asset}`);
  assert(html.includes(asset), `index.html does not reference ${asset}`);
}
for (const id of ["language-switch", "hero-poster", "priority-count", "prize-count", "map", "map-lens", "map-legend", "taxonomy", "catalog", "importance-filter", "prize-filter", "theme-filter", "sources", "problem-dialog", "hover-tooltip"]) {
  assert(html.includes(`id="${id}"`), `index.html missing #${id}`);
}
assert(html.includes("<span>인류가 아직 모르는 것을</span>"), "hero title must preserve its semantic first line");
assert(html.includes('data-i18n="selectionTitle"'), "evidence section must expose academic inclusion criteria");
assert(html.includes('data-i18n="selectionText"'), "evidence section must explain academic inclusion criteria");
assert(css.includes("word-break: keep-all"), "hero title must prevent character-by-character Korean wrapping");
assert(css.includes("@media (max-width: 900px)"), "site must include a tablet hero breakpoint");

if (failures.length) {
  console.error(`Validation failed with ${failures.length} issue(s):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validated ${PROBLEMS.length} entries, ${Object.keys(meta.disciplines).length} disciplines, ${Object.keys(sources).length} sources, and site assets.`);
