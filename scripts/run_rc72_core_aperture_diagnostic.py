#!/usr/bin/env python3
"""Execute the sealed RC72 small-core aperture transfer diagnostic once."""

from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS


ROOT = Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"
CONTRACT_PATH = REPRO / "rc72-psf-rescue-contract.json"
RECEIPT_PATH = REPRO / "rc72-preregistration-receipt.json"
MANIFEST_PATH = REPRO / "rc72-core-holdout-manifest.json"
SUPPORT_PATH = REPRO / "rc72-psf-holdout-support.json"
CAL_MANIFEST_PATH = REPRO / "rc69-phost-cal-source-manifest.json"
REF_PATH = ROOT / ".cache" / "rc69-phost-ast" / "dolphot-work" / "f150w_i2d.fits"
CAL_DIR = ROOT / ".cache" / "rc69-phost-ast" / "cal"
OUTPUT_PATH = REPRO / "rc72-core-aperture-result.json"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def median(values):
    return float(np.median(np.asarray(values, dtype=float)))


def quantile(values, q):
    return float(np.quantile(np.asarray(values, dtype=float), q, method="linear"))


def rounded(value, digits=6):
    return round(float(value), digits)


def sigma_clipped_median(values):
    kept = np.asarray(values, dtype=float)
    kept = kept[np.isfinite(kept)]
    for _ in range(3):
        if kept.size == 0:
            break
        centre = np.median(kept)
        mad = np.median(np.abs(kept - centre))
        if mad == 0:
            break
        scale = 1.4826 * mad
        next_kept = kept[np.abs(kept - centre) <= 3 * scale]
        if next_kept.size == kept.size:
            kept = next_kept
            break
        kept = next_kept
    return (float(np.median(kept)) if kept.size else math.nan, int(kept.size))


def aperture_weights(cx, cy, radius=3.0, subdivisions=8):
    x0 = max(0, math.floor(cx - radius - 1))
    x1 = min(2047, math.ceil(cx + radius + 1))
    y0 = max(0, math.floor(cy - radius - 1))
    y1 = min(2047, math.ceil(cy + radius + 1))
    offsets = (np.arange(subdivisions, dtype=float) + 0.5) / subdivisions - 0.5
    rows = []
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            dx = x + offsets[:, None] - cx
            dy = y + offsets[None, :] - cy
            weight = float(np.count_nonzero(dx * dx + dy * dy <= radius * radius)) / (subdivisions * subdivisions)
            if weight:
                rows.append((y, x, weight))
    return rows


def annulus_pixels(cx, cy, inner=7.0, outer=10.0):
    x0 = max(0, math.floor(cx - outer - 1))
    x1 = min(2047, math.ceil(cx + outer + 1))
    y0 = max(0, math.floor(cy - outer - 1))
    y1 = min(2047, math.ceil(cy + outer + 1))
    rows = []
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            distance = math.hypot(x - cx, y - cy)
            if inner <= distance <= outer:
                rows.append((y, x))
    return rows


contract = load(CONTRACT_PATH)
receipt = load(RECEIPT_PATH)
manifest = load(MANIFEST_PATH)
support = load(SUPPORT_PATH)
cal_manifest = load(CAL_MANIFEST_PATH)

sealed = {item["file"]: item["sha256"] for item in receipt["artifacts"]}
for path in [CONTRACT_PATH, REPRO / "rc72-adaptation-dag.json", SUPPORT_PATH, MANIFEST_PATH]:
    relative = path.relative_to(ROOT).as_posix()
    if sealed.get(relative) != sha256(path):
        raise SystemExit(f"Sealed artifact changed before CAL outcome: {relative}")
if not support["gates"]["coreDiagnostic"]["pass"]:
    raise SystemExit("CORE-DIAGNOSTIC support gate did not authorize CAL-pixel access")
if OUTPUT_PATH.exists():
    raise SystemExit(f"Refusing to overwrite single-use outcome: {OUTPUT_PATH}")

