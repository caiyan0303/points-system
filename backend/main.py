from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import os

from database import engine, Base
from sqlalchemy import inspect, text
from routers import auth, admin, student, common

Base.metadata.create_all(bind=engine)

# SQLite create_all does not add columns to an existing table. Keep older
# installations compatible when project scheduling fields are introduced.
database_dialect = engine.dialect.name
project_columns = {column["name"] for column in inspect(engine).get_columns("training_projects")}
with engine.begin() as connection:
    if "start_date" not in project_columns:
        timestamp_type = "TIMESTAMPTZ" if database_dialect == "postgresql" else "DATETIME"
        connection.execute(text(f"ALTER TABLE training_projects ADD COLUMN start_date {timestamp_type}"))
    if "end_date" not in project_columns:
        timestamp_type = "TIMESTAMPTZ" if database_dialect == "postgresql" else "DATETIME"
        connection.execute(text(f"ALTER TABLE training_projects ADD COLUMN end_date {timestamp_type}"))
    enrollment_insert = """
        INSERT INTO project_enrollments
            (student_id, year_id, project_id, group_id, status, label, joined_at)
        SELECT
            users.id,
            users.year_id,
            users.project_id,
            (
                SELECT group_members.group_id
                FROM group_members
                JOIN groups ON groups.id = group_members.group_id
                WHERE group_members.student_id = users.id
                  AND groups.project_id = users.project_id
                LIMIT 1
            ),
            '在读',
            '首次参加',
            CURRENT_TIMESTAMP
        FROM users
        WHERE users.role = 'student'
          AND users.year_id IS NOT NULL
          AND users.project_id IS NOT NULL
    """
    if database_dialect == "postgresql":
        enrollment_insert += " ON CONFLICT DO NOTHING"
    else:
        enrollment_insert = enrollment_insert.replace("INSERT INTO", "INSERT OR IGNORE INTO", 1)
    connection.execute(text(enrollment_insert))
    connection.execute(text("""
        INSERT INTO group_members (group_id, student_id, role, created_at)
        SELECT project_enrollments.group_id, project_enrollments.student_id, NULL, CURRENT_TIMESTAMP
        FROM project_enrollments
        WHERE project_enrollments.group_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM group_members
              WHERE group_members.group_id = project_enrollments.group_id
                AND group_members.student_id = project_enrollments.student_id
          )
    """))
    # 项目年度是业务归属的唯一来源。修复历史上项目改年度后，
    # 小组或阶段仍停留在旧年度而被看板筛选遗漏的数据。
    connection.execute(text("""
        UPDATE groups
        SET year_id = (SELECT training_projects.year_id FROM training_projects WHERE training_projects.id = groups.project_id)
        WHERE EXISTS (
            SELECT 1 FROM training_projects
            WHERE training_projects.id = groups.project_id
              AND training_projects.year_id != groups.year_id
        )
    """))
    connection.execute(text("""
        UPDATE phases
        SET year_id = (SELECT training_projects.year_id FROM training_projects WHERE training_projects.id = phases.project_id)
        WHERE EXISTS (
            SELECT 1 FROM training_projects
            WHERE training_projects.id = phases.project_id
              AND training_projects.year_id != phases.year_id
        )
    """))

app = FastAPI(
    title="Points Management System",
    description="HR Points Management Platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(common.router)
app.include_router(admin.router)
app.include_router(student.router)

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")
UPLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


@app.get("/api")
def api_root():
    return {"message": "Points System API", "docs": "/docs"}


@app.get("/api/health/database")
def database_health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "provider": "supabase-postgresql" if engine.dialect.name == "postgresql" else "local-sqlite",
    }


if os.path.exists(FRONTEND_DIR):
    assets_dir = os.path.join(FRONTEND_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str = ""):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        if full_path.startswith("docs") or full_path.startswith("openapi"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        file_path = os.path.join(FRONTEND_DIR, full_path) if full_path else ""
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
