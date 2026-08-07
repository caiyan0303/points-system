"""学员端 — 全部接口"""
import math
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import and_, case, func, or_

from database import get_db
from models import (
    User, AcademicYear, TrainingProject, Group, GroupMember, ProjectEnrollment,
    Phase, PhaseParticipant, PhaseGroup,
    Point, TeamPoint, Product, Redemption,
    UserRole, EmploymentStatus, AccountStatus,
    YearStatus, ProjectStatus, GroupStatus, PhaseStatus,
    PointDataSource, PointStatus, ProductStatus, RedemptionStatus,
)
from schemas import (
    PaginatedResponse, StudentDashboardStats,
    PointRecordOut,
    ProductOut, RedemptionCreate, RedemptionOut,
)
from auth import get_current_user, require_student

router = APIRouter(prefix="/api/student", tags=["学员端"])


# ═══════════════ 辅助函数 ═══════════════

def _compute_student_points(db: Session, student_id: int, year_id: Optional[int] = None, project_id: Optional[int] = None):
    """计算学员积分三值"""
    total_earned = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
        Point.student_id == student_id,
        Point.status == PointStatus.ACTIVE.value,
    ).scalar() or 0

    period_q = db.query(Point).filter(
        Point.student_id == student_id,
        Point.status == PointStatus.ACTIVE.value,
    )
    if year_id is not None:
        period_q = period_q.filter(Point.year_id == year_id)
    if project_id is not None:
        period_q = period_q.filter(Point.project_id == project_id)

    period_points = period_q.with_entities(func.coalesce(func.sum(Point.points), 0)).scalar() or 0

    spent = db.query(func.coalesce(func.sum(Redemption.points_spent), 0)).filter(
        Redemption.student_id == student_id,
        Redemption.status.in_([
            RedemptionStatus.APPROVED.value,
            RedemptionStatus.PENDING_SHIP.value,
            RedemptionStatus.SHIPPED.value,
            RedemptionStatus.PENDING_PICKUP.value,
            RedemptionStatus.RECEIVED.value,
            RedemptionStatus.COMPLETED.value,
        ]),
    ).scalar() or 0
    frozen = db.query(func.coalesce(func.sum(Redemption.points_spent), 0)).filter(
        Redemption.student_id == student_id,
        Redemption.status == RedemptionStatus.PENDING.value,
    ).scalar() or 0
    available = total_earned - spent - frozen

    return period_points, total_earned, max(available, 0)


def _get_group_for_student(db: Session, student_id: int, project_id: Optional[int] = None):
    """获取学员在指定项目中的小组；未指定时使用当前项目。"""
    student = db.query(User).filter(User.id == student_id).first()
    selected_project_id = project_id or (student.project_id if student else None)
    if student and selected_project_id:
        enrollment = db.query(ProjectEnrollment).filter(
            ProjectEnrollment.student_id == student_id,
            ProjectEnrollment.project_id == selected_project_id,
        ).first()
        if enrollment and enrollment.group_id:
            return db.query(Group).filter(Group.id == enrollment.group_id).first()
    gm_query = db.query(GroupMember).join(Group, Group.id == GroupMember.group_id).filter(GroupMember.student_id == student_id)
    if selected_project_id:
        gm_query = gm_query.filter(Group.project_id == selected_project_id)
    gm = gm_query.first()
    if gm:
        return db.query(Group).filter(Group.id == gm.group_id).first()
    return None


BLOCKING_REDEMPTION_STATUSES = [
    RedemptionStatus.PENDING.value,
    RedemptionStatus.APPROVED.value,
    RedemptionStatus.PENDING_SHIP.value,
    RedemptionStatus.SHIPPED.value,
    RedemptionStatus.PENDING_PICKUP.value,
    RedemptionStatus.RECEIVED.value,
    RedemptionStatus.COMPLETED.value,
]


def _batch_student_point_summaries(
    db: Session,
    student_ids: List[int],
    year_id: Optional[int],
    project_id: Optional[int],
):
    """Return period, cumulative, and redeemable points in three batch queries."""
    ids = list(dict.fromkeys(student_ids))
    if not ids:
        return {}

    total_rows = db.query(Point.student_id, func.coalesce(func.sum(Point.points), 0)).filter(
        Point.student_id.in_(ids), Point.status == PointStatus.ACTIVE.value,
    ).group_by(Point.student_id).all()
    period_query = db.query(Point.student_id, func.coalesce(func.sum(Point.points), 0)).filter(
        Point.student_id.in_(ids), Point.status == PointStatus.ACTIVE.value,
    )
    if year_id is not None:
        period_query = period_query.filter(Point.year_id == year_id)
    if project_id is not None:
        period_query = period_query.filter(Point.project_id == project_id)
    period_rows = period_query.group_by(Point.student_id).all()
    blocked_rows = db.query(
        Redemption.student_id, func.coalesce(func.sum(Redemption.points_spent), 0),
    ).filter(
        Redemption.student_id.in_(ids), Redemption.status.in_(BLOCKING_REDEMPTION_STATUSES),
    ).group_by(Redemption.student_id).all()

    totals = {student_id: int(points or 0) for student_id, points in total_rows}
    periods = {student_id: int(points or 0) for student_id, points in period_rows}
    blocked = {student_id: int(points or 0) for student_id, points in blocked_rows}
    return {
        student_id: {
            "period_points": periods.get(student_id, 0),
            "total_earned": totals.get(student_id, 0),
            "available_points": max(totals.get(student_id, 0) - blocked.get(student_id, 0), 0),
        }
        for student_id in ids
    }


