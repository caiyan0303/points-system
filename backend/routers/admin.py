"""管理员端 — 全部接口"""
import math
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Body, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from database import get_db
from models import (
    User, AcademicYear, TrainingProject, Group, GroupMember,
    Phase, PhaseParticipant, PhaseGroup,
    Point, PointRule, RuleText, Product, Redemption, PrizeAward,
    OperationLog,
    UserRole, EmploymentStatus, AccountStatus,
    YearStatus, ProjectStatus, GroupStatus, PhaseStatus,
    PointDataSource, PointStatus, ProductStatus, RedemptionStatus,
    AwardType, POINT_CATEGORIES,
)
from schemas import (
    PaginatedResponse, AdminDashboardStats,
    StudentBrief, StudentDetail, StudentCreate, StudentUpdate,
    BatchImportPreview, BatchImportRequest,
    GroupCreate, GroupOut, GroupDetail,
    PhaseCreate, PhaseUpdate, PhaseOut, PhaseDetail,
    PhaseRanking, GroupRanking, ExcellentSelect,
    PointCreate, PointBatchCreate, PointImportPreview, PointImportRequest,
    PointRevoke, PointRecordOut,
    PointRuleCreate, PointRuleOut,
    ProductCreate, ProductUpdate, ProductOut,
    RedemptionCreate, RedemptionProcess, RedemptionOut,
    AwardRequest, AwardOut,
    OperationLogOut,
)
from auth import get_current_user, require_admin, hash_password

router = APIRouter(prefix="/api/admin", tags=["管理端"])


# ═══════════════ 辅助函数 ═══════════════

def _log_operation(db: Session, admin_id: int, action: str, target_type: str, target_id: Optional[int] = None, detail: Optional[str] = None):
    """记录操作日志"""
    log = OperationLog(
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail,
    )
    db.add(log)


def _compute_student_points(db: Session, student_id: int, year_id: Optional[int] = None, project_id: Optional[int] = None):
    """计算学员积分三值: period_points, total_earned, available_points"""
    # 总获得积分 (所有活跃积分)
    total_earned = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
        Point.student_id == student_id,
        Point.status == PointStatus.ACTIVE.value,
    ).scalar() or 0

    # 本期积分 (指定年度+项目下的活跃积分)
    period_q = db.query(Point).filter(
        Point.student_id == student_id,
        Point.status == PointStatus.ACTIVE.value,
    )
    if year_id is not None:
        period_q = period_q.filter(Point.year_id == year_id)
    if project_id is not None:
        period_q = period_q.filter(Point.project_id == project_id)
    period_points = db.query(func.coalesce(func.sum(period_q.subquery().c.points), 0)).scalar() if period_q.count() > 0 else 0

    # 可用积分 = total_earned - 已消耗(已通过/待发货/待领取/已领取) - 冻结(待审核)
    spent = db.query(func.coalesce(func.sum(Redemption.points_spent), 0)).filter(
        Redemption.student_id == student_id,
        Redemption.status.in_([
            RedemptionStatus.APPROVED.value,
            RedemptionStatus.PENDING_SHIP.value,
            RedemptionStatus.SHIPPED.value,
            RedemptionStatus.PENDING_PICKUP.value,
            RedemptionStatus.RECEIVED.value,
        ]),
    ).scalar() or 0
    frozen = db.query(func.coalesce(func.sum(Redemption.points_spent), 0)).filter(
        Redemption.student_id == student_id,
        Redemption.status == RedemptionStatus.PENDING.value,
    ).scalar() or 0
    available = total_earned - spent - frozen

    return period_points, total_earned, max(available, 0)


def _compute_group_stats(db: Session, group_id: int):
    """计算小组积分统计"""
    members = db.query(GroupMember).filter(GroupMember.group_id == group_id).all()
    member_ids = [m.student_id for m in members]
    if not member_ids:
        return 0, 0, 0.0

    total_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
        Point.student_id.in_(member_ids),
        Point.status == PointStatus.ACTIVE.value,
    ).scalar() or 0

    member_count = len(member_ids)
    avg_pts = total_pts / member_count if member_count > 0 else 0.0
    return member_count, total_pts, avg_pts


def _compute_group_period_stats(db: Session, group_id: int):
    """计算小组的本期积分(仅限active的year和project)"""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        return 0, 0.0
    members = db.query(GroupMember).filter(GroupMember.group_id == group_id).all()
    member_ids = [m.student_id for m in members]
    if not member_ids:
        return 0, 0.0

    total_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
        Point.student_id.in_(member_ids),
        Point.status == PointStatus.ACTIVE.value,
        Point.year_id == group.year_id,
        Point.project_id == group.project_id,
    ).scalar() or 0

    avg_pts = total_pts / len(member_ids)
    return total_pts, avg_pts


def _ensure_not_none(val):
    """确保值不为 None"""
    return val if val is not None else 0


# ═══════════════ Dashboard ═══════════════

@router.get("/dashboard", response_model=AdminDashboardStats)
def dashboard(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    total_students = db.query(func.count(User.id)).filter(User.role == UserRole.STUDENT.value).scalar() or 0
    active_students = db.query(func.count(User.id)).filter(
        User.role == UserRole.STUDENT.value,
        User.account_status == AccountStatus.ENABLED.value,
        User.is_active == 1,
    ).scalar() or 0
    terminated_students = db.query(func.count(User.id)).filter(
        User.role == UserRole.STUDENT.value,
        User.account_status == AccountStatus.TERMINATED.value,
    ).scalar() or 0

    curr_year = db.query(AcademicYear).filter(AcademicYear.status == YearStatus.ACTIVE.value).first()
    curr_project = None
    if curr_year:
        curr_project = db.query(TrainingProject).filter(
            TrainingProject.year_id == curr_year.id,
            TrainingProject.status == ProjectStatus.ACTIVE.value,
        ).first()

    curr_phase = db.query(Phase).filter(Phase.status == PhaseStatus.IN_PROGRESS.value).first()

    total_period_points = 0
    if curr_year and curr_project:
        total_period_points = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.status == PointStatus.ACTIVE.value,
            Point.year_id == curr_year.id,
            Point.project_id == curr_project.id,
        ).scalar() or 0

    available_points_total = 0
    all_students = db.query(User).filter(
        User.role == UserRole.STUDENT.value,
        User.account_status == AccountStatus.ENABLED.value,
    ).all()
    for s in all_students:
        _, _, avail = _compute_student_points(db, s.id, curr_year.id if curr_year else None, curr_project.id if curr_project else None)
        available_points_total += avail

    pending_redemptions = db.query(func.count(Redemption.id)).filter(
        Redemption.status == RedemptionStatus.PENDING.value,
    ).scalar() or 0
    completed_redemptions = db.query(func.count(Redemption.id)).filter(
        Redemption.status == RedemptionStatus.RECEIVED.value,
    ).scalar() or 0
    low_stock_products = db.query(func.count(Product.id)).filter(
        Product.product_status == ProductStatus.LOW_STOCK.value,
    ).scalar() or 0

    # 阶段概览
    phases = db.query(Phase).order_by(Phase.id.desc()).all()
    phase_overview = []
    for p in phases:
        p_count = db.query(func.count(func.distinct(PhaseParticipant.student_id))).filter(
            PhaseParticipant.phase_id == p.id,
        ).scalar() or 0
        g_count = db.query(func.count(PhaseGroup.id)).filter(
            PhaseGroup.phase_id == p.id,
        ).scalar() or 0
        p_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.phase_id == p.id,
            Point.status == PointStatus.ACTIVE.value,
        ).scalar() or 0
        phase_overview.append({
            "id": p.id, "name": p.name, "status": p.status,
            "participant_count": p_count, "group_count": g_count,
            "total_points": p_pts,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
        })

    return AdminDashboardStats(
        total_students=total_students,
        active_students=active_students,
        terminated_students=terminated_students,
        current_year=curr_year.name if curr_year else "",
        current_project=curr_project.name if curr_project else "",
        current_phase=curr_phase.name if curr_phase else "",
        current_phase_status=curr_phase.status if curr_phase else "",
        period_points=total_period_points,
        available_points_total=available_points_total,
        pending_redemptions=pending_redemptions,
        completed_redemptions=completed_redemptions,
        low_stock_products=low_stock_products,
        phase_overview=phase_overview,
    )


# ═══════════════ Students ═══════════════

