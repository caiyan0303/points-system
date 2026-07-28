import { useEffect, useMemo, useState } from 'react'
import { Trash2, UsersRound } from 'lucide-react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'

const CATEGORIES = ['线上案例沟通', '线上案例输出', '阶段案例评优', '沙盘共创', '特殊调整']
const POINT_OPTIONS = {
  线上案例沟通: [20, 15, 10],
  线上案例输出: [20, 15, 10],
  阶段案例评优: [20],
  沙盘共创: [50, 40, 30, 20, 10],
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export default function AdminTeamPoints() {
  const [years, setYears] = useState([])
  const [projects, setProjects] = useState([])
  const [groups, setGroups] = useState([])
  const [phases, setPhases] = useState([])
  const [records, setRecords] = useState([])
  const [toast, setToast] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ year_id: '', project_id: '', phase_id: '', group_id: '', category: '线上案例沟通', item_name: '', points: '20', obtained_date: today(), data_source: '单个录入', source_note: '', remark: '' })
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const visibleProjects = useMemo(() => form.year_id ? projects.filter(item => String(item.year_id) === String(form.year_id)) : projects, [form.year_id, projects])
  const visibleGroups = useMemo(() => form.project_id ? groups.filter(item => String(item.project_id) === String(form.project_id)) : [], [form.project_id, groups])
  const visiblePhases = useMemo(() => form.project_id ? phases.filter(item => String(item.project_id) === String(form.project_id)) : [], [form.project_id, phases])

  const loadRecords = () => api.get('/api/admin/team-points', { params: { page_size: 100 } }).then(({ data }) => setRecords(data.items || []))
  useEffect(() => {
    Promise.all([
      api.get('/api/common/years'), api.get('/api/common/projects'), api.get('/api/admin/groups'), api.get('/api/admin/phases'),
    ]).then(([yearRes, projectRes, groupRes, phaseRes]) => {
      setYears(yearRes.data.items || yearRes.data)
      setProjects(projectRes.data.items || projectRes.data)
      setGroups(groupRes.data.items || groupRes.data)
      setPhases(phaseRes.data.items || phaseRes.data)
    }).catch(() => showToast('基础数据加载失败', 'error'))
    loadRecords().catch(() => showToast('团队积分流水加载失败', 'error'))
  }, [])

  const changeCategory = (category) => setForm(current => ({ ...current, category, points: category === '特殊调整' ? '' : String(POINT_OPTIONS[category][0]) }))
  const submit = async () => {
    if (!form.year_id || !form.project_id || !form.phase_id || !form.group_id || !form.item_name.trim() || !form.points) return showToast('请完整填写年度、项目、阶段、小组、积分事项和积分值', 'error')
    if (form.category === '特殊调整' && !form.remark.trim()) return showToast('特殊调整必须填写调整原因', 'error')
    setSubmitting(true)
    try {
      await api.post('/api/admin/team-points', { ...form, year_id: Number(form.year_id), project_id: Number(form.project_id), phase_id: form.phase_id ? Number(form.phase_id) : null, group_id: Number(form.group_id), points: Number(form.points), task_key: form.item_name })
      showToast('团队积分已录入，小组排名已自动更新')
      setForm(current => ({ ...current, item_name: '', source_note: '', remark: '' }))
      await loadRecords()
    } catch (err) { showToast(err.response?.data?.detail || '团队积分录入失败', 'error') }
    finally { setSubmitting(false) }
  }
  const remove = async (record) => {
    if (!confirm(`确定删除“${record.group_name}”的团队积分“${record.item_name}”吗？`)) return
    try { await api.delete(`/api/admin/team-points/${record.id}`); showToast('团队积分已删除，排名已自动重算'); await loadRecords() }
    catch (err) { showToast(err.response?.data?.detail || '删除失败', 'error') }
  }

  return <AppLayout>
    <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-gray-900">团队积分</h1>
      <p className="text-gray-500 mt-1">团队积分只进入小组账户；团队最终得分＝成员个人积分合计＋团队积分</p>
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center gap-2 mb-5"><UsersRound className="w-5 h-5 text-indigo-600" /><h2 className="font-semibold">录入团队积分</h2></div>
      {['线上案例沟通', '线上案例输出'].includes(form.category) && <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">系统会按相同“积分事项”的有效录入顺序自动计分：前2组20分、第3—4组15分、后续按时完成10分。</div>}
      <div className="grid grid-cols-4 gap-4">
        <label className="text-sm text-gray-600">年度 *<select value={form.year_id} onChange={e => setForm({ ...form, year_id: e.target.value, project_id: '', group_id: '', phase_id: '' })} className="mt-1 w-full px-3 py-2 border rounded-lg"><option value="">请选择</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
        <label className="text-sm text-gray-600">培训项目 *<select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value, group_id: '', phase_id: '' })} className="mt-1 w-full px-3 py-2 border rounded-lg"><option value="">请选择</option>{visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-sm text-gray-600">所属阶段 *<select value={form.phase_id} onChange={e => setForm({ ...form, phase_id: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg"><option value="">请选择</option>{visiblePhases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-sm text-gray-600">计分小组 *<select value={form.group_id} onChange={e => setForm({ ...form, group_id: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg"><option value="">请选择</option>{visibleGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <label className="text-sm text-gray-600">积分类别 *<select value={form.category} onChange={e => changeCategory(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="text-sm text-gray-600">积分事项 *<input value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })} placeholder="例如：第一阶段案例沟通提交" className="mt-1 w-full px-3 py-2 border rounded-lg" /></label>
        <label className="text-sm text-gray-600">积分值 *{form.category === '特殊调整' ? <input type="number" value={form.points} onChange={e => setForm({ ...form, points: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg" /> : <select value={form.points} onChange={e => setForm({ ...form, points: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg">{POINT_OPTIONS[form.category].map(v => <option key={v} value={v}>{v} 分</option>)}</select>}</label>
        <label className="text-sm text-gray-600">获得时间 *<input type="date" value={form.obtained_date} onChange={e => setForm({ ...form, obtained_date: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg" /></label>
        <label className="text-sm text-gray-600">数据来源<select value={form.data_source} onChange={e => setForm({ ...form, data_source: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg"><option>单个录入</option><option>Excel导入</option><option>系统自动</option><option>人工核验</option></select></label>
        <label className="text-sm text-gray-600">来源说明<input value={form.source_note} onChange={e => setForm({ ...form, source_note: e.target.value })} placeholder="例如：问卷星提交时间" className="mt-1 w-full px-3 py-2 border rounded-lg" /></label>
        <label className="text-sm text-gray-600 col-span-2">备注 / 调整原因<textarea value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} rows={2} className="mt-1 w-full px-3 py-2 border rounded-lg" /></label>
      </div>
      <div className="mt-5 flex justify-end"><button disabled={submitting} onClick={submit} className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{submitting ? '录入中…' : '确认录入团队积分'}</button></div>
    </div>
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b"><h2 className="font-semibold">团队积分流水</h2></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-4 py-3 text-left">小组</th><th className="px-4 py-3 text-left">项目 / 阶段</th><th className="px-4 py-3 text-left">分类</th><th className="px-4 py-3 text-left">积分事项</th><th className="px-4 py-3 text-right">团队积分</th><th className="px-4 py-3 text-left">获得时间</th><th className="px-4 py-3 text-center">操作</th></tr></thead>
        <tbody className="divide-y">{records.map(r => <tr key={r.id}><td className="px-4 py-3 font-medium">{r.group_name}</td><td className="px-4 py-3 text-gray-500">{r.project_name || '-'} / {r.phase_name || '项目级'}</td><td className="px-4 py-3">{r.category}</td><td className="px-4 py-3">{r.item_name}</td><td className={`px-4 py-3 text-right font-semibold ${Number(r.points) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{Number(r.points) > 0 ? '+' : ''}{r.points}</td><td className="px-4 py-3 text-gray-500">{r.obtained_date?.slice(0, 10)}</td><td className="px-4 py-3 text-center"><button onClick={() => remove(r)} className="p-1.5 rounded bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button></td></tr>)}</tbody>
      </table>{!records.length && <p className="py-10 text-center text-sm text-gray-400">暂无团队积分记录</p>}</div>
    </div>
  </AppLayout>
}
