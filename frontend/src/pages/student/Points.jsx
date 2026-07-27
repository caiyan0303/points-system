import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Pagination from '../../components/Pagination'
import { TrendingUp, ShoppingBag, Award } from 'lucide-react'

const CATEGORIES = [
  '线上学习', '线上考试', '学习输出', '问卷反馈', '线下出勤',
  '课堂互动', '课堂任务', '实践任务', '成果转化', '团队共创', '团队贡献',
  '小组长职责', '项目贡献', '特殊调整'
]

export default function StudentPoints() {
  const [points, setPoints] = useState([])
  const [stats, setStats] = useState(null)
  const [years, setYears] = useState([])
  const [projects, setProjects] = useState([])
  const [phases, setPhases] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [yearId, setYearId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [phaseId, setPhaseId] = useState('')
  const [category, setCategory] = useState('')

  useEffect(() => {
    api.get('/api/student/dashboard')
      .then(({ data }) => setStats(data))
      .catch(() => {})
    api.get('/api/common/years').then(({ data }) => setYears(data.items || data))
    api.get('/api/common/projects').then(({ data }) => setProjects(data.items || data))
    api.get('/api/student/phase-overview').then(({ data }) => setPhases(data.phases || data))
  }, [])

  const fetchPoints = () => {
    setLoading(true)
    const params = { page, page_size: 20 }
    if (yearId) params.year_id = yearId
    if (projectId) params.project_id = projectId
    if (phaseId) params.phase_id = phaseId
    if (category) params.category = category
    api.get('/api/student/points/records', { params })
      .then(({ data }) => { setPoints(data.items || data); setTotalPages(data.total_pages || 1); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => { fetchPoints() }, [page])

  const handleSearch = () => { setPage(1); fetchPoints() }

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">积分明细</h1>
        <p className="text-gray-500 mt-1">查看积分获取详情</p>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              <span className="text-sm text-gray-500">本期积分</span>
            </div>
            <p className="text-2xl font-bold text-indigo-600">{stats.period_points || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Award className="w-5 h-5 text-green-500" />
              <span className="text-sm text-gray-500">总获得积分</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.total_points || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ShoppingBag className="w-5 h-5 text-purple-500" />
              <span className="text-sm text-gray-500">可用积分</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">{stats.available_points || 0}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={yearId} onChange={(e) => setYearId(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">所有年度</option>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">所有项目</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">所有阶段</option>
            {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">所有分类</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={handleSearch} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">筛选</button>
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
        ) : points.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400">暂无积分记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">积分事项</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">积分变化</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">所属阶段</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">获得时间</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">数据来源</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {points.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-[200px] truncate">{r.description || r.category || '-'}</td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right ${r.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.points > 0 ? '+' : ''}{r.points}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.phase_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(r.created_at || r.obtained_date).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {r.data_source || r.source || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[150px] truncate">{r.remark || r.description || '-'}</td>
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
