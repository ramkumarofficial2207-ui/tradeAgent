import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
    Briefcase, Plus, X, TrendingUp, TrendingDown,
    CheckCircle2, Clock, Target, BarChart3, ShieldCheck, Activity, Zap, AlertTriangle, Newspaper
} from 'lucide-react'
import { useViewport } from '../lib/useViewport'

interface Trade {
    id: string
    ticker: string
    companyName?: string
    sector?: string
    setupType: string
    status: 'OPEN' | 'CLOSED'
    entryDate: string
    exitDate?: string
    entryPrice: number
    currentPrice?: number
    exitPrice?: number
    quantity: number
    stopLossInit: number
    target1: number
    target2?: number
    pnlRs?: number
    pnlPct?: number
    rMultiple?: number
    capitalDeployed?: number
    daysHeld?: number
    exitReason?: string
    confidenceScore?: number
    notes?: string
}

interface Summary {
    openCount: number
    closedCount: number
    wonCount: number
    lostCount: number
    winRate: number
    avgR: number
    avgWinPct: number
    avgLossPct: number
    totalCapitalDeployed: number
    totalRealizedPnL: number
    totalOpenRiskRs: number
    avgOpenRiskPct: number
    largestPositionPct: number
    topSector: string
    topSectorCount: number
}

interface PortfolioNewsRiskItem {
    ticker: string
    sector: string | null
    status: 'HIGH_SEVERITY' | 'REGULATORY_RISK' | 'WATCH' | 'CLEAR'
    avgSentiment: number
    highImpactCount: number
    regulatoryRisk: boolean
    newsRiskFlag: boolean
    signalAlignment: 'ALIGNED' | 'MIXED' | 'CONFLICT' | 'UNAVAILABLE'
    alertEligible: boolean
    latestHeadline: string | null
    lastUpdated: string | null
    eventTypes: string[]
}

interface PortfolioNewsRiskSummary {
    openHoldings: number
    highSeverityCount: number
    regulatoryRiskCount: number
    alignedPositiveCount: number
    holdings: PortfolioNewsRiskItem[]
}

interface PortfolioCluster {
    key: string
    type: 'SECTOR' | 'REGIME' | 'NEWS_RISK'
    label: string
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
    holdings: number
    capitalPct: number
    riskRs: number
    tickers: string[]
}

interface PortfolioHeatmapCell {
    label: string
    holdings: number
    exposurePct: number
    riskPct: number
    sentiment: number
    severity: 'LOW' | 'MEDIUM' | 'HIGH'
}

interface PortfolioIntelligence {
    openHoldings: number
    totalCapitalDeployed: number
    maxDamageTodayRs: number
    maxDamageTodayPct: number
    correlatedExposureCount: number
    regulatoryExposureCount: number
    highNewsRiskCount: number
    clusters: PortfolioCluster[]
    suggestions: string[]
    sectorHeatmap: PortfolioHeatmapCell[]
    regimeHeatmap: PortfolioHeatmapCell[]
    newsHeatmap: PortfolioHeatmapCell[]
}

interface AddTradeForm {
    ticker: string
    entryPrice: string
    quantity: string
    stopLossInit: string
    target1: string
    target2: string
    sector: string
    setupType: string
    notes: string
}

function AddTradeModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
    const { isMobile } = useViewport()
    const [form, setForm] = useState<AddTradeForm>({
        ticker: '', entryPrice: '', quantity: '', stopLossInit: '',
        target1: '', target2: '', sector: '', setupType: 'Manual', notes: '',
    })
    const [saving, setSaving] = useState(false)
    const [err, setErr] = useState('')

    async function save(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true); setErr('')
        try {
            await axios.post('/api/portfolio/trade', {
                ticker: form.ticker.toUpperCase(),
                entryPrice: +form.entryPrice, quantity: +form.quantity,
                stopLossInit: +form.stopLossInit, target1: +form.target1,
                target2: form.target2 ? +form.target2 : undefined,
                sector: form.sector, setupType: form.setupType, notes: form.notes,
            })
            onAdded(); onClose()
        } catch (e: any) {
            setErr(e.response?.data?.message || 'Failed to add trade')
        } finally { setSaving(false) }
    }

    const field = (label: string, key: keyof AddTradeForm, type = 'text', placeholder = '') => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</label>
            <input
                type={type} placeholder={placeholder}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8,
                    padding: '8px 12px', fontSize: '0.85rem', color: 'var(--text-primary)', outline: 'none',
                }}
                required={['ticker','entryPrice','quantity','stopLossInit','target1'].includes(key)}
            />
        </div>
    )

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
            <form onSubmit={save} style={{
                background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-md)',
                width: '100%', maxWidth: 460, padding: isMobile ? 18 : 24, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Plus size={16} style={{ color: '#34d399' }} /> Log New Trade
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    {field('Ticker *', 'ticker', 'text', 'e.g. RELIANCE')}
                    {field('Qty (Shares) *', 'quantity', 'number', '100')}
                    {field('Entry Price ₹ *', 'entryPrice', 'number', '2500.00')}
                    {field('Stop Loss ₹ *', 'stopLossInit', 'number', '2450.00')}
                    {field('Target 1 ₹ *', 'target1', 'number', '2700.00')}
                    {field('Target 2 ₹', 'target2', 'number', '2900.00')}
                    {field('Sector', 'sector', 'text', 'e.g. Financials')}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Setup Type</label>
                        <select value={form.setupType} onChange={e => setForm(f => ({ ...f, setupType: e.target.value }))} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {['Manual','VCP Breakout','Bull Flag','Pullback Continuation','Momentum Breakout','Deep Value','Breakout Base'].map(t => <option key={t}>{t}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Notes</label>
                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Optional context or thesis..." rows={2}
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: 'var(--text-primary)', resize: 'none', outline: 'none' }}
                    />
                </div>
                {err && <div style={{ fontSize: '0.75rem', color: '#f87171', marginBottom: 12 }}>⚠️ {err}</div>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onClose} className="btn btn-ghost" style={{ fontSize: '0.82rem' }}>Cancel</button>
                    <button type="submit" disabled={saving} className="btn btn-primary" style={{ fontSize: '0.82rem', gap: 6 }}>
                        {saving ? 'Saving...' : <><Zap size={13} /> Log Trade</>}
                    </button>
                </div>
            </form>
        </div>
    )
}

