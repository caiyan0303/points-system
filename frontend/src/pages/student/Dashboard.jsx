import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { ArrowRight, Award, Crown, Gift, ShoppingBag, Sparkles, TrendingUp, Trophy, Users } from 'lucide-react'

const rankStyle = [
  'bg-amber-100 text-amber-700 ring-amber-200',
  'bg-slate-200 text-slate-600 ring-slate-300',
  'bg-orange-100 text-orange-700 ring-orange-200',
]

export default function StudentDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [phases, setPhases] = useState([])
  const [phaseDetail, setPhaseDetail] = useState(null)
  const [teamData, setTeamData] = useState(null)
  const [rankingTab, setRankingTab] = useState('personal')
  const [activityTab, setActivityTab] = useState('personal')
  const [currentProjectId, setCurrentProjectId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/api/student/dashboard'),
      api.get('/api/student/phase-overview'),
      api.get('/api/student/team'),
      api.get('/api/common/projects'),
    ]).then(async ([dashboardRes, phaseRes, teamRes, projectRes]) => {
      const nextPhases = phaseRes.data?.phases || []
      setData(dashboardRes.data)
      setPhases(nextPhases)
      setTeamData(teamRes.data)
      const projectItems = projectRes.data?.items || projectRes.data || []
      const selectedProject = projectItems.find((item) => item.name === dashboardRes.data?.project_name)
      setCurrentProjectId(selectedProject?.id || null)
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
  const rankingRows = rankingTab === 'personal' ? personalTop : teamTop
  const personalActivities = data?.recent_points || []
  const teamActivities = teamData?.team_point_records || []
  const activityRows = activityTab === 'personal' ? personalActivities : teamActivities
  const projectViewPath = (view) => currentProjectId ? `/student/projects/${currentProjectId}/${view}` : '/student/points'

  if (loading) return <AppLayout><div className="flex h-72 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-b-indigo-600" /></div></AppLayout>
  if (error || !data) return <AppLayout><div className="glass-panel rounded-3xl p-12 text-center text-slate-500">{error || '暂无数据'}</div></AppLayout>

  return <AppLayout>
    <section className="mb-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-indigo-500"><Sparkles className="h-3.5 w-3.5" />My Points Cockpit</p><h1 className="text-3xl font-black tracking-tight text-slate-900">你好，{data.real_name} <span className="inline-block origin-bottom-right animate-[wave_1.8s_ease-in-out_infinite]">👋</span></h1><p className="mt-2 text-sm text-slate-500">持续学习，积极挑战，为团队创造更多价值！</p></div>
        <p className="text-xs font-medium text-slate-400">{data.year_name} · {data.project_name} · {data.group_name || '暂未分组'}</p>
      </div>
    </section>

    <section className="mb-6 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <button onClick={() => navigate('/student/points')} className="group relative min-h-[250px] overflow-hidden rounded-[30px] bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-500 p-7 text-left text-white shadow-2xl shadow-indigo-400/25 soft-grid sm:p-8">
        <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-cyan-300/25 blur-3xl" />
        <div className="absolute bottom-5 right-7 hidden h-36 w-36 items-center justify-center rounded-full border border-white/20 bg-white/10 shadow-2xl backdrop-blur-md sm:flex"><div className="absolute inset-4 rounded-full border border-dashed border-white/30" /><Trophy className="relative h-16 w-16 text-amber-200 drop-shadow-xl transition duration-300 group-hover:scale-110 group-hover:rotate-6" /><span className="absolute -right-2 top-2 h-4 w-4 rounded-full bg-amber-300 shadow-lg shadow-amber-200" /></div>
        <div className="relative z-10 flex h-full max-w-[65%] flex-col justify-between"><div><p className="text-sm font-semibold text-indigo-100">个人总积分（当前项目）</p><div className="mt-2 flex items-end gap-2"><strong className="text-6xl font-black tracking-tight sm:text-7xl">{data.period_points || 0}</strong><span className="pb-2 text-lg font-bold text-indigo-100">分</span></div></div><div className="mt-8 grid grid-cols-2 gap-6 text-sm"><div><p className="text-xs text-indigo-200">当前排名</p><strong className="mt-1 block text-xl">{data.period_rank ? `第 ${data.period_rank} 名` : '-'}</strong></div><div><p className="text-xs text-indigo-200">阶段排名</p><strong className="mt-1 block text-xl">{data.current_phase_rank ? `第 ${data.current_phase_rank} 名` : '-'}</strong></div></div></div>
      </button>

      <div className="glass-panel hover-lift relative min-h-[250px] overflow-hidden rounded-[30px] border p-7 shadow-xl shadow-indigo-100/50">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-gradient-to-br from-amber-200/60 to-emerald-200/50 blur-2xl" />
        <div className="relative flex h-full flex-col"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-500">Rewards Mall</p><h2 className="mt-2 text-2xl font-black text-slate-900">积分商城</h2><p className="mt-2 text-sm leading-6 text-slate-500">用积分兑换心仪好礼，把每一次成长变成真实奖励。</p></div><div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[24px] bg-gradient-to-br from-amber-300 via-orange-300 to-emerald-400 text-white shadow-lg shadow-amber-200/60"><Gift className="h-10 w-10" /></div></div><div className="mt-auto flex items-end justify-between gap-4"><div><p className="text-xs text-slate-400">可用积分</p><p className="mt-1 text-3xl font-black text-violet-600">{data.available_points || 0}<span className="ml-1 text-sm">分</span></p></div><button onClick={() => navigate('/student/shop')} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-300/40 transition hover:-translate-y-0.5"><ShoppingBag className="h-4 w-4" />去兑换</button></div></div>
      </div>
    </section>

    <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <div className="glass-panel overflow-hidden rounded-[30px] border shadow-xl shadow-indigo-100/40">
        <div className="flex flex-col gap-4 border-b border-white/80 px-6 pt-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-500">Project Ranking</p><h2 className="mt-1 text-xl font-black text-slate-900">排行榜</h2></div><button onClick={() => navigate(projectViewPath(rankingTab === 'personal' ? 'personal' : 'team'))} className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-indigo-600">进入项目详情 <ArrowRight className="h-3.5 w-3.5" /></button></div>
        <div className="relative mx-6 mt-4 grid grid-cols-2 rounded-2xl bg-slate-100/80 p-1">
          <span className={`absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-md transition-transform duration-300 ${rankingTab === 'team' ? 'translate-x-[100%]' : 'translate-x-0'}`} />
          <button onClick={() => setRankingTab('personal')} className={`relative z-10 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${rankingTab === 'personal' ? 'text-indigo-700' : 'text-slate-400'}`}><Award className="h-4 w-4" />阶段个人榜</button>
          <button onClick={() => setRankingTab('team')} className={`relative z-10 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${rankingTab === 'team' ? 'text-violet-700' : 'text-slate-400'}`}><Users className="h-4 w-4" />团队榜</button>
        </div>
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between"><p className="text-xs font-semibold text-slate-400">{rankingTab === 'personal' ? currentPhase?.phase_name || '当前阶段' : '团队最终得分排名'}</p>{rankingRows[0] && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-600"><Crown className="h-3 w-3" />{rankingTab === 'personal' ? '阶段冠军' : '团队冠军'}</span>}</div>
          {rankingRows.length ? <div className="space-y-2">{rankingRows.map((item, index) => {
            const name = rankingTab === 'personal' ? item.student_name : item.name || item.group_name
            const points = rankingTab === 'personal' ? item.total_points || 0 : item.final_score ?? item.total_points ?? 0
            return <div key={item.student_id || item.id || item.group_id} className={`flex items-center gap-4 rounded-2xl px-4 py-3.5 transition ${index === 0 ? 'bg-gradient-to-r from-amber-50 to-yellow-50/60 ring-1 ring-amber-100' : item.is_me || item.is_my_group ? 'bg-indigo-50/80' : 'bg-white/55'}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ring-1 ${rankStyle[index] || 'bg-slate-100 text-slate-500 ring-slate-200'}`}>{index + 1}</span><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 font-black text-indigo-700">{rankingTab === 'personal' ? name?.slice(-1) : <Users className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{name}{(item.is_me || item.is_my_group) && <span className="ml-2 text-[10px] font-bold text-indigo-500">我的位置</span>}</p><p className="mt-0.5 text-[11px] text-slate-400">{rankingTab === 'personal' ? item.group_name || '暂未分组' : `${item.member_count || 0} 名成员`}</p></div><strong className="text-base font-black text-indigo-600">{points} 分</strong></div>
          })}</div> : <p className="py-12 text-center text-sm text-slate-400">暂无排名数据</p>}
        </div>
      </div>

      <div className="glass-panel rounded-[30px] border p-6 shadow-xl shadow-indigo-100/40"><div className="mb-4 flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-600">Points Ledger</p><h2 className="mt-1 text-xl font-black text-slate-900">积分流水动态</h2></div><button onClick={() => navigate(projectViewPath(activityTab === 'personal' ? 'personal' : 'team'))} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600">查看全部 <ArrowRight className="h-3.5 w-3.5" /></button></div><div className="relative mb-4 grid grid-cols-2 rounded-2xl bg-slate-100/80 p-1"><span className={`absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-sm transition-transform ${activityTab === 'team' ? 'translate-x-[100%]' : 'translate-x-0'}`} /><button onClick={() => setActivityTab('personal')} className={`relative z-10 rounded-xl px-2 py-2 text-xs font-black ${activityTab === 'personal' ? 'text-indigo-700' : 'text-slate-400'}`}>个人积分流水</button><button onClick={() => setActivityTab('team')} className={`relative z-10 rounded-xl px-2 py-2 text-xs font-black ${activityTab === 'team' ? 'text-violet-700' : 'text-slate-400'}`}>团队积分流水</button></div><div className="space-y-2">{activityRows.length ? activityRows.slice(0, 5).map((item) => { const value = Number(item.points || 0); const dateValue = item.created_at || item.obtained_date; return <div key={`${activityTab}-${item.id}`} className="group flex items-start gap-3 rounded-2xl p-3 transition hover:bg-white/70"><div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${activityTab === 'team' ? 'bg-violet-100 text-violet-600' : value >= 0 ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'}`}>{activityTab === 'team' ? <Users className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-black text-slate-800">{item.category || item.item_name || item.description || (activityTab === 'team' ? '团队积分' : '个人积分')}</p><span className="shrink-0 text-[10px] text-slate-400">{dateValue ? new Date(dateValue).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '-'}</span></div><p className="mt-1 text-xs text-slate-400">{item.phase_name || (activityTab === 'team' ? '团队任务积分' : '个人积分已更新')} · <strong className={activityTab === 'team' ? 'text-violet-600' : value >= 0 ? 'text-indigo-600' : 'text-rose-600'}>{value > 0 ? '+' : ''}{value} 分</strong></p></div></div> }) : <p className="py-10 text-center text-sm text-slate-400">暂无{activityTab === 'personal' ? '个人' : '团队'}积分流水</p>}</div></div>
    </section>
  </AppLayout>
}
