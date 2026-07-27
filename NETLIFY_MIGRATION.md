# Netlify 云端改造

目标架构：GitHub 保存源代码并触发持续部署；Netlify 托管 React 前端和 Functions；Netlify Database 保存结构化业务数据；Netlify Blobs 保存商品图片。

## 已完成

- Netlify 构建与单页路由配置。
- PostgreSQL 全量数据表迁移文件，包含“同一学员同年度只能参加一个项目”的约束。
- Netlify Functions API 入口、JWT 登录兼容、管理员和学员权限校验。
- 年度、项目、学员基础查询与新增、商品查询与维护、商品图片云存储。
- SQLite 数据导出工具，正式切换前用于迁移现有数据。

## 下一阶段

- 迁移阶段、小组、积分、兑换、现场发放、年度汇总和操作日志的完整接口。
- 加入数据库导入程序和一次性管理员初始化。
- 使用 Netlify 本地开发环境进行端到端验证。
- 更换生产 JWT 密钥和管理员默认密码。
- GitHub 推送后创建 Netlify Deploy Preview，核对数据后再切换正式域名。

## 发布前必须配置

- `JWT_SECRET`：随机长字符串，不能使用示例值。
- `ADMIN_USERNAME`、`ADMIN_PASSWORD`：首次登录时自动创建云端管理员，必须使用私密强密码。
- Netlify Database：由项目首次部署或控制台创建。

当前 Python + SQLite 版本继续作为本地可用版本；在所有云端接口迁移完成之前，不切断本地后台。
