import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Heart, Search, X, ExternalLink, Trash2, MessageSquare, TrendingUp, TrendingDown,
    RefreshCw, CheckCircle, AlertTriangle, MinusCircle, Zap, SlidersHorizontal
} from 'lucide-react'
import { useWatchlist } from '../lib/useWatchlist'
import { type WatchlistItem } from '../lib/watchlist'
import axios from 'axios'

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 })
const pct = (n: number) => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'

function SignalBadge({ signal }: { signal?: string }) {
    if (!signal) return null
    const Icon = (signal === 'BUY' || signal === 'LIGHT BUY') ? CheckCircle : signal === 'REJECT' ? AlertTriangle : MinusCircle
    const cls = (signal === 'BUY' || signal === 'LIGHT BUY') ? 'badge-buy' : signal === 'REJECT' ? 'badge-avoid' : 'badge-watch'
    return <span className={`badge ${cls}`} style={{ gap: 4, fontSize: '0.62rem' }}><Icon size={10} />{signal}</span>
}

function ConfBar({ score }: { score?: number }) {
    if (score == null) return null
    const color = score >= 7 ? '#34d399' : score >= 5 ? '#fbbf24' : '#f87171'
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <div style={{ flex: 1, height: 3, background: 'var(--bg-hover)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${score * 10}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color }}>{score}/10</span>
        </div>
    )
}

export default function WatchlistPage() {
    const { items: watchlistItems, toggle: toggleWatchlist } = useWatchlist()
    const [items, setItems] = useState<(WatchlistItem & { livePrice?: number; priceChange?: number })[]>([])
    const [search, setSearch] = useState('')
    const [sortBy, setSortBy] = useState<'added' | 'conf' | 'change'>('added')
    const [refreshing, setRefreshing] = useState(false)
    const navigate = useNavigate()

    useEffect(() => {
        setItems(watchlistItems.map(w => ({ ...w, livePrice: w.ltp, priceChange: 0 })))
    }, [watchlistItems])

    const refreshPrices = useCallback(async () => {
        if (watchlistItems.length === 0) return
        setRefreshing(true)
        try {
            const pricePromises = watchlistItems.map(async (item) => {
                try {
                    const { data } = await axios.get(`/api/chart/${item.ticker}`)
                    if (data.success && data.data?.length > 0) {
                        const latest = data.data[data.data.length - 1]
                        const prev = data.data.length >= 2 ? data.data[data.data.length - 2] : latest
                        const change = prev.close > 0 ? ((latest.close - prev.close) / prev.close) * 100 : 0
                        return { ...item, livePrice: latest.close, priceChange: change }
                    }
                } catch { /* ignore */ }
                return { ...item, livePrice: item.ltp, priceChange: 0 }
            })
            const updated = await Promise.allSettled(pricePromises)
            setItems(updated.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean) as any)
        } finally { setRefreshing(false) }
    }, [watchlistItems])

    useEffect(() => {
        if (watchlistItems.length > 0) refreshPrices()
    }, [watchlistItems.length]) // eslint-disable-line

    const handleRemove = async (ticker: string) => {
        await toggleWatchlist({ ticker } as any)
    }

    const filtered = items.filter(i => {
        if (!search) return true
        return i.ticker.toLowerCase().includes(search.toLowerCase()) || i.sector?.toLowerCase().includes(search.toLowerCase())
    })

    const sorted = [...filtered].sort((a, b) => {
        if (sortBy === 'conf') return (b.confidenceScore || 0) - (a.confidenceScore || 0)
        if (sortBy === 'change') return (b.priceChange || 0) - (a.priceChange || 0)
        return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
    })

    return (
        <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <Heart size={22} style={{ color: '#f87171' }} />
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem', fontWeight: 900, letterSpacing: '-0.025em' }}>Watchlist</h1>
                        <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{items.length} stocks</span>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Track stocks you're interested in with live price updates</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={refreshPrices} disabled={refreshing} className="btn btn-ghost" style={{ gap: 6, fontSize: '0.78rem' }}>
                        <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                        {refreshing ? 'Refreshing...' : 'Refresh Prices'}
                    </button>
                    <button onClick={() => navigate('/')} className="btn btn-primary" style={{ gap: 6, fontSize: '0.78rem' }}>
                        <Zap size={13} /> Scan for More
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search by ticker or sector..."
                        style={{ width: '100%', padding: '9px 12px 9px 34px', background: 'var(--bg-input)', border: '1px solid var(--border-md)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }}
                    />
                    {search && (
                        <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {([
                        { key: 'added', label: 'Recent' },
                        { key: 'conf', label: 'Confidence' },
                        { key: 'change', label: 'Change' },
                    ] as const).map(s => (
                        <button key={s.key} onClick={() => setSortBy(s.key)}
                            className={`btn ${sortBy === s.key ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ fontSize: '0.72rem', padding: '6px 12px' }}>
                            <SlidersHorizontal size={11} /> {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {items.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(248,113,113,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Heart size={28} style={{ color: '#f87171', opacity: 0.6 }} />
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, marginBottom: 8 }}>Watchlist Empty</h3>
                    <button onClick={() => navigate('/')} className="btn btn-primary" style={{ gap: 6 }}><Zap size={14} /> Go to Scanner</button>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                {sorted.map((item, i) => {
                    const isUp = (item.priceChange || 0) >= 0
                    const rgb = (item.signal === 'BUY' || item.signal === 'LIGHT BUY') ? '16,185,129' : item.signal === 'REJECT' ? '239,68,68' : '245,158,11'
                    return (
                        <div key={item.ticker} style={{
                            background: `radial-gradient(circle at top right, rgba(${rgb},0.06), transparent 50%), var(--bg-card)`,
                            border: `1px solid rgba(${rgb}, 0.15)`,
                            borderRadius: 16, padding: '16px 18px',
                            boxShadow: `0 4px 20px rgba(${rgb}, 0.05)`,
                            transition: 'all var(--t-normal)',
                            animation: `fadeUp 0.3s ease ${Math.min(i * 0.04, 0.5)}s both`,
                        }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 12px 32px rgba(${rgb}, 0.1)` }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 4px 20px rgba(${rgb}, 0.05)` }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 900, letterSpacing: '-0.01em' }}>{item.ticker}</div>
                                    <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                                        {item.sector && <span className="badge badge-neutral" style={{ fontSize: '0.56rem' }}>{item.sector}</span>}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 700 }}>{item.livePrice ? fmt(item.livePrice) : item.ltp ? fmt(item.ltp) : '—'}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', marginTop: 2 }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: isUp ? '#34d399' : '#f87171' }}>{pct(item.priceChange || 0)}</span>
                                    </div>
                                </div>
                            </div>
                            <SignalBadge signal={item.signal} />
                            <ConfBar score={item.confidenceScore} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>
                                    Added {new Date(item.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                </span>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={() => navigate(`/chat`)} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '0.65rem', borderRadius: 6, gap: 3 }}>
                                        <MessageSquare size={10} /> Ask AI
                                    </button>
                                    <button onClick={() => handleRemove(item.ticker)} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '0.65rem', borderRadius: 6, color: '#f87171' }}>
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
