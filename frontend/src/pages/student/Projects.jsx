import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { ArrowRight, CalendarDays, CheckCircle2, FolderKanban, Sparkles, Trophy, Users } from 'lucide-react'

const dateText = (value) => value ? new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'

function normalizeHistory(history = []) {
  return history.flatMap((item) => item.projects
    ? item.projects.map((project) => ({ ...project, year_id: item.year_id, year_name: item.year_name, rank: project.rank ?? item.rank }))
    : [item])
}

export default function StudentProjects() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/api/student/profile'),
      api.get('/api/student/history'),
      api.get('/api/common/projects'),
    ]).then(([profileRes, historyRes, projectRes]) => {
      setProfile(profileRes.data)
      setHistory(normalizeHistory(historyRes.data?.history || []))
      setCatalog(projectRes.data?.items || projectRes.data || [])
    }).finally(() => setLoading(false))
  }, [])

  const projects = useMemo(() => {
    const enrollments = profile?.project_enrollments?.length
      ? profile.project_enrollments
      : profile?.project_name ? [{ project_name: profile.project_name, year_name: profile.year_name, group_name: profile.group_name, is_current: true }] : []
    const source = profile?.project_enrollments?.length ? enrollments : [...enrollments, ...history]
    const seen = new Set()
    return source.map((enrollment) => {
      const historyItem = history.find((item) => String(item.project_id || '') === String(enrollment.project_id || '') || (item.project_name === enrollment.project_name && item.year_name === enrollment.year_name)) || {}
      const project = catalog.find((item) => String(item.id) === String(enrollment.project_id || historyItem.project_id || '') || item.name === enrollment.project_name) || {}
      return {
        ...historyItem,
        ...project,
        ...enrollment,
        id: enrollment.project_id || historyItem.project_id || project.id,
        name: enrollment.project_name || historyItem.project_name || project.name,
        year_name: enrollment.year_name || historyItem.year_name || project.year_name,
        group_name: enrollment.group_name || historyItem.group_name,
        points: historyItem.period_points ?? historyItem.points ?? 0,
        rank: historyItem.rank ?? null,
      }
    }).filter((item) => {
      const key = item.id ? String(item.id) : `${item.year_name}-${item.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return item.name
    })
  }, [profile, history, catalog])

  if (loading) return <AppLayout><div className="flex h-72 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-b-indigo-600" /></div></AppLayout>

  return <AppLayout>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-indigo-500">My Projects</p><h1 className="mt-2 text-3xl font-black text-slate-900">我的项目</h1><p className="mt-2 text-sm text-slate-500">以下是你参与的所有培养项目，选择项目进入专属积分空间。</p></div><div className="glass-chip flex items-center gap-2 rounded-2xl px-4 py-3"><Users className="h-5 w-5 text-indigo-600" /><div><p className="text-[10px] text-slate-400">当前团队</p><p className="text-sm font-black text-slate-800">{profile?.group_name || '暂未分组'}</p></div></div></div>

    {projects.length ? <div className="grid gap-5 md:grid-cols-2">{projects.map((project, index) => {
      const isCurrent = project.is_current || project.status === '进行中' || project.status === 'in_progress'
      return <button key={project.id || `${project.year_name}-${project.name}`} disabled={!project.id} onClick={() => project.id && navigate(`/student/projects/${project.id}`)} className={`group glass-panel hover-lift relative overflow-hidden rounded-[28px] border p-6 text-left disabled:cursor-not-allowed disabled:opacity-60 ${isCurrent ? 'ring-2 ring-indigo-300' : ''}`}>
        <div className={`absolute right-0 top-0 h-32 w-32 rounded-bl-[70px] ${index % 2 === 0 ? 'bg-indigo-100/70' : 'bg-cyan-100/70'}`} />
        <div className="relative"><div className="mb-5 flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black text-slate-900">{project.name}</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isCurrent ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{isCurrent ? '进行中' : '已结束'}</span></div><p className="mt-2 text-[10px] font-semibold text-indigo-500">{project.year_name}</p><p className="mt-2 flex items-center gap-2 text-xs text-slate-400"><CalendarDays className="h-3.5 w-3.5" />{dateText(project.start_date)} - {dateText(project.end_date)}</p></div><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-300/40"><FolderKanban className="h-6 w-6" /></div></div>
          <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-2xl bg-white/55 py-4"><div className="px-4"><p className="text-[10px] text-slate-400">我的小组</p><p className="mt-1 truncate text-sm font-black text-slate-700">{project.group_name || '暂未分组'}</p></div><div className="px-4"><p className="text-[10px] text-slate-400">当前积分</p><p className="mt-1 text-sm font-black text-indigo-600">{project.points || 0} 分</p></div><div className="px-4"><p className="text-[10px] text-slate-400">项目排名</p><p className="mt-1 text-sm font-black text-violet-600">{project.rank ? `第 ${project.rank} 名` : '暂无'}</p></div></div>
          <div className="mt-5 flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">{isCurrent ? <Sparkles className="h-3.5 w-3.5 text-amber-500" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{isCurrent ? '当前培养项目' : '历史培养项目'}</span><span className="flex items-center gap-1 text-xs font-black text-indigo-600">进入项目 <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></div></div>
      </button>
    })}</div> : <div className="glass-panel rounded-[28px] border p-16 text-center"><Trophy className="mx-auto h-12 w-12 text-indigo-200" /><h2 className="mt-4 text-lg font-black text-slate-700">暂无参与项目</h2><p className="mt-2 text-sm text-slate-400">管理员将你加入项目后，这里会自动显示项目卡片。</p></div>}
  </AppLayout>
}
