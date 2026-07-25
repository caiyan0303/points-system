import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { ShoppingBag, X, Package, Clock } from 'lucide-react'

export default function StudentShop() {
  const [products, setProducts] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [redeemModal, setRedeemModal] = useState(null)
  const [processing, setProcessing] = useState(false)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    api.get('/api/student/products')
      .then(({ data }) => { setProducts(data.items || data); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
    api.get('/api/student/dashboard')
      .then(({ data }) => setStats(data))
      .catch(() => {})
  }, [])

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

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">积分商城</h1>
        {stats && (
          <p className="text-gray-500 mt-1">可用积分: <span className="font-semibold text-indigo-600">{stats.available_points || 0}</span></p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48 text-red-400">{error}</div>
      ) : products.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400">暂无商品</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => {
            const btn = getButtonState(p)
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center mb-3">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <Package className="w-10 h-10 text-gray-400" />
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 text-sm mb-2">{p.name}</h3>
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
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${btn.color} disabled:opacity-70 disabled:cursor-not-allowed`}
                >{btn.text}</button>
              </div>
            )
          })}
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
