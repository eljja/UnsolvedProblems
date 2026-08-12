import fs from "node:fs";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const source = "research/external-audit/nist-vo2-2020/Human Labels.xlsx";
const output = "research/external-audit/nist-vo2-2020/human-labels.json";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const sheet = workbook.worksheets.getItem("VO2 - Nb2O3 Composition Combivi");
const rows = sheet.getRange("A1:I193").values;
const labels = rows.slice(1).map(row => ({
  measurementId: row[0],
  vanadiumFraction: row[1],
  vanadiumAtomicPercent: row[2],
  temperatureC: row[3],
  labels: { HL3: row[4], HL2: row[5], HL4: row[6], HL1: row[7], HL5: row[8] }
}));
fs.writeFileSync(output, `${JSON.stringify({
  datasetId: "NIST-MDS2-2301",
  sourceFile: "Human Labels.xlsx",
  extraction: "Values-only canonical extraction; original workbook retained unmodified",
  labelCode: { "0": "low-temperature phase", "1": "two-phase region", "2": "high-temperature phase" },
  records: labels
}, null, 2)}\n`);
console.log(`wrote ${output} (${labels.length} records)`);
