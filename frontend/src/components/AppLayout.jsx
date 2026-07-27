import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, Gift, History, LogOut, User, ChevronRight,
  Shield, Users, ShoppingBag, ClipboardCheck, TrendingUp, PlusCircle,
  ListChecks, Layers, ScrollText, UsersRound,
  Calendar, FileText, Archive, ChevronDown, Package, Star
} from 'lucide-react'

const adminGroups = [
  {
    key: 'overview', label: '项目运营', icon: Star,
    items: [
      { path: '/admin/dashboard', icon: LayoutDashboard, label: '仪表盘' },
      { path: '/admin/projects', icon: Layers, label: '项目与阶段' },
    ]
  },
  {
    key: 'student', label: '学员管理', icon: Users,
    items: [
      { path: '/admin/students', icon: User, label: '学员管理' },
      { path: '/admin/groups', icon: UsersRound, label: '小组管理' },
    ]
  },
  {
    key: 'points', label: '积分管理', icon: TrendingUp,
    items: [
      { path: '/admin/points', icon: PlusCircle, label: '积分录入' },
      { path: '/admin/points/records', icon: ListChecks, label: '积分流水' },
      { path: '/admin/point-rules', icon: ScrollText, label: '积分规则' },
    ]
  },
  {
    key: 'mall', label: '商城管理', icon: ShoppingBag,
    items: [
      { path: '/admin/products', icon: Package, label: '商品管理' },
      { path: '/admin/redemptions', icon: ClipboardCheck, label: '兑换审核' },
      { path: '/admin/on-site', icon: Gift, label: '现场发放' },
    ]
  },
  {
    key: 'system', label: '系统', icon: FileText,
    items: [
      { path: '/admin/yearly', icon: Calendar, label: '年度数据汇总' },
      { path: '/admin/operation-logs', icon: FileText, label: '操作记录' },
    ]
  },
]

const studentGroups = [
  {
    key: 'home', label: '首页', icon: Star,
    items: [
      { path: '/student/dashboard', icon: LayoutDashboard, label: '个人首页' },
    ]
  },
  {
    key: 'training', label: '我的培训', icon: Layers,
    items: [
      { path: '/student/phases', icon: Layers, label: '阶段积分概览' },
      { path: '/student/team', icon: UsersRound, label: '我的团队' },
    ]
  },
  {
    key: 'points', label: '我的积分', icon: TrendingUp,
    items: [
      { path: '/student/points', icon: TrendingUp, label: '积分明细' },
      { path: '/student/rule-text', icon: ScrollText, label: '积分规则' },
    ]
  },
  {
    key: 'mall', label: '积分商城', icon: ShoppingBag,
    items: [
      { path: '/student/shop', icon: ShoppingBag, label: '积分商城' },
      { path: '/student/redemptions', icon: History, label: '兑换记录' },
    ]
  },
  {
    key: 'records', label: '记录', icon: FileText,
    items: [
      { path: '/student/history', icon: Archive, label: '历史项目' },
      { path: '/student/profile', icon: User, label: '个人信息' },
    ]
  },
]

function SidebarGroup({ group, location }) {
  const [open, setOpen] = useState(false)
  const hasActive = group.items.some(item =>
    location.pathname === item.path || location.pathname.startsWith(item.path + '/')
  )

  // 路由切换时自动折叠（除非当前组包含激活项则展开）
  useEffect(() => {
    if (hasActive) setOpen(true)
    else setOpen(false)
  }, [location.pathname])

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors`}
      >
        <group.icon className="w-3.5 h-3.5" />
        {group.label}
        <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="space-y-0.5 mt-0.5 mb-2">
          {group.items.map(item => {
            const Icon = item.icon
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 pl-7 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function AppLayout({ children }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const isAdmin = user?.role === 'admin'
  const groups = isAdmin ? adminGroups : studentGroups

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-30">
        <div className="p-4 border-b border-gray-100">
          <Link to={isAdmin ? '/admin/dashboard' : '/student/dashboard'} className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-sm">积分管理系统</h1>
              <p className="text-[10px] text-gray-400">{isAdmin ? '管理端' : '学员端'}</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {groups.map(group => (
            <SidebarGroup key={group.key} group={group} location={location} />
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1">
            <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{user?.real_name}</p>
              <p className="text-[10px] text-gray-400">{isAdmin ? '管理员' : '学员'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> 退出登录
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-60 min-h-screen">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
