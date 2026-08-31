#!/usr/bin/env python3
"""Run RC73's registered isolated-standard NIRCam repeatability probe."""

from __future__ import annotations

import argparse
import json
import math
import os
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import numpy as np
from astropy.io import fits


ROOT = Path(__file__).resolve().parents[1]
SUPPORT = ROOT / ".cache/rc73-nircam-calibration/rc73-header-support.json"
CACHE = ROOT / ".cache/rc73-nircam-calibration/strips"
OUTPUT = ROOT / "research/reproducibility/rc73-nircam-calibration-result.json"
DOWNLOAD = "https://mast.stsci.edu/api/v0.1/Download/file?uri="
BLOCK = 2880
APERTURE_RADIUS = 5.0
BACKGROUND_INNER = 20.0
BACKGROUND_OUTER = 35.0
STRIP_HALF_HEIGHT = 42


def range_get(uri: str, start: int, end: int) -> bytes:
    url = DOWNLOAD + urllib.parse.quote(uri, safe="")
    request = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def header_from_remote(uri: str, offset: int) -> tuple[fits.Header, int]:
    payload = bytearray()
    while True:
        start = offset + len(payload)
        payload.extend(range_get(uri, start, start + 8 * BLOCK - 1))
        for index in range(0, len(payload), 80):
            if payload[index:index + 8] == b"END     ":
                header_size = math.ceil((index + 80) / BLOCK) * BLOCK
                text = bytes(payload[:header_size]).decode("ascii")
                return fits.Header.fromstring(text, sep=""), header_size
        if len(payload) > 256 * BLOCK:
            raise RuntimeError(f"FITS header exceeds safety limit at {offset}: {uri}")


def hdu_data_size(header: fits.Header) -> int:
    naxis = int(header.get("NAXIS", 0))
    elements = 0 if naxis == 0 else 1
    for axis in range(1, naxis + 1):
        elements *= int(header.get(f"NAXIS{axis}", 0))
    raw = abs(int(header.get("BITPIX", 8))) // 8
    raw *= elements
    raw = (raw + int(header.get("PCOUNT", 0))) * int(header.get("GCOUNT", 1))
    return math.ceil(raw / BLOCK) * BLOCK if raw else 0


def read_layout(uri: str) -> tuple[fits.Header, dict[str, dict]]:
    offset = 0
    primary = None
    layout = {}
    for _ in range(20):
        header, header_size = header_from_remote(uri, offset)
        data_size = hdu_data_size(header)
        name = header.get("EXTNAME", "PRIMARY")
        if name == "PRIMARY":
            primary = header
        layout[name] = {
            "header": header,
            "dataOffset": offset + header_size,
            "dataSize": data_size,
        }
        offset += header_size + data_size
        if name == "AREA":
            break
    if primary is None or not {"SCI", "DQ", "AREA"}.issubset(layout):
        raise RuntimeError(f"Required HDUs absent in {uri}: {sorted(layout)}")
    return primary, layout


def fits_dtype(header: fits.Header) -> np.dtype:
    bitpix = int(header["BITPIX"])
    mapping = {
        8: ">u1",
        16: ">i2",
        32: ">i4",
        64: ">i8",
        -32: ">f4",
        -64: ">f8",
    }
    return np.dtype(mapping[bitpix])


def read_strip(uri: str, item: dict, y_start: int, y_stop: int) -> np.ndarray:
    header = item["header"]
    nx = int(header["NAXIS1"])
    itemsize = abs(int(header["BITPIX"])) // 8
    start = item["dataOffset"] + y_start * nx * itemsize
    end = item["dataOffset"] + (y_stop + 1) * nx * itemsize - 1
    payload = range_get(uri, start, end)
    expected = (y_stop - y_start + 1) * nx
    values = np.frombuffer(payload, dtype=fits_dtype(header), count=expected).reshape(-1, nx)
    bscale = header.get("BSCALE", 1)
    bzero = header.get("BZERO", 0)
    if bscale != 1 or bzero != 0:
        values = values.astype(np.float64) * bscale + bzero
    return np.asarray(values)


