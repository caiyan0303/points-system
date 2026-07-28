ALTER TABLE points ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) NOT NULL DEFAULT '个人';
ALTER TABLE points ADD COLUMN IF NOT EXISTS item_name VARCHAR(200);
ALTER TABLE points ADD COLUMN IF NOT EXISTS task_key VARCHAR(300);
ALTER TABLE points ADD COLUMN IF NOT EXISTS interaction_no INTEGER;
ALTER TABLE points ADD COLUMN IF NOT EXISTS source_note VARCHAR(200);

UPDATE points
SET item_name=COALESCE(NULLIF(BTRIM(description),''), category),
    task_key=LOWER(REGEXP_REPLACE(COALESCE(NULLIF(BTRIM(description),''), category), '\s+', ' ', 'g'))
WHERE item_name IS NULL OR task_key IS NULL;

CREATE TABLE IF NOT EXISTS team_points (
  id BIGSERIAL PRIMARY KEY,
  record_number VARCHAR(50) NOT NULL UNIQUE,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  admin_id BIGINT NOT NULL REFERENCES users(id),
  year_id BIGINT REFERENCES academic_years(id),
  project_id BIGINT NOT NULL REFERENCES training_projects(id) ON DELETE CASCADE,
  phase_id BIGINT REFERENCES phases(id) ON DELETE SET NULL,
  points INTEGER NOT NULL,
  category VARCHAR(50) NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  task_key VARCHAR(300) NOT NULL,
  data_source VARCHAR(30) NOT NULL DEFAULT '单个录入',
  source_note VARCHAR(200),
  remark TEXT,
  status VARCHAR(10) NOT NULL DEFAULT '有效',
  obtained_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_points_group_idx ON team_points(group_id);
CREATE INDEX IF NOT EXISTS team_points_project_idx ON team_points(project_id);
CREATE INDEX IF NOT EXISTS team_points_phase_idx ON team_points(phase_id);
CREATE UNIQUE INDEX IF NOT EXISTS team_points_unique_task_idx
  ON team_points(group_id, project_id, COALESCE(phase_id, 0), category, task_key)
  WHERE status IN ('有效', 'active') AND category <> '特殊调整';

ALTER TABLE point_rules ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) NOT NULL DEFAULT '个人';
ALTER TABLE point_rules ADD COLUMN IF NOT EXISTS scoring_standard TEXT;

DELETE FROM point_rules
WHERE category IN ('线上考试','问卷反馈','课堂任务','实践任务','成果转化','团队共创','团队贡献','项目贡献');

INSERT INTO point_rules(category, rule_name, default_points, max_points, allow_repeat, count_in_period, count_in_available, description, account_type, scoring_standard)
SELECT v.category, v.rule_name, v.default_points, v.max_points, v.allow_repeat, 1, v.available, v.description, v.account_type, v.scoring_standard
FROM (VALUES
  ('线上学习','完成线上课程',10,15,0,1,'每门课程每人只计1次','个人','发布后3天内15分；规定时间内10分；逾期5分；未完成0分'),
  ('学习输出','个人学习感悟',10,15,0,1,'每门课程每人只计1次；无效内容0分','个人','说明收获5分；结合管理场景10分；提出行动计划15分'),
  ('问卷及测评反馈','完成问卷或测评反馈',6,6,0,1,'每份问卷或反馈每人只计1次','个人','规定时间内完整填写6分；未完成0分'),
  ('线下出勤','参加线下集中培训',10,10,0,1,'每场培训每人只计1次','个人','全程参加10分；迟到或早退10分钟以内5分；其他0分'),
  ('课堂互动','有效回答或案例分享',1,20,1,1,'每人每场最多2次；按扑克牌牌面计分','个人','A=1，2—10按点数，J=11，Q=12，K=13，小王=15，大王=20'),
  ('结营任务','完成个人结营任务',15,15,0,1,'每项结营任务每人只计1次','个人','按时15分；截止后2个工作日内5分；超期0分'),
  ('小组长职责','阶段履职',10,10,0,1,'每位小组长每阶段只计1次','个人','实际完成组织、提醒、沟通推动及成果汇总，10分/阶段'),
  ('特殊调整','个人积分调整',0,NULL,1,1,'必须填写调整原因','个人','按实际情况补录、撤销或错误修正'),
  ('线上案例沟通','提交小组案例沟通记录',10,20,0,0,'按有效提交时间排序，每项任务每组只计1次','团队','前2名20分；第3—4名15分；后续按时10分；超时0分'),
  ('线上案例输出','提交模块小组案例',10,20,0,0,'按有效提交时间排序，每项任务每组只计1次','团队','前2名20分；第3—4名15分；后续按时10分；超时0分'),
  ('阶段案例评优','阶段案例第一名',20,20,0,0,'每阶段第一名小组计20分','团队','三个阶段分别评选，最高60分'),
  ('沙盘共创','沙盘活动排名',10,50,0,0,'每次沙盘活动每组只计1次','团队','第1名50分；第2名40分；第3名30分；第4名20分；第5名10分'),
  ('特殊调整','团队积分调整',0,NULL,1,0,'必须填写调整原因','团队','按实际情况补录、撤销或错误修正')
) AS v(category,rule_name,default_points,max_points,allow_repeat,available,description,account_type,scoring_standard)
WHERE NOT EXISTS (
  SELECT 1 FROM point_rules r WHERE r.account_type=v.account_type AND r.category=v.category AND r.rule_name=v.rule_name
);

INSERT INTO rule_texts(title, content)
SELECT '优才计划积分规则（2026更新版）', '个人积分与团队积分分开记录。个人累计积分用于个人排名及团队最终得分计算；可兑换积分在兑换后扣减，但个人累计积分和排名不减少。团队积分只进入小组账户，不分配给个人。团队最终得分＝小组成员个人累计积分合计＋团队积分。线上考试、开放题为必做任务但不计积分。同一任务、同一人员或小组不得重复计分。课堂互动按扑克牌计分：A=1，2—10按点数，J=11，Q=12，K=13，小王=15，大王=20；建议每人每场最多2次。特殊调整必须填写原因。每笔记录必须包含阶段、计分对象、积分事项、积分值、获得时间、数据来源及备注。'
WHERE NOT EXISTS (SELECT 1 FROM rule_texts WHERE title='优才计划积分规则（2026更新版）');
