import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { ChevronDown, ChevronRight, Layers, TrendingUp, Award, Users, Trophy, Star } from 'lucide-react'

export default function StudentPhaseOverview() {
  const [phases, setPhases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedPhase, setExpandedPhase] = useState(null)
  const [phaseDetails, setPhaseDetails] = useState({})

  useEffect(() => {
    api.get('/api/student/phase-overview')
      .then(({ data }) => { setPhases(data.phases || []); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }, [])

  const togglePhase = async (phaseId) => {
    if (expandedPhase === phaseId) { setExpandedPhase(null); return }
    setExpandedPhase(phaseId)
    if (!phaseDetails[phaseId]) {
      try {
        const { data } = await api.get(`/api/student/phases/${phaseId}`)
        setPhaseDetails(prev => ({ ...prev, [phaseId]: data }))
      } catch (e) {}
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      </AppLayout>
    )
  }

  const STATUS_COLORS = {
    '进行中': 'bg-green-50 text-green-600', '已关闭': 'bg-gray-100 text-gray-500',
    '已归档': 'bg-gray-100 text-gray-400', '未开始': 'bg-yellow-50 text-yellow-600'
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">阶段积分概览</h1>
        <p className="text-gray-500 mt-1">查看各阶段积分与排名</p>
      </div>

      {error ? (
        <div className="flex items-center justify-center h-48 text-red-400">{error}</div>
      ) : phases.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400">暂无阶段数据</div>
      ) : (
        <div className="space-y-4">
          {phases.map((p) => (
            <div key={p.phase_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div onClick={() => togglePhase(p.phase_id)} className="p-5 cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {expandedPhase === p.phase_id ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                    <div>
                      <h3 className="font-semibold text-gray-900">{p.phase_name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{p.start_date?.slice(0,10)} ~ {p.end_date?.slice(0,10)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                    <div className="text-right">
                      <p className="text-lg font-bold text-indigo-600">{p.points || 0}</p>
                      <p className="text-xs text-gray-400">积分</p>
                    </div>
                    {p.rank && (
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">第 {p.rank} 名</p>
                        <p className="text-xs text-gray-400">个人排名</p>
                      </div>
                    )}
                    {p.is_excellent ? <Star className="w-5 h-5 text-yellow-500 fill-current" /> : null}
                  </div>
                </div>
              </div>

              {expandedPhase === p.phase_id && phaseDetails[p.phase_id] && (
                <div className="border-t border-gray-100 p-5 bg-gray-50/50">
                  {phaseDetails[p.phase_id].category_details?.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">积分明细</h4>
                      <div className="grid grid-cols-3 gap-2">
                        {(Array.isArray(phaseDetails[p.phase_id]?.category_details) ? phaseDetails[p.phase_id].category_details : []).map((cd, i) => (
                          <div key={i} className="bg-white rounded-lg border border-gray-200 p-3 text-sm">
                            <span className="text-gray-500">{cd.category}</span>
                            <span className="ml-2 font-semibold text-indigo-600">{cd.points}分</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {phaseDetails[p.phase_id].rankings?.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">排行榜</h4>
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b bg-gray-50"><th className="px-3 py-2 text-left text-xs text-gray-500">排名</th><th className="px-3 py-2 text-left text-xs text-gray-500">姓名</th><th className="px-3 py-2 text-right text-xs text-gray-500">积分</th></tr></thead>
                          <tbody>
                            {phaseDetails[p.phase_id].rankings.slice(0, 10).map((r, i) => (
                              <tr key={i} className="border-b border-gray-50 last:border-0">
                                <td className="px-3 py-2 font-medium">{r.rank}</td>
                                <td className="px-3 py-2">{r.student_name}</td>
                                <td className="px-3 py-2 text-right font-semibold text-indigo-600">{r.total_points}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  )
}
