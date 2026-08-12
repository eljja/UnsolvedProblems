import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceManifestPath = path.join(root, "research/external-audit/nist-vo2-2020/source-manifest.json");
const outputPath = path.join(root, "research/reproducibility/nist-metadata-fetch-manifest.json");
const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const normalizeHeader = value => value === null ? null : value;
const canonicalize = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

const response = await fetch(sourceManifest.metadataApi, { headers: { Accept: "application/json" } });
const responseBytes = Buffer.from(await response.arrayBuffer());
if (!response.ok) throw new Error(`NIST metadata API returned ${response.status}`);
const payload = JSON.parse(responseBytes.toString("utf8"));
if (payload.ResultCount !== 1 || payload.ResultData?.length !== 1) throw new Error("Expected exactly one NIST metadata record.");
const record = payload.ResultData[0];
const canonicalRecordBytes = Buffer.from(canonicalize(record), "utf8");

const targets = [
  { role: "humanLabels", filepath: "Human Labels.xlsx", expectedUrl: sourceManifest.humanLabelsUrl, expectedSha256: sourceManifest.humanLabelsSha256 },
  { role: "compositionTemperature", filepath: "VO2 - Nb2O3 Composition and temp Combiview.txt", expectedUrl: sourceManifest.compositionTemperatureUrl, expectedSha256: sourceManifest.compositionTemperatureSha256 },
  { role: "rawXrd", filepath: "VO2 -Nb2O3 XRD Combiview.txt", expectedUrl: sourceManifest.rawXrdUrl, expectedSha256: sourceManifest.rawXrdSha256 },
  { role: "readme", filepath: "Readme.txt", expectedUrl: sourceManifest.readmeUrl, expectedSha256: sourceManifest.readmeSha256 }
];

const components = Array.isArray(record.components) ? record.components : [];
const files = [];
for (const target of targets) {
  const component = components.find(item => item.filepath === target.filepath);
  if (!component) throw new Error(`NIST metadata is missing ${target.filepath}`);
  const sidecar = components.find(item => item.describes === component["@id"] && item.filepath === `${target.filepath}.sha256`);
  if (!sidecar?.downloadURL) throw new Error(`NIST metadata is missing checksum sidecar for ${target.filepath}`);
  const checksumResponse = await fetch(sidecar.downloadURL, { headers: { Accept: "text/plain" } });
  if (!checksumResponse.ok) throw new Error(`Checksum sidecar returned ${checksumResponse.status}: ${target.filepath}`);
  const checksumText = (await checksumResponse.text()).trim();
  const officialSha256 = checksumText.match(/[a-f0-9]{64}/i)?.[0]?.toLowerCase();
  if (!officialSha256) throw new Error(`Could not parse checksum for ${target.filepath}`);
  files.push({
    role: target.role,
    filepath: component.filepath,
    mediaType: component.mediaType,
    sizeBytes: component.size,
    downloadUrl: component.downloadURL,
    checksumSidecarUrl: sidecar.downloadURL,
    officialSha256,
    expectedUrlMatchesMetadata: component.downloadURL === target.expectedUrl,
    expectedSha256MatchesSidecar: officialSha256 === target.expectedSha256
  });
}

const snapshot = {
  auditId: "NIST-MDS2-2301-METADATA-SNAPSHOT-0.1",
  retrievedAtUtc: new Date().toISOString(),
  request: { url: sourceManifest.metadataApi, accept: "application/json" },
  response: {
    status: response.status,
    contentType: normalizeHeader(response.headers.get("content-type")),
    date: normalizeHeader(response.headers.get("date")),
    etag: normalizeHeader(response.headers.get("etag")),
    lastModified: normalizeHeader(response.headers.get("last-modified")),
    byteLength: responseBytes.length,
    sha256: sha256(responseBytes)
  },
  record: {
    id: record["@id"],
    ediid: record.ediid,
    doi: record.doi,
    title: record.title,
    version: record.version,
    issued: record.issued,
    modified: record.modified,
    annotated: record.annotated,
    status: record.status,
    landingPage: record.landingPage,
    license: record.license,
    publisher: record.publisher?.name ?? null
  },
  canonicalRecord: {
    byteLength: canonicalRecordBytes.length,
    sha256: sha256(canonicalRecordBytes),
    scope: "ResultData[0], recursively key-sorted; excludes request-specific Metrics.ElapsedTime"
  },
  files,
  gates: {
    recordIdentityMatches: record.ediid === "ark:/88434/mds2-2301" && record.doi === "doi:10.18434/mds2-2301",
    allFourFilesPresent: files.length === 4,
    allUrlsMatch: files.every(file => file.expectedUrlMatchesMetadata),
    allChecksumsMatch: files.every(file => file.expectedSha256MatchesSidecar)
  },
  note: "The API supplies file identity, URL, type, and size; the linked official .sha256 sidecars supply byte checksums. The raw response hash seals this retrieval, while the canonical record hash excludes request-specific Metrics.ElapsedTime and is the stable change-detection key."
};
snapshot.allGatesPass = Object.values(snapshot.gates).every(Boolean);
if (!snapshot.allGatesPass) throw new Error(`NIST metadata audit failed: ${JSON.stringify(snapshot.gates)}`);

if (process.argv.includes("--write")) {
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, outputPath)}`);
} else console.log(JSON.stringify(snapshot, null, 2));

export { snapshot };
