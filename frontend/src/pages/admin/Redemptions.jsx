import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Pagination from '../../components/Pagination'
import Toast from '../../components/Toast'
import { X, Check, Ban, Truck, UserCheck, Package } from 'lucide-react'

const STATUSES = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'shipped', label: '已发货' },
  { key: 'received', label: '已领取' },
  { key: 'cancelled', label: '已取消' },
  { key: 'completed', label: '已完成' },
]

const STATUS_COLORS = {
  pending: 'bg-yellow-50 text-yellow-600',
  approved: 'bg-blue-50 text-blue-600',
  rejected: 'bg-red-50 text-red-500',
  shipped: 'bg-purple-50 text-purple-600',
  received: 'bg-green-50 text-green-600',
  cancelled: 'bg-gray-100 text-gray-500',
  completed: 'bg-green-50 text-green-600',
}

const STATUS_LABEL = {
  pending: '待审核', approved: '已通过', rejected: '已拒绝',
  shipped: '已发货', received: '已领取', cancelled: '已取消', completed: '已完成'
}

export default function AdminRedemptions() {
  const [redemptions, setRedemptions] = useState([])
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // Action modals
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [shipModal, setShipModal] = useState(null)
  const [shipForm, setShipForm] = useState({ express_company: '', tracking_number: '' })

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchRedemptions = () => {
    setLoading(true)
    const params = { page, page_size: 12 }
    if (status) params.status = status
    api.get('/api/admin/redemptions', { params })
      .then(({ data }) => { setRedemptions(data.items || data); setTotalPages(data.total_pages || 1); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => { fetchRedemptions() }, [page, status])

  const handleApprove = async (id) => {
    try {
      await api.put(`/api/admin/redemptions/${id}/approve`)
      showToast('兑换申请已通过')
      fetchRedemptions()
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const handleReject = async () => {
    try {
      await api.put(`/api/admin/redemptions/${rejectModal}/reject`, { reject_reason: rejectReason })
      showToast('兑换申请已拒绝')
      setRejectModal(null)
      setRejectReason('')
      fetchRedemptions()
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const handleShip = async () => {
    try {
      await api.put(`/api/admin/redemptions/${shipModal}/ship`, shipForm)
      showToast('已标记发货')
      setShipModal(null)
      setShipForm({ express_company: '', tracking_number: '' })
      fetchRedemptions()
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const handleMarkReceived = async (id) => {
    try {
      await api.put(`/api/admin/redemptions/${id}/receive`)
      showToast('已标记领取')
      fetchRedemptions()
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">兑换审核</h1>
        <p className="text-gray-500 mt-1">审核学员的兑换申请</p>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
        {STATUSES.map(s => (
          <button
            key={s.key}
            onClick={() => { setStatus(s.key); setPage(1) }}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              status === s.key ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >{s.label}</button>
        ))}
      </div>

      {/* Redemption Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : error ? (
          <div className="col-span-full flex items-center justify-center h-48 text-red-400">{error}</div>
        ) : redemptions.length === 0 ? (
          <div className="col-span-full flex items-center justify-center h-48 text-gray-400">暂无兑换记录</div>
        ) : (
          redemptions.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.student_name || r.real_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.product_name}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABEL[r.status] || r.status}
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
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>快递</span>
                    <span>{r.express_company} - {r.tracking_number}</span>
                  </div>
                )}
                {r.address_snapshot && (
                  <div className="text-xs text-gray-400 bg-gray-50 p-2 rounded mt-1">收件地址: {r.address_snapshot}</div>
                )}
                {r.reject_reason && (
                  <div className="text-xs text-red-500 bg-red-50 p-2 rounded mt-1">拒绝原因: {r.reject_reason}</div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                {r.status === 'pending' && (
                  <>
                    <button onClick={() => handleApprove(r.id)} className="flex-1 py-1.5 text-xs font-medium bg-green-50 text-green-600 rounded-lg hover:bg-green-100 flex items-center justify-center gap-1">
                      <Check className="w-3 h-3" /> 通过
                    </button>
                    <button onClick={() => setRejectModal(r.id)} className="flex-1 py-1.5 text-xs font-medium bg-red-50 text-red-500 rounded-lg hover:bg-red-100 flex items-center justify-center gap-1">
                      <Ban className="w-3 h-3" /> 拒绝
                    </button>
                  </>
                )}
                {r.status === 'approved' && (
                  <button onClick={() => setShipModal(r.id)} className="flex-1 py-1.5 text-xs font-medium bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 flex items-center justify-center gap-1">
                    <Truck className="w-3 h-3" /> 发货
                  </button>
                )}
                {r.status === 'shipped' && (
                  <button onClick={() => handleMarkReceived(r.id)} className="flex-1 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1">
                    <UserCheck className="w-3 h-3" /> 标记已领取
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">拒绝兑换申请</h3>
              <button onClick={() => setRejectModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">拒绝原因</label>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="请输入拒绝原因" />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setRejectModal(null)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleReject} className="flex-1 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700">确认拒绝</button>
            </div>
          </div>
        </div>
      )}

      {/* Ship Modal */}
      {shipModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">发货信息</h3>
              <button onClick={() => setShipModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">快递公司</label>
                <input type="text" value={shipForm.express_company} onChange={(e) => setShipForm({...shipForm, express_company: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="如: 顺丰快递" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">快递单号</label>
                <input type="text" value={shipForm.tracking_number} onChange={(e) => setShipForm({...shipForm, tracking_number: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="请输入快递单号" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShipModal(null)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleShip} className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">确认发货</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
