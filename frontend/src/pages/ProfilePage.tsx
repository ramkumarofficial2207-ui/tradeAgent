/* ProfilePage.tsx */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { User, Mail, Calendar, LogOut, TrendingUp, Heart, ShieldCheck, Zap } from 'lucide-react'

export default function ProfilePage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [stats, setStats] = useState<{ total: number; won: number; lost: number; winRate: number } | null>(null)
    const [watchlistCount, setWatchlistCount] = useState(0)

    useEffect(() => {
        axios.get('/api/performance').then(({ data }) => {
            if (data.success) setStats(data.data.stats)
        }).catch(() => { })
        axios.get('/api/watchlist').then(({ data }) => {
            if (data.success) setWatchlistCount(data.data.length)
        }).catch(() => { })
    }, [])

    const handleLogout = () => {
        logout()
        navigate('/login', { replace: true })
    }

    if (!user) return null

    const initials = (user.name || user.email).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

    return (
        <div style={{ padding: '32px 28px', maxWidth: 700, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 900, color: '#fff', flexShrink: 0, boxShadow: '0 0 24px rgba(124,58,237,0.35)' }}>
                    {initials}
                </div>
                <div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4 }}>{user.name || 'Trader'}</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        <Mail size={12} />
                        {user.email}
                    </div>
                </div>
                <button onClick={handleLogout} className="btn btn-ghost" style={{ marginLeft: 'auto', gap: 6, color: '#f87171', borderColor: 'rgba(239,68,68,0.25)' }}>
                    <LogOut size={14} /> Sign Out
                </button>
            </div>

            {/* Info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                {[
                    { icon: <Calendar size={18} />, label: 'Member Since', value: new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), color: '#60a5fa' },
                    { icon: <TrendingUp size={18} />, label: 'Setups Tracked', value: stats ? String(stats.total) : '—', color: '#34d399' },
                    { icon: <ShieldCheck size={18} />, label: 'Win Rate', value: stats && (stats.won + stats.lost) > 0 ? `${stats.winRate.toFixed(1)}%` : 'No data yet', color: '#a78bfa' },
                    { icon: <Heart size={18} />, label: 'Watchlist', value: `${watchlistCount} stocks`, color: '#f87171' },
                ].map(card => (
                    <div key={card.label} className="card" style={{ padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ color: card.color }}>{card.icon}</div>
                        <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{card.label}</div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 900, color: card.color, marginTop: 2 }}>{card.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick actions */}
            <div className="card" style={{ padding: '20px 20px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', marginBottom: 14 }}>Quick Actions</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => navigate('/')} className="btn btn-primary" style={{ gap: 6, fontSize: '0.78rem' }}>
                        <Zap size={13} /> Run Scanner
                    </button>
                    <button onClick={() => navigate('/watchlist')} className="btn btn-ghost" style={{ gap: 6, fontSize: '0.78rem' }}>
                        <Heart size={13} /> My Watchlist
                    </button>
                    <button onClick={handleLogout} className="btn btn-ghost" style={{ gap: 6, fontSize: '0.78rem', color: '#f87171' }}>
                        <LogOut size={13} /> Sign Out
                    </button>
                </div>
            </div>

            <p style={{ textAlign: 'center', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 24 }}>
                StockSage AI · For research and education only · Not financial advice
            </p>
        </div>
    )
}
