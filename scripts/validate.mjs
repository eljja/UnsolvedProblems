import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const sandbox = { window: {} };
for (const file of ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", "research-cycle-03-data.js", "research-cycle-04-data.js", "research-cycle-05-data.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
}

const { PROBLEMS, CATALOG_META: meta, CATALOG_SOURCES: sources, CATALOG_PRIZES: prizes, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const audit = JSON.parse(fs.readFileSync(path.join(root, "research/alab-public-data-audit.json"), "utf8"));
const ledgerSchema = JSON.parse(fs.readFileSync(path.join(root, "research/complete-ledger.schema.json"), "utf8"));
const replayBenchmark = JSON.parse(fs.readFileSync(path.join(root, "research/alab-replay-benchmark.json"), "utf8"));
const arrowsAudit = JSON.parse(fs.readFileSync(path.join(root, "research/replay/arrows-ybco-field-audit.json"), "utf8"));
const replayFixture = JSON.parse(fs.readFileSync(path.join(root, "research/replay/synthetic-replay-fixture.json"), "utf8"));
const replayVerification = JSON.parse(fs.readFileSync(path.join(root, "research/replay/verification-result.json"), "utf8"));
const opeSpec = JSON.parse(fs.readFileSync(path.join(root, "research/ope/simulation-spec.json"), "utf8"));
const opeResult = JSON.parse(fs.readFileSync(path.join(root, "research/ope/simulation-result.json"), "utf8"));
const identificationSpec = JSON.parse(fs.readFileSync(path.join(root, "research/identification/sensitivity-spec.json"), "utf8"));
const identificationResult = JSON.parse(fs.readFileSync(path.join(root, "research/identification/sensitivity-result.json"), "utf8"));
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
  assert(problem.currentKnowledge?.length > 80 && problem.currentKnowledge.length < 220, `${problem.id}: requires a concise Korean account of current knowledge`);
  assert(problem.currentKnowledgeEn?.length > 180 && problem.currentKnowledgeEn.length < 520, `${problem.id}: requires a concise English account of current knowledge`);
  assert(problem.specialistExplanation?.length > 240 && problem.specialistExplanation.length < 600, `${problem.id}: requires a substantive Korean technical continuation`);
  assert(problem.specialistExplanationEn?.length > 600 && problem.specialistExplanationEn.length < 1400, `${problem.id}: requires a substantive English technical continuation`);
  assert(problem.technicalTopics?.length === 3, `${problem.id}: requires exactly 3 problem-specific research facets`);
  for (const topic of problem.technicalTopics || []) {
    assert(topic.text?.length > 20 && topic.textEn?.length > 45, `${problem.id}: research facet requires bilingual technical content`);
  }
  assert(problem.resolutionCriterion?.length > 50 && problem.resolutionCriterion.length < 240, `${problem.id}: requires a concrete Korean resolution criterion`);
  assert(problem.resolutionCriterionEn?.length > 120 && problem.resolutionCriterionEn.length < 560, `${problem.id}: requires a concrete English resolution criterion`);
  assert(problem.pitchItems?.length === 1, `${problem.id}: requires one concise, problem-specific resolution test`);
  for (const item of problem.pitchItems || []) {
    assert(item.label?.length > 3 && item.labelEn?.length > 3, `${problem.id}: diagnostic point requires a bilingual label`);
    assert(item.text?.length > 20 && item.textEn?.length > 20, `${problem.id}: diagnostic point requires bilingual content`);
  }
  assert(problem.importantAttempts?.length === 3, `${problem.id}: requires exactly 3 established approaches`);
  assert(problem.recentAttempts?.length === 3, `${problem.id}: requires exactly 3 current directions`);
  for (const attempt of [...problem.importantAttempts, ...problem.recentAttempts]) {
    assert(attempt.title?.length > 5 && attempt.titleEn?.length > 5, `${problem.id}: attempt requires a bilingual title`);
    assert(attempt.description?.length > 90 && attempt.description.length < 180, `${problem.id}: Korean research-program summary must be concise and substantive`);
    assert(attempt.descriptionEn?.length > 220 && attempt.descriptionEn.length < 460, `${problem.id}: English research-program summary must be concise and substantive`);
    assert(attempt.technicalDetail?.length > 80 && attempt.technicalDetail.length < 340, `${problem.id}: Korean attempt requires a problem-specific account of progress and limits`);
    assert(attempt.technicalDetailEn?.length > 200 && attempt.technicalDetailEn.length < 780, `${problem.id}: English attempt requires a problem-specific account of progress and limits`);
    assert(attempt.evidenceLabel?.length > 4 && attempt.evidenceLabelEn?.length > 4, `${problem.id}: attempt requires a bilingual evidence classification`);
    assert(Boolean(sources[attempt.sourceId]), `${problem.id}: attempt has unknown source ${attempt.sourceId}`);
    assert(problem.sourceIds.includes(attempt.sourceId), `${problem.id}: attempt source must be linked to the problem`);
  }
  assert(/^\d{4}-\d{2}-\d{2}$/.test(problem.researchContextReviewedOn), `${problem.id}: missing research context review date`);
  const lab = problem.solutionLab;
  assert(Boolean(lab), `${problem.id}: missing research-attempt design`);
  assert(lab?.diagnosis?.length > 120 && lab?.diagnosisEn?.length > 240, `${problem.id}: requires a substantive bilingual research diagnosis`);
  assert(lab?.centralQuestion?.length > 50 && lab?.centralQuestionEn?.length > 100, `${problem.id}: requires a bilingual decisive research question`);
  assert(lab?.tracks?.length === 3, `${problem.id}: requires exactly 3 research proposals`);
  for (const [trackIndex, track] of (lab?.tracks || []).entries()) {
    for (const key of ["title", "thesis", "departure", "design", "firstTest", "success", "stopRule", "dependencies", "risk"]) {
      assert(track[key]?.text?.length > 5 && track[key]?.textEn?.length > 10, `${problem.id}: proposal ${trackIndex + 1} missing bilingual ${key}`);
    }
    assert(track.speculative === true, `${problem.id}: proposal ${trackIndex + 1} must be marked as unvalidated`);
  }
  assert(lab?.roadmap?.length === 5, `${problem.id}: requires exactly 5 research gates`);
  for (const gate of lab?.roadmap || []) {
    for (const key of ["title", "objective", "output", "gate"]) {
      assert(gate[key]?.text?.length > 10 && gate[key]?.textEn?.length > 20, `${problem.id}: research gate missing bilingual ${key}`);
    }
  }
  assert(lab?.researchQuestions?.length === 4, `${problem.id}: requires 4 design questions`);
  assert(lab?.capabilities?.length === 3, `${problem.id}: requires 3 capability requirements`);
  assert(lab?.pitfalls?.length === 4, `${problem.id}: requires 4 research pitfalls`);
  for (const item of [...(lab?.researchQuestions || []), ...(lab?.capabilities || []), ...(lab?.pitfalls || [])]) {
    assert(item.text?.length > 15 && item.textEn?.length > 25, `${problem.id}: readiness item requires bilingual content`);
  }
  assert(lab?.safetyNote?.length > 35 && lab?.safetyNoteEn?.length > 70, `${problem.id}: requires a bilingual safety boundary`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(lab?.reviewedOn), `${problem.id}: missing research design review date`);
  const deep = lab?.deepDive;
  assert(Boolean(deep), `${problem.id}: missing deep research program`);
  assert(deep?.minimumAdvance?.length > 70 && deep?.minimumAdvanceEn?.length > 150, `${problem.id}: requires a bilingual minimum-advance criterion`);
  for (const [key, count, fields] of [
    ["logicChain", 4, ["title", "claim", "failure"]],
    ["hypotheses", 3, ["title", "claim", "prediction", "test", "reject"]],
    ["workPackages", 4, ["title", "objective", "method", "deliverable", "gate"]],
    ["uncertaintyBudget", 4, ["category", "source", "control", "threshold"]],
    ["decisionTree", 4, ["condition", "action", "meaning"]]
  ]) {
    assert(deep?.[key]?.length === count, `${problem.id}: ${key} requires ${count} entries`);
    for (const entry of deep?.[key] || []) {
      for (const field of fields) {
        assert(entry[field]?.text?.length > 3 && entry[field]?.textEn?.length > 8, `${problem.id}: ${key} missing bilingual ${field}`);
      }
    }
  }
  for (const field of ["candidate", "why", "noveltyCheck"]) {
    assert(deep?.synthesis?.[field]?.text?.length > 30 && deep?.synthesis?.[field]?.textEn?.length > 70, `${problem.id}: synthesis missing bilingual ${field}`);
  }
  assert(/^\d{4}-\d{2}-\d{2}$/.test(deep?.reviewedOn), `${problem.id}: missing deep research-program review date`);
  const history = problem.researchHistory || [];
  if (history.length) {
    assert(problem.cycleResearch === history.at(-1), `${problem.id}: current cycle record must be the latest history entry`);
    assert(new Set(history.map(record => record.cycleId)).size === history.length, `${problem.id}: research history must contain unique cycle IDs`);
    for (const record of history) {
      assert(cycles.some(cycle => cycle.id === record.cycleId), `${problem.id}: unknown research cycle ${record.cycleId}`);
      for (const key of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
        assert(record[key]?.text?.length > 10 && record[key]?.textEn?.length > 25, `${problem.id}/${record.cycleId}: cycle research missing bilingual ${key}`);
      }
      assert(record.hypotheses?.length === 3, `${problem.id}/${record.cycleId}: cycle research requires 3 competing hypotheses`);
      for (const hypothesis of record.hypotheses || []) {
        for (const key of ["claim", "prediction", "reject"]) assert(hypothesis[key]?.text?.length > 15 && hypothesis[key]?.textEn?.length > 30, `${problem.id}/${record.cycleId}: cycle hypothesis missing bilingual ${key}`);
      }
      assert(record.sourceIds?.length >= 3, `${problem.id}/${record.cycleId}: cycle research requires at least 3 evidence sources`);
    }
    assert(problem.researchConnections?.length > 0, `${problem.id}: cycle research requires structural connections`);
  }
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
assert(new Set(PROBLEMS.map(problem => problem.currentKnowledge)).size === PROBLEMS.length, "Korean current-knowledge accounts must be individually specific");
assert(new Set(PROBLEMS.map(problem => problem.currentKnowledgeEn)).size === PROBLEMS.length, "English current-knowledge accounts must be individually specific");
assert(new Set(PROBLEMS.map(problem => problem.specialistExplanation)).size === PROBLEMS.length, "Korean technical continuations must be individually specific");
assert(new Set(PROBLEMS.map(problem => problem.specialistExplanationEn)).size === PROBLEMS.length, "English technical continuations must be individually specific");
assert(new Set(PROBLEMS.map(problem => problem.resolutionCriterion)).size === PROBLEMS.length, "Korean resolution criteria must be individually specific");
assert(new Set(PROBLEMS.map(problem => problem.resolutionCriterionEn)).size === PROBLEMS.length, "English resolution criteria must be individually specific");
for (const key of ["importantAttempts", "recentAttempts"]) {
  for (let index = 0; index < 3; index += 1) {
    assert(new Set(PROBLEMS.map(problem => problem[key][index].technicalDetail)).size === PROBLEMS.length, `Korean ${key}[${index}] continuations must be individually specific`);
    assert(new Set(PROBLEMS.map(problem => problem[key][index].technicalDetailEn)).size === PROBLEMS.length, `English ${key}[${index}] continuations must be individually specific`);
  }
}
for (let index = 0; index < 3; index += 1) {
  for (const languageKey of ["text", "textEn"]) {
    const fullProposal = PROBLEMS.map(problem => ["thesis", "departure", "design", "firstTest", "success", "stopRule"].map(key => problem.solutionLab.tracks[index][key][languageKey]).join("\n"));
    assert(new Set(fullProposal).size === PROBLEMS.length, `${languageKey} proposal ${index + 1} must be problem-specific as a complete research path`);
  }
}
for (const languageKey of ["text", "textEn"]) {
  const deepPrograms = PROBLEMS.map(problem => {
    const deep = problem.solutionLab.deepDive;
    return [
      languageKey === "text" ? deep.minimumAdvance : deep.minimumAdvanceEn,
      ...deep.logicChain.flatMap(item => [item.claim[languageKey], item.failure[languageKey]]),
      ...deep.hypotheses.flatMap(item => [item.claim[languageKey], item.prediction[languageKey], item.test[languageKey], item.reject[languageKey]]),
      ...deep.workPackages.flatMap(item => [item.objective[languageKey], item.method[languageKey], item.gate[languageKey]]),
      deep.synthesis.candidate[languageKey], deep.synthesis.why[languageKey]
    ].join("\n");
  });
  assert(new Set(deepPrograms).size === PROBLEMS.length, `${languageKey}: complete deep research programs must be problem-specific`);
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
  assert(source.evidenceLabel?.length > 4 && source.evidenceLabelEn?.length > 4, `${sourceId}: source requires a bilingual evidence classification`);
  if (source.publishedOn) assert(/^\d{4}-\d{2}-\d{2}$/.test(source.publishedOn), `${sourceId}: publication date must use YYYY-MM-DD`);
  if (source.resultPeriod || source.resultPeriodEn) assert(source.resultPeriod?.length > 10 && source.resultPeriodEn?.length > 15, `${sourceId}: evidence period requires bilingual context`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(source.reviewedOn), `${sourceId}: source requires a review date`);
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

assert(Array.isArray(cycles) && cycles.length > 0, "research platform requires at least one research cycle");
assert(Array.isArray(connections) && connections.length > 0, "research platform requires structural problem connections");
for (const cycle of cycles || []) {
  assert(/^RC-\d{4}-\d{2}$/.test(cycle.id), `${cycle.id}: invalid research cycle ID`);
  assert(cycle.problemIds?.length > 1, `${cycle.id}: cycle must connect multiple problems`);
  assert(cycle.connectionIds?.length > 0, `${cycle.id}: cycle must identify its structural connections`);
  assert(cycle.verifiedFindings?.length >= 3, `${cycle.id}: cycle requires verified findings`);
  assert(cycle.log?.length >= 3, `${cycle.id}: cycle requires an auditable record`);
  for (const problemId of cycle.problemIds || []) {
    const problem = PROBLEMS.find(item => item.id === problemId);
    assert(Boolean(problem), `${cycle.id}: unknown problem ${problemId}`);
    assert(problem?.researchHistory?.some(record => record.cycleId === cycle.id), `${cycle.id}/${problemId}: missing historical problem record`);
  }
  for (const connectionId of cycle.connectionIds || []) assert(connections.some(connection => connection.id === connectionId), `${cycle.id}: unknown connection ${connectionId}`);
  for (const key of ["name", "thesis", "design", "adjudication", "primaryMetrics", "successRule", "stopRule", "status"]) assert(cycle.sharedProgram?.[key]?.text?.length > 5 && cycle.sharedProgram?.[key]?.textEn?.length > 10, `${cycle.id}: shared program missing bilingual ${key}`);
  for (const sourceId of cycle.sourceIds || []) assert(Boolean(sources[sourceId]), `${cycle.id}: unknown cycle source ${sourceId}`);
  for (const artifact of cycle.artifacts || []) {
    assert(artifact.title?.text?.length > 5 && artifact.title?.textEn?.length > 10, `${cycle.id}: artifact requires a bilingual title`);
    assert(artifact.description?.text?.length > 20 && artifact.description?.textEn?.length > 40, `${cycle.id}: artifact requires a bilingual description`);
    assert(!/^https?:/.test(artifact.url) && fs.existsSync(path.join(root, artifact.url)), `${cycle.id}: missing local artifact ${artifact.url}`);
  }
  if (cycle.resultMatrix) {
    assert(cycle.resultMatrix.title?.text?.length > 5 && cycle.resultMatrix.title?.textEn?.length > 10, `${cycle.id}: result matrix requires a bilingual title`);
    assert(cycle.resultMatrix.columns?.length >= 3 && cycle.resultMatrix.rows?.length >= 2, `${cycle.id}: result matrix requires columns and rows`);
    for (const row of cycle.resultMatrix.rows || []) assert(row.values?.length === cycle.resultMatrix.columns.length - 1, `${cycle.id}: result row width mismatch`);
  }
}
for (const connection of connections || []) {
  assert(/^CONN-[A-Z]+-\d{3}$/.test(connection.id), `${connection.id}: invalid connection ID`);
  assert(connection.problemIds?.length >= 2, `${connection.id}: connection requires at least two problems`);
  for (const problemId of connection.problemIds || []) assert(PROBLEMS.some(problem => problem.id === problemId), `${connection.id}: unknown problem ${problemId}`);
  for (const key of ["type", "sharedBottleneck", "mapping", "failureBoundary", "minimumTest"]) assert(connection[key]?.text?.length > 5 && connection[key]?.textEn?.length > 10, `${connection.id}: missing bilingual ${key}`);
  assert(connection.sourceIds?.every(id => sources[id]), `${connection.id}: unknown evidence source`);
}

assert(audit.auditId === "ALAB-PUBLIC-DATA-2026-08-12", "A-Lab audit must expose its stable audit ID");
assert(audit.reportedCampaign?.experiments === 353 && audit.reportedCampaign?.targets === 57, "A-Lab audit must preserve the reported campaign denominator");
assert(audit.components?.length === 10, "A-Lab audit requires ten explicitly adjudicated public-data components");
assert(new Set(audit.components.map(item => item.id)).size === audit.components.length, "A-Lab audit component IDs must be unique");
for (const component of audit.components || []) {
  assert(["available", "partial", "notLocated"].includes(component.status), `${component.id}: invalid public-data status`);
  assert(component.location?.length > 10 && component.limitation?.length > 20, `${component.id}: audit item requires location and limitation`);
}
assert(ledgerSchema.$schema === "https://json-schema.org/draft/2020-12/schema", "complete ledger must use JSON Schema 2020-12");
for (const field of ["campaignId", "experimentId", "target", "policyDecision", "recipe", "execution", "observation", "adjudication", "outcome", "provenance"]) {
  assert(ledgerSchema.required?.includes(field) && ledgerSchema.properties?.[field], `complete ledger missing required ${field}`);
}
assert(replayBenchmark.status === "prospective-unexecuted", "replay benchmark must not imply execution");
assert(replayBenchmark.policies?.length === 4, "replay benchmark requires four frozen policies");
assert(new Set(replayBenchmark.policies.map(item => item.id)).size === 4, "replay policy IDs must be unique");
assert(replayBenchmark.replayFidelityGate?.selectedActionAgreement === 0.9, "replay benchmark must freeze 90% action agreement");
assert(replayBenchmark.replayFidelityGate?.topFiveRankKendallTau === 0.8, "replay benchmark must freeze Kendall tau at 0.8");
assert(arrowsAudit.auditId === "ARROWS-YBCO-FIELD-AUDIT-2026-08-12", "ARROWS audit must expose its stable audit ID");
assert(arrowsAudit.counts?.precursorSets === 47 && arrowsAudit.counts?.temperatureObservations === 200, "ARROWS audit must preserve public-file denominators");
assert(arrowsAudit.counts?.experimentallyVerifiedTrue === 149 && arrowsAudit.counts?.rawXrdPresent === 149, "ARROWS audit must preserve verified/XRD field coverage");
assert(arrowsAudit.fieldCoverage?.candidateSetSnapshot === "absent" && arrowsAudit.fieldCoverage?.selectionProbability === "absent", "ARROWS audit must record causal-replay gaps");
assert(replayFixture.license === "Apache-2.0" && replayFixture.states?.length === 6, "synthetic replay fixture must remain licensed and frozen at six states");
assert(replayVerification.selectionComparisons === 24 && replayVerification.selectionAgreement === 1, "independent replay must preserve 24/24 selected-action agreement");
assert(replayVerification.fullRankingAgreement === 1 && replayVerification.goldenRankingAgreement === 1, "independent replay must agree on complete and golden rankings");
assert(replayVerification.ablations?.removeDetrimentalPathHistory?.changedSelections === 3, "R2 ablation must preserve three changed selections");
assert(replayVerification.ablations?.removeSelectionProbability?.causalReplayEligible === false, "null propensities cannot imply causal eligibility");
assert(opeSpec.simulationId === "OPE-IDENTIFICATION-0.1" && opeSpec.scenarios?.length === 8, "OPE specification must preserve eight frozen scenarios");
assert(opeSpec.sampling?.replications === 400 && opeSpec.sampling?.observationsPerReplication === 600, "OPE specification must preserve simulation denominators");
assert(opeResult.simulationId === opeSpec.simulationId && opeResult.scenarios?.length === 8, "OPE result must match its frozen specification");
assert(opeResult.truth?.targetPolicyValue === 0.4793, "OPE result must preserve the quadrature truth value");
assert(Object.values(opeResult.preregisteredFindings || {}).every(Boolean), "every preregistered OPE finding must be adjudicated true");
assert(opeResult.scenarios.find(item => item.scenarioId === "weak_overlap")?.benchmarkEligible === false, "weak overlap must fail the precision benchmark gate");
assert(opeResult.scenarios.find(item => item.scenarioId === "zero_support")?.causalEligible === false, "zero support must refuse causal point identification");
assert(identificationSpec.simulationId === "PARTIAL-ID-MNAR-SUPPORT-0.1", "partial-identification specification must preserve its stable ID");
assert(identificationResult.simulationId === identificationSpec.simulationId, "partial-identification result must match its specification");
assert(JSON.stringify(identificationResult.indistinguishableWorlds[0].observedJoint) === JSON.stringify(identificationResult.indistinguishableWorlds[1].observedJoint), "MNAR worlds must preserve the same observed distribution");
assert(Object.values(identificationResult.preregisteredFindings || {}).every(Boolean), "every preregistered partial-identification finding must be true");
assert(identificationResult.randomizedTrials.find(item => item.sampleSize === 10)?.passesWidthGate === false, "ten-run zero-support pilot must retain its failed width gate");

const boundaryCount = PROBLEMS.filter(item => item.nature === "boundary").length;
assert(boundaryCount > 0, "catalog must preserve clearly labeled boundary examples");
assert(PROBLEMS.filter(item => item.feasibility === "impossible").every(item => item.nature === "boundary"), "theoretically impossible entries must be boundaries");
assert(PROBLEMS.filter(item => item.nature === "boundary").every(item => item.importance === "boundary"), "boundary entries must use boundary importance");
assert(PROBLEMS.filter(item => item.nature !== "boundary").every(item => item.importance !== "boundary"), "open research entries cannot use boundary importance");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const solveHtml = fs.readFileSync(path.join(root, "solve.html"), "utf8");
const solveCss = fs.readFileSync(path.join(root, "solve.css"), "utf8");
const logHtml = fs.readFileSync(path.join(root, "research-log.html"), "utf8");
const logCss = fs.readFileSync(path.join(root, "research-log.css"), "utf8");
const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
const packageMetadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const publicCopy = ["index.html", "app.js", "README.md", "priority-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", "research-cycle-03-data.js", "research-cycle-04-data.js", "solve.html", "solve.js", "research-log.html", "research-log.js"]
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
for (const asset of ["styles.css", "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "research-cycle-data.js", "research-cycle-03-data.js", "research-cycle-04-data.js", "app.js", "assets/mark.svg", "assets/og-744.png"]) {
  assert(fs.existsSync(path.join(root, asset)), `missing asset ${asset}`);
  assert(html.includes(asset), `index.html does not reference ${asset}`);
}
for (const asset of ["styles.css", "solve.css", "data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", "research-cycle-03-data.js", "research-cycle-04-data.js", "solve.js", "assets/mark.svg"]) {
  assert(fs.existsSync(path.join(root, asset)), `missing research page asset ${asset}`);
  assert(solveHtml.includes(asset), `solve.html does not reference ${asset}`);
}
for (const id of ["language-switch", "hero-poster", "priority-count", "prize-count", "map", "map-lens", "map-legend", "taxonomy", "catalog", "importance-filter", "prize-filter", "theme-filter", "sources", "problem-dialog", "hover-tooltip"]) {
  assert(html.includes(`id="${id}"`), `index.html missing #${id}`);
}
assert(html.includes("<span>인류가 아직 모르는 것을</span>"), "hero title must preserve its semantic first line");
assert(html.includes('data-i18n="selectionTitle"'), "evidence section must expose academic inclusion criteria");
assert(html.includes('data-i18n="selectionText"'), "evidence section must explain academic inclusion criteria");
assert(css.includes("word-break: keep-all"), "hero title must prevent character-by-character Korean wrapping");
assert(css.includes("@media (max-width: 900px)"), "site must include a tablet hero breakpoint");
for (const id of ["back-to-atlas", "solution-language-switch", "solution-title", "central-question", "starting-point", "research-logic", "minimum-advance", "logic-chain", "hypothesis-matrix", "hypotheses-table", "current-cycle", "cycle-hypotheses", "cycle-connections", "proposals", "recommended-proposal", "alternative-proposals", "roadmap", "work-program", "synthesis-card", "work-package-list", "uncertainty-table", "decision-tree", "requirements", "prior-work", "evidence", "problem-pagination"]) {
  assert(solveHtml.includes(`id="${id}"`), `solve.html missing #${id}`);
}
assert(fs.readFileSync(path.join(root, "app.js"), "utf8").includes("solve.html"), "main problem details must link to a separate research-attempt page");
assert(solveCss.includes("@media (max-width: 800px)"), "research-attempt page must include a mobile/tablet layout");
for (const asset of ["styles.css", "research-log.css", "research-cycle-data.js", "research-cycle-03-data.js", "research-cycle-04-data.js", "research-log.js", "assets/mark.svg"]) {
  assert(fs.existsSync(path.join(root, asset)), `missing research-log asset ${asset}`);
  assert(logHtml.includes(asset), `research-log.html does not reference ${asset}`);
}
for (const id of ["log-language-switch", "cycle-title", "cycle-index", "finding-list", "program-grid", "results", "result-matrix", "artifacts", "artifact-grid", "problem-chain", "connection-map", "cycle-record", "log-sources"]) assert(logHtml.includes(`id="${id}"`), `research-log.html missing #${id}`);
assert(logCss.includes("@media (max-width: 800px)"), "research log must include a mobile/tablet layout");
assert(logCss.includes(".result-matrix-wrap { overflow-x: auto"), "research result matrix must scroll on narrow screens");

const verificationTag = '<meta name="google-site-verification" content="tQU4ms4HtuSSnlNO14YJO8OMyy59mqlFixqXl3Lhlbw">';
assert(html.includes(verificationTag), "index.html must contain the exact Google site-verification tag");
assert(solveHtml.includes(verificationTag), "research pages must preserve the Google site-verification tag");
assert(logHtml.includes(verificationTag), "research log must preserve the Google site-verification tag");
for (const document of [{ name: "index.html", content: html }, { name: "solve.html", content: solveHtml }, { name: "research-log.html", content: logHtml }]) {
  assert(document.content.includes('rel="sitemap"'), `${document.name} must advertise sitemap.xml`);
  assert(document.content.includes('type="application/ld+json"'), `${document.name} requires structured data`);
}
assert(html.includes('hreflang="ko"') && html.includes('hreflang="en"') && html.includes('hreflang="x-default"'), "index.html requires Korean, English, and x-default alternate URLs");
const indexStructuredDataMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
assert(Boolean(indexStructuredDataMatch), "index.html structured data block is missing");
if (indexStructuredDataMatch) {
  try {
    const structured = JSON.parse(indexStructuredDataMatch[1]);
    assert(structured["@type"] === "CollectionPage", "index structured data must describe a CollectionPage");
    assert(structured.mainEntity?.numberOfItems === PROBLEMS.length, "index structured-data item count must match the catalog");
  } catch (error) {
    assert(false, `index structured data is invalid JSON: ${error.message}`);
  }
}
assert(robots.includes("User-agent: *") && robots.includes("Allow: /"), "robots.txt must permit crawling");
assert(license.includes("Apache License") && license.includes("Version 2.0, January 2004"), "LICENSE must contain the Apache License 2.0 text");
assert(packageMetadata.license === "Apache-2.0", "package.json must declare the Apache-2.0 SPDX identifier");
assert(fs.readFileSync(path.join(root, "README.md"), "utf8").includes("[Apache License 2.0](./LICENSE)"), "README must link to the repository license");
assert(robots.includes("https://eljja.github.io/UnsolvedProblems/sitemap.xml"), "robots.txt must advertise the absolute sitemap URL");
assert(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), "sitemap.xml must start with a UTF-8 XML declaration");
assert(sitemap.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'), "sitemap.xml must declare the XHTML namespace for hreflang alternates");
const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert(sitemapLocations.length === PROBLEMS.length * 2 + cycles.length * 2 + 2, "sitemap.xml must contain both languages for the atlas, every problem, and every research cycle");
assert(new Set(sitemapLocations).size === sitemapLocations.length, "sitemap.xml locations must be unique");
assert(!sitemapLocations.some(location => location.includes("&lang=")), "sitemap.xml query separators must be XML escaped");
for (const problem of PROBLEMS) {
  for (const language of ["ko", "en"]) {
    const expected = `https://eljja.github.io/UnsolvedProblems/solve.html?id=${problem.id}&amp;lang=${language}`;
    assert(sitemapLocations.includes(expected), `${problem.id}: sitemap missing ${language} research page`);
  }
}
for (const cycle of cycles) {
  for (const language of ["ko", "en"]) {
    const expected = `https://eljja.github.io/UnsolvedProblems/research-log.html?cycle=${cycle.id}&amp;lang=${language}`;
    assert(sitemapLocations.includes(expected), `${cycle.id}: sitemap missing ${language} research log`);
  }
}
const solveScript = fs.readFileSync(path.join(root, "solve.js"), "utf8");
assert(solveScript.includes("updateDiscoveryMetadata"), "solve.js must update canonical, social, and structured metadata for each problem");
assert(solveScript.includes("setCanonical"), "solve.js must inject one problem-specific canonical URL after resolving the problem");
const appScript = fs.readFileSync(path.join(root, "app.js"), "utf8");
assert(appScript.includes('href="${escapeHTML(solutionURL(problem))}"'), "problem cards must expose crawlable links to research pages");
for (const asset of ["robots.txt", "sitemap.xml", "scripts/generate-sitemap.mjs", "research-cycle-data.js", "research-log.html", "research-log.js", "research-log.css", "research/alab-public-data-audit.json", "research/complete-ledger.schema.json", "research/alab-replay-benchmark.json"]) {
  assert(fs.existsSync(path.join(root, asset)), `missing search-discovery asset ${asset}`);
}

if (failures.length) {
  console.error(`Validation failed with ${failures.length} issue(s):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validated ${PROBLEMS.length} entries, ${Object.keys(meta.disciplines).length} disciplines, ${Object.keys(sources).length} sources, and site assets.`);
