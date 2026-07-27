"""优才计划积分管理平台 — Pydantic Schemas"""
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


# ═══════ 认证 ═══════
class LoginRequest(BaseModel):
    username: str  # 支持姓名或邮箱
    password: str = ""
    role: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    real_name: str
    user_id: int

class UserInfo(BaseModel):
    id: int; username: str; role: str; real_name: str
    email: Optional[str] = None; phone: Optional[str] = None
    address: Optional[str] = None; department: Optional[str] = None
    system: Optional[str] = None; level1_dept: Optional[str] = None
    employment_status: str = "在职"; account_status: str = "启用"
    year_id: Optional[int] = None; project_id: Optional[int] = None
    is_active: int = 1
    class Config: from_attributes = True


# ═══════ 年度/项目 ═══════
class YearOut(BaseModel):
    id: int; name: str; status: str
    class Config: from_attributes = True

class ProjectOut(BaseModel):
    id: int; name: str; year_id: int; status: str; description: Optional[str] = None
    start_date: Optional[datetime] = None; end_date: Optional[datetime] = None
    class Config: from_attributes = True

class YearCreate(BaseModel): name: str

class ProjectCreate(BaseModel):
    name: str; year_id: Optional[int] = None; year_name: Optional[str] = None
    start_date: Optional[datetime] = None; end_date: Optional[datetime] = None
    description: Optional[str] = None


# ═══════ 学员 ═══════
class StudentCreate(BaseModel):
    real_name: str
    email: Optional[str] = None; phone: Optional[str] = None
    address: Optional[str] = None; department: Optional[str] = None
    system: Optional[str] = None; level1_dept: Optional[str] = None
    year_id: Optional[int] = None; project_id: Optional[int] = None
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    employment_status: str = "在职"

class StudentUpdate(BaseModel):
    real_name: Optional[str] = None; email: Optional[str] = None
    phone: Optional[str] = None; address: Optional[str] = None
    department: Optional[str] = None
    system: Optional[str] = None; level1_dept: Optional[str] = None
    year_id: Optional[int] = None; project_id: Optional[int] = None
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    employment_status: Optional[str] = None
    account_status: Optional[str] = None

class StudentBrief(BaseModel):
    id: int; username: str; real_name: str
    email: Optional[str] = None; phone: Optional[str] = None
    address: Optional[str] = None; department: Optional[str] = None
    system: Optional[str] = None; level1_dept: Optional[str] = None
    year_id: Optional[int] = None; project_id: Optional[int] = None
    year_name: Optional[str] = None; project_name: Optional[str] = None
    group_id: Optional[int] = None; group_name: Optional[str] = None
    employment_status: str = "在职"; account_status: str = "启用"
    period_points: int = 0; total_earned: int = 0; available_points: int = 0
    created_at: Optional[datetime] = None
    class Config: from_attributes = True

class StudentDetail(BaseModel):
    id: int; username: str; real_name: str
    email: Optional[str] = None; phone: Optional[str] = None
    address: Optional[str] = None; department: Optional[str] = None
    year_name: Optional[str] = None; project_name: Optional[str] = None
    group_name: Optional[str] = None
    employment_status: str; account_status: str
    period_points: int = 0; total_earned: int = 0; available_points: int = 0
    phase_points: List[dict] = []
    recent_points: List[dict] = []
    recent_redemptions: List[dict] = []
    recent_awards: List[dict] = []

class BatchImportPreview(BaseModel):
    total_rows: int = 0; new_count: int = 0; update_count: int = 0; skipped_count: int = 0
    duplicate_emails: List[str] = []
    missing_fields: List[int] = []
    invalid_projects: List[str] = []
    invalid_groups: List[str] = []

class BatchImportRequest(BaseModel):
    rows: List[dict]


# ═══════ 小组 ═══════
class GroupCreate(BaseModel):
    name: str; year_id: int; project_id: int

class GroupOut(BaseModel):
    id: int; name: str; year_id: int; project_id: int
    year_name: str = ""; project_name: str = ""
    member_count: int = 0; total_points: int = 0
    avg_points: float = 0.0; rank: Optional[int] = None
    status: str = "active"
    class Config: from_attributes = True

