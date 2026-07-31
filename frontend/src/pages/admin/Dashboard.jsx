import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import AdminLeaderboardCenter from '../../components/AdminLeaderboardCenter'
import { useAdminScope } from '../../contexts/AdminScopeContext'
import { rewardPolicyFor } from '../../utils/rewardPolicy'
import {
  ArrowRight, Award, Crown, Download, FileSpreadsheet, Gift,
  Layers, PlusCircle, RefreshCw, Sparkles, Trophy, Users, UsersRound,
} from 'lucide-react'

const number = (value) => Number(value || 0)
const showLegacyRankings = false
const dateText = (value) => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'
const errorText = (detail, fallback) => {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || String(item)).join('；')
  return fallback
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { yearId, projectId, selectedYear, selectedProject } = useAdminScope()
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const rewardPolicy = useMemo(() => rewardPolicyFor(selectedProject?.name), [selectedProject?.name])

  const loadProjectDashboard = useCallback(async () => {
    if (!projectId) { setDashboard(null); return }
    setLoading(true)
    setError('')
    try {
      const params = { year_id: yearId, project_id: projectId }
      const [phaseRes, groupRes, summaryRes, pointRes, teamPointRes] = await Promise.all([
        api.get('/api/admin/phases', { params }),
        api.get('/api/admin/groups', { params }),
        api.get('/api/admin/project-summary', { params }),
        api.get('/api/admin/points/records', { params: { ...params, page: 1, page_size: 10 } }),
        api.get('/api/admin/team-points', { params: { project_id: projectId, page: 1, page_size: 10 } }).catch(() => ({ data: { items: [] } })),
      ])
      const phases = phaseRes.data?.items || phaseRes.data || []
      const groups = groupRes.data?.items || groupRes.data || []
      const projectSummary = summaryRes.data || {}
      const personalRecords = pointRes.data?.items || pointRes.data || []
      const teamRecords = teamPointRes.data?.items || teamPointRes.data || []
      const rankingEntries = await Promise.all(phases.map(async (phase) => {
        try {
          const [personalRes, teamRes] = await Promise.all([
            api.get(`/api/admin/phases/${phase.id}/ranking`),
            api.get(`/api/admin/phases/${phase.id}/group-ranking`),
          ])
          return [String(phase.id), {
            personal: personalRes.data?.items || personalRes.data || [],
            team: teamRes.data?.items || teamRes.data || [],
          }]
        } catch { return [String(phase.id), { personal: [], team: [] }] }
      }))
      setDashboard({ phases, groups, projectSummary, personalRecords, teamRecords, phaseRankings: Object.fromEntries(rankingEntries) })
    } catch (err) {
      setError(errorText(err.response?.data?.detail, '项目积分看板加载失败'))
    } finally { setLoading(false) }
  }, [yearId, projectId])

  useEffect(() => { loadProjectDashboard() }, [loadProjectDashboard])

  const teamWinners = useMemo(() => (dashboard?.groups || [])
    .map((group) => { const finalScore = number(group.final_score ?? group.total_points); return { ...group, personal_points: group.personal_points ?? Math.max(0, finalScore - number(group.team_points)) } })
    .sort((a, b) => number(b.final_score ?? b.total_points) - number(a.final_score ?? a.total_points))
    .slice(0, rewardPolicy.projectGroupCount), [dashboard, rewardPolicy.projectGroupCount])

  const personalWinners = useMemo(() => (dashboard?.projectSummary?.personal_winners || [])
    .slice(0, rewardPolicy.projectPersonalCount), [dashboard, rewardPolicy.projectPersonalCount])

  const summary = useMemo(() => {
    const groups = dashboard?.groups || []
    return {
      students: number(dashboard?.projectSummary?.student_count),
      groups: groups.length,
      personalPoints: number(dashboard?.projectSummary?.personal_points),
      availablePoints: number(dashboard?.projectSummary?.available_points),
      teamPoints: groups.reduce((sum, item) => sum + number(item.team_points), 0),
    }
  }, [dashboard])

  const activities = useMemo(() => [
    ...(dashboard?.personalRecords || []).map((item) => ({ ...item, type: '个人', owner: item.student_name, label: item.category || '个人积分' })),
    ...(dashboard?.teamRecords || []).map((item) => ({ ...item, type: '小组', owner: item.group_name, label: item.category || '小组积分' })),
  ].sort((a, b) => new Date(b.created_at || b.obtained_date || 0) - new Date(a.created_at || a.obtained_date || 0)).slice(0, 10), [dashboard])

  const handleExportAll = async () => {
    setExporting(true); setExportMessage('')
    try {
      const { data } = await api.get('/api/admin/export/all-data')
      const workbook = XLSX.utils.book_new()
      data.sheets.forEach((sheet) => {
        const rows = Array.isArray(sheet.rows) ? sheet.rows : []
        const worksheet = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['暂无数据']])
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31))
      })
      XLSX.writeFile(workbook, data.filename || '优才项目积分管理系统全部数据.xlsx')
      setExportMessage('全部数据已导出')
    } catch (err) { setExportMessage(err.response?.data?.detail || '导出失败') }
    finally { setExporting(false); setTimeout(() => setExportMessage(''), 3500) }
  }

  const quickActions = [
    { label: '个人积分录入', icon: PlusCircle, path: '/admin/points', tone: 'from-indigo-500 to-blue-500' },
    { label: '个人积分流水', icon: FileSpreadsheet, path: '/admin/points/records', tone: 'from-blue-500 to-cyan-500' },
    { label: '小组积分录入', icon: UsersRound, path: '/admin/team-points', tone: 'from-violet-500 to-fuchsia-500' },
    { label: '小组积分流水', icon: FileSpreadsheet, path: '/admin/team-points/records', tone: 'from-fuchsia-500 to-pink-500' },
    { label: '学员积分汇总', icon: Users, path: '/admin/students', tone: 'from-emerald-500 to-teal-500' },
    { label: '兑换审核', icon: Gift, path: '/admin/redemptions', tone: 'from-orange-400 to-rose-500' },
  ]

  return <AppLayout>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-indigo-500"><Sparkles className="h-4 w-4" />Project Points Board</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">项目积分看板</h1><p className="mt-2 text-sm text-slate-500">查看各阶段个人冠军、小组冠军和项目积分运营概况。</p></div>
      <div className="flex items-center gap-2">{exportMessage && <span className="text-xs font-bold text-emerald-600">{exportMessage}</span>}<button onClick={loadProjectDashboard} disabled={!projectId || loading} className="rounded-xl border border-indigo-100 bg-white p-2.5 text-indigo-600 shadow-sm disabled:opacity-40" title="刷新数据"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button><button onClick={handleExportAll} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-indigo-200 disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? '导出中…' : '导出全部数据'}</button></div>
    </div>

    {!projectId ? <div className="rounded-[28px] border border-dashed border-indigo-200 bg-white/70 px-8 py-20 text-center shadow-sm"><Layers className="mx-auto h-12 w-12 text-indigo-300" /><h2 className="mt-4 text-xl font-black text-slate-800">请先选择年度和培训项目</h2><p className="mt-2 text-sm text-slate-500">选择后才能查看排行榜、积分汇总并进入个人或小组积分管理。</p></div> : loading && !dashboard ? <div className="flex h-80 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-b-indigo-600" /></div> : error ? <div className="rounded-2xl bg-rose-50 p-8 text-center text-sm font-bold text-rose-600">{error}</div> : dashboard && <>
      <section className="relative mb-5 overflow-hidden rounded-[28px] border border-indigo-400/40 bg-gradient-to-r from-indigo-700 via-violet-700 to-blue-600 p-6 text-white shadow-2xl shadow-indigo-300/40">
        <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" /><div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-fuchsia-300/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between"><div className="shrink-0"><p className="text-xs font-bold text-indigo-100">{selectedYear?.name}</p><h2 className="mt-1 text-2xl font-black text-white">{selectedProject?.name}</h2><p className="mt-2 text-xs text-indigo-100/80">{selectedProject?.start_date ? new Date(selectedProject.start_date).toLocaleDateString('zh-CN') : '未设置开始时间'} — {selectedProject?.end_date ? new Date(selectedProject.end_date).toLocaleDateString('zh-CN') : '未设置结束时间'}</p></div><div className="grid w-full grid-cols-2 gap-3 2xl:max-w-3xl">{[
          ['参与人数', summary.students, '人'], ['项目小组', summary.groups, '组'], ['项目个人积分', summary.personalPoints, '分'], ['可兑换积分', summary.availablePoints, '分'],
        ].map(([label, value, unit]) => <div key={label} className="rounded-2xl border border-white/25 bg-white/14 px-4 py-3 text-center shadow-sm backdrop-blur"><p className="text-[11px] font-bold text-indigo-100">{label}</p><p className="mt-1 text-xl font-black text-white">{value.toLocaleString()}<span className="ml-1 text-[10px] text-indigo-100">{unit}</span></p></div>)}</div></div>
      </section>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3"><div><p className="text-xs font-black text-violet-500">{rewardPolicy.isPlus ? '优才计划PLUS奖励规则' : '优才计划奖励规则'}</p><p className="mt-1 text-sm font-black text-violet-800">{rewardPolicy.summary}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-violet-600 shadow-sm">已按当前项目自动匹配</span></div>

      <AdminLeaderboardCenter
        phases={dashboard.phases}
        phaseRankings={dashboard.phaseRankings}
        personalRows={dashboard.projectSummary?.personal_ranking || []}
        groupRows={dashboard.groups}
      />

      {showLegacyRankings && <><section className="mb-5 rounded-[28px] border border-indigo-100 bg-white p-6 shadow-xl shadow-indigo-100/30"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-indigo-500">Project Personal Top 3</p><h2 className="mt-1 text-xl font-black text-slate-900">项目个人前三名</h2></div><Award className="h-8 w-8 text-indigo-300" /></div><div className="grid gap-3 md:grid-cols-3">{personalWinners.map((student, index) => <div key={student.id || student.student_id} className="flex items-center gap-3 rounded-2xl bg-indigo-50/70 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-black text-indigo-600 shadow-sm">NO.{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-black text-slate-800">{student.real_name || student.student_name}</p><p className="mt-1 text-xs text-slate-400">{student.group_name || '暂未分组'}</p></div><strong className="text-lg text-indigo-600">{number(student.period_points ?? student.project_points)} 分</strong></div>)}{!personalWinners.length && <p className="py-6 text-sm text-slate-400">当前项目暂无个人积分数据</p>}</div></section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[1.65fr_.75fr]">
        <div className="rounded-[28px] border border-indigo-100 bg-white p-6 shadow-xl shadow-indigo-100/30"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-indigo-500">Phase Champions</p><h2 className="mt-1 text-xl font-black text-slate-900">各阶段{rewardPolicy.phaseAwardType === 'group' ? '小组' : '个人'}第一名</h2></div><button onClick={() => navigate('/admin/phases')} className="inline-flex items-center gap-1 text-xs font-black text-indigo-600">阶段管理 <ArrowRight className="h-3.5 w-3.5" /></button></div><div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{dashboard.champions.map(({ phase, champion }, index) => { const championName = rewardPolicy.phaseAwardType === 'group' ? (champion?.group_name || champion?.name) : (champion?.student_name || champion?.real_name); return <div key={phase.id} className={`relative overflow-hidden rounded-3xl border p-5 ${champion ? 'border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50' : 'border-slate-100 bg-slate-50'}`}><div className="relative"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-violet-600 shadow-sm">第{index + 1}阶段</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${['进行中', 'in_progress'].includes(phase.status) ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{phase.status}</span></div><p className="mt-3 truncate text-sm font-black text-slate-800">{phase.name}</p>{champion ? <div className="mt-5 flex items-center gap-3"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-xl font-black text-white"><Crown className="h-6 w-6" /></div><div className="min-w-0 flex-1"><p className="truncate text-base font-black text-slate-900">{championName}</p></div><strong className="text-2xl font-black text-violet-600">{number(champion.final_score ?? champion.total_points ?? champion.points)}<span className="ml-1 text-xs">分</span></strong></div> : <p className="mt-8 text-center text-xs text-slate-400">本阶段暂无排名数据</p>}</div></div> })}</div></div>
        <div className="rounded-[28px] border border-indigo-100 bg-white p-6 shadow-xl shadow-indigo-100/30"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-indigo-500">Project Group Winners</p><h2 className="mt-1 text-xl font-black text-slate-900">项目小组{rewardPolicy.projectGroupCount === 1 ? '第一名' : '前三名'}</h2></div><Trophy className="h-9 w-9 text-indigo-300" /></div><div className="mt-5 space-y-3">{teamWinners.map((group, index) => <div key={group.id || group.group_id} className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><span className="text-[10px] font-black text-indigo-500">NO.{index + 1}</span><h3 className="mt-1 text-lg font-black text-slate-900">{group.name || group.group_name}</h3></div><p className="text-xl font-black text-indigo-600">{number(group.final_score ?? group.total_points)}<span className="ml-1 text-xs">分</span></p></div><p className="mt-2 text-xs text-slate-400">成员个人积分 {number(group.personal_points)} ＋ 小组积分 {number(group.team_points)}</p></div>)}{!teamWinners.length && <p className="py-10 text-center text-sm text-slate-400">当前项目暂无小组数据</p>}</div><button onClick={() => navigate('/admin/team-points/summary')} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-700 hover:bg-indigo-100">查看小组积分 <ArrowRight className="h-4 w-4" /></button></div>
      </section></>}

      <section className="grid gap-5 xl:grid-cols-[1.6fr_.8fr]">
        <div className="rounded-[28px] border border-indigo-100 bg-white p-6 shadow-xl shadow-indigo-100/30"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-600">Latest Activities</p><h2 className="mt-1 text-xl font-black text-slate-900">积分动态（最近10条）</h2></div></div>{activities.length ? <div className="grid gap-x-6 md:grid-cols-2">{activities.map((item) => <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 border-b border-slate-50 py-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.type === '小组' ? 'bg-violet-100 text-violet-600' : 'bg-indigo-100 text-indigo-600'}`}>{item.type === '小组' ? <UsersRound className="h-4 w-4" /> : <Award className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{item.owner || '未知对象'} <span className="ml-1 text-xs font-bold text-slate-400">获得</span> <span className={item.type === '小组' ? 'text-violet-600' : 'text-indigo-600'}>{number(item.points) > 0 ? '+' : ''}{number(item.points)} 分</span></p><p className="mt-1 truncate text-[11px] text-slate-400">{item.label} · {item.phase_name || '未关联阶段'}</p></div><span className="shrink-0 text-[10px] text-slate-400">{dateText(item.created_at || item.obtained_date)}</span></div>)}</div> : <p className="py-12 text-center text-sm text-slate-400">当前项目暂无积分动态</p>}</div>
        <div className="rounded-[28px] border border-indigo-100 bg-white p-6 shadow-xl shadow-indigo-100/30"><p className="text-xs font-black uppercase tracking-[.16em] text-indigo-500">Quick Access</p><h2 className="mt-1 text-xl font-black text-slate-900">快捷入口</h2><div className="mt-5 grid grid-cols-2 gap-3">{quickActions.map((action) => <button key={action.label} onClick={() => navigate(action.path)} className="group rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-lg"><span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${action.tone} text-white shadow-md`}><action.icon className="h-4 w-4" /></span><p className="mt-3 text-xs font-black text-slate-700 group-hover:text-indigo-700">{action.label}</p></button>)}</div></div>
      </section>
    </>}
  </AppLayout>
}
