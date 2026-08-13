import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/qarr-intervention-identifiability-spec.json"), "utf8"));
const expectedManifest = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/qarr-intervention-open-data-manifest.json"), "utf8"));
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=") || true];
}));
const sha256 = data => crypto.createHash("sha256").update(data).digest("hex");
const round = (value, digits = 9) => Number(value.toFixed(digits));
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

function aggregateAudit() {
  const groups = spec.publishedAggregateInputs.table16;
  const summarize = group => {
    const before = group.asReceived;
    const after = group.ground;
    const beforeHalf = 2 * before.sd / Math.sqrt(before.n);
    const afterHalf = 2 * after.sd / Math.sqrt(after.n);
    const difference = after.mean - before.mean;
    const conservativeHalf = beforeHalf + afterHalf;
    return {
      asReceived95HalfWidth: round(beforeHalf),
      ground95HalfWidth: round(afterHalf),
      groundMinusAsReceived: round(difference),
      relativeReduction: round(1 - after.mean / before.mean),
      conservativeDifferenceInterval: [round(difference - conservativeHalf), round(difference + conservativeHalf)]
    };
  };
  const brindley = summarize(groups.brindley);
  const none = summarize(groups.none);
  const groundCorrectionAbsolute = groups.none.ground.mean - groups.brindley.ground.mean;
  const groundCorrectionRelative = 1 - groups.brindley.ground.mean / groups.none.ground.mean;
  return {
    metric: spec.publishedAggregateInputs.metric,
    uncertaintyRule: spec.publishedAggregateInputs.uncertaintyRule,
    strata: { brindley, none },
    correctionAfterGrinding: {
      absoluteImprovement: round(groundCorrectionAbsolute),
      relativeImprovement: round(groundCorrectionRelative)
    },
    differenceInDifferences: round(brindley.groundMinusAsReceived - none.groundMinusAsReceived),
    participantCollected: {
      brindleyVersusNoneRelativeImprovement: round(1 - 0.11 / 0.20),
      neutronVersusNoneRelativeImprovement: round(1 - 0.031 / 0.20),
      neutronN: 5
    },
    cpdSupplied: { brindleyVersusNoneRelativeImprovement: round(1 - 0.33 / 0.63) }
  };
}

function walk(directory) {
  const rows = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) rows.push(...walk(full));
    else rows.push(full);
  }
  return rows;
}

function vector(file) {
  return fs.readFileSync(file, "utf8").trim().split(/\r?\n/).map(line => Number(line.trim().split(/\s+/)[1]));
}

function totalVariation(left, right) {
  const compared = Math.min(left.length, right.length);
  const leftCommon = left.slice(0, compared);
  const rightCommon = right.slice(0, compared);
  const leftSum = leftCommon.reduce((sum, value) => sum + value, 0);
  const rightSum = rightCommon.reduce((sum, value) => sum + value, 0);
  return leftCommon.reduce((sum, value, index) => sum + Math.abs(value / leftSum - rightCommon[index] / rightSum), 0) / 2;
}

