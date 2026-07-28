import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { Award, ChevronRight, History, TrendingUp, Users } from 'lucide-react'

export default function StudentDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/api/student/dashboard')
      .then(({ data: result }) => setData(result))
      .catch((err) => setError(err.response?.data?.detail || '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <AppLayout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div></AppLayout>
  if (error || !data) return <AppLayout><div className="flex items-center justify-center h-64 text-gray-400">{error || '暂无数据'}</div></AppLayout>

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">个人首页</h1>
        <p className="text-gray-500 mt-1">欢迎回来，{data.real_name || ''}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center gap-x-6 gap-y-2 flex-wrap text-sm">
          <span><span className="text-gray-500">学员姓名：</span><span className="font-medium text-gray-900">{data.real_name}</span></span>
          <span><span className="text-gray-500">年度：</span><span className="font-medium text-gray-900">{data.year_name || '-'}</span></span>
          <span><span className="text-gray-500">培训项目：</span><span className="font-medium text-gray-900">{data.project_name || '-'}</span></span>
          <span><span className="text-gray-500">小组：</span><span className="font-medium text-gray-900">{data.group_name || '-'}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <button type="button" onClick={() => navigate('/student/points')} className="text-left bg-white rounded-xl border border-blue-200 p-6 hover:border-blue-400 hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Award className="w-5 h-5 text-blue-600" /> 个人排名</h2>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-600" />
          </div>
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-sm text-gray-500">当前项目排名</p>
              <p className="text-4xl font-bold text-gray-900 mt-1">{data.period_rank ? `第 ${data.period_rank} 名` : '-'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">个人总积分</p>
              <p className="text-3xl font-bold text-indigo-600 mt-1">{data.personal_cumulative_points || 0}</p>
            </div>
          </div>
          <div className="mt-5 rounded-xl bg-blue-50 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-500">当前阶段</p>
              <p className="font-medium text-gray-900 mt-0.5">{data.current_phase || '暂无进行中的阶段'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-blue-500">阶段个人排名</p>
              <p className="text-xl font-bold text-blue-700">{data.current_phase_rank ? `第 ${data.current_phase_rank} 名` : '-'}</p>
            </div>
          </div>
        </button>

        <button type="button" onClick={() => navigate('/student/team')} className="text-left bg-white rounded-xl border border-orange-200 p-6 hover:border-orange-400 hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Users className="w-5 h-5 text-orange-600" /> 小组排名</h2>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-orange-600" />
          </div>
          <p className="text-sm text-gray-500">我的小组</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.group_name || '暂未分组'}</p>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="rounded-xl bg-orange-50 p-4">
              <p className="text-xs text-orange-500">小组排名</p>
              <p className="text-3xl font-bold text-orange-700 mt-1">{data.group_rank ? `第 ${data.group_rank} 名` : '-'}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-4">
              <p className="text-xs text-amber-600">团队最终得分</p>
              <p className="text-3xl font-bold text-amber-700 mt-1">{data.team_final_score || 0}</p>
            </div>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4"><TrendingUp className="w-4 h-4" /> 最近个人积分</h3>
          {data.recent_points?.length ? <div className="space-y-3">{data.recent_points.slice(0, 5).map((record) => (
            <div key={record.id} className="flex items-center justify-between text-sm">
              <div><p className="text-gray-700">{record.category || record.description || '-'}</p><p className="text-xs text-gray-400">{new Date(record.created_at).toLocaleString('zh-CN')}</p></div>
              <span className={`font-semibold ${Number(record.points) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{Number(record.points) > 0 ? '+' : ''}{record.points}</span>
            </div>
          ))}</div> : <p className="text-sm text-gray-400 py-4 text-center">暂无个人积分记录</p>}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4"><History className="w-4 h-4" /> 最近兑换</h3>
          {data.recent_redemptions?.length ? <div className="space-y-3">{data.recent_redemptions.slice(0, 5).map((record) => (
            <div key={record.id} className="flex items-center justify-between text-sm">
              <div><p className="text-gray-700">{record.product_name || '-'}</p><p className="text-xs text-gray-400">{new Date(record.created_at).toLocaleString('zh-CN')}</p></div>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{record.status}</span>
            </div>
          ))}</div> : <p className="text-sm text-gray-400 py-4 text-center">暂无兑换记录</p>}
        </div>
      </div>
    </AppLayout>
  )
}
