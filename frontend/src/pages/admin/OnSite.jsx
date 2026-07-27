import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { Gift, Award, ShoppingBag, Check } from 'lucide-react'

const AWARD_TYPES = ['阶段优秀成员', '优秀小组', '课堂奖励', '其他']

export default function AdminOnSite() {
  const [tab, setTab] = useState('exchange')
  const [students, setStudents] = useState([])
  const [products, setProducts] = useState([])
  const [phases, setPhases] = useState([])
  const [toast, setToast] = useState(null)

  // Exchange form
  const [exchangeForm, setExchangeForm] = useState({ student_id: '', product_id: '' })
  const [studentKeyword, setStudentKeyword] = useState('')
  const [studentResults, setStudentResults] = useState([])
  const [productKeyword, setProductKeyword] = useState('')
  const [showStudentResults, setShowStudentResults] = useState(false)
  const [showProductResults, setShowProductResults] = useState(false)

  // Award form
  const [awardForm, setAwardForm] = useState({
    student_id: '', group_id: '', product_id: '',
    award_type: '阶段优秀成员', phase_id: '', description: ''
  })

  const [processing, setProcessing] = useState(false)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    api.get('/api/admin/students', { params: { page_size: 100 } }).then(({ data }) => setStudents(data.items || data))
    api.get('/api/admin/products').then(({ data }) => setProducts(data.items || data))
    api.get('/api/admin/phases').then(({ data }) => setPhases(data.items || data))
  }, [])

  useEffect(() => {
    const keyword = studentKeyword.trim()
    if (!keyword || exchangeForm.student_id) {
      setStudentResults([])
      return
    }
    const timer = setTimeout(() => {
      api.get('/api/admin/students', { params: { keyword, page_size: 20 } })
        .then(({ data }) => setStudentResults(data.items || data))
        .catch(() => setStudentResults([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [studentKeyword, exchangeForm.student_id])

  const getStudentById = (id) => [...students, ...studentResults].find(s => s.id === parseInt(id))
  const getProductById = (id) => products.find(p => p.id === parseInt(id))

  const handleExchange = async () => {
    if (!exchangeForm.student_id || !exchangeForm.product_id) return showToast('请先选择学员和已上架商品', 'error')
    const student = getStudentById(exchangeForm.student_id)
    const product = getProductById(exchangeForm.product_id)
    if (student && product && (student.available_points || 0) < product.points_required) {
      return showToast(`兑换失败：${student.real_name}当前只有 ${student.available_points || 0} 分，需要 ${product.points_required} 分`, 'error')
    }
    setProcessing(true)
    try {
      await api.post('/api/admin/on-site/exchange', {
        student_id: parseInt(exchangeForm.student_id),
        product_id: parseInt(exchangeForm.product_id),
      })
      showToast('现场积分兑换成功')
      setExchangeForm({ student_id: '', product_id: '' })
      setStudentKeyword('')
      setProductKeyword('')
      const [{ data: studentData }, { data: productData }] = await Promise.all([
        api.get('/api/admin/students', { params: { page_size: 100 } }),
        api.get('/api/admin/products'),
      ])
      setStudents(studentData.items || studentData)
      setProducts(productData.items || productData)
    } catch (err) { showToast(err.response?.data?.detail || '兑换失败', 'error') }
    finally { setProcessing(false) }
  }

  const handleAward = async () => {
    if (!awardForm.product_id) return showToast('请选择奖励商品', 'error')
    if (!awardForm.student_id) return showToast('请选择学员', 'error')
    setProcessing(true)
    try {
      await api.post('/api/admin/on-site/reward', {
        student_id: awardForm.student_id ? parseInt(awardForm.student_id) : null,
        group_id: awardForm.group_id ? parseInt(awardForm.group_id) : null,
        product_id: parseInt(awardForm.product_id),
        award_type: awardForm.award_type,
        phase_id: awardForm.phase_id ? parseInt(awardForm.phase_id) : null,
        description: awardForm.description,
      })
      showToast('奖励发放成功')
      setAwardForm({ student_id: '', group_id: '', product_id: '', award_type: '阶段优秀成员', phase_id: '', description: '' })
    } catch (err) { showToast(err.response?.data?.detail || '操作失败', 'error') }
    finally { setProcessing(false) }
  }

  const selectedStudent = getStudentById(exchangeForm.student_id)
  const selectedProduct = getProductById(exchangeForm.product_id)
  const listedProducts = products.filter(p => ['可兑换', '即将售罄'].includes(p.product_status) && p.on_site_stock > 0)
  const matchedStudents = studentResults
  const matchedProducts = listedProducts
    .filter(p => !productKeyword.trim() || p.name?.includes(productKeyword.trim()))
    .slice(0, 20)
  const insufficientPoints = Boolean(
    selectedStudent && selectedProduct && (selectedStudent.available_points || 0) < selectedProduct.points_required
  )

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">现场发放</h1>
        <p className="text-gray-500 mt-1">现场积分兑换与直接奖励发放</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setTab('exchange')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${
              tab === 'exchange' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          ><ShoppingBag className="w-4 h-4" /> 现场积分兑换</button>
          <button
            onClick={() => setTab('award')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${
              tab === 'award' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          ><Award className="w-4 h-4" /> 直接奖励发放</button>
        </div>

        {tab === 'exchange' && (
          <div className="p-6 max-w-xl">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">选择学员 *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={studentKeyword}
                    onChange={(e) => {
                      setStudentKeyword(e.target.value)
                      setExchangeForm({ ...exchangeForm, student_id: '' })
                      setShowStudentResults(true)
                    }}
                    onFocus={() => setShowStudentResults(true)}
                    onBlur={() => setTimeout(() => setShowStudentResults(false), 150)}
                    placeholder="输入学员姓名自动检索"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {showStudentResults && studentKeyword.trim() && (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {matchedStudents.length > 0 ? matchedStudents.map(s => (
                        <button
                          type="button"
                          key={s.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setStudents(current => current.some(item => item.id === s.id) ? current : [...current, s])
                            setExchangeForm({ ...exchangeForm, student_id: s.id })
                            setStudentKeyword(s.real_name)
                            setShowStudentResults(false)
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-indigo-50"
                        >
                          <span>
                            {s.real_name}{' '}
                            <span className="text-gray-400">
                              {[s.system, s.level1_dept].filter(Boolean).join(' · ') || '未填写体系/一级部门'}
                            </span>
                          </span>
                          <span className="text-xs text-indigo-600">累计 {s.total_earned || 0} · 可用 {s.available_points || 0} 分</span>
                        </button>
                      )) : <div className="px-3 py-3 text-sm text-gray-400">未找到匹配学员</div>}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">选择商品 *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={productKeyword}
                    onChange={(e) => {
                      setProductKeyword(e.target.value)
                      setExchangeForm({ ...exchangeForm, product_id: '' })
                      setShowProductResults(true)
                    }}
                    onFocus={() => setShowProductResults(true)}
                    onBlur={() => setTimeout(() => setShowProductResults(false), 150)}
                    placeholder="输入商品名称，或点击查看已上架商品"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {showProductResults && (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {matchedProducts.length > 0 ? matchedProducts.map(p => (
                        <button
                          type="button"
                          key={p.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setExchangeForm({ ...exchangeForm, product_id: p.id })
                            setProductKeyword(p.name)
                            setShowProductResults(false)
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-indigo-50"
                        >
                          <span>{p.name}</span>
                          <span className="text-xs text-gray-500">{p.points_required} 分 · 现场库存 {p.on_site_stock}</span>
                        </button>
                      )) : <div className="px-3 py-3 text-sm text-gray-400">没有匹配的已上架商品</div>}
                    </div>
                  )}
                </div>
              </div>
              {selectedStudent && selectedProduct && (
                <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">学员累计获得积分</span>
                    <span className="font-semibold text-gray-700">{selectedStudent.total_earned || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">学员可用积分</span>
                    <span className="font-semibold text-indigo-600">{selectedStudent.available_points || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">商品所需积分</span>
                    <span className="font-semibold text-red-500">{selectedProduct.points_required}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-2">
                    <span className="text-gray-500">兑换后剩余</span>
                    <span className={`font-semibold ${(selectedStudent.available_points || 0) - selectedProduct.points_required >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(selectedStudent.available_points || 0) - selectedProduct.points_required}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">现场库存: {selectedProduct.on_site_stock}</p>
                  {insufficientPoints && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">积分不足，点击确认兑换时将提示兑换失败，不会扣减积分或库存。</p>}
                </div>
              )}
              <button
                onClick={handleExchange}
                disabled={processing || !exchangeForm.student_id || !exchangeForm.product_id}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> {processing ? '处理中...' : '确认兑换 (扣除积分+扣减现场库存)'}
              </button>
            </div>
          </div>
        )}

        {tab === 'award' && (
          <div className="p-6 max-w-xl">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">奖励类型 *</label>
                <select value={awardForm.award_type} onChange={(e) => setAwardForm({...awardForm, award_type: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  {AWARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">选择学员</label>
                  <select value={awardForm.student_id} onChange={(e) => {
                    const student = students.find(s => s.id === parseInt(e.target.value))
                    setAwardForm({...awardForm, student_id: e.target.value, group_id: student?.group_id || ''})
                  }} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">选择学员...</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.real_name} ({[s.system, s.level1_dept].filter(Boolean).join(' · ') || '-'})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">所属小组（自动带出）</label>
                  <input
                    type="text"
                    readOnly
                    value={students.find(s => s.id === parseInt(awardForm.student_id))?.group_name || (awardForm.student_id ? '未分组' : '')}
                    placeholder="选择学员后自动显示"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">奖励商品 *</label>
                <select value={awardForm.product_id} onChange={(e) => setAwardForm({...awardForm, product_id: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">选择商品...</option>
                  {listedProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (现场库存: {p.on_site_stock})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">关联阶段</label>
                <select value={awardForm.phase_id} onChange={(e) => setAwardForm({...awardForm, phase_id: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">不关联</option>
                  {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">说明</label>
                <textarea value={awardForm.description} onChange={(e) => setAwardForm({...awardForm, description: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="奖励说明" />
              </div>
              <button
                onClick={handleAward}
                disabled={processing || !awardForm.student_id || !awardForm.product_id}
                className="w-full py-2.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Gift className="w-4 h-4" /> {processing ? '处理中...' : '确认发放奖励 (仅扣减现场库存)'}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
