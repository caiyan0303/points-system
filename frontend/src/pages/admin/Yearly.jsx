import { useEffect, useMemo, useState } from 'react'
import api from '../../api'
import AppLayout from '../../components/AppLayout'
import {
  Archive, Award, ChevronDown, ChevronRight, FolderKanban,
  Gift, Layers, ListChecks, TrendingDown, TrendingUp, Users,
} from 'lucide-react'

const number = (value) => Number(value || 0).toLocaleString('zh-CN')

export default function AdminYearly() {
  const [years, setYears] = useState([])
  const [scopeNote, setScopeNote] = useState('')
  const [expandedYear, setExpandedYear] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/api/admin/yearly/overview')
      .then(({ data }) => {
        setYears(data.years || [])
        setScopeNote(data.scope_note || '')
        setExpandedYear(data.years?.[0]?.year_id || null)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.response?.data?.detail || '年度数据加载失败')
        setLoading(false)
      })
  }, [])

  const totals = useMemo(() => years.reduce((summary, year) => ({
    projects: summary.projects + (year.project_count || 0),
    students: summary.students + (year.student_count || 0),
    earned: summary.earned + (year.earned_points || 0),
    redemptions: summary.redemptions + (year.redemption_count || 0),
  }), { projects: 0, students: 0, earned: 0, redemptions: 0 }), [years])

  return (
    <AppLayout>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">年度数据汇总</h1>
            <p className="text-gray-500 mt-1">沉淀已归档项目的学员、阶段、积分、兑换和奖励数据</p>
          </div>
        </div>
        {scopeNote && (
          <div className="mt-4 px-4 py-3 bg-amber-50 border border-amber-100 text-amber-700 rounded-lg text-sm">
            {scopeNote}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48 text-red-500">{error}</div>
      ) : years.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <Archive className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-700">暂无可汇总的年度数据</p>
          <p className="text-sm text-gray-400 mt-1">项目归档后，会自动出现在这里</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <SummaryCard icon={FolderKanban} label="已归档项目" value={totals.projects} tone="indigo" />
            <SummaryCard icon={Users} label="覆盖学员" value={totals.students} tone="blue" />
            <SummaryCard icon={TrendingUp} label="累计获得积分" value={number(totals.earned)} tone="green" />
            <SummaryCard icon={Gift} label="兑换申请" value={totals.redemptions} tone="orange" />
          </div>

          <div className="space-y-4">
            {years.map((year) => {
              const expanded = expandedYear === year.year_id
              const maxCategoryPoints = Math.max(...(year.categories || []).map(item => item.points || 0), 1)
              return (
                <section key={year.year_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedYear(expanded ? null : year.year_id)}
                    className="w-full px-6 py-5 flex items-center gap-4 hover:bg-gray-50 text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </div>
                    <div className="min-w-[150px]">
                      <h2 className="text-lg font-semibold text-gray-900">{year.year_name}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        已归档 {year.project_count} / 全部 {year.total_project_count} 个项目
                      </p>
                    </div>
                    <div className="grid grid-cols-5 gap-7 flex-1">
                      <CompactMetric label="学员" value={year.student_count} />
                      <CompactMetric label="小组" value={year.group_count} />
                      <CompactMetric label="阶段" value={year.phase_count} />
                      <CompactMetric label="获得积分" value={number(year.earned_points)} accent />
                      <CompactMetric label="兑换积分" value={number(year.redeemed_points)} />
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-gray-100 bg-gray-50 p-6 space-y-6">
                      <div className="grid grid-cols-6 gap-3">
                        <DetailMetric icon={TrendingUp} label="获得积分" value={number(year.earned_points)} color="text-green-600" />
                        <DetailMetric icon={TrendingDown} label="扣减积分" value={number(year.deducted_points)} color="text-red-500" />
                        <DetailMetric icon={ListChecks} label="积分记录" value={number(year.point_records)} color="text-indigo-600" />
                        <DetailMetric icon={Gift} label="兑换次数" value={number(year.redemption_count)} color="text-orange-600" />
                        <DetailMetric icon={Award} label="奖励发放" value={number(year.award_count)} color="text-yellow-600" />
                        <DetailMetric icon={Layers} label="净积分" value={number(year.net_points)} color="text-blue-600" />
                      </div>

                      <div className="grid grid-cols-2 gap-5">
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                          <h3 className="font-semibold text-gray-900 mb-4">积分来源分布</h3>
                          {(year.categories || []).length === 0 ? (
                            <p className="text-sm text-gray-400 py-8 text-center">暂无积分分类数据</p>
                          ) : (
                            <div className="space-y-3">
                              {year.categories.map((item) => (
                                <div key={item.category}>
                                  <div className="flex items-center justify-between text-sm mb-1.5">
                                    <span className="text-gray-600">{item.category}</span>
                                    <span className="font-medium text-gray-900">{number(item.points)} 分 · {item.records} 条</span>
                                  </div>
                                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.max((item.points / maxCategoryPoints) * 100, 4)}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                          <h3 className="font-semibold text-gray-900 mb-4">归档项目明细</h3>
                          <div className="space-y-3">
                            {(year.projects || []).map((project) => (
                              <div key={project.id} className="p-3 rounded-lg border border-gray-100 bg-gray-50">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium text-gray-900">{project.name}</span>
                                  <span className="text-sm font-semibold text-indigo-600">{number(project.earned_points)} 分</span>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-xs text-gray-500">
                                  <span>{project.student_count} 学员</span>
                                  <span>{project.group_count} 小组</span>
                                  <span>{project.phase_count} 阶段</span>
                                  <span>{project.point_records} 条记录</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </AppLayout>
  )
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
    </div>
  )
}

function CompactMetric({ label, value, accent = false }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-base font-semibold mt-1 ${accent ? 'text-indigo-600' : 'text-gray-800'}`}>{value || 0}</p>
    </div>
  )
}

function DetailMetric({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <Icon className={`w-4 h-4 mb-2 ${color}`} />
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}
