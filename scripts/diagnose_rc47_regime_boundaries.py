"""Outcome-aware RC47 diagnostic. It cannot alter or rescue the sealed gate."""
import hashlib
import json
import pathlib
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from run_rc47_self_deletion import (  # noqa: E402
    N, PARTITIONS, RAW, base_descriptors, features_for_gap, make_scales
)

MODEL_PATH = ROOT / "research" / "reproducibility" / "rc47-self-deletion-python.json"
XYPT_PATH = ROOT / ".cache" / "rc44-x16" / "l0002" / "extracted" / "XYPT_L0002.csv"
OUTPUT = ROOT / "research" / "reproducibility" / "rc47-regime-boundary-diagnostic.json"


def frame_digest(frame):
    return hashlib.sha256(np.asarray(frame, dtype=np.uint8).tobytes()).hexdigest()


def percentile_rank(sorted_values, value):
    return float(np.searchsorted(sorted_values, value, side="right") / len(sorted_values))


def main():
    primary = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    frames = np.memmap(RAW, dtype=np.uint8, mode="r", shape=(N, 32, 32))
    scales = make_scales(frames)
    descriptors = base_descriptors(frames)
    xypt = np.loadtxt(XYPT_PATH, delimiter=",", dtype=np.float64)
    integer_trigger = np.rint(xypt[:, 3]).astype(np.int64)
    trigger_rows = xypt[(integer_trigger & 2) != 0]
    if len(trigger_rows) != N:
        raise RuntimeError(f"trigger rows {len(trigger_rows)} != frames {N}")
    trigger_steps = np.hypot(np.diff(trigger_rows[:, 0]), np.diff(trigger_rows[:, 1]))
    sorted_steps = np.sort(trigger_steps)
    image_steps = np.mean(np.abs(frames[1:].astype(np.float64) - frames[:-1].astype(np.float64)), axis=(1, 2))
    sorted_image_steps = np.sort(image_steps)
    test_start, test_end = PARTITIONS["sealedTest"]
    starts = np.arange(test_start + 1, test_end - 2, dtype=np.int64)
    block_diagnostics = {}
    for block in (1, 2, 4, 8):
        stored = primary["selectedModels"][str(block)]
        mean = np.asarray(stored["mean"], dtype=np.float64)
        scale = np.asarray(stored["scale"], dtype=np.float64)
        weight = np.asarray(stored["weight"], dtype=np.float64)
        features, _ = features_for_gap(scales, descriptors, starts, 1)
        scores = ((features - mean) / scale) @ weight
        order = np.lexsort((starts, -scores))[:10]
        rows = []
        for index in order:
            start = int(starts[index])
            frame_ids = list(range(start - 1, start + 3))
            command = trigger_rows[frame_ids, :3]
            step_window = np.hypot(np.diff(command[:, 0]), np.diff(command[:, 1]))
            vectors = np.diff(command[:, :2], axis=0)
            left_norm = np.linalg.norm(vectors[0])
            center_norm = np.linalg.norm(vectors[1])
            turn_cosine = None
            if left_norm > 0 and center_norm > 0:
                turn_cosine = float(np.dot(vectors[0], vectors[1]) / (left_norm * center_norm))
            rows.append({
                "rank": len(rows) + 1,
                "startOrdinal": start,
                "score": float(scores[index]),
                "aboveValidationThreshold": bool(scores[index] > stored["threshold"]),
                "image": {
                    "frameMeans": [float(descriptors["intensity"][value]) for value in frame_ids],
                    "adjacentMad": [float(image_steps[value]) for value in range(start - 1, start + 2)],
                    "centerMadPercentileAllL0002": percentile_rank(sorted_image_steps, image_steps[start]),
                    "frameSha256": [frame_digest(frames[value]) for value in frame_ids]
                },
                "commandOrdinalAssumption": {
                    "xyPower": command.tolist(),
                    "stepDistances": step_window.tolist(),
                    "centerStepPercentileAllL0002": percentile_rank(sorted_steps, trigger_steps[start]),
                    "incomingToCenterDirectionCosine": turn_cosine,
                    "warning": "This comparison uses count-equal ordinal pairing; no public identity ledger authenticates the mapping."
                }
            })
        block_diagnostics[str(block)] = {"selectedFamily": stored["family"], "validationThreshold": stored["threshold"], "topNaturalTransitions": rows}
    repeated_top = {}
    for block, value in block_diagnostics.items():
        start = str(value["topNaturalTransitions"][0]["startOrdinal"])
        repeated_top.setdefault(start, []).append(block)
    result = {
        "diagnosticId": "RC47-X16-REGIME-BOUNDARY-DIAGNOSTIC-0.1",
        "cycleId": "RC-2026-47",
        "createdOn": "2026-08-24",
        "status": "exploratory-after-sealed-gate-failure",
        "purpose": "Identify whether the false-alarm maxima are isolated codec/image events or coincide with large command-state transitions under the explicitly unauthenticated count-equal ordinal mapping.",
        "inputs": {
            "primaryResult": "research/reproducibility/rc47-self-deletion-python.json",
            "rawSha256": primary["inputs"]["rawSha256"],
            "xyptSha256": hashlib.sha256(XYPT_PATH.read_bytes()).hexdigest(),
            "triggerRows": int(len(trigger_rows))
        },
        "repeatedTopNaturalStarts": repeated_top,
        "blocks": block_diagnostics,
        "boundary": "This diagnostic was designed after viewing RC47 outcomes. It may explain failure and propose a future state-conditioned test, but it cannot change thresholds, pass RC47, or authorize L0001."
    }
    if "--write" in sys.argv:
        OUTPUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    summary = {
        block: {
            "family": value["selectedFamily"],
            "top": value["topNaturalTransitions"][0]
        } for block, value in block_diagnostics.items()
    }
    print(json.dumps({"repeatedTopNaturalStarts": repeated_top, "summary": summary}, indent=2))


if __name__ == "__main__":
    main()
