import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAdminScope } from '../contexts/AdminScopeContext'
import {
  Calendar, ChevronDown, ClipboardCheck, FileText,
  LayoutDashboard, LogOut, Menu, Package, PlusCircle, ScrollText,
  ShoppingBag, Sparkles, TrendingUp, User, UsersRound, X,
  FolderKanban, Trophy, Database, Store, BarChart3,
} from 'lucide-react'

const adminGroups = [
  { key: 'information', label: '信息管理', icon: Database, items: [
    { path: '/admin/projects', icon: FolderKanban, label: '年度与项目' },
    { path: '/admin/students', aliases: ['/admin/groups'], icon: User, label: '学员与小组' },
  ] },
  { key: 'points', label: '积分管理', icon: TrendingUp, items: [
    { path: '/admin/dashboard', icon: BarChart3, label: '项目积分看板' },
    { path: '/admin/points', icon: PlusCircle, label: '个人积分' },
    { path: '/admin/team-points', icon: UsersRound, label: '团队积分' },
    { path: '/admin/point-rules', icon: ScrollText, label: '积分规则' },
  ] },
  { key: 'mall', label: '商城管理', icon: Store, items: [
    { path: '/admin/products', icon: Package, label: '商品管理' },
    { path: '/admin/redemptions', icon: ClipboardCheck, label: '兑换审核' },
  ] },
]

const studentNav = [
  { path: '/student/dashboard', icon: LayoutDashboard, label: '首页' },
  { path: '/student/points', icon: Sparkles, label: '我的项目' },
  { path: '/student/shop', icon: ShoppingBag, label: '积分商城' },
  { path: '/student/profile', icon: User, label: '个人中心' },
]

function SidebarGroup({ group, location }) {
  const isItemActive = (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`) || item.aliases?.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
  const hasActive = group.items.some(isItemActive)
  const [open, setOpen] = useState(hasActive)
  return <div>
    <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-black tracking-wider text-indigo-200 hover:text-white">
      <group.icon className="w-3.5 h-3.5" />{group.label}<ChevronDown className={`w-3 h-3 ml-auto transition-transform ${open ? '' : '-rotate-90'}`} />
    </button>
    {open && <div className="space-y-0.5 mt-0.5 mb-2">{group.items.map((item) => {
      const active = isItemActive(item)
      return <Link key={item.path} to={item.path} className={`flex items-center gap-3 pl-7 pr-3 py-2.5 rounded-xl text-sm font-semibold transition ${active ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-950/30' : 'text-indigo-100/70 hover:bg-white/10 hover:text-white'}`}>
        <item.icon className="w-3.5 h-3.5" />{item.label}
      </Link>
    })}</div>}
  </div>
}

function AdminLayout({ children, user, logout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { years, visibleProjects, yearId, projectId, setYearId, setProjectId, selectedProject, loading } = useAdminScope()
  const handleLogout = () => { logout(); navigate('/login') }
  const mallPage = ['/admin/products', '/admin/redemptions'].some((path) => location.pathname.startsWith(path))
  return <div className="min-h-screen bg-[#f4f6ff] flex text-slate-900">
    <aside className="w-64 bg-gradient-to-b from-[#121d46] via-[#111b3e] to-[#0b1330] text-white flex flex-col fixed inset-y-0 left-0 z-30 shadow-2xl shadow-indigo-950/20">
      <div className="p-5 border-b border-white/10"><Link to="/admin/dashboard" className="flex items-center gap-3"><div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 shadow-lg shadow-indigo-950/30"><Trophy className="h-5 w-5 text-white" /><span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#121d46] bg-amber-400" /></div><div><h1 className="font-black text-sm tracking-wide">优才项目积分管理系统</h1><p className="mt-0.5 text-[10px] uppercase tracking-[.2em] text-indigo-300">管理端</p></div></Link></div>
      <nav className="flex-1 p-3 pt-5 space-y-2 overflow-y-auto">{adminGroups.map((group) => <SidebarGroup key={group.key} group={group} location={location} />)}</nav>
      <div className="mx-3 mb-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3"><Link to="/admin/yearly" className="flex flex-col items-center gap-1 rounded-xl bg-white/5 px-2 py-2 text-[10px] text-indigo-200 hover:bg-white/10"><Calendar className="h-4 w-4" />年度汇总</Link><Link to="/admin/operation-logs" className="flex flex-col items-center gap-1 rounded-xl bg-white/5 px-2 py-2 text-[10px] text-indigo-200 hover:bg-white/10"><FileText className="h-4 w-4" />操作记录</Link></div>
      <div className="p-3 border-t border-white/10"><div className="flex items-center gap-2.5 px-2 py-2"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><User className="h-4 w-4 text-indigo-200" /></div><div className="flex-1 min-w-0"><p className="text-xs font-bold truncate">{user?.real_name}</p><p className="text-[10px] text-indigo-300">系统管理员</p></div></div><button onClick={handleLogout} className="flex items-center gap-2 w-full px-2 py-2 mt-1 text-xs text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl"><LogOut className="w-3.5 h-3.5" />退出登录</button></div>
    </aside>
    <main className="flex-1 ml-64 min-h-screen">
      <div className="sticky top-0 z-20 border-b border-indigo-100/80 bg-white/80 px-7 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-indigo-500">Management Console</p><p className="mt-0.5 text-sm font-bold text-slate-700">{mallPage ? '商城为全局数据，不受项目筛选影响' : selectedProject ? `当前管理范围：${selectedProject.name}` : '请先选择年度和培训项目'}</p></div>
          {!mallPage && <div className="flex items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-1.5">
            <span className="pl-2 text-xs font-bold text-slate-400">年度</span><select aria-label="管理年度" disabled={loading} value={yearId} onChange={(event) => setYearId(event.target.value)} className="rounded-xl border-0 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm outline-none"><option value="">请选择年度</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select>
            <span className="pl-1 text-xs font-bold text-slate-400">项目</span><select aria-label="管理项目" disabled={!yearId || loading} value={projectId} onChange={(event) => setProjectId(event.target.value)} className="min-w-44 rounded-xl border-0 bg-white px-3 py-2 text-xs font-bold text-indigo-700 shadow-sm outline-none disabled:text-slate-300"><option value="">请选择项目</option>{visibleProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          </div>}
        </div>
      </div>
      <div className="p-7">{children}</div>
    </main>
  </div>
}

function StudentLayout({ children, user, logout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const initials = (user?.real_name || '学员').slice(-2)
  const isActive = (path) => location.pathname === path || (path === '/student/points' && location.pathname.startsWith('/student/projects/')) || (path !== '/student/dashboard' && location.pathname.startsWith(`${path}/`))
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
