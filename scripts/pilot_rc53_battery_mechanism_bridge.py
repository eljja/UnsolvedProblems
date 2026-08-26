#!/usr/bin/env python3
"""Read only the four preregistered RC53 pilot cells and seal their schema map."""

from __future__ import annotations

import csv
import io
import json
import pathlib
import re
import time
import zipfile

import fsspec

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "research" / "reproducibility" / "rc53-battery-mechanism-bridge-pilot.json"
PILOTS = {"1": {"E", "F"}, "3": {"E", "G"}}
ARCHIVES = {
    "1": "Expt 1 - Si-based Degradation.zip",
    "3": "Expt 3 - Cathode Degradation and Li-Plating.zip",
}
BASE = "https://zenodo.org/records/10637534/files/"


def open_archive(name: str) -> tuple[object, zipfile.ZipFile]:
    url = BASE + name.replace(" ", "%20")
    last_error = None
    for attempt in range(3):
        try:
            remote = fsspec.open(url, "rb", block_size=1_048_576).open()
            return remote, zipfile.ZipFile(remote)
        except Exception as error:  # transient Zenodo range timeouts are retried
            last_error = error
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Could not open {name}: {last_error}")


def csv_rows(archive: zipfile.ZipFile, member: str) -> list[dict[str, str]]:
    with archive.open(member) as raw:
        return list(csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig")))


def number(row: dict[str, str], key: str) -> float:
    value = float(row[key])
    if not (value == value and abs(value) != float("inf")):
        raise ValueError(f"non-finite {key}")
    return value


def gitt_r10(rows: list[dict[str, str]]) -> dict[str, float | int]:
    time_s = [number(row, "Time (s)") for row in rows]
    current_ma = [number(row, "Current (mA)") for row in rows]
    voltage_v = [number(row, "Voltage (V)") for row in rows]
    starts = [index for index in range(1, len(rows)) if current_ma[index] < -100 and current_ma[index - 1] >= -100]
    if len(starts) != 25:
        raise ValueError(f"expected 25 GITT pulses, found {len(starts)}")
    start = starts[11]
    pre = [index for index in range(max(0, start - 10), start) if 0 < time_s[start] - time_s[index] <= 0.5 and abs(current_ma[index]) < 100]
    if len(pre) < 3:
        raise ValueError("fewer than three pre-pulse rest samples")
    selected_pre = pre[-3:]
    v_pre = sorted(voltage_v[index] for index in selected_pre)[1]
    candidates = range(start, min(len(rows), start + 300))
    at_10 = min(candidates, key=lambda index: abs((time_s[index] - time_s[start]) - 10.0))
    delta_t = time_s[at_10] - time_s[start]
    if abs(delta_t - 10.0) > 0.051 or current_ma[at_10] >= -100:
        raise ValueError(f"no valid 10 s pulse sample: {delta_t}")
    resistance = (v_pre - voltage_v[at_10]) / abs(current_ma[at_10] / 1000.0)
    return {
        "pulseCount": len(starts),
        "pulseNumber": 12,
        "prePulseVoltageV": v_pre,
        "sampleTimeAfterOnsetS": delta_t,
        "sampleCurrentA": current_ma[at_10] / 1000.0,
        "sampleVoltageV": voltage_v[at_10],
        "r10Ohm": resistance,
    }


def main() -> None:
    records = []
    for experiment, archive_name in ARCHIVES.items():
        remote, archive = open_archive(archive_name)
        try:
            names = archive.namelist()
            for cell in sorted(PILOTS[experiment]):
                summary_matches = [
                    name for name in names
                    if "/Summary Data/Performance Summary/" in name
                    and re.search(fr"cell {re.escape(cell)} \(", name)
                    and name.endswith("Processed Data.csv")
                ]
                gitt_matches = [
                    name for name in names
                    if f"/GITT Voltage Curves/cell {cell}/" in name
                    and f"cell {cell} - RPT0 - 25-pulse GITT 0.5C discharge data.csv" in name
                ]
                if len(summary_matches) != 1 or len(gitt_matches) != 1:
                    raise ValueError(f"pilot {experiment}-{cell}: summary={len(summary_matches)}, gitt={len(gitt_matches)}")
                summary = csv_rows(archive, summary_matches[0])
                rows_by_set = {int(float(row["Ageing Sets"])): row for row in summary}
                if 0 not in rows_by_set or 8 not in rows_by_set:
                    raise ValueError(f"pilot {experiment}-{cell}: missing RPT0 or RPT8")
                bol, rpt8 = rows_by_set[0], rows_by_set[8]
                c0 = number(bol, "C/10 Capacity [mA h]")
                c8 = number(rpt8, "C/10 Capacity [mA h]")
                retention = c8 / c0
                source_soh = number(rpt8, "SoH")
                if abs(retention - source_soh) > 1e-4:
                    raise ValueError(f"pilot {experiment}-{cell}: SoH mismatch {retention} vs {source_soh}")
                r10 = gitt_r10(csv_rows(archive, gitt_matches[0]))
                r01 = number(bol, "0.1s Resistance [Ohms]")
                records.append({
                    "cellId": f"{experiment}-{cell}",
                    "summaryMember": summary_matches[0],
                    "gittMember": gitt_matches[0],
                    "summaryColumns": list(bol.keys()),
                    "rptRows": len(summary),
                    "rpt0C10CapacityAh": c0 / 1000.0,
                    "rpt8C10CapacityAh": c8 / 1000.0,
                    "rpt8Retention": retention,
                    "sourceSoH": source_soh,
                    "retentionMinusSourceSoH": retention - source_soh,
                    "bolR01Ohm": r01,
                    "bolR10Ohm": r10["r10Ohm"],
                    "bolR10MinusR01Ohm": r10["r10Ohm"] - r01,
                    "gittAudit": r10,
                })
        finally:
            archive.close()
            remote.close()

    output = {
        "pilotId": "RC53-BATTERY-MECHANISM-BRIDGE-PILOT-0.1",
        "cycleId": "RC-2026-53",
        "runOn": "2026-08-26",
        "precommitCommit": "b2fb296",
        "cells": ["1-E", "1-F", "3-E", "3-G"],
        "modelWeight": 0,
        "records": records,
        "schemaVerdict": "pass" if len(records) == 4 else "fail",
        "amendmentRequired": True,
        "targetValuesRead": False,
        "developmentValuesRead": False,
    }
    OUT.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"RC53 pilot: {len(records)} zero-weight cells; schema {output['schemaVerdict']}; no development or target values read.")


if __name__ == "__main__":
    main()
