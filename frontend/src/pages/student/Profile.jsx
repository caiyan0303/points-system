import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { User, Mail, Phone, MapPin, Building, Calendar, Briefcase } from 'lucide-react'

export default function StudentProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ phone: '', address: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    api.get('/api/student/profile')
      .then(({ data }) => {
        setProfile(data)
        setForm({ phone: data.phone || '', address: data.address || '' })
        setLoading(false)
      })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/api/student/profile', form)
      setProfile({ ...profile, ...form })
      showToast('个人信息已更新')
      setEditing(false)
    } catch (err) { showToast(err.response?.data?.detail || '保存失败', 'error') }
    finally { setSaving(false) }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      </AppLayout>
    )
  }

  if (error || !profile) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-gray-400">{error || '暂无数据'}</div>
      </AppLayout>
    )
  }

  const fields = [
    { label: '姓名', value: profile.real_name, icon: User, editable: false },
    { label: '用户名', value: profile.username || profile.real_name, icon: User, editable: false },
    { label: '邮箱', value: profile.email || '-', icon: Mail, editable: false },
    { label: '手机', value: form.phone || '-', icon: Phone, editable: true, field: 'phone' },
    { label: '地址', value: form.address || '-', icon: MapPin, editable: true, field: 'address' },
    { label: '部门', value: profile.department || '-', icon: Building, editable: false },
    { label: '年度', value: profile.year_name || '-', icon: Calendar, editable: false },
    { label: '培训项目', value: profile.project_name || '-', icon: Briefcase, editable: false },
  ]

  return (
    <AppLayout>
      <Toast message={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">个人信息</h1>
        <p className="text-gray-500 mt-1">查看和编辑个人资料</p>
      </div>

      <div className="max-w-2xl">
        {/* Avatar & Name */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{profile.real_name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  profile.employment_status === 'terminated' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'
                }`}>
                  {profile.employment_status === 'terminated' ? '已终止' : '在职'}
                </span>
                <span className="text-sm text-gray-400">{profile.department || ''}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Info Fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-gray-900">个人资料</h3>
            {!editing && (
              <button onClick={() => setEditing(true)} className="px-4 py-2 text-sm bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100">
                编辑
              </button>
            )}
          </div>

          <div className="space-y-4">
            {fields.map((f) => (
              <div key={f.label} className="flex items-center gap-4">
                <f.icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-500 w-20">{f.label}</span>
                {editing && f.editable ? (
                  <input
                    type="text"
                    value={form[f.field]}
                    onChange={(e) => setForm({ ...form, [f.field]: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={f.label}
                  />
                ) : (
                  <span className="text-sm text-gray-900 flex-1">{f.value}</span>
                )}
              </div>
            ))}
          </div>

          {editing && (
            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
              <button onClick={() => setEditing(false)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saving ? '保存中...' : '保存修改'}
              </button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
