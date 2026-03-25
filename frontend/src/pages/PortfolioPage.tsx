import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
    Briefcase, Plus, X, TrendingUp, TrendingDown,
    CheckCircle2, Clock, Target, BarChart3, ShieldCheck, Activity, Zap
} from 'lucide-react'

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
                width: '100%', maxWidth: 460, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Plus size={16} style={{ color: '#34d399' }} /> Log New Trade
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
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
            <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-md)', width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
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
    const [loading, setLoading] = useState(true)
    const [showAdd, setShowAdd] = useState(false)
    const [closingTrade, setClosingTrade] = useState<Trade | null>(null)
    const [tab, setTab] = useState<'open' | 'closed'>('open')

    const load = useCallback(async () => {
        setLoading(true)
        const [tradesRes, summaryRes] = await Promise.allSettled([
            axios.get('/api/portfolio'),
            axios.get('/api/portfolio/summary'),
        ])
        if (tradesRes.status === 'fulfilled' && tradesRes.value.data.success)
            setTrades(tradesRes.value.data.data || [])
        if (summaryRes.status === 'fulfilled' && summaryRes.value.data.success)
            setSummary(summaryRes.value.data.data)
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
        <div style={{ padding: '24px 22px', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Briefcase size={22} style={{ color: '#fbbf24' }} /> My Portfolio
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
                        Track your trades, P&L, and win rate
                    </div>
                </div>
                <button onClick={() => setShowAdd(true)} className="btn btn-primary" style={{ gap: 6, fontSize: '0.85rem' }}>
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

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {([['open', `Open (${open.length})`], ['closed', `Closed (${closed.length})`]] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`btn ${tab === key ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: '0.82rem', padding: '7px 16px' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
                    {(tab === 'open' ? open : closed).map(trade => {
                        const unrealizedPct = trade.currentPrice
                            ? ((trade.currentPrice - trade.entryPrice) / trade.entryPrice * 100)
                            : null
                        const displayPct = trade.status === 'CLOSED' ? trade.pnlPct : unrealizedPct
                        const isWin = (displayPct ?? 0) >= 0
                        const color = displayPct == null ? 'var(--text-muted)' : isWin ? '#34d399' : '#f87171'

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

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
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
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => setClosingTrade(trade)} className="btn btn-primary" style={{ flex: 1, fontSize: '0.75rem', padding: '6px' }}>
                                            <CheckCircle2 size={12} /> Close Trade
                                        </button>
                                        <button onClick={() => deleteTrade(trade.id)} className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '6px 10px', color: '#f87171' }}>
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
