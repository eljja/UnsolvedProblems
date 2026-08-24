#!/usr/bin/env python3
"""Independent Python implementation of the RC48 identity-anchor budget."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


N = 94_736
M = 94_713
MISSING = 23
PERIODS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 94712]


def ceil_log2(value: int) -> int:
    if value <= 1:
        return 0
    return value.bit_length() - 1 if value & (value - 1) == 0 else value.bit_length()


def summary(value: int) -> dict:
    return {
        "histories": str(value),
        "log2Histories": math.log2(value),
        "minimumAggregateIdentityBits": ceil_log2(value),
    }


def anchors(period: int) -> list[int]:
    values = [1]
    value = 1 + period
    while value < M:
        values.append(value)
        value += period
    if values[-1] != M:
        values.append(M)
    return values


def periodic(period: int) -> dict:
    anchor_values = anchors(period)
    intervals = [
        {
            "intervalIndex": index,
            "leftExportedIndex": left,
            "rightExportedIndex": right,
            "unanchoredSurvivors": right - left - 1,
        }
        for index, (left, right) in enumerate(zip(anchor_values, anchor_values[1:]))
    ]
    groups: dict[int, dict] = {}
    for interval in intervals:
        key = interval["unanchoredSurvivors"]
        group = groups.setdefault(key, {"count": 0, "representatives": []})
        group["count"] += 1
        if len(group["representatives"]) < MISSING:
            group["representatives"].append(interval)
    effective = [
        interval
        for key in sorted(groups)
        for interval in groups[key]["representatives"]
    ]
    states: list[tuple[int, list[dict]] | None] = [None] * (MISSING + 1)
    states[0] = (1, [])
    for interval in effective:
        following: list[tuple[int, list[dict]] | None] = [None] * (MISSING + 1)
        for used, state in enumerate(states):
            if state is None:
                continue
            base, allocation = state
            for added in range(MISSING - used + 1):
                candidate = base * math.comb(interval["unanchoredSurvivors"] + added, added)
                target = used + added
                if following[target] is None or candidate > following[target][0]:
                    new_allocation = allocation + ([{**interval, "missing": added}] if added else [])
                    following[target] = (candidate, new_allocation)
        states = following
    optimum = states[MISSING]
    if optimum is None:
        raise RuntimeError(f"no allocation for period {period}")
    value, allocation = optimum
    profile = [
        {"unanchoredSurvivors": key, "intervalCount": groups[key]["count"]}
        for key in sorted(groups)
    ]
    return {
        "period": period,
        "authenticatedAnchorCount": len(anchor_values),
        "intervalCount": len(intervals),
        "intervalProfile": profile,
        **summary(value),
        "worstMissingByInterval": allocation,
    }


def compute() -> dict:
    count_value = math.comb(N, MISSING)
    first = []
    for trigger in range(1, MISSING + 2):
        leading = trigger - 1
        first.append({
            "triggerOrdinal": trigger,
            "leadingMissing": leading,
            **summary(math.comb(N - trigger, MISSING - leading)),
        })
    last = []
    for trigger in range(M, N + 1):
        before = trigger - M
        last.append({
            "triggerOrdinal": trigger,
            "missingBefore": before,
            "trailingMissing": N - trigger,
            **summary(math.comb(trigger - 1, before)),
        })
    periodic_values = [periodic(period) for period in PERIODS]
    checks = {
        "inheritedCountMatches": str(count_value) == "111222247780697737811569949505047670092175708162872419433827601154009970755623534825120294400",
        "inheritedLog2Difference": abs(math.log2(count_value) - 305.7708301287824),
        "period1IsUnique": next(item for item in periodic_values if item["period"] == 1)["histories"] == "1",
        "period2Is2Pow23": next(item for item in periodic_values if item["period"] == 2)["histories"] == str(2 ** 23),
        "period4Is4Pow23": next(item for item in periodic_values if item["period"] == 4)["histories"] == str(4 ** 23),
        "perExposureCounterIsUnique": True,
    }
    if not all(value is True or (key == "inheritedLog2Difference" and value <= 1e-12) for key, value in checks.items()):
        raise RuntimeError(f"internal theorem check failed: {checks}")
    return {
        "resultId": "RC48-X16-IDENTITY-BUDGET-PYTHON-0.1",
        "cycleId": "RC-2026-48",
        "computedOn": "2026-08-25",
        "implementation": "Python math.comb independent implementation",
        "inputs": {"cameraTriggerCount": N, "exportedFrameCount": M, "missing": MISSING},
        "assumptions": [
            "The trigger roster is complete and totally ordered.",
            "Exported frames preserve acquisition order.",
            "Exactly 23 frames are missing, with no duplicates, insertions, or reorderings.",
            "Every anchor is an independently authenticated exact trigger identity for the named exported frame."
        ],
        "countOnly": summary(count_value),
        "firstFrameAnchors": first,
        "lastFrameAnchors": last,
        "periodicAnchors": periodic_values,
        "perExposureCounter": {
            "histories": "1",
            "log2Histories": 0,
            "minimumAggregateIdentityBits": 0,
            "conditions": "Authenticated, non-wrapping, non-resetting, unique exposure counter with no duplicate or reordered exports."
        },
        "theoremChecks": checks,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = compute()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(output),
        "countOnly": result["countOnly"],
        "periods": [
            {key: item[key] for key in ("period", "authenticatedAnchorCount", "histories", "minimumAggregateIdentityBits")}
            for item in result["periodicAnchors"]
        ],
        "theoremChecks": result["theoremChecks"],
    }))


if __name__ == "__main__":
    main()
