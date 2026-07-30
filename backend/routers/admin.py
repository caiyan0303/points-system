"""管理员端 — 全部接口"""
import json
import math
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Body, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, select, and_

from database import get_db
from models import (
    User, AcademicYear, TrainingProject, Group, GroupMember, ProjectEnrollment,
    Phase, PhaseParticipant, PhaseGroup,
    Point, TeamPoint, PointRule, RuleText, Product, Redemption, PrizeAward,
    OperationLog, Notification,
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
    PointRecordOut,
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
            RedemptionStatus.COMPLETED.value,
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
    stats = _compute_group_breakdown(db, group_id)
    return stats["member_count"], stats["final_score"], stats["avg_points"]


def _compute_group_breakdown(db: Session, group_id: int):
    """按小组所属年度和项目直接从数据库汇总完整得分。"""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        return {"member_count": 0, "personal_points": 0, "team_points": 0, "final_score": 0, "avg_points": 0.0}
    enrollment_ids = db.query(ProjectEnrollment.student_id).filter(
        ProjectEnrollment.group_id == group_id,
        ProjectEnrollment.project_id == group.project_id,
    ).all()
    membership_ids = db.query(GroupMember.student_id).filter(GroupMember.group_id == group_id).all()
    member_ids = sorted({row[0] for row in enrollment_ids + membership_ids})
    personal_points = 0
    if member_ids:
        personal_points = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
            Point.student_id.in_(member_ids),
            Point.year_id == group.year_id,
            Point.project_id == group.project_id,
            Point.status == PointStatus.ACTIVE.value,
        ).scalar() or 0
    team_points = db.query(func.coalesce(func.sum(TeamPoint.points), 0)).filter(
        TeamPoint.group_id == group_id,
        TeamPoint.year_id == group.year_id,
        TeamPoint.project_id == group.project_id,
        TeamPoint.status == PointStatus.ACTIVE.value,
    ).scalar() or 0
    final_score = int(personal_points) + int(team_points)
    return {
        "member_count": len(member_ids),
        "personal_points": int(personal_points),
        "team_points": int(team_points),
        "final_score": final_score,
        "avg_points": final_score / len(member_ids) if member_ids else 0.0,
    }


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


def _team_point_payload(item: TeamPoint, db: Session):
    return {
        "id": item.id, "record_number": item.record_number, "group_id": item.group_id,
        "group_name": db.query(Group.name).filter(Group.id == item.group_id).scalar() or "",
        "year_id": item.year_id, "project_id": item.project_id, "phase_id": item.phase_id,
        "project_name": db.query(TrainingProject.name).filter(TrainingProject.id == item.project_id).scalar() or "",
        "phase_name": db.query(Phase.name).filter(Phase.id == item.phase_id).scalar() if item.phase_id else None,
        "points": item.points, "category": item.category, "item_name": item.item_name,
        "task_key": item.task_key, "obtained_date": item.obtained_date,
        "data_source": item.data_source, "source_note": item.source_note,
        "remark": item.remark, "status": item.status, "created_at": item.created_at,
    }


def _sync_project_phase_associations(db: Session, project_id: Optional[int]) -> bool:
    """让项目下的全部阶段始终继承项目成员及小组。"""
    if not project_id:
        return False
    phases = db.query(Phase).filter(Phase.project_id == project_id).all()
    if not phases:
        return False
    groups = db.query(Group).filter(Group.project_id == project_id).all()
    enrollments = db.query(ProjectEnrollment).filter(
        ProjectEnrollment.project_id == project_id,
    ).all()
    phase_ids = [phase.id for phase in phases]
    existing_group_pairs = {
        (item.phase_id, item.group_id)
        for item in db.query(PhaseGroup).filter(PhaseGroup.phase_id.in_(phase_ids)).all()
    }
    participants = {
        (item.phase_id, item.student_id): item
        for item in db.query(PhaseParticipant).filter(PhaseParticipant.phase_id.in_(phase_ids)).all()
    }
    changed = False
    for phase in phases:
        for group in groups:
            key = (phase.id, group.id)
            if key not in existing_group_pairs:
                db.add(PhaseGroup(phase_id=phase.id, group_id=group.id))
                existing_group_pairs.add(key)
                changed = True
        for enrollment in enrollments:
            key = (phase.id, enrollment.student_id)
            participant = participants.get(key)
            if participant:
                if participant.group_id != enrollment.group_id:
                    participant.group_id = enrollment.group_id
                    changed = True
            else:
                participant = PhaseParticipant(
                    phase_id=phase.id,
                    student_id=enrollment.student_id,
                    group_id=enrollment.group_id,
                )
                db.add(participant)
                participants[key] = participant
                changed = True
    if changed:
        db.flush()
    return changed


# ═══════════════ Dashboard ═══════════════

