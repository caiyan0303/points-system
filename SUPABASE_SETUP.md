# Supabase 数据库接入

本项目已支持让本地 FastAPI 和 Netlify Functions 共用同一个 Supabase PostgreSQL 数据库。浏览器端不会直接持有数据库密码，所有读写仍通过项目自己的 API 完成。

## 需要准备

1. 在 Supabase 创建一个空项目。
2. 在项目顶部点击 **Connect**，复制数据库连接串：
   - 本地 FastAPI 和一次性数据迁移使用 **Session pooler（端口 5432）**。
   - Netlify Functions 使用 **Transaction pooler（端口 6543）**。
3. 不要把连接串、数据库密码或 `service_role` 密钥写进 GitHub。

官方连接方式说明：https://supabase.com/docs/guides/database/connecting-to-postgres

## 迁移本地数据

在项目根目录创建 `.env`，写入 Session pooler 连接串，然后执行迁移：

```powershell
Copy-Item .env.example .env
# 编辑 .env 中的 SUPABASE_DB_URL 后执行：
backend\.venv\Scripts\python.exe backend\migrate_sqlite_to_supabase.py
```

迁移工具会先创建表，再复制本地 SQLite 的年度、项目、学员、小组、阶段、积分、商品和兑换数据，并逐表输出数量。为避免误覆盖，只允许迁移到没有业务数据的新 Supabase 项目。

## 本地连接 Supabase

本地后端会自动读取项目根目录的 `.env`。`.env` 已加入忽略规则，不会提交到 GitHub。

```text
SUPABASE_DB_URL=postgresql://postgres.PROJECT_REF:数据库密码@aws-0-REGION.pooler.supabase.com:5432/postgres
```

启动 FastAPI 后访问 `/api/health/database`，返回 `provider: supabase-postgresql` 即连接成功。

## Netlify 连接 Supabase

在 Netlify 项目的环境变量中新增：

- `SUPABASE_DB_URL`：Transaction pooler URL（端口 6543）
- `JWT_SECRET`：足够长的随机字符串

重新部署后，Netlify Function 会优先连接 Supabase；没有配置该变量时仍回退到原来的 Netlify Database。

## 安全设置

数据库迁移 `0004_supabase_security.sql` 会为业务表启用 RLS，阻止通过 Supabase 公共 Data API 直接读取学员与积分数据。后端使用受信任的数据库连接执行操作，因此现有登录和权限逻辑保持不变。
