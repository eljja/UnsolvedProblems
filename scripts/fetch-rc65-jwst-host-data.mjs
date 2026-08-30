import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const outputIndex = process.argv.indexOf("--download-dir");
const outputDir = path.resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : ".cache/rc65-jwst-host-source");
const writeManifest = process.argv.includes("--write");

const sources = [
  {
    id: "riess-perfect-host-2025-table1-vor",
    url: "https://iopscience.iop.org/2041-8205/992/2/L34/suppdata/apjlae0ad6t1_ascii.txt?doi=10.3847/2041-8213/ae0ad6",
    file: "apjlae0ad6t1_ascii.txt",
    publishedOn: "2025-10-17",
    role: "version-of-record NGC 3447 distance-summary table"
  },
  {
    id: "riess-perfect-host-2025-table-a1-vor",
    url: "https://iopscience.iop.org/2041-8205/992/2/L34/suppdata/apjlae0ad6t2_ascii.txt?doi=10.3847/2041-8213/ae0ad6",
    file: "apjlae0ad6t2_ascii.txt",
    publishedOn: "2025-10-17",
    role: "version-of-record host-level HST-JWST distance table"
  },
  {
    id: "riess-perfect-host-2025-table-a2-vor",
    url: "https://content.cld.iop.org/journals/2041-8205/992/2/L34/revision1/apjlae0ad6t3_mrt.txt",
    file: "apjlae0ad6t3_mrt.txt",
    publishedOn: "2025-10-17",
    role: "version-of-record machine-readable NGC 3447 Cepheid photometry"
  },
  {
    id: "riess-perfect-host-2025-html-v1",
    url: "https://arxiv.org/html/2509.01667v1",
    file: "2509.01667v1.html",
    publishedOn: "2025-09-01",
    role: "latest host-level HST-JWST comparison and NGC 3447 differential control"
  },
  {
    id: "riess-crowding-2024-html-v1",
    url: "https://arxiv.org/html/2401.04773v1",
    file: "2401.04773v1.html",
    publishedOn: "2024-01-09",
    role: "earlier five-host F150W comparison used for named rows not repeated numerically in 2025"
  }
];

await fs.mkdir(outputDir, { recursive: true });
const files = [];

for (const source of sources) {
  const response = await fetch(source.url, { headers: { "user-agent": "UnsolvedProblems research audit (contact via repository)" } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${source.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const target = path.join(outputDir, source.file);
  await fs.writeFile(target, bytes);
  files.push({
    ...source,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex")
  });
}

const manifest = {
  cycleId: "RC-2026-65",
  fetchedOn: new Date().toISOString(),
  sourcePolicy: "Version-of-record IOP/AAS machine-readable tables are primary. Versioned arXiv HTML is retained to freeze narrative methods and the earlier five-host table.",
  files,
  totalBytes: files.reduce((sum, item) => sum + item.bytes, 0)
};

if (writeManifest) {
  await fs.writeFile("research/reproducibility/rc65-jwst-host-source-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(JSON.stringify(manifest, null, 2));