@router.get("/dashboard", response_model=AdminDashboardStats)
def dashboard(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _sync_phase_statuses(db)
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
        Redemption.status.in_([RedemptionStatus.RECEIVED.value, RedemptionStatus.COMPLETED.value]),
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
        g_count = db.query(func.count(Group.id)).filter(
            Group.project_id == p.project_id,
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


@router.get("/export/all-data")
def export_all_data(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """返回适合生成多工作表 Excel 的全部业务数据（不包含密码哈希）。"""
    def display(value):
        if value is None:
            return ""
        if isinstance(value, datetime):
            return value.isoformat(sep=" ", timespec="seconds")
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return value

    def yes_no(value):
        return "是" if value else "否"

    years = db.query(AcademicYear).order_by(AcademicYear.id).all()
    projects = db.query(TrainingProject).order_by(TrainingProject.id).all()
    phases = db.query(Phase).order_by(Phase.id).all()
    students = db.query(User).filter(User.role == UserRole.STUDENT.value).order_by(User.id).all()
    groups = db.query(Group).order_by(Group.id).all()
    products = db.query(Product).order_by(Product.id).all()

    year_names = {item.id: item.name for item in years}
    project_names = {item.id: item.name for item in projects}
    phase_names = {item.id: item.name for item in phases}
    student_names = {item.id: item.real_name for item in students}
    group_names = {item.id: item.name for item in groups}
    product_names = {item.id: item.name for item in products}
    user_names = {item.id: item.real_name or item.username for item in db.query(User).all()}

    sheets = []
    def add_sheet(name, rows):
        sheets.append({"name": name, "rows": rows})

    add_sheet("导出说明", [
        {"项目": "导出时间", "内容": datetime.now().isoformat(sep=" ", timespec="seconds")},
        {"项目": "导出人", "内容": current_user.real_name or current_user.username},
        {"项目": "数据范围", "内容": "积分商城全部业务数据；不包含管理员或学员密码哈希"},
        {"项目": "工作表数量", "内容": 18},
    ])
    add_sheet("年度", [{
        "年度ID": item.id, "年度名称": item.name, "状态": item.status, "创建时间": display(item.created_at),
    } for item in years])
    add_sheet("培训项目", [{
        "项目ID": item.id, "年度": year_names.get(item.year_id, ""), "项目名称": item.name,
        "开始时间": display(item.start_date), "结束时间": display(item.end_date),
        "状态": item.status, "项目说明": item.description or "", "创建时间": display(item.created_at),
    } for item in projects])
    add_sheet("项目阶段", [{
        "阶段ID": item.id, "年度": year_names.get(item.year_id, ""), "培训项目": project_names.get(item.project_id, ""),
        "阶段名称": item.name, "开始时间": display(item.start_date), "结束时间": display(item.end_date),
        "状态": item.status, "允许排名": yes_no(item.allow_ranking), "允许评优": yes_no(item.allow_excellent),
        "优秀人数": item.excellent_count, "奖项说明": item.prize_description or "",
        "阶段说明": item.description or "", "创建时间": display(item.created_at),
    } for item in phases])
    add_sheet("学员", [{
        "学员ID": item.id, "姓名": item.real_name, "登录账号": item.username,
        "年度": year_names.get(item.year_id, ""), "培训项目": project_names.get(item.project_id, ""),
        "体系": item.system or "", "一级部门": item.level1_dept or "", "邮箱": item.email or "",
        "手机": item.phone or "", "收货地址": item.address or "", "在职状态": item.employment_status,
        "账号状态": item.account_status, "是否启用": yes_no(item.is_active), "创建时间": display(item.created_at),
    } for item in students])

    enrollments = db.query(ProjectEnrollment).order_by(ProjectEnrollment.id).all()
    add_sheet("项目参与", [{
        "记录ID": item.id, "学员": student_names.get(item.student_id, ""), "年度": year_names.get(item.year_id, ""),
        "培训项目": project_names.get(item.project_id, ""), "所属小组": group_names.get(item.group_id, "未分组") if item.group_id else "未分组",
        "状态": item.status, "参与标记": item.label or "", "备注": item.remark or "", "加入时间": display(item.joined_at),
    } for item in enrollments])
    add_sheet("小组", [{
        "小组ID": item.id, "小组名称": item.name, "年度": year_names.get(item.year_id, ""),
        "培训项目": project_names.get(item.project_id, ""), "状态": item.status, "创建时间": display(item.created_at),
    } for item in groups])

    group_members = db.query(GroupMember).order_by(GroupMember.id).all()
    add_sheet("小组成员", [{
        "记录ID": item.id, "小组": group_names.get(item.group_id, ""), "学员": student_names.get(item.student_id, ""),
        "组内角色": item.role or "成员", "加入时间": display(item.created_at),
    } for item in group_members])

    phase_participants = db.query(PhaseParticipant).order_by(PhaseParticipant.id).all()
    add_sheet("阶段参与成员", [{
        "记录ID": item.id, "阶段": phase_names.get(item.phase_id, ""), "学员": student_names.get(item.student_id, ""),
        "所属小组": group_names.get(item.group_id, "未分组") if item.group_id else "未分组",
        "是否优秀": yes_no(item.is_excellent), "奖品已发放": yes_no(item.prize_given), "创建时间": display(item.created_at),
    } for item in phase_participants])

    phase_groups = db.query(PhaseGroup).order_by(PhaseGroup.id).all()
    add_sheet("阶段参与小组", [{
        "记录ID": item.id, "阶段": phase_names.get(item.phase_id, ""), "小组": group_names.get(item.group_id, ""),
        "创建时间": display(item.created_at),
    } for item in phase_groups])

    points = db.query(Point).order_by(Point.id).all()
    add_sheet("积分流水", [{
        "积分ID": item.id, "流水编号": item.record_number or "", "学员": student_names.get(item.student_id, ""),
        "年度": year_names.get(item.year_id, ""), "培训项目": project_names.get(item.project_id, ""),
        "所属阶段": phase_names.get(item.phase_id, ""), "所属小组": group_names.get(item.group_id, "未分组") if item.group_id else "未分组",
        "积分": item.points, "积分分类": item.category, "说明": item.description or "", "数据来源": item.data_source,
        "状态": item.status, "撤销原因": item.revoke_reason or "", "获得时间": display(item.obtained_date),
        "录入管理员": user_names.get(item.admin_id, ""), "创建时间": display(item.created_at),
    } for item in points])

    point_rules = db.query(PointRule).order_by(PointRule.id).all()
    add_sheet("积分规则", [{
        "规则ID": item.id, "积分分类": item.category, "规则名称": item.rule_name,
        "默认积分": item.default_points, "最高积分": item.max_points,
        "适用项目": display(item.applicable_projects), "适用阶段": display(item.applicable_phases),
        "允许重复": yes_no(item.allow_repeat), "计入本期积分": yes_no(item.count_in_period),
        "计入可用积分": yes_no(item.count_in_available), "需要审批": yes_no(item.need_approval),
        "说明": item.description or "", "创建时间": display(item.created_at),
    } for item in point_rules])

    rule_texts = db.query(RuleText).order_by(RuleText.id).all()
    add_sheet("规则说明", [{
        "记录ID": item.id, "标题": item.title, "内容": item.content, "更新时间": display(item.updated_at),
    } for item in rule_texts])
    add_sheet("商品", [{
        "商品ID": item.id, "商品名称": item.name, "兑换积分": item.points_required,
        "总库存": item.total_stock, "可用库存": item.available_stock, "锁定库存": item.locked_stock,
        "现场库存": item.on_site_stock, "每人限兑": item.limit_per_person or "", "是否限量": yes_no(item.is_limited),
        "上架时间": display(item.on_sale_time), "下架时间": display(item.off_sale_time), "商品状态": item.product_status,
        "图片地址": item.image_url or "", "商品说明": item.description or "", "创建时间": display(item.created_at),
    } for item in products])

    redemptions = db.query(Redemption).order_by(Redemption.id).all()
    add_sheet("兑换记录", [{
        "兑换ID": item.id, "学员": student_names.get(item.student_id, ""), "商品": product_names.get(item.product_id, ""),
        "消耗积分": item.points_spent, "状态": item.status, "领取方式": item.pickup_method or "",
        "快递公司": item.express_company or "", "快递单号": item.tracking_number or "",
        "拒绝原因": item.reject_reason or "", "地址快照": display(item.address_snapshot), "备注": item.remark or "",
        "锁定时间": display(item.locked_at), "审核时间": display(item.approved_at), "发货时间": display(item.shipped_at),
        "领取时间": display(item.received_at), "申请时间": display(item.created_at), "更新时间": display(item.updated_at),
    } for item in redemptions])

    awards = db.query(PrizeAward).order_by(PrizeAward.id).all()
    add_sheet("奖励发放", [{
        "奖励ID": item.id, "学员": student_names.get(item.student_id, ""), "商品": product_names.get(item.product_id, ""),
        "阶段": phase_names.get(item.phase_id, ""), "小组": group_names.get(item.group_id, ""),
        "奖励类型": item.award_type, "扣减积分": item.points_deducted, "说明": item.description or "",
        "发放管理员": user_names.get(item.created_by, ""), "发放时间": display(item.created_at),
    } for item in awards])

    logs = db.query(OperationLog).order_by(OperationLog.id).all()
    add_sheet("操作日志", [{
        "日志ID": item.id, "管理员": user_names.get(item.admin_id, ""), "操作": item.action,
        "对象类型": item.target_type or "", "对象ID": item.target_id or "", "操作详情": item.detail or "",
        "操作时间": display(item.created_at),
    } for item in logs])

    notifications = db.query(Notification).order_by(Notification.id).all()
    add_sheet("通知", [{
        "通知ID": item.id, "接收人": user_names.get(item.user_id, ""), "标题": item.title,
        "内容": item.content, "是否已读": yes_no(item.is_read), "创建时间": display(item.created_at),
    } for item in notifications])

    _log_operation(db, current_user.id, "导出全部数据", "system", None, "导出全部业务数据为 Excel")
    db.commit()
    return {
        "filename": f"积分商城全部数据_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
        "sheets": sheets,
    }


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
                User.system.contains(keyword),
                User.level1_dept.contains(keyword),
            )
        )
    if year_id:
        enrolled_student_ids = select(ProjectEnrollment.student_id).where(
            ProjectEnrollment.year_id == year_id
        )
        q = q.filter(User.id.in_(enrolled_student_ids))
    if project_id:
        enrolled_student_ids = select(ProjectEnrollment.student_id).where(
            ProjectEnrollment.project_id == project_id
        )
        q = q.filter(User.id.in_(enrolled_student_ids))
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
        context_enrollment = None
        if project_id:
            context_enrollment = db.query(ProjectEnrollment).filter(
                ProjectEnrollment.student_id == s.id,
                ProjectEnrollment.project_id == project_id,
            ).first()
        elif year_id:
            context_enrollment = db.query(ProjectEnrollment).filter(
                ProjectEnrollment.student_id == s.id,
                ProjectEnrollment.year_id == year_id,
            ).order_by(ProjectEnrollment.id.desc()).first()

        resolved_year_id = context_enrollment.year_id if context_enrollment else s.year_id
        resolved_project_id = context_enrollment.project_id if context_enrollment else s.project_id
        year_name = db.query(AcademicYear.name).filter(AcademicYear.id == resolved_year_id).scalar() if resolved_year_id else None
        project_name = db.query(TrainingProject.name).filter(TrainingProject.id == resolved_project_id).scalar() if resolved_project_id else None

        group = None
        if group_id:
            group = db.query(Group).filter(Group.id == group_id).first()
        elif context_enrollment and context_enrollment.group_id:
            group = db.query(Group).filter(Group.id == context_enrollment.group_id).first()
        elif resolved_project_id:
            group = db.query(Group).join(
                GroupMember, GroupMember.group_id == Group.id
            ).filter(
                GroupMember.student_id == s.id,
                Group.project_id == resolved_project_id,
            ).first()

        resolved_group_id = group.id if group else None
        group_name = group.name if group else None
        period_pts, total_earned, available = _compute_student_points(
            db, s.id, resolved_year_id, resolved_project_id
        )
        items.append(StudentBrief(
            id=s.id, username=s.username, real_name=s.real_name,
            email=s.email, phone=s.phone, address=s.address, department=s.department,
            system=s.system, level1_dept=s.level1_dept,
            year_id=resolved_year_id, project_id=resolved_project_id,
            year_name=year_name, project_name=project_name,
            group_id=resolved_group_id, group_name=group_name,
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
    # 学员姓名即登录账号，不生成数字后缀。
    username = data.real_name.strip()
    if not username:
        raise HTTPException(status_code=400, detail="姓名不能为空")
    existing_username = db.query(User).filter(User.username == username).first()
    if existing_username:
        raise HTTPException(status_code=400, detail=f"学员“{username}”已存在，请勿重复创建")

    if data.email:
        existing_email = db.query(User).filter(User.email == data.email).first()
        if existing_email:
            raise HTTPException(status_code=400, detail=f"邮箱 {data.email} 已被使用")

    if data.year_id:
        year = db.query(AcademicYear).filter(AcademicYear.id == data.year_id).first()
        if not year:
            raise HTTPException(status_code=400, detail="所选年度不存在")
    project = None
    if data.project_id:
        project = db.query(TrainingProject).filter(TrainingProject.id == data.project_id).first()
        if not project:
            raise HTTPException(status_code=400, detail="所选项目不存在")
    selected_group = None
    if data.group_id:
        if not data.project_id:
            raise HTTPException(status_code=400, detail="请先选择培训项目，再选择所属小组")
        selected_group = db.query(Group).filter(
            Group.id == data.group_id,
            Group.project_id == data.project_id,
        ).first()
        if not selected_group:
            raise HTTPException(status_code=400, detail="所选小组不存在或不属于该培训项目")
    elif data.group_name and data.group_name.strip():
        if not project:
            raise HTTPException(status_code=400, detail="请先选择培训项目，再填写所属小组")
        group_name = data.group_name.strip()
        selected_group = db.query(Group).filter(
            Group.name == group_name,
            Group.project_id == project.id,
        ).first()
        if not selected_group:
            selected_group = Group(
                name=group_name,
                year_id=project.year_id,
                project_id=project.id,
                status=GroupStatus.ACTIVE.value,
            )
            db.add(selected_group)
            db.flush()

    user = User(
        username=username,
        password_hash=hash_password(uuid4().hex),
        role=UserRole.STUDENT.value,
        real_name=data.real_name,
        email=data.email,
        phone=data.phone,
        address=data.address,
        department=data.department,
        system=data.system,
        level1_dept=data.level1_dept,
        year_id=data.year_id,
        project_id=data.project_id,
        employment_status=data.employment_status,
        account_status=AccountStatus.ENABLED.value,
    )
    db.add(user)
    db.flush()
    if data.year_id and data.project_id:
        db.add(ProjectEnrollment(
            student_id=user.id,
            year_id=data.year_id,
            project_id=data.project_id,
            group_id=selected_group.id if selected_group else None,
            status="在读",
            label="首次参加",
        ))
    if selected_group:
        db.add(GroupMember(group_id=selected_group.id, student_id=user.id))

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

    # 处理小组变更：既支持选择现有小组，也支持输入名称自动创建。
    new_group_id = None
    updates = data.model_dump(exclude_unset=True)
    group_change_requested = "group_id" in updates or "group_name" in updates
    if "group_id" in updates:
        new_group_id = updates.pop("group_id")
    new_group_name = str(updates.pop("group_name", "") or "").strip()

    if "real_name" in updates:
        new_real_name = str(updates["real_name"] or "").strip()
        if not new_real_name:
            raise HTTPException(status_code=400, detail="姓名不能为空")
        username_owner = db.query(User).filter(
            User.username == new_real_name,
            User.id != student_id,
        ).first()
        if username_owner:
            raise HTTPException(status_code=400, detail=f"登录账号“{new_real_name}”已存在")
        updates["real_name"] = new_real_name
        student.username = new_real_name

    for key, val in updates.items():
        setattr(student, key, val)

    if student.project_id:
        project = db.query(TrainingProject).filter(TrainingProject.id == student.project_id).first()
        if not project:
            raise HTTPException(status_code=400, detail="所选项目不存在")
        conflicting_enrollment = db.query(ProjectEnrollment).filter(
            ProjectEnrollment.student_id == student.id,
            ProjectEnrollment.year_id == project.year_id,
            ProjectEnrollment.project_id != project.id,
        ).first()
        if conflicting_enrollment:
            existing_project_name = db.query(TrainingProject.name).filter(
                TrainingProject.id == conflicting_enrollment.project_id
            ).scalar() or "其他项目"
            raise HTTPException(
                status_code=400,
                detail=f"该学员本年度已参加“{existing_project_name}”，不能同时加入两个项目",
            )
        student.year_id = project.year_id
        enrollment = db.query(ProjectEnrollment).filter(
            ProjectEnrollment.student_id == student.id,
            ProjectEnrollment.project_id == project.id,
        ).first()
        if not enrollment:
            prior_count = db.query(ProjectEnrollment).filter(ProjectEnrollment.student_id == student.id).count()
            enrollment = ProjectEnrollment(
                student_id=student.id,
                year_id=project.year_id,
                project_id=project.id,
                status="在读",
                label="再次入选" if prior_count else "首次参加",
            )
            db.add(enrollment)

    if group_change_requested and new_group_name:
        if not student.project_id:
            raise HTTPException(status_code=400, detail="请先选择培训项目，再填写所属小组")
        group = db.query(Group).filter(
            Group.name == new_group_name,
            Group.project_id == student.project_id,
        ).first()
        if not group:
            project = db.query(TrainingProject).filter(TrainingProject.id == student.project_id).first()
            group = Group(
                name=new_group_name,
                year_id=project.year_id,
                project_id=project.id,
                status=GroupStatus.ACTIVE.value,
            )
            db.add(group)
            db.flush()
        new_group_id = group.id

    # 更新小组成员关系
    if group_change_requested:
        project_group_ids = db.query(Group.id).filter(Group.project_id == student.project_id)
        db.query(GroupMember).filter(
            GroupMember.student_id == student_id,
            GroupMember.group_id.in_(project_group_ids),
        ).delete(synchronize_session=False)
        if new_group_id and new_group_id > 0:
            group = db.query(Group).filter(Group.id == new_group_id, Group.project_id == student.project_id).first()
            if not group:
                raise HTTPException(status_code=404, detail="小组不存在或不属于所选项目")
            gm = GroupMember(group_id=new_group_id, student_id=student_id)
            db.add(gm)
        if student.project_id:
            enrollment = db.query(ProjectEnrollment).filter(
                ProjectEnrollment.student_id == student.id,
                ProjectEnrollment.project_id == student.project_id,
            ).first()
            if enrollment:
                enrollment.group_id = new_group_id if new_group_id and new_group_id > 0 else None

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
        '姓名': 'real_name', '邮箱': 'email', '手机': 'phone',
        '地址': 'address', '收货地址': 'address',
        '部门': 'department', '体系': 'system', '一级部门': 'level1_dept',
        '所属年度': 'year_name', '培训项目': 'project_name', '所属小组': 'group_name',
        '项目标注': 'enrollment_label', '备注': 'enrollment_remark',
        '在职状态': 'employment_status', '账号状态': 'account_status',
    }
    normalized_rows = []
    for r in rows:
        new_r = {}
        for k, v in r.items():
            clean_key = str(k).replace("\ufeff", "").strip()
            clean_value = v.strip() if isinstance(v, str) else v
            new_r[field_map.get(clean_key, clean_key)] = clean_value
        normalized_rows.append(new_r)
    rows = normalized_rows

    # 先解析并校验年度、项目和小组，任何一行无法匹配时整批停止，
    # 避免学员已创建但三个所属关系悄悄丢失。
    years = db.query(AcademicYear).all()

    def year_key(value):
        return str(value or "").replace("年度", "").replace("年", "").strip()

    def project_key(value):
        normalized = str(value or "").replace(" ", "").strip()
        for item in years:
            number = year_key(item.name)
            for prefix in (f"{number}年度", f"{number}年", number):
                if prefix and normalized.startswith(prefix):
                    return normalized[len(prefix):]
        return normalized

    relation_errors = []
    for row_number, row in enumerate(rows, start=1):
        year_name = row.get("year_name")
        project_name = row.get("project_name")
        group_name = row.get("group_name")

        year = None
        if year_name:
            matched_years = [item for item in years if year_key(item.name) == year_key(year_name)]
            if len(matched_years) != 1:
                relation_errors.append(f"第{row_number}行未找到唯一年度“{year_name}”")
            else:
                year = matched_years[0]

        project = None
        if project_name:
            project_query = db.query(TrainingProject)
            if year:
                project_query = project_query.filter(TrainingProject.year_id == year.id)
            matched_projects = [
                item for item in project_query.all()
                if project_key(item.name) == project_key(project_name)
            ]
            if len(matched_projects) != 1:
                relation_errors.append(
                    f"第{row_number}行未在指定年度找到唯一培训项目“{project_name}”"
                )
            else:
                project = matched_projects[0]
                year = year or db.query(AcademicYear).filter(AcademicYear.id == project.year_id).first()

        group = None
        if group_name:
            group_query = db.query(Group).filter(Group.name == group_name)
            if project:
                group_query = group_query.filter(Group.project_id == project.id)
            elif year:
                group_query = group_query.filter(Group.year_id == year.id)
            matched_groups = group_query.all()
            if len(matched_groups) == 0 and project:
                # 小组可以随学员名单首次导入，在已确认的年度和项目下自动建立。
                row["_new_group_name"] = group_name
            elif len(matched_groups) != 1:
                relation_errors.append(
                    f"第{row_number}行未在指定项目中找到唯一小组“{group_name}”"
                )
            else:
                group = matched_groups[0]
                if not project:
                    project = db.query(TrainingProject).filter(TrainingProject.id == group.project_id).first()
                if not year:
                    year = db.query(AcademicYear).filter(AcademicYear.id == group.year_id).first()

        row["_year_id"] = year.id if year else None
        row["_project_id"] = project.id if project else None
        row["_group_id"] = group.id if group else None

    # 同一学员同一年度只能参加一个培训项目：同时检查数据库历史和本次文件内部。
    import_assignments = {}
    for row_number, row in enumerate(rows, start=1):
        real_name = row.get("real_name")
        year_id = row.get("_year_id")
        project_id = row.get("_project_id")
        if not real_name or not year_id or not project_id:
            continue
        assignment_key = (real_name, year_id)
        prior_project_id = import_assignments.get(assignment_key)
        if prior_project_id and prior_project_id != project_id:
            relation_errors.append(f"第{row_number}行：{real_name}在同一年度不能参加两个培训项目")
            continue
        import_assignments[assignment_key] = project_id

        existing_user = db.query(User).filter(
            User.role == UserRole.STUDENT.value,
            User.username == real_name,
        ).first()
        if not existing_user:
            continue
        conflicting_enrollment = db.query(ProjectEnrollment).filter(
            ProjectEnrollment.student_id == existing_user.id,
            ProjectEnrollment.year_id == year_id,
            ProjectEnrollment.project_id != project_id,
        ).first()
        if conflicting_enrollment:
            existing_project_name = db.query(TrainingProject.name).filter(
                TrainingProject.id == conflicting_enrollment.project_id
            ).scalar() or "其他项目"
            relation_errors.append(
                f"第{row_number}行：{real_name}本年度已参加“{existing_project_name}”，不能再加入其他项目"
            )

    if relation_errors:
        raise HTTPException(status_code=400, detail="；".join(relation_errors[:10]))

    duplicate_emails = []
    missing_fields_rows = []
    invalid_projects = []
    invalid_groups = []

    all_emails = db.query(User.email).filter(User.email.isnot(None)).all()
    existing_emails = {e[0] for e in all_emails if e[0]}
    existing_students = db.query(User).filter(User.role == UserRole.STUDENT.value).all()
    existing_users_by_name = {user.username: user for user in existing_students}
    existing_names = set(existing_users_by_name)
    existing_enrollment_keys = {
        (item.student_id, item.project_id) for item in db.query(ProjectEnrollment).all()
    }

    for i, row in enumerate(rows):
        email = row.get("email")
        real_name = row.get("real_name")
        if not real_name:
            missing_fields_rows.append(i + 1)
        if email and email in existing_emails:
            duplicate_emails.append(email)

    skipped_preview = sum(
        1 for row in rows
        if row.get("real_name") in existing_users_by_name
        and row.get("_project_id")
        and (
            (
                existing_users_by_name[row.get("real_name")].id,
                row.get("_project_id"),
            ) in existing_enrollment_keys
            or existing_users_by_name[row.get("real_name")].project_id == row.get("_project_id")
        )
    )
    preview = BatchImportPreview(
        total_rows=len(rows),
        new_count=sum(1 for row in rows if row.get("real_name") not in existing_names),
        update_count=sum(1 for row in rows if row.get("real_name") in existing_names) - skipped_preview,
        skipped_count=skipped_preview,
        duplicate_emails=duplicate_emails,
        missing_fields=missing_fields_rows,
        invalid_projects=invalid_projects,
        invalid_groups=invalid_groups,
    )

    # 执行实际导入
    created = 0
    updated = 0
    skipped = 0
    created_groups = {}
    touched_project_ids = set()
    for i, row in enumerate(rows):
        real_name = row.get("real_name")
        if not real_name:
            continue
        email = row.get("email")

        year_id = row.get("_year_id")
        project_id = row.get("_project_id")
        if project_id:
            touched_project_ids.add(project_id)
        group_id = row.get("_group_id")
        new_group_name = row.get("_new_group_name")

        user = db.query(User).filter(
            User.role == UserRole.STUDENT.value,
            User.username == real_name,
        ).first()
        if user and project_id:
            existing_enrollment = db.query(ProjectEnrollment).filter(
                ProjectEnrollment.student_id == user.id,
                ProjectEnrollment.project_id == project_id,
            ).first()
            if existing_enrollment or user.project_id == project_id:
                skipped += 1
                continue

        if not group_id and new_group_name and project_id:
            group_key = (project_id, new_group_name)
            group = created_groups.get(group_key)
            if not group:
                group = db.query(Group).filter(
                    Group.name == new_group_name,
                    Group.project_id == project_id,
                ).first()
            if not group:
                group = Group(name=new_group_name, year_id=year_id, project_id=project_id)
                db.add(group)
                db.flush()
            created_groups[group_key] = group
            group_id = group.id

        if user:
            user.real_name = real_name
            user.email = email
            user.phone = row.get("phone")
            user.address = row.get("address")
            user.department = row.get("department")
            user.system = row.get("system")
            user.level1_dept = row.get("level1_dept")
            user.year_id = year_id
            user.project_id = project_id
            user.employment_status = row.get("employment_status") or EmploymentStatus.ACTIVE.value
            user.account_status = row.get("account_status") or AccountStatus.ENABLED.value
            updated += 1
        else:
            username = real_name
            if db.query(User).filter(User.username == username).first():
                raise HTTPException(status_code=400, detail=f"登录账号“{username}”已存在，无法重复创建")
            user = User(
                username=username,
                password_hash=hash_password(uuid4().hex),
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
                employment_status=row.get("employment_status") or EmploymentStatus.ACTIVE.value,
                account_status=row.get("account_status") or AccountStatus.ENABLED.value,
            )
            db.add(user)
            db.flush()
            created += 1

        if project_id:
            project_group_ids = db.query(Group.id).filter(Group.project_id == project_id)
            db.query(GroupMember).filter(
                GroupMember.student_id == user.id,
                GroupMember.group_id.in_(project_group_ids),
            ).delete(synchronize_session=False)
        if group_id and not db.query(GroupMember).filter(
            GroupMember.group_id == group_id,
            GroupMember.student_id == user.id,
        ).first():
            db.add(GroupMember(group_id=group_id, student_id=user.id))

        if project_id and year_id:
            enrollment = db.query(ProjectEnrollment).filter(
                ProjectEnrollment.student_id == user.id,
                ProjectEnrollment.project_id == project_id,
            ).first()
            if not enrollment:
                prior_count = db.query(ProjectEnrollment).filter(
                    ProjectEnrollment.student_id == user.id,
                ).count()
                enrollment = ProjectEnrollment(
                    student_id=user.id,
                    year_id=year_id,
                    project_id=project_id,
                    label=row.get("enrollment_label") or ("再次入选" if prior_count else "首次参加"),
                )
                db.add(enrollment)
            enrollment.year_id = year_id
            enrollment.group_id = group_id
            enrollment.status = "在读"
            if row.get("enrollment_label"):
                enrollment.label = row.get("enrollment_label")
            if row.get("enrollment_remark") is not None:
                enrollment.remark = row.get("enrollment_remark")

        if email:
            existing_emails.add(email)

    for project_id in touched_project_ids:
        _sync_project_phase_associations(db, project_id)

    _log_operation(
        db, current_user.id, "批量导入学员", "student", None,
        f"新增账号 {created} 名，新增项目关联 {updated} 名，跳过 {skipped} 名"
    )
    db.commit()
    preview.skipped_count = skipped
    return {
        "message": f"导入完成：新增账号 {created} 名，新增项目关联 {updated} 名，已跳过 {skipped} 名同项目学员",
        "preview": preview.model_dump(),
    }


def _delete_student_records(db: Session, student: User):
    sid = student.id
    db.query(Point).filter(Point.student_id == sid).delete(synchronize_session=False)
    db.query(ProjectEnrollment).filter(ProjectEnrollment.student_id == sid).delete(synchronize_session=False)
    db.query(GroupMember).filter(GroupMember.student_id == sid).delete(synchronize_session=False)
    db.query(PhaseParticipant).filter(PhaseParticipant.student_id == sid).delete(synchronize_session=False)
    db.query(Redemption).filter(Redemption.student_id == sid).delete(synchronize_session=False)
    db.query(PrizeAward).filter(PrizeAward.student_id == sid).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.user_id == sid).delete(synchronize_session=False)
    db.delete(student)


@router.delete("/students/{student_id}")
def delete_student_account(
    student_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    student = db.query(User).filter(
        User.id == student_id,
        User.role == UserRole.STUDENT.value,
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="学员不存在或已删除")
    name = student.real_name
    try:
        _delete_student_records(db, student)
        _log_operation(db, current_user.id, "删除学员", "student", student_id, f"彻底删除学员 {name}")
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"删除失败：{exc}")
    return {"message": f"已彻底删除学员{name}"}


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
        _delete_student_records(db, student)
        deleted += 1
    _log_operation(db, current_user.id, "批量删除学员", "student", None, f"硬删除 {deleted} 名学员")
    db.commit()
    return {"message": f"已彻底删除 {deleted} 名学员"}


@router.get("/projects/{project_id}/members")
def list_project_members(
    project_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = db.query(TrainingProject).filter(TrainingProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    enrollments = db.query(ProjectEnrollment).filter(
        ProjectEnrollment.project_id == project_id,
    ).order_by(ProjectEnrollment.id.desc()).all()
    items = []
    for enrollment in enrollments:
        student = db.query(User).filter(User.id == enrollment.student_id).first()
        if not student:
            continue
        all_enrollments = db.query(ProjectEnrollment).filter(
            ProjectEnrollment.student_id == student.id,
        ).order_by(ProjectEnrollment.joined_at).all()
        history = []
        for item in all_enrollments:
            history_project = db.query(TrainingProject).filter(TrainingProject.id == item.project_id).first()
            history_year = db.query(AcademicYear).filter(AcademicYear.id == item.year_id).first()
            history.append({
                "project_id": item.project_id,
                "project_name": history_project.name if history_project else "",
                "year_name": history_year.name if history_year else "",
            })
        auto_label = "跨年度再次参加" if len(all_enrollments) > 1 else "首次参加"
        group = db.query(Group).filter(Group.id == enrollment.group_id).first() if enrollment.group_id else None
        items.append({
            "student_id": student.id,
            "real_name": student.real_name,
            "username": student.username,
            "system": student.system,
            "level1_dept": student.level1_dept,
            "group_id": enrollment.group_id,
            "group_name": group.name if group else "",
            "status": enrollment.status,
            "label": enrollment.label or auto_label,
            "auto_label": auto_label,
            "remark": enrollment.remark,
            "participation_count": len(all_enrollments),
            "project_history": history,
            "joined_at": enrollment.joined_at.isoformat() if enrollment.joined_at else None,
        })
    return {"project_id": project.id, "project_name": project.name, "items": items}


@router.post("/projects/{project_id}/members")
def add_project_member(
    project_id: int,
    data: dict = Body(...),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    project = db.query(TrainingProject).filter(TrainingProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    student = None
    if data.get("student_id"):
        student = db.query(User).filter(
            User.id == int(data["student_id"]), User.role == UserRole.STUDENT.value,
        ).first()
    real_name = str(data.get("real_name") or "").strip()
    if not student and real_name:
        account = db.query(User).filter(User.username == real_name).first()
        if account and account.role != UserRole.STUDENT.value:
            raise HTTPException(status_code=400, detail=f"登录账号“{real_name}”已被使用")
        student = account
    if not student and real_name:
        student = User(
            username=real_name,
            password_hash=hash_password(uuid4().hex),
            role=UserRole.STUDENT.value,
            real_name=real_name,
            year_id=project.year_id,
            project_id=project.id,
            employment_status=EmploymentStatus.ACTIVE.value,
            account_status=AccountStatus.ENABLED.value,
        )
        db.add(student)
        db.flush()
    if not student:
        raise HTTPException(status_code=400, detail="请选择已有学员或输入新学员姓名")

    conflicting_enrollment = db.query(ProjectEnrollment).filter(
        ProjectEnrollment.student_id == student.id,
        ProjectEnrollment.year_id == project.year_id,
        ProjectEnrollment.project_id != project.id,
    ).first()
    if conflicting_enrollment:
        existing_project_name = db.query(TrainingProject.name).filter(
            TrainingProject.id == conflicting_enrollment.project_id
        ).scalar() or "其他项目"
        raise HTTPException(
            status_code=400,
            detail=f"{student.real_name}本年度已参加“{existing_project_name}”，不能同时加入两个项目",
        )

    group_id = data.get("group_id")
    group_name = str(data.get("group_name") or "").strip()
    group = None
    if group_id:
        group = db.query(Group).filter(Group.id == int(group_id), Group.project_id == project.id).first()
        if not group:
            raise HTTPException(status_code=400, detail="所选小组不属于当前项目")
    elif group_name:
        group = db.query(Group).filter(Group.name == group_name, Group.project_id == project.id).first()
        if not group:
            group = Group(name=group_name, year_id=project.year_id, project_id=project.id)
            db.add(group)
            db.flush()

    enrollment = db.query(ProjectEnrollment).filter(
        ProjectEnrollment.student_id == student.id,
        ProjectEnrollment.project_id == project.id,
    ).first()
    prior_count = db.query(ProjectEnrollment).filter(ProjectEnrollment.student_id == student.id).count()
    if not enrollment:
        enrollment = ProjectEnrollment(
            student_id=student.id,
            year_id=project.year_id,
            project_id=project.id,
            label=str(data.get("label") or "").strip() or ("再次入选" if prior_count else "首次参加"),
        )
        db.add(enrollment)
    enrollment.group_id = group.id if group else None
    enrollment.status = str(data.get("status") or "在读")
    enrollment.remark = str(data.get("remark") or "").strip() or None
    if data.get("label"):
        enrollment.label = str(data["label"]).strip()

    student.year_id = project.year_id
    student.project_id = project.id
    old_group_ids = db.query(Group.id).filter(Group.project_id == project.id)
    db.query(GroupMember).filter(
        GroupMember.student_id == student.id,
        GroupMember.group_id.in_(old_group_ids),
    ).delete(synchronize_session=False)
    if group:
        db.add(GroupMember(group_id=group.id, student_id=student.id))

    _log_operation(db, current_user.id, "添加项目学员", "student", student.id, f"将 {student.real_name} 加入项目 {project.name}")
    db.commit()
    return {"message": f"已将{student.real_name}加入项目"}


@router.put("/projects/{project_id}/members/{student_id}")
def update_project_member(
    project_id: int,
    student_id: int,
    data: dict = Body(...),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    enrollment = db.query(ProjectEnrollment).filter(
        ProjectEnrollment.project_id == project_id,
        ProjectEnrollment.student_id == student_id,
    ).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="项目学员关系不存在")
    if "group_id" in data:
        group_id = int(data["group_id"]) if data["group_id"] else None
        if group_id and not db.query(Group).filter(Group.id == group_id, Group.project_id == project_id).first():
            raise HTTPException(status_code=400, detail="所选小组不属于当前项目")
        project_group_ids = db.query(Group.id).filter(Group.project_id == project_id)
        db.query(GroupMember).filter(
            GroupMember.student_id == student_id,
            GroupMember.group_id.in_(project_group_ids),
        ).delete(synchronize_session=False)
        enrollment.group_id = group_id
        if group_id:
            db.add(GroupMember(group_id=group_id, student_id=student_id))
    if "status" in data:
        enrollment.status = str(data["status"] or "在读")
    if "label" in data:
        enrollment.label = str(data["label"] or "").strip() or None
    if "remark" in data:
        enrollment.remark = str(data["remark"] or "").strip() or None
    db.commit()
    return {"message": "项目学员信息已更新"}


@router.delete("/projects/{project_id}/members/{student_id}")
def remove_project_member_account(
    project_id: int,
    student_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    enrollment = db.query(ProjectEnrollment).filter(
        ProjectEnrollment.project_id == project_id,
        ProjectEnrollment.student_id == student_id,
    ).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="该学员不在当前项目中")
    if enrollment.group_id:
        db.query(GroupMember).filter(
            GroupMember.student_id == student_id,
            GroupMember.group_id == enrollment.group_id,
        ).delete(synchronize_session=False)
    db.delete(enrollment)
    student = db.query(User).filter(User.id == student_id).first()
    db.flush()
    if student and student.project_id == project_id:
        fallback = db.query(ProjectEnrollment).filter(
            ProjectEnrollment.student_id == student_id,
        ).order_by(ProjectEnrollment.joined_at.desc()).first()
        student.project_id = fallback.project_id if fallback else None
        student.year_id = fallback.year_id if fallback else None
    db.commit()
    return {"message": "已从项目移除学员，学员账号和其他项目记录已保留"}


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

@router.get("/project-summary")
def project_summary(
    year_id: int = Query(...), project_id: int = Query(...),
    current_user: User = Depends(require_admin), db: Session = Depends(get_db),
):
    """由数据库汇总完整项目，不受列表分页条数影响。"""
    participant_ids = [row[0] for row in db.query(ProjectEnrollment.student_id).filter(
        ProjectEnrollment.year_id == year_id, ProjectEnrollment.project_id == project_id,
    ).distinct().all()]
    personal_points = db.query(func.coalesce(func.sum(Point.points), 0)).filter(
        Point.year_id == year_id, Point.project_id == project_id,
        Point.status == PointStatus.ACTIVE.value,
    ).scalar() or 0
    available_points = 0
    for student_id in participant_ids:
        available_points += _compute_student_points(db, student_id, year_id, project_id)[2]
    winner_rows = db.query(
        User.id, User.real_name, Group.name.label("group_name"),
        func.coalesce(func.sum(Point.points), 0).label("period_points"),
    ).join(ProjectEnrollment, and_(
        ProjectEnrollment.student_id == User.id,
        ProjectEnrollment.year_id == year_id,
        ProjectEnrollment.project_id == project_id,
    )).outerjoin(Group, Group.id == ProjectEnrollment.group_id).outerjoin(Point, and_(
        Point.student_id == User.id, Point.year_id == year_id, Point.project_id == project_id,
        Point.status == PointStatus.ACTIVE.value,
    )).group_by(User.id, User.real_name, Group.name).order_by(
        func.coalesce(func.sum(Point.points), 0).desc(), User.id.asc(),
    ).limit(3).all()
    return {
        "student_count": len(participant_ids), "personal_points": int(personal_points),
        "available_points": int(available_points),
        "personal_winners": [{"id": row.id, "real_name": row.real_name, "group_name": row.group_name, "period_points": int(row.period_points or 0)} for row in winner_rows],
    }


@router.get("/team-points")
def list_team_points(
    project_id: Optional[int] = Query(None), phase_id: Optional[int] = Query(None),
    group_id: Optional[int] = Query(None), page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_admin), db: Session = Depends(get_db),
):
    q = db.query(TeamPoint)
    if project_id: q = q.filter(TeamPoint.project_id == project_id)
    if phase_id: q = q.filter(TeamPoint.phase_id == phase_id)
    if group_id: q = q.filter(TeamPoint.group_id == group_id)
    total = q.count()
    items = q.order_by(TeamPoint.obtained_date.desc(), TeamPoint.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_team_point_payload(item, db) for item in items], "total": total, "page": page, "page_size": page_size, "total_pages": math.ceil(total / page_size) if total else 1}


def _insert_team_point(db: Session, data: dict, admin_id: int):
    group_id, year_id, project_id = int(data.get("group_id") or 0), int(data.get("year_id") or 0), int(data.get("project_id") or 0)
    group = db.query(Group).filter(Group.id == group_id, Group.year_id == year_id, Group.project_id == project_id).first()
    if not group: raise ValueError("所选小组不存在或不属于当前年度和项目")
    points = int(data.get("points") or 0)
    if points == 0: raise ValueError("积分值不能为 0")
    item_name = str(data.get("item_name") or "").strip()
    if not item_name: raise ValueError("积分事项不能为空")
    task_key = str(data.get("task_key") or item_name).strip().lower()
    phase_id = int(data["phase_id"]) if data.get("phase_id") else None
    obtained = data.get("obtained_date")
    if isinstance(obtained, str) and obtained:
        obtained = datetime.fromisoformat(obtained.replace("Z", "+00:00"))
    item = TeamPoint(
        record_number=str(data.get("record_number") or f"TP-{uuid4().hex[:16]}").strip(),
        group_id=group_id, admin_id=admin_id, year_id=year_id, project_id=project_id,
        phase_id=phase_id, points=points, category=str(data.get("category") or "特殊调整"),
        item_name=item_name, task_key=task_key, obtained_date=obtained or datetime.now(timezone.utc),
        data_source=str(data.get("data_source") or "单个录入"), source_note=data.get("source_note"),
        remark=data.get("remark"), status=PointStatus.ACTIVE.value,
    )
    db.add(item); db.flush(); return item


@router.post("/team-points")
def create_team_point(data: dict = Body(...), current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    try: item = _insert_team_point(db, data, current_user.id)
    except ValueError as error: raise HTTPException(status_code=400, detail=str(error)) from error
    _log_operation(db, current_user.id, "录入小组积分", "team_point", item.id, f"{item.item_name} {item.points}分")
    db.commit(); db.refresh(item); return _team_point_payload(item, db)


@router.post("/team-points/import")
def import_team_points(data: dict = Body(...), current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    created, errors = 0, []
    for index, record in enumerate(data.get("records") or []):
        try: _insert_team_point(db, record, current_user.id); created += 1
        except Exception as error: errors.append({"row": index + 2, "detail": str(error)})
    db.commit(); return {"created": created, "errors": errors}


@router.delete("/team-points/{record_id}")
def delete_team_point(record_id: int, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    item = db.query(TeamPoint).filter(TeamPoint.id == record_id).first()
    if not item: raise HTTPException(status_code=404, detail="小组积分记录不存在")
    db.delete(item); _log_operation(db, current_user.id, "删除小组积分", "team_point", record_id, item.item_name)
    db.commit(); return {"message": "小组积分已删除"}

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
        stats = _compute_group_breakdown(db, g.id)
        year_name = db.query(AcademicYear.name).filter(AcademicYear.id == g.year_id).scalar() or ""
        project_name = db.query(TrainingProject.name).filter(TrainingProject.id == g.project_id).scalar() or ""
        leader_name = db.query(User.real_name).join(GroupMember, GroupMember.student_id == User.id).filter(
            GroupMember.group_id == g.id, GroupMember.role == "小组长",
        ).first()
        result.append(GroupOut(
            id=g.id, name=g.name, year_id=g.year_id, project_id=g.project_id,
            year_name=year_name, project_name=project_name,
            member_count=stats["member_count"], total_points=stats["final_score"],
            personal_points=stats["personal_points"], team_points=stats["team_points"], final_score=stats["final_score"],
            avg_points=round(stats["avg_points"], 2), rank=None, status=g.status,
            leader_name=leader_name[0] if leader_name else None,
        ))

    # 按 avg_points 排名
    sorted_result = sorted(result, key=lambda x: x.final_score, reverse=True)
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

    stats = _compute_group_breakdown(db, group.id)
    year_name = db.query(AcademicYear.name).filter(AcademicYear.id == group.year_id).scalar() or ""
    project_name = db.query(TrainingProject.name).filter(TrainingProject.id == group.project_id).scalar() or ""
    return GroupOut(
        id=group.id, name=group.name, year_id=group.year_id, project_id=group.project_id,
        year_name=year_name, project_name=project_name,
        member_count=stats["member_count"], total_points=stats["final_score"],
        personal_points=stats["personal_points"], team_points=stats["team_points"], final_score=stats["final_score"],
        avg_points=round(stats["avg_points"], 2), rank=None, status=group.status,
    )


@router.delete("/groups/{group_id}")
def delete_group(
    group_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="小组不存在或已删除")

    group_name = group.name
    affected_members = db.query(GroupMember).filter(GroupMember.group_id == group_id).count()

    # 保留学员、积分和奖品历史，只解除它们与已删除小组的关联。
    db.query(ProjectEnrollment).filter(ProjectEnrollment.group_id == group_id).update(
        {ProjectEnrollment.group_id: None}, synchronize_session=False,
    )
    db.query(PhaseParticipant).filter(PhaseParticipant.group_id == group_id).update(
        {PhaseParticipant.group_id: None}, synchronize_session=False,
    )
    db.query(Point).filter(Point.group_id == group_id).update(
        {Point.group_id: None}, synchronize_session=False,
    )
    db.query(PrizeAward).filter(PrizeAward.group_id == group_id).update(
        {PrizeAward.group_id: None}, synchronize_session=False,
    )
    db.query(TeamPoint).filter(TeamPoint.group_id == group_id).delete(synchronize_session=False)
    db.query(PhaseGroup).filter(PhaseGroup.group_id == group_id).delete(synchronize_session=False)
    db.query(GroupMember).filter(GroupMember.group_id == group_id).delete(synchronize_session=False)
    db.delete(group)
    _log_operation(
        db, current_user.id, "删除小组", "group", group_id,
        f"删除小组 {group_name}，{affected_members} 名成员变为未分组",
    )
    db.commit()
    return {
        "message": f"小组“{group_name}”已删除",
        "affected_members": affected_members,
    }


@router.get("/groups/{group_id}", response_model=GroupDetail)
def get_group_detail(
    group_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="小组不存在")

    stats = _compute_group_breakdown(db, group.id)
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
        period_pts, total_earned, available = _compute_student_points(db, student.id, group.year_id, group.project_id)
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
        period_pts, total_earned, available = _compute_student_points(db, student.id, group.year_id, group.project_id)

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
        member_count=stats["member_count"], total_points=stats["final_score"],
        personal_points=stats["personal_points"], team_points=stats["team_points"], final_score=stats["final_score"],
        avg_points=round(stats["avg_points"], 2), rank=None, status=group.status,
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
    """根据北京时间和起止日期自动计算阶段状态。"""
    if phase.status == PhaseStatus.ARCHIVED.value:
        return phase.status
    if not phase.start_date or not phase.end_date:
        return phase.status
    today = datetime.now(timezone(timedelta(hours=8))).date()
    if today < phase.start_date.date():
        return PhaseStatus.PENDING.value
    elif today <= phase.end_date.date():
        return PhaseStatus.IN_PROGRESS.value
    else:
        return PhaseStatus.CLOSED.value


def _sync_phase_statuses(db: Session, project_id: int = None):
    query = db.query(Phase).filter(Phase.status != PhaseStatus.ARCHIVED.value)
    if project_id:
        query = query.filter(Phase.project_id == project_id)
    changed = False
    for phase in query.all():
        calculated = _auto_phase_status(phase)
        if phase.status != calculated:
            phase.status = calculated
            changed = True
    if changed:
        db.commit()

@router.get("/phases", response_model=List[PhaseOut])
def list_phases(
    year_id: int = Query(None),
    project_id: int = Query(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    _sync_phase_statuses(db, project_id)
    q = db.query(Phase)
    if year_id:
        q = q.filter(Phase.year_id == year_id)
    if project_id:
        q = q.filter(Phase.project_id == project_id)

    phases = q.order_by(Phase.id.desc()).all()
    associations_changed = False
    for pid in {p.project_id for p in phases}:
        associations_changed = _sync_project_phase_associations(db, pid) or associations_changed
    if associations_changed:
        db.commit()
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
            description=p.description, status=_auto_phase_status(p),
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
    if not data.start_date or not data.end_date:
        raise HTTPException(status_code=400, detail="请设置阶段开始和结束时间")
    if data.start_date > data.end_date:
        raise HTTPException(status_code=400, detail="阶段结束时间不能早于开始时间")
    if project.start_date and data.start_date < project.start_date:
        raise HTTPException(status_code=400, detail="阶段开始时间不能早于项目开始时间")
    if project.end_date and data.end_date > project.end_date:
        raise HTTPException(status_code=400, detail="阶段结束时间不能晚于项目结束时间")
    overlap = db.query(Phase).filter(
        Phase.project_id == data.project_id,
        Phase.status != PhaseStatus.ARCHIVED.value,
        Phase.start_date <= data.end_date,
        Phase.end_date >= data.start_date,
    ).first()
    if overlap:
        raise HTTPException(status_code=400, detail=f"阶段时间与“{overlap.name}”重叠")

    phase = Phase(
        name=data.name, year_id=data.year_id, project_id=data.project_id,
        start_date=data.start_date, end_date=data.end_date,
        description=data.description,
        allow_ranking=data.allow_ranking, allow_excellent=data.allow_excellent,
        excellent_count=data.excellent_count, prize_description=data.prize_description,
        status=PhaseStatus.PENDING.value,
    )
    db.add(phase)
    db.flush()
    _sync_project_phase_associations(db, data.project_id)
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
        participant_count=db.query(func.count(PhaseParticipant.id)).filter(PhaseParticipant.phase_id == phase.id).scalar() or 0,
        group_count=db.query(func.count(PhaseGroup.id)).filter(PhaseGroup.phase_id == phase.id).scalar() or 0,
        total_points=0,
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
    if not phase.start_date or not phase.end_date:
        raise HTTPException(status_code=400, detail="请设置阶段开始和结束时间")
    if phase.start_date > phase.end_date:
        raise HTTPException(status_code=400, detail="阶段结束时间不能早于开始时间")
    project = db.query(TrainingProject).filter(TrainingProject.id == phase.project_id).first()
    if project and project.start_date and phase.start_date < project.start_date:
        raise HTTPException(status_code=400, detail="阶段开始时间不能早于项目开始时间")
    if project and project.end_date and phase.end_date > project.end_date:
        raise HTTPException(status_code=400, detail="阶段结束时间不能晚于项目结束时间")
    if date_changed:
        overlap = db.query(Phase).filter(
            Phase.id != phase.id,
            Phase.project_id == phase.project_id,
            Phase.status != PhaseStatus.ARCHIVED.value,
            Phase.start_date <= phase.end_date,
            Phase.end_date >= phase.start_date,
        ).first()
        if overlap:
            raise HTTPException(status_code=400, detail=f"阶段时间与“{overlap.name}”重叠")
    phase.status = _auto_phase_status(phase)

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
    if _sync_project_phase_associations(db, phase.project_id):
        db.commit()

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
        team_total = db.query(func.coalesce(func.sum(TeamPoint.points), 0)).filter(
            TeamPoint.group_id == group.id, TeamPoint.phase_id == phase_id,
            TeamPoint.status == PointStatus.ACTIVE.value,
        ).scalar() or 0
        final_score = int(total) + int(team_total)
        avg = final_score / len(member_ids)
        rankings.append({
            "group_id": group.id, "group_name": group.name,
            "personal_points": int(total), "team_points": int(team_total),
            "total_points": final_score, "final_score": final_score, "avg_points": round(avg, 2),
            "member_count": len(member_ids),
        })

    rankings.sort(key=lambda x: x["final_score"], reverse=True)
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
    db.query(TeamPoint).filter(TeamPoint.phase_id == phase_id).update({TeamPoint.phase_id: None})
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

    # 收集数据库中已存在的 record_number，并单独跟踪本次文件内重复。
    all_numbers = [r.record_number for r in records if r.record_number]
    existing_numbers = set()
    if all_numbers:
        existing_numbers = {r[0] for r in db.query(Point.record_number).filter(
            Point.record_number.in_(all_numbers)
        ).all() if r[0]}
    seen_numbers = set()
    valid_records = []

    for rec in records:
        student = db.query(User).filter(User.id == rec.student_id).first()
        if not student:
            unmatched_count += 1
            errors.append(f"学员 ID {rec.student_id} 不存在")
            continue

        if rec.record_number:
            if rec.record_number in existing_numbers or rec.record_number in seen_numbers:
                duplicate_count += 1
                continue
            seen_numbers.add(rec.record_number)

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
        valid_records.append(rec)

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
    for rec in valid_records:
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


@router.post("/points/batch-delete")
def batch_delete_points(
    data: dict = Body(...),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    raw_ids = data.get("point_ids")
    if not isinstance(raw_ids, list) or not raw_ids:
        raise HTTPException(status_code=400, detail="请选择要删除的积分流水")
    try:
        point_ids = list({int(point_id) for point_id in raw_ids})
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="积分流水编号格式错误")
    if len(point_ids) > 500:
        raise HTTPException(status_code=400, detail="单次最多删除 500 条积分流水")

    points = db.query(Point).filter(Point.id.in_(point_ids)).all()
    if not points:
        raise HTTPException(status_code=404, detail="未找到可删除的积分流水")
    affected_students = len({point.student_id for point in points})
    total_change = sum(point.points for point in points if point.status == PointStatus.ACTIVE.value)
    deleted_count = len(points)
    for point in points:
        db.delete(point)
    _log_operation(
        db, current_user.id, "批量删除积分流水", "point", None,
        f"删除 {deleted_count} 条积分流水，影响 {affected_students} 名学员，移除有效积分合计 {total_change}",
    )
    db.commit()
    return {
        "message": f"成功删除 {deleted_count} 条积分流水",
        "deleted_count": deleted_count,
        "affected_students": affected_students,
        "removed_points": total_change,
    }


@router.delete("/points/{point_id}")
def delete_point(
    point_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    point = db.query(Point).filter(Point.id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="积分记录不存在")
    student_id = point.student_id
    points = point.points if point.status == PointStatus.ACTIVE.value else 0
    _log_operation(
        db, current_user.id, "删除积分流水", "point", point_id,
        f"删除学员 {student_id} 的积分流水，移除有效积分 {points}",
    )
    db.delete(point)
    db.commit()
    return {"message": "积分流水已删除", "removed_points": points}


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
        status_aliases = {
            RedemptionStatus.APPROVED.value: [
                RedemptionStatus.APPROVED.value, RedemptionStatus.PENDING_SHIP.value,
                RedemptionStatus.SHIPPED.value, RedemptionStatus.PENDING_PICKUP.value,
                RedemptionStatus.RECEIVED.value, RedemptionStatus.COMPLETED.value,
            ],
            RedemptionStatus.SHIPPED.value: [RedemptionStatus.SHIPPED.value, RedemptionStatus.PENDING_PICKUP.value],
            RedemptionStatus.CANCELLED.value: [RedemptionStatus.CANCELLED.value, RedemptionStatus.REJECTED.value],
        }
        q = q.filter(Redemption.status.in_(status_aliases.get(status, [status])))
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
            product_image_url=product.image_url if product else None,
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


@router.put("/redemptions/{redemption_id}/status")
def update_redemption_status(
    redemption_id: int,
    data: RedemptionProcess,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """在列表中直接更新兑换状态，并同步维护库存占用。"""
    redemption = db.query(Redemption).filter(Redemption.id == redemption_id).first()
    if not redemption:
        raise HTTPException(status_code=404, detail="兑换记录不存在")

    allowed_statuses = {
        RedemptionStatus.PENDING.value,
        RedemptionStatus.APPROVED.value,
        RedemptionStatus.REJECTED.value,
        RedemptionStatus.SHIPPED.value,
        RedemptionStatus.RECEIVED.value,
        RedemptionStatus.CANCELLED.value,
        RedemptionStatus.COMPLETED.value,
    }
    new_status = data.status
    if new_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="不支持的兑换状态")

    legacy_aliases = {
        RedemptionStatus.PENDING_SHIP.value: RedemptionStatus.APPROVED.value,
        RedemptionStatus.PENDING_PICKUP.value: RedemptionStatus.SHIPPED.value,
    }
    old_status = legacy_aliases.get(redemption.status, redemption.status)
    if old_status == new_status:
        return {"message": f"状态已是{new_status}"}

    reserved_statuses = {RedemptionStatus.PENDING.value}
    committed_statuses = {
        RedemptionStatus.APPROVED.value,
        RedemptionStatus.SHIPPED.value,
        RedemptionStatus.RECEIVED.value,
        RedemptionStatus.COMPLETED.value,
    }
    released_statuses = {RedemptionStatus.REJECTED.value, RedemptionStatus.CANCELLED.value}

    def inventory_group(value: str) -> str:
        if value in reserved_statuses:
            return "reserved"
        if value in committed_statuses:
            return "committed"
        if value in released_statuses:
            return "released"
        return "committed"

    old_group = inventory_group(old_status)
    new_group = inventory_group(new_status)
    if old_group == "released" and new_group != "released":
        _, _, available = _compute_student_points(
            db,
            redemption.student_id,
            redemption.student.year_id if redemption.student else None,
            redemption.student.project_id if redemption.student else None,
        )
        if available < redemption.points_spent:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"状态更新失败：学员可用积分不足（当前 {available} 分，"
                    f"该兑换需要 {redemption.points_spent} 分）"
                ),
            )
    product = db.query(Product).filter(Product.id == redemption.product_id).first()
    if product and old_group != new_group:
        if old_group == "reserved":
            product.locked_stock = max((product.locked_stock or 0) - 1, 0)
            if new_group == "released":
                product.available_stock += 1
        elif old_group == "committed":
            if new_group == "reserved":
                product.locked_stock += 1
            elif new_group == "released":
                product.available_stock += 1
        elif old_group == "released":
            if product.available_stock <= 0:
                raise HTTPException(status_code=400, detail="商品库存不足，无法恢复该兑换状态")
            product.available_stock -= 1
            if new_group == "reserved":
                product.locked_stock += 1

    now = datetime.now(timezone.utc)
    redemption.status = new_status
    if new_status == RedemptionStatus.APPROVED.value:
        redemption.approved_at = redemption.approved_at or now
    if new_status == RedemptionStatus.SHIPPED.value:
        redemption.shipped_at = now
        redemption.express_company = data.express_company
        redemption.tracking_number = data.tracking_number
    if new_status in {RedemptionStatus.RECEIVED.value, RedemptionStatus.COMPLETED.value}:
        redemption.received_at = redemption.received_at or now
    if new_status == RedemptionStatus.REJECTED.value:
        redemption.reject_reason = data.reject_reason
    else:
        # A rejection reason belongs only to the rejected state. Clear the
        # previous reason when an administrator moves the request onward.
        redemption.reject_reason = None

    _log_operation(
        db,
        current_user.id,
        "更新兑换状态",
        "redemption",
        redemption_id,
        f"兑换申请 #{redemption_id}: {old_status} → {new_status}",
    )
    db.commit()
    return {"message": f"状态已更新为{new_status}"}


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
        # 申请时已扣减可用库存，这里只释放锁定数量。
        if product.locked_stock > 0:
            product.locked_stock -= 1

    redemption.status = RedemptionStatus.APPROVED.value
    redemption.approved_at = datetime.now(timezone.utc)
    redemption.reject_reason = None

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
    if redemption.status not in [RedemptionStatus.APPROVED.value, RedemptionStatus.PENDING_SHIP.value]:
        raise HTTPException(status_code=400, detail="只能为已通过的申请发货")

    redemption.status = RedemptionStatus.SHIPPED.value
    redemption.shipped_at = datetime.now(timezone.utc)
    redemption.reject_reason = None
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
    redemption.reject_reason = None

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

    if product.product_status not in [ProductStatus.AVAILABLE.value, ProductStatus.LOW_STOCK.value]:
        raise HTTPException(status_code=400, detail="兑换失败：该商品未上架")

    if product.on_site_stock <= 0:
        raise HTTPException(status_code=400, detail="兑换失败：现场库存不足")

    # 兑换积分必须以商品管理中的定价为准，不能采用前端传入的数值。
    deduct = product.points_required
    if deduct > 0:
        _, _, available = _compute_student_points(db, student.id, student.year_id, student.project_id)
        if available < deduct:
            raise HTTPException(
                status_code=400,
                detail=f"兑换失败：学员可用积分不足（当前 {available} 分，需要 {deduct} 分）",
            )

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

    membership = db.query(GroupMember).filter(GroupMember.student_id == student.id).first()
    group_id = membership.group_id if membership else None

    product.on_site_stock -= 1

    award = PrizeAward(
        student_id=student.id,
        product_id=product.id,
        phase_id=data.phase_id,
        group_id=group_id,
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
