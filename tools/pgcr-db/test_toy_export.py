#!/usr/bin/env python3
"""Toy DuckDB test for membership hash partitions — does not touch the 236GB file."""

from __future__ import annotations

import json
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from cl_index import (  # noqa: E402
    SPLASHBEAR_MEMBERSHIP_ID,
    connect,
    distinct_instance_count,
    export_membership_partitions,
    inspect_schema,
    query_membership_instances,
)
from server import make_handler  # noqa: E402
from http.server import ThreadingHTTPServer
from threading import Thread


def build_toy_db(path: Path) -> None:
    import duckdb

    con = duckdb.connect(str(path))
    con.execute(
        """
        CREATE TABLE CharacterLookup (
          membership_id VARCHAR,
          character_id VARCHAR,
          activity_instance_id VARCHAR
        )
        """
    )
    rows = [
        (SPLASHBEAR_MEMBERSHIP_ID, "2305843009260670240", "10000197059"),
        (SPLASHBEAR_MEMBERSHIP_ID, "2305843009260670240", "10004344092"),
        (SPLASHBEAR_MEMBERSHIP_ID, "2305843009260670240", "10004462290"),
        (SPLASHBEAR_MEMBERSHIP_ID, "2305843009260670240", "10004681191"),
        (SPLASHBEAR_MEMBERSHIP_ID, "2305843009260670240", "10013301235"),
        ("4611686018000000000", "2305843009000000000", "20000000001"),
    ]
    con.executemany("INSERT INTO CharacterLookup VALUES (?, ?, ?)", rows)
    con.close()


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "chronicle.duckdb"
        part_dir = tmp_path / "cl_parts"
        build_toy_db(db_path)

        con = connect(str(db_path), memory_limit="1GB", threads=1)
        mapping = inspect_schema(con)
        assert mapping.table.lower() == "characterlookup"
        assert mapping.membership == "membership_id"
        assert mapping.instance == "activity_instance_id"
        assert mapping.character == "character_id"

        export_membership_partitions(con, mapping, str(part_dir), overwrite=True)
        assert any(part_dir.rglob("*.parquet")), "expected parquet files"

        mem = connect(":memory:", memory_limit="1GB", threads=1)
        rows = query_membership_instances(mem, SPLASHBEAR_MEMBERSHIP_ID, str(part_dir))
        ids = [row["activity_instance_id"] for row in rows]
        assert ids == [
            "10000197059",
            "10004344092",
            "10004462290",
            "10004681191",
            "10013301235",
        ], ids
        assert distinct_instance_count(rows) == 5

        handler = make_handler(str(part_dir), api_key=None, memory_limit="1GB", threads=1)
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        port = httpd.server_address[1]
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/healthz") as resp:
            health = json.loads(resp.read().decode("utf-8"))
        assert health["ok"] is True
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/membership/{SPLASHBEAR_MEMBERSHIP_ID}/instances"
        ) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        assert body["instanceCount"] == 5
        assert body["sample"][0]["activity_instance_id"] == "10000197059"
        httpd.shutdown()

        print(
            json.dumps(
                {
                    "ok": True,
                    "schema": mapping.__dict__,
                    "splashbearInstances": body["instanceCount"],
                    "parquetFiles": len(list(part_dir.rglob("*.parquet"))),
                },
                indent=2,
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
