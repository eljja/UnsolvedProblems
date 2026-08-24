import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const readJson = relative => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const precommit = readJson("research/reproducibility/rc47-self-deletion-precommit.json");
assert(precommit.cycleId === "RC-2026-47" && precommit.status === "sealed-before-32x32-pixel-decoding-or-any-rc47-gap-score", "RC47 preregistration status changed.");
assert(precommit.problems.join("|") === "UP-605|UP-315" && precommit.partition.sealedTest.includes("76403, 95504"), "RC47 scope or sealed split changed.");
assert(precommit.selfSupervisedGapModels.candidateFamilies.length === 3 && precommit.selfSupervisedGapModels.candidateFamilies.join("|").includes("ridge-LDA-1.0") && precommit.hardGates.length === 6, "RC47 model families or hard gates changed.");
assert(precommit.inputs.expectedAviSha256 === "54bc90814acf15304257ee4c9c56f029d50999ab38b9c27455137a12f884b53a" && precommit.resources.prohibited.includes("L0001"), "RC47 input identity or natural boundary changed.");

const decode = readJson("research/reproducibility/rc47-l0002-decode.json");
assert(decode.source.bytes === 172605872 && decode.source.sha256 === precommit.inputs.expectedAviSha256, "RC47 AVI identity changed.");
assert(decode.output.frames === 95504 && decode.output.bytes === 97796096 && decode.output.sha256 === "6bfe5a05a9825344bfa84f380a42d16b486885030429dba8818093d0b5b69df1", "RC47 raw decode changed.");
assert(decode.decoder.sha256 === "2ce797a0f88d7f067180338fb227f7b1928ea727bd9a4d7a1d022f7c52af71a3", "RC47 FFmpeg identity changed.");

const python = readJson("research/reproducibility/rc47-self-deletion-python.json");
const node = readJson("research/reproducibility/rc47-self-deletion-node.json");
for (const result of [python, node]) {
  assert(result.inputs.rawSha256 === decode.output.sha256 && result.inputs.rawBytes === decode.output.bytes && result.featureCount === 35, "RC47 implementation input or feature count changed.");
  assert(result.selectedModels["1"].family === "scalar-jump" && result.selectedModels["2"].family === "ridge-LDA-1.0" && result.selectedModels["4"].family === "scalar-jump" && result.selectedModels["8"].family === "scalar-jump", "RC47 selected family changed.");
  assert(result.sealedTest["1"].recallWithinOne === 0 && result.sealedTest["2"].recallWithinOne === 0.0390625 && result.sealedTest["4"].recallWithinOne === 0.046875 && result.sealedTest["8"].recallWithinOne === 0.0703125, "RC47 sealed recall changed.");
  assert(Object.values(result.sealedTest).every(row => row.unmodifiedControl.calls === 1), "RC47 unmodified false calls changed.");
  assert(result.aggregate.calls === 640 && result.aggregate.falseDiscoveries === 620 && result.aggregate.falseDiscoveryRate === 0.96875, "RC47 aggregate decision changed.");
}
const adjudication = readJson("research/reproducibility/rc47-self-deletion-adjudication.json");
assert(adjudication.implementationAgreement.pass && adjudication.implementationAgreement.maximumNumericDifference < 7.2e-15 && adjudication.implementationAgreement.exactTrialTruthAndCalls, "RC47 independent agreement weakened.");
assert(adjudication.hypothesisDecision === "S0-supported-for-fixed-family" && !adjudication.gatePassed && !adjudication.independentLayerPixelsAuthorized && !adjudication.naturalL0001Authorized, "RC47 release boundary changed.");

const pythonTrials = readJson("research/reproducibility/rc47-self-deletion-python-trials.json");
const nodeTrials = readJson("research/reproducibility/rc47-self-deletion-node-trials.json");
for (const block of ["1", "2", "4", "8"]) {
  assert(JSON.stringify(pythonTrials.validation[block].map(row => [row.truthStart, row.callRightSlot])) === JSON.stringify(nodeTrials.validation[block].map(row => [row.truthStart, row.callRightSlot])), `RC47 validation calls differ for block ${block}.`);
  assert(JSON.stringify(pythonTrials.sealedTest[block].map(row => [row.truthStart, row.callRightSlot])) === JSON.stringify(nodeTrials.sealedTest[block].map(row => [row.truthStart, row.callRightSlot])), `RC47 sealed calls differ for block ${block}.`);
}

