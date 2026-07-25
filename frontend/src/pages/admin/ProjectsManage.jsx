import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { Plus, X, Edit, Archive, Trash2, Users, Layers, TrendingUp, Package, RefreshCw, ArrowRight } from 'lucide-react'

export default function AdminProjects() {
  const [projects, setProjects] = useState([])
  const [years, setYears] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', year_name: '', description: '' })
  const [editModal, setEditModal] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', year_id: '' })

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchProjects = () => {
    setLoading(true)
    api.get('/api/common/projects/manage').then(({ data }) => { setProjects(data); setLoading(false) })
      .catch(() => setLoading(false))
    api.get('/api/common/years').then(({ data }) => setYears(data || []))
  }

  useEffect(() => { fetchProjects() }, [])

  const handleCreate = async () => {
    try {
      await api.post('/api/common/projects', createForm)
      showToast('项目创建成功')
      setShowCreate(false); setCreateForm({ name: '', year_name: '', description: '' })
      fetchProjects()
    } catch (err) { showToast(err.response?.data?.detail || '创建失败', 'error') }
  }

  const handleEdit = async () => {
    try {
      await api.put(`/api/common/projects/${editModal.id}`, editForm)
      showToast('项目已更新'); setEditModal(null); fetchProjects()
    } catch (err) { showToast(err.response?.data?.detail || '更新失败', 'error') }
  }

  const handleArchive = async (p) => {
    if (!window.confirm(`归档项目「${p.name}」将同时关闭该项目下所有进行中的阶段，确定？`)) return
    try { await api.put(`/api/common/projects/${p.id}/archive`); showToast('项目已归档'); fetchProjects() }
    catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const handleActivate = async (p) => {
    try { await api.put(`/api/common/projects/${p.id}/activate`); showToast('项目已激活'); fetchProjects() }
    catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const handleDelete = async (p) => {
    if (!window.confirm(`删除项目「${p.name}」将解除所有关联学员、解散小组，确定？`)) return
    try { await api.delete(`/api/common/projects/${p.id}`); showToast('项目已删除'); fetchProjects() }
    catch (err) { showToast(err.response?.data?.detail || '删除失���', 'error') }
  }

  const STATUS = {
    active: 'bg-green-50 text-green-700',
    completed: 'bg-gray-50 text-gray-500',
    archived: 'bg-yellow-50 text-yellow-700',
  }
  const STATUS_LABEL = { active: '进行中', completed: '已完成', archived: '已归档' }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">项目管理</h1>
          <p className="text-gray-500 mt-1">管理培训项目（优才计划 / 优才计划PLUS）</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> 新建项目
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
      ) : projects.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400">暂无项目</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">{p.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS[p.status] || 'bg-gray-100'}`}>
                      {STATUS_LABEL[p.status] || p.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{p.year_name} {p.description ? `· ${p.description}` : ''}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{p.student_count}</p>
                  <p className="text-xs text-gray-500">学员</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-indigo-600">{p.group_count}</p>
                  <p className="text-xs text-gray-500">小组</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">{p.phase_count}</p>
                  <p className="text-xs text-gray-500">阶段</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{p.total_points}</p>
                  <p className="text-xs text-gray-500">积分</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <button onClick={() => { setEditModal(p); setEditForm({ name: p.name, description: p.description || '', year_id: p.year_id }) }} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">
                  <Edit className="w-3 h-3" /> 编辑
                </button>
                {p.status === 'active' && (
                  <button onClick={() => handleArchive(p)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-100">
                    <Archive className="w-3 h-3" /> 归档
                  </button>
                )}
                {p.status === 'archived' && (
                  <button onClick={() => handleActivate(p)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-50 text-green-600 rounded-lg hover:bg-green-100">
                    <RefreshCw className="w-3 h-3" /> 激活
                  </button>
                )}
                <button onClick={() => handleDelete(p)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100 ml-auto">
                  <Trash2 className="w-3 h-3" /> 删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">新建项目</h3><button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="space-y-4">
              <div><label className="block text-sm text-gray-600 mb-1">项目名称 *</label><input type="text" value={createForm.name} onChange={(e) => setCreateForm({...createForm, name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="如：优才计划"/></div>
              <div><label className="block text-sm text-gray-600 mb-1">所属年度 *</label><input type="text" value={createForm.year_name} onChange={(e) => setCreateForm({...createForm, year_name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="如：2026年度" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">描述</label><textarea value={createForm.description} onChange={(e) => setCreateForm({...createForm, description: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button><button onClick={handleCreate} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">创建</button></div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">编辑项目</h3><button onClick={() => setEditModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="space-y-4">
              <div><label className="block text-sm text-gray-600 mb-1">项目名称</label><input type="text" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">描述</label><textarea value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setEditModal(null)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button><button onClick={handleEdit} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">保存</button></div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
