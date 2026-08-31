import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = path.resolve(
  root,
  ".cache/rc73-nircam-calibration/mast-calibration-inventory.json"
);
const outputPath = path.resolve(
  root,
  ".cache/rc73-nircam-calibration/mast-program-6605-products.json"
);
const write = process.argv.includes("--write");
const invokeUrl = "https://mast.stsci.edu/api/v0/invoke";

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

function compact(row) {
  return {
    obsid: String(row.obsID ?? row.obsid ?? ""),
    filename: row.productFilename ?? null,
    description: row.description ?? null,
    productType: row.productType ?? null,
    productSubGroupDescription: row.productSubGroupDescription ?? null,
    calibLevel: row.calib_level ?? null,
    size: row.size ?? null,
    dataURI: row.dataURI ?? null
  };
}

function selectedObservation(row) {
  return (
    row.proposal_id === "6605" &&
    row.instrument_name === "NIRCAM/IMAGE" &&
    ["F090W", "F150W"].includes(row.filters) &&
    ["WDFS0122-30", "WFDS0458-56", "WDFS2317-29"].includes(row.target_name)
  );
}

async function main() {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  const observations = inventory.records.filter(selectedObservation);
  const obsids = observations.map(row => row.obsid);
  const payload = await invoke({
    service: "Mast.Caom.Products",
    format: "json",
    pagesize: 50000,
    page: 1,
    params: { obsid: obsids.join(",") }
  });
  const products = (payload.data ?? []).map(compact);
  const calibrated = products.filter(row =>
    ["CAL", "I2D"].includes(row.productSubGroupDescription)
  );
  const result = {
    generatedAt: new Date().toISOString(),
    service: invokeUrl,
    selection: {
      proposal: "6605",
      targets: ["WDFS0122-30", "WFDS0458-56", "WDFS2317-29"],
      filters: ["F090W", "F150W"],
      obsids
    },
    observations,
    productCount: products.length,
    calibratedProductCount: calibrated.length,
    calibratedBytes: calibrated.reduce((sum, row) => sum + Number(row.size ?? 0), 0),
    calibrated
  };
  if (write) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify({
    outputPath,
    write,
    selection: result.selection,
    productCount: result.productCount,
    calibratedProductCount: result.calibratedProductCount,
    calibratedBytes: result.calibratedBytes
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
