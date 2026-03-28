import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import {
    BarChart2, Heart, Sun, Moon, Menu, X, Zap,
    TrendingUp, TrendingDown, Bell, BellRing,
    Activity, Cpu, Wifi, WifiOff, CheckCircle2, AlertCircle, Clock, Bot, User, LogOut, Briefcase
} from 'lucide-react'
import axios from 'axios'
import { useAgentSSE, AgentEvent } from '../lib/useAgentSSE'
import { useAuth } from '../context/AuthContext'
import { useWatchlist } from '../lib/useWatchlist'
import { useViewport } from '../lib/useViewport'

interface Tick { label: string; value: string; positive: boolean }

const NAV_ITEMS = [
    { path: '/', label: 'Dashboard', Icon: BarChart2 },
    { path: '/watchlist', label: 'Watchlist', Icon: Heart },
    { path: '/portfolio', label: 'Portfolio', Icon: Briefcase },
]

const SEVERITY_COLORS: Record<string, string> = {
    info: '#3b82f6',
    success: '#34d399',
    warning: '#fbbf24',
    critical: '#f87171',
}

function severityIcon(severity: string) {
    switch (severity) {
        case 'success': return <CheckCircle2 size={13} style={{ color: '#34d399', flexShrink: 0 }} />
        case 'warning': return <AlertCircle size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />
        case 'critical': return <AlertCircle size={13} style={{ color: '#f87171', flexShrink: 0 }} />
        default: return <Activity size={13} style={{ color: '#3b82f6', flexShrink: 0 }} />
    }
}

function timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
}

/* ── Notification Panel ─────────────────────────────────────── */
function NotificationPanel({ events, onClose, onMarkRead }: { events: AgentEvent[], onClose: () => void, onMarkRead: () => void }) {
    return (
        <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 8,
            width: 'min(380px, calc(100vw - 24px))', maxHeight: 480,
            background: 'var(--bg-card)', border: '1px solid var(--border-md)',
            borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            zIndex: 999, overflow: 'hidden',
            animation: 'fadeUp 0.2s ease both',
        }}>
            {/* Header */}
            <div style={{
                padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.05), rgba(139,92,246,0.03))',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Cpu size={14} style={{ color: 'var(--purple)' }} />
                    <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>AI Agent Activity</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={onMarkRead} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer' }}>Mark all read</button>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
                </div>
            </div>
            {/* Events */}
            <div style={{ overflowY: 'auto', maxHeight: 400, scrollbarWidth: 'thin' }}>
                {events.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        <Activity size={24} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                        No activity yet. Run a scan to see AI agent events.
                    </div>
                ) : events.map(evt => (
                    <div key={evt.id} style={{
                        padding: '12px 18px', borderBottom: '1px solid var(--border)',
                        background: !evt.read ? 'rgba(59,130,246,0.03)' : 'transparent',
                        transition: 'background 0.15s',
                    }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = !evt.read ? 'rgba(59,130,246,0.03)' : 'transparent')}
                    >
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            {severityIcon(evt.severity)}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.78rem', color: SEVERITY_COLORS[evt.severity] || 'var(--text-primary)' }}>{evt.title}</div>
                                    <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{timeAgo(evt.timestamp)}</span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.45 }}>{evt.detail}</div>
                                {evt.ticker && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--purple)', background: 'rgba(139,92,246,0.1)', padding: '1px 6px', borderRadius: 4, marginTop: 4, display: 'inline-block' }}>{evt.ticker}</span>}
                            </div>
                            {!evt.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', flexShrink: 0, marginTop: 4 }} />}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

/* ── Agent Status Pill ──────────────────────────────────────── */
function AgentStatusPill({ state, connected }: { state: string, connected: boolean }) {
    const color = !connected ? '#6b7280' : state === 'SCANNING' ? '#a78bfa' : state === 'ANALYZING' ? '#fbbf24' : '#22d3ee'
    const label = !connected ? 'Offline' : state === 'IDLE' ? 'Agent Active' : state === 'SCANNING' ? 'Scanning...' : state
    const isAnimated = state === 'SCANNING' || state === 'ANALYZING'
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 99,
            background: `${color}12`, border: `1px solid ${color}33`,
            fontSize: '0.62rem', fontWeight: 700, color,
            letterSpacing: '0.02em',
        }}>
            <span style={{
                width: 6, height: 6, borderRadius: '50%', background: color,
                boxShadow: `0 0 8px ${color}`, flexShrink: 0,
                animation: isAnimated ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }} />
            {connected ? <Wifi size={10} /> : <WifiOff size={10} />}
            {label}
        </div>
    )
}

