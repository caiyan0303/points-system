import { Link, useLocation } from 'react-router-dom'
import { User, UsersRound } from 'lucide-react'

export default function InformationPageTabs() {
  const location = useLocation()
  const tabs = [
    { path: '/admin/students', label: '学员列表', icon: User },
    { path: '/admin/groups', label: '小组列表', icon: UsersRound },
  ]

  return <div className="mb-5 inline-flex rounded-xl bg-slate-100 p-1" aria-label="学员与小组管理切换">
    {tabs.map((tab) => {
      const Icon = tab.icon
      const active = location.pathname === tab.path
      return <Link key={tab.path} to={tab.path} className={`inline-flex min-w-32 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition ${active ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
        <Icon className="h-4 w-4" />{tab.label}
      </Link>
    })}
  </div>
}
