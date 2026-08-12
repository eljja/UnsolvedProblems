#!/usr/bin/env python3
"""Independent NumPy replay of the RC17 continuous drift envelope."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
RAW_SHA256 = "3b47bf36b2abaef376730226e2616a353ba07571c46e71bce464cf9e9bfbe348"
COMPOSITIONS = [92, 93, 94, 95, 96, 97]
DEVELOPMENT = {92, 94, 96}
HOLDOUT = {93, 95, 97}
FRACTIONS = np.arange(1, 100, dtype=float) / 100.0
SHIFTS = np.arange(0, 41, dtype=float) * 0.00025
ERROR_GATE = 0.05


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def shift_degrees(values: np.ndarray, degrees: float) -> np.ndarray:
    bins = degrees / 0.005
    indices = np.arange(values.size, dtype=float) - bins
    return np.interp(indices, np.arange(values.size), values)


def constrained_fit(y: np.ndarray, design: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    candidates = []
    for active in ([0, 1, 2, 3], [0, 2, 3], [1, 2, 3], [2, 3]):
        coefficients, *_ = np.linalg.lstsq(design[:, active], y, rcond=None)
        full = np.zeros(4)
        full[list(active)] = coefficients
        if full[0] < -1e-10 or full[1] < -1e-10:
            continue
        residual = y - design @ full
        candidates.append((float(residual @ residual), full, residual))
    if not candidates:
        raise RuntimeError("No nonnegative endpoint solution")
    _, coefficients, residual = min(candidates, key=lambda item: item[0])
    return coefficients, residual


def load_endpoints(source_dir: Path) -> tuple[dict[int, tuple[np.ndarray, np.ndarray]], int]:
    raw_path = source_dir / "VO2-Nb2O3-XRD-Combiview.txt"
    if sha256(raw_path) != RAW_SHA256:
        raise RuntimeError("Official raw-profile hash changed")
    spectra = np.loadtxt(raw_path, delimiter="\t", skiprows=1)
    labels = json.loads((ROOT / "research/external-audit/nist-vo2-2020/human-labels.json").read_text(encoding="utf-8"))["records"]
    by_coordinate = {(row["vanadiumAtomicPercent"], row["temperatureC"]): row for row in labels}
    endpoint_pairs = {}
    for composition in COMPOSITIONS:
        low_id = by_coordinate[(composition, 23)]["measurementId"]
        high_id = by_coordinate[(composition, 68)]["measurementId"]
        endpoint_pairs[composition] = (spectra[low_id - 1], spectra[high_id - 1])
    return endpoint_pairs, spectra.shape[1]


def compute_cases(endpoint_pairs: dict[int, tuple[np.ndarray, np.ndarray]]) -> list[dict]:
    rows = []
    for composition in COMPOSITIONS:
        low, high = endpoint_pairs[composition]
        x = np.linspace(-1.0, 1.0, low.size)
        design = np.column_stack((low, high, np.ones(low.size), x))
        pseudoinverse = np.linalg.pinv(design)
        for magnitude in SHIFTS:
            directions = [0] if magnitude == 0 else [-1, 1]
            for direction in directions:
                signed_shift = float(direction * magnitude)
                shifted_high = shift_degrees(high, signed_shift)
                y = low[:, None] * (1.0 - FRACTIONS) + shifted_high[:, None] * FRACTIONS
                coefficients = pseudoinverse @ y
                residuals = y - design @ coefficients
                negative = np.where((coefficients[0] < -1e-10) | (coefficients[1] < -1e-10))[0]
                for index in negative:
                    coefficients[:, index], residuals[:, index] = constrained_fit(y[:, index], design)
                signal = coefficients[0] + coefficients[1]
                estimates = coefficients[1] / signal
                normalized = np.sqrt(np.mean(residuals**2, axis=0)) / np.sqrt(np.mean(y**2, axis=0))
                for index, fraction in enumerate(FRACTIONS):
                    active = "".join(("L" if coefficients[0, index] > 1e-10 else "-", "H" if coefficients[1, index] > 1e-10 else "-"))
                    rows.append({
                        "composition": composition,
                        "fraction": float(fraction),
                        "shift": float(magnitude),
                        "signedShift": signed_shift,
                        "bias": float(estimates[index] - fraction),
                        "error": float(abs(estimates[index] - fraction)),
                        "residual": float(normalized[index]),
                        "active": active,
                    })
    return rows


def prefix_safe(rows: list[dict]) -> float:
    safe = 0.0
    for magnitude in SHIFTS:
        if max(row["error"] for row in rows if row["shift"] <= magnitude + 1e-12) > ERROR_GATE:
            break
        safe = float(magnitude)
    return safe


def refusal(rows: list[dict], threshold: float) -> dict:
    unsafe = [row for row in rows if row["error"] > ERROR_GATE]
    accepted = [row for row in rows if row["residual"] < threshold]
    unsafe_accepted = [row for row in accepted if row["error"] > ERROR_GATE]
    safe_refused = [row for row in rows if row["residual"] >= threshold and row["error"] <= ERROR_GATE]
    return {
        "cases": len(rows),
        "unsafeCases": len(unsafe),
        "acceptedCases": len(accepted),
        "unsafeAcceptedCases": len(unsafe_accepted),
        "safeRefusedCases": len(safe_refused),
        "maximumAcceptedAbsoluteError": max(row["error"] for row in accepted),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    endpoint_pairs, columns = load_endpoints(args.source_dir)
    rows = compute_cases(endpoint_pairs)
    development_rows = [row for row in rows if row["composition"] in DEVELOPMENT]
    holdout_rows = [row for row in rows if row["composition"] in HOLDOUT]
    unsafe_development = [row for row in development_rows if row["error"] > ERROR_GATE]
    threshold = min(row["residual"] for row in unsafe_development)
    by_composition = {
        str(composition): prefix_safe([row for row in rows if row["composition"] == composition])
        for composition in COMPOSITIONS
    }
    js = json.loads((ROOT / "research/reproducibility/nist-phase-fraction-drift-envelope-result.json").read_text(encoding="utf-8"))
    comparisons = {
        "totalCasesMatch": len(rows) == js["denominators"]["totalCases"],
        "globalSafeShiftMatches": abs(prefix_safe(rows) - js["globalSafeShiftPrefixDegrees"]) < 1e-12,
        "compositionSafeShiftsMatch": all(abs(value - js["byComposition"][composition]["safeShiftPrefixDegrees"]) < 1e-12 for composition, value in by_composition.items()),
        "residualThresholdMatches": abs(threshold - js["residualRefusal"]["thresholdSelectedOnDevelopment"]) < 1e-12,
        "developmentRefusalMatches": refusal(development_rows, threshold)["unsafeAcceptedCases"] == js["residualRefusal"]["development"]["unsafeAcceptedCases"],
        "holdoutRefusalMatches": refusal(holdout_rows, threshold)["unsafeAcceptedCases"] == js["residualRefusal"]["holdout"]["unsafeAcceptedCases"],
        "activeBoundaryCountMatches": sum(row["active"] != "LH" for row in rows) == js["activeSet"]["boundaryCases"],
    }
    result = {
        "auditId": "NIST-VO2-DRIFT-ENVELOPE-PYTHON-0.1",
        "generatedOn": "2026-08-12",
        "implementation": "Independent Python NumPy loadtxt, pinv/lstsq, interpolation, and residual replay; no JavaScript module imported.",
        "source": {"rawProfilesSha256": RAW_SHA256, "columns": columns},
        "denominators": {"totalCases": len(rows), "fractions": len(FRACTIONS), "shiftMagnitudes": len(SHIFTS)},
        "globalSafeShiftPrefixDegrees": prefix_safe(rows),
        "safeShiftPrefixDegreesByComposition": by_composition,
        "residualRefusalThreshold": threshold,
        "developmentRefusal": refusal(development_rows, threshold),
        "holdoutRefusal": refusal(holdout_rows, threshold),
        "activeBoundaryCases": sum(row["active"] != "LH" for row in rows),
        "comparisonsWithJavaScript": comparisons,
        "allComparisonsPass": all(comparisons.values()),
        "interpretation": "This replay independently checks the numerical envelope and refusal rule. Agreement does not validate a physical VO2 phase-fraction measurand."
    }
    if not result["allComparisonsPass"]:
        raise RuntimeError("Independent drift-envelope replay does not match JavaScript")
    output = ROOT / "research/reproducibility/nist-phase-fraction-drift-independent-audit.json"
    if args.write:
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {output.relative_to(ROOT)}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
