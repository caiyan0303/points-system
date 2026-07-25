import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { Archive, ChevronDown, ChevronRight } from 'lucide-react'

export default function AdminYearly() {
  const [years, setYears] = useState([])
  const [expandedYear, setExpandedYear] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [archiveConfirm, setArchiveConfirm] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchYears = () => {
    setLoading(true)
    api.get('/api/common/years')
      .then(({ data }) => { setYears(data.items || data); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => { fetchYears() }, [])

  const handleArchive = async (yearId) => {
    try {
      await api.put(`/api/common/years/${yearId}`, { status: 'archived' })
      showToast('年度已归档')
      setArchiveConfirm(null)
      fetchYears()
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const toggleExpand = async (yearId) => {
    if (expandedYear === yearId) { setExpandedYear(null); return }
    setExpandedYear(yearId)
    // Fetch projects if not loaded
    const year = years.find(y => y.id === yearId)
    if (year && !year.projects) {
      try {
        const { data } = await api.get(`/api/common/years/${yearId}`)
        setYears(prev => prev.map(y => y.id === yearId ? { ...y, projects: data.projects || [] } : y))
      } catch (e) {}
    }
  }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">���度积分</h1>
        <p className="text-gray-500 mt-1">查看各年度积分统计</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48 text-red-400">{error}</div>
      ) : years.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400">暂无年度数据</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-8"></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">年度</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">项目数</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">学员数</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">总积分</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">状态</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {years.map((y) => (
                <>
                  <tr key={y.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(y.id)}>
                    <td className="px-4 py-3">
                      {expandedYear === y.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{y.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-center">{y.project_count || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-center">{y.student_count || 0}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-indigo-600 text-right">{y.total_points || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        y.status === 'archived' ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-600'
                      }`}>{y.status === 'archived' ? '已归档' : '进行中'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {y.status !== 'archived' && (
                        <button onClick={(e) => { e.stopPropagation(); setArchiveConfirm(y) }} className="px-3 py-1.5 text-xs bg-gray-50 text-gray-500 rounded hover:bg-gray-100">
                          <Archive className="w-3 h-3 inline mr-1" /> 归档
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedYear === y.id && y.projects && (
                    <tr>
                      <td colSpan={7} className="bg-gray-50 px-8 py-4">
                        <div className="space-y-2">
                          {(Array.isArray(y.projects) ? y.projects : []).map((p, pi) => (
                            <div key={pi} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                              <div>
                                <span className="text-sm font-medium text-gray-900">{p.name}</span>
                                <span className="text-xs text-gray-500 ml-3">阶段: {p.phase_count || 0}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-gray-500">学员: {p.student_count || 0}</span>
                                <span className="font-semibold text-indigo-600">{p.total_points || 0} 分</span>
                              </div>
                            </div>
                          ))}
                          {y.projects.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">暂无项目</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {archiveConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold mb-2">归档年度</h3>
            <p className="text-sm text-gray-500">确定要归档「{archiveConfirm.name}」吗？归档后将变为只读。</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setArchiveConfirm(null)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={() => handleArchive(archiveConfirm.id)} className="flex-1 py-2.5 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700">确认归档</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
