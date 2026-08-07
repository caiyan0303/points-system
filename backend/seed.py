"""优才计划积分管理平台 — 种子数据"""

import os
from datetime import datetime, timezone, timedelta
from database import engine, SessionLocal, Base
from models import *
from auth import hash_password


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    if db.query(User).count() > 0:
        print("数据库已有数据，跳过初始化")
        db.close()
        return

    # ═══ 年度 ═══
    y2025 = AcademicYear(name="2025年度", status=YearStatus.ARCHIVED.value)
    y2026 = AcademicYear(name="2026年度", status=YearStatus.ACTIVE.value)
    db.add_all([y2025, y2026])
    db.flush()

    # ═══ 培训项目 ═══
    proj_talent = TrainingProject(name="优才计划", year_id=y2026.id, status=ProjectStatus.ACTIVE.value, description="核心管理人才系统培养项目")
    proj_plus = TrainingProject(name="优才计划PLUS", year_id=y2026.id, status=ProjectStatus.ACTIVE.value, description="高阶管理精英深化培养项目")
    proj_2025 = TrainingProject(name="优才计划", year_id=y2025.id, status=ProjectStatus.ARCHIVED.value, description="2025年度核心管理人才培养")
    db.add_all([proj_talent, proj_plus, proj_2025])
    db.flush()

    # ═══ 管理员 ═══
    admin_username = os.getenv("SEED_ADMIN_USERNAME", "admin")
    admin_password = os.getenv("SEED_ADMIN_PASSWORD")
    if not admin_password:
        raise RuntimeError("运行初始化前请设置 SEED_ADMIN_PASSWORD，禁止使用公开默认密码")
    admin = User(username=admin_username, password_hash=hash_password(admin_password), role=UserRole.ADMIN.value, real_name="HR管理员", email="admin@company.com")
    db.add(admin)
    db.flush()

    # ═══ 学员（2026优才计划） ═══
    talent_students_data = [
        ("张三", "zhangsan@company.com", "13800001111", "技术部", "北京市朝阳区XX路1号", "研发体系", "技术中心"),
        ("李四", "lisi@company.com", "13800002222", "市场部", "上海市浦东新区XX路2号", "营销体系", "市场中心"),
        ("王五", "wangwu@company.com", "13800003333", "运营部", "广州市天河区XX路3号", "运营体系", "运营中心"),
        ("赵六", "zhaoliu@company.com", "13800004444", "技术部", "深圳市南山区XX路4号", "研发体系", "技术中心"),
        ("陈七", "chenqi@company.com", "13800005555", "市场部", "杭州市西湖区XX路5号", "营销体系", "品牌中心"),
        ("刘八", "liuba@company.com", "13800006666", "运营部", "成都市高新区XX路6号", "运营体系", "运营中心"),
        ("周九", "zhoujiu@company.com", "13800007777", "技术部", "武汉市洪山区XX路7号", "研发体系", "技术中心"),
        ("吴十", "wushi@company.com", "13800008888", "市场部", "南京市鼓楼区XX路8号", "营销体系", "品牌中心"),
    ]
    talent_students = []
    for name, email, phone, dept, addr, sys_name, l1dept in talent_students_data:
        u = User(username=name, real_name=name, password_hash=hash_password("123456"), role=UserRole.STUDENT.value,
                 email=email, phone=phone, department=dept, address=addr,
                 system=sys_name, level1_dept=l1dept,
                 year_id=y2026.id, project_id=proj_talent.id)
        db.add(u)
        talent_students.append(u)
    db.flush()

    # ═══ 学员（2026优才计划PLUS） ═══
    plus_students_data = [
        ("郑十一", "zheng11@company.com", "13800009999", "战略部", "西安市雁塔区XX路9号", "战略体系", "战略规划部"),
        ("冯十二", "feng12@company.com", "13800010000", "财务部", "长沙市岳麓区XX路10号", "职能体系", "财务部"),
        ("褚十三", "chu13@company.com", "13800011111", "人力资源部", "天津市南开区XX路11号", "职能体系", "人力资源部"),
        ("卫十四", "wei14@company.com", "13800012222", "战略部", "重庆市渝北区XX路12号", "战略体系", "战略规划部"),
    ]
    plus_students = []
    for name, email, phone, dept, addr, sys_name, l1dept in plus_students_data:
        u = User(username=name, real_name=name, password_hash=hash_password("123456"), role=UserRole.STUDENT.value,
                 email=email, phone=phone, department=dept, address=addr,
                 system=sys_name, level1_dept=l1dept,
                 year_id=y2026.id, project_id=proj_plus.id)
        db.add(u)
        plus_students.append(u)
    db.flush()

    # ═══ 2025历史学员 ═══
    hist_student = User(username="历史学员", real_name="历史学员", password_hash=hash_password("123456"),
                        role=UserRole.STUDENT.value, email="history@company.com",
                        year_id=y2025.id, project_id=proj_2025.id,
                        employment_status=EmploymentStatus.RESIGNED.value, account_status=AccountStatus.TERMINATED.value)
    db.add(hist_student)
    db.flush()

    # ═══ 小组（2026优才计划） ═══
    g1 = Group(name="第一组", year_id=y2026.id, project_id=proj_talent.id)
    g2 = Group(name="第二组", year_id=y2026.id, project_id=proj_talent.id)
    g3 = Group(name="第三组", year_id=y2026.id, project_id=proj_talent.id)
    db.add_all([g1, g2, g3])
    db.flush()

    # 分配成员到小组
    group_assign = {g1: talent_students[:3], g2: talent_students[3:6], g3: talent_students[6:]}
    for group, members in group_assign.items():
        for m in members:
            db.add(GroupMember(group_id=group.id, student_id=m.id))
    db.flush()

    # ═══ 小组（2026优才计划PLUS） ═══
    gp1 = Group(name="PLUS第一组", year_id=y2026.id, project_id=proj_plus.id)
    db.add(gp1)
    db.flush()
    for m in plus_students:
        db.add(GroupMember(group_id=gp1.id, student_id=m.id))
    db.flush()

    # ═══ 阶段（2026优才计划） ═══
    phase1 = Phase(name="第一阶段·认知与基础", year_id=y2026.id, project_id=proj_talent.id,
                   start_date=datetime(2026, 1, 6), end_date=datetime(2026, 3, 31),
                   description="管理基础知识与自我认知培养",
                   status=PhaseStatus.CLOSED.value, allow_ranking=1, allow_excellent=1, excellent_count=2)
    phase2 = Phase(name="第二阶段·实践与应用", year_id=y2026.id, project_id=proj_talent.id,
                   start_date=datetime(2026, 4, 1), end_date=datetime(2026, 6, 30),
                   description="将管理理论应用于实际业务场景",
                   status=PhaseStatus.CLOSED.value, allow_ranking=1, allow_excellent=1, excellent_count=2)
    phase3 = Phase(name="第三阶段·引领与创新", year_id=y2026.id, project_id=proj_talent.id,
                   start_date=datetime(2026, 7, 1), end_date=datetime(2026, 9, 30),
                   description="培养战略思维与创新领导力",
                   status=PhaseStatus.IN_PROGRESS.value, allow_ranking=1, allow_excellent=1, excellent_count=3)
    db.add_all([phase1, phase2, phase3])
    db.flush()

    # 添加学员到阶段+小组关联
    for phase in [phase1, phase2, phase3]:
        for g_id, members in [(g1.id, talent_students[:3]), (g2.id, talent_students[3:6]), (g3.id, talent_students[6:])]:
            for m in members:
                pp = PhaseParticipant(phase_id=phase.id, student_id=m.id, group_id=g_id)
                db.add(pp)
            pg = PhaseGroup(phase_id=phase.id, group_id=g_id)
            db.add(pg)
    db.flush()

    # ═══ 积分规则 ═══
    rules = [
        PointRule(category="问卷及测评反馈", rule_name="按时提交问卷及测评反馈", default_points=6, max_points=6, allow_repeat=1, count_in_period=1, count_in_available=1),
        PointRule(category="个人全勤", rule_name="线下课程个人全勤", default_points=10, max_points=10, allow_repeat=0, count_in_period=1, count_in_available=1),
        PointRule(category="考核优秀奖励", rule_name="单门课程考核达到90分及以上", default_points=3, max_points=3, allow_repeat=1, count_in_period=1, count_in_available=1),
        PointRule(category="学习输出", rule_name="课程学习输出", default_points=6, max_points=15, allow_repeat=1, count_in_period=1, count_in_available=1),
        PointRule(category="课堂互动", rule_name="有效回答课堂随机提问", default_points=3, max_points=None, allow_repeat=1, count_in_period=1, count_in_available=1),
        PointRule(category="小组出勤", rule_name="小组全员出勤", default_points=6, max_points=6, allow_repeat=1, count_in_period=1, count_in_available=0),
        PointRule(category="线上学习任务", rule_name="小组完成线上学习任务", default_points=10, max_points=10, allow_repeat=1, count_in_period=1, count_in_available=0),
        PointRule(category="线上案例任务", rule_name="小组线上案例任务", default_points=6, max_points=10, allow_repeat=1, count_in_period=1, count_in_available=0),
        PointRule(category="阶段案例评优", rule_name="阶段案例第一名", default_points=20, max_points=20, allow_repeat=1, count_in_period=1, count_in_available=0),
        PointRule(category="沙盘共创", rule_name="沙盘活动最终排名", default_points=10, max_points=50, allow_repeat=1, count_in_period=1, count_in_available=0),
        PointRule(category="结营作业", rule_name="个人结营作业及小组任务", default_points=6, max_points=10, allow_repeat=0, count_in_period=1, count_in_available=0),
        PointRule(category="特殊调整", rule_name="管理员积分纠错", default_points=0, max_points=None, allow_repeat=1, count_in_period=1, count_in_available=1, need_approval=1),
    ]
    for r in rules:
        db.add(r)
    db.flush()

    # ═══ 积分数据 ═══
    import random
    random.seed(42)
    all_points = []

    # 第一阶段积分
    group_keys = list(group_assign.keys())
    p1_data = [
        ("线上课程", [12, 15, 10, 14, 11, 9, 13, 8]),
        ("线上考试", [18, 15, 12, 16, 10, 14, 17, 11]),
        ("学习输出", [8, 10, 6, 9, 7, 5, 8, 6]),
        ("线下出勤", [12, 10, 8, 11, 12, 9, 10, 7]),
        ("课堂任务", [18, 15, 12, 16, 14, 10, 13, 11]),
        ("实践任务", [25, 22, 18, 20, 15, 18, 22, 16]),
        ("小组共创", [30, 30, 30, 25, 25, 25, 20, 20]),
    ]
    for cat, scores in p1_data:
        for i, s in enumerate(scores):
            all_points.append((talent_students[i].id, proj_talent.id, phase1.id, group_keys[i//3].id, s, cat, f"{phase1.name} - {cat}"))

    # 第二阶段积分
    p2_data = [
        ("线上课程", [15, 12, 14, 10, 13, 11, 15, 9]),
        ("线上考试", [20, 16, 14, 18, 12, 15, 19, 13]),
        ("学习输出", [10, 12, 8, 11, 9, 6, 10, 7]),
        ("线下出勤", [12, 11, 10, 12, 12, 8, 10, 9]),
        ("课堂任务", [20, 16, 14, 18, 15, 12, 16, 13]),
        ("实践任务", [28, 24, 20, 22, 18, 20, 25, 18]),
        ("小组共创", [35, 35, 35, 28, 28, 28, 22, 22]),
        ("项目贡献", [40, 30, 0, 0, 25, 0, 0, 0]),
    ]
    for cat, scores in p2_data:
        for i, s in enumerate(scores):
            if s > 0:
                all_points.append((talent_students[i].id, proj_talent.id, phase2.id, group_keys[i//3].id, s, cat, f"{phase2.name} - {cat}"))

    # 第三阶段（进行中）积分
    p3_data = [
        ("线上课程", [10, 8, 6, 10, 0, 7, 9, 5]),
        ("线上考试", [15, 12, 0, 14, 10, 0, 12, 0]),
        ("学习输出", [8, 6, 5, 7, 4, 0, 6, 0]),
        ("线下出勤", [6, 5, 4, 6, 5, 3, 4, 3]),
        ("课堂任务", [12, 10, 0, 11, 8, 0, 9, 0]),
        ("实践任务", [0, 0, 0, 15, 0, 12, 0, 0]),
    ]
    for cat, scores in p3_data:
        for i, s in enumerate(scores):
            if s > 0:
                all_points.append((talent_students[i].id, proj_talent.id, phase3.id, group_keys[i//3].id, s, cat, f"{phase3.name} - {cat}"))

    # ═══ 2025历史积分 ═══
    for cat, pts in [("线上课程", 10), ("线下出勤", 12), ("实践任务", 20)]:
        all_points.append((hist_student.id, proj_2025.id, None, None, pts, cat, f"2025 - {cat}"))

    now = datetime.now(timezone.utc)
    for sid, pid, phase_id, gid, pts, cat, desc in all_points:
        db.add(Point(
            student_id=sid, admin_id=admin.id,
            year_id=y2026.id if pid != proj_2025.id else y2025.id,
            project_id=pid, phase_id=phase_id, group_id=gid,
            points=pts, category=cat, description=desc,
            data_source="单个录入" if random.random() < 0.7 else "批量录入",
            obtained_date=now - timedelta(days=random.randint(1, 180)),
        ))

    # ═══ 商品 ═══
    products = [
        Product(name="管理经典书籍套装", description="《从优秀到卓越》《基业长青》《创新者的窘境》三册精装", points_required=60,
                total_stock=15, available_stock=15, on_site_stock=5, limit_per_person=1, is_limited=1,
                product_status=ProductStatus.AVAILABLE.value),
        Product(name="星巴克礼品卡 200元", description="全国门店通用", points_required=120,
                total_stock=20, available_stock=20, on_site_stock=10,
                product_status=ProductStatus.AVAILABLE.value),
        Product(name="商务双肩背包", description="高端商务双肩背包，防泼水", points_required=180,
                total_stock=8, available_stock=8, on_site_stock=3, limit_per_person=1, is_limited=1,
                product_status=ProductStatus.AVAILABLE.value),
        Product(name="蓝牙降噪耳机", description="主动降噪，40小时续航", points_required=250,
                total_stock=5, available_stock=5, on_site_stock=2, limit_per_person=1, is_limited=1,
                product_status=ProductStatus.AVAILABLE.value),
        Product(name="年度管理峰会门票", description="2026中国管理者峰会VIP入场券", points_required=350,
                total_stock=3, available_stock=3, on_site_stock=1, limit_per_person=1, is_limited=1,
                product_status=ProductStatus.AVAILABLE.value),
        Product(name="文具礼盒", description="高端笔记本+钢笔礼盒", points_required=40,
                total_stock=30, available_stock=30, on_site_stock=15,
                product_status=ProductStatus.AVAILABLE.value),
        Product(name="Kindle电子阅读器", description="第11代 6英寸 300ppi", points_required=200,
                total_stock=0, available_stock=0, on_site_stock=0,
                product_status=ProductStatus.SOLD_OUT.value),
        Product(name="办公升降台", description="桌面升降台，站立办公", points_required=400,
                total_stock=2, available_stock=2, on_site_stock=0,
                product_status=ProductStatus.AVAILABLE.value),
    ]
    for p in products:
        db.add(p)
    db.flush()

    # ═══ 操作日志示例 ═══
    sample_logs = [
        OperationLog(admin_id=admin.id, action="创建年度", target_type="academic_year", target_id=y2026.id, detail="创建2026年度"),
        OperationLog(admin_id=admin.id, action="创建项目", target_type="training_project", target_id=proj_talent.id, detail="创建优才计划项目"),
        OperationLog(admin_id=admin.id, action="批量导入学员", target_type="student", detail="批量导入8名学员到优才计划"),
        OperationLog(admin_id=admin.id, action="创建小组", target_type="group", target_id=g1.id, detail="创建第一组"),
        OperationLog(admin_id=admin.id, action="创建阶段", target_type="phase", target_id=phase1.id, detail="创建第一阶段·认知与基础"),
    ]
    for log in sample_logs:
        db.add(log)

    db.commit()
    print("="*60)
    print("✅ 优才计划积分管理平台 — 种子数据初始化完成！")
    print("="*60)
    print(f"  年度: 2个（2025已归档 + 2026当前）")
    print(f"  培训项目: 3个（优才计划 + 优才计划PLUS + 2025历史）")
    print(f"  管理员账号: {admin_username}（密码来自 SEED_ADMIN_PASSWORD）")
    print(f"  优才计划学员: 8人（张三~吴十）/ 123456")
    print(f"  优才计划PLUS学员: 4人（郑十一~卫十四）/ 123456")
    print(f"  小组: 4个（3个优才 + 1个PLUS）")
    print(f"  阶段: 3个（2已关闭 + 1进行中）")
    print(f"  积分记录: {len(all_points)} 条")
    print(f"  积分规则: {len(rules)} 条")
    print(f"  商品: {len(products)} 个")
    print(f"  操作记录: {len(sample_logs)} 条")
    print("="*60)

    db.close()


if __name__ == "__main__":
    seed()
