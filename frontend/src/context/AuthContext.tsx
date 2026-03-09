// AuthContext.tsx — Global auth state for the entire app
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import axios from 'axios'

interface User {
    id: string
    name: string | null
    email: string
    createdAt: string
}

interface AuthContextValue {
    user: User | null
    token: string | null
    loading: boolean
    login: (token: string, user: User) => void
    logout: () => void
}

const AuthContext = createContext<AuthContextValue>({
    user: null, token: null, loading: true,
    login: () => { }, logout: () => { },
})

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [token, setToken] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    // Restore session from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('stocksage_token')
        if (!stored) { setLoading(false); return }
        axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${stored}` } })
            .then(({ data }) => {
                if (data.success) { setToken(stored); setUser(data.user) }
                else localStorage.removeItem('stocksage_token')
            })
            .catch(() => localStorage.removeItem('stocksage_token'))
            .finally(() => setLoading(false))
    }, [])

    const login = (tok: string, usr: User) => {
        setToken(tok)
        setUser(usr)
        localStorage.setItem('stocksage_token', tok)
        axios.defaults.headers.common['Authorization'] = `Bearer ${tok}`
    }

    const logout = () => {
        setToken(null)
        setUser(null)
        localStorage.removeItem('stocksage_token')
        delete axios.defaults.headers.common['Authorization']
        axios.post('/api/auth/logout').catch(() => { })
    }

    // Set axios Authorization header whenever token changes
    useEffect(() => {
        if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
        else delete axios.defaults.headers.common['Authorization']
    }, [token])

    return (
        <AuthContext.Provider value={{ user, token, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
