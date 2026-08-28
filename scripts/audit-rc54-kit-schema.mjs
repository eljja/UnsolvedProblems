#!/usr/bin/env node

/**
 * Audit the KIT HG2 configuration archive for RC54 without opening any outcome
 * archive. The input directory must contain the expanded official cfg.zip.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(
  ROOT,
  "research",
  "reproducibility",
  "rc54-kit-early-response-schema-audit.json",
);

function argument(name, fallback) {
  const exact = process.argv.find((value) => value.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseCsv(text) {
  const [headerLine, valueLine] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(";");
  const values = valueLine.split(";");
  return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
}

function ageFamily(code) {
  return ({ "1": "calendar", "2": "cyclic", "3": "profile" })[code] ?? `unknown-${code}`;
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const cfgDirectory = path.resolve(ROOT, argument("--cfg-dir", ".cache/rc54-kit/cfg"));
const entries = (await readdir(cfgDirectory))
  .filter((name) => /^cell_cfg_P\d{3}_\d+_S\d+_C\d+\.csv$/i.test(name))
  .sort();

const rows = [];
for (const file of entries) {
  const text = await readFile(path.join(cfgDirectory, file), "utf8");
  const row = parseCsv(text);
  const parameter = Number(row.parameter_id);
  if (parameter === 0 || row.cell_used !== "1") continue;
  const id = `P${String(parameter).padStart(3, "0")}-${Number(row.parameter_nr)}`;
  rows.push({
    id,
    file,
    conditionId: `P${String(parameter).padStart(3, "0")}`,
    replicate: Number(row.parameter_nr),
    ageFamily: ageFamily(row.age_type),
    ageTemperatureC: asNumber(row.age_temp),
    ageSocPercent: asNumber(row.age_soc),
    chargeRateC: asNumber(row.age_chg_rate),
    dischargeRateC: asNumber(row.age_dischg_rate),
    profileCode: Number(row.age_profile),
    cycleVoltageMaxV: asNumber(row.V_max_cyc_V),
    cycleVoltageMinV: asNumber(row.V_min_cyc_V),
    cycleChargeMaxA: asNumber(row.I_chg_max_cyc_A),
    cycleDischargeMaxA: asNumber(row.I_dischg_max_cyc_A),
  });
}

const byCondition = new Map();
for (const row of rows) {
  if (!byCondition.has(row.conditionId)) byCondition.set(row.conditionId, []);
  byCondition.get(row.conditionId).push(row);
}

const matrix = {};
for (const row of rows) {
  const key = `${row.ageTemperatureC}C`;
  matrix[key] ??= { calendar: 0, cyclic: 0, profile: 0, total: 0 };
  matrix[key][row.ageFamily] += 1;
  matrix[key].total += 1;
}

const pilotIds = ["P008-1", "P017-2", "P026-1", "P069-2"];
const pilot = rows
  .filter((row) => pilotIds.includes(row.id))
  .map((row) => ({
    ...row,
    selectionHash: sha256(`rc54-schema-pilot:${row.id}`),
    modelWeight: 0,
  }));
const targets = rows.filter((row) => row.ageTemperatureC === 40);
const development = rows.filter((row) => row.ageTemperatureC !== 40 && !pilotIds.includes(row.id));

const officialFiles = [
  { key: "cell_eocv2.zip", bytes: 93167507, md5: "b4f42914c8eaf176fd47e33e6f112d7c", fileId: "15a3gtgdzdeffbr8", outcomeValuesRead: false },
  { key: "cell_eisv2.zip", bytes: 19894633, md5: "6eb09ae51c8a9e9b4b02b33e739787ab", fileId: "tz7dk0ag5pcdgm45", outcomeValuesRead: false },
  { key: "cell_plsv2.zip", bytes: 22972041, md5: "5c660fc53ac4ae4de5850143f629242a", fileId: "juxdw51w2ec8gedg", outcomeValuesRead: false },
  { key: "cfg.zip", bytes: 97252, md5: "b894469e86712b6021bb5364f7296891", fileId: "w049egbgr21pfcm2", outcomeValuesRead: false },
  { key: "cell_overview.xlsx", bytes: 74470, md5: "7a5fc1770ee595c6c44a51a0bf344e65", fileId: "k71rzemp5d0bjuu0", outcomeValuesRead: false },
  { key: "data_structure.xlsx", bytes: 186499, md5: "576711692fd3b5aaa6e0bf7f09bff1e9", fileId: "47dn6826v0sgdd87", outcomeValuesRead: false },
];

const output = {
  auditId: "RC54-KIT-EARLY-RESPONSE-SCHEMA-AUDIT-0.1",
  cycleId: "RC-2026-54",
  generatedOn: "2026-08-29",
  officialRecord: "https://doi.org/10.35097/1969",
  sourcePaper: "https://doi.org/10.1038/s41597-024-03831-x",
  chronologyBoundary: {
    filesRead: ["cfg.zip", "cell_overview.xlsx", "data_structure.xlsx"],
    purpose: "Configuration, identifiers, units, and outcome-free column definitions only.",
    outcomeArchivesRead: false,
  },
  officialFiles,
  cohort: {
    configuredCells: rows.length,
    conditions: byCondition.size,
    triplicateConditions: [...byCondition.values()].filter((items) => items.length === 3).length,
    nonTriplicateConditions: [...byCondition.entries()]
      .filter(([, items]) => items.length !== 3)
      .map(([conditionId, items]) => ({ conditionId, count: items.length })),
    temperatureByFamily: Object.fromEntries(Object.entries(matrix).sort()),
  },
  split: {
    pilot,
    development: {
      temperaturesC: [0, 10, 25],
      count: development.length,
      excludedPilotCount: pilot.length,
    },
    untouchedTarget: {
      temperatureC: 40,
      count: targets.length,
      conditionCount: new Set(targets.map((row) => row.conditionId)).size,
      ids: targets.map((row) => row.id).sort(),
    },
  },
  assertions: {
    allConditionsAreTriplicates: [...byCondition.values()].every((items) => items.length === 3),
    configuredCellCountIs228: rows.length === 228,
    targetCellCountIs57: targets.length === 57,
    developmentCellCountIs167: development.length === 167,
    pilotCellCountIs4: pilot.length === 4,
    pilotsDoNotOverlapTarget: pilot.every((row) => row.ageTemperatureC !== 40),
    outcomeValuesRead: false,
  },
};

await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  `RC54 schema audit: ${rows.length} cells, ${byCondition.size} triplicate conditions, ` +
    `${development.length} development, ${pilot.length} zero-weight pilots, ${targets.length} untouched targets; no outcome archive read.`,
);