const diagnostic = readJson("research/reproducibility/rc47-regime-boundary-diagnostic.json");
assert(diagnostic.status === "exploratory-after-sealed-gate-failure" && diagnostic.repeatedTopNaturalStarts["77596"].join("|") === "1|4|8" && diagnostic.repeatedTopNaturalStarts["92905"].join("|") === "2", "RC47 post-gate diagnostic changed.");
const top77596 = diagnostic.blocks["1"].topNaturalTransitions[0];
assert(top77596.image.centerMadPercentileAllL0002 > 0.995 && top77596.commandOrdinalAssumption.centerStepPercentileAllL0002 > 0.99996 && top77596.commandOrdinalAssumption.warning.includes("no public identity ledger"), "RC47 regime evidence changed or overclaims identity.");

const bound = readJson("research/reproducibility/rc47-history-equivalence-bound.json");
assert(bound.inputs.cameraTriggerCount === 94736 && bound.inputs.deficit === 23, "RC47 equivalence inputs changed.");
assert(bound.models.arbitraryOrderPreservingOmissions.minimumAggregateIdentityBitsToSelectOneSet === 306 && Math.abs(bound.models.arbitraryOrderPreservingOmissions.log2PossibleMissingSets - 305.7708301287824) < 1e-12, "RC47 history-information bound changed.");
assert(bound.models.oneContiguousInternalBlock.possibleMissingSetsExact === "94714" && bound.models.oneContiguousInternalBlock.minimumAggregateIdentityBitsToSelectOneSet === 17, "RC47 block-history bound changed.");

const connectionEvidence = readJson("research/reproducibility/rc47-cadence-connection-evidence.json");
assert(connectionEvidence.connectionId === "CONN-EVIDENCE-020" && connectionEvidence.status.includes("prospectively rejected"), "RC47 connection evidence overclaims validation.");
const integrated = readJson("research/reproducibility/rc47-x16-cycle-result.json");
assert(integrated.status === "image-only-cadence-rejected-natural-holdout-sealed" && integrated.hypotheses.S1_imageCadenceSeparatesAllGaps === "rejected", "RC47 integrated verdict changed.");
assert(!integrated.decision.gatePassed && integrated.decision.naturalMissingPositionsAdjudicated === 0 && integrated.decision.aggregateFalseDiscoveryRate === 0.96875, "RC47 integrated release boundary changed.");

const cacheRoot = path.join(root, ".cache", "rc47-x16");
if (fs.existsSync(cacheRoot)) {
  const cacheFiles = fs.readdirSync(cacheRoot, { recursive: true }).map(value => String(value).toLowerCase());
  assert(!cacheFiles.some(value => value.includes("l0001") || value.endsWith(".avi") || value.endsWith(".tif") || value.endsWith(".tiff")), "RC47 cache contains prohibited natural or independent-layer images.");
}

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 45 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-47");
assert(cycle?.problemIds.join("|") === "UP-605|UP-315" && cycle.connectionIds.join("|") === "CONN-EVIDENCE-020", "RC47 public scope changed.");
assert(cycle.verifiedFindings.length === 8 && cycle.resultMatrix.rows.length === 10 && cycle.artifacts.length === 16 && cycle.log.length === 10, "RC47 public record incomplete.");
for (const item of cycle.artifacts) assert(fs.existsSync(path.join(root, item.url)), `Missing RC47 artifact: ${item.url}`);
const connection = connections.find(item => item.id === "CONN-EVIDENCE-020");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 250, "RC47 connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length === 3 && record.sourceIds.length === 10, `${id}: RC47 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    assert(record[field].text.length > (field === "role" ? 55 : 300) && record[field].textEn.length > (field === "role" ? 100 : 500), `${id}: RC47 ${field} is not substantive and bilingual.`);
  }
}
for (const id of ["nist_mpm_features_iise_2022", "jin_video_deletion_2022", "jiang_super_slomo_2018"]) assert(sources[id]?.reviewedOn === "2026-08-24" && /^https:\/\//.test(sources[id].url), `RC47 source missing: ${id}`);
assert(Object.keys(sources).length === 276 && cycles.length === 47 && connections.length === 50, "RC47 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 154, "RC47 research record count changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).includes("research-cycle-47-data.js"), `${page} does not load RC47.`);
const publicText = read("research-cycle-47-data.js");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추"]) assert(!publicText.includes(phrase), `RC47 contains forbidden wording: ${phrase}`);
console.log("RC47 verified: image-only cadence fails all sealed gates; 620/640 false discoveries keep independent layers and L0001 sealed.");
