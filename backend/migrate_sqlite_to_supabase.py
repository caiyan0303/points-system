"""One-time, non-destructive migration from the local SQLite database to Supabase.

The target must be a new Supabase database. The connection string is read from
SUPABASE_DB_URL and is never printed.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from sqlalchemy import MetaData, create_engine, func, inspect, select, text


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(__file__).resolve().parent / "points_system.db"
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


def load_local_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def normalize_postgres_url(value: str) -> str:
    if value.startswith("postgres://"):
        return value.replace("postgres://", "postgresql+psycopg://", 1)
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    return value


def apply_migrations(connection) -> None:
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        sql = path.read_text(encoding="utf-8")
        for statement in sql.split(";"):
            statement = statement.strip()
            if statement:
                connection.exec_driver_sql(statement)


def table_count(connection, table) -> int:
    return int(connection.execute(select(func.count()).select_from(table)).scalar_one())


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate local points data to a new Supabase project")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="SQLite database path")
    args = parser.parse_args()

    load_local_env()
    target_url = os.getenv("SUPABASE_DB_URL")
    if not target_url:
        raise SystemExit("Missing SUPABASE_DB_URL. Copy the Session pooler URL from Supabase Connect.")
    if not args.source.exists():
        raise SystemExit(f"SQLite source not found: {args.source}")

    source_engine = create_engine(f"sqlite:///{args.source.resolve()}")
    target_engine = create_engine(
        normalize_postgres_url(target_url),
        pool_pre_ping=True,
        connect_args={"sslmode": "require", "prepare_threshold": None},
    )
    if target_engine.dialect.name != "postgresql":
        raise SystemExit("SUPABASE_DB_URL must be a PostgreSQL connection string")

    with target_engine.begin() as target_connection:
        apply_migrations(target_connection)

    source_metadata = MetaData()
    target_metadata = MetaData()
    source_metadata.reflect(bind=source_engine)
    target_metadata.reflect(bind=target_engine, schema="public")

    results = {}
    with source_engine.connect() as source_connection, target_engine.begin() as target_connection:
        for table_name in TABLE_ORDER:
            source_table = source_metadata.tables.get(table_name)
            target_table = target_metadata.tables.get(f"public.{table_name}")
            if source_table is None or target_table is None:
                continue

            source_rows = source_connection.execute(select(source_table)).mappings().all()
            existing_count = table_count(target_connection, target_table)
            if source_rows and existing_count:
                if table_name not in SEEDED_TABLES:
                    raise SystemExit(
                        f"Target table {table_name} already contains {existing_count} rows. "
                        "Use a new Supabase project to avoid overwriting data."
                    )
                target_connection.execute(target_table.delete())

            target_columns = {column.name for column in target_table.columns}
            payload = [
                {key: value for key, value in row.items() if key in target_columns}
                for row in source_rows
            ]
            if payload:
                target_connection.execute(target_table.insert(), payload)
            results[table_name] = len(payload) if payload else existing_count

        for table_name in TABLE_ORDER:
            target_table = target_metadata.tables.get(f"public.{table_name}")
            if target_table is None or "id" not in target_table.c:
                continue
            sequence = target_connection.execute(
                text("SELECT pg_get_serial_sequence(:table_name, 'id')"),
                {"table_name": f"public.{table_name}"},
            ).scalar_one_or_none()
            if sequence:
                maximum = target_connection.execute(select(func.max(target_table.c.id))).scalar_one_or_none()
                target_connection.execute(
                    text("SELECT setval(CAST(:sequence AS regclass), :value, :called)"),
                    {"sequence": sequence, "value": maximum or 1, "called": maximum is not None},
                )

    print("Supabase migration completed and verified:")
    for table_name, count in results.items():
        print(f"  {table_name}: {count}")


if __name__ == "__main__":
    main()
