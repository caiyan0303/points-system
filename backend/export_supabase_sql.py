"""Build a self-contained Supabase SQL import from the local SQLite database."""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(__file__).resolve().parent / "points_system.db"
DEFAULT_OUTPUT = ROOT / ".tmp" / "supabase_import.sql"
MIGRATIONS_DIR = ROOT / "frontend" / "netlify" / "database" / "migrations"
TABLE_ORDER = [
    "academic_years",
    "training_projects",
    "users",
    "groups",
    "group_members",
    "project_enrollments",
    "phases",
    "phase_participants",
    "phase_groups",
    "points",
    "point_rules",
    "rule_texts",
    "products",
    "redemptions",
    "prize_awards",
    "operation_logs",
    "notifications",
    "team_points",
]
SEEDED_TABLES = {"point_rules", "rule_texts"}
BUSINESS_GUARD_TABLES = [
    "users",
    "training_projects",
    "groups",
    "points",
    "team_points",
    "products",
    "redemptions",
]


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def sql_literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, bytes):
        return f"decode('{value.hex()}', 'hex')"
    return "'" + str(value).replace("'", "''") + "'"


def main() -> None:
    parser = argparse.ArgumentParser(description="Export local SQLite data as Supabase SQL")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not args.source.exists():
        raise SystemExit(f"SQLite source not found: {args.source}")

    connection = sqlite3.connect(args.source)
    connection.row_factory = sqlite3.Row
    available_tables = {
        row[0]
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }

    rows_by_table: dict[str, list[sqlite3.Row]] = {}
    for table_name in TABLE_ORDER:
        if table_name in available_tables:
            rows_by_table[table_name] = connection.execute(
                f"SELECT * FROM {quote_identifier(table_name)} ORDER BY id"
            ).fetchall()

    lines = [
        "-- Generated from the local points-system SQLite database.",
        "-- Run this entire file once in a new Supabase project's SQL Editor.",
        "BEGIN;",
        "SET statement_timeout = 0;",
        "SET lock_timeout = 0;",
        "SET client_encoding = 'UTF8';",
        "",
    ]

    for migration_path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if migration_path.name == "0004_supabase_security.sql":
            continue
        lines.extend([
            f"-- {migration_path.name}",
            migration_path.read_text(encoding="utf-8").strip(),
            "",
        ])

    guard_expression = " OR ".join(
        f"EXISTS (SELECT 1 FROM {quote_identifier(table_name)})"
        for table_name in BUSINESS_GUARD_TABLES
    )
    lines.extend([
        "DO $$",
        "BEGIN",
        f"  IF {guard_expression} THEN",
        "    RAISE EXCEPTION 'Target contains business data. Use a new Supabase project.';",
        "  END IF;",
        "END $$;",
        "",
    ])

    populated_tables = [
        table_name
        for table_name in TABLE_ORDER
        if rows_by_table.get(table_name) and table_name not in SEEDED_TABLES
    ]
    if populated_tables:
        quoted_tables = ", ".join(quote_identifier(name) for name in reversed(populated_tables))
        lines.append(f"TRUNCATE TABLE {quoted_tables} RESTART IDENTITY CASCADE;")
        lines.append("")

    for table_name in TABLE_ORDER:
        table_rows = rows_by_table.get(table_name, [])
        if not table_rows:
            continue
        if table_name in SEEDED_TABLES:
            lines.append(f"TRUNCATE TABLE {quote_identifier(table_name)} RESTART IDENTITY CASCADE;")
        columns = list(table_rows[0].keys())
        column_sql = ", ".join(quote_identifier(column) for column in columns)
        lines.append(f"-- {table_name}: {len(table_rows)} rows")
        for row in table_rows:
            values_sql = ", ".join(sql_literal(row[column]) for column in columns)
            lines.append(
                f"INSERT INTO {quote_identifier(table_name)} ({column_sql}) VALUES ({values_sql});"
            )
        lines.append("")

    for table_name, table_rows in rows_by_table.items():
        if not table_rows:
            continue
        maximum_id = max(int(row["id"]) for row in table_rows)
        lines.append(
            "SELECT setval(pg_get_serial_sequence("
            f"'{table_name}', 'id'), {maximum_id}, TRUE);"
        )

    security_migration = MIGRATIONS_DIR / "0004_supabase_security.sql"
    if security_migration.exists():
        lines.extend([
            "",
            "-- 0004_supabase_security.sql",
            security_migration.read_text(encoding="utf-8").strip(),
        ])

    lines.extend(["", "COMMIT;", ""])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(lines), encoding="utf-8")

    print(f"Created: {args.output}")
    for table_name in TABLE_ORDER:
        if table_name in rows_by_table:
            print(f"  {table_name}: {len(rows_by_table[table_name])}")


if __name__ == "__main__":
    main()
