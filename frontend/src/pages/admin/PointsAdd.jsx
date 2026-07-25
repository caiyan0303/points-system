import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { Plus, Upload, X, Trash2, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

const CATEGORIES = [
  '课程学习完成', '作业提交质量', '案例沟通表现', '案例输出成果',
  '线下课参与', '团队协作贡献', '知识分享输出', '特殊贡献奖励', '其它积分'
]

export default function AdminPointsAdd() {
  const [tab, setTab] = useState('single')
  const [students, setStudents] = useState([])
  const [years, setYears] = useState([])
  const [projects, setProjects] = useState([])
  const [groups, setGroups] = useState([])
  const [phases, setPhases] = useState([])
  const [toast, setToast] = useState(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)

  const filteredStudents = studentSearch ? students.filter(s =>
    s.real_name.includes(studentSearch) || s.username?.includes(studentSearch)
  ) : students.slice(0, 20)

  // Single entry
  const [singleForm, setSingleForm] = useState({
    student_id: '', year_id: '', project_id: '', group_id: '', phase_id: '',
    points: '', category: '课程学习完成', description: '', obtained_date: new Date().toISOString().split('T')[0]
  })
  const [submitting, setSubmitting] = useState(false)

  // Batch entry
  const [batchRows, setBatchRows] = useState([{ student_id: '', year_id: '', project_id: '', phase_id: '', points: '', category: '课程学习完成', description: '', obtained_date: new Date().toISOString().split('T')[0], group_id: '' }])

  // Excel import
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importStats, setImportStats] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    api.get('/api/admin/students', { params: { page_size: 100 } }).then(({ data }) => setStudents(data.items || data))
    api.get('/api/common/years').then(({ data }) => setYears(data.items || data))
    api.get('/api/common/projects').then(({ data }) => setProjects(data.items || data))
    api.get('/api/admin/groups').then(({ data }) => setGroups(data.items || data))
    api.get('/api/admin/phases').then(({ data }) => setPhases(data.items || data))
  }, [])

  const handleSingleSubmit = async () => {
    if (!singleForm.student_id || !singleForm.points) return showToast('请选择学员并输入积分', 'error')
    setSubmitting(true)
    try {
      const payload = {
        student_id: parseInt(singleForm.student_id),
        points: parseInt(singleForm.points),
        category: singleForm.category,
        description: singleForm.description,
        obtained_date: singleForm.obtained_date,
      }
      if (singleForm.phase_id) payload.phase_id = parseInt(singleForm.phase_id)
      if (singleForm.year_id) payload.year_id = parseInt(singleForm.year_id)
      if (singleForm.project_id) payload.project_id = parseInt(singleForm.project_id)
      if (singleForm.group_id) payload.group_id = parseInt(singleForm.group_id)
      await api.post('/api/admin/points', payload)
      showToast(`${singleForm.points} 积分已录入`)
      setSingleForm({ student_id: '', year_id: '', project_id: '', group_id: '', phase_id: '', points: '', category: '课程学习完成', description: '', obtained_date: new Date().toISOString().split('T')[0] })
    } catch (err) { showToast(err.response?.data?.detail || '录入失败', 'error') }
    finally { setSubmitting(false) }
  }

  const handleBatchSubmit = async () => {
    const validRows = batchRows.filter(r => r.student_id && r.points)
    if (validRows.length === 0) return showToast('请完善积分信息', 'error')
    setSubmitting(true)
    try {
      const results = await Promise.allSettled(validRows.map(r => {
        const payload = {
          student_id: parseInt(r.student_id),
          points: parseInt(r.points),
          category: r.category,
          description: r.description,
          obtained_date: r.obtained_date,
        }
        if (r.phase_id) payload.phase_id = parseInt(r.phase_id)
        if (r.year_id) payload.year_id = parseInt(r.year_id)
        if (r.project_id) payload.project_id = parseInt(r.project_id)
        return api.post('/api/admin/points', payload)
      }))
      const succeeded = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      showToast(`成功录入 ${succeeded} 条${failed > 0 ? `，${failed} 条失败` : ''}`, failed > 0 ? 'error' : 'success')
      setBatchRows([{ student_id: '', year_id: '', project_id: '', phase_id: '', points: '', category: '课程学习完成', description: '', obtained_date: new Date().toISOString().split('T')[0], group_id: '' }])
    } catch (err) { showToast('批量录入失败', 'error') }
    finally { setSubmitting(false) }
  }

  // 下载积分导入模板
  const downloadPointsTemplate = () => {
    const headers = ['姓名', '邮箱', '所属年度', '培训项目', '培训阶段', '所属小组', '积分分类', '积分事项', '积分数值', '获得日期', '备注']
    const example = ['张三', 'zhangsan@company.com', '2026年度', '优才计划', '第三阶段·引领与创新', '第一组', '线上课程', '课程完成', '10', '2026-07-23', '示例数据']
    const ws = XLSX.utils.aoa_to_sheet([headers, example])
    ws['!cols'] = headers.map(() => ({ wch: 18 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '积分导入模板')
    XLSX.writeFile(wb, '积分导入模板.xlsx')
  }

    const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImportFile(file)
    try {
      let data = []
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        data = XLSX.utils.sheet_to_json(ws, { defval: '' })
      } else if (file.name.endsWith('.json')) {
        const text = await file.text()
        data = JSON.parse(text)
        data = Array.isArray(data) ? data : [data]
      } else {
        const text = await file.text()
        const lines = text.split('\n').filter(l => l.trim())
        const headers = lines[0].split(',').map(h => h.trim())
        data = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim())
          return headers.reduce((obj, h, i) => { obj[h] = vals[i]; return obj }, {})
        })
      }
      const studentIds = new Set(students.map(s => s.id))
      const valid = data.filter(d => studentIds.has(parseInt(d.student_id)) && d.points)
      const invalid = data.length - valid.length
      const duplicates = data.length - new Set(data.map(d => d.student_id + '_' + d.points)).size
      setImportPreview(valid)
      setImportStats({ total: data.length, valid: valid.length, invalid, duplicates })
    } catch (err) { showToast('文件解析失败: ' + err.message, 'error') }
  }

  const handleImportConfirm = async () => {
    if (!importPreview || importPreview.length === 0) return
    setSubmitting(true)
    try {
      const results = await Promise.allSettled(importPreview.map(r => {
        const payload = {
          student_id: parseInt(r.student_id),
          points: parseInt(r.points),
          category: r.category || '课程学习完成',
          description: r.description || '',
          obtained_date: r.obtained_date || new Date().toISOString().split('T')[0],
        }
        if (r.phase_id) payload.phase_id = parseInt(r.phase_id)
        return api.post('/api/admin/points', payload)
      }))
      const succeeded = results.filter(r => r.status === 'fulfilled').length
      showToast(`成功导入 ${succeeded} 条积分记录`)
      setImportFile(null)
      setImportPreview(null)
      setImportStats(null)
    } catch (err) { showToast('导入失败', 'error') }
    finally { setSubmitting(false) }
  }

  const updateBatchRow = (i, field, value) => {
    setBatchRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">积分录入</h1>
        <p className="text-gray-500 mt-1">为学员录入积分</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="flex border-b border-gray-200">
          {[
            { key: 'single', label: '单个录入' },
            { key: 'batch', label: '批量录入' },
            { key: 'import', label: 'Excel导入' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                tab === t.key ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >{t.label}</button>
          ))}
        </div>

        {/* Single Entry */}
        {tab === 'single' && (
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4 max-w-2xl">
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">学员 *</label>
                <div className="relative">
                  <input type="text" value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); setShowSuggest(true); setSingleForm({...singleForm, student_id: ''}) }} onFocus={() => setShowSuggest(true)} onBlur={() => setTimeout(() => setShowSuggest(false), 200)} placeholder="输入学员姓名搜索..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  {showSuggest && filteredStudents.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                      {filteredStudents.map(s => (
                        <div key={s.id} onClick={() => { setSingleForm({...singleForm, student_id: s.id}); setStudentSearch(`${s.real_name} (${s.department || '无部门'})`); setShowSuggest(false) }} className="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer">
                          {s.real_name} <span className="text-gray-400">— {s.department || '无部门'} · {s.system || ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {showSuggest && studentSearch && filteredStudents.length === 0 && (
                    <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 p-3 text-sm text-gray-400">未找到匹配学员</div>
                  )}
                </div>
                {singleForm.student_id && <p className="text-xs text-green-600 mt-1">已选择: {students.find(s => s.id === parseInt(singleForm.student_id))?.real_name}</p>}
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">积分 *</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { const v = parseInt(singleForm.points || '0') || 0; setSingleForm({...singleForm, points: String(Math.abs(v))}) }} className={`px-3 py-2 text-sm font-medium rounded-lg border ${(parseInt(singleForm.points || '0') || 0) >= 0 ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-500'}`}>+ 加分</button>
                  <button type="button" onClick={() => { const v = parseInt(singleForm.points || '0') || 0; setSingleForm({...singleForm, points: String(-Math.abs(v) || -1)}) }} className={`px-3 py-2 text-sm font-medium rounded-lg border ${(parseInt(singleForm.points || '0') || 0) < 0 ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-200 text-gray-500'}`}>- 减分</button>
                  <input type="number" value={Math.abs(parseInt(singleForm.points || '0') || 0)} min={0} onChange={(e) => {
                    const v = Math.abs(parseInt(e.target.value) || 0)
                    const sign = (parseInt(singleForm.points || '0') || 0) >= 0 ? 1 : -1
                    setSingleForm({...singleForm, points: String(v * sign)})
                  }} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-center outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                {singleForm.points && parseInt(singleForm.points || '0') !== 0 && (
                  <p className={`text-xs mt-1 ${parseInt(singleForm.points || '0') > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {parseInt(singleForm.points || '0') > 0 ? `+${singleForm.points} 积分（增加）` : `${singleForm.points} 积分（扣减）`}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">分类</label>
                <select value={singleForm.category} onChange={(e) => setSingleForm({...singleForm, category: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">年度</label>
                <select value={singleForm.year_id} onChange={(e) => setSingleForm({...singleForm, year_id: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">不关联</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">培训项目</label>
                <select value={singleForm.project_id} onChange={(e) => setSingleForm({...singleForm, project_id: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">不关联</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">小组</label>
                <select value={singleForm.group_id} onChange={(e) => setSingleForm({...singleForm, group_id: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">不关联</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">所属阶段</label>
                <select value={singleForm.phase_id} onChange={(e) => setSingleForm({...singleForm, phase_id: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">不关联</option>
                  {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">获得日期</label>
                <input type="date" value={singleForm.obtained_date} onChange={(e) => setSingleForm({...singleForm, obtained_date: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">说明</label>
                <textarea value={singleForm.description} onChange={(e) => setSingleForm({...singleForm, description: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="积分说明" />
              </div>
            </div>
            <button onClick={handleSingleSubmit} disabled={submitting} className="mt-6 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? '提交中...' : '确认录��'}
            </button>
          </div>
        )}

        {/* Batch Entry */}
        {tab === 'batch' && (
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-2 text-xs text-gray-500">学员</th>
                    <th className="px-2 py-2 text-xs text-gray-500">积分</th>
                    <th className="px-2 py-2 text-xs text-gray-500">分类</th>
                    <th className="px-2 py-2 text-xs text-gray-500">阶段</th>
                    <th className="px-2 py-2 text-xs text-gray-500">日期</th>
                    <th className="px-2 py-2 text-xs text-gray-500">说明</th>
                    <th className="px-2 py-2 text-xs text-gray-500"></th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-2 py-2">
                        <input type="text" value={row.student_name || ''} onChange={(e) => { updateBatchRow(i, 'student_name', e.target.value); const match = students.find(s => s.real_name === e.target.value); if (match) updateBatchRow(i, 'student_id', match.id) }} placeholder="输入姓名" className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" value={row.points} onChange={(e) => updateBatchRow(i, 'points', e.target.value)} className="w-20 px-2 py-1.5 border border-gray-200 rounded text-xs" />
                      </td>
                      <td className="px-2 py-2">
                        <select value={row.category} onChange={(e) => updateBatchRow(i, 'category', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs">
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select value={row.phase_id} onChange={(e) => updateBatchRow(i, 'phase_id', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs">
                          <option value="">-</option>
                          {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input type="date" value={row.obtained_date} onChange={(e) => updateBatchRow(i, 'obtained_date', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="text" value={row.description} onChange={(e) => updateBatchRow(i, 'description', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" placeholder="说明" />
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => setBatchRows(prev => prev.filter((_, idx) => idx !== i))} className="p-1 hover:bg-red-50 rounded text-red-400"><Trash2 className="w-3 h-3" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setBatchRows([...batchRows, { student_id: '', year_id: '', project_id: '', phase_id: '', points: '', category: '课程学习完成', description: '', obtained_date: new Date().toISOString().split('T')[0], group_id: '' }])} className="px-4 py-2 text-sm border border-dashed border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50">
                <Plus className="w-4 h-4 inline mr-1" /> 添加行
              </button>
              <button onClick={handleBatchSubmit} disabled={submitting} className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {submitting ? '提交中...' : '批量提交'}
              </button>
            </div>
          </div>
        )}

        {/* Excel Import */}
        {tab === 'import' && (
          <div className="p-6">
            <div
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { const ev = { target: { files: [f] } }; handleFileUpload(ev) } }}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-indigo-200 rounded-xl p-10 text-center mb-4 bg-indigo-50/30 hover:bg-indigo-50 hover:border-indigo-400 transition-colors cursor-pointer"
              onClick={() => document.getElementById('points-file-input')?.click()}
            >
              <Upload className="w-12 h-12 text-indigo-300 mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-1 font-medium">点击或拖放文件到此处上传</p>
              <p className="text-xs text-gray-400">支持 .xlsx / .csv / .json 格式</p>
              <input id="points-file-input" type="file" accept=".json,.csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
              {importFile && <p className="text-xs text-green-600 mt-2">已选择: {importFile.name}</p>}
            </div>
            <button onClick={downloadPointsTemplate} className="mb-4 flex items-center gap-1 mx-auto px-4 py-2 text-sm border border-dashed border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50"><Download className="w-4 h-4" /> 下载积分导入模版（Excel）</button>
            {importStats && (
              <div className="mb-4">
                <div className="flex items-center gap-4 text-sm mb-3">
                  <span>总计: {importStats.total}</span>
                  <span className="text-green-600">有效: {importStats.valid}</span>
                  <span className="text-red-500">无效: {importStats.invalid}</span>
                  <span className="text-yellow-500">重复: {importStats.duplicates}</span>
                </div>
                {importPreview && importPreview.length > 0 && (
                  <div className="max-h-64 overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 sticky top-0">
                          <th className="px-3 py-2 text-left text-xs text-gray-500">学员ID</th>
                          <th className="px-3 py-2 text-left text-xs text-gray-500">积分</th>
                          <th className="px-3 py-2 text-left text-xs text-gray-500">分类</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {importPreview.slice(0, 20).map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-gray-700">{r.student_id}</td>
                            <td className="px-3 py-2 text-indigo-600 font-medium">{r.points}</td>
                            <td className="px-3 py-2 text-gray-500">{r.category || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            <button onClick={handleImportConfirm} disabled={!importPreview || importPreview.length === 0 || submitting} className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? '导入中...' : `确认导入 (${importPreview?.length || 0} 条)`}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
