#!/usr/bin/env python3
import argparse
import binascii
import csv
import hashlib
import io
import json
import os
import struct
import subprocess
import sys
import urllib.request
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 134_217_728
XYPT_URL = "https://data.nist.gov/od/ds/ark:/88434/mds2-2309/XYPT_L001-025.zip"
AVI_URL = "https://data.nist.gov/od/ds/ark:/88434/mds2-2309/MPMcameraAVI_L001-025.zip"
XYPT_BYTES = 159_164_372
AVI_BYTES = 5_037_696_861
SEVEN_ZIP_CANDIDATES = [
    Path(r"C:\Program Files\AMD\CIM\Bin64\7z.exe"),
    Path(r"C:\Program Files\NVIDIA Corporation\NVIDIA App\7z.exe"),
    Path(r"C:\Program Files (x86)\AllDup\dep\7z.exe"),
]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


class RangeReader:
    def __init__(self, url, official_bytes, label):
        self.url = url
        self.official_bytes = official_bytes
        self.label = label
        self.transferred_bytes = 0
        self.receipts = []

    def read(self, start, end, purpose):
        if start < 0 or end < start or end >= self.official_bytes:
            raise ValueError(f"invalid range {start}-{end} for {self.label}")
        requested = end - start + 1
        request = urllib.request.Request(self.url, headers={"Range": f"bytes={start}-{end}"})
        with urllib.request.urlopen(request, timeout=120) as response:
            status = response.status
            content_range = response.headers.get("Content-Range")
            body = response.read()
        expected = f"bytes {start}-{end}/{self.official_bytes}"
        if status != 206 or content_range != expected or len(body) != requested:
            raise RuntimeError(f"range mismatch for {self.label}: status={status}, range={content_range}, bytes={len(body)}")
        self.transferred_bytes += len(body)
        self.receipts.append({
            "purpose": purpose, "start": start, "end": end, "bytes": len(body),
            "contentRange": content_range, "bodySha256": sha256(body)
        })
        return body


def u16(data, offset):
    return struct.unpack_from("<H", data, offset)[0]


def u32(data, offset):
    return struct.unpack_from("<I", data, offset)[0]


def u64(data, offset):
    return struct.unpack_from("<Q", data, offset)[0]


def find_last_signature(data, signature):
    needle = struct.pack("<I", signature)
    return data.rfind(needle)


def zip64_extra(extra, needs):
    cursor = 0
    while cursor + 4 <= len(extra):
        field_id = u16(extra, cursor)
        size = u16(extra, cursor + 2)
        payload = extra[cursor + 4:cursor + 4 + size]
        if field_id == 1:
            out, pos = {}, 0
            for name, width in (("uncompressedSize", 8), ("compressedSize", 8), ("localHeaderOffset", 8), ("diskStart", 4)):
                if needs.get(name):
                    if pos + width > len(payload):
                        raise RuntimeError(f"truncated ZIP64 {name}")
                    out[name] = u64(payload, pos) if width == 8 else u32(payload, pos)
                    pos += width
            return out
        cursor += 4 + size
    return {}


