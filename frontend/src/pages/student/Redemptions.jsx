import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Pagination from '../../components/Pagination'
import Toast from '../../components/Toast'
import { ArrowLeft, Gift, Package, Truck } from 'lucide-react'

const STATUSES = [
  { key: '', label: '全部' },
  { key: '待审核', label: '待审核' },
  { key: '已通过', label: '已通过' },
  { key: '已取消', label: '已取消' },
]

const STATUS_COLORS = {
  待审核: 'bg-amber-50 text-amber-600 ring-amber-100',
  已通过: 'bg-blue-50 text-blue-600 ring-blue-100',
  已拒绝: 'bg-rose-50 text-rose-500 ring-rose-100',
  已发货: 'bg-violet-50 text-violet-600 ring-violet-100',
  已领取: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  已取消: 'bg-slate-100 text-slate-500 ring-slate-200',
  已完成: 'bg-green-50 text-green-600 ring-green-100',
}

const LEGACY_STATUS = { 待发货: '已通过', 待领取: '已发货' }
const normalizeStatus = (value) => LEGACY_STATUS[value] || value
const dateText = (value) => value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'

export default function StudentRedemptions() {
  const [redemptions, setRedemptions] = useState([])
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [cancelId, setCancelId] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchRedemptions = () => {
    setLoading(true)
    const params = { page, page_size: 10 }
    if (status) params.status = status
    api.get('/api/student/redemptions', { params })
      .then(({ data }) => {
        setRedemptions(data.items || data || [])
        setTotalPages(data.total_pages || 1)
        setError(null)
      })
      .catch((err) => setError(err.response?.data?.detail || '兑换记录加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(fetchRedemptions, [status, page])

  const handleCancel = async (id) => {
    try {
      await api.put(`/api/student/redemptions/${id}/cancel`)
      showToast('兑换已取消，可用积分和库存已返还')
      setCancelId(null)
      fetchRedemptions()
    } catch (err) {
      showToast(err.response?.data?.detail || '操作失败', 'error')
    }
  }

  return <AppLayout>
    <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
    <section className="relative mb-6 overflow-hidden rounded-[32px] bg-gradient-to-br from-indigo-700 via-violet-600 to-blue-500 p-7 text-white shadow-2xl shadow-indigo-300/30">
      <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.2em] text-indigo-100">Redemption History</p><h1 className="mt-2 text-3xl font-black">兑换记录</h1><p className="mt-2 text-sm text-indigo-100">查看你的兑换订单、积分消耗与审核状态</p></div><Link to="/student/shop" className="inline-flex w-fit items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-xs font-black text-indigo-700 shadow-lg"><ArrowLeft className="h-4 w-4" />返回积分商城</Link></div>
    </section>

    <div className="mb-5 flex flex-wrap gap-2">{STATUSES.map((item) => <button type="button" key={item.key} onClick={() => { setPage(1); setStatus(item.key) }} className={`rounded-xl px-5 py-2.5 text-xs font-black transition ${status === item.key ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'glass-chip text-slate-500 hover:text-indigo-600'}`}>{item.label}</button>)}</div>

    <section className="glass-panel overflow-hidden rounded-[28px] border shadow-xl shadow-indigo-100/30">
      {loading ? <div className="flex h-64 items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-2 border-indigo-200 border-b-indigo-600" /></div> : error ? <div className="p-16 text-center text-rose-500">{error}</div> : redemptions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b border-indigo-50 bg-white/50 text-left text-xs text-slate-400"><tr><th className="px-6 py-4">商品名称</th><th className="px-4 py-4 text-right">消耗积分</th><th className="px-4 py-4">兑换时间</th><th className="px-4 py-4">状态</th><th className="px-6 py-4 text-right">操作</th></tr></thead><tbody className="divide-y divide-white/70">{redemptions.map((record) => {
        const currentStatus = normalizeStatus(record.status)
        return <tr key={record.id} className="transition hover:bg-white/45"><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100">{record.image_url ? <img src={record.image_url} alt={record.product_name} className="h-full w-full object-cover" /> : <Gift className="h-6 w-6 text-indigo-300" />}</div><div><p className="font-black text-slate-800">{record.product_name || '-'}</p><p className="mt-1 text-[10px] text-slate-400">兑换编号 #{record.id}</p></div></div></td><td className="px-4 py-4 text-right font-black text-indigo-600">{record.points_spent || record.points || 0} 分</td><td className="px-4 py-4 text-xs text-slate-500">{dateText(record.created_at)}</td><td className="px-4 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black ring-1 ${STATUS_COLORS[currentStatus] || 'bg-slate-100 text-slate-500 ring-slate-200'}`}>{currentStatus || '待更新'}</span>{currentStatus === '已发货' && <p className="mt-2 flex items-center gap-1 text-[10px] text-violet-500"><Truck className="h-3 w-3" />请注意查收</p>}{currentStatus === '已拒绝' && record.reject_reason && <p className="mt-2 max-w-56 text-[10px] text-rose-500">{record.reject_reason}</p>}</td><td className="px-6 py-4 text-right">{currentStatus === '待审核' ? <button type="button" onClick={() => setCancelId(record.id)} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-black text-rose-500 transition hover:bg-rose-50">取消兑换</button> : record.tracking_number ? <div className="text-xs text-slate-500"><p>{record.express_company || '快递配送'}</p><p className="mt-1 text-[10px] text-slate-400">{record.tracking_number}</p></div> : <span className="text-xs text-slate-300">—</span>}</td></tr>
      })}</tbody></table></div> : <div className="flex h-64 flex-col items-center justify-center text-slate-400"><Package className="mb-3 h-11 w-11 text-indigo-200" /><p className="font-bold">暂无兑换记录</p><Link to="/student/shop" className="mt-4 text-xs font-black text-indigo-600">去积分商城看看</Link></div>}
      <div className="border-t border-white/70 p-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
    </section>

    {cancelId && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCancelId(null) }}><section role="dialog" aria-modal="true" aria-labelledby="cancel-redemption-title" className="w-full max-w-sm rounded-[26px] bg-white p-6 shadow-2xl"><h2 id="cancel-redemption-title" className="text-xl font-black text-slate-900">取消兑换</h2><p className="mt-2 text-sm leading-6 text-slate-500">确定取消这笔兑换申请吗？取消后锁定的积分和商品库存将自动返还。</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => setCancelId(null)} className="rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-500">返回</button><button type="button" onClick={() => handleCancel(cancelId)} className="rounded-xl bg-rose-500 py-3 text-sm font-black text-white shadow-lg shadow-rose-200">确认取消</button></div></section></div>}
  </AppLayout>
}
