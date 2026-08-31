import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputIndex = process.argv.indexOf("--download-dir");
const downloadDir = path.resolve(root, outputIndex >= 0 ? process.argv[outputIndex + 1] : ".cache/rc67-mast");
const write = process.argv.includes("--write");
fs.mkdirSync(downloadDir, { recursive: true });

const invokeUrl = "https://mast.stsci.edu/api/v0/invoke";
const doi = "10.17909/96p0-6z78";
const productNames = {
  f090w: "jw02875-o012_t009_nircam_clear-f090w_cat.ecsv",
  f150w: "jw02875-o012_t009_nircam_clear-f150w_cat.ecsv"
};

async function fetchChecked(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
}

async function invoke(request) {
  const body = new URLSearchParams({ request: JSON.stringify(request) });
  const response = await fetchChecked(invokeUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  return response.text();
}

function parseExtJs(text) {
  return JSON.parse(text.replace(/\bNaN\b/g, "null"));
}

function parseJson(text) {
  const value = JSON.parse(text);
  if (value.status && value.status !== "COMPLETE") throw new Error(`MAST request failed: ${value.status}`);
  return value;
}

function rows(payload) {
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.Rows)) return payload.Rows;
  if (Array.isArray(payload.data?.Tables?.[0]?.Rows)) return payload.data.Tables[0].Rows;
  return [];
}

function productUri(row) {
  return row.dataURI ?? row.dataUri ?? row.uri ?? row.data_uri;
}

async function main() {
  const dataciteText = await (await fetchChecked(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`)).text();
  const doiText = await invoke({
    service: "Mast.DOI.Caom",
    format: "extjs",
    pagesize: 5000,
    timeout: 30,
    removenullcolumns: false,
    data: null,
    params: { input: doi, obsid: doi, timestamp: 1788134400000 },
    clearcache: false,
    columnsconfigid: "Mast.Caom.Cone"
  });
  const doiPayload = parseExtJs(doiText);

  const ngc3447Text = await invoke({
    service: "Mast.Caom.Filtered",
    format: "json",
    pagesize: 2000,
    page: 1,
    params: {
      columns: "*",
      filters: [
        { paramName: "proposal_id", values: ["2875"] },
        { paramName: "obs_collection", values: ["JWST"] },
        { paramName: "target_name", values: ["NGC-3447"] }
      ]
    }
  });
  const ngc3447Payload = parseJson(ngc3447Text);
  const observations = rows(ngc3447Payload);
  const obsids = observations.map(row => row.obsid ?? row.obs_id).filter(Boolean);
  if (obsids.length !== 6) throw new Error(`Expected six NGC-3447 observation rows, found ${obsids.length}`);

  const productText = await invoke({
    service: "Mast.Caom.Products",
    format: "json",
    pagesize: 5000,
    page: 1,
    params: { obsid: obsids.join(",") }
  });
  const productPayload = parseJson(productText);
  const products = rows(productPayload);

  const written = [];
  const save = (name, content) => {
    if (write) fs.writeFileSync(path.join(downloadDir, name), content);
    written.push({ name, bytes: Buffer.byteLength(content) });
  };
  save("datacite-doi.json", `${JSON.stringify(JSON.parse(dataciteText), null, 2)}\n`);
  save("mast-doi-caom.json", `${JSON.stringify(doiPayload, null, 2)}\n`);
  save("mast-ngc3447-observations.json", `${JSON.stringify(ngc3447Payload, null, 2)}\n`);
  save("mast-ngc3447-products.json", `${JSON.stringify(productPayload, null, 2)}\n`);

  for (const [band, fileName] of Object.entries(productNames)) {
    const candidates = products.filter(row => String(row.productFilename ?? row.product_filename ?? "") === fileName);
    if (candidates.length !== 1) throw new Error(`${band}: expected one ${fileName}, found ${candidates.length}`);
    const uri = productUri(candidates[0]);
    if (!uri) throw new Error(`${band}: product has no MAST data URI`);
    const url = uri.startsWith("mast:")
      ? `https://mast.stsci.edu/api/v0.1/Download/file?uri=${encodeURIComponent(uri)}`
      : uri;
    const buffer = Buffer.from(await (await fetchChecked(url)).arrayBuffer());
    if (write) fs.writeFileSync(path.join(downloadDir, `${band}_cat.ecsv`), buffer);
    written.push({ name: `${band}_cat.ecsv`, bytes: buffer.length, dataUri: uri });
  }

  console.log(JSON.stringify({ doiRows: rows(doiPayload).length, observationRows: observations.length, productRows: products.length, written }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