def load_strips(row: dict) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / row["filename"].replace("_cal.fits", "_strip.npz")
    if cached.exists():
        with np.load(cached, allow_pickle=False) as content:
            return {key: content[key] for key in content.files}

    primary, layout = read_layout(row["dataURI"])
    science_header = layout["SCI"]["header"]
    ny = int(science_header["NAXIS2"])
    y_start = max(0, int(math.floor(row["y"])) - STRIP_HALF_HEIGHT)
    y_stop = min(ny - 1, int(math.floor(row["y"])) + STRIP_HALF_HEIGHT)
    result = {
        "science": read_strip(row["dataURI"], layout["SCI"], y_start, y_stop),
        "dq": read_strip(row["dataURI"], layout["DQ"], y_start, y_stop),
        "area": read_strip(row["dataURI"], layout["AREA"], y_start, y_stop),
        "yStart": np.asarray(y_start),
        "photmjsr": np.asarray(float(science_header["PHOTMJSR"])),
        "filter": np.asarray(str(primary["FILTER"])),
        "detector": np.asarray(str(primary["DETECTOR"])),
        "patternNumber": np.asarray(int(primary["PATT_NUM"])),
    }
    np.savez_compressed(cached, **result)
    return result


def sigma_clipped_mean(values: np.ndarray) -> tuple[float, float, int]:
    values = values[np.isfinite(values)]
    keep = np.ones(values.size, dtype=bool)
    for _ in range(5):
        current = values[keep]
        median = np.median(current)
        sigma = 1.4826 * np.median(np.abs(current - median))
        if not np.isfinite(sigma) or sigma == 0:
            break
        new_keep = np.abs(values - median) <= 3.0 * sigma
        if np.array_equal(new_keep, keep):
            break
        keep = new_keep
    current = values[keep]
    return float(np.mean(current)), float(np.std(current, ddof=1)), int(current.size)


def fractional_circle(x_grid: np.ndarray, y_grid: np.ndarray, cx: float, cy: float, radius: float, samples: int = 12) -> np.ndarray:
    result = np.zeros((y_grid.size, x_grid.size), dtype=np.float64)
    offsets = (np.arange(samples) + 0.5) / samples - 0.5
    for dy in offsets:
        for dx in offsets:
            result += ((x_grid[None, :] + dx - cx) ** 2 + (y_grid[:, None] + dy - cy) ** 2 <= radius ** 2)
    return result / (samples * samples)


def centroid(data: np.ndarray, approx_x: float, approx_y_local: float) -> tuple[float, float]:
    cx, cy = approx_x, approx_y_local
    search = 8
    x0 = max(0, int(round(cx)) - search)
    x1 = min(data.shape[1], int(round(cx)) + search + 1)
    y0 = max(0, int(round(cy)) - search)
    y1 = min(data.shape[0], int(round(cy)) + search + 1)
    patch = data[y0:y1, x0:x1]
    peak_y, peak_x = np.unravel_index(np.nanargmax(patch), patch.shape)
    cx, cy = x0 + peak_x, y0 + peak_y
    for _ in range(3):
        half = 4
        x0 = max(0, int(round(cx)) - half)
        x1 = min(data.shape[1], int(round(cx)) + half + 1)
        y0 = max(0, int(round(cy)) - half)
        y1 = min(data.shape[0], int(round(cy)) + half + 1)
        patch = data[y0:y1, x0:x1]
        edge = np.concatenate((patch[0], patch[-1], patch[:, 0], patch[:, -1]))
        background = np.nanmedian(edge)
        weights = np.clip(patch - background, 0, None)
        weights[~np.isfinite(weights)] = 0
        if weights.sum() <= 0:
            break
        yy, xx = np.indices(patch.shape)
        cx = float(x0 + np.sum(xx * weights) / weights.sum())
        cy = float(y0 + np.sum(yy * weights) / weights.sum())
    return cx, cy


