import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Upload, UsersRound, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import PointsPageTabs from '../../components/PointsPageTabs'
import { useAdminScope } from '../../contexts/AdminScopeContext'

const CATEGORIES = ['线上案例沟通', '线上案例输出', '阶段案例评优', '沙盘共创', '特殊调整']
const DATA_SOURCES = ['Excel导入', '系统自动', '人工核验', '问卷星', '现场记录', '其他']
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const textValue = value => String(value ?? '').trim()
const excelDate = value => {
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  const text = textValue(value).replace(/[./年]/g, '-').replace(/月/g, '-').replace(/日/g, '')
  const matched = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  return matched ? `${matched[1]}-${matched[2].padStart(2, '0')}-${matched[3].padStart(2, '0')}` : ''
}

export default function AdminTeamPoints() {
  const { yearId: scopeYearId, projectId: scopeProjectId, selectedProject } = useAdminScope()
  const [years, setYears] = useState([])
  const [projects, setProjects] = useState([])
  const [groups, setGroups] = useState([])
  const [phases, setPhases] = useState([])
  const [toast, setToast] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const [form, setForm] = useState({ year_id: '', project_id: '', phase_id: '', group_id: '', category: '线上案例沟通', item_name: '', points: '', obtained_date: today(), data_source: '单个录入', source_note: '', remark: '' })
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const visibleProjects = useMemo(() => form.year_id ? projects.filter(item => String(item.year_id) === String(form.year_id)) : projects, [form.year_id, projects])
  const visibleGroups = useMemo(() => form.project_id ? groups.filter(item => String(item.project_id) === String(form.project_id)) : [], [form.project_id, groups])
  const visiblePhases = useMemo(() => form.project_id ? phases.filter(item => String(item.project_id) === String(form.project_id)) : [], [form.project_id, phases])

  useEffect(() => {
    Promise.all([
      api.get('/api/common/years'), api.get('/api/common/projects'), api.get('/api/admin/groups'), api.get('/api/admin/phases'),
    ]).then(([yearRes, projectRes, groupRes, phaseRes]) => {
      setYears(yearRes.data.items || yearRes.data)
      setProjects(projectRes.data.items || projectRes.data)
      setGroups(groupRes.data.items || groupRes.data)
      setPhases(phaseRes.data.items || phaseRes.data)
    }).catch(() => showToast('基础数据加载失败', 'error'))
  }, [])

  useEffect(() => {
    setForm(current => ({ ...current, year_id: scopeYearId, project_id: scopeProjectId, phase_id: '', group_id: '' }))
  }, [scopeYearId, scopeProjectId])

  const changeCategory = (category) => setForm(current => ({ ...current, category }))
  const submit = async () => {
    if (!form.year_id || !form.project_id || !form.phase_id || !form.group_id || !form.item_name.trim() || !form.points) return showToast('请完整填写年度、项目、阶段、小组、积分事项和积分值', 'error')
    if (form.category === '特殊调整' && !form.remark.trim()) return showToast('特殊调整必须填写调整原因', 'error')
    setSubmitting(true)
    try {
      await api.post('/api/admin/team-points', { ...form, year_id: Number(form.year_id), project_id: Number(form.project_id), phase_id: form.phase_id ? Number(form.phase_id) : null, group_id: Number(form.group_id), points: Number(form.points), task_key: form.item_name })
      showToast('小组积分已录入，小组排名已自动更新')
      setForm(current => ({ ...current, item_name: '', source_note: '', remark: '' }))
    } catch (err) { showToast(err.response?.data?.detail || '小组积分录入失败', 'error') }
    finally { setSubmitting(false) }
  }

  const downloadTemplate = () => {
    const link = document.createElement('a')
    link.href = '/templates/优才计划团队积分批量导入模板.xlsx'
    link.download = '优才计划小组积分批量导入模板.xlsx'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const readImportFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: false })
      const sheet = workbook.Sheets['小组积分导入'] || workbook.Sheets['团队积分导入'] || workbook.Sheets[workbook.SheetNames[0]]
      const sourceRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })
      const valid = []
      const errors = []
      sourceRows.forEach((row, index) => {
        const rowNumber = index + 2
        const yearName = textValue(row['所属年度'] ?? row['年度'])
        const projectName = textValue(row['培训项目'] ?? row['项目名称'])
        const phaseName = textValue(row['所属阶段'] ?? row['阶段'])
        const groupName = textValue(row['小组名称'] ?? row['计分小组'] ?? row['小组'])
        const category = textValue(row['积分类别'])
        const itemName = textValue(row['积分事项'])
        const rawPoints = row['积分值'] ?? row['小组积分'] ?? row['团队积分']
        const points = Number(rawPoints)
        const obtainedDate = excelDate(row['获得日期'] ?? row['获得时间'])
        if (![yearName, projectName, phaseName, groupName, category, itemName, textValue(rawPoints)].some(Boolean)) return
        const year = years.find(item => textValue(item.name) === yearName)
        const project = projects.find(item => textValue(item.name) === projectName && (!year || String(item.year_id) === String(year.id)))
        const phase = phases.find(item => textValue(item.name) === phaseName && (!project || String(item.project_id) === String(project.id)))
        const group = groups.find(item => textValue(item.name) === groupName && (!project || String(item.project_id) === String(project.id)))
        const rowErrors = []
        if (!year) rowErrors.push(`年度“${yearName || '空'}”不存在`)
        if (!project) rowErrors.push(`项目“${projectName || '空'}”不存在或不属于该年度`)
        if (!phase) rowErrors.push(`阶段“${phaseName || '空'}”不存在或不属于该项目`)
        if (!group) rowErrors.push(`小组“${groupName || '空'}”不存在或不属于该项目`)
        if (!CATEGORIES.includes(category)) rowErrors.push('积分类别不符合模板选项')
        if (!itemName) rowErrors.push('积分事项不能为空')
        if (!Number.isFinite(points) || points === 0) rowErrors.push('积分值必须为非零数字')
        if (!obtainedDate) rowErrors.push('获得日期格式不正确')
        const remark = textValue(row['备注/调整原因'] ?? row['备注'] ?? row['调整原因'])
        if (category === '特殊调整' && !remark) rowErrors.push('特殊调整必须填写调整原因')
        if (rowErrors.length) errors.push({ row: rowNumber, detail: rowErrors.join('；') })
        else valid.push({
          year_id: Number(year.id), project_id: Number(project.id), phase_id: Number(phase.id), group_id: Number(group.id),
          category, item_name: itemName, task_key: itemName, points, obtained_date: obtainedDate,
          data_source: textValue(row['数据来源']) || 'Excel导入', source_note: textValue(row['来源说明']), remark,
          _row: rowNumber, _group_name: groupName, _item_name: itemName,
        })
      })
      setImportPreview({ fileName: file.name, valid, errors, total: valid.length + errors.length })
      if (!sourceRows.length) showToast('表格中没有可识别的数据', 'error')
    } catch (error) {
      showToast(`文件读取失败：${error.message}`, 'error')
    }
  }

  const confirmImport = async () => {
    if (!importPreview?.valid.length) return showToast('没有可导入的有效数据', 'error')
    setImporting(true)
    try {
      const records = importPreview.valid.map(({ _row, _group_name, _item_name, ...record }) => record)
      const { data } = await api.post('/api/admin/team-points/import', { records })
      const failed = data.errors?.length || 0
      showToast(`成功导入 ${data.created || 0} 条${failed ? `，${failed} 条未导入` : ''}`, failed ? 'error' : 'success')
      setImportPreview(null)
    } catch (error) {
      showToast(error.response?.data?.detail || '批量导入失败', 'error')
    } finally {
      setImporting(false)
    }
  }

  if (!scopeProjectId) return <AppLayout><div className="rounded-3xl border border-dashed border-indigo-200 bg-white p-16 text-center"><UsersRound className="mx-auto h-10 w-10 text-indigo-300" /><h2 className="mt-4 text-xl font-black text-slate-800">请先选择年度和培训项目</h2><p className="mt-2 text-sm text-slate-500">选择项目后才能录入小组积分。</p></div></AppLayout>

  return <AppLayout>
    <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
    <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">小组积分 · {selectedProject?.name}</h1>
        <p className="text-gray-500 mt-1">当前页面的录入和导入仅写入已选择的培训项目</p>
    </div>
    <PointsPageTabs type="team" />
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-2"><UsersRound className="w-5 h-5 text-indigo-600" /><h2 className="font-semibold">录入小组积分</h2></div>
        <div className="flex items-center gap-2">
          <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"><Download className="w-4 h-4" /> 下载批量导入模板</button>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm cursor-pointer hover:bg-emerald-700"><Upload className="w-4 h-4" /> Excel批量导入<input type="file" accept=".xlsx,.xls" onChange={readImportFile} className="hidden" /></label>
        </div>
      </div>
      <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">个人积分和小组积分均为自定义录入：管理员填写多少分，系统就按原值记录，不会再按类别或提交顺序自动改分。</div>
      <div className="grid grid-cols-4 gap-4">
        <label className="text-sm text-gray-600">年度 *<select value={form.year_id} onChange={e => setForm({ ...form, year_id: e.target.value, project_id: '', group_id: '', phase_id: '' })} className="mt-1 w-full px-3 py-2 border rounded-lg"><option value="">请选择</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
        <label className="text-sm text-gray-600">培训项目 *<select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value, group_id: '', phase_id: '' })} className="mt-1 w-full px-3 py-2 border rounded-lg"><option value="">请选择</option>{visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-sm text-gray-600">所属阶段 *<select value={form.phase_id} onChange={e => setForm({ ...form, phase_id: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg"><option value="">请选择</option>{visiblePhases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-sm text-gray-600">计分小组 *<select value={form.group_id} onChange={e => setForm({ ...form, group_id: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg"><option value="">请选择</option>{visibleGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <label className="text-sm text-gray-600">积分类别 *<select value={form.category} onChange={e => changeCategory(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="text-sm text-gray-600">积分事项 *<input value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })} placeholder="例如：第一阶段案例沟通提交" className="mt-1 w-full px-3 py-2 border rounded-lg" /></label>
        <label className="text-sm text-gray-600">积分值 *<input type="number" step="1" value={form.points} onChange={e => setForm({ ...form, points: e.target.value })} placeholder="自定义填写，如 10 或 -5" className="mt-1 w-full px-3 py-2 border rounded-lg" /><span className="mt-1 block text-xs text-gray-400">按填写值原样记录，负数表示扣减</span></label>
        <label className="text-sm text-gray-600">获得时间 *<input type="date" value={form.obtained_date} onChange={e => setForm({ ...form, obtained_date: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg" /></label>
        <label className="text-sm text-gray-600">数据来源<select value={form.data_source} onChange={e => setForm({ ...form, data_source: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg"><option>单个录入</option>{DATA_SOURCES.map(source => <option key={source}>{source}</option>)}</select></label>
        <label className="text-sm text-gray-600">来源说明<input value={form.source_note} onChange={e => setForm({ ...form, source_note: e.target.value })} placeholder="例如：问卷星提交时间" className="mt-1 w-full px-3 py-2 border rounded-lg" /></label>
        <label className="text-sm text-gray-600 col-span-2">备注 / 调整原因<textarea value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} rows={2} className="mt-1 w-full px-3 py-2 border rounded-lg" /></label>
      </div>
      <div className="mt-5 flex justify-end"><button disabled={submitting} onClick={submit} className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{submitting ? '录入中…' : '确认录入小组积分'}</button></div>
    </div>
    {importPreview && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div><h2 className="font-semibold flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /> 小组积分导入预览</h2><p className="text-xs text-gray-500 mt-1">{importPreview.fileName}</p></div>
          <button onClick={() => setImportPreview(null)} className="p-1.5 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto">
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">识别总数</p><p className="text-xl font-bold mt-1">{importPreview.total}</p></div>
            <div className="rounded-lg bg-green-50 p-3"><p className="text-xs text-green-600">可导入</p><p className="text-xl font-bold text-green-700 mt-1">{importPreview.valid.length}</p></div>
            <div className="rounded-lg bg-red-50 p-3"><p className="text-xs text-red-600">需修正</p><p className="text-xl font-bold text-red-700 mt-1">{importPreview.errors.length}</p></div>
          </div>
          {!!importPreview.valid.length && <div className="mb-5"><h3 className="text-sm font-medium mb-2">有效数据（前10条）</h3><div className="border rounded-lg divide-y text-sm">{importPreview.valid.slice(0, 10).map(row => <div key={row._row} className="px-3 py-2 flex justify-between gap-4"><span>第{row._row}行 · {row._group_name} · {row._item_name}</span><span className="font-semibold text-green-600">{row.points > 0 ? '+' : ''}{row.points}</span></div>)}</div></div>}
          {!!importPreview.errors.length && <div><h3 className="text-sm font-medium text-red-600 mb-2">需要修正</h3><div className="border border-red-100 rounded-lg divide-y divide-red-100 text-sm max-h-48 overflow-y-auto">{importPreview.errors.map(item => <div key={item.row} className="px-3 py-2"><span className="font-medium">第{item.row}行：</span>{item.detail}</div>)}</div></div>}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3"><button onClick={() => setImportPreview(null)} className="px-4 py-2 rounded-lg border text-sm">取消</button><button disabled={importing || !importPreview.valid.length} onClick={confirmImport} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50">{importing ? '导入中…' : `确认导入 ${importPreview.valid.length} 条`}</button></div>
      </div>
    </div>}
  </AppLayout>
}
