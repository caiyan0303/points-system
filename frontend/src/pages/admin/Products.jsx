import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { Plus, X, Edit, Package, Power, Upload, Loader2, CalendarDays, Eye } from 'lucide-react'

const PRODUCT_STATUS = {
  '可兑换': 'bg-green-50 text-green-600',
  '未上架': 'bg-gray-100 text-gray-500',
  '已售罄': 'bg-red-50 text-red-500',
  '即将售罄': 'bg-yellow-50 text-yellow-600',
  '暂时下架': 'bg-gray-200 text-gray-600',
  '补货中': 'bg-blue-50 text-blue-600',
}
const STATUS_LABEL = {
  '可兑换': '可兑换',
  '未上架': '未上架',
  '已售罄': '已售罄',
  '即将售罄': '即将售罄',
  '暂时下架': '暂时下架',
  '补货中': '补货中',
}
const isProductListed = product => ['可兑换', '即将售罄'].includes(product.product_status)

const parseDate = value => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatDateTime = (value, emptyText) => {
  const date = parseDate(value)
  return date ? date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }) : emptyText
}

const toDateTimeInput = value => {
  const date = parseDate(value)
  if (!date) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

const toApiDateTime = value => value ? new Date(value).toISOString() : null

const getVisibility = product => {
  if (!isProductListed(product)) return { label: '学员端不可见', className: 'bg-slate-100 text-slate-500' }
  const now = Date.now()
  const startsAt = parseDate(product.on_sale_time)?.getTime()
  const endsAt = parseDate(product.off_sale_time)?.getTime()
  if (startsAt && startsAt > now) return { label: '等待上架时间', className: 'bg-amber-50 text-amber-600' }
  if (endsAt && endsAt < now) return { label: '已过下架时间', className: 'bg-rose-50 text-rose-600' }
  return { label: '学员端可见', className: 'bg-emerald-50 text-emerald-600' }
}

export default function AdminProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [modal, setModal] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', image_url: '', points_required: '', total_stock: '',
    limit_per_person: '', is_limited: false,
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
    setForm({ name: '', description: '', image_url: '', points_required: '', total_stock: '', limit_per_person: '', is_limited: false, on_sale_time: '', off_sale_time: '' })
  }

  const openEdit = (p) => {
    setModal('edit')
    setForm({
      id: p.id, name: p.name, description: p.description || '', image_url: p.image_url || '',
      points_required: p.points_required, total_stock: p.total_stock,
      limit_per_person: p.limit_per_person || '',
      is_limited: !!p.limit_per_person,
      on_sale_time: toDateTimeInput(p.on_sale_time),
      off_sale_time: toDateTimeInput(p.off_sale_time)
    })
  }

  const handleSave = async () => {
    try {
      const pointsRequired = Number(form.points_required)
      const totalStock = Number(form.total_stock)
      const limitPerPerson = form.is_limited ? Number(form.limit_per_person) : null
      if (!form.name.trim()) return showToast('请输入商品名称', 'error')
      if (!Number.isInteger(pointsRequired) || pointsRequired <= 0) return showToast('所需积分必须为正整数', 'error')
      if (!Number.isInteger(totalStock) || totalStock < 0) return showToast('总库存不能小于 0', 'error')
      if (form.is_limited && (!Number.isInteger(limitPerPerson) || limitPerPerson <= 0)) return showToast('请输入有效的限兑次数', 'error')
      if (form.on_sale_time && form.off_sale_time && new Date(form.on_sale_time) >= new Date(form.off_sale_time)) {
        return showToast('下架时间必须晚于上架时间', 'error')
      }

      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        image_url: form.image_url || null,
        points_required: pointsRequired,
        total_stock: totalStock,
        on_site_stock: 0,
        limit_per_person: limitPerPerson,
        is_limited: form.is_limited ? 1 : 0,
        on_sale_time: toApiDateTime(form.on_sale_time),
        off_sale_time: toApiDateTime(form.off_sale_time),
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
      const newStatus = isProductListed(p) ? '暂时下架' : '可兑换'
      await api.put(`/api/admin/products/${p.id}`, { product_status: newStatus })
      showToast(`商品已${newStatus === '可兑换' ? '上架' : '下架'}`)
      fetchProducts()
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
  }

  const handleImageUpload = async (file) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      showToast('仅支持 JPG、PNG、WebP 或 GIF 图片', 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('图片不能超过 5MB', 'error')
      return
    }
    const data = new FormData()
    data.append('file', file)
    setUploading(true)
    try {
      const { data: result } = await api.post('/api/admin/products/upload-image', data)
      setForm(current => ({ ...current, image_url: result.image_url }))
      showToast('图片上传成功')
    } catch (err) {
      showToast(err.response?.data?.detail || '图片上传失败', 'error')
    } finally {
      setUploading(false)
    }
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
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 px-5 py-3 text-xs text-slate-500">
            <Eye className="h-4 w-4 text-indigo-500" />只有状态为“可兑换/即将售罄”，且当前时间在上架与下架时间范围内的商品，才会在学员端显示。
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr><th className="px-5 py-3">商品</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">所需积分</th><th className="px-4 py-3">库存</th><th className="px-4 py-3">限兑</th><th className="px-4 py-3">上架时间</th><th className="px-4 py-3">下架时间</th><th className="px-5 py-3 text-right">操作</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const visibility = getVisibility(p)
                  return <tr key={p.id} className="transition hover:bg-indigo-50/30">
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">{p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" /> : <Package className="h-7 w-7 text-slate-300" />}</div><div className="min-w-0"><p className="max-w-56 truncate text-sm font-bold text-slate-900">{p.name}</p><p className="mt-1 max-w-56 truncate text-xs text-slate-400">{p.description || '暂无商品描述'}</p></div></div></td>
                    <td className="px-4 py-4"><div className="space-y-1.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${PRODUCT_STATUS[p.product_status] || 'bg-gray-100 text-gray-500'}`}>{STATUS_LABEL[p.product_status] || p.product_status}</span><br /><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${visibility.className}`}>{visibility.label}</span></div></td>
                    <td className="px-4 py-4 text-right text-lg font-black text-indigo-600">{p.points_required}</td>
                    <td className="px-4 py-4 text-sm text-slate-700"><strong>{p.available_stock ?? (p.total_stock - (p.locked_stock || 0))}</strong><span className="text-slate-400"> / {p.total_stock}</span><p className="mt-1 text-[11px] text-slate-400">可用 / 总库存</p></td>
                    <td className="px-4 py-4 text-sm text-slate-600">{p.limit_per_person ? `每人 ${p.limit_per_person} 次` : '不限次数'}</td>
                    <td className="px-4 py-4 text-sm text-slate-600"><span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-indigo-400" />{formatDateTime(p.on_sale_time, '立即上架')}</span></td>
                    <td className="px-4 py-4 text-sm text-slate-600"><span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-violet-400" />{formatDateTime(p.off_sale_time, '长期有效')}</span></td>
                    <td className="px-5 py-4"><div className="flex justify-end gap-2"><button onClick={() => openEdit(p)} title="编辑商品" className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"><Edit className="h-4 w-4" /></button><button onClick={() => toggleStatus(p)} title={isProductListed(p) ? '下架商品' : '上架商品'} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold ${isProductListed(p) ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}><Power className="h-4 w-4" />{isProductListed(p) ? '下架' : '上架'}</button></div></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
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
                  <label className={`flex items-center gap-1 px-3 py-2 text-xs border border-dashed rounded-lg text-gray-500 ${uploading ? 'border-gray-200 cursor-wait opacity-60' : 'border-gray-300 cursor-pointer hover:border-indigo-400 hover:text-indigo-600'}`}>
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} {uploading ? '上传中' : '本地上传'}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} onChange={(e) => handleImageUpload(e.target.files?.[0])} className="hidden" />
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
                  <p className="mt-1 text-xs text-gray-400">留空表示上架后立即展示</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">下架时间</label>
                  <input type="datetime-local" min={form.on_sale_time || undefined} value={form.off_sale_time} onChange={(e) => setForm({...form, off_sale_time: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  <p className="mt-1 text-xs text-gray-400">留空表示长期有效</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleSave} disabled={uploading} className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">保存</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
