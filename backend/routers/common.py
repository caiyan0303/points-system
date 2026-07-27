"""年度/项目基础CRUD router"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime

from database import get_db
from models import AcademicYear, TrainingProject, ProjectStatus, YearStatus, POINT_CATEGORIES
from models import User, Group, GroupMember, ProjectEnrollment, Phase, PhaseParticipant, PhaseGroup, Point, Notification, UserRole, PointStatus
from schemas import YearCreate, YearOut, ProjectCreate, ProjectOut
from auth import get_current_user, require_admin

router = APIRouter(prefix="/api/common", tags=["通用"])


# ═══════════════ 年度 CRUD ═══════════════

@router.get("/years", response_model=List[YearOut])
def list_years(db: Session = Depends(get_db)):
    years = db.query(AcademicYear).order_by(AcademicYear.id.desc()).all()
    return [YearOut.model_validate(y) for y in years]


@router.get("/years/{year_id}", response_model=dict)
def get_year(year_id: int, db: Session = Depends(get_db)):
    year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if not year:
        raise HTTPException(status_code=404, detail="年度不存在")
    projects = db.query(TrainingProject).filter(TrainingProject.year_id == year_id).all()
    project_list = []
    for p in projects:
        phases = db.query(Phase).filter(Phase.project_id == p.id).order_by(Phase.id).all()
        student_count = db.query(func.count(ProjectEnrollment.id)).filter(ProjectEnrollment.project_id == p.id).scalar() or 0
        total_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.project_id == p.id, Point.status == PointStatus.ACTIVE.value
        ).scalar() or 0
        project_list.append({
            "id": p.id, "name": p.name, "status": p.status,
            "student_count": student_count, "total_points": total_pts,
            "phase_count": len(phases),
            "phases": [{"id": ph.id, "name": ph.name, "status": ph.status,
                        "start_date": ph.start_date.isoformat() if ph.start_date else None,
                        "end_date": ph.end_date.isoformat() if ph.end_date else None,
                        "total_points": db.query(func.coalesce(func.sum(Point.points), 0)).filter(
                            Point.phase_id == ph.id, Point.status == PointStatus.ACTIVE.value
                        ).scalar() or 0
                       } for ph in phases]
        })
    return {
        "id": year.id, "name": year.name, "status": year.status,
        "projects": project_list,
    }


@router.put("/years/{year_id}")
def update_year(year_id: int, data: dict, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if not year:
        raise HTTPException(status_code=404, detail="年度不存在")
    if "status" in data:
        year.status = data["status"]
        # 归档年度时自动归档所有未归档的阶段
        if data["status"] == "archived":
            projects = db.query(TrainingProject).filter(TrainingProject.year_id == year_id).all()
            for proj in projects:
                db.query(Phase).filter(Phase.project_id == proj.id, Phase.status.in_(["待开放", "进行中", "已关闭"])).update({"status": "已归档"})
    if "name" in data:
        year.name = data["name"]
    db.commit()
    return {"message": "年度已更新", "id": year.id, "status": year.status}


@router.post("/years", response_model=YearOut)
def create_year(
    data: YearCreate,
    current_user=Depends(require_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(AcademicYear).filter(AcademicYear.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="年度名称已存在")
    year = AcademicYear(name=data.name)
    db.add(year)
    db.commit()
    db.refresh(year)
    return YearOut.model_validate(year)


# ═══════════════ 项目 CRUD ═══════════════

@router.get("/projects", response_model=List[ProjectOut])
def list_projects(
    year_id: int = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(TrainingProject)
    if year_id:
        q = q.filter(TrainingProject.year_id == year_id)
    projects = q.order_by(TrainingProject.id.desc()).all()
    return [ProjectOut.model_validate(p) for p in projects]


@router.post("/projects", response_model=ProjectOut)
def create_project(
    data: ProjectCreate,
    current_user=Depends(require_admin),
    db: Session = Depends(get_db),
):
    year_id = data.year_id
    year_name = data.year_name
    if year_name and not year_id:
        year = db.query(AcademicYear).filter(AcademicYear.name == year_name).first()
        if not year:
            year = AcademicYear(name=year_name)
            db.add(year)
            db.flush()
        year_id = year.id
    if not year_id:
        raise HTTPException(status_code=400, detail="请提供年度信息")
    year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if not year:
        raise HTTPException(status_code=404, detail="年度不存在")
    if data.start_date and data.end_date and data.start_date > data.end_date:
        raise HTTPException(status_code=400, detail="项目结束时间不能早于开始时间")
    project = TrainingProject(
        name=data.name,
        # year_id may come from the newly-created/found year above. Using the
        # original request value here leaves it as None when only year_name is
        # submitted and violates training_projects.year_id's NOT NULL rule.
        year_id=year_id,
        start_date=data.start_date,
        end_date=data.end_date,
        description=data.description,
        status=ProjectStatus.ACTIVE.value,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectOut.model_validate(project)


# ═══════════════ 积分分类 ═══════════════

@router.get("/phases/categories")
def list_phase_categories():
    return {"categories": POINT_CATEGORIES}


# ═══════════════ 项目管理（增强） ═══════════════

@router.get("/projects/manage")
def list_projects_manage(db: Session = Depends(get_db)):
    """项目管理列表 — 含学员数、阶段数、积分统计"""
    projects = db.query(TrainingProject).order_by(TrainingProject.id.desc()).all()
    result = []
    for p in projects:
        year_name = db.query(AcademicYear.name).filter(AcademicYear.id == p.year_id).scalar() or ""
        student_count = db.query(func.count(ProjectEnrollment.id)).filter(ProjectEnrollment.project_id == p.id).scalar() or 0
        group_count = db.query(func.count(Group.id)).filter(Group.project_id == p.id).scalar() or 0
        phase_count = db.query(func.count(Phase.id)).filter(Phase.project_id == p.id).scalar() or 0
        total_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.project_id == p.id, Point.status == PointStatus.ACTIVE.value
        ).scalar() or 0
        result.append({
            "id": p.id, "name": p.name, "year_id": p.year_id, "year_name": year_name,
            "status": p.status, "description": p.description,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
            "student_count": student_count, "group_count": group_count,
            "phase_count": phase_count, "total_points": total_pts,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })
    return result


@router.put("/projects/{project_id}")
def update_project(project_id: int, data: dict, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    project = db.query(TrainingProject).filter(TrainingProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if "name" in data:
        project.name = data["name"]
    if "description" in data:
        project.description = data["description"]
    if "status" in data:
        project.status = data["status"]
    if "start_date" in data:
        project.start_date = datetime.fromisoformat(data["start_date"]) if data["start_date"] else None
    if "end_date" in data:
        project.end_date = datetime.fromisoformat(data["end_date"]) if data["end_date"] else None
    if project.start_date and project.end_date and project.start_date > project.end_date:
        raise HTTPException(status_code=400, detail="项目结束时间不能早于开始时间")
    if project.start_date or project.end_date:
        for phase in db.query(Phase).filter(Phase.project_id == project.id).all():
            if project.start_date and phase.start_date and phase.start_date < project.start_date:
                raise HTTPException(status_code=400, detail=f"项目开始时间不能晚于阶段“{phase.name}”的开始时间")
            if project.end_date and phase.end_date and phase.end_date > project.end_date:
                raise HTTPException(status_code=400, detail=f"项目结束时间不能早于阶段“{phase.name}”的结束时间")
    year_name = str(data.get("year_name") or "").strip()
    if year_name:
        year = db.query(AcademicYear).filter(AcademicYear.name == year_name).first()
        if not year:
            year = AcademicYear(name=year_name)
            db.add(year)
            db.flush()
        project.year_id = year.id
    elif "year_id" in data and data["year_id"]:
        year = db.query(AcademicYear).filter(AcademicYear.id == data["year_id"]).first()
        if not year:
            raise HTTPException(status_code=404, detail="年度不存在")
        project.year_id = data["year_id"]
    db.commit()
    return {"message": "项目已更新", "id": project.id}


@router.put("/projects/{project_id}/archive")
def archive_project(project_id: int, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    project = db.query(TrainingProject).filter(TrainingProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    project.status = ProjectStatus.ARCHIVED.value
    # 同时归档该项目下的所有进行中的阶段
    db.query(Phase).filter(Phase.project_id == project_id, Phase.status == "进行中").update({"status": "已关闭"})
    db.commit()
    return {"message": f"项目「{project.name}」已归档"}


@router.put("/projects/{project_id}/activate")
def activate_project(project_id: int, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    project = db.query(TrainingProject).filter(TrainingProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    project.status = ProjectStatus.ACTIVE.value
    db.commit()
    return {"message": f"项目「{project.name}」已激活"}


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    project = db.query(TrainingProject).filter(TrainingProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    name = project.name

    # 统计
    student_count = db.query(func.count(ProjectEnrollment.id)).filter(ProjectEnrollment.project_id == project_id).scalar() or 0
    phase_count = db.query(func.count(Phase.id)).filter(Phase.project_id == project_id).scalar() or 0
    group_count = db.query(func.count(Group.id)).filter(Group.project_id == project_id).scalar() or 0
    point_count = db.query(func.count(Point.id)).filter(Point.project_id == project_id).scalar() or 0

    # 删除项目关系但保留学员账号；学员可能仍参加其他年度或项目。
    db.query(Point).filter(Point.project_id == project_id).delete()

    phases_to_del = db.query(Phase.id).filter(Phase.project_id == project_id).all()
    phase_ids = [p[0] for p in phases_to_del]
    if phase_ids:
        db.query(PhaseParticipant).filter(PhaseParticipant.phase_id.in_(phase_ids)).delete(synchronize_session='fetch')
        db.query(PhaseGroup).filter(PhaseGroup.phase_id.in_(phase_ids)).delete(synchronize_session='fetch')
    db.query(Phase).filter(Phase.project_id == project_id).delete()

    affected_student_ids = [row[0] for row in db.query(ProjectEnrollment.student_id).filter(
        ProjectEnrollment.project_id == project_id,
    ).all()]
    db.query(ProjectEnrollment).filter(ProjectEnrollment.project_id == project_id).delete(synchronize_session=False)

    groups_to_del = db.query(Group).filter(Group.project_id == project_id).all()
    for g in groups_to_del:
        db.query(GroupMember).filter(GroupMember.group_id == g.id).delete()
        db.delete(g)

    for student_id in affected_student_ids:
        student = db.query(User).filter(User.id == student_id).first()
        if not student or student.project_id != project_id:
            continue
        fallback = db.query(ProjectEnrollment).filter(
            ProjectEnrollment.student_id == student_id,
        ).order_by(ProjectEnrollment.joined_at.desc()).first()
        student.project_id = fallback.project_id if fallback else None
        student.year_id = fallback.year_id if fallback else None

    db.delete(project)
    db.commit()
    return {"message": f"项目「{name}」已删除（{student_count}名学员, {group_count}个小组, {phase_count}个阶段, {point_count}条积分）"}
