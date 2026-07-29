import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api'
import { useAuth } from './AuthContext'

const AdminScopeContext = createContext(null)
const YEAR_KEY = 'admin_scope_year_id'
const PROJECT_KEY = 'admin_scope_project_id'

export function AdminScopeProvider({ children }) {
  const { user } = useAuth()
  const [years, setYears] = useState([])
  const [projects, setProjects] = useState([])
  const [yearId, setYearIdState] = useState(() => localStorage.getItem(YEAR_KEY) || '')
  const [projectId, setProjectIdState] = useState(() => localStorage.getItem(PROJECT_KEY) || '')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user?.role !== 'admin') return
    setLoading(true)
    Promise.all([api.get('/api/common/years'), api.get('/api/common/projects')])
      .then(([yearRes, projectRes]) => {
        const nextYears = yearRes.data?.items || yearRes.data || []
        const nextProjects = projectRes.data?.items || projectRes.data || []
        setYears(nextYears)
        setProjects(nextProjects)

        const storedProject = nextProjects.find((item) => String(item.id) === String(localStorage.getItem(PROJECT_KEY) || ''))
        const preferredProject = storedProject || nextProjects.find((item) => ['进行中', 'active'].includes(item.status)) || nextProjects[0]
        if (preferredProject) {
          setProjectIdState(String(preferredProject.id))
          setYearIdState(String(preferredProject.year_id))
          localStorage.setItem(PROJECT_KEY, String(preferredProject.id))
          localStorage.setItem(YEAR_KEY, String(preferredProject.year_id))
        } else {
          const preferredYear = nextYears.find((item) => ['进行中', 'active'].includes(item.status)) || nextYears[0]
          if (preferredYear) setYearIdState(String(preferredYear.id))
        }
      })
      .finally(() => setLoading(false))
  }, [user?.role])

  const visibleProjects = useMemo(
    () => yearId ? projects.filter((item) => String(item.year_id) === String(yearId)) : projects,
    [projects, yearId],
  )

  const setYearId = (value) => {
    const next = String(value || '')
    setYearIdState(next)
    setProjectIdState('')
    if (next) localStorage.setItem(YEAR_KEY, next)
    else localStorage.removeItem(YEAR_KEY)
    localStorage.removeItem(PROJECT_KEY)
  }

  const setProjectId = (value) => {
    const next = String(value || '')
    setProjectIdState(next)
    if (next) {
      localStorage.setItem(PROJECT_KEY, next)
      const project = projects.find((item) => String(item.id) === next)
      if (project) {
        setYearIdState(String(project.year_id))
        localStorage.setItem(YEAR_KEY, String(project.year_id))
      }
    } else localStorage.removeItem(PROJECT_KEY)
  }

  const value = {
    years,
    projects,
    visibleProjects,
    yearId,
    projectId,
    setYearId,
    setProjectId,
    selectedYear: years.find((item) => String(item.id) === String(yearId)) || null,
    selectedProject: projects.find((item) => String(item.id) === String(projectId)) || null,
    loading,
  }

  return <AdminScopeContext.Provider value={value}>{children}</AdminScopeContext.Provider>
}

export function useAdminScope() {
  const value = useContext(AdminScopeContext)
  if (!value) throw new Error('useAdminScope must be used inside AdminScopeProvider')
  return value
}
