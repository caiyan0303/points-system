import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Pagination from '../../components/Pagination'
import { CalendarDays, Medal, Sparkles, TrendingUp, Users } from 'lucide-react'

const CATEGORIES = ['线上学习', '学习输出', '问卷及测评反馈', '线下出勤', '课堂互动', '结营任务', '小组长职责', '特殊调整']
const dateText = (value) => value ? new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'

export default function StudentPoints() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'team' ? 'team' : 'personal'
  const [stats, setStats] = useState(null)
  const [phases, setPhases] = useState([])
  const [team, setTeam] = useState(null)
  const [projects, setProjects] = useState([])
  const [records, setRecords] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [category, setCategory] = useState('')
  const [phaseId, setPhaseId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/api/student/dashboard'), api.get('/api/student/phase-overview'),
      api.get('/api/student/team'), api.get('/api/common/projects'),
    ]).then(([dashboardRes, phaseRes, teamRes, projectRes]) => {
      setStats(dashboardRes.data); setPhases(phaseRes.data?.phases || []); setTeam(teamRes.data); setProjects(projectRes.data?.items || projectRes.data || [])
    }).finally(() => setLoading(false))
  }, [])

  const fetchRecords = () => {
    const params = { page, page_size: 20 }
    if (category) params.category = category
    if (phaseId) params.phase_id = phaseId
    api.get('/api/student/points/records', { params }).then(({ data }) => { setRecords(data.items || []); setTotalPages(data.total_pages || 1) }).catch(() => setRecords([]))
  }
  useEffect(fetchRecords, [page, category, phaseId])

  const currentProject = useMemo(() => projects.find((item) => item.name === stats?.project_name), [projects, stats])
  const group = team?.group || {}
  const members = team?.members || []
  const teamRecords = team?.team_point_records || []
  const memberPersonalPoints = members.reduce((total, item) => total + Number(item.period_points || 0), 0)
  const groupPersonalPoints = Math.max(Number(group.personal_points || 0), memberPersonalPoints)
  const groupTeamPoints = Number(group.team_points || 0)
  const groupFinalScore = groupPersonalPoints + groupTeamPoints

  if (loading) return <AppLayout><div className="flex h-72 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-b-indigo-600" /></div></AppLayout>

  return <AppLayout>
    <div className="mb-7"><p className="text-xs font-bold uppercase tracking-[.22em] text-indigo-500">My Project</p><h1 className="mt-2 text-3xl font-black text-slate-900">我的积分详情</h1><p className="mt-2 text-sm text-slate-500">查看我的项目、阶段表现与小组积分构成</p></div>

    <section className="relative mb-6 overflow-hidden rounded-[30px] bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-800 p-7 text-white shadow-2xl shadow-indigo-900/15 soft-grid"><div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-cyan-400/15 to-transparent" /><div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold"><Sparkles className="h-3.5 w-3.5 text-cyan-300" />当前参与项目</div><h2 className="text-3xl font-black">{stats?.year_name}{stats?.project_name}</h2><div className="mt-4 flex flex-wrap gap-4 text-sm text-indigo-100"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />项目周期：{dateText(currentProject?.start_date)} - {dateText(currentProject?.end_date)}</span><span className="flex items-center gap-2"><Users className="h-4 w-4" />我的小组：{stats?.group_name || '暂未分组'}</span></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/15 bg-white/10 px-6 py-4 text-center backdrop-blur-md"><p className="text-xs text-indigo-200">当前积分</p><p className="mt-1 text-3xl font-black">{stats?.period_points || 0}</p></div><div className="rounded-2xl border border-white/15 bg-white/10 px-6 py-4 text-center backdrop-blur-md"><p className="text-xs text-indigo-200">项目排名</p><p className="mt-1 text-3xl font-black">{stats?.period_rank ? `第${stats.period_rank}名` : '-'}</p></div></div></div></section>

    <div className="mb-6 flex w-fit rounded-2xl bg-white/55 p-1 shadow-sm ring-1 ring-white/80 backdrop-blur-xl"><button onClick={() => setSearchParams({})} className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black ${tab === 'personal' ? 'bg-white text-indigo-700 shadow-md' : 'text-slate-500'}`}><TrendingUp className="h-4 w-4" />个人积分</button><button onClick={() => setSearchParams({ tab: 'team' })} className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black ${tab === 'team' ? 'bg-white text-violet-700 shadow-md' : 'text-slate-500'}`}><Users className="h-4 w-4" />小组积分</button></div>

    {tab === 'personal' ? <>
      <section className="mb-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-900">阶段积分表现</h2><p className="mt-1 text-xs text-slate-500">每个阶段单独排名，第一名将获得阶段荣誉</p></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{phases.map((phase, index) => <div key={phase.phase_id} className={`glass-panel hover-lift rounded-[24px] border p-5 ${Number(phase.rank) === 1 ? 'ring-2 ring-amber-300' : ''}`}><div className="mb-5 flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-black text-white">{index + 1}</div>{Number(phase.rank) === 1 && <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700"><Medal className="h-3 w-3" />阶段冠军</span>}</div><h3 className="font-black text-slate-900">{phase.phase_name}</h3><p className="mt-1 text-xs text-slate-400">{dateText(phase.start_date)} - {dateText(phase.end_date)}</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-indigo-50 p-3"><p className="text-[10px] text-indigo-500">我的积分</p><strong className="mt-1 block text-xl text-indigo-700">{phase.points || 0} 分</strong></div><div className="rounded-2xl bg-violet-50 p-3"><p className="text-[10px] text-violet-500">阶段排名</p><strong className="mt-1 block text-xl text-violet-700">{phase.rank ? `第${phase.rank}名` : '-'}</strong></div></div></div>)}</div></section>

      <section className="glass-panel overflow-hidden rounded-[28px] border"><div className="flex flex-col gap-3 border-b border-white/70 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-slate-900">个人积分流水</h2><p className="mt-1 text-xs text-slate-500">系统根据积分明细自动汇总</p></div><div className="flex gap-2"><select value={phaseId} onChange={(event) => { setPage(1); setPhaseId(event.target.value) }} className="rounded-xl border border-indigo-100 bg-white/70 px-3 py-2 text-xs"><option value="">全部阶段</option>{phases.map((phase) => <option key={phase.phase_id} value={phase.phase_id}>{phase.phase_name}</option>)}</select><select value={category} onChange={(event) => { setPage(1); setCategory(event.target.value) }} className="rounded-xl border border-indigo-100 bg-white/70 px-3 py-2 text-xs"><option value="">全部分类</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-white/40 text-slate-500"><tr><th className="px-4 py-3 text-left">年度</th><th className="px-4 py-3 text-left">项目名称</th><th className="px-4 py-3 text-left">阶段</th><th className="px-4 py-3 text-left">积分类别</th><th className="px-4 py-3 text-right">积分</th><th className="px-4 py-3 text-left">获得时间</th><th className="px-4 py-3 text-left">备注</th></tr></thead><tbody className="divide-y divide-white/70">{records.map((item) => <tr key={item.id} className="hover:bg-white/35"><td className="px-4 py-3 text-slate-500">{item.year_name || '-'}</td><td className="px-4 py-3">{item.project_name || '-'}</td><td className="px-4 py-3 text-slate-500">{item.phase_name || '-'}</td><td className="px-4 py-3 font-bold">{item.category || '-'}</td><td className={`px-4 py-3 text-right font-black ${Number(item.points) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{Number(item.points) > 0 ? '+' : ''}{item.points}</td><td className="px-4 py-3 text-slate-500">{dateText(item.obtained_date || item.created_at)}</td><td className="max-w-48 truncate px-4 py-3 text-slate-500">{item.description || '-'}</td></tr>)}</tbody></table>{!records.length && <p className="py-14 text-center text-sm text-slate-400">暂无积分记录</p>}</div><div className="border-t border-white/70 p-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div></section>
    </> : <>
      <section className="mb-6 grid gap-4 md:grid-cols-4"><div className="glass-panel rounded-3xl border p-5 md:col-span-1"><p className="text-xs text-slate-500">我的小组</p><h2 className="mt-2 text-2xl font-black">{group.name || '暂未分组'}</h2><p className="mt-4 text-xs text-slate-400">{group.member_count || members.length || 0} 名成员</p></div>{[{label:'成员个人积分合计',value:groupPersonalPoints,color:'text-indigo-600'},{label:'小组任务积分',value:groupTeamPoints,color:'text-violet-600'},{label:'小组最终得分',value:groupFinalScore,color:'text-emerald-600'}].map((item) => <div key={item.label} className="glass-panel rounded-3xl border p-5"><p className="text-xs text-slate-500">{item.label}</p><p className={`mt-3 text-3xl font-black ${item.color}`}>{item.value || 0}</p></div>)}</section>
      <section className="mb-6 grid gap-6 lg:grid-cols-2"><div className="glass-panel overflow-hidden rounded-[28px] border"><div className="border-b border-white/70 px-5 py-4"><h2 className="font-black">小组成员</h2></div><div className="divide-y divide-white/70">{members.map((item) => <div key={item.student_id} className="flex items-center gap-3 px-5 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-xs font-black text-indigo-700">{item.rank}</span><span className="flex-1 font-bold">{item.student_name}</span><strong className="text-indigo-600">{item.period_points || 0} 分</strong></div>)}{!members.length && <p className="py-10 text-center text-sm text-slate-400">暂无成员</p>}</div></div><div className="glass-panel overflow-hidden rounded-[28px] border"><div className="border-b border-white/70 px-5 py-4"><h2 className="font-black">小组积分明细</h2></div><div className="divide-y divide-white/70">{teamRecords.map((item) => <div key={item.id} className="flex items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><p className="truncate font-bold">{item.category || item.item_name}</p><p className="text-xs text-slate-400">{item.phase_name || '项目级'} · {dateText(item.obtained_date)}</p></div><strong className="text-violet-600">+{item.points} 分</strong></div>)}{!teamRecords.length && <p className="py-10 text-center text-sm text-slate-400">暂无小组积分</p>}</div></div></section>
    </>}
  </AppLayout>
}
