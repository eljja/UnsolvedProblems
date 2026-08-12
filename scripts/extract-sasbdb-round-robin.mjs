import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const sourceRoot = valueAfter("--source-root");
const archiveRoot = valueAfter("--archive-root");
const shouldWrite = args.includes("--write");
if (!sourceRoot || !archiveRoot) {
  throw new Error("Usage: node scripts/extract-sasbdb-round-robin.mjs --source-root <expanded-root> --archive-root <zip-root> [--write]");
}

const reviewedOn = "2026-08-12";
const entries = [
  { id: "SASDPP4", protein: "RNase A", rgAngstrom: 15 },
  { id: "SASDPQ4", protein: "Urate oxidase", rgAngstrom: 32 },
  { id: "SASDPR4", protein: "Xylose isomerase", rgAngstrom: 33 },
  { id: "SASDPS4", protein: "Xylanase", rgAngstrom: 16 },
  { id: "SASDPT4", protein: "Lysozyme", rgAngstrom: 15 }
];
const facilities = {
  X1: "Advanced Light Source - SIBYLS",
  X2: "Advanced Photon Source - 12-ID-B",
  X3: "Advanced Photon Source - BioCAT",
  X4: "Australian Synchrotron - SAXS/WAXS",
  X5: "Cornell High Energy Synchrotron Source - ID7a",
  X6: "Diamond Light Source - B21",
  X7: "NIST/IBBR - SAXSLab Ganesha",
  X8a: "PETRA III - P12 BioSAXS SAXS configuration",
  X8b: "PETRA III - P12 BioSAXS WAXS configuration",
  X9: "Shanghai Synchrotron Radiation Facility - BL19U2",
  X10: "SOLEIL - SWING",
  X11: "SPring-8 - BL40B2",
  X12: "Stanford Synchrotron Radiation Laboratory - BL4-2 BioSAXS"
};
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const fullPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(fullPath) : [fullPath];
});
const locateOne = (files, predicate, label) => {
  const matches = files.filter(predicate);
  if (matches.length !== 1) throw new Error(`${label}: expected one file, found ${matches.length}`);
  return matches[0];
};
const parseCurve = file => fs.readFileSync(file, "utf8").split(/\r?\n/).map(line => line.trim().split(/\s+/).map(Number))
  .filter(values => values.length >= 3 && values.slice(0, 3).every(Number.isFinite) && values[0] >= 0 && values[1] > 0 && values[2] >= 0)
  .map(([q, intensity, sigma]) => ({ q: Number(q.toFixed(6)), intensity, sigma }));
const relative = file => path.relative(sourceRoot, file).split(path.sep).join("/");

const archiveManifest = [];
const snapshotProteins = [];
for (const entry of entries) {
  const expandedEntry = path.join(sourceRoot, entry.id);
  const files = walk(expandedEntry);
  const archive = path.join(archiveRoot, `${entry.id}.zip`);
  if (!fs.existsSync(archive)) throw new Error(`${entry.id}: source archive missing`);
  const dataDirectoryMarker = `${path.sep}Datcombine inputs and outputs${path.sep}Data in${path.sep}`;
  const inputFiles = files.filter(file => file.includes(dataDirectoryMarker) && file.toLowerCase().endsWith(".dat"));
  const profileRows = inputFiles.map(file => {
    const name = path.basename(file);
    const facility = name.match(/X(\d+[ab]?)/i)?.[0];
    if (!facility || !facilities[facility]) throw new Error(`${entry.id}/${name}: unresolved facility`);
    const includesSec = /_SS|_SSpv|-SS/i.test(name);
    const includesBatch = /_B\d|-B\d/i.test(name);
    const curve = parseCurve(file);
    return {
      file: relative(file),
      sha256: sha256(file),
      bytes: fs.statSync(file).size,
      rows: curve.length,
      qMin: Math.min(...curve.map(row => row.q)),
      qMax: Math.max(...curve.map(row => row.q)),
      facility,
      facilityName: facilities[facility],
      mode: includesSec && includesBatch ? "merged-sec-batch" : includesSec ? "sec-only" : includesBatch ? "batch-only" : "unclassified",
      solvent: /D2O/i.test(name) ? "D2O" : /H2O/i.test(name) ? "H2O" : "unspecified"
    };
  });
  const variantFolders = {
    noFilter: ["Filters disabled", "-NoF.dat"],
    outlier: ["Outlier filter", "-O.dat"],
    error: ["Error filter", "-E.dat"],
    outlierError: ["Outlier-error filters", "-OE.dat"]
  };
  const variants = {};
  for (const [key, [folder, suffix]] of Object.entries(variantFolders)) {
    const marker = `${path.sep}Datcombine inputs and outputs${path.sep}${folder}${path.sep}`;
    const file = locateOne(files, candidate => candidate.includes(marker) && candidate.endsWith(suffix), `${entry.id}/${key}`);
    variants[key] = { file, curve: parseCurve(file) };
  }
  const maps = Object.fromEntries(Object.entries(variants).map(([key, value]) => [key, new Map(value.curve.map(row => [row.q, row]))]));
  const commonQ = [...maps.outlierError.keys()].filter(q => q > 0 && q <= 0.3 && Object.values(maps).every(map => map.has(q)));
  const folderPdf = locateOne(files, file => path.basename(file) === "SAXS folder contents.pdf", `${entry.id}/folder PDF`);
  const originalMarker = `${path.sep}Original files pre any merging${path.sep}`;
  const originalDataFiles = files.filter(file => file.includes(originalMarker) && file.toLowerCase().endsWith(".dat"));
  const pOfRMarker = `${path.sep}Solvent subtracted data with P(r) calculations${path.sep}`;
  const pOfROutputs = files.filter(file => file.includes(pOfRMarker) && file.toLowerCase().endsWith(".out"));
  archiveManifest.push({
    id: entry.id,
    protein: entry.protein,
    landingPage: `https://www.sasbdb.org/data/${entry.id}/`,
    archiveUrl: `https://www.sasbdb.org/media/zip_directories/${entry.id}.zip`,
    archiveBytes: fs.statSync(archive).size,
    archiveSha256: sha256(archive),
    folderGuideSha256: sha256(folderPdf),
    consensusInputProfiles: profileRows.length,
    originalPreMergeDatFiles: originalDataFiles.length,
    pOfRResultFiles: pOfROutputs.length,
    facilities: [...new Set(profileRows.map(row => row.facility))].sort(),
    modes: Object.fromEntries(["sec-only", "batch-only", "merged-sec-batch", "unclassified"].map(mode => [mode, profileRows.filter(row => row.mode === mode).length])),
    inputProfiles: profileRows
  });
  snapshotProteins.push({
    id: entry.id,
    protein: entry.protein,
    consensusRgAngstrom: entry.rgAngstrom,
    sourceArchiveSha256: sha256(archive),
    variantFiles: Object.fromEntries(Object.entries(variants).map(([key, value]) => [key, relative(value.file)])),
    rows: commonQ.map(q => ({
      q,
      noFilter: maps.noFilter.get(q).intensity,
      outlier: maps.outlier.get(q).intensity,
      error: maps.error.get(q).intensity,
      outlierError: maps.outlierError.get(q).intensity,
      outlierErrorSigma: maps.outlierError.get(q).sigma
    }))
  });
}