def read_central(reader):
    tail_len = min(reader.official_bytes, 1_048_576)
    tail_start = reader.official_bytes - tail_len
    tail = reader.read(tail_start, reader.official_bytes - 1, "ZIP end records")
    eocd_at = find_last_signature(tail, 0x06054B50)
    if eocd_at < 0:
        raise RuntimeError("EOCD not found")
    directory = {
        "disk": u16(tail, eocd_at + 4), "centralDirectoryDisk": u16(tail, eocd_at + 6),
        "entriesOnDisk": u16(tail, eocd_at + 8), "entries": u16(tail, eocd_at + 10),
        "centralDirectorySize": u32(tail, eocd_at + 12), "centralDirectoryOffset": u32(tail, eocd_at + 16),
        "usesZip64": False
    }
    if directory["entries"] == 0xFFFF or directory["centralDirectorySize"] == 0xFFFFFFFF or directory["centralDirectoryOffset"] == 0xFFFFFFFF:
        locator_at = find_last_signature(tail[:eocd_at], 0x07064B50)
        if locator_at < 0:
            raise RuntimeError("ZIP64 locator not found")
        zip64_offset = u64(tail, locator_at + 8)
        record = reader.read(zip64_offset, zip64_offset + 55, "ZIP64 EOCD record")
        if u32(record, 0) != 0x06064B50:
            raise RuntimeError("bad ZIP64 EOCD")
        directory = {
            "usesZip64": True, "disk": u32(record, 16), "centralDirectoryDisk": u32(record, 20),
            "entriesOnDisk": u64(record, 24), "entries": u64(record, 32),
            "centralDirectorySize": u64(record, 40), "centralDirectoryOffset": u64(record, 48),
            "zip64Offset": zip64_offset
        }
    start = directory["centralDirectoryOffset"]
    central = reader.read(start, start + directory["centralDirectorySize"] - 1, "ZIP central directory")
    entries, cursor = [], 0
    while cursor < len(central):
        if cursor + 46 > len(central) or u32(central, cursor) != 0x02014B50:
            raise RuntimeError(f"malformed central directory at {cursor}")
        flags, method = u16(central, cursor + 8), u16(central, cursor + 10)
        crc, comp32, uncomp32 = u32(central, cursor + 16), u32(central, cursor + 20), u32(central, cursor + 24)
        name_len, extra_len, comment_len = u16(central, cursor + 28), u16(central, cursor + 30), u16(central, cursor + 32)
        disk32, local32 = u16(central, cursor + 34), u32(central, cursor + 42)
        name_bytes = central[cursor + 46:cursor + 46 + name_len]
        extra = central[cursor + 46 + name_len:cursor + 46 + name_len + extra_len]
        needs = {"uncompressedSize": uncomp32 == 0xFFFFFFFF, "compressedSize": comp32 == 0xFFFFFFFF,
                 "localHeaderOffset": local32 == 0xFFFFFFFF, "diskStart": disk32 == 0xFFFF}
        z64 = zip64_extra(extra, needs)
        entries.append({
            "name": name_bytes.decode("utf-8" if flags & 0x800 else "latin-1"), "flags": flags, "method": method,
            "crc32": f"{crc:08x}", "compressedSize": z64.get("compressedSize", comp32),
            "uncompressedSize": z64.get("uncompressedSize", uncomp32),
            "localHeaderOffset": z64.get("localHeaderOffset", local32), "diskStart": z64.get("diskStart", disk32)
        })
        cursor += 46 + name_len + extra_len + comment_len
    if len(entries) != directory["entries"]:
        raise RuntimeError("entry count mismatch")
    return {"directory": directory, "centralDirectorySha256": sha256(central), "entries": entries}


def find_entry(entries, expected):
    matches = [entry for entry in entries if entry["name"] == expected or entry["name"].split("/")[-1] == expected]
    if len(matches) != 1:
        raise RuntimeError(f"expected one {expected}, found {len(matches)}")
    return matches[0]


def read_local(reader, entry):
    offset = entry["localHeaderOffset"]
    fixed = reader.read(offset, offset + 29, f"{entry['name']} local header")
    if u32(fixed, 0) != 0x04034B50:
        raise RuntimeError("bad local header")
    flags, method, name_len, extra_len = u16(fixed, 6), u16(fixed, 8), u16(fixed, 26), u16(fixed, 28)
    variable = reader.read(offset + 30, offset + 29 + name_len + extra_len, f"{entry['name']} local name and extra")
    name = variable[:name_len].decode("utf-8" if flags & 0x800 else "latin-1")
    if name != entry["name"] or flags != entry["flags"] or method != entry["method"]:
        raise RuntimeError("local/central mismatch")
    return {"dataOffset": offset + 30 + name_len + extra_len, "headerBytes": 30 + name_len + extra_len}


def extract_complete(reader, entry):
    local = read_local(reader, entry)
    compressed = reader.read(local["dataOffset"], local["dataOffset"] + entry["compressedSize"] - 1, f"{entry['name']} complete compressed member")
    if entry["method"] == 0:
        plain = compressed
    elif entry["method"] == 8:
        plain = zlib.decompress(compressed, -15)
    else:
        raise RuntimeError(f"unsupported complete-member method {entry['method']}")
    if len(plain) != entry["uncompressedSize"] or f"{binascii.crc32(plain) & 0xffffffff:08x}" != entry["crc32"]:
        raise RuntimeError("complete-member integrity mismatch")
    return plain


