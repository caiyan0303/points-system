import { getDatabase } from '@netlify/database'
import { getStore } from '@netlify/blobs'
import { createHmac, pbkdf2Sync, timingSafeEqual, randomBytes } from 'node:crypto'

const database = getDatabase()
const JWT_SECRET = process.env.JWT_SECRET || 'local-only-change-before-production'

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})
const rows = async (text, params = []) => {
  const result = await database.pool.query(text, params)
  return result.rows || result
}
const one = async (text, params = []) => (await rows(text, params))[0] || null
const body = async (request) => {
  try { return await request.json() } catch { return {} }
}
const b64 = (value) => Buffer.from(value).toString('base64url')
const signToken = (user) => {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64(JSON.stringify({ user_id: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + 86400 }))
  const signature = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}
const verifyToken = (token) => {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const expected = createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url')
  if (expected.length !== parts[2].length || !timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  return payload.exp > Date.now() / 1000 ? payload : null
}
const verifyPassword = (plain, encoded) => {
  try {
    const [saltHex, digestHex] = encoded.split(':')
    const actual = pbkdf2Sync(plain, Buffer.from(saltHex, 'hex'), 100000, 32, 'sha256')
    const expected = Buffer.from(digestHex, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch { return false }
}
const hashPassword = (plain) => {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${pbkdf2Sync(plain, salt, 100000, 32, 'sha256').toString('hex')}`
}
const currentUser = async (request, role) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const payload = verifyToken(token)
  if (!payload) return null
  const user = await one('SELECT * FROM users WHERE id = $1', [payload.user_id])
  if (!user || (role && user.role !== role)) return null
  return user
}
const requireUser = async (request, role) => {
  const user = await currentUser(request, role)
  return user || json({ detail: role === 'admin' ? '需要管理员权限' : '请先登录' }, role ? 403 : 401)
}
const numberOrNull = (value) => value === '' || value == null ? null : Number(value)
const isoOrNull = (value) => value || null
const intFlag = (value, fallback = 0) => value == null ? fallback : (value ? 1 : 0)
const phaseStatusFor = (phase) => {
  if (phase.status === '已归档') return phase.status
  if (!phase.start_date || !phase.end_date) return phase.status || '待开放'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
  const start = new Date(phase.start_date).toISOString().slice(0, 10)
  const end = new Date(phase.end_date).toISOString().slice(0, 10)
  if (today < start) return '待开放'
  if (today <= end) return '进行中'
  return '已关闭'
}

const phaseSummary = async (phase) => {
  const status = phaseStatusFor(phase)
  if (status !== phase.status) {
    await rows('UPDATE phases SET status=$1 WHERE id=$2', [status, phase.id])
  }
  const stats = await one(`SELECT
    COUNT(DISTINCT pp.student_id)::int AS participant_count,
    (SELECT COUNT(*)::int FROM phase_groups pg WHERE pg.phase_id=$1) AS group_count,
    COALESCE((SELECT SUM(pt.points)::int FROM points pt WHERE pt.phase_id=$1 AND pt.status IN ('有效','active')),0) AS total_points
    FROM phase_participants pp WHERE pp.phase_id=$1`, [phase.id])
  return {
    ...phase,
    status,
    participant_count: Number(stats?.participant_count || 0),
    group_count: Number(stats?.group_count || 0),
    total_points: Number(stats?.total_points || 0),
  }
}

async function authRoutes(request, pathname) {
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const input = await body(request)
    if (process.env.NETLIFY && !process.env.JWT_SECRET) {
      return json({ detail: '站点尚未配置登录密钥，请联系管理员' }, 503)
    }
    let user = await one(
      'SELECT * FROM users WHERE (username = $1 OR real_name = $1 OR email = $1) AND ($2::text IS NULL OR role = $2) ORDER BY id LIMIT 1',
      [input.username, input.role || null],
    )
    const matchesConfiguredAdmin = input.role === 'admin' &&
      process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD &&
      input.username === process.env.ADMIN_USERNAME && input.password === process.env.ADMIN_PASSWORD
    if (matchesConfiguredAdmin) {
      user = await one(`INSERT INTO users(username,password_hash,role,real_name,account_status,is_active)
        VALUES($1,$2,'admin','系统管理员','启用',1)
        ON CONFLICT(username) DO UPDATE SET
          password_hash=EXCLUDED.password_hash,
          role='admin',
          real_name=EXCLUDED.real_name,
          account_status='启用',
          is_active=1
        RETURNING *`,
        [process.env.ADMIN_USERNAME, hashPassword(process.env.ADMIN_PASSWORD)])
    }
    if (!user) return json({ detail: '账号不存在' }, 401)
    if (user.role === 'admin' && !verifyPassword(input.password || '', user.password_hash)) {
      return json({ detail: '管理员账号或密码错误' }, 401)
    }
    if (user.account_status === '终止' || !user.is_active) return json({ detail: '账号已被禁用' }, 403)
    return json({ access_token: signToken(user), token_type: 'bearer', role: user.role, real_name: user.real_name, user_id: user.id })
  }
  if (pathname === '/api/auth/me' && request.method === 'GET') {
    const user = await requireUser(request)
    if (user instanceof Response) return user
    const { password_hash, ...safeUser } = user
    return json(safeUser)
  }
  return null
}

async function commonRoutes(request, pathname) {
  if (pathname === '/api/common/years' && request.method === 'GET') {
    return json(await rows('SELECT * FROM academic_years ORDER BY name DESC'))
  }
  if (pathname === '/api/common/projects' && request.method === 'GET') {
    return json(await rows('SELECT * FROM training_projects ORDER BY year_id DESC, id DESC'))
  }
  if (pathname === '/api/common/projects/manage' && request.method === 'GET') {
    const projects = await rows(`SELECT p.*, y.name AS year_name,
      (SELECT COUNT(*)::int FROM phases ph WHERE ph.project_id=p.id) AS phase_count,
      (SELECT COUNT(*)::int FROM project_enrollments pe WHERE pe.project_id=p.id) AS student_count
      FROM training_projects p JOIN academic_years y ON y.id=p.year_id ORDER BY p.year_id DESC,p.id DESC`)
    return json(projects)
  }
  if (pathname === '/api/common/projects' && request.method === 'POST') {
    const admin = await requireUser(request, 'admin'); if (admin instanceof Response) return admin
    const input = await body(request)
    let yearId = numberOrNull(input.year_id)
    if (!yearId && input.year_name) {
      const year = await one('INSERT INTO academic_years(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id', [input.year_name])
      yearId = year.id
    }
    if (!yearId) return json({ detail: '请选择年度' }, 400)
    const created = await one(`INSERT INTO training_projects(name,year_id,start_date,end_date,description)
      VALUES($1,$2,$3,$4,$5) RETURNING *`, [input.name, yearId, isoOrNull(input.start_date), isoOrNull(input.end_date), input.description || null])
    return json(created, 201)
  }
  const projectMatch = pathname.match(/^\/api\/common\/projects\/(\d+)(?:\/(archive|activate))?$/)
  if (projectMatch && request.method === 'PUT') {
    const admin = await requireUser(request, 'admin'); if (admin instanceof Response) return admin
    const id = Number(projectMatch[1]); const action = projectMatch[2]
    if (action) {
      const status = action === 'archive' ? 'archived' : 'active'
      return json(await one('UPDATE training_projects SET status=$1 WHERE id=$2 RETURNING *', [status, id]))
    }
    const input = await body(request)
    const updated = await one(`UPDATE training_projects SET name=COALESCE($1,name),year_id=COALESCE($2,year_id),
      start_date=$3,end_date=$4,description=$5 WHERE id=$6 RETURNING *`,
      [input.name || null, numberOrNull(input.year_id), isoOrNull(input.start_date), isoOrNull(input.end_date), input.description || null, id])
    return json(updated)
  }
  return null
}

async function adminCoreRoutes(request, pathname, url) {
  const admin = await requireUser(request, 'admin'); if (admin instanceof Response) return admin
  if (pathname === '/api/admin/dashboard' && request.method === 'GET') {
    const totalStudents = Number((await one("SELECT COUNT(*)::int AS count FROM users WHERE role='student'")).count)
    const activeStudents = Number((await one("SELECT COUNT(*)::int AS count FROM users WHERE role='student' AND is_active=1 AND account_status<>'终止'")).count)
    const currentYear = await one("SELECT * FROM academic_years WHERE status IN ('active','进行中') ORDER BY id DESC LIMIT 1")
    const currentProject = currentYear ? await one("SELECT * FROM training_projects WHERE year_id=$1 AND status IN ('active','进行中') ORDER BY id DESC LIMIT 1",[currentYear.id]) : null
    const currentPhase = currentProject ? await one("SELECT * FROM phases WHERE project_id=$1 AND status IN ('in_progress','进行中') ORDER BY id DESC LIMIT 1",[currentProject.id]) : null
    const periodPoints = currentProject ? Number((await one("SELECT COALESCE(SUM(points),0)::int AS total FROM points WHERE project_id=$1 AND status IN ('有效','active')",[currentProject.id])).total) : 0
    const availablePoints = Number((await one(`SELECT COALESCE(SUM(earned-spent),0)::int AS total FROM (
      SELECT u.id,COALESCE((SELECT SUM(p.points) FROM points p WHERE p.student_id=u.id AND p.status IN ('有效','active')),0) AS earned,
      COALESCE((SELECT SUM(r.points_spent) FROM redemptions r WHERE r.student_id=u.id AND r.status NOT IN ('已拒绝','已取消')),0) AS spent
      FROM users u WHERE u.role='student') totals`)).total)
    const pendingRedemptions = Number((await one("SELECT COUNT(*)::int AS count FROM redemptions WHERE status IN ('待审核','pending')")).count)
    const completedRedemptions = Number((await one("SELECT COUNT(*)::int AS count FROM redemptions WHERE status IN ('已领取','已完成','received','completed')")).count)
    const lowStockProducts = Number((await one("SELECT COUNT(*)::int AS count FROM products WHERE product_status IN ('即将售罄','low_stock')")).count)
    const phaseOverview = await rows(`SELECT ph.id,ph.name,ph.status,ph.start_date,ph.end_date,
      (SELECT COUNT(DISTINCT student_id)::int FROM phase_participants pp WHERE pp.phase_id=ph.id) AS participant_count,
      (SELECT COUNT(*)::int FROM phase_groups pg WHERE pg.phase_id=ph.id) AS group_count,
      COALESCE((SELECT SUM(points)::int FROM points pt WHERE pt.phase_id=ph.id AND pt.status IN ('有效','active')),0) AS total_points
      FROM phases ph ORDER BY ph.id DESC`)
    return json({
      total_students:totalStudents,active_students:activeStudents,terminated_students:totalStudents-activeStudents,
      current_year:currentYear?.name||'',current_project:currentProject?.name||'',current_phase:currentPhase?.name||'',
      current_phase_status:currentPhase?.status||'',period_points:periodPoints,available_points_total:Math.max(availablePoints,0),
      pending_redemptions:pendingRedemptions,completed_redemptions:completedRedemptions,low_stock_products:lowStockProducts,
      phase_overview:phaseOverview,top_rankings:[],
    })
  }
  if (pathname === '/api/admin/phases' && request.method === 'GET') {
    const yearId = numberOrNull(url.searchParams.get('year_id'))
    const projectId = numberOrNull(url.searchParams.get('project_id'))
    const phases = await rows(`SELECT ph.*,y.name AS year_name,p.name AS project_name
      FROM phases ph
      LEFT JOIN academic_years y ON y.id=ph.year_id
      LEFT JOIN training_projects p ON p.id=ph.project_id
      WHERE ($1::bigint IS NULL OR ph.year_id=$1) AND ($2::bigint IS NULL OR ph.project_id=$2)
      ORDER BY ph.id DESC`, [yearId, projectId])
    return json(await Promise.all(phases.map(phaseSummary)))
  }
  if (pathname === '/api/admin/phases' && request.method === 'POST') {
    const input = await body(request)
    const name = String(input.name || '').trim()
    const yearId = numberOrNull(input.year_id)
    const projectId = numberOrNull(input.project_id)
    const startDate = isoOrNull(input.start_date)
    const endDate = isoOrNull(input.end_date)
    if (!name || !yearId || !projectId) return json({detail:'请填写阶段名称、年度和培训项目'},400)
    if (!startDate || !endDate) return json({detail:'请设置阶段开始和结束日期'},400)
    if (startDate > endDate) return json({detail:'阶段结束日期不能早于开始日期'},400)
    const project = await one('SELECT * FROM training_projects WHERE id=$1 AND year_id=$2',[projectId,yearId])
    if (!project) return json({detail:'培训项目不存在，或项目与年度不匹配'},404)
    const projectStart = project.start_date ? new Date(project.start_date).toISOString().slice(0,10) : null
    const projectEnd = project.end_date ? new Date(project.end_date).toISOString().slice(0,10) : null
    if (projectStart && startDate < projectStart) return json({detail:'阶段开始日期不能早于项目开始日期'},400)
    if (projectEnd && endDate > projectEnd) return json({detail:'阶段结束日期不能晚于项目结束日期'},400)
    const overlap = await one(`SELECT name FROM phases WHERE project_id=$1 AND status<>'已归档'
      AND start_date::date<=$2::date AND end_date::date>=$3::date LIMIT 1`,[projectId,endDate,startDate])
    if (overlap) return json({detail:`阶段时间与“${overlap.name}”重叠`},400)
    const created = await one(`INSERT INTO phases(name,year_id,project_id,start_date,end_date,description,status,
      allow_ranking,allow_excellent,excellent_count,prize_description)
      VALUES($1,$2,$3,$4,$5,$6,'待开放',$7,$8,$9,$10) RETURNING *`,[
      name,yearId,projectId,startDate,endDate,input.description||null,intFlag(input.allow_ranking,1),
      intFlag(input.allow_excellent),Number(input.excellent_count||0),input.prize_description||null,
    ])
    return json(await phaseSummary({...created,year_name:(await one('SELECT name FROM academic_years WHERE id=$1',[yearId]))?.name||'',project_name:project.name}),201)
  }
  const phaseMatch = pathname.match(/^\/api\/admin\/phases\/(\d+)(?:\/(archive|close|excellent))?$/)
  if (phaseMatch) {
    const phaseId = Number(phaseMatch[1])
    const action = phaseMatch[2]
    const phase = await one(`SELECT ph.*,y.name AS year_name,p.name AS project_name FROM phases ph
      LEFT JOIN academic_years y ON y.id=ph.year_id LEFT JOIN training_projects p ON p.id=ph.project_id WHERE ph.id=$1`,[phaseId])
    if (!phase) return json({detail:'阶段不存在'},404)
    if (!action && request.method === 'GET') {
      const summary = await phaseSummary(phase)
      const participants = await rows(`SELECT u.id AS student_id,u.real_name AS student_name,u.department,g.name AS group_name,
        pp.is_excellent,pp.prize_given,COALESCE(SUM(pt.points) FILTER (WHERE pt.status IN ('有效','active')),0)::int AS total_points
        FROM phase_participants pp JOIN users u ON u.id=pp.student_id LEFT JOIN groups g ON g.id=pp.group_id
        LEFT JOIN points pt ON pt.phase_id=pp.phase_id AND pt.student_id=pp.student_id
        WHERE pp.phase_id=$1 GROUP BY u.id,u.real_name,u.department,g.name,pp.is_excellent,pp.prize_given ORDER BY u.id`,[phaseId])
      const phaseGroups = await rows(`SELECT g.id AS group_id,g.name AS group_name,COUNT(DISTINCT gm.student_id)::int AS member_count,
        COALESCE(SUM(pt.points) FILTER (WHERE pt.status IN ('有效','active')),0)::int AS total_points
        FROM phase_groups pg JOIN groups g ON g.id=pg.group_id LEFT JOIN group_members gm ON gm.group_id=g.id
        LEFT JOIN points pt ON pt.phase_id=pg.phase_id AND pt.student_id=gm.student_id
        WHERE pg.phase_id=$1 GROUP BY g.id,g.name ORDER BY g.id`,[phaseId])
      const rankings = [...participants].sort((a,b)=>Number(b.total_points)-Number(a.total_points)).map((item,index)=>({...item,rank:index+1}))
      const groupRankings = phaseGroups.map(group=>({...group,avg_points:group.member_count ? Math.round(Number(group.total_points)*100/group.member_count)/100 : 0}))
        .sort((a,b)=>b.avg_points-a.avg_points).map((item,index)=>({...item,rank:index+1}))
      return json({...summary,participants,phase_groups:phaseGroups,rankings,group_rankings:groupRankings,
        excellent_members:participants.filter(item=>Number(item.is_excellent)===1)})
    }
    if (!action && request.method === 'PUT') {
      const input = await body(request)
      const merged = {...phase,...input}
      const startDate = isoOrNull(merged.start_date); const endDate = isoOrNull(merged.end_date)
      if (!startDate || !endDate) return json({detail:'请设置阶段开始和结束日期'},400)
      if (startDate > endDate) return json({detail:'阶段结束日期不能早于开始日期'},400)
      const overlap = await one(`SELECT name FROM phases WHERE id<>$1 AND project_id=$2 AND status<>'已归档'
        AND start_date::date<=$3::date AND end_date::date>=$4::date LIMIT 1`,[phaseId,phase.project_id,endDate,startDate])
      if (overlap) return json({detail:`阶段时间与“${overlap.name}”重叠`},400)
      const updated = await one(`UPDATE phases SET name=$1,start_date=$2,end_date=$3,description=$4,allow_ranking=$5,
        allow_excellent=$6,excellent_count=$7,prize_description=$8 WHERE id=$9 RETURNING *`,[
        String(merged.name||'').trim(),startDate,endDate,merged.description||null,intFlag(merged.allow_ranking,1),
        intFlag(merged.allow_excellent),Number(merged.excellent_count||0),merged.prize_description||null,phaseId,
      ])
      return json(await phaseSummary({...updated,year_name:phase.year_name,project_name:phase.project_name}))
    }
    if (action === 'archive' && request.method === 'PUT') {
      await rows("UPDATE phases SET status='已归档' WHERE id=$1",[phaseId])
      return json({message:`阶段“${phase.name}”已归档`})
    }
    if (action === 'close' && request.method === 'PUT') {
      await rows("UPDATE phases SET status='已关闭' WHERE id=$1",[phaseId])
      return json({message:`阶段“${phase.name}”已关闭`})
    }
    if (action === 'excellent' && request.method === 'POST') {
      if (!Number(phase.allow_excellent)) return json({detail:'该阶段不允许评选优秀成员'},400)
      const input = await body(request); const studentIds = Array.isArray(input.student_ids) ? input.student_ids.map(Number) : []
      if (studentIds.length > Number(phase.excellent_count||0)) return json({detail:`最多可选择 ${phase.excellent_count||0} 名优秀成员`},400)
      await rows('UPDATE phase_participants SET is_excellent=0 WHERE phase_id=$1',[phaseId])
      if (studentIds.length) await rows('UPDATE phase_participants SET is_excellent=1 WHERE phase_id=$1 AND student_id=ANY($2::bigint[])',[phaseId,studentIds])
      return json({message:'优秀成员已更新'})
    }
    if (!action && request.method === 'DELETE') {
      await rows('UPDATE points SET phase_id=NULL WHERE phase_id=$1',[phaseId])
      await rows('UPDATE prize_awards SET phase_id=NULL WHERE phase_id=$1',[phaseId])
      await rows('DELETE FROM phases WHERE id=$1',[phaseId])
      return json({message:`阶段“${phase.name}”已删除`})
    }
  }
  if (pathname === '/api/admin/students' && request.method === 'GET') {
    const page = Math.max(1, Number(url.searchParams.get('page') || 1))
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') || 15)))
    const keyword = url.searchParams.get('keyword') || ''
    const projectId = numberOrNull(url.searchParams.get('project_id'))
    const yearId = numberOrNull(url.searchParams.get('year_id'))
    const values = [`%${keyword}%`, projectId, yearId, pageSize, (page - 1) * pageSize]
    const where = `u.role='student' AND ($1='' OR u.real_name ILIKE $1 OR u.username ILIKE $1 OR u.email ILIKE $1 OR u.system ILIKE $1 OR u.level1_dept ILIKE $1)
      AND ($2::bigint IS NULL OR EXISTS(SELECT 1 FROM project_enrollments pe WHERE pe.student_id=u.id AND pe.project_id=$2))
      AND ($3::bigint IS NULL OR EXISTS(SELECT 1 FROM project_enrollments pe WHERE pe.student_id=u.id AND pe.year_id=$3))`
    const total = Number((await one(`SELECT COUNT(*)::int AS total FROM users u WHERE ${where}`, values.slice(0, 3))).total)
    const items = await rows(`SELECT u.id,u.username,u.real_name,u.email,u.phone,u.address,u.department,u.system,u.level1_dept,
      COALESCE($2,u.project_id) AS project_id,COALESCE($3,u.year_id) AS year_id,u.employment_status,u.account_status,u.created_at,
      p.name AS project_name,y.name AS year_name,g.id AS group_id,g.name AS group_name,
      COALESCE((SELECT SUM(pt.points) FROM points pt WHERE pt.student_id=u.id AND pt.status='有效'),0)::int AS total_earned,
      (COALESCE((SELECT SUM(pt.points) FROM points pt WHERE pt.student_id=u.id AND pt.status='有效'),0)-
       COALESCE((SELECT SUM(r.points_spent) FROM redemptions r WHERE r.student_id=u.id AND r.status NOT IN ('已拒绝','已取消')),0))::int AS available_points
      FROM users u LEFT JOIN project_enrollments pe ON pe.student_id=u.id AND pe.project_id=COALESCE($2,u.project_id)
      LEFT JOIN training_projects p ON p.id=COALESCE($2,u.project_id) LEFT JOIN academic_years y ON y.id=COALESCE($3,u.year_id)
      LEFT JOIN groups g ON g.id=pe.group_id WHERE ${where} ORDER BY u.id DESC LIMIT $4 OFFSET $5`, values)
    return json({ items, total, page, page_size: pageSize, total_pages: Math.max(1, Math.ceil(total / pageSize)) })
  }
  if (pathname === '/api/admin/students' && request.method === 'POST') {
    const input = await body(request); const name = String(input.real_name || '').trim()
    if (!name) return json({ detail: '姓名不能为空' }, 400)
    if (await one('SELECT id FROM users WHERE username=$1', [name])) return json({ detail: `学员“${name}”已存在` }, 400)
    const projectId = numberOrNull(input.project_id)
    const yearId = numberOrNull(input.year_id)
    let groupId = numberOrNull(input.group_id)
    const groupName = String(input.group_name || '').trim()
    if (groupId && !projectId) return json({ detail:'请先选择培训项目，再选择所属小组' },400)
    if (groupId && !await one('SELECT id FROM groups WHERE id=$1 AND project_id=$2',[groupId,projectId])) {
      return json({ detail:'所选小组不存在或不属于该培训项目' },400)
    }
    if (!groupId && groupName) {
      if (!projectId) return json({ detail:'请先选择培训项目，再填写所属小组' },400)
      const existingGroup = await one('SELECT id FROM groups WHERE project_id=$1 AND name=$2',[projectId,groupName])
      if (existingGroup) groupId = existingGroup.id
      else groupId = (await one("INSERT INTO groups(name,year_id,project_id,status) VALUES($1,$2,$3,'active') RETURNING id",[groupName,yearId,projectId])).id
    }
    const passwordHash = hashPassword(randomBytes(24).toString('hex'))
    const user = await one(`INSERT INTO users(username,password_hash,role,real_name,email,phone,address,department,system,level1_dept,year_id,project_id,employment_status)
      VALUES($1,$2,'student',$1,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,username`,
      [name,passwordHash,input.email||null,input.phone||null,input.address||null,input.department||null,input.system||null,input.level1_dept||null,yearId,projectId,input.employment_status||'在职'])
    if (yearId && projectId) await rows('INSERT INTO project_enrollments(student_id,year_id,project_id,group_id,label) VALUES($1,$2,$3,$4,$5)', [user.id,yearId,projectId,groupId,'首次参加'])
    if (groupId) await rows('INSERT INTO group_members(group_id,student_id) VALUES($1,$2)',[groupId,user.id])
    return json({ message:`学员 ${name} 创建成功`, ...user }, 201)
  }
  const studentMatch = pathname.match(/^\/api\/admin\/students\/(\d+)$/)
  if (studentMatch && request.method === 'PUT') {
    const studentId = Number(studentMatch[1]); const input = await body(request)
    const old = await one("SELECT * FROM users WHERE id=$1 AND role='student'",[studentId])
    if (!old) return json({detail:'学员不存在'},404)
    const merged = {...old,...input}; const name = String(merged.real_name || '').trim()
    const projectId = numberOrNull(merged.project_id); const yearId = numberOrNull(merged.year_id)
    const groupChange = Object.hasOwn(input,'group_id') || Object.hasOwn(input,'group_name')
    let groupId = numberOrNull(input.group_id); const groupName = String(input.group_name || '').trim()
    if (groupChange && groupName) {
      if (!projectId) return json({detail:'请先选择培训项目，再填写所属小组'},400)
      const existingGroup = await one('SELECT id FROM groups WHERE project_id=$1 AND name=$2',[projectId,groupName])
      groupId = existingGroup?.id || (await one("INSERT INTO groups(name,year_id,project_id,status) VALUES($1,$2,$3,'active') RETURNING id",[groupName,yearId,projectId])).id
    }
    if (groupId && !await one('SELECT id FROM groups WHERE id=$1 AND project_id=$2',[groupId,projectId])) {
      return json({detail:'所选小组不存在或不属于该培训项目'},400)
    }
    if (yearId && projectId) {
      const conflict = await one('SELECT project_id FROM project_enrollments WHERE student_id=$1 AND year_id=$2 AND project_id<>$3',[studentId,yearId,projectId])
      if (conflict) return json({detail:'该学员本年度已参加其他项目，不能同时加入两个项目'},400)
    }
    const updated = await one(`UPDATE users SET username=$1,real_name=$1,email=$2,phone=$3,address=$4,department=$5,system=$6,
      level1_dept=$7,year_id=$8,project_id=$9,employment_status=$10,account_status=$11 WHERE id=$12 RETURNING id,username,real_name`,
      [name,merged.email||null,merged.phone||null,merged.address||null,merged.department||null,merged.system||null,merged.level1_dept||null,yearId,projectId,merged.employment_status||'在职',merged.account_status||'启用',studentId])
    if (yearId && projectId) await rows(`INSERT INTO project_enrollments(student_id,year_id,project_id,group_id,label)
      VALUES($1,$2,$3,$4,'首次参加') ON CONFLICT(student_id,project_id) DO UPDATE SET year_id=EXCLUDED.year_id,group_id=EXCLUDED.group_id`,
      [studentId,yearId,projectId,groupChange ? groupId : null])
    if (groupChange && projectId) {
      await rows('DELETE FROM group_members WHERE student_id=$1 AND group_id IN (SELECT id FROM groups WHERE project_id=$2)',[studentId,projectId])
      if (groupId) await rows('INSERT INTO group_members(group_id,student_id) VALUES($1,$2) ON CONFLICT(group_id,student_id) DO NOTHING',[groupId,studentId])
      await rows('UPDATE project_enrollments SET group_id=$1 WHERE student_id=$2 AND project_id=$3',[groupId,studentId,projectId])
    }
    return json({message:'学员信息已更新',...updated})
  }
  const groupMatch = pathname.match(/^\/api\/admin\/groups\/(\d+)$/)
  if (groupMatch && request.method === 'DELETE') {
    const groupId = Number(groupMatch[1])
    const group = await one('SELECT id,name FROM groups WHERE id=$1',[groupId])
    if (!group) return json({detail:'小组不存在或已删除'},404)
    const affected = Number((await one('SELECT COUNT(*)::int AS count FROM group_members WHERE group_id=$1',[groupId])).count)
    await rows('UPDATE project_enrollments SET group_id=NULL WHERE group_id=$1',[groupId])
    await rows('UPDATE phase_participants SET group_id=NULL WHERE group_id=$1',[groupId])
    await rows('UPDATE points SET group_id=NULL WHERE group_id=$1',[groupId])
    await rows('UPDATE prize_awards SET group_id=NULL WHERE group_id=$1',[groupId])
    await rows('DELETE FROM phase_groups WHERE group_id=$1',[groupId])
    await rows('DELETE FROM group_members WHERE group_id=$1',[groupId])
    await rows('DELETE FROM groups WHERE id=$1',[groupId])
    return json({message:`小组“${group.name}”已删除`,affected_members:affected})
  }
  if (pathname === '/api/admin/products' && request.method === 'GET') return json(await rows('SELECT * FROM products ORDER BY id DESC'))
  if (pathname === '/api/admin/products' && request.method === 'POST') {
    const input = await body(request)
    const product = await one(`INSERT INTO products(name,description,image_url,points_required,total_stock,available_stock,locked_stock,on_site_stock,limit_per_person,is_limited,on_sale_time,off_sale_time,product_status)
      VALUES($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [input.name,input.description||null,input.image_url||null,Number(input.points_required),Number(input.total_stock||0),Number(input.available_stock ?? input.total_stock ?? 0),Number(input.on_site_stock||0),numberOrNull(input.limit_per_person),Number(input.is_limited||0),isoOrNull(input.on_sale_time),isoOrNull(input.off_sale_time),input.product_status||'未上架'])
    return json(product, 201)
  }
  const productMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/)
  if (productMatch && request.method === 'PUT') {
    const input = await body(request); const id = Number(productMatch[1])
    const old = await one('SELECT * FROM products WHERE id=$1',[id]); if (!old) return json({detail:'商品不存在'},404)
    const merged = {...old,...input}
    return json(await one(`UPDATE products SET name=$1,description=$2,image_url=$3,points_required=$4,total_stock=$5,available_stock=$6,
      on_site_stock=$7,limit_per_person=$8,is_limited=$9,on_sale_time=$10,off_sale_time=$11,product_status=$12 WHERE id=$13 RETURNING *`,
      [merged.name,merged.description,merged.image_url,merged.points_required,merged.total_stock,merged.available_stock,merged.on_site_stock,merged.limit_per_person,merged.is_limited,merged.on_sale_time,merged.off_sale_time,merged.product_status,id]))
  }
  if (pathname === '/api/admin/products/upload-image' && request.method === 'POST') {
    const form = await request.formData(); const file = form.get('file')
    if (!file || typeof file.arrayBuffer !== 'function') return json({detail:'请选择图片'},400)
    const ext = String(file.name||'image.bin').split('.').pop().replace(/[^a-z0-9]/gi,'') || 'bin'
    const key = `${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`
    await getStore('product-images').set(key, new Uint8Array(await file.arrayBuffer()), { metadata:{ contentType:file.type||'application/octet-stream' } })
    return json({ image_url:`/api/files/${key}` })
  }
  return null
}

async function publicFiles(pathname) {
  const match = pathname.match(/^\/api\/files\/(.+)$/)
  if (!match) return null
  const key = decodeURIComponent(match[1]); const store = getStore('product-images')
  const data = await store.get(key, { type:'arrayBuffer' })
  if (!data) return new Response('Not found',{status:404})
  const ext = key.split('.').pop().toLowerCase(); const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'}
  return new Response(data,{headers:{'content-type':types[ext]||'application/octet-stream','cache-control':'public,max-age=31536000,immutable'}})
}

export default async (request) => {
  try {
    const url = new URL(request.url); const pathname = url.pathname
    if (pathname === '/api/health') return json({status:'ok',runtime:'netlify'})
    const fileResponse = await publicFiles(pathname); if (fileResponse) return fileResponse
    const authResponse = await authRoutes(request, pathname); if (authResponse) return authResponse
    const commonResponse = await commonRoutes(request, pathname); if (commonResponse) return commonResponse
    if (pathname.startsWith('/api/admin/')) {
      const response = await adminCoreRoutes(request, pathname, url); if (response) return response
    }
    if (pathname === '/api/student/products' && request.method === 'GET') {
      const student = await requireUser(request,'student'); if (student instanceof Response) return student
      return json(await rows("SELECT * FROM products WHERE product_status IN ('可兑换','即将售罄') ORDER BY id DESC"))
    }
    return json({detail:'该功能正在迁移到 Netlify 云端接口',path:pathname},501)
  } catch (error) {
    console.error(error)
    return json({detail:'云端接口处理失败'},500)
  }
}

export const config = { path: '/api/*' }
