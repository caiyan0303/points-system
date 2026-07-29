import { useState, useEffect, useRef } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Pagination from '../../components/Pagination'
import Toast from '../../components/Toast'
import InformationPageTabs from '../../components/InformationPageTabs'
import { useAdminScope } from '../../contexts/AdminScopeContext'
import {
  Search, Award, X, UserPlus, Edit, Ban, RefreshCw,
  Eye, Upload, Download, CheckCircle2, FileSpreadsheet, LoaderCircle
} from 'lucide-react'
import * as XLSX from 'xlsx'
const CATEGORIES = [
  '线上学习', '学习输出', '问卷及测评反馈', '线下出勤',
  '课堂互动', '结营任务', '小组长职责', '特殊调整'
]

export default function AdminStudents() {
  const { yearId, projectId } = useAdminScope()
  const [students, setStudents] = useState([])
  const [years, setYears] = useState([])
  const [allProjects, setAllProjects] = useState([])
  const [groups, setGroups] = useState([])
  const [phases, setPhases] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [groupId, setGroupId] = useState('')
  const [accountStatus, setAccountStatus] = useState('')
  const [employmentStatus, setEmploymentStatus] = useState('')
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Modal states
  const [pointModal, setPointModal] = useState(null) // single
  const [batchPointModal, setBatchPointModal] = useState(false)
  const [batchPointForm, setBatchPointForm] = useState({ points: '', category: '线上学习', description: '', phase_id: '' })
  const [createModal, setCreateModal] = useState(false)
  const [editModal, setEditModal] = useState(null)
  const [viewModal, setViewModal] = useState(null)
  const [batchModal, setBatchModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [batchData, setBatchData] = useState([])
  const [batchPreview, setBatchPreview] = useState(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [isParsingFile, setIsParsingFile] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef(null)

  const [pointForm, setPointForm] = useState({ points: '', category: '线上学习', description: '', phase_id: '' })
  const [createForm, setCreateForm] = useState({ real_name: '', department: '', system: '', level1_dept: '', position: '', year_id: '', project_id: '', group_id: '', group_name: '' })
  const [editForm, setEditForm] = useState({ real_name: '', department: '', system: '', level1_dept: '', position: '', year_id: '', project_id: '', group_id: '', group_name: '', employment_status: '在职', account_status: '启用' })

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const createProjects = createForm.year_id
    ? allProjects.filter(p => String(p.year_id) === String(createForm.year_id))
    : allProjects
  const createGroups = createForm.project_id
    ? groups.filter(g => String(g.project_id) === String(createForm.project_id))
    : []
  const editProjects = editForm.year_id
    ? allProjects.filter(p => String(p.year_id) === String(editForm.year_id))
    : allProjects
  const editGroups = editForm.project_id
    ? groups.filter(g => String(g.project_id) === String(editForm.project_id))
    : []

  const fetchStudents = () => {
    setLoading(true)
    const params = { page, page_size: 15 }
    if (keyword) params.keyword = keyword
    if (yearId) params.year_id = yearId
    if (projectId) params.project_id = projectId
    if (groupId) params.group_id = groupId
    if (accountStatus) params.account_status = accountStatus
    if (employmentStatus) params.employment_status = employmentStatus
    api.get('/api/admin/students', { params })
      .then(({ data }) => { setStudents(data.items || []); setTotalPages(data.total_pages || 1); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => { fetchStudents() }, [page])
  useEffect(() => {
    if (page !== 1) setPage(1)
    else fetchStudents()
  }, [yearId, projectId])
  useEffect(() => {
    api.get('/api/common/years').then(({ data }) => setYears(data || []))
    api.get('/api/common/projects').then(({ data }) => setAllProjects(data || []))
    api.get('/api/admin/groups').then(({ data }) => setGroups(data || []))
    api.get('/api/admin/phases').then(({ data }) => setPhases(data || []))
  }, [])

  const handleSearch = (e) => { e.preventDefault(); if (page !== 1) setPage(1); else fetchStudents() }
  const handleReset = () => { setKeyword(''); setGroupId(''); setAccountStatus(''); setEmploymentStatus(''); setPage(1); setTimeout(fetchStudents, 0) }

  // Selection handlers
  const toggleSelect = (id) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  const toggleAll = () => {
    if (selectedIds.size === students.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(students.map(s => s.id)))
  }

  // Single point add
  const handleAddPoints = async () => {
    if (!pointForm.phase_id || !pointForm.description.trim()) return showToast('请选择阶段并填写积分事项', 'error')
    try {
      await api.post('/api/admin/points', {
        student_id: pointModal.student_id, points: parseInt(pointForm.points),
        category: pointForm.category, description: pointForm.description,
        item_name: pointForm.description, task_key: pointForm.description,
        phase_id: pointForm.phase_id ? parseInt(pointForm.phase_id) : null,
      })
      showToast(`已添加 ${pointForm.points} 积分`)
      setPointModal(null); setPointForm({ points: '', category: '线上学习', description: '', phase_id: '' })
      fetchStudents()
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  // Batch point add/subtract
  const handleBatchPoints = async () => {
    if (selectedIds.size === 0) return showToast('请先选择学员', 'error')
    if (!batchPointForm.points || !batchPointForm.phase_id || !batchPointForm.description.trim()) return showToast('请输入积分数、选择阶段并填写积分事项', 'error')
    const pts = parseInt(batchPointForm.points)
    try {
      const records = [...selectedIds].map(sid => ({
        student_id: sid, points: pts, category: batchPointForm.category,
        description: batchPointForm.description,
        item_name: batchPointForm.description, task_key: batchPointForm.description,
        phase_id: batchPointForm.phase_id ? parseInt(batchPointForm.phase_id) : null,
      }))
      await api.post('/api/admin/points/batch', { records })
      showToast(`已为 ${records.length} 名学员${pts > 0 ? '添加' : '扣减'} ${Math.abs(pts)} 积分`)
      setBatchPointModal(false); setBatchPointForm({ points: '', category: '线上学习', description: '', phase_id: '' })
      setSelectedIds(new Set()); fetchStudents()
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  // Batch delete
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    setDeleteConfirm(true)
  }

  const confirmBatchDelete = async () => {
    try {
      await api.post('/api/admin/students/batch-delete', [...selectedIds])
      showToast('已删除 ' + selectedIds.size + ' 名学员')
      setSelectedIds(new Set()); setDeleteConfirm(false); fetchStudents()
    } catch (err) { showToast(err.response?.data?.detail || '删除失败', 'error'); setDeleteConfirm(false) }
  }

  // Create student
  const handleCreate = async () => {
    try {
      const payload = {
        ...createForm,
        year_id: createForm.year_id || null,
        project_id: createForm.project_id || null,
        group_id: createForm.group_id || null,
      }
      const { data } = await api.post('/api/admin/students', payload)
      showToast(data.message || '学员创建成功')
      setCreateModal(false); setCreateForm({ real_name: '', department: '', system: '', level1_dept: '', position: '', year_id: '', project_id: '', group_id: '', group_name: '' })
      api.get('/api/admin/groups').then(({ data: groupData }) => setGroups(groupData || []))
      fetchStudents()
    } catch (err) { showToast(err.response?.data?.detail || '创建失败', 'error') }
  }

  // Edit student
  const openEdit = (s) => {
    setEditModal(s)
    setEditForm({ real_name: s.real_name, department: s.department || '', system: s.system || '', level1_dept: s.level1_dept || '', position: s.position || '', year_id: s.year_id || '', project_id: s.project_id || '', group_id: s.group_id || '', group_name: s.group_name || '', employment_status: s.employment_status, account_status: s.account_status })
  }
  const handleEdit = async () => {
    try { await api.put(`/api/admin/students/${editModal.id}`, {...editForm, year_id: editForm.year_id || null, project_id: editForm.project_id || null, group_id: editForm.group_id || null}); showToast('已更新'); setEditModal(null); api.get('/api/admin/groups').then(({ data }) => setGroups(data || [])); fetchStudents() }
    catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  // Toggle active
  // 单个学员硬删除（带确认弹窗）
  const [singleDelete, setSingleDelete] = useState(null)
  const handleHardDelete = async () => {
    if (!singleDelete) return
    try {
      await api.delete(`/api/admin/students/${singleDelete.id}`)
      showToast('学员已彻底删除'); setSingleDelete(null); fetchStudents()
    } catch (err) { showToast(err.response?.data?.detail || '删除失败', 'error'); setSingleDelete(null) }
  }

  // View detail
  const openViewDetail = async (s) => {
    try { const { data } = await api.get(`/api/admin/students/${s.id}`); setViewModal(data) }
    catch (err) { showToast('加载失败', 'error') }
  }

  // Batch import
  const resetBatchImport = () => {
    setBatchModal(false)
    setBatchData([])
    setBatchPreview(null)
    setSelectedFileName('')
    setIsParsingFile(false)
    setIsDraggingFile(false)
    setIsImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const parseImportFile = async (file) => {
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!['json', 'csv', 'xlsx', 'xls'].includes(extension)) {
      showToast('请选择 Excel、CSV 或 JSON 文件', 'error')
      return
    }

    setSelectedFileName(file.name)
    setBatchData([])
    setBatchPreview(null)
    setIsParsingFile(true)

    // 先让“正在解析”状态显示出来，再进行工作簿解析。
    await new Promise(resolve => window.requestAnimationFrame(() => setTimeout(resolve, 0)))
    try {
      let parsed
      if (extension === 'json') {
        parsed = JSON.parse(await file.text())
        if (!Array.isArray(parsed)) parsed = [parsed]
      } else {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', dense: true })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        parsed = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false })
      }

        // 归一化字段名（中文 → 英文）
        const fieldMap = {
          '姓名': 'real_name',
          '部门': 'department', '体系': 'system', '一级部门': 'level1_dept', '职位信息': 'position', '职位': 'position',
          '所属年度': 'year_name', '培训项目': 'project_name', '所属小组': 'group_name',
          '项目标注': 'enrollment_label', '备注': 'enrollment_remark',
          '在职状态': 'employment_status', '账号状态': 'account_status',
        }
        parsed = parsed.map(r => {
          const new_r = { ...r }
          for (const [k, v] of Object.entries(r)) {
            const cleanKey = String(k).replace(/^\uFEFF/, '').trim()
            const cleanValue = typeof v === 'string' ? v.trim() : v
            if (fieldMap[cleanKey]) {
              new_r[fieldMap[cleanKey]] = cleanValue
              delete new_r[k]
            } else if (cleanKey !== k || cleanValue !== v) {
              delete new_r[k]
              new_r[cleanKey] = cleanValue
            }
          }
          return new_r
        })
      setBatchData(parsed)
      setBatchPreview({ total: parsed.length, valid: parsed.length, invalid: 0 })
    } catch {
      setSelectedFileName('')
      showToast('文件解析失败，请确认文件格式和表头', 'error')
    } finally {
      setIsParsingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0]
    if (file) parseImportFile(file)
  }

  const handleFileDrop = (event) => {
    event.preventDefault()
    setIsDraggingFile(false)
    const file = event.dataTransfer.files?.[0]
    if (file && !isParsingFile) parseImportFile(file)
  }

  const handleBatchImport = async () => {
    if (!batchData.length || isImporting) return
    setIsImporting(true)
    try {
      const { data } = await api.post('/api/admin/students/batch', { rows: batchData })
      showToast(data.message || `成功导入 ${batchData.length} 名学员`)
      resetBatchImport(); fetchStudents()
    } catch (err) {
      showToast(err.response?.data?.detail || '导入失败', 'error')
      setIsImporting(false)
    }
  }

  // Download the maintained Excel template from the public assets.
  const downloadTemplate = () => {
    const link = document.createElement('a')
    link.href = '/templates/学员批量导入模板.xlsx'
    link.download = '学员批量导入模板.xlsx'
    link.click()
  }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">学员管理</h1>
          <p className="text-gray-500 mt-1">管理所有学员及积分（已选 {selectedIds.size} 人）</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && <button onClick={handleBatchDelete} className="px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">批量删除（{selectedIds.size}）</button>}
          <button onClick={() => { setCreateForm({ real_name: '', department: '', system: '', level1_dept: '', position: '', year_id: yearId || '', project_id: projectId || '', group_id: '', group_name: '' }); setCreateModal(true) }} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <UserPlus className="w-4 h-4" /> 新增学员
          </button>
          <button onClick={() => setBatchModal(true)} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Upload className="w-4 h-4" /> 批量导入
          </button>
          <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-indigo-300 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50">
            <Download className="w-4 h-4" /> 下载模版
          </button>
        </div>
      </div>
      <InformationPageTabs />

      {/* Filters */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索姓名、部门、职位..." className="w-48 pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">所有小组</option>
            {groups.filter(g => !projectId || String(g.project_id) === String(projectId)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={accountStatus} onChange={(e) => setAccountStatus(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">账号状态</option>
            <option value="启用">启用</option>
            <option value="终止">终止</option>
          </select>
          <select value={employmentStatus} onChange={(e) => setEmploymentStatus(e.target.value)} className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">在职状态</option>
            <option value="在职">在职</option>
            <option value="离职">离职</option>
          </select>
          <button type="submit" className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">筛选</button>
          <button type="button" onClick={handleReset} className="px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
        ) : error ? (
          <div className="flex items-center justify-center h-48 text-red-400">{error}</div>
        ) : students.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400">暂无学员数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-center px-3 py-3 w-10">
                    <input type="checkbox" checked={selectedIds.size === students.length && students.length > 0} onChange={toggleAll} className="rounded" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">姓名</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">登录账号</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">所属年度</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">培训项目</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">体系</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">一级部门</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">职位信息</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">所属小组</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">在职</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">账号状态</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-indigo-600">当前项目积分</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-emerald-600">可兑换积分</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">历史累计积分</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {students.map((s) => (
                  <tr key={s.id} className={`hover:bg-gray-50 ${!s.is_active && s.account_status === '终止' ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-3 text-center">
                      <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} className="rounded" />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.real_name}</td>
                    <td className="px-4 py-3 text-sm text-indigo-600">{s.username}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.year_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.project_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.system || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.level1_dept || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.position || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.group_name || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.employment_status === '在职' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{s.employment_status}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.account_status === '启用' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>{s.account_status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-black text-indigo-600 text-right">{s.period_points || 0}</td>
                    <td className="px-4 py-3 text-sm font-black text-emerald-600 text-right">{s.available_points || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">{s.total_earned || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openViewDetail(s)} className="px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100" title="详情"><Eye className="w-3 h-3" /></button>
                        <button onClick={() => setPointModal({ student_id: s.id, real_name: s.real_name })} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100" title="添加积分"><Award className="w-3 h-3" /></button>
                        <button onClick={() => openEdit(s)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="编辑"><Edit className="w-3 h-3" /></button>
                        <button onClick={() => setSingleDelete(s)} className="px-2 py-1 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100" title="彻底删除">
                          <Ban className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-4 border-t border-gray-100"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
      </div>

      {/* ── Modals ── */}

      {/* Single Add Points */}
      {pointModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">为 {pointModal.real_name} 添加积分</h3><button onClick={() => setPointModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm text-gray-600 mb-1">积分数 *</label><input type="number" value={pointForm.points} onChange={(e) => setPointForm({...pointForm, points: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-sm text-gray-600 mb-1">所属阶段 *</label><select value={pointForm.phase_id} onChange={(e) => setPointForm({...pointForm, phase_id: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">请选择</option>{phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              </div>
              <div><label className="block text-sm text-gray-600 mb-1">分类</label><select value={pointForm.category} onChange={(e) => setPointForm({...pointForm, category: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className="block text-sm text-gray-600 mb-1">积分事项 / 调整原因 *</label><textarea value={pointForm.description} onChange={(e) => setPointForm({...pointForm, description: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setPointModal(null)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button><button onClick={handleAddPoints} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">确认</button></div>
          </div>
        </div>
      )}

      {/* Batch Add/Subtract Points */}
      {batchPointModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">批量{parseInt(batchPointForm.points || '0') >= 0 ? '加分' : '减分'}（{selectedIds.size} 人）</h3><button onClick={() => setBatchPointModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm text-gray-600 mb-1">积分数 *（负数=减分）</label><input type="number" value={batchPointForm.points} onChange={(e) => setBatchPointForm({...batchPointForm, points: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="输入积分数，负数表示扣减" /></div>
                <div><label className="block text-sm text-gray-600 mb-1">所属阶段 *</label><select value={batchPointForm.phase_id} onChange={(e) => setBatchPointForm({...batchPointForm, phase_id: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">请选择</option>{phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              </div>
              <div><label className="block text-sm text-gray-600 mb-1">分类</label><select value={batchPointForm.category} onChange={(e) => setBatchPointForm({...batchPointForm, category: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className="block text-sm text-gray-600 mb-1">积分事项 / 调整原因 *</label><textarea value={batchPointForm.description} onChange={(e) => setBatchPointForm({...batchPointForm, description: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setBatchPointModal(false)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button><button onClick={handleBatchPoints} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">确认批量操作</button></div>
          </div>
        </div>
      )}

      {/* Create Student */}
      {createModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">新增学员</h3><button onClick={() => setCreateModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm text-gray-600 mb-1">姓名 *</label><input type="text" value={createForm.real_name} onChange={(e) => setCreateForm({...createForm, real_name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700">账号自动使用中文姓名，无需设置密码</div>
              <div><label className="block text-sm text-gray-600 mb-1">体系</label><input type="text" value={createForm.system} onChange={(e) => setCreateForm({...createForm, system: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">一级部门</label><input type="text" value={createForm.level1_dept} onChange={(e) => setCreateForm({...createForm, level1_dept: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">职位信息</label><input type="text" value={createForm.position} onChange={(e) => setCreateForm({...createForm, position: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">年度</label><select value={createForm.year_id} onChange={(e) => setCreateForm({...createForm, year_id: e.target.value, project_id: '', group_id: '', group_name: ''})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">选择年度</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
              <div><label className="block text-sm text-gray-600 mb-1">培训项目</label><select value={createForm.project_id} onChange={(e) => setCreateForm({...createForm, project_id: e.target.value, group_id: '', group_name: ''})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">选择项目</option>{createProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label className="block text-sm text-gray-600 mb-1">所属小组</label><input type="text" list="create-student-groups" value={createForm.group_name} onChange={(e) => setCreateForm({...createForm, group_id: '', group_name: e.target.value})} disabled={!createForm.project_id} placeholder={createForm.project_id ? '选择已有小组或输入新小组' : '请先选择培训项目'} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400" /><datalist id="create-student-groups">{createGroups.map(g => <option key={g.id} value={g.name} />)}</datalist><p className="mt-1 text-xs text-gray-400">没有对应小组时，将按输入名称自动创建</p></div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setCreateModal(false)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button><button onClick={handleCreate} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">创建学员</button></div>
          </div>
        </div>
      )}

      {/* Edit Student */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">编辑学员</h3><button onClick={() => setEditModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm text-gray-600 mb-1">姓名</label><input type="text" value={editForm.real_name} onChange={(e) => setEditForm({...editForm, real_name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">体系</label><input type="text" value={editForm.system || ''} onChange={(e) => setEditForm({...editForm, system: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">一级部门</label><input type="text" value={editForm.level1_dept || ''} onChange={(e) => setEditForm({...editForm, level1_dept: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">职位信息</label><input type="text" value={editForm.position || ''} onChange={(e) => setEditForm({...editForm, position: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">年度</label><select value={editForm.year_id || ''} onChange={(e) => setEditForm({...editForm, year_id: e.target.value, project_id: '', group_id: '', group_name: ''})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">选择年度</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
              <div><label className="block text-sm text-gray-600 mb-1">培训项目</label><select value={editForm.project_id || ''} onChange={(e) => setEditForm({...editForm, project_id: e.target.value, group_id: '', group_name: ''})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"><option value="">选择项目</option>{editProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label className="block text-sm text-gray-600 mb-1">所属小组</label><input type="text" list="edit-student-groups" value={editForm.group_name || ''} onChange={(e) => setEditForm({...editForm, group_id: '', group_name: e.target.value})} disabled={!editForm.project_id} placeholder={editForm.project_id ? '选择已有小组或输入新小组' : '请先选择培训项目'} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400" /><datalist id="edit-student-groups">{editGroups.map(g => <option key={g.id} value={g.name} />)}</datalist><p className="mt-1 text-xs text-gray-400">没有对应小组时，将按输入名称自动创建</p></div>
              <div><label className="block text-sm text-gray-600 mb-1">在职状态</label><select value={editForm.employment_status || '在职'} onChange={(e) => setEditForm({...editForm, employment_status: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"><option>在职</option><option>离职</option></select></div>
              <div><label className="block text-sm text-gray-600 mb-1">账号状态</label><select value={editForm.account_status || '启用'} onChange={(e) => setEditForm({...editForm, account_status: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"><option>启用</option><option>终止</option></select></div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setEditModal(null)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button><button onClick={handleEdit} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">保存</button></div>
          </div>
        </div>
      )}

      {/* View Detail */}
      {viewModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">{viewModal.real_name} - 详情</h3><button onClick={() => setViewModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">本期积分</p><p className="text-xl font-bold text-indigo-600">{viewModal.period_points || 0}</p></div>
              <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">总获得积分</p><p className="text-xl font-bold text-gray-700">{viewModal.total_points || 0}</p></div>
              <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">可用积分</p><p className="text-xl font-bold text-green-600">{viewModal.available_points || 0}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">年度:</span> <span className="font-medium">{viewModal.year_name || '-'}</span></div>
              <div><span className="text-gray-500">培训项目:</span> <span className="font-medium">{viewModal.project_name || '-'}</span></div>
              <div><span className="text-gray-500">体系:</span> <span className="font-medium">{viewModal.system || '-'}</span></div>
              <div><span className="text-gray-500">一级部门:</span> <span className="font-medium">{viewModal.level1_dept || '-'}</span></div>
              <div><span className="text-gray-500">职位信息:</span> <span className="font-medium">{viewModal.position || '-'}</span></div>
              <div><span className="text-gray-500">小组:</span> <span className="font-medium">{viewModal.group_name || '-'}</span></div>
              <div><span className="text-gray-500">部门:</span> <span className="font-medium">{viewModal.department || '-'}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Import */}
      {batchModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">批量导入学员</h3><button onClick={resetBatchImport} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="flex items-center gap-3 mb-3">
              <button onClick={downloadTemplate} className="flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50">
                <Download className="w-4 h-4" /> 下载导入模版
              </button>
              <span className="text-xs text-gray-400">支持 Excel / CSV / JSON 格式</span>
            </div>
            <div className="mb-4 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
              导入后会自动创建或关联小组，并为新学员开通中文姓名账号。同一项目已存在的学员会自动跳过；同一年度不能参加两个项目，跨年度参加其他项目时会新增项目关联。
            </div>
            <input ref={fileInputRef} type="file" accept=".json,.csv,.xlsx,.xls" onChange={handleFileUpload} className="sr-only" />
            <button
              type="button"
              disabled={isParsingFile}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setIsDraggingFile(true) }}
              onDragOver={(event) => { event.preventDefault(); setIsDraggingFile(true) }}
              onDragLeave={(event) => { event.preventDefault(); setIsDraggingFile(false) }}
              onDrop={handleFileDrop}
              className={`mb-4 flex min-h-48 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-wait ${isDraggingFile ? 'border-indigo-500 bg-indigo-50' : selectedFileName ? 'border-emerald-300 bg-emerald-50/60' : 'border-gray-300 bg-gray-50/40 hover:border-indigo-400 hover:bg-indigo-50/60'}`}
            >
              {isParsingFile ? <LoaderCircle className="mb-3 h-11 w-11 animate-spin text-indigo-600" /> : selectedFileName ? <CheckCircle2 className="mb-3 h-11 w-11 text-emerald-500" /> : <Upload className="mb-3 h-11 w-11 text-gray-400" />}
              <p className="text-base font-semibold text-gray-700">{isParsingFile ? '正在读取并解析文件…' : selectedFileName ? '文件读取完成' : '点击此区域选择文件'}</p>
              <p className="mt-1 text-sm text-gray-500">{selectedFileName || '也可以将 Excel 文件直接拖放到这里'}</p>
              {!isParsingFile && <span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm"><FileSpreadsheet className="h-4 w-4" />{selectedFileName ? '重新选择文件' : '选择 Excel 文件'}</span>}
            </button>
            {batchPreview && (
              <div className="mb-4">
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                  <span>总计: {batchPreview.total}</span><span className="text-green-600">有效: {batchPreview.valid}</span><span className="text-red-500">无效: {batchPreview.invalid}</span>
                </div>
                {batchData.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50"><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">姓名</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">体系</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">一级部门</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500">职位信息</th></tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {batchData.slice(0, 10).map((item, i) => (
                          <tr key={i}><td className="px-3 py-2 text-gray-700">{item.real_name || item.name}</td><td className="px-3 py-2 text-gray-500">{item.system || '-'}</td><td className="px-3 py-2 text-gray-500">{item.level1_dept || '-'}</td><td className="px-3 py-2 text-gray-500">{item.position || '-'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    {batchData.length > 10 && <p className="text-xs text-gray-400 p-2">... 还有 {batchData.length - 10} 条</p>}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3"><button onClick={resetBatchImport} disabled={isImporting} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">取消</button><button onClick={handleBatchImport} disabled={batchData.length === 0 || isParsingFile || isImporting} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{isImporting ? '正在导入…' : `确认导入 (${batchData.length} 条)`}</button></div>
          </div>
        </div>
      )}
    
      {/* Batch Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">确认批量删除</h3><button onClick={() => setDeleteConfirm(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <p className="text-sm text-gray-500 mb-4">确定要删除选中的 {selectedIds.size} 名学员吗？此操作不可撤销。</p>
            <div className="flex gap-3 mt-6"><button onClick={() => setDeleteConfirm(false)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button><button onClick={confirmBatchDelete} className="flex-1 py-2.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">确认删除</button></div>
          </div>
        </div>
      )}

      {/* Single Delete Confirm */}
      {singleDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">确认彻底删除学员</h3><button onClick={() => setSingleDelete(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <p className="text-sm text-gray-600 mb-4">确定要从数据库中<strong className="text-red-600">彻底删除</strong> <strong>{singleDelete.real_name}</strong> 吗？</p>
            <p className="text-xs text-red-500 mb-4">此操作将删除该学员的所有积分、兑换、小组关联、阶段参与等所有数据，且无法恢复！</p>
            <div className="flex gap-3"><button onClick={() => setSingleDelete(null)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button><button onClick={handleHardDelete} className="flex-1 py-2.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">确认彻底删除</button></div>
          </div>
        </div>
      )}
</AppLayout>
  )
}
