import { useEffect, useState } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Pagination from '../../components/Pagination'
import { Award, Medal, ShoppingBag, TrendingUp } from 'lucide-react'

const CATEGORIES = ['线上学习', '学习输出', '问卷及测评反馈', '线下出勤', '课堂互动', '结营任务', '小组长职责', '特殊调整']

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
    api.get('/api/student/dashboard').then(({ data }) => setStats(data)).catch(() => {})
    api.get('/api/common/years').then(({ data }) => setYears(data.items || data || [])).catch(() => {})
    api.get('/api/common/projects').then(({ data }) => setProjects(data.items || data || [])).catch(() => {})
    api.get('/api/student/phase-overview').then(({ data }) => setPhases(data.phases || data || [])).catch(() => {})
  }, [])

  const fetchPoints = (targetPage = page) => {
    setLoading(true)
    setError(null)
    const params = { page: targetPage, page_size: 20 }
    if (yearId) params.year_id = yearId
    if (projectId) params.project_id = projectId
    if (phaseId) params.phase_id = phaseId
    if (category) params.category = category
    api.get('/api/student/points/records', { params })
      .then(({ data }) => { setPoints(data.items || data || []); setTotalPages(data.total_pages || 1) })
      .catch((err) => setError(err.response?.data?.detail || '加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchPoints(page) }, [page])

  const handleSearch = () => {
    if (page === 1) fetchPoints(1)
    else setPage(1)
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">个人积分</h1>
        <p className="text-gray-500 mt-1">查看个人积分、阶段排名与每一笔积分记录</p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center"><TrendingUp className="w-5 h-5 text-indigo-500 mx-auto mb-2" /><p className="text-sm text-gray-500">当前项目积分</p><p className="text-2xl font-bold text-indigo-600 mt-1">{stats.period_points || 0}</p></div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center"><Award className="w-5 h-5 text-green-500 mx-auto mb-2" /><p className="text-sm text-gray-500">个人累计积分</p><p className="text-2xl font-bold text-green-600 mt-1">{stats.personal_cumulative_points || 0}</p></div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center"><ShoppingBag className="w-5 h-5 text-purple-500 mx-auto mb-2" /><p className="text-sm text-gray-500">可兑换积分</p><p className="text-2xl font-bold text-purple-600 mt-1">{stats.available_points || 0}</p></div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Medal className="w-4 h-4 text-amber-500" /> 各阶段个人积分排名</h2>
          <p className="text-xs text-gray-500 mt-1">每个阶段的个人积分第一名会在此标注</p>
        </div>
        {phases.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500"><tr><th className="px-4 py-3 text-left">年度</th><th className="px-4 py-3 text-left">项目名称</th><th className="px-4 py-3 text-left">阶段</th><th className="px-4 py-3 text-right">阶段个人积分</th><th className="px-4 py-3 text-right">阶段排名</th></tr></thead>
              <tbody className="divide-y divide-gray-100">{phases.map((phase) => (
                <tr key={phase.phase_id} className="hover:bg-gray-50"><td className="px-4 py-3 text-gray-500">{phase.year_name || '-'}</td><td className="px-4 py-3 text-gray-700">{phase.project_name || '-'}</td><td className="px-4 py-3 font-medium text-gray-900">{phase.phase_name}</td><td className="px-4 py-3 text-right font-semibold text-indigo-600">{phase.points || 0}</td><td className="px-4 py-3 text-right">{phase.rank ? <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold ${Number(phase.rank) === 1 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>{Number(phase.rank) === 1 && <Medal className="w-3.5 h-3.5" />}第 {phase.rank} 名</span> : '-'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="py-8 text-center text-sm text-gray-400">暂无阶段排名数据</p>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={yearId} onChange={(e) => setYearId(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">所有年度</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">所有项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">所有阶段</option>{phases.map((phase) => <option key={phase.phase_id} value={phase.phase_id}>{phase.phase_name}</option>)}</select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">所有积分类别</option>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <button onClick={handleSearch} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">筛选</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900">个人积分记录</h2></div>
        {loading ? <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div> : error ? <div className="flex items-center justify-center h-48 text-red-500">{error}</div> : !points.length ? <div className="flex items-center justify-center h-48 text-gray-400">暂无个人积分记录</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500"><tr><th className="px-4 py-3 text-left">年度</th><th className="px-4 py-3 text-left">项目名称</th><th className="px-4 py-3 text-left">所属阶段</th><th className="px-4 py-3 text-left">积分类别</th><th className="px-4 py-3 text-right">积分变化</th><th className="px-4 py-3 text-left">获得时间</th><th className="px-4 py-3 text-left">数据来源</th><th className="px-4 py-3 text-left">备注</th></tr></thead>
              <tbody className="divide-y divide-gray-100">{points.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50"><td className="px-4 py-3 text-gray-500">{record.year_name || '-'}</td><td className="px-4 py-3 text-gray-700">{record.project_name || '-'}</td><td className="px-4 py-3 text-gray-500">{record.phase_name || '-'}</td><td className="px-4 py-3 font-medium text-gray-900">{record.category || '-'}</td><td className={`px-4 py-3 text-right font-semibold ${Number(record.points) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{Number(record.points) > 0 ? '+' : ''}{record.points}</td><td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(record.obtained_date || record.created_at).toLocaleString('zh-CN')}</td><td className="px-4 py-3 text-gray-500">{record.data_source || record.source || '-'}</td><td className="px-4 py-3 text-gray-500 max-w-[180px] truncate" title={record.description || ''}>{record.description || '-'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="p-4 border-t border-gray-100"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
      </div>
    </AppLayout>
  )
}
