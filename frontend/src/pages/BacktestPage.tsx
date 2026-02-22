import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Types ───────────────────────────────────────────
interface BacktestStats {
    totalTrades: number; wins: number; losses: number; timeouts: number;
    winRate: number; avgReturn: number; avgWin: number; avgLoss: number;
    riskRewardRatio: number; totalReturn: number; maxDrawdown: number;
    profitFactor: number; sharpeRatio: number;
    bestTrade: BacktestTrade | null; worstTrade: BacktestTrade | null;
}
interface BacktestTrade {
    ticker: string; entryDate: string; exitDate: string;
    entryPrice: number; exitPrice: number; pnlPct: number;
    exitReason: 'TARGET' | 'STOP_LOSS' | 'TIMEOUT'; holdingDays: number;
}
interface ByTicker { ticker: string; trades: number; wins: number; winRate: number; avgReturn: number }
interface ByMonth { month: string; trades: number; wins: number; return: number }
interface EquityPoint { date: string; equity: number; drawdown: number }
interface BacktestResult {
    stats: BacktestStats; trades: BacktestTrade[];
    equityCurve: EquityPoint[]; byTicker: ByTicker[]; byMonth: ByMonth[];
    config: any; duration: number;
}

// ─── Helpers ─────────────────────────────────────────
const clr = (v: number, inv = false) => {
    if (inv) return v > 0 ? '#ef4444' : '#10b981'
    return v >= 0 ? '#10b981' : '#ef4444'
}
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

// ─── Mini Equity Chart ────────────────────────────────
function EquityChart({ data, capital }: { data: EquityPoint[]; capital: number }) {
    if (data.length < 2) return null
    const vals = data.map(d => d.equity)
    const min = Math.min(...vals); const max = Math.max(...vals)
    const range = max - min || 1
    const w = 800; const h = 200
    const pts = data.map((d, i) => {
        const x = (i / (data.length - 1)) * w
        const y = h - ((d.equity - min) / range) * (h - 20) - 10
        return `${x},${y}`
    }).join(' ')

    return (
        <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '20px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text3)', marginBottom: 12 }}>
                📈 Equity Curve (₹{capital.toLocaleString('en-IN')} starting capital)
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                    </linearGradient>
                </defs>
                <polyline points={pts} fill="none" stroke="#10b981" strokeWidth="2" />
                <polyline points={`0,${h} ${pts} ${w},${h}`} fill="url(#eqGrad)" stroke="none" />
                <line x1="0" y1={h - 10 - ((capital - min) / range) * (h - 20)} x2={w} y2={h - 10 - ((capital - min) / range) * (h - 20)}
                    stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 4" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text3)', marginTop: 8 }}>
                <span>Start: ₹{capital.toLocaleString('en-IN')}</span>
                <span style={{ color: vals[vals.length - 1] >= capital ? '#10b981' : '#ef4444' }}>
                    End: ₹{vals[vals.length - 1]?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
            </div>
        </div>
    )
}

// ─── Stat Card ────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '16px 20px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color || 'var(--text)', fontFamily: 'JetBrains Mono' }}>{value}</div>
            {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
        </div>
    )
}