def measure(row: dict, strips: dict) -> dict:
    science = strips["science"].astype(np.float64)
    area = strips["area"].astype(np.float64)
    dq = strips["dq"].astype(np.int64)
    y_start = int(strips["yStart"])
    data = (science / float(strips["photmjsr"])) * area
    cx, cy_local = centroid(data, row["x"], row["y"] - y_start)
    cy = cy_local + y_start

    x_min = max(0, int(math.floor(cx - BACKGROUND_OUTER - 2)))
    x_max = min(data.shape[1] - 1, int(math.ceil(cx + BACKGROUND_OUTER + 2)))
    y_min_local = max(0, int(math.floor(cy_local - BACKGROUND_OUTER - 2)))
    y_max_local = min(data.shape[0] - 1, int(math.ceil(cy_local + BACKGROUND_OUTER + 2)))
    x_grid = np.arange(x_min, x_max + 1)
    y_grid = np.arange(y_start + y_min_local, y_start + y_max_local + 1)
    cutout = data[y_min_local:y_max_local + 1, x_min:x_max + 1]
    dq_cutout = dq[y_min_local:y_max_local + 1, x_min:x_max + 1]

    outer = fractional_circle(x_grid, y_grid, cx, cy, BACKGROUND_OUTER, samples=6)
    inner = fractional_circle(x_grid, y_grid, cx, cy, BACKGROUND_INNER, samples=6)
    annulus = (outer - inner) > 0.5
    background, background_std, background_pixels = sigma_clipped_mean(cutout[annulus])

    fluxes = {}
    areas = {}
    for radius in (3.0, 5.0, 8.0):
        weights = fractional_circle(x_grid, y_grid, cx, cy, radius)
        finite = np.isfinite(cutout)
        fluxes[f"r{int(radius)}"] = float(np.sum((cutout[finite] - background) * weights[finite]))
        areas[f"r{int(radius)}"] = float(np.sum(weights[finite]))
    central_weights = fractional_circle(x_grid, y_grid, cx, cy, 3.0, samples=6)
    bad_central = int(np.sum(((dq_cutout & 1) != 0) & (central_weights > 0)))

    return {
        "filename": row["filename"],
        "dataURI": row["dataURI"],
        "target": row["target"],
        "detector": str(strips["detector"]),
        "filter": str(strips["filter"]),
        "patternNumber": int(strips["patternNumber"]),
        "wcsX": row["x"],
        "wcsY": row["y"],
        "centroidX": cx,
        "centroidY": cy,
        "centroidOffsetPixels": float(math.hypot(cx - row["x"], cy - row["y"])),
        "photmjsr": float(strips["photmjsr"]),
        "backgroundDnPerSecond": background,
        "backgroundStdDnPerSecond": background_std,
        "backgroundPixels": background_pixels,
        "badDoNotUsePixelsR3": bad_central,
        "fluxDnPerSecond": fluxes,
        "effectiveAreaPixels": areas,
    }