cal_records = {item["filename"]: item for item in cal_manifest["exposureFiles"]}
candidates = manifest["candidates"]
needed_files = sorted({exp["filename"] for star in candidates for exp in star["exposures"]})
input_receipts = []
for filename in needed_files:
    path = CAL_DIR / filename
    expected = cal_records[filename]["sha256"]
    actual = sha256(path)
    if actual != expected:
        raise SystemExit(f"CAL hash mismatch: {filename}")
    input_receipts.append({"file": filename, "bytes": path.stat().st_size, "sha256": actual})

with fits.open(REF_PATH, memmap=True) as ref_hdul:
    ref_wcs = WCS(ref_hdul["SCI"].header)
    sky_by_key = {}
    for star in candidates:
        key = (star["detector"], star["row"])
        sky = ref_wcs.pixel_to_world(star["x"], star["y"])
        sky_by_key[key] = (float(sky.ra.deg), float(sky.dec.deg))

measurements = []
for filename in needed_files:
    star_exposures = []
    for star in candidates:
        for exp in star["exposures"]:
            if exp["filename"] == filename:
                star_exposures.append((star, exp))
    if not star_exposures:
        continue
    # DQ is unsigned FITS data encoded with BZERO, which Astropy cannot expose
    # through a memory map. Loading the HDU in memory changes no measurement rule.
    with fits.open(CAL_DIR / filename, memmap=False) as hdul:
        sci_hdu = hdul["SCI"]
        err_hdu = hdul["ERR"]
        dq_hdu = hdul["DQ"]
        sci = sci_hdu.data
        err = err_hdu.data
        dq = dq_hdu.data
        image_wcs = WCS(sci_hdu.header)
        photmjsr = float(sci_hdu.header.get("PHOTMJSR", hdul[0].header.get("PHOTMJSR")))
        for star, exp in star_exposures:
            ra, dec = sky_by_key[(star["detector"], star["row"])]
            cx, cy = image_wcs.world_to_pixel_values(ra, dec)
            weights = aperture_weights(cx, cy)
            total_weight = sum(weight for _, _, weight in weights)
            good_rows = [(y, x, weight) for y, x, weight in weights if dq[y, x] == 0 and np.isfinite(sci[y, x]) and np.isfinite(err[y, x])]
            good_weight = sum(weight for _, _, weight in good_rows)
            annulus = [(y, x) for y, x in annulus_pixels(cx, cy) if dq[y, x] == 0 and np.isfinite(sci[y, x])]
            background, background_count = sigma_clipped_median([sci[y, x] for y, x in annulus])
            valid = good_weight >= 0.9 * total_weight and background_count >= 40 and np.isfinite(background)
            flux_dn_s = math.nan
            flux_error_dn_s = math.nan
            inst_mag = math.nan
            reason = "valid"
            if valid:
                flux_surface = sum(weight * (float(sci[y, x]) - background) for y, x, weight in good_rows)
                flux_dn_s = flux_surface / photmjsr
                flux_error_dn_s = math.sqrt(sum((weight * float(err[y, x]) / photmjsr) ** 2 for y, x, weight in good_rows))
                if flux_dn_s > 0 and np.isfinite(flux_dn_s):
                    inst_mag = -2.5 * math.log10(flux_dn_s)
                else:
                    valid = False
                    reason = "non-positive aperture flux"
            elif good_weight < 0.9 * total_weight:
                reason = "insufficient unflagged aperture weight"
            else:
                reason = "insufficient background annulus"
            measurements.append({
                "detector": star["detector"],
                "row": star["row"],
                "cell": star["cell"],
                "filter": exp["filter"],
                "imageIndex": exp["imageIndex"],
                "filename": filename,
                "referenceX": star["x"],
                "referenceY": star["y"],
                "imageX": rounded(cx, 5),
                "imageY": rounded(cy, 5),
                "photmjsr": rounded(photmjsr, 9),
                "geometricApertureWeight": rounded(total_weight, 6),
                "validApertureWeight": rounded(good_weight, 6),
                "backgroundMjySr": rounded(background, 9) if np.isfinite(background) else None,
                "backgroundPixels": background_count,
                "fluxDnPerSecond": rounded(flux_dn_s, 9) if np.isfinite(flux_dn_s) else None,
                "fluxErrorDnPerSecond": rounded(flux_error_dn_s, 9) if np.isfinite(flux_error_dn_s) else None,
                "instrumentalMagnitude": rounded(inst_mag, 9) if np.isfinite(inst_mag) else None,
                "dolphotMagnitude": exp["magnitude"],
                "valid": bool(valid),
                "reason": reason
            })

