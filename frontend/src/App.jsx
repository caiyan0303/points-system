import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AdminScopeProvider } from './contexts/AdminScopeContext'
import ErrorBoundary from './components/ErrorBoundary'

// Pages
const LoginPage = lazy(() => import('./pages/LoginPage'))

// Student Pages
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'))
const StudentProjects = lazy(() => import('./pages/student/Projects'))
const StudentProjectWorkspace = lazy(() => import('./pages/student/ProjectWorkspace'))
const StudentShop = lazy(() => import('./pages/student/Shop'))
const StudentRedemptions = lazy(() => import('./pages/student/Redemptions'))
const StudentHistory = lazy(() => import('./pages/student/History'))
const StudentProfile = lazy(() => import('./pages/student/Profile'))
const StudentRuleText = lazy(() => import('./pages/student/RuleText'))
const StudentRankings = lazy(() => import('./pages/student/Rankings'))

// Admin Pages
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminStudents = lazy(() => import('./pages/admin/Students'))
const AdminGroups = lazy(() => import('./pages/admin/Groups'))
const AdminPhases = lazy(() => import('./pages/admin/Phases'))
const AdminPointsAdd = lazy(() => import('./pages/admin/PointsAdd'))
const AdminPointsRecords = lazy(() => import('./pages/admin/PointsRecords'))
const AdminPointsSummary = lazy(() => import('./pages/admin/PointsSummary'))
const AdminTeamPoints = lazy(() => import('./pages/admin/TeamPoints'))
const AdminTeamPointsRecords = lazy(() => import('./pages/admin/TeamPointsRecords'))
const AdminPointRules = lazy(() => import('./pages/admin/PointRules'))
const AdminProducts = lazy(() => import('./pages/admin/Products'))
const AdminRedemptions = lazy(() => import('./pages/admin/Redemptions'))
const AdminYearly = lazy(() => import('./pages/admin/Yearly'))
const AdminOperationLogs = lazy(() => import('./pages/admin/OperationLogs'))
const AdminProjects = lazy(() => import('./pages/admin/ProjectsManage'))

const W = (C) => <ErrorBoundary><C /></ErrorBoundary>

function ProtectedRoute({ children, role }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard'} replace />
  }
  return <ErrorBoundary>{children}</ErrorBoundary>
}

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard'} replace /> : W(LoginPage)
      } />

      <Route path="/student/dashboard" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
      <Route path="/student/phases" element={<ProtectedRoute role="student"><Navigate to="/student/points" replace /></ProtectedRoute>} />
      <Route path="/student/team" element={<ProtectedRoute role="student"><Navigate to="/student/points" replace /></ProtectedRoute>} />
      <Route path="/student/points" element={<ProtectedRoute role="student"><StudentProjects /></ProtectedRoute>} />
      <Route path="/student/projects/:projectId" element={<ProtectedRoute role="student"><StudentProjectWorkspace /></ProtectedRoute>} />
      <Route path="/student/projects/:projectId/personal" element={<ProtectedRoute role="student"><StudentProjectWorkspace view="personal" /></ProtectedRoute>} />
      <Route path="/student/projects/:projectId/team" element={<ProtectedRoute role="student"><StudentProjectWorkspace view="team" /></ProtectedRoute>} />
      <Route path="/student/rankings" element={<ProtectedRoute role="student"><StudentRankings /></ProtectedRoute>} />
      <Route path="/student/shop" element={<ProtectedRoute role="student"><StudentShop /></ProtectedRoute>} />
      <Route path="/student/redemptions" element={<ProtectedRoute role="student"><StudentRedemptions /></ProtectedRoute>} />
      <Route path="/student/history" element={<ProtectedRoute role="student"><StudentHistory /></ProtectedRoute>} />
      <Route path="/student/rule-text" element={<ProtectedRoute role="student"><StudentRuleText /></ProtectedRoute>} />
      <Route path="/student/profile" element={<ProtectedRoute role="student"><StudentProfile /></ProtectedRoute>} />

      <Route path="/admin/dashboard" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/projects" element={<ProtectedRoute role="admin"><AdminProjects /></ProtectedRoute>} />
      <Route path="/admin/students" element={<ProtectedRoute role="admin"><AdminStudents /></ProtectedRoute>} />
      <Route path="/admin/groups" element={<ProtectedRoute role="admin"><AdminGroups /></ProtectedRoute>} />
      <Route path="/admin/phases" element={<ProtectedRoute role="admin"><AdminPhases /></ProtectedRoute>} />
      <Route path="/admin/points" element={<ProtectedRoute role="admin"><AdminPointsAdd /></ProtectedRoute>} />
      <Route path="/admin/points/records" element={<ProtectedRoute role="admin"><AdminPointsRecords /></ProtectedRoute>} />
      <Route path="/admin/points/summary" element={<ProtectedRoute role="admin"><AdminPointsSummary type="personal" /></ProtectedRoute>} />
      <Route path="/admin/team-points" element={<ProtectedRoute role="admin"><AdminTeamPoints /></ProtectedRoute>} />
      <Route path="/admin/team-points/records" element={<ProtectedRoute role="admin"><AdminTeamPointsRecords /></ProtectedRoute>} />
      <Route path="/admin/team-points/summary" element={<ProtectedRoute role="admin"><AdminPointsSummary type="team" /></ProtectedRoute>} />
      <Route path="/admin/point-rules" element={<ProtectedRoute role="admin"><AdminPointRules /></ProtectedRoute>} />
      <Route path="/admin/products" element={<ProtectedRoute role="admin"><AdminProducts /></ProtectedRoute>} />
      <Route path="/admin/redemptions" element={<ProtectedRoute role="admin"><AdminRedemptions /></ProtectedRoute>} />
      <Route path="/admin/on-site" element={<ProtectedRoute role="admin"><Navigate to="/admin/products" replace /></ProtectedRoute>} />
      <Route path="/admin/yearly" element={<ProtectedRoute role="admin"><AdminYearly /></ProtectedRoute>} />
      <Route path="/admin/operation-logs" element={<ProtectedRoute role="admin"><AdminOperationLogs /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AdminScopeProvider>
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-bold text-indigo-600">页面加载中…</div>}>
            <AppRoutes />
          </Suspense>
        </AdminScopeProvider>
      </AuthProvider>
    </HashRouter>
  )
}
