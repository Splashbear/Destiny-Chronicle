"""CharacterLookup membership index helpers for the home-PC DuckDB.

The 13.6B-row chronicle.duckdb has no ART indexes (CREATE INDEX OOM'd).
Live lookups go through hash-partitioned Parquet, not a DuckDB index.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

DEFAULT_DB = r"D:\DestinyChronicleDB\chronicle.duckdb"
DEFAULT_PART_DIR = r"D:\DestinyChronicleDB\cl_parts"
DEFAULT_SUMMARY = r"D:\DestinyChronicleDB\consolidate_cl_summary.json"
SPLASHBEAR_MEMBERSHIP_ID = "4611686018465122437"
PARTITION_COUNT = 256

MEMBERSHIP_ALIASES = (
    "membership_id",
    "membershipid",
    "member_id",
    "destiny_membership_id",
    "destinyMembershipId",
)
INSTANCE_ALIASES = (
    "activity_instance_id",
    "instance_id",
    "activityid",
    "instanceid",
    "activityInstanceId",
)
CHARACTER_ALIASES = (
    "character_id",
    "characterid",
    "char_id",
    "characterId",
)


@dataclass(frozen=True)
class ColumnMap:
    table: str
    membership: str
    instance: str
    character: str


def connect(db_path: str, memory_limit: str = "24GB", threads: int = 4):
    import duckdb

    if db_path == ":memory:":
        con = duckdb.connect(":memory:")
    else:
        path = Path(db_path)
        if not path.exists():
            raise FileNotFoundError(f"DuckDB file not found: {path}")
        # Read-only so export/query cannot rewrite chronicle.duckdb.
        con = duckdb.connect(str(path), read_only=True)
    con.execute(f"SET memory_limit = '{memory_limit}'")
    con.execute(f"SET threads = {int(threads)}")
    con.execute("SET preserve_insertion_order = false")
    return con


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _pick(columns: Iterable[str], aliases: tuple[str, ...]) -> str | None:
    wanted = {_norm(a) for a in aliases}
    for col in columns:
        if _norm(col) in wanted:
            return col
    return None


def inspect_schema(con) -> ColumnMap:
    tables = [
        row[0]
        for row in con.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
        ).fetchall()
    ]
    if not tables:
        raise RuntimeError("DuckDB has no tables")

    candidates: list[ColumnMap] = []
    for table in tables:
        cols = [
            row[0]
            for row in con.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'main' AND table_name = ?
                """,
                [table],
            ).fetchall()
        ]
        membership = _pick(cols, MEMBERSHIP_ALIASES)
        instance = _pick(cols, INSTANCE_ALIASES)
        character = _pick(cols, CHARACTER_ALIASES)
        if membership and instance and character:
            candidates.append(ColumnMap(table, membership, instance, character))

    if not candidates:
        raise RuntimeError(
            "No table with membership_id, activity_instance_id, and character_id columns. "
            f"Tables: {tables}"
        )

    def score(item: ColumnMap) -> int:
        name = item.table.lower()
        points = 0
        if "lookup" in name:
            points += 3
        if "character" in name:
            points += 2
        if name in {"cl", "characterlookup", "character_lookup"}:
            points += 5
        return points

    candidates.sort(key=score, reverse=True)
    return candidates[0]


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def membership_part_sql(membership_expr: str) -> str:
    return f"(hash(CAST({membership_expr} AS VARCHAR)) % {PARTITION_COUNT})::INTEGER"


def export_membership_partitions(
    con,
    mapping: ColumnMap,
    out_dir: str,
    overwrite: bool = False,
) -> Path:
    dest = Path(out_dir)
    if dest.exists() and any(dest.rglob("*.parquet")) and not overwrite:
        raise FileExistsError(f"Parquet partitions already exist in {dest}; pass overwrite=True")
    dest.mkdir(parents=True, exist_ok=True)
    table = quote_ident(mapping.table)
    membership = quote_ident(mapping.membership)
    instance = quote_ident(mapping.instance)
    character = quote_ident(mapping.character)
    part_expr = membership_part_sql(membership)
    # DuckDB COPY of 13.6B rows is a long streaming write. Do not CREATE INDEX.
    con.execute(
        f"""
        COPY (
          SELECT
            CAST({membership} AS VARCHAR) AS membership_id,
            CAST({character} AS VARCHAR) AS character_id,
            CAST({instance} AS VARCHAR) AS activity_instance_id,
            {part_expr} AS part
          FROM {table}
        ) TO '{dest.as_posix()}' (
          FORMAT PARQUET,
          PARTITION_BY (part),
          COMPRESSION ZSTD,
          OVERWRITE_OR_IGNORE
        )
        """
    )
    marker = dest / "export_complete.json"
    marker.write_text(
        json.dumps(
            {
                "partition_count": PARTITION_COUNT,
                "columns": ["membership_id", "character_id", "activity_instance_id", "part"],
                "source_table": mapping.table,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return dest


def parquet_glob(part_dir: str) -> str:
    return str(Path(part_dir) / "part=*" / "*.parquet")


def part_for_membership(con, membership_id: str) -> int:
    row = con.execute(
        f"SELECT {membership_part_sql('?')}",
        [str(membership_id)],
    ).fetchone()
    if row is None:
        raise RuntimeError("Could not hash membership id")
    return int(row[0])


def query_membership_instances(
    con,
    membership_id: str,
    part_dir: str,
) -> list[dict[str, str]]:
    part = part_for_membership(con, membership_id)
    glob = parquet_glob(part_dir)
    rows = con.execute(
        """
        SELECT activity_instance_id, character_id
        FROM read_parquet(?, hive_partitioning := true)
        WHERE part = ? AND membership_id = ?
        ORDER BY activity_instance_id, character_id
        """,
        [glob, part, str(membership_id)],
    ).fetchall()
    return [
        {"activity_instance_id": str(instance_id), "character_id": str(character_id)}
        for instance_id, character_id in rows
    ]


def distinct_instance_count(rows: list[dict[str, str]]) -> int:
    return len({row["activity_instance_id"] for row in rows})


def load_summary(path: str = DEFAULT_SUMMARY) -> dict[str, Any]:
    summary_path = Path(path)
    if not summary_path.exists():
        return {}
    return json.loads(summary_path.read_text(encoding="utf-8"))


def schema_dict(mapping: ColumnMap) -> dict[str, str]:
    return asdict(mapping)
