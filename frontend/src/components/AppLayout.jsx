import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  Award, Calendar, ChevronDown, ClipboardCheck, FileText, Gift,
  LayoutDashboard, LogOut, Menu, Package, PlusCircle, ScrollText,
  Shield, ShoppingBag, Sparkles, Star, TrendingUp, User, Users, UsersRound, X,
  Layers,
} from 'lucide-react'

const adminGroups = [
  { key: 'overview', label: '项目运营', icon: Star, items: [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: '仪表盘' },
    { path: '/admin/projects', icon: Layers, label: '项目与阶段' },
  ] },
  { key: 'student', label: '学员管理', icon: Users, items: [
    { path: '/admin/students', icon: User, label: '学员管理' },
    { path: '/admin/groups', icon: UsersRound, label: '小组管理' },
  ] },
  { key: 'points', label: '积分管理', icon: TrendingUp, items: [
    { path: '/admin/points', icon: PlusCircle, label: '个人积分' },
    { path: '/admin/team-points', icon: UsersRound, label: '团队积分' },
    { path: '/admin/point-rules', icon: ScrollText, label: '积分规则' },
  ] },
  { key: 'mall', label: '商城管理', icon: ShoppingBag, items: [
    { path: '/admin/products', icon: Package, label: '商品管理' },
    { path: '/admin/redemptions', icon: ClipboardCheck, label: '兑换审核' },
    { path: '/admin/on-site', icon: Gift, label: '现场发放' },
  ] },
  { key: 'system', label: '系统', icon: FileText, items: [
    { path: '/admin/yearly', icon: Calendar, label: '年度数据汇总' },
    { path: '/admin/operation-logs', icon: FileText, label: '操作记录' },
  ] },
]

const studentNav = [
  { path: '/student/dashboard', icon: LayoutDashboard, label: '首页' },
  { path: '/student/points', icon: Sparkles, label: '我的项目' },
  { path: '/student/rankings', icon: Award, label: '项目排行榜' },
  { path: '/student/shop', icon: ShoppingBag, label: '积分商城' },
  { path: '/student/profile', icon: User, label: '个人中心' },
]

function SidebarGroup({ group, location }) {
  const hasActive = group.items.some((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
  const [open, setOpen] = useState(hasActive)
  return <div>
    <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600">
      <group.icon className="w-3.5 h-3.5" />{group.label}<ChevronDown className={`w-3 h-3 ml-auto transition-transform ${open ? '' : '-rotate-90'}`} />
    </button>
    {open && <div className="space-y-0.5 mt-0.5 mb-2">{group.items.map((item) => {
      const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
      return <Link key={item.path} to={item.path} className={`flex items-center gap-3 pl-7 pr-3 py-2 rounded-lg text-sm font-medium ${active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}>
        <item.icon className="w-3.5 h-3.5" />{item.label}
      </Link>
    })}</div>}
  </div>
}

function AdminLayout({ children, user, logout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const handleLogout = () => { logout(); navigate('/login') }
  return <div className="min-h-screen bg-gray-50 flex">
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-30">
      <div className="p-4 border-b border-gray-100"><Link to="/admin/dashboard" className="flex items-center gap-2.5"><div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center"><Shield className="w-4 h-4 text-white" /></div><div><h1 className="font-bold text-gray-900 text-sm">积分管理系统</h1><p className="text-[10px] text-gray-400">管理端</p></div></Link></div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">{adminGroups.map((group) => <SidebarGroup key={group.key} group={group} location={location} />)}</nav>
      <div className="p-3 border-t border-gray-100"><div className="flex items-center gap-2.5 px-2 py-1.5"><div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center"><User className="w-3.5 h-3.5 text-gray-500" /></div><div className="flex-1 min-w-0"><p className="text-xs font-medium text-gray-900 truncate">{user?.real_name}</p><p className="text-[10px] text-gray-400">管理员</p></div></div><button onClick={handleLogout} className="flex items-center gap-2 w-full px-2 py-1.5 mt-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"><LogOut className="w-3.5 h-3.5" />退出登录</button></div>
    </aside>
    <main className="flex-1 ml-60 min-h-screen"><div className="p-6">{children}</div></main>
  </div>
}

function StudentLayout({ children, user, logout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const initials = (user?.real_name || '学员').slice(-2)
  const isActive = (path) => location.pathname === path || (path !== '/student/dashboard' && location.pathname.startsWith(`${path}/`))
  const handleLogout = () => { logout(); navigate('/login') }

  return <div className="student-shell min-h-screen text-slate-900">
    <div className="student-aurora student-aurora-one" /><div className="student-aurora student-aurora-two" />
    <header className="student-topbar sticky top-0 z-40">
      <div className="mx-auto flex h-18 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        <Link to="/student/dashboard" className="flex items-center gap-3 shrink-0">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 shadow-lg shadow-indigo-500/25"><Sparkles className="h-5 w-5 text-white" /><span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-400" /></div>
          <div><p className="text-sm font-black tracking-wide text-slate-900">优才项目积分管理系统</p><p className="text-[10px] uppercase tracking-[0.24em] text-indigo-500">Talent Points Hub</p></div>
        </Link>
        <nav className="ml-auto hidden items-center gap-1 lg:flex">{studentNav.map((item) => <Link key={item.path} to={item.path} className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${isActive(item.path) ? 'bg-white/80 text-indigo-700 shadow-sm ring-1 ring-indigo-100' : 'text-slate-500 hover:bg-white/55 hover:text-slate-900'}`}><item.icon className="h-4 w-4" />{item.label}</Link>)}</nav>
        <div className="ml-3 hidden items-center gap-2 border-l border-white/60 pl-4 lg:flex">
          <Link to="/student/profile" className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/60"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white shadow-md">{initials}</div><div className="max-w-24"><p className="truncate text-xs font-bold text-slate-800">{user?.real_name || '学员'}</p><p className="text-[10px] text-slate-400">个人中心</p></div></Link>
          <button onClick={handleLogout} title="退出登录" className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"><LogOut className="h-4 w-4" /></button>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="ml-auto rounded-xl bg-white/60 p-2 lg:hidden">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {mobileOpen && <div className="border-t border-white/50 px-4 py-3 lg:hidden"><div className="mx-auto grid max-w-7xl grid-cols-2 gap-2">{studentNav.map((item) => <Link onClick={() => setMobileOpen(false)} key={item.path} to={item.path} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${isActive(item.path) ? 'bg-white text-indigo-700' : 'text-slate-600'}`}><item.icon className="h-4 w-4" />{item.label}</Link>)}<button onClick={handleLogout} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-500"><LogOut className="h-4 w-4" />退出登录</button></div></div>}
    </header>
    <main className="relative z-10 mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">{children}</main>
    <footer className="relative z-10 mx-auto max-w-7xl px-6 pb-8 pt-4 text-center text-xs text-slate-400">优才计划 · 优才计划PLUS 统一积分运营平台</footer>
  </div>
}

export default function AppLayout({ children }) {
  const { user, logout } = useAuth()
  return user?.role === 'admin' ? <AdminLayout user={user} logout={logout}>{children}</AdminLayout> : <StudentLayout user={user} logout={logout}>{children}</StudentLayout>
}