class GroupDetail(GroupOut):
    members: List[dict] = []
    phase_stats: List[dict] = []
    awards: List[dict] = []


# ═══════ 阶段 ═══════
class PhaseCreate(BaseModel):
    name: str; year_id: int; project_id: int
    start_date: Optional[datetime] = None; end_date: Optional[datetime] = None
    description: Optional[str] = None
    allow_ranking: int = 1; allow_excellent: int = 0
    excellent_count: int = 0; prize_description: Optional[str] = None

class PhaseUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[datetime] = None; end_date: Optional[datetime] = None
    description: Optional[str] = None
    status: Optional[str] = None
    allow_ranking: Optional[int] = None; allow_excellent: Optional[int] = None
    excellent_count: Optional[int] = None; prize_description: Optional[str] = None

class PhaseOut(BaseModel):
    id: int; name: str; year_id: int; project_id: int
    year_name: str = ""; project_name: str = ""
    start_date: Optional[datetime] = None; end_date: Optional[datetime] = None
    description: Optional[str] = None; status: str
    participant_count: int = 0; group_count: int = 0
    total_points: int = 0
    allow_ranking: int = 1; allow_excellent: int = 0
    excellent_count: int = 0
    prize_description: Optional[str] = None
    class Config: from_attributes = True

class PhaseDetail(PhaseOut):
    participants: List[dict] = []
    phase_groups: List[dict] = []
    rankings: List[dict] = []
    group_rankings: List[dict] = []
    excellent_members: List[dict] = []

class PhaseRanking(BaseModel):
    rank: int; student_id: int; student_name: str
    group_name: Optional[str] = None; department: Optional[str] = None
    total_points: int; category_details: List[dict] = []

class GroupRanking(BaseModel):
    rank: int; group_id: int; group_name: str
    total_points: int; avg_points: float; member_count: int

class ExcellentSelect(BaseModel):
    student_ids: List[int]


# ═══════ 积分 ═══════
class PointCreate(BaseModel):
    record_number: Optional[str] = None
    student_id: int; points: int
    year_id: int; project_id: int
    phase_id: Optional[int] = None; group_id: Optional[int] = None
    category: str = "特殊调整"; description: Optional[str] = None
    obtained_date: Optional[datetime] = None

class PointBatchCreate(BaseModel):
    records: List[PointCreate]

class PointImportPreview(BaseModel):
    valid_count: int = 0; student_count: int = 0
    new_count: int = 0; duplicate_count: int = 0
    unmatched_count: int = 0; invalid_phase: int = 0
    total_points: int = 0
    errors: List[str] = []

class PointImportRequest(BaseModel):
    records: List[PointCreate]

class PointRevoke(BaseModel):
    reason: str

class PointRecordOut(BaseModel):
    id: int; record_number: Optional[str] = None
    student_id: int; student_name: str = ""
    admin_name: str = ""; points: int
    year_name: str = ""; project_name: str = ""
    phase_name: Optional[str] = None; group_name: Optional[str] = None
    category: str; description: Optional[str] = None
    data_source: str = ""; status: str = "有效"
    revoke_reason: Optional[str] = None
    obtained_date: Optional[datetime] = None
    created_at: Optional[datetime] = None
    class Config: from_attributes = True


# ═══════ 积分规则 ═══════
class PointRuleCreate(BaseModel):
    category: str; rule_name: str
    default_points: int = 0; max_points: Optional[int] = None
    applicable_projects: Optional[str] = None; applicable_phases: Optional[str] = None
    allow_repeat: int = 0; count_in_period: int = 1
    count_in_available: int = 1; need_approval: int = 0
    description: Optional[str] = None

class PointRuleOut(BaseModel):
    id: int; category: str; rule_name: str
    default_points: int; max_points: Optional[int] = None
    applicable_projects: Optional[str] = None; applicable_phases: Optional[str] = None
    allow_repeat: int; count_in_period: int; count_in_available: int
    need_approval: int; description: Optional[str] = None
    class Config: from_attributes = True


