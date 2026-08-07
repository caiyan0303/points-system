import { useEffect, useState } from 'react'
import { BookOpen, CalendarDays } from 'lucide-react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { sanitizeRuleHtml } from '../../utils/sanitizeRuleHtml'

export default function StudentRuleText() {
  const [rule, setRule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/api/student/rule-text')
      .then(({ data }) => setRule((data || [])[0] || null))
      .catch((requestError) => setError(requestError.response?.data?.detail || '积分规则加载失败'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl">
        <section className="mb-6 overflow-hidden rounded-[28px] bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-500 px-7 py-8 text-white shadow-xl shadow-indigo-200/60 md:px-10">
          <div className="flex items-center gap-3"><span className="rounded-2xl bg-white/15 p-3 backdrop-blur"><BookOpen className="h-6 w-6" /></span><div><p className="text-xs font-bold tracking-[0.24em] text-indigo-100">POINTS GUIDE</p><h1 className="mt-1 text-3xl font-black">{rule?.title || '积分规则'}</h1></div></div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-indigo-100">了解积分获取、排名与兑换规则，让每一次学习和小组协作都有清晰记录。</p>
        </section>

        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-3xl bg-white/70"><div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-100 border-b-indigo-600" /></div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-100 bg-rose-50 p-8 text-center text-rose-500">{error}</div>
        ) : !rule ? (
          <div className="rounded-3xl border border-white/80 bg-white/70 p-12 text-center text-slate-400">管理员暂未发布积分规则</div>
        ) : (
          <article className="rounded-[28px] border border-white/90 bg-white/80 px-6 py-8 shadow-xl shadow-indigo-100/50 backdrop-blur-xl md:px-12 md:py-10">
            {rule.updated_at && <div className="mb-7 flex items-center gap-2 border-b border-slate-100 pb-5 text-xs text-slate-400"><CalendarDays className="h-4 w-4" />最近更新：{new Date(rule.updated_at).toLocaleString('zh-CN')}</div>}
            <div className="rule-content" dangerouslySetInnerHTML={{ __html: sanitizeRuleHtml(rule.content) }} />
          </article>
        )}
      </div>
    </AppLayout>
  )
}
