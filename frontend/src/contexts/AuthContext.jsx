import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })

  const login = async (username, password, role) => {
    const { data } = await api.post('/api/auth/login', { username, password, role })
    localStorage.setItem('token', data.access_token)
    const userData = {
      id: data.user_id,
      role: data.role,
      real_name: data.real_name,
    }
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  useEffect(() => {
    if (!user) return
    api.get('/api/auth/me').then(({ data }) => {
      const updated = { ...user, ...data }
      setUser(updated)
      localStorage.setItem('user', JSON.stringify(updated))
    }).catch(() => {})
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
