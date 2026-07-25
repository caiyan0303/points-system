import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Pagination from '../../components/Pagination'
import Toast from '../../components/Toast'
import { Search, RefreshCw } from 'lucide-react'

const ACTION_TYPES = [
  { key: '', label: '全部' },
  { key: 'login', label: '登录' },
  { key: 'create', label: '创建' },
  { key: 'update', label: '更新' },
  { key: 'delete', label: '删除' },
  { key: 'revoke', label: '撤销' },
  { key: 'approve', label: '审批' },
  { key: 'export', label: '导出' },
]

export default function AdminOperationLogs() {
  const [logs, setLogs] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  const [keyword, setKeyword] = useState('')
  const [actionType, setActionType] = useState('')
  const [targetType, setTargetType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchLogs = () => {
    setLoading(true)
    const params = { page, page_size: 20 }
    if (keyword) params.keyword = keyword
    if (actionType) params.action_type = actionType
    if (targetType) params.target_type = targetType
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    api.get('/api/admin/operation-logs', { params })
      .then(({ data }) => { setLogs(data.items || data); setTotalPages(data.total_pages || 1); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => { fetchLogs() }, [page])

  const handleSearch = () => { setPage(1); fetchLogs() }
  const handleReset = () => { setKeyword(''); setActionType(''); setTargetType(''); setDateFrom(''); setDateTo(''); setPage(1); fetchLogs() }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">操作记录</h1>
        <p className="text-gray-500 mt-1">查看管理员操作日志</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索操作人..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            {ACTION_TYPES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
          <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">全部类型</option>
            <option value="student">学员</option>
            <option value="group">小组</option>
            <option value="phase">阶段</option>
            <option value="product">商品</option>
            <option value="redemption">兑换</option>
            <option value="points">积分</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          <span className="text-gray-400">-</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          <button onClick={handleSearch} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">搜索</button>
          <button onClick={handleReset} className="px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-48 text-red-400">{error}</div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400">暂无操作记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">操作人</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">操作类型</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">目标类型</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">目标ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">详情</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{l.operator_name || l.admin_name || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        l.action_type === 'login' ? 'bg-blue-50 text-blue-600' :
                        l.action_type === 'create' ? 'bg-green-50 text-green-600' :
                        l.action_type === 'delete' ? 'bg-red-50 text-red-500' :
                        l.action_type === 'approve' ? 'bg-indigo-50 text-indigo-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>{l.action_type || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{l.target_type || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">#{l.target_id || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[300px] truncate">{l.detail || l.description || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{new Date(l.created_at).toLocaleString('zh-CN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-4 border-t border-gray-100"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
      </div>
    </AppLayout>
  )
}
