"""学员端 — 全部接口"""
import math
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from database import get_db
from models import (
    User, AcademicYear, TrainingProject, Group, GroupMember, ProjectEnrollment,
    Phase, PhaseParticipant, PhaseGroup,
    Point, Product, Redemption,
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

    period_points = 0
    if period_q.count() > 0:
        period_points = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.student_id == student_id,
            Point.status == PointStatus.ACTIVE.value,
            Point.year_id == year_id if year_id is not None else Point.year_id,
            Point.project_id == project_id if project_id is not None else Point.project_id,
        ).scalar() or 0

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


# ═══════════════ Dashboard ═══════════════

@router.get("/dashboard", response_model=StudentDashboardStats)
def dashboard(
    project_id: Optional[int] = Query(None),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    enrollment_query = db.query(ProjectEnrollment).filter(ProjectEnrollment.student_id == current_user.id)
    if project_id:
        enrollment_query = enrollment_query.filter(ProjectEnrollment.project_id == project_id)
    enrollment = enrollment_query.order_by(ProjectEnrollment.joined_at.desc()).first()
    selected_project_id = enrollment.project_id if enrollment else current_user.project_id
    selected_year_id = enrollment.year_id if enrollment else current_user.year_id
    year_name = None
    project_name = None
    if selected_year_id:
        year_name = db.query(AcademicYear.name).filter(AcademicYear.id == selected_year_id).scalar()
    if selected_project_id:
        project_name = db.query(TrainingProject.name).filter(TrainingProject.id == selected_project_id).scalar()

    group = _get_group_for_student(db, current_user.id, selected_project_id)

    group_name = group.name if group else ""

    period_pts, total_earned, available = _compute_student_points(
        db, current_user.id, selected_year_id, selected_project_id
    )

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

    # 已消耗积分
    spent = db.query(func.coalesce(func.sum(Redemption.points_spent), 0)).filter(
        Redemption.student_id == current_user.id,
        Redemption.status.in_([
            RedemptionStatus.APPROVED.value,
            RedemptionStatus.PENDING_SHIP.value,
            RedemptionStatus.SHIPPED.value,
            RedemptionStatus.PENDING_PICKUP.value,
            RedemptionStatus.RECEIVED.value,
            RedemptionStatus.COMPLETED.value,
        ]),
    ).scalar() or 0

    # 当前阶段
    curr_phase = None
    curr_phase_pts = 0
    phase_rank = None
    if selected_project_id:
        curr_phase = db.query(Phase).filter(
            Phase.project_id == selected_project_id,
            Phase.status == PhaseStatus.IN_PROGRESS.value,
        ).first()
        if not curr_phase:
            curr_phase = db.query(Phase).filter(
                Phase.project_id == selected_project_id,
            ).order_by(Phase.id.desc()).first()

        if curr_phase:
            curr_phase_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
                Point.student_id == current_user.id,
                Point.phase_id == curr_phase.id,
                Point.status == PointStatus.ACTIVE.value,
            ).scalar() or 0

            # 当前阶段排名
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

    # 小组排名
    group_rank = None
    if group and selected_project_id:
        groups = db.query(Group).filter(Group.project_id == selected_project_id).all()
        group_avgs = []
        for g in groups:
            gm_ids = [m.student_id for m in db.query(GroupMember).filter(GroupMember.group_id == g.id).all()]
            if not gm_ids:
                group_avgs.append((g.id, 0.0))
                continue
            g_total = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
                Point.student_id.in_(gm_ids),
                Point.status == PointStatus.ACTIVE.value,
                Point.year_id == selected_year_id,
                Point.project_id == selected_project_id,
            ).scalar() or 0
            g_avg = g_total / len(gm_ids)
            group_avgs.append((g.id, g_avg))
        group_avgs.sort(key=lambda x: x[1], reverse=True)
        for i, (gid, _) in enumerate(group_avgs):
            if gid == group.id:
                group_rank = i + 1
                break

    # 各阶段积分
    phases = []
    if selected_project_id:
        phases = db.query(Phase).filter(Phase.project_id == selected_project_id).order_by(Phase.id).all()
    phase_points = []
    for p in phases:
        pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.student_id == current_user.id,
            Point.phase_id == p.id,
            Point.status == PointStatus.ACTIVE.value,
        ).scalar() or 0
        phase_points.append({
            "phase_id": p.id, "phase_name": p.name,
            "points": pts, "status": p.status,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
        })

    # 最近积分记录
    recent_pts = db.query(Point).filter(
        Point.student_id == current_user.id,
        Point.project_id == selected_project_id if selected_project_id else Point.project_id,
    ).order_by(Point.id.desc()).limit(5).all()
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
    recent_reds = db.query(Redemption).filter(Redemption.student_id == current_user.id).order_by(Redemption.id.desc()).limit(5).all()
    recent_redemptions = []
    for rr in recent_reds:
        prod = db.query(Product).filter(Product.id == rr.product_id).first()
        recent_redemptions.append({
            "id": rr.id, "product_name": prod.name if prod else "",
            "points_spent": rr.points_spent, "status": rr.status,
            "created_at": rr.created_at.isoformat() if rr.created_at else None,
        })

    return StudentDashboardStats(
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
    personal_rankings = []
    for index, student in enumerate(students):
        enrollment = enrollment_by_student.get(student.id)
        student_group = groups_by_id.get(enrollment.group_id) if enrollment and enrollment.group_id else None
        if not student_group:
            membership = db.query(GroupMember).join(Group, Group.id == GroupMember.group_id).filter(
                GroupMember.student_id == student.id,
                Group.project_id == phase.project_id,
            ).first()
            student_group = db.query(Group).filter(Group.id == membership.group_id).first() if membership else None
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
    for project_group in project_groups:
        member_ids = [e.student_id for e in enrollments if e.group_id == project_group.id]
        if not member_ids:
            member_ids = [m.student_id for m in db.query(GroupMember).filter(
                GroupMember.group_id == project_group.id,
            ).all()]
        member_ids = list(dict.fromkeys(member_ids))
        total = sum(totals_by_student.get(student_id, 0) for student_id in member_ids)
        average = round(total / len(member_ids), 2) if member_ids else 0
        group_ranking_rows.append({
            "group_id": project_group.id,
            "group_name": project_group.name,
            "member_count": len(member_ids),
            "total_points": total,
            "avg_points": average,
            "is_my_group": bool(group and project_group.id == group.id),
        })
    group_ranking_rows.sort(key=lambda item: (-item["avg_points"], -item["total_points"], item["group_name"]))
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
    excellent_members = []
    for ep in excellent:
        s = db.query(User).filter(User.id == ep.student_id).first()
        if s:
            excellent_members.append({
                "student_id": s.id, "student_name": s.real_name,
                "department": s.department,
            })

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
    member_pts_data = []
    for gm in gms:
        s = db.query(User).filter(User.id == gm.student_id).first()
        if not s:
            continue
        period_pts, total_earned, available = _compute_student_points(
            db, s.id, group.year_id, group.project_id
        )
        member_pts_data.append({
            "student_id": s.id, "student_name": s.real_name,
            "email": s.email, "department": s.department,
            "role": gm.role,
            "period_points": period_pts,
            "total_earned": total_earned,
            "available_points": available,
        })

    # 排名
    member_pts_data.sort(key=lambda x: x["period_points"], reverse=True)
    for i, m in enumerate(member_pts_data):
        m["rank"] = i + 1

    # 各组阶段积分
    phases = db.query(Phase).filter(Phase.project_id == group.project_id).order_by(Phase.id).all()
    for m in member_pts_data:
        m["phase_points"] = []
        for p in phases:
            pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
                Point.student_id == m["student_id"],
                Point.phase_id == p.id,
                Point.status == PointStatus.ACTIVE.value,
            ).scalar() or 0
            m["phase_points"].append({
                "phase_id": p.id, "phase_name": p.name,
                "points": pts, "status": p.status,
            })

    # 小组统计
    _, total_pts, avg_pts = _compute_group_stats_local(db, group.id, group.year_id, group.project_id)

    # 小组排名
    all_groups = db.query(Group).filter(Group.project_id == group.project_id).all()
    group_rank_list = []
    for g in all_groups:
        gms2 = db.query(GroupMember).filter(GroupMember.group_id == g.id).all()
        gm_ids = [gm2.student_id for gm2 in gms2]
        if not gm_ids:
            group_rank_list.append((g.id, g.name, 0, 0.0, 0))
            continue
        g_total_pts = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.student_id.in_(gm_ids),
            Point.status == PointStatus.ACTIVE.value,
            Point.year_id == g.year_id,
            Point.project_id == g.project_id,
        ).scalar() or 0
        g_avg_pts = g_total_pts / len(gm_ids)
        group_rank_list.append((g.id, g.name, g_total_pts, g_avg_pts, len(gm_ids)))
    group_rank_list.sort(key=lambda x: x[3], reverse=True)
    my_gr_num = next((i+1 for i, gr in enumerate(group_rank_list) if gr[0] == group.id), None)
    all_group_rows = [{
        "id": item[0], "group_id": item[0], "name": item[1], "group_name": item[1],
        "personal_points": item[2], "team_points": 0, "total_points": item[2],
        "final_score": item[2], "avg_points": round(item[3], 2), "member_count": item[4],
        "rank": index + 1, "is_my_group": item[0] == group.id,
    } for index, item in enumerate(group_rank_list)]

    return {
        "group": {
            "id": group.id, "name": group.name,
            "member_count": len(member_pts_data),
            "total_points": total_pts,
            "personal_points": total_pts,
            "team_points": 0,
            "final_score": total_pts,
            "avg_points": round(avg_pts, 2),
            "rank": my_gr_num,
        },
        "members": member_pts_data,
        "all_groups": all_group_rows,
        "team_point_records": [],
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
    q = db.query(Point).filter(Point.student_id == current_user.id)
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
    for r in records:
        admin = db.query(User).filter(User.id == r.admin_id).first()
        phase_name = db.query(Phase.name).filter(Phase.id == r.phase_id).scalar() if r.phase_id else None
        group_name = db.query(Group.name).filter(Group.id == r.group_id).scalar() if r.group_id else None
        year_name = db.query(AcademicYear.name).filter(AcademicYear.id == r.year_id).scalar() or ""
        project_name = db.query(TrainingProject.name).filter(TrainingProject.id == r.project_id).scalar() or ""

        items.append(PointRecordOut(
            id=r.id, record_number=r.record_number,
            student_id=r.student_id,
            student_name=current_user.real_name,
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
        ])
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
    if product.product_status not in [ProductStatus.AVAILABLE.value, ProductStatus.LOW_STOCK.value, ProductStatus.REPLENISH.value]:
        raise HTTPException(status_code=400, detail="商品暂不可兑换")
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