def _project_group_scores(db: Session, project_id: int, year_id: Optional[int] = None):
    """Build all group scores in one aggregate query."""
    member_totals = db.query(
        GroupMember.group_id.label("group_id"),
        func.count(func.distinct(GroupMember.student_id)).label("member_count"),
    ).group_by(GroupMember.group_id).subquery()

    point_join = and_(
        Point.student_id == GroupMember.student_id,
        Point.project_id == project_id,
        Point.status == PointStatus.ACTIVE.value,
    )
    if year_id is not None:
        point_join = and_(point_join, Point.year_id == year_id)
    personal_totals = db.query(
        GroupMember.group_id.label("group_id"),
        func.coalesce(func.sum(Point.points), 0).label("personal_points"),
    ).join(Point, point_join).group_by(GroupMember.group_id).subquery()

    team_query = db.query(
        TeamPoint.group_id.label("group_id"),
        func.coalesce(func.sum(TeamPoint.points), 0).label("team_points"),
    ).filter(
        TeamPoint.project_id == project_id,
        TeamPoint.status == PointStatus.ACTIVE.value,
    )
    if year_id is not None:
        team_query = team_query.filter(TeamPoint.year_id == year_id)
    team_totals = team_query.group_by(TeamPoint.group_id).subquery()

    score_rows = db.query(
        Group.id, Group.name,
        func.coalesce(member_totals.c.member_count, 0),
        func.coalesce(personal_totals.c.personal_points, 0),
        func.coalesce(team_totals.c.team_points, 0),
    ).outerjoin(
        member_totals, member_totals.c.group_id == Group.id,
    ).outerjoin(
        personal_totals, personal_totals.c.group_id == Group.id,
    ).outerjoin(
        team_totals, team_totals.c.group_id == Group.id,
    ).filter(Group.project_id == project_id).all()

    rows = []
    for group_id, group_name, member_count, personal_points, team_points in score_rows:
        personal = int(personal_points or 0)
        team = int(team_points or 0)
        members = int(member_count or 0)
        final = personal + team
        rows.append({
            "id": group_id, "group_id": group_id, "name": group_name, "group_name": group_name,
            "personal_points": personal, "team_points": team,
            "total_points": final, "final_score": final,
            "avg_points": round(final / members, 2) if members else 0,
            "member_count": members,
        })
    rows.sort(key=lambda item: (-item["final_score"], item["group_name"]))
    for index, item in enumerate(rows):
        item["rank"] = index + 1
    return rows


# ═══════════════ Dashboard ═══════════════