export default function AppLayout() {
    const navigate = useNavigate()
    const location = useLocation()
    const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as 'dark' | 'light') || 'dark')
    const [mobile, setMobile] = useState(false)
    const [ticks, setTicks] = useState<Tick[]>([])
    const [showNotifs, setShowNotifs] = useState(false)
    const [showUserMenu, setShowUserMenu] = useState(false)
    const { status, events, connected, unreadCount, markAllRead } = useAgentSSE()
    const { user, logout } = useAuth()
    const { items: _ } = useWatchlist() // Just calling it here ensures the cache is synced globally
    const { isMobile, isPhone } = useViewport()

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('theme', theme)
    }, [theme])

    useEffect(() => {
        axios.get('/api/last').then(({ data }) => {
            if (!data.success || !data.data?.marketStatus) return
            const m = data.data.marketStatus
            const items: Tick[] = [
                { label: 'NIFTY', value: fmtPct(m.niftyChange), positive: m.niftyChange >= 0 },
                m.sensexChange != null && { label: 'SENSEX', value: fmtPct(m.sensexChange), positive: m.sensexChange >= 0 },
                m.niftyMidcapChange != null && { label: 'MIDCAP', value: fmtPct(m.niftyMidcapChange), positive: m.niftyMidcapChange >= 0 },
                m.vixChange != null && { label: 'VIX', value: fmtPct(m.vixChange), positive: m.vixChange <= 0 },
            ].filter(Boolean) as Tick[]
            setTicks(items)
        }).catch(() => { })
    }, [])

    const fmtPct = (n: number) => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'
    const isActive = (p: string) => location.pathname === p

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-primary)' }}>

            {/* ── Sticky top bar ─────────────────────── */}
            <div style={{ position: 'sticky', top: 0, zIndex: 200 }}>

                {/* ── Ticker tape ──────────────────────── */}
                {ticks.length > 0 && (
                    <div style={{
                        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
                        padding: isMobile ? '5px 12px' : '5px 24px',
                        display: 'flex', gap: isMobile ? 12 : 24, alignItems: 'center', overflow: 'hidden',
                    }}>
                        {ticks.slice(0, isMobile ? 2 : ticks.length).map(t => (
                            <span key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{t.label}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontWeight: 700, color: t.positive ? '#34d399' : '#f87171' }}>
                                    {t.positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                    {t.value}
                                </span>
                            </span>
                        ))}
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <AgentStatusPill state={status?.state || 'IDLE'} connected={connected} />
                            {!isMobile && <>
                                <span className="status-dot status-dot-green" />
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>live</span>
                            </>}
                        </span>
                    </div>
                )}

                {/* ── Navbar ───────────────────────────── */}
                <header style={{
                    background: 'rgba(7, 7, 10, 0.92)', backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    borderBottom: '1px solid var(--border)',
                    boxShadow: '0 1px 0 rgba(255,255,255,0.03)',
                }}>
                    <div style={{ maxWidth: 1480, margin: '0 auto', padding: isMobile ? '0 12px' : '0 20px', height: 64, display: 'flex', alignItems: 'center', gap: 0 }}>

                        {/* Logo */}
                        <button
                            onClick={() => navigate('/')}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: '0 16px 0 0', flexShrink: 0 }}
                        >
                            <div style={{
                                width: 34, height: 34, borderRadius: 10,
                                background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 0 16px rgba(124, 58, 237, 0.35)',
                                position: 'relative',
                            }}>
                                <Zap size={17} color="#fff" strokeWidth={2.5} />
                                {/* Agent active glow */}
                                {connected && status?.state === 'SCANNING' && (
                                    <span style={{
                                        position: 'absolute', inset: -2, borderRadius: 12,
                                        border: '2px solid rgba(124,58,237,0.5)',
                                        animation: 'pulse 1.5s ease-in-out infinite',
                                    }} />
                                )}
                            </div>
                            <div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: isPhone ? '0.88rem' : '1rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.1 }}>StockSage AI</div>
                                <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)', letterSpacing: '0.02em', marginTop: 1, display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: 4 }}>
                                    <Cpu size={8} />
                                    Agentic Trading Assistant
                                </div>
                            </div>
                        </button>

                        {!isMobile && <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 8px', flexShrink: 0 }} />}

                        {/* Nav links */}
                        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, justifyContent: 'center' }} className="hide-sm">
                            {NAV_ITEMS.map(({ path, label, Icon }) => {
                                const active = isActive(path)
                                return (
                                    <button
                                        key={path}
                                        onClick={() => navigate(path)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            background: active ? 'rgba(59,130,246,0.10)' : 'transparent',
                                            border: `1px solid ${active ? 'rgba(59,130,246,0.25)' : 'transparent'}`,
                                            color: active ? '#93c5fd' : 'var(--text-secondary)',
                                            padding: '7px 13px', borderRadius: 9, fontWeight: 600, fontSize: '0.83rem',
                                            cursor: 'pointer', transition: 'all var(--t-fast)', position: 'relative',
                                        }}
                                        onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)' } }}
                                        onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)' } }}
                                    >
                                        <Icon size={14} strokeWidth={2.2} />
                                        {label}
                                    </button>
                                )
                            })}
                        </nav>

                        {/* Right controls */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto', flexShrink: 0, position: 'relative' }}>
                            {/* Mobile menu button */}
                            <button
                                id="mobile-menu-btn"
                                onClick={() => setMobile(!mobile)}
                                className="btn btn-icon btn-ghost"
                                style={{ display: 'none' }}
                                title="Menu"
                            >
                                {mobile ? <X size={18} /> : <Menu size={18} />}
                            </button>

                            {/* Notification bell */}
                            <button
                                onClick={() => setShowNotifs(v => !v)}
                                className="btn btn-icon btn-ghost"
                                title="AI Agent Activity"
                                style={{ position: 'relative' }}
                            >
                                {unreadCount > 0 ? <BellRing size={15} style={{ color: '#fbbf24' }} /> : <Bell size={15} />}
                                {unreadCount > 0 && (
                                    <span style={{
                                        position: 'absolute', top: 2, right: 2,
                                        width: 16, height: 16, borderRadius: '50%',
                                        background: '#ef4444', color: '#fff',
                                        fontSize: '0.55rem', fontWeight: 800,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        animation: 'pulse 2s ease-in-out infinite',
                                        boxShadow: '0 0 8px rgba(239,68,68,0.5)',
                                    }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                                )}
                            </button>
                            {showNotifs && (
                                <NotificationPanel
                                    events={events}
                                    onClose={() => setShowNotifs(false)}
                                    onMarkRead={() => { markAllRead(); setShowNotifs(false) }}
                                />
                            )}

                            {/* Theme toggle */}
                            <button
                                onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                                className="btn btn-icon btn-ghost"
                                title="Toggle theme"
                            >
                                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                            </button>
                            {/* User Avatar */}
                            {user && (
                                <div style={{ position: 'relative' }}>
                                    <button
                                        onClick={() => setShowUserMenu(v => !v)}
                                        style={{
                                            width: 32, height: 32, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                                            border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontFamily: 'var(--font-display)', fontSize: '0.62rem', fontWeight: 900, color: '#fff',
                                            boxShadow: '0 0 12px rgba(124,58,237,0.35)',
                                        }}
                                        title={user.name || user.email}
                                    >
                                        {(user.name || user.email).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                                    </button>
                                    {showUserMenu && (
                                        <div style={{
                                            position: 'absolute', top: '100%', right: 0, marginTop: 8,
                                            background: 'var(--bg-card)', border: '1px solid var(--border-md)',
                                            borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
                                            zIndex: 999, minWidth: isPhone ? 160 : 180, overflow: 'hidden',
                                            animation: 'fadeUp 0.15s ease both',
                                        }}>
                                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{user.name || 'Trader'}</div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{user.email}</div>
                                            </div>
                                            <button onClick={() => { navigate('/profile'); setShowUserMenu(false) }}
                                                style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', textAlign: 'left' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                                <User size={13} /> My Profile
                                            </button>
                                            <button onClick={() => { logout(); navigate('/login'); setShowUserMenu(false) }}
                                                style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', textAlign: 'left' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.05)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                                <LogOut size={13} /> Sign Out
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mobile nav dropdown */}
                    {mobile && (
                        <div style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 2, animation: 'slideDown 0.2s ease both' }}>
                            {NAV_ITEMS.map(({ path, label, Icon }) => (
                                <button key={path} onClick={() => { navigate(path); setMobile(false) }}
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: isActive(path) ? 'var(--bg-elevated)' : 'transparent', border: 'none', borderRadius: 8, color: isActive(path) ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', textAlign: 'left' }}>
                                    <Icon size={15} strokeWidth={2} />
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </header>
            </div>

            {/* ── Page content ─────────────────────────────────────── */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <Outlet />
            </main>

            {/* ── Floating AI Chat Button ── */}
            <button
                onClick={() => navigate('/chat')}
                className="ai-fab"
                aria-label="Open AI Agent Chat"
            >
                <Bot size={26} strokeWidth={2.2} />
                <span className="ai-fab-dot" />
                <span className="ai-fab-tooltip">
                    Ask AI Agent <span style={{ opacity: 0.5, marginLeft: 4, fontFamily: 'var(--font-mono)', fontSize: '0.6rem' }}>⌘K</span>
                </span>
            </button>

            {/* ── Footer ───────────────────────────────────────────── */}
            <footer style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: isMobile ? '12px 16px' : '14px 24px', textAlign: 'center' }}>
                <p style={{ fontSize: '0.64rem', color: 'var(--text-muted)', maxWidth: 660, margin: '0 auto', lineHeight: 1.7 }}>
                    <strong style={{ color: 'var(--text-secondary)' }}>Disclaimer:</strong> StockSage AI is for educational and research purposes only. Not financial advice. Always consult a SEBI-registered advisor.
                </p>
                <p style={{ fontSize: '0.56rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Cpu size={8} /> StockSage AI &copy; 2026 {'\u2014'} Agentic Trading Assistant {'\u00B7'} Powered by Gemini AI
                </p>
            </footer>

            <style>{`
        @media (max-width: 640px) {
          nav.hide-sm { display: none !important; }
          #mobile-menu-btn { display: flex !important; }
        }
      `}</style>
        </div>
    )
}