@router.get("/students", response_model=PaginatedResponse)
def list_students(
    keyword: str = Query(""),
    year_id: int = Query(None),
    project_id: int = Query(None),
    group_id: int = Query(None),
    employment_status: str = Query(None),
    account_status: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(User).filter(User.role == UserRole.STUDENT.value)

    if keyword:
        q = q.filter(
            or_(
                User.username.contains(keyword),
                User.real_name.contains(keyword),
                User.email.contains(keyword),
                User.department.contains(keyword),
            )
        )
    if year_id:
        q = q.filter(User.year_id == year_id)
    if project_id:
        q = q.filter(User.project_id == project_id)
    if employment_status:
        q = q.filter(User.employment_status == employment_status)
    if account_status:
        q = q.filter(User.account_status == account_status)
    if group_id:
        member_ids = db.query(GroupMember.student_id).filter(GroupMember.group_id == group_id).subquery()
        q = q.filter(User.id.in_(member_ids))

    total = q.count()
    students = q.order_by(User.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for s in students:
        year_name = db.query(AcademicYear.name).filter(AcademicYear.id == s.year_id).scalar() if s.year_id else None
        project_name = db.query(TrainingProject.name).filter(TrainingProject.id == s.project_id).scalar() if s.project_id else None
        gm = db.query(GroupMember).filter(GroupMember.student_id == s.id).first()
        group_name = None
        if gm:
            g = db.query(Group).filter(Group.id == gm.group_id).first()
            if g:
                group_name = g.name
        period_pts, total_earned, available = _compute_student_points(db, s.id, s.year_id, s.project_id)
        items.append(StudentBrief(
            id=s.id, username=s.username, real_name=s.real_name,
            email=s.email, phone=s.phone, address=s.address, department=s.department,
            system=s.system, level1_dept=s.level1_dept,
            year_id=s.year_id, project_id=s.project_id,
            year_name=year_name, project_name=project_name, group_name=group_name,
            employment_status=s.employment_status, account_status=s.account_status,
            period_points=period_pts, total_earned=total_earned, available_points=available,
            created_at=s.created_at,
        ))

    return PaginatedResponse(
        items=[it.model_dump() for it in items],
        total=total, page=page, page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 1,
    )


@router.post("/students")
def create_student(
    data: StudentCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # 用真名生成用户名，若重复则加数字后缀
    base_username = data.real_name
    username = base_username
    counter = 1
    while db.query(User).filter(User.username == username).first():
        username = f"{base_username}{counter}"
        counter += 1

    if data.email:
        existing_email = db.query(User).filter(User.email == data.email).first()
        if existing_email:
            raise HTTPException(status_code=400, detail=f"邮箱 {data.email} 已被使用")

    if data.year_id:
        year = db.query(AcademicYear).filter(AcademicYear.id == data.year_id).first()
        if not year:
            raise HTTPException(status_code=400, detail="所选年度不存在")
    if data.project_id:
        project = db.query(TrainingProject).filter(TrainingProject.id == data.project_id).first()
        if not project:
            raise HTTPException(status_code=400, detail="所选项目不存在")

    user = User(
        username=username,
        password_hash=hash_password(data.password),
        role=UserRole.STUDENT.value,
        real_name=data.real_name,
        email=data.email,
        phone=data.phone,
        address=data.address,
        department=data.department,
        year_id=data.year_id,
        project_id=data.project_id,
        employment_status=data.employment_status,
        account_status=AccountStatus.ENABLED.value,
    )
    db.add(user)
    db.flush()

    _log_operation(db, current_user.id, "创建学员", "student", user.id, f"创建学员 {data.real_name}({username})")
    db.commit()
    db.refresh(user)
    return {"message": f"学员 {data.real_name} 创建成功", "id": user.id, "username": username}


@router.put("/students/{student_id}")
def update_student(
    student_id: int,
    data: StudentUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    student = db.query(User).filter(User.id == student_id, User.role == UserRole.STUDENT.value).first()
    if not student:
        raise HTTPException(status_code=404, detail="学员不存在")

    if data.email and data.email != student.email:
        existing = db.query(User).filter(User.email == data.email, User.id != student_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="该邮箱已被其他用户使用")

    # 处理 group_id 变更
    new_group_id = None
    updates = data.model_dump(exclude_unset=True)
    if "group_id" in updates:
        new_group_id = updates.pop("group_id")

    for key, val in updates.items():
        setattr(student, key, val)

    # 更新小组成员关系
    if new_group_id is not None:
        # 移除旧的成员关系
        db.query(GroupMember).filter(GroupMember.student_id == student_id).delete()
        if new_group_id > 0:
            group = db.query(Group).filter(Group.id == new_group_id).first()
            if not group:
                raise HTTPException(status_code=404, detail="小组不存在")
            gm = GroupMember(group_id=new_group_id, student_id=student_id)
            db.add(gm)

    _log_operation(db, current_user.id, "更新学员", "student", student_id, f"更新学员 {student.real_name}")
    db.commit()
    return {"message": "学员信息已更新"}


@router.get("/students/{student_id}", response_model=StudentDetail)
def get_student_detail(
    student_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    s = db.query(User).filter(User.id == student_id, User.role == UserRole.STUDENT.value).first()
    if not s:
        raise HTTPException(status_code=404, detail="学员不存在")

    year_name = db.query(AcademicYear.name).filter(AcademicYear.id == s.year_id).scalar() if s.year_id else None
    project_name = db.query(TrainingProject.name).filter(TrainingProject.id == s.project_id).scalar() if s.project_id else None
    gm = db.query(GroupMember).filter(GroupMember.student_id == s.id).first()
    group_name = None
    if gm:
        g = db.query(Group).filter(Group.id == gm.group_id).first()
        if g:
            group_name = g.name

    period_pts, total_earned, available = _compute_student_points(db, s.id, s.year_id, s.project_id)

    # 各阶段积分
    phases = db.query(Phase).filter(
        Phase.project_id == s.project_id,
    ).order_by(Phase.id).all() if s.project_id else []
    phase_points = []
    for p in phases:
        pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.student_id == s.id, Point.phase_id == p.id, Point.status == PointStatus.ACTIVE.value,
        ).scalar() or 0
        phase_points.append({"phase_id": p.id, "phase_name": p.name, "points": pts, "status": p.status})

    # 最近积分记录
    recent_pts = db.query(Point).filter(Point.student_id == s.id).order_by(Point.id.desc()).limit(10).all()
    recent_points = []
    for rp in recent_pts:
        admin = db.query(User).filter(User.id == rp.admin_id).first()
        phase_name = db.query(Phase.name).filter(Phase.id == rp.phase_id).scalar() if rp.phase_id else None
        recent_points.append({
            "id": rp.id, "points": rp.points, "category": rp.category,
            "description": rp.description, "status": rp.status,
            "admin_name": admin.real_name if admin else "",
            "phase_name": phase_name,
            "created_at": rp.created_at.isoformat() if rp.created_at else None,
        })

    # 最近兑换记录
    recent_reds = db.query(Redemption).filter(Redemption.student_id == s.id).order_by(Redemption.id.desc()).limit(10).all()
    recent_redemptions = []
    for rr in recent_reds:
        prod = db.query(Product).filter(Product.id == rr.product_id).first()
        recent_redemptions.append({
            "id": rr.id, "product_name": prod.name if prod else "",
            "points_spent": rr.points_spent, "status": rr.status,
            "created_at": rr.created_at.isoformat() if rr.created_at else None,
        })

    # 最近奖��记录
    recent_awds = db.query(PrizeAward).filter(PrizeAward.student_id == s.id).order_by(PrizeAward.id.desc()).limit(10).all()
    recent_awards = []
    for ra in recent_awds:
        prod = db.query(Product).filter(Product.id == ra.product_id).first()
        recent_awards.append({
            "id": ra.id, "product_name": prod.name if prod else "",
            "award_type": ra.award_type, "points_deducted": ra.points_deducted,
            "created_at": ra.created_at.isoformat() if ra.created_at else None,
        })

    return StudentDetail(
        id=s.id, username=s.username, real_name=s.real_name,
        email=s.email, phone=s.phone, address=s.address, department=s.department,
        year_name=year_name, project_name=project_name, group_name=group_name,
        employment_status=s.employment_status, account_status=s.account_status,
        period_points=period_pts, total_earned=total_earned, available_points=available,
        phase_points=phase_points, recent_points=recent_points,
        recent_redemptions=recent_redemptions, recent_awards=recent_awards,
    )


# ═══════════════ Students — Batch Import ═══════════════

@router.post("/students/batch")
def batch_import_students(
    req: BatchImportRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = req.rows
    if not rows:
        raise HTTPException(status_code=400, detail="导入数据为空")

    # 字段名归一化：支持中英文键名
    field_map = {
        '姓名': 'real_name', '邮箱': 'email', '手机': 'phone', '地址': 'address',
        '部门': 'department', '体系': 'system', '一级部门': 'level1_dept',
        '所属年度': 'year_name', '培训项目': 'project_name', '所属小组': 'group_name',
        '在职状态': 'employment_status', '账号状态': 'account_status',
        '密码': 'password',
    }
    normalized_rows = []
    for r in rows:
        new_r = {}
        for k, v in r.items():
            new_r[field_map.get(k, k)] = v
        normalized_rows.append(new_r)
    rows = normalized_rows

    duplicate_emails = []
    missing_fields_rows = []
    invalid_projects = []
    invalid_groups = []

    all_emails = db.query(User.email).filter(User.email.isnot(None)).all()
    existing_emails = {e[0] for e in all_emails if e[0]}

    for i, row in enumerate(rows):
        email = row.get("email")
        real_name = row.get("real_name")
        if not real_name:
            missing_fields_rows.append(i + 1)
        if email and email in existing_emails:
            duplicate_emails.append(email)

    impl = _collect_projects_groups_from_rows(db, rows, invalid_projects, invalid_groups)

    preview = BatchImportPreview(
        total_rows=len(rows),
        new_count=len(rows),
        update_count=0,
        duplicate_emails=duplicate_emails,
        missing_fields=missing_fields_rows,
        invalid_projects=invalid_projects,
        invalid_groups=invalid_groups,
    )

    # 执行实际导入
    created = 0
    for i, row in enumerate(rows):
        real_name = row.get("real_name")
        if not real_name:
            continue
        email = row.get("email")
        if email and email in existing_emails:
            continue

        base_username = real_name
        username = base_username
        counter = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_username}{counter}"
            counter += 1

        password = row.get("password", "123456")
        project_name = row.get("project_name")
        project_id = None
        year_id = None
        if project_name:
            project = db.query(TrainingProject).filter(TrainingProject.name == project_name).first()
            if project:
                project_id = project.id
                year_id = project.year_id

        group_name = row.get("group_name")
        group_id = None
        if group_name and project_id:
            group = db.query(Group).filter(Group.name == group_name, Group.project_id == project_id).first()
            if group:
                group_id = group.id

        user = User(
            username=username,
            password_hash=hash_password(password),
            role=UserRole.STUDENT.value,
            real_name=real_name,
            email=email,
            phone=row.get("phone"),
            address=row.get("address"),
            department=row.get("department"),
            system=row.get("system"),
            level1_dept=row.get("level1_dept"),
            year_id=year_id,
            project_id=project_id,
            employment_status=EmploymentStatus.ACTIVE.value,
            account_status=AccountStatus.ENABLED.value,
        )
        db.add(user)
        db.flush()

        if group_id:
            gm = GroupMember(group_id=group_id, student_id=user.id)
            db.add(gm)

        if email:
            existing_emails.add(email)
        created += 1

    _log_operation(db, current_user.id, "批量导入学员", "student", None, f"批量导入 {created} 名学员")
    db.commit()
    return {"message": f"成功导入 {created} 名学员", "preview": preview.model_dump()}


@router.post("/students/batch-delete")
def batch_delete_students(
    ids: List[int] = Body(...),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not ids:
        raise HTTPException(status_code=400, detail="请选择要删除的学员")
    deleted = 0
    for sid in ids:
        student = db.query(User).filter(User.id == sid, User.role == UserRole.STUDENT.value).first()
        if not student:
            continue
        # 彻底删除学员所有关联数据
        db.query(Point).filter(Point.student_id == sid).delete()
        db.query(GroupMember).filter(GroupMember.student_id == sid).delete()
        db.query(PhaseParticipant).filter(PhaseParticipant.student_id == sid).delete()
        db.query(Redemption).filter(Redemption.student_id == sid).delete()
        db.query(PrizeAward).filter(PrizeAward.student_id == sid).delete()
        db.query(Notification).filter(Notification.user_id == sid).delete()
        db.delete(student)
        deleted += 1
    _log_operation(db, current_user.id, "批量删除学员", "student", None, f"硬删除 {deleted} 名学员")
    db.commit()
    return {"message": f"已彻底删除 {deleted} 名学员"}


def _collect_projects_groups_from_rows(db: Session, rows: list, invalid_projects: list, invalid_groups: list):
    """验证批次导入中的项目名称和小组名称"""
    project_names = {row.get("project_name") for row in rows if row.get("project_name")}
    group_names = {row.get("group_name") for row in rows if row.get("group_name")}

    for pn in project_names:
        exists = db.query(TrainingProject).filter(TrainingProject.name == pn).first()
        if not exists:
            invalid_projects.append(pn)

    for gn in group_names:
        exists = db.query(Group).filter(Group.name == gn).first()
        if not exists:
            invalid_groups.append(gn)


# ═══════════════ Groups ═══════════════

@router.get("/groups", response_model=List[GroupOut])
def list_groups(
    year_id: int = Query(None),
    project_id: int = Query(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Group)
    if year_id:
        q = q.filter(Group.year_id == year_id)
    if project_id:
        q = q.filter(Group.project_id == project_id)

    groups = q.order_by(Group.id.desc()).all()
    result = []
    for g in groups:
        member_count, total_pts, avg_pts = _compute_group_stats(db, g.id)
        year_name = db.query(AcademicYear.name).filter(AcademicYear.id == g.year_id).scalar() or ""
        project_name = db.query(TrainingProject.name).filter(TrainingProject.id == g.project_id).scalar() or ""
        result.append(GroupOut(
            id=g.id, name=g.name, year_id=g.year_id, project_id=g.project_id,
            year_name=year_name, project_name=project_name,
            member_count=member_count, total_points=total_pts,
            avg_points=round(avg_pts, 2), rank=None, status=g.status,
        ))

    # 按 avg_points 排名
    sorted_result = sorted(result, key=lambda x: x.avg_points, reverse=True)
    for i, gr in enumerate(sorted_result):
        gr.rank = i + 1

    return sorted_result


@router.post("/groups", response_model=GroupOut)
def create_group(
    data: GroupCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    year = db.query(AcademicYear).filter(AcademicYear.id == data.year_id).first()
    if not year:
        raise HTTPException(status_code=404, detail="年度不存在")
    project = db.query(TrainingProject).filter(TrainingProject.id == data.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    group = Group(
        name=data.name, year_id=data.year_id, project_id=data.project_id,
        status=GroupStatus.ACTIVE.value,
    )
    db.add(group)
    db.flush()
    _log_operation(db, current_user.id, "创建小组", "group", group.id, f"创建小组 {data.name}")
    db.commit()
    db.refresh(group)

    year_name = db.query(AcademicYear.name).filter(AcademicYear.id == group.year_id).scalar() or ""
    project_name = db.query(TrainingProject.name).filter(TrainingProject.id == group.project_id).scalar() or ""
    return GroupOut(
        id=group.id, name=group.name, year_id=group.year_id, project_id=group.project_id,
        year_name=year_name, project_name=project_name,
        member_count=0, total_points=0, avg_points=0.0, rank=None, status=group.status,
    )


@router.put("/groups/{group_id}", response_model=GroupOut)
def update_group(
    group_id: int,
    data: GroupCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="小组不存在")

    group.name = data.name
    group.year_id = data.year_id
    group.project_id = data.project_id
    _log_operation(db, current_user.id, "更新小组", "group", group_id, f"更新小组 {data.name}")
    db.commit()
    db.refresh(group)

    member_count, total_pts, avg_pts = _compute_group_stats(db, group.id)
    year_name = db.query(AcademicYear.name).filter(AcademicYear.id == group.year_id).scalar() or ""
    project_name = db.query(TrainingProject.name).filter(TrainingProject.id == group.project_id).scalar() or ""
    return GroupOut(
        id=group.id, name=group.name, year_id=group.year_id, project_id=group.project_id,
        year_name=year_name, project_name=project_name,
        member_count=member_count, total_points=total_pts,
        avg_points=round(avg_pts, 2), rank=None, status=group.status,
    )


@router.get("/groups/{group_id}", response_model=GroupDetail)
def get_group_detail(
    group_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="小组不存在")

    member_count, total_pts, avg_pts = _compute_group_stats(db, group.id)
    year_name = db.query(AcademicYear.name).filter(AcademicYear.id == group.year_id).scalar() or ""
    project_name = db.query(TrainingProject.name).filter(TrainingProject.id == group.project_id).scalar() or ""

    # 成员列表(含积分排名)
    gms = db.query(GroupMember).filter(GroupMember.group_id == group_id).all()
    members = []
    member_pts_list = []
    for gm in gms:
        student = db.query(User).filter(User.id == gm.student_id).first()
        if not student:
            continue
        period_pts, total_earned, available = _compute_student_points(db, student.id, student.year_id, student.project_id)
        member_pts_list.append((gm.student_id, student.real_name, period_pts, total_earned, available))

    # 按 period_points 排名
    member_pts_list.sort(key=lambda x: x[2], reverse=True)
    member_rank_map = {}
    for i, mp in enumerate(member_pts_list):
        member_rank_map[mp[0]] = i + 1

    for gm in gms:
        student = db.query(User).filter(User.id == gm.student_id).first()
        if not student:
            continue
        period_pts, total_earned, available = _compute_student_points(db, student.id, student.year_id, student.project_id)

        # 各阶段积分
        phases = db.query(Phase).filter(Phase.project_id == group.project_id).order_by(Phase.id).all()
        phase_pts = []
        for p in phases:
            ppt = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
                Point.student_id == gm.student_id, Point.phase_id == p.id, Point.status == PointStatus.ACTIVE.value,
            ).scalar() or 0
            phase_pts.append({"phase_id": p.id, "phase_name": p.name, "points": ppt})

        members.append({
            "student_id": gm.student_id,
            "student_name": student.real_name,
            "email": student.email,
            "department": student.department,
            "role": gm.role,
            "period_points": period_pts,
            "total_earned": total_earned,
            "available_points": available,
            "phase_points": phase_pts,
            "rank": member_rank_map.get(gm.student_id),
        })

    # 按 period_points 排序成员
    members.sort(key=lambda x: x["period_points"], reverse=True)

    # 各阶段统计
    phases = db.query(Phase).filter(Phase.project_id == group.project_id).order_by(Phase.id).all()
    phase_stats = []
    for p in phases:
        member_ids = [m.student_id for m in gms]
        p_total = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.student_id.in_(member_ids), Point.phase_id == p.id, Point.status == PointStatus.ACTIVE.value,
        ).scalar() or 0
        p_avg = p_total / len(member_ids) if member_ids else 0
        phase_stats.append({
            "phase_id": p.id, "phase_name": p.name,
            "total_points": p_total, "avg_points": round(p_avg, 2),
            "status": p.status,
        })

    # 小组获奖
    awards = db.query(PrizeAward).filter(PrizeAward.group_id == group_id).order_by(PrizeAward.id.desc()).all()
    award_list = []
    for a in awards:
        s_name = db.query(User.real_name).filter(User.id == a.student_id).scalar() or ""
        p_name = db.query(Product.name).filter(Product.id == a.product_id).scalar() or ""
        award_list.append({
            "id": a.id, "student_name": s_name, "product_name": p_name,
            "award_type": a.award_type, "points_deducted": a.points_deducted,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })

    return GroupDetail(
        id=group.id, name=group.name, year_id=group.year_id, project_id=group.project_id,
        year_name=year_name, project_name=project_name,
        member_count=member_count, total_points=total_pts,
        avg_points=round(avg_pts, 2), rank=None, status=group.status,
        members=members, phase_stats=phase_stats, awards=award_list,
    )


@router.post("/groups/{group_id}/members")
def add_group_members(
    group_id: int,
    student_ids: List[int] = Body(...),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="小组不存在")

    added = 0
    for sid in student_ids:
        student = db.query(User).filter(User.id == sid).first()
        if not student:
            continue
        existing = db.query(GroupMember).filter(
            GroupMember.group_id == group_id, GroupMember.student_id == sid,
        ).first()
        if existing:
            continue
        gm = GroupMember(group_id=group_id, student_id=sid)
        db.add(gm)
        added += 1

    _log_operation(db, current_user.id, "添加小组成员", "group", group_id, f"添加 {added} 名成员")
    db.commit()
    return {"message": f"成功添加 {added} 名成员"}


@router.delete("/groups/{group_id}/members/{student_id}")
def remove_group_member(
    group_id: int,
    student_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    gm = db.query(GroupMember).filter(
        GroupMember.group_id == group_id, GroupMember.student_id == student_id,
    ).first()
    if not gm:
        raise HTTPException(status_code=404, detail="该成员不在小组中")
    db.delete(gm)
    _log_operation(db, current_user.id, "移除小组成员", "group", group_id, f"移除学员 {student_id}")
    db.commit()
    return {"message": "成员已移除"}


# ═══════════════ Phases ═══════════════

def _auto_phase_status(phase: Phase):
    """根据北京时间，自动计算阶段实际状态（仅对未开始/进行中的阶段生效，已关闭/已归档不变）"""
    if phase.status in (PhaseStatus.CLOSED.value, PhaseStatus.ARCHIVED.value):
        return phase.status
    if not phase.start_date or not phase.end_date:
        return phase.status
    now = datetime.now(timezone(timedelta(hours=8))).replace(tzinfo=None)  # 北京时间
    if now < phase.start_date:
        return PhaseStatus.PENDING.value
    elif now <= phase.end_date:
        return PhaseStatus.IN_PROGRESS.value
    else:
        return PhaseStatus.CLOSED.value

@router.get("/phases", response_model=List[PhaseOut])
def list_phases(
    year_id: int = Query(None),
    project_id: int = Query(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Phase)
    if year_id:
        q = q.filter(Phase.year_id == year_id)
    if project_id:
        q = q.filter(Phase.project_id == project_id)

    phases = q.order_by(Phase.id.desc()).all()
    result = []
    for p in phases:
        participant_count = db.query(func.count(func.distinct(PhaseParticipant.student_id))).filter(
            PhaseParticipant.phase_id == p.id,
        ).scalar() or 0
        group_count = db.query(func.count(PhaseGroup.id)).filter(PhaseGroup.phase_id == p.id).scalar() or 0
        total_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.phase_id == p.id, Point.status == PointStatus.ACTIVE.value,
        ).scalar() or 0
        year_name = db.query(AcademicYear.name).filter(AcademicYear.id == p.year_id).scalar() or ""
        project_name = db.query(TrainingProject.name).filter(TrainingProject.id == p.project_id).scalar() or ""

        result.append(PhaseOut(
            id=p.id, name=p.name, year_id=p.year_id, project_id=p.project_id,
            year_name=year_name, project_name=project_name,
            start_date=p.start_date, end_date=p.end_date,
            description=p.description, status=p.status,
            participant_count=participant_count, group_count=group_count,
            total_points=total_pts,
            allow_ranking=p.allow_ranking, allow_excellent=p.allow_excellent,
            excellent_count=p.excellent_count,
            prize_description=p.prize_description,
        ))
    return result


@router.post("/phases", response_model=PhaseOut)
def create_phase(
    data: PhaseCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    year = db.query(AcademicYear).filter(AcademicYear.id == data.year_id).first()
    if not year:
        raise HTTPException(status_code=404, detail="年度不存在")
    project = db.query(TrainingProject).filter(TrainingProject.id == data.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 自动关闭同一项目下其他进行中的阶段
    db.query(Phase).filter(
        Phase.project_id == data.project_id,
        Phase.status == PhaseStatus.IN_PROGRESS.value,
    ).update({Phase.status: PhaseStatus.CLOSED.value})

    phase = Phase(
        name=data.name, year_id=data.year_id, project_id=data.project_id,
        start_date=data.start_date, end_date=data.end_date,
        description=data.description,
        allow_ranking=data.allow_ranking, allow_excellent=data.allow_excellent,
        excellent_count=data.excellent_count, prize_description=data.prize_description,
        status=PhaseStatus.IN_PROGRESS.value,
    )
    db.add(phase)
    db.flush()
    _log_operation(db, current_user.id, "创建阶段", "phase", phase.id, f"创建阶段 {data.name}")
    db.commit()
    db.refresh(phase)

    year_name = db.query(AcademicYear.name).filter(AcademicYear.id == phase.year_id).scalar() or ""
    project_name = db.query(TrainingProject.name).filter(TrainingProject.id == phase.project_id).scalar() or ""
    return PhaseOut(
        id=phase.id, name=phase.name, year_id=phase.year_id, project_id=phase.project_id,
        year_name=year_name, project_name=project_name,
        start_date=phase.start_date, end_date=phase.end_date,
        description=phase.description, status=_auto_phase_status(phase),
        participant_count=0, group_count=0, total_points=0,
        allow_ranking=phase.allow_ranking, allow_excellent=phase.allow_excellent,
        excellent_count=phase.excellent_count, prize_description=phase.prize_description,
    )


@router.put("/phases/{phase_id}", response_model=PhaseOut)
def update_phase(
    phase_id: int,
    data: PhaseUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    phase = db.query(Phase).filter(Phase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="阶段不存在")

    updates = data.model_dump(exclude_unset=True)
    for key, val in updates.items():
        setattr(phase, key, val)

    _log_operation(db, current_user.id, "更新阶段", "phase", phase_id, f"更新阶段 {phase.name}")
    db.commit()
    db.refresh(phase)

    participant_count = db.query(func.count(func.distinct(PhaseParticipant.student_id))).filter(
        PhaseParticipant.phase_id == phase.id,
    ).scalar() or 0
    group_count = db.query(func.count(PhaseGroup.id)).filter(PhaseGroup.phase_id == phase.id).scalar() or 0
    total_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
        Point.phase_id == phase.id, Point.status == PointStatus.ACTIVE.value,
    ).scalar() or 0
    year_name = db.query(AcademicYear.name).filter(AcademicYear.id == phase.year_id).scalar() or ""
    project_name = db.query(TrainingProject.name).filter(TrainingProject.id == phase.project_id).scalar() or ""

    return PhaseOut(
        id=phase.id, name=phase.name, year_id=phase.year_id, project_id=phase.project_id,
        year_name=year_name, project_name=project_name,
        start_date=phase.start_date, end_date=phase.end_date,
        description=phase.description, status=_auto_phase_status(phase),
        participant_count=participant_count, group_count=group_count,
        total_points=total_pts,
        allow_ranking=phase.allow_ranking, allow_excellent=phase.allow_excellent,
        excellent_count=phase.excellent_count, prize_description=phase.prize_description,
    )


@router.get("/phases/{phase_id}", response_model=PhaseDetail)
def get_phase_detail(
    phase_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    phase = db.query(Phase).filter(Phase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="阶段不存在")

    participant_count = db.query(func.count(func.distinct(PhaseParticipant.student_id))).filter(
        PhaseParticipant.phase_id == phase.id,
    ).scalar() or 0
    group_count = db.query(func.count(PhaseGroup.id)).filter(PhaseGroup.phase_id == phase.id).scalar() or 0
    total_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
        Point.phase_id == phase.id, Point.status == PointStatus.ACTIVE.value,
    ).scalar() or 0
    year_name = db.query(AcademicYear.name).filter(AcademicYear.id == phase.year_id).scalar() or ""
    project_name = db.query(TrainingProject.name).filter(TrainingProject.id == phase.project_id).scalar() or ""

    # 参与者列表
    parts = db.query(PhaseParticipant).filter(PhaseParticipant.phase_id == phase_id).all()
    participants = []
    for pp in parts:
        s = db.query(User).filter(User.id == pp.student_id).first()
        if not s:
            continue
        gname = None
        if pp.group_id:
            g = db.query(Group).filter(Group.id == pp.group_id).first()
            if g:
                gname = g.name
        participants.append({
            "student_id": s.id, "student_name": s.real_name,
            "group_name": gname, "department": s.department,
            "is_excellent": pp.is_excellent, "prize_given": pp.prize_given,
        })

    # 参与小组
    pgs = db.query(PhaseGroup).filter(PhaseGroup.phase_id == phase_id).all()
    phase_groups = []
    for pg in pgs:
        g = db.query(Group).filter(Group.id == pg.group_id).first()
        if g:
            member_count = db.query(func.count(GroupMember.id)).filter(GroupMember.group_id == g.id).scalar() or 0
            p_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
                Point.phase_id == phase_id,
            ).join(GroupMember, Point.student_id == GroupMember.student_id).filter(
                GroupMember.group_id == g.id,
                Point.status == PointStatus.ACTIVE.value,
            ).scalar() or 0
            phase_groups.append({
                "group_id": g.id, "group_name": g.name,
                "member_count": member_count, "total_points": p_pts,
            })

    # 个人排名
    rankings = _phase_personal_ranking(db, phase_id)

    # 小组排名
    group_rankings = _phase_group_ranking(db, phase_id)

    # 优秀成员
    excellent = db.query(PhaseParticipant).filter(
        PhaseParticipant.phase_id == phase_id, PhaseParticipant.is_excellent == 1,
    ).all()
    excellent_members = []
    for ep in excellent:
        s = db.query(User).filter(User.id == ep.student_id).first()
        if s:
            gname = None
            if ep.group_id:
                g = db.query(Group).filter(Group.id == ep.group_id).first()
                if g:
                    gname = g.name
            excellent_members.append({
                "student_id": s.id, "student_name": s.real_name,
                "group_name": gname, "department": s.department,
            })

    return PhaseDetail(
        id=phase.id, name=phase.name, year_id=phase.year_id, project_id=phase.project_id,
        year_name=year_name, project_name=project_name,
        start_date=phase.start_date, end_date=phase.end_date,
        description=phase.description, status=_auto_phase_status(phase),
        participant_count=participant_count, group_count=group_count,
        total_points=total_pts,
        allow_ranking=phase.allow_ranking, allow_excellent=phase.allow_excellent,
        excellent_count=phase.excellent_count, prize_description=phase.prize_description,
        participants=participants, phase_groups=phase_groups,
        rankings=rankings, group_rankings=group_rankings,
        excellent_members=excellent_members,
    )


def _phase_personal_ranking(db: Session, phase_id: int) -> List[dict]:
    """获取阶段个人排名"""
    rankings = db.query(
        Point.student_id,
        func.sum(Point.points).label("total"),
    ).filter(
        Point.phase_id == phase_id, Point.status == PointStatus.ACTIVE.value,
    ).group_by(Point.student_id).all()

    result = []
    for rank_i, (sid, pts) in enumerate(sorted(rankings, key=lambda x: x[1] or 0, reverse=True)):
        s = db.query(User).filter(User.id == sid).first()
        if not s:
            continue
        # 分类明细
        cat_details = db.query(Point.category, func.sum(Point.points)).filter(
            Point.student_id == sid, Point.phase_id == phase_id, Point.status == PointStatus.ACTIVE.value,
        ).group_by(Point.category).all()

        gm = db.query(GroupMember).filter(GroupMember.student_id == sid).first()
        gname = None
        if gm:
            g = db.query(Group).filter(Group.id == gm.group_id).first()
            if g:
                gname = g.name

        result.append({
            "rank": rank_i + 1, "student_id": sid, "student_name": s.real_name,
            "group_name": gname, "department": s.department,
            "total_points": pts or 0,
            "category_details": [{"category": c, "points": p} for c, p in cat_details],
        })
    return result


def _phase_group_ranking(db: Session, phase_id: int) -> List[dict]:
    """获取阶段小组排名"""
    pgs = db.query(PhaseGroup).filter(PhaseGroup.phase_id == phase_id).all()
    rankings = []
    for pg in pgs:
        group = db.query(Group).filter(Group.id == pg.group_id).first()
        if not group:
            continue
        member_ids = [m.student_id for m in db.query(GroupMember).filter(GroupMember.group_id == group.id).all()]
        if not member_ids:
            continue
        total = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.student_id.in_(member_ids), Point.phase_id == phase_id, Point.status == PointStatus.ACTIVE.value,
        ).scalar() or 0
        avg = total / len(member_ids)
        rankings.append({
            "group_id": group.id, "group_name": group.name,
            "total_points": total, "avg_points": round(avg, 2),
            "member_count": len(member_ids),
        })

    rankings.sort(key=lambda x: x["avg_points"], reverse=True)
    for i, r in enumerate(rankings):
        r["rank"] = i + 1
    return rankings


@router.put("/phases/{phase_id}/close")
def close_phase(
    phase_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    phase = db.query(Phase).filter(Phase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="阶段不存在")
    phase.status = PhaseStatus.CLOSED.value
    _log_operation(db, current_user.id, "关闭阶段", "phase", phase_id, f"关闭阶段 {phase.name}")
    db.commit()
    return {"message": f"阶段「{phase.name}」已关闭"}


@router.put("/phases/{phase_id}/archive")
def archive_phase(
    phase_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    phase = db.query(Phase).filter(Phase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="阶段不存在")
    phase.status = PhaseStatus.ARCHIVED.value
    _log_operation(db, current_user.id, "归档阶段", "phase", phase_id, f"归档阶段 {phase.name}")
    db.commit()
    return {"message": f"阶段「{phase.name}」已归档"}


@router.delete("/phases/{phase_id}")
def delete_phase(
    phase_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    phase = db.query(Phase).filter(Phase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="阶段不存在")
    # Delete related records
    db.query(PhaseParticipant).filter(PhaseParticipant.phase_id == phase_id).delete()
    db.query(PhaseGroup).filter(PhaseGroup.phase_id == phase_id).delete()
    db.query(Point).filter(Point.phase_id == phase_id).update({Point.phase_id: None})
    db.query(PrizeAward).filter(PrizeAward.phase_id == phase_id).update({PrizeAward.phase_id: None})
    name = phase.name
    db.delete(phase)
    _log_operation(db, current_user.id, "删除阶段", "phase", phase_id, f"删除阶段 {name}")
    db.commit()
    return {"message": f"阶段「{name}」已删除"}


@router.get("/phases/{phase_id}/ranking", response_model=List[PhaseRanking])
def phase_ranking(
    phase_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    phase = db.query(Phase).filter(Phase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="阶段不存在")

    rankings_data = _phase_personal_ranking(db, phase_id)
    return [PhaseRanking(**r) for r in rankings_data]


@router.get("/phases/{phase_id}/group-ranking", response_model=List[GroupRanking])
def phase_group_ranking(
    phase_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    phase = db.query(Phase).filter(Phase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="阶段不存在")

    rankings_data = _phase_group_ranking(db, phase_id)
    return [GroupRanking(**r) for r in rankings_data]


@router.post("/phases/{phase_id}/excellent")
def select_excellent_members(
    phase_id: int,
    data: ExcellentSelect,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    phase = db.query(Phase).filter(Phase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="阶段不存在")
    if not phase.allow_excellent:
        raise HTTPException(status_code=400, detail="该阶段不允许评选优秀成员")

    # 先清除之前的优秀标记
    db.query(PhaseParticipant).filter(
        PhaseParticipant.phase_id == phase_id,
        PhaseParticipant.is_excellent == 1,
    ).update({PhaseParticipant.is_excellent: 0})

    marked = 0
    for sid in data.student_ids:
        pp = db.query(PhaseParticipant).filter(
            PhaseParticipant.phase_id == phase_id, PhaseParticipant.student_id == sid,
        ).first()
        if pp:
            pp.is_excellent = 1
            marked += 1

    _log_operation(db, current_user.id, "评选优秀成员", "phase", phase_id, f"评选 {marked} 名优秀成员")
    db.commit()
    return {"message": f"已评选 {marked} 名优秀成员"}


@router.put("/phases/{phase_id}/points")
def batch_add_phase_points(
    phase_id: int,
    data: PointBatchCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    phase = db.query(Phase).filter(Phase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="阶段不存在")

    added = 0
    for rec in data.records:
        student = db.query(User).filter(User.id == rec.student_id).first()
        if not student:
            continue
        record = Point(
            record_number=rec.record_number,
            student_id=rec.student_id,
            admin_id=current_user.id,
            year_id=phase.year_id,
            project_id=phase.project_id,
            phase_id=phase_id,
            group_id=rec.group_id,
            points=rec.points,
            category=rec.category,
            description=rec.description,
            data_source=PointDataSource.BATCH.value,
            status=PointStatus.ACTIVE.value,
            obtained_date=rec.obtained_date or datetime.now(timezone.utc),
        )
        db.add(record)

        # 确保学员在阶段参与者表中
        existing_pp = db.query(PhaseParticipant).filter(
            PhaseParticipant.phase_id == phase_id, PhaseParticipant.student_id == rec.student_id,
        ).first()
        if not existing_pp:
            pp = PhaseParticipant(phase_id=phase_id, student_id=rec.student_id, group_id=rec.group_id)
            db.add(pp)

        added += 1

    _log_operation(db, current_user.id, "阶段批量录入积分", "phase", phase_id, f"录入 {added} 条积分")
    db.commit()
    return {"message": f"成功录入 {added} 条积分记录"}


# ═══════════════ Points ═══════════════

@router.post("/points")
def add_point(
    data: PointCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    student = db.query(User).filter(User.id == data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="用户不存在")

    if data.record_number:
        existing = db.query(Point).filter(Point.record_number == data.record_number).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"记录编号 {data.record_number} 已存在")

    record = Point(
        record_number=data.record_number,
        student_id=data.student_id,
        admin_id=current_user.id,
        year_id=data.year_id,
        project_id=data.project_id,
        phase_id=data.phase_id,
        group_id=data.group_id,
        points=data.points,
        category=data.category,
        description=data.description,
        data_source=PointDataSource.SINGLE.value,
        status=PointStatus.ACTIVE.value,
        obtained_date=data.obtained_date or datetime.now(timezone.utc),
    )
    db.add(record)
    db.flush()

    # 确保学员在阶段参与者表中
    if data.phase_id:
        existing_pp = db.query(PhaseParticipant).filter(
            PhaseParticipant.phase_id == data.phase_id,
            PhaseParticipant.student_id == data.student_id,
        ).first()
        if not existing_pp:
            pp = PhaseParticipant(phase_id=data.phase_id, student_id=data.student_id, group_id=data.group_id)
            db.add(pp)

    _log_operation(db, current_user.id, "录入积分", "point", record.id, f"为学员 {student.real_name} 录入 {data.points} 积分")
    db.commit()
    db.refresh(record)
    return {"message": "积分录入成功", "id": record.id}


@router.post("/points/batch")
def add_points_batch(
    data: PointBatchCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    added = 0
    for rec in data.records:
        if rec.record_number:
            existing = db.query(Point).filter(Point.record_number == rec.record_number).first()
            if existing:
                continue
        record = Point(
            record_number=rec.record_number,
            student_id=rec.student_id,
            admin_id=current_user.id,
            year_id=rec.year_id,
            project_id=rec.project_id,
            phase_id=rec.phase_id,
            group_id=rec.group_id,
            points=rec.points,
            category=rec.category,
            description=rec.description,
            data_source=PointDataSource.BATCH.value,
            status=PointStatus.ACTIVE.value,
            obtained_date=rec.obtained_date or datetime.now(timezone.utc),
        )
        db.add(record)
        if rec.phase_id:
            existing_pp = db.query(PhaseParticipant).filter(
                PhaseParticipant.phase_id == rec.phase_id,
                PhaseParticipant.student_id == rec.student_id,
            ).first()
            if not existing_pp:
                pp = PhaseParticipant(phase_id=rec.phase_id, student_id=rec.student_id, group_id=rec.group_id)
                db.add(pp)
        added += 1

    _log_operation(db, current_user.id, "批量录入积分", "point", None, f"批量录入 {added} 条积分")
    db.commit()
    return {"message": f"成功录入 {added} 条积分记录"}


@router.post("/points/import")
def import_points(
    req: PointImportRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    records = req.records
    if not records:
        raise HTTPException(status_code=400, detail="导入数据为空")

    errors = []
    valid_count = 0
    new_count = 0
    duplicate_count = 0
    unmatched_count = 0
    invalid_phase = 0
    total_points = 0
    student_set = set()

    # 收集所有 record_number 检查重复
    all_numbers = [r.record_number for r in records if r.record_number]
    if all_numbers:
        existing_numbers = {r[0] for r in db.query(Point.record_number).filter(
            Point.record_number.in_(all_numbers)
        ).all() if r[0]}

    for rec in records:
        student = db.query(User).filter(User.id == rec.student_id).first()
        if not student:
            unmatched_count += 1
            errors.append(f"学员 ID {rec.student_id} 不存在")
            continue

        if rec.record_number:
            if rec.record_number in existing_numbers:
                duplicate_count += 1
                continue
            existing_numbers.add(rec.record_number)

        if rec.phase_id:
            phase = db.query(Phase).filter(Phase.id == rec.phase_id).first()
            if not phase:
                invalid_phase += 1
                errors.append(f"阶段 ID {rec.phase_id} 不存在")
                continue

        valid_count += 1
        new_count += 1
        total_points += rec.points
        student_set.add(rec.student_id)

    preview = PointImportPreview(
        valid_count=valid_count,
        student_count=len(student_set),
        new_count=new_count,
        duplicate_count=duplicate_count,
        unmatched_count=unmatched_count,
        invalid_phase=invalid_phase,
        total_points=total_points,
        errors=errors,
    )

    # 实际导入
    imported = 0
    for rec in records:
        if rec.record_number and rec.record_number in existing_numbers:
            continue
        student = db.query(User).filter(User.id == rec.student_id).first()
        if not student:
            continue
        if rec.phase_id:
            phase = db.query(Phase).filter(Phase.id == rec.phase_id).first()
            if not phase:
                continue

        record = Point(
            record_number=rec.record_number,
            student_id=rec.student_id,
            admin_id=current_user.id,
            year_id=rec.year_id,
            project_id=rec.project_id,
            phase_id=rec.phase_id,
            group_id=rec.group_id,
            points=rec.points,
            category=rec.category,
            description=rec.description,
            data_source=PointDataSource.EXCEL.value,
            status=PointStatus.ACTIVE.value,
            obtained_date=rec.obtained_date or datetime.now(timezone.utc),
        )
        db.add(record)

        if rec.phase_id:
            existing_pp = db.query(PhaseParticipant).filter(
                PhaseParticipant.phase_id == rec.phase_id,
                PhaseParticipant.student_id == rec.student_id,
            ).first()
            if not existing_pp:
                pp = PhaseParticipant(phase_id=rec.phase_id, student_id=rec.student_id, group_id=rec.group_id)
                db.add(pp)

        imported += 1

    _log_operation(db, current_user.id, "Excel导入积分", "point", None, f"导入 {imported} 条积分")
    db.commit()
    return {"message": f"成功导入 {imported} 条积分记录", "preview": preview.model_dump()}


@router.put("/points/{point_id}")
def update_point(
    point_id: int,
    data: dict = Body(...),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    point = db.query(Point).filter(Point.id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="积分记录不存在")
    if point.status == PointStatus.REVOKED.value:
        raise HTTPException(status_code=400, detail="已撤销的积分不能修改")

    # 只能修改管理员备注
    if "description" in data:
        point.description = data["description"]

    _log_operation(db, current_user.id, "更新积分备注", "point", point_id, f"更新积分备注")
    db.commit()
    return {"message": "积分记录已更新"}


@router.delete("/points/{point_id}")
def revoke_point(
    point_id: int,
    data: PointRevoke,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    point = db.query(Point).filter(Point.id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="积分记录不存在")
    if point.status == PointStatus.REVOKED.value:
        raise HTTPException(status_code=400, detail="该积分已被撤销")

    point.status = PointStatus.REVOKED.value
    point.revoke_reason = data.reason
    _log_operation(db, current_user.id, "撤销积分", "point", point_id, f"撤销积分: {data.reason}")
    db.commit()
    return {"message": "积分已撤销"}


@router.get("/points/records", response_model=PaginatedResponse)
def list_point_records(
    student_id: int = Query(None),
    year_id: int = Query(None),
    project_id: int = Query(None),
    phase_id: int = Query(None),
    group_id: int = Query(None),
    category: str = Query(None),
    keyword: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Point)
    if student_id:
        q = q.filter(Point.student_id == student_id)
    if year_id:
        q = q.filter(Point.year_id == year_id)
    if project_id:
        q = q.filter(Point.project_id == project_id)
    if phase_id:
        q = q.filter(Point.phase_id == phase_id)
    if group_id:
        q = q.filter(Point.group_id == group_id)
    if category:
        q = q.filter(Point.category == category)
    if keyword:
        q = q.filter(
            or_(
                Point.description.contains(keyword),
                Point.record_number.contains(keyword),
            )
        )

    total = q.count()
    records = q.order_by(Point.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for r in records:
        student = db.query(User).filter(User.id == r.student_id).first()
        admin = db.query(User).filter(User.id == r.admin_id).first()
        phase_name = db.query(Phase.name).filter(Phase.id == r.phase_id).scalar() if r.phase_id else None
        group_name = db.query(Group.name).filter(Group.id == r.group_id).scalar() if r.group_id else None
        year_name = db.query(AcademicYear.name).filter(AcademicYear.id == r.year_id).scalar() or ""
        project_name = db.query(TrainingProject.name).filter(TrainingProject.id == r.project_id).scalar() or ""

        items.append(PointRecordOut(
            id=r.id, record_number=r.record_number,
            student_id=r.student_id,
            student_name=student.real_name if student else "",
            admin_name=admin.real_name if admin else "",
            points=r.points,
            year_name=year_name, project_name=project_name,
            phase_name=phase_name, group_name=group_name,
            category=r.category, description=r.description,
            data_source=r.data_source, status=r.status,
            revoke_reason=r.revoke_reason,
            obtained_date=r.obtained_date, created_at=r.created_at,
        ))

    return PaginatedResponse(
        items=[it.model_dump() for it in items],
        total=total, page=page, page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 1,
    )


@router.get("/points/records/export")
def export_point_records(
    student_id: int = Query(None),
    year_id: int = Query(None),
    project_id: int = Query(None),
    phase_id: int = Query(None),
    group_id: int = Query(None),
    category: str = Query(None),
    keyword: str = Query(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Point)
    if student_id:
        q = q.filter(Point.student_id == student_id)
    if year_id:
        q = q.filter(Point.year_id == year_id)
    if project_id:
        q = q.filter(Point.project_id == project_id)
    if phase_id:
        q = q.filter(Point.phase_id == phase_id)
    if group_id:
        q = q.filter(Point.group_id == group_id)
    if category:
        q = q.filter(Point.category == category)
    if keyword:
        q = q.filter(
            or_(
                Point.description.contains(keyword),
                Point.record_number.contains(keyword),
            )
        )

    records = q.order_by(Point.id.desc()).all()

    items = []
    for r in records:
        student = db.query(User).filter(User.id == r.student_id).first()
        admin = db.query(User).filter(User.id == r.admin_id).first()
        phase_name = db.query(Phase.name).filter(Phase.id == r.phase_id).scalar() if r.phase_id else None
        group_name = db.query(Group.name).filter(Group.id == r.group_id).scalar() if r.group_id else None
        year_name = db.query(AcademicYear.name).filter(AcademicYear.id == r.year_id).scalar() or ""
        project_name = db.query(TrainingProject.name).filter(TrainingProject.id == r.project_id).scalar() or ""

        items.append({
            "id": r.id, "record_number": r.record_number,
            "student_id": r.student_id,
            "student_name": student.real_name if student else "",
            "admin_name": admin.real_name if admin else "",
            "points": r.points,
            "year_name": year_name, "project_name": project_name,
            "phase_name": phase_name, "group_name": group_name,
            "category": r.category, "description": r.description,
            "data_source": r.data_source, "status": r.status,
            "revoke_reason": r.revoke_reason,
            "obtained_date": r.obtained_date.isoformat() if r.obtained_date else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return {"items": items, "total": len(items)}


# ═══════════════ Point Rules ═══════════════

@router.get("/point-rules", response_model=List[PointRuleOut])
def list_point_rules(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rules = db.query(PointRule).order_by(PointRule.id.desc()).all()
    return [PointRuleOut.model_validate(r) for r in rules]


@router.post("/point-rules", response_model=PointRuleOut)
def create_point_rule(
    data: PointRuleCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rule = PointRule(**data.model_dump())
    db.add(rule)
    db.flush()
    _log_operation(db, current_user.id, "创建积分规则", "point_rule", rule.id, f"创建规则 {data.rule_name}")
    db.commit()
    db.refresh(rule)
    return PointRuleOut.model_validate(rule)


@router.put("/point-rules/{rule_id}", response_model=PointRuleOut)
def update_point_rule(
    rule_id: int,
    data: PointRuleCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rule = db.query(PointRule).filter(PointRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")

    for key, val in data.model_dump().items():
        setattr(rule, key, val)

    _log_operation(db, current_user.id, "更新积分规则", "point_rule", rule_id, f"更新规则 {data.rule_name}")
    db.commit()
    db.refresh(rule)
    return PointRuleOut.model_validate(rule)


# ═══════════════ Rule Text (积分规则文本) ═══════════════

@router.get("/rule-text")
def get_rule_text(current_user=Depends(require_admin), db: Session = Depends(get_db)):
    texts = db.query(RuleText).order_by(RuleText.id.desc()).all()
    return [{"id": t.id, "title": t.title, "content": t.content, "updated_at": t.updated_at.isoformat() if t.updated_at else None} for t in texts]


@router.post("/rule-text")
def upload_rule_text(
    data: dict = Body(...),
    current_user=Depends(require_admin),
    db: Session = Depends(get_db),
):
    title = data.get("title", "积分规则说明")
    content = data.get("content", "")
    if not content.strip():
        raise HTTPException(status_code=400, detail="内容不能为空")
    rt = RuleText(title=title, content=content)
    db.add(rt)
    _log_operation(db, current_user.id, "上传规则文本", "rule_text", None, f"上传: {title}")
    db.commit()
    return {"message": "规则文本已上传", "id": rt.id}


@router.delete("/rule-text/{rt_id}")
def delete_rule_text(rt_id: int, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    rt = db.query(RuleText).filter(RuleText.id == rt_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="规则文本不存在")
    db.delete(rt)
    db.commit()
    return {"message": "已删除"}


# ═══════════════ Products ═══════════════

@router.get("/products", response_model=List[ProductOut])
def list_products(
    status: str = Query(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Product)
    if status:
        q = q.filter(Product.product_status == status)
    products = q.order_by(Product.id.desc()).all()
    return [ProductOut.model_validate(p) for p in products]


@router.post("/products/upload-image")
async def upload_product_image(
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin),
):
    """保存商品图片并返回可直接用于商品数据的站内地址。"""
    allowed_types = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    extension = allowed_types.get(file.content_type or "")
    if not extension:
        raise HTTPException(status_code=400, detail="仅支持 JPG、PNG、WebP 或 GIF 图片")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="图片文件为空")
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片不能超过 5MB")

    upload_dir = Path(__file__).resolve().parent.parent / "uploads" / "products"
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    (upload_dir / filename).write_bytes(contents)
    return {"image_url": f"/api/uploads/products/{filename}"}


@router.post("/products", response_model=ProductOut)
def create_product(
    data: ProductCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = Product(
        name=data.name,
        description=data.description,
        image_url=data.image_url,
        points_required=data.points_required,
        total_stock=data.total_stock,
        available_stock=data.total_stock,  # available_stock = total_stock
        locked_stock=0,
        on_site_stock=data.on_site_stock,
        limit_per_person=data.limit_per_person,
        is_limited=data.is_limited,
        on_sale_time=data.on_sale_time,
        off_sale_time=data.off_sale_time,
        product_status=ProductStatus.AVAILABLE.value if data.total_stock > 0 else ProductStatus.SOLD_OUT.value,
    )
    db.add(product)
    db.flush()
    _log_operation(db, current_user.id, "创建商品", "product", product.id, f"创建商品 {data.name}")
    db.commit()
    db.refresh(product)
    return ProductOut.model_validate(product)


@router.put("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    data: ProductUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")

    updates = data.model_dump(exclude_unset=True)
    if "product_status" in updates:
        valid_statuses = {status.value for status in ProductStatus}
        if updates["product_status"] not in valid_statuses:
            raise HTTPException(status_code=400, detail="无效的商品状态")
        if updates["product_status"] == ProductStatus.AVAILABLE.value and product.available_stock <= 0:
            raise HTTPException(status_code=400, detail="库存不足，无法上架")
    for key, val in updates.items():
        setattr(product, key, val)

    _log_operation(db, current_user.id, "更新商品", "product", product_id, f"更新��品 {product.name}")
    db.commit()
    db.refresh(product)
    return ProductOut.model_validate(product)


@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    product.product_status = ProductStatus.OFF_SHELF.value
    _log_operation(db, current_user.id, "下架商品", "product", product_id, f"下架商品 {product.name}")
    db.commit()
    return {"message": "商品已下架"}


# ═══════════════ Redemptions ═══════════════

@router.get("/redemptions", response_model=PaginatedResponse)
def list_redemptions(
    status: str = Query(None),
    keyword: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Redemption)
    if status:
        q = q.filter(Redemption.status == status)
    if keyword:
        q = q.join(User, Redemption.student_id == User.id).filter(
            or_(
                User.real_name.contains(keyword),
                User.username.contains(keyword),
            )
        )

    total = q.count()
    records = q.order_by(Redemption.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for r in records:
        student = db.query(User).filter(User.id == r.student_id).first()
        product = db.query(Product).filter(Product.id == r.product_id).first()
        items.append(RedemptionOut(
            id=r.id, student_id=r.student_id,
            student_name=student.real_name if student else "",
            product_id=r.product_id,
            product_name=product.name if product else "",
            points_spent=r.points_spent, status=r.status,
            locked_at=r.locked_at, approved_at=r.approved_at,
            shipped_at=r.shipped_at, received_at=r.received_at,
            express_company=r.express_company, tracking_number=r.tracking_number,
            pickup_method=r.pickup_method, reject_reason=r.reject_reason,
            address_snapshot=r.address_snapshot, remark=r.remark,
            created_at=r.created_at, updated_at=r.updated_at,
        ))

    return PaginatedResponse(
        items=[it.model_dump() for it in items],
        total=total, page=page, page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 1,
    )


@router.put("/redemptions/{redemption_id}/approve")
def approve_redemption(
    redemption_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    redemption = db.query(Redemption).filter(Redemption.id == redemption_id).first()
    if not redemption:
        raise HTTPException(status_code=404, detail="兑换记录不存在")
    if redemption.status != RedemptionStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="只能审核待审核的申请")

    product = db.query(Product).filter(Product.id == redemption.product_id).first()
    if product:
        # 扣减 available_stock 和 locked_stock
        if product.available_stock > 0:
            product.available_stock -= 1
        if product.locked_stock > 0:
            product.locked_stock -= 1

    redemption.status = RedemptionStatus.PENDING_SHIP.value
    redemption.approved_at = datetime.now(timezone.utc)

    _log_operation(db, current_user.id, "审核通过兑换", "redemption", redemption_id, f"通过兑换申请 #{redemption_id}")
    db.commit()
    return {"message": "兑换申请已通过，等待发货"}


@router.put("/redemptions/{redemption_id}/reject")
def reject_redemption(
    redemption_id: int,
    data: RedemptionProcess,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    redemption = db.query(Redemption).filter(Redemption.id == redemption_id).first()
    if not redemption:
        raise HTTPException(status_code=404, detail="兑换记录不存在")
    if redemption.status != RedemptionStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="只能拒绝待审核的申请")

    # 释放 locked_stock
    product = db.query(Product).filter(Product.id == redemption.product_id).first()
    if product:
        if product.locked_stock > 0:
            product.locked_stock -= 1
        product.available_stock += 1

    redemption.status = RedemptionStatus.REJECTED.value
    redemption.reject_reason = data.reject_reason

    _log_operation(db, current_user.id, "拒绝兑换", "redemption", redemption_id, f"拒绝兑换申请: {data.reject_reason}")
    db.commit()
    return {"message": "兑换申请已拒绝"}


@router.put("/redemptions/{redemption_id}/ship")
def ship_redemption(
    redemption_id: int,
    data: RedemptionProcess,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    redemption = db.query(Redemption).filter(Redemption.id == redemption_id).first()
    if not redemption:
        raise HTTPException(status_code=404, detail="兑换记录不存在")
    if redemption.status != RedemptionStatus.PENDING_SHIP.value:
        raise HTTPException(status_code=400, detail="只能为待发货的申请发货")

    redemption.status = RedemptionStatus.SHIPPED.value
    redemption.shipped_at = datetime.now(timezone.utc)
    redemption.express_company = data.express_company
    redemption.tracking_number = data.tracking_number

    _log_operation(db, current_user.id, "发货", "redemption", redemption_id, f"发货: {data.express_company} {data.tracking_number}")
    db.commit()
    return {"message": "已发货"}


@router.put("/redemptions/{redemption_id}/receive")
def receive_redemption(
    redemption_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    redemption = db.query(Redemption).filter(Redemption.id == redemption_id).first()
    if not redemption:
        raise HTTPException(status_code=404, detail="兑换记录不存在")
    if redemption.status not in [RedemptionStatus.SHIPPED.value, RedemptionStatus.PENDING_PICKUP.value]:
        raise HTTPException(status_code=400, detail="只能为已发货或待领取的申请标记领取")

    redemption.status = RedemptionStatus.RECEIVED.value
    redemption.received_at = datetime.now(timezone.utc)

    _log_operation(db, current_user.id, "确认领取", "redemption", redemption_id, f"确认领取 #{redemption_id}")
    db.commit()
    return {"message": "已确认领取"}


# ═══════════════ On-site Exchange & Reward ═══════════════

@router.post("/on-site/exchange")
def on_site_exchange(
    data: AwardRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    student = db.query(User).filter(User.id == data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="学员不存在")

    product = db.query(Product).filter(Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")

    if product.on_site_stock <= 0:
        raise HTTPException(status_code=400, detail="现场库存不足")

    deduct = data.deduct_points
    if deduct > 0:
        _, _, available = _compute_student_points(db, student.id, student.year_id, student.project_id)
        if available < deduct:
            raise HTTPException(status_code=400, detail="学员可用积分不足")

        # 创建负面积分记录表示扣除
        pt_record = Point(
            student_id=student.id,
            admin_id=current_user.id,
            year_id=student.year_id or 0,
            project_id=student.project_id or 0,
            phase_id=data.phase_id,
            group_id=data.group_id,
            points=-deduct,
            category="特殊调整",
            description=f"现场兑换: {product.name}",
            data_source=PointDataSource.ON_SITE.value,
            status=PointStatus.ACTIVE.value,
            obtained_date=datetime.now(timezone.utc),
        )
        db.add(pt_record)

    # 扣减现场库存
    product.on_site_stock -= 1

    # 创建兑换记录(直接已领取)
    redemption = Redemption(
        student_id=student.id,
        product_id=product.id,
        points_spent=deduct,
        status=RedemptionStatus.RECEIVED.value,
        approved_at=datetime.now(timezone.utc),
        received_at=datetime.now(timezone.utc),
        pickup_method=data.description or "现场领取",
        remark=data.description,
    )
    db.add(redemption)
    db.flush()

    # 创建奖品发放记录
    award = PrizeAward(
        student_id=student.id,
        product_id=product.id,
        phase_id=data.phase_id,
        group_id=data.group_id,
        award_type=AwardType.ON_SITE_EXCHANGE.value,
        points_deducted=deduct,
        created_by=current_user.id,
        description=data.description,
    )
    db.add(award)

    _log_operation(db, current_user.id, "现场兑换", "redemption", redemption.id, f"现场兑换 {product.name} 扣除 {deduct} 积分")
    db.commit()
    return {"message": f"现场兑换成功，扣除 {deduct} 积分"}


@router.post("/on-site/reward")
def on_site_reward(
    data: AwardRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    student = db.query(User).filter(User.id == data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="学员不存在")

    product = db.query(Product).filter(Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")

    if product.on_site_stock <= 0:
        raise HTTPException(status_code=400, detail="现场库存不足")

    product.on_site_stock -= 1

    award = PrizeAward(
        student_id=student.id,
        product_id=product.id,
        phase_id=data.phase_id,
        group_id=data.group_id,
        award_type=data.award_type,
        points_deducted=0,
        created_by=current_user.id,
        description=data.description,
    )
    db.add(award)
    db.flush()

    _log_operation(db, current_user.id, "现场奖励", "prize_award", award.id, f"现场奖励 {product.name}")
    db.commit()
    return {"message": "现场奖励发放成功"}


# ═══════════════ Yearly Data Summary ═══════════════

@router.get("/yearly/overview")
def yearly_overview(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    years = db.query(AcademicYear).order_by(AcademicYear.id.desc()).all()
    result = []
    for year in years:
        all_projects = db.query(TrainingProject).filter(TrainingProject.year_id == year.id).all()
        archived_projects = [project for project in all_projects if project.status == ProjectStatus.ARCHIVED.value]
        if not archived_projects:
            continue

        project_ids = [project.id for project in archived_projects]
        points = db.query(Point).filter(
            Point.project_id.in_(project_ids),
            Point.status == PointStatus.ACTIVE.value,
        ).all()
        earned_points = sum(point.points for point in points if point.points > 0)
        deducted_points = abs(sum(point.points for point in points if point.points < 0))

        student_count = db.query(func.count(func.distinct(User.id))).filter(
            User.role == UserRole.STUDENT.value,
            User.project_id.in_(project_ids),
        ).scalar() or 0
        group_count = db.query(func.count(Group.id)).filter(Group.project_id.in_(project_ids)).scalar() or 0
        phase_count = db.query(func.count(Phase.id)).filter(Phase.project_id.in_(project_ids)).scalar() or 0

        redemptions = db.query(Redemption).join(User, Redemption.student_id == User.id).filter(
            User.project_id.in_(project_ids),
            Redemption.status.notin_([RedemptionStatus.REJECTED.value, RedemptionStatus.CANCELLED.value]),
        ).all()
        award_count = db.query(func.count(PrizeAward.id)).join(
            User, PrizeAward.student_id == User.id
        ).filter(User.project_id.in_(project_ids)).scalar() or 0

        category_rows = db.query(
            Point.category,
            func.coalesce(func.sum(Point.points), 0),
            func.count(Point.id),
        ).filter(
            Point.project_id.in_(project_ids),
            Point.status == PointStatus.ACTIVE.value,
            Point.points > 0,
        ).group_by(Point.category).order_by(func.sum(Point.points).desc()).all()

        project_summaries = []
        for project in archived_projects:
            project_points = [point for point in points if point.project_id == project.id]
            project_summaries.append({
                "id": project.id,
                "name": project.name,
                "student_count": db.query(func.count(User.id)).filter(
                    User.role == UserRole.STUDENT.value,
                    User.project_id == project.id,
                ).scalar() or 0,
                "group_count": db.query(func.count(Group.id)).filter(Group.project_id == project.id).scalar() or 0,
                "phase_count": db.query(func.count(Phase.id)).filter(Phase.project_id == project.id).scalar() or 0,
                "earned_points": sum(point.points for point in project_points if point.points > 0),
                "net_points": sum(point.points for point in project_points),
                "point_records": len(project_points),
            })

        result.append({
            "year_id": year.id,
            "year_name": year.name,
            "status": year.status,
            "project_count": len(archived_projects),
            "total_project_count": len(all_projects),
            "student_count": student_count,
            "group_count": group_count,
            "phase_count": phase_count,
            "earned_points": earned_points,
            "deducted_points": deducted_points,
            "net_points": sum(point.points for point in points),
            "point_records": len(points),
            "redemption_count": len(redemptions),
            "redeemed_points": sum(item.points_spent for item in redemptions),
            "award_count": award_count,
            "categories": [
                {"category": category or "未分类", "points": value or 0, "records": count or 0}
                for category, value, count in category_rows
            ],
            "projects": project_summaries,
        })
    return {
        "years": result,
        "scope_note": "仅统计已归档项目，进行中项目不会进入年度汇总",
    }


@router.post("/yearly/archive")
def archive_year(
    data: dict = Body(...),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    year_id = data.get("year_id")
    action = data.get("action", "archive")

    if not year_id:
        raise HTTPException(status_code=400, detail="请指定年度 ID")

    if action == "archive":
        year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
        if not year:
            raise HTTPException(status_code=404, detail="年度不存在")
        year.status = YearStatus.ARCHIVED.value
        # 同时归档该项目下的项目
        db.query(TrainingProject).filter(TrainingProject.year_id == year_id).update(
            {TrainingProject.status: ProjectStatus.ARCHIVED.value}
        )
        _log_operation(db, current_user.id, "归档年度", "year", year_id, f"归档年度 {year.name}")
        db.commit()
        return {"message": f"年度 {year.name} 已归档"}
    elif action == "activate":
        year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
        if not year:
            raise HTTPException(status_code=404, detail="年度不存在")
        year.status = YearStatus.ACTIVE.value
        _log_operation(db, current_user.id, "激活年度", "year", year_id, f"激活年度 {year.name}")
        db.commit()
        return {"message": f"年度 {year.name} 已激活"}

    return {"message": "操作成功"}


# ═══════════════ Operation Logs ═══════════════

@router.get("/operation-logs", response_model=PaginatedResponse)
def list_operation_logs(
    admin_id: int = Query(None),
    action: str = Query(None),
    target_type: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(OperationLog)
    if admin_id:
        q = q.filter(OperationLog.admin_id == admin_id)
    if action:
        q = q.filter(OperationLog.action == action)
    if target_type:
        q = q.filter(OperationLog.target_type == target_type)

    total = q.count()
    logs = q.order_by(OperationLog.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for log in logs:
        admin = db.query(User).filter(User.id == log.admin_id).first()
        items.append(OperationLogOut(
            id=log.id, admin_id=log.admin_id,
            admin_name=admin.real_name if admin else "",
            action=log.action, target_type=log.target_type,
            target_id=log.target_id, detail=log.detail,
            created_at=log.created_at,
        ))

    return PaginatedResponse(
        items=[it.model_dump() for it in items],
        total=total, page=page, page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 1,
    )
