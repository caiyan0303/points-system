"""把当前 SQLite 数据导出成 Netlify Database 可导入的 JSON 文件。"""
import json
import sqlite3
from datetime import date, datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SOURCE = BASE_DIR / "points_system.db"
OUTPUT = BASE_DIR / "backups" / "netlify-data-export.json"
TABLES = [
    "academic_years", "training_projects", "users", "groups", "group_members",
    "project_enrollments", "phases", "phase_participants", "phase_groups", "points",
    "point_rules", "rule_texts", "products", "redemptions", "prize_awards",
    "operation_logs", "notifications",
]


def json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"Unsupported value: {type(value)!r}")


def export_data():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(SOURCE)
    connection.row_factory = sqlite3.Row
    payload = {
        "format": "points-system-netlify-v1",
        "tables": {
            table: [dict(row) for row in connection.execute(f'SELECT * FROM "{table}" ORDER BY id')]
            for table in TABLES
        },
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=json_default), encoding="utf-8")
    connection.close()
    print(f"Exported to {OUTPUT}")


if __name__ == "__main__":
    export_data()

