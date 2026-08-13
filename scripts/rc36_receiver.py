"""Fault-injectable RC36 idempotent receiver backed by one SQLite transaction."""

import argparse
import hashlib
import hmac
import json
import os
import re
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SYNTHETIC_ACK_KEY = bytes.fromhex("726333362d73796e7468657469632d61636b2d6b65792d6e6f742d70726f64756374696f6e")
ID_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9._-]{5,63}$")


def connect(db_path):
    connection = sqlite3.connect(db_path, timeout=10, isolation_level=None)
    connection.execute("PRAGMA journal_mode=DELETE")
    connection.execute("PRAGMA synchronous=FULL")
    connection.execute("PRAGMA foreign_keys=ON")
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS deliveries(
          delivery_id TEXT PRIMARY KEY,
          outcome_sha256 TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS effects(
          effect_id INTEGER PRIMARY KEY AUTOINCREMENT,
          delivery_id TEXT NOT NULL UNIQUE REFERENCES deliveries(delivery_id),
          outcome_sha256 TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    return connection


def receipt(delivery_id, outcome_sha256, status):
    message = f"RC36-ACK-V1\0{delivery_id}\0{outcome_sha256}\0{status}".encode()
    return hmac.new(SYNTHETIC_ACK_KEY, message, hashlib.sha256).hexdigest()


class Receiver(BaseHTTPRequestHandler):
    server_version = "RC36Receiver/1.0"

    def log_message(self, fmt, *args):
        return

    def send_json(self, status, payload):
        body = json.dumps(payload, sort_keys=True).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/state":
            self.send_json(404, {"error": "not-found"})
            return
        connection = connect(self.server.db_path)
        deliveries = [dict(zip(("deliveryId", "outcomeSha256", "createdAt"), row)) for row in connection.execute("SELECT delivery_id,outcome_sha256,created_at FROM deliveries ORDER BY delivery_id")]
        effects = [dict(zip(("effectId", "deliveryId", "outcomeSha256", "createdAt"), row)) for row in connection.execute("SELECT effect_id,delivery_id,outcome_sha256,created_at FROM effects ORDER BY effect_id")]
        connection.close()
        self.send_json(200, {"deliveries": deliveries, "effects": effects})

    def do_PUT(self):
        if not self.path.startswith("/deliveries/"):
            self.send_json(404, {"error": "not-found"})
            return
        delivery_id = self.path.removeprefix("/deliveries/")
        if not ID_PATTERN.fullmatch(delivery_id):
            self.send_json(400, {"error": "invalid-delivery-id"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            document = json.loads(self.rfile.read(length))
            outcome_sha256 = document["outcomeSha256"]
        except (ValueError, KeyError, json.JSONDecodeError):
            self.send_json(400, {"error": "invalid-json"})
            return
        if not isinstance(outcome_sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", outcome_sha256):
            self.send_json(400, {"error": "invalid-outcome-digest"})
            return
        fault = self.headers.get("X-RC36-Fault", "none")
        connection = connect(self.server.db_path)
        try:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute("SELECT outcome_sha256 FROM deliveries WHERE delivery_id=?", (delivery_id,)).fetchone()
            if existing:
                if existing[0] != outcome_sha256:
                    connection.execute("ROLLBACK")
                    self.send_json(409, {"error": "idempotency-conflict", "deliveryId": delivery_id})
                    return
                effect = connection.execute("SELECT effect_id FROM effects WHERE delivery_id=?", (delivery_id,)).fetchone()
                connection.execute("COMMIT")
                status = "replay"
                self.send_json(200, {"status": status, "deliveryId": delivery_id, "outcomeSha256": outcome_sha256, "effectId": effect[0], "receipt": receipt(delivery_id, outcome_sha256, status)})
                return
            connection.execute("INSERT INTO deliveries(delivery_id,outcome_sha256) VALUES(?,?)", (delivery_id, outcome_sha256))
            connection.execute("INSERT INTO effects(delivery_id,outcome_sha256) VALUES(?,?)", (delivery_id, outcome_sha256))
            if fault == "before-commit":
                os._exit(86)
            connection.execute("COMMIT")
            effect_id = connection.execute("SELECT effect_id FROM effects WHERE delivery_id=?", (delivery_id,)).fetchone()[0]
            if fault == "after-commit":
                os._exit(87)
            status = "created"
            self.send_json(201, {"status": status, "deliveryId": delivery_id, "outcomeSha256": outcome_sha256, "effectId": effect_id, "receipt": receipt(delivery_id, outcome_sha256, status)})
        finally:
            connection.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    parser.add_argument("--port", required=True, type=int)
    args = parser.parse_args()
    db_path = str(Path(args.db).resolve())
    bootstrap = connect(db_path)
    bootstrap.close()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Receiver)
    server.db_path = db_path
    print(json.dumps({"ready": True, "port": args.port, "db": db_path}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

