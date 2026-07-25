import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Pagination from '../../components/Pagination'
import Toast from '../../components/Toast'
import { Search, RefreshCw, Download, Eye, X, RotateCcw } from 'lucide-react'

const CATEGORIES = [
  '课程学习完成', '作业提交质量', '案例沟通表现', '案例输出成果',
  '线下课参与', '团队协作贡献', '知识分享输出', '特殊贡献奖励', '其它积分'
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
  const [groups, setGroups] = useState([])
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
  const [groupId, setGroupId] = useState('')
  const [category, setCategory] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Detail/Undo
  const [viewDetail, setViewDetail] = useState(null)
  const [undoModal, setUndoModal] = useState(null)
  const [undoReason, setUndoReason] = useState('')

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchRecords = () => {
    setLoading(true)
    const params = { page, page_size: 20 }
    if (keyword) params.keyword = keyword
    if (yearId) params.year_id = yearId
    if (projectId) params.project_id = projectId
    if (phaseId) params.phase_id = phaseId
    if (groupId) params.group_id = groupId
    if (category) params.category = category
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    api.get('/api/admin/points/records', { params })
      .then(({ data }) => { setRecords(data.items || data); setTotalPages(data.total_pages || 1); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => { fetchRecords() }, [page])
  useEffect(() => {
    api.get('/api/common/years').then(({ data }) => setYears(data.items || data))
    api.get('/api/common/projects').then(({ data }) => setProjects(data.items || data))
    api.get('/api/admin/phases').then(({ data }) => setPhases(data.items || data))
    api.get('/api/admin/groups').then(({ data }) => setGroups(data.items || data))
  }, [])

  const handleSearch = () => { setPage(1); fetchRecords() }
  const handleReset = () => { setKeyword(''); setYearId(''); setProjectId(''); setPhaseId(''); setGroupId(''); setCategory(''); setDateFrom(''); setDateTo(''); setPage(1); fetchRecords() }

  const handleUndo = async () => {
    if (!undoReason.trim()) return
    try {
      await api.delete(`/api/admin/points/${undoModal}`, { data: { reason: undoReason } })
      showToast('积分已撤销并扣减')
      setUndoModal(null); setUndoReason('')
      fetchRecords()
    } catch (err) { showToast(err.response?.data?.detail || '撤销失败', 'error') }
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
          <h1 className="text-2xl font-bold text-gray-900">积分流水</h1>
          <p className="text-gray-500 mt-1">查看所有积分变动记录</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
          <Download className="w-4 h-4" /> 导出
        </button>
      </div>

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
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">所有小组</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
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
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">学员姓名</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">积分事项</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">积分变化</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">所属阶段</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">数据来源</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">操作人员</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">操作时间</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.student_name || r.real_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">{r.description || r.category || '-'}</td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right ${r.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.points > 0 ? '+' : ''}{r.points}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.phase_name || '-'}</td>
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
                        {r.status !== '已撤销' && (
                          <button onClick={() => setUndoModal(r.id)} className="px-2 py-1 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100" title="撤销此积分">
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
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
              <div className="flex justify-between"><span className="text-gray-500">积分变化</span><span className={`font-semibold ${viewDetail.points > 0 ? 'text-green-600' : 'text-red-600'}`}>{viewDetail.points > 0 ? '+' : ''}{viewDetail.points}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">分类</span><span>{viewDetail.category || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">阶段</span><span>{viewDetail.phase_name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">说明</span><span>{viewDetail.description || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">操作人</span><span>{viewDetail.operator_name || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">时间</span><span>{new Date(viewDetail.created_at).toLocaleString('zh-CN')}</span></div>
            </div>
            <button onClick={() => setViewDetail(null)} className="mt-4 w-full py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">关闭</button>
          </div>
        </div>
      )}

      {/* Undo Confirm Modal */}
      {undoModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">撤销积分记录</h3><button onClick={() => { setUndoModal(null); setUndoReason('') }} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <p className="text-sm text-gray-500 mb-4">撤销后该积分将从学员总积分中扣减，请填写原因：</p>
            <textarea value={undoReason} onChange={(e) => setUndoReason(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="请输入撤销原因" />
            <div className="flex gap-3 mt-6"><button onClick={() => { setUndoModal(null); setUndoReason('') }} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button><button onClick={handleUndo} disabled={!undoReason.trim()} className="flex-1 py-2.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">确认撤销</button></div>
          </div>
        </div>
      )}

    </AppLayout>
  )
}
