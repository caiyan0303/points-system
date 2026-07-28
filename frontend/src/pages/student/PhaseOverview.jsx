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
    setPhaseDetails(prev => ({ ...prev, [phaseId]: { ...(prev[phaseId] || {}), loading: true, load_error: '' } }))
    try {
      const { data } = await api.get(`/api/student/phases/${phaseId}`, { params: { refresh: Date.now() } })
      setPhaseDetails(prev => ({ ...prev, [phaseId]: { ...data, loading: false } }))
    } catch (e) {
      setPhaseDetails(prev => ({
        ...prev,
        [phaseId]: {
          rankings: [],
          group_rankings: [],
          category_details: [],
          loading: false,
          load_error: e.response?.data?.detail || '阶段排名加载失败，请稍后重试',
        },
      }))
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
                      <p className="text-xs text-indigo-500 mt-1">{p.year_name || '-'} / {p.project_name || '-'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{p.start_date?.slice(0,10)} ~ {p.end_date?.slice(0,10)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                    <button type="button" onClick={(event) => { event.stopPropagation(); togglePhase(p.phase_id) }} className="text-right rounded-lg px-3 py-2 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-label={`查看${p.phase_name}积分排名`}>
                      <p className="text-lg font-bold text-indigo-600">{p.points || 0}</p>
                      <p className="text-xs text-indigo-500">积分 · 点击查看排名</p>
                    </button>
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
                  {phaseDetails[p.phase_id].loading && (
                    <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-600">
                      正在同步最新个人积分和团队积分…
                    </div>
                  )}
                  {phaseDetails[p.phase_id].load_error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                      {phaseDetails[p.phase_id].load_error}
                    </div>
                  )}
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
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><Award className="w-4 h-4 text-indigo-500" />个人积分排名</h4>
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b bg-gray-50"><th className="px-3 py-2 text-left text-xs text-gray-500">排名</th><th className="px-3 py-2 text-left text-xs text-gray-500">姓名</th><th className="px-3 py-2 text-left text-xs text-gray-500">所属小组</th><th className="px-3 py-2 text-right text-xs text-gray-500">积分</th></tr></thead>
                          <tbody>
                            {(phaseDetails[p.phase_id].rankings || []).map((r) => (
                              <tr key={r.student_id} className={`border-b border-gray-50 last:border-0 ${r.is_me ? 'bg-indigo-50' : ''}`}>
                                <td className="px-3 py-2 font-medium">第 {r.rank} 名</td>
                                <td className="px-3 py-2">{r.student_name}{r.is_me ? <span className="ml-2 text-xs text-indigo-600">我</span> : null}</td>
                                <td className="px-3 py-2 text-gray-500">{r.group_name || '未分组'}</td>
                                <td className="px-3 py-2 text-right font-semibold text-indigo-600">{r.total_points}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!phaseDetails[p.phase_id].rankings?.length && <p className="py-8 text-center text-sm text-gray-400">暂无个人排名</p>}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-orange-500" />小组积分排名</h4>
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b bg-gray-50"><th className="px-3 py-2 text-left text-xs text-gray-500">排名</th><th className="px-3 py-2 text-left text-xs text-gray-500">小组</th><th className="px-3 py-2 text-right text-xs text-gray-500">成员个人积分</th><th className="px-3 py-2 text-right text-xs text-gray-500">团队积分</th><th className="px-3 py-2 text-right text-xs text-gray-500">最终得分</th></tr></thead>
                          <tbody>
                            {(phaseDetails[p.phase_id].group_rankings || []).map((r) => (
                              <tr key={r.group_id} className={`border-b border-gray-50 last:border-0 ${r.is_my_group ? 'bg-orange-50' : ''}`}>
                                <td className="px-3 py-2 font-medium">第 {r.rank} 名</td>
                                <td className="px-3 py-2">{r.group_name}{r.is_my_group ? <span className="ml-2 text-xs text-orange-600">我的小组</span> : null}<p className="text-xs text-gray-400">{r.member_count} 人</p></td>
                                <td className="px-3 py-2 text-right text-indigo-600">{r.personal_points || 0}</td>
                                <td className="px-3 py-2 text-right text-orange-600">{r.team_points || 0}</td>
                                <td className="px-3 py-2 text-right font-semibold text-green-600">{r.final_score || r.total_points || 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!phaseDetails[p.phase_id].group_rankings?.length && <p className="py-8 text-center text-sm text-gray-400">暂无小组排名</p>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {expandedPhase === p.phase_id && !phaseDetails[p.phase_id] && (
                <div className="border-t border-gray-100 p-6 text-center text-sm text-gray-400">正在加载阶段排名…</div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  )
}
