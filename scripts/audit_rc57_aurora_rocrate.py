#!/usr/bin/env python3
"""Outcome-blind RC57 audit of the Aurora RO-Crate cohort lineage."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
RC56_AUDIT = ROOT / "research" / "reproducibility" / "rc56-aurora-source-audit.json"
RC56_SCRIPT = ROOT / "scripts" / "audit_rc56_aurora_remote_zip.py"
OUT = ROOT / "research" / "reproducibility" / "rc57-aurora-rocrate-lineage-audit.json"


def load_rc56_module():
    spec = importlib.util.spec_from_file_location("rc56_aurora_audit", RC56_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def cell_id_from_path(value: str) -> str | None:
    marker = "empa__ccid"
    if marker not in value:
        return None
    start = value.index(marker) + len("empa__")
    return value[start : start + len("ccid000000")]


def has_type(entity: dict, expected: str) -> bool:
    value = entity.get("@type", [])
    return expected in ([value] if isinstance(value, str) else value)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    rc56 = json.loads(RC56_AUDIT.read_text(encoding="utf-8"))
    remote = load_rc56_module()
    entries, directory = remote.central_directory()
    crate_entry = next(entry for entry in entries if entry["name"] == "ro-crate-metadata.json")
    crate_bytes = remote.extract_entry(crate_entry)
    crate = json.loads(crate_bytes.decode("utf-8"))
    graph = crate.get("@graph", [])
    by_id = {entity.get("@id"): entity for entity in graph if isinstance(entity, dict) and entity.get("@id")}
    descriptor = by_id.get("ro-crate-metadata.json", {})
    root = by_id.get("./", {})

    cell_datasets = [
        entity for entity in graph
        if has_type(entity, "Dataset") and str(entity.get("@id", "")).startswith("./empa__ccid")
    ]
    file_entities = [entity for entity in graph if has_type(entity, "File")]
    bdf_csv_entities = [entity for entity in file_entities if str(entity.get("@id", "")).endswith(".bdf.csv")]
    bdf_parquet_entities = [entity for entity in file_entities if str(entity.get("@id", "")).endswith(".bdf.parquet")]
    metadata_entities = [entity for entity in file_entities if str(entity.get("@id", "")).endswith(".metadata.json")]

    root_parts = [item.get("@id") for item in root.get("hasPart", []) if isinstance(item, dict)]
    physical_metadata = {cell_id_from_path(entry["name"]) for entry in entries if entry["name"].endswith(".metadata.json")}
    physical_csv = {cell_id_from_path(entry["name"]) for entry in entries if entry["name"].endswith(".bdf.csv")}
    physical_parquet = {cell_id_from_path(entry["name"]) for entry in entries if entry["name"].endswith(".bdf.parquet")}
    crate_cells = {cell_id_from_path(entity["@id"]) for entity in cell_datasets}
    physical_metadata.discard(None)
    physical_csv.discard(None)
    physical_parquet.discard(None)
    crate_cells.discard(None)

    explicit_lfp_ids = []
    for item in rc56["metadata"]:
        if any("lifepo4" in str(leaf.get("value", "")).lower() for leaf in item.get("matchedLeaves", [])):
            cell_id = cell_id_from_path(item["name"])
            if cell_id:
                explicit_lfp_ids.append(cell_id)
    explicit_lfp_ids = sorted(set(explicit_lfp_ids))

    cohort_terms = ("lifepo", "lfp", "figure 7", "batch", "cohort", "electrode", "protocol")
    informative_entities = []
    for entity in graph:
        rendered = json.dumps(entity, ensure_ascii=False).lower()
        hits = [term for term in cohort_terms if term in rendered]
        if hits:
            informative_entities.append({"id": entity.get("@id"), "terms": hits})

    one_to_one = []
    for cell_id in explicit_lfp_ids:
        dataset = by_id.get(f"./empa__{cell_id}/", {})
        parts = [part.get("@id") for part in dataset.get("hasPart", []) if isinstance(part, dict)]
        one_to_one.append(
            {
                "cellId": cell_id,
                "physicalMetadata": cell_id in physical_metadata,
                "physicalCsv": cell_id in physical_csv,
                "physicalParquet": cell_id in physical_parquet,
                "crateDataset": cell_id in crate_cells,
                "crateBdfPartCount": len(parts),
            }
        )

    output = {
        "auditId": "RC57-AURORA-ROCRATE-LINEAGE-AUDIT-0.1",
        "cycleId": "RC-2026-57",
        "auditedOn": "2026-08-29",
        "status": "lineage-unresolved-aurora-excluded-before-outcomes",
        "record": rc56["record"],
        "remoteDirectory": {
            **directory,
            "matchesRc56CentralDirectory": directory["centralDirectorySha256"] == rc56["directory"]["centralDirectorySha256"],
        },
        "roCrate": {
            "sha256": hashlib.sha256(crate_bytes).hexdigest(),
            "uncompressedBytes": len(crate_bytes),
            "context": crate.get("@context"),
            "graphEntityCount": len(graph),
            "descriptorConformsTo": descriptor.get("conformsTo"),
            "rootName": root.get("name"),
            "rootHasPartCount": len(root_parts),
            "cellDatasetCount": len(cell_datasets),
            "fileEntityCount": len(file_entities),
            "bdfCsvEntityCount": len(bdf_csv_entities),
            "bdfParquetEntityCount": len(bdf_parquet_entities),
            "metadataJsonEntityCount": len(metadata_entities),
            "cohortSemanticEntityCount": len(informative_entities),
            "cohortSemanticEntities": informative_entities,
            "interpretation": "The crate inventories cell directories and BDF files. It does not state chemistry, Figure 7 membership, or a 36-cell study cohort. RO-Crate permits partial file description, so this is a fitness-for-cohort-selection gap rather than a conformance finding."
        },
        "inventoryAgreement": {
            "crateCells": len(crate_cells),
            "physicalMetadataCells": len(physical_metadata),
            "physicalCsvCells": len(physical_csv),
            "physicalParquetCells": len(physical_parquet),
            "allFourInventoriesEqual": crate_cells == physical_metadata == physical_csv == physical_parquet,
        },
        "paperToArchiveCohort": {
            "paperLongTermLfpCells": 36,
            "archiveExplicitLfpCells": len(explicit_lfp_ids),
            "explicitLfpCellIds": explicit_lfp_ids,
            "allExplicitLfpHaveOneToOneFiles": all(
                row["physicalMetadata"] and row["physicalCsv"] and row["physicalParquet"]
                and row["crateDataset"] and row["crateBdfPartCount"] == 2
                for row in one_to_one
            ),
            "oneToOneExplicitLfp": one_to_one,
            "unresolvedCount": 36 - len(explicit_lfp_ids),
            "prohibitedInference": "Do not infer four additional cohort members from neighboring IDs, file order, or BDF outcomes."
        },
        "decision": {
            "lineageGatePass": False,
            "auroraEligibleForConfirmation": False,
            "reason": "The RO-Crate confirms a complete 199-cell file inventory but contains no chemistry or Figure 7 membership relation, while only 32 per-cell metadata records explicitly identify LiFePO4 versus 36 cells in the paper cohort.",
            "nextEligibleEvidence": "An official author or curator table that names all 36 Figure 7 cell IDs and binds each to assembly metadata, cycling protocol, and BDF files without revealing cell outcomes."
        },
        "outcomeBoundary": {
            "roCrateOpened": True,
            "perCellMetadataReusedFromRc56": 199,
            "cyclingDataEntriesOpened": 0,
            "cellCapacityValuesObserved": 0,
            "cellEolValuesObserved": 0,
        }
    }
    rendered = json.dumps(output, indent=2, ensure_ascii=False) + "\n"
    if args.write:
        OUT.write_text(rendered, encoding="utf-8")
    print(
        f"RC57 Aurora RO-Crate: graph={len(graph)}, cells={len(crate_cells)}, "
        f"explicit-LFP={len(explicit_lfp_ids)}, lineage-pass={output['decision']['lineageGatePass']}, outcomes=0"
    )


if __name__ == "__main__":
    main()
