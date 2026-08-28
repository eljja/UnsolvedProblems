#!/usr/bin/env node

/**
 * RC54 zero-weight schema pilot. This script intentionally opens only the four
 * preregistered pilot cells and writes no model-ready table.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".cache", "rc54-kit");
const OUTPUT = path.join(ROOT, "research", "reproducibility", "rc54-kit-early-response-pilot.json");
const PILOTS = ["P008-1", "P017-2", "P026-1", "P069-2"];
const SOCS = [10, 30, 50, 70, 90];

function parse(text) {
  const lines = text.trim().split(/\r?\n/);
  const columns = lines.shift().split(";");
  return {
    columns,
    rows: lines.map((line) => {
      const values = line.split(";");
      return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    }),
  };
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function measurementGroups(rows, valueColumn) {
  const groups = new Map();
  for (const row of rows) {
    const groupKey = `${row.sd_block_id}|${number(row.soc_nom)}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { timestamps: [], values: [], rawRows: 0 });
    const group = groups.get(groupKey);
    group.timestamps.push(number(row.timestamp_s));
    group.values.push(number(row[valueColumn]));
    group.rawRows += 1;
  }
  return [...groups.entries()]
    .map(([groupKey, group]) => {
      const [, soc] = groupKey.split("|").map(Number);
      return {
        timestamp: Math.min(...group.timestamps.filter(Number.isFinite)),
        soc,
        value: median(group.values),
        rawRows: group.rawRows,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp || a.soc - b.soc);
}

async function exactFile(kind, pilotId) {
  const [condition, replicate] = pilotId.split("-");
  const prefix = `cell_${kind}v2_${condition}_${replicate}_`;
  const names = (await readdir(path.join(CACHE, kind))).filter((name) => name.startsWith(prefix));
  if (names.length !== 1) throw new Error(`${pilotId} ${kind}: expected one file, found ${names.length}`);
  return path.join(CACHE, kind, names[0]);
}

function firstTwoCheckups(groups, capacityAnchors) {
  return capacityAnchors.slice(0, 2).map((anchor, index) => {
    const next = capacityAnchors[index + 1]?.timestamp ?? Number.POSITIVE_INFINITY;
    const inWindow = groups.filter((item) => item.timestamp >= anchor.timestamp && item.timestamp < next);
    return {
      checkup: `CU${index}`,
      anchorTimestamp: anchor.timestamp,
      bySoc: Object.fromEntries(SOCS.map((soc) => {
        const measurements = inWindow.filter((item) => item.soc === soc);
        return [soc, {
          value: median(measurements.map((item) => item.value)),
          measurementCount: measurements.length,
          rawRows: measurements.reduce((sum, item) => sum + item.rawRows, 0),
          firstTimestamp: measurements.length ? Math.min(...measurements.map((item) => item.timestamp)) : null,
        }];
      })),
    };
  });
}

const cells = [];
for (const id of PILOTS) {
  const paths = {
    eoc: await exactFile("eoc", id),
    eis: await exactFile("eis", id),
    pls: await exactFile("pls", id),
  };
  const eoc = parse(await readFile(paths.eoc, "utf8"));
  const eis = parse(await readFile(paths.eis, "utf8"));
  const pls = parse(await readFile(paths.pls, "utf8"));

  const capacity = eoc.rows
    .filter((row) => row.cyc_condition === "2" && row.cyc_charged === "0" && number(row.cap_aged_est_Ah) !== null)
    .map((row) => ({ timestamp: number(row.timestamp_s), capacityAh: number(row.cap_aged_est_Ah) }))
    .sort((a, b) => a.timestamp - b.timestamp);
  const eisGroups = measurementGroups(
    eis.rows.filter((row) => row.is_rt === "1" && row.valid === "1" && SOCS.includes(number(row.soc_nom))),
    "z_ref_now_mOhm",
  );
  const pulseGroups = measurementGroups(
    pls.rows.filter((row) => row.is_rt === "1" && SOCS.includes(number(row.soc_nom))),
    "r_ref_10ms_mOhm",
  );
  const pulseOneSecondGroups = measurementGroups(
    pls.rows.filter((row) => row.is_rt === "1" && SOCS.includes(number(row.soc_nom))),
    "r_ref_1s_mOhm",
  );

  const firstTwoEis = firstTwoCheckups(eisGroups, capacity);
  const firstTwoPulse10ms = firstTwoCheckups(pulseGroups, capacity);
  const firstTwoPulse1s = firstTwoCheckups(pulseOneSecondGroups, capacity);
  const complete = (checkups) => checkups.length === 2 && checkups.every((checkup) => (
    SOCS.every((soc) => Number.isFinite(checkup.bySoc[soc].value))
  ));

  cells.push({
    id,
    modelWeight: 0,
    files: Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, path.basename(value)])),
    rowCounts: { eoc: eoc.rows.length, eis: eis.rows.length, pulse: pls.rows.length },
    capacityCheckups: capacity.length,
    firstTwoCapacityDischarges: capacity.slice(0, 2),
    firstTwoEis,
    firstTwoPulse10ms,
    firstTwoPulse1s,
    featureReady: capacity.length >= 3 && complete(firstTwoEis) && complete(firstTwoPulse10ms) && complete(firstTwoPulse1s),
  });
}

const output = {
  pilotId: "RC54-KIT-EARLY-RESPONSE-PILOT-0.1",
  cycleId: "RC-2026-54",
  runOn: "2026-08-29",
  scope: {
    cells: PILOTS,
    modelWeight: 0,
    nonPilotFilesRead: false,
    purpose: "Resolve exact row identity, units, check-up ordering, duplicate aggregation, and feature completeness only."
  },
  resolvedMapping: {
    capacity: "EOC row with cyc_condition=2, cyc_charged=0, and finite cap_aged_est_Ah; chronological order defines CU0, CU1, and later check-ups.",
    eis: "EIS rows with is_rt=1, valid=1, and soc_nom in {10,30,50,70,90}; sd_block_id identifies one spectrum. Assign a spectrum to capacity check-up j when its timestamp is at or after capacity anchor j and before anchor j+1, then take the median z_ref_now_mOhm across duplicate spectra at that SOC.",
    pulse: "PLS rows with is_rt=1 and soc_nom in {10,30,50,70,90}; sd_block_id identifies one pulse waveform. Assign it to capacity check-up j by the same half-open anchor window, then take the median r_ref_10ms_mOhm and r_ref_1s_mOhm across duplicate waveforms at that SOC.",
    time: "timestamp_s is Unix seconds; elapsed days equals timestamp difference divided by 86400.",
    duplicateReason: "EIS summary values repeat across frequency rows and pulse summary values repeat across raw waveform rows. sd_block_id first collapses one measurement; a second median handles repeated measurements within the same capacity-check-up window without using later outcomes."
  },
  units: {
    capacity: "Ah",
    eisReference: "mOhm",
    pulseResistance: "mOhm",
    timestamp: "s"
  },
  cells,
  assertions: {
    pilotCountIs4: cells.length === 4,
    everyPilotFeatureReady: cells.every((cell) => cell.featureReady),
    everyPilotHasZeroWeight: cells.every((cell) => cell.modelWeight === 0),
    nonPilotFilesRead: false
  }
};

await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`RC54 schema pilot: ${cells.length} zero-weight cells; feature-ready=${output.assertions.everyPilotFeatureReady}; no non-pilot file read.`);
