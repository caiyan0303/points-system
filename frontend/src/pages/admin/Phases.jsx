import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import {
  Plus, X, Calendar, Archive, ArrowLeft, Award, Trophy, Star, Edit
} from 'lucide-react'

const STATUS_LABELS = { '待开放': '待开放', '进行中': '进行中', '已关闭': '已关闭', '已归档': '已归档' }
const STATUS_COLORS = {
  "待开放": 'bg-yellow-50 text-yellow-600',
  "进行中": 'bg-green-50 text-green-600',
  "已关闭": 'bg-gray-100 text-gray-500',
  "已归档": 'bg-gray-100 text-gray-400'
}
const formatDate = (value) => value ? String(value).slice(0, 10) : '-'

export default function AdminPhases({ embedded = false, initialProjectId = '' }) {
  const [phases, setPhases] = useState([])
  const [years, setYears] = useState([])
  const [projects, setProjects] = useState([])
  const [yearId, setYearId] = useState('')
  const [projectId, setProjectId] = useState(initialProjectId ? String(initialProjectId) : '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [createModal, setCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', year_id: '', project_id: '', start_date: '', end_date: '', description: '', allow_ranking: true, allow_excellent: true, excellent_count: 3, prize_description: '' })
  const [viewPhase, setViewPhase] = useState(null)
  const [phaseDetail, setPhaseDetail] = useState(null)
  const [detailTab, setDetailTab] = useState('participants')
  const [editForm, setEditForm] = useState(null)
  const [excellentModal, setExcellentModal] = useState(false)
  const [selectedExcellent, setSelectedExcellent] = useState([])
  const [archiveConfirm, setArchiveConfirm] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchPhases = (projectOverride = null) => {
    setLoading(true)
    const params = {}
    if (yearId) params.year_id = yearId
    const selectedProjectId = projectOverride === null ? projectId : projectOverride
    if (!selectedProjectId) {
      setPhases([])
      setError(null)
      setLoading(false)
      return
    }
    if (selectedProjectId) params.project_id = selectedProjectId
    api.get('/api/admin/phases', { params })
      .then(({ data }) => { setPhases(data.items || data); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => {
    fetchPhases(initialProjectId ? String(initialProjectId) : '')
    api.get('/api/common/years').then(({ data }) => setYears(data.items || data))
    api.get('/api/common/projects').then(({ data }) => setProjects(data.items || data))
  }, [initialProjectId])

  useEffect(() => {
    setProjectId(initialProjectId ? String(initialProjectId) : '')
  }, [initialProjectId])

  const openCreateModal = () => {
    if (!projectId) {
      showToast('请先选择一个培训项目，再创建阶段', 'error')
      return
    }
    const selectedProject = projects.find(project => String(project.id) === String(projectId))
    setCreateForm(current => ({
      ...current,
      project_id: projectId || '',
      year_id: selectedProject?.year_id ? String(selectedProject.year_id) : current.year_id,
    }))
    setCreateModal(true)
  }

  const handleCreate = async () => {
    if (!createForm.project_id || !createForm.year_id) return showToast('请先选择培训项目', 'error')
    if (!createForm.name.trim()) return showToast('请输入阶段名称', 'error')
    try {
      await api.post('/api/admin/phases', createForm)
      showToast('阶段创建成功')
      setCreateModal(false)
      setCreateForm({ name: '', year_id: '', project_id: '', start_date: '', end_date: '', description: '', allow_ranking: true, allow_excellent: true, excellent_count: 3, prize_description: '' })
      fetchPhases()
    } catch (err) { showToast(err.response?.data?.detail || '创建失败', 'error') }
  }

  const openDetail = async (p) => {
    setViewPhase(p)
    try {
      const { data } = await api.get(`/api/admin/phases/${p.id}`)
      setPhaseDetail(data)
      setDetailTab('participants')
    } catch (err) { showToast('无法加载详情', 'error') }
  }

  const handleEditInfo = async () => {
    try {
      await api.put(`/api/admin/phases/${viewPhase.id}`, editForm)
      showToast('阶段信息已更新')
      setEditForm(null)
      openDetail(viewPhase)
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const handleArchive = async () => {
    try {
      await api.put(`/api/admin/phases/${archiveConfirm.id}/archive`)
      showToast('阶段��归档')
      setArchiveConfirm(null)
      fetchPhases()
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const handleDeletePhase = async (phase) => {
    if (!window.confirm(`确定删除阶段“${phase.name}”吗？相关积分记录会保留，但不再关联此阶段。`)) return
    try {
      await api.delete(`/api/admin/phases/${phase.id}`)
      showToast('阶段已删除')
      setViewPhase(null)
      setPhaseDetail(null)
      fetchPhases()
    } catch (err) { showToast(err.response?.data?.detail || '删除失败', 'error') }
  }

  const handleSelectExcellent = async () => {
    try {
      await api.post(`/api/admin/phases/${viewPhase.id}/excellent`, { student_ids: selectedExcellent })
      showToast('优秀成员已更新')
      setExcellentModal(false)
      openDetail(viewPhase)
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const content = (
    <>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />

      {viewPhase ? (
        <div>
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => { setViewPhase(null); setPhaseDetail(null) }} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{viewPhase.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[viewPhase.status] || 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABELS[viewPhase.status] || viewPhase.status}
                </span>
                <span className="text-sm text-gray-500">{formatDate(viewPhase.start_date)} ~ {formatDate(viewPhase.end_date)}</span>
                <button onClick={() => setEditForm({ name: viewPhase.name, start_date: viewPhase.start_date?.slice(0,10) || '', end_date: viewPhase.end_date?.slice(0,10) || '', description: viewPhase.description || '', allow_ranking: viewPhase.allow_ranking, allow_excellent: viewPhase.allow_excellent, excellent_count: viewPhase.excellent_count, prize_description: viewPhase.prize_description || '' })} className="p-1.5 hover:bg-gray-100 rounded-lg">
                  <Edit className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {viewPhase.status === '待开放' && (
                <button onClick={() => handleDeletePhase(viewPhase)} className="px-4 py-2 text-sm font-medium border border-red-300 text-red-500 rounded-lg hover:bg-red-50">
                  <Trash2Icon className="w-4 h-4 inline mr-1" /> 删除阶段
                </button>
              )}
              {viewPhase.status === '已关闭' && (
                <>
                  <button onClick={() => setArchiveConfirm(viewPhase)} className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
                    <Archive className="w-4 h-4 inline mr-1" /> 归档阶段
                  </button>
                  <button onClick={() => handleDeletePhase(viewPhase)} className="px-4 py-2 text-sm font-medium border border-red-300 text-red-500 rounded-lg hover:bg-red-50">
                    <Trash2Icon className="w-4 h-4 inline mr-1" /> 删除
                  </button>
                </>
              )}
            </div>
          </div>

          {phaseDetail ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-sm text-gray-500">参与人数</p>
                  <p className="text-2xl font-bold text-gray-900">{phaseDetail.participant_count || 0}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-sm text-gray-500">小组数</p>
                  <p className="text-2xl font-bold text-indigo-600">{phaseDetail.group_count || 0}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-sm text-gray-500">已发放积分</p>
                  <p className="text-2xl font-bold text-green-600">{phaseDetail.total_points || 0}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-sm text-gray-500">优秀成员</p>
                  <p className="text-2xl font-bold text-orange-600">{phaseDetail.excellent_count || 0}</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex border-b border-gray-200">
                  {[
                    { key: 'participants', label: '参与成员' },
                    { key: 'ranking', label: '积分排名' },
                    { key: 'group_ranking', label: '小组排名' },
                    { key: 'excellent', label: '优秀成员' },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setDetailTab(tab.key)}
                      className={`px-6 py-3 text-sm font-medium transition-colors ${
                        detailTab === tab.key ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >{tab.label}</button>
                  ))}
                </div>

                {detailTab === 'participants' && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">姓名</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">小组</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">阶段积分</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">排名</th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">优秀</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {phaseDetail.participants?.map((p, i) => (
                          <tr key={p.student_id || i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.student_name || p.real_name}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{p.group_name || '-'}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-indigo-600 text-right">{p.total_points || 0}</td>
                            <td className="px-4 py-3 text-sm text-gray-500 text-right">{p.phase_rank ? `第 ${p.rank} 名` : '-'}</td>
                            <td className="px-4 py-3 text-center">
                              {p.is_excellent && <Star className="w-4 h-4 text-yellow-500 inline" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(!phaseDetail.participants || phaseDetail.participants.length === 0) && (
                      <p className="text-sm text-gray-400 py-12 text-center">暂无参与成员</p>
                    )}
                  </div>
                )}

                {detailTab === 'ranking' && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">排名</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">学员</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">小组</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">积分</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {phaseDetail.rankings?.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                                i === 0 ? 'bg-yellow-100 text-yellow-700' :
                                i === 1 ? 'bg-gray-200 text-gray-700' :
                                i === 2 ? 'bg-orange-100 text-orange-700' :
                                'text-gray-500'
                              }`}>{i + 1}</span>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.student_name || r.real_name}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{r.group_name || '-'}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-indigo-600 text-right">{r.total_points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {detailTab === 'group_ranking' && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">排名</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">小组</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">成员数</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">成员个人积分</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">小组积分</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">最终得分</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {phaseDetail.group_rankings?.map((g, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                                i === 0 ? 'bg-yellow-100 text-yellow-700' :
                                i === 1 ? 'bg-gray-200 text-gray-700' :
                                i === 2 ? 'bg-orange-100 text-orange-700' :
                                'text-gray-500'
                              }`}>{i + 1}</span>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{g.group_name}</td>
                            <td className="px-4 py-3 text-sm text-gray-500 text-right">{g.member_count}</td>
                            <td className="px-4 py-3 text-sm text-indigo-600 text-right">{g.personal_points || 0}</td>
                            <td className="px-4 py-3 text-sm text-orange-600 text-right">{g.team_points || 0}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-green-600 text-right">{g.final_score || g.total_points || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {detailTab === 'excellent' && (
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-gray-500">已选 {phaseDetail.excellent_members?.length || 0} 名优秀成员</p>
                      <button onClick={() => {
                        setSelectedExcellent(phaseDetail.excellent_members?.map(m => m.student_id) || [])
                        setExcellentModal(true)
                      }} className="px-4 py-2 text-sm bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100">
                        <Award className="w-4 h-4 inline mr-1" /> 选择优秀成员
                      </button>
                    </div>
                    {phaseDetail.excellent_members && phaseDetail.excellent_members.length > 0 ? (
                      <div className="space-y-2">
                        {(Array.isArray(phaseDetail.excellent_members) ? phaseDetail.excellent_members : []).map((m, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Trophy className="w-4 h-4 text-yellow-500" />
                              <span className="text-sm font-medium text-gray-900">{m.real_name}</span>
                            </div>
                            <span className="text-sm text-gray-500">{m.group_name || '-'} | {m.phase_points || 0} 积分</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 py-8 text-center">暂未选择优秀成员</p>
                    )}
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
              <h1 className="text-2xl font-bold text-gray-900">阶段管理</h1>
              <p className="text-gray-500 mt-1">管理培训阶段</p>
            </div>
            <button onClick={openCreateModal} disabled={!projectId} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300">
              <Plus className="w-4 h-4" /> {projectId ? '创建阶段' : '请先选择项目'}
            </button>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center gap-3">
              <select value={yearId} onChange={(e) => setYearId(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">所有年度</option>
                {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
              <select value={projectId} onChange={(e) => {
                const nextProjectId = e.target.value
                const selectedProject = projects.find(project => String(project.id) === String(nextProjectId))
                setProjectId(nextProjectId)
                setYearId(selectedProject?.year_id ? String(selectedProject.year_id) : '')
              }} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">请选择培训项目</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.year_name ? `${p.year_name} / ` : ''}{p.name}</option>)}
              </select>
              <button onClick={() => fetchPhases()} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">筛选</button>
            </div>
            {!projectId && <p className="mt-3 text-xs text-amber-600">阶段必须归属于培训项目。请先选择项目；如果还没有项目，请返回项目列表新建项目。</p>}
          </div>

          {/* Phase List */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-48 text-red-400">{error}</div>
            ) : phases.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400">{projectId ? '该项目暂无阶段数据' : '请选择项目查看阶段'}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px]">
                  <thead className="bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">阶段名称</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">年度 / 培训项目</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">阶段时间</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">成员</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">小组</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">积分</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">状态</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {phases.map((p) => (
                      <tr key={p.id} onClick={() => openDetail(p)} className="cursor-pointer hover:bg-indigo-50/40">
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{p.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500"><div>{p.year_name || '-'}</div><div className="mt-0.5 text-xs text-gray-400">{p.project_name || '-'}</div></td>
                        <td className="px-4 py-3 text-sm text-gray-500"><span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{formatDate(p.start_date)} 至 {formatDate(p.end_date)}</span></td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700">{p.participant_count ?? p.total_students ?? 0} 人</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700">{p.group_count || 0} 组</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-indigo-600">{p.total_points || 0}</td>
                        <td className="px-4 py-3 text-center"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-500'}`}>{STATUS_LABELS[p.status] || p.status}</span></td>
                        <td className="px-4 py-3 text-center"><button onClick={(event) => { event.stopPropagation(); openDetail(p) }} className="rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50">查看详情</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Create Phase Modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">创建阶段</h3>
              <button onClick={() => setCreateModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div><label className="block text-sm text-gray-600 mb-1">阶段名称 *</label>
                <input type="text" value={createForm.name} onChange={(e) => setCreateForm({...createForm, name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm text-gray-600 mb-1">年度 *</label>
                  <select value={createForm.year_id} disabled className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-500">
                    <option value="">选择年度</option>
                    {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm text-gray-600 mb-1">培训项目 *</label>
                  <select value={createForm.project_id} disabled className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-500">
                    <option value="">选择项目</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-indigo-600">该阶段会自动关联此项目下的全部学员和小组。</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm text-gray-600 mb-1">开始日期</label>
                  <input type="date" value={createForm.start_date} onChange={(e) => setCreateForm({...createForm, start_date: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div><label className="block text-sm text-gray-600 mb-1">结束日期</label>
                  <input type="date" value={createForm.end_date} onChange={(e) => setCreateForm({...createForm, end_date: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div><label className="block text-sm text-gray-600 mb-1">描述</label>
                <textarea value={createForm.description} onChange={(e) => setCreateForm({...createForm, description: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={createForm.allow_ranking} onChange={(e) => setCreateForm({...createForm, allow_ranking: e.target.checked})} className="rounded" />
                  允许排名
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={createForm.allow_excellent} onChange={(e) => setCreateForm({...createForm, allow_excellent: e.target.checked})} className="rounded" />
                  允许评选优秀成员
                </label>
                {createForm.allow_excellent && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div><label className="block text-xs text-gray-500 mb-1">优秀成员数量</label>
                      <input type="number" value={createForm.excellent_count} onChange={(e) => setCreateForm({...createForm, excellent_count: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div><label className="block text-xs text-gray-500 mb-1">奖励描述</label>
                      <input type="text" value={createForm.prize_description} onChange={(e) => setCreateForm({...createForm, prize_description: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setCreateModal(false)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCreate} className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Phase Modal */}
      {editForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">编辑阶段信息</h3>
              <button onClick={() => setEditForm(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div><label className="block text-sm text-gray-600 mb-1">阶段名称</label>
                <input type="text" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm text-gray-600 mb-1">开始日期</label>
                  <input type="date" value={editForm.start_date} onChange={(e) => setEditForm({...editForm, start_date: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div><label className="block text-sm text-gray-600 mb-1">结束日期</label>
                  <input type="date" value={editForm.end_date} onChange={(e) => setEditForm({...editForm, end_date: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                阶段状态会根据开始日期、结束日期和当前日期自动计算，无需手动选择。
              </div>
              <div><label className="block text-sm text-gray-600 mb-1">描述</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editForm.allow_ranking} onChange={(e) => setEditForm({...editForm, allow_ranking: e.target.checked})} className="rounded" />
                允许排名
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditForm(null)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleEditInfo} className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Excellent Selection Modal */}
      {excellentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">选择优秀成员</h3>
              <button onClick={() => setExcellentModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">最多可选 {phaseDetail?.excellent_count || 3} 人</p>
            <div className="space-y-2">
              {phaseDetail?.participants?.map((p) => (
                <label key={p.student_id} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedExcellent.includes(p.student_id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        if (selectedExcellent.length < (phaseDetail?.excellent_count || 3)) {
                          setSelectedExcellent([...selectedExcellent, p.student_id])
                        }
                      } else {
                        setSelectedExcellent(selectedExcellent.filter(id => id !== p.student_id))
                      }
                    }}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">{p.student_name || p.real_name}</span>
                    <span className="text-xs text-gray-500 ml-2">{p.group_name || ''}</span>
                  </div>
                  <span className="text-sm font-semibold text-indigo-600">{p.total_points || 0} 分</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setExcellentModal(false)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleSelectExcellent} className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                确认选择 ({selectedExcellent.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation */}
      {archiveConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold mb-2">归档阶段</h3>
            <p className="text-sm text-gray-500">确定要归档「{archiveConfirm.name}���吗？归档后将变为只读。</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setArchiveConfirm(null)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleArchive} className="flex-1 py-2.5 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700">确认归档</button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  return embedded ? content : <AppLayout>{content}</AppLayout>
}

function Trash2Icon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}
