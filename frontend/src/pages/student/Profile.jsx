import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import Toast from '../../components/Toast'
import { User, Mail, Phone, MapPin, Building, Calendar, Briefcase, Users } from 'lucide-react'

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
    { label: '体系', value: profile.system || '-', icon: Building, editable: false },
    { label: '一级部门', value: profile.level1_dept || '-', icon: Building, editable: false },
    { label: '年度', value: profile.year_name || '-', icon: Calendar, editable: false },
    { label: '培训项目', value: profile.project_name || '-', icon: Briefcase, editable: false },
    { label: '所属小组', value: profile.group_name || '-', icon: Users, editable: false },
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
                <span className="text-sm text-gray-400">
                  {[profile.year_name, profile.project_name, profile.group_name].filter(Boolean).join(' · ')}
                </span>
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

          {profile.project_enrollments?.length > 0 && (
            <div className="mt-6 border-t border-gray-100 pt-5">
              <h4 className="mb-3 text-sm font-semibold text-gray-800">参与项目记录</h4>
              <div className="space-y-2">
                {profile.project_enrollments.map((item, index) => (
                  <div key={`${item.year_name}-${item.project_name}-${index}`} className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">{item.year_name} · {item.project_name}</span>
                      {item.is_current && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">当前项目</span>}
                      {item.label && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">{item.label}</span>}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">小组：{item.group_name || '未分组'} · 状态：{item.status || '在读'}</p>
                    {item.remark && <p className="mt-1 text-xs text-gray-500">备注：{item.remark}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

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
