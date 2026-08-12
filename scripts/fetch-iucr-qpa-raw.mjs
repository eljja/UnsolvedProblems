import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const write = args.includes("--write");
const outputDir = path.resolve(valueAfter("--output-dir") || path.join(os.tmpdir(), "unsolved-rc19-rowles-raw"));
const rawDir = path.join(outputDir, "diffraction_data");
const topasDir = path.join(outputDir, "topas_files");
const base = "https://ddfe.curtin.edu.au/NVSW-0044";
const rawBase = `${base}/diffraction_data`;
const topasBase = `${base}/topas_files`;
const samples = ["1a", "1e"];
const intensities = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
const steps = [0.01, 0.02, 0.04, 0.08, 0.16, 0.2, 0.25, 0.32];

fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(topasDir, { recursive: true });

const sha256 = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const intensityCode = value => String(value).padStart(7, "0");
const stepCode = value => value.toFixed(3).replace(".", "-");
const rawName = (sample, intensity, step) => `${sample}_${intensityCode(intensity)}_${stepCode(step)}_n001.xy`;

const fetchBuffer = async (url, target) => {
  if (fs.existsSync(target) && fs.statSync(target).size > 0) {
    return { buffer: fs.readFileSync(target), lastModified: null, reused: true };
  }
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "UnsolvedProblems research audit" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(target, buffer);
      return { buffer, lastModified: response.headers.get("last-modified"), reused: false };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 400 * attempt));
    }
  }
  throw new Error(`Failed to download ${url}: ${lastError?.message || lastError}`);
};

const parseRaw = buffer => {
  const lines = buffer.toString("utf8").trim().split(/\r?\n/);
  const points = lines.map((line, index) => {
    const fields = line.trim().split(/\s+/).map(Number);
    if (fields.length !== 2 || !fields.every(Number.isFinite)) throw new Error(`Invalid XY line ${index + 1}`);
    return fields;
  });
  if (points.length < 2) throw new Error("Raw profile has fewer than two points");
  const differences = [];
  for (let index = 1; index < points.length; index += 1) {
    const difference = points[index][0] - points[index - 1][0];
    if (!(difference > 0)) throw new Error(`Non-increasing angle at line ${index + 1}`);
    differences.push(difference);
  }
  return {
    points: points.length,
    angleStart: points[0][0],
    angleEnd: points.at(-1)[0],
    medianStep: median(differences),
    observedMaximum: Math.max(...points.map(point => point[1])),
    negativeCounts: points.filter(point => point[1] < 0).length
  };
};

const rawContracts = [];
for (const sample of samples) {
  for (const nominalMaximumIntensity of intensities) {
    for (const nominalStepSize of steps) {
      const name = rawName(sample, nominalMaximumIntensity, nominalStepSize);
      rawContracts.push({
        sample,
        nominalMaximumIntensity,
        nominalStepSize,
        name,
        url: `${rawBase}/${name}`,
        target: path.join(rawDir, name)
      });
    }
  }
}

const rawFiles = [];
let cursor = 0;
const workers = Array.from({ length: 8 }, async () => {
  while (cursor < rawContracts.length) {
    const contract = rawContracts[cursor];
    cursor += 1;
    const downloaded = await fetchBuffer(contract.url, contract.target);
    rawFiles.push({
      name: contract.name,
      url: contract.url,
      sample: contract.sample,
      nominalMaximumIntensity: contract.nominalMaximumIntensity,
      nominalStepSize: contract.nominalStepSize,
      bytes: downloaded.buffer.length,
      sha256: sha256(downloaded.buffer),
      ...parseRaw(downloaded.buffer),
      serverLastModified: downloaded.lastModified
    });
  }
});
await Promise.all(workers);
rawFiles.sort((a, b) => a.name.localeCompare(b.name));

