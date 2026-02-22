import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import TradingChart from '../components/TradingChart'

// ─── Types ───────────────────────────────────────────────────
interface MarketStatus {
    safeToTrade: boolean
    warning: string
    niftyChange: number
    vixChange: number
    killSwitch: boolean
    niftyNext50Change?: number
    niftyMidcapChange?: number
    sensexChange?: number
    goldChange?: number
    silverChange?: number
}
interface TradeSetup {
    ticker: string
    sector: string
    setupType: string
    ltp: number
    buyZone: number
    target: number
    stopLoss: number
    targetPct: number
    slPct: number
    riskReward: number
    confidenceScore: number
    volatilityHitProb: number
    momentumRank: number
    trendStatus: string
    volumeSpike: string
    entryTrigger: string
    catalyst: string
    aiSignal?: 'BUY' | 'WATCH' | 'AVOID'
    aiLogic?: string
    aiTargetRange?: string
    aiStopLoss?: string
}
interface ActiveTrade {
    ticker: string
    entryPrice: number
    currentPrice: number
    target: number
    stopLoss: number
    status: string
    pnlPct: number
    breakEvenSet?: boolean
    trailReference?: number
    entryDate?: string
    exitReason?: string
}

// ─── Helpers ──────────────────────────────────────────────────
const fmt = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n: number) => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'
const ago = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return diff + 's ago'
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
    return Math.floor(diff / 3600) + 'h ago'
}
const daysIn = (date?: string) => date ? Math.floor((Date.now() - new Date(date).getTime()) / 86400000) : '—'
const progressPct = (t: ActiveTrade) => {
    const range = t.target - t.entryPrice
    const moved = (t.currentPrice || t.entryPrice) - t.entryPrice
    return range > 0 ? Math.min(100, Math.max(0, (moved / range) * 100)) : 0
}

// ─── Sub-components ───────────────────────────────────────────

function SetupBadge({ type }: { type: string }) {
    if (type === 'Pullback Continuation') return <span className="setup-badge pull">📉 Pullback</span>
    if (type === 'Volatility Contraction (VCP)') return <span className="setup-badge vcp">🌀 VCP</span>
    if (type === 'Breakout Base') return <span className="setup-badge breakout">🚀 Breakout Base</span>
    return null
}

function ConfidenceBar({ score }: { score: number }) {
    const cls = score >= 7 ? 'bar-high' : score >= 5 ? 'bar-med' : 'bar-low'
    const col = score >= 7 ? '#10b981' : score >= 5 ? '#f59e0b' : '#ef4444'
    return (
        <div className="conf-wrap">
            <div className="conf-top">
                <span className="conf-label">Confidence Score</span>
                <span className="conf-score" style={{ color: col }}>{score}/10</span>
            </div>
            <div className="bar-bg">
                <div className={`bar-fill ${cls}`} style={{ width: `${score * 10}%` }} />
            </div>
        </div>
    )
}

