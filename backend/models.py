"""优才计划积分管理平台 — 数据模型 (15 张表)"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from database import Base


# ═══════════════ 枚举类型 ═══════════════

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    STUDENT = "student"


class EmploymentStatus(str, enum.Enum):
    ACTIVE = "在职"
    RESIGNED = "离职"


class AccountStatus(str, enum.Enum):
    ENABLED = "启用"
    TERMINATED = "终止"


class YearStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class ProjectStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class GroupStatus(str, enum.Enum):
    ACTIVE = "active"
    DISBANDED = "disbanded"


class PhaseStatus(str, enum.Enum):
    PENDING = "待开放"
    IN_PROGRESS = "进行中"
    CLOSED = "已关闭"
    ARCHIVED = "已归档"


class PointDataSource(str, enum.Enum):
    SINGLE = "单个录入"
    BATCH = "批量录入"
    EXCEL = "Excel导入"
    EXCHANGE = "学员兑换"
    ON_SITE = "现场兑换"
    EXPIRED = "积分失效"
    REVOKED = "撤销调整"
    ADJUST = "管理员调整"


class PointStatus(str, enum.Enum):
    ACTIVE = "有效"
    REVOKED = "已撤销"
    EXPIRED = "已过期"


class ProductStatus(str, enum.Enum):
    DRAFT = "未上架"
    AVAILABLE = "可兑换"
    LOW_STOCK = "即将售罄"
    SOLD_OUT = "已售罄"
    OFF_SHELF = "暂时下架"
    REPLENISH = "补货中"


class RedemptionStatus(str, enum.Enum):
    PENDING = "待审核"
    APPROVED = "已通过"
    REJECTED = "已拒绝"
    PENDING_SHIP = "待发货"
    SHIPPED = "已发货"
    PENDING_PICKUP = "待领取"
    RECEIVED = "已领取"
    CANCELLED = "已取消"
    COMPLETED = "已完成"


class AwardType(str, enum.Enum):
    EXCHANGE = "积分兑换"
    ON_SITE_EXCHANGE = "现场兑换"
    PHASE_EXCELLENT = "阶段优秀成员"
    GROUP_EXCELLENT = "优秀小组"
    CLASS_AWARD = "课堂奖励"
    OTHER = "其他奖励"


# ═══════════════ 积分分类 ═══════════════

POINT_CATEGORIES = [
    "线上学习", "学习输出", "问卷及测评反馈", "线下出勤",
    "课堂互动", "结营任务", "小组长职责", "特殊调整",
]


# ═══════════════ 15 张数据表 ═══════════════

class AcademicYear(Base):
    """年度"""
    __tablename__ = "academic_years"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default=YearStatus.ACTIVE.value)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    projects = relationship("TrainingProject", back_populates="year")
    users = relationship("User", back_populates="year_rel")
    groups = relationship("Group", back_populates="year_rel")
    phases = relationship("Phase", back_populates="year_rel")


class TrainingProject(Base):
    """培训项目"""
    __tablename__ = "training_projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False, index=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default=ProjectStatus.ACTIVE.value)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    year = relationship("AcademicYear", back_populates="projects")
    users = relationship("User", back_populates="project_rel")
    groups = relationship("Group", back_populates="project_rel")
    phases = relationship("Phase", back_populates="project_rel")
    enrollments = relationship("ProjectEnrollment", back_populates="project")


class User(Base):
    """用户表 — 支持多项目、多年度"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(10), nullable=False, default=UserRole.STUDENT.value)
    real_name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=True, index=True)
    phone = Column(String(20), nullable=True)
    address = Column(String(500), nullable=True)
    department = Column(String(100), nullable=True)
    system = Column(String(100), nullable=True, comment="体系")
    level1_dept = Column(String(100), nullable=True, comment="一级部门")
    year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("training_projects.id"), nullable=True, index=True)
    employment_status = Column(String(10), nullable=False, default=EmploymentStatus.ACTIVE.value)
    account_status = Column(String(10), nullable=False, default=AccountStatus.ENABLED.value)
    is_active = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    year_rel = relationship("AcademicYear", back_populates="users")
    project_rel = relationship("TrainingProject", back_populates="users")
    points_received = relationship("Point", back_populates="student", foreign_keys="Point.student_id")
    group_memberships = relationship("GroupMember", back_populates="student")
    phase_participations = relationship("PhaseParticipant", back_populates="student")
    redemptions = relationship("Redemption", back_populates="student")
    awards_received = relationship("PrizeAward", back_populates="student", foreign_keys="PrizeAward.student_id")
    project_enrollments = relationship("ProjectEnrollment", back_populates="student")


