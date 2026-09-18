#!/usr/bin/env python3
"""Home-PC CharacterLookup index CLI.

Examples (PowerShell, from this folder):

  python cli.py inspect
  python cli.py export
  python cli.py query --membership-id 4611686018465122437
  python cli.py serve
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cl_index import (  # noqa: E402
    DEFAULT_DB,
    DEFAULT_PART_DIR,
    DEFAULT_SUMMARY,
    SPLASHBEAR_MEMBERSHIP_ID,
    connect,
    distinct_instance_count,
    export_membership_partitions,
    inspect_schema,
    load_summary,
    query_membership_instances,
    schema_dict,
)
from server import serve  # noqa: E402


def cmd_inspect(args: argparse.Namespace) -> int:
    con = connect(args.db, memory_limit=args.memory, threads=args.threads)
    mapping = inspect_schema(con)
    summary = load_summary(args.summary)
    print(json.dumps({"schema": schema_dict(mapping), "summary": summary}, indent=2))
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    con = connect(args.db, memory_limit=args.memory, threads=args.threads)
    mapping = inspect_schema(con)
    print(f"Exporting {mapping.table} -> {args.out} (hash partitions, no CREATE INDEX)")
    export_membership_partitions(con, mapping, args.out, overwrite=True)
    print(f"Wrote partitions under {args.out}")
    return 0


def cmd_query(args: argparse.Namespace) -> int:
    con = connect(":memory:", memory_limit=args.memory, threads=args.threads)
    membership_id = args.membership_id or SPLASHBEAR_MEMBERSHIP_ID
    rows = query_membership_instances(con, membership_id, args.out)
    payload = {
        "membershipId": membership_id,
        "rowCount": len(rows),
        "instanceCount": distinct_instance_count(rows),
        "sample": rows[:5],
    }
    summary = load_summary(args.summary)
    expected = summary.get("splashbear_instances")
    if expected is not None and membership_id == str(summary.get("splashbear_membership_id") or SPLASHBEAR_MEMBERSHIP_ID):
        payload["expectedSplashbearInstances"] = expected
        payload["matchesSummary"] = payload["instanceCount"] == expected
    print(json.dumps(payload, indent=2))
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    serve(
        host=args.host,
        port=args.port,
        part_dir=args.out,
        api_key=args.api_key,
        memory_limit=args.memory,
        threads=args.threads,
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="CharacterLookup membership index toolkit")
    parser.add_argument("--db", default=DEFAULT_DB, help="Path to chronicle.duckdb")
    parser.add_argument("--out", default=DEFAULT_PART_DIR, help="Parquet partition directory")
    parser.add_argument("--summary", default=DEFAULT_SUMMARY, help="consolidate_cl_summary.json")
    parser.add_argument("--memory", default="24GB", help="DuckDB memory_limit")
    parser.add_argument("--threads", type=int, default=4)
    sub = parser.add_subparsers(dest="cmd", required=True)

    inspect_p = sub.add_parser("inspect", help="Print detected CharacterLookup columns")
    inspect_p.set_defaults(func=cmd_inspect)

    export_p = sub.add_parser("export", help="Write membership hash partitions (no indexes)")
    export_p.set_defaults(func=cmd_export)

    query_p = sub.add_parser("query", help="Query one membership from Parquet partitions")
    query_p.add_argument("--membership-id", default=SPLASHBEAR_MEMBERSHIP_ID)
    query_p.set_defaults(func=cmd_query)

    serve_p = sub.add_parser("serve", help="HTTP read API over Parquet partitions")
    serve_p.add_argument("--host", default="127.0.0.1")
    serve_p.add_argument("--port", type=int, default=8787)
    serve_p.add_argument("--api-key", default="")
    serve_p.set_defaults(func=cmd_serve)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.cmd == "serve" and not args.api_key:
        args.api_key = None
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
