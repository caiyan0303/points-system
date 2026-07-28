import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'

// Pages
import LoginPage from './pages/LoginPage'

// Student Pages
import StudentDashboard from './pages/student/Dashboard'
import StudentTeam from './pages/student/Team'
import StudentPoints from './pages/student/Points'
import StudentShop from './pages/student/Shop'
import StudentRedemptions from './pages/student/Redemptions'
import StudentHistory from './pages/student/History'
import StudentProfile from './pages/student/Profile'
import StudentRuleText from './pages/student/RuleText'

// Admin Pages
import AdminDashboard from './pages/admin/Dashboard'
import AdminStudents from './pages/admin/Students'
import AdminGroups from './pages/admin/Groups'
import AdminPhases from './pages/admin/Phases'
import AdminPointsAdd from './pages/admin/PointsAdd'
import AdminPointsRecords from './pages/admin/PointsRecords'
import AdminTeamPoints from './pages/admin/TeamPoints'
import AdminTeamPointsRecords from './pages/admin/TeamPointsRecords'
import AdminPointRules from './pages/admin/PointRules'
import AdminProducts from './pages/admin/Products'
import AdminRedemptions from './pages/admin/Redemptions'
import AdminOnSite from './pages/admin/OnSite'
import AdminYearly from './pages/admin/Yearly'
import AdminOperationLogs from './pages/admin/OperationLogs'
import AdminProjects from './pages/admin/ProjectsManage'

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
      <Route path="/student/team" element={<ProtectedRoute role="student"><StudentTeam /></ProtectedRoute>} />
      <Route path="/student/points" element={<ProtectedRoute role="student"><StudentPoints /></ProtectedRoute>} />
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
      <Route path="/admin/team-points" element={<ProtectedRoute role="admin"><AdminTeamPoints /></ProtectedRoute>} />
      <Route path="/admin/team-points/records" element={<ProtectedRoute role="admin"><AdminTeamPointsRecords /></ProtectedRoute>} />
      <Route path="/admin/point-rules" element={<ProtectedRoute role="admin"><AdminPointRules /></ProtectedRoute>} />
      <Route path="/admin/products" element={<ProtectedRoute role="admin"><AdminProducts /></ProtectedRoute>} />
      <Route path="/admin/redemptions" element={<ProtectedRoute role="admin"><AdminRedemptions /></ProtectedRoute>} />
      <Route path="/admin/on-site" element={<ProtectedRoute role="admin"><AdminOnSite /></ProtectedRoute>} />
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
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}