class Group(Base):
    """小组"""
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("training_projects.id"), nullable=True, index=True)
    status = Column(String(20), nullable=False, default=GroupStatus.ACTIVE.value)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    year_rel = relationship("AcademicYear", back_populates="groups")
    project_rel = relationship("TrainingProject", back_populates="groups")
    members = relationship("GroupMember", back_populates="group")
    phase_participations = relationship("PhaseGroup", back_populates="group")
    project_enrollments = relationship("ProjectEnrollment", back_populates="group")


class GroupMember(Base):
    """小组-成员关联"""
    __tablename__ = "group_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    group = relationship("Group", back_populates="members")
    student = relationship("User", back_populates="group_memberships")


class ProjectEnrollment(Base):
    """学员参与项目关系；同一账号可以跨年度、跨项目重复入选。"""
    __tablename__ = "project_enrollments"
    __table_args__ = (
        UniqueConstraint("student_id", "project_id", name="uq_project_enrollment_student_project"),
        UniqueConstraint("student_id", "year_id", name="uq_project_enrollment_student_year"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("training_projects.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    status = Column(String(20), nullable=False, default="在读")
    label = Column(String(50), nullable=True)
    remark = Column(Text, nullable=True)
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student = relationship("User", back_populates="project_enrollments")
    project = relationship("TrainingProject", back_populates="enrollments")
    group = relationship("Group", back_populates="project_enrollments")


class Phase(Base):
    """培训阶段"""
    __tablename__ = "phases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("training_projects.id"), nullable=True, index=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default=PhaseStatus.PENDING.value)
    allow_ranking = Column(Integer, nullable=False, default=1)
    allow_excellent = Column(Integer, nullable=False, default=0)
    excellent_count = Column(Integer, nullable=False, default=0)
    prize_description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    year_rel = relationship("AcademicYear", back_populates="phases")
    project_rel = relationship("TrainingProject", back_populates="phases")
    participants = relationship("PhaseParticipant", back_populates="phase")
    phase_groups = relationship("PhaseGroup", back_populates="phase")
    points = relationship("Point", back_populates="phase")


class PhaseParticipant(Base):
    """阶段参与学员"""
    __tablename__ = "phase_participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    phase_id = Column(Integer, ForeignKey("phases.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    is_excellent = Column(Integer, nullable=False, default=0)
    prize_given = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    phase = relationship("Phase", back_populates="participants")
    student = relationship("User", back_populates="phase_participations")


class PhaseGroup(Base):
    """阶段参与小组"""
    __tablename__ = "phase_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    phase_id = Column(Integer, ForeignKey("phases.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    phase = relationship("Phase", back_populates="phase_groups")
    group = relationship("Group", back_populates="phase_participations")


class Point(Base):
    """积分记录表 — 核心表"""
    __tablename__ = "points"

    id = Column(Integer, primary_key=True, autoincrement=True)
    record_number = Column(String(50), nullable=True, index=True, comment="唯一编号防重复导入")
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("training_projects.id"), nullable=True, index=True)
    phase_id = Column(Integer, ForeignKey("phases.id"), nullable=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    points = Column(Integer, nullable=False)
    category = Column(String(50), nullable=False, default="特殊调整")
    description = Column(Text, nullable=True)
    data_source = Column(String(20), nullable=False, default=PointDataSource.SINGLE.value)
    status = Column(String(10), nullable=False, default=PointStatus.ACTIVE.value)
    revoke_reason = Column(Text, nullable=True)
    obtained_date = Column(DateTime, nullable=True, default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student = relationship("User", back_populates="points_received", foreign_keys=[student_id])
    admin = relationship("User", foreign_keys=[admin_id])
    phase = relationship("Phase", back_populates="points")


class TeamPoint(Base):
    """小组任务积分流水；只进入小组账户，不拆分给个人。"""
    __tablename__ = "team_points"

    id = Column(Integer, primary_key=True, autoincrement=True)
    record_number = Column(String(80), nullable=True, unique=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("training_projects.id"), nullable=False, index=True)
    phase_id = Column(Integer, ForeignKey("phases.id"), nullable=True, index=True)
    points = Column(Integer, nullable=False)
    category = Column(String(50), nullable=False, default="特殊调整")
    item_name = Column(String(200), nullable=False)
    task_key = Column(String(300), nullable=True, index=True)
    obtained_date = Column(DateTime, nullable=True, default=lambda: datetime.now(timezone.utc))
    data_source = Column(String(30), nullable=False, default="单个录入")
    source_note = Column(Text, nullable=True)
    remark = Column(Text, nullable=True)
    status = Column(String(10), nullable=False, default=PointStatus.ACTIVE.value, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PointRule(Base):
    """积分规则"""
    __tablename__ = "point_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String(50), nullable=False)
    rule_name = Column(String(200), nullable=False)
    default_points = Column(Integer, nullable=False, default=0)
    max_points = Column(Integer, nullable=True)
    applicable_projects = Column(String(500), nullable=True)
    applicable_phases = Column(String(500), nullable=True)
    allow_repeat = Column(Integer, nullable=False, default=0)
    count_in_period = Column(Integer, nullable=False, default=1)
    count_in_available = Column(Integer, nullable=False, default=1)
    need_approval = Column(Integer, nullable=False, default=0)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class RuleText(Base):
    """积分规则文本（后台上传的完整规则说明）"""
    __tablename__ = "rule_texts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Product(Base):
    """商品"""
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)
    points_required = Column(Integer, nullable=False)
    total_stock = Column(Integer, nullable=False, default=0)
    available_stock = Column(Integer, nullable=False, default=0)
    locked_stock = Column(Integer, nullable=False, default=0)
    on_site_stock = Column(Integer, nullable=False, default=0)
    limit_per_person = Column(Integer, nullable=True)
    is_limited = Column(Integer, nullable=False, default=0)
    on_sale_time = Column(DateTime, nullable=True)
    off_sale_time = Column(DateTime, nullable=True)
    product_status = Column(String(20), nullable=False, default=ProductStatus.DRAFT.value)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Redemption(Base):
    """兑换记录"""
    __tablename__ = "redemptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    points_spent = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default=RedemptionStatus.PENDING.value)
    locked_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    shipped_at = Column(DateTime, nullable=True)
    received_at = Column(DateTime, nullable=True)
    express_company = Column(String(100), nullable=True)
    tracking_number = Column(String(100), nullable=True)
    pickup_method = Column(String(50), nullable=True)
    reject_reason = Column(Text, nullable=True)
    address_snapshot = Column(Text, nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    student = relationship("User", back_populates="redemptions")
    product = relationship("Product")


class PrizeAward(Base):
    """奖品发放记录"""
    __tablename__ = "prize_awards"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    phase_id = Column(Integer, ForeignKey("phases.id"), nullable=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    award_type = Column(String(20), nullable=False)
    points_deducted = Column(Integer, nullable=False, default=0)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student = relationship("User", back_populates="awards_received", foreign_keys=[student_id])
    product = relationship("Product")
    admin = relationship("User", foreign_keys=[created_by])


class OperationLog(Base):
    """操作记录"""
    __tablename__ = "operation_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String(100), nullable=False)
    target_type = Column(String(50), nullable=False)
    target_id = Column(Integer, nullable=True)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    admin = relationship("User")


class Notification(Base):
    """通知"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=True)
    is_read = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
