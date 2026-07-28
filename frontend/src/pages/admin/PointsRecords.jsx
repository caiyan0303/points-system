import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Pagination from '../../components/Pagination'
import Toast from '../../components/Toast'
import PointsPageTabs from '../../components/PointsPageTabs'
import { Search, RefreshCw, Download, Eye, X, Trash2 } from 'lucide-react'

const CATEGORIES = [
  '线上学习', '学习输出', '问卷及测评反馈', '线下出勤',
  '课堂互动', '结营任务', '小组长职责', '特殊调整'
]

const SOURCE_BADGES = {
  manual: 'bg-blue-50 text-blue-600',
  system: 'bg-purple-50 text-purple-600',
  import: 'bg-orange-50 text-orange-600',
  redemption: 'bg-pink-50 text-pink-600',
  deduction: 'bg-red-50 text-red-600',
}

export default function AdminPointsRecords() {
  const [records, setRecords] = useState([])
  const [years, setYears] = useState([])
  const [projects, setProjects] = useState([])
  const [phases, setPhases] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // Filters
  const [keyword, setKeyword] = useState('')
  const [yearId, setYearId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [phaseId, setPhaseId] = useState('')
  const [category, setCategory] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Detail/Delete
  const [viewDetail, setViewDetail] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [deleteTargets, setDeleteTargets] = useState([])
  const [deleting, setDeleting] = useState(false)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchRecords = () => {
    setLoading(true)
    const params = { page, page_size: 20 }
    if (keyword) params.keyword = keyword
    if (yearId) params.year_id = yearId
    if (projectId) params.project_id = projectId
    if (phaseId) params.phase_id = phaseId
    if (category) params.category = category
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    api.get('/api/admin/points/records', { params })
      .then(({ data }) => { setRecords(data.items || data); setSelectedIds([]); setTotalPages(data.total_pages || 1); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => { fetchRecords() }, [page])
  useEffect(() => {
    api.get('/api/common/years').then(({ data }) => setYears(data.items || data))
    api.get('/api/common/projects').then(({ data }) => setProjects(data.items || data))
    api.get('/api/admin/phases').then(({ data }) => setPhases(data.items || data))
  }, [])

  const handleSearch = () => { setPage(1); fetchRecords() }
  const handleReset = () => { setKeyword(''); setYearId(''); setProjectId(''); setPhaseId(''); setCategory(''); setDateFrom(''); setDateTo(''); setPage(1); fetchRecords() }

  const handleDelete = async () => {
    if (deleteTargets.length === 0) return
    setDeleting(true)
    try {
      if (deleteTargets.length === 1) {
        await api.delete(`/api/admin/points/${deleteTargets[0]}`)
      } else {
        await api.post('/api/admin/points/batch-delete', { point_ids: deleteTargets })
      }
      showToast(`已删除 ${deleteTargets.length} 条积分流水，学员积分已同步更新`)
      setDeleteTargets([])
      fetchRecords()
    } catch (err) {
      showToast(err.response?.data?.detail || '删除失败', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleExport = () => {
    const params = {}
    if (keyword) params.keyword = keyword
    if (yearId) params.year_id = yearId
    if (projectId) params.project_id = projectId
    if (phaseId) params.phase_id = phaseId
    if (category) params.category = category
    api.get('/api/admin/points/records/export', { params, responseType: 'blob' })
      .then(res => {
        const url = window.URL.createObjectURL(new Blob([res.data]))
        const a = document.createElement('a')
        a.href = url; a.download = 'points_records.csv'
        a.click(); window.URL.revokeObjectURL(url)
      })
      .catch(() => showToast('导出失败', 'error'))
  }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">个人积分</h1>
          <p className="text-gray-500 mt-1">录入个人积分或查看积分流水</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <button onClick={() => setDeleteTargets(selectedIds)} className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
              <Trash2 className="w-4 h-4" /> 批量删除（{selectedIds.length}）
            </button>
          )}
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Download className="w-4 h-4" /> 导出
          </button>
        </div>
      </div>
      <PointsPageTabs type="personal" />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索学员姓名..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <select value={yearId} onChange={(e) => setYearId(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">所有年度</option>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">所有项目</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">所有阶段</option>
            {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">所有分类</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
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
        ) : records.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400">暂无记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-10 px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={records.length > 0 && records.every(record => selectedIds.includes(record.id))}
                      onChange={(event) => setSelectedIds(event.target.checked ? records.map(record => record.id) : [])}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label="选择当前页全部积分流水"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">学员姓名</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">年度</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">项目名称</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">所属阶段</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">积分分类</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">积分事项</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">积分变化</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">数据来源</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">操作人员</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">操作时间</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={(event) => setSelectedIds(current => (
                          event.target.checked ? [...current, r.id] : current.filter(id => id !== r.id)
                        ))}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        aria-label={`选择${r.student_name || '该学员'}的积分流水`}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.student_name || r.real_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{r.year_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px] truncate" title={r.project_name || ''}>{r.project_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.phase_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{r.category || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[220px] truncate" title={r.item_name || r.description || ''}>{r.item_name || r.description || '-'}</td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right ${r.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.points > 0 ? '+' : ''}{r.points}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${SOURCE_BADGES[r.data_source] || 'bg-gray-100 text-gray-500'}`}>
                        {r.data_source || r.source || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.admin_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(r.created_at).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setViewDetail(r)} className="px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100" title="查看详情">
                          <Eye className="w-3 h-3" />
                        </button>
                        <button onClick={() => setDeleteTargets([r.id])} className="px-2 py-1 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100" title="删除此积分">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-4 border-t border-gray-100"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
      </div>

      {/* View Detail Dialog */}
      {viewDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">积分记录详情</h3>
              <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">学员</span><span className="font-medium">{viewDetail.student_name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">年度</span><span>{viewDetail.year_name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">项目名称</span><span>{viewDetail.project_name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">积分变化</span><span className={`font-semibold ${viewDetail.points > 0 ? 'text-green-600' : 'text-red-600'}`}>{viewDetail.points > 0 ? '+' : ''}{viewDetail.points}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">分类</span><span>{viewDetail.category || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">计分对象</span><span>个人</span></div>
              <div className="flex justify-between"><span className="text-gray-500">积分事项</span><span>{viewDetail.item_name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">阶段</span><span>{viewDetail.phase_name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">说明</span><span>{viewDetail.description || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">来源说明</span><span>{viewDetail.source_note || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">操作人</span><span>{viewDetail.operator_name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">时间</span><span>{new Date(viewDetail.created_at).toLocaleString('zh-CN')}</span></div>
            </div>
            <button onClick={() => setViewDetail(null)} className="mt-4 w-full py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">关闭</button>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTargets.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{deleteTargets.length > 1 ? '批量删除积分流水' : '删除积分流水'}</h3>
              <button onClick={() => setDeleteTargets([])} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              确定删除选中的 {deleteTargets.length} 条积分流水吗？删除后无法恢复，相关学员的积分、排名和汇总数据会同步重新计算。
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDeleteTargets([])} disabled={deleting} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">取消</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? '删除中...' : '确认删除'}</button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  )
}
