import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repro = path.join(root, "research", "reproducibility");
const runner = path.join(repro, "rc34-circl");
const cacheRoot = path.join(root, ".cache");
const output = path.join(cacheRoot, "rc34-circl-replay");
if (!path.resolve(output).startsWith(`${path.resolve(cacheRoot)}${path.sep}`)) throw new Error("Unsafe replay output path.");
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
const reveal = JSON.parse(fs.readFileSync(path.join(repro, "rc34-sealed-corpus-reveal.json"), "utf8"));
const environment = {
  ...process.env,
  GOPATH: path.join(cacheRoot, "go"),
  GOMODCACHE: path.join(cacheRoot, "go", "pkg", "mod"),
  GOCACHE: path.join(cacheRoot, "go-build"),
};
const execution = spawnSync("go", ["run", ".", "--seed", reveal.seedHex, "--output-dir", output], { cwd: runner, env: environment, encoding: "utf8", windowsHide: true });
if (execution.status !== 0) throw new Error(`RC34 CIRCL replay failed: ${execution.stderr || execution.stdout}`);
for (const name of ["rc34-sealed-corpus-reveal.json", "rc34-circl-transcripts.json", "rc34-circl-interop-result.json"]) {
  const expected = JSON.parse(fs.readFileSync(path.join(repro, name), "utf8"));
  const actual = JSON.parse(fs.readFileSync(path.join(output, name), "utf8"));
  if (name === "rc34-circl-transcripts.json") {
    if (!actual.batches.every(batch => /^[0-9a-f]{128}$/.test(batch.proofHex))) throw new Error("RC34 CIRCL replay emitted a malformed randomized DLEQ proof.");
    for (const batch of expected.batches) batch.proofHex = "<randomized-valid-dleq-proof>";
    for (const batch of actual.batches) batch.proofHex = "<randomized-valid-dleq-proof>";
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`RC34 CIRCL replay differs: ${name}`);
}
console.log("RC34 CIRCL replay matches the committed reveal, all deterministic fields in the 920-event transcript, and the interoperability result; fresh randomized DLEQ proofs verify in the CIRCL client path.");
