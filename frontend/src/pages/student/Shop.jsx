import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { X, Clock, ScrollText, Gift, History, ShoppingBag, Sparkles } from 'lucide-react'

export default function StudentShop() {
  const [products, setProducts] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [redeemModal, setRedeemModal] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [category, setCategory] = useState('全部商品')

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    api.get('/api/student/products')
      .then(({ data }) => { setProducts(data.items || data); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
    api.get('/api/student/dashboard')
      .then(({ data }) => setStats(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!imagePreview) return
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setImagePreview(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [imagePreview])

  const handleRedeem = async () => {
    setProcessing(true)
    try {
      await api.post('/api/student/redemptions', { product_id: redeemModal.id })
      showToast('兑换申请已提交，请等待审核')
      setRedeemModal(null)
      // Refresh
      api.get('/api/student/products').then(({ data }) => setProducts(data.items || data))
      api.get('/api/student/dashboard').then(({ data }) => setStats(data))
    } catch (err) { showToast(err.response?.data?.detail || '兑换失败', 'error') }
    finally { setProcessing(false) }
  }

  const getButtonState = (p) => {
    if (p.product_status === 'offline') return { text: '已下架', disabled: true, color: 'bg-gray-100 text-gray-400' }
    if (p.product_status === 'sold_out' || p.available_stock <= 0) return { text: '已售罄', disabled: true, color: 'bg-gray-100 text-gray-400' }
    if (p.is_not_yet) return { text: '暂未开放', disabled: true, color: 'bg-gray-100 text-gray-400' }
    const avail = stats?.available_points || 0
    if (avail < p.points_required) return { text: '积分不足', disabled: true, color: 'bg-gray-100 text-gray-400' }
    if (p.limit_reached) return { text: '已达限兑', disabled: true, color: 'bg-gray-100 text-gray-400' }
    return { text: '立即兑换', disabled: false, color: 'bg-indigo-600 text-white hover:bg-indigo-700' }
  }

  const categories = ['全部商品', ...Array.from(new Set(products.map((item) => item.category).filter(Boolean)))]
  const filteredProducts = category === '全部商品' ? products : products.filter((item) => item.category === category)
  const cumulativePoints = Number(stats?.personal_cumulative_points ?? stats?.total_earned ?? stats?.period_points ?? 0)
  const usedPoints = Math.max(0, cumulativePoints - Number(stats?.available_points || 0))

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="mb-7"><p className="text-xs font-bold uppercase tracking-[.22em] text-violet-500">Rewards Mall</p><h1 className="mt-2 text-3xl font-black text-slate-900">积分商城</h1><p className="mt-2 text-sm text-slate-500">让积分从数字转化为真实的成长奖励</p></div>
      <section className="relative mb-6 overflow-hidden rounded-[30px] bg-gradient-to-br from-fuchsia-500 via-violet-600 to-indigo-700 p-7 text-white shadow-2xl shadow-violet-400/25"><div className="absolute -right-12 -top-16 h-64 w-64 rounded-full bg-white/20 blur-2xl" /><div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold"><Sparkles className="h-3.5 w-3.5 text-amber-200" />我的积分价值</div><p className="text-sm text-violet-100">当前可兑换积分</p><p className="mt-1 text-5xl font-black">{stats?.available_points || 0}<span className="ml-1 text-base">分</span></p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 backdrop-blur-md"><p className="text-xs text-violet-100">个人累计积分</p><strong className="mt-1 block text-2xl">{cumulativePoints}</strong></div><div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 backdrop-blur-md"><p className="text-xs text-violet-100">已使用积分</p><strong className="mt-1 block text-2xl">{usedPoints}</strong></div></div></div></section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`rounded-full px-4 py-2 text-xs font-bold transition ${category === item ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-300/40' : 'glass-chip text-slate-600'}`}>{item}</button>)}</div><div className="flex gap-2"><Link to="/student/rule-text" className="glass-chip inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-indigo-700"><ScrollText className="h-4 w-4" />积分规则</Link><Link to="/student/redemptions" className="glass-chip inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-violet-700"><History className="h-4 w-4" />兑换记录</Link></div></div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48 text-red-400">{error}</div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400">暂无商品</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map((p) => {
            const btn = getButtonState(p)
            return (
              <div key={p.id} className="glass-panel hover-lift overflow-hidden rounded-[26px] border p-4">
                {p.image_url ? (
                  <button
                    type="button"
                    onClick={() => setImagePreview(p)}
                    className="group relative mb-4 block h-48 w-full cursor-zoom-in overflow-hidden rounded-[20px] bg-gradient-to-br from-indigo-50 to-violet-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label={`查看${p.name}大图`}
                  >
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    <span className="absolute inset-x-0 bottom-0 bg-black/45 py-1 text-center text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                      点击查看大图
                    </span>
                  </button>
                ) : (
                  <div className="mb-4 flex h-48 w-full items-center justify-center rounded-[20px] bg-gradient-to-br from-indigo-50 to-violet-100">
                    <Gift className="h-14 w-14 text-indigo-300" />
                  </div>
                )}
                <div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-black text-slate-900">{p.name}</h3>{p.category && <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-600">{p.category}</span>}</div>
                <div className="space-y-1 text-sm mb-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">所需积分</span>
                    <span className={`font-semibold ${(stats?.available_points || 0) >= p.points_required ? 'text-indigo-600' : 'text-red-500'}`}>
                      {p.points_required}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">剩余库存</span>
                    <span className={`font-medium ${p.available_stock <= 3 ? 'text-red-500' : 'text-gray-700'}`}>
                      {p.available_stock ?? p.total_stock}
                    </span>
                  </div>
                  {p.limit_per_person && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">限兑</span>
                      <span className="text-gray-700">每人 {p.limit_per_person} 次</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {p.on_sale_time || '-'}</span>
                  </div>
                </div>
                <button
                  onClick={() => !btn.disabled && setRedeemModal(p)}
                  disabled={btn.disabled}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black transition-colors ${btn.color} disabled:cursor-not-allowed disabled:opacity-70`}
                ><ShoppingBag className="h-4 w-4" />{btn.text}</button>
              </div>
            )
          })}
        </div>
      )}

      {imagePreview && (
        <div
          className="fixed inset-0 bg-black/75 z-[60] flex items-center justify-center p-4"
          onClick={() => setImagePreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${imagePreview.name}图片预览`}
        >
          <div className="relative max-w-5xl w-full" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              className="absolute -top-3 -right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg hover:bg-gray-100"
              aria-label="关闭图片预览"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={imagePreview.image_url}
              alt={imagePreview.name}
              className="max-h-[85vh] w-full rounded-xl bg-white object-contain shadow-2xl"
            />
            <div className="mt-3 text-center text-sm font-medium text-white">{imagePreview.name}</div>
          </div>
        </div>
      )}

      {/* Redeem Confirm Modal */}
      {redeemModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">确认兑换</h3>
              <button onClick={() => setRedeemModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">商品</span>
                <span className="font-medium">{redeemModal.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">当前积分</span>
                <span className="font-semibold text-indigo-600">{stats?.available_points || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">需消耗</span>
                <span className="font-semibold text-red-500">-{redeemModal.points_required}</span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2">
                <span className="text-gray-500">兑换后剩余</span>
                <span className="font-semibold text-green-600">{(stats?.available_points || 0) - redeemModal.points_required}</span>
              </div>
              {redeemModal.limit_per_person && (
                <div className="flex justify-between text-xs text-gray-400">
                  <span>限兑说明</span>
                  <span>每人最多兑换 {redeemModal.limit_per_person} 次</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setRedeemModal(null)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleRedeem} disabled={processing} className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {processing ? '兑换中...' : '确认兑换'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
