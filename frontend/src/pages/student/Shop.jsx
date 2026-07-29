import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { Clock3, Gift, History, PackageCheck, ScrollText, ShieldCheck, ShoppingBag, Sparkles, Trophy, X } from 'lucide-react'

const dateText = (value) => value ? new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '长期有效'

export default function StudentShop() {
  const [products, setProducts] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [redeemModal, setRedeemModal] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [category, setCategory] = useState('全部商品')

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    Promise.all([api.get('/api/student/products'), api.get('/api/student/dashboard')])
      .then(([productRes, dashboardRes]) => {
        setProducts(productRes.data.items || productRes.data || [])
        setStats(dashboardRes.data)
      })
      .catch((err) => setError(err.response?.data?.detail || '积分商城加载失败'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!redeemModal) return undefined
    const close = (event) => { if (event.key === 'Escape') setRedeemModal(null) }
    window.addEventListener('keydown', close)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', close)
      document.body.style.overflow = ''
    }
  }, [redeemModal])

  const refresh = () => Promise.all([
    api.get('/api/student/products').then(({ data }) => setProducts(data.items || data || [])),
    api.get('/api/student/dashboard').then(({ data }) => setStats(data)),
  ])

  const handleRedeem = async () => {
    if (!redeemModal) return
    setProcessing(true)
    try {
      await api.post('/api/student/redemptions', { product_id: redeemModal.id })
      showToast('兑换申请已提交，请等待审核')
      setRedeemModal(null)
      await refresh()
    } catch (err) {
      showToast(err.response?.data?.detail || '兑换失败', 'error')
    } finally {
      setProcessing(false)
    }
  }

  const getButtonState = (product) => {
    const status = product.product_status
    if (['offline', '已下架', '未上架'].includes(status)) return { text: '已下架', disabled: true }
    if (['sold_out', '已售罄'].includes(status) || Number(product.available_stock || 0) <= 0) return { text: '已售罄', disabled: true }
    if (product.is_not_yet) return { text: '暂未开放', disabled: true }
    if (Number(stats?.available_points || 0) < Number(product.points_required || 0)) return { text: '积分不足', disabled: true }
    if (product.limit_reached) return { text: '已达限兑', disabled: true }
    return { text: '立即兑换', disabled: false }
  }

  const categories = useMemo(() => ['全部商品', '热门推荐', ...Array.from(new Set(products.map((item) => item.category).filter(Boolean)))], [products])
  const filteredProducts = useMemo(() => {
    if (category === '全部商品') return products
    if (category === '热门推荐') return products.slice(0, 4)
    return products.filter((item) => item.category === category)
  }, [category, products])
  const cumulativePoints = Number(stats?.personal_cumulative_points ?? stats?.total_earned ?? stats?.period_points ?? 0)
  const availablePoints = Number(stats?.available_points || 0)
  const usedPoints = Math.max(0, cumulativePoints - availablePoints)
  const modalButton = redeemModal ? getButtonState(redeemModal) : null

  return <AppLayout>
    <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />

    <section className="relative mb-6 overflow-hidden rounded-[34px] bg-gradient-to-br from-indigo-700 via-violet-600 to-blue-500 px-6 py-7 text-white shadow-2xl shadow-indigo-300/30 sm:px-8">
      <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-cyan-300/25 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-fuchsia-300/20 blur-2xl" />
      <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.22em] text-indigo-100"><Sparkles className="h-4 w-4 text-amber-200" />Rewards Mall</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">积分商城</h1><p className="mt-2 text-sm text-indigo-100">学有所获 · 积分有价 · 精选好物 · 兑换惊喜</p></div>
        <div className="flex gap-2"><Link to="/student/rule-text" className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-black backdrop-blur-md transition hover:bg-white/20"><ScrollText className="h-4 w-4" />积分规则</Link><Link to="/student/redemptions" className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-xs font-black text-indigo-700 shadow-lg shadow-indigo-900/20"><History className="h-4 w-4" />兑换记录</Link></div>
      </div>
      <div className="relative mt-7 grid overflow-hidden rounded-[24px] border border-white/20 bg-white/95 text-slate-900 shadow-xl backdrop-blur-xl sm:grid-cols-3">
        {[['我的积分', cumulativePoints, Trophy, 'text-indigo-600'], ['可兑换积分', availablePoints, Gift, 'text-violet-600'], ['已使用积分', usedPoints, ShoppingBag, 'text-cyan-600']].map(([label, value, Icon, tone], index) => <div key={label} className={`flex items-center gap-4 px-6 py-5 ${index ? 'border-t border-indigo-50 sm:border-l sm:border-t-0' : ''}`}><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50"><Icon className={`h-5 w-5 ${tone}`} /></span><div><p className="text-xs font-bold text-slate-400">{label}</p><p className={`mt-1 text-3xl font-black ${tone}`}>{value}<span className="ml-1 text-xs text-slate-400">分</span></p></div></div>)}
      </div>
    </section>

    <section className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-indigo-500">Selected Rewards</p><h2 className="mt-1 text-2xl font-black text-slate-900">精选商品</h2></div><div className="flex flex-wrap gap-2">{categories.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} className={`rounded-xl px-4 py-2 text-xs font-black transition ${category === item ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'glass-chip text-slate-500 hover:text-indigo-600'}`}>{item}</button>)}</div></section>

    {loading ? <div className="flex h-56 items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-2 border-indigo-200 border-b-indigo-600" /></div> : error ? <div className="glass-panel rounded-3xl p-14 text-center text-rose-500">{error}</div> : filteredProducts.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filteredProducts.map((product) => {
      const buttonState = getButtonState(product)
      return <article key={product.id} className="group glass-panel hover-lift overflow-hidden rounded-[24px] border p-3.5">
        <button type="button" aria-label={`查看${product.name}商品详情`} onClick={() => setRedeemModal(product)} className="relative block h-44 w-full overflow-hidden rounded-[18px] bg-gradient-to-br from-indigo-50 via-white to-violet-100 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500">{product.image_url ? <img src={product.image_url} alt={product.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <span className="flex h-full items-center justify-center"><Gift className="h-14 w-14 text-indigo-200" /></span>}{product.category && <span className="absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-black text-indigo-600 shadow-sm backdrop-blur">{product.category}</span>}</button>
        <div className="px-1 pb-1 pt-4"><h3 className="truncate text-base font-black text-slate-900">{product.name}</h3><div className="mt-2 flex items-end justify-between"><p className="text-2xl font-black text-indigo-600">{product.points_required}<span className="ml-1 text-xs text-slate-400">积分</span></p><p className={`text-xs font-bold ${Number(product.available_stock) <= 3 ? 'text-rose-500' : 'text-slate-400'}`}>库存 {product.available_stock ?? product.total_stock}</p></div><button type="button" onClick={() => !buttonState.disabled && setRedeemModal(product)} disabled={buttonState.disabled} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black transition ${buttonState.disabled ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200 hover:-translate-y-0.5'}`}><ShoppingBag className="h-4 w-4" />{buttonState.text}</button></div>
      </article>
    })}</div> : <div className="glass-panel rounded-3xl p-16 text-center text-slate-400"><Gift className="mx-auto mb-3 h-10 w-10 text-indigo-200" />当前分类暂无商品</div>}

    <section className="mt-6 flex flex-col justify-between gap-4 rounded-[24px] border border-indigo-100 bg-white/65 px-6 py-5 text-xs text-slate-500 shadow-sm backdrop-blur-xl sm:flex-row"><div><p className="font-black text-indigo-600">温馨提示</p><p className="mt-1">所有商品均为积分兑换，兑换成功后请留意审核状态。</p></div><div className="space-y-1 sm:text-right"><p>兑换申请提交后会锁定库存和可用积分</p><p>如有疑问，请联系管理员查看兑换规则</p></div></section>

    {redeemModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRedeemModal(null) }}><section role="dialog" aria-modal="true" aria-labelledby="product-detail-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[30px] border border-white/70 bg-white/95 shadow-2xl"><header className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><p className="text-xs font-black uppercase tracking-[.18em] text-indigo-500">Reward Detail</p><h2 id="product-detail-title" className="mt-1 text-xl font-black text-slate-900">商品详情 / 确认兑换</h2></div><button type="button" aria-label="关闭商品详情" onClick={() => setRedeemModal(null)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600"><X className="h-5 w-5" /></button></header>
      <div className="grid md:grid-cols-[.9fr_1.1fr]"><div className="flex min-h-64 items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-violet-100 p-6">{redeemModal.image_url ? <img src={redeemModal.image_url} alt={redeemModal.name} className="max-h-80 w-full rounded-[24px] object-contain drop-shadow-xl" /> : <Gift className="h-24 w-24 text-indigo-200" />}</div><div className="p-6"><div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-600">{redeemModal.category || '精选好物'}</span><h3 className="mt-3 text-2xl font-black text-slate-900">{redeemModal.name}</h3></div><p className="text-3xl font-black text-indigo-600">{redeemModal.points_required}<span className="ml-1 text-xs text-slate-400">分</span></p></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">剩余库存</p><p className="mt-1 font-black text-slate-800">{redeemModal.available_stock ?? redeemModal.total_stock} 件</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">兑换数量</p><p className="mt-1 font-black text-slate-800">1 件</p></div></div><div className="mt-5 rounded-2xl border border-slate-100 p-4"><p className="text-sm font-black text-slate-800">商品描述</p><p className="mt-2 text-xs leading-6 text-slate-500">{redeemModal.description || '精选积分好礼，具体商品以管理员发布的信息为准。'}</p></div><div className="mt-4 space-y-2 text-xs text-slate-500"><p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" />每次兑换 1 件，提交后进入审核流程</p><p className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-indigo-500" />{redeemModal.limit_per_person ? `每人最多兑换 ${redeemModal.limit_per_person} 次` : '未设置个人限兑次数'}</p><p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-violet-500" />兑换有效期至 {dateText(redeemModal.off_sale_time)}</p></div></div></div>
      <footer className="border-t border-slate-100 bg-slate-50/80 px-6 py-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p>可用积分 <strong className="ml-1 text-xl text-indigo-600">{availablePoints}</strong></p><p>本次消耗 <strong className="ml-1 text-xl text-rose-500">{redeemModal.points_required}</strong></p><p>兑换后剩余 <strong className="ml-1 text-xl text-emerald-600">{availablePoints - Number(redeemModal.points_required || 0)}</strong></p></div><div className="grid gap-3 sm:grid-cols-[1fr_2fr]"><button type="button" onClick={() => setRedeemModal(null)} className="rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-500 hover:bg-white">取消</button><button type="button" onClick={handleRedeem} disabled={processing || modalButton?.disabled} className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-black text-white shadow-lg shadow-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">{processing ? '兑换中…' : modalButton?.disabled ? modalButton.text : '确认兑换'}</button></div></footer>
    </section></div>}
  </AppLayout>
}
