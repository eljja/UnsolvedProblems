#!/usr/bin/env python3
"""Freeze detector-stratified reference windows for the RC70 DOLPHOT baseline.

The design uses only FITS WCS geometry.  It never reads catalogue detections or
artificial-star outcomes, so the windows can be fixed before photometric results.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORK = ROOT / ".cache" / "rc69-phost-ast" / "dolphot-work"
DEFAULT_OUTPUT = ROOT / "research" / "reproducibility" / "rc70-detector-tile-design.json"
REFERENCE = "f150w_i2d.fits"
EDGE_MARGIN = 64.0
TILE_SIZE = 800
SAMPLE_COUNT = 17


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_wcs(path: Path) -> tuple[WCS, tuple[int, int]]:
    with fits.open(path, memmap=True) as hdul:
        data = hdul["SCI"].data
        return WCS(hdul["SCI"].header), (int(data.shape[1]), int(data.shape[0]))


def perimeter(xmin: float, ymin: float, xmax: float, ymax: float) -> tuple[np.ndarray, np.ndarray]:
    horizontal = np.linspace(xmin, xmax, SAMPLE_COUNT)
    vertical = np.linspace(ymin, ymax, SAMPLE_COUNT)
    xs = np.concatenate([horizontal, horizontal, np.full_like(vertical, xmin), np.full_like(vertical, xmax)])
    ys = np.concatenate([np.full_like(horizontal, ymin), np.full_like(horizontal, ymax), vertical, vertical])
    return xs, ys


def square_supported(
    reference_wcs: WCS,
    exposure_wcs: list[WCS],
    center_x: float,
    center_y: float,
    size: int,
) -> bool:
    half = size / 2
    xs, ys = perimeter(center_x - half, center_y - half, center_x + half, center_y + half)
    world = reference_wcs.pixel_to_world(xs, ys)
    for wcs in exposure_wcs:
        image_x, image_y = wcs.world_to_pixel(world)
        finite = np.isfinite(image_x) & np.isfinite(image_y)
        inside = (
            finite
            & (image_x >= EDGE_MARGIN)
            & (image_x <= 2047 - EDGE_MARGIN)
            & (image_y >= EDGE_MARGIN)
            & (image_y <= 2047 - EDGE_MARGIN)
        )
        if not bool(np.all(inside)):
            return False
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    work = args.work_dir.resolve()
    reference_path = work / REFERENCE
    reference_wcs, reference_shape = load_wcs(reference_path)

    exposure_pattern = re.compile(r"_(?P<channel>02|04)101_(?P<dither>\d{5})_nrcb(?P<detector>[1-4])_cal\.fits$")
    exposures: list[dict] = []
    for path in sorted(work.glob("jw02875012001_*_nrcb?_cal.fits")):
        match = exposure_pattern.search(path.name)
        if not match:
            continue
        channel = match.group("channel")
        detector = int(match.group("detector"))
        dither = int(match.group("dither"))
        wcs, shape = load_wcs(path)
        corners = np.array([[0, 0], [2047, 0], [2047, 2047], [0, 2047]], dtype=float)
        world = wcs.pixel_to_world(corners[:, 0], corners[:, 1])
        ref_x, ref_y = reference_wcs.world_to_pixel(world)
        exposures.append(
            {
                "filename": path.name,
                "basename": path.stem,
                "filter": "F090W" if channel == "02" else "F150W",
                "dither": dither,
                "detector": detector,
                "shape": list(shape),
                "referenceFootprint": [[round(float(x), 6), round(float(y), 6)] for x, y in zip(ref_x, ref_y)],
                "center": [round(float(np.mean(ref_x)), 6), round(float(np.mean(ref_y)), 6)],
                "_wcs": wcs,
            }
        )

    if len(exposures) != 32:
        raise RuntimeError(f"Expected 32 CAL exposures, found {len(exposures)}")

    tiles: list[dict] = []
    for detector in range(1, 5):
        group = [record for record in exposures if record["detector"] == detector]
        if len(group) != 8:
            raise RuntimeError(f"NRCB{detector}: expected eight exposures, found {len(group)}")
        centers = np.asarray([record["center"] for record in group], dtype=float)
        anchor = np.median(centers, axis=0)

        # Search is deterministic and WCS-only.  The score favors the detector
        # center while requiring an 800x800 square to remain inside all eight
        # dither/filter footprints with a 64-pixel detector-edge margin.
        candidates: list[tuple[float, float, float]] = []
        for dx in np.arange(-320, 321, 32):
            for dy in np.arange(-320, 321, 32):
                x = float(anchor[0] + dx)
                y = float(anchor[1] + dy)
                if square_supported(reference_wcs, [record["_wcs"] for record in group], x, y, TILE_SIZE):
                    candidates.append((float(dx * dx + dy * dy), x, y))
        if not candidates:
            raise RuntimeError(f"NRCB{detector}: no supported {TILE_SIZE}-pixel square found")
        _, center_x, center_y = min(candidates)
        xmin = int(round(center_x - TILE_SIZE / 2))
        ymin = int(round(center_y - TILE_SIZE / 2))
        xmax = xmin + TILE_SIZE
        ymax = ymin + TILE_SIZE

        image_indices = [exposures.index(record) + 1 for record in group]
        tiles.append(
            {
                "id": f"nrcb{detector}",
                "detector": f"NRCB{detector}",
                "photsec": [1, 1, xmin, ymin, xmax, ymax],
                "center": [round(center_x, 6), round(center_y, 6)],
                "size": [TILE_SIZE, TILE_SIZE],
                "expectedImageIndices": image_indices,
                "expectedImages": [record["basename"] for record in group],
                "filterCounts": {
                    "F090W": sum(record["filter"] == "F090W" for record in group),
                    "F150W": sum(record["filter"] == "F150W" for record in group),
                },
                "dithers": sorted({record["dither"] for record in group}),
                "edgeMarginInEveryExposure": EDGE_MARGIN,
                "selectionBasis": "FITS WCS footprints only; no source catalogue or AST outcome was read",
            }
        )

    serializable_exposures = [{key: value for key, value in record.items() if key != "_wcs"} for record in exposures]
    result = {
        "cycleId": "RC-2026-70",
        "experimentId": "PHOST-DETECTOR-BASELINE-1",
        "reviewedOn": "2026-09-01",
        "question": "Can detector-stratified reference reductions supply auditable alignment, PSF, and aperture-correction receipts before the sealed 3,072-row AST is spent?",
        "inputBoundary": {
            "reference": REFERENCE,
            "referenceSha256": sha256(reference_path),
            "referenceShape": list(reference_shape),
            "calExposureCount": len(exposures),
            "detectorCount": 4,
            "exposuresPerDetector": 8,
        },
        "design": {
            "tileSize": [TILE_SIZE, TILE_SIZE],
            "perimeterSamplesPerEdge": SAMPLE_COUNT,
            "detectorEdgeMargin": EDGE_MARGIN,
            "selection": "For each detector, choose the nearest-to-median 800x800 reference square whose sampled perimeter remains inside all four dithers in both filters.",
            "reason": "A local reference window is expected to overlap one short-wave detector, not all four. Detector-specific expected-image sets separate geometric non-overlap from alignment failure.",
        },
        "gates": {
            "geometry": "Every tile must retain its entire sampled perimeter at least 64 detector pixels inside all eight expected exposures.",
            "alignment": "All eight expected exposures must match; warnings from the 24 geometrically disjoint exposures are classified as expected non-overlap.",
            "psf": "Record per-image PSF-star counts and central-pixel adjustments; the documentation target is at least 100 PSF stars per expected exposure and |adjustment| < 0.05.",
            "aperture": "Record per-image aperture-star counts and corrections; fewer than 100 stars in an expected exposure keeps the scientific AST gate closed.",
            "stop": "Do not run the 3,072-row AST if any expected exposure lacks alignment, PSF/aperture evidence is inadequate, or detector-to-detector receipts cannot be parsed independently.",
        },
        "tiles": tiles,
        "exposures": serializable_exposures,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "tiles": tiles}, indent=2))


if __name__ == "__main__":
    main()