const allProfiles = archiveManifest.flatMap(entry => entry.inputProfiles.map(profile => ({ ...profile, protein: entry.protein })));
const configurationCodes = [...new Set(allProfiles.map(profile => profile.facility))].sort();
const physicalInstruments = [...new Set(configurationCodes.map(code => code.replace(/[ab]$/, "")))].sort();
const singleModeConfigurations = configurationCodes.filter(code => new Set(allProfiles.filter(profile => profile.facility === code).map(profile => profile.mode)).size === 1);
const manifest = {
  auditId: "SASBDB-ROUND-ROBIN-RAW-LINEAGE-0.1",
  reviewedOn,
  project: {
    id: 1742,
    url: "https://www.sasbdb.org/project/1742/",
    publicationDoi: "10.1107/S2059798322009184",
    repositoryPolicy: "Data and models are free of copyright restrictions for commercial and non-commercial use; attribution to original authors is requested.",
    repositoryPolicyUrl: "https://www.sasbdb.org/aboutSASBDB/"
  },
  totals: {
    proteins: archiveManifest.length,
    consensusInputProfiles: allProfiles.length,
    physicalInstruments: physicalInstruments.length,
    instrumentConfigurations: configurationCodes.length,
    secOnly: allProfiles.filter(profile => profile.mode === "sec-only").length,
    batchOnly: allProfiles.filter(profile => profile.mode === "batch-only").length,
    mergedSecBatch: allProfiles.filter(profile => profile.mode === "merged-sec-batch").length,
    singleModeInstrumentConfigurations: singleModeConfigurations.length
  },
  designAudit: {
    allFacilityCodesResolved: allProfiles.every(profile => facilities[profile.facility]),
    exactConsensusInputsAvailable: true,
    fourOfficialFilterVariantsAvailable: true,
    instrumentAndPreparationFullyCrossed: false,
    varianceComponentsSeparatelyIdentifiable: false,
    reasons: [
      "Nineteen consensus inputs merge SEC-SAXS and batch-SAXS before final combination.",
      "Eight of thirteen instrument configurations occur in only one input-mode category.",
      "Protein coverage is unbalanced, from four to fourteen consensus inputs, and most facility-protein cells have one profile."
    ]
  },
  archives: archiveManifest,
  findings: {
    officialArchivesAreHashSealed: archiveManifest.every(entry => /^[0-9a-f]{64}$/.test(entry.archiveSha256)),
    exactConsensusInputsArePublic: allProfiles.length === 48,
    everyInputHasInstrumentLineage: allProfiles.every(profile => profile.facility),
    filterSensitivityCanBeRecomputed: snapshotProteins.every(entry => entry.rows.length > 0),
    fullVarianceDecompositionIsNotIdentified: true
  }
};
const snapshot = {
  datasetId: "SASBDB-ROUND-ROBIN-FILTER-SNAPSHOT-0.1",
  reviewedOn,
  sourceAuditId: manifest.auditId,
  restriction: "Contains q <= 0.3 A^-1 values from the four consensus variants distributed in the official archives. It is a sensitivity snapshot, not a new consensus curve or independent experiment.",
  proteins: snapshotProteins
};

const outputs = [
  ["research/reproducibility/sasbdb-raw-source-manifest.json", manifest],
  ["research/reproducibility/sasbdb-filter-input.json", snapshot]
];
if (shouldWrite) {
  for (const [relativePath, value] of outputs) {
    const output = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`);
    console.log(`wrote ${relativePath}`);
  }
} else {
  console.log(JSON.stringify({ auditId: manifest.auditId, totals: manifest.totals, rows: snapshotProteins.map(entry => [entry.id, entry.rows.length]) }, null, 2));
}
