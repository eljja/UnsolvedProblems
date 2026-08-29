#!/usr/bin/env python3
"""Audit the Aurora Zenodo ZIP directory and metadata without opening cycling outcomes."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import struct
import urllib.request
import zlib
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "research" / "reproducibility" / "rc56-aurora-source-audit.json"
RECORD_URL = "https://zenodo.org/api/records/15481956"
ZIP_URL = "https://zenodo.org/api/records/15481956/files/Dataset-rocrate.zip/content"
ZIP_SIZE = 2_507_129_091


def request_bytes(url: str, start: int | None = None, end: int | None = None) -> bytes:
    headers = {"User-Agent": "UnsolvedProblems-RC56-Audit"}
    if start is not None and end is not None:
        headers["Range"] = f"bytes={start}-{end}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=90) as response:
        return response.read()


def central_directory():
    tail_size = min(262_144, ZIP_SIZE)
    tail_start = ZIP_SIZE - tail_size
    tail = request_bytes(ZIP_URL, tail_start, ZIP_SIZE - 1)
    eocd_at = tail.rfind(b"PK\x05\x06")
    if eocd_at < 0:
        raise RuntimeError("ZIP end-of-central-directory record not found")
    eocd = struct.unpack_from("<4s4H2LH", tail, eocd_at)
    entries_total, directory_size, directory_offset = eocd[4], eocd[5], eocd[6]
    if 0xFFFF in (entries_total,) or 0xFFFFFFFF in (directory_size, directory_offset):
        raise RuntimeError("ZIP64 central directory is not supported by this audit")
    directory = request_bytes(ZIP_URL, directory_offset, directory_offset + directory_size - 1)
    entries = []
    cursor = 0
    while cursor < len(directory):
        if directory[cursor : cursor + 4] != b"PK\x01\x02":
            raise RuntimeError(f"invalid central-directory signature at {cursor}")
        fields = struct.unpack_from("<6H3L5H2L", directory, cursor + 4)
        flags, compression = fields[2], fields[3]
        crc32, compressed_size, uncompressed_size = fields[6], fields[7], fields[8]
        name_length, extra_length, comment_length = fields[9], fields[10], fields[11]
        local_offset = fields[15]
        name_start = cursor + 46
        name_bytes = directory[name_start : name_start + name_length]
        name = name_bytes.decode("utf-8" if flags & 0x800 else "cp437")
        entries.append(
            {
                "name": name,
                "flags": flags,
                "compression": compression,
                "crc32": crc32,
                "compressedSize": compressed_size,
                "uncompressedSize": uncompressed_size,
                "localOffset": local_offset,
            }
        )
        cursor = name_start + name_length + extra_length + comment_length
    if len(entries) != entries_total:
        raise RuntimeError(f"central directory reports {entries_total} entries, parsed {len(entries)}")
    return entries, {
        "entryCount": entries_total,
        "centralDirectoryOffset": directory_offset,
        "centralDirectorySize": directory_size,
        "tailSha256": hashlib.sha256(tail).hexdigest(),
        "centralDirectorySha256": hashlib.sha256(directory).hexdigest(),
    }


def extract_entry(entry: dict) -> bytes:
    header = request_bytes(ZIP_URL, entry["localOffset"], entry["localOffset"] + 29)
    if header[:4] != b"PK\x03\x04":
        raise RuntimeError(f"invalid local header for {entry['name']}")
    fields = struct.unpack_from("<5H3L2H", header, 4)
    name_length, extra_length = fields[-2], fields[-1]
    data_start = entry["localOffset"] + 30 + name_length + extra_length
    compressed = request_bytes(ZIP_URL, data_start, data_start + entry["compressedSize"] - 1)
    if entry["compression"] == 0:
        payload = compressed
    elif entry["compression"] == 8:
        payload = zlib.decompress(compressed, -15)
    else:
        raise RuntimeError(f"unsupported compression {entry['compression']} for {entry['name']}")
    if len(payload) != entry["uncompressedSize"]:
        raise RuntimeError(f"size mismatch for {entry['name']}")
    if zlib.crc32(payload) & 0xFFFFFFFF != entry["crc32"]:
        raise RuntimeError(f"CRC mismatch for {entry['name']}")
    return payload


def leaf_pairs(value, prefix=""):
    pairs = []
    if isinstance(value, dict):
        for key in sorted(value):
            path = f"{prefix}.{key}" if prefix else key
            pairs.extend(leaf_pairs(value[key], path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            pairs.extend(leaf_pairs(item, f"{prefix}[{index}]"))
    elif isinstance(value, (str, int, float, bool)) or value is None:
        pairs.append((prefix, value))
    return pairs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    record = json.loads(request_bytes(RECORD_URL).decode("utf-8"))
    entries, directory = central_directory()
    metadata_entries = [entry for entry in entries if entry["name"].endswith(".metadata.json")]
    metadata = []
    key_counts = Counter()
    value_counts = Counter()
    for entry in metadata_entries:
        payload = extract_entry(entry)
        document = json.loads(payload.decode("utf-8"))
        leaves = leaf_pairs(document)
        key_counts.update(path for path, _ in leaves)
        for path, value in leaves:
            if isinstance(value, str):
                lowered = value.lower()
                if any(token in lowered for token in ("lfp", "lifepo", "graphite", "3.65", "1000")):
                    value_counts[(path, value)] += 1
        metadata.append(
            {
                "name": entry["name"],
                "sha256": hashlib.sha256(payload).hexdigest(),
                "topLevelKeys": sorted(document.keys()) if isinstance(document, dict) else [],
                "matchedLeaves": [
                    {"path": path, "value": value}
                    for path, value in leaves
                    if isinstance(value, str)
                    and any(token in value.lower() for token in ("lfp", "lifepo", "graphite", "3.65", "1000"))
                ],
            }
        )
    suffix_counts = Counter()
    suffix_bytes = Counter()
    for entry in entries:
        suffix = next((suffix for suffix in (".metadata.json", ".bdf.parquet", ".bdf.csv") if entry["name"].endswith(suffix)), "other")
        suffix_counts[suffix] += 1
        suffix_bytes[suffix] += entry["uncompressedSize"]
    output = {
        "auditId": "RC56-AURORA-REMOTE-SOURCE-AUDIT-0.1",
        "cycleId": "RC-2026-56",
        "auditedOn": "2026-08-29",
        "status": "metadata-only-before-any-cycling-data-entry-was-opened",
        "record": {
            "id": record["id"],
            "doi": record["doi"],
            "title": record["metadata"]["title"],
            "publicationDate": record["metadata"]["publication_date"],
            "license": record["metadata"]["license"]["id"],
            "zip": {
                "url": ZIP_URL,
                "size": record["files"][0]["size"],
                "checksum": record["files"][0]["checksum"],
                "lastModified": record["files"][0].get("updated"),
            },
        },
        "directory": directory,
        "entryClasses": [
            {"suffix": suffix, "count": suffix_counts[suffix], "uncompressedBytes": suffix_bytes[suffix]}
            for suffix in sorted(suffix_counts)
        ],
        "metadataFileCount": len(metadata_entries),
        "metadata": metadata,
        "frequentLeafPaths": [{"path": path, "count": count} for path, count in key_counts.most_common(80)],
        "matchedLeafValues": [
            {"path": path, "value": value, "count": count}
            for (path, value), count in value_counts.most_common()
        ],
        "outcomeBoundary": {
            "cyclingDataEntriesOpened": 0,
            "cellCapacityValuesObserved": 0,
            "cellEolValuesObserved": 0,
            "allowedUse": "Select and preregister a cohort from assembly and protocol metadata only.",
        },
    }
    rendered = json.dumps(output, indent=2, ensure_ascii=False) + "\n"
    if args.write:
        OUT.write_text(rendered, encoding="utf-8")
    print(
        f"RC56 Aurora audit: entries={len(entries)}, metadata={len(metadata_entries)}, "
        f"parquet={suffix_counts['.bdf.parquet']}, csv={suffix_counts['.bdf.csv']}, "
        f"cycling-opened=0"
    )


if __name__ == "__main__":
    main()
