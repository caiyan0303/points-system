import { useState, useEffect } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import { User, Building, Calendar, Briefcase, Users } from 'lucide-react'

export default function StudentProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/api/student/profile')
      .then(({ data }) => {
        setProfile(data)
        setLoading(false)
      })
      .catch((err) => { setError(err.response?.data?.detail || '加载失败'); setLoading(false) })
  }, [])

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
    { label: '体系', value: profile.system || '-', icon: Building, editable: false },
    { label: '一级部门', value: profile.level1_dept || '-', icon: Building, editable: false },
    { label: '职位信息', value: profile.position || '-', icon: Briefcase, editable: false },
    { label: '年度', value: profile.year_name || '-', icon: Calendar, editable: false },
    { label: '培训项目', value: profile.project_name || '-', icon: Briefcase, editable: false },
    { label: '所属小组', value: profile.group_name || '-', icon: Users, editable: false },
  ]

  return (
    <AppLayout>
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[.22em] text-indigo-500">Personal Center</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900">个人中心</h1>
        <p className="mt-2 text-sm text-slate-500">管理个人信息，查看所属项目与小组身份</p>
      </div>

      <div className="max-w-5xl">
        {/* Avatar & Name */}
        <div className="relative mb-6 overflow-hidden rounded-[30px] border border-white/80 bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 p-7 text-white shadow-2xl shadow-indigo-400/20">
          <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/20 blur-2xl" />
          <div className="flex items-center gap-4">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-[26px] border border-white/30 bg-white/15 backdrop-blur-md">
              <User className="h-9 w-9 text-white" />
            </div>
            <div className="relative">
              <h2 className="text-2xl font-black text-white">{profile.real_name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  profile.employment_status === 'terminated' ? 'bg-red-400/20 text-red-100' : 'bg-emerald-400/20 text-emerald-100'
                }`}>
                  {profile.employment_status === 'terminated' ? '已终止' : '在职'}
                </span>
                <span className="text-sm text-indigo-100">
                  {[profile.year_name, profile.project_name, profile.group_name].filter(Boolean).join(' · ')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Info Fields */}
        <div className="glass-panel rounded-[30px] border p-7">
          <div className="mb-6"><h3 className="font-semibold text-gray-900">个人资料</h3></div>

          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((f) => (
              <div key={f.label} className="flex items-center gap-3 rounded-2xl bg-white/45 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50"><f.icon className="h-4 w-4 text-indigo-500" /></div>
                <span className="w-18 text-xs text-slate-500">{f.label}</span>
                <span className="text-sm text-gray-900 flex-1">{f.value}</span>
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

        </div>
      </div>
    </AppLayout>
  )
}
