import { useEffect, useState } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import AdminPhases from './Phases'
import {
  Plus, X, Edit, Archive, Trash2, Layers, RefreshCw,
  FolderKanban, ChevronRight, Users, TrendingUp, Calendar,
} from 'lucide-react'

const STATUS = {
  active: 'bg-green-50 text-green-700',
  completed: 'bg-gray-50 text-gray-500',
  archived: 'bg-yellow-50 text-yellow-700',
}

const STATUS_LABEL = {
  active: '进行中',
  completed: '已完成',
  archived: '已归档',
}

export default function AdminProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [activeTab, setActiveTab] = useState('projects')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', year_name: '', start_date: '', end_date: '', description: '' })
  const [editModal, setEditModal] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', year_name: '', start_date: '', end_date: '' })

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchProjects = () => {
    setLoading(true)
    api.get('/api/common/projects/manage')
      .then(({ data }) => {
        setProjects(data || [])
        setLoading(false)
      })
      .catch((err) => {
        showToast(err.response?.data?.detail || '项目加载失败', 'error')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchProjects()
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
    if (params.get('tab') === 'phases') setActiveTab('phases')
  }, [])

  const handleCreate = async () => {
    if (!createForm.year_name.trim()) return showToast('请输入所属年度', 'error')
    if (!createForm.name.trim()) return showToast('请输入项目名称', 'error')
    if (!createForm.start_date || !createForm.end_date) return showToast('请选择项目开始和结束时间', 'error')
    if (createForm.start_date > createForm.end_date) return showToast('项目结束时间不能早于开始时间', 'error')
    try {
      await api.post('/api/common/projects', {
        ...createForm,
        name: createForm.name.trim(),
        year_name: createForm.year_name.trim(),
      })
      showToast('项目创建成功')
      setShowCreate(false)
      setCreateForm({ name: '', year_name: '', start_date: '', end_date: '', description: '' })
      fetchProjects()
    } catch (err) {
      showToast(err.response?.data?.detail || '创建失败', 'error')
    }
  }

  const handleEdit = async () => {
    if (!editForm.year_name.trim()) return showToast('请输入所属年度', 'error')
    if (!editForm.name.trim()) return showToast('请输入项目名称', 'error')
    if (!editForm.start_date || !editForm.end_date) return showToast('请选择项目开始和结束时间', 'error')
    if (editForm.start_date > editForm.end_date) return showToast('项目结束时间不能早于开始时间', 'error')
    try {
      await api.put(`/api/common/projects/${editModal.id}`, {
        ...editForm,
        name: editForm.name.trim(),
        year_name: editForm.year_name.trim(),
      })
      showToast('项目已更新')
      setEditModal(null)
      fetchProjects()
    } catch (err) {
      showToast(err.response?.data?.detail || '更新失败', 'error')
    }
  }

  const handleArchive = async (project) => {
    if (!window.confirm(`归档项目「${project.name}」将同时关闭该项目下所有进行中的阶段，确定？`)) return
    try {
      await api.put(`/api/common/projects/${project.id}/archive`)
      showToast('项目已归档，数据已进入年度汇总')
      fetchProjects()
    } catch (err) {
      showToast(err.response?.data?.detail || '操作失败', 'error')
    }
  }

  const handleActivate = async (project) => {
    try {
      await api.put(`/api/common/projects/${project.id}/activate`)
      showToast('项目已激活')
      fetchProjects()
    } catch (err) {
      showToast(err.response?.data?.detail || '操作失败', 'error')
    }
  }

  const handleDelete = async (project) => {
    if (!window.confirm(`删除项目「${project.name}」将解除所有关联学员、解散小组，确定？`)) return
    try {
      await api.delete(`/api/common/projects/${project.id}`)
      showToast('项目已删除')
      fetchProjects()
    } catch (err) {
      showToast(err.response?.data?.detail || '删除失败', 'error')
    }
  }

  const manageProjectPhases = (projectId) => {
    setSelectedProjectId(String(projectId))
    setActiveTab('phases')
  }

  const yearOptions = Array.from(
    new Map(projects.map(project => [String(project.year_id), project.year_name])).entries()
  )
  const projectOptions = projects.filter(project => !yearFilter || String(project.year_id) === yearFilter)
  const visibleProjects = projects.filter(project => (
    (!yearFilter || String(project.year_id) === yearFilter)
    && (!projectFilter || String(project.id) === projectFilter)
  ))

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">项目与阶段管理</h1>
        <p className="text-gray-500 mt-1">在项目下统一创建、维护和归档培训阶段</p>
      </div>

      <div className="inline-flex p-1 bg-gray-100 rounded-xl mb-6">
        <button
          onClick={() => setActiveTab('projects')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'projects' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <FolderKanban className="w-4 h-4" /> 项目列表
        </button>
        <button
          onClick={() => {
            setSelectedProjectId('')
            setActiveTab('phases')
          }}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'phases' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <Layers className="w-4 h-4" /> 阶段管理
        </button>
      </div>

      {activeTab === 'phases' ? (
        <AdminPhases embedded initialProjectId={selectedProjectId} />
      ) : (
        <>
          <div className="flex flex-col gap-4 mb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">培训项目</h2>
              <p className="text-sm text-gray-500 mt-1">项目归档后，相关数据会自动进入年度数据汇总</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="text-xs text-gray-500">
                <span className="mb-1 block">年度</span>
                <select
                  value={yearFilter}
                  onChange={(event) => { setYearFilter(event.target.value); setProjectFilter('') }}
                  className="min-w-36 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">全部年度</option>
                  {yearOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                <span className="mb-1 block">培训项目</span>
                <select
                  value={projectFilter}
                  onChange={(event) => setProjectFilter(event.target.value)}
                  className="min-w-44 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">全部项目</option>
                  {projectOptions.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
              <button onClick={() => setShowCreate(true)} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                <Plus className="w-4 h-4" /> 新建项目
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : visibleProjects.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400">暂无符合筛选条件的项目</div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {visibleProjects.map((project) => (
                <div key={project.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:border-indigo-200 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS[project.status] || 'bg-gray-100'}`}>
                          {STATUS_LABEL[project.status] || project.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {project.year_name} {project.description ? `· ${project.description}` : ''}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="h-3.5 w-3.5" />
                        {project.start_date?.slice(0, 10) || '未设置'} 至 {project.end_date?.slice(0, 10) || '未设置'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <Users className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                      <p className="text-xl font-bold text-gray-900">{project.student_count || 0}</p>
                      <p className="text-xs text-gray-500">学员</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <FolderKanban className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
                      <p className="text-xl font-bold text-indigo-600">{project.group_count || 0}</p>
                      <p className="text-xs text-gray-500">小组</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-3 text-center">
                      <Layers className="w-4 h-4 text-orange-400 mx-auto mb-1" />
                      <p className="text-xl font-bold text-orange-600">{project.phase_count || 0}</p>
                      <p className="text-xs text-gray-500">阶段</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <TrendingUp className="w-4 h-4 text-green-500 mx-auto mb-1" />
                      <p className="text-xl font-bold text-green-600">{project.total_points || 0}</p>
                      <p className="text-xs text-gray-500">积分</p>
                    </div>
                  </div>

                  <button
                    onClick={() => manageProjectPhases(project.id)}
                    className="w-full flex items-center justify-between px-4 py-3 mb-4 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100"
                  >
                    <span className="flex items-center gap-2"><Layers className="w-4 h-4" /> 管理该项目的阶段</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <button onClick={() => {
                      setEditModal(project)
                      setEditForm({
                        name: project.name,
                        description: project.description || '',
                        year_name: project.year_name || '',
                        start_date: project.start_date?.slice(0, 10) || '',
                        end_date: project.end_date?.slice(0, 10) || '',
                      })
                    }} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">
                      <Edit className="w-3 h-3" /> 编辑
                    </button>
                    {project.status === 'active' && (
                      <button onClick={() => handleArchive(project)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-100">
                        <Archive className="w-3 h-3" /> 归档
                      </button>
                    )}
                    {project.status === 'archived' && (
                      <button onClick={() => handleActivate(project)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-50 text-green-600 rounded-lg hover:bg-green-100">
                        <RefreshCw className="w-3 h-3" /> 激活
                      </button>
                    )}
                    <button onClick={() => handleDelete(project)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100 ml-auto">
                      <Trash2 className="w-3 h-3" /> 删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">新建项目</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">所属年度 *</label>
                <input type="text" value={createForm.year_name} onChange={(event) => setCreateForm({ ...createForm, year_name: event.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="如：2026年度" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">项目名称 *</label>
                <input type="text" value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="如：优才计划" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">开始时间 *</label>
                  <input type="date" value={createForm.start_date} onChange={(event) => setCreateForm({ ...createForm, start_date: event.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">结束时间 *</label>
                  <input type="date" value={createForm.end_date} onChange={(event) => setCreateForm({ ...createForm, end_date: event.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">描述</label>
                <textarea value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCreate} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">创建</button>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">编辑项目</h3>
              <button onClick={() => setEditModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">所属年度 *</label>
                <input type="text" value={editForm.year_name} onChange={(event) => setEditForm({ ...editForm, year_name: event.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="如：2026年度" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">项目名称 *</label>
                <input type="text" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">开始时间 *</label>
                  <input type="date" value={editForm.start_date} onChange={(event) => setEditForm({ ...editForm, start_date: event.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">结束时间 *</label>
                  <input type="date" value={editForm.end_date} onChange={(event) => setEditForm({ ...editForm, end_date: event.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">描述</label>
                <textarea value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditModal(null)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleEdit} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">保存</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
