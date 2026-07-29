import { useEffect, useMemo, useState } from 'react'
import { Search, Table2 } from 'lucide-react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import PointsPageTabs from '../../components/PointsPageTabs'
import { useAdminScope } from '../../contexts/AdminScopeContext'

const value = (row, ...keys) => keys.reduce((found, key) => found ?? row?.[key], null) ?? 0

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

  const filteredRows = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    const matched = query ? rows.filter((row) => `${row.real_name || ''} ${row.username || ''} ${row.name || row.group_name || ''} ${row.group_name || ''}`.toLowerCase().includes(query)) : rows
    return [...matched].sort((a, b) => isTeam
      ? value(b, 'final_score', 'total_points') - value(a, 'final_score', 'total_points')
      : value(b, 'period_points', 'project_points', 'total_points') - value(a, 'period_points', 'project_points', 'total_points'))
  }, [isTeam, keyword, rows])

  return <AppLayout>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-slate-900">{isTeam ? '小组积分管理' : '个人积分管理'}</h1><p className="mt-1 text-sm text-slate-500">{selectedYear?.name || '未选择年度'} · {selectedProject?.name || '请先选择项目'}</p></div>
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={isTeam ? '搜索小组' : '搜索学员或小组'} className="w-64 rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500" /></div>
    </div>
    <PointsPageTabs type={isTeam ? 'team' : 'personal'} />
    {!projectId ? <div className="rounded-2xl border border-dashed border-indigo-200 bg-white p-16 text-center"><Table2 className="mx-auto h-10 w-10 text-indigo-300" /><p className="mt-3 font-semibold text-slate-700">请先在顶部选择年度和项目</p></div> :
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="py-20 text-center text-sm text-slate-400">正在汇总积分…</div> : error ? <div className="py-20 text-center text-sm text-rose-500">{error}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500"><tr>
          <th className="px-4 py-3">排名</th><th className="px-4 py-3">{isTeam ? '小组' : '学员'}</th>{!isTeam && <><th className="px-4 py-3">所属小组</th><th className="px-4 py-3">当前总积分</th><th className="px-4 py-3">可兑换积分</th></>}{isTeam && <><th className="px-4 py-3">成员人数</th><th className="px-4 py-3">成员个人积分</th><th className="px-4 py-3">小组任务积分</th><th className="px-4 py-3">小组最终得分</th></>}</tr></thead>
          <tbody className="divide-y divide-slate-100">{filteredRows.map((row, index) => <tr key={row.id} className="hover:bg-indigo-50/30"><td className="px-4 py-3 font-bold text-indigo-600">{row.rank ? `第 ${row.rank} 名` : index + 1}</td><td className="px-4 py-3 font-semibold text-slate-800">{isTeam ? row.name || row.group_name : row.real_name || row.username}</td>{!isTeam && <><td className="px-4 py-3 text-slate-500">{row.group_name || '未分组'}</td><td className="px-4 py-3 font-bold text-indigo-600">{value(row, 'period_points', 'project_points', 'total_points')}</td><td className="px-4 py-3 font-bold text-emerald-600">{value(row, 'available_points')}</td></>}{isTeam && <><td className="px-4 py-3 text-slate-500">{value(row, 'member_count')} 人</td><td className="px-4 py-3 text-slate-700">{value(row, 'personal_points')}</td><td className="px-4 py-3 text-violet-600">{value(row, 'team_points')}</td><td className="px-4 py-3 font-bold text-indigo-700">{value(row, 'final_score', 'total_points')}</td></>}</tr>)}{!filteredRows.length && <tr><td colSpan={isTeam ? 7 : 5} className="px-4 py-16 text-center text-slate-400">当前范围暂无数据</td></tr>}</tbody>
        </table></div>}
      </div>}
  </AppLayout>
}
