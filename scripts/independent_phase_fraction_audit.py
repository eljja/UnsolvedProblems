#!/usr/bin/env python3
"""Independent NumPy replay and local tangent audit for RC16."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
RAW_SHA256 = "3b47bf36b2abaef376730226e2616a353ba07571c46e71bce464cf9e9bfbe348"
COMPOSITIONS = [92, 93, 94, 95, 96, 97]
FRACTIONS = np.arange(0.1, 1.0, 0.1)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def shift_bins(values: np.ndarray, bins: int) -> np.ndarray:
    indices = np.arange(values.size, dtype=float) - bins
    return np.interp(indices, np.arange(values.size), values)


def fit_fraction(y: np.ndarray, low: np.ndarray, high: np.ndarray) -> dict:
    x = np.linspace(-1.0, 1.0, y.size)
    design = np.column_stack((low, high, np.ones(y.size), x))
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
    sse, coefficients, residual = min(candidates, key=lambda item: item[0])
    signal = coefficients[0] + coefficients[1]
    return {
        "fraction": float(coefficients[1] / signal),
        "normalizedResidual": float(np.sqrt(sse / y.size) / np.sqrt(np.mean(y**2))),
        "residual": residual,
    }


def maximum_error(endpoint_pairs: dict, generator, fitter) -> float:
    maximum = 0.0
    for composition in COMPOSITIONS:
        low, high = endpoint_pairs[composition]
        for fraction in FRACTIONS:
            y = generator(composition, low, high, float(fraction))
            fit_low, fit_high = fitter(composition, low, high)
            estimate = fit_fraction(y, fit_low, fit_high)["fraction"]
            maximum = max(maximum, abs(estimate - fraction))
    return float(maximum)


def residualize(vector: np.ndarray, nuisance: np.ndarray) -> np.ndarray:
    coefficients, *_ = np.linalg.lstsq(nuisance, vector, rcond=None)
    return vector - nuisance @ coefficients


def tangent_row(composition: int, endpoint_pairs: dict) -> dict:
    low, high = endpoint_pairs[composition]
    midpoint = 0.5 * (low + high)
    x = np.linspace(-1.0, 1.0, low.size)
    baseline_nuisance = np.column_stack((midpoint, np.ones(low.size), x))
    target = residualize(high - low, baseline_nuisance)
    high_shift = residualize(0.5 * (shift_bins(high, 1) - shift_bins(high, -1)), baseline_nuisance)
    low_shift = residualize(0.5 * (shift_bins(low, 1) - shift_bins(low, -1)), baseline_nuisance)
    lower = max(COMPOSITIONS[0], composition - 1)
    upper = min(COMPOSITIONS[-1], composition + 1)
    lower_mid = 0.5 * sum(endpoint_pairs[lower])
    upper_mid = 0.5 * sum(endpoint_pairs[upper])
    composition_tangent = residualize((upper_mid - lower_mid) / (upper - lower), baseline_nuisance)

    def cosine(left: np.ndarray, right: np.ndarray) -> float:
        return float(abs(left @ right) / (np.linalg.norm(left) * np.linalg.norm(right)))

    normalized = np.column_stack([
        vector / np.linalg.norm(vector)
        for vector in (target, high_shift, low_shift, composition_tangent)
    ])
    singular_values = np.linalg.svd(normalized, compute_uv=False)
    return {
        "targetVsHighShiftAbsCosine": cosine(target, high_shift),
        "targetVsLowShiftAbsCosine": cosine(target, low_shift),
        "targetVsCompositionAbsCosine": cosine(target, composition_tangent),
        "fourDirectionConditionNumber": float(singular_values[0] / singular_values[-1]),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    raw_path = args.source_dir / "VO2-Nb2O3-XRD-Combiview.txt"
    if sha256(raw_path) != RAW_SHA256:
        raise RuntimeError("Official raw-profile hash changed")
    spectra = np.loadtxt(raw_path, delimiter="\t", skiprows=1)
    labels = json.loads((ROOT / "research/external-audit/nist-vo2-2020/human-labels.json").read_text(encoding="utf-8"))["records"]
    by_coordinate = {(row["vanadiumAtomicPercent"], row["temperatureC"]): row for row in labels}
    endpoint_pairs = {}
    for composition in COMPOSITIONS:
        low_row = by_coordinate[(composition, 23)]
        high_row = by_coordinate[(composition, 68)]
        endpoint_pairs[composition] = (
            spectra[low_row["measurementId"] - 1],
            spectra[high_row["measurementId"] - 1],
        )

    clean = maximum_error(
        endpoint_pairs,
        lambda _c, low, high, f: (1 - f) * low + f * high,
        lambda _c, low, high: (low, high),
    )
    shift_one = maximum_error(
        endpoint_pairs,
        lambda _c, low, high, f: (1 - f) * low + f * shift_bins(high, 1),
        lambda _c, low, high: (low, high),
    )
    shift_two = maximum_error(
        endpoint_pairs,
        lambda _c, low, high, f: (1 - f) * low + f * shift_bins(high, 2),
        lambda _c, low, high: (low, high),
    )
    development = [92, 94, 96]

    def nearest_templates(composition, low, high):
        if composition not in [93, 95, 97]:
            return low, high
        nearest = min(development, key=lambda item: (abs(item - composition), item))
        return endpoint_pairs[nearest]

    transferred_cases = [93, 95, 97]
    transferred_maximum = 0.0
    for composition in transferred_cases:
        low, high = endpoint_pairs[composition]
        fit_low, fit_high = nearest_templates(composition, low, high)
        for fraction in FRACTIONS:
            y = (1 - fraction) * low + fraction * high
            transferred_maximum = max(transferred_maximum, abs(fit_fraction(y, fit_low, fit_high)["fraction"] - fraction))

    tangent_rows = {str(composition): tangent_row(composition, endpoint_pairs) for composition in COMPOSITIONS}
    tangent_summary = {
        "maximumTargetVsHighShiftAbsCosine": max(row["targetVsHighShiftAbsCosine"] for row in tangent_rows.values()),
        "maximumTargetVsLowShiftAbsCosine": max(row["targetVsLowShiftAbsCosine"] for row in tangent_rows.values()),
        "maximumTargetVsCompositionAbsCosine": max(row["targetVsCompositionAbsCosine"] for row in tangent_rows.values()),
        "maximumFourDirectionConditionNumber": max(row["fourDirectionConditionNumber"] for row in tangent_rows.values()),
    }
    js_result = json.loads((ROOT / "research/reproducibility/nist-phase-fraction-identifiability-result.json").read_text(encoding="utf-8"))
    comparisons = {
        "cleanMaximumErrorMatches": bool(abs(clean - js_result["scenarioResults"]["clean"]["maximumAbsoluteError"]) < 1e-6),
        "oneBinMaximumErrorMatches": bool(abs(shift_one - js_result["scenarioResults"]["peakShift1Bin"]["maximumAbsoluteError"]) < 1e-6),
        "twoBinMaximumErrorMatches": bool(abs(shift_two - js_result["scenarioResults"]["peakShift2Bin"]["maximumAbsoluteError"]) < 1e-6),
        "nearestTransferMaximumErrorMatches": bool(abs(transferred_maximum - js_result["scenarioResults"]["transferredTemplates"]["maximumAbsoluteError"]) < 1e-6),
    }
    result = {
        "auditId": "NIST-VO2-PHASE-FRACTION-PYTHON-0.1",
        "generatedOn": "2026-08-12",
        "implementation": "Python NumPy loadtxt, lstsq, and SVD; no JavaScript modules imported",
        "source": {"rawProfilesSha256": RAW_SHA256, "spectra": int(spectra.shape[0]), "columns": int(spectra.shape[1])},
        "independentReplay": {
            "cleanMaximumAbsoluteError": clean,
            "oneBinShiftMaximumAbsoluteError": shift_one,
            "twoBinShiftMaximumAbsoluteError": shift_two,
            "nearestCompositionTransferMaximumAbsoluteError": transferred_maximum,
            "comparisonsWithJavaScript": comparisons,
            "allComparisonsPass": all(comparisons.values()),
        },
        "localTangentAudit": {"byComposition": tangent_rows, "summary": tangent_summary},
        "interpretation": "Tangent metrics are exploratory local diagnostics after the RC16 failure. They quantify alignment, not physical phase-fraction validity, and must be frozen before a blinded physical test.",
    }
    if not result["independentReplay"]["allComparisonsPass"]:
        raise RuntimeError("Independent Python replay does not match the JavaScript benchmark")
    output = ROOT / "research/reproducibility/nist-phase-fraction-independent-audit.json"
    if args.write:
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {output.relative_to(ROOT)}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
