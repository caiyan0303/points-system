import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { Plus, X, Edit, Upload, FileText, Trash2 } from 'lucide-react'

const PERSONAL_CATEGORIES = ['线上学习', '学习输出', '问卷及测评反馈', '线下出勤', '课堂互动', '结营任务', '小组长职责', '特殊调整']
const TEAM_CATEGORIES = ['线上案例沟通', '线上案例输出', '阶段案例评优', '沙盘共创', '特殊调整']

export default function AdminPointRules() {
  const [rules, setRules] = useState([])
  const [projects, setProjects] = useState([])
  const [phases, setPhases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [editModal, setEditModal] = useState(null)

  const defaultForm = {
    account_type: '个人', category: '线上学习', rule_name: '', default_points: '', max_points: '',
    applicable_projects: [], applicable_phases: [], allow_repeat: false,
    count_in_period: true, count_in_available: true, need_approval: false, description: '', scoring_standard: ''
  }
  const [form, setForm] = useState(defaultForm)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchRules = () => {
    setLoading(true)
    api.get('/api/admin/point-rules')
      .then(({ data }) => { setRules(data.items || data); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => {
    fetchRuleTexts()
  }, [])

  useEffect(() => {
    fetchRules()
    api.get('/api/common/projects').then(({ data }) => setProjects(data.items || data))
    api.get('/api/admin/phases').then(({ data }) => setPhases(data.items || data))
  }, [])

  const openCreate = () => {
    setEditModal('create')
    setForm(defaultForm)
  }

  const openEdit = (rule) => {
    setEditModal('edit')
    setForm({
      account_type: rule.account_type || '个人',
      category: rule.category || '线上学习',
      rule_name: rule.rule_name || rule.name || '',
      default_points: rule.default_points || '',
      max_points: rule.max_points || '',
      applicable_projects: rule.applicable_projects || [],
      applicable_phases: rule.applicable_phases || [],
      allow_repeat: rule.allow_repeat || false,
      count_in_period: rule.count_in_period !== false,
      count_in_available: rule.count_in_available !== false,
      need_approval: rule.need_approval || false,
      description: rule.description || '',
      scoring_standard: rule.scoring_standard || '',
      id: rule.id,
    })
  }

  const handleSave = async () => {
    try {
      if (editModal === 'create') {
        await api.post('/api/admin/point-rules', form)
        showToast('规则创建成功')
      } else {
        await api.put(`/api/admin/point-rules/${form.id}`, form)
        showToast('规则更新成功')
      }
      setEditModal(null)
      fetchRules()
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const [showTextModal, setShowTextModal] = useState(false)
  const [ruleTexts, setRuleTexts] = useState([])
  const [textForm, setTextForm] = useState({ title: '', content: '' })

  const fetchRuleTexts = () => {
    api.get('/api/admin/rule-text').then(({ data }) => setRuleTexts(data || [])).catch(() => {})
  }

  const handleUploadText = async () => {
    if (!textForm.content.trim()) return showToast('内容不能为空', 'error')
    try {
      await api.post('/api/admin/rule-text', textForm)
      showToast('规则文本已上传')
      setShowTextModal(false); setTextForm({ title: '', content: '' })
      fetchRuleTexts()
    } catch (err) { showToast(err.response?.data?.detail || '上传失败', 'error') }
  }

  const handleDeleteText = async (id) => {
    if (!confirm('确定删除此规则文本？')) return
    try { await api.delete('/api/admin/rule-text/' + id); showToast('已删除'); fetchRuleTexts() }
    catch (err) { showToast('删除失败', 'error') }
  }

  const toggleMultiSelect = (field, value) => {
    setForm(f => ({
      ...f,
      [field]: f[field].includes(value)
        ? f[field].filter(v => v !== value)
        : [...f[field], value]
    }))
  }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">积分规则</h1>
          <p className="text-gray-500 mt-1">管理积分获取规则</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTextModal(true)} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Upload className="w-4 h-4" /> 上传规则文本
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> 新增规则
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-48 text-red-400">{error}</div>
        ) : rules.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400">暂无规则</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">计分对象</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">分类</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">规则名称</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">默认积分</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">上限</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">适用项目</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">适用阶段</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">可重复</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full ${r.account_type === '团队' ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-indigo-600'}`}>{r.account_type === '团队' ? '小组' : r.account_type || '个人'}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.category || '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.rule_name || r.name}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-indigo-600 text-right">{r.default_points || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">{r.max_points || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.applicable_projects?.join(', ') || '全部'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.applicable_phases?.join(', ') || '全部'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.allow_repeat ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        {r.allow_repeat ? '是' : '否'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => openEdit(r)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
                        <Edit className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editModal === 'create' ? '新增规则' : '编辑规则'}</h3>
              <button onClick={() => setEditModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">计分对象</label>
                <select value={form.account_type} onChange={(e) => setForm({...form, account_type: e.target.value, category: e.target.value === '团队' ? '线上案例沟通' : '线上学习', count_in_available: e.target.value !== '团队'})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option value="个人">个人积分</option><option value="团队">小组积分</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">分类</label>
                <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  {(form.account_type === '团队' ? TEAM_CATEGORIES : PERSONAL_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">规则名称 *</label>
                <input type="text" value={form.rule_name} onChange={(e) => setForm({...form, rule_name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">默认积分</label>
                  <input type="number" value={form.default_points} onChange={(e) => setForm({...form, default_points: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">积分上限</label>
                  <input type="number" value={form.max_points} onChange={(e) => setForm({...form, max_points: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">适用项目</label>
                <div className="flex flex-wrap gap-1">
                  {projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => toggleMultiSelect('applicable_projects', p.id)}
                      className={`px-2 py-1 text-xs rounded-full ${form.applicable_projects.includes(p.id) ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}
                    >{p.name}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">适用阶段</label>
                <div className="flex flex-wrap gap-1">
                  {phases.map(p => (
                    <button
                      key={p.id}
                      onClick={() => toggleMultiSelect('applicable_phases', p.id)}
                      className={`px-2 py-1 text-xs rounded-full ${form.applicable_phases.includes(p.id) ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}
                    >{p.name}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.allow_repeat} onChange={(e) => setForm({...form, allow_repeat: e.target.checked})} className="rounded" />
                  允许重复获取
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.count_in_period} onChange={(e) => setForm({...form, count_in_period: e.target.checked})} className="rounded" />
                  计入本期积分
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={form.account_type === '团队'} checked={form.account_type === '团队' ? false : form.count_in_available} onChange={(e) => setForm({...form, count_in_available: e.target.checked})} className="rounded" />
                  计入可兑换积分（小组积分不可兑换）
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.need_approval} onChange={(e) => setForm({...form, need_approval: e.target.checked})} className="rounded" />
                  需要审批
                </label>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">积分标准</label>
                <textarea value={form.scoring_standard} onChange={(e) => setForm({...form, scoring_standard: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">描述</label>
                <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditModal(null)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleSave} className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">保存</button>
            </div>
          </div>
        </div>
      )}
          {/* Rule Text Upload Modal */}
      {showTextModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">上传规则文本</h3><button onClick={() => setShowTextModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="space-y-4">
              <div><label className="block text-sm text-gray-600 mb-1">标题</label><input type="text" value={textForm.title} onChange={(e) => setTextForm({...textForm, title: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="如：2026年度积分规则说明" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">规则内容（支持文本粘贴或上传.txt文件）</label>
                <textarea value={textForm.content} onChange={(e) => setTextForm({...textForm, content: e.target.value})} rows={8} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono" placeholder="粘贴规则文本内容..." />
                <label className="mt-2 flex items-center gap-1 text-xs text-indigo-600 cursor-pointer"><Upload className="w-3 h-3" /> 从.txt文件导入
                  <input type="file" accept=".txt" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => setTextForm({...textForm, content: ev.target.result, title: textForm.title || f.name.replace('.txt','')}); r.readAsText(f) }} />
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-6"><button onClick={() => setShowTextModal(false)} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">取消</button><button onClick={handleUploadText} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">上传</button></div>
          </div>
        </div>
      )}

      {/* Existing Rule Texts */}
      {ruleTexts.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">已上传的规则文本</h3>
          <div className="space-y-2">
            {ruleTexts.map(rt => (
              <div key={rt.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /><div><p className="text-sm font-medium text-gray-900">{rt.title}</p><p className="text-xs text-gray-400">{rt.updated_at?.slice(0,10)}</p></div></div>
                <button onClick={() => handleDeleteText(rt.id)} className="px-2 py-1 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

</AppLayout>
  )
}
