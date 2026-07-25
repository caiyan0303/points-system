import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import {
  Users, TrendingUp, ClipboardCheck, ShoppingBag, Layers,
  UserCheck, Gift, PlusCircle, Award, Clock
} from 'lucide-react'

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/api/admin/dashboard')
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
        <div className="flex items-center justify-center h-64 text-gray-400">
          {error || '暂无数据'}
        </div>
      </AppLayout>
    )
  }

  const statCards = [
    { label: '学员总数', value: data.total_students, sub: `${data.active_students || 0} 人启用, ${data.terminated_students || 0} 人终止`, icon: Users, color: 'bg-indigo-100 text-indigo-600' },
    { label: '当前年度', value: data.current_year || '-', sub: `培训项目: ${data.current_project || '-'}`, icon: CalendarIcon, color: 'bg-blue-100 text-blue-600' },
    { label: '当前阶段', value: data.current_phase || '-', sub: `阶段积分: ${data.period_points || 0}`, icon: Layers, color: 'bg-green-100 text-green-600' },
    { label: '可用积分总额', value: data.available_points_total || 0, sub: `待审核兑换: ${data.pending_redemptions || 0} 笔`, icon: TrendingUp, color: 'bg-purple-100 text-purple-600' },
  ]

  const quickActions = [
    { label: '新增学员', icon: Users, path: '/admin/students', color: 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200' },
    { label: '录入积分', icon: PlusCircle, path: '/admin/points', color: 'bg-green-100 text-green-600 hover:bg-green-200' },
    { label: '创建阶段', icon: Layers, path: '/admin/phases', color: 'bg-orange-100 text-orange-600 hover:bg-orange-200' },
    { label: '现场发放', icon: Gift, path: '/admin/on-site', color: 'bg-pink-100 text-pink-600 hover:bg-pink-200' },
    { label: '新增商品', icon: ShoppingBag, path: '/admin/products', color: 'bg-purple-100 text-purple-600 hover:bg-purple-200' },
  ]

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">管理仪表盘</h1>
        <p className="text-gray-500 mt-1">积分管理系统概览</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.color}`}>
                <c.icon className="w-5 h-5" />
              </div>
              <span className="text-sm text-gray-500">{c.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{c.value}</p>
            <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-sm text-gray-500 mb-1">待审核兑换</p>
          <p className={`text-2xl font-bold ${data.pending_redemptions > 0 ? 'text-yellow-600' : 'text-gray-300'}`}>{data.pending_redemptions || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-sm text-gray-500 mb-1">已完成兑换</p>
          <p className="text-2xl font-bold text-green-600">{data.completed_redemptions || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-sm text-gray-500 mb-1">低库存商品</p>
          <p className={`text-2xl font-bold ${data.low_stock_products > 0 ? 'text-red-600' : 'text-gray-300'}`}>{data.low_stock_products || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-sm text-gray-500 mb-1">活跃学员</p>
          <p className="text-2xl font-bold text-indigo-600">{data.active_students || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Phase Overview */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Layers className="w-4 h-4" /> 阶段概览
            </h2>
            <button onClick={() => navigate('/admin/phases')} className="text-sm text-indigo-600 hover:text-indigo-700">
              管理阶段 &rarr;
            </button>
          </div>
          {data.phase_overview && data.phase_overview.length > 0 ? (
            <div className="space-y-3">
              {(Array.isArray(data.phase_overview) ? data.phase_overview : []).map((p) => (
                <div key={p.id || p.name} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${p.status === '进行中' ? 'bg-green-500' : p.status === '已关闭' ? 'bg-gray-400' : p.status === '已归档' ? 'bg-gray-300' : 'bg-yellow-400'}`} />
                    <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    <span className="text-sm font-medium text-gray-900">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{p.participant_count || 0} 人</span>
                    <span>{p.total_points || 0} 积分</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      p.status === '进行中' ? 'bg-green-50 text-green-600' :
                      p.status === '已关闭' ? 'bg-gray-100 text-gray-500' :
                      p.status === '已归档' ? 'bg-gray-100 text-gray-400' :
                      'bg-yellow-50 text-yellow-600'
                    }`}>
                      {p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-6 text-center">暂无阶段数据</p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Award className="w-4 h-4" /> 快速操作
          </h2>
          <div className="space-y-2">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${action.color}`}
              >
                <action.icon className="w-4 h-4" />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top Rankings Preview */}
      {data.top_rankings && data.top_rankings.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> 积分排名预览
            </h2>
            <button onClick={() => navigate('/admin/phases')} className="text-sm text-indigo-600 hover:text-indigo-700">
              查看排名 &rarr;
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">排名</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">学员</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">部门</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">积分</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.top_rankings.slice(0, 10).map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        i === 0 ? 'bg-yellow-100 text-yellow-700' :
                        i === 1 ? 'bg-gray-200 text-gray-700' :
                        i === 2 ? 'bg-orange-100 text-orange-700' :
                        'text-gray-500'
                      }`}>{i + 1}</span>
                    </td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{r.real_name || r.student_name}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{r.department || '-'}</td>
                    <td className="px-4 py-2 text-sm font-semibold text-indigo-600 text-right">{r.points || r.total_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

function CalendarIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