function CloseTradeModal({ trade, onClose, onClosed }: { trade: Trade; onClose: () => void; onClosed: () => void }) {
    const { isMobile } = useViewport()
    const [exitPrice, setExitPrice] = useState('')
    const [exitReason, setExitReason] = useState<'TARGET' | 'STOP' | 'TRAIL' | 'MANUAL'>('MANUAL')
    const [saving, setSaving] = useState(false)

    async function handleClose() {
        if (!exitPrice) return
        setSaving(true)
        try {
            await axios.put(`/api/portfolio/trade/${trade.id}`, { exitPrice: +exitPrice, exitReason })
            onClosed(); onClose()
        } finally { setSaving(false) }
    }

    const preview = exitPrice
        ? { pnl: ((+exitPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2), isWin: +exitPrice > trade.entryPrice }
        : null

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-md)', width: '100%', maxWidth: 360, padding: isMobile ? 18 : 24, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900 }}>Close {trade.ticker}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Exit Price ₹</label>
                        <input type="number" value={exitPrice} onChange={e => setExitPrice(e.target.value)} placeholder={trade.target1.toFixed(2)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: '0.9rem', color: 'var(--text-primary)', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {(['TARGET','STOP','TRAIL','MANUAL'] as const).map(r => (
                            <button key={r} onClick={() => setExitReason(r)}
                                style={{ flex: 1, padding: '6px 4px', fontSize: '0.62rem', fontWeight: 700, borderRadius: 7, border: `1px solid ${exitReason === r ? '#60a5fa' : 'var(--border)'}`, background: exitReason === r ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)', color: exitReason === r ? '#93c5fd' : 'var(--text-muted)', cursor: 'pointer' }}>
                                {r}
                            </button>
                        ))}
                    </div>
                    {preview && (
                        <div style={{ background: preview.isWin ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${preview.isWin ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>Estimated P&L</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 900, color: preview.isWin ? '#34d399' : '#f87171' }}>
                                {preview.isWin ? '+' : ''}{preview.pnl}%
                            </div>
                        </div>
                    )}
                    <button onClick={handleClose} disabled={!exitPrice || saving} className="btn btn-primary" style={{ marginTop: 4 }}>
                        {saving ? 'Closing...' : 'Confirm Close'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function PortfolioPage() {
    const [trades, setTrades] = useState<Trade[]>([])
    const [summary, setSummary] = useState<Summary | null>(null)
    const [newsRisk, setNewsRisk] = useState<PortfolioNewsRiskSummary | null>(null)
    const [intelligence, setIntelligence] = useState<PortfolioIntelligence | null>(null)
    const [loading, setLoading] = useState(true)
    const [showAdd, setShowAdd] = useState(false)
    const [closingTrade, setClosingTrade] = useState<Trade | null>(null)
    const [tab, setTab] = useState<'open' | 'closed'>('open')
    const { isMobile, isPhone } = useViewport()

    const load = useCallback(async () => {
        setLoading(true)
        const [tradesRes, summaryRes, newsRes, intelRes] = await Promise.allSettled([
            axios.get('/api/portfolio'),
            axios.get('/api/portfolio/summary'),
            axios.get('/api/portfolio/news-risk'),
            axios.get('/api/portfolio/intelligence'),
        ])
        if (tradesRes.status === 'fulfilled' && tradesRes.value.data.success)
            setTrades(tradesRes.value.data.data || [])
        if (summaryRes.status === 'fulfilled' && summaryRes.value.data.success)
            setSummary(summaryRes.value.data.data)
        if (newsRes.status === 'fulfilled' && newsRes.value.data.success)
            setNewsRisk(newsRes.value.data.data)
        if (intelRes.status === 'fulfilled' && intelRes.value.data.success)
            setIntelligence(intelRes.value.data.data)
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    async function deleteTrade(id: string) {
        if (!confirm('Remove this trade?')) return
        await axios.delete(`/api/portfolio/trade/${id}`)
        load()
    }

    const open = trades.filter(t => t.status === 'OPEN')
    const closed = trades.filter(t => t.status === 'CLOSED')

    const badgeForNewsStatus = (status: PortfolioNewsRiskItem['status']) => {
        if (status === 'REGULATORY_RISK') return 'badge badge-avoid'
        if (status === 'HIGH_SEVERITY') return 'badge badge-watch'
        if (status === 'CLEAR') return 'badge badge-buy'
        return 'badge badge-neutral'
    }

    const labelForNewsStatus = (status: PortfolioNewsRiskItem['status']) => {
        if (status === 'REGULATORY_RISK') return 'Regulatory Risk'
        if (status === 'HIGH_SEVERITY') return 'High Severity'
        if (status === 'CLEAR') return 'Clear'
        return 'Watch'
    }

    const severityTone = (severity: 'LOW' | 'MEDIUM' | 'HIGH') => {
        if (severity === 'HIGH') return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.22)', color: '#fca5a5' }
        if (severity === 'MEDIUM') return { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.22)', color: '#fcd34d' }
        return { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.22)', color: '#86efac' }
    }

    const StatCard = ({ icon, label, value, color }: any) => (
        <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ color }}>{icon}</div>
            <div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 900, color, marginTop: 2 }}>{value}</div>
            </div>
        </div>
    )

    return (
        <div style={{ padding: isMobile ? '16px 12px 24px' : '24px 22px', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Briefcase size={22} style={{ color: '#fbbf24' }} /> My Portfolio
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
                        Track your trades, P&L, and win rate
                    </div>
                </div>
                <button onClick={() => setShowAdd(true)} className="btn btn-primary" style={{ gap: 6, fontSize: '0.85rem', width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
                    <Plus size={14} /> Log Trade
                </button>
            </div>

            {/* Summary Stats */}
            {summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                    <StatCard icon={<ShieldCheck size={16} />} label="Win Rate" value={`${summary.winRate}%`} color="#34d399" />
                    <StatCard icon={<TrendingUp size={16} />} label="Avg Win" value={`+${summary.avgWinPct}%`} color="#60a5fa" />
                    <StatCard icon={<TrendingDown size={16} />} label="Avg Loss" value={`${summary.avgLossPct}%`} color="#f87171" />
                    <StatCard icon={<Target size={16} />} label="Avg R" value={`${summary.avgR}R`} color="#a78bfa" />
                    <StatCard icon={<BarChart3 size={16} />} label="Realized P&L" value={`₹${(summary.totalRealizedPnL).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color={summary.totalRealizedPnL >= 0 ? '#34d399' : '#f87171'} />
                    <StatCard icon={<Activity size={16} />} label="Deployed" value={`₹${(summary.totalCapitalDeployed / 100000).toFixed(1)}L`} color="#fbbf24" />
                </div>
            )}

            {summary && (
                <div className="card" style={{ padding: '18px 18px', marginBottom: 20 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 900, marginBottom: 12 }}>Risk Dashboard</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                        <StatCard icon={<ShieldCheck size={16} />} label="Open Risk" value={`â‚¹${summary.totalOpenRiskRs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color="#f87171" />
                        <StatCard icon={<Activity size={16} />} label="Risk / Deployed" value={`${summary.avgOpenRiskPct}%`} color="#fbbf24" />
                        <StatCard icon={<BarChart3 size={16} />} label="Largest Position" value={`${summary.largestPositionPct}%`} color="#60a5fa" />
                        <StatCard icon={<Briefcase size={16} />} label="Top Sector" value={summary.topSectorCount > 0 ? `${summary.topSector} (${summary.topSectorCount})` : 'None'} color="#a78bfa" />
                    </div>
                </div>
            )}

            {newsRisk && (
                <div className="card" style={{
                    padding: isMobile ? '16px 14px' : '18px 18px',
                    marginBottom: 20,
                    background: 'radial-gradient(circle at top right, rgba(59,130,246,0.08), transparent 45%), var(--bg-card)',
                    border: '1px solid rgba(96,165,250,0.18)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                        <div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.98rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Newspaper size={16} style={{ color: '#93c5fd' }} /> Holdings News Radar
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                Recent holdings news, regulatory flags, and alignment status from the same grounded news engine.
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span className="badge badge-buy">{newsRisk.alignedPositiveCount} aligned</span>
                            <span className="badge badge-watch">{newsRisk.highSeverityCount} high severity</span>
                            <span className="badge badge-avoid">{newsRisk.regulatoryRiskCount} regulatory</span>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
                        <StatCard icon={<Briefcase size={16} />} label="Open Holdings" value={newsRisk.openHoldings} color="#93c5fd" />
                        <StatCard icon={<AlertTriangle size={16} />} label="High Severity" value={newsRisk.highSeverityCount} color="#fbbf24" />
                        <StatCard icon={<ShieldCheck size={16} />} label="Regulatory" value={newsRisk.regulatoryRiskCount} color="#f87171" />
                        <StatCard icon={<CheckCircle2 size={16} />} label="Aligned" value={newsRisk.alignedPositiveCount} color="#34d399" />
                    </div>

                    {newsRisk.holdings.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                            {newsRisk.holdings.slice(0, 6).map(item => (
                                <div key={item.ticker} style={{
                                    padding: '12px 12px',
                                    borderRadius: 12,
                                    border: `1px solid ${item.status === 'REGULATORY_RISK' ? 'rgba(239,68,68,0.18)' : item.status === 'HIGH_SEVERITY' ? 'rgba(245,158,11,0.18)' : 'rgba(148,163,184,0.16)'}`,
                                    background: 'var(--bg-elevated)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                                        <div>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 900 }}>{item.ticker}</div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{item.sector || 'NSE equity'}</div>
                                        </div>
                                        <span className={badgeForNewsStatus(item.status)} style={{ fontSize: '0.58rem', alignSelf: 'flex-start' }}>
                                            {labelForNewsStatus(item.status)}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                        <span className={`badge ${item.signalAlignment === 'ALIGNED' ? 'badge-buy' : item.signalAlignment === 'CONFLICT' ? 'badge-avoid' : 'badge-neutral'}`} style={{ fontSize: '0.56rem' }}>
                                            {item.signalAlignment}
                                        </span>
                                        <span className="badge badge-neutral" style={{ fontSize: '0.56rem' }}>
                                            Sentiment {item.avgSentiment >= 0 ? '+' : ''}{item.avgSentiment}
                                        </span>
                                        {item.alertEligible && <span className="badge badge-buy" style={{ fontSize: '0.56rem' }}>Alert Ready</span>}
                                    </div>
                                    {item.latestHeadline && (
                                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 8 }}>
                                            {item.latestHeadline}
                                        </div>
                                    )}
                                    {item.eventTypes.length > 0 && (
                                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                            {item.eventTypes.slice(0, 3).map(eventType => (
                                                <span key={eventType} className="badge badge-neutral" style={{ fontSize: '0.52rem' }}>
                                                    {eventType.replace(/_/g, ' ')}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {intelligence && (
                <div className="card" style={{
                    padding: isMobile ? '16px 14px' : '18px 18px',
                    marginBottom: 20,
                    background: 'radial-gradient(circle at top left, rgba(248,113,113,0.08), transparent 35%), var(--bg-card)',
                    border: '1px solid rgba(248,113,113,0.15)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                        <div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.98rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={16} style={{ color: '#fca5a5' }} /> Portfolio Risk Intelligence
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                Correlated exposure, max-damage, rebalance suggestions, and heatmaps by sector, regime, and news risk.
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span className="badge badge-watch">{intelligence.correlatedExposureCount} clusters</span>
                            <span className="badge badge-avoid">{intelligence.regulatoryExposureCount} regulatory</span>
                            <span className="badge badge-neutral">{intelligence.highNewsRiskCount} news risk</span>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
                        <StatCard icon={<ShieldCheck size={16} />} label="Max Damage" value={`₹${intelligence.maxDamageTodayRs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color="#f87171" />
                        <StatCard icon={<Activity size={16} />} label="Damage %" value={`${intelligence.maxDamageTodayPct}%`} color="#fbbf24" />
                        <StatCard icon={<Briefcase size={16} />} label="Open Holdings" value={intelligence.openHoldings} color="#93c5fd" />
                        <StatCard icon={<BarChart3 size={16} />} label="Clusters" value={intelligence.correlatedExposureCount} color="#a78bfa" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.15fr 1fr', gap: 14, marginBottom: 14 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-muted)' }}>Correlated Clusters</div>
                            {intelligence.clusters.length === 0 && (
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>No material clusters detected.</div>
                            )}
                            {intelligence.clusters.map(cluster => {
                                const tone = severityTone(cluster.severity)
                                return (
                                    <div key={cluster.key} style={{
                                        padding: '12px 12px',
                                        borderRadius: 12,
                                        background: tone.bg,
                                        border: `1px solid ${tone.border}`,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: '0.82rem', color: tone.color }}>{cluster.label}</div>
                                                <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{cluster.type.replace('_', ' ')} cluster</div>
                                            </div>
                                            <span className={`badge ${cluster.severity === 'HIGH' ? 'badge-avoid' : cluster.severity === 'MEDIUM' ? 'badge-watch' : 'badge-buy'}`} style={{ fontSize: '0.56rem' }}>
                                                {cluster.severity}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                            {cluster.holdings} holdings · {cluster.capitalPct}% capital · ₹{cluster.riskRs.toLocaleString('en-IN', { maximumFractionDigits: 0 })} risk
                                        </div>
                                        <div style={{ marginTop: 6, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                            {cluster.tickers.join(', ')}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-muted)' }}>Risk Compression Suggestions</div>
                            {intelligence.suggestions.map(suggestion => (
                                <div key={suggestion} style={{
                                    padding: '10px 12px',
                                    borderRadius: 12,
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border)',
                                    fontSize: '0.72rem',
                                    color: 'var(--text-secondary)',
                                    lineHeight: 1.55,
                                }}>
                                    {suggestion}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
                        {([
                            ['Sector Heatmap', intelligence.sectorHeatmap],
                            ['Regime Sensitivity', intelligence.regimeHeatmap],
                            ['News Risk Heatmap', intelligence.newsHeatmap],
                        ] as Array<[string, PortfolioHeatmapCell[]]>).map(([title, cells]) => (
                            <div key={title} style={{ padding: '12px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 10 }}>{title}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {cells.slice(0, 6).map(cell => {
                                        const tone = severityTone(cell.severity)
                                        return (
                                            <div key={`${title}-${cell.label}`} style={{
                                                padding: '10px 10px',
                                                borderRadius: 10,
                                                background: tone.bg,
                                                border: `1px solid ${tone.border}`,
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                    <div style={{ fontWeight: 800, fontSize: '0.75rem', color: tone.color }}>{cell.label}</div>
                                                    <div style={{ fontSize: '0.68rem', fontWeight: 700 }}>{cell.exposurePct}%</div>
                                                </div>
                                                <div style={{ marginTop: 4, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                                    {cell.holdings} holdings · risk {cell.riskPct}% · sentiment {cell.sentiment >= 0 ? '+' : ''}{cell.sentiment}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {([['open', `Open (${open.length})`], ['closed', `Closed (${closed.length})`]] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`btn ${tab === key ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: '0.82rem', padding: '7px 16px', flex: isPhone ? 1 : undefined, justifyContent: 'center' }}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>Loading trades...</div>
            ) : (tab === 'open' ? open : closed).length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <Briefcase size={28} style={{ margin: '0 auto 12px', color: 'var(--text-muted)', opacity: 0.4 }} />
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                        {tab === 'open' ? 'No open trades. Log your first trade →' : 'No closed trades yet.'}
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
                    {(tab === 'open' ? open : closed).map(trade => {
                        const unrealizedPct = trade.currentPrice
                            ? ((trade.currentPrice - trade.entryPrice) / trade.entryPrice * 100)
                            : null
                        const displayPct = trade.status === 'CLOSED' ? trade.pnlPct : unrealizedPct
                        const isWin = (displayPct ?? 0) >= 0
                        const color = displayPct == null ? 'var(--text-muted)' : isWin ? '#34d399' : '#f87171'
                        const newsItem = newsRisk?.holdings.find(h => h.ticker === trade.ticker)

                        return (
                            <div key={trade.id} className="card" style={{ padding: '16px 18px', border: `1px solid ${color}22` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 900 }}>{trade.ticker}</div>
                                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>{trade.setupType} · {trade.sector || '—'}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        {displayPct != null && (
                                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 900, fontSize: '1rem', color }}>
                                                {isWin ? '+' : ''}{displayPct.toFixed(2)}%
                                            </div>
                                        )}
                                        {trade.rMultiple != null && (
                                            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{trade.rMultiple}R</div>
                                        )}
                                    </div>
                                </div>

                                {newsItem && (
                                    <div style={{
                                        marginBottom: 12,
                                        padding: '10px 12px',
                                        borderRadius: 10,
                                        background: newsItem.status === 'REGULATORY_RISK' ? 'rgba(239,68,68,0.08)' : newsItem.status === 'HIGH_SEVERITY' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.05)',
                                        border: `1px solid ${newsItem.status === 'REGULATORY_RISK' ? 'rgba(239,68,68,0.16)' : newsItem.status === 'HIGH_SEVERITY' ? 'rgba(245,158,11,0.16)' : 'rgba(59,130,246,0.14)'}`,
                                    }}>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: newsItem.latestHeadline ? 7 : 0 }}>
                                            <span className={badgeForNewsStatus(newsItem.status)} style={{ fontSize: '0.56rem' }}>{labelForNewsStatus(newsItem.status)}</span>
                                            <span className={`badge ${newsItem.signalAlignment === 'ALIGNED' ? 'badge-buy' : newsItem.signalAlignment === 'CONFLICT' ? 'badge-avoid' : 'badge-neutral'}`} style={{ fontSize: '0.56rem' }}>
                                                {newsItem.signalAlignment}
                                            </span>
                                            {newsItem.newsRiskFlag && <span className="badge badge-watch" style={{ fontSize: '0.56rem' }}>News Risk</span>}
                                        </div>
                                        {newsItem.latestHeadline && (
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                                {newsItem.latestHeadline}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                                    {[
                                        { l: 'Entry', v: `₹${trade.entryPrice.toFixed(2)}` },
                                        { l: 'Target', v: `₹${trade.target1.toFixed(2)}` },
                                        { l: 'Stop Loss', v: `₹${trade.stopLossInit.toFixed(2)}` },
                                        { l: 'Qty', v: trade.quantity },
                                        { l: 'Capital', v: `₹${((trade.capitalDeployed || 0) / 1000).toFixed(1)}K` },
                                        trade.status === 'CLOSED'
                                            ? { l: 'P&L ₹', v: `${(trade.pnlRs || 0) >= 0 ? '+' : ''}₹${(trade.pnlRs || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` }
                                            : { l: 'Days', v: `${Math.ceil((Date.now() - new Date(trade.entryDate).getTime()) / 86400000)}d` },
                                    ].map(({ l, v }) => (
                                        <div key={l}>
                                            <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>{l}</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', fontWeight: 700 }}>{v}</div>
                                        </div>
                                    ))}
                                </div>

                                {trade.status === 'OPEN' && (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        <button onClick={() => setClosingTrade(trade)} className="btn btn-primary" style={{ flex: 1, fontSize: '0.75rem', padding: '6px' }}>
                                            <CheckCircle2 size={12} /> Close Trade
                                        </button>
                                        <button onClick={() => deleteTrade(trade.id)} className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '6px 10px', color: '#f87171', width: isPhone ? '100%' : 'auto', justifyContent: 'center' }}>
                                            <X size={12} />
                                        </button>
                                    </div>
                                )}
                                {trade.status === 'CLOSED' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Clock size={10} /> {trade.daysHeld}d held · Closed via {trade.exitReason}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {showAdd && <AddTradeModal onClose={() => setShowAdd(false)} onAdded={load} />}
            {closingTrade && <CloseTradeModal trade={closingTrade} onClose={() => setClosingTrade(null)} onClosed={load} />}
        </div>
    )
}
