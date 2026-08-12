import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceIndex = process.argv.indexOf("--source-dir");
const sourceDir = sourceIndex >= 0 ? path.resolve(process.argv[sourceIndex + 1]) : null;
if (!sourceDir) throw new Error("Pass --source-dir containing the official NIST raw profile file.");

const spec = {
  auditId: "NIST-VO2-LABEL-SEMANTICS-0.1",
  reviewedOn: "2026-08-12",
  fixedObservable: "centered cosine distance selected on HL1-HL2 during RC13",
  questions: {
    semanticsDominance: "Flag if excluding the low-mixed-use candidate changes AUC by at least 0.10 or boundary-edge Jaccard falls below 0.50 relative to the sealed HL3-HL5 panel.",
    transitionDominance: "Flag if one transition type supplies more than 70% of boundary edges while every other observed transition type has AUC at most 0.55.",
    fiftyDegreeDominance: "Flag if deleting the 50 C row changes AUC by at least 0.10 or positives incident to 50 C contribute more than 50% of the full Mann-Whitney numerator."
  },
  interpretation: [
    "The paper reports that one anonymous labeler disallowed multiple phases and presents an analysis excluding that label set, but the released HL numbering is not mapped to the paper's labeler order.",
    "The labeler with the fewest mixed-phase assignments is therefore an exploratory semantic signature, not a proven identity match.",
    "No panel in this audit is physical ground truth. Panels test whether the fixed raw-profile ranking survives alternative annotation ontologies."
  ]
};

const rows = JSON.parse(fs.readFileSync(path.join(root, "research/external-audit/nist-vo2-2020/human-labels.json"), "utf8")).records;
const spectra = fs.readFileSync(path.join(sourceDir, "VO2-Nb2O3-XRD-Combiview.txt"), "utf8").trim().split(/\r?\n/).slice(1).map(line => line.split("\t").map(Number));
const labelers = ["HL1", "HL2", "HL3", "HL4", "HL5"];
const round = (value, digits = 6) => value === null ? null : Number(value.toFixed(digits));
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const centeredCosineDistance = (left, right) => {
  const lm = mean(left), rm = mean(right);
  let dot = 0, ll = 0, rr = 0;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i] - lm, r = right[i] - rm;
    dot += l * r; ll += l * l; rr += r * r;
  }
  return 1 - dot / Math.sqrt(ll * rr);
};
const strictMajority = values => {
  const counts = [...new Set(values)].map(value => [value, values.filter(item => item === value).length]).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return counts[0][1] > values.length / 2 ? counts[0][0] : null;
};
const legacyMode = values => [...new Set(values)].map(value => [value, values.filter(item => item === value).length]).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
const labelCounts = Object.fromEntries(labelers.map(labeler => [labeler, Object.fromEntries([0, 1, 2].map(value => [value, rows.filter(row => row.labels[labeler] === value).length]))]));
const lowMixedUseCandidate = labelers.toSorted((a, b) => labelCounts[a][1] - labelCounts[b][1])[0];
const temperatures = [...new Set(rows.map(row => row.temperatureC))].sort((a, b) => a - b);
const compositions = [...new Set(rows.map(row => row.vanadiumAtomicPercent))].sort((a, b) => a - b);
const rowIndex = new Map(rows.map((row, index) => [`${row.vanadiumAtomicPercent}|${row.temperatureC}`, index]));
const baseEdges = [];
for (let index = 0; index < rows.length; index += 1) {
  const row = rows[index], x = compositions.indexOf(row.vanadiumAtomicPercent), y = temperatures.indexOf(row.temperatureC);
  for (const [nx, ny, axis] of [[x + 1, y, "composition"], [x, y + 1, "temperature"]]) {
    if (nx >= compositions.length || ny >= temperatures.length) continue;
    const right = rowIndex.get(`${compositions[nx]}|${temperatures[ny]}`);
    baseEdges.push({ left: index, right, axis, score: centeredCosineDistance(spectra[row.measurementId - 1], spectra[rows[right].measurementId - 1]) });
  }
}
const aucDetail = edges => {
  const positives = edges.filter(edge => edge.truth), negatives = edges.filter(edge => !edge.truth);
  if (!positives.length || !negatives.length) return { auc: null, positives: positives.length, negatives: negatives.length, numerator: null };
  let numerator = 0;
  for (const positive of positives) for (const negative of negatives) numerator += positive.score > negative.score ? 1 : positive.score === negative.score ? 0.5 : 0;
  return { auc: numerator / (positives.length * negatives.length), positives: positives.length, negatives: negatives.length, numerator };
};
const buildPanel = (name, members, method = "strictMajority") => {
  const adjudicate = method === "legacyLowestValueTieBreak" ? legacyMode : strictMajority;
  const phases = rows.map(row => adjudicate(members.map(labeler => row.labels[labeler])));
  const edges = baseEdges.filter(edge => phases[edge.left] !== null && phases[edge.right] !== null).map(edge => ({ ...edge, truth: Number(phases[edge.left] !== phases[edge.right]), transition: [phases[edge.left], phases[edge.right]].sort().join("-") }));
  const full = aucDetail(edges);
  return { name, members, method, phases, edges, summary: { adjudicatedNodes: phases.filter(value => value !== null).length, excludedTies: phases.filter(value => value === null).length, edges: edges.length, boundaryEdges: full.positives, nonBoundaryEdges: full.negatives, auc: round(full.auc), phaseCounts: Object.fromEntries([0, 1, 2].map(value => [value, phases.filter(phase => phase === value).length])) } };
};

