#!/usr/bin/env python3
"""Label-blind schema audit for the RC52 BatteryLife subset.

The audit reads label-file keys only. It never reads lifetime values, fits a
model, or computes an association with the outcome.
"""

from __future__ import annotations

import argparse
import json
import math
import pickle
from collections import Counter
from pathlib import Path


SOURCES = {
    "CALB": ("CALB/CALB", "CALB_labels.json"),
    "HNEI": ("HNEI/HNEI", "HNEI_labels.json"),
    "MICH_EXP": ("MICH_EXP/MICH_EXP", "MICH_EXP_labels.json"),
    "UL_PUR": ("UL_PUR/UL_PUR", "UL-PUR_labels.json"),
}

CYCLE_FIELDS = (
    "current_in_A",
    "voltage_in_V",
    "charge_capacity_in_Ah",
    "discharge_capacity_in_Ah",
    "time_in_s",
    "temperature_in_C",
    "internal_resistance_in_ohm",
)


def finite_count(value: object) -> int:
    if value is None:
        return 0
    try:
        values = value.tolist()
    except AttributeError:
        values = value
    if not isinstance(values, (list, tuple)):
        values = [values]
    count = 0
    for item in values:
        try:
            if math.isfinite(float(item)):
                count += 1
        except (TypeError, ValueError):
            pass
    return count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("data_root", type=Path)
    parser.add_argument("--horizon", type=int, default=20)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    labels_dir = args.data_root / "labels" / "Life labels"
    result = {
        "audit": "RC52 BatteryLife label-blind schema audit",
        "horizon": args.horizon,
        "labelValuesRead": False,
        "sources": {},
        "totals": {},
    }
    total_labelled = 0
    total_with_horizon = 0
    total_extra = 0

    for source, (relative_dir, label_name) in SOURCES.items():
        label_path = labels_dir / label_name
        label_keys = set(json.loads(label_path.read_text(encoding="utf-8")).keys())
        data_dir = args.data_root / relative_dir
        files = {path.name: path for path in data_dir.glob("*.pkl")}
        labelled_files = sorted(label_keys & files.keys())
        extra_files = sorted(files.keys() - label_keys)
        missing_files = sorted(label_keys - files.keys())
        field_cells = Counter()
        field_cycles = Counter()
        metadata = Counter()
        eligible = []
        cycle_counts = {}

        for name in labelled_files:
            with files[name].open("rb") as handle:
                cell = pickle.load(handle)
            cycles = cell.get("cycle_data") or []
            cycle_counts[name] = len(cycles)
            if len(cycles) >= args.horizon:
                eligible.append(name)
            for key in (
                "cell_id",
                "form_factor",
                "anode_material",
                "cathode_material",
                "nominal_capacity_in_Ah",
                "depth_of_charge",
                "depth_of_discharge",
                "charge_protocol",
                "discharge_protocol",
            ):
                if cell.get(key) not in (None, "", [], {}):
                    metadata[key] += 1
            first = cycles[: args.horizon]
            for field in CYCLE_FIELDS:
                valid_cycles = sum(finite_count(cycle.get(field)) > 0 for cycle in first)
                field_cycles[field] += valid_cycles
                if valid_cycles == len(first) and len(first) == args.horizon:
                    field_cells[field] += 1

        result["sources"][source] = {
            "labelledFileCount": len(label_keys),
            "matchedLabelledFileCount": len(labelled_files),
            "eligibleAtHorizonCount": len(eligible),
            "unlabelledExtraFiles": extra_files,
            "missingLabelledFiles": missing_files,
            "cycleCountRange": [min(cycle_counts.values()), max(cycle_counts.values())] if cycle_counts else None,
            "completeCellsByCycleField": dict(field_cells),
            "validCycleObservationsByField": dict(field_cycles),
            "metadataPresentCellCount": dict(metadata),
        }
        total_labelled += len(label_keys)
        total_with_horizon += len(eligible)
        total_extra += len(extra_files)

    result["totals"] = {
        "labelledFileCount": total_labelled,
        "eligibleAtHorizonCountBeforeOutcomeRules": total_with_horizon,
        "unlabelledExtraFileCount": total_extra,
    }
    payload = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload)


if __name__ == "__main__":
    main()
