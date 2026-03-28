/* ProfilePage.tsx */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { User, Mail, Calendar, LogOut, TrendingUp, Heart, ShieldCheck, Zap } from 'lucide-react'
import { getBrowserAlertsEnabled, requestBrowserNotificationPermission, setBrowserAlertsEnabled } from '../lib/browserNotifications'
import { useViewport } from '../lib/useViewport'

export default function ProfilePage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [stats, setStats] = useState<{ total: number; won: number; lost: number; winRate: number } | null>(null)
    const [watchlistCount, setWatchlistCount] = useState(0)
    const [subscriptionStatus, setSubscriptionStatus] = useState<'TRIAL' | 'ACTIVE' | 'FREE' | 'EXPIRED' | 'UNKNOWN'>('UNKNOWN')
    const [subscriptionExpiry, setSubscriptionExpiry] = useState<string | null>(null)

    const [whatsappNumber, setWhatsappNumber] = useState('')
    const [notifyBuySignals, setNotifyBuySignals] = useState(true)
    const [notifyEmail, setNotifyEmail] = useState(true)
    const [browserAlerts, setBrowserAlerts] = useState(getBrowserAlertsEnabled())
    const [savingPrefs, setSavingPrefs] = useState(false)
    const [saveMsg, setSaveMsg] = useState('')
    const { isMobile, isPhone } = useViewport()

    useEffect(() => {
        axios.get('/api/performance').then(({ data }) => {
            if (data.success) setStats(data.data.stats)
        }).catch(() => { })
        axios.get('/api/watchlist').then(({ data }) => {
            if (data.success) setWatchlistCount(data.data.length)
        }).catch(() => { })
        axios.get('/api/user/preferences').then(({ data }) => {
            if (data.success && data.data) {
                setWhatsappNumber(data.data.telegramChatId || '')
                setNotifyBuySignals(data.data.notifyBuySignals !== false)
                setNotifyEmail(data.data.notifyEmail !== false)
                setSubscriptionStatus(data.data.subscriptionStatus || 'UNKNOWN')
                setSubscriptionExpiry(data.data.subscriptionExpiry || null)
            }
        }).catch(() => {})
    }, [])

    const savePrefs = async () => {
        setSavingPrefs(true)
        setSaveMsg('')
        try {
            await axios.post('/api/user/preferences', { whatsappNumber, notifyBuySignals, notifyEmail })
            setBrowserAlertsEnabled(browserAlerts)
            setSaveMsg('Settings saved successfully')
            setTimeout(() => setSaveMsg(''), 3000)
        } catch (e) {
            setSaveMsg('Failed to save settings')
        } finally {
            setSavingPrefs(false)
        }
    }

    const handleBrowserAlertsToggle = async (checked: boolean) => {
        if (checked) {
            const permission = await requestBrowserNotificationPermission()
            if (permission !== 'granted') {
                setSaveMsg('Browser notification permission was denied')
                setBrowserAlerts(false)
                return
            }
        }
        setBrowserAlerts(checked)
    }

    const handleLogout = () => {
        logout()
        navigate('/login', { replace: true })
    }

    if (!user) return null

    const initials = (user.name || user.email).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    const expiryDate = subscriptionExpiry ? new Date(subscriptionExpiry) : null
    const trialDaysLeft = expiryDate ? Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86400000)) : null
    const subscriptionTone = subscriptionStatus === 'ACTIVE'
        ? '#34d399'
        : subscriptionStatus === 'TRIAL'
            ? '#fbbf24'
            : '#f87171'
    const subscriptionLabel = subscriptionStatus === 'ACTIVE'
        ? 'Active subscription'
        : subscriptionStatus === 'TRIAL'
            ? 'Free trial'
            : subscriptionStatus === 'EXPIRED'
                ? 'Expired subscription'
                : 'Upgrade required'

    return (
        <div style={{ padding: isMobile ? '18px 12px 28px' : '32px 28px', maxWidth: 700, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
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
                <button onClick={handleLogout} className="btn btn-ghost" style={{ marginLeft: isMobile ? 0 : 'auto', gap: 6, color: '#f87171', borderColor: 'rgba(239,68,68,0.25)', width: isPhone ? '100%' : 'auto', justifyContent: 'center' }}>
                    <LogOut size={14} /> Sign Out
                </button>
            </div>

            <div className="card" style={{ padding: '20px 20px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>Subscription</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 900, color: subscriptionTone, marginTop: 4 }}>{subscriptionLabel}</div>
                    {expiryDate && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                            Valid until {expiryDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                            {subscriptionStatus === 'TRIAL' && trialDaysLeft !== null ? ` · ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left` : ''}
                        </div>
                    )}
                </div>
                <button onClick={() => navigate('/upgrade')} className="btn btn-primary" style={{ gap: 6 }}>
                    <Zap size={14} /> View Plan
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
            <div className="card" style={{ padding: '20px 20px', marginBottom: 24 }}>
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

            {/* Notification Settings */}
            <div className="card" style={{ padding: '20px 20px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>Alerts & Notifications</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>Receive high-confidence BUY signals through WhatsApp, Telegram-style chat targets, email, and browser notifications.</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Alert Destination</label>
                        <input type="text" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="+919876543210 or telegram:123456789" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-primary)', outline: 'none' }} />
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Use a phone number for WhatsApp or prefix a Telegram chat ID with <strong>telegram:</strong>.</div>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 4 }}>
                        <input type="checkbox" checked={notifyBuySignals} onChange={e => setNotifyBuySignals(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--blue)' }} />
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Send alerts for new BUY setups</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={notifyEmail} onChange={e => setNotifyEmail(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--blue)' }} />
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Send morning and post-market summaries by email</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={browserAlerts} onChange={e => void handleBrowserAlertsToggle(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--blue)' }} />
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Enable browser notifications for real-time agent events</span>
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                        <button onClick={savePrefs} disabled={savingPrefs} className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '0.82rem', width: isPhone ? '100%' : 'auto', justifyContent: 'center' }}>
                            {savingPrefs ? 'Saving...' : 'Save Settings'}
                        </button>
                        {saveMsg && <span style={{ fontSize: '0.75rem', color: saveMsg.includes('Failed') ? '#f87171' : '#34d399', fontWeight: 600 }}>{saveMsg}</span>}
                    </div>
                </div>
            </div>

            <p style={{ textAlign: 'center', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 24 }}>
                StockSage AI · For research and education only · Not financial advice
            </p>
        </div>
    )
}
