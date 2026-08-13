"""Fault-injectable RC37 receiver/outbox and idempotent sink services."""

import argparse
import hashlib
import hmac
import json
import os
import re
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ACK_KEY = bytes.fromhex("726333372d73796e7468657469632d726563656970742d6b65792d6e6f742d70726f64")
ID_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9._-]{5,63}$")
DIGEST_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def connect(path, mode):
    connection = sqlite3.connect(path, timeout=15, isolation_level=None)
    connection.execute("PRAGMA journal_mode=DELETE")
    connection.execute("PRAGMA synchronous=FULL")
    connection.execute("PRAGMA foreign_keys=ON")
    if mode == "receiver":
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS deliveries(
              delivery_id TEXT PRIMARY KEY,
              outcome_sha256 TEXT NOT NULL,
              event_id TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS outbox(
              event_id TEXT PRIMARY KEY,
              delivery_id TEXT NOT NULL UNIQUE REFERENCES deliveries(delivery_id),
              outcome_sha256 TEXT NOT NULL,
              status TEXT NOT NULL CHECK(status IN ('pending','delivered')) DEFAULT 'pending',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              delivered_at TEXT
            );
            """
        )
    else:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS sink_inbox(
              event_id TEXT PRIMARY KEY,
              outcome_sha256 TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS sink_effects(
              effect_id INTEGER PRIMARY KEY AUTOINCREMENT,
              event_id TEXT NOT NULL UNIQUE REFERENCES sink_inbox(event_id),
              outcome_sha256 TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
    return connection


def event_id(delivery_id, outcome_sha256):
    digest = hashlib.sha256(f"RC37-EVENT-V1\0{delivery_id}\0{outcome_sha256}".encode()).hexdigest()[:28]
    return f"RC37-{digest.upper()}"


def receipt(kind, identifier, outcome_sha256, status):
    message = f"RC37-{kind}-V1\0{identifier}\0{outcome_sha256}\0{status}".encode()
    return hmac.new(ACK_KEY, message, hashlib.sha256).hexdigest()


class ChainHandler(BaseHTTPRequestHandler):
    server_version = "RC37Chain/1.0"

    def log_message(self, fmt, *args):
        return

    def send_json(self, status, payload):
        body = json.dumps(payload, sort_keys=True).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_document(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            return json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            return None

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/state":
            return self.get_state()
        if self.server.mode == "receiver" and route == "/outbox/pending":
            return self.get_pending()
        self.send_json(404, {"error": "not-found"})

    def do_PUT(self):
        route = urlparse(self.path).path
        if self.server.mode == "receiver" and route.startswith("/deliveries/"):
            return self.put_delivery(route.removeprefix("/deliveries/"))
        if self.server.mode == "sink" and route.startswith("/events/"):
            return self.put_event(route.removeprefix("/events/"))
        self.send_json(404, {"error": "not-found"})

    def do_POST(self):
        route = urlparse(self.path).path
        if self.server.mode == "receiver" and route.startswith("/outbox/") and route.endswith("/ack"):
            identifier = route.removeprefix("/outbox/").removesuffix("/ack")
            return self.ack_outbox(identifier)
        self.send_json(404, {"error": "not-found"})

    def get_state(self):
        connection = connect(self.server.db_path, self.server.mode)
        if self.server.mode == "receiver":
            deliveries = [dict(zip(("deliveryId", "outcomeSha256", "eventId", "createdAt"), row)) for row in connection.execute("SELECT delivery_id,outcome_sha256,event_id,created_at FROM deliveries ORDER BY delivery_id")]
            outbox = [dict(zip(("eventId", "deliveryId", "outcomeSha256", "status", "createdAt", "deliveredAt"), row)) for row in connection.execute("SELECT event_id,delivery_id,outcome_sha256,status,created_at,delivered_at FROM outbox ORDER BY event_id")]
            payload = {"mode": "receiver", "deliveries": deliveries, "outbox": outbox}
        else:
            inbox = [dict(zip(("eventId", "outcomeSha256", "createdAt"), row)) for row in connection.execute("SELECT event_id,outcome_sha256,created_at FROM sink_inbox ORDER BY event_id")]
            effects = [dict(zip(("effectId", "eventId", "outcomeSha256", "createdAt"), row)) for row in connection.execute("SELECT effect_id,event_id,outcome_sha256,created_at FROM sink_effects ORDER BY effect_id")]
            payload = {"mode": "sink", "inbox": inbox, "effects": effects}
        connection.close()
        self.send_json(200, payload)

    def get_pending(self):
        connection = connect(self.server.db_path, "receiver")
        rows = [dict(zip(("eventId", "deliveryId", "outcomeSha256"), row)) for row in connection.execute("SELECT event_id,delivery_id,outcome_sha256 FROM outbox WHERE status='pending' ORDER BY event_id")]
        connection.close()
        self.send_json(200, {"events": rows})

    def put_delivery(self, delivery_id):
        if not ID_PATTERN.fullmatch(delivery_id):
            return self.send_json(400, {"error": "invalid-delivery-id"})
        document = self.read_document()
        outcome_sha256 = document.get("outcomeSha256") if isinstance(document, dict) else None
        if not isinstance(outcome_sha256, str) or not DIGEST_PATTERN.fullmatch(outcome_sha256):
            return self.send_json(400, {"error": "invalid-outcome-digest"})
        generated_event_id = event_id(delivery_id, outcome_sha256)
        fault = self.headers.get("X-RC37-Fault", "none")
        connection = connect(self.server.db_path, "receiver")
        try:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute("SELECT outcome_sha256,event_id FROM deliveries WHERE delivery_id=?", (delivery_id,)).fetchone()
            if existing:
                if existing[0] != outcome_sha256:
                    connection.execute("ROLLBACK")
                    return self.send_json(409, {"error": "idempotency-conflict", "deliveryId": delivery_id})
                connection.execute("COMMIT")
                status = "replay"
                return self.send_json(200, {"status": status, "deliveryId": delivery_id, "eventId": existing[1], "outcomeSha256": outcome_sha256, "receipt": receipt("RECEIVER", delivery_id, outcome_sha256, status)})
            connection.execute("INSERT INTO deliveries(delivery_id,outcome_sha256,event_id) VALUES(?,?,?)", (delivery_id, outcome_sha256, generated_event_id))
            connection.execute("INSERT INTO outbox(event_id,delivery_id,outcome_sha256) VALUES(?,?,?)", (generated_event_id, delivery_id, outcome_sha256))
            if fault == "before-commit":
                os._exit(86)
            connection.execute("COMMIT")
            if fault == "after-commit":
                os._exit(87)
            status = "created"
            return self.send_json(201, {"status": status, "deliveryId": delivery_id, "eventId": generated_event_id, "outcomeSha256": outcome_sha256, "receipt": receipt("RECEIVER", delivery_id, outcome_sha256, status)})
        finally:
            connection.close()

    def ack_outbox(self, identifier):
        if not ID_PATTERN.fullmatch(identifier):
            return self.send_json(400, {"error": "invalid-event-id"})
        document = self.read_document()
        outcome_sha256 = document.get("outcomeSha256") if isinstance(document, dict) else None
        if not isinstance(outcome_sha256, str) or not DIGEST_PATTERN.fullmatch(outcome_sha256):
            return self.send_json(400, {"error": "invalid-outcome-digest"})
        fault = self.headers.get("X-RC37-Fault", "none")
        connection = connect(self.server.db_path, "receiver")
        try:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute("SELECT outcome_sha256,status FROM outbox WHERE event_id=?", (identifier,)).fetchone()
            if not existing:
                connection.execute("ROLLBACK")
                return self.send_json(404, {"error": "unknown-event"})
            if existing[0] != outcome_sha256:
                connection.execute("ROLLBACK")
                return self.send_json(409, {"error": "idempotency-conflict", "eventId": identifier})
            if existing[1] == "delivered":
                connection.execute("COMMIT")
                status = "replay"
                return self.send_json(200, {"status": status, "eventId": identifier, "outcomeSha256": outcome_sha256, "receipt": receipt("OUTBOX", identifier, outcome_sha256, status)})
            if fault == "before-commit":
                os._exit(88)
            connection.execute("UPDATE outbox SET status='delivered',delivered_at=CURRENT_TIMESTAMP WHERE event_id=?", (identifier,))
            connection.execute("COMMIT")
            if fault == "after-commit":
                os._exit(89)
            status = "delivered"
            return self.send_json(201, {"status": status, "eventId": identifier, "outcomeSha256": outcome_sha256, "receipt": receipt("OUTBOX", identifier, outcome_sha256, status)})
        finally:
            connection.close()

    def put_event(self, identifier):
        if not ID_PATTERN.fullmatch(identifier):
            return self.send_json(400, {"error": "invalid-event-id"})
        document = self.read_document()
        outcome_sha256 = document.get("outcomeSha256") if isinstance(document, dict) else None
        if not isinstance(outcome_sha256, str) or not DIGEST_PATTERN.fullmatch(outcome_sha256):
            return self.send_json(400, {"error": "invalid-outcome-digest"})
        fault = self.headers.get("X-RC37-Fault", "none")
        connection = connect(self.server.db_path, "sink")
        try:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute("SELECT outcome_sha256 FROM sink_inbox WHERE event_id=?", (identifier,)).fetchone()
            if existing:
                if existing[0] != outcome_sha256:
                    connection.execute("ROLLBACK")
                    return self.send_json(409, {"error": "idempotency-conflict", "eventId": identifier})
                effect = connection.execute("SELECT effect_id FROM sink_effects WHERE event_id=?", (identifier,)).fetchone()
                connection.execute("COMMIT")
                status = "replay"
                return self.send_json(200, {"status": status, "eventId": identifier, "outcomeSha256": outcome_sha256, "effectId": effect[0], "receipt": receipt("SINK", identifier, outcome_sha256, status)})
            connection.execute("INSERT INTO sink_inbox(event_id,outcome_sha256) VALUES(?,?)", (identifier, outcome_sha256))
            connection.execute("INSERT INTO sink_effects(event_id,outcome_sha256) VALUES(?,?)", (identifier, outcome_sha256))
            if fault == "before-commit":
                os._exit(96)
            connection.execute("COMMIT")
            effect = connection.execute("SELECT effect_id FROM sink_effects WHERE event_id=?", (identifier,)).fetchone()[0]
            if fault == "after-commit":
                os._exit(97)
            status = "created"
            return self.send_json(201, {"status": status, "eventId": identifier, "outcomeSha256": outcome_sha256, "effectId": effect, "receipt": receipt("SINK", identifier, outcome_sha256, status)})
        finally:
            connection.close()


class ChainServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("receiver", "sink"), required=True)
    parser.add_argument("--db", required=True)
    parser.add_argument("--port", required=True, type=int)
    args = parser.parse_args()
    db_path = str(Path(args.db).resolve())
    bootstrap = connect(db_path, args.mode)
    bootstrap.close()
    server = ChainServer(("127.0.0.1", args.port), ChainHandler)
    server.mode = args.mode
    server.db_path = db_path
    print(json.dumps({"ready": True, "mode": args.mode, "port": args.port, "db": db_path}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