function rawAudit(zipPath) {
  const bytes = fs.readFileSync(zipPath);
  if (bytes.length !== expectedManifest.archive.bytes || sha256(bytes) !== expectedManifest.archive.sha256) throw new Error("Mendeley archive identity differs from manifest");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "qarr-intervention-"));
  try {
    execFileSync("tar", ["-xf", zipPath, "-C", temporary]);
    const files = walk(temporary);
    const inventory = files.map(file => ({
      path: path.relative(temporary, file).replaceAll("\\", "/"),
      bytes: fs.statSync(file).size,
      sha256: sha256(fs.readFileSync(file))
    })).sort((left, right) => left.path.localeCompare(right.path));
    const inventoryDigest = sha256(inventory.map(row => `${row.path}\t${row.bytes}\t${row.sha256}`).join("\n"));
    if (inventory.length !== expectedManifest.archive.memberCount || inventoryDigest !== expectedManifest.archive.inventorySha256) throw new Error("archive inventory differs from manifest");
    const pairs = [];
    for (const label of spec.rawDatasetContract.pairedLabels) {
      const row = { label, graphiteAffected: spec.rawDatasetContract.graphiteAffected.includes(label) };
      for (const [modality, extension] of [["xrpd", ".xye"], ["xrf", ".txt"]]) {
        const left = files.find(file => path.basename(file) === `D1-${label}${extension}`);
        const right = files.find(file => path.basename(file) === `D2-${label}${extension}`);
        if (!left || !right) throw new Error(`missing D1-D2 ${modality} pair for ${label}`);
        row[modality] = {
          points: vector(left).length,
          byteIdentical: sha256(fs.readFileSync(left)) === sha256(fs.readFileSync(right)),
          totalVariation: round(totalVariation(vector(left), vector(right)))
        };
      }
      pairs.push(row);
    }
    const affected = pairs.filter(row => row.graphiteAffected);
    const xrpdMedian = median(affected.map(row => row.xrpd.totalVariation));
    const xrfMedian = median(affected.map(row => row.xrf.totalVariation));
    return {
      archive: expectedManifest.archive,
      pairs,
      summary: {
        graphiteFreeControls: pairs.filter(row => !row.graphiteAffected).length,
        graphiteFreeControlsByteIdenticalBothModalities: pairs.filter(row => !row.graphiteAffected && row.xrpd.byteIdentical && row.xrf.byteIdentical).length,
        graphiteAffectedPairs: affected.length,
        graphiteAffectedXrpdPairsDifferent: affected.filter(row => !row.xrpd.byteIdentical).length,
        medianXrpdTotalVariation: round(xrpdMedian),
        medianXrfTotalVariation: round(xrfMedian),
        medianDistanceRatio: round(xrpdMedian / xrfMedian)
      }
    };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

const zipPath = args.get("--zip");
if (!zipPath || zipPath === true) throw new Error("Pass --zip=<path to the fixed Mendeley version-2 archive>");
const aggregate = aggregateAudit();
const raw = rawAudit(path.resolve(String(zipPath)));
const decisions = {
  H1_grindingDirectionSupportedInPublishedAggregate: Object.values(aggregate.strata).every(row => row.conservativeDifferenceInterval[1] < 0),
  H2_materialBrindleyGainAfterGrinding: aggregate.correctionAfterGrinding.absoluteImprovement >= 0.05 || aggregate.correctionAfterGrinding.relativeImprovement >= 0.30,
  H3_neutronTransportQualified: aggregate.participantCollected.neutronN >= 20,
  H4_pairedCausalGrindingEffectIdentified: false,
  H5_openSameDesignBenchmarkExecutable: raw.summary.graphiteFreeControlsByteIdenticalBothModalities === 3 && raw.summary.graphiteAffectedXrpdPairsDifferent === 7,
  H6_xrpdShapeMoreSensitiveThanXrf: raw.summary.medianDistanceRatio > 2
};
const output = {
  benchmarkId: spec.benchmarkId,
  computedOn: "2026-08-14",
  status: "retrospective-exploratory-audit",
  aggregate,
  raw,
  decisions,
  interpretation: {
    established: "Published aggregate accuracy improves strongly after grinding in both correction strata, and the public D1-D2 archive encodes a complete paired raw-profile contrast.",
    inference: "Particle-size and orientation intervention is a more promising discriminator than adding Brindley correction after grinding, but the available records do not identify a replicate-level causal effect.",
    unverifiedProposal: "Cross D1-D2-style nuisance negatives with matched omitted-phase positives, new specimen replicates, randomized preparation order, and blinded independent adjudication."
  }
};
if (args.has("--emit")) console.log(JSON.stringify(output, null, 2));
else {
  const expected = JSON.parse(fs.readFileSync(path.join(root, "research/reproducibility/qarr-intervention-identifiability-result.json"), "utf8"));
  if (JSON.stringify(output) !== JSON.stringify(expected)) throw new Error("computed intervention result differs from committed artifact");
  console.log("RC25 intervention audit reproduced from the fixed public archive.");
}
