import { Link, useLocation } from 'react-router-dom'
import { ListChecks, PlusCircle, Table2 } from 'lucide-react'

export default function PointsPageTabs({ type }) {
  const location = useLocation()
  const basePath = type === 'team' ? '/admin/team-points' : '/admin/points'
  const tabs = [
    { path: `${basePath}/summary`, label: type === 'team' ? '小组积分总表' : '学员积分总表', icon: Table2 },
    { path: basePath, label: '积分录入', icon: PlusCircle },
    { path: `${basePath}/records`, label: '积分流水', icon: ListChecks },
  ]

  return (
    <div className="inline-flex rounded-xl bg-gray-100 p-1 mb-6" aria-label={type === 'team' ? '小组积分功能切换' : '个人积分功能切换'}>
      {tabs.map(tab => {
        const active = location.pathname === tab.path
        const Icon = tab.icon
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`inline-flex min-w-32 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
              active ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
