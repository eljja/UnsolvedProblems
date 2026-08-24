#!/usr/bin/env python3
"""Bounded, metadata-only inspection of the RC48 Figshare HDF5 artifact."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
from collections import OrderedDict
from pathlib import Path
from typing import Any

import h5py
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


DEFAULT_URL = "https://ndownloader.figshare.com/files/51654422"
EXPECTED_SIZE = 52_251_443_134
BLOCK_SIZE = 512 * 1024
TRANSFER_CAP = 64 * 1024 * 1024
USER_AGENT = "UnsolvedProblems-RC48-MetadataAudit/1.0"


class TransferLimitError(RuntimeError):
    pass


class HttpRangeReader(io.RawIOBase):
    def __init__(self, url: str, expected_size: int, block_size: int, transfer_cap: int):
        self.url = url
        self.expected_size = expected_size
        self.block_size = block_size
        self.transfer_cap = transfer_cap
        self.pos = 0
        self.bytes_received = 0
        self.requests_made = 0
        self.blocks: OrderedDict[int, bytes] = OrderedDict()
        self.block_hashes: dict[str, str] = {}
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Referer": "https://figshare.com/"})
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
        self.session.mount("https://", HTTPAdapter(max_retries=retry))

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            new_pos = offset
        elif whence == io.SEEK_CUR:
            new_pos = self.pos + offset
        elif whence == io.SEEK_END:
            new_pos = self.expected_size + offset
        else:
            raise ValueError(f"unsupported whence {whence}")
        if new_pos < 0:
            raise ValueError("negative seek")
        self.pos = new_pos
        return self.pos

    def _fetch_block(self, block_index: int) -> bytes:
        if block_index in self.blocks:
            self.blocks.move_to_end(block_index)
            return self.blocks[block_index]
        start = block_index * self.block_size
        end = min(self.expected_size, start + self.block_size) - 1
        wanted = end - start + 1
        if self.bytes_received + wanted > self.transfer_cap:
            raise TransferLimitError(
                f"range transfer cap would be exceeded: {self.bytes_received} + {wanted} > {self.transfer_cap}"
            )
        response = self.session.get(
            self.url,
            headers={"Range": f"bytes={start}-{end}"},
            timeout=60,
            allow_redirects=True,
        )
        response.raise_for_status()
        payload = response.content
        content_range = response.headers.get("Content-Range", "")
        match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", content_range)
        if response.status_code != 206 or not match:
            raise RuntimeError(f"server did not honor range {start}-{end}: {response.status_code} {content_range!r}")
        got_start, got_end, got_size = map(int, match.groups())
        if (got_start, got_end, got_size, len(payload)) != (start, end, self.expected_size, wanted):
            raise RuntimeError(
                f"range identity mismatch: got {(got_start, got_end, got_size, len(payload))}, "
                f"expected {(start, end, self.expected_size, wanted)}"
            )
        self.bytes_received += len(payload)
        self.requests_made += 1
        self.blocks[block_index] = payload
        self.block_hashes[str(block_index)] = hashlib.sha256(payload).hexdigest()
        return payload

    def read(self, size: int = -1) -> bytes:
        if size is None or size < 0:
            size = self.expected_size - self.pos
        if size == 0 or self.pos >= self.expected_size:
            return b""
        size = min(size, self.expected_size - self.pos)
        output = bytearray()
        while size:
            block_index = self.pos // self.block_size
            within = self.pos % self.block_size
            block = self._fetch_block(block_index)
            take = min(size, len(block) - within)
            output.extend(block[within : within + take])
            self.pos += take
            size -= take
        return bytes(output)

    def readinto(self, buffer: Any) -> int:
        payload = self.read(len(buffer))
        buffer[: len(payload)] = payload
        return len(payload)

    def stats(self) -> dict[str, Any]:
        return {
            "requestsMade": self.requests_made,
            "bytesReceived": self.bytes_received,
            "blockSize": self.block_size,
            "transferCap": self.transfer_cap,
            "blockIndexes": [int(key) for key in self.block_hashes],
            "blockSha256": self.block_hashes,
        }


def json_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        return [json_value(item) for item in value]
    if isinstance(value, tuple):
        return [json_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): json_value(item) for key, item in value.items()}
    return str(value)


def describe(path: str, obj: h5py.Group | h5py.Dataset) -> dict[str, Any]:
    result: dict[str, Any] = {
        "path": path,
        "kind": "group" if isinstance(obj, h5py.Group) else "dataset",
        "attributes": {key: json_value(obj.attrs[key]) for key in sorted(obj.attrs.keys())},
    }
    if isinstance(obj, h5py.Group):
        result["children"] = sorted(obj.keys())
    else:
        result.update(
            {
                "shape": list(obj.shape),
                "dtype": str(obj.dtype),
                "chunks": list(obj.chunks) if obj.chunks else None,
                "compression": obj.compression,
                "compressionOptions": json_value(obj.compression_opts),
                "fillValue": json_value(obj.fillvalue),
                "valuesRead": False,
            }
        )
    return result


def inspect(url: str) -> dict[str, Any]:
    reader = HttpRangeReader(url, EXPECTED_SIZE, BLOCK_SIZE, TRANSFER_CAP)
    result: dict[str, Any] = {
        "auditId": "RC48-FIGSHARE-HDF5-METADATA-0.1",
        "cycleId": "RC-2026-48",
        "inspectedOn": "2026-08-25",
        "source": {
            "figshareArticle": "https://doi.org/10.6084/m9.figshare.28200101",
            "fileId": 51654422,
            "url": url,
            "expectedBytes": EXPECTED_SIZE,
            "expectedMd5": "71c8e3960b49196031e786297d6285fb",
        },
        "policy": {
            "target": "/source8/NIST16X",
            "imageValuesRead": False,
            "datasetValuesRead": False,
            "description": "Only HDF5 names, object headers, shapes, dtypes, storage properties, and attributes are read. Dataset values are never indexed.",
        },
        "objects": [],
        "status": "running",
    }
    try:
        with h5py.File(reader, "r") as handle:
            result["root"] = describe("/", handle)
            if "source8" not in handle:
                result["status"] = "target-source-missing"
            else:
                source = handle["source8"]
                result["objects"].append(describe("/source8", source))
                if "NIST16X" not in source:
                    result["status"] = "target-build-missing"
                else:
                    target = source["NIST16X"]
                    result["objects"].append(describe("/source8/NIST16X", target))

                    def visitor(name: str, obj: h5py.Group | h5py.Dataset) -> None:
                        if name:
                            result["objects"].append(describe(f"/source8/NIST16X/{name}", obj))

                    if isinstance(target, h5py.Group):
                        target.visititems(visitor)
                    result["status"] = "metadata-inspected"
    except Exception as exc:
        result["status"] = "stopped"
        result["error"] = {"type": type(exc).__name__, "message": str(exc)}
    finally:
        result["transfer"] = reader.stats()
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = inspect(args.url)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": result["status"],
        "objects": len(result["objects"]),
        "bytesReceived": result["transfer"]["bytesReceived"],
        "requestsMade": result["transfer"]["requestsMade"],
        "output": str(output),
        "error": result.get("error"),
    }, ensure_ascii=False))
    if result["status"] != "metadata-inspected":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
