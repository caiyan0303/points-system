import { getDatabase } from '@netlify/database'
import { getStore } from '@netlify/blobs'
import { createHmac, pbkdf2Sync, timingSafeEqual, randomBytes } from 'node:crypto'

const runtimeEnv = (name) => (
  typeof Netlify !== 'undefined' ? Netlify.env.get(name) : process.env[name]
)
const supabaseDatabaseUrl = runtimeEnv('SUPABASE_DB_URL')
const database = getDatabase(supabaseDatabaseUrl ? { connectionString: supabaseDatabaseUrl } : undefined)
const JWT_SECRET = runtimeEnv('JWT_SECRET') || 'local-only-change-before-production'

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

const syncProjectPhaseAssociations = async (projectId) => {
  if (!projectId) return
  await rows(`INSERT INTO phase_groups(phase_id,group_id)
    SELECT ph.id,g.id FROM phases ph JOIN groups g ON g.project_id=ph.project_id
    WHERE ph.project_id=$1 AND NOT EXISTS (
      SELECT 1 FROM phase_groups pg WHERE pg.phase_id=ph.id AND pg.group_id=g.id
    )`, [projectId])
  await rows(`INSERT INTO phase_participants(phase_id,student_id,group_id)
    SELECT ph.id,pe.student_id,pe.group_id FROM phases ph
    JOIN project_enrollments pe ON pe.project_id=ph.project_id
    WHERE ph.project_id=$1 AND NOT EXISTS (
      SELECT 1 FROM phase_participants pp WHERE pp.phase_id=ph.id AND pp.student_id=pe.student_id
    )`, [projectId])
  await rows(`UPDATE phase_participants pp SET group_id=pe.group_id
    FROM phases ph,project_enrollments pe
    WHERE pp.phase_id=ph.id AND pe.project_id=ph.project_id AND pe.student_id=pp.student_id
      AND ph.project_id=$1 AND pp.group_id IS DISTINCT FROM pe.group_id`, [projectId])
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
  if (pathname === '/api/common/years' && request.method === 'POST') {
    const admin=await requireUser(request,'admin');if(admin instanceof Response)return admin
    const input=await body(request);const name=String(input.name||'').trim();if(!name)return json({detail:'年度不能为空'},400)
    return json(await one('INSERT INTO academic_years(name,status) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET status=EXCLUDED.status RETURNING *',[name,input.status||'active']),201)
  }
  const yearMatch=pathname.match(/^\/api\/common\/years\/(\d+)$/)
  if(yearMatch&&request.method==='GET'){
    const id=Number(yearMatch[1]),year=await one('SELECT * FROM academic_years WHERE id=$1',[id]);if(!year)return json({detail:'年度不存在'},404)
    return json({...year,projects:await rows('SELECT * FROM training_projects WHERE year_id=$1 ORDER BY id',[id])})
  }
  if(yearMatch&&request.method==='PUT'){
    const admin=await requireUser(request,'admin');if(admin instanceof Response)return admin
    const input=await body(request);return json(await one('UPDATE academic_years SET name=COALESCE($1,name),status=COALESCE($2,status) WHERE id=$3 RETURNING *',[input.name||null,input.status||null,Number(yearMatch[1])]))
  }
  if(pathname==='/api/common/phases/categories'&&request.method==='GET')return json(['线上学习','学习输出','问卷及测评反馈','线下出勤','课堂互动','结营任务','小组长职责','特殊调整'])
  if (pathname === '/api/common/projects' && request.method === 'GET') {
    return json(await rows('SELECT * FROM training_projects ORDER BY year_id DESC, id DESC'))
  }
  if (pathname === '/api/common/projects/manage' && request.method === 'GET') {
    const projects = await rows(`SELECT p.*, y.name AS year_name,
      (SELECT COUNT(*)::int FROM phases ph WHERE ph.project_id=p.id) AS phase_count,
      (SELECT COUNT(*)::int FROM project_enrollments pe WHERE pe.project_id=p.id) AS student_count,
      (SELECT COUNT(*)::int FROM groups g WHERE g.project_id=p.id) AS group_count,
      COALESCE((SELECT SUM(pt.points)::int FROM points pt WHERE pt.project_id=p.id AND pt.status IN ('有效','active')),0) AS total_points
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
  if (projectMatch && !projectMatch[2] && request.method === 'DELETE') {
    const admin = await requireUser(request, 'admin'); if (admin instanceof Response) return admin
    const id = Number(projectMatch[1])
    const project = await one('SELECT id,name FROM training_projects WHERE id=$1',[id])
    if (!project) return json({detail:'培训项目不存在'},404)
    const enrollments = Number((await one('SELECT COUNT(*)::int AS count FROM project_enrollments WHERE project_id=$1',[id])).count)
    const pointCount = Number((await one('SELECT COUNT(*)::int AS count FROM points WHERE project_id=$1',[id])).count)
    if (enrollments || pointCount) return json({detail:'该项目已有学员或积分数据，请先归档，不可直接删除'},400)
    await rows('DELETE FROM phases WHERE project_id=$1',[id])
    await rows('DELETE FROM groups WHERE project_id=$1',[id])
    await rows('DELETE FROM training_projects WHERE id=$1',[id])
    return json({message:`项目“${project.name}”已删除`})
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
      (SELECT COUNT(*)::int FROM groups g WHERE g.project_id=ph.project_id) AS group_count,
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
    for (const id of [...new Set(phases.map(phase=>Number(phase.project_id)).filter(Boolean))]) {
      await syncProjectPhaseAssociations(id)
    }
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
    await syncProjectPhaseAssociations(projectId)
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
      await syncProjectPhaseAssociations(phase.project_id)
      const summary = await phaseSummary(phase)
      const participants = await rows(`SELECT u.id AS student_id,u.real_name AS student_name,u.department,g.name AS group_name,
        pp.is_excellent,pp.prize_given,COALESCE(SUM(pt.points) FILTER (WHERE pt.status IN ('有效','active')),0)::int AS total_points
        FROM phase_participants pp JOIN users u ON u.id=pp.student_id LEFT JOIN groups g ON g.id=pp.group_id
        LEFT JOIN points pt ON pt.phase_id=pp.phase_id AND pt.student_id=pp.student_id
        WHERE pp.phase_id=$1 GROUP BY u.id,u.real_name,u.department,g.name,pp.is_excellent,pp.prize_given ORDER BY u.id`,[phaseId])
      const phaseGroups = await rows(`SELECT g.id AS group_id,g.name AS group_name,
        (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id=g.id) AS member_count,
        COALESCE((SELECT SUM(pt.points) FROM points pt JOIN group_members gm ON gm.student_id=pt.student_id WHERE gm.group_id=g.id AND pt.phase_id=$1 AND pt.status IN ('有效','active')),0)::int AS personal_points,
        COALESCE((SELECT SUM(tp.points) FROM team_points tp WHERE tp.group_id=g.id AND tp.phase_id=$1 AND tp.status IN ('有效','active')),0)::int AS team_points
        FROM phase_groups pg JOIN groups g ON g.id=pg.group_id WHERE pg.phase_id=$1 GROUP BY g.id,g.name ORDER BY g.id`,[phaseId])
      phaseGroups.forEach(group=>{group.total_points=Number(group.personal_points)+Number(group.team_points);group.final_score=group.total_points})
      const rankings = [...participants].sort((a,b)=>Number(b.total_points)-Number(a.total_points)).map((item,index)=>({...item,rank:index+1}))
      const groupRankings = phaseGroups.map(group=>({...group,avg_points:group.member_count ? Math.round(Number(group.total_points)*100/group.member_count)/100 : 0}))
        .sort((a,b)=>b.final_score-a.final_score).map((item,index)=>({...item,rank:index+1}))
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
    const where = `u.role='student' AND ($1='' OR u.real_name ILIKE $1 OR u.username ILIKE $1 OR u.email ILIKE $1 OR u.system ILIKE $1 OR u.level1_dept ILIKE $1 OR u.position ILIKE $1)
      AND ($2::bigint IS NULL OR EXISTS(SELECT 1 FROM project_enrollments pe WHERE pe.student_id=u.id AND pe.project_id=$2))
      AND ($3::bigint IS NULL OR EXISTS(SELECT 1 FROM project_enrollments pe WHERE pe.student_id=u.id AND pe.year_id=$3))`
    const total = Number((await one(`SELECT COUNT(*)::int AS total FROM users u WHERE ${where}`, values.slice(0, 3))).total)
    const items = await rows(`SELECT u.id,u.username,u.real_name,u.email,u.phone,u.address,u.department,u.system,u.level1_dept,u.position,
      COALESCE($2,u.project_id) AS project_id,COALESCE($3,u.year_id) AS year_id,u.employment_status,u.account_status,u.created_at,
      p.name AS project_name,y.name AS year_name,g.id AS group_id,g.name AS group_name,gm.role AS group_role,
      COALESCE((SELECT SUM(pt.points) FROM points pt WHERE pt.student_id=u.id AND ($2::bigint IS NULL OR pt.project_id=$2) AND pt.status IN ('有效','active')),0)::int AS period_points,
      COALESCE((SELECT SUM(pt.points) FROM points pt WHERE pt.student_id=u.id AND pt.status='有效'),0)::int AS total_earned,
      (COALESCE((SELECT SUM(pt.points) FROM points pt WHERE pt.student_id=u.id AND pt.status='有效'),0)-
       COALESCE((SELECT SUM(r.points_spent) FROM redemptions r WHERE r.student_id=u.id AND r.status NOT IN ('已拒绝','已取消')),0))::int AS available_points
      FROM users u LEFT JOIN project_enrollments pe ON pe.student_id=u.id AND pe.project_id=COALESCE($2,u.project_id)
      LEFT JOIN training_projects p ON p.id=COALESCE($2,u.project_id) LEFT JOIN academic_years y ON y.id=COALESCE($3,u.year_id)
      LEFT JOIN groups g ON g.id=pe.group_id LEFT JOIN group_members gm ON gm.group_id=pe.group_id AND gm.student_id=u.id
      WHERE ${where} ORDER BY u.id DESC LIMIT $4 OFFSET $5`, values)
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
    const user = await one(`INSERT INTO users(username,password_hash,role,real_name,email,phone,address,department,system,level1_dept,position,year_id,project_id,employment_status)
      VALUES($1,$2,'student',$1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,username`,
      [name,passwordHash,input.email||null,input.phone||null,input.address||null,input.department||null,input.system||null,input.level1_dept||null,input.position||null,yearId,projectId,input.employment_status||'在职'])
    if (yearId && projectId) await rows('INSERT INTO project_enrollments(student_id,year_id,project_id,group_id,label) VALUES($1,$2,$3,$4,$5)', [user.id,yearId,projectId,groupId,'首次参加'])
    if (groupId) await rows('INSERT INTO group_members(group_id,student_id) VALUES($1,$2)',[groupId,user.id])
    if (projectId) await syncProjectPhaseAssociations(projectId)
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
      level1_dept=$7,position=$8,year_id=$9,project_id=$10,employment_status=$11,account_status=$12 WHERE id=$13 RETURNING id,username,real_name`,
      [name,merged.email||null,merged.phone||null,merged.address||null,merged.department||null,merged.system||null,merged.level1_dept||null,merged.position||null,yearId,projectId,merged.employment_status||'在职',merged.account_status||'启用',studentId])
    if (yearId && projectId) await rows(`INSERT INTO project_enrollments(student_id,year_id,project_id,group_id,label)
      VALUES($1,$2,$3,$4,'首次参加') ON CONFLICT(student_id,project_id) DO UPDATE SET year_id=EXCLUDED.year_id,group_id=EXCLUDED.group_id`,
      [studentId,yearId,projectId,groupChange ? groupId : null])
    if (groupChange && projectId) {
      await rows('DELETE FROM group_members WHERE student_id=$1 AND group_id IN (SELECT id FROM groups WHERE project_id=$2)',[studentId,projectId])
      if (groupId) await rows('INSERT INTO group_members(group_id,student_id) VALUES($1,$2) ON CONFLICT(group_id,student_id) DO NOTHING',[groupId,studentId])
      await rows('UPDATE project_enrollments SET group_id=$1 WHERE student_id=$2 AND project_id=$3',[groupId,studentId,projectId])
    }
    if (Object.hasOwn(input,'group_role') && groupId) {
      if (input.group_role === '小组长') {
        await rows("UPDATE group_members SET role=NULL WHERE group_id=$1 AND role='小组长'",[groupId])
        await rows("UPDATE group_members SET role='小组长' WHERE group_id=$1 AND student_id=$2",[groupId,studentId])
      } else {
        await rows("UPDATE group_members SET role=NULL WHERE group_id=$1 AND student_id=$2",[groupId,studentId])
      }
    }
    if (projectId) await syncProjectPhaseAssociations(projectId)
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
    if(Object.prototype.hasOwnProperty.call(input,'total_stock')&&!Object.prototype.hasOwnProperty.call(input,'available_stock')){
      merged.available_stock=Math.max(0,Number(old.available_stock)+Number(input.total_stock)-Number(old.total_stock))
    }
    if(input.product_status==='可兑换'&&Number(merged.available_stock)<=0)return json({detail:'库存不足，请先补充库存后再上架'},400)
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

const balanceFor = async (studentId) => {
  const earned = Number((await one("SELECT COALESCE(SUM(points),0)::int AS total FROM points WHERE student_id=$1 AND status IN ('有效','active')",[studentId]))?.total||0)
  const spent = Number((await one("SELECT COALESCE(SUM(points_spent),0)::int AS total FROM redemptions WHERE student_id=$1 AND status NOT IN ('已拒绝','已取消')",[studentId]))?.total||0)
  return {earned,spent,available:earned-spent}
}
const pageInfo = (url, fallback = 20) => {
  const page = Math.max(1,Number(url.searchParams.get('page')||1))
  const pageSize = Math.min(200,Math.max(1,Number(url.searchParams.get('page_size')||fallback)))
  return {page,pageSize,offset:(page-1)*pageSize}
}
const csvCell = (value) => `"${String(value??'').replaceAll('"','""')}"`
const taskKeyFor = (value) => String(value||'').trim().replace(/\s+/g,' ').toLowerCase()
async function adminExtendedRoutes(request, pathname, url) {
  const admin = await requireUser(request,'admin'); if (admin instanceof Response) return admin

  if (pathname === '/api/admin/export/all-data' && request.method === 'GET') {
    const datasets = [
      ['年度',`SELECT id,name AS 年度,status AS 状态,created_at AS 创建时间 FROM academic_years ORDER BY id`],
      ['项目',`SELECT p.id,y.name AS 年度,p.name AS 项目名称,p.start_date AS 开始时间,p.end_date AS 结束时间,p.status AS 状态,p.description AS 描述 FROM training_projects p LEFT JOIN academic_years y ON y.id=p.year_id ORDER BY p.id`],
      ['阶段',`SELECT ph.id,y.name AS 年度,p.name AS 项目名称,ph.name AS 阶段名称,ph.start_date AS 开始时间,ph.end_date AS 结束时间,ph.status AS 状态 FROM phases ph LEFT JOIN academic_years y ON y.id=ph.year_id LEFT JOIN training_projects p ON p.id=ph.project_id ORDER BY ph.id`],
      ['学员',`SELECT u.id,u.real_name AS 姓名,u.username AS 登录账号,u.system AS 体系,u.level1_dept AS 一级部门,u.position AS 职位信息,u.email AS 邮箱,u.phone AS 电话,u.account_status AS 账号状态,y.name AS 年度,p.name AS 项目名称,g.name AS 小组 FROM users u LEFT JOIN project_enrollments pe ON pe.student_id=u.id LEFT JOIN academic_years y ON y.id=pe.year_id LEFT JOIN training_projects p ON p.id=pe.project_id LEFT JOIN groups g ON g.id=pe.group_id WHERE u.role='student' ORDER BY u.id`],
      ['小组',`SELECT g.id,y.name AS 年度,p.name AS 项目名称,g.name AS 小组名称,COUNT(gm.student_id)::int AS 成员数 FROM groups g LEFT JOIN academic_years y ON y.id=g.year_id LEFT JOIN training_projects p ON p.id=g.project_id LEFT JOIN group_members gm ON gm.group_id=g.id GROUP BY g.id,y.name,p.name ORDER BY g.id`],
      ['个人积分流水',`SELECT pt.id,pt.record_number AS 流水号,u.real_name AS 学员,y.name AS 年度,p.name AS 项目名称,ph.name AS 阶段,g.name AS 小组,pt.category AS 积分分类,pt.item_name AS 积分事项,pt.points AS 积分,pt.data_source AS 数据来源,pt.source_note AS 来源说明,pt.description AS 备注,pt.status AS 状态,pt.obtained_date AS 获得时间,pt.created_at AS 创建时间 FROM points pt JOIN users u ON u.id=pt.student_id LEFT JOIN academic_years y ON y.id=pt.year_id LEFT JOIN training_projects p ON p.id=pt.project_id LEFT JOIN phases ph ON ph.id=pt.phase_id LEFT JOIN groups g ON g.id=pt.group_id ORDER BY pt.id`],
      ['小组积分流水',`SELECT tp.id,tp.record_number AS 流水号,g.name AS 小组,y.name AS 年度,p.name AS 项目名称,ph.name AS 阶段,tp.category AS 积分分类,tp.item_name AS 积分事项,tp.points AS 积分,tp.data_source AS 数据来源,tp.source_note AS 来源说明,tp.remark AS 备注,tp.status AS 状态,tp.obtained_date AS 获得时间,tp.created_at AS 创建时间 FROM team_points tp JOIN groups g ON g.id=tp.group_id LEFT JOIN academic_years y ON y.id=tp.year_id LEFT JOIN training_projects p ON p.id=tp.project_id LEFT JOIN phases ph ON ph.id=tp.phase_id ORDER BY tp.id`],
      ['商品',`SELECT id,name AS 商品名称,points_required AS 所需积分,total_stock AS 总库存,available_stock AS 可用库存,on_site_stock AS 现场库存,product_status AS 状态,created_at AS 创建时间 FROM products ORDER BY id`],
      ['兑换',`SELECT r.id,u.real_name AS 学员,p.name AS 商品,r.points_spent AS 消耗积分,r.status AS 状态,r.reject_reason AS 拒绝原因,r.express_company AS 快递公司,r.tracking_number AS 快递单号,r.created_at AS 申请时间 FROM redemptions r JOIN users u ON u.id=r.student_id JOIN products p ON p.id=r.product_id ORDER BY r.id`],
      ['奖励',`SELECT pa.id,u.real_name AS 学员,p.name AS 商品,pa.award_type AS 奖励类型,pa.description AS 描述,pa.created_at AS 发放时间 FROM prize_awards pa JOIN users u ON u.id=pa.student_id JOIN products p ON p.id=pa.product_id ORDER BY pa.id`],
      ['操作日志',`SELECT ol.id,u.real_name AS 管理员,ol.action AS 操作,ol.target_type AS 对象类型,ol.target_id AS 对象ID,ol.detail AS 详情,ol.created_at AS 时间 FROM operation_logs ol JOIN users u ON u.id=ol.admin_id ORDER BY ol.id`],
    ]
    const sheets=[]
    for (const [name,sql] of datasets) sheets.push({name,rows:await rows(sql)})
    return json({filename:`积分商城全部数据_${new Date().toISOString().slice(0,10)}.xlsx`,sheets})
  }

  const studentIdMatch = pathname.match(/^\/api\/admin\/students\/(\d+)$/)
  if (studentIdMatch && request.method === 'GET') {
    const id=Number(studentIdMatch[1])
    const student=await one(`SELECT u.id,u.username,u.real_name,u.email,u.phone,u.address,u.department,u.system,u.level1_dept,u.position,
      u.employment_status,u.account_status,u.created_at,pe.year_id,pe.project_id,pe.group_id,y.name AS year_name,p.name AS project_name,g.name AS group_name
      FROM users u LEFT JOIN project_enrollments pe ON pe.student_id=u.id LEFT JOIN academic_years y ON y.id=pe.year_id
      LEFT JOIN training_projects p ON p.id=pe.project_id LEFT JOIN groups g ON g.id=pe.group_id WHERE u.id=$1 AND u.role='student' ORDER BY pe.id DESC LIMIT 1`,[id])
    if (!student) return json({detail:'学员不存在'},404)
    const balance=await balanceFor(id)
    const enrollments=await rows(`SELECT pe.*,y.name AS year_name,p.name AS project_name,g.name AS group_name FROM project_enrollments pe
      JOIN academic_years y ON y.id=pe.year_id JOIN training_projects p ON p.id=pe.project_id LEFT JOIN groups g ON g.id=pe.group_id WHERE pe.student_id=$1 ORDER BY pe.year_id DESC`,[id])
    const recentPoints=await rows('SELECT * FROM points WHERE student_id=$1 ORDER BY id DESC LIMIT 20',[id])
    return json({...student,total_earned:balance.earned,available_points:balance.available,enrollments,recent_points:recentPoints})
  }
  if (studentIdMatch && request.method === 'DELETE') {
    const id=Number(studentIdMatch[1]); const student=await one("SELECT real_name FROM users WHERE id=$1 AND role='student'",[id])
    if (!student) return json({detail:'学员不存在'},404)
    await rows('DELETE FROM redemptions WHERE student_id=$1',[id]); await rows('DELETE FROM prize_awards WHERE student_id=$1',[id])
    await rows('DELETE FROM points WHERE student_id=$1',[id]); await rows('DELETE FROM users WHERE id=$1',[id])
    return json({message:`学员“${student.real_name}”已删除`})
  }
  if (pathname === '/api/admin/students/batch-delete' && request.method === 'POST') {
    const input=await body(request); const ids=(Array.isArray(input)?input:input.student_ids||[]).map(Number).filter(Boolean)
    if (!ids.length) return json({detail:'请选择学员'},400)
    await rows('DELETE FROM redemptions WHERE student_id=ANY($1::bigint[])',[ids]); await rows('DELETE FROM prize_awards WHERE student_id=ANY($1::bigint[])',[ids])
    await rows('DELETE FROM points WHERE student_id=ANY($1::bigint[])',[ids]); await rows("DELETE FROM users WHERE id=ANY($1::bigint[]) AND role='student'",[ids])
    return json({message:`已删除 ${ids.length} 名学员`})
  }
  if (pathname === '/api/admin/students/batch' && request.method === 'POST') {
    const input=await body(request); const source=Array.isArray(input)?input:(input.rows||[]); const result={created:0,skipped:0,errors:[]}
    const touchedProjectIds = new Set()
    for (const [index,item] of source.entries()) {
      try {
        const name=String(item.real_name||item.name||item['姓名']||'').trim(); if (!name) throw new Error('姓名为空')
        let yearId=numberOrNull(item.year_id),projectId=numberOrNull(item.project_id),groupId=numberOrNull(item.group_id)
        const yearName=String(item.year_name||item['所属年度']||item['年度']||'').trim(); const projectName=String(item.project_name||item['培训项目']||item['项目名称']||'').trim(); const groupName=String(item.group_name||item['所属小组']||item['小组']||'').trim()
        if (!yearId&&yearName) yearId=(await one('INSERT INTO academic_years(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[yearName])).id
        if (!projectId&&projectName&&yearId) projectId=(await one('SELECT id FROM training_projects WHERE year_id=$1 AND name=$2',[yearId,projectName]))?.id
        if (!projectId&&projectName&&yearId) projectId=(await one("INSERT INTO training_projects(name,year_id,status) VALUES($1,$2,'active') RETURNING id",[projectName,yearId])).id
        const existing=await one("SELECT id FROM users WHERE username=$1 AND role='student'",[name])
        if (existing) await rows(`UPDATE users SET email=COALESCE(NULLIF($1,''),email),phone=COALESCE(NULLIF($2,''),phone),address=COALESCE(NULLIF($3,''),address),
          system=COALESCE(NULLIF($4,''),system),level1_dept=COALESCE(NULLIF($5,''),level1_dept),position=COALESCE(NULLIF($6,''),position),employment_status=COALESCE(NULLIF($7,''),employment_status) WHERE id=$8`,
          [item.email||item['邮箱']||'',item.phone||item['电话']||'',item.address||item['地址']||'',item.system||item['体系']||'',item.level1_dept||item['一级部门']||'',item.position||item['职位信息']||item['职位']||'',item.employment_status||item['在职状态']||'',existing.id])
        if (existing&&yearId&&await one('SELECT id FROM project_enrollments WHERE student_id=$1 AND year_id=$2',[existing.id,yearId])) { result.skipped++; continue }
        if (groupName&&projectId) groupId=(await one('SELECT id FROM groups WHERE project_id=$1 AND name=$2',[projectId,groupName]))?.id||
          (await one("INSERT INTO groups(name,year_id,project_id,status) VALUES($1,$2,$3,'active') RETURNING id",[groupName,yearId,projectId])).id
        const studentId=existing?.id||(await one(`INSERT INTO users(username,password_hash,role,real_name,email,phone,address,system,level1_dept,position,year_id,project_id,employment_status)
          VALUES($1,$2,'student',$1,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[name,hashPassword(randomBytes(24).toString('hex')),item.email||item['邮箱']||null,item.phone||item['电话']||null,item.address||item['地址']||null,item.system||item['体系']||null,item.level1_dept||item['一级部门']||null,item.position||item['职位信息']||item['职位']||null,yearId,projectId,item.employment_status||item['在职状态']||'在职'])).id
        if (yearId&&projectId) await rows(`INSERT INTO project_enrollments(student_id,year_id,project_id,group_id,label) VALUES($1,$2,$3,$4,'首次参加')
          ON CONFLICT(student_id,project_id) DO UPDATE SET group_id=EXCLUDED.group_id`,[studentId,yearId,projectId,groupId])
        if (groupId) await rows('INSERT INTO group_members(group_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[groupId,studentId])
        if (projectId) touchedProjectIds.add(Number(projectId))
        result.created++
      } catch(error) { result.errors.push({row:index+2,detail:error.message}) }
    }
    for (const id of touchedProjectIds) await syncProjectPhaseAssociations(id)
    return json(result)
  }

  const projectMemberRoute=pathname.match(/^\/api\/admin\/projects\/(\d+)\/members(?:\/(\d+))?$/)
  if(projectMemberRoute){
    const projectId=Number(projectMemberRoute[1]),studentId=numberOrNull(projectMemberRoute[2]),project=await one('SELECT * FROM training_projects WHERE id=$1',[projectId]);if(!project)return json({detail:'项目不存在'},404)
    if(!studentId&&request.method==='GET')return json(await rows(`SELECT u.id,u.real_name,u.system,u.level1_dept,pe.group_id,g.name AS group_name,pe.status,pe.label FROM project_enrollments pe JOIN users u ON u.id=pe.student_id LEFT JOIN groups g ON g.id=pe.group_id WHERE pe.project_id=$1 ORDER BY u.id`,[projectId]))
    if(!studentId&&request.method==='POST'){const input=await body(request);const ids=(Array.isArray(input)?input:input.student_ids||[]).map(Number);for(const id of ids)await rows(`INSERT INTO project_enrollments(student_id,year_id,project_id,status,label) VALUES($1,$2,$3,'在读','后续参加') ON CONFLICT(student_id,project_id) DO NOTHING`,[id,project.year_id,projectId]);await syncProjectPhaseAssociations(projectId);return json({message:'项目成员已添加'})}
    if(studentId&&request.method==='PUT'){const input=await body(request);await rows('UPDATE project_enrollments SET group_id=$1,status=COALESCE($2,status),label=COALESCE($3,label),remark=$4 WHERE project_id=$5 AND student_id=$6',[numberOrNull(input.group_id),input.status||null,input.label||null,input.remark||null,projectId,studentId]);await syncProjectPhaseAssociations(projectId);return json({message:'项目成员已更新'})}
    if(studentId&&request.method==='DELETE'){await rows('DELETE FROM phase_participants WHERE student_id=$1 AND phase_id IN(SELECT id FROM phases WHERE project_id=$2)',[studentId,projectId]);await rows('DELETE FROM project_enrollments WHERE project_id=$1 AND student_id=$2',[projectId,studentId]);await rows('DELETE FROM group_members WHERE student_id=$1 AND group_id IN(SELECT id FROM groups WHERE project_id=$2)',[studentId,projectId]);return json({message:'项目成员已移除'})}
  }

  if (pathname === '/api/admin/groups' && request.method === 'GET') {
    const yearId=numberOrNull(url.searchParams.get('year_id')),projectId=numberOrNull(url.searchParams.get('project_id'))
    const groupItems=await rows(`SELECT g.*,y.name AS year_name,p.name AS project_name,
      (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id=g.id) AS member_count,
      (SELECT u.real_name FROM group_members gm JOIN users u ON u.id=gm.student_id WHERE gm.group_id=g.id AND gm.role='小组长' LIMIT 1) AS leader_name,
      COALESCE((SELECT SUM(pt.points)::int FROM points pt JOIN group_members gm ON gm.student_id=pt.student_id WHERE gm.group_id=g.id AND pt.project_id=g.project_id AND pt.status IN ('有效','active')),0) AS personal_points,
      COALESCE((SELECT SUM(tp.points)::int FROM team_points tp WHERE tp.group_id=g.id AND tp.project_id=g.project_id AND tp.status IN ('有效','active')),0) AS team_points
      FROM groups g LEFT JOIN academic_years y ON y.id=g.year_id LEFT JOIN training_projects p ON p.id=g.project_id
      WHERE ($1::bigint IS NULL OR g.year_id=$1) AND ($2::bigint IS NULL OR g.project_id=$2)
      ORDER BY g.id DESC`,[yearId,projectId])
    groupItems.forEach(item=>{item.total_points=Number(item.personal_points)+Number(item.team_points);item.final_score=item.total_points})
    return json(groupItems)
  }
  if (pathname === '/api/admin/groups' && request.method === 'POST') {
    const input=await body(request); const name=String(input.name||'').trim(),yearId=numberOrNull(input.year_id),projectId=numberOrNull(input.project_id)
    if (!name||!yearId||!projectId) return json({detail:'请填写小组名称、年度和项目'},400)
    const created=await one("INSERT INTO groups(name,year_id,project_id,status) VALUES($1,$2,$3,'active') ON CONFLICT(project_id,name) DO UPDATE SET year_id=EXCLUDED.year_id RETURNING *",[name,yearId,projectId])
    await syncProjectPhaseAssociations(projectId)
    return json(created,201)
  }
  if (pathname === '/api/admin/groups/batch-delete' && request.method === 'POST') {
    const input=await body(request)
    const groupIds=[...new Set((input.group_ids||[]).map(Number).filter(Boolean))]
    if (!groupIds.length) return json({detail:'请选择需要删除的小组'},400)
    const existing=await rows('SELECT id,name FROM groups WHERE id=ANY($1::bigint[])',[groupIds])
    if (!existing.length) return json({detail:'所选小组不存在或已删除'},404)
    const existingIds=existing.map(item=>Number(item.id))
    const affected=Number((await one('SELECT COUNT(*)::int AS count FROM group_members WHERE group_id=ANY($1::bigint[])',[existingIds]))?.count||0)
    await rows('UPDATE project_enrollments SET group_id=NULL WHERE group_id=ANY($1::bigint[])',[existingIds])
    await rows('UPDATE phase_participants SET group_id=NULL WHERE group_id=ANY($1::bigint[])',[existingIds])
    await rows('UPDATE points SET group_id=NULL WHERE group_id=ANY($1::bigint[])',[existingIds])
    await rows('UPDATE prize_awards SET group_id=NULL WHERE group_id=ANY($1::bigint[])',[existingIds])
    await rows('DELETE FROM team_points WHERE group_id=ANY($1::bigint[])',[existingIds])
    await rows('DELETE FROM phase_groups WHERE group_id=ANY($1::bigint[])',[existingIds])
    await rows('DELETE FROM group_members WHERE group_id=ANY($1::bigint[])',[existingIds])
    await rows('DELETE FROM groups WHERE id=ANY($1::bigint[])',[existingIds])
    return json({
      message:`已删除 ${existing.length} 个小组，${affected} 名成员已变为未分组`,
      deleted:existing.length,
      affected_members:affected,
      deleted_names:existing.map(item=>item.name),
    })
  }
  const groupMemberRoleRoute=pathname.match(/^\/api\/admin\/groups\/(\d+)\/members\/(\d+)\/role$/)
  if(groupMemberRoleRoute&&request.method==='POST'){
    const groupId=Number(groupMemberRoleRoute[1]),memberId=Number(groupMemberRoleRoute[2]),input=await body(request)
    if(!await one('SELECT id FROM group_members WHERE group_id=$1 AND student_id=$2',[groupId,memberId]))return json({detail:'该学员不属于当前小组'},404)
    if(input.role==='小组长'){
      await rows("UPDATE group_members SET role=NULL WHERE group_id=$1 AND role='小组长'",[groupId])
      await rows("UPDATE group_members SET role='小组长' WHERE group_id=$1 AND student_id=$2",[groupId,memberId])
      return json({message:'小组长已设置',group_id:groupId,student_id:memberId,role:'小组长'})
    }
    await rows('UPDATE group_members SET role=NULL WHERE group_id=$1 AND student_id=$2',[groupId,memberId])
    return json({message:'小组长标记已取消',group_id:groupId,student_id:memberId,role:null})
  }
  const groupRoute=pathname.match(/^\/api\/admin\/groups\/(\d+)(?:\/members(?:\/(\d+))?)?$/)
  if (groupRoute) {
    const groupId=Number(groupRoute[1]),memberId=numberOrNull(groupRoute[2]); const group=await one('SELECT * FROM groups WHERE id=$1',[groupId])
    if (!group) return json({detail:'小组不存在'},404)
    if (!pathname.includes('/members')&&request.method==='GET') {
      const members=await rows(`SELECT u.id AS student_id,u.real_name,u.system,u.level1_dept,gm.role,
        COALESCE((SELECT SUM(points) FROM points WHERE student_id=u.id AND project_id=$2 AND status IN ('有效','active')),0)::int AS total_points
        FROM group_members gm JOIN users u ON u.id=gm.student_id WHERE gm.group_id=$1 ORDER BY u.id`,[groupId,group.project_id])
      const personalPoints=members.reduce((sum,item)=>sum+Number(item.total_points),0),teamPoints=Number((await one("SELECT COALESCE(SUM(points),0)::int AS total FROM team_points WHERE group_id=$1 AND project_id=$2 AND status IN ('有效','active')",[groupId,group.project_id]))?.total||0)
      return json({...group,member_count:members.length,members,personal_points:personalPoints,team_points:teamPoints,total_points:personalPoints+teamPoints,final_score:personalPoints+teamPoints,avg_points:members.length?Math.round((personalPoints+teamPoints)*100/members.length)/100:0,phase_stats:[],awards:[]})
    }
    if(!pathname.includes('/members')&&request.method==='PUT'){const input=await body(request);return json(await one('UPDATE groups SET name=COALESCE($1,name),year_id=COALESCE($2,year_id),project_id=COALESCE($3,project_id),status=COALESCE($4,status) WHERE id=$5 RETURNING *',[input.name||null,numberOrNull(input.year_id),numberOrNull(input.project_id),input.status||null,groupId]))}
    if (pathname.endsWith('/members')&&request.method==='POST') {
      const input=await body(request); const ids=(Array.isArray(input)?input:input.student_ids||[]).map(Number)
      for (const id of ids) { await rows('DELETE FROM group_members WHERE student_id=$1 AND group_id IN (SELECT id FROM groups WHERE project_id=$2)',[id,group.project_id]); await rows('INSERT INTO group_members(group_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[groupId,id]); await rows('UPDATE project_enrollments SET group_id=$1 WHERE student_id=$2 AND project_id=$3',[groupId,id,group.project_id]) }
      await syncProjectPhaseAssociations(group.project_id)
      return json({message:'成员已添加'})
    }
    if (memberId&&request.method==='PUT') {
      const input=await body(request)
      if (!await one('SELECT id FROM group_members WHERE group_id=$1 AND student_id=$2',[groupId,memberId])) return json({detail:'该学员不属于当前小组'},404)
      if (input.role === '小组长') {
        await rows("UPDATE group_members SET role=NULL WHERE group_id=$1 AND role='小组长'",[groupId])
        await rows("UPDATE group_members SET role='小组长' WHERE group_id=$1 AND student_id=$2",[groupId,memberId])
        return json({message:'小组长已设置'})
      }
      await rows('UPDATE group_members SET role=NULL WHERE group_id=$1 AND student_id=$2',[groupId,memberId])
      return json({message:'小组长标记已取消'})
    }
    if (memberId&&request.method==='DELETE') { await rows('DELETE FROM group_members WHERE group_id=$1 AND student_id=$2',[groupId,memberId]); await rows('UPDATE project_enrollments SET group_id=NULL WHERE group_id=$1 AND student_id=$2',[groupId,memberId]); await rows('UPDATE phase_participants SET group_id=NULL WHERE group_id=$1 AND student_id=$2',[groupId,memberId]); await syncProjectPhaseAssociations(group.project_id); return json({message:'成员已移除，学员已变为未分组',student_id:memberId,group_id:null}) }
  }

  const phaseRankingRoute=pathname.match(/^\/api\/admin\/phases\/(\d+)\/(ranking|group-ranking)$/)
  if(phaseRankingRoute&&request.method==='GET'){
    const phaseId=Number(phaseRankingRoute[1])
    if(phaseRankingRoute[2]==='ranking'){
      const ranking=await rows(`SELECT u.id AS student_id,u.real_name AS student_name,g.name AS group_name,u.level1_dept AS department,COALESCE(SUM(pt.points),0)::int AS total_points FROM points pt JOIN users u ON u.id=pt.student_id LEFT JOIN project_enrollments pe ON pe.student_id=u.id AND pe.project_id=pt.project_id LEFT JOIN groups g ON g.id=pe.group_id WHERE pt.phase_id=$1 AND pt.status IN ('有效','active') GROUP BY u.id,u.real_name,u.level1_dept,g.name ORDER BY total_points DESC`,[phaseId]);ranking.forEach((item,index)=>item.rank=index+1);return json(ranking)
    }
    const ranking=await rows(`SELECT g.id AS group_id,g.name AS group_name,
      (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id=g.id) AS member_count,
      COALESCE((SELECT SUM(pt.points) FROM points pt JOIN group_members gm ON gm.student_id=pt.student_id WHERE gm.group_id=g.id AND pt.phase_id=$1 AND pt.status IN ('有效','active')),0)::int AS personal_points,
      COALESCE((SELECT SUM(tp.points) FROM team_points tp WHERE tp.group_id=g.id AND tp.phase_id=$1 AND tp.status IN ('有效','active')),0)::int AS team_points
      FROM phase_groups pg JOIN groups g ON g.id=pg.group_id WHERE pg.phase_id=$1 GROUP BY g.id,g.name`,[phaseId]);ranking.forEach(item=>{item.total_points=Number(item.personal_points)+Number(item.team_points);item.final_score=item.total_points;item.avg_points=item.member_count?Math.round(item.total_points*100/item.member_count)/100:0});ranking.sort((a,b)=>b.final_score-a.final_score).forEach((item,index)=>item.rank=index+1);return json(ranking)
  }
  const phasePointsRoute=pathname.match(/^\/api\/admin\/phases\/(\d+)\/points$/)
  if(phasePointsRoute&&request.method==='PUT'){const input=await body(request),phaseId=Number(phasePointsRoute[1]),records=Array.isArray(input)?input:(input.records||[]);for(const record of records){const fake=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({...record,phase_id:phaseId})});await adminExtendedRoutes(fake,'/api/admin/points',url)}return json({message:`已录入 ${records.length} 条阶段积分`})}

  if (pathname === '/api/admin/points' && request.method === 'POST') {
    const input=await body(request); const studentId=numberOrNull(input.student_id),points=Number(input.points)
    if (!studentId||!Number.isFinite(points)||points===0) return json({detail:'请选择学员并填写有效积分'},400)
    const category=input.category||'特殊调整'
    if (['线上考试','开放题'].includes(category)) return json({detail:`${category}属于必做任务，不设置积分`},400)
    const itemName=String(input.item_name||input.description||category).trim(),taskKey=taskKeyFor(input.task_key||itemName)
    if(!itemName)return json({detail:'请填写积分事项'},400)
    if(category==='特殊调整'&&!String(input.description||'').trim())return json({detail:'特殊调整必须填写调整原因'},400)
    const phaseId=numberOrNull(input.phase_id)
    if(!phaseId)return json({detail:'每笔个人积分必须关联所属阶段'},400)
    const phaseInfo=await one('SELECT id,year_id,project_id FROM phases WHERE id=$1',[phaseId]);if(!phaseInfo)return json({detail:'所选阶段不存在'},400)
    const projectId=numberOrNull(input.project_id)||phaseInfo.project_id,projectEnrollment=await one('SELECT * FROM project_enrollments WHERE student_id=$1 AND project_id=$2',[studentId,projectId])
    const yearId=numberOrNull(input.year_id)||phaseInfo.year_id||projectEnrollment?.year_id||null,groupId=numberOrNull(input.group_id)||projectEnrollment?.group_id||null
    if(!yearId||!projectId)return json({detail:'无法识别学员所属年度和培训项目'},400)
    if(String(phaseInfo.project_id)!==String(projectId)||String(phaseInfo.year_id)!==String(yearId))return json({detail:'所选阶段与学员所属年度或项目不一致'},400)
    if(!projectEnrollment)return json({detail:'该学员未加入所选阶段对应的培训项目'},400)
    let interactionNo=null
    if(category==='课堂互动'){
      const count=Number((await one("SELECT COUNT(*)::int AS count FROM points WHERE student_id=$1 AND project_id=$2 AND COALESCE(phase_id,0)=COALESCE($3,0) AND category='课堂互动' AND task_key=$4 AND status IN ('有效','active')",[studentId,projectId,phaseId,taskKey]))?.count||0)
      if(count>=2)return json({detail:'该学员在同一场课堂互动中最多计2次积分'},400)
      interactionNo=count+1
    }else if(category!=='特殊调整'){
      const duplicate=await one("SELECT id FROM points WHERE student_id=$1 AND project_id=$2 AND COALESCE(phase_id,0)=COALESCE($3,0) AND category=$4 AND task_key=$5 AND status IN ('有效','active') LIMIT 1",[studentId,projectId,phaseId,category,taskKey])
      if(duplicate)return json({detail:'同一任务、同一学员只能计分一次'},409)
    }
    const record=await one(`INSERT INTO points(record_number,student_id,admin_id,year_id,project_id,phase_id,group_id,points,category,item_name,task_key,interaction_no,description,data_source,source_note,status,obtained_date)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'有效',$16) RETURNING *`,[`PT${Date.now()}${randomBytes(3).toString('hex')}`,studentId,admin.id,yearId,projectId,phaseId,groupId,points,category,itemName,taskKey,interactionNo,input.description||null,input.data_source||'单个录入',input.source_note||null,input.obtained_date||new Date().toISOString()])
    if (record.phase_id) { await rows('INSERT INTO phase_participants(phase_id,student_id,group_id) VALUES($1,$2,$3) ON CONFLICT(phase_id,student_id) DO UPDATE SET group_id=COALESCE(EXCLUDED.group_id,phase_participants.group_id)',[record.phase_id,studentId,groupId]); if(groupId) await rows('INSERT INTO phase_groups(phase_id,group_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[record.phase_id,groupId]) }
    return json(record,201)
  }
  if(pathname==='/api/admin/team-points'&&request.method==='POST'){
    const input=await body(request),groupId=numberOrNull(input.group_id),projectId=numberOrNull(input.project_id),phaseId=numberOrNull(input.phase_id),category=input.category||'';let points=Number(input.points)
    if(!groupId||!projectId||!phaseId||!Number.isFinite(points)||points===0)return json({detail:'请选择小组、项目、阶段并填写有效小组积分'},400)
    const group=await one('SELECT * FROM groups WHERE id=$1 AND project_id=$2',[groupId,projectId]);if(!group)return json({detail:'所选小组不属于该项目'},400)
    if(phaseId&&!await one('SELECT id FROM phases WHERE id=$1 AND project_id=$2',[phaseId,projectId]))return json({detail:'所选阶段不属于该项目'},400)
    const itemName=String(input.item_name||'').trim(),taskKey=taskKeyFor(input.task_key||itemName),remark=String(input.remark||'').trim()
    if(!itemName)return json({detail:'请填写小组积分事项'},400)
    if(category==='特殊调整'&&!remark)return json({detail:'小组特殊调整必须填写调整原因'},400)
    if(category!=='特殊调整'&&await one("SELECT id FROM team_points WHERE group_id=$1 AND project_id=$2 AND COALESCE(phase_id,0)=COALESCE($3,0) AND category=$4 AND task_key=$5 AND status IN ('有效','active') LIMIT 1",[groupId,projectId,phaseId,category,taskKey]))return json({detail:'同一任务、同一小组只能计分一次'},409)
    if(category==='阶段案例评优'&&await one("SELECT id FROM team_points WHERE project_id=$1 AND phase_id=$2 AND category='阶段案例评优' AND task_key=$3 AND status IN ('有效','active') LIMIT 1",[projectId,phaseId,taskKey]))return json({detail:'同一阶段的同一案例评优只能有一个第一名小组'},409)
    let record=await one(`INSERT INTO team_points(record_number,group_id,admin_id,year_id,project_id,phase_id,points,category,item_name,task_key,data_source,source_note,remark,status,obtained_date)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'有效',$14) RETURNING *`,[`TP${Date.now()}${randomBytes(3).toString('hex')}`,groupId,admin.id,numberOrNull(input.year_id)||group.year_id,projectId,phaseId,points,category,itemName,taskKey,input.data_source||'单个录入',input.source_note||null,remark||null,input.obtained_date||new Date().toISOString()])
    record=await one('SELECT * FROM team_points WHERE id=$1',[record.id])
    if(phaseId)await rows('INSERT INTO phase_groups(phase_id,group_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[phaseId,groupId])
    return json(record,201)
  }
  if(pathname==='/api/admin/team-points'&&request.method==='GET'){
    const {page,pageSize,offset}=pageInfo(url);const projectId=numberOrNull(url.searchParams.get('project_id')),phaseId=numberOrNull(url.searchParams.get('phase_id')),groupId=numberOrNull(url.searchParams.get('group_id')),category=url.searchParams.get('category')||''
    const args=[projectId,phaseId,groupId,category],where="($1::bigint IS NULL OR tp.project_id=$1) AND ($2::bigint IS NULL OR tp.phase_id=$2) AND ($3::bigint IS NULL OR tp.group_id=$3) AND ($4='' OR tp.category=$4)"
    const total=Number((await one(`SELECT COUNT(*)::int AS total FROM team_points tp WHERE ${where}`,args)).total)
    const items=await rows(`SELECT tp.*,g.name AS group_name,y.name AS year_name,p.name AS project_name,ph.name AS phase_name,u.real_name AS admin_name FROM team_points tp JOIN groups g ON g.id=tp.group_id LEFT JOIN academic_years y ON y.id=tp.year_id LEFT JOIN training_projects p ON p.id=tp.project_id LEFT JOIN phases ph ON ph.id=tp.phase_id LEFT JOIN users u ON u.id=tp.admin_id WHERE ${where} ORDER BY tp.id DESC LIMIT $5 OFFSET $6`,[...args,pageSize,offset])
    return json({items,total,page,page_size:pageSize,total_pages:Math.max(1,Math.ceil(total/pageSize))})
  }
  if(pathname==='/api/admin/team-points/import'&&request.method==='POST'){
    const input=await body(request);const source=Array.isArray(input)?input:(input.records||[]);const result={created:0,errors:[]}
    const records=[...source].sort((a,b)=>String(a.obtained_date||'').localeCompare(String(b.obtained_date||'')))
    for(const [index,record] of records.entries()){
      try{
        const fake=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({...record,data_source:record.data_source||'Excel导入'})})
        const response=await adminExtendedRoutes(fake,'/api/admin/team-points',url)
        if(response.status>=400)throw new Error((await response.json()).detail||'导入失败')
        result.created++
      }catch(error){result.errors.push({row:index+2,detail:error.message})}
    }
    return json(result)
  }
  if(pathname==='/api/admin/team-points/delete-all'&&request.method==='POST'){
    const input=await body(request),yearId=numberOrNull(input.year_id),projectId=numberOrNull(input.project_id),phaseId=numberOrNull(input.phase_id),groupId=numberOrNull(input.group_id),category=String(input.category||'')
    if(!yearId||!projectId)return json({detail:'请先选择年度和项目'},400)
    const args=[yearId,projectId,phaseId,groupId,category]
    const where="year_id=$1 AND project_id=$2 AND ($3::bigint IS NULL OR phase_id=$3) AND ($4::bigint IS NULL OR group_id=$4) AND ($5='' OR category=$5)"
    const deleted=await rows(`DELETE FROM team_points WHERE ${where} RETURNING group_id,points,status`,args)
    if(!deleted.length)return json({detail:'当前筛选范围内没有小组积分流水'},404)
    const affectedGroups=new Set(deleted.map(item=>Number(item.group_id))).size
    const removedPoints=deleted.filter(item=>['有效','active'].includes(item.status)).reduce((sum,item)=>sum+Number(item.points||0),0)
    return json({message:`已删除 ${deleted.length} 条小组积分流水`,deleted_count:deleted.length,affected_groups:affectedGroups,removed_points:removedPoints})
  }
  const teamPointDelete=pathname.match(/^\/api\/admin\/team-points\/(\d+)$/);if(teamPointDelete&&request.method==='DELETE'){
    const id=Number(teamPointDelete[1]),record=await one('SELECT project_id,phase_id,category,task_key FROM team_points WHERE id=$1',[id])
    if(!record)return json({detail:'小组积分记录不存在'},404)
    await rows('DELETE FROM team_points WHERE id=$1',[id])
    return json({message:'小组积分已删除'})
  }
  if ((pathname === '/api/admin/points/batch'||pathname === '/api/admin/points/import')&&request.method==='POST') {
    const input=await body(request); const records=Array.isArray(input)?input:(input.records||[]); const result={created:0,errors:[]}
    for (const [index,record] of records.entries()) { try { const fake=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(record)}); const response=await adminExtendedRoutes(fake,'/api/admin/points',url); if(response.status>=400) throw new Error((await response.json()).detail); result.created++ } catch(error){result.errors.push({row:index+1,detail:error.message})} }
    return json(result)
  }
  if (pathname === '/api/admin/points/records' && request.method === 'GET') {
    const {page,pageSize,offset}=pageInfo(url); const keyword=url.searchParams.get('keyword')||'',yearId=numberOrNull(url.searchParams.get('year_id')),projectId=numberOrNull(url.searchParams.get('project_id')),phaseId=numberOrNull(url.searchParams.get('phase_id')),category=url.searchParams.get('category')||''
    const where=`($1='' OR u.real_name ILIKE $1 OR pt.record_number ILIKE $1 OR pt.description ILIKE $1 OR pt.item_name ILIKE $1) AND ($2::bigint IS NULL OR pt.year_id=$2) AND ($3::bigint IS NULL OR pt.project_id=$3) AND ($4::bigint IS NULL OR pt.phase_id=$4) AND ($5='' OR pt.category=$5)`; const args=[`%${keyword}%`,yearId,projectId,phaseId,category]
    const total=Number((await one(`SELECT COUNT(*)::int AS total FROM points pt JOIN users u ON u.id=pt.student_id WHERE ${where}`,args)).total)
    const items=await rows(`SELECT pt.*,u.real_name AS student_name,op.real_name AS admin_name,y.name AS year_name,p.name AS project_name,ph.name AS phase_name,g.name AS group_name
      FROM points pt JOIN users u ON u.id=pt.student_id LEFT JOIN users op ON op.id=pt.admin_id LEFT JOIN academic_years y ON y.id=pt.year_id LEFT JOIN training_projects p ON p.id=pt.project_id LEFT JOIN phases ph ON ph.id=pt.phase_id LEFT JOIN groups g ON g.id=pt.group_id WHERE ${where} ORDER BY pt.id DESC LIMIT $6 OFFSET $7`,[...args,pageSize,offset])
    return json({items,total,page,page_size:pageSize,total_pages:Math.max(1,Math.ceil(total/pageSize))})
  }
  if (pathname === '/api/admin/points/records/export' && request.method === 'GET') {
    const items=await rows(`SELECT pt.record_number,u.real_name,y.name AS year_name,p.name AS project_name,ph.name AS phase_name,pt.category,pt.item_name,pt.points,pt.description,pt.data_source,pt.source_note,pt.status,pt.obtained_date,pt.created_at FROM points pt JOIN users u ON u.id=pt.student_id LEFT JOIN academic_years y ON y.id=pt.year_id LEFT JOIN training_projects p ON p.id=pt.project_id LEFT JOIN phases ph ON ph.id=pt.phase_id ORDER BY pt.id DESC`)
    const headers=['流水号','计分对象','学员','年度','项目名称','所属阶段','积分分类','积分事项','积分','备注','来源','来源说明','状态','获得时间','创建时间']; const keys=['record_number','account_type','real_name','year_name','project_name','phase_name','category','item_name','points','description','data_source','source_note','status','obtained_date','created_at'];items.forEach(item=>item.account_type='个人'); const csv='\uFEFF'+[headers.map(csvCell).join(','),...items.map(row=>keys.map(key=>csvCell(row[key])).join(','))].join('\n')
    return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="points_records.csv"'}})
  }
  if (pathname === '/api/admin/points/batch-delete' && request.method === 'POST') { const input=await body(request); const ids=(input.point_ids||[]).map(Number); await rows('DELETE FROM points WHERE id=ANY($1::bigint[])',[ids]); return json({message:`已删除 ${ids.length} 条积分`}) }
  if (pathname === '/api/admin/points/delete-all' && request.method === 'POST') {
    const input=await body(request),yearId=numberOrNull(input.year_id),projectId=numberOrNull(input.project_id),phaseId=numberOrNull(input.phase_id),category=String(input.category||''),keyword=String(input.keyword||'').trim()
    if(!yearId||!projectId)return json({detail:'请先选择年度和项目'},400)
    const args=[yearId,projectId,phaseId,category,`%${keyword}%`]
    const where="pt.year_id=$1 AND pt.project_id=$2 AND ($3::bigint IS NULL OR pt.phase_id=$3) AND ($4='' OR pt.category=$4) AND ($5='%%' OR EXISTS(SELECT 1 FROM users u WHERE u.id=pt.student_id AND u.real_name ILIKE $5) OR pt.description ILIKE $5 OR pt.item_name ILIKE $5 OR pt.record_number ILIKE $5)"
    const deleted=await rows(`DELETE FROM points pt WHERE ${where} RETURNING student_id,points,status`,args)
    if(!deleted.length)return json({detail:'当前筛选范围内没有个人积分流水'},404)
    const affectedStudents=new Set(deleted.map(item=>Number(item.student_id))).size
    const removedPoints=deleted.filter(item=>['有效','active'].includes(item.status)).reduce((sum,item)=>sum+Number(item.points||0),0)
    return json({message:`已删除 ${deleted.length} 条个人积分流水`,deleted_count:deleted.length,affected_students:affectedStudents,removed_points:removedPoints})
  }
  const pointDelete=pathname.match(/^\/api\/admin\/points\/(\d+)$/); if(pointDelete&&request.method==='DELETE'){await rows('DELETE FROM points WHERE id=$1',[Number(pointDelete[1])]);return json({message:'积分已删除'})}
  if(pointDelete&&request.method==='PUT'){const input=await body(request);return json(await one(`UPDATE points SET points=COALESCE($1,points),category=COALESCE($2,category),description=$3,year_id=COALESCE($4,year_id),project_id=COALESCE($5,project_id),phase_id=$6,group_id=$7,obtained_date=COALESCE($8,obtained_date) WHERE id=$9 RETURNING *`,[numberOrNull(input.points),input.category||null,input.description||null,numberOrNull(input.year_id),numberOrNull(input.project_id),numberOrNull(input.phase_id),numberOrNull(input.group_id),input.obtained_date||null,Number(pointDelete[1])]))}

  if (pathname === '/api/admin/point-rules' && request.method === 'GET') return json((await rows('SELECT * FROM point_rules ORDER BY account_type,id DESC')).map(r=>({...r,applicable_projects:r.applicable_projects?JSON.parse(r.applicable_projects):[],applicable_phases:r.applicable_phases?JSON.parse(r.applicable_phases):[]})))
  if (pathname === '/api/admin/point-rules' && request.method === 'POST') { const i=await body(request); return json(await one(`INSERT INTO point_rules(category,rule_name,default_points,max_points,applicable_projects,applicable_phases,allow_repeat,count_in_period,count_in_available,need_approval,description,account_type,scoring_standard) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[i.category,i.rule_name,Number(i.default_points||0),numberOrNull(i.max_points),JSON.stringify(i.applicable_projects||[]),JSON.stringify(i.applicable_phases||[]),intFlag(i.allow_repeat),intFlag(i.count_in_period,1),intFlag(i.count_in_available,1),intFlag(i.need_approval),i.description||null,i.account_type||'个人',i.scoring_standard||null]),201) }
  const ruleMatch=pathname.match(/^\/api\/admin\/point-rules\/(\d+)$/); if(ruleMatch&&request.method==='PUT'){const i=await body(request);return json(await one(`UPDATE point_rules SET category=$1,rule_name=$2,default_points=$3,max_points=$4,applicable_projects=$5,applicable_phases=$6,allow_repeat=$7,count_in_period=$8,count_in_available=$9,need_approval=$10,description=$11,account_type=$12,scoring_standard=$13 WHERE id=$14 RETURNING *`,[i.category,i.rule_name,Number(i.default_points||0),numberOrNull(i.max_points),JSON.stringify(i.applicable_projects||[]),JSON.stringify(i.applicable_phases||[]),intFlag(i.allow_repeat),intFlag(i.count_in_period,1),intFlag(i.count_in_available,1),intFlag(i.need_approval),i.description||null,i.account_type||'个人',i.scoring_standard||null,Number(ruleMatch[1])]))}
  if(pathname==='/api/admin/rule-text'&&request.method==='GET')return json(await rows('SELECT * FROM rule_texts ORDER BY id DESC'))
  if(pathname==='/api/admin/rule-text'&&request.method==='POST'){const i=await body(request);return json(await one('INSERT INTO rule_texts(title,content) VALUES($1,$2) RETURNING *',[i.title||'积分规则',i.content]),201)}
  const ruleTextMatch=pathname.match(/^\/api\/admin\/rule-text\/(\d+)$/);if(ruleTextMatch&&request.method==='DELETE'){await rows('DELETE FROM rule_texts WHERE id=$1',[Number(ruleTextMatch[1])]);return json({message:'规则文本已删除'})}

  const productDelete=pathname.match(/^\/api\/admin\/products\/(\d+)$/);if(productDelete&&request.method==='DELETE'){const id=Number(productDelete[1]);if(await one('SELECT id FROM redemptions WHERE product_id=$1 LIMIT 1',[id]))return json({detail:'商品已有兑换记录，不能删除'},400);await rows('DELETE FROM products WHERE id=$1',[id]);return json({message:'商品已删除'})}

  if(pathname==='/api/admin/redemptions'&&request.method==='GET'){
    const {page,pageSize,offset}=pageInfo(url),status=url.searchParams.get('status')||'',keyword=url.searchParams.get('keyword')||''
    const statusGroups={
      '已通过':['已通过','待发货','已发货','待领取','已领取','已完成'],
      '已取消':['已取消','已拒绝'],
    }
    const selectedStatuses=statusGroups[status]||[status]
    const args=[selectedStatuses,`%${keyword}%`,status]
    const where="($3='' OR r.status=ANY($1::text[])) AND ($2='%%' OR u.real_name ILIKE $2 OR p.name ILIKE $2)"
    const total=Number((await one(`SELECT COUNT(*)::int AS total FROM redemptions r JOIN users u ON u.id=r.student_id JOIN products p ON p.id=r.product_id WHERE ${where}`,args)).total)
    const items=await rows(`SELECT r.*,u.real_name AS student_name,p.name AS product_name,p.image_url FROM redemptions r JOIN users u ON u.id=r.student_id JOIN products p ON p.id=r.product_id WHERE ${where} ORDER BY r.id DESC LIMIT $4 OFFSET $5`,[...args,pageSize,offset])
    return json({items,total,page,page_size:pageSize,total_pages:Math.max(1,Math.ceil(total/pageSize))})
  }
  const redemptionStatus=pathname.match(/^\/api\/admin\/redemptions\/(\d+)\/status$/)
  if(redemptionStatus&&request.method==='PUT'){
    const id=Number(redemptionStatus[1]),i=await body(request)
    const redemption=await one('SELECT * FROM redemptions WHERE id=$1',[id])
    if(!redemption)return json({detail:'兑换记录不存在'},404)
    const next=i.status
    const allowed=['待审核','已通过','已拒绝','已发货','已领取','已取消','已完成']
    if(!allowed.includes(next))return json({detail:'无效的审核状态'},400)
    const closed=['已拒绝','已取消']
    if(closed.includes(next)&&!closed.includes(redemption.status)){
      await rows('UPDATE products SET available_stock=COALESCE(available_stock,0)+1,locked_stock=GREATEST(COALESCE(locked_stock,0)-1,0) WHERE id=$1',[redemption.product_id])
    }else if(!closed.includes(next)&&closed.includes(redemption.status)){
      const stock=await one('UPDATE products SET available_stock=COALESCE(available_stock,0)-1,locked_stock=COALESCE(locked_stock,0)+1 WHERE id=$1 AND COALESCE(available_stock,0)>0 RETURNING id',[redemption.product_id])
      if(!stock)return json({detail:'商品库存不足，无法恢复此兑换'},400)
    }
    const updates=['status=$1','reject_reason=$2','express_company=$3','tracking_number=$4','updated_at=NOW()']
    if(next==='已通过')updates.push('approved_at=NOW()')
    if(next==='已发货')updates.push('shipped_at=NOW()')
    if(next==='已领取'||next==='已完成')updates.push('received_at=NOW()')
    const expressCompany=Object.prototype.hasOwnProperty.call(i,'express_company')?(i.express_company||null):redemption.express_company
    const trackingNumber=Object.prototype.hasOwnProperty.call(i,'tracking_number')?(i.tracking_number||null):redemption.tracking_number
    const updated=await one(`UPDATE redemptions SET ${updates.join(',')} WHERE id=$5 RETURNING *`,[next,next==='已拒绝'?(i.reject_reason||null):null,expressCompany,trackingNumber,id])
    return json(updated)
  }
  const redemptionAction=pathname.match(/^\/api\/admin\/redemptions\/(\d+)\/(approve|reject|ship|receive)$/)
  if(redemptionAction&&request.method==='PUT'){const input=await body(request),statusMap={approve:'已通过',reject:'已拒绝',ship:'已发货',receive:'已领取'};const fake=new Request(request.url,{method:'PUT',headers:request.headers,body:JSON.stringify({...input,status:statusMap[redemptionAction[2]]})});return adminExtendedRoutes(fake,`/api/admin/redemptions/${redemptionAction[1]}/status`,url)}

  if(pathname==='/api/admin/on-site/exchange'&&request.method==='POST'){const i=await body(request),studentId=Number(i.student_id),productId=Number(i.product_id),product=await one("SELECT * FROM products WHERE id=$1 AND product_status IN ('可兑换','即将售罄')",[productId]);if(!product)return json({detail:'商品未上架或不存在'},404);const balance=await balanceFor(studentId);if(balance.available<product.points_required)return json({detail:`兑换失败：当前只有 ${balance.available} 分，需要 ${product.points_required} 分`},400);const stock=await one('UPDATE products SET on_site_stock=on_site_stock-1,total_stock=GREATEST(total_stock-1,0) WHERE id=$1 AND on_site_stock>0 RETURNING *',[productId]);if(!stock)return json({detail:'现场库存不足'},400);const redemption=await one("INSERT INTO redemptions(student_id,product_id,points_spent,status,pickup_method,approved_at,received_at) VALUES($1,$2,$3,'已完成','现场领取',NOW(),NOW()) RETURNING *",[studentId,productId,product.points_required]);return json(redemption,201)}
  if(pathname==='/api/admin/on-site/reward'&&request.method==='POST'){const i=await body(request),studentId=Number(i.student_id),productId=Number(i.product_id),stock=await one('UPDATE products SET on_site_stock=on_site_stock-1,total_stock=GREATEST(total_stock-1,0) WHERE id=$1 AND on_site_stock>0 RETURNING *',[productId]);if(!stock)return json({detail:'现场库存不足'},400);return json(await one(`INSERT INTO prize_awards(student_id,product_id,phase_id,group_id,award_type,created_by,description) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[studentId,productId,numberOrNull(i.phase_id),numberOrNull(i.group_id),i.award_type||'其他',admin.id,i.description||null]),201)}

  if(pathname==='/api/admin/yearly/overview'&&request.method==='GET'){
    const years=await rows(`SELECT y.id AS year_id,y.name AS year_name,COUNT(DISTINCT p.id)::int AS project_count,
      (SELECT COUNT(*)::int FROM training_projects ap WHERE ap.year_id=y.id) AS total_project_count,
      COUNT(DISTINCT pe.student_id)::int AS student_count,COUNT(DISTINCT g.id)::int AS group_count,
      COUNT(DISTINCT ph.id)::int AS phase_count,
      COALESCE((SELECT SUM(points) FROM points WHERE year_id=y.id AND points>0 AND status IN ('有效','active')),0)::int AS earned_points,
      COALESCE((SELECT SUM(points) FROM team_points WHERE year_id=y.id AND status IN ('有效','active')),0)::int AS team_points,
      COALESCE((SELECT ABS(SUM(points)) FROM points WHERE year_id=y.id AND points<0 AND status IN ('有效','active')),0)::int AS deducted_points,
      (SELECT COUNT(*)::int FROM points WHERE year_id=y.id AND status IN ('有效','active')) AS point_records,
      (SELECT COUNT(*)::int FROM redemptions r JOIN project_enrollments re ON re.student_id=r.student_id WHERE re.year_id=y.id AND r.status NOT IN ('已拒绝','已取消')) AS redemption_count,
      COALESCE((SELECT SUM(r.points_spent) FROM redemptions r JOIN project_enrollments re ON re.student_id=r.student_id WHERE re.year_id=y.id AND r.status NOT IN ('已拒绝','已取消')),0)::int AS redeemed_points,
      (SELECT COUNT(*)::int FROM prize_awards pa JOIN project_enrollments ae ON ae.student_id=pa.student_id WHERE ae.year_id=y.id) AS award_count
      FROM academic_years y JOIN training_projects p ON p.year_id=y.id AND p.status IN ('archived','已归档')
      LEFT JOIN project_enrollments pe ON pe.project_id=p.id LEFT JOIN groups g ON g.project_id=p.id LEFT JOIN phases ph ON ph.project_id=p.id
      GROUP BY y.id,y.name ORDER BY y.name DESC`)
    for(const year of years){
      year.net_points=Number(year.earned_points)-Number(year.deducted_points)-Number(year.redeemed_points)
      year.team_final_score=Number(year.earned_points)-Number(year.deducted_points)+Number(year.team_points)
      year.categories=await rows(`SELECT category,COUNT(*)::int AS records,COALESCE(SUM(points),0)::int AS points FROM points WHERE year_id=$1 AND status IN ('有效','active') GROUP BY category ORDER BY points DESC`,[year.year_id])
      year.projects=await rows(`SELECT p.id,p.name,
        (SELECT COUNT(DISTINCT student_id)::int FROM project_enrollments WHERE project_id=p.id) AS student_count,
        (SELECT COUNT(*)::int FROM groups WHERE project_id=p.id) AS group_count,
        (SELECT COUNT(*)::int FROM phases WHERE project_id=p.id) AS phase_count,
        (SELECT COUNT(*)::int FROM points WHERE project_id=p.id AND status IN ('有效','active')) AS point_records,
        COALESCE((SELECT SUM(points)::int FROM points WHERE project_id=p.id AND status IN ('有效','active')),0) AS earned_points
        ,COALESCE((SELECT SUM(points)::int FROM team_points WHERE project_id=p.id AND status IN ('有效','active')),0) AS team_points
        FROM training_projects p WHERE p.year_id=$1 AND p.status IN ('archived','已归档') ORDER BY p.id`,[year.year_id])
    }
    return json({years,scope_note:'仅汇总已归档项目；项目归档后数据会自动进入年度汇总。'})
  }
  if(pathname==='/api/admin/yearly/archive'&&request.method==='POST'){const input=await body(request),yearId=numberOrNull(input.year_id);if(!yearId)return json({detail:'请选择年度'},400);await rows("UPDATE training_projects SET status='archived' WHERE year_id=$1",[yearId]);await rows("UPDATE phases SET status='已归档' WHERE year_id=$1",[yearId]);await rows("UPDATE academic_years SET status='archived' WHERE id=$1",[yearId]);return json({message:'年度数据已归档'})}
  if(pathname==='/api/admin/operation-logs'&&request.method==='GET'){const {page,pageSize,offset}=pageInfo(url);const keyword=url.searchParams.get('keyword')||'',action=url.searchParams.get('action')||'';const args=[`%${keyword}%`,action];const where="($1='%%' OR u.real_name ILIKE $1 OR ol.detail ILIKE $1) AND ($2='' OR ol.action=$2)";const total=Number((await one(`SELECT COUNT(*)::int AS total FROM operation_logs ol JOIN users u ON u.id=ol.admin_id WHERE ${where}`,args)).total);const items=await rows(`SELECT ol.*,u.real_name AS admin_name FROM operation_logs ol JOIN users u ON u.id=ol.admin_id WHERE ${where} ORDER BY ol.id DESC LIMIT $3 OFFSET $4`,[...args,pageSize,offset]);return json({items,total,page,page_size:pageSize,total_pages:Math.max(1,Math.ceil(total/pageSize))})}
  return null
}

async function studentRoutes(request, pathname, url) {
  const student=await requireUser(request,'student'); if(student instanceof Response)return student
  const requestedProjectId=numberOrNull(url.searchParams.get('project_id'))
  const enrollment=await one(`SELECT pe.*,y.name AS year_name,p.name AS project_name,g.name AS group_name FROM project_enrollments pe
    JOIN academic_years y ON y.id=pe.year_id JOIN training_projects p ON p.id=pe.project_id LEFT JOIN groups g ON g.id=pe.group_id
    WHERE pe.student_id=$1 AND ($2::bigint IS NULL OR pe.project_id=$2) ORDER BY pe.year_id DESC LIMIT 1`,[student.id,requestedProjectId])
  if(pathname==='/api/student/dashboard'&&request.method==='GET'){
    const balance=await balanceFor(student.id),projectId=enrollment?.project_id||student.project_id||null
    const currentPhase=projectId?await one("SELECT * FROM phases WHERE project_id=$1 AND status IN ('进行中','in_progress') ORDER BY id DESC LIMIT 1",[projectId]):null
    const periodPoints=projectId?Number((await one("SELECT COALESCE(SUM(points),0)::int AS total FROM points WHERE student_id=$1 AND project_id=$2 AND status IN ('有效','active')",[student.id,projectId]))?.total||0):0
    const phasePoints=projectId?await rows(`SELECT ph.id AS phase_id,ph.name AS phase_name,ph.status,COALESCE(SUM(pt.points) FILTER (WHERE pt.status IN ('有效','active')),0)::int AS points FROM phases ph LEFT JOIN points pt ON pt.phase_id=ph.id AND pt.student_id=$1 WHERE ph.project_id=$2 GROUP BY ph.id,ph.name,ph.status ORDER BY ph.start_date`,[student.id,projectId]):[]
    for(const phase of phasePoints){const rank=await one(`SELECT rank FROM (SELECT student_id,RANK() OVER(ORDER BY SUM(points) DESC)::int AS rank FROM points WHERE phase_id=$1 AND status IN ('有效','active') GROUP BY student_id) r WHERE student_id=$2`,[phase.phase_id,student.id]);phase.rank=rank?.rank||null}
    const currentRank=projectId?await one(`SELECT rank FROM (SELECT student_id,RANK() OVER(ORDER BY SUM(points) DESC)::int AS rank FROM points WHERE project_id=$1 AND status IN ('有效','active') GROUP BY student_id) r WHERE student_id=$2`,[projectId,student.id]):null
    const recentPoints=await rows('SELECT id,points,category,description,created_at FROM points WHERE student_id=$1 ORDER BY id DESC LIMIT 5',[student.id]);const recentRedemptions=await rows(`SELECT r.id,r.status,r.points_spent,r.created_at,p.name AS product_name,p.image_url FROM redemptions r JOIN products p ON p.id=r.product_id WHERE r.student_id=$1 ORDER BY r.id DESC LIMIT 5`,[student.id])
    const groupId=enrollment?.group_id||null
    const groupPersonal=groupId?Number((await one("SELECT COALESCE(SUM(pt.points),0)::int AS total FROM points pt JOIN group_members gm ON gm.student_id=pt.student_id WHERE gm.group_id=$1 AND pt.project_id=$2 AND pt.status IN ('有效','active')",[groupId,projectId]))?.total||0):0
    const teamPoints=groupId?Number((await one("SELECT COALESCE(SUM(points),0)::int AS total FROM team_points WHERE group_id=$1 AND project_id=$2 AND status IN ('有效','active')",[groupId,projectId]))?.total||0):0
    const groupScores=projectId?await rows(`SELECT g.id,COALESCE((SELECT SUM(pt.points) FROM points pt JOIN group_members gm ON gm.student_id=pt.student_id WHERE gm.group_id=g.id AND pt.project_id=$1 AND pt.status IN ('有效','active')),0)::int+COALESCE((SELECT SUM(tp.points) FROM team_points tp WHERE tp.group_id=g.id AND tp.project_id=$1 AND tp.status IN ('有效','active')),0)::int AS final_score FROM groups g WHERE g.project_id=$1 ORDER BY final_score DESC`,[projectId]):[]
    return json({real_name:student.real_name,year_name:enrollment?.year_name||'',project_name:enrollment?.project_name||'',group_name:enrollment?.group_name||'',period_points:periodPoints,period_rank:currentRank?.rank||null,total_points:balance.earned,personal_cumulative_points:balance.earned,available_points:balance.available,team_points:teamPoints,team_member_points:groupPersonal,team_final_score:groupPersonal+teamPoints,current_phase:currentPhase?.name||null,current_phase_points:currentPhase?phasePoints.find(p=>String(p.phase_id)===String(currentPhase.id))?.points||0:0,current_phase_rank:currentPhase?phasePoints.find(p=>String(p.phase_id)===String(currentPhase.id))?.rank||null:0,group_rank:groupId?groupScores.findIndex(item=>String(item.id)===String(groupId))+1:null,phase_points:phasePoints,recent_points:recentPoints,recent_redemptions:recentRedemptions})
  }
  if(pathname==='/api/student/phase-overview'&&request.method==='GET'){
    const projectId=enrollment?.project_id||student.project_id||null;if(!projectId)return json({phases:[]})
    const phases=await rows(`SELECT ph.id AS phase_id,ph.name AS phase_name,ph.status,ph.start_date,ph.end_date,p.name AS project_name,y.name AS year_name,COALESCE(SUM(pt.points) FILTER(WHERE pt.status IN ('有效','active')),0)::int AS points FROM phases ph JOIN training_projects p ON p.id=ph.project_id JOIN academic_years y ON y.id=ph.year_id LEFT JOIN points pt ON pt.phase_id=ph.id AND pt.student_id=$1 WHERE ph.project_id=$2 GROUP BY ph.id,p.name,y.name ORDER BY ph.start_date`,[student.id,projectId]);for(const phase of phases){const rank=await one(`SELECT rank FROM (SELECT student_id,RANK() OVER(ORDER BY SUM(points) DESC)::int AS rank FROM points WHERE phase_id=$1 AND status IN ('有效','active') GROUP BY student_id) r WHERE student_id=$2`,[phase.phase_id,student.id]);phase.rank=rank?.rank||null}return json({phases})
  }
  const studentPhase=pathname.match(/^\/api\/student\/phases\/(\d+)$/);if(studentPhase&&request.method==='GET'){
    const phaseId=Number(studentPhase[1]),phase=await one(`SELECT ph.*,p.name AS project_name,y.name AS year_name FROM phases ph JOIN training_projects p ON p.id=ph.project_id JOIN academic_years y ON y.id=ph.year_id WHERE ph.id=$1`,[phaseId]);if(!phase)return json({detail:'阶段不存在'},404)
    const personal=await rows(`SELECT u.id AS student_id,u.real_name AS student_name,g.name AS group_name,COALESCE(SUM(pt.points) FILTER(WHERE pt.status IN ('有效','active')),0)::int AS total_points FROM project_enrollments pe JOIN users u ON u.id=pe.student_id LEFT JOIN groups g ON g.id=pe.group_id LEFT JOIN points pt ON pt.student_id=u.id AND pt.phase_id=$1 WHERE pe.project_id=$2 GROUP BY u.id,u.real_name,g.name ORDER BY total_points DESC`,[phaseId,phase.project_id]);personal.forEach((p,i)=>{p.rank=i+1;p.is_me=String(p.student_id)===String(student.id)})
    const groups=await rows(`SELECT g.id AS group_id,g.name AS group_name,
      (SELECT COUNT(*)::int FROM (SELECT pe.student_id FROM project_enrollments pe WHERE pe.project_id=$2 AND pe.group_id=g.id UNION SELECT gm.student_id FROM group_members gm WHERE gm.group_id=g.id) members) AS member_count,
      COALESCE((SELECT SUM(pt.points) FROM points pt WHERE pt.project_id=$2 AND pt.phase_id=$1 AND pt.status IN ('有效','active') AND pt.student_id IN (SELECT pe.student_id FROM project_enrollments pe WHERE pe.project_id=$2 AND pe.group_id=g.id UNION SELECT gm.student_id FROM group_members gm WHERE gm.group_id=g.id)),0)::int AS personal_points,
      COALESCE((SELECT SUM(tp.points) FROM team_points tp WHERE tp.group_id=g.id AND tp.project_id=$2 AND tp.phase_id=$1 AND tp.status IN ('有效','active')),0)::int AS team_points,
      (SELECT COUNT(*)::int FROM team_points tp WHERE tp.group_id=g.id AND tp.project_id=$2 AND tp.phase_id=$1 AND tp.status IN ('有效','active')) AS team_record_count
      FROM groups g WHERE g.project_id=$2`,[phaseId,phase.project_id]);groups.forEach(g=>{g.total_points=Number(g.personal_points)+Number(g.team_points);g.final_score=g.total_points;g.avg_points=g.member_count?Math.round(g.total_points*100/g.member_count)/100:0});groups.sort((a,b)=>b.final_score-a.final_score).forEach((g,i)=>g.rank=i+1)
    groups.forEach(group=>group.is_my_group=String(group.group_id)===String(enrollment?.group_id))
    const categoryDetails=await rows("SELECT category,COALESCE(SUM(points),0)::int AS points FROM points WHERE phase_id=$1 AND student_id=$2 AND status IN ('有效','active') GROUP BY category ORDER BY category",[phaseId,student.id])
    return json({...phase,category_details:categoryDetails,personal_rankings:personal,rankings:personal,group_rankings:groups,my_ranking:personal.find(p=>String(p.student_id)===String(student.id))||null,my_group_ranking:groups.find(g=>String(g.group_id)===String(enrollment?.group_id))||null})
  }
  if(pathname==='/api/student/points/records'&&request.method==='GET'){
    const {page,pageSize,offset}=pageInfo(url)
    const yearId=numberOrNull(url.searchParams.get('year_id')),projectId=numberOrNull(url.searchParams.get('project_id')),phaseId=numberOrNull(url.searchParams.get('phase_id')),category=url.searchParams.get('category')||''
    const args=[student.id,yearId,projectId,phaseId,category]
    const where="pt.student_id=$1 AND ($2::bigint IS NULL OR pt.year_id=$2) AND ($3::bigint IS NULL OR pt.project_id=$3) AND ($4::bigint IS NULL OR pt.phase_id=$4) AND ($5='' OR pt.category=$5)"
    const total=Number((await one(`SELECT COUNT(*)::int AS total FROM points pt WHERE ${where}`,args)).total)
    const items=await rows(`SELECT pt.*,y.name AS year_name,p.name AS project_name,ph.name AS phase_name FROM points pt LEFT JOIN academic_years y ON y.id=pt.year_id LEFT JOIN training_projects p ON p.id=pt.project_id LEFT JOIN phases ph ON ph.id=pt.phase_id WHERE ${where} ORDER BY pt.id DESC LIMIT $6 OFFSET $7`,[...args,pageSize,offset])
    return json({items,total,page,page_size:pageSize,total_pages:Math.max(1,Math.ceil(total/pageSize))})
  }
  if(pathname==='/api/student/products'&&request.method==='GET')return json(await rows("SELECT * FROM products WHERE product_status IN ('可兑换','即将售罄') AND available_stock>0 ORDER BY id DESC"))
  if(pathname==='/api/student/redemptions'&&request.method==='POST'){const i=await body(request),product=await one("SELECT * FROM products WHERE id=$1 AND product_status IN ('可兑换','即将售罄')",[Number(i.product_id)]);if(!product)return json({detail:'商品未上架或不存在'},404);const balance=await balanceFor(student.id);if(balance.available<product.points_required)return json({detail:`积分不足：当前 ${balance.available} 分，需要 ${product.points_required} 分`},400);if(product.is_limited&&product.limit_per_person){const count=Number((await one("SELECT COUNT(*)::int AS count FROM redemptions WHERE student_id=$1 AND product_id=$2 AND status NOT IN ('已拒绝','已取消')",[student.id,product.id])).count);if(count>=product.limit_per_person)return json({detail:'已达到该商品每人兑换上限'},400)}const stock=await one('UPDATE products SET available_stock=available_stock-1,locked_stock=locked_stock+1 WHERE id=$1 AND available_stock>0 RETURNING id',[product.id]);if(!stock)return json({detail:'商品库存不足'},400);return json(await one("INSERT INTO redemptions(student_id,product_id,points_spent,status,locked_at,address_snapshot) VALUES($1,$2,$3,'待审核',NOW(),$4) RETURNING *",[student.id,product.id,product.points_required,student.address||null]),201)}
  if(pathname==='/api/student/redemptions'&&request.method==='GET'){const {page,pageSize,offset}=pageInfo(url);const status=url.searchParams.get('status')||'';const total=Number((await one("SELECT COUNT(*)::int AS total FROM redemptions WHERE student_id=$1 AND ($2='' OR status=$2)",[student.id,status])).total);const items=await rows(`SELECT r.*,p.name AS product_name,p.image_url FROM redemptions r JOIN products p ON p.id=r.product_id WHERE r.student_id=$1 AND ($2='' OR r.status=$2) ORDER BY r.id DESC LIMIT $3 OFFSET $4`,[student.id,status,pageSize,offset]);return json({items,total,page,page_size:pageSize,total_pages:Math.max(1,Math.ceil(total/pageSize))})}
  const cancelMatch=pathname.match(/^\/api\/student\/redemptions\/(\d+)\/cancel$/);if(cancelMatch&&request.method==='PUT'){const id=Number(cancelMatch[1]),r=await one("SELECT * FROM redemptions WHERE id=$1 AND student_id=$2 AND status IN ('待审核','已通过')",[id,student.id]);if(!r)return json({detail:'当前状态不可取消'},400);await rows("UPDATE redemptions SET status='已取消',updated_at=NOW() WHERE id=$1",[id]);await rows('UPDATE products SET available_stock=available_stock+1,locked_stock=GREATEST(locked_stock-1,0) WHERE id=$1',[r.product_id]);return json({message:'兑换已取消'})}
  if(pathname==='/api/student/history'&&request.method==='GET'){
    const history=await rows(`SELECT pe.year_id,pe.project_id,y.name AS year_name,p.name AS project_name,g.name AS group_name,
      COALESCE(SUM(pt.points) FILTER(WHERE pt.status IN ('有效','active')),0)::int AS period_points
      FROM project_enrollments pe JOIN academic_years y ON y.id=pe.year_id JOIN training_projects p ON p.id=pe.project_id
      LEFT JOIN groups g ON g.id=pe.group_id LEFT JOIN points pt ON pt.student_id=pe.student_id AND pt.project_id=pe.project_id
      WHERE pe.student_id=$1 GROUP BY pe.id,pe.year_id,pe.project_id,y.name,p.name,g.name ORDER BY pe.year_id DESC`,[student.id])
    for(const item of history){
      item.phases=await rows(`SELECT ph.id AS phase_id,ph.name AS phase_name,COALESCE(SUM(pt.points) FILTER(WHERE pt.status IN ('有效','active')),0)::int AS points
        FROM phases ph LEFT JOIN points pt ON pt.phase_id=ph.id AND pt.student_id=$1 WHERE ph.project_id=$2 GROUP BY ph.id,ph.name ORDER BY ph.start_date`,[student.id,item.project_id])
      const rank=await one(`SELECT rank FROM (SELECT student_id,RANK() OVER(ORDER BY SUM(points) DESC)::int AS rank FROM points WHERE project_id=$1 AND status IN ('有效','active') GROUP BY student_id) x WHERE student_id=$2`,[item.project_id,student.id]);item.rank=rank?.rank||null
    }
    return json({history})
  }
  if(pathname==='/api/student/profile'&&request.method==='GET')return json({...student,...enrollment})
  if(pathname==='/api/student/profile'&&request.method==='PUT'){const i=await body(request);return json(await one('UPDATE users SET email=$1,phone=$2,address=$3 WHERE id=$4 RETURNING id,username,real_name,email,phone,address,system,level1_dept,position',[i.email||null,i.phone||null,i.address||null,student.id]))}
  if(pathname==='/api/student/rule-text'&&request.method==='GET')return json(await rows('SELECT * FROM rule_texts ORDER BY id DESC'))
  if(pathname==='/api/student/team'&&request.method==='GET'){
    if(!enrollment?.project_id)return json({group:null,members:[],all_groups:[],team_point_records:[]})
    const projectPersonalRankings=await rows(`SELECT u.id AS student_id,u.real_name AS student_name,g.name AS group_name,
      COALESCE(SUM(pt.points) FILTER(WHERE pt.status IN ('有效','active')),0)::int AS total_points
      FROM project_enrollments pe JOIN users u ON u.id=pe.student_id LEFT JOIN groups g ON g.id=pe.group_id
      LEFT JOIN points pt ON pt.student_id=u.id AND pt.project_id=pe.project_id
      WHERE pe.project_id=$1 GROUP BY u.id,u.real_name,g.name ORDER BY total_points DESC,u.id`,[enrollment.project_id])
    projectPersonalRankings.forEach((item,index)=>{item.rank=index+1;item.is_me=String(item.student_id)===String(student.id)})
    const groupRanks=await rows(`SELECT g.id,g.name,
      (SELECT COUNT(DISTINCT member_id)::int FROM (SELECT pe.student_id AS member_id FROM project_enrollments pe WHERE pe.project_id=$1 AND pe.group_id=g.id UNION SELECT gm.student_id AS member_id FROM group_members gm WHERE gm.group_id=g.id) member_rows) AS member_count,
      COALESCE((SELECT SUM(pt.points) FROM points pt WHERE pt.project_id=$1 AND pt.status IN ('有效','active') AND pt.student_id IN (SELECT pe.student_id FROM project_enrollments pe WHERE pe.project_id=$1 AND pe.group_id=g.id UNION SELECT gm.student_id FROM group_members gm WHERE gm.group_id=g.id)),0)::int AS personal_points,
      COALESCE((SELECT SUM(tp.points) FROM team_points tp WHERE tp.group_id=g.id AND tp.project_id=$1 AND tp.status IN ('有效','active')),0)::int AS team_points
      FROM groups g WHERE g.project_id=$1`,[enrollment.project_id])
    groupRanks.forEach(item=>item.final_score=Number(item.personal_points)+Number(item.team_points))
    groupRanks.sort((a,b)=>b.final_score-a.final_score).forEach((item,index)=>{item.rank=index+1;item.is_my_group=String(item.id)===String(enrollment.group_id)})
    if(!enrollment.group_id)return json({group:null,members:[],all_groups:groupRanks,project_personal_rankings:projectPersonalRankings,team_point_records:[]})
    const group=await one('SELECT * FROM groups WHERE id=$1',[enrollment.group_id])
    const members=await rows(`SELECT u.id AS student_id,u.real_name AS student_name,u.level1_dept AS department,gm.role,
      COALESCE(SUM(pt.points) FILTER(WHERE pt.status IN ('有效','active')),0)::int AS period_points
      FROM group_members gm JOIN users u ON u.id=gm.student_id LEFT JOIN points pt ON pt.student_id=u.id AND pt.project_id=$1
      WHERE gm.group_id=$2 GROUP BY u.id,u.real_name,u.level1_dept,gm.role ORDER BY period_points DESC`,[enrollment.project_id,enrollment.group_id])
    members.forEach((member,index)=>member.rank=index+1)
    const personalTotal=members.reduce((sum,member)=>sum+Number(member.period_points),0)
    const teamPoints=Number((await one("SELECT COALESCE(SUM(points),0)::int AS total FROM team_points WHERE group_id=$1 AND project_id=$2 AND status IN ('有效','active')",[group.id,enrollment.project_id]))?.total||0)
    const recentTeamPoints=await rows(`SELECT tp.id,tp.category,tp.item_name,tp.points,tp.obtained_date,ph.name AS phase_name FROM team_points tp LEFT JOIN phases ph ON ph.id=tp.phase_id WHERE tp.group_id=$1 AND tp.project_id=$2 AND tp.status IN ('有效','active') ORDER BY tp.obtained_date DESC,tp.id DESC LIMIT 20`,[group.id,enrollment.project_id])
    return json({group:{...group,member_count:members.length,personal_points:personalTotal,team_points:teamPoints,total_points:personalTotal+teamPoints,final_score:personalTotal+teamPoints,avg_points:members.length?Math.round((personalTotal+teamPoints)*100/members.length)/100:0,rank:groupRanks.findIndex(item=>String(item.id)===String(group.id))+1},members,all_groups:groupRanks,project_personal_rankings:projectPersonalRankings,team_point_records:recentTeamPoints})
  }
  const teamPhase=pathname.match(/^\/api\/student\/team\/phases\/(\d+)$/)
  if(teamPhase&&request.method==='GET'){
    const phaseId=Number(teamPhase[1]);if(!enrollment?.group_id)return json({group:null,members:[]})
    const members=await rows(`SELECT u.id AS student_id,u.real_name AS student_name,COALESCE(SUM(pt.points) FILTER(WHERE pt.status IN ('有效','active')),0)::int AS points FROM group_members gm JOIN users u ON u.id=gm.student_id LEFT JOIN points pt ON pt.student_id=u.id AND pt.phase_id=$1 WHERE gm.group_id=$2 GROUP BY u.id,u.real_name ORDER BY points DESC`,[phaseId,enrollment.group_id]);members.forEach((member,index)=>member.rank=index+1);return json({phase_id:phaseId,group_id:enrollment.group_id,members})
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
      const extendedResponse = await adminExtendedRoutes(request, pathname, url); if (extendedResponse) return extendedResponse
    }
    if (pathname.startsWith('/api/student/')) {
      const response = await studentRoutes(request,pathname,url); if(response) return response
    }
    return json({detail:'接口不存在',path:pathname},404)
  } catch (error) {
    console.error(error)
    return json({detail:'云端接口处理失败'},500)
  }
}

export const config = { path: '/api/*' }
