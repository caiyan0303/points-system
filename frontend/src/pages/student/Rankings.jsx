import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { Crown, Medal, Trophy, Users } from 'lucide-react'

export default function StudentRankings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'team' ? 'team' : 'personal'
  const [phases, setPhases] = useState([])
  const [phaseId, setPhaseId] = useState('')
  const [phaseDetail, setPhaseDetail] = useState(null)
  const [teamData, setTeamData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.get('/api/student/phase-overview'), api.get('/api/student/team')]).then(([phaseRes, teamRes]) => {
      const items = phaseRes.data?.phases || []
      setPhases(items)
      setTeamData(teamRes.data)
      const current = items.find((item) => ['进行中', 'in_progress'].includes(item.status)) || items[0]
      if (current) setPhaseId(String(current.phase_id))
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!phaseId) return
    api.get(`/api/student/phases/${phaseId}`).then(({ data }) => setPhaseDetail(data)).catch(() => setPhaseDetail(null))
  }, [phaseId])

  const personal = phaseDetail?.personal_rankings || phaseDetail?.rankings || []
  const teams = teamData?.all_groups || phaseDetail?.group_rankings || []
  const champion = tab === 'personal' ? personal[0] : teams[0]
  const rankingRows = tab === 'personal' ? personal : teams

  return <AppLayout>
    <div className="mb-7"><p className="text-xs font-bold uppercase tracking-[.22em] text-indigo-500">Project Leaderboard</p><h1 className="mt-2 text-3xl font-black text-slate-900">项目排行榜</h1><p className="mt-2 text-sm text-slate-500">见证每个阶段的个人冠军与小组荣誉</p></div>
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="glass-chip inline-flex rounded-2xl p-1"><button onClick={() => setSearchParams({})} className={`rounded-xl px-5 py-2.5 text-sm font-bold ${tab === 'personal' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>阶段个人榜</button><button onClick={() => setSearchParams({ tab: 'team' })} className={`rounded-xl px-5 py-2.5 text-sm font-bold ${tab === 'team' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}>小组榜</button></div>
      {tab === 'personal' && <select value={phaseId} onChange={(event) => setPhaseId(event.target.value)} className="glass-chip rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none">{phases.map((phase) => <option key={phase.phase_id} value={phase.phase_id}>{phase.phase_name}</option>)}</select>}
    </div>

    {loading ? <div className="flex h-72 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-b-indigo-600" /></div> : <>
      {champion && <section className={`relative mb-6 overflow-hidden rounded-[32px] p-7 text-white shadow-2xl ${tab === 'personal' ? 'bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 shadow-orange-300/30' : 'bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 shadow-indigo-300/30'}`}><div className="absolute -right-10 -top-16 h-64 w-64 rounded-full bg-white/20 blur-2xl" /><div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center"><div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-[28px] border border-white/30 bg-white/15 text-3xl font-black backdrop-blur-lg">{tab === 'personal' ? champion.student_name?.slice(-1) : <Users className="h-11 w-11" />}<Crown className="absolute -right-4 -top-5 h-10 w-10 rotate-12 text-yellow-200" /></div><div className="flex-1"><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur-md"><Trophy className="h-4 w-4 text-yellow-200" />{tab === 'personal' ? '阶段冠军' : '小组冠军'}</div><h2 className="text-3xl font-black">{tab === 'personal' ? champion.student_name : champion.name || champion.group_name}</h2><p className="mt-2 text-sm text-white/80">{tab === 'personal' ? '阶段第一名，获得阶段奖励' : '项目小组第一名，获得小组奖励'}</p></div><strong className="text-4xl font-black">{tab === 'personal' ? champion.total_points || 0 : champion.final_score ?? champion.total_points ?? 0}<span className="ml-1 text-sm">分</span></strong></div></section>}

      <section className="glass-panel overflow-hidden rounded-[28px] border"><div className="border-b border-white/70 px-6 py-5"><h2 className="flex items-center gap-2 text-lg font-black"><Medal className="h-5 w-5 text-amber-500" />{tab === 'personal' ? '阶段个人完整排名' : '小组完整排名'}</h2></div>{rankingRows.length ? <div className="divide-y divide-white/70">{rankingRows.map((item, index) => <div key={item.student_id || item.id || item.group_id} className={`flex items-center gap-4 px-5 py-4 ${item.is_me || item.is_my_group ? 'bg-indigo-50/70' : 'hover:bg-white/35'}`}><span className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black ${index === 0 ? 'bg-amber-100 text-amber-700' : index === 1 ? 'bg-slate-200 text-slate-700' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-white/70 text-slate-500'}`}>{index + 1}</span><div className="flex-1"><p className="font-black text-slate-800">{tab === 'personal' ? item.student_name : item.name || item.group_name}{(item.is_me || item.is_my_group) && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-1 text-[10px] text-indigo-700">我的位置</span>}</p><p className="mt-1 text-xs text-slate-400">{tab === 'personal' ? item.group_name || '暂未分组' : `${item.member_count || 0} 名成员`}</p></div><strong className="text-lg font-black text-indigo-600">{tab === 'personal' ? item.total_points || 0 : item.final_score ?? item.total_points ?? 0} 分</strong></div>)}</div> : <p className="py-16 text-center text-sm text-slate-400">暂无排名数据</p>}</section>
    </>}
  </AppLayout>
}
