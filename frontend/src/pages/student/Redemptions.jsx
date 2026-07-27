import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { Package, Truck } from 'lucide-react'

const STATUSES = [
  { key: '', label: '全部' },
  { key: '待审核', label: '待审核' },
  { key: '已通过', label: '已通过' },
  { key: '已拒绝', label: '已拒绝' },
  { key: '已发货', label: '已发货' },
  { key: '已领取', label: '已领取' },
  { key: '已取消', label: '已取消' },
  { key: '已完成', label: '已完成' },
]

const STATUS_COLORS = {
  '待审核': 'bg-yellow-50 text-yellow-600',
  '已通过': 'bg-blue-50 text-blue-600',
  '已拒绝': 'bg-red-50 text-red-500',
  '已发货': 'bg-purple-50 text-purple-600',
  '已领取': 'bg-emerald-50 text-emerald-600',
  '已取消': 'bg-gray-100 text-gray-500',
  '已完成': 'bg-green-50 text-green-600',
}

const LEGACY_STATUS = { '待发货': '已通过', '待领取': '已发货' }
const normalizeStatus = (value) => LEGACY_STATUS[value] || value

export default function StudentRedemptions() {
  const [redemptions, setRedemptions] = useState([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [cancelId, setCancelId] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchRedemptions = () => {
    setLoading(true)
    const params = {}
    if (status) params.status = status
    api.get('/api/student/redemptions', { params })
      .then(({ data }) => { setRedemptions(data.items || data); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => { fetchRedemptions() }, [status])

  const handleCancel = async (id) => {
    try {
      await api.put(`/api/student/redemptions/${id}/cancel`)
      showToast('兑换已取消')
      setCancelId(null)
      fetchRedemptions()
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">兑换记录</h1>
        <p className="text-gray-500 mt-1">查看我的兑换历史</p>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
        {STATUSES.map(s => (
          <button
            key={s.key}
            onClick={() => setStatus(s.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              status === s.key ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >{s.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48 text-red-400">{error}</div>
      ) : redemptions.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400">暂无兑换记录</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {redemptions.map((r) => {
            const currentStatus = normalizeStatus(r.status)
            return <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-gray-400" />
                    <p className="text-sm font-medium text-gray-900">{r.product_name || '-'}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[currentStatus] || 'bg-gray-100 text-gray-500'}`}>
                  {currentStatus}
                </span>
              </div>
              <div className="space-y-1 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-500">消耗积分</span>
                  <span className="font-semibold text-indigo-600">{r.points_spent || r.points}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{new Date(r.created_at).toLocaleString('zh-CN')}</span>
                </div>
                {r.express_company && (
                  <div className="p-2 bg-gray-50 rounded text-xs mt-2">
                    <span className="text-gray-500">快递: </span>
                    <span>{r.express_company}</span>
                    {r.tracking_number && <span className="text-gray-400 ml-2">({r.tracking_number})</span>}
                  </div>
                )}
                {currentStatus === '已拒绝' && r.reject_reason && (
                  <div className="p-2 bg-red-50 rounded text-xs text-red-500 mt-2">
                    拒绝原因: {r.reject_reason}
                  </div>
                )}
              </div>
              {currentStatus === '待审核' && (
                <button
                  onClick={() => setCancelId(r.id)}
                  className="w-full py-2 text-sm font-medium border border-red-200 text-red-500 rounded-lg hover:bg-red-50"
                >取消兑换</button>
              )}
              {currentStatus === '已发货' && (
                <div className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">
                  <Truck className="w-3 h-3" /> 已发货，请注意查收
                </div>
              )}
            </div>
          })}
        </div>
      )}

      {/* Cancel Confirmation */}
      {cancelId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold mb-2">取消兑换</h3>
            <p className="text-sm text-gray-500">确定要取消此兑换申请吗？</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setCancelId(null)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">返回</button>
              <button onClick={() => handleCancel(cancelId)} className="flex-1 py-2.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600">确认取消</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
