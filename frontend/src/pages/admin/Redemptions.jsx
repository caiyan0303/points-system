import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Pagination from '../../components/Pagination'
import Toast from '../../components/Toast'
import { X, Package, Search } from 'lucide-react'

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
  '待审核': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  '已通过': 'bg-blue-50 text-blue-700 border-blue-200',
  '已拒绝': 'bg-red-50 text-red-600 border-red-200',
  '已发货': 'bg-purple-50 text-purple-700 border-purple-200',
  '已领取': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '已取消': 'bg-gray-100 text-gray-600 border-gray-200',
  '已完成': 'bg-green-50 text-green-700 border-green-200',
}

const LEGACY_STATUS = { '待发货': '已通过', '待领取': '已发货' }
const normalizeStatus = (value) => LEGACY_STATUS[value] || value

export default function AdminRedemptions() {
  const [redemptions, setRedemptions] = useState([])
  const [status, setStatus] = useState('')
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)

  // Action modals
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [shipModal, setShipModal] = useState(null)
  const [shipForm, setShipForm] = useState({ express_company: '', tracking_number: '' })

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchRedemptions = () => {
    setLoading(true)
    const params = { page, page_size: 20 }
    if (status) params.status = status
    if (searchKeyword) params.keyword = searchKeyword
    api.get('/api/admin/redemptions', { params })
      .then(({ data }) => { setRedemptions(data.items || data); setTotalPages(data.total_pages || 1); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => { fetchRedemptions() }, [page, status, searchKeyword])

  const updateStatus = async (id, nextStatus, extra = {}) => {
    setUpdatingId(id)
    try {
      await api.put(`/api/admin/redemptions/${id}/status`, { status: nextStatus, ...extra })
      showToast(`兑换状态已更新为${nextStatus}`)
      fetchRedemptions()
      return true
    } catch (err) {
      showToast(err.response?.data?.detail || '操作失败', 'error')
      return false
    } finally {
      setUpdatingId(null)
    }
  }

  const handleStatusChange = (redemption, nextStatus) => {
    if (normalizeStatus(redemption.status) === nextStatus) return
    if (nextStatus === '已拒绝') {
      setRejectModal(redemption.id)
      setRejectReason('')
      return
    }
    if (nextStatus === '已发货') {
      setShipModal(redemption.id)
      setShipForm({ express_company: redemption.express_company || '', tracking_number: redemption.tracking_number || '' })
      return
    }
    updateStatus(redemption.id, nextStatus)
  }

  const handleReject = async () => {
    const updated = await updateStatus(rejectModal, '已拒绝', { reject_reason: rejectReason })
    if (updated) {
      setRejectModal(null)
      setRejectReason('')
    }
  }

  const handleShip = async () => {
    const updated = await updateStatus(shipModal, '已发货', shipForm)
    if (updated) {
      setShipModal(null)
      setShipForm({ express_company: '', tracking_number: '' })
    }
  }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">兑换审核</h1>
        <p className="text-gray-500 mt-1">审核学员的兑换申请</p>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STATUSES.map(s => (
            <button
              key={s.key}
              onClick={() => { setStatus(s.key); setPage(1) }}
              className={`px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                status === s.key ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >{s.label}</button>
          ))}
        </div>
        <form
          className="relative w-full lg:w-72"
          onSubmit={(event) => { event.preventDefault(); setSearchKeyword(keyword.trim()); setPage(1) }}
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索学员姓名"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : error ? (
          <div className="flex h-48 items-center justify-center text-red-400">{error}</div>
        ) : redemptions.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-gray-400">暂无兑换记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                <tr>
                  <th className="px-4 py-3">申请编号</th>
                  <th className="px-4 py-3">学员</th>
                  <th className="px-4 py-3">兑换物品</th>
                  <th className="px-4 py-3">消耗积分</th>
                  <th className="px-4 py-3">申请时间</th>
                  <th className="px-4 py-3">配送/备注</th>
                  <th className="px-4 py-3">审核状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {redemptions.map((r) => {
                  const currentStatus = normalizeStatus(r.status)
                  return (
                    <tr key={r.id} className="align-middle transition-colors hover:bg-gray-50/70">
                      <td className="px-4 py-4 text-xs font-medium text-gray-500">#{r.id}</td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">{r.student_name || r.real_name}</div>
                        {r.address_snapshot && <div className="mt-1 max-w-48 truncate text-xs text-gray-400" title={r.address_snapshot}>{r.address_snapshot}</div>}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                            {r.product_image_url ? <img src={r.product_image_url} alt={r.product_name} className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-gray-400" />}
                          </div>
                          <span className="max-w-44 text-sm font-medium text-gray-800">{r.product_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-indigo-600">{r.points_spent ?? r.points}</td>
                      <td className="px-4 py-4 text-xs text-gray-500">{r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : '-'}</td>
                      <td className="px-4 py-4 text-xs text-gray-500">
                        {r.express_company ? <div>{r.express_company} · {r.tracking_number || '未填单号'}</div> : <div className="text-gray-400">暂无配送信息</div>}
                        {currentStatus === '已拒绝' && r.reject_reason && <div className="mt-1 max-w-48 truncate text-red-500" title={r.reject_reason}>拒绝：{r.reject_reason}</div>}
                        {r.remark && <div className="mt-1 max-w-48 truncate" title={r.remark}>备注：{r.remark}</div>}
                      </td>
                      <td className="px-4 py-4">
                        <select
                          value={currentStatus}
                          onChange={(event) => handleStatusChange(r, event.target.value)}
                          disabled={updatingId === r.id}
                          className={`min-w-28 rounded-lg border px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-wait disabled:opacity-60 ${STATUS_COLORS[currentStatus] || 'border-gray-200 bg-gray-50 text-gray-600'}`}
                          aria-label={`修改${r.student_name || '学员'}的兑换状态`}
                        >
                          {STATUSES.filter(item => item.key).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
