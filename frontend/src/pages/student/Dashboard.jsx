import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { Layers, TrendingUp, ShoppingBag, History, Award, Clock, Users } from 'lucide-react'

export default function StudentDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/api/student/dashboard')
      .then(({ data }) => { setData(data); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      </AppLayout>
    )
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-gray-400">{error || '暂无数据'}</div>
      </AppLayout>
    )
  }

  const statCards = [
    { label: '个人累计积分', value: data.personal_cumulative_points || 0, icon: TrendingUp, color: 'bg-indigo-100 text-indigo-600' },
    { label: '可兑换积分', value: data.available_points || 0, icon: ShoppingBag, color: 'bg-purple-100 text-purple-600' },
    { label: '当前阶段个人积分', value: data.current_phase_points || 0, icon: Layers, color: 'bg-green-100 text-green-600' },
    { label: '团队积分', value: data.team_points || 0, icon: Users, color: 'bg-orange-100 text-orange-600' },
    { label: '团队最终得分', value: data.team_final_score || 0, icon: Award, color: 'bg-yellow-100 text-yellow-600' },
    { label: '个人排名', value: data.period_rank ? `第 ${data.period_rank} 名` : '-', icon: Award, color: 'bg-blue-100 text-blue-600' },
  ]

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">个人首页</h1>
        <p className="text-gray-500 mt-1">欢迎回来，{data.real_name || ''}</p>
      </div>

      {/* Personal Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center gap-4 flex-wrap text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">学员姓名:</span>
            <span className="font-medium text-gray-900">{data.real_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">年度:</span>
            <span className="font-medium text-gray-900">{data.year_name || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">培训项目:</span>
            <span className="font-medium text-gray-900">{data.project_name || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">小组:</span>
            <span className="font-medium text-gray-900">{data.group_name || '-'}</span>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4 mb-6">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.color}`}>
                <c.icon className="w-5 h-5" />
              </div>
              <span className="text-sm text-gray-500">{c.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Current Phase */}
        {data.current_phase && (
          <div className="bg-white rounded-xl border border-indigo-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Clock className="w-4 h-4 text-indigo-600" /> 当前阶段</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600">进行中</span>
            </div>
            <p className="text-lg font-semibold text-gray-900">{String(data.current_phase)}</p>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className="text-gray-500">积分: <span className="font-semibold text-indigo-600">{data.current_phase_points || 0}</span></span>
              <span className="text-gray-500">排名: <span className="font-semibold">{data.current_phase_rank ? `第 ${data.current_phase_rank} 名` : '-'}</span></span>
            </div>
          </div>
        )}

        {/* Group Rank */}
        {data.group_rank && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-indigo-600" /> 小组排名</h3>
            <p className="text-3xl font-bold text-gray-900">第 {data.group_rank} 名</p>
            <p className="text-sm text-gray-500 mt-1">小组: {data.group_name || '-'}</p>
          </div>
        )}
      </div>

      {/* Phase Overview */}
      {data.phase_points && data.phase_points.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4" /> 阶段概览
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {(Array.isArray(data.phase_points) ? data.phase_points : []).map((p, i) => (
              <div key={i} className={`rounded-xl border p-4 ${p.status === '进行中' ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200 bg-gray-50'}`}>
                <p className="text-sm font-medium text-gray-900">{p.phase_name}</p>
                <div className="flex items-center gap-3 mt-2 text-sm">
                  <span className="text-indigo-600 font-semibold">{p.points || 0} 分</span>
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-500">排名: {p.rank ? `第${p.rank}名` : '-'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Feeds */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent Points */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4" /> 最近积分
          </h3>
          {data.recent_points && data.recent_points.length > 0 ? (
            <div className="space-y-3">
              {data.recent_points.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-700 truncate">{r.description || r.category || '-'}</p>
                    <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString('zh-CN')}</p>
                  </div>
                  <span className={`font-semibold ml-2 ${r.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {r.points > 0 ? '+' : ''}{r.points}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">暂无积分记录</p>
          )}
        </div>

        {/* Recent Redemptions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <History className="w-4 h-4" /> 最近兑换
          </h3>
          {data.recent_redemptions && data.recent_redemptions.length > 0 ? (
            <div className="space-y-3">
              {data.recent_redemptions.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-700 truncate">{r.product_name || '-'}</p>
                    <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString('zh-CN')}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${
                    r.status === 'completed' ? 'bg-green-50 text-green-600' :
                    r.status === 'pending' ? 'bg-yellow-50 text-yellow-600' :
                    r.status === 'rejected' ? 'bg-red-50 text-red-500' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {r.status === 'completed' ? '已完成' : r.status === 'pending' ? '待审核' : r.status === 'rejected' ? '已拒绝' : r.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">暂无兑换记录</p>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
