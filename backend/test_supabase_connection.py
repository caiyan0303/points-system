"""Verify the configured Supabase database without displaying credentials."""

from __future__ import annotations

from sqlalchemy import text

from database import engine


TABLES = [
    "academic_years",
    "training_projects",
    "users",
    "groups",
    "group_members",
    "project_enrollments",
    "phases",
    "points",
    "team_points",
    "products",
    "redemptions",
]


def main() -> None:
    if engine.dialect.name != "postgresql":
        raise SystemExit("连接失败：当前仍在使用本地 SQLite。")

    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        print("SUPABASE CONNECTION SUCCESS")
        print("Supabase 数据库连接成功。")
        for table_name in TABLES:
            count = connection.execute(
                text(f'SELECT COUNT(*) FROM "{table_name}"')
            ).scalar_one()
            print(f"{table_name}: {count}")


if __name__ == "__main__":
    main()
