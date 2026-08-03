from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

import os
from pathlib import Path


def load_local_env() -> None:
    """Load the project-local .env without adding a runtime dependency."""
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


load_local_env()

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "points_system.db")
LOCAL_DATABASE_URL = f"sqlite:///{DB_PATH}"


def normalize_database_url(value: str) -> str:
    """Use psycopg 3 explicitly for PostgreSQL URLs supplied by Supabase."""
    if value.startswith("postgres://"):
        return value.replace("postgres://", "postgresql+psycopg://", 1)
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    return value


DATABASE_URL = normalize_database_url(
    os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL") or LOCAL_DATABASE_URL
)
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine_options = {"pool_pre_ping": True}
if IS_SQLITE:
    engine_options["connect_args"] = {"check_same_thread": False}
else:
    # Supabase requires TLS. Disabling psycopg prepared statements keeps the
    # same URL compatible with Supavisor transaction pooling when necessary.
    engine_options.update({
        "connect_args": {"sslmode": "require", "prepare_threshold": None},
        "pool_size": 5,
        "max_overflow": 5,
        "pool_recycle": 300,
    })

engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
