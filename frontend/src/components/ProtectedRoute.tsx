// ProtectedRoute.tsx — Redirects to /login if not authenticated
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth()

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(124,58,237,0.2)', borderTop: '3px solid #7c3aed', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading StockSage AI...</div>
                </div>
            </div>
        )
    }

    return user ? <>{children}</> : <Navigate to="/login" replace />
}