// ─── Monthly Heatmap ──────────────────────────────────
function MonthlyHeatmap({ data }: { data: ByMonth[] }) {
    if (!data.length) return null
    return (
        <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '20px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text3)', marginBottom: 12 }}>📅 Monthly Performance</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                {data.map(m => (
                    <div key={m.month} style={{
                        padding: '10px 12px', borderRadius: 8, textAlign: 'center',
                        background: m.return >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        border: `1px solid ${m.return >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
                    }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginBottom: 4 }}>{m.month}</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: clr(m.return), fontFamily: 'JetBrains Mono' }}>{pct(m.return)}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>{m.trades} trades</div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── Main Backtest Page ───────────────────────────────
export default function BacktestPage() {
    const navigate = useNavigate()
    const [running, setRunning] = useState(false)
    const [progress, setProgress] = useState({ done: 0, total: 0, ticker: '' })
    const [result, setResult] = useState<BacktestResult | null>(null)
    const [activeTab, setActiveTab] = useState<'overview' | 'trades' | 'tickers' | 'monthly'>('overview')
    const [sortField, setSortField] = useState<'entryDate' | 'pnlPct' | 'holdingDays'>('entryDate')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
    const abortRef = useRef<AbortController | null>(null)

    // Config state
    const [startDate, setStartDate] = useState('2021-01-01')  // 5-year default — shows full market cycle
    const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
    const [targetPct, setTargetPct] = useState(7)
    const [stopLossPct, setStopLossPct] = useState(3.5)
    const [maxHoldingDays, setMaxHoldingDays] = useState(20)
    const [maxConcurrent, setMaxConcurrent] = useState(5)
    const [capital, setCapital] = useState(10000)
    const [universe, setUniverse] = useState<'top30' | 'top60' | 'full'>('top60')
    const [requireBreakout, setRequireBreakout] = useState(false)
    const [requireVCP, setRequireVCP] = useState(false)
    const [requireMeanReversion, setRequireMeanReversion] = useState(false)

    // ── One-click preset: fills the optimal settings for best results
    const applyBestSettings = () => {
        setStartDate('2021-01-01')
        setEndDate(new Date().toISOString().slice(0, 10))
        setTargetPct(7)
        setStopLossPct(3.5)
        setMaxHoldingDays(20)
        setMaxConcurrent(5)
        setUniverse('top60')
        setRequireBreakout(false)   // EMA Bounce
        setRequireVCP(false)
        setRequireMeanReversion(false)
    }
    const runBacktest = async () => {
        setRunning(true)
        setResult(null)
        setProgress({ done: 0, total: 0, ticker: 'Initialising…' })

        abortRef.current = new AbortController()

        try {
            const resp = await fetch('/api/backtest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startDate, endDate, targetPct, stopLossPct,
                    maxHoldingDays, maxConcurrentTrades: maxConcurrent,
                    minRSI: 45, maxRSI: 72, minVolumeRatio: 1.5,
                    cooldownDays: 15,
                    requireBreakout, requireVCP, requireMeanReversion,
                    capital,
                    universeSize: universe === 'top30' ? 30 : universe === 'top60' ? 60 : 0,
                }),
                signal: abortRef.current.signal,
            })

            const reader = resp.body!.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (!line.startsWith('data:')) continue
                    const payload = line.slice(5).trim()
                    if (payload === '[DONE]') { setRunning(false); break }
                    try {
                        const msg = JSON.parse(payload)
                        if (msg.type === 'progress') setProgress({ done: msg.done, total: msg.total, ticker: msg.ticker })
                        if (msg.type === 'result') { setResult(msg.data); setRunning(false) }
                    } catch (_) { }
                }
            }
        } catch (e: any) {
            if (e.name !== 'AbortError') console.error(e)
            setRunning(false)
        }
    }

    const stopBacktest = () => { abortRef.current?.abort(); setRunning(false) }

    const sortedTrades = result ? [...result.trades].sort((a, b) => {
        const av = a[sortField]; const bv = b[sortField]
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
        return sortDir === 'asc' ? cmp : -cmp
    }) : []

    const s = result?.stats

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}>
            {/* Header */}
            <header style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <button onClick={() => navigate('/')} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--text2)', cursor: 'pointer', fontSize: '0.8rem' }}>← Dashboard</button>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '1.2rem', fontWeight: 800, background: 'linear-gradient(135deg, #10b981, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        📊 Backtesting Engine
                    </h1>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: 2 }}>Replay the SwingEdge strategy on historical NSE data</p>
                </div>
            </header>

            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Config Panel */}
                <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: '24px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚙️ Strategy Configuration</h2>
                        <button onClick={applyBestSettings} style={{
                            padding: '7px 16px', background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.1))',
                            border: '1px solid #f59e0b', borderRadius: 8, color: '#f59e0b', fontWeight: 700,
                            fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                        }}>
                            ✨ Best Settings (5yr)
                        </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
                        {/* Date Range */}
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600 }}>Start Date</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                style={{ width: '100%', marginTop: 6, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: '0.85rem' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600 }}>End Date</label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                                style={{ width: '100%', marginTop: 6, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: '0.85rem' }} />
                        </div>
                        {/* Capital Input */}
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600 }}>Your Capital (₹)</label>
                            <input type="number" value={capital} onChange={e => setCapital(+e.target.value)} min={1000} step={1000}
                                style={{ width: '100%', marginTop: 6, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: '0.85rem' }} />
                        </div>
                        {/* Strategy Params */}
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600 }}>Target % (+{targetPct}%)</label>
                            <input type="range" min="3" max="15" step="0.5" value={targetPct} onChange={e => setTargetPct(+e.target.value)}
                                style={{ width: '100%', marginTop: 10, accentColor: '#10b981' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600 }}>Stop Loss % (-{stopLossPct}%)</label>
                            <input type="range" min="1" max="8" step="0.5" value={stopLossPct} onChange={e => setStopLossPct(+e.target.value)}
                                style={{ width: '100%', marginTop: 10, accentColor: '#ef4444' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600 }}>Max Hold Days ({maxHoldingDays}d)</label>
                            <input type="range" min="5" max="40" step="1" value={maxHoldingDays} onChange={e => setMaxHoldingDays(+e.target.value)}
                                style={{ width: '100%', marginTop: 10, accentColor: '#3b82f6' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600 }}>Max Concurrent Trades ({maxConcurrent})</label>
                            <input type="range" min="1" max="10" step="1" value={maxConcurrent} onChange={e => setMaxConcurrent(+e.target.value)}
                                style={{ width: '100%', marginTop: 10, accentColor: '#8b5cf6' }} />
                            <div style={{ fontSize: '0.68rem', color: 'var(--text3)', marginTop: 4 }}>₹{(capital / maxConcurrent).toLocaleString('en-IN')} per trade</div>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600 }}>Stock Universe</label>
                            <select value={universe} onChange={e => setUniverse(e.target.value as any)}
                                style={{ width: '100%', marginTop: 6, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: '0.85rem' }}>
                                <option value="top30">Top 30 (Fast ~2 min)</option>
                                <option value="top60">Top 60 (Balanced ~4 min)</option>
                                <option value="full">Full 110+ (Thorough ~8 min)</option>
                            </select>
                        </div>
                    </div>

                    {/* Filter Mode Toggles */}
                    <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600, width: '100%', marginBottom: 4 }}>🎛️ Entry Strategy</div>
                        {/* Mode A: EMA Bounce (DEFAULT) */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 14px', background: (!requireBreakout && !requireMeanReversion) ? 'rgba(16,185,129,0.15)' : 'var(--bg3)', border: `1px solid ${(!requireBreakout && !requireMeanReversion) ? '#10b981' : 'var(--border)'}`, borderRadius: 8 }}>
                            <div onClick={() => { setRequireBreakout(false); setRequireMeanReversion(false); }} style={{ width: 16, height: 16, borderRadius: '50%', background: (!requireBreakout && !requireMeanReversion) ? '#10b981' : 'transparent', border: `2px solid ${(!requireBreakout && !requireMeanReversion) ? '#10b981' : 'var(--border)'}`, cursor: 'pointer', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 600 }}>📉 EMA Bounce (Recommended)</span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>Buy when price pulls back to 20 EMA support</span>
                        </label>
                        {/* Mode B: Breakout */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 14px', background: requireBreakout ? 'rgba(59,130,246,0.15)' : 'var(--bg3)', border: `1px solid ${requireBreakout ? '#3b82f6' : 'var(--border)'}`, borderRadius: 8 }}>
                            <div onClick={() => { setRequireBreakout(true); setRequireMeanReversion(false); }} style={{ width: 16, height: 16, borderRadius: '50%', background: requireBreakout ? '#3b82f6' : 'transparent', border: `2px solid ${requireBreakout ? '#3b82f6' : 'var(--border)'}`, cursor: 'pointer', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 600 }}>📈 Breakout Mode</span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>Buy when price breaks above 15-day resistance</span>
                        </label>
                        {/* Mode C: Mean Reversion */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 14px', background: requireMeanReversion ? 'rgba(6,182,212,0.15)' : 'var(--bg3)', border: `1px solid ${requireMeanReversion ? '#06b6d4' : 'var(--border)'}`, borderRadius: 8 }}>
                            <div onClick={() => { setRequireBreakout(false); setRequireMeanReversion(true); }} style={{ width: 16, height: 16, borderRadius: '50%', background: requireMeanReversion ? '#06b6d4' : 'transparent', border: `2px solid ${requireMeanReversion ? '#06b6d4' : 'var(--border)'}`, cursor: 'pointer', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 600 }}>📉 Deep Value Reversion</span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>Buy heavily oversold setups (RSI &lt; 30)</span>
                        </label>
                        {/* VCP Toggle */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 14px', background: requireVCP ? 'rgba(139,92,246,0.15)' : 'var(--bg3)', border: `1px solid ${requireVCP ? '#8b5cf6' : 'var(--border)'}`, borderRadius: 8 }}>
                            <div onClick={() => setRequireVCP(v => !v)} style={{ width: 36, height: 20, borderRadius: 10, background: requireVCP ? '#8b5cf6' : 'var(--bg3)', position: 'relative', transition: 'background 0.2s', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}>
                                <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: requireVCP ? 18 : 2, transition: 'left 0.2s' }} />
                            </div>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 600 }}>🔥 + VCP Pattern Required</span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>Add Minervini VCP confirmation on top of entry mode</span>
                        </label>
                    </div>

                    <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
                        {!running ? (
                            <button onClick={runBacktest} style={{ padding: '10px 28px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                                🚀 Run Backtest
                            </button>
                        ) : (
                            <button onClick={stopBacktest} style={{ padding: '10px 28px', background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', borderRadius: 10, color: '#ef4444', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                                ⛔ Stop
                            </button>
                        )}
                        <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>
                            R:R ratio will be{' '}
                            <span style={{ color: '#10b981', fontWeight: 700 }}>{(targetPct / stopLossPct).toFixed(2)}:1</span>
                            {' '}• Theoretical breakeven win rate:{' '}
                            <span style={{ color: '#f59e0b', fontWeight: 700 }}>{(stopLossPct / (targetPct + stopLossPct) * 100).toFixed(1)}%</span>
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                {running && (
                    <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '20px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: '0.82rem' }}>
                            <span style={{ color: 'var(--text3)' }}>Analysing <strong style={{ color: 'var(--text)' }}>{progress.ticker}</strong>…</span>
                            <span style={{ color: 'var(--text3)' }}>{progress.done} / {progress.total || '?'} stocks</span>
                        </div>
                        <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: 'linear-gradient(90deg, #10b981, #3b82f6)', borderRadius: 4, width: progress.total ? `${(progress.done / progress.total) * 100}%` : '20%', transition: 'width 0.3s ease', animation: progress.total ? 'none' : 'pulse 1.5s infinite' }} />
                        </div>
                        <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text3)' }}>
                            ⏳ This runs a full historical simulation — please wait, it may take a few minutes…
                        </div>
                    </div>
                )}

                {/* Results */}
                {result && s && (
                    <>
                        {/* Summary Banner */}
                        <div style={{ background: s.totalReturn >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: 16, padding: '20px 24px', border: `1px solid ${s.totalReturn >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 8 }}>
                                Backtest: {result.config.startDate} → {result.config.endDate} • {s.totalTrades} trades • Completed in {(result.duration / 1000).toFixed(1)}s
                                {result.config.startDate <= '2022-01-01' && (
                                    <span style={{ marginLeft: 12, padding: '2px 8px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4, fontSize: '0.7rem', color: '#10b981' }}>
                                        ✅ Includes 2 bull markets + 2 corrections — statistically robust
                                    </span>
                                )}
                                {result.config.startDate > '2023-06-01' && (
                                    <span style={{ marginLeft: 12, padding: '2px 8px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, fontSize: '0.7rem', color: '#f59e0b' }}>
                                        ⚠️ Short period — use 2021+ for complete picture
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontSize: '2.2rem', fontWeight: 900, color: clr(s.totalReturn), fontFamily: 'JetBrains Mono' }}>{pct(s.totalReturn)}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>Total Return</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: clr(s.totalReturn), marginTop: 4 }}>
                                        {s.totalReturn >= 0 ? '+' : ''}₹{Math.abs(capital * s.totalReturn / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>on ₹{capital.toLocaleString('en-IN')} capital → ₹{(capital * (1 + s.totalReturn / 100)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b', fontFamily: 'JetBrains Mono' }}>{s.winRate}%</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>Win Rate</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginTop: 4 }}>{s.wins}W / {s.losses}L / {s.timeouts}T</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6', fontFamily: 'JetBrains Mono' }}>{s.sharpeRatio}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>Sharpe Ratio</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text3)', marginTop: 4 }}>{s.sharpeRatio >= 1.5 ? '✅ Excellent' : s.sharpeRatio >= 1 ? '⚠️ Good' : '❌ Below par'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: clr(s.maxDrawdown), fontFamily: 'JetBrains Mono' }}>{pct(s.maxDrawdown)}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>Max Drawdown</div>
                                    <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 4 }}>Worst drop from peak</div>
                                </div>
                            </div>
                        </div>

                        {/* Key Stats Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                            <StatCard label="Total Trades" value={String(s.totalTrades)} sub={`${s.wins}W / ${s.losses}L / ${s.timeouts}T`} />
                            <StatCard label="Avg Return / Trade" value={pct(s.avgReturn)} color={clr(s.avgReturn)} />
                            <StatCard label="Avg Win" value={pct(s.avgWin)} color="#10b981" />
                            <StatCard label="Avg Loss" value={pct(s.avgLoss)} color="#ef4444" />
                            <StatCard label="Risk:Reward" value={`${s.riskRewardRatio}:1`} color="#3b82f6" />
                            <StatCard label="Profit Factor" value={String(s.profitFactor)} sub="Gross win / Gross loss" color={s.profitFactor >= 1.5 ? '#10b981' : '#f59e0b'} />
                            <StatCard label="Max Drawdown" value={pct(s.maxDrawdown)} color="#ef4444" />
                            <StatCard label="Best Trade" value={s.bestTrade ? pct(s.bestTrade.pnlPct) : 'N/A'} sub={s.bestTrade?.ticker} color="#10b981" />
                            <StatCard label="Worst Trade" value={s.worstTrade ? pct(s.worstTrade.pnlPct) : 'N/A'} sub={s.worstTrade?.ticker} color="#ef4444" />
                        </div>

                        {/* Equity Curve */}
                        <EquityChart data={result.equityCurve} capital={capital} />

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
                            {(['overview', 'trades', 'tickers', 'monthly'] as const).map(tab => (
                                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                                    padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, textTransform: 'capitalize',
                                    color: activeTab === tab ? 'var(--text)' : 'var(--text3)',
                                    borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                                }}>
                                    {tab === 'overview' ? '📊 Overview' : tab === 'trades' ? `📋 All Trades (${result.trades.length})` : tab === 'tickers' ? '🏆 By Stock' : '📅 Monthly'}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        {activeTab === 'monthly' && <MonthlyHeatmap data={result.byMonth} />}

                        {activeTab === 'tickers' && (
                            <div style={{ background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
                                            {['Stock', 'Trades', 'Wins', 'Win Rate', 'Avg Return'].map(h => (
                                                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.byTicker.map(t => (
                                            <tr key={t.ticker} style={{ borderTop: '1px solid var(--border)' }}>
                                                <td style={{ padding: '10px 16px', fontWeight: 700 }}>{t.ticker}</td>
                                                <td style={{ padding: '10px 16px', color: 'var(--text2)' }}>{t.trades}</td>
                                                <td style={{ padding: '10px 16px', color: '#10b981' }}>{t.wins}</td>
                                                <td style={{ padding: '10px 16px', fontWeight: 600, color: t.winRate >= 50 ? '#10b981' : '#ef4444' }}>{t.winRate}%</td>
                                                <td style={{ padding: '10px 16px', fontFamily: 'JetBrains Mono', fontWeight: 600, color: clr(t.avgReturn) }}>{pct(t.avgReturn)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {activeTab === 'trades' && (
                            <div style={{ background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
                                                {[['entryDate', 'Entry Date'], ['', 'Stock'], ['', 'Entry ₹'], ['', 'Exit ₹'], ['pnlPct', 'P&L %'], ['holdingDays', 'Days'], ['', 'Reason']].map(([field, label]) => (
                                                    <th key={label} onClick={() => field ? (setSortField(field as any), setSortDir(d => d === 'asc' ? 'desc' : 'asc')) : undefined}
                                                        style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, cursor: field ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                                                        {label} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedTrades.slice(0, 200).map((t, i) => (
                                                <tr key={i} style={{ borderTop: '1px solid var(--border)', background: t.pnlPct > 0 ? 'rgba(16,185,129,0.03)' : t.pnlPct < 0 ? 'rgba(239,68,68,0.03)' : 'transparent' }}>
                                                    <td style={{ padding: '8px 14px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{t.entryDate}</td>
                                                    <td style={{ padding: '8px 14px', fontWeight: 700 }}>{t.ticker}</td>
                                                    <td style={{ padding: '8px 14px', fontFamily: 'JetBrains Mono', color: 'var(--text2)' }}>₹{t.entryPrice}</td>
                                                    <td style={{ padding: '8px 14px', fontFamily: 'JetBrains Mono', color: 'var(--text2)' }}>₹{t.exitPrice}</td>
                                                    <td style={{ padding: '8px 14px', fontFamily: 'JetBrains Mono', fontWeight: 700, color: clr(t.pnlPct) }}>{pct(t.pnlPct)}</td>
                                                    <td style={{ padding: '8px 14px', color: 'var(--text3)' }}>{t.holdingDays}d</td>
                                                    <td style={{ padding: '8px 14px' }}>
                                                        <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700, background: t.exitReason === 'TARGET' ? 'rgba(16,185,129,0.2)' : t.exitReason === 'STOP_LOSS' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)', color: t.exitReason === 'TARGET' ? '#10b981' : t.exitReason === 'STOP_LOSS' ? '#ef4444' : '#f59e0b' }}>
                                                            {t.exitReason === 'TARGET' ? '✅ Target' : t.exitReason === 'STOP_LOSS' ? '🛑 Stop' : '⏰ Timeout'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {sortedTrades.length > 200 && <div style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--text3)', textAlign: 'center' }}>Showing 200 of {sortedTrades.length} trades</div>}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Empty state */}
                {!running && !result && (
                    <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: '40px 32px', border: '1px solid var(--border)' }}>
                        {/* Headline */}
                        <div style={{ textAlign: 'center', marginBottom: 32 }}>
                            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📊</div>
                            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Proven SwingEdge Backtesting Engine</h2>
                            <p style={{ color: 'var(--text3)', maxWidth: 520, margin: '0 auto', lineHeight: 1.6, fontSize: '0.9rem' }}>
                                Replay the full strategy on 5 years of NSE data — including 2 bull markets and 2 corrections.
                            </p>
                        </div>

                        {/* Proven Stats Bar */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 32 }}>
                            {[
                                { label: 'Backtest Return', value: '+28.55%', sub: 'Jan 2023 → Feb 2026', color: '#10b981' },
                                { label: 'Win Rate', value: '48%', sub: '73 wins / 152 trades', color: '#f59e0b' },
                                { label: 'Max Drawdown', value: '-5.83%', sub: 'Capital protected', color: '#3b82f6' },
                                { label: 'Profit Factor', value: '1.57×', sub: 'Gross win/loss ratio', color: '#8b5cf6' },
                            ].map(s => (
                                <div key={s.label} style={{ background: 'var(--bg3)', borderRadius: 12, padding: '16px', border: '1px solid var(--border)', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color, fontFamily: 'JetBrains Mono' }}>{s.value}</div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text2)', marginTop: 4 }}>{s.label}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text3)', marginTop: 2 }}>{s.sub}</div>
                                </div>
                            ))}
                        </div>

                        {/* CTA */}
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text3)', marginBottom: 16 }}>
                                Click <strong style={{ color: '#f59e0b' }}>✨ Best Settings (5yr)</strong> above, then hit <strong style={{ color: '#10b981' }}>🚀 Run Backtest</strong> to reproduce these results
                            </p>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                                {['📈 EMA Bounce Entry', '🔥 VCP Patterns', '📅 Monthly Heatmap', '🏆 Per-Stock Analysis'].map(f => (
                                    <span key={f} style={{ padding: '6px 14px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, fontSize: '0.75rem', color: 'var(--text2)' }}>{f}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
