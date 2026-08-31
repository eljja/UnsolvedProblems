#!/usr/bin/env python3
"""Independent standard-library audit of the committed RC70 NRCB1 DOLPHOT receipts."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


result = json.loads(read_text(REPRO / "rc70-nrcb1-detector-baseline-result.json"))
design = json.loads(read_text(REPRO / "rc70-detector-tile-design.json"))
tile = next(row for row in design["tiles"] if row["id"] == "nrcb1")
expected = set(tile["expectedImageIndices"])
log_path = REPRO / "rc70-nrcb1-baseline-log.txt"
log = read_text(log_path)

alignment_rows = [
    {
        "imageIndex": int(index),
        "matched": int(matched),
        "used": int(used),
        "sigmaPixels": float(sigma),
        "expected": int(index) in expected,
    }
    for index, matched, used, sigma in re.findall(
        r"^image (\d+): (\d+) matched, (\d+) used, .*sig=([\d.]+)", log, re.MULTILINE
    )[:32]
]

psf_section = log.split("Central pixel PSF adjustments:", 1)[1].split("Aperture corrections:", 1)[0]
psf_rows = [
    {
        "imageIndex": int(index),
        "stars": int(stars),
        "centralPixelAdjustment": float(adjustment),
        "expected": int(index) in expected,
    }
    for index, stars, adjustment in re.findall(
        r"^image (\d+): (\d+) stars,\s*([-+\d.]+)", psf_section, re.MULTILINE
    )
]

aperture_section = log.split("Aperture corrections:", 1)[1]
aperture_rows = [
    {
        "imageIndex": int(index),
        "stars": int(stars),
        "expected": int(index) in expected,
    }
    for index, stars in re.findall(
        r"^image (\d+): (\d+) total aperture stars", aperture_section, re.MULTILINE
    )
]

alignment_pass = all(row["matched"] >= 100 and row["sigmaPixels"] < 0.30 for row in alignment_rows if row["expected"])
topology_pass = sum(1 for row in alignment_rows if not row["expected"] and row["matched"] == 0) == 24
psf_pass = all(row["stars"] >= 100 and abs(row["centralPixelAdjustment"]) < 0.05 for row in psf_rows if row["expected"])
aperture_pass = all(row["stars"] >= 100 for row in aperture_rows if row["expected"])

checks = {
    "alignmentRows": len(alignment_rows) == 32 and alignment_rows == result["alignment"],
    "psfRows": len(psf_rows) == 32 and psf_rows == result["psf"],
    "apertureRows": len(aperture_rows) == 32 and aperture_rows == result["aperture"],
    "geometryGate": topology_pass == result["gates"]["geometry"]["pass"],
    "alignmentGate": alignment_pass == result["gates"]["alignment"]["pass"],
    "psfGate": psf_pass == result["gates"]["psf"]["pass"],
    "apertureGate": aperture_pass == result["gates"]["aperture"]["pass"],
    "receiptHashes": all(
        (ROOT / receipt["file"]).stat().st_size == receipt["bytes"]
        and digest(ROOT / receipt["file"]) == receipt["sha256"]
        for receipt in result["output"]["receipts"]
    ),
    "sealedAstStillClosed": result["gates"]["sealedAst"]["pass"] is False,
}

audit = {
    "cycleId": "RC-2026-70",
    "experimentId": "PHOST-DETECTOR-BASELINE-1-NRCB1-INDEPENDENT-AUDIT",
    "reviewedOn": "2026-09-01",
    "status": "pass" if all(checks.values()) else "fail",
    "checks": checks,
    "recomputed": {
        "expectedImageIndices": sorted(expected),
        "matchedRange": [min(row["matched"] for row in alignment_rows if row["expected"]), max(row["matched"] for row in alignment_rows if row["expected"])],
        "sigmaRangePixels": [min(row["sigmaPixels"] for row in alignment_rows if row["expected"]), max(row["sigmaPixels"] for row in alignment_rows if row["expected"])],
        "psfStarRange": [min(row["stars"] for row in psf_rows if row["expected"]), max(row["stars"] for row in psf_rows if row["expected"])],
        "maxAbsolutePsfAdjustment": max(abs(row["centralPixelAdjustment"]) for row in psf_rows if row["expected"]),
        "apertureStarRange": [min(row["stars"] for row in aperture_rows if row["expected"]), max(row["stars"] for row in aperture_rows if row["expected"])],
        "gates": {
            "geometry": topology_pass,
            "alignment": alignment_pass,
            "psf": psf_pass,
            "aperture": aperture_pass,
        },
    },
    "independenceBoundary": "This parser uses only the Python standard library and committed text receipts. It shares neither the Node parser nor the DOLPHOT binary, but it does not independently rerun the photometric model.",
}

output = REPRO / "rc70-nrcb1-detector-baseline-python-audit.json"
output.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
print(json.dumps(audit, indent=2))
if audit["status"] != "pass":
    raise SystemExit(1)
