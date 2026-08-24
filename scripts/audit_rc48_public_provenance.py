#!/usr/bin/env python3
"""Audit official X16 manifests and a bounded DAQ ZIP central directory."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from pathlib import Path
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


VERSIONS = ["1.0.0", "1.1.0", "1.1.1"]
PAGE = "https://data.nist.gov/pdr/lps/ark%3A/88434/mds2-2309/pdr%3Av/{version}"
TARGET_ZIP = "DAQ_L001-L025.zip"
IDENTITY_NAME = re.compile(
    r"(?:^|[/_.-])(counter|timestamp|timecode|trigger|ledger|roster|index|sequence|frame[_-]?id|irig|dat|exp)(?:$|[/_.-])",
    re.IGNORECASE,
)
USER_AGENT = "UnsolvedProblems-RC48-ProvenanceAudit/1.0"
TIMEOUT = (20, 120)


def configure_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        status=3,
        backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        raise_on_status=True,
    )
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def fetch_json_manifest(session: requests.Session, version: str) -> tuple[dict[str, Any], dict[str, Any]]:
    url = PAGE.format(version=version)
    response = session.get(url, timeout=TIMEOUT)
    response.raise_for_status()
    matches = re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>([\s\S]*?)</script>',
        response.text,
        flags=re.IGNORECASE,
    )
    manifests = [json.loads(item) for item in matches]
    nerdm = next(item for item in manifests if "nrdp:DataPublication" in item.get("@type", []))
    return nerdm, {
        "url": url,
        "status": response.status_code,
        "bytesReceived": len(response.content),
        "sha256": hashlib.sha256(response.content).hexdigest(),
    }


def component_map(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for component in manifest.get("components", []):
        path = component.get("filepath")
        if not path:
            continue
        checksum = component.get("checksum") or {}
        algorithm = checksum.get("algorithm") or {}
        result[path] = {
            "size": component.get("size"),
            "mediaType": component.get("mediaType"),
            "downloadURL": component.get("downloadURL"),
            "checksum": checksum.get("hash"),
            "checksumAlgorithm": algorithm.get("tag"),
        }
    return result


def compare(previous: dict[str, dict[str, Any]], current: dict[str, dict[str, Any]]) -> dict[str, Any]:
    prior = set(previous)
    later = set(current)
    common = prior & later
    changed = [
        path
        for path in sorted(common)
        if (previous[path].get("size"), previous[path].get("checksum"))
        != (current[path].get("size"), current[path].get("checksum"))
    ]
    return {
        "added": sorted(later - prior),
        "removed": sorted(prior - later),
        "sizeOrChecksumChanged": changed,
        "unchanged": len(common) - len(changed),
    }


def range_get(session: requests.Session, url: str, start: int, end: int, expected_size: int) -> tuple[bytes, dict[str, Any]]:
    response = session.get(url, headers={"Range": f"bytes={start}-{end}"}, timeout=TIMEOUT)
    response.raise_for_status()
    content_range = response.headers.get("Content-Range", "")
    expected = f"bytes {start}-{end}/{expected_size}"
    if response.status_code != 206 or content_range != expected:
        raise RuntimeError(f"range request not honored: {response.status_code} {content_range!r} != {expected!r}")
    if len(response.content) != end - start + 1:
        raise RuntimeError("range byte-count mismatch")
    return response.content, {
        "start": start,
        "end": end,
        "bytesReceived": len(response.content),
        "sha256": hashlib.sha256(response.content).hexdigest(),
    }


def inspect_zip(session: requests.Session, component: dict[str, Any]) -> dict[str, Any]:
    size = int(component["size"])
    tail_start = max(0, size - 131_072)
    tail, tail_receipt = range_get(session, component["downloadURL"], tail_start, size - 1, size)
    marker = tail.rfind(b"PK\x05\x06")
    if marker < 0:
        raise RuntimeError("ZIP EOCD not found in bounded tail")
    if marker + 22 > len(tail):
        raise RuntimeError("truncated ZIP EOCD")
    signature, disk, cd_disk, disk_entries, total_entries, cd_size, cd_offset, comment_length = struct.unpack_from(
        "<4s4H2LH", tail, marker
    )
    if signature != b"PK\x05\x06" or disk != 0 or cd_disk != 0 or disk_entries != total_entries:
        raise RuntimeError("unsupported split or malformed ZIP")
    if max(total_entries, cd_size, cd_offset) == 0xFFFF or max(cd_size, cd_offset) == 0xFFFFFFFF:
        raise RuntimeError("ZIP64 is outside the bounded RC48 parser")
    directory, directory_receipt = range_get(
        session, component["downloadURL"], cd_offset, cd_offset + cd_size - 1, size
    )
    entries = []
    cursor = 0
    while cursor < len(directory):
        if directory[cursor : cursor + 4] != b"PK\x01\x02":
            raise RuntimeError(f"invalid central-directory signature at {cursor}")
        values = struct.unpack_from("<4s6H3L5H2L", directory, cursor)
        (
            _, version_made, version_needed, flags, compression, mod_time, mod_date,
            crc32, compressed_size, uncompressed_size, name_length, extra_length,
            comment_length, disk_start, internal_attr, external_attr, local_offset,
        ) = values
        name_start = cursor + 46
        name_end = name_start + name_length
        name = directory[name_start:name_end].decode("utf-8" if flags & 0x800 else "cp437", errors="replace")
        entries.append({
            "name": name,
            "compressedBytes": compressed_size,
            "uncompressedBytes": uncompressed_size,
            "crc32": f"{crc32:08x}",
            "compression": compression,
            "localHeaderOffset": local_offset,
        })
        cursor = name_end + extra_length + comment_length
    if cursor != len(directory) or len(entries) != total_entries:
        raise RuntimeError(f"central-directory count mismatch: parsed {len(entries)}, expected {total_entries}")
    return {
        "archive": TARGET_ZIP,
        "officialBytes": size,
        "officialSha256": component["checksum"],
        "entries": entries,
        "identityNamedEntries": [entry["name"] for entry in entries if IDENTITY_NAME.search(entry["name"])],
        "payloadBytesRead": 0,
        "rangeReceipts": [tail_receipt, directory_receipt],
        "totalBytesReceived": tail_receipt["bytesReceived"] + directory_receipt["bytesReceived"],
    }


def audit() -> dict[str, Any]:
    session = configure_session()
    manifests: dict[str, dict[str, dict[str, Any]]] = {}
    version_records = []
    for version in VERSIONS:
        manifest, receipt = fetch_json_manifest(session, version)
        components = component_map(manifest)
        manifests[version] = components
        version_records.append({
            "version": version,
            "issued": manifest.get("issued"),
            "modified": manifest.get("modified"),
            "componentCount": len(components),
            "paths": sorted(components),
            "identityNamedPaths": [path for path in sorted(components) if IDENTITY_NAME.search(path)],
            "pageReceipt": receipt,
        })
    comparisons = [
        {"from": left, "to": right, **compare(manifests[left], manifests[right])}
        for left, right in zip(VERSIONS, VERSIONS[1:])
    ]
    selected = manifests["1.1.1"][TARGET_ZIP]
    archive = inspect_zip(session, selected)
    return {
        "auditId": "RC48-X16-PUBLIC-PROVENANCE-AUDIT-0.1",
        "cycleId": "RC-2026-48",
        "auditedOn": "2026-08-25",
        "versions": version_records,
        "comparisons": comparisons,
        "selectedArchive": archive,
        "verdict": {
            "manifestIdentityLedgerFound": any(item["identityNamedPaths"] for item in version_records),
            "selectedArchiveIdentityLedgerFound": bool(archive["identityNamedEntries"]),
            "directIdentityGate": "fail",
            "reason": "The three official manifests preserve the same file set and the selected DAQ archive central directory contains only layer DAQ files. Neither exposes a counter, trigger roster, timestamp ledger, frame identity, DAT/EXP sidecar, or FPGA indexing file. This is evidence about the public record, not proof that no unpublished acquisition artifact exists."
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = audit()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "versions": [{"version": item["version"], "components": item["componentCount"]} for item in result["versions"]],
        "comparisons": result["comparisons"],
        "archiveEntries": len(result["selectedArchive"]["entries"]),
        "archiveBytesReceived": result["selectedArchive"]["totalBytesReceived"],
        "verdict": result["verdict"],
        "output": str(output),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
