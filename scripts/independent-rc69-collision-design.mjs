import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const repro = path.join(root, "research", "reproducibility");
const cache = path.join(root, ".cache", "rc69-phost-ast", "cal");
const write = process.argv.includes("--write");
const input = (name) => path.join(repro, name);
const readJson = (name) => JSON.parse(fs.readFileSync(input(name), "utf8"));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const close = (a, b, tolerance = 1e-6) => Math.abs(Number(a) - Number(b)) <= tolerance;
const countBy = (rows, key) => rows.reduce((out, row) => {
  const value = typeof key === "function" ? key(row) : row[key];
  out[value] = (out[value] || 0) + 1;
  return out;
}, {});
const sha256 = (filename) => new Promise((resolve, reject) => {
  const hash = crypto.createHash("sha256");
  fs.createReadStream(filename).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolve(hash.digest("hex")));
});

function parseCsv(filename) {
  const lines = fs.readFileSync(filename, "utf8").trim().split(/\r?\n/);
  const header = lines.shift().split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [header[index], value])));
}

function parseParam(filename) {
  const out = new Map();
  for (const raw of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const pos = line.indexOf("=");
    assert(pos > 0, `Unparseable parameter line: ${raw}`);
    out.set(line.slice(0, pos).trim(), line.slice(pos + 1).trim());
  }
  return out;
}

const source = readJson("rc69-phost-cal-source-manifest.json");
const design = readJson("rc69-collision-environment-manifest.json");
const rows = parseCsv(input("rc69-collision-injection-manifest.csv"));
const fakeLines = fs.readFileSync(input("rc69-collision-dolphot-input.txt"), "utf8").trim().split(/\r?\n/).map((line) => line.trim().split(/\s+/).map(Number));
const params = parseParam(input("rc69-dolphot-reference.param"));

assert(source.cycleId === "RC-2026-69" && design.cycleId === "RC-2026-69", "Cycle identifiers diverge");
assert(source.exposureCount === 32 && source.exposureFiles.length === 32, "Expected exactly 32 CAL exposures");
assert(source.totalExposureBytes === source.exposureFiles.reduce((sum, file) => sum + file.archiveBytes, 0), "Exposure-byte total is inconsistent");
assert(JSON.stringify(countBy(source.exposureFiles, "band")) === JSON.stringify({ F090W: 16, F150W: 16 }), "Band counts are not 16 + 16");

const exposureCells = countBy(source.exposureFiles, (file) => `${file.band}|${file.dither}|${file.detector}`);
assert(Object.keys(exposureCells).length === 32 && Object.values(exposureCells).every((count) => count === 1), "Band/dither/detector grid is not complete and unique");
for (const file of source.exposureFiles) {
  assert(file.archiveBytes === 117573120 && file.expectedBytes === file.archiveBytes, `Unexpected byte count: ${file.filename}`);
  assert(file.header.TELESCOP === "JWST" && file.header.INSTRUME === "NIRCAM", `Wrong instrument lineage: ${file.filename}`);
  assert(file.header.DETECTOR === file.detector && file.header.FILTER === file.band, `Header/manifest mismatch: ${file.filename}`);
  assert(file.header.PROGRAM === "02875" && file.header.OBSERVTN === "012" && file.header.VISIT === "001", `Wrong observation lineage: ${file.filename}`);
  assert(file.header.CAL_VER === "2.0.1" && file.header.CRDS_CTX === "jwst_1535.pmap", `Mixed calibration lineage: ${file.filename}`);
}

assert(design.environmentCount === 48 && design.environments.length === 48, "Environment count is not 48");
assert(design.injectionCountPerEnvironment === 64 && rows.length === 3072, "Injection ledger is not 48 x 64");
assert(new Set(rows.map((row) => row.injectionId)).size === rows.length, "Injection IDs are not unique");
assert(fakeLines.length === rows.length, "DOLPHOT input row count differs from the CSV ledger");

const environmentRows = new Map();
for (const row of rows) {
  if (!environmentRows.has(row.authorId)) environmentRows.set(row.authorId, []);
  environmentRows.get(row.authorId).push(row);
  assert((Number(row.authorId) % 2 === 0 ? "development" : "validation") === row.split, `Parity split mismatch: ${row.injectionId}`);
  assert(Number(row.offsetIndex) >= 1 && Number(row.offsetIndex) <= 8, `Offset index outside 1..8: ${row.injectionId}`);
  assert(Number(row.drawIndex) >= 1 && Number(row.drawIndex) <= 8, `Draw index outside 1..8: ${row.injectionId}`);
  assert(close(Number(row.inputF090WVegaMag) - Number(row.inputF150WVegaMag), Number(row.inputF090WMinusF150WMag), 1e-10), `Colour arithmetic mismatch: ${row.injectionId}`);
}
assert(environmentRows.size === 48 && [...environmentRows.values()].every((group) => group.length === 64), "Each environment must contribute exactly 64 rows");

