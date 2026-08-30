import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const commit = "c06da1a2f28761d9149d8aeedf3ebfd3e1967312";
const files = ["Table1.dat", "Table2.dat"];
const argValue = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const downloadDir = path.resolve(root, argValue("--download-dir") || ".cache/rc64-smc-source");
const write = process.argv.includes("--write");

fs.mkdirSync(downloadDir, { recursive: true });
const manifest = {
  cycleId: "RC-2026-64",
  frozenOn: "2026-08-31",
  repository: "https://github.com/lbreuval/SMC_Cepheids_HST",
  commit,
  files: []
};

for (const name of files) {
  const url = `https://raw.githubusercontent.com/lbreuval/SMC_Cepheids_HST/${commit}/${name}`;
  const response = await fetch(url, { headers: { "user-agent": "UnsolvedProblems-RC64" } });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const localPath = path.join(downloadDir, name);
  fs.writeFileSync(localPath, bytes);
  manifest.files.push({
    name,
    url,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex")
  });
}

manifest.totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
if (write) {
  const output = path.join(root, "research/reproducibility/rc64-smc-source-manifest.json");
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(JSON.stringify(manifest, null, 2));
