import { useEffect, useState } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { Award, Users } from 'lucide-react'

export default function StudentTeam() {
  const [teamData, setTeamData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    api.get('/api/student/team')
      .then(({ data }) => setTeamData(data))
      .catch((err) => setError(err.response?.data?.detail || '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <AppLayout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div></AppLayout>
  if (error || !teamData) return <AppLayout><div className="flex items-center justify-center h-64 text-gray-400">{error || '暂无数据'}</div></AppLayout>

  const group = teamData.group || {}
  const groups = teamData.all_groups || []
  const members = teamData.members || []
  const records = teamData.team_point_records || []

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">小组积分</h1>
        <p className="text-gray-500 mt-1">查看所有小组排名和自己小组的积分组成</p>
      </div>

      <div className="inline-flex rounded-xl bg-gray-100 p-1 mb-6">
        <button onClick={() => setActiveTab('all')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'all' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`}>所有小组积分</button>
        <button onClick={() => setActiveTab('mine')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'mine' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`}>自己小组积分</button>
      </div>

      {activeTab === 'all' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900 flex items-center gap-2"><Award className="w-4 h-4 text-amber-500" /> 所有小组积分排名</h2></div>
          {groups.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500"><tr><th className="px-4 py-3 text-left">排名</th><th className="px-4 py-3 text-left">小组</th><th className="px-4 py-3 text-right">成员人数</th><th className="px-4 py-3 text-right">成员个人积分合计</th><th className="px-4 py-3 text-right">团队任务积分</th><th className="px-4 py-3 text-right">团队最终得分</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{groups.map((item) => <tr key={item.id} className={item.is_my_group ? 'bg-indigo-50/60' : 'hover:bg-gray-50'}>
              <td className="px-4 py-3"><span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${Number(item.rank) === 1 ? 'bg-amber-100 text-amber-700' : Number(item.rank) === 2 ? 'bg-gray-200 text-gray-700' : Number(item.rank) === 3 ? 'bg-orange-100 text-orange-700' : 'text-gray-500'}`}>{item.rank}</span></td>
              <td className="px-4 py-3 font-medium text-gray-900">{item.name}{item.is_my_group && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">我的小组</span>}</td>
              <td className="px-4 py-3 text-right text-gray-500">{item.member_count || 0}</td><td className="px-4 py-3 text-right text-indigo-600">{item.personal_points || 0}</td><td className="px-4 py-3 text-right text-orange-600">{item.team_points || 0}</td><td className="px-4 py-3 text-right font-bold text-green-600">{item.final_score || 0}</td>
            </tr>)}</tbody>
          </table></div> : <p className="py-12 text-center text-sm text-gray-400">暂无小组积分数据</p>}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div><p className="text-sm text-gray-500">我的小组</p><h2 className="text-2xl font-bold text-gray-900 mt-1">{group.name || '暂未分组'}</h2><p className="text-sm text-gray-500 mt-1 flex items-center gap-1"><Users className="w-4 h-4" /> {group.member_count || 0} 人</p></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                <div><p className="text-2xl font-bold text-indigo-600">{group.personal_points || 0}</p><p className="text-xs text-gray-500 mt-1">成员个人积分合计</p></div>
                <div><p className="text-2xl font-bold text-orange-600">{group.team_points || 0}</p><p className="text-xs text-gray-500 mt-1">团队任务积分</p></div>
                <div><p className="text-2xl font-bold text-green-600">{group.final_score || 0}</p><p className="text-xs text-gray-500 mt-1">团队最终得分</p></div>
                <div><p className="text-2xl font-bold text-amber-600">{group.rank ? `第 ${group.rank} 名` : '-'}</p><p className="text-xs text-gray-500 mt-1">小组排名</p></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-semibold text-gray-900">成员列表</h3></div>
            {members.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-4 py-3 text-left">组内排名</th><th className="px-4 py-3 text-left">姓名</th><th className="px-4 py-3 text-left">一级部门</th><th className="px-4 py-3 text-right">个人积分</th></tr></thead><tbody className="divide-y divide-gray-100">{members.map((member) => <tr key={member.student_id} className="hover:bg-gray-50"><td className="px-4 py-3">第 {member.rank || '-'} 名</td><td className="px-4 py-3 font-medium text-gray-900">{member.student_name}</td><td className="px-4 py-3 text-gray-500">{member.department || '-'}</td><td className="px-4 py-3 text-right font-semibold text-indigo-600">{member.period_points || 0}</td></tr>)}</tbody></table></div> : <p className="py-10 text-center text-sm text-gray-400">暂无成员数据</p>}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-semibold text-gray-900">团队积分明细</h3></div>
            {records.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-4 py-3 text-left">阶段</th><th className="px-4 py-3 text-left">积分类别</th><th className="px-4 py-3 text-left">积分事项</th><th className="px-4 py-3 text-right">团队积分</th><th className="px-4 py-3 text-left">获得时间</th></tr></thead><tbody className="divide-y divide-gray-100">{records.map((record) => <tr key={record.id} className="hover:bg-gray-50"><td className="px-4 py-3 text-gray-500">{record.phase_name || '项目级'}</td><td className="px-4 py-3">{record.category || '-'}</td><td className="px-4 py-3">{record.item_name || '-'}</td><td className="px-4 py-3 text-right font-semibold text-orange-600">{Number(record.points) > 0 ? '+' : ''}{record.points}</td><td className="px-4 py-3 text-gray-500">{record.obtained_date?.slice(0, 10) || '-'}</td></tr>)}</tbody></table></div> : <p className="py-10 text-center text-sm text-gray-400">暂无团队积分记录</p>}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