const lineageNames = [
  "robustness2_1a_1.INP", "robustness2_1a_2.INP", "robustness2_1a_3.INP", "robustness2_1a_4.INP",
  "robustness2_1e_1.INP", "robustness2_1e_2.INP", "robustness2_1e_3.INP", "robustness2_1e_4.INP",
  "row119.inc"
];
const lineageFiles = [];
for (const name of lineageNames) {
  const url = `${topasBase}/${name}`;
  const downloaded = await fetchBuffer(url, path.join(topasDir, name));
  lineageFiles.push({ name, url, bytes: downloaded.buffer.length, sha256: sha256(downloaded.buffer), serverLastModified: downloaded.lastModified });
}

const readmes = [];
for (const item of [
  { name: "dataset-readme.txt", url: `${base}/readme.txt`, target: path.join(outputDir, "dataset-readme.txt") },
  { name: "raw-readme.txt", url: `${rawBase}/readme.txt`, target: path.join(outputDir, "raw-readme.txt") }
]) {
  const downloaded = await fetchBuffer(item.url, item.target);
  readmes.push({ name: item.name, url: item.url, bytes: downloaded.buffer.length, sha256: sha256(downloaded.buffer), serverLastModified: downloaded.lastModified });
}

const serverTimestamps = [...new Set([...rawFiles, ...lineageFiles, ...readmes].map(file => file.serverLastModified).filter(Boolean))];
const manifest = {
  manifestId: "IUCR-QPA-RAW-LINEAGE-0.1",
  reviewedOn: "2026-08-12",
  licence: "CC BY 4.0 as stated in the official dataset readme",
  source: {
    datasetDoi: "10.25917/nvsw-0044",
    root: `${base}/`,
    rawDirectory: `${rawBase}/`,
    topasDirectory: `${topasBase}/`
  },
  collectionDates: "2019-12-19 through 2020-05-25",
  publicationDate: "2020-11",
  serverTimestampCaveat: "Server Last-Modified values observed in 2026 identify the current hosted copies, not the dates of data collection, analysis, or publication.",
  observedServerLastModifiedValues: serverTimestamps,
  expectedGrid: { samples: samples.length, nominalMaximumIntensities: intensities.length, nominalStepSizes: steps.length, rawFiles: rawContracts.length },
  verified: {
    rawFiles: rawFiles.length,
    totalRawBytes: rawFiles.reduce((sum, file) => sum + file.bytes, 0),
    allProfilesTwoColumnAndMonotone: rawFiles.every(file => file.points > 1 && file.negativeCounts === 0),
    angleStartRange: [Math.min(...rawFiles.map(file => file.angleStart)), Math.max(...rawFiles.map(file => file.angleStart))],
    angleEndRange: [Math.min(...rawFiles.map(file => file.angleEnd)), Math.max(...rawFiles.map(file => file.angleEnd))]
  },
  readmes,
  lineageFiles,
  rawFiles,
  parentChildRule: {
    rawToRefinement: "A raw filename sample_maxint_stepsize_n001.xy maps to the TOPAS input robustness2_sample_reftype.INP and to summary rows with the same sample, maxintfactor, and stepsizefactor. HAL is a truncation applied inside the refinement input, so one raw profile has seven HAL children for each of four refinement types.",
    refinementToSummary: "robustness2_sample_reftype.INP maps to output2R_sample_reftype_summarised.csv in the official IUCr supplement.",
    multiplicity: "Each of 208 raw profiles has 7 HAL x 4 refinement-type summary children, yielding 5,824 joined rows."
  },
  redistribution: "The 208 source profiles and TOPAS inputs are not copied into this repository. Reproduction downloads the official files, verifies this manifest, and passes the local source directories to the analysis scripts."
};

if (write) {
  fs.writeFileSync(path.join(root, "research/reproducibility/iucr-qpa-raw-source-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(JSON.stringify({ outputDir, rawFiles: rawFiles.length, totalRawBytes: manifest.verified.totalRawBytes, manifest: write ? "written" : "not written" }, null, 2));