@router.get("/dashboard", response_model=StudentDashboardStats)
def dashboard(
    project_id: Optional[int] = Query(None),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    enrollment_query = db.query(
        ProjectEnrollment, TrainingProject, AcademicYear, Group,
    ).join(
        TrainingProject, TrainingProject.id == ProjectEnrollment.project_id,
    ).outerjoin(
        AcademicYear, AcademicYear.id == ProjectEnrollment.year_id,
    ).outerjoin(Group, Group.id == ProjectEnrollment.group_id).filter(
        ProjectEnrollment.student_id == current_user.id,
    )
    if project_id:
        enrollment_query = enrollment_query.filter(ProjectEnrollment.project_id == project_id)
    enrollment_row = enrollment_query.order_by(ProjectEnrollment.joined_at.desc()).first()
    if enrollment_row:
        enrollment, project, year, group = enrollment_row
        selected_project_id = enrollment.project_id
        selected_year_id = enrollment.year_id
        year_name = year.name if year else ""
        project_name = project.name if project else ""
        if not group:
            group = _get_group_for_student(db, current_user.id, selected_project_id)
    else:
        selected_project_id = current_user.project_id
        selected_year_id = current_user.year_id
        metadata = db.query(TrainingProject, AcademicYear).outerjoin(
            AcademicYear, AcademicYear.id == TrainingProject.year_id,
        ).filter(TrainingProject.id == selected_project_id).first() if selected_project_id else None
        project_name = metadata[0].name if metadata and metadata[0] else ""
        year_name = metadata[1].name if metadata and metadata[1] else ""
        group = _get_group_for_student(db, current_user.id, selected_project_id)

    group_name = group.name if group else ""

    period_condition = and_(
        Point.year_id == selected_year_id if selected_year_id is not None else True,
        Point.project_id == selected_project_id if selected_project_id is not None else True,
    )
    total_earned, period_pts = db.query(
        func.coalesce(func.sum(Point.points), 0),
        func.coalesce(func.sum(case((period_condition, Point.points), else_=0)), 0),
    ).filter(
        Point.student_id == current_user.id,
        Point.status == PointStatus.ACTIVE.value,
    ).one()
    total_earned = int(total_earned or 0)
    period_pts = int(period_pts or 0)

    spent_statuses = [
        RedemptionStatus.APPROVED.value,
        RedemptionStatus.PENDING_SHIP.value,
        RedemptionStatus.SHIPPED.value,
        RedemptionStatus.PENDING_PICKUP.value,
        RedemptionStatus.RECEIVED.value,
        RedemptionStatus.COMPLETED.value,
    ]
    blocked, spent = db.query(
        func.coalesce(func.sum(case(
            (Redemption.status.in_(BLOCKING_REDEMPTION_STATUSES), Redemption.points_spent), else_=0,
        )), 0),
        func.coalesce(func.sum(case(
            (Redemption.status.in_(spent_statuses), Redemption.points_spent), else_=0,
        )), 0),
    ).filter(Redemption.student_id == current_user.id).one()
    available = max(total_earned - int(blocked or 0), 0)
    spent = int(spent or 0)

    # 本年度排名
    period_rank = None
    if selected_year_id and selected_project_id:
        rankings = db.query(
            Point.student_id,
            func.sum(Point.points).label("total"),
        ).filter(
            Point.status == PointStatus.ACTIVE.value,
            Point.year_id == selected_year_id,
            Point.project_id == selected_project_id,
        ).group_by(Point.student_id).all()
        rankings_sorted = sorted(rankings, key=lambda x: x[1] or 0, reverse=True)
        for i, r in enumerate(rankings_sorted):
            if r.student_id == current_user.id:
                period_rank = i + 1
                break

    # 阶段列表及当前学员的阶段积分一次读取。
    phases = db.query(Phase).filter(
        Phase.project_id == selected_project_id,
    ).order_by(Phase.id).all() if selected_project_id else []
    phase_ids = [phase.id for phase in phases]
    phase_point_rows = db.query(
        Point.phase_id, func.coalesce(func.sum(Point.points), 0),
    ).filter(
        Point.student_id == current_user.id, Point.phase_id.in_(phase_ids),
        Point.status == PointStatus.ACTIVE.value,
    ).group_by(Point.phase_id).all() if phase_ids else []
    points_by_phase = {phase_id: int(points or 0) for phase_id, points in phase_point_rows}

    curr_phase = next(
        (phase for phase in phases if phase.status == PhaseStatus.IN_PROGRESS.value),
        phases[-1] if phases else None,
    )
    curr_phase_pts = points_by_phase.get(curr_phase.id, 0) if curr_phase else 0
    phase_rank = None
    if curr_phase:
        phase_rankings = db.query(
            Point.student_id,
            func.sum(Point.points).label("total"),
        ).filter(
            Point.phase_id == curr_phase.id,
            Point.status == PointStatus.ACTIVE.value,
        ).group_by(Point.student_id).all()
        phase_rankings_sorted = sorted(phase_rankings, key=lambda x: x[1] or 0, reverse=True)
        for i, r in enumerate(phase_rankings_sorted):
            if r.student_id == current_user.id:
                phase_rank = i + 1
                break

    # 小组排名：一次批量汇总所有小组，避免逐组访问云数据库。
    group_rank = None
    if group and selected_project_id:
        group_scores = _project_group_scores(db, selected_project_id, selected_year_id)
        current_group_score = next(
            (item for item in group_scores if item["group_id"] == group.id), None,
        )
        group_rank = current_group_score["rank"] if current_group_score else None

    # 各阶段积分
    phase_points = []
    for p in phases:
        pts = points_by_phase.get(p.id, 0)
        phase_points.append({
            "phase_id": p.id, "phase_name": p.name,
            "points": pts, "status": p.status,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
        })

    # 最近积分记录
    recent_pts = db.query(
        Point, User.real_name.label("admin_name"), Phase.name.label("phase_name"),
    ).outerjoin(User, User.id == Point.admin_id).outerjoin(
        Phase, Phase.id == Point.phase_id,
    ).filter(
        Point.student_id == current_user.id,
        Point.project_id == selected_project_id if selected_project_id else Point.project_id,
    ).order_by(Point.id.desc()).limit(5).all()
    recent_points = []
    for rp, admin_name, phase_name in recent_pts:
        recent_points.append({
            "id": rp.id, "points": rp.points, "category": rp.category,
            "description": rp.description, "status": rp.status,
            "admin_name": admin_name or "",
            "phase_name": phase_name,
            "created_at": rp.created_at.isoformat() if rp.created_at else None,
        })

    # 最近兑换记录
    recent_reds = db.query(
        Redemption, Product.name.label("product_name"),
    ).outerjoin(Product, Product.id == Redemption.product_id).filter(
        Redemption.student_id == current_user.id,
    ).order_by(Redemption.id.desc()).limit(5).all()
    recent_redemptions = []
    for rr, product_name in recent_reds:
        recent_redemptions.append({
            "id": rr.id, "product_name": product_name or "",
            "points_spent": rr.points_spent, "status": rr.status,
            "created_at": rr.created_at.isoformat() if rr.created_at else None,
        })

    return StudentDashboardStats(
        year_id=selected_year_id,
        project_id=selected_project_id,
        real_name=current_user.real_name,
        year_name=year_name or "",
        project_name=project_name or "",
        group_name=group_name,
        period_points=period_pts,
        period_rank=period_rank,
        total_earned=total_earned,
        available_points=available,
        spent_points=spent,
        current_phase=curr_phase.name if curr_phase else "",
        current_phase_points=curr_phase_pts,
        current_phase_rank=phase_rank,
        group_rank=group_rank,
        phase_points=phase_points,
        recent_points=recent_points,
        recent_redemptions=recent_redemptions,
    )


# ═══════════════ Phase Overview ═══════════════

@router.get("/phase-overview")
def phase_overview(
    project_id: Optional[int] = Query(None),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    selected_project_id = project_id or current_user.project_id
    if project_id:
        enrolled = db.query(ProjectEnrollment).filter(
            ProjectEnrollment.student_id == current_user.id,
            ProjectEnrollment.project_id == project_id,
        ).first()
        if not enrolled:
            raise HTTPException(status_code=403, detail="无权查看未参加的项目")
    if not selected_project_id:
        return {"phases": []}

    project = db.query(TrainingProject).filter(TrainingProject.id == selected_project_id).first()
    year_name = ""
    if project and project.year_id:
        year_name = db.query(AcademicYear.name).filter(AcademicYear.id == project.year_id).scalar() or ""
    phases = db.query(Phase).filter(Phase.project_id == selected_project_id).order_by(Phase.id).all()
    result = []
    for p in phases:
        pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.student_id == current_user.id,
            Point.phase_id == p.id,
            Point.status == PointStatus.ACTIVE.value,
        ).scalar() or 0

        # 排名
        rank = None
        rankings = db.query(
            Point.student_id,
            func.sum(Point.points).label("total"),
        ).filter(
            Point.phase_id == p.id,
            Point.status == PointStatus.ACTIVE.value,
        ).group_by(Point.student_id).all()
        rankings_sorted = sorted(rankings, key=lambda x: x[1] or 0, reverse=True)
        for i, r in enumerate(rankings_sorted):
            if r.student_id == current_user.id:
                rank = i + 1
                break

        # 是否优秀
        is_excellent = 0
        pp = db.query(PhaseParticipant).filter(
            PhaseParticipant.phase_id == p.id,
            PhaseParticipant.student_id == current_user.id,
        ).first()
        if pp:
            is_excellent = pp.is_excellent

        result.append({
            "phase_id": p.id, "phase_name": p.name,
            "year_id": p.year_id,
            "year_name": year_name,
            "project_id": p.project_id,
            "project_name": project.name if project else "",
            "status": p.status, "points": pts, "rank": rank,
            "is_excellent": is_excellent,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
            "category_details": _get_category_details(db, current_user.id, p.id),
        })

    return {"phases": result}


# ═══════════════ Phase Detail ═══════════════

@router.get("/phases/{phase_id}")
def get_phase_detail(
    phase_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    phase = db.query(Phase).filter(Phase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="阶段不存在")
    enrolled = db.query(ProjectEnrollment).filter(
        ProjectEnrollment.student_id == current_user.id,
        ProjectEnrollment.project_id == phase.project_id,
    ).first()
    if phase.project_id != current_user.project_id and not enrolled:
        raise HTTPException(status_code=403, detail="无权查看其他项目的阶段排名")

    pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
        Point.student_id == current_user.id,
        Point.phase_id == phase_id,
        Point.status == PointStatus.ACTIVE.value,
    ).scalar() or 0

    # 个人排名：包含本项目全部学员，尚未获得积分的学员按 0 分展示。
    enrollments = db.query(ProjectEnrollment).filter(
        ProjectEnrollment.project_id == phase.project_id,
    ).all()
    student_ids = list(dict.fromkeys(e.student_id for e in enrollments))
    if not student_ids:
        student_ids = [u.id for u in db.query(User).filter(
            User.role == UserRole.STUDENT.value,
            User.project_id == phase.project_id,
        ).all()]

    point_totals = db.query(
        Point.student_id,
        func.sum(Point.points).label("total"),
    ).filter(
        Point.phase_id == phase_id,
        Point.status == PointStatus.ACTIVE.value,
        Point.student_id.in_(student_ids),
    ).group_by(Point.student_id).all()
    totals_by_student = {r.student_id: int(r.total or 0) for r in point_totals}
    students = db.query(User).filter(User.id.in_(student_ids)).all() if student_ids else []
    students.sort(key=lambda s: (-totals_by_student.get(s.id, 0), s.real_name or s.username or ""))
    enrollment_by_student = {enrollment.student_id: enrollment for enrollment in enrollments}
    group_ids = list({enrollment.group_id for enrollment in enrollments if enrollment.group_id})
    groups_by_id = {
        item.id: item for item in db.query(Group).filter(Group.id.in_(group_ids)).all()
    } if group_ids else {}
    fallback_memberships = db.query(GroupMember.student_id, GroupMember.group_id).join(
        Group, Group.id == GroupMember.group_id,
    ).filter(
        GroupMember.student_id.in_(student_ids), Group.project_id == phase.project_id,
    ).all() if student_ids else []
    fallback_group_by_student = {
        student_id: group_id for student_id, group_id in fallback_memberships
    }
    fallback_group_ids = list({group_id for _, group_id in fallback_memberships})
    missing_group_ids = [group_id for group_id in fallback_group_ids if group_id not in groups_by_id]
    if missing_group_ids:
        groups_by_id.update({
            item.id: item for item in db.query(Group).filter(Group.id.in_(missing_group_ids)).all()
        })
    personal_rankings = []
    for index, student in enumerate(students):
        enrollment = enrollment_by_student.get(student.id)
        student_group = groups_by_id.get(enrollment.group_id) if enrollment and enrollment.group_id else None
        if not student_group:
            student_group = groups_by_id.get(fallback_group_by_student.get(student.id))
        personal_rankings.append({
            "rank": index + 1,
            "student_id": student.id,
            "student_name": student.real_name,
            "group_id": student_group.id if student_group else None,
            "group_name": student_group.name if student_group else None,
            "total_points": totals_by_student.get(student.id, 0),
            "is_me": student.id == current_user.id,
        })
    rank = next((item["rank"] for item in personal_rankings if item["is_me"]), None)
    total_participants = len(personal_rankings)

    # 小组排名：按阶段人均积分排序，同时返回小组总积分与成员数。
    group = _get_group_for_student(db, current_user.id, phase.project_id)
    group_rank = None
    group_pts = 0
    group_ranking_rows = []
    project_groups = db.query(Group).filter(Group.project_id == phase.project_id).all()
    project_group_ids = [project_group.id for project_group in project_groups]
    all_membership_rows = db.query(GroupMember.group_id, GroupMember.student_id).filter(
        GroupMember.group_id.in_(project_group_ids),
    ).all() if project_group_ids else []
    membership_ids_by_group = {group_id: [] for group_id in project_group_ids}
    for group_id, student_id in all_membership_rows:
        membership_ids_by_group.setdefault(group_id, []).append(student_id)
    team_total_rows = db.query(
        TeamPoint.group_id, func.coalesce(func.sum(TeamPoint.points), 0),
    ).filter(
        TeamPoint.group_id.in_(project_group_ids), TeamPoint.phase_id == phase_id,
        TeamPoint.status == PointStatus.ACTIVE.value,
    ).group_by(TeamPoint.group_id).all() if project_group_ids else []
    team_totals_by_group = {group_id: int(points or 0) for group_id, points in team_total_rows}
    for project_group in project_groups:
        member_ids = [e.student_id for e in enrollments if e.group_id == project_group.id]
        if not member_ids:
            member_ids = membership_ids_by_group.get(project_group.id, [])
        member_ids = list(dict.fromkeys(member_ids))
        personal_total = sum(totals_by_student.get(student_id, 0) for student_id in member_ids)
        team_total = team_totals_by_group.get(project_group.id, 0)
        final_score = int(personal_total) + int(team_total)
        average = round(final_score / len(member_ids), 2) if member_ids else 0
        group_ranking_rows.append({
            "group_id": project_group.id,
            "group_name": project_group.name,
            "member_count": len(member_ids),
            "personal_points": int(personal_total),
            "team_points": int(team_total),
            "total_points": final_score,
            "final_score": final_score,
            "avg_points": average,
            "is_my_group": bool(group and project_group.id == group.id),
        })
    group_ranking_rows.sort(key=lambda item: (-item["final_score"], item["group_name"]))
    for index, item in enumerate(group_ranking_rows):
        item["rank"] = index + 1
        if item["is_my_group"]:
            group_rank = item["rank"]
            group_pts = item["total_points"]

    # 优秀成员
    excellent = db.query(PhaseParticipant).filter(
        PhaseParticipant.phase_id == phase_id,
        PhaseParticipant.is_excellent == 1,
    ).all()
    excellent_ids = [item.student_id for item in excellent]
    excellent_users = db.query(User).filter(User.id.in_(excellent_ids)).all() if excellent_ids else []
    excellent_members = [{
        "student_id": student.id, "student_name": student.real_name,
        "department": student.department,
    } for student in excellent_users]

    # 积分记录
    point_records = db.query(Point).filter(
        Point.student_id == current_user.id,
        Point.phase_id == phase_id,
    ).order_by(Point.id.desc()).all()
    points = []
    for r in point_records:
        points.append({
            "id": r.id, "points": r.points, "category": r.category,
            "description": r.description, "status": r.status,
            "data_source": r.data_source,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return {
        "phase": {
            "id": phase.id, "name": phase.name, "status": phase.status,
            "description": phase.description,
            "start_date": phase.start_date.isoformat() if phase.start_date else None,
            "end_date": phase.end_date.isoformat() if phase.end_date else None,
            "allow_ranking": phase.allow_ranking,
        },
        "my_stats": {
            "points": pts, "rank": rank,
            "total_participants": total_participants,
            "group_rank": group_rank,
            "group_points": group_pts,
            "is_excellent": any(ep.student_id == current_user.id for ep in excellent),
            "category_details": _get_category_details(db, current_user.id, phase_id),
        },
        "excellent_members": excellent_members,
        "points": points,
        "rankings": personal_rankings,
        "group_rankings": group_ranking_rows,
    }


# ═══════════════ Team ═══════════════

@router.get("/team")
def get_team(
    project_id: Optional[int] = Query(None),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    selected_project_id = project_id or current_user.project_id
    group = _get_group_for_student(db, current_user.id, selected_project_id)
    if not group:
        raise HTTPException(status_code=404, detail="你当前没有加入任何小组")

    gms = db.query(GroupMember).filter(GroupMember.group_id == group.id).all()
    member_ids = list(dict.fromkeys(gm.student_id for gm in gms))
    role_by_student = {gm.student_id: gm.role for gm in gms}
    users = db.query(User).filter(User.id.in_(member_ids)).all() if member_ids else []
    summaries = _batch_student_point_summaries(db, member_ids, group.year_id, group.project_id)

    phases = db.query(Phase).filter(Phase.project_id == group.project_id).order_by(Phase.id).all()
    phase_ids = [phase.id for phase in phases]
    phase_rows = db.query(
        Point.student_id, Point.phase_id, func.coalesce(func.sum(Point.points), 0),
    ).filter(
        Point.student_id.in_(member_ids), Point.phase_id.in_(phase_ids),
        Point.status == PointStatus.ACTIVE.value,
    ).group_by(Point.student_id, Point.phase_id).all() if member_ids and phase_ids else []
    points_by_student_phase = {
        (student_id, phase_id): int(points or 0)
        for student_id, phase_id, points in phase_rows
    }

    member_pts_data = []
    for student in users:
        summary = summaries.get(student.id, {})
        member_pts_data.append({
            "student_id": student.id, "student_name": student.real_name,
            "email": student.email, "department": student.department,
            "role": role_by_student.get(student.id),
            "period_points": summary.get("period_points", 0),
            "total_earned": summary.get("total_earned", 0),
            "available_points": summary.get("available_points", 0),
            "phase_points": [{
                "phase_id": phase.id, "phase_name": phase.name,
                "points": points_by_student_phase.get((student.id, phase.id), 0),
                "status": phase.status,
            } for phase in phases],
        })
    member_pts_data.sort(key=lambda item: (-item["period_points"], item["student_name"]))
    for index, member in enumerate(member_pts_data):
        member["rank"] = index + 1

    group_scores = _project_group_scores(db, group.project_id, group.year_id)
    current_group_score = next((item for item in group_scores if item["group_id"] == group.id), None)
    all_group_rows = [{
        key: value for key, value in item.items() if key != "member_ids"
    } | {"is_my_group": item["group_id"] == group.id} for item in group_scores]

    enrollments = db.query(ProjectEnrollment).filter(
        ProjectEnrollment.project_id == group.project_id,
    ).all()
    enrolled_ids = list(dict.fromkeys(item.student_id for item in enrollments))
    enrolled_users = db.query(User.id, User.real_name).filter(
        User.id.in_(enrolled_ids),
    ).all() if enrolled_ids else []
    names_by_id = {student_id: real_name for student_id, real_name in enrolled_users}
    group_names_by_id = {item["group_id"]: item["group_name"] for item in group_scores}
    enrollment_group_by_student = {item.student_id: item.group_id for item in enrollments}
    project_point_rows = db.query(
        Point.student_id, func.coalesce(func.sum(Point.points), 0),
    ).filter(
        Point.student_id.in_(enrolled_ids), Point.project_id == group.project_id,
        Point.status == PointStatus.ACTIVE.value,
    ).group_by(Point.student_id).all() if enrolled_ids else []
    project_points_by_student = {student_id: int(points or 0) for student_id, points in project_point_rows}
    personal_rankings = [{
        "student_id": student_id,
        "student_name": names_by_id.get(student_id, ""),
        "group_name": group_names_by_id.get(enrollment_group_by_student.get(student_id)),
        "total_points": project_points_by_student.get(student_id, 0),
    } for student_id in enrolled_ids]
    personal_rankings.sort(key=lambda item: (-item["total_points"], item["student_name"]))
    for index, item in enumerate(personal_rankings):
        item["rank"] = index + 1
        item["is_me"] = item["student_id"] == current_user.id

    team_records = db.query(TeamPoint).filter(
        TeamPoint.group_id == group.id, TeamPoint.project_id == group.project_id,
        TeamPoint.status == PointStatus.ACTIVE.value,
    ).order_by(TeamPoint.obtained_date.desc(), TeamPoint.id.desc()).limit(20).all()
    phase_names_by_id = {phase.id: phase.name for phase in phases}

    personal_pts = current_group_score["personal_points"] if current_group_score else 0
    team_pts = current_group_score["team_points"] if current_group_score else 0
    my_group_rank = current_group_score["rank"] if current_group_score else None

    return {
        "group": {
            "id": group.id, "name": group.name,
            "member_count": len(member_pts_data),
            "total_points": int(personal_pts) + int(team_pts),
            "personal_points": int(personal_pts),
            "team_points": int(team_pts),
            "final_score": int(personal_pts) + int(team_pts),
            "avg_points": round((int(personal_pts) + int(team_pts)) / len(member_pts_data), 2) if member_pts_data else 0,
            "rank": my_group_rank,
        },
        "members": member_pts_data,
        "all_groups": all_group_rows,
        "project_personal_rankings": personal_rankings,
        "team_point_records": [{
            "id": item.id, "category": item.category, "item_name": item.item_name,
            "points": item.points, "obtained_date": item.obtained_date,
            "phase_name": phase_names_by_id.get(item.phase_id),
        } for item in team_records],
    }


def _compute_group_stats_local(db: Session, group_id: int, year_id: int, project_id: int):
    """本地小组积分统计"""
    gms = db.query(GroupMember).filter(GroupMember.group_id == group_id).all()
    member_ids = [m.student_id for m in gms]
    if not member_ids:
        return 0, 0, 0.0
    total_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
        Point.student_id.in_(member_ids),
        Point.status == PointStatus.ACTIVE.value,
        Point.year_id == year_id,
        Point.project_id == project_id,
    ).scalar() or 0
    avg_pts = total_pts / len(member_ids)
    return len(member_ids), total_pts, avg_pts


# ═══════════════ Team Phase Detail ═══════════════

@router.get("/team/phases/{phase_id}")
def get_team_phase_detail(
    phase_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    group = _get_group_for_student(db, current_user.id)
    if not group:
        raise HTTPException(status_code=404, detail="你当前没有加入任何小组")

    phase = db.query(Phase).filter(Phase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="阶段不存在")

    gms = db.query(GroupMember).filter(GroupMember.group_id == group.id).all()
    members = []
    for gm in gms:
        s = db.query(User).filter(User.id == gm.student_id).first()
        if not s:
            continue
        pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.student_id == s.id,
            Point.phase_id == phase_id,
            Point.status == PointStatus.ACTIVE.value,
        ).scalar() or 0

        cat_details = _get_category_details(db, s.id, phase_id)

        # 全局排名
        rank = None
        rankings = db.query(
            Point.student_id,
            func.sum(Point.points).label("total"),
        ).filter(
            Point.phase_id == phase_id,
            Point.status == PointStatus.ACTIVE.value,
        ).group_by(Point.student_id).all()
        rankings_sorted = sorted(rankings, key=lambda x: x[1] or 0, reverse=True)
        for i, r in enumerate(rankings_sorted):
            if r.student_id == s.id:
                rank = i + 1
                break

        members.append({
            "student_id": s.id, "student_name": s.real_name,
            "points": pts, "rank": rank,
            "category_details": cat_details,
        })

    members.sort(key=lambda x: x["points"], reverse=True)
    for i, m in enumerate(members):
        m["team_rank"] = i + 1

    # 小组统计
    gm_ids = [m.student_id for m in gms]
    total_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
        Point.student_id.in_(gm_ids),
        Point.phase_id == phase_id,
        Point.status == PointStatus.ACTIVE.value,
    ).scalar() or 0
    avg_pts = total_pts / len(gm_ids) if gm_ids else 0.0

    # 小组排名
    pgs = db.query(PhaseGroup).filter(PhaseGroup.phase_id == phase_id).all()
    group_rankings = []
    for pg in pgs:
        g = db.query(Group).filter(Group.id == pg.group_id).first()
        if not g:
            continue
        g_gm_ids = [m.student_id for m in db.query(GroupMember).filter(GroupMember.group_id == g.id).all()]
        if not g_gm_ids:
            continue
        g_total = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.student_id.in_(g_gm_ids),
            Point.phase_id == phase_id,
            Point.status == PointStatus.ACTIVE.value,
        ).scalar() or 0
        g_avg = g_total / len(g_gm_ids)
        group_rankings.append((g.id, g_total, g_avg))
    group_rankings.sort(key=lambda x: x[2], reverse=True)
    group_rank = next((i+1 for i, gr in enumerate(group_rankings) if gr[0] == group.id), None)

    return {
        "phase": {
            "id": phase.id, "name": phase.name, "status": phase.status,
            "start_date": phase.start_date.isoformat() if phase.start_date else None,
            "end_date": phase.end_date.isoformat() if phase.end_date else None,
        },
        "group_stats": {
            "group_name": group.name,
            "total_points": total_pts,
            "avg_points": round(avg_pts, 2),
            "rank": group_rank,
            "member_count": len(members),
        },
        "members": members,
    }


# ═══════════════ Points ═══════════════

@router.get("/points/records", response_model=PaginatedResponse)
def point_records(
    year_id: int = Query(None),
    project_id: int = Query(None),
    phase_id: int = Query(None),
    category: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    q = db.query(
        Point,
        User.real_name.label("admin_name"),
        Phase.name.label("phase_name"),
        Group.name.label("group_name"),
        AcademicYear.name.label("year_name"),
        TrainingProject.name.label("project_name"),
    ).outerjoin(User, User.id == Point.admin_id).outerjoin(
        Phase, Phase.id == Point.phase_id,
    ).outerjoin(Group, Group.id == Point.group_id).outerjoin(
        AcademicYear, AcademicYear.id == Point.year_id,
    ).outerjoin(TrainingProject, TrainingProject.id == Point.project_id).filter(
        Point.student_id == current_user.id,
    )
    if year_id:
        q = q.filter(Point.year_id == year_id)
    if project_id:
        q = q.filter(Point.project_id == project_id)
    if phase_id:
        q = q.filter(Point.phase_id == phase_id)
    if category:
        q = q.filter(Point.category == category)

    total = q.count()
    records = q.order_by(Point.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for r, admin_name, phase_name, group_name, year_name, project_name in records:
        items.append(PointRecordOut(
            id=r.id, record_number=r.record_number,
            student_id=r.student_id,
            student_name=current_user.real_name,
            admin_name=admin_name or "",
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


# ═══════════════ Products ═══════════════

@router.get("/products")
def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    q = db.query(Product).filter(
        Product.product_status.in_([
            ProductStatus.AVAILABLE.value,
            ProductStatus.LOW_STOCK.value,
        ]),
        or_(Product.on_sale_time.is_(None), Product.on_sale_time <= func.now()),
        or_(Product.off_sale_time.is_(None), Product.off_sale_time >= func.now()),
    )

    total = q.count()
    products = q.order_by(Product.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for p in products:
        # 检查用户兑换限制
        can_redeem = True
        if p.is_limited and p.limit_per_person:
            redeemed = db.query(func.count(Redemption.id)).filter(
                Redemption.student_id == current_user.id,
                Redemption.product_id == p.id,
                Redemption.status.notin_([
                    RedemptionStatus.CANCELLED.value,
                    RedemptionStatus.REJECTED.value,
                ]),
            ).scalar() or 0
            can_redeem = redeemed < p.limit_per_person

        items.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "image_url": p.image_url,
            "points_required": p.points_required,
            "available_stock": p.available_stock,
            "limit_per_person": p.limit_per_person,
            "is_limited": p.is_limited,
            "can_redeem": can_redeem,
            "product_status": p.product_status,
        })

    return {
        "items": items,
        "total": total, "page": page, "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 1,
    }


# ═══════════════ Redemptions ═══════════════

@router.post("/redemptions")
def create_redemption(
    data: RedemptionCreate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    if product.product_status not in [ProductStatus.AVAILABLE.value, ProductStatus.LOW_STOCK.value]:
        raise HTTPException(status_code=400, detail="商品暂不可兑换")
    in_sale_window = db.query(Product.id).filter(
        Product.id == product.id,
        or_(Product.on_sale_time.is_(None), Product.on_sale_time <= func.now()),
        or_(Product.off_sale_time.is_(None), Product.off_sale_time >= func.now()),
    ).first()
    if not in_sale_window:
        raise HTTPException(status_code=400, detail="当前不在该商品的上架时间范围内")
    if product.available_stock <= 0:
        raise HTTPException(status_code=400, detail="商品库存不足")

    # 检查兑换限制
    if product.is_limited and product.limit_per_person:
        redeemed = db.query(func.count(Redemption.id)).filter(
            Redemption.student_id == current_user.id,
            Redemption.product_id == product.id,
            Redemption.status.notin_([
                RedemptionStatus.CANCELLED.value,
                RedemptionStatus.REJECTED.value,
            ]),
        ).scalar() or 0
        if redeemed >= product.limit_per_person:
            raise HTTPException(status_code=400, detail="已达到该商品个人兑换上限")

    # 检查积分
    _, _, available = _compute_student_points(db, current_user.id, current_user.year_id, current_user.project_id)
    if available < product.points_required:
        raise HTTPException(status_code=400, detail="可用积分不足")

    # 锁定库存
    product.available_stock -= 1
    product.locked_stock += 1

    address_snapshot = current_user.address or "未填写"

    redemption = Redemption(
        student_id=current_user.id,
        product_id=product.id,
        points_spent=product.points_required,
        status=RedemptionStatus.PENDING.value,
        locked_at=datetime.now(timezone.utc),
        address_snapshot=address_snapshot,
        remark=data.remark,
    )
    db.add(redemption)
    db.commit()
    db.refresh(redemption)

    return {"message": "兑换申请已提交，请等待审核", "id": redemption.id}


@router.get("/redemptions", response_model=PaginatedResponse)
def list_redemptions(
    status: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    q = db.query(Redemption).filter(Redemption.student_id == current_user.id)
    if status:
        status_aliases = {
            RedemptionStatus.APPROVED.value: [RedemptionStatus.APPROVED.value, RedemptionStatus.PENDING_SHIP.value],
            RedemptionStatus.SHIPPED.value: [RedemptionStatus.SHIPPED.value, RedemptionStatus.PENDING_PICKUP.value],
        }
        q = q.filter(Redemption.status.in_(status_aliases.get(status, [status])))

    total = q.count()
    records = q.order_by(Redemption.id.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for r in records:
        product = db.query(Product).filter(Product.id == r.product_id).first()
        items.append(RedemptionOut(
            id=r.id, student_id=r.student_id,
            student_name=current_user.real_name,
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


@router.put("/redemptions/{redemption_id}/cancel")
def cancel_redemption(
    redemption_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    redemption = db.query(Redemption).filter(
        Redemption.id == redemption_id,
        Redemption.student_id == current_user.id,
    ).first()
    if not redemption:
        raise HTTPException(status_code=404, detail="兑换记录不存在")
    if redemption.status != RedemptionStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="只能取消待审核的申请")

    # 释放锁定库存
    product = db.query(Product).filter(Product.id == redemption.product_id).first()
    if product:
        if product.locked_stock > 0:
            product.locked_stock -= 1
        product.available_stock += 1

    redemption.status = RedemptionStatus.CANCELLED.value
    db.commit()

    return {"message": "兑换申请已取消"}


# ═══════════════ History ═══════════════

@router.get("/history")
def get_history(
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    # 获取该学员在不同年度的历史数据
    history_years = db.query(AcademicYear).join(
        Point, Point.year_id == AcademicYear.id
    ).filter(Point.student_id == current_user.id).distinct().all()

    result = []
    for y in history_years:
        # 该年度下的总积分
        year_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.student_id == current_user.id,
            Point.year_id == y.id,
            Point.status == PointStatus.ACTIVE.value,
        ).scalar() or 0

        # 排名
        rank = None
        rankings = db.query(
            Point.student_id,
            func.sum(Point.points).label("total"),
        ).filter(
            Point.year_id == y.id,
            Point.status == PointStatus.ACTIVE.value,
        ).group_by(Point.student_id).all()
        rankings_sorted = sorted(rankings, key=lambda x: x[1] or 0, reverse=True)
        for i, r in enumerate(rankings_sorted):
            if r.student_id == current_user.id:
                rank = i + 1
                break

        # 该年度下的项目
        projects = db.query(TrainingProject).filter(TrainingProject.year_id == y.id).all()
        project_list = []
        for proj in projects:
            proj_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
                Point.student_id == current_user.id,
                Point.project_id == proj.id,
                Point.status == PointStatus.ACTIVE.value,
            ).scalar() or 0
            project_list.append({
                "project_id": proj.id, "project_name": proj.name,
                "status": proj.status, "points": proj_pts,
            })

        result.append({
            "year_id": y.id, "year_name": y.name, "status": y.status,
            "period_points": year_pts, "rank": rank,
            "projects": project_list,
        })

    return {"history": result}


# ═══════════════ Profile ═══════════════

@router.get("/profile")
def get_profile(
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    year_name = None
    if current_user.year_id:
        year_name = db.query(AcademicYear.name).filter(AcademicYear.id == current_user.year_id).scalar()
    project_name = None
    if current_user.project_id:
        project_name = db.query(TrainingProject.name).filter(TrainingProject.id == current_user.project_id).scalar()

    group = _get_group_for_student(db, current_user.id)

    enrollment_items = []
    enrollments = db.query(ProjectEnrollment).filter(
        ProjectEnrollment.student_id == current_user.id,
    ).order_by(ProjectEnrollment.joined_at.desc()).all()
    for enrollment in enrollments:
        item_project = db.query(TrainingProject).filter(TrainingProject.id == enrollment.project_id).first()
        item_year = db.query(AcademicYear).filter(AcademicYear.id == enrollment.year_id).first()
        item_group = db.query(Group).filter(Group.id == enrollment.group_id).first() if enrollment.group_id else None
        enrollment_items.append({
            "year_id": enrollment.year_id,
            "project_id": enrollment.project_id,
            "year_name": item_year.name if item_year else "",
            "project_name": item_project.name if item_project else "",
            "group_name": item_group.name if item_group else "",
            "start_date": item_project.start_date.isoformat() if item_project and item_project.start_date else None,
            "end_date": item_project.end_date.isoformat() if item_project and item_project.end_date else None,
            "status": enrollment.status,
            "label": enrollment.label,
            "remark": enrollment.remark,
            "is_current": enrollment.project_id == current_user.project_id,
        })

    return {
        "id": current_user.id,
        "username": current_user.username,
        "real_name": current_user.real_name,
        "email": current_user.email,
        "phone": current_user.phone,
        "address": current_user.address,
        "system": current_user.system,
        "level1_dept": current_user.level1_dept,
        "year_name": year_name or "",
        "project_name": project_name or "",
        "group_name": group.name if group else "",
        "project_enrollments": enrollment_items,
        "employment_status": current_user.employment_status,
        "account_status": current_user.account_status,
    }


@router.put("/profile")
def update_profile(
    data: dict = Body(...),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    allowed_fields = {"email", "phone", "address"}
    for key, val in data.items():
        if key in allowed_fields:
            if key == "email" and val and val != current_user.email:
                existing = db.query(User).filter(User.email == val, User.id != current_user.id).first()
                if existing:
                    raise HTTPException(status_code=400, detail="该邮箱已被使用")
            setattr(current_user, key, val)

    db.commit()
    return {"message": "个人信息已更新"}


@router.get("/rule-text")
def get_student_rule_text(current_user: User = Depends(require_student), db: Session = Depends(get_db)):
    from models import RuleText
    texts = db.query(RuleText).order_by(RuleText.id.desc()).all()
    return [{"id": t.id, "title": t.title, "content": t.content, "updated_at": t.updated_at.isoformat() if t.updated_at else None} for t in texts]


# ═══════════════ Helpers ═══════════════

def _get_category_details(db: Session, student_id: int, phase_id: int) -> List[dict]:
    """获取某学员在某阶段的分类积分明细"""
    details = db.query(Point.category, func.sum(Point.points)).filter(
        Point.student_id == student_id,
        Point.phase_id == phase_id,
        Point.status == PointStatus.ACTIVE.value,
    ).group_by(Point.category).all()
    return [{"category": c, "points": p} for c, p in details]
