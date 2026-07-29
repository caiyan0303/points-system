import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { ArrowRight, Award, Crown, Gift, ShoppingBag, Sparkles, TrendingUp, Trophy, Users, Zap } from 'lucide-react'

const rankTone = ['from-amber-300 to-yellow-500', 'from-slate-300 to-slate-500', 'from-orange-300 to-orange-500']

export default function StudentDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [phases, setPhases] = useState([])
  const [phaseDetail, setPhaseDetail] = useState(null)
  const [teamData, setTeamData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/api/student/dashboard'),
      api.get('/api/student/phase-overview'),
      api.get('/api/student/team'),
    ]).then(async ([dashboardRes, phaseRes, teamRes]) => {
      const nextPhases = phaseRes.data?.phases || []
      setData(dashboardRes.data)
      setPhases(nextPhases)
      setTeamData(teamRes.data)
      const current = nextPhases.find((item) => ['进行中', 'in_progress'].includes(item.status)) || nextPhases[0]
      if (current?.phase_id) {
        const detail = await api.get(`/api/student/phases/${current.phase_id}`)
        setPhaseDetail(detail.data)
      }
    }).catch((err) => setError(err.response?.data?.detail || '积分驾驶舱加载失败')).finally(() => setLoading(false))
  }, [])

  const personalTop = useMemo(() => (phaseDetail?.personal_rankings || phaseDetail?.rankings || []).slice(0, 3), [phaseDetail])
  const teamTop = useMemo(() => (teamData?.all_groups || phaseDetail?.group_rankings || []).slice(0, 3), [teamData, phaseDetail])
  const currentPhase = phases.find((item) => ['进行中', 'in_progress'].includes(item.status)) || phases[0]

  if (loading) return <AppLayout><div className="flex h-72 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-b-indigo-600" /></div></AppLayout>
  if (error || !data) return <AppLayout><div className="glass-panel rounded-3xl p-12 text-center text-slate-500">{error || '暂无数据'}</div></AppLayout>

  return <AppLayout>
    <section className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-600"><Sparkles className="h-4 w-4" />MY POINTS COCKPIT</div><h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">你好，{data.real_name}<span className="gradient-text">，欢迎回到积分驾驶舱</span></h1><p className="mt-2 text-sm text-slate-500">{data.year_name} · {data.project_name} · {data.group_name || '暂未分组'}</p></div>
      <div className="glass-chip flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-slate-600"><Zap className="h-4 w-4 text-amber-500" />每一次参与，都在积累成长能量</div>
    </section>

    <section className="relative mb-7 overflow-hidden rounded-[32px] bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 p-7 text-white shadow-2xl shadow-indigo-500/20 sm:p-9 soft-grid">
      <div className="absolute -right-12 -top-16 h-64 w-64 rounded-full bg-white/15 blur-2xl" /><div className="absolute bottom-0 right-12 hidden h-44 w-44 rotate-12 rounded-[44px] border border-white/20 bg-white/10 shadow-2xl backdrop-blur-md lg:block" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
        <div><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur-md"><Trophy className="h-4 w-4 text-amber-300" />当前项目表现</div><p className="text-sm text-indigo-100">我的积分</p><div className="mt-1 flex items-end gap-3"><strong className="text-6xl font-black tracking-tight sm:text-7xl">{data.period_points || 0}</strong><span className="pb-2 text-xl font-bold text-indigo-100">分</span></div><p className="mt-4 max-w-lg text-sm leading-6 text-indigo-100/90">个人累计积分用于项目排名和团队最终得分，持续完成任务，向更高排名发起挑战。</p></div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => navigate('/student/rankings')} className="rounded-3xl border border-white/20 bg-white/12 p-5 text-left backdrop-blur-lg transition hover:bg-white/20"><Award className="mb-4 h-7 w-7 text-amber-300" /><p className="text-xs text-indigo-100">项目排名</p><p className="mt-1 text-3xl font-black">{data.period_rank ? `第 ${data.period_rank} 名` : '-'}</p><span className="mt-4 flex items-center gap-1 text-xs text-white/80">查看排行榜 <ArrowRight className="h-3 w-3" /></span></button>
          <button onClick={() => navigate('/student/points')} className="rounded-3xl border border-white/20 bg-white/12 p-5 text-left backdrop-blur-lg transition hover:bg-white/20"><TrendingUp className="mb-4 h-7 w-7 text-cyan-200" /><p className="text-xs text-indigo-100">当前阶段排名</p><p className="mt-1 text-3xl font-black">{data.current_phase_rank ? `第 ${data.current_phase_rank} 名` : '-'}</p><span className="mt-4 block truncate text-xs text-white/80">{currentPhase?.phase_name || data.current_phase || '暂无阶段'}</span></button>
        </div>
      </div>
    </section>

    <section className="mb-7 grid gap-6 lg:grid-cols-2">
      <div className="glass-panel hover-lift rounded-[28px] border p-6">
        <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-500">Stage Ranking</p><h2 className="mt-1 text-xl font-black text-slate-900">阶段个人榜</h2></div><button onClick={() => navigate('/student/rankings')} className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600">完整榜单</button></div>
        {personalTop[0] ? <div className="mb-4 rounded-3xl bg-gradient-to-r from-amber-50 to-yellow-100/70 p-5 ring-1 ring-amber-200/70"><div className="flex items-center gap-4"><div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-yellow-500 text-lg font-black text-white shadow-lg shadow-amber-300/40">{personalTop[0].student_name?.slice(-1)}<Crown className="absolute -right-2 -top-3 h-6 w-6 rotate-12 text-amber-500" /></div><div className="min-w-0 flex-1"><span className="rounded-full bg-amber-500 px-2 py-1 text-[10px] font-bold text-white">阶段冠军</span><p className="mt-2 truncate text-lg font-black text-slate-900">{personalTop[0].student_name}</p><p className="text-xs text-amber-700">获得阶段奖励</p></div><strong className="text-2xl font-black text-amber-600">{personalTop[0].total_points || 0}<span className="text-xs"> 分</span></strong></div></div> : <p className="py-8 text-center text-sm text-slate-400">暂无阶段排名</p>}
        <div className="space-y-2">{personalTop.slice(1).map((item, index) => <div key={item.student_id} className="flex items-center gap-3 rounded-2xl bg-white/55 px-4 py-3"><div className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${rankTone[index + 1]} text-xs font-black text-white`}>{index + 2}</div><span className="flex-1 font-bold text-slate-700">{item.student_name}</span><span className="font-black text-indigo-600">{item.total_points || 0} 分</span></div>)}</div>
      </div>

      <div className="glass-panel hover-lift rounded-[28px] border p-6">
        <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-500">Team Ranking</p><h2 className="mt-1 text-xl font-black text-slate-900">团队榜</h2></div><button onClick={() => navigate('/student/rankings?tab=team')} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-bold text-violet-600">完整榜单</button></div>
        {teamTop[0] ? <div className="mb-4 rounded-3xl bg-gradient-to-r from-violet-50 to-indigo-100/70 p-5 ring-1 ring-violet-200/70"><div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-300/40"><Users className="h-7 w-7" /></div><div className="min-w-0 flex-1"><span className="rounded-full bg-violet-600 px-2 py-1 text-[10px] font-bold text-white">团队冠军</span><p className="mt-2 truncate text-lg font-black text-slate-900">{teamTop[0].name || teamTop[0].group_name}</p><p className="text-xs text-violet-600">第一名团队获得团队奖励</p></div><strong className="text-2xl font-black text-violet-600">{teamTop[0].final_score ?? teamTop[0].total_points ?? 0}<span className="text-xs"> 分</span></strong></div></div> : <p className="py-8 text-center text-sm text-slate-400">暂无团队排名</p>}
        <div className="space-y-2">{teamTop.slice(1).map((item, index) => <div key={item.id || item.group_id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${item.is_my_group ? 'bg-indigo-50 ring-1 ring-indigo-100' : 'bg-white/55'}`}><div className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${rankTone[index + 1]} text-xs font-black text-white`}>{index + 2}</div><span className="flex-1 font-bold text-slate-700">{item.name || item.group_name}</span><span className="font-black text-violet-600">{item.final_score ?? item.total_points ?? 0} 分</span></div>)}</div>
      </div>
    </section>

    <section className="mb-7 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-fuchsia-500 via-violet-600 to-indigo-600 p-6 text-white shadow-xl shadow-violet-400/20"><div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" /><div className="relative"><div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md"><Gift className="h-6 w-6 text-amber-200" /></div><p className="text-sm text-violet-100">我的可兑换积分</p><p className="mt-1 text-4xl font-black">{data.available_points || 0}<span className="ml-1 text-base">分</span></p><button onClick={() => navigate('/student/shop')} className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-violet-700 shadow-lg">立即兑换 <ShoppingBag className="h-4 w-4" /></button></div></div>
      <div className="glass-panel rounded-[28px] border p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-600">Points Feed</p><h2 className="mt-1 text-xl font-black">积分流水动态</h2></div><button onClick={() => navigate('/student/points')} className="text-xs font-bold text-indigo-600">查看全部</button></div><div className="space-y-3">{data.recent_points?.length ? data.recent_points.slice(0, 5).map((item) => <div key={item.id} className="flex items-center gap-4 rounded-2xl bg-white/55 p-3"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${Number(item.points) >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}><TrendingUp className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{item.category || item.description || '个人积分'}</p><p className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString('zh-CN')}</p></div><strong className={Number(item.points) >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{Number(item.points) > 0 ? '+' : ''}{item.points} 分</strong></div>) : <p className="py-10 text-center text-sm text-slate-400">暂无积分动态</p>}</div></div>
    </section>
  </AppLayout>
}
