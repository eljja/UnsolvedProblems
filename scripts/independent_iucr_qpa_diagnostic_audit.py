#!/usr/bin/env python3
"""Independent standard-library replay of the RC18 IUCr QPA diagnostic transfer."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
from statistics import median


ROOT = Path(__file__).resolve().parents[1]
PHASES = {"corundum": "cor", "fluorite": "flu", "zincite": "zin"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rounded(value: float, digits: int = 9) -> float:
    return round(value, digits)


def ratio(numerator: int, denominator: int) -> float | None:
    return rounded(numerator / denominator) if denominator else None


def load_rows(source_dir: Path, manifest: dict, truth: dict) -> list[dict]:
    rows = []
    for contract in manifest["files"]:
        path = source_dir / contract["name"]
        if path.stat().st_size != contract["bytes"] or sha256(path) != contract["sha256"]:
            raise RuntimeError(f"Source contract failed for {contract['name']}")
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            count = 0
            for source in reader:
                count += 1
                sample = source["sample"]
                estimates = {phase: float(source[f"{prefix}_wt_mean"]) for phase, prefix in PHASES.items()}
                formal = {phase: float(source[f"{prefix}_wt_err_mean"]) for phase, prefix in PHASES.items()}
                spread = {phase: float(source[f"{prefix}_wt_sd"]) for phase, prefix in PHASES.items()}
                combined = {phase: math.hypot(formal[phase], spread[phase]) for phase in PHASES}
                errors = {phase: abs(estimates[phase] - truth[sample][phase]) for phase in PHASES}
                rows.append({
                    "sample": sample,
                    "refinement_type": int(source["reftype"]),
                    "hal": int(source["HAL"]),
                    "nominal_intensity": int(float(source["maxintfactor"])),
                    "nominal_step": float(source["stepsizefactor"]),
                    "rwp": float(source["Rwp_mean"]),
                    "estimates": estimates,
                    "formal": formal,
                    "combined": combined,
                    "error": max(errors.values()),
                    "formal_score": max(formal.values()),
                    "formal_covers": all(errors[phase] <= 1.96 * formal[phase] for phase in PHASES),
                    "combined_covers": all(errors[phase] <= 1.96 * combined[phase] for phase in PHASES),
                })
            if count != 728:
                raise RuntimeError(f"Expected 728 rows in {contract['name']}, found {count}")
    return rows


def assess(rows: list[dict], accept, gate: float) -> dict:
    accepted = [row for row in rows if accept(row)]
    safe = [row for row in rows if row["error"] <= gate]
    unsafe_accepted = [row for row in accepted if row["error"] > gate]
    return {
        "cases": len(rows),
        "acceptedCases": len(accepted),
        "unsafeAcceptedCases": len(unsafe_accepted),
        "safeRetention": ratio(sum(row["error"] <= gate for row in accepted), len(safe)),
        "maximumAcceptedAbsoluteError": rounded(max((row["error"] for row in accepted), default=0.0)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    spec = json.loads((ROOT / "research/reproducibility/iucr-qpa-transfer-spec.json").read_text(encoding="utf-8"))
    manifest = json.loads((ROOT / "research/reproducibility/iucr-qpa-summary-source-manifest.json").read_text(encoding="utf-8"))
    javascript = json.loads((ROOT / "research/reproducibility/iucr-qpa-diagnostic-transfer-result.json").read_text(encoding="utf-8"))
    rows = load_rows(args.source_dir, manifest, spec["truthWeightPercent"])
    gate = float(spec["design"]["unsafeGatePercentagePoints"])
    development = [row for row in rows if row["sample"] == spec["split"]["developmentSample"]]
    holdout = [row for row in rows if row["sample"] == spec["split"]["holdoutSample"]]

    rwp_threshold = min(row["rwp"] for row in development if row["error"] > gate)
    formal_threshold = min(row["formal_score"] for row in development if row["error"] > gate)
    rwp_holdout = assess(holdout, lambda row: row["rwp"] < rwp_threshold, gate)
    formal_holdout = assess(holdout, lambda row: row["formal_score"] < formal_threshold, gate)
    acquisition = lambda row: row["nominal_step"] <= 0.04 + 1e-12 and row["hal"] >= 70 and row["nominal_intensity"] >= 20000
    acquisition_holdout = assess(holdout, acquisition, gate)

    groups: dict[tuple, list[dict]] = {}
    for row in rows:
        key = (row["sample"], row["hal"], row["nominal_intensity"], row["nominal_step"])
        groups.setdefault(key, []).append(row)
    conditions = []
    for key, group in groups.items():
        if len(group) != 4 or {row["refinement_type"] for row in group} != {1, 2, 3, 4}:
            raise RuntimeError(f"Incomplete model family {key}")
        sample = key[0]
        medians = {phase: median(row["estimates"][phase] for row in group) for phase in PHASES}
        ranges = {
            phase: max(row["estimates"][phase] for row in group) - min(row["estimates"][phase] for row in group)
            for phase in PHASES
        }
        conditions.append({
            "sample": sample,
            "error": max(abs(medians[phase] - spec["truthWeightPercent"][sample][phase]) for phase in PHASES),
            "spread": max(ranges.values()),
        })
    development_conditions = [row for row in conditions if row["sample"] == spec["split"]["developmentSample"]]
    holdout_conditions = [row for row in conditions if row["sample"] == spec["split"]["holdoutSample"]]
    spread_threshold = min(row["spread"] for row in development_conditions if row["error"] > gate)
    accepted_conditions = [row for row in holdout_conditions if row["spread"] < spread_threshold]

    computed = {
        "rows": len(rows),
        "refinementsRepresented": len(rows) * 200,
        "developmentUnsafeRows": sum(row["error"] > gate for row in development),
        "holdoutUnsafeRows": sum(row["error"] > gate for row in holdout),
        "rwpThreshold": rounded(rwp_threshold, 12),
        "formalThreshold": rounded(formal_threshold, 12),
        "modelSpreadThreshold": rounded(spread_threshold, 12),
        "rwpHoldout": rwp_holdout,
        "formalHoldout": formal_holdout,
        "acquisitionHoldout": acquisition_holdout,
        "modelSpreadHoldout": {
            "acceptedConditions": len(accepted_conditions),
            "unsafeAcceptedConditions": sum(row["error"] > gate for row in accepted_conditions),
            "maximumAcceptedAbsoluteError": rounded(max(row["error"] for row in accepted_conditions)),
        },
        "formalBandHoldoutCoverage": ratio(sum(row["formal_covers"] for row in holdout), len(holdout)),
        "combinedBandHoldoutCoverage": ratio(sum(row["combined_covers"] for row in holdout), len(holdout)),
    }
    comparisons = {
        "denominator": computed["rows"] == javascript["denominators"]["rows"],
        "refinementsRepresented": computed["refinementsRepresented"] == javascript["denominators"]["randomizedStartRefinementsRepresented"],
        "unsafeCounts": computed["developmentUnsafeRows"] == javascript["bySample"]["1a"]["unsafeCases"] and computed["holdoutUnsafeRows"] == javascript["bySample"]["1e"]["unsafeCases"],
        "rwpThreshold": computed["rwpThreshold"] == javascript["rowSelectors"]["rwp"]["thresholdSelectedOnDevelopment"],
        "formalThreshold": computed["formalThreshold"] == javascript["rowSelectors"]["formalUncertainty"]["thresholdSelectedOnDevelopment"],
        "spreadThreshold": computed["modelSpreadThreshold"] == javascript["crossModelConditions"]["spreadSelector"]["thresholdSelectedOnDevelopment"],
        "rwpHoldout": computed["rwpHoldout"]["unsafeAcceptedCases"] == javascript["rowSelectors"]["rwp"]["holdout"]["unsafeAcceptedCases"] and computed["rwpHoldout"]["acceptedCases"] == javascript["rowSelectors"]["rwp"]["holdout"]["acceptedCases"],
        "formalHoldout": computed["formalHoldout"]["unsafeAcceptedCases"] == javascript["rowSelectors"]["formalUncertainty"]["holdout"]["unsafeAcceptedCases"] and computed["formalHoldout"]["acceptedCases"] == javascript["rowSelectors"]["formalUncertainty"]["holdout"]["acceptedCases"],
        "acquisitionHoldout": computed["acquisitionHoldout"]["unsafeAcceptedCases"] == javascript["rowSelectors"]["literatureAcquisitionGate"]["holdout"]["unsafeAcceptedCases"] and computed["acquisitionHoldout"]["acceptedCases"] == javascript["rowSelectors"]["literatureAcquisitionGate"]["holdout"]["acceptedCases"],
        "modelSpreadHoldout": computed["modelSpreadHoldout"]["unsafeAcceptedConditions"] == javascript["crossModelConditions"]["spreadSelector"]["holdout"]["unsafeAcceptedConditions"] and computed["modelSpreadHoldout"]["acceptedConditions"] == javascript["crossModelConditions"]["spreadSelector"]["holdout"]["acceptedConditions"],
        "diagnosticBands": computed["formalBandHoldoutCoverage"] == javascript["bySample"]["1e"]["formalBandAllPhaseCoverage"] and computed["combinedBandHoldoutCoverage"] == javascript["bySample"]["1e"]["combinedBandAllPhaseCoverage"],
    }
    audit = {
        "auditId": "IUCR-QPA-DIAGNOSTIC-PYTHON-0.1",
        "generatedOn": "2026-08-12",
        "implementation": "Independent Python standard-library CSV parser, hashlib source verification, statistics.median model aggregation, and direct threshold replay; no JavaScript module imported.",
        "computed": computed,
        "comparisonsWithJavaScript": comparisons,
        "allComparisonsPass": all(comparisons.values()),
    }
    if args.write:
        (ROOT / "research/reproducibility/iucr-qpa-diagnostic-independent-audit.json").write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    else:
        print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
