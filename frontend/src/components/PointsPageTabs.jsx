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
    <div className="mb-6 grid w-full max-w-2xl grid-cols-3 rounded-[20px] border border-indigo-100 bg-white/85 p-1.5 shadow-lg shadow-indigo-100/30" aria-label={type === 'team' ? '小组积分功能切换' : '个人积分功能切换'}>
      {tabs.map(tab => {
        const active = location.pathname === tab.path
        const Icon = tab.icon
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`inline-flex items-center justify-center gap-2 rounded-[15px] px-4 py-3 text-sm font-black transition-all ${
              active ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:bg-indigo-50 hover:text-indigo-700'
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