def group_metrics(rows: list[dict], radius: str) -> dict:
    values = np.asarray([row["fluxDnPerSecond"][radius] for row in rows], dtype=np.float64)
    mean = float(np.mean(values))
    median = float(np.median(values))
    mad_sigma = float(1.4826 * np.median(np.abs(values - median)))
    normalized = values / mean
    return {
        "n": int(values.size),
        "meanFluxDnPerSecond": mean,
        "sampleStdFraction": float(np.std(values, ddof=1) / mean),
        "robustSigmaFraction": mad_sigma / median,
        "maxAbsDeviationFraction": float(np.max(np.abs(normalized - 1.0))),
        "normalizedByPattern": {
            str(row["patternNumber"]): float(value / mean)
            for row, value in sorted(zip(rows, values), key=lambda pair: pair[0]["patternNumber"])
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    support = json.loads(SUPPORT.read_text(encoding="utf-8"))
    selected = [row for row in support["rows"] if row["targetInBounds"]]
    measurements = []
    for index, row in enumerate(selected, 1):
        measurement = measure(row, load_strips(row))
        measurements.append(measurement)
        print(
            f"[{index:02d}/{len(selected):02d}] {measurement['target']} "
            f"{measurement['filter']} p{measurement['patternNumber']}: "
            f"offset={measurement['centroidOffsetPixels']:.3f}px "
            f"flux={measurement['fluxDnPerSecond']['r5']:.6g}"
        )

    grouped = defaultdict(list)
    for row in measurements:
        grouped[f"{row['target']}|{row['detector']}|{row['filter']}"].append(row)
    groups = {
        key: {radius: group_metrics(rows, radius) for radius in ("r3", "r5", "r8")}
        for key, rows in sorted(grouped.items())
    }

    matched = {}
    for filt in ("F090W", "F150W"):
        left = groups[f"WDFS0458-56|NRCB1|{filt}"]["r5"]["normalizedByPattern"]
        right = groups[f"WDFS0122-30|NRCB1|{filt}"]["r5"]["normalizedByPattern"]
        keys = sorted(set(left) & set(right), key=int)
        delta = np.asarray([left[key] - right[key] for key in keys])
        lvec = np.asarray([left[key] for key in keys])
        rvec = np.asarray([right[key] for key in keys])
        matched[filt] = {
            "patterns": keys,
            "maxAbsNormalizedDifference": float(np.max(np.abs(delta))),
            "rmsNormalizedDifference": float(np.sqrt(np.mean(delta ** 2))),
            "pearsonCorrelation": float(np.corrcoef(lvec, rvec)[0, 1]),
            "differences": {key: float(left[key] - right[key]) for key in keys},
        }

    r5_groups = [item["r5"] for item in groups.values()]
    support_gate = all(item["n"] == 4 for item in r5_groups)
    dq_gate = all(row["badDoNotUsePixelsR3"] == 0 for row in measurements)
    robust_gate = max(item["robustSigmaFraction"] for item in r5_groups) <= 0.01
    excursion_gate = max(item["maxAbsDeviationFraction"] for item in r5_groups) <= 0.02
    replication_gate = max(item["maxAbsNormalizedDifference"] for item in matched.values()) <= 0.01
    decision = {
        "supportFourOfFourPerGroup": support_gate,
        "zeroDoNotUsePixelsWithinR3": dq_gate,
        "maxRobustSigmaAtMostOnePercent": robust_gate,
        "maxDitherExcursionAtMostTwoPercent": excursion_gate,
        "matchedNrcb1PatternDifferenceAtMostOnePercent": replication_gate,
    }
    decision["localMeasurementOperatorQualified"] = all(decision.values())
    result = {
        "cycle": "RC-2026-73",
        "generatedAt": np.datetime_as_string(np.datetime64("now"), timezone="UTC"),
        "claimBoundary": (
            "This probe can qualify isolated-star local repeatability at three detector anchors. "
            "It cannot qualify full-detector spatial transfer, crowded-field PSF subtraction, TRGB, distance, or H0."
        ),
        "measurementOperator": {
            "scienceConversion": "SCI / PHOTMJSR * AREA, matching the public nircam-fluxcal imaging path",
            "apertureRadiusPixels": APERTURE_RADIUS,
            "backgroundAnnulusPixels": [BACKGROUND_INNER, BACKGROUND_OUTER],
            "centroid": "local peak followed by three positive-flux center-of-mass iterations",
            "fractionalPixelSampling": 12,
        },
        "registeredThresholds": {
            "groupSupport": 4,
            "robustSigmaFraction": 0.01,
            "maxAbsDeviationFraction": 0.02,
            "matchedNrcb1PatternDifference": 0.01,
            "centralDoNotUsePixels": 0,
        },
        "measurements": measurements,
        "groups": groups,
        "matchedNrcb1Replication": matched,
        "decision": decision,
    }
    if args.write:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"decision": decision, "matchedNrcb1Replication": matched}, indent=2))


if __name__ == "__main__":
    main()
