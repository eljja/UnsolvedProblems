import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const readJson = relative => JSON.parse(read(relative));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const precommit = readJson("research/reproducibility/rc48-identity-budget-precommit.json");
assert(precommit.cycleId === "RC-2026-48" && precommit.status === "sealed-after-public-catalog-and-figshare-spreadsheet-reconnaissance-before-hdf5-hierarchy-or-new-archive-inspection", "RC48 preregistration boundary changed.");
assert(precommit.problems.join("|") === "UP-605|UP-315" && precommit.countModel.N === 94736 && precommit.countModel.missing === 23, "RC48 scope or count model changed.");
assert(precommit.anchorSweep.periods.join("|") === "1|2|4|8|16|32|64|128|256|512|1024|2048|4096|8192|16384|32768|65536|94712", "RC48 anchor sweep changed.");
assert(precommit.hardGates.length === 6 && precommit.hardGates.some(item => item.includes("64 MiB")) && precommit.resources.prohibited.includes("No image payload"), "RC48 hard gate or image boundary changed.");

const provenance = readJson("research/reproducibility/rc48-public-provenance-audit.json");
assert(provenance.versions.length === 3 && provenance.versions.every(item => item.componentCount === 88), "RC48 NIST manifest count changed.");
assert(provenance.versions.every(item => item.identityNamedPaths.length === 0), "RC48 manifest unexpectedly reports an identity-named path.");
for (const comparison of provenance.comparisons) {
  assert(comparison.added.length === 0 && comparison.removed.length === 0 && comparison.sizeOrChecksumChanged.length === 0 && comparison.unchanged === 88, "RC48 public-version diff changed.");
}
assert(provenance.selectedArchive.entries.length === 25 && provenance.selectedArchive.identityNamedEntries.length === 0, "RC48 DAQ central-directory roster changed.");
assert(provenance.selectedArchive.payloadBytesRead === 0 && provenance.selectedArchive.totalBytesReceived === 132522, "RC48 DAQ bounded-byte receipt changed.");
assert(provenance.verdict.directIdentityGate === "fail" && !provenance.verdict.manifestIdentityLedgerFound && !provenance.verdict.selectedArchiveIdentityLedgerFound, "RC48 public-ledger verdict changed.");

const hdf5 = readJson("research/reproducibility/rc48-figshare-hdf5-metadata.json");
assert(hdf5.status === "metadata-inspected" && hdf5.transfer.bytesReceived === 20447232 && hdf5.transfer.bytesReceived < hdf5.transfer.transferCap, "RC48 HDF5 bounded inspection changed.");
assert(hdf5.policy.imageValuesRead === false && hdf5.policy.datasetValuesRead === false, "RC48 HDF5 image-value seal changed.");
assert(hdf5.objects.length === 3 && hdf5.objects.map(item => item.path).join("|") === "/source8|/source8/NIST16X|/source8/NIST16X/rawdata", "RC48 HDF5 X16 hierarchy changed.");
const rawdata = hdf5.objects.at(-1);
assert(rawdata.kind === "dataset" && rawdata.shape.join("|") === "18432|120|120" && rawdata.dtype === "uint8" && Object.keys(rawdata.attributes).length === 0 && !rawdata.valuesRead, "RC48 X16 HDF5 dataset boundary changed.");

const node = readJson("research/reproducibility/rc48-identity-budget-node.json");
const python = readJson("research/reproducibility/rc48-identity-budget-python.json");
const expectedCount = "111222247780697737811569949505047670092175708162872419433827601154009970755623534825120294400";
for (const result of [node, python]) {
  assert(result.inputs.cameraTriggerCount === 94736 && result.inputs.exportedFrameCount === 94713 && result.inputs.missing === 23, "RC48 identity-budget inputs changed.");
  assert(result.countOnly.histories === expectedCount && result.countOnly.minimumAggregateIdentityBits === 306 && Math.abs(result.countOnly.log2Histories - 305.7708301287825) < 1e-12, "RC48 count-only class changed.");
  const byPeriod = Object.fromEntries(result.periodicAnchors.map(item => [item.period, item]));
  assert(byPeriod[1].histories === "1" && byPeriod[1].minimumAggregateIdentityBits === 0, "RC48 every-frame identity result changed.");
  assert(byPeriod[2].histories === "8388608" && byPeriod[2].minimumAggregateIdentityBits === 23, "RC48 K=2 result changed.");
  assert(byPeriod[4].histories === "70368744177664" && byPeriod[4].minimumAggregateIdentityBits === 46, "RC48 K=4 result changed.");
  assert(byPeriod[8].histories === "590295810358705651712" && byPeriod[8].minimumAggregateIdentityBits === 69, "RC48 K=8 result changed.");
  assert(byPeriod[94712].authenticatedAnchorCount === 2 && byPeriod[94712].minimumAggregateIdentityBits === 306, "RC48 endpoint-only result changed.");
  assert(result.firstFrameAnchors.at(-1).triggerOrdinal === 24 && result.firstFrameAnchors.at(-1).histories === "1", "RC48 leading-edge theorem changed.");
  assert(result.lastFrameAnchors[0].triggerOrdinal === 94713 && result.lastFrameAnchors[0].histories === "1", "RC48 trailing-edge theorem changed.");
  assert(result.perExposureCounter.histories === "1" && result.theoremChecks.inheritedCountMatches, "RC48 per-exposure theorem changed.");
}
const independent = readJson("research/reproducibility/rc48-identity-budget-independent-audit.json");
assert(independent.gate === "pass" && independent.failures.length === 0 && independent.exactIntegerComparisons === 68 && independent.log2Tolerance === 1e-12, "RC48 independent budget audit weakened.");

