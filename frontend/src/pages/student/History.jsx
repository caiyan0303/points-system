import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { Award, TrendingUp, Layers, Star, ChevronDown, ChevronRight } from 'lucide-react'

export default function StudentHistory() {
  const [historyData, setHistoryData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedYear, setExpandedYear] = useState(null)

  useEffect(() => {
    api.get('/api/student/history')
      .then(({ data }) => { setHistoryData(data); setLoading(false) })
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

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-red-400">{error}</div>
      </AppLayout>
    )
  }

  const historyItems = historyData?.history || []

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">历史项目</h1>
        <p className="text-gray-500 mt-1">查看以往年度和培训项目记录</p>
      </div>

      {historyItems.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400">暂无历史数据</div>
      ) : (
        <div className="space-y-4">
          {historyItems.map((item) => (
            <div key={item.year_id || item.year_name} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div
                onClick={() => setExpandedYear(expandedYear === item.year_id ? null : item.year_id)}
                className="p-5 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  {expandedYear === item.year_id ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                  <div>
                    <h3 className="font-semibold text-gray-900">{item.year_name}</h3>
                    {item.project_name && <p className="text-sm text-gray-500">{item.project_name}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  {item.period_points !== undefined && <span className="text-indigo-600 font-semibold">{item.period_points} 分</span>}
                  {item.rank && <span className="text-gray-500">排名: 第{item.rank}名</span>}
                  {item.is_excellent && <Star className="w-4 h-4 text-yellow-500 fill-current" />}
                </div>
              </div>

              {expandedYear === item.year_id && item.phases && (
                <div className="border-t border-gray-100 p-5 bg-gray-50/50">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">各阶段表现</h4>
                  <div className="space-y-2">
                    {(item.phases || []).map((ph, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 text-sm">
                        <span className="font-medium text-gray-700">{ph.phase_name || ph.name}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-indigo-600 font-semibold">{ph.points || 0} 分</span>
                          {ph.rank && <span className="text-gray-500">���名: 第{ph.rank}名</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  )
}