const panelDefinitions = [
  ["legacySealedHL3HL5", ["HL3", "HL4", "HL5"], "legacyLowestValueTieBreak"],
  ["sealedHL3HL5Strict", ["HL3", "HL4", "HL5"]],
  ["allFive", labelers],
  ["excludeLowMixedUseCandidate", labelers.filter(labeler => labeler !== lowMixedUseCandidate)],
  ["sealedWithoutLowMixedUseCandidate", ["HL3", "HL4", "HL5"].filter(labeler => labeler !== lowMixedUseCandidate)],
  ...labelers.map(labeler => [`leaveOut${labeler}`, labelers.filter(item => item !== labeler)])
];
const panels = Object.fromEntries(panelDefinitions.map(([name, members, method]) => [name, buildPanel(name, members, method)]));
const sealed = panels.legacySealedHL3HL5;
const boundarySet = panel => new Set(panel.edges.filter(edge => edge.truth).map(edge => `${edge.left}|${edge.right}`));
const comparePanels = (left, right) => {
  const comparable = left.phases.map((phase, index) => phase !== null && right.phases[index] !== null ? index : null).filter(index => index !== null);
  const leftBoundary = boundarySet(left), rightBoundary = boundarySet(right);
  const intersection = [...leftBoundary].filter(edge => rightBoundary.has(edge)).length;
  const union = new Set([...leftBoundary, ...rightBoundary]).size;
  return {
    comparableNodes: comparable.length,
    phaseAgreement: round(comparable.filter(index => left.phases[index] === right.phases[index]).length / comparable.length),
    boundaryIntersection: intersection,
    boundaryUnion: union,
    boundaryJaccard: round(union ? intersection / union : 1),
    aucDeltaFromSealed: round(right.summary.auc - left.summary.auc)
  };
};

const transitionTypes = [...new Set(sealed.edges.filter(edge => edge.truth).map(edge => edge.transition))].sort();
const transitionResults = Object.fromEntries(transitionTypes.map(type => {
  const selected = sealed.edges.filter(edge => !edge.truth || edge.transition === type).map(edge => ({ ...edge, truth: Number(edge.truth && edge.transition === type) }));
  const detail = aucDetail(selected);
  return [type, { boundaryEdges: detail.positives, shareOfBoundaryEdges: round(detail.positives / sealed.summary.boundaryEdges), nonBoundaryEdges: detail.negatives, auc: round(detail.auc) }];
}));
const fullDetail = aucDetail(sealed.edges);
const temperatureResults = Object.fromEntries(temperatures.map(temperature => {
  const incident = edge => rows[edge.left].temperatureC === temperature || rows[edge.right].temperatureC === temperature;
  const positives = sealed.edges.filter(edge => edge.truth && incident(edge));
  const negatives = sealed.edges.filter(edge => !edge.truth);
  const bandDetail = aucDetail([...positives, ...negatives]);
  const removedDetail = aucDetail(sealed.edges.filter(edge => !incident(edge)));
  return [temperature, {
    incidentBoundaryEdges: positives.length,
    incidentBoundaryShare: round(positives.length / fullDetail.positives),
    incidentPositiveAucAgainstAllNonBoundaries: round(bandDetail.auc),
    mannWhitneyNumeratorShare: round(bandDetail.numerator / fullDetail.numerator),
    aucAfterDeletingIncidentEdges: round(removedDetail.auc),
    deltaAfterDeletion: round(removedDetail.auc - fullDetail.auc)
  }];
}));

