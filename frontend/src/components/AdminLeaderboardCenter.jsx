import { useEffect, useMemo, useState } from 'react'
import { Award, Crown, Layers3, Medal, Sparkles, Trophy, UserRound, UsersRound } from 'lucide-react'

const number = (value) => Number(value || 0)

const rankTone = (index) => {
  if (index === 0) return 'bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-500 text-white shadow-indigo-200/70'
  if (index === 1) return 'border-slate-200 bg-gradient-to-br from-slate-50 to-white text-slate-800'
  return 'border-violet-100 bg-gradient-to-br from-violet-50 to-white text-slate-800'
}

function displayName(row, type) {
  return type === 'personal'
    ? row.student_name || row.real_name || row.username || '未命名学员'
    : row.group_name || row.name || '未命名小组'
}

function displayPoints(row, type) {
  return type === 'personal'
    ? number(row.total_points ?? row.period_points ?? row.project_points)
    : number(row.final_score ?? row.total_points)
}

function RankingCard({ row, index, type }) {
  const primary = index === 0
  const Icon = index === 0 ? Crown : Medal
  return <div className={`relative overflow-hidden rounded-[24px] border p-5 shadow-lg ${rankTone(index)} ${primary ? 'border-transparent' : ''}`}>
    {primary && <><div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15" /><div className="absolute -bottom-12 left-1/3 h-28 w-28 rounded-full bg-cyan-300/15" /></>}
    <div className="relative flex items-start justify-between gap-3">
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${primary ? 'bg-white/15 text-white' : 'bg-indigo-50 text-indigo-600'}`}><Icon className="h-5 w-5" /></div>
      <span className={`rounded-full px-3 py-1 text-[11px] font-black ${primary ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>NO.{index + 1}</span>
    </div>
    <div className="relative mt-7">
      <p className={`truncate text-lg font-black ${primary ? 'text-white' : 'text-slate-900'}`}>{displayName(row, type)}</p>
      <p className={`mt-1 truncate text-xs ${primary ? 'text-indigo-100' : 'text-slate-400'}`}>{type === 'personal' ? (row.group_name || '暂未分组') : `${number(row.member_count)} 名成员`}</p>
      <p className={`mt-5 text-3xl font-black ${primary ? 'text-white' : 'text-indigo-600'}`}>{displayPoints(row, type).toLocaleString()}<span className="ml-1 text-xs font-bold">分</span></p>
      {type === 'team' && <p className={`mt-2 text-[11px] ${primary ? 'text-indigo-100' : 'text-slate-400'}`}>成员积分 {number(row.personal_points)} · 小组积分 {number(row.team_points)}</p>}
    </div>
  </div>
}

export default function AdminLeaderboardCenter({ phases = [], phaseRankings = {}, personalRows = [], groupRows = [] }) {
  const [scope, setScope] = useState('project')
  const [type, setType] = useState('personal')
  const [phaseId, setPhaseId] = useState('')

  useEffect(() => {
    if (!phases.length) { setPhaseId(''); return }
    const current = phases.find((phase) => ['进行中', 'in_progress'].includes(phase.status)) || phases[0]
    if (!phases.some((phase) => String(phase.id) === String(phaseId))) setPhaseId(String(current.id))
  }, [phases, phaseId])

  const activePhase = phases.find((phase) => String(phase.id) === String(phaseId))
  const rows = useMemo(() => {
    const source = scope === 'project'
      ? (type === 'personal' ? personalRows : groupRows)
      : (phaseRankings[phaseId]?.[type] || [])
    return [...source].sort((a, b) => displayPoints(b, type) - displayPoints(a, type))
  }, [groupRows, personalRows, phaseId, phaseRankings, scope, type])

  return <section className="mb-6 overflow-hidden rounded-[30px] border border-indigo-100 bg-white shadow-xl shadow-indigo-100/40">
    <div className="border-b border-indigo-100 bg-gradient-to-r from-slate-950 via-indigo-950 to-indigo-800 px-6 py-6 text-white">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Trophy className="h-6 w-6 text-cyan-300" /></div><div><p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-cyan-300"><Sparkles className="h-3.5 w-3.5" />Ranking Center</p><h2 className="mt-1 text-2xl font-black">项目积分排行榜</h2><p className="mt-1 text-xs text-indigo-200">项目总榜与各阶段排名统一查看</p></div></div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-2xl bg-white/10 p-1 ring-1 ring-white/10">{[['project', '项目总榜'], ['phase', '阶段榜']].map(([value, label]) => <button key={value} onClick={() => setScope(value)} className={`rounded-xl px-4 py-2 text-xs font-black transition ${scope === value ? 'bg-white text-indigo-700 shadow-lg' : 'text-indigo-100 hover:bg-white/10'}`}>{label}</button>)}</div>
          <div className="flex rounded-2xl bg-white/10 p-1 ring-1 ring-white/10">{[['personal', '个人排名'], ['team', '小组排名']].map(([value, label]) => <button key={value} onClick={() => setType(value)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${type === value ? 'bg-cyan-300 text-slate-950 shadow-lg' : 'text-indigo-100 hover:bg-white/10'}`}>{value === 'personal' ? <UserRound className="h-3.5 w-3.5" /> : <UsersRound className="h-3.5 w-3.5" />}{label}</button>)}</div>
        </div>
      </div>
    </div>

    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[.16em] text-indigo-500">{scope === 'project' ? 'Overall Ranking' : 'Phase Ranking'}</p><h3 className="mt-1 text-xl font-black text-slate-900">{scope === 'project' ? `项目${type === 'personal' ? '个人' : '小组'}完整排名` : `${activePhase?.name || '阶段'} · ${type === 'personal' ? '个人' : '小组'}排名`}</h3></div>
        {scope === 'phase' && <label className="flex items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs font-bold text-slate-500"><Layers3 className="h-4 w-4 text-indigo-500" />选择阶段<select value={phaseId} onChange={(event) => setPhaseId(event.target.value)} className="min-w-44 bg-transparent font-black text-indigo-700 outline-none">{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}</select></label>}
      </div>

      {rows.length ? <>
        <div className="grid gap-4 md:grid-cols-3">{rows.slice(0, 3).map((row, index) => <RankingCard key={row.student_id || row.group_id || row.id} row={row} index={index} type={type} />)}</div>
        <div className="mt-5 overflow-hidden rounded-[22px] border border-slate-100">
          <div className="grid grid-cols-[70px_1fr_130px] bg-slate-50 px-5 py-3 text-[11px] font-black uppercase tracking-wider text-slate-400"><span>名次</span><span>{type === 'personal' ? '学员信息' : '小组信息'}</span><span className="text-right">积分</span></div>
          <div className="divide-y divide-slate-100">{rows.map((row, index) => <div key={`full-${row.student_id || row.group_id || row.id}`} className="grid grid-cols-[70px_1fr_130px] items-center px-5 py-3.5 transition hover:bg-indigo-50/40"><span className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black ${index < 3 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-black text-slate-800">{displayName(row, type)}</p><p className="mt-1 truncate text-[11px] text-slate-400">{type === 'personal' ? (row.group_name || '暂未分组') : `${number(row.member_count)} 名成员${row.leader_name ? ` · 小组长 ${row.leader_name}` : ''}`}</p></div><strong className="text-right text-base font-black text-indigo-600">{displayPoints(row, type).toLocaleString()} 分</strong></div>)}</div>
        </div>
      </> : <div className="rounded-[24px] border border-dashed border-indigo-200 bg-indigo-50/30 py-16 text-center"><Award className="mx-auto h-10 w-10 text-indigo-300" /><p className="mt-3 text-sm font-bold text-slate-500">当前范围暂无排名数据</p></div>}
    </div>
  </section>
}
