import { useEffect, useMemo, useState } from 'react'
import { Eye, Save, ScrollText, Sparkles } from 'lucide-react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import RichTextEditor from '../../components/RichTextEditor'
import Toast from '../../components/Toast'
import { sanitizeRuleHtml } from '../../utils/sanitizeRuleHtml'

export default function AdminPointRules() {
  const [title, setTitle] = useState('优才项目积分规则')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [toast, setToast] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 3200)
  }

  useEffect(() => {
    api.get('/api/admin/rule-text')
      .then(({ data }) => {
        const current = (data || [])[0]
        setTitle(current?.title || '优才项目积分规则')
        setContent(sanitizeRuleHtml(current?.content || ''))
        setUpdatedAt(current?.updated_at || null)
      })
      .catch((error) => showToast(error.response?.data?.detail || '积分规则加载失败', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const safeContent = useMemo(() => sanitizeRuleHtml(content), [content])
  const plainText = useMemo(() => {
    const holder = document.createElement('div')
    holder.innerHTML = safeContent
    return holder.textContent?.trim() || ''
  }, [safeContent])

  const save = async () => {
    if (!title.trim()) return showToast('请填写规则标题', 'error')
    if (!plainText && !safeContent.includes('<img')) return showToast('请输入积分规则内容', 'error')
    setSaving(true)
    try {
      const { data } = await api.put('/api/admin/rule-text', { title: title.trim(), content: safeContent })
      setContent(safeContent)
      setUpdatedAt(data.updated_at)
      showToast('已保存，并同步到学员端')
    } catch (error) {
      showToast(error.response?.data?.detail || '保存失败，请稍后重试', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.22em] text-indigo-500">
            <Sparkles className="h-4 w-4" /> RULE CONTENT
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">积分规则编辑</h1>
          <p className="mt-2 text-sm text-slate-500">像编辑文档一样输入文字、颜色、图片和表格，保存后学员端立即同步。</p>
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && <span className="hidden text-xs text-slate-400 lg:inline">最近保存：{new Date(updatedAt).toLocaleString('zh-CN')}</span>}
          <button onClick={() => setPreview(true)} className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600">
            <Eye className="h-4 w-4" /> 学员端预览
          </button>
          <button disabled={saving || loading} onClick={save} className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">
            <Save className="h-4 w-4" /> {saving ? '保存中…' : '保存并同步'}
          </button>
        </div>
      </div>

      <section className="mb-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-indigo-600 p-2 text-white"><ScrollText className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">规则标题</label>
            <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} className="w-full border-0 bg-transparent p-0 text-xl font-black text-slate-900 outline-none placeholder:text-slate-300" placeholder="请输入积分规则标题" />
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex h-96 items-center justify-center rounded-2xl border border-slate-200 bg-white"><div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-100 border-b-indigo-600" /></div>
      ) : (
        <RichTextEditor value={content} onChange={setContent} onError={(message) => showToast(message, 'error')} />
      )}

      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-400">
        <span>支持 JPG、PNG、WebP 图片；单张原图不超过 8MB，插入时会自动压缩。</span>
        <span>当前正文约 {plainText.length} 字</span>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={() => setPreview(false)}>
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/80 bg-[#f8faff] p-3 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 mb-3 flex items-center justify-between rounded-2xl bg-white/90 px-5 py-4 backdrop-blur-xl">
              <div><p className="text-xs font-bold tracking-widest text-indigo-500">学员端预览</p><h2 className="mt-1 text-xl font-black text-slate-900">{title}</h2></div>
              <button onClick={() => setPreview(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">关闭</button>
            </div>
            <article className="rule-content rounded-2xl bg-white px-6 py-7 md:px-10" dangerouslySetInnerHTML={{ __html: safeContent }} />
          </div>
        </div>
      )}
    </AppLayout>
  )
}