offsets = {}
for filter_name in ["F090W", "F150W"]:
    values = [row["dolphotMagnitude"] - row["instrumentalMagnitude"] for row in measurements if row["detector"] == "NRCB1" and row["filter"] == filter_name and row["valid"]]
    if not values:
        raise SystemExit(f"No valid NRCB1 offset records for {filter_name}")
    offsets[filter_name] = median(values)

for row in measurements:
    if row["valid"]:
        row["apertureMagnitude"] = rounded(row["instrumentalMagnitude"] + offsets[row["filter"]], 9)
        row["residualMagnitude"] = rounded(row["apertureMagnitude"] - row["dolphotMagnitude"], 9)
    else:
        row["apertureMagnitude"] = None
        row["residualMagnitude"] = None

star_groups = defaultdict(list)
for row in measurements:
    if row["valid"]:
        star_groups[(row["detector"], row["row"], row["cell"], row["filter"])].append(row)

stars = []
for (detector, catalog_row, cell, filter_name), rows in sorted(star_groups.items()):
    valid = len(rows) >= 3
    stars.append({
        "detector": detector,
        "row": catalog_row,
        "cell": cell,
        "filter": filter_name,
        "validExposures": len(rows),
        "valid": valid,
        "medianResidualMagnitude": rounded(median([row["residualMagnitude"] for row in rows]), 9) if valid else None
    })

summaries = {}
for detector in ["NRCB1", "NRCB2"]:
    summaries[detector] = {}
    for filter_name in ["F090W", "F150W"]:
        selected = [row for row in stars if row["detector"] == detector and row["filter"] == filter_name and row["valid"]]
        residuals = [row["medianResidualMagnitude"] for row in selected]
        cells = {}
        for cell in contract["spatialSplit"]["cells"]:
            cell_values = [row["medianResidualMagnitude"] for row in selected if row["cell"] == cell]
            cells[cell] = {
                "n": len(cell_values),
                "medianResidualMagnitude": rounded(median(cell_values), 9) if cell_values else None,
                "p90AbsoluteResidualMagnitude": rounded(quantile(np.abs(cell_values), 0.9), 9) if cell_values else None
            }
        cell_medians = [item["medianResidualMagnitude"] for item in cells.values() if item["medianResidualMagnitude"] is not None]
        summaries[detector][filter_name] = {
            "n": len(residuals),
            "medianResidualMagnitude": rounded(median(residuals), 9) if residuals else None,
            "p90AbsoluteResidualMagnitude": rounded(quantile(np.abs(residuals), 0.9), 9) if residuals else None,
            "cellMedianRangeMagnitude": rounded(max(cell_medians) - min(cell_medians), 9) if cell_medians else None,
            "cells": cells
        }

control_pass = all(summaries["NRCB1"][f]["p90AbsoluteResidualMagnitude"] <= 0.03 for f in ["F090W", "F150W"])
candidate_support_pass = all(all(cell["n"] >= 6 for cell in summaries["NRCB2"][f]["cells"].values()) for f in ["F090W", "F150W"])
candidate_median_pass = all(abs(summaries["NRCB2"][f]["medianResidualMagnitude"]) <= 0.01 for f in ["F090W", "F150W"])
candidate_cell_pass = all(all(abs(cell["medianResidualMagnitude"]) <= 0.01 for cell in summaries["NRCB2"][f]["cells"].values()) for f in ["F090W", "F150W"])
candidate_tail_pass = all(summaries["NRCB2"][f]["p90AbsoluteResidualMagnitude"] <= 0.03 for f in ["F090W", "F150W"])
candidate_spatial_pass = all(summaries["NRCB2"][f]["cellMedianRangeMagnitude"] <= 0.02 for f in ["F090W", "F150W"])

