import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { Plus, Upload, X, Trash2, Download, MessageCircle, Send, CheckCircle2 } from 'lucide-react'
import * as XLSX from 'xlsx'

const CATEGORIES = [
  '线上学习', '学习输出', '问卷及测评反馈', '线下出勤',
  '课堂互动', '结营任务', '小组长职责', '特殊调整'
]

const beijingToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

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
    points: '', category: '线上学习', item_name: '', description: '', source_note: '', obtained_date: beijingToday()
  })
  const [smartText, setSmartText] = useState('')
  const [smartPreview, setSmartPreview] = useState(null)
  const [smartError, setSmartError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Batch entry
  const [batchRows, setBatchRows] = useState([{ student_id: '', year_id: '', project_id: '', phase_id: '', points: '', category: '线上学习', description: '', obtained_date: beijingToday(), group_id: '' }])

  // Excel import
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importStats, setImportStats] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    const loadStudents = async () => {
      const { data: firstPage } = await api.get('/api/admin/students', { params: { page: 1, page_size: 100 } })
      if (!firstPage.items || firstPage.total_pages <= 1) return setStudents(firstPage.items || firstPage)
      const remainingPages = await Promise.all(
        Array.from({ length: firstPage.total_pages - 1 }, (_, index) => (
          api.get('/api/admin/students', { params: { page: index + 2, page_size: 100 } })
        ))
      )
      setStudents([firstPage, ...remainingPages.map(response => response.data)].flatMap(page => page.items || page))
    }
    loadStudents().catch(() => showToast('学员数据加载失败', 'error'))
    api.get('/api/common/years').then(({ data }) => setYears(data.items || data))
    api.get('/api/common/projects').then(({ data }) => setProjects(data.items || data))
    api.get('/api/admin/groups').then(({ data }) => setGroups(data.items || data))
    api.get('/api/admin/phases').then(({ data }) => setPhases(data.items || data))
  }, [])

  const handleSingleSubmit = async () => {
    if (!singleForm.student_id || !singleForm.phase_id || !singleForm.points || !singleForm.item_name.trim()) return showToast('请选择学员和所属阶段，并填写积分事项和积分值', 'error')
    if (singleForm.category === '特殊调整' && !singleForm.description.trim()) return showToast('特殊调整必须填写调整原因', 'error')
    setSubmitting(true)
    try {
      const payload = {
        student_id: parseInt(singleForm.student_id),
        points: parseInt(singleForm.points),
        category: singleForm.category,
        item_name: singleForm.item_name,
        task_key: singleForm.item_name,
        description: singleForm.description,
        source_note: singleForm.source_note,
        obtained_date: singleForm.obtained_date,
      }
      if (singleForm.phase_id) payload.phase_id = parseInt(singleForm.phase_id)
      if (singleForm.year_id) payload.year_id = parseInt(singleForm.year_id)
      if (singleForm.project_id) payload.project_id = parseInt(singleForm.project_id)
      if (singleForm.group_id) payload.group_id = parseInt(singleForm.group_id)
      await api.post('/api/admin/points', payload)
      showToast(`${singleForm.points} 积分已录入`)
      setSingleForm({ student_id: '', year_id: '', project_id: '', group_id: '', phase_id: '', points: '', category: '线上学习', item_name: '', description: '', source_note: '', obtained_date: beijingToday() })
    } catch (err) { showToast(err.response?.data?.detail || '录入失败', 'error') }
    finally { setSubmitting(false) }
  }

  const parseSmartEntry = () => {
    const text = smartText.trim()
    setSmartPreview(null)
    setSmartError('')
    if (!text) return setSmartError('请输入要录入的积分内容')

    const pointMatch = text.match(/([+＋\-－]\s*\d+)\s*分?/)
    const points = pointMatch ? parseInt(pointMatch[1].replace('＋', '+').replace('－', '-').replace(/\s/g, '')) : 0

    const namedStudents = students
      .filter(student => student.real_name && text.includes(student.real_name))
      .sort((a, b) => b.real_name.length - a.real_name.length)
    const longestStudentName = namedStudents[0]?.real_name
    const studentMatches = namedStudents.filter(student => student.real_name === longestStudentName)
    const student = studentMatches.length === 1 ? studentMatches[0] : null
    const today = beijingToday()
    const isCurrentProject = project => (
      project.status === 'active'
      && (!project.start_date || project.start_date.slice(0, 10) <= today)
      && (!project.end_date || project.end_date.slice(0, 10) >= today)
    )
    const isCurrentPhase = phase => (
      phase.status === '进行中'
      || (phase.start_date?.slice(0, 10) <= today && phase.end_date?.slice(0, 10) >= today)
    )

    const mentionedYear = years.find(year => year.name && (
      text.includes(year.name) || text.includes(year.name.replace(/年度$/, ''))
    ))
    let projectMatches = projects
      .filter(project => project.name && text.includes(project.name))
      .sort((a, b) => b.name.length - a.name.length)
    const longestProjectName = projectMatches[0]?.name
    projectMatches = projectMatches.filter(project => (
      project.name === longestProjectName && (!mentionedYear || String(project.year_id) === String(mentionedYear.id))
    ))
    if (projectMatches.length > 1) {
      const activeMatches = projectMatches.filter(project => project.status === 'active')
      if (activeMatches.length === 1) projectMatches = activeMatches
    }
    if (projectMatches.length === 0 && student?.project_id) {
      const assignedProject = projects.find(project => String(project.id) === String(student.project_id) && isCurrentProject(project))
      if (assignedProject) projectMatches = [assignedProject]
    }
    const project = projectMatches.length === 1 ? projectMatches[0] : null

    const phaseCandidates = phases.filter(phase => !project || String(phase.project_id) === String(project.id))
    const phaseWasMentioned = /第[一二三四五六七八九十百0-9]+阶段/.test(text)
    let phaseMatches = phaseCandidates.filter(phase => {
      const shortName = phase.name?.match(/第[一二三四五六七八九十百0-9]+阶段/)?.[0]
      return phase.name && (text.includes(phase.name) || (shortName && text.includes(shortName)))
    })
    if (phaseMatches.length === 0 && project && !phaseWasMentioned) phaseMatches = phaseCandidates.filter(isCurrentPhase)
    const phase = phaseMatches.length === 1 ? phaseMatches[0] : null

    const category = CATEGORIES.find(item => text.includes(item))
    const year = years.find(item => String(item.id) === String(mentionedYear?.id || student?.year_id || project?.year_id))
    const errors = []
    if (studentMatches.length === 0) errors.push('未识别到学员姓名')
    if (studentMatches.length > 1) errors.push(`存在多位“${longestStudentName}”，请补充邮箱后使用批量或 Excel 录入`)
    if (projectMatches.length === 0) errors.push('该学员未关联当前进行中的培训项目')
    if (projectMatches.length > 1) errors.push('存在同名培训项目，请在语句中补充所属年度')
    if (project && !year) errors.push('未找到项目所属年度')
    if (!phase) errors.push('该项目当前没有唯一的进行中阶段，请检查阶段起止时间')
    if (!category) errors.push(`未识别到积分类别，请使用：${CATEGORIES.join('、')}`)
    if (!points) errors.push('未识别到加减分数，请使用“+5分”或“-5分”')
    if (errors.length) return setSmartError(errors.join('；'))

    setSmartPreview({
      student_id: student.id,
      student_name: student.real_name,
      year_id: year?.id,
      year_name: year?.name || '未关联年度',
      project_id: project.id,
      project_name: project.name,
      phase_id: phase.id,
      phase_name: phase.name,
      points,
      category,
      description: text,
      obtained_date: beijingToday(),
    })
  }

  const confirmSmartEntry = async () => {
    if (!smartPreview) return
    setSubmitting(true)
    try {
      await api.post('/api/admin/points', {
        student_id: smartPreview.student_id,
        year_id: smartPreview.year_id,
        project_id: smartPreview.project_id,
        phase_id: smartPreview.phase_id,
        points: smartPreview.points,
        category: smartPreview.category,
        item_name: smartPreview.description,
        task_key: smartPreview.description,
        description: smartPreview.description,
        obtained_date: smartPreview.obtained_date,
      })
      showToast(`已为${smartPreview.student_name}${smartPreview.points > 0 ? '+' : ''}${smartPreview.points}分`)
      setSmartText('')
      setSmartPreview(null)
    } catch (err) {
      showToast(err.response?.data?.detail || '积分录入失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBatchSubmit = async () => {
    const validRows = batchRows.filter(r => r.student_id && r.points)
    if (validRows.length === 0) return showToast('请完善积分信息', 'error')
    setSubmitting(true)
    try {
      const results = await Promise.allSettled(validRows.map(r => {
        const student = students.find(item => String(item.id) === String(r.student_id))
        const today = beijingToday()
        const project = projects.find(item => (
          String(item.id) === String(student?.project_id)
          && item.status === 'active'
          && (!item.start_date || item.start_date.slice(0, 10) <= today)
          && (!item.end_date || item.end_date.slice(0, 10) >= today)
        ))
        const currentPhases = phases.filter(item => (
          String(item.project_id) === String(project?.id)
          && (item.status === '进行中' || (item.start_date?.slice(0, 10) <= today && item.end_date?.slice(0, 10) >= today))
        ))
        const phase = r.phase_id
          ? phases.find(item => String(item.id) === String(r.phase_id) && String(item.project_id) === String(project?.id))
          : currentPhases.length === 1 ? currentPhases[0] : null
        if (!student?.year_id || !project || !phase) return Promise.reject(new Error('无法自动识别学员的当前项目或阶段'))
        const group = groups.find(item => item.name === student.group_name && String(item.project_id) === String(project.id))
        const payload = {
          student_id: parseInt(r.student_id),
          year_id: student.year_id,
          project_id: project.id,
          phase_id: phase.id,
          points: parseInt(r.points),
          category: r.category,
          item_name: r.description || r.category,
          task_key: r.description || r.category,
          description: r.description,
          obtained_date: r.obtained_date,
        }
        if (group) payload.group_id = group.id
        return api.post('/api/admin/points', payload)
      }))
      const succeeded = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length
      showToast(`成功录入 ${succeeded} 条${failed > 0 ? `，${failed} 条失败` : ''}`, failed > 0 ? 'error' : 'success')
      setBatchRows([{ student_id: '', year_id: '', project_id: '', phase_id: '', points: '', category: '线上学习', description: '', obtained_date: beijingToday(), group_id: '' }])
    } catch (err) { showToast('批量录入失败', 'error') }
    finally { setSubmitting(false) }
  }

  // 下载积分导入模板
  const downloadPointsTemplate = () => {
    const link = document.createElement('a')
    link.href = '/templates/优才计划积分批量导入模板_可打开版.xlsx'
    link.download = '优才计划积分批量导入模板_可打开版.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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
        const ws = wb.Sheets['积分导入明细'] || wb.Sheets[wb.SheetNames[0]]
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
      const clean = value => String(value ?? '').trim()
      const normalizeRow = row => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [clean(key).replace(/\s+/g, ''), value])
      )
      const getValue = (row, ...keys) => {
        for (const key of keys) {
          if (row[key] !== undefined && clean(row[key]) !== '') return row[key]
        }
        return ''
      }
      const formatDate = value => {
        if (typeof value === 'number') {
          const date = XLSX.SSF.parse_date_code(value)
          if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
        }
        return clean(value)
      }
      const today = beijingToday()
      const isCurrentProject = project => (
        project.status === 'active'
        && (!project.start_date || project.start_date.slice(0, 10) <= today)
        && (!project.end_date || project.end_date.slice(0, 10) >= today)
      )
      const isCurrentPhase = phase => (
        phase.status === '进行中'
        || (phase.start_date?.slice(0, 10) <= today && phase.end_date?.slice(0, 10) >= today)
      )

      const mapped = data.map((source, index) => {
        const row = normalizeRow(source)
        const studentName = clean(getValue(row, '姓名', '学员姓名', 'student_name', 'real_name'))
        const studentEmail = clean(getValue(row, '邮箱', 'email'))
        const requestedStudentId = parseInt(getValue(row, '学员ID', 'student_id'))
        let student = Number.isInteger(requestedStudentId) ? students.find(item => String(item.id) === String(requestedStudentId)) : null
        if (!student && studentEmail) student = students.find(item => clean(item.email).toLowerCase() === studentEmail.toLowerCase())
        if (!student && studentName) {
          const matches = students.filter(item => clean(item.real_name) === studentName || clean(item.username) === studentName)
          if (matches.length === 1) student = matches[0]
        }

        const yearName = clean(getValue(row, '所属年度', '年度', 'year_name'))
        const requestedYearId = parseInt(getValue(row, '年度ID', 'year_id'))
        let year = Number.isInteger(requestedYearId)
          ? years.find(item => String(item.id) === String(requestedYearId))
          : yearName
            ? years.find(item => clean(item.name).replace(/年度$/, '') === yearName.replace(/年度$/, ''))
            : years.find(item => String(item.id) === String(student?.year_id))

        const projectName = clean(getValue(row, '培训项目', '项目名称', 'project_name'))
        const requestedProjectId = parseInt(getValue(row, '项目ID', 'project_id'))
        let project = Number.isInteger(requestedProjectId)
          ? projects.find(item => String(item.id) === String(requestedProjectId))
          : projectName
            ? projects.find(item => clean(item.name) === projectName && (!year || String(item.year_id) === String(year.id)))
            : projects.find(item => String(item.id) === String(student?.project_id) && isCurrentProject(item))
        if (!year && project) year = years.find(item => String(item.id) === String(project.year_id))

        const phaseName = clean(getValue(row, '培训阶段', '阶段名称', 'phase_name'))
        const requestedPhaseId = parseInt(getValue(row, '阶段ID', 'phase_id'))
        let phase = Number.isInteger(requestedPhaseId)
          ? phases.find(item => String(item.id) === String(requestedPhaseId))
          : phaseName
            ? phases.find(item => {
              const systemName = clean(item.name)
              const shortName = systemName.match(/第[一二三四五六七八九十百0-9]+阶段/)?.[0]
              return (systemName === phaseName || shortName === phaseName) && (!project || String(item.project_id) === String(project.id))
            })
            : null
        if (!phase && !phaseName && project) {
          const currentPhases = phases.filter(item => String(item.project_id) === String(project.id) && isCurrentPhase(item))
          if (currentPhases.length === 1) phase = currentPhases[0]
        }

        const groupName = clean(getValue(row, '所属小组', '小组名称', 'group_name'))
        const requestedGroupId = parseInt(getValue(row, '小组ID', 'group_id'))
        const group = Number.isInteger(requestedGroupId)
          ? groups.find(item => String(item.id) === String(requestedGroupId))
          : groups.find(item => clean(item.name) === (groupName || clean(student?.group_name)) && (!project || String(item.project_id) === String(project.id)))

        const recordNumber = clean(getValue(row, '记录编号', 'record_number'))
        const points = Number(getValue(row, '积分值', '积分数值', '积分', 'points'))
        const pointCategory = clean(getValue(row, '积分类别', '积分分类', 'category'))
        const item = clean(getValue(row, '积分事项', 'description'))
        const taskName = clean(getValue(row, '任务名称', 'task_name'))
        const completionLevel = clean(getValue(row, '完成档位', 'completion_level'))
        const dataSource = clean(getValue(row, '数据来源', 'source'))
        const evidence = clean(getValue(row, '证明材料/链接', '证明材料', 'evidence'))
        const note = clean(getValue(row, '备注', 'note'))
        const obtainedDate = formatDate(getValue(row, '获得日期', '日期', 'obtained_date'))
        const errors = []
        if (!recordNumber) errors.push('缺少记录编号')
        if (!studentName) errors.push('缺少姓名')
        if (!studentEmail) errors.push('缺少邮箱')
        if (!student) errors.push('未匹配到学员')
        if (student && studentName && clean(student.real_name) !== studentName) errors.push('姓名与邮箱对应的学员不一致')
        if (student?.year_id && year && student.year_id !== year.id) errors.push('填写年度与学员所属年度不一致')
        if (student?.project_id && project && student.project_id !== project.id) errors.push('填写项目与学员所属项目不一致')
        if (!year) errors.push('未匹配到年度')
        if (!project) errors.push('未识别到学员当前进行中的培训项目')
        if (!phase) errors.push('未识别到项目当前进行中的唯一阶段')
        if (!Number.isFinite(points) || points === 0) errors.push('积分数值无效')
        if (!pointCategory || !CATEGORIES.includes(pointCategory)) errors.push('积分类别不在模板标准选项中')
        if (!item) errors.push('缺少积分事项')
        if (!taskName) errors.push('缺少任务名称')
        if (!dataSource) errors.push('缺少数据来源')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(obtainedDate)) errors.push('获得日期格式应为 YYYY-MM-DD')
        if (groupName && !group) errors.push('未匹配到所属小组')

        return {
          record_number: recordNumber,
          student_id: student?.id,
          student_name: student?.real_name || studentName,
          year_id: year?.id,
          project_id: project?.id,
          phase_id: phase?.id || null,
          group_id: group?.id || null,
          points,
          category: pointCategory,
          item_name: item,
          task_key: taskName || item,
          data_source: dataSource || 'Excel导入',
          source_note: evidence,
          description: [
            completionLevel && `完成档位：${completionLevel}`,
            note && `备注：${note}`,
          ].filter(Boolean).join('；'),
          obtained_date: obtainedDate,
          _row: index + 2,
          _errors: errors,
        }
      })
      const recordNumberCounts = mapped.reduce((counts, row) => {
        if (row.record_number) counts[row.record_number] = (counts[row.record_number] || 0) + 1
        return counts
      }, {})
      mapped.forEach(row => {
        if (row.record_number && recordNumberCounts[row.record_number] > 1) row._errors.push('记录编号在文件内重复')
      })
      const valid = mapped.filter(row => row._errors.length === 0)
      const invalidRows = mapped.filter(row => row._errors.length > 0)
      const duplicates = mapped.filter(row => row._errors.includes('记录编号在文件内重复')).length
      setImportPreview(valid)
      setImportStats({
        total: data.length,
        valid: valid.length,
        invalid: invalidRows.length,
        duplicates,
        errors: invalidRows.slice(0, 10).map(row => `第 ${row._row} 行：${row._errors.join('、')}`),
      })
    } catch (err) { showToast('文件解析失败: ' + err.message, 'error') }
  }

  const handleImportConfirm = async () => {
    if (!importPreview || importPreview.length === 0) return
    setSubmitting(true)
    try {
      const records = importPreview.map(r => {
        const record = {
          record_number: r.record_number,
          student_id: parseInt(r.student_id),
          points: parseInt(r.points),
          category: r.category || '线上学习',
          item_name: r.item_name || r.description || r.category || '积分任务',
          task_key: r.task_key || r.item_name || r.description || r.category || '积分任务',
          description: r.description || '',
          data_source: r.data_source || 'Excel导入',
          source_note: r.source_note || '',
          obtained_date: r.obtained_date || beijingToday(),
          year_id: parseInt(r.year_id),
          project_id: parseInt(r.project_id),
        }
        if (r.phase_id) record.phase_id = parseInt(r.phase_id)
        if (r.group_id) record.group_id = parseInt(r.group_id)
        return record
      })
      const { data } = await api.post('/api/admin/points/import', { records })
      const duplicates = data.preview?.duplicate_count || 0
      showToast(`${data.message}${duplicates ? `，跳过 ${duplicates} 条重复编号` : ''}`)
      setImportFile(null)
      setImportPreview(null)
      setImportStats(null)
    } catch (err) { showToast(err.response?.data?.detail || '导入失败', 'error') }
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
            { key: 'single', label: '对话录入' },
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
            <div className="max-w-3xl">
              <div className="flex items-start gap-3 mb-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3 text-sm text-gray-700">
                  告诉我要给谁、哪类积分以及加减多少分，例如：<br />
                  <span className="font-medium text-indigo-700">张三线上学习+5分</span>
                  <span className="mt-1 block text-xs text-gray-500">系统会根据学员归属和今天的日期自动识别年度、项目与当前阶段。</span>
                </div>
              </div>

              <div className="ml-12 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
                <textarea
                  value={smartText}
                  onChange={(event) => { setSmartText(event.target.value); setSmartError(''); setSmartPreview(null) }}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') parseSmartEntry()
                  }}
                  rows={3}
                  className="w-full resize-none border-0 px-1 py-1 text-sm text-gray-800 outline-none"
                  placeholder="请输入积分指令……"
                />
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="text-xs text-gray-400">按 Ctrl + Enter 解析</span>
                  <button onClick={parseSmartEntry} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                    <Send className="h-4 w-4" /> 解析内容
                  </button>
                </div>
              </div>

              {smartError && (
                <div className="ml-12 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{smartError}</div>
              )}

              {smartPreview && (
                <div className="ml-12 mt-4 overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/40">
                  <div className="flex items-center gap-2 border-b border-indigo-100 px-4 py-3 text-sm font-medium text-indigo-700">
                    <CheckCircle2 className="h-4 w-4" /> 已识别，请确认
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm md:grid-cols-3">
                    <div><p className="text-xs text-gray-400">学员</p><p className="mt-1 font-medium text-gray-800">{smartPreview.student_name}</p></div>
                    <div><p className="text-xs text-gray-400">积分</p><p className={`mt-1 font-semibold ${smartPreview.points > 0 ? 'text-green-600' : 'text-red-500'}`}>{smartPreview.points > 0 ? '+' : ''}{smartPreview.points} 分</p></div>
                    <div><p className="text-xs text-gray-400">分类</p><p className="mt-1 font-medium text-gray-800">{smartPreview.category}</p></div>
                    <div><p className="text-xs text-gray-400">年度</p><p className="mt-1 font-medium text-gray-800">{smartPreview.year_name}</p></div>
                    <div><p className="text-xs text-gray-400">培训项目</p><p className="mt-1 font-medium text-gray-800">{smartPreview.project_name}</p></div>
                    <div><p className="text-xs text-gray-400">培训阶段</p><p className="mt-1 font-medium text-gray-800">{smartPreview.phase_name}</p></div>
                  </div>
                  <div className="flex justify-end gap-2 border-t border-indigo-100 bg-white px-4 py-3">
                    <button onClick={() => setSmartPreview(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">重新输入</button>
                    <button onClick={confirmSmartEntry} disabled={submitting} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                      {submitting ? '录入中...' : '确认录入'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden grid-cols-2 gap-4 max-w-2xl">
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
                {singleForm.student_id && <p className="text-xs text-green-600 mt-1">已选择: {students.find(s => String(s.id) === String(singleForm.student_id))?.real_name}</p>}
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
                {singleForm.category === '课堂互动' && <p className="text-xs text-indigo-500 mt-1">扑克牌：A=1，J=11，Q=12，K=13，小王=15，大王=20；同一场每人最多2次。</p>}
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
                <label className="block text-sm text-gray-600 mb-1">所属阶段 *</label>
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
                <label className="block text-sm text-gray-600 mb-1">积分事项 *</label>
                <input value={singleForm.item_name} onChange={(e) => setSingleForm({...singleForm, item_name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="例如：第一阶段《管理沟通》线上课程" />
                <p className="text-xs text-gray-400 mt-1">同一积分事项、同一学员只计一次；课堂互动同一场最多计2次。</p>
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">备注 / 调整原因</label>
                <textarea value={singleForm.description} onChange={(e) => setSingleForm({...singleForm, description: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder={singleForm.category === '特殊调整' ? '特殊调整必须填写原因' : '可填写计分依据或补充说明'} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">数据来源说明</label>
                <input value={singleForm.source_note} onChange={(e) => setSingleForm({...singleForm, source_note: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="例如：学习平台导出、签到表、现场记录" />
              </div>
            </div>
            <button onClick={handleSingleSubmit} disabled={submitting} className="hidden mt-6 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
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
              <button onClick={() => setBatchRows([...batchRows, { student_id: '', year_id: '', project_id: '', phase_id: '', points: '', category: '线上学习', description: '', obtained_date: beijingToday(), group_id: '' }])} className="px-4 py-2 text-sm border border-dashed border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50">
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
                {importStats.errors?.length > 0 && (
                  <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 space-y-1">
                    {importStats.errors.map(error => <p key={error}>{error}</p>)}
                  </div>
                )}
                {importPreview && importPreview.length > 0 && (
                  <div className="max-h-64 overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 sticky top-0">
                          <th className="px-3 py-2 text-left text-xs text-gray-500">记录编号</th>
                          <th className="px-3 py-2 text-left text-xs text-gray-500">学员</th>
                          <th className="px-3 py-2 text-left text-xs text-gray-500">积分</th>
                          <th className="px-3 py-2 text-left text-xs text-gray-500">分类</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {importPreview.slice(0, 20).map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.record_number}</td>
                            <td className="px-3 py-2 text-gray-700">{r.student_name}</td>
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
