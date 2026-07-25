import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { Plus, X, Edit, Package, Clock, Eye, Power, Upload } from 'lucide-react'

const PRODUCT_STATUS = {
  '可兑换': 'bg-green-50 text-green-600',
  '未上架': 'bg-gray-100 text-gray-500',
  '已售罄': 'bg-red-50 text-red-500',
  '即将售罄': 'bg-yellow-50 text-yellow-600',
  '暂时下架': 'bg-gray-200 text-gray-600',
  '补货中': 'bg-blue-50 text-blue-600',
}
const STATUS_LABEL = PRODUCT_STATUS  // 中文status就是label

export default function AdminProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({
    name: '', description: '', image_url: '', points_required: '', total_stock: '',
    on_site_stock: '0', limit_per_person: '', is_limited: false,
    on_sale_time: '', off_sale_time: ''
  })

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchProducts = () => {
    setLoading(true)
    api.get('/api/admin/products')
      .then(({ data }) => { setProducts(data.items || data); setLoading(false) })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }

  useEffect(() => { fetchProducts() }, [])

  const openCreate = () => {
    setModal('create')
    setForm({ name: '', description: '', image_url: '', points_required: '', total_stock: '', on_site_stock: '0', limit_per_person: '', is_limited: false, on_sale_time: '', off_sale_time: '' })
  }

  const openEdit = (p) => {
    setModal('edit')
    setForm({
      id: p.id, name: p.name, description: p.description || '', image_url: p.image_url || '',
      points_required: p.points_required, total_stock: p.total_stock,
      on_site_stock: p.on_site_stock || 0, limit_per_person: p.limit_per_person || '',
      is_limited: !!p.limit_per_person, on_sale_time: p.on_sale_time || '', off_sale_time: p.off_sale_time || ''
    })
  }

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        points_required: parseInt(form.points_required),
        total_stock: parseInt(form.total_stock),
        on_site_stock: parseInt(form.on_site_stock),
        limit_per_person: form.is_limited ? parseInt(form.limit_per_person) : null,
      }
      if (modal === 'create') {
        await api.post('/api/admin/products', payload)
        showToast('商品创建成功')
      } else {
        await api.put(`/api/admin/products/${form.id}`, payload)
        showToast('商品更新成功')
      }
      setModal(null)
      fetchProducts()
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const toggleStatus = async (p) => {
    try {
      const newStatus = p.product_status === 'active' ? 'offline' : 'active'
      await api.put(`/api/admin/products/${p.id}`, { product_status: newStatus })
      showToast(`商品已${newStatus === 'active' ? '上架' : '下架'}`)
      fetchProducts()
    } catch (err) { showToast('操作失败', 'error') }
  }

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">商品管理</h1>
          <p className="text-gray-500 mt-1">管理兑换商品</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> 新增商品
        </button>
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
          {products.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-40 bg-gray-50 flex items-center justify-center overflow-hidden">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-12 h-12 text-gray-300" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${PRODUCT_STATUS[p.product_status] || 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[p.product_status] || p.product_status}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 text-sm mb-3">{p.name}</h3>
                <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">所需积分</span>
                  <span className="font-semibold text-indigo-600">{p.points_required}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">库存</span>
                  <span className="text-gray-700">
                    <span className="text-gray-900 font-medium">{p.available_stock ?? (p.total_stock - (p.locked_stock || 0))}</span>
                    {p.on_site_stock > 0 && <span className="text-xs text-gray-400 ml-1">/ {p.total_stock} (现场{p.on_site_stock})</span>}
                    {p.on_site_stock <= 0 && <span className="text-xs text-gray-400 ml-1">/ {p.total_stock}</span>}
                  </span>
                </div>
                {p.limit_per_person && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">限兑</span>
                    <span className="text-gray-700">每人 {p.limit_per_person} 次</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-gray-400 pt-1">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {p.on_sale_time || '-'} ~ {p.off_sale_time || '-'}</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                <button onClick={() => openEdit(p)} className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">
                  <Edit className="w-3 h-3" />
                </button>
                <button onClick={() => toggleStatus(p)} className={`px-3 py-1.5 text-xs rounded-lg ${
                  p.product_status === 'active' ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'
                }`}>
                  <Power className="w-3 h-3" />
                </button>
              </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{modal === 'create' ? '新增商品' : '编辑商品'}</h3>
              <button onClick={() => setModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">商品名称 *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">描述</label>
                <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">商品图片</label>
                <div className="flex gap-3 mb-2">
                  <div className="flex-1">
                    <input type="text" value={form.image_url || ''} onChange={(e) => setForm({...form, image_url: e.target.value})} placeholder="输入图片链接..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <label className="flex items-center gap-1 px-3 py-2 text-xs border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:text-indigo-600 text-gray-500">
                    <Upload className="w-3 h-3" /> 本地上传
                    <input type="file" accept="image/*" onChange={(e) => {
                      const file = e.target.files?.[0]; if (!file) return
                      if (file.size > 3 * 1024 * 1024) { alert('图片不能超过3MB'); return }
                      // 压缩图片到 max 800px
                      const img = new Image()
                      const reader = new FileReader()
                      reader.onload = (ev) => {
                        img.src = ev.target.result
                        img.onload = () => {
                          const canvas = document.createElement('canvas')
                          const maxW = 800, maxH = 600
                          let { width, height } = img
                          if (width > maxW) { height = height * maxW / width; width = maxW }
                          if (height > maxH) { width = width * maxH / height; height = maxH }
                          canvas.width = width; canvas.height = height
                          canvas.getContext('2d').drawImage(img, 0, 0, width, height)
                          const compressed = canvas.toDataURL('image/jpeg', 0.7)
                          setForm({...form, image_url: compressed})
                        }
                      }
                      reader.readAsDataURL(file)
                    }} className="hidden" />
                  </label>
                </div>
                {form.image_url && (
                  <div className="w-full h-32 bg-gray-100 rounded-lg overflow-hidden">
                    <img src={form.image_url} alt="预览" className="w-full h-full object-contain" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">所需积分 *</label>
                  <input type="number" value={form.points_required} onChange={(e) => setForm({...form, points_required: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">总库存 *</label>
                  <input type="number" value={form.total_stock} onChange={(e) => setForm({...form, total_stock: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">现场库存</label>
                <input type="number" value={form.on_site_stock} onChange={(e) => setForm({...form, on_site_stock: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm mb-2">
                  <input type="checkbox" checked={form.is_limited} onChange={(e) => setForm({...form, is_limited: e.target.checked})} className="rounded" />
                  限制每人兑换次数
                </label>
                {form.is_limited && (
                  <input type="number" value={form.limit_per_person} onChange={(e) => setForm({...form, limit_per_person: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="每人限兑次数" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">上架时间</label>
                  <input type="datetime-local" value={form.on_sale_time} onChange={(e) => setForm({...form, on_sale_time: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">下架时间</label>
                  <input type="datetime-local" value={form.off_sale_time} onChange={(e) => setForm({...form, off_sale_time: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleSave} className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">保存</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