# ═══════ 商品 ═══════
class ProductCreate(BaseModel):
    name: str; description: Optional[str] = None
    image_url: Optional[str] = None; points_required: int
    total_stock: int = 0; on_site_stock: int = 0
    limit_per_person: Optional[int] = None; is_limited: int = 0
    on_sale_time: Optional[datetime] = None; off_sale_time: Optional[datetime] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None; description: Optional[str] = None
    image_url: Optional[str] = None; points_required: Optional[int] = None
    total_stock: Optional[int] = None; on_site_stock: Optional[int] = None
    limit_per_person: Optional[int] = None; is_limited: Optional[int] = None
    on_sale_time: Optional[datetime] = None; off_sale_time: Optional[datetime] = None
    product_status: Optional[str] = None

class ProductOut(BaseModel):
    id: int; name: str; description: Optional[str] = None
    image_url: Optional[str] = None; points_required: int
    total_stock: int; available_stock: int; locked_stock: int
    on_site_stock: int; limit_per_person: Optional[int] = None
    is_limited: int; on_sale_time: Optional[datetime] = None
    off_sale_time: Optional[datetime] = None; product_status: str
    created_at: Optional[datetime] = None
    class Config: from_attributes = True


# ═══════ 兑换 ═══════
class RedemptionCreate(BaseModel):
    product_id: int; remark: Optional[str] = None

class RedemptionProcess(BaseModel):
    status: Optional[str] = None
    remark: Optional[str] = None; reject_reason: Optional[str] = None
    express_company: Optional[str] = None; tracking_number: Optional[str] = None

class RedemptionOut(BaseModel):
    id: int; student_id: int; student_name: str = ""
    product_id: int; product_name: str = ""
    product_image_url: Optional[str] = None
    points_spent: int; status: str
    locked_at: Optional[datetime] = None; approved_at: Optional[datetime] = None
    shipped_at: Optional[datetime] = None; received_at: Optional[datetime] = None
    express_company: Optional[str] = None; tracking_number: Optional[str] = None
    pickup_method: Optional[str] = None; reject_reason: Optional[str] = None
    address_snapshot: Optional[str] = None; remark: Optional[str] = None
    created_at: Optional[datetime] = None; updated_at: Optional[datetime] = None
    class Config: from_attributes = True


# ═══════ 奖品发放 ═══════
class AwardRequest(BaseModel):
    student_id: int; product_id: int
    award_type: str = "其他奖励"
    phase_id: Optional[int] = None; group_id: Optional[int] = None
    description: Optional[str] = None
    # 如果是积分兑换模式
    deduct_points: int = 0

class AwardOut(BaseModel):
    id: int; student_id: int; student_name: str = ""
    product_id: int; product_name: str = ""
    award_type: str; points_deducted: int = 0
    phase_name: Optional[str] = None; group_name: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    class Config: from_attributes = True


# ═══════ 操作记录 ═══════
class OperationLogOut(BaseModel):
    id: int; admin_id: int; admin_name: str = ""
    action: str; target_type: str; target_id: Optional[int] = None
    detail: Optional[str] = None; created_at: Optional[datetime] = None
    class Config: from_attributes = True


# ═══════ 仪表盘 ═══════
class AdminDashboardStats(BaseModel):
    total_students: int = 0; active_students: int = 0; terminated_students: int = 0
    current_year: str = ""; current_project: str = ""
    current_phase: str = ""; current_phase_status: str = ""
    period_points: int = 0; available_points_total: int = 0
    pending_redemptions: int = 0; completed_redemptions: int = 0
    low_stock_products: int = 0
    phase_overview: List[dict] = []

class StudentDashboardStats(BaseModel):
    real_name: str = ""; year_name: str = ""; project_name: str = ""
    group_name: str = ""
    period_points: int = 0; period_rank: Optional[int] = None
    total_earned: int = 0; available_points: int = 0
    spent_points: int = 0
    current_phase: str = ""; current_phase_points: int = 0
    current_phase_rank: Optional[int] = None
    group_rank: Optional[int] = None
    phase_points: List[dict] = []
    recent_points: List[dict] = []
    recent_redemptions: List[dict] = []


# ═══════ 分页 ═══════
class PaginatedResponse(BaseModel):
    items: List
    total: int; page: int; page_size: int; total_pages: int
