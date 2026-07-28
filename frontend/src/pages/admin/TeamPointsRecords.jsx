import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Trash2, UsersRound } from 'lucide-react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'

export default function AdminTeamPointsRecords() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/team-points', { params: { page_size: 100 } })
      setRecords(data.items || [])
    } catch (error) {
      showToast(error.response?.data?.detail || '团队积分流水加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRecords() }, [loadRecords])

  const remove = async record => {
    if (!confirm(`确定删除“${record.group_name}”的团队积分“${record.item_name}”吗？删除后小组排名会自动重算。`)) return
    try {
      await api.delete(`/api/admin/team-points/${record.id}`)
      showToast('团队积分已删除，小组排名已自动重算')
      await loadRecords()
    } catch (error) {
      showToast(error.response?.data?.detail || '删除失败', 'error')
    }
  }

  return <AppLayout>
    <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">团队积分流水</h1>
        <p className="text-gray-500 mt-1">每笔团队积分都会联动阶段小组排名和团队最终得分</p>
      </div>
      <button onClick={loadRecords} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新流水
      </button>
    </div>
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center gap-2"><UsersRound className="w-5 h-5 text-indigo-600" /><h2 className="font-semibold">团队积分记录</h2></div>
      {loading ? <div className="py-16 text-center text-sm text-gray-400">正在加载团队积分流水…</div> : <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500"><tr><th className="px-4 py-3 text-left">小组</th><th className="px-4 py-3 text-left">项目 / 阶段</th><th className="px-4 py-3 text-left">分类</th><th className="px-4 py-3 text-left">积分事项</th><th className="px-4 py-3 text-right">团队积分</th><th className="px-4 py-3 text-left">获得时间</th><th className="px-4 py-3 text-center">操作</th></tr></thead>
          <tbody className="divide-y">{records.map(record => <tr key={record.id}>
            <td className="px-4 py-3 font-medium">{record.group_name}</td>
            <td className="px-4 py-3 text-gray-500">{record.project_name || '-'} / {record.phase_name || '项目级'}</td>
            <td className="px-4 py-3">{record.category}</td>
            <td className="px-4 py-3">{record.item_name}</td>
            <td className={`px-4 py-3 text-right font-semibold ${Number(record.points) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{Number(record.points) > 0 ? '+' : ''}{record.points}</td>
            <td className="px-4 py-3 text-gray-500">{record.obtained_date?.slice(0, 10)}</td>
            <td className="px-4 py-3 text-center"><button onClick={() => remove(record)} className="p-1.5 rounded bg-red-50 text-red-500 hover:bg-red-100" title="删除此团队积分"><Trash2 className="w-4 h-4" /></button></td>
          </tr>)}</tbody>
        </table>
        {!records.length && <p className="py-10 text-center text-sm text-gray-400">暂无团队积分记录</p>}
      </div>}
    </div>
  </AppLayout>
}
