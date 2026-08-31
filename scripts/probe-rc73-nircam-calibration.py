#!/usr/bin/env python3
"""Inventory and probe small NIRCam calibration cutouts without full-file downloads."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS


ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = ROOT / ".cache/rc73-nircam-calibration/mast-program-6605-products.json"
OUTPUT = ROOT / ".cache/rc73-nircam-calibration/rc73-header-support.json"
DOWNLOAD = "https://mast.stsci.edu/api/v0.1/Download/file?uri="
BLOCK = 2880
TARGETS = {
    "006": {"name": "WDFS0458-56", "ra": 74.60, "dec": -56.63},
    "009": {"name": "WDFS2317-29", "ra": 349.33, "dec": -29.06},
    "105": {"name": "WDFS0122-30", "ra": 20.50, "dec": -30.87},
}


def range_get(uri: str, start: int, end: int) -> bytes:
    url = DOWNLOAD + urllib.parse.quote(uri, safe="")
    request = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def header_from_remote(uri: str, offset: int) -> tuple[fits.Header, int]:
    payload = bytearray()
    while True:
        start = offset + len(payload)
        payload.extend(range_get(uri, start, start + 8 * BLOCK - 1))
        end_card = None
        for index in range(0, len(payload), 80):
            if payload[index:index + 8] == b"END     ":
                end_card = index + 80
                break
        if end_card is not None:
            header_size = math.ceil(end_card / BLOCK) * BLOCK
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


def read_headers(uri: str) -> list[dict]:
    offset = 0
    result = []
    for index in range(16):
        header, header_size = header_from_remote(uri, offset)
        data_size = hdu_data_size(header)
        result.append({
            "index": index,
            "offset": offset,
            "headerSize": header_size,
            "dataOffset": offset + header_size,
            "dataSize": data_size,
            "name": header.get("EXTNAME", "PRIMARY"),
            "header": header,
        })
        offset += header_size + data_size
        if header.get("EXTNAME") == "SCI":
            break
    return result


def observation_number(filename: str) -> str:
    match = re.match(r"jw06605(\d{3})001_", filename)
    if not match:
        raise ValueError(f"Unexpected filename: {filename}")
    return match.group(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    source = json.loads(PRODUCTS.read_text(encoding="utf-8"))
    products = [
        row for row in source["calibrated"]
        if row["productSubGroupDescription"] == "CAL"
    ]
    rows = []
    for count, product in enumerate(sorted(products, key=lambda item: item["filename"]), 1):
        filename = product["filename"]
        obs = observation_number(filename)
        target = TARGETS[obs]
        hdus = read_headers(product["dataURI"])
        primary = hdus[0]["header"]
        science = next(item for item in hdus if item["name"] == "SCI")
        target_ra = float(primary.get("TARG_RA", target["ra"]))
        target_dec = float(primary.get("TARG_DEC", target["dec"]))
        wcs = WCS(science["header"])
        x, y = wcs.world_to_pixel_values(target_ra, target_dec)
        nx = int(science["header"].get("NAXIS1", 0))
        ny = int(science["header"].get("NAXIS2", 0))
        in_bounds = bool(-0.5 <= x < nx - 0.5 and -0.5 <= y < ny - 0.5)
        row = {
            "filename": filename,
            "dataURI": product["dataURI"],
            "observation": obs,
            "target": target["name"],
            "targetRa": target_ra,
            "targetDec": target_dec,
            "detector": primary.get("DETECTOR"),
            "filter": primary.get("FILTER"),
            "pupil": primary.get("PUPIL"),
            "patternNumber": primary.get("PATT_NUM"),
            "dateObserved": primary.get("DATE-OBS"),
            "x": float(x),
            "y": float(y),
            "nx": nx,
            "ny": ny,
            "targetInBounds": in_bounds,
            "scienceDataOffset": science["dataOffset"],
            "scienceDataSize": science["dataSize"],
            "hduLayout": [
                {key: item[key] for key in ("index", "name", "offset", "headerSize", "dataOffset", "dataSize")}
                for item in hdus
            ],
        }
        rows.append(row)
        print(f"[{count:02d}/{len(products):02d}] {filename}: {target['name']} {x:.2f},{y:.2f} in={in_bounds}")

    supported = [row for row in rows if row["targetInBounds"]]
    groups = {}
    for row in supported:
        key = f"{row['target']}|{row['detector']}|{row['filter']}"
        groups.setdefault(key, []).append(row["filename"])
    result = {
        "generatedAt": np.datetime_as_string(np.datetime64("now"), timezone="UTC"),
        "source": str(PRODUCTS.relative_to(ROOT)).replace(os.sep, "/"),
        "remoteHeaderRows": len(rows),
        "targetInBoundsRows": len(supported),
        "supportGroups": {key: len(value) for key, value in sorted(groups.items())},
        "rows": rows,
    }
    if args.write:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: result[key] for key in ("remoteHeaderRows", "targetInBoundsRows", "supportGroups")}, indent=2))


if __name__ == "__main__":
    main()