const connectionEvidence = readJson("research/reproducibility/rc48-identity-connection-evidence.json");
assert(connectionEvidence.connectionId === "CONN-EVIDENCE-021" && connectionEvidence.problemIds.join("|") === "UP-605|UP-315", "RC48 structural connection changed.");
assert(connectionEvidence.holdsWhen.length === 4 && connectionEvidence.breaksWhen.length === 4 && connectionEvidence.validationStatus.includes("prospective"), "RC48 connection boundaries overclaim validation.");
const integrated = readJson("research/reproducibility/rc48-x16-cycle-result.json");
assert(integrated.verifiedFindings.length === 8 && integrated.hypothesisAdjudication.length === 5 && integrated.workPackages.length === 4, "RC48 integrated result incomplete.");
assert(integrated.newSolutionPath.status.includes("not claimed as a novel primitive") && integrated.unresolved.length === 5, "RC48 novelty boundary or uncertainty changed.");
assert(integrated.nextCycleStart.includes("should not fit another X16 image model") && integrated.nextCycleStart.includes("306-bit partial-identification"), "RC48 next start changed.");

const cacheRoot = path.join(root, ".cache", "rc48-identity");
if (fs.existsSync(cacheRoot)) {
  const cacheFiles = fs.readdirSync(cacheRoot, { recursive: true }).map(value => String(value).toLowerCase());
  assert(!cacheFiles.some(value => value.includes("l0001") || value.endsWith(".avi") || value.endsWith(".tif") || value.endsWith(".tiff") || value.endsWith(".h5")), "RC48 cache contains prohibited images or the full HDF5 object.");
}

const sandbox = { window: {} };
const siteFiles = ["data.js", "expansion-data.js", "translations.js", "priority-data.js", "prize-data.js", "research-context.js", "solution-context.js", "deep-solution-context.js", "research-cycle-data.js", ...Array.from({ length: 46 }, (_, index) => `research-cycle-${String(index + 3).padStart(2, "0")}-data.js`)];
for (const file of siteFiles) vm.runInNewContext(read(file), sandbox, { filename: file });
const { PROBLEMS: problems, CATALOG_SOURCES: sources, RESEARCH_CYCLES: cycles, RESEARCH_CONNECTIONS: connections } = sandbox.window;
const cycle = cycles.find(item => item.id === "RC-2026-48");
assert(cycle?.problemIds.join("|") === "UP-605|UP-315" && cycle.connectionIds.join("|") === "CONN-EVIDENCE-021", "RC48 public scope changed.");
assert(cycle.verifiedFindings.length === 8 && cycle.resultMatrix.rows.length === 11 && cycle.artifacts.length === 14 && cycle.log.length === 9, "RC48 public record incomplete.");
for (const item of cycle.artifacts) assert(fs.existsSync(path.join(root, item.url)), `Missing RC48 artifact: ${item.url}`);
const connection = connections.find(item => item.id === "CONN-EVIDENCE-021");
assert(connection?.strength === "strong" && connection.problemIds.join("|") === cycle.problemIds.join("|") && connection.mapping.text.length > 180 && connection.failureBoundary.text.length > 230, "RC48 public connection incomplete.");
for (const id of cycle.problemIds) {
  const record = problems.find(item => item.id === id)?.researchHistory?.find(item => item.cycleId === cycle.id);
  assert(record?.hypotheses.length >= 3 && record.sourceIds.length === 11, `${id}: RC48 hypotheses or sources incomplete.`);
  for (const field of ["role", "updatedDefinition", "knownBoundary", "bottleneck", "minimumAdvance", "decisiveTest", "unresolved"]) {
    const minimumKo = field === "role" ? 55 : 250;
    const minimumEn = field === "role" ? 100 : 400;
    assert(record[field].text.length > minimumKo && record[field].textEn.length > minimumEn, `${id}: RC48 ${field} is not substantive and bilingual.`);
  }
}
for (const id of ["motionblitz_cube_manual_2013", "scidata_melt_pool_compilation_2025", "figshare_melt_pool_compilation_2025", "rfc3161_timestamp_protocol_2001"]) {
  assert(sources[id]?.reviewedOn === "2026-08-25" && /^https:\/\//.test(sources[id].url), `RC48 source missing: ${id}`);
}
assert(Object.keys(sources).length === 280 && cycles.length === 48 && connections.length === 51, "RC48 cumulative source, cycle, or connection count changed.");
assert(problems.filter(item => item.researchHistory?.length).length === 12 && problems.reduce((sum, item) => sum + (item.researchHistory?.length || 0), 0) === 156, "RC48 research record count changed.");
for (const page of ["index.html", "solve.html", "research-log.html"]) assert(read(page).includes("research-cycle-48-data.js"), `${page} does not load RC48.`);
const publicText = read("research-cycle-48-data.js");
for (const phrase of ["1단계", "2단계", "전공자 포인트", "핵심 아이디어", "아래 시도는 개별 논문", "개수를 맞추지", "문제 수를 맞추", "분량 목표"]) assert(!publicText.includes(phrase), `RC48 contains forbidden wording: ${phrase}`);
assert(read("package.json").includes("verify-rc48-identity-budget-cycle.mjs"), "RC48 verifier is not in npm test.");
console.log("RC48 verified: no public X16 identity ledger; 68 exact anchor-budget results agree independently and L0001 remains sealed.");
