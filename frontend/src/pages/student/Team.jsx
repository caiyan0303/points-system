import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { Users, TrendingUp, Award, Layers } from 'lucide-react'

export default function StudentTeam() {
  const [teamData, setTeamData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('members')

  useEffect(() => {
    api.get('/api/student/team')
      .then(({ data }) => { setTeamData(data); setLoading(false) })
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

  if (error || !teamData) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-gray-400">{error || '暂无数据'}</div>
      </AppLayout>
    )
  }

  const group = teamData.group || {}
  const members = teamData.members || []

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">我的团队</h1>
        <p className="text-gray-500 mt-1">查看小组信息与成员</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{group.name || '未分组'}</h2>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {group.member_count || 0} 人</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-indigo-600">{group.total_points || 0}</p>
              <p className="text-xs text-gray-400">总积分</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{group.avg_points || 0}</p>
              <p className="text-xs text-gray-400">平均积分</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">{group.rank ? `第${group.rank}名` : '-'}</p>
              <p className="text-xs text-gray-400">排名</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button onClick={() => setActiveTab('members')} className={`px-6 py-3 text-sm font-medium ${activeTab === 'members' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>成员列表</button>
        </div>

        {activeTab === 'members' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">排名</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">姓名</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">部门</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">本期积分</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {members.map((m) => (
                  <tr key={m.student_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                        m.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                        m.rank === 2 ? 'bg-gray-200 text-gray-700' :
                        m.rank === 3 ? 'bg-orange-100 text-orange-700' : 'text-gray-500'
                      }`}>{m.rank || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.student_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{m.department || '-'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-indigo-600 text-right">{m.period_points || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {members.length === 0 && <p className="text-sm text-gray-400 py-12 text-center">暂无成员数据</p>}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
