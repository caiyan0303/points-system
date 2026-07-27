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
project_columns = {column["name"] for column in inspect(engine).get_columns("training_projects")}
with engine.begin() as connection:
    if "start_date" not in project_columns:
        connection.execute(text("ALTER TABLE training_projects ADD COLUMN start_date DATETIME"))
    if "end_date" not in project_columns:
        connection.execute(text("ALTER TABLE training_projects ADD COLUMN end_date DATETIME"))
    connection.execute(text("""
        INSERT OR IGNORE INTO project_enrollments
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
