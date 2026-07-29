import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import InformationPageTabs from '../../components/InformationPageTabs'
import { useAdminScope } from '../../contexts/AdminScopeContext'
import { Plus, X, UserPlus, Trash2, ChevronRight, ArrowLeft } from 'lucide-react'

export default function AdminGroups() {
  const { yearId, projectId, selectedYear, selectedProject } = useAdminScope()
  const [groups, setGroups] = useState([])
  const [years, setYears] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [createModal, setCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', year_id: '', project_id: '' })
  const [viewGroup, setViewGroup] = useState(null)
  const [groupDetail, setGroupDetail] = useState(null)
  const [addMemberModal, setAddMemberModal] = useState(false)
  const [availableStudents, setAvailableStudents] = useState([])
  const [selectedStudent, setSelectedStudent] = useState('')
  const [detailTab, setDetailTab] = useState('members')
  const [deleteGroup, setDeleteGroup] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchGroups = () => {
    setLoading(true)
    const params = {}
    if (yearId) params.year_id = yearId
    if (projectId) params.project_id = projectId
    api.get('/api/admin/groups', { params })
      .then(({ data }) => { setGroups(data.items || data); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => {
    api.get('/api/common/years').then(({ data }) => setYears(data.items || data))
    api.get('/api/common/projects').then(({ data }) => setProjects(data.items || data))
  }, [])
  useEffect(() => { fetchGroups() }, [yearId, projectId])

  const handleCreate = async () => {
    try {
      await api.post('/api/admin/groups', createForm)
      showToast('小组创建成功')
      setCreateModal(false)
      setCreateForm({ name: '', year_id: '', project_id: '' })
      fetchGroups()
    } catch (err) { showToast(err.response?.data?.detail || '创建失���', 'error') }
  }

  const openDetail = async (g) => {
    setViewGroup(g)
    try {
      const { data } = await api.get(`/api/admin/groups/${g.id}`)
      setGroupDetail(data)
      setDetailTab('members')
    } catch (err) { showToast('无法加载详情', 'error') }
  }

  const openAddMember = async () => {
    try {
      const { data } = await api.get('/api/admin/students', { params: { project_id: viewGroup.project_id, page_size: 100 } })
      setAvailableStudents(data.items || data)
      setAddMemberModal(true)
    } catch (err) { showToast('无法加载学员列表', 'error') }
  }

  const handleAddMember = async () => {
    if (!selectedStudent) return
    try {
      await api.post(`/api/admin/groups/${viewGroup.id}/members`, [parseInt(selectedStudent)])
      showToast('成员已添加')
      setAddMemberModal(false)
      setSelectedStudent('')
      openDetail(viewGroup)
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const handleRemoveMember = async (studentId, name) => {
    if (!window.confirm(`确定要从小组移除 "${name}" 吗？`)) return
    try {
      await api.delete(`/api/admin/groups/${viewGroup.id}/members/${studentId}`)
      showToast('成员已移除')
      openDetail(viewGroup)
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const handleDeleteGroup = async () => {
    if (!deleteGroup) return
    try {
      const { data } = await api.delete(`/api/admin/groups/${deleteGroup.id}`)
      showToast(data.message || '小组已删除')
      if (viewGroup?.id === deleteGroup.id) {
        setViewGroup(null)
        setGroupDetail(null)
      }
      setDeleteGroup(null)
      fetchGroups()
    } catch (err) {
      showToast(err.response?.data?.detail || '删除失败', 'error')
      setDeleteGroup(null)
    }
  }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />

      {viewGroup ? (
        <div>
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => { setViewGroup(null); setGroupDetail(null) }} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{viewGroup.name}</h1>
              <p className="text-gray-500 mt-1">小组详情</p>
            </div>
            <button onClick={() => setDeleteGroup(viewGroup)} className="ml-auto flex items-center gap-1 px-3 py-2 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
              <Trash2 className="w-4 h-4" /> 删除小组
            </button>
          </div>

          {groupDetail ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-sm text-gray-500">成员人数</p>
                  <p className="text-2xl font-bold text-gray-900">{groupDetail.member_count || 0}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-sm text-gray-500">小组最终得分</p>
                  <p className="text-2xl font-bold text-indigo-600">{groupDetail.total_points || 0}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-sm text-gray-500">人均最终得分</p>
                  <p className="text-2xl font-bold text-green-600">{groupDetail.avg_points || 0}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-sm text-gray-500">排名</p>
                  <p className="text-2xl font-bold text-orange-600">{groupDetail.rank ? `第 ${groupDetail.rank} 名` : '-'}</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex border-b border-gray-200">
                  {['members', 'phases', 'awards'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setDetailTab(tab)}
                      className={`px-6 py-3 text-sm font-medium transition-colors ${
                        detailTab === tab ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {tab === 'members' ? '成员列表' : tab === 'phases' ? '阶段历史' : '获奖记录'}
                    </button>
                  ))}
                </div>

                {detailTab === 'members' && (
                  <div>
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                      <span className="text-sm text-gray-500">共 {groupDetail.members?.length || 0} 名成员</span>
                      <button onClick={openAddMember} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100">
                        <UserPlus className="w-3 h-3" /> 添加成员
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50">
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">姓名</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">本期积分</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">当前阶段积分</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">阶段排名</th>
                            <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {groupDetail.members?.map((m) => (
                            <tr key={m.id || m.student_id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.student_name || m.real_name}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{m.period_points || 0}</td>
                              <td className="px-4 py-3 text-sm text-indigo-600 font-medium">{m.phase_points?.[0]?.points || 0}</td>
                              <td className="px-4 py-3 text-sm text-gray-500">{m.rank ? `第 ${m.rank} 名` : '-'}</td>
                              <td className="px-4 py-3 text-center">
                                <button onClick={() => handleRemoveMember(m.student_id, m.student_name)} className="px-2 py-1 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {(!groupDetail.members || groupDetail.members.length === 0) && (
                            <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">暂无成员</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {detailTab === 'phases' && (
                  <div className="p-4">
                    {groupDetail.phases && groupDetail.phases.length > 0 ? (
                      <div className="space-y-3">
                        {(Array.isArray(groupDetail.phases) ? groupDetail.phases : []).map((p, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                            <span className="font-medium text-gray-700">{p.name}</span>
                            <div className="flex items-center gap-4 text-gray-500">
                              <span>总分: {p.total_points}</span>
                              <span>平均: {p.avg_points}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-sm text-gray-400 py-8 text-center">暂无阶段数据</p>}
                  </div>
                )}

                {detailTab === 'awards' && (
                  <div className="p-4">
                    {groupDetail.awards && groupDetail.awards.length > 0 ? (
                      <div className="space-y-3">
                        {(Array.isArray(groupDetail.awards) ? groupDetail.awards : []).map((a, i) => (
                          <div key={i} className="p-3 bg-yellow-50 rounded-lg text-sm text-gray-700">
                            {a.description || a.product_name || '-'}
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-sm text-gray-400 py-8 text-center">暂无获奖记录</p>}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">小组管理</h1>
              <p className="text-gray-500 mt-1">管理学员分组</p>
            </div>
            <button onClick={() => { setCreateForm({ name: '', year_id: yearId || '', project_id: projectId || '' }); setCreateModal(true) }} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              <Plus className="w-4 h-4" /> 创建小组
            </button>
          </div>
          <InformationPageTabs />

          <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-700">
            当前范围：{selectedYear?.name || '未选择年度'} · {selectedProject?.name || '请在顶部选择项目'}
          </div>

          {/* Groups List */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-48 text-red-400">{error}</div>
            ) : groups.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400">暂无小组数据</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px]">
                  <thead className="bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">小组名称</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">年度 / 培训项目</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">成员</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">成员个人积分</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">小组积分</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">小组最终得分</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">排名</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {groups.map((g) => (
                      <tr key={g.id} onClick={() => openDetail(g)} className="cursor-pointer hover:bg-indigo-50/40">
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{g.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          <div>{g.year_name || '-'}</div>
                          <div className="mt-0.5 text-xs text-gray-400">{g.project_name || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700">{g.member_count || 0} 人</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-indigo-600">{g.personal_points || 0}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-orange-600">{g.team_points || 0}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">{g.final_score || g.total_points || 0}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-700">{g.rank ? `第 ${g.rank} 名` : '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={(event) => { event.stopPropagation(); openDetail(g) }} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50">
                              查看 <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={(event) => { event.stopPropagation(); setDeleteGroup(g) }} aria-label={`删除${g.name}`} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Create Group Modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">创建小组</h3>
              <button onClick={() => setCreateModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div><label className="block text-sm text-gray-600 mb-1">小组名称 *</label>
                <input type="text" value={createForm.name} onChange={(e) => setCreateForm({...createForm, name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div><label className="block text-sm text-gray-600 mb-1">所属年度</label>
                <select value={createForm.year_id} onChange={(e) => setCreateForm({...createForm, year_id: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">选择年度</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm text-gray-600 mb-1">培训项目</label>
                <select value={createForm.project_id} onChange={(e) => setCreateForm({...createForm, project_id: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">选择项目</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setCreateModal(false)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCreate} className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {addMemberModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">添加成员到 {viewGroup.name}</h3>
              <button onClick={() => setAddMemberModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">选择学员</label>
              <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">选择学员</option>
                {availableStudents.map(s => <option key={s.id} value={s.id}>{s.real_name} ({s.department || '-'})</option>)}
              </select>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setAddMemberModal(false)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleAddMember} disabled={!selectedStudent} className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">添加</button>
            </div>
          </div>
        </div>
      )}

      {deleteGroup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900">确认删除小组</h3>
            <p className="mt-3 text-sm text-gray-600">确定删除“{deleteGroup.name}”吗？</p>
            <p className="mt-2 text-sm text-gray-500">小组内的学员、历史积分和奖品记录都会保留，相关学员将变为未分组。</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setDeleteGroup(null)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleDeleteGroup} className="flex-1 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
