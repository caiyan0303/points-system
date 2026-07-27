CREATE TABLE IF NOT EXISTS academic_years (
  id BIGSERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS training_projects (
  id BIGSERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL,
  year_id BIGINT NOT NULL REFERENCES academic_years(id), start_date TIMESTAMPTZ, end_date TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'active', description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(year_id, name)
);
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'student', real_name VARCHAR(100) NOT NULL, email VARCHAR(100),
  phone VARCHAR(20), address VARCHAR(500), department VARCHAR(100), system VARCHAR(100), level1_dept VARCHAR(100),
  year_id BIGINT REFERENCES academic_years(id), project_id BIGINT REFERENCES training_projects(id),
  employment_status VARCHAR(10) NOT NULL DEFAULT '在职', account_status VARCHAR(10) NOT NULL DEFAULT '启用',
  is_active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS groups (
  id BIGSERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, year_id BIGINT REFERENCES academic_years(id),
  project_id BIGINT REFERENCES training_projects(id), status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(project_id, name)
);
CREATE TABLE IF NOT EXISTS group_members (
  id BIGSERIAL PRIMARY KEY, group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(group_id, student_id)
);
CREATE TABLE IF NOT EXISTS project_enrollments (
  id BIGSERIAL PRIMARY KEY, student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year_id BIGINT NOT NULL REFERENCES academic_years(id), project_id BIGINT NOT NULL REFERENCES training_projects(id),
  group_id BIGINT REFERENCES groups(id) ON DELETE SET NULL, status VARCHAR(20) NOT NULL DEFAULT '在读',
  label VARCHAR(50), remark TEXT, joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, project_id), UNIQUE(student_id, year_id)
);
CREATE TABLE IF NOT EXISTS phases (
  id BIGSERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, year_id BIGINT REFERENCES academic_years(id),
  project_id BIGINT REFERENCES training_projects(id), start_date TIMESTAMPTZ, end_date TIMESTAMPTZ,
  description TEXT, status VARCHAR(20) NOT NULL DEFAULT '待开放', allow_ranking INTEGER NOT NULL DEFAULT 1,
  allow_excellent INTEGER NOT NULL DEFAULT 0, excellent_count INTEGER NOT NULL DEFAULT 0,
  prize_description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS phase_participants (
  id BIGSERIAL PRIMARY KEY, phase_id BIGINT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, group_id BIGINT REFERENCES groups(id) ON DELETE SET NULL,
  is_excellent INTEGER NOT NULL DEFAULT 0, prize_given INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(phase_id, student_id)
);
CREATE TABLE IF NOT EXISTS phase_groups (
  id BIGSERIAL PRIMARY KEY, phase_id BIGINT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(phase_id, group_id)
);
CREATE TABLE IF NOT EXISTS points (
  id BIGSERIAL PRIMARY KEY, record_number VARCHAR(50) UNIQUE,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, admin_id BIGINT NOT NULL REFERENCES users(id),
  year_id BIGINT REFERENCES academic_years(id), project_id BIGINT REFERENCES training_projects(id),
  phase_id BIGINT REFERENCES phases(id) ON DELETE SET NULL, group_id BIGINT REFERENCES groups(id) ON DELETE SET NULL,
  points INTEGER NOT NULL, category VARCHAR(50) NOT NULL DEFAULT '特殊调整', description TEXT,
  data_source VARCHAR(20) NOT NULL DEFAULT '单个录入', status VARCHAR(10) NOT NULL DEFAULT '有效',
  revoke_reason TEXT, obtained_date TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS point_rules (
  id BIGSERIAL PRIMARY KEY, category VARCHAR(50) NOT NULL, rule_name VARCHAR(200) NOT NULL,
  default_points INTEGER NOT NULL DEFAULT 0, max_points INTEGER, applicable_projects VARCHAR(500),
  applicable_phases VARCHAR(500), allow_repeat INTEGER NOT NULL DEFAULT 0, count_in_period INTEGER NOT NULL DEFAULT 1,
  count_in_available INTEGER NOT NULL DEFAULT 1, need_approval INTEGER NOT NULL DEFAULT 0,
  description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS rule_texts (
  id BIGSERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL, content TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, description TEXT, image_url TEXT,
  points_required INTEGER NOT NULL, total_stock INTEGER NOT NULL DEFAULT 0, available_stock INTEGER NOT NULL DEFAULT 0,
  locked_stock INTEGER NOT NULL DEFAULT 0, on_site_stock INTEGER NOT NULL DEFAULT 0, limit_per_person INTEGER,
  is_limited INTEGER NOT NULL DEFAULT 0, on_sale_time TIMESTAMPTZ, off_sale_time TIMESTAMPTZ,
  product_status VARCHAR(20) NOT NULL DEFAULT '未上架', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS redemptions (
  id BIGSERIAL PRIMARY KEY, student_id BIGINT NOT NULL REFERENCES users(id), product_id BIGINT NOT NULL REFERENCES products(id),
  points_spent INTEGER NOT NULL, status VARCHAR(20) NOT NULL DEFAULT '待审核', locked_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ, shipped_at TIMESTAMPTZ, received_at TIMESTAMPTZ, express_company VARCHAR(100),
  tracking_number VARCHAR(100), pickup_method VARCHAR(50), reject_reason TEXT, address_snapshot TEXT, remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS prize_awards (
  id BIGSERIAL PRIMARY KEY, student_id BIGINT NOT NULL REFERENCES users(id), product_id BIGINT NOT NULL REFERENCES products(id),
  phase_id BIGINT REFERENCES phases(id) ON DELETE SET NULL, group_id BIGINT REFERENCES groups(id) ON DELETE SET NULL,
  award_type VARCHAR(20) NOT NULL, points_deducted INTEGER NOT NULL DEFAULT 0,
  created_by BIGINT NOT NULL REFERENCES users(id), description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS operation_logs (
  id BIGSERIAL PRIMARY KEY, admin_id BIGINT NOT NULL REFERENCES users(id), action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NOT NULL, target_id BIGINT, detail TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL, content TEXT, is_read INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS enrollments_project_idx ON project_enrollments(project_id);
CREATE INDEX IF NOT EXISTS points_student_idx ON points(student_id);
CREATE INDEX IF NOT EXISTS points_project_idx ON points(project_id);
CREATE INDEX IF NOT EXISTS redemptions_student_idx ON redemptions(student_id);