const panelComparisons = Object.fromEntries(Object.entries(panels).filter(([name]) => name !== "legacySealedHL3HL5").map(([name, panel]) => [name, comparePanels(sealed, panel)]));
const alternativePanelAucs = Object.values(panels).map(panel => panel.summary.auc).filter(value => value !== null);
const otherTransitionTypes = Object.values(transitionResults).toSorted((a, b) => b.shareOfBoundaryEdges - a.shareOfBoundaryEdges).slice(1);
const fifty = temperatureResults[50];
const findings = {
  lowMixedUseCandidate,
  candidateIdentityWithPaperExcludedLabelerIsProven: false,
  legacyLowestValueTieBreakAffectedNodes: panels.sealedHL3HL5Strict.summary.excludedTies,
  semanticsDominanceFlag: Math.abs(panelComparisons.excludeLowMixedUseCandidate.aucDeltaFromSealed) >= 0.1 || panelComparisons.excludeLowMixedUseCandidate.boundaryJaccard < 0.5,
  transitionDominanceFlag: Math.max(...Object.values(transitionResults).map(row => row.shareOfBoundaryEdges)) > 0.7 && otherTransitionTypes.every(row => row.auc <= 0.55),
  fiftyDegreeDominanceFlag: Math.abs(fifty.deltaAfterDeletion) >= 0.1 || fifty.mannWhitneyNumeratorShare > 0.5,
  fixedObservableAboveChanceForEveryPanel: Math.min(...alternativePanelAucs) > 0.5
};

const result = {
  auditId: spec.auditId,
  generatedOn: "2026-08-12",
  labelCounts,
  lowMixedUseCandidate: { labeler: lowMixedUseCandidate, mixedPhaseAssignments: labelCounts[lowMixedUseCandidate][1], status: "exploratory semantic signature; anonymous identity not recoverable from the released workbook or paper" },
  panels: Object.fromEntries(Object.entries(panels).map(([name, panel]) => [name, { members: panel.members, adjudicationMethod: panel.method, ...panel.summary }])),
  comparisonsWithSealedPanel: panelComparisons,
  sealedPanelTransitionResults: transitionResults,
  sealedPanelTemperatureResults: temperatureResults,
  findings,
  decision: findings.fixedObservableAboveChanceForEveryPanel
    ? "Retain centered cosine as a ranking observable across annotation semantics, but stop calling any label panel physical truth and retire the legacy lowest-value tie break from future adjudication. The new physical pilot must judge phase change with an independently specified structural or phase-fraction model and report annotation-ontology sensitivity separately."
    : "Demote centered cosine to exploratory status because its ranking does not survive the annotation-semantic panels.",
  limitations: [
    "This is a retrospective robustness audit on one 192-profile physical dataset, not an independent replication.",
    "The low-mixed-use candidate was identified after inspecting label frequencies; its exclusion cannot serve as a preregistered confirmatory test.",
    "AUC tests ranking only. It neither fixes an operating threshold nor establishes a physical detection limit or phase identity."
  ]
};

if (Math.abs(panels.legacySealedHL3HL5.summary.auc - 0.755362) > 1e-6) throw new Error(`RC13 AUC did not reproduce: ${panels.legacySealedHL3HL5.summary.auc}`);
if (process.argv.includes("--write")) {
  fs.writeFileSync(path.join(root, "research/reproducibility/nist-label-semantics-spec.json"), `${JSON.stringify(spec, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "research/reproducibility/nist-label-semantics-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log("wrote NIST label-semantics specification and result");
} else console.log(JSON.stringify(result, null, 2));

export { spec, result };