gate_order = [
    ("NRCB1 control tail", control_pass),
    ("NRCB2 support", candidate_support_pass),
    ("NRCB2 detector median", candidate_median_pass),
    ("NRCB2 cell medians", candidate_cell_pass),
    ("NRCB2 tail", candidate_tail_pass),
    ("NRCB2 spatial range", candidate_spatial_pass)
]
first_core_divergence = next((name for name, passed in gate_order if not passed), "none")
core_pass = all(passed for _, passed in gate_order)

result = {
    "cycleId": contract["cycleId"],
    "experimentId": contract["experimentId"],
    "reviewedOn": "2026-09-01",
    "preregistrationReceiptSha256": sha256(RECEIPT_PATH),
    "inputReceipts": input_receipts,
    "method": {
        "apertureRadiusPixels": 3.0,
        "subpixelGrid": [8, 8],
        "backgroundAnnulusPixels": [7.0, 10.0],
        "backgroundRule": "three iterations of median +/- 3*1.4826*MAD",
        "units": "SCI/PHOTMJSR integrated over fractional pixels gives DN/s",
        "offsetsLearnedOnlyOnNRCB1": {key: rounded(value, 9) for key, value in offsets.items()},
        "minimumValidExposuresPerStarFilter": 3
    },
    "measurements": measurements,
    "starSummaries": stars,
    "summaries": summaries,
    "gates": {
        "ee80IndependentSupport": {"pass": support["gates"]["ee80Independent"]["pass"], "executedResidual": False},
        "coreCatalogueSupport": {"pass": support["gates"]["coreDiagnostic"]["pass"]},
        "nrcb1ControlTail": {"pass": control_pass, "criterion": "p90 |residual| <= 0.03 mag in each filter"},
        "nrcb2ValidSupport": {"pass": candidate_support_pass, "criterion": "at least six valid stars per cell and filter"},
        "nrcb2DetectorMedian": {"pass": candidate_median_pass, "criterion": "|median residual| <= 0.01 mag in each filter"},
        "nrcb2CellMedian": {"pass": candidate_cell_pass, "criterion": "|cell median residual| <= 0.01 mag in every cell and filter"},
        "nrcb2Tail": {"pass": candidate_tail_pass, "criterion": "p90 |residual| <= 0.03 mag in each filter"},
        "nrcb2SpatialRange": {"pass": candidate_spatial_pass, "criterion": "cell-median range <= 0.02 mag in each filter"},
        "coreDiagnostic": {"pass": core_pass},
        "originalNrcb2PsfGate": {"pass": False, "immutable": True},
        "sealedArtificialStarTest": {"pass": False, "opened": False}
    },
    "firstDivergence": {
        "overallAdaptationDag": support["firstDivergence"],
        "coreDiagnostic": first_core_divergence
    },
    "decision": (
        "The small-core transfer diagnostic passes under its frozen limits, but it cannot replace the failed RC71 PSF-star gate or authorize downstream science."
        if core_pass else
        "Retire this exact core holdout at its first failed gate. It cannot rescue NRCB2, and no threshold may be changed on the same CAL-pixel outcome."
    ),
    "inferenceBoundary": "The integrator shares CAL images, WCS positions, catalogue selection, and a control-derived aperture offset with the reduction context. It is an independently coded core-flux diagnostic, not an absolute PSF-independent photometric calibration and not a Cepheid or H0 estimate."
}
OUTPUT_PATH.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(json.dumps({
    "output": OUTPUT_PATH.relative_to(ROOT).as_posix(),
    "offsets": result["method"]["offsetsLearnedOnlyOnNRCB1"],
    "summaries": summaries,
    "gates": result["gates"],
    "firstDivergence": result["firstDivergence"],
    "decision": result["decision"]
}, indent=2, ensure_ascii=False))
