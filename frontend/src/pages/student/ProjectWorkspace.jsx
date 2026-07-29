import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { ArrowLeft, ArrowRight, CalendarDays, Crown, Gift, Medal, TrendingUp, Trophy, UserRound, Users, X } from 'lucide-react'

const dateText = (value) => value ? new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'
const phaseTone = ['from-emerald-50 to-green-100/60 border-emerald-100', 'from-cyan-50 to-blue-100/60 border-cyan-100', 'from-indigo-50 to-violet-100/60 border-indigo-100']

export default function StudentProjectWorkspace({ view = 'overview' }) {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [phases, setPhases] = useState([])
  const [phaseDetails, setPhaseDetails] = useState([])
  const [team, setTeam] = useState(null)
  const [project, setProject] = useState(null)
  const [personalRecords, setPersonalRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [rankingModal, setRankingModal] = useState(null)

  useEffect(() => {
    const params = { project_id: projectId }
    Promise.all([
      api.get('/api/student/dashboard', { params }),
      api.get('/api/student/phase-overview', { params }),
      api.get('/api/student/team', { params }),
      api.get('/api/common/projects'),
      api.get('/api/student/points/records', { params: { ...params, page_size: 100 } }),
    ]).then(async ([dashboardRes, phaseRes, teamRes, projectRes, recordsRes]) => {
      const nextPhases = phaseRes.data?.phases || []
      setStats(dashboardRes.data)
      setPhases(nextPhases)
      setTeam(teamRes.data)
      setPersonalRecords(recordsRes.data?.items || [])
      const allProjects = projectRes.data?.items || projectRes.data || []
      setProject(allProjects.find((item) => String(item.id) === String(projectId)) || null)
      if (view === 'personal' || view === 'team') {
        const details = await Promise.all(nextPhases.map((phase) => api.get(`/api/student/phases/${phase.phase_id}`, { params }).then((res) => res.data).catch(() => null)))
        setPhaseDetails(details)
      }
    }).finally(() => setLoading(false))
  }, [projectId, view])

  useEffect(() => {
    if (!rankingModal) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setRankingModal(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = ''
    }
  }, [rankingModal])

  const group = team?.group || {}
  const currentPhaseIndex = phases.findIndex((item) => ['进行中', 'in_progress'].includes(item.status))
  const phaseGroupRankings = (phaseDetails[currentPhaseIndex >= 0 ? currentPhaseIndex : 0]?.group_rankings || [])
  const groups = team?.all_groups?.length ? team.all_groups : phaseGroupRankings
  const teamFinalScore = Number(group.final_score ?? group.total_points ?? stats?.team_final_score ?? 0)
  const teamRank = group.rank || groups.find((item) => item.is_my_group)?.rank || stats?.group_rank
  const maxTeamScore = Math.max(...groups.map((item) => Number(item.final_score || item.total_points || 0)), 1)
  const teamRecords = team?.team_point_records || []

  if (loading) return <AppLayout><div className="flex h-72 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-b-indigo-600" /></div></AppLayout>

  const title = stats?.project_name || project?.name || '项目详情'

  return <AppLayout>
    <button onClick={() => navigate(view === 'overview' ? '/student/points' : `/student/projects/${projectId}`)} className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600"><ArrowLeft className="h-4 w-4" />{view === 'overview' ? '返回我的项目' : '返回项目详情'}</button>
    <section className="mb-6 flex flex-col justify-between gap-5 lg:flex-row lg:items-start"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-500">{view === 'personal' ? 'Personal Points' : view === 'team' ? 'Team Points' : 'Project Overview'}</p><h1 className="mt-2 text-3xl font-black text-slate-900">{view === 'personal' ? '个人积分' : view === 'team' ? '团队积分' : title}</h1>{view !== 'overview' && <p className="mt-1 text-sm font-semibold text-slate-500">{title}</p>}<p className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400"><span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{dateText(project?.start_date)} - {dateText(project?.end_date)}</span><span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />我的小组：{stats?.group_name || group.name || '暂未分组'}</span></p></div>
      <div className="glass-panel flex items-center gap-7 rounded-3xl border px-6 py-4"><div><p className="text-[10px] text-slate-400">{view === 'team' ? '团队积分' : '当前积分'}</p><p className="mt-1 text-3xl font-black text-indigo-600">{view === 'team' ? teamFinalScore : stats?.period_points || 0}<span className="ml-1 text-xs">分</span></p></div><div className="h-10 w-px bg-slate-100" /><div><p className="text-[10px] text-slate-400">{view === 'team' ? '团队排名' : '当前排名'}</p><p className="mt-1 text-xl font-black text-slate-800">{(view === 'team' ? teamRank : stats?.period_rank) ? `第 ${view === 'team' ? teamRank : stats.period_rank} 名` : '暂无'}</p></div><Trophy className="h-11 w-11 text-amber-400" /></div>
    </section>

    {view === 'overview' && <div className="grid gap-5 md:grid-cols-2">
      <button onClick={() => navigate(`/student/projects/${projectId}/personal`)} className="group glass-panel hover-lift relative overflow-hidden rounded-[28px] border-2 border-indigo-200 p-7 text-left"><div className="absolute -right-8 -top-10 h-44 w-44 rounded-full bg-indigo-100/70 blur-xl" /><div className="relative flex items-center justify-between gap-5"><div><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600"><UserRound className="h-6 w-6" /></div><h2 className="text-2xl font-black text-indigo-700">个人积分</h2><p className="mt-2 text-sm text-slate-500">查看各阶段个人积分、阶段排名及 TOP 学员。</p><span className="mt-6 inline-flex items-center gap-1 text-xs font-black text-indigo-600">进入个人积分 <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></div><UserRound className="h-24 w-24 text-indigo-200" /></div></button>
      <button onClick={() => navigate(`/student/projects/${projectId}/team`)} className="group glass-panel hover-lift relative overflow-hidden rounded-[28px] border-2 border-violet-200 p-7 text-left"><div className="absolute -right-8 -top-10 h-44 w-44 rounded-full bg-violet-100/70 blur-xl" /><div className="relative flex items-center justify-between gap-5"><div><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-600"><Users className="h-6 w-6" /></div><h2 className="text-2xl font-black text-violet-700">团队积分</h2><p className="mt-2 text-sm text-slate-500">查看团队最终得分、小组排名及团队荣誉。</p><span className="mt-6 inline-flex items-center gap-1 text-xs font-black text-violet-600">进入团队积分 <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></div><Users className="h-24 w-24 text-violet-200" /></div></button>
    </div>}

    {view === 'personal' && <><section className="grid gap-5 lg:grid-cols-3">{phases.map((phase, index) => {
      const detail = phaseDetails[index] || {}
      const rankings = (detail.personal_rankings || detail.rankings || []).slice(0, 3)
      return <button type="button" aria-label={`查看${phase.phase_name}全部学员排名`} onClick={() => setRankingModal({ type: 'personal', title: phase.phase_name, rows: detail.personal_rankings || detail.rankings || [] })} key={phase.phase_id} className={`group rounded-[26px] border bg-gradient-to-br p-6 text-left shadow-lg shadow-slate-200/30 transition hover:-translate-y-1 hover:shadow-xl ${phaseTone[index % phaseTone.length]}`}><div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-bold text-slate-500">第 {index + 1} 阶段</p><h2 className="mt-1 text-lg font-black text-slate-900">{phase.phase_name}</h2></div>{Number(phase.rank) === 1 && <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700"><Crown className="h-3 w-3" />阶段冠军</span>}</div><div className="mb-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/65 p-3"><p className="text-[10px] text-slate-400">我的积分</p><p className="mt-1 text-2xl font-black text-indigo-600">{phase.points || 0}<span className="ml-1 text-xs">分</span></p></div><div className="rounded-2xl bg-white/65 p-3"><p className="text-[10px] text-slate-400">阶段排名</p><p className="mt-1 text-xl font-black text-slate-800">{phase.rank ? `第 ${phase.rank} 名` : '暂无'}</p></div></div><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">阶段积分 TOP3</p><span className="text-[10px] font-black text-indigo-500 opacity-0 transition group-hover:opacity-100">查看完整排名</span></div><div className="space-y-2">{rankings.length ? rankings.map((item, rankIndex) => <div key={item.student_id} className="flex items-center gap-2 rounded-xl bg-white/55 px-3 py-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${rankIndex === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{rankIndex + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{item.student_name}</span><strong className="text-xs text-indigo-600">{item.total_points || 0} 分</strong></div>) : <p className="py-5 text-center text-xs text-slate-400">暂无排行数据</p>}</div></button>
    })}</section><section id="personal-ledger" className="glass-panel mt-6 overflow-hidden rounded-[28px] border"><div className="border-b border-white/70 px-6 py-5"><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-500">Personal Ledger</p><h2 className="mt-1 text-xl font-black text-slate-900">个人积分流水</h2></div><div className="divide-y divide-white/70">{personalRecords.length ? personalRecords.map((item) => <div key={item.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/40"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${Number(item.points) >= 0 ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'}`}><TrendingUp className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{item.category || '个人积分'}</p><p className="mt-1 text-xs text-slate-400">{item.phase_name || '项目级'} · {item.description || '积分记录'} · {dateText(item.obtained_date || item.created_at)}</p></div><strong className={Number(item.points) >= 0 ? 'text-indigo-600' : 'text-rose-600'}>{Number(item.points) > 0 ? '+' : ''}{item.points} 分</strong></div>) : <p className="py-12 text-center text-sm text-slate-400">暂无个人积分流水</p>}</div></section></>}

    {view === 'team' && <><section className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]"><button type="button" aria-label="查看当前项目全部团队排名" onClick={() => setRankingModal({ type: 'team', title, rows: groups })} className="group glass-panel rounded-[28px] border p-6 text-left transition hover:-translate-y-1 hover:shadow-xl"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-500">Team Ranking</p><h2 className="mt-1 text-xl font-black text-slate-900">团队积分排行榜</h2><p className="mt-1 text-xs font-semibold text-violet-500">点击查看全部小组排名</p></div><Medal className="h-7 w-7 text-amber-400" /></div><div className="space-y-4">{groups.slice(0, 5).map((item, index) => { const score = Number(item.final_score || item.total_points || 0); return <div key={item.id || item.group_id} className={`rounded-2xl p-4 ${item.is_my_group ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'bg-white/50'}`}><div className="mb-2 flex items-center gap-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${index === 0 ? 'bg-amber-100 text-amber-700' : index === 1 ? 'bg-slate-200 text-slate-600' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span><span className="flex-1 text-sm font-black text-slate-800">{item.name || item.group_name}{item.is_my_group && <span className="ml-2 text-[10px] text-indigo-500">我的小组</span>}</span><strong className="text-sm text-violet-600">{score} 分</strong></div><div className="ml-10 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${Math.max(4, score / maxTeamScore * 100)}%` }} /></div></div> })}{!groups.length && <p className="py-12 text-center text-sm text-slate-400">暂无团队排名</p>}</div></button><div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-indigo-100 via-violet-100 to-fuchsia-100 p-7 ring-1 ring-violet-200"><Gift className="h-12 w-12 text-violet-600" /><h2 className="mt-6 text-xl font-black text-violet-800">恭喜第 1 名团队！</h2><p className="mt-3 text-sm leading-6 text-violet-600">冠军团队将获得团队奖励，继续保持协作与领先表现。</p><div className="mt-8 rounded-2xl bg-white/60 p-4"><p className="text-xs text-violet-500">我的团队</p><p className="mt-1 text-lg font-black text-violet-800">{group.name || stats?.group_name || '暂未分组'}</p><p className="mt-3 text-3xl font-black text-violet-600">{teamFinalScore}<span className="ml-1 text-xs">分</span></p></div></div></section><section id="team-ledger" className="glass-panel mt-6 overflow-hidden rounded-[28px] border"><div className="border-b border-white/70 px-6 py-5"><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-500">Team Ledger</p><h2 className="mt-1 text-xl font-black text-slate-900">团队积分流水</h2></div><div className="divide-y divide-white/70">{teamRecords.length ? teamRecords.map((item) => <div key={item.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/40"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600"><Users className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{item.category || item.item_name || '团队积分'}</p><p className="mt-1 text-xs text-slate-400">{item.phase_name || '项目级'} · {item.item_name || '团队任务'} · {dateText(item.obtained_date || item.created_at)}</p></div><strong className="text-violet-600">{Number(item.points) > 0 ? '+' : ''}{item.points} 分</strong></div>) : <p className="py-12 text-center text-sm text-slate-400">暂无团队积分流水</p>}</div></section></>}

    {rankingModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRankingModal(null) }}><section role="dialog" aria-modal="true" aria-labelledby="ranking-modal-title" className="glass-panel max-h-[82vh] w-full max-w-2xl overflow-hidden rounded-[30px] border border-white/80 bg-white/90 shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><p className="text-xs font-black uppercase tracking-[.18em] text-indigo-500">Full Ranking</p><h2 id="ranking-modal-title" className="mt-1 text-xl font-black text-slate-900">{rankingModal.type === 'personal' ? `${rankingModal.title} · 全部学员排名` : `${rankingModal.title} · 全部团队排名`}</h2></div><button type="button" aria-label="关闭排名浮窗" onClick={() => setRankingModal(null)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-indigo-100 hover:text-indigo-600"><X className="h-5 w-5" /></button></header><div className="max-h-[62vh] overflow-y-auto p-4 sm:p-6"><div className="space-y-2">{rankingModal.rows.length ? rankingModal.rows.map((item, index) => { const isPersonal = rankingModal.type === 'personal'; const label = isPersonal ? item.student_name : item.name || item.group_name; const score = Number(isPersonal ? item.total_points || 0 : item.final_score ?? item.total_points ?? 0); const highlighted = item.is_me || item.is_my_group; return <div key={item.student_id || item.id || item.group_id || index} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${highlighted ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'bg-slate-50/80'}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${index === 0 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-indigo-100 text-indigo-700'}`}>{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-black text-slate-800">{label}{highlighted && <span className="ml-2 text-[10px] text-indigo-500">{isPersonal ? '我' : '我的小组'}</span>}</span><strong className="shrink-0 text-base font-black text-indigo-600">{score} 分</strong></div> }) : <p className="py-12 text-center text-sm text-slate-400">暂无排名数据</p>}</div></div></section></div>}
  </AppLayout>
}
