import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { FileText } from 'lucide-react'

export default function StudentRuleText() {
  const [texts, setTexts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/api/student/rule-text')
      .then(({ data }) => { setTexts(data || []); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-gray-400">{error}</div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">积分规则说明</h1>
        <p className="text-gray-500 mt-1">查看积分获取与扣减规则</p>
      </div>

      {texts.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400">暂无规则说明</div>
      ) : (
        <div className="space-y-4">
          {texts.map(rt => (
            <div key={rt.id} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-gray-900">{rt.title}</h2>
                <span className="text-xs text-gray-400 ml-auto">{rt.updated_at?.slice(0,10)}</span>
              </div>
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans bg-gray-50 p-4 rounded-lg">{rt.content}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  )
}
