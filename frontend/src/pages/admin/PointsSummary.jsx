import { useEffect, useMemo, useState } from 'react'
import {
  Crown, Medal, Search, Sparkles, Table2, TrendingUp,
  UserRound, UsersRound, WalletCards,
} from 'lucide-react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import PointsPageTabs from '../../components/PointsPageTabs'
import { useAdminScope } from '../../contexts/AdminScopeContext'

const value = (row, ...keys) => keys.reduce((found, key) => found ?? row?.[key], null) ?? 0
const number = (input) => Number(input || 0)

function MetricCard({ label, value: metricValue, unit = '分', icon: Icon, tone }) {
  return <div className="relative overflow-hidden rounded-[22px] border border-white/70 bg-white/80 p-4 shadow-lg shadow-indigo-100/30">
    <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${tone}`} />
    <div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${tone} text-white shadow-md`}><Icon className="h-4 w-4" /></span><div><p className="text-[11px] font-bold text-slate-400">{label}</p><p className="mt-0.5 text-xl font-black text-slate-900">{number(metricValue).toLocaleString()}<span className="ml-1 text-[10px] text-slate-400">{unit}</span></p></div></div>
  </div>
}

function TopCard({ row, index, isTeam }) {
  const first = index === 0
  return <div className={`relative overflow-hidden rounded-[24px] border p-5 ${first ? 'border-transparent bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-500 text-white shadow-xl shadow-indigo-200' : 'border-indigo-100 bg-white text-slate-900 shadow-lg shadow-indigo-100/30'}`}>
    {first && <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15" />}
    <div className="relative flex items-center justify-between"><span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${first ? 'bg-white/15' : 'bg-indigo-50 text-indigo-600'}`}>{first ? <Crown className="h-5 w-5" /> : <Medal className="h-5 w-5" />}</span><span className={`rounded-full px-3 py-1 text-[11px] font-black ${first ? 'bg-white/15' : 'bg-slate-100 text-slate-500'}`}>NO.{index + 1}</span></div>
    <p className="relative mt-6 truncate text-lg font-black">{isTeam ? row.name || row.group_name : row.real_name || row.username}</p>
    <p className={`relative mt-1 text-xs ${first ? 'text-indigo-100' : 'text-slate-400'}`}>{isTeam ? `${number(row.member_count)} 名成员` : row.group_name || '暂未分组'}</p>
    <p className={`relative mt-5 text-3xl font-black ${first ? 'text-white' : 'text-indigo-600'}`}>{number(isTeam ? value(row, 'final_score', 'total_points') : value(row, 'period_points', 'project_points', 'total_points')).toLocaleString()}<span className="ml-1 text-xs">分</span></p>
  </div>
}

export default function AdminPointsSummary({ type = 'personal' }) {
  const { yearId, projectId, selectedYear, selectedProject } = useAdminScope()
  const [rows, setRows] = useState([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isTeam = type === 'team'

  useEffect(() => {
    if (!projectId) { setRows([]); return }
    let active = true
    setLoading(true); setError('')
    const load = async () => {
      try {
        if (isTeam) {
          const { data } = await api.get('/api/admin/groups', { params: { year_id: yearId, project_id: projectId } })
          if (active) setRows(data.items || data || [])
        } else {
          const { data } = await api.get('/api/admin/students', { params: { year_id: yearId, project_id: projectId, page: 1, page_size: 100 } })
          let items = data.items || data || []
          const totalPages = data.total_pages || 1
          if (totalPages > 1) {
            const pages = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => api.get('/api/admin/students', { params: { year_id: yearId, project_id: projectId, page: index + 2, page_size: 100 } })))
            items = items.concat(...pages.map((response) => response.data.items || []))
          }
          if (active) setRows(items)
        }
      } catch (err) {
        if (active) setError(err.response?.data?.detail || '积分总表加载失败')
      } finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [isTeam, projectId, yearId])

  const rankedRows = useMemo(() => [...rows].sort((a, b) => isTeam
    ? value(b, 'final_score', 'total_points') - value(a, 'final_score', 'total_points')
    : value(b, 'period_points', 'project_points', 'total_points') - value(a, 'period_points', 'project_points', 'total_points')), [isTeam, rows])

  const filteredRows = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return query ? rankedRows.filter((row) => `${row.real_name || ''} ${row.username || ''} ${row.name || row.group_name || ''} ${row.group_name || ''}`.toLowerCase().includes(query)) : rankedRows
  }, [keyword, rankedRows])

  const metrics = useMemo(() => isTeam ? {
    count: rows.length,
    primary: rows.reduce((sum, row) => sum + number(row.personal_points), 0),
    secondary: rows.reduce((sum, row) => sum + number(row.team_points), 0),
    final: rows.reduce((sum, row) => sum + number(value(row, 'final_score', 'total_points')), 0),
  } : {
    count: rows.length,
    primary: rows.reduce((sum, row) => sum + number(value(row, 'period_points', 'project_points', 'total_points')), 0),
    secondary: rows.reduce((sum, row) => sum + number(row.available_points), 0),
    final: rows.length ? Math.round(rows.reduce((sum, row) => sum + number(value(row, 'period_points', 'project_points', 'total_points')), 0) / rows.length) : 0,
  }, [isTeam, rows])

  return <AppLayout>
    <div className="mb-6 overflow-hidden rounded-[30px] border border-indigo-100 bg-gradient-to-r from-slate-950 via-indigo-950 to-indigo-800 px-6 py-6 text-white shadow-xl shadow-indigo-200/40">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.22em] text-cyan-300"><Sparkles className="h-3.5 w-3.5" />{isTeam ? 'Group Points' : 'Personal Points'}</p><h1 className="mt-2 text-3xl font-black">{isTeam ? '小组积分管理' : '个人积分管理'}</h1><p className="mt-2 text-sm text-indigo-200">{selectedYear?.name || '未选择年度'} · {selectedProject?.name || '请先选择项目'}</p></div><div className="rounded-2xl bg-white/10 px-4 py-3 text-right ring-1 ring-white/10"><p className="text-[10px] font-bold text-indigo-200">当前管理对象</p><p className="mt-1 text-lg font-black">{metrics.count}<span className="ml-1 text-xs">{isTeam ? '个小组' : '名学员'}</span></p></div></div>
    </div>

    <PointsPageTabs type={isTeam ? 'team' : 'personal'} />

    {!projectId ? <div className="rounded-[28px] border border-dashed border-indigo-200 bg-white p-16 text-center"><Table2 className="mx-auto h-10 w-10 text-indigo-300" /><p className="mt-3 font-semibold text-slate-700">请先在顶部选择年度和项目</p></div> : <>
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={isTeam ? '项目小组' : '参与学员'} value={metrics.count} unit={isTeam ? '组' : '人'} icon={isTeam ? UsersRound : UserRound} tone="from-indigo-600 to-blue-500" />
        <MetricCard label={isTeam ? '成员个人积分' : '项目个人积分'} value={metrics.primary} icon={TrendingUp} tone="from-violet-600 to-indigo-500" />
        <MetricCard label={isTeam ? '小组任务积分' : '可兑换积分'} value={metrics.secondary} icon={WalletCards} tone="from-cyan-500 to-blue-500" />
        <MetricCard label={isTeam ? '小组最终得分合计' : '学员平均积分'} value={metrics.final} icon={Sparkles} tone="from-fuchsia-500 to-violet-500" />
      </div>

      {!loading && !error && rankedRows.length > 0 && <section className="mb-6"><div className="mb-4"><p className="text-xs font-black uppercase tracking-[.18em] text-indigo-500">Top Performers</p><h2 className="mt-1 text-xl font-black text-slate-900">{isTeam ? '小组积分前三名' : '个人积分前三名'}</h2></div><div className="grid gap-4 md:grid-cols-3">{rankedRows.slice(0, 3).map((row, index) => <TopCard key={row.id} row={row} index={index} isTeam={isTeam} />)}</div></section>}

      <section className="overflow-hidden rounded-[28px] border border-indigo-100 bg-white shadow-xl shadow-indigo-100/30">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-indigo-50 px-6 py-5"><div><p className="text-xs font-black uppercase tracking-[.16em] text-indigo-500">Complete Ranking</p><h2 className="mt-1 text-xl font-black text-slate-900">{isTeam ? '小组积分完整排名' : '学员积分完整排名'}</h2></div><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={isTeam ? '搜索小组' : '搜索学员或小组'} className="w-64 rounded-2xl border border-indigo-100 bg-indigo-50/40 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:bg-white focus:ring-2 focus:ring-indigo-500" /></div></div>
        {loading ? <div className="py-20 text-center text-sm text-slate-400">正在汇总积分…</div> : error ? <div className="py-20 text-center text-sm text-rose-500">{error}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50/80 text-left text-[11px] font-black uppercase tracking-wider text-slate-400"><tr>
          <th className="px-5 py-4">排名</th><th className="px-5 py-4">{isTeam ? '小组' : '学员'}</th>{!isTeam && <><th className="px-5 py-4">所属小组</th><th className="px-5 py-4 text-right">当前总积分</th><th className="px-5 py-4 text-right">可兑换积分</th></>}{isTeam && <><th className="px-5 py-4 text-right">成员人数</th><th className="px-5 py-4 text-right">成员个人积分</th><th className="px-5 py-4 text-right">小组任务积分</th><th className="px-5 py-4 text-right">最终得分</th></>}</tr></thead>
          <tbody className="divide-y divide-slate-100">{filteredRows.map((row) => { const rank = rankedRows.findIndex((item) => item.id === row.id) + 1; return <tr key={row.id} className="transition hover:bg-indigo-50/40"><td className="px-5 py-4"><span className={`inline-flex h-9 min-w-9 items-center justify-center rounded-xl px-2 text-xs font-black ${rank <= 3 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>NO.{rank}</span></td><td className="px-5 py-4 font-black text-slate-800">{isTeam ? row.name || row.group_name : row.real_name || row.username}{isTeam && row.leader_name && <p className="mt-1 text-[11px] font-normal text-slate-400">小组长：{row.leader_name}</p>}</td>{!isTeam && <><td className="px-5 py-4 text-slate-500">{row.group_name || '未分组'}</td><td className="px-5 py-4 text-right text-base font-black text-indigo-600">{number(value(row, 'period_points', 'project_points', 'total_points')).toLocaleString()}</td><td className="px-5 py-4 text-right text-base font-black text-emerald-600">{number(value(row, 'available_points')).toLocaleString()}</td></>}{isTeam && <><td className="px-5 py-4 text-right text-slate-500">{number(value(row, 'member_count'))} 人</td><td className="px-5 py-4 text-right font-bold text-slate-700">{number(value(row, 'personal_points')).toLocaleString()}</td><td className="px-5 py-4 text-right font-bold text-violet-600">{number(value(row, 'team_points')).toLocaleString()}</td><td className="px-5 py-4 text-right text-base font-black text-indigo-700">{number(value(row, 'final_score', 'total_points')).toLocaleString()}</td></>}</tr>})}{!filteredRows.length && <tr><td colSpan={isTeam ? 7 : 5} className="px-4 py-16 text-center text-slate-400">当前范围暂无数据</td></tr>}</tbody>
        </table></div>}
      </section>
    </>}
  </AppLayout>
}