def parse_xypt(data):
    text = data.decode("utf-8-sig")
    rows = 0
    nonzero = 0
    first_nonzero = None
    last_nonzero = None
    masks = {}
    preview = []
    for raw in text.splitlines():
        if not raw.strip():
            continue
        if len(preview) < 8:
            preview.append(raw)
        fields = next(csv.reader([raw]))
        if len(fields) != 4:
            raise RuntimeError(f"XYPT row {rows} does not contain four fields")
        values = [float(field.strip()) for field in fields]
        trigger = values[3]
        if not trigger.is_integer() or trigger < 0 or trigger > 255:
            raise RuntimeError(f"invalid trigger at row {rows}")
        trigger_int = int(trigger)
        masks[str(trigger_int)] = masks.get(str(trigger_int), 0) + 1
        if trigger_int != 0:
            if first_nonzero is None:
                first_nonzero = rows
            last_nonzero = rows
            nonzero += 1
        rows += 1
    return {
        "textSha256": sha256(data), "bytes": len(data), "lineCount": rows, "preview": preview,
        "parseStatus": "parsed-headerless-four-column-per-primary-format", "triggerColumn": 3,
        "numericDataRows": rows, "nonzeroTriggerRows": nonzero, "triggerValueCounts": masks,
        "firstNonzeroDataIndex": first_nonzero, "lastNonzeroDataIndex": last_nonzero
    }


def decode_partial(segment, label):
    seven_zip = next((candidate for candidate in SEVEN_ZIP_CANDIDATES if candidate.exists()), None)
    if seven_zip is None:
        raise RuntimeError("7z.exe not found")
    cache = ROOT / ".cache" / "rc43-x16" / "python-prefix-decode"
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / f"{label}.partial.zip"
    archive.write_bytes(segment)
    run = subprocess.run([str(seven_zip), "x", "-so", "-bso0", "-bsp0", "-bse2", str(archive)], capture_output=True)
    stderr = run.stderr.decode("utf-8", errors="replace")
    if run.returncode != 2 or "Unexpected end of archive" not in stderr:
        raise RuntimeError(f"unexpected partial decode result {run.returncode}: {stderr[-500:]}")
    return {
        "decoderPath": str(seven_zip), "exitCode": run.returncode, "stderrTail": stderr[-300:],
        "archiveBytes": len(segment), "archivePrefixSha256": sha256(segment),
        "decodedBytes": len(run.stdout), "decodedSha256": sha256(run.stdout), "bytes": run.stdout
    }


def parse_avi(data):
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"AVI ":
        raise RuntimeError("stable prefix is not RIFF/AVI")
    counters = []
    signatures = {}
    for offset in range(12, len(data) - 8, 2):
        chunk = data[offset:offset + 4]
        if chunk in (b"avih", b"strh", b"dmlh", b"indx", b"idx1", b"movi", b"LIST"):
            name = chunk.decode("ascii")
            signatures[name] = signatures.get(name, 0) + 1
            if chunk == b"avih" and offset + 64 <= len(data):
                counters.append({"source": "avih.dwTotalFrames", "value": u32(data, offset + 24), "offset": offset})
            elif chunk == b"strh" and offset + 64 <= len(data) and data[offset + 8:offset + 12] == b"vids":
                counters.append({"source": "strh.dwLength", "value": u32(data, offset + 40), "offset": offset})
            elif chunk == b"dmlh" and offset + 12 <= len(data):
                counters.append({"source": "dmlh.dwTotalFrames", "value": u32(data, offset + 8), "offset": offset})
    return {"parseStatus": "parsed-prefix", "prefixBytes": len(data), "prefixSha256": sha256(data),
            "riffDeclaredBytes": u32(data, 4) + 8, "counters": counters, "chunkSignatures": signatures}


