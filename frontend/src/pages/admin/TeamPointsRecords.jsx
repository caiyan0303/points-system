import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Trash2, UsersRound, X } from 'lucide-react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import PointsPageTabs from '../../components/PointsPageTabs'
import { useAdminScope } from '../../contexts/AdminScopeContext'

export default function AdminTeamPointsRecords() {
  const { yearId: scopeYearId, projectId: scopeProjectId, selectedProject } = useAdminScope()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [totalRecords, setTotalRecords] = useState(0)
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/team-points', { params: { page_size: 100, project_id: scopeProjectId || undefined } })
      setRecords(data.items || [])
      setTotalRecords(data.total ?? (data.items || []).length)
    } catch (error) {
      showToast(error.response?.data?.detail || '小组积分流水加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [scopeProjectId])

  useEffect(() => { loadRecords() }, [loadRecords])

  const remove = async record => {
    if (!confirm(`确定删除“${record.group_name}”的小组积分“${record.item_name}”吗？删除后小组排名会自动重算。`)) return
    try {
      await api.delete(`/api/admin/team-points/${record.id}`)
      showToast('小组积分已删除，小组排名已自动重算')
      await loadRecords()
    } catch (error) {
      showToast(error.response?.data?.detail || '删除失败', 'error')
    }
  }

  const removeAll = async () => {
    if (!scopeYearId || !scopeProjectId) return showToast('请先在顶部选择年度和项目', 'error')
    setDeleting(true)
    try {
      const { data } = await api.post('/api/admin/team-points/delete-all', { year_id: Number(scopeYearId), project_id: Number(scopeProjectId) })
      showToast(data.message || '小组积分流水已删除')
      setDeleteAllConfirm(false)
      await loadRecords()
    } catch (error) {
      showToast(error.response?.data?.detail || '一键删除失败', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return <AppLayout>
    <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">小组积分流水{selectedProject ? ` · ${selectedProject.name}` : ''}</h1>
        <p className="text-gray-500 mt-1">查看当前培训项目的小组积分记录</p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setDeleteAllConfirm(true)} disabled={loading || !scopeYearId || !scopeProjectId || totalRecords === 0} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
          <Trash2 className="w-4 h-4" /> 一键删除流水
        </button>
        <button onClick={loadRecords} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新流水
        </button>
      </div>
    </div>
    <PointsPageTabs type="team" />
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center gap-2"><UsersRound className="w-5 h-5 text-indigo-600" /><h2 className="font-semibold">小组积分记录</h2></div>
      {loading ? <div className="py-16 text-center text-sm text-gray-400">正在加载小组积分流水…</div> : <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500"><tr><th className="px-4 py-3 text-left">小组</th><th className="px-4 py-3 text-left">项目 / 阶段</th><th className="px-4 py-3 text-left">分类</th><th className="px-4 py-3 text-left">积分事项</th><th className="px-4 py-3 text-right">小组积分</th><th className="px-4 py-3 text-left">获得时间</th><th className="px-4 py-3 text-center">操作</th></tr></thead>
          <tbody className="divide-y">{records.map(record => <tr key={record.id}>
            <td className="px-4 py-3 font-medium">{record.group_name}</td>
            <td className="px-4 py-3 text-gray-500">{record.project_name || '-'} / {record.phase_name || '项目级'}</td>
            <td className="px-4 py-3">{record.category}</td>
            <td className="px-4 py-3">{record.item_name}</td>
            <td className={`px-4 py-3 text-right font-semibold ${Number(record.points) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{Number(record.points) > 0 ? '+' : ''}{record.points}</td>
            <td className="px-4 py-3 text-gray-500">{record.obtained_date?.slice(0, 10)}</td>
            <td className="px-4 py-3 text-center"><button onClick={() => remove(record)} className="p-1.5 rounded bg-red-50 text-red-500 hover:bg-red-100" title="删除此小组积分"><Trash2 className="w-4 h-4" /></button></td>
          </tr>)}</tbody>
        </table>
        {!records.length && <p className="py-10 text-center text-sm text-gray-400">暂无小组积分记录</p>}
      </div>}
    </div>
    {deleteAllConfirm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-900">确认一键删除小组积分流水</h3><button onClick={() => setDeleteAllConfirm(false)} disabled={deleting} className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
        <p className="mt-3 text-sm leading-6 text-gray-600">将删除当前项目“{selectedProject?.name || '-'}”的 <strong className="text-red-600">{totalRecords}</strong> 条小组积分流水。</p>
        <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">删除后无法恢复，小组积分、项目小组排名和学员端小组积分展示会自动重新计算。</div>
        <div className="mt-6 flex gap-3"><button onClick={() => setDeleteAllConfirm(false)} disabled={deleting} className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-50">取消</button><button onClick={removeAll} disabled={deleting} className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{deleting ? '正在删除...' : `确认删除 ${totalRecords} 条`}</button></div>
      </div>
    </div>}
  </AppLayout>
}
