"""Minimal read API over membership-partitioned CharacterLookup Parquet."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from cl_index import (
    DEFAULT_PART_DIR,
    connect,
    distinct_instance_count,
    query_membership_instances,
)

CORS_ORIGINS = (
    "https://splashbear.github.io",
    "http://localhost:4200",
    "http://127.0.0.1:4200",
)


def make_handler(part_dir: str, api_key: str | None, memory_limit: str, threads: int):
    con = connect(":memory:", memory_limit=memory_limit, threads=threads)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:
            print("[%s] %s" % (self.log_date_time_string(), fmt % args))

        def _cors(self) -> None:
            origin = self.headers.get("Origin", "")
            if origin in CORS_ORIGINS:
                self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Authorization")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

        def _auth_ok(self) -> bool:
            if not api_key:
                return True
            header = self.headers.get("X-API-Key") or ""
            auth = self.headers.get("Authorization") or ""
            return header == api_key or auth == f"Bearer {api_key}"

        def _json(self, code: int, body: dict) -> None:
            payload = json.dumps(body).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/") or "/"
            if path == "/healthz":
                self._json(200, {"ok": True, "source": "parquet", "partDir": part_dir})
                return
            if not self._auth_ok():
                self._json(401, {"error": "unauthorized"})
                return
            if path.startswith("/membership/") and path.endswith("/instances"):
                membership_id = path[len("/membership/") : -len("/instances")].strip("/")
                self._instances(membership_id)
                return
            if path.startswith("/instances/"):
                membership_id = path[len("/instances/") :].strip("/")
                self._instances(membership_id)
                return
            if path.startswith("/pgcr/"):
                instance_id = path[len("/pgcr/") :].strip("/")
                self._json(
                    404,
                    {
                        "error": "activity_layer_missing",
                        "instanceId": instance_id,
                        "hint": (
                            "CharacterLookup can resolve who was in an instance, "
                            "not the PGCR itself. Next step is lean activity reads "
                            "inside the ingest watermark."
                        ),
                    },
                )
                return
            self._json(404, {"error": "not_found"})

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/") or "/"
            if not self._auth_ok():
                self._json(401, {"error": "unauthorized"})
                return
            length = int(self.headers.get("Content-Length") or "0")
            raw = self.rfile.read(length) if length else b"{}"
            try:
                body = json.loads(raw.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                self._json(400, {"error": "invalid_json"})
                return
            if path == "/pgcr/batch":
                ids = body.get("instanceIds") or []
                self._json(200, {str(instance_id): None for instance_id in ids})
                return
            self._json(404, {"error": "not_found"})

        def _instances(self, membership_id: str) -> None:
            if not membership_id:
                self._json(400, {"error": "membership_id_required"})
                return
            try:
                rows = query_membership_instances(con, membership_id, part_dir)
            except Exception as exc:  # noqa: BLE001 — surface DuckDB/IO errors to the operator
                self._json(500, {"error": "query_failed", "detail": str(exc)})
                return
            qs = parse_qs(urlparse(self.path).query)
            limit = int((qs.get("limit") or ["0"])[0] or 0)
            instance_ids = []
            seen = set()
            for row in rows:
                instance_id = row["activity_instance_id"]
                if instance_id not in seen:
                    seen.add(instance_id)
                    instance_ids.append(instance_id)
            sample = rows[:limit] if limit > 0 else rows[:5]
            self._json(
                200,
                {
                    "membershipId": str(membership_id),
                    "instanceCount": distinct_instance_count(rows),
                    "rowCount": len(rows),
                    "instanceIds": instance_ids if limit == 0 else instance_ids[:limit],
                    "sample": sample,
                },
            )

    return Handler


def serve(
    host: str = "127.0.0.1",
    port: int = 8787,
    part_dir: str = DEFAULT_PART_DIR,
    api_key: str | None = None,
    memory_limit: str = "8GB",
    threads: int = 4,
) -> None:
    handler = make_handler(part_dir, api_key, memory_limit, threads)
    httpd = ThreadingHTTPServer((host, port), handler)
    print(f"PGCR membership API on http://{host}:{port}  parquet={part_dir}")
    httpd.serve_forever()
