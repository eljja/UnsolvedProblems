import argparse
import array
import hashlib
import json
import os
import struct
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AVI = ROOT / ".cache" / "rc44-x16" / "l0002" / "extracted" / "MPMcamera_L0002.avi"
FFMPEG = ROOT / ".cache" / "rc44-python" / "imageio_ffmpeg" / "binaries" / "ffmpeg-win-x86_64-v7.1.exe"
WIDTH = 120
HEIGHT = 120
PLANE_BYTES = WIDTH * HEIGHT
FRAME_BYTES = PLANE_BYTES * 3
EXPECTED_FRAMES = 95_504
BOUNDARIES = (
    ("top-left", (0, 1, 2, 3)),
    ("top-right", (116, 117, 118, 119)),
    ("bottom-left", (119 * WIDTH, 119 * WIDTH + 1, 119 * WIDTH + 2, 119 * WIDTH + 3)),
    ("bottom-right", (119 * WIDTH + 116, 119 * WIDTH + 117, 119 * WIDTH + 118, 119 * WIDTH + 119)),
)
PLANES = (("g", 0), ("b", PLANE_BYTES), ("r", 2 * PLANE_BYTES))


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_exact(stream, size):
    chunks = []
    remaining = size
    while remaining:
        chunk = stream.read(remaining)
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def candidate_id(boundary, plane, byte_order):
    return f"{boundary}:{plane}:{byte_order}"


def extract():
    expected_avi = "54bc90814acf15304257ee4c9c56f029d50999ab38b9c27455137a12f884b53a"
    expected_ffmpeg = "2ce797a0f88d7f067180338fb227f7b1928ea727bd9a4d7a1d022f7c52af71a3"
    if sha256_file(AVI) != expected_avi or sha256_file(FFMPEG) != expected_ffmpeg:
        raise RuntimeError("RC45 hash-bound input or decoder changed")
    command = [
        str(FFMPEG), "-v", "error", "-i", str(AVI), "-map", "0:v:0",
        "-fps_mode", "passthrough", "-pix_fmt", "gbrp", "-f", "rawvideo", "pipe:1"
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=0x08000000 if os.name == "nt" else 0)
    series = {}
    for boundary, _ in BOUNDARIES:
        for plane, _ in PLANES:
            for byte_order in ("little", "big"):
                series[candidate_id(boundary, plane, byte_order)] = array.array("I")
    boundary_hash = hashlib.sha256()
    frames = 0
    while True:
        frame = read_exact(process.stdout, FRAME_BYTES)
        if not frame:
            break
        if len(frame) != FRAME_BYTES:
            process.kill()
            raise RuntimeError(f"partial raw frame {frames}: {len(frame)} bytes")
        record = bytearray()
        for _, positions in BOUNDARIES:
            for _, plane_offset in PLANES:
                record.extend(frame[plane_offset + position] for position in positions)
        boundary_hash.update(record)
        cursor = 0
        for boundary, _ in BOUNDARIES:
            for plane, _ in PLANES:
                pixels = record[cursor:cursor + 4]
                cursor += 4
                series[candidate_id(boundary, plane, "little")].append(int.from_bytes(pixels, "little"))
                series[candidate_id(boundary, plane, "big")].append(int.from_bytes(pixels, "big"))
        frames += 1
    stderr = process.stderr.read().decode("utf-8", errors="replace")
    exit_code = process.wait()
    if exit_code != 0:
        raise RuntimeError(f"FFmpeg failed with {exit_code}: {stderr[-2000:]}")
    if frames != EXPECTED_FRAMES:
        raise RuntimeError(f"decoded {frames} frames, expected {EXPECTED_FRAMES}")
    return command, frames, boundary_hash.hexdigest(), series


def summarize(values):
    differences = [((int(values[index]) - int(values[index - 1])) & 0xFFFFFFFF) for index in range(1, len(values))]
    unit = sum(value == 1 for value in differences)
    zero = sum(value == 0 for value in differences)
    reverse = sum(value > 0x7FFFFFFF for value in differences)
    greater = sum(1 < value <= 0x7FFFFFFF for value in differences)
    maximum_forward = max((value for value in differences if value <= 0x7FFFFFFF), default=0)
    total_missing = sum(value - 1 for value in differences if 1 < value <= 0x7FFFFFFF)
    value_hash = hashlib.sha256()
    for value in values:
        value_hash.update(struct.pack("<I", value))
    return {
        "firstValue": int(values[0]),
        "lastValue": int(values[-1]),
        "unitStepCount": unit,
        "unitStepFraction": unit / len(differences),
        "zeroStepCount": zero,
        "reverseOrWrapInconsistentCount": reverse,
        "greaterThanOneForwardCount": greater,
        "maximumForwardDifference": maximum_forward,
        "uniqueValueCount": len(set(values)),
        "moduloSpan": (int(values[-1]) - int(values[0])) & 0xFFFFFFFF,
        "totalForwardMissing": str(total_missing),
        "seriesUint32LeSha256": value_hash.hexdigest(),
        "exactUnitProgression": unit == len(differences),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    command, frame_count, boundary_hash, series = extract()
    candidates = []
    for name, values in series.items():
        boundary, plane, byte_order = name.split(":")
        candidates.append({"id": name, "boundary": boundary, "plane": plane, "byteOrder": byte_order, **summarize(values)})
    passing = [item["id"] for item in candidates if item["exactUnitProgression"] and item["uniqueValueCount"] == frame_count and item["moduloSpan"] == frame_count - 1]
    result = {
        "resultId": "RC45-X16-L0002-PYTHON-COUNTER-0.1",
        "cycleId": "RC-2026-45",
        "createdOn": "2026-08-21",
        "implementation": "Python standard library",
        "precommit": "research/reproducibility/rc45-in-frame-counter-precommit.json",
        "input": {"path": str(AVI.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256_file(AVI)},
        "decoder": {"path": str(FFMPEG.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256_file(FFMPEG), "pixelFormat": "gbrp", "sharedAcrossImplementations": True},
        "command": command,
        "frameCount": frame_count,
        "boundaryRecordBytesPerFrame": 48,
        "rawBoundaryRecordSha256": boundary_hash,
        "candidates": candidates,
        "passingCandidates": passing,
        "gatePassedLocally": len(passing) > 0,
        "boundary": "A passing sequence establishes a decoded direct marker under the documented counter rule; it does not by itself anchor the first value to the first XYPT trigger."
    }
    if args.write:
        output = ROOT / "research" / "reproducibility" / "rc45-x16-layer-0002-python-counter.json"
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: result[key] for key in ("resultId", "frameCount", "rawBoundaryRecordSha256", "passingCandidates", "gatePassedLocally")}, indent=2))


if __name__ == "__main__":
    main()
