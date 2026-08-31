#!/usr/bin/env python3
"""Independent standard-library audit of committed RC71 NRCB2 DOLPHOT receipts."""

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


result = json.loads(read_text(REPRO / "rc71-nrcb2-detector-baseline-result.json"))
design = json.loads(read_text(REPRO / "rc70-detector-tile-design.json"))
tile = next(row for row in design["tiles"] if row["id"] == "nrcb2")
expected = set(tile["expectedImageIndices"])
log = read_text(REPRO / "rc71-nrcb2-baseline-log.txt")

alignment_rows = [
    {"imageIndex": int(index), "matched": int(matched), "used": int(used), "sigmaPixels": float(sigma), "expected": int(index) in expected}
    for index, matched, used, sigma in re.findall(r"^image (\d+): (\d+) matched, (\d+) used, .*sig=([\d.]+)", log, re.MULTILINE)[:32]
]
psf_section = log.split("Central pixel PSF adjustments:", 1)[1].split("Aperture corrections:", 1)[0]
psf_rows = [
    {"imageIndex": int(index), "stars": int(stars), "centralPixelAdjustment": float(adjustment), "expected": int(index) in expected}
    for index, stars, adjustment in re.findall(r"^image (\d+): (\d+) stars,\s*([-+\d.]+)", psf_section, re.MULTILINE)
]
aperture_section = log.split("Aperture corrections:", 1)[1]
aperture_rows = [
    {"imageIndex": int(index), "stars": int(stars), "expected": int(index) in expected}
    for index, stars in re.findall(r"^image (\d+): (\d+) total aperture stars", aperture_section, re.MULTILINE)
]

warning_text = read_text(REPRO / "rc71-nrcb2-baseline-warnings.txt")
warning_lines = [line for line in warning_text.splitlines() if line.strip()]
no_alignment = [int(value) for value in re.findall(r"No alignment stars matched for image (\d+)", warning_text)]
low_psf = [int(value) for value in re.findall(r"Only \d+ stars for PSF measurement in image (\d+)", warning_text)]
low_aperture = [int(value) for value in re.findall(r"Only \d+ aperture stars in image (\d+)", warning_text)]
typed = no_alignment + low_psf + low_aperture
warning_count_by_image = {str(index): typed.count(index) for index in range(1, 33)}

geometry_pass = len([row for row in alignment_rows if not row["expected"] and row["matched"] == 0]) == 24
alignment_pass = all(row["matched"] >= 100 and row["sigmaPixels"] < 0.30 for row in alignment_rows if row["expected"])
psf_pass = all(row["stars"] >= 100 and abs(row["centralPixelAdjustment"]) < 0.05 for row in psf_rows if row["expected"])
aperture_pass = all(row["stars"] >= 100 for row in aperture_rows if row["expected"])
typed_warning_pass = (
    all(index not in expected for index in typed)
    and len(warning_lines) == len(typed)
    and all(warning_count_by_image[str(index)] == 3 for index in range(1, 33) if index not in expected)
)

checks = {
    "alignmentRows": len(alignment_rows) == 32 and alignment_rows == result["alignment"],
    "psfRows": len(psf_rows) == 32 and psf_rows == result["psf"],
    "apertureRows": len(aperture_rows) == 32 and aperture_rows == result["aperture"],
    "geometryGate": geometry_pass == result["gates"]["geometry"]["pass"],
    "alignmentGate": alignment_pass == result["gates"]["alignment"]["pass"],
    "psfGate": psf_pass == result["gates"]["psf"]["pass"],
    "apertureGate": aperture_pass == result["gates"]["aperture"]["pass"],
    "typedWarningGate": typed_warning_pass == result["gates"]["typedWarnings"]["pass"],
    "warningCounts": warning_count_by_image == result["warnings"]["warningCountByImage"],
    "receiptHashes": all(
        (ROOT / receipt["file"]).stat().st_size == receipt["bytes"] and digest(ROOT / receipt["file"]) == receipt["sha256"]
        for receipt in result["output"]["receipts"]
    ),
    "sealedAstStillClosed": result["gates"]["sealedAst"]["pass"] is False,
}

supported_alignment = [row for row in alignment_rows if row["expected"]]
supported_psf = [row for row in psf_rows if row["expected"]]
supported_aperture = [row for row in aperture_rows if row["expected"]]
audit = {
    "cycleId": "RC-2026-71",
    "experimentId": "PHOST-DETECTOR-BASELINE-1-NRCB2-INDEPENDENT-AUDIT",
    "reviewedOn": "2026-09-01",
    "status": "pass" if all(checks.values()) else "fail",
    "checks": checks,
    "recomputed": {
        "expectedImageIndices": sorted(expected),
        "matchedRange": [min(row["matched"] for row in supported_alignment), max(row["matched"] for row in supported_alignment)],
        "sigmaRangePixels": [min(row["sigmaPixels"] for row in supported_alignment), max(row["sigmaPixels"] for row in supported_alignment)],
        "psfStarRange": [min(row["stars"] for row in supported_psf), max(row["stars"] for row in supported_psf)],
        "maxAbsolutePsfAdjustment": max(abs(row["centralPixelAdjustment"]) for row in supported_psf),
        "apertureStarRange": [min(row["stars"] for row in supported_aperture), max(row["stars"] for row in supported_aperture)],
        "warningLines": len(warning_lines),
        "gates": {"geometry": geometry_pass, "alignment": alignment_pass, "psf": psf_pass, "aperture": aperture_pass, "typedWarnings": typed_warning_pass},
    },
    "independenceBoundary": "This parser uses only Python's standard library and committed text receipts. It shares neither the Node parser nor the DOLPHOT binary, but it does not independently rerun the photometric model.",
}

output = REPRO / "rc71-nrcb2-detector-baseline-python-audit.json"
output.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
print(json.dumps(audit, indent=2))
if audit["status"] != "pass":
    raise SystemExit(1)
