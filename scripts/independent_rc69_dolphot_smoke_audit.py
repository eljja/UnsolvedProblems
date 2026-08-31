#!/usr/bin/env python3
"""Independently reconstruct RC69 smoke-test photometry from committed receipts."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import statistics
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPRO = ROOT / "research" / "reproducibility"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def rounded(value: float) -> float:
    return round(value, 6)


with (REPRO / "rc69-dolphot-smoke-selection.json").open(encoding="utf-8") as handle:
    selection = json.load(handle)
with (REPRO / "rc69-dolphot-smoke-result.json").open(encoding="utf-8") as handle:
    node_result = json.load(handle)
with (REPRO / "rc69-collision-injection-manifest.csv").open(encoding="utf-8", newline="") as handle:
    ledger = {row["injectionId"]: row for row in csv.DictReader(handle)}

rows: list[dict] = []
raw_receipts: list[dict] = []
for window in selection["windows"]:
    window_id = window["id"]
    raw_path = REPRO / f"rc69-dolphot-smoke-{window_id}-raw.txt"
    columns_path = REPRO / f"rc69-dolphot-smoke-{window_id}.columns.txt"
    raw_lines = [line for line in raw_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(raw_lines) == window["injectionCount"]

    columns = columns_path.read_text(encoding="utf-8").splitlines()
    assert columns[16].endswith("Instrumental VEGAMAG magnitude, NIRCAM_F090W")
    assert columns[29].endswith("Instrumental VEGAMAG magnitude, NIRCAM_F150W")

    for injection_id, line in zip(window["injectionIds"], raw_lines, strict=True):
        source = ledger[injection_id]
        values = [float(value) for value in line.split()]
        assert len(values) > 105
        injected, measured = values[:68], values[68:]
        assert injected[0:2] == [1.0, 1.0]
        assert measured[0:2] == [1.0, 1.0]
        assert abs(injected[2] - float(source["referenceX"])) < 0.011
        assert abs(injected[3] - float(source["referenceY"])) < 0.011
        f090_in = float(source["inputF090WVegaMag"])
        f150_in = float(source["inputF150WVegaMag"])
        assert all(abs(injected[5 + 2 * image] - f090_in) < 0.0011 for image in range(16))
        assert all(abs(injected[37 + 2 * image] - f150_in) < 0.0011 for image in range(16))
        f090_out, f150_out = measured[16], measured[29]
        recovered_f090 = math.isfinite(f090_out) and f090_out < 90
        recovered_f150 = math.isfinite(f150_out) and f150_out < 90
        rows.append(
            {
                "injectionId": injection_id,
                "collisionState": source["collisionState"],
                "recoveredF090W": recovered_f090,
                "recoveredF150W": recovered_f150,
                "residualF090WMag": rounded(f090_out - f090_in) if recovered_f090 else None,
                "residualF150WMag": rounded(f150_out - f150_in) if recovered_f150 else None,
            }
        )

    raw_receipts.append(
        {
            "window": window_id,
            "rows": len(raw_lines),
            "bytes": raw_path.stat().st_size,
            "sha256": sha256(raw_path),
        }
    )

assert len(rows) == 16
assert len({row["injectionId"] for row in rows}) == 16

state_summary: dict[str, dict] = {}
for state in ("blank", "isolated", "large-collision"):
    subset = [row for row in rows if row["collisionState"] == state]
    residual_f090 = [row["residualF090WMag"] for row in subset if row["residualF090WMag"] is not None]
    residual_f150 = [row["residualF150WMag"] for row in subset if row["residualF150WMag"] is not None]
    state_summary[state] = {
        "n": len(subset),
        "recoveryF090W": sum(row["recoveredF090W"] for row in subset) / len(subset),
        "recoveryF150W": sum(row["recoveredF150W"] for row in subset) / len(subset),
        "medianResidualF090WMag": rounded(statistics.median(residual_f090)),
        "medianResidualF150WMag": rounded(statistics.median(residual_f150)),
        "residualRangeF090WMag": [rounded(min(residual_f090)), rounded(max(residual_f090))],
        "residualRangeF150WMag": [rounded(min(residual_f150)), rounded(max(residual_f150))],
    }

assert state_summary == node_result["stateSummary"]
assert [receipt["sha256"] for receipt in raw_receipts] == [
    receipt["rawAstSha256"] for receipt in node_result["baselineReceipts"]
]

audit = {
    "cycleId": "RC-2026-69",
    "auditId": "PHOST-COLLISION-AST-1-SMOKE-PYTHON-AUDIT",
    "reviewedOn": "2026-09-01",
    "status": "pass",
    "implementation": "Python standard library; direct parse of committed DOLPHOT raw rows and generated column receipts",
    "ledger": {
        "rows": len(rows),
        "uniqueInjectionIds": len({row["injectionId"] for row in rows}),
        "typedNonDetections": sum(not row["recoveredF090W"] or not row["recoveredF150W"] for row in rows),
    },
    "columnContract": {
        "artificialStarInputColumns": 68,
        "combinedF090WVegaMagOneBased": 17,
        "combinedF150WVegaMagOneBased": 30,
        "passDetectedColumnPreserved": True,
    },
    "stateSummary": state_summary,
    "rawReceipts": raw_receipts,
    "agreement": "Exact agreement with the Node adjudicator for row identity, raw hashes, recovery fractions, medians, and ranges.",
    "scientificBoundary": "This audit verifies parsing and arithmetic only; it does not turn the 16-row smoke run into an inferential collision-bias test.",
}

(REPRO / "rc69-dolphot-smoke-python-audit.json").write_text(
    json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
)
print(json.dumps(audit, indent=2, ensure_ascii=False))