for (let index = 0; index < rows.length; index += 1) {
  const row = rows[index];
  const line = fakeLines[index];
  assert(line.length === 6 && line[0] === 1 && line[1] === 1, `Malformed DOLPHOT row ${index + 1}`);
  assert(close(line[2], row.referenceX) && close(line[3], row.referenceY), `Position mismatch in DOLPHOT row ${index + 1}`);
  assert(close(line[4], row.inputF090WVegaMag) && close(line[5], row.inputF150WVegaMag), `Magnitude mismatch in DOLPHOT row ${index + 1}`);
}

const expectedStates = { blank: 1024, isolated: 1024, "large-collision": 1024 };
assert(JSON.stringify(countBy(rows, "collisionState")) === JSON.stringify(expectedStates), "Collision states are not balanced 1024/1024/1024");
assert(JSON.stringify(countBy(rows, "topologyRule")) === JSON.stringify({
  "unsegmented-local-field": 1024,
  "adjacent-to-single-label": 1024,
  "inside-original-collision-label": 1024
}), "Topology rules are not balanced");

for (const env of design.environments) {
  assert(env.offsetCandidateCount >= 8 && env.offsets.length === 8, `Insufficient sealed offsets for ${env.authorId}`);
  const observed = environmentRows.get(String(env.authorId));
  assert(observed && new Set(observed.map((row) => row.offsetIndex)).size === 8 && new Set(observed.map((row) => row.drawIndex)).size === 8, `Incomplete 8 x 8 grid for ${env.authorId}`);
  for (const offset of env.offsets) {
    assert(offset.radiusPixels >= 4 && offset.radiusPixels <= 12, `Core-exclusion breach for ${env.authorId}`);
    if (env.collisionState === "blank") assert(offset.candidateLabel === 0 && offset.segmentedFraction5x5 <= 0.04 + 1e-12, `Blank topology breach for ${env.authorId}`);
    if (env.collisionState === "isolated") assert(offset.candidateLabel === 0 && offset.segmentedFraction5x5 <= 0.24 + 1e-12, `Isolated topology breach for ${env.authorId}`);
    if (env.collisionState === "large-collision") assert(offset.candidateLabel === env.centerLabel && offset.sameLabelFraction5x5 >= 0.60 - 1e-12, `Collision topology breach for ${env.authorId}`);
  }
}

assert(params.get("Nimg") === "32" && params.get("img0_file") === "f150w_i2d", "Reference image declaration is wrong");
for (let index = 0; index < 32; index += 1) {
  assert(params.get(`img${index + 1}_file`) === source.exposureFiles[index].filename.replace(/\.fits$/, ""), `Parameter/source mismatch at image ${index + 1}`);
}
assert(params.get("img_RSky2") === "3 10" && params.get("img_apsky") === "20 35", "DOLPHOT 3.0 image-wide sky/aperture parameters are not explicit");
assert(params.get("UseWCS") === "2" && params.get("FitSky") === "2" && params.get("SkipSky") === "1", "Frozen WCS/sky mode changed");

const cacheChecks = [];
for (const file of source.exposureFiles) {
  const local = path.join(cache, file.filename);
  const exists = fs.existsSync(local);
  const bytes = exists ? fs.statSync(local).size : null;
  const digest = exists ? await sha256(local) : null;
  cacheChecks.push({ filename: file.filename, exists, bytes, sha256: digest, verified: exists && bytes === file.archiveBytes && digest === file.sha256 });
}
assert(cacheChecks.every((entry) => entry.verified), "One or more local CAL products fail byte/hash verification");

const result = {
  cycleId: "RC-2026-69",
  auditedOn: "2026-09-01",
  implementation: "dependency-free Node.js audit independent of the Python sampling implementation",
  verdict: "pass",
  verified: {
    exposureGrid: { files: 32, cells: 32, bands: source.bands, totalBytes: source.totalExposureBytes, allSha256Match: true, calibrationContext: "jwst_1535.pmap" },
    intervention: { environments: 48, injections: 3072, collisionStates: countBy(rows, "collisionState"), topologyRules: countBy(rows, "topologyRule"), uniqueInjectionIds: rows.length },
    frozenInterface: { dolphotRows: fakeLines.length, csvRows: rows.length, parameterImages: 32, parameterNamesAcceptedByDolphot30: ["img_RSky2", "img_apsky"] }
  },
  supportBoundary: design.supportBoundary,
  claimBoundary: "This audit proves archive identity, design balance, topology-rule compliance, and a row-exact DOLPHOT interface. It does not prove recovery, photometric accuracy, pipeline independence, or a distance-ladder result."
};

if (write) fs.writeFileSync(input("rc69-collision-design-node-audit.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