def summarize(entry):
    return {key: entry[key] for key in ("name", "method", "flags", "crc32", "compressedSize", "uncompressedSize", "localHeaderOffset")}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--layer", type=int, choices=(1, 2), required=True)
    parser.add_argument("--prior-upper-bound", type=int, required=True)
    parser.add_argument("--compare", required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    xypt_reader = RangeReader(XYPT_URL, XYPT_BYTES, "XYPT_L001-025.zip")
    avi_reader = RangeReader(AVI_URL, AVI_BYTES, "MPMcameraAVI_L001-025.zip")
    xypt_directory = read_central(xypt_reader)
    avi_directory = read_central(avi_reader)
    xypt_entry = find_entry(xypt_directory["entries"], f"XYPT_L{args.layer:04d}.csv")
    avi_entry = find_entry(avi_directory["entries"], f"MPMcamera_L{args.layer:04d}.avi")
    xypt = parse_xypt(extract_complete(xypt_reader, xypt_entry))
    local = read_local(avi_reader, avi_entry)
    segment_a = avi_reader.read(avi_entry["localHeaderOffset"], avi_entry["localHeaderOffset"] + 4_194_303, f"L{args.layer:04d} AVI member-relative segment A")
    segment_b = avi_reader.read(avi_entry["localHeaderOffset"], avi_entry["localHeaderOffset"] + 8_388_607, f"L{args.layer:04d} AVI member-relative segment B")
    decoded_a = decode_partial(segment_a, f"l{args.layer:04d}-prefix-a")
    decoded_b = decode_partial(segment_b, f"l{args.layer:04d}-prefix-b")
    discard = 65_536
    if len(decoded_a["bytes"]) <= discard or len(decoded_b["bytes"]) <= discard:
        raise RuntimeError("decoded prefix too short")
    retained_a = decoded_a["bytes"][:-discard]
    retained_b = decoded_b["bytes"][:-discard]
    if len(retained_b) < len(retained_a) or retained_b[:len(retained_a)] != retained_a:
        raise RuntimeError("nested retained prefixes disagree")
    avi = parse_avi(retained_a)
    frame_counts = sorted(set(counter["value"] for counter in avi["counters"]))
    if len(frame_counts) != 1:
        raise RuntimeError("native AVI counters disagree")
    trigger_count = xypt["nonzeroTriggerRows"]
    mask2 = xypt["triggerValueCounts"].get("2", 0)
    frame_count = frame_counts[0]
    deficit = trigger_count - frame_count
    compare = json.loads((ROOT / args.compare).read_text(encoding="utf-8"))
    comparisons = {
        "triggerCount": trigger_count == compare["adjudication"]["triggerCount"],
        "cameraMask2Rows": mask2 == compare["adjudication"]["cameraMask2Rows"],
        "frameCount": frame_count == compare["adjudication"]["frameCount"],
        "triggerMinusFrame": deficit == compare["adjudication"]["triggerMinusFrame"],
        "xyptSha256": xypt["textSha256"] == compare["xypt"]["textSha256"],
        "aviRetainedSha256": sha256(retained_a) == compare["avi"]["retainedASha256"],
        "nativeCounters": avi["counters"] == compare["avi"]["counters"]
    }
    this_bytes = xypt_reader.transferred_bytes + avi_reader.transferred_bytes
    cumulative = args.prior_upper_bound + this_bytes
    if cumulative > MAX_BYTES:
        raise RuntimeError("global cumulative transfer ceiling exceeded")
    result = {
        "auditId": f"RC43-X16-L{args.layer:04d}-INDEPENDENT-PYTHON-AUDIT-0.1", "cycleId": "RC-2026-43",
        "createdOn": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "layer": args.layer, "implementation": "independent Python standard-library ZIP64, XYPT, and AVI parser with shared 7-Zip Deflate64 decoder",
        "xypt": {**xypt, "selected": summarize(xypt_entry), "cameraMask2Rows": mask2, "centralDirectorySha256": xypt_directory["centralDirectorySha256"]},
        "avi": {**avi, "selected": summarize(avi_entry), "discardBytes": discard,
                "prefixA": {key: value for key, value in decoded_a.items() if key != "bytes"},
                "prefixB": {key: value for key, value in decoded_b.items() if key != "bytes"},
                "retainedABytes": len(retained_a), "retainedASha256": sha256(retained_a),
                "retainedBBytes": len(retained_b), "nestedRetainedPrefixAgreement": True,
                "localDataOffset": local["dataOffset"]},
        "adjudication": {"triggerCount": trigger_count, "cameraMask2Rows": mask2, "frameCount": frame_count,
                         "triggerMinusFrame": deficit, "countDirection": "fewer-frames-than-triggers" if deficit > 0 else "more-frames-than-triggers" if deficit < 0 else "equal",
                         "exactNullLedger": False, "qualification": "aggregate-count-reproduced-slot-placement-not-identifiable"},
        "comparisonToJavaScript": {"path": args.compare, "checks": comparisons, "passed": all(comparisons.values())},
        "transfer": {"maximumCumulativeBytes": MAX_BYTES, "conservativePriorUpperBound": args.prior_upper_bound,
                     "thisExecutionBytes": this_bytes, "cumulativeUpperBound": cumulative,
                     "remainingConservativeBytes": MAX_BYTES - cumulative,
                     "receipts": {"xypt": xypt_reader.receipts, "avi": avi_reader.receipts}}
    }
    if args.write:
        output = ROOT / "research" / "reproducibility" / f"rc43-x16-layer-{args.layer:04d}-python-audit.json"
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {output.relative_to(ROOT)}")
    print(json.dumps({"layer": args.layer, "triggerCount": trigger_count, "cameraMask2Rows": mask2,
                      "frameCount": frame_count, "triggerMinusFrame": deficit,
                      "comparisonPassed": all(comparisons.values()), "transfer": result["transfer"]}, indent=2))


if __name__ == "__main__":
    main()
