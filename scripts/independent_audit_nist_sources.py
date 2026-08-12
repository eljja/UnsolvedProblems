#!/usr/bin/env python3
"""Independent, standard-library-only audit of the NIST VO2 source bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
EXPECTED_HASHES = {
    "Human Labels.xlsx": "0056a45f7d45694368597fe7804569339745214530584dae10652873fed38cd2",
    "composition-temperature.txt": "6fcc4e862ea866286436a8624b2b82241ce80a08cc87eb0bb878f56ce6fdd027",
    "VO2-Nb2O3-XRD-Combiview.txt": "3b47bf36b2abaef376730226e2616a353ba07571c46e71bce464cf9e9bfbe348",
    "Readme.txt": "79664bb816f830b98254f13bd699fe4266097471b3a4eb8093cdf3725b475110",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference).group(0)
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value - 1


def normalize_number(value: str):
    number = float(value)
    return int(number) if number.is_integer() else number


def read_workbook(path: Path) -> list[list[object]]:
    with zipfile.ZipFile(path) as archive:
        strings_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared_strings = ["".join(node.text or "" for node in item.findall(".//x:t", NS)) for item in strings_root.findall("x:si", NS)]
        sheet_root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row_node in sheet_root.findall(".//x:sheetData/x:row", NS):
        row = [None] * 9
        for cell in row_node.findall("x:c", NS):
            index = column_index(cell.attrib["r"])
            value_node = cell.find("x:v", NS)
            if value_node is None:
                value = None
            elif cell.attrib.get("t") == "s":
                value = shared_strings[int(value_node.text)]
            else:
                value = normalize_number(value_node.text)
            if index < len(row):
                row[index] = value
        rows.append(row)
    return rows


def read_composition(path: Path) -> list[dict[str, int]]:
    lines = path.read_text(encoding="utf-8-sig").strip().splitlines()
    if lines[0].split("\t") != ["V", "temp"]:
        raise ValueError("Unexpected composition-temperature header")
    return [{"vanadiumAtomicPercent": int(v), "temperatureC": int(t)} for v, t in (line.split("\t") for line in lines[1:])]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    source_dir = args.source_dir.resolve()

    hashes = {name: sha256(source_dir / name) for name in EXPECTED_HASHES}
    hash_mismatches = [{"file": name, "expected": EXPECTED_HASHES[name], "observed": observed} for name, observed in hashes.items() if observed != EXPECTED_HASHES[name]]

    workbook_rows = read_workbook(source_dir / "Human Labels.xlsx")
    header = workbook_rows[0]
    expected_header = [None, "V", "V", "temp", "HL3", "HL2", "HL4", "HL1", "HL5"]
    extracted = json.loads((ROOT / "research/external-audit/nist-vo2-2020/human-labels.json").read_text(encoding="utf-8"))["records"]
    workbook_mismatches = []
    for index, (row, record) in enumerate(zip(workbook_rows[1:], extracted), start=2):
        expected = [
            record["measurementId"], record["vanadiumFraction"], record["vanadiumAtomicPercent"], record["temperatureC"],
            record["labels"]["HL3"], record["labels"]["HL2"], record["labels"]["HL4"], record["labels"]["HL1"], record["labels"]["HL5"],
        ]
        if row != expected:
            workbook_mismatches.append({"xlsxRow": index, "workbook": row, "extraction": expected})

    composition = read_composition(source_dir / "composition-temperature.txt")
    composition_mismatches = []
    for record in extracted:
        source_row = composition[record["measurementId"] - 1]
        expected = {"vanadiumAtomicPercent": record["vanadiumAtomicPercent"], "temperatureC": record["temperatureC"]}
        if source_row != expected:
            composition_mismatches.append({"measurementId": record["measurementId"], "source": source_row, "labels": expected})

    raw_path = source_dir / "VO2-Nb2O3-XRD-Combiview.txt"
    raw_lines = raw_path.read_text(encoding="utf-8").strip().splitlines()
    widths = [len(line.split("\t")) for line in raw_lines]
    angles = [float(value) for value in raw_lines[0].split("\t")]
    step_mismatches = sum(1 for left, right in zip(angles, angles[1:]) if abs((right - left) - 0.005) > 1e-9)

    result = {
        "auditId": "NIST-VO2-INDEPENDENT-SOURCE-AUDIT-0.1",
        "reviewedOn": "2026-08-12",
        "implementation": "Python standard library only: zipfile, ElementTree, hashlib, and json; independent of artifact-tool and the JavaScript raw-profile auditor.",
        "sourceDirectoryCommitted": False,
        "hashes": hashes,
        "hashMismatches": hash_mismatches,
        "workbook": {
            "sheetRowsIncludingHeader": len(workbook_rows),
            "columns": len(header),
            "header": header,
            "headerMatches": header == expected_header,
            "recordsCompared": min(len(workbook_rows) - 1, len(extracted)),
            "recordCountMatches": len(workbook_rows) - 1 == len(extracted) == 192,
            "cellValueMismatchRows": len(workbook_mismatches),
            "mismatches": workbook_mismatches,
        },
        "compositionTemperature": {
            "rows": len(composition),
            "labelRowsMapped": len(extracted),
            "mappingMismatchRows": len(composition_mismatches),
            "mismatches": composition_mismatches,
        },
        "rawProfiles": {
            "rowsIncludingAngleAxis": len(raw_lines),
            "spectra": len(raw_lines) - 1,
            "columns": widths[0],
            "rectangular": len(set(widths)) == 1,
            "twoThetaStartDegrees": angles[0],
            "twoThetaEndDegrees": angles[-1],
            "nominalStepDegrees": 0.005,
            "stepMismatchCount": step_mismatches,
        },
        "findings": {
            "allOfficialHashesMatch": not hash_mismatches,
            "workbookExtractionReproduced": header == expected_header and len(workbook_mismatches) == 0 and len(workbook_rows) - 1 == len(extracted),
            "labelRowsMapToCompositionRows": len(composition_mismatches) == 0,
            "rawProfileMatrixReproduced": len(raw_lines) == 353 and len(set(widths)) == 1 and widths[0] == 3841 and step_mismatches == 0,
        },
        "decision": "Accept the current values-only label extraction and raw-row mapping only while all four file hashes match. Any future hash change invalidates this audit until the independent parser is rerun and the difference is adjudicated.",
    }

    output = ROOT / "research/reproducibility/nist-independent-source-audit.json"
    if args.write:
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {output.relative_to(ROOT)}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