function SetupCard({ s, onAccept }: { s: TradeSetup; onAccept: (s: TradeSetup) => void }) {
    const [grade, setGrade] = useState<string | null>(null)
    const [showChart, setShowChart] = useState(false)
    const [chartData, setChartData] = useState<any[] | null>(null)

    useEffect(() => {
        axios.get(`/api/screener/grade/${s.ticker}`).then(r => {
            if (r.data?.success) setGrade(r.data.data.grade)
        }).catch(() => { })
    }, [s.ticker])

    const toggleChart = async () => {
        if (showChart) {
            setShowChart(false)
            return
        }
        setShowChart(true)
        if (!chartData) {
            try {
                const { data } = await axios.get(`/api/chart/${s.ticker}`)
                if (data.success) {
                    setChartData(data.data)
                }
            } catch { }
        }
    }

    const gradeColor: Record<string, string> = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' }
    const gc = grade ? (gradeColor[grade] || '#64748b') : null

    return (
        <div className="trade-card">
            <div className="card-header">
                <div className="card-ticker-group">
                    <div className="card-ticker">{s.ticker}</div>
                    <div className="card-sector">{s.sector}</div>
                    <SetupBadge type={s.setupType} />
                </div>
                <div className="card-header-right">
                    <div className="card-ltp">{fmt(s.ltp)}</div>
                    <div className="card-rank">Rank #{s.momentumRank} by Momentum</div>
                    {gc && grade && (
                        <span className="grade-badge" style={{ background: `${gc}20`, color: gc, border: `1px solid ${gc}40` }}>
                            Grade {grade}
                        </span>
                    )}
                </div>
            </div>
            <div className="card-body">
                <div className="card-metrics">
                    <div className="metric-box">
                        <div className="metric-label">Buy Zone</div>
                        <div className="metric-value blue">{fmt(s.buyZone)}</div>
                    </div>
                    <div className="metric-box">
                        <div className="metric-label">Target (+{s.targetPct}%)</div>
                        <div className="metric-value green">{fmt(s.target)}</div>
                    </div>
                    <div className="metric-box">
                        <div className="metric-label">Stop Loss (-{s.slPct}%)</div>
                        <div className="metric-value red">{fmt(s.stopLoss)}</div>
                    </div>
                </div>
                <div className="card-entry">
                    <span className="entry-label">⚡ Entry Trigger</span>
                    <span className="entry-text">{s.entryTrigger}</span>
                </div>
                <div className="card-info-row">
                    <div className="info-item"><div className="info-label">Trend Status</div><div className="info-value">{s.trendStatus}</div></div>
                    <div className="info-item"><div className="info-label">Volume Spike</div><div className="info-value">{s.volumeSpike}</div></div>
                    <div className="info-item"><div className="info-label">Hit Probability</div><div className={`info-value ${s.volatilityHitProb >= 60 ? 'green' : 'amber'}`}>{s.volatilityHitProb}%</div></div>
                    <div className="info-item"><div className="info-label">Setup Type</div><div className="info-value">{s.setupType}</div></div>
                </div>
                <ConfidenceBar score={s.confidenceScore} />
                {s.aiLogic && (
                    <div className="card-ai-logic">
                        <div className="ai-logic-header">
                            <span className="ai-icon">✨</span> Gemini AI Assessment: <strong className={s.aiSignal === 'BUY' ? 'green' : s.aiSignal === 'WATCH' ? 'amber' : 'red'}>{s.aiSignal}</strong>
                        </div>
                        <div className="ai-logic-text">{s.aiLogic}</div>
                    </div>
                )}
            </div>

            {showChart && (
                <div style={{ padding: '0 16px 16px' }}>
                    {!chartData ? <div style={{ color: 'var(--text3)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>Loading historical data...</div> : (
                        <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                            <TradingChart data={chartData} />
                        </div>
                    )}
                </div>
            )}

            <div className="card-footer">
                <div className="catalyst-text">💡 {s.catalyst}</div>
                <div className="card-footer-right">
                    <div className="rr-badge">RR {s.riskReward}:1</div>
                    <button className="btn-secondary-sm" onClick={toggleChart} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>{showChart ? '🔼 Hide Chart' : '📈 View Chart'}</button>
                    <a href={`/screener#${s.ticker}`} className="btn-analysis">📊 Analysis</a>
                    <button className="btn-accept" onClick={() => onAccept(s)}>✅ Accept</button>
                </div>
            </div>
        </div>
    )
}

function TradeCard({ t, onRemove }: { t: ActiveTrade; onRemove: (ticker: string) => void }) {
    const isExit = t.status === 'exit_signal'
    const prog = progressPct(t)
    const slDist = (((t.currentPrice || t.entryPrice) - t.stopLoss) / t.entryPrice * 100).toFixed(1)
    const orderText = `${t.ticker} | BUY | Entry: ${t.entryPrice} | SL: ${t.stopLoss} | Target: ${t.target}`

    const copyOrder = () => {
        navigator.clipboard.writeText(orderText).then(() => {
            alert('✅ Order details copied to clipboard!')
        }).catch(() => prompt('Copy this:', orderText))
    }

    return (
        <div className={`active-card ${isExit ? 'active-card-exit' : ''}`}>
            <div className="active-header">
                <div className="active-ticker-group">
                    <div className="active-ticker">{t.ticker}</div>
                    <div className="active-days">📅 Day {daysIn(t.entryDate)}</div>
                </div>
                <div className="active-header-right">
                    <div className={`active-pnl ${t.pnlPct >= 0 ? 'pnl-pos' : 'pnl-neg'}`}>{pct(t.pnlPct)}</div>
                    {isExit ? <div className="active-exit-flag">🚨 EXIT</div> : <div className="active-status-ok">✅ Active</div>}
                </div>
            </div>
            {isExit && t.exitReason && <div className="active-exit-reason">⚠️ {t.exitReason}</div>}
            <div className="active-progress-label">
                <span>Entry ₹{t.entryPrice.toFixed(0)}</span>
                <span className="progress-now">Now ₹{(t.currentPrice || t.entryPrice).toFixed(0)} ({prog.toFixed(0)}% to target)</span>
                <span>Target ₹{t.target.toFixed(0)}</span>
            </div>
            <div className="active-progress-bg">
                <div className={`active-progress-fill ${isExit ? 'prog-red' : 'prog-green'}`} style={{ width: `${prog}%` }} />
            </div>
            <div className="active-metrics">
                <div className="active-metric"><div className="active-metric-label">Entry</div><div className="active-metric-val cyan">{fmt(t.entryPrice)}</div></div>
                <div className="active-metric"><div className="active-metric-label">Live Price</div><div className="active-metric-val">{fmt(t.currentPrice)}</div></div>
                <div className="active-metric"><div className="active-metric-label">Stop Loss</div><div className="active-metric-val red">{fmt(t.stopLoss)}</div></div>
                <div className="active-metric"><div className="active-metric-label">Buffer to SL</div><div className={`active-metric-val ${parseFloat(slDist) < 1.5 ? 'red' : 'amber'}`}>{slDist}%</div></div>
            </div>
            <div className="active-badges-row">
                {t.breakEvenSet && <span className="be-badge">🛡️ Break-Even SL</span>}
                {t.trailReference && <span className="trail-badge">📉 Trailing: 20-EMA ₹{t.trailReference}</span>}
            </div>
            <div className="active-actions">
                <button className="btn-copy" onClick={copyOrder}>📋 Copy Order</button>
                <button className="btn-remove" onClick={() => onRemove(t.ticker)}>❌ Close Trade</button>
            </div>
        </div>
    )
}

function RiskMeter({ ms }: { ms: MarketStatus }) {
    let badge = '✅ SAFE TO TRADE', badgeCls = 'risk-safe', action = 'Normal position sizing. Execute plan.'
    let gaugeW = '20%', gaugeColor = 'linear-gradient(90deg,#10b981,#059669)'
    if (!ms.safeToTrade) {
        badge = '🚨 HIGH RISK — HALT'; badgeCls = 'risk-halt'; action = 'No new trades. Review open positions.'
        gaugeW = '95%'; gaugeColor = 'linear-gradient(90deg,#ef4444,#b91c1c)'
    } else if (ms.vixChange > 10 || ms.niftyChange < -0.8) {
        badge = '⚠️ CAUTION MODE'; badgeCls = 'risk-caution'; action = 'Reduce position size by 50%.'
        gaugeW = '55%'; gaugeColor = 'linear-gradient(90deg,#f59e0b,#d97706)'
    }
    return (
        <div className="rcc-card">
            <div className="rcc-card-header"><span className="rcc-icon">📡</span><span className="rcc-title">Market Risk Meter</span><span className="live-dot" /></div>
            <div className="risk-badge-wrap"><div className={`risk-badge ${badgeCls}`}>{badge}</div></div>
            <div className="risk-gauge-bg"><div className="risk-gauge-fill" style={{ width: gaugeW, background: gaugeColor }} /></div>
            <div className="rcc-stats">
                <div className="rcc-stat">
                    <div className="rcc-stat-label">NIFTY 50</div>
                    <div className={`rcc-stat-val ${ms.niftyChange >= 0 ? 'green' : 'red'}`}>{pct(ms.niftyChange)}</div>
                </div>
                <div className="rcc-stat">
                    <div className="rcc-stat-label">INDIA VIX Δ</div>
                    <div className={`rcc-stat-val ${ms.vixChange > 0 ? 'red' : 'green'}`}>{pct(ms.vixChange)}</div>
                </div>
                <div className="rcc-stat">
                    <div className="rcc-stat-label">ACTION</div>
                    <div className={`rcc-stat-val ${!ms.safeToTrade ? 'red' : ms.vixChange > 10 ? 'amber' : 'green'}`}>{action}</div>
                </div>
            </div>
        </div>
    )
}

function ProtocolChecklist({ ms, setups }: { ms?: MarketStatus; setups?: TradeSetup[] }) {
    const checks = [
        { label: 'Kill Switch', sub: ms?.safeToTrade ? `✅ Nifty ${pct(ms.niftyChange)} | VIX ${pct(ms.vixChange)} — market normal` : `❌ ${ms?.warning ?? 'Market at risk'}`, pass: ms?.safeToTrade ?? null },
        { label: 'Profit Trailer Rule', sub: '+5% hit → SL auto-moves to break-even', pass: true },
        { label: 'Trailing Exit Rule', sub: 'Exit if stock closes below 50-EMA', pass: true },
        { label: 'Volume Quality', sub: setups?.length ? `${setups.filter(s => parseFloat(s.volumeSpike) >= 1.5).length}/${setups.length} setups have ≥1.5× volume` : 'Run scanner to evaluate', pass: setups?.length ? setups.some(s => parseFloat(s.volumeSpike) >= 1.5) : null },
        { label: 'Fundamental Grade', sub: setups?.length ? 'Prefer Grade A/B — check badges on each card' : 'Fundamentals load after scan', pass: setups?.length ? true : null },
    ]
    const icon = (p: boolean | null) => p === true ? '✅' : p === false ? '❌' : '⏳'
    const cls = (p: boolean | null) => `rcc-check-item ${p === true ? 'check-pass' : p === false ? 'check-fail' : 'check-pending'}`
    return (
        <div className="rcc-card">
            <div className="rcc-card-header"><span className="rcc-icon">📋</span><span className="rcc-title">Protocol Checklist</span></div>
            <div className="checklist">
                {checks.map((c, i) => (
                    <div key={i} className={cls(c.pass)}>
                        <span className="check-icon">{icon(c.pass)}</span>
                        <div><div className="check-label">{c.label}</div><div className="check-sub">{c.sub}</div></div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function TradeHealth({ trades }: { trades: ActiveTrade[] }) {
    return (
        <div className="rcc-card">
            <div className="rcc-card-header"><span className="rcc-icon">🏥</span><span className="rcc-title">Trade Health Monitor</span></div>
            {!trades.length
                ? <div className="rcc-no-trades">No active trades. Accept a setup to start monitoring.</div>
                : trades.map(t => {
                    const prog = progressPct(t)
                    const cl = t.pnlPct >= 5 ? 'green' : t.pnlPct >= 0 ? 'amber' : 'red'
                    const icon = t.pnlPct >= 5 ? '🟢' : t.pnlPct >= 0 ? '🟡' : '🔴'
                    const alert = t.status === 'exit_signal' ? '🚨 EXIT SIGNAL — Check 50-EMA' : (t.pnlPct >= 5 && !t.breakEvenSet ? '⚠️ Move SL to break-even!' : '')
                    return (
                        <div key={t.ticker} className="health-row">
                            <div className="health-top">
                                <span className="health-ticker">{icon} {t.ticker}</span>
                                <span className={`health-pnl ${cl}`}>{pct(t.pnlPct)}</span>
                            </div>
                            <div className="health-prog-bg"><div className="health-prog-fill" style={{ width: `${prog}%` }} /></div>
                            <div className="health-meta">
                                <span>Entry ₹{t.entryPrice.toFixed(0)}</span>
                                <span className="health-now">Now ₹{t.currentPrice?.toFixed(0) ?? '—'}</span>
                                <span>Target ₹{t.target.toFixed(0)}</span>
                            </div>
                            {alert && <div className="health-alert">{alert}</div>}
                            {t.breakEvenSet && <div className="health-be">🛡️ Break-even SL active</div>}
                        </div>
                    )
                })}
        </div>
    )
}

function NewsFeed() {
    const [summary, setSummary] = useState<string | null>(null)
    const [items, setItems] = useState<{ title: string; link: string; pubDate: string }[]>([])

    const load = useCallback(async () => {
        try {
            const res = await axios.get(`/api/market-outlook`, { timeout: 15000 })
            if (res.data.success) {
                setSummary(res.data.summary)
                setItems(res.data.news ?? [])
            }
        } catch { }
    }, [])

    useEffect(() => { load(); const t = setInterval(load, 15 * 60 * 1000); return () => clearInterval(t) }, [load])

    const timeAgo = (pub: string) => {
        const s = Math.floor((Date.now() - new Date(pub).getTime()) / 1000)
        if (s < 3600) return Math.floor(s / 60) + 'm ago'
        if (s < 86400) return Math.floor(s / 3600) + 'h ago'
        return Math.floor(s / 86400) + 'd ago'
    }

    return (
        <div className="rcc-card rcc-news" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="rcc-card-header"><span className="rcc-icon">🤖</span><span className="rcc-title">Live Market & AI Outlook</span><span className="live-dot" /></div>

            <div className="news-list" style={{ padding: '0px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                {!summary ? <div className="news-loading" style={{ marginTop: 'auto', marginBottom: 'auto' }}>Analyzing Live Macro Data…</div> : (
                    <>
                        <div style={{ color: 'var(--text2)', fontSize: '0.9rem', lineHeight: '1.6', borderLeft: '3px solid var(--purple)', paddingLeft: '12px', background: 'var(--purple-glow, rgba(139, 92, 246, 0.05))', borderRadius: '4px', padding: '12px', marginBottom: '16px', flexShrink: 0 }}>
                            {summary}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {items.map((item, i) => (
                                <a key={i} className="news-item" href={item.link} target="_blank" rel="noopener noreferrer">
                                    <div className="news-headline">{item.title}</div>
                                    <div className="news-time">{timeAgo(item.pubDate)}</div>
                                </a>
                            ))}
                        </div>
                    </>
                )}
            </div>
            <div className="news-source">Source: Moneycontrol & Gemini AI</div>
        </div>
    )
}

// ─── Main Dashboard Page ───────────────────────────────────────
export default function DashboardPage() {
    const [scanning, setScanning] = useState(false)
    const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null)
    const [setups, setSetups] = useState<TradeSetup[]>([])
    const [trades, setTrades] = useState<ActiveTrade[]>([])
    const [history, setHistory] = useState<any[]>([])
    const [timestamp, setTimestamp] = useState<string | null>(null)
    const [hasScanned, setHasScanned] = useState(false)
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark')
    const [filterMode, setFilterMode] = useState<'all' | 'buy' | 'quality'>('all')
    const navigate = useNavigate()

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('theme', theme)
    }, [theme])

    // Load cached last scan + active trades on mount
    useEffect(() => {
        axios.get('/api/last').then(r => {
            if (r.data.success) {
                const d = r.data.data
                setMarketStatus(d.marketStatus)
                setSetups(d.setups || [])
                setTimestamp(d.timestamp)
                setHasScanned(true)
            }
        }).catch(() => { })

        const fetchTrades = async () => {
            try {
                const [trRes, histRes] = await Promise.all([
                    axios.get('/api/trades'),
                    axios.get('/api/trades/history')
                ])
                if (trRes.data.success) setTrades(trRes.data.data || [])
                if (histRes.data.success) setHistory(histRes.data.data || [])
            } catch { }
        }
        fetchTrades()
    }, [])

    const runScan = async () => {
        setScanning(true)
        try {
            const { data } = await axios.get('/api/scan')
            if (!data.success) throw new Error(data.message)
            const d = data.data
            setMarketStatus(d.marketStatus)
            setSetups(d.setups || [])
            setTrades(d.activeTrades || [])
            setTimestamp(d.timestamp)
            setHasScanned(true)
        } catch (err: any) {
            alert('Scan error: ' + err.message)
        } finally {
            setScanning(false)
        }
    }

    const refreshTrades = async () => {
        try {
            const { data } = await axios.post('/api/watch')
            if (data.success) setTrades(data.data || [])

            const hist = await axios.get('/api/trades/history')
            if (hist.data.success) setHistory(hist.data.data || [])
        } catch (err: any) {
            alert('Watch error: ' + err.message)
        }
    }

    const acceptTrade = async (setup: TradeSetup) => {
        try {
            const { data } = await axios.post('/api/trades/add', setup)
            if (!data.success) throw new Error(data.message)

            // Remove from setups screen immediately for seamless feeling
            setSetups(prev => prev.filter(s => s.ticker !== setup.ticker))

            const tr = await axios.get('/api/trades')
            if (tr.data.success) setTrades(tr.data.data || [])
        } catch (err: any) {
            alert('Error: ' + err.message)
        }
    }

    const removeTrade = async (ticker: string) => {
        if (!confirm(`Close trade for ${ticker}?`)) return
        await axios.delete(`/api/trades/${ticker}`)
        const tr = await axios.get('/api/trades')
        if (tr.data.success) setTrades(tr.data.data || [])
    }

    const msBadge = marketStatus
        ? (!marketStatus.safeToTrade ? { cls: 'badge-danger', text: 'Market At Risk' }
            : marketStatus.vixChange > 10 ? { cls: 'badge-warn', text: 'Caution Mode' }
                : { cls: 'badge-safe', text: 'Market Healthy' })
        : { cls: 'badge-loading', text: 'Checking Market…' }

    return (
        <div className="dashboard">
            {/* HEADER */}
            <header className="dash-header">
                <div className="dash-header-inner">
                    <div className="logo-group">
                        <div className="logo-icon">⚡</div>
                        <div>
                            <h1 className="logo-title">SwingEdge</h1>
                            <span className="logo-sub">Your Quantitative Edge in the Indian Market</span>
                        </div>
                    </div>
                    <div className="header-right">
                        <button className="btn-secondary-sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle Theme">
                            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
                        </button>
                        <button className="btn-secondary-sm" onClick={() => navigate('/screener')}>📊 Screener</button>
                        <span className={`status-badge ${msBadge.cls}`}>
                            <span className="status-dot" />
                            {msBadge.text}
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <button className="btn-primary" onClick={runScan} disabled={scanning}>
                                {scanning ? '⏳ Scanning…' : '🔍 Run Scanner'}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* MARKET BAR */}
            {marketStatus && timestamp && (
                <div className="market-bar">
                    <div className="market-bar-inner">
                        <div className="market-item"><span className="market-label">NIFTY</span><span className={`market-value ${marketStatus.niftyChange >= 0 ? 'positive' : 'negative'}`}>{pct(marketStatus.niftyChange)}</span></div>
                        {marketStatus.sensexChange !== undefined && <div className="market-item hidden-mobile"><span className="market-label">SENSEX</span><span className={`market-value ${marketStatus.sensexChange >= 0 ? 'positive' : 'negative'}`}>{pct(marketStatus.sensexChange)}</span></div>}
                        {marketStatus.niftyNext50Change !== undefined && <div className="market-item hidden-mobile"><span className="market-label">NEXT NIFTY</span><span className={`market-value ${marketStatus.niftyNext50Change >= 0 ? 'positive' : 'negative'}`}>{pct(marketStatus.niftyNext50Change)}</span></div>}
                        {marketStatus.niftyMidcapChange !== undefined && <div className="market-item hidden-mobile"><span className="market-label">MIDCAP</span><span className={`market-value ${marketStatus.niftyMidcapChange >= 0 ? 'positive' : 'negative'}`}>{pct(marketStatus.niftyMidcapChange)}</span></div>}
                        <div className="market-item"><span className="market-label">VIX Δ</span><span className={`market-value ${marketStatus.vixChange > 0 ? 'negative' : 'positive'}`}>{pct(marketStatus.vixChange)}</span></div>
                        {marketStatus.goldChange !== undefined && <div className="market-item hidden-mobile"><span className="market-label">GOLD</span><span className={`market-value ${marketStatus.goldChange >= 0 ? 'positive' : 'negative'}`}>{pct(marketStatus.goldChange)}</span></div>}
                        {marketStatus.silverChange !== undefined && <div className="market-item hidden-mobile"><span className="market-label">SILVER</span><span className={`market-value ${marketStatus.silverChange >= 0 ? 'positive' : 'negative'}`}>{pct(marketStatus.silverChange)}</span></div>}
                        <div className="market-warning" style={{ color: !marketStatus.safeToTrade ? 'var(--red)' : marketStatus.vixChange > 10 ? 'var(--amber)' : 'var(--green)' }}>{marketStatus.warning}</div>
                    </div>
                </div>
            )}

            {/* LOADING OVERLAY */}
            {scanning && (
                <div className="spinner-overlay">
                    <div className="spinner" />
                    <div className="spinner-text">Scanning Nifty 200 Stocks…</div>
                    <div className="spinner-sub">Fetching 200-day OHLCV data · This takes 30–90 seconds…</div>
                </div>
            )}

            <main className="dash-main">
                {/* KILL SWITCH */}
                {marketStatus && !marketStatus.safeToTrade && (
                    <div className="kill-switch">
                        <div className="kill-icon">🚨</div>
                        <div>
                            <div className="kill-title">KILL SWITCH ACTIVATED</div>
                            <div className="kill-message">{marketStatus.warning}</div>
                        </div>
                    </div>
                )}

                {/* EMPTY STATE */}
                {!hasScanned && (
                    <div className="empty-state">
                        <div className="empty-icon">🎯</div>
                        <h2 className="empty-title">Ready to Scan</h2>
                        <p className="empty-sub">Click <strong>Run Scanner</strong> to scan <strong>110+ NSE Large &amp; Midcap</strong> stocks for high-probability swing setups using DMA200, EMA, RSI &amp; Volume filters.</p>
                        <div className="empty-metrics">
                            <div className="empty-metric"><span>📊</span> RSI 35–50 Pullback</div>
                            <div className="empty-metric"><span>📈</span> Price &gt; 200 DMA</div>
                            <div className="empty-metric"><span>💧</span> Volume 1.5× Spike</div>
                            <div className="empty-metric"><span>🥇</span> Beats Nifty 3M RS</div>
                        </div>
                    </div>
                )}

                {/* SETUPS */}
                {hasScanned && (
                    <section className="section">
                        <div className="section-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <h2 className="section-title">🏆 Top Trade Setups</h2>
                                {timestamp && <span style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600 }}>Last Scan: {ago(timestamp)}</span>}
                            </div>
                            <span className="badge-count">{setups.length} Found</span>
                        </div>

                        {/* Quality Filter Bar */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            {(['all', 'buy', 'quality'] as const).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setFilterMode(mode)}
                                    style={{
                                        padding: '6px 14px', borderRadius: '99px', fontSize: '0.78rem',
                                        fontWeight: 700, cursor: 'pointer', border: '1px solid',
                                        transition: 'all 0.2s',
                                        background: filterMode === mode ? (mode === 'all' ? 'rgba(99,102,241,0.2)' : mode === 'buy' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)') : 'transparent',
                                        borderColor: filterMode === mode ? (mode === 'all' ? '#6366f1' : mode === 'buy' ? '#10b981' : '#f59e0b') : 'var(--border)',
                                        color: filterMode === mode ? (mode === 'all' ? '#818cf8' : mode === 'buy' ? '#10b981' : '#f59e0b') : 'var(--text3)',
                                    }}
                                >
                                    {mode === 'all' ? '📋 All Setups' : mode === 'buy' ? '✅ BUY Signal Only' : '⭐ High Confidence (≥7)'}
                                </button>
                            ))}
                        </div>

                        {(() => {
                            const filtered = setups.filter(s => {
                                if (filterMode === 'buy') return s.aiSignal === 'BUY'
                                if (filterMode === 'quality') return s.confidenceScore >= 7 && (s.aiSignal === 'BUY' || s.aiSignal === 'WATCH')
                                return true
                            })
                            return filtered.length === 0
                                ? <div className="no-setups">No setups match the selected filter. Try 'All Setups'.</div>
                                : <div className="setups-grid">{filtered.map(s => <SetupCard key={s.ticker} s={s} onAccept={acceptTrade} />)}</div>
                        })()}
                    </section>
                )}

                {/* ACTIVE TRADES */}
                {trades.length > 0 && (
                    <section className="section">
                        <div className="section-header">
                            <h2 className="section-title">🔁 Active Trades Monitor</h2>
                            <button className="btn-secondary-sm" onClick={refreshTrades}>🔄 Refresh Live Prices</button>
                        </div>
                        <div className="trades-summary-bar">
                            <div className="ts-item"><div className="ts-label">Open Positions</div><div className="ts-val">{trades.length}</div></div>
                            <div className="ts-item"><div className="ts-label">Avg P&L</div><div className={`ts-val ${trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length >= 0 ? 'green' : 'red'}`}>{pct(trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length)}</div></div>
                            <div className="ts-item"><div className="ts-label">In Profit</div><div className="ts-val green">{trades.filter(t => t.pnlPct >= 0).length} / {trades.length}</div></div>
                            <div className="ts-item"><div className="ts-label">Exit Signals</div><div className={`ts-val ${trades.filter(t => t.status === 'exit_signal').length > 0 ? 'red' : 'green'}`}>{trades.filter(t => t.status === 'exit_signal').length > 0 ? `🚨 ${trades.filter(t => t.status === 'exit_signal').length}` : '✅ None'}</div></div>
                        </div>
                        <div className="active-grid">
                            {trades.map(t => <TradeCard key={t.ticker} t={t} onRemove={removeTrade} />)}
                        </div>
                    </section>
                )}

                {/* TRADE HISTORY */}
                {history.length > 0 && (
                    <section className="section">
                        <div className="section-header">
                            <h2 className="section-title">📊 Closed Trades History</h2>
                        </div>
                        <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
                                        <th style={{ padding: '12px 16px', fontWeight: 600 }}>Date</th>
                                        <th style={{ padding: '12px 16px', fontWeight: 600 }}>Ticker</th>
                                        <th style={{ padding: '12px 16px', fontWeight: 600 }}>Entry</th>
                                        <th style={{ padding: '12px 16px', fontWeight: 600 }}>Exit</th>
                                        <th style={{ padding: '12px 16px', fontWeight: 600 }}>P&L %</th>
                                        <th style={{ padding: '12px 16px', fontWeight: 600 }}>Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map(h => {
                                        const pnl = +(((h.exitPrice - h.entryPrice) / h.entryPrice) * 100).toFixed(2);
                                        const isWin = pnl >= 0;
                                        return (
                                            <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                                                <td style={{ padding: '12px 16px', color: 'var(--text2)' }}>{new Date(h.exitDate).toLocaleDateString()}</td>
                                                <td style={{ padding: '12px 16px', fontWeight: 700 }}>{h.ticker}</td>
                                                <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono', color: 'var(--text2)' }}>₹{h.entryPrice}</td>
                                                <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono', color: 'var(--text2)' }}>₹{h.exitPrice}</td>
                                                <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono', fontWeight: 600, color: isWin ? 'var(--green)' : 'var(--red)' }}>
                                                    {pnl > 0 ? '+' : ''}{pnl}%
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: isWin ? 'var(--green-glow)' : 'var(--red-glow)', color: isWin ? 'var(--green)' : 'var(--red)' }}>
                                                        {isWin ? 'WIN' : 'LOSS'}
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* RISK COMMAND CENTER */}
                <section className="section rcc-section">
                    <div className="section-header">
                        <div>
                            <h2 className="section-title" style={{ margin: 0 }}>🛡️ Risk Command Center</h2>
                            <span className="rcc-subtitle">Live market risk monitoring &amp; trade health</span>
                        </div>
                    </div>
                    <div className="rcc-grid">
                        {marketStatus ? <RiskMeter ms={marketStatus} /> : (
                            <div className="rcc-card"><div className="rcc-card-header"><span className="rcc-icon">📡</span><span className="rcc-title">Market Risk Meter</span></div><div className="rcc-no-trades">Run a scan to view risk data.</div></div>
                        )}
                        <ProtocolChecklist ms={marketStatus || undefined} setups={setups.length ? setups : undefined} />
                        <TradeHealth trades={trades} />
                        <NewsFeed />
                    </div>
                </section>
            </main>

            {/* FOOTER */}
            <footer className="dash-footer">
                <p className="footer-warn">⚠️ <strong>Risk Disclaimer:</strong> SwingEdge is for educational and personal research purposes only. It does not constitute financial advice. All trading involves risk. Always consult a SEBI-registered advisor before taking positions.</p>
                <p className="footer-copy">SwingEdge © 2026 — Your Quantitative Edge in the Indian Market</p>
            </footer>
        </div>
    )
}
