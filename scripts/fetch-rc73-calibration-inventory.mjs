import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputIndex = process.argv.indexOf("--output");
const outputPath = path.resolve(
  root,
  outputIndex >= 0
    ? process.argv[outputIndex + 1]
    : ".cache/rc73-nircam-calibration/mast-calibration-inventory.json"
);
const write = process.argv.includes("--write");
const invokeUrl = "https://mast.stsci.edu/api/v0/invoke";
const proposalIds = [
  "1536", "1537", "1538",
  "4496", "4497", "4498",
  "6604", "6605", "6606",
  "7487", "7565", "7615"
];

async function invoke(request) {
  const response = await fetch(invokeUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ request: JSON.stringify(request) })
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const payload = JSON.parse(await response.text());
  if (payload.status && payload.status !== "COMPLETE") {
    throw new Error(`MAST request failed: ${payload.status}`);
  }
  return payload;
}

function rows(payload) {
  return Array.isArray(payload.data) ? payload.data : [];
}

function scalar(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function compact(row) {
  return {
    obsid: scalar(row.obsid),
    obs_id: scalar(row.obs_id),
    proposal_id: scalar(row.proposal_id),
    target_name: scalar(row.target_name),
    instrument_name: scalar(row.instrument_name),
    filters: scalar(row.filters),
    calib_level: row.calib_level,
    dataRights: scalar(row.dataRights),
    t_min: row.t_min,
    t_max: row.t_max,
    s_ra: row.s_ra,
    s_dec: row.s_dec,
    intentType: scalar(row.intentType),
    obs_title: scalar(row.obs_title)
  };
}

function groupCounts(records, key) {
  const counts = new Map();
  for (const row of records) {
    const value = row[key] ?? "<null>";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

async function main() {
  const payload = await invoke({
    service: "Mast.Caom.Filtered",
    format: "json",
    pagesize: 20000,
    page: 1,
    params: {
      columns: "*",
      filters: [
        { paramName: "proposal_id", values: proposalIds },
        { paramName: "obs_collection", values: ["JWST"] }
      ]
    }
  });
  const records = rows(payload).map(compact);
  const result = {
    generatedAt: new Date().toISOString(),
    service: invokeUrl,
    proposalIds,
    rowCount: records.length,
    publicRows: records.filter(row => row.dataRights === "PUBLIC").length,
    counts: {
      proposal: groupCounts(records, "proposal_id"),
      target: groupCounts(records, "target_name"),
      instrument: groupCounts(records, "instrument_name"),
      filterPair: groupCounts(records, "filters")
    },
    records
  };
  if (write) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify({ outputPath, write, ...result, records: undefined }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
