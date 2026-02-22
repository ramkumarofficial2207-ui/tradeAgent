import { useState, useEffect } from 'react'
import axios from 'axios'
import { useNavigate, useLocation } from 'react-router-dom'

interface StockItem { ticker: string; sector: string }

export default function ScreenerPage() {
    const [universe, setUniverse] = useState<StockItem[]>([])
    const [search, setSearch] = useState('')
    const [activeSector, setActiveSector] = useState('All')
    const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
    const [report, setReport] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()
    const location = useLocation()

    useEffect(() => {
        axios.get('/api/screener/universe').then(r => {
            if (r.data.success) setUniverse(r.data.data)
        }).catch(() => { })
    }, [])

    useEffect(() => {
        const hash = location.hash.replace('#', '')
        if (hash && universe.length) {
            const found = universe.find(s => s.ticker === hash.toUpperCase())
            if (found) selectStock(found.ticker)
        }
    }, [location.hash, universe])

    const sectors = ['All', ...Array.from(new Set(universe.map(s => s.sector))).sort()]

    const filtered = universe.filter(s => {
        const matchSector = activeSector === 'All' || s.sector === activeSector
        const matchSearch = s.ticker.toLowerCase().includes(search.toLowerCase()) ||
            s.sector.toLowerCase().includes(search.toLowerCase())
        return matchSector && matchSearch
    })

    const selectStock = async (ticker: string, forceRefresh = false) => {
        setSelectedTicker(ticker)
        setReport(null)
        setLoading(true)
        try {
            const url = `/api/screener/stock/${ticker}${forceRefresh ? '?refresh=1' : ''}`
            const { data } = await axios.get(url)
            if (data.success) setReport(data.data)
        } catch { setReport(null) }
        finally { setLoading(false) }
    }

    const fmt = (n: number) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const pct = (n: number) => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'

    return (
        <div className="sc-layout">
            <nav className="sc-nav">
                <div className="sc-nav-inner">
                    <div className="sc-logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
                        <span className="sc-logo-icon">⚡</span>
                        <span className="sc-logo-text">SwingEdge</span>
                        <span className="sc-logo-sep">›</span>
                        <span className="sc-logo-page">Stock Screener</span>
                    </div>
                    <button className="btn-secondary-sm" onClick={() => navigate('/')}>⬅ Dashboard</button>
                </div>
            </nav>

            <div className="sc-body">
                <aside className="sc-sidebar">
                    <div className="sc-search-wrap">
                        <input className="sc-search" placeholder="Search ticker or sector…" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div className="sc-sector-tabs">
                        {sectors.map(s => (
                            <button key={s} className={`sc-sector-tab ${activeSector === s ? 'active' : ''}`} onClick={() => setActiveSector(s)}>{s}</button>
                        ))}
                    </div>
                    <div className="sc-stock-list">
                        {filtered.map(s => (
                            <div key={s.ticker} className={`sc-stock-item ${selectedTicker === s.ticker ? 'active' : ''}`} onClick={() => selectStock(s.ticker)}>
                                <div>
                                    <div className="sc-stock-ticker">{s.ticker}</div>
                                    <div className="sc-stock-sector">{s.sector}</div>
                                </div>
                            </div>
                        ))}
                        {!filtered.length && <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text3)' }}>No stocks match.</div>}
                    </div>
                </aside>

                <div className="sc-main">
                    {!selectedTicker && (
                        <div className="empty-state">
                            <div className="empty-icon">📊</div>
                            <h2 className="empty-title">Select a Stock</h2>
                            <p className="empty-sub">Choose a stock from the list to view its full technical and fundamental report.</p>
                        </div>
                    )}
                    {selectedTicker && loading && (
                        <div className="empty-state">
                            <div className="spinner" style={{ margin: '0 auto' }} />
                            <p className="empty-sub" style={{ marginTop: 16 }}>Loading {selectedTicker} data from NSE + Screener.in…</p>
                        </div>
                    )}
                    {selectedTicker && !loading && !report && (
                        <div className="empty-state">
                            <div className="empty-icon">⚠️</div>
                            <h2 className="empty-title">No Data Found</h2>
                            <p className="empty-sub">Could not fetch data for <strong>{selectedTicker}</strong>. Market may be closed or ticker unavailable.</p>
                        </div>
                    )}
                    {selectedTicker && !loading && report && <StockReport s={report} fmt={fmt} pct={pct} onRefresh={() => selectStock(selectedTicker, true)} />}
                </div>
            </div>
        </div>
    )
}

// ── StockReport: uses actual flat StockReport fields from fundamentalService ──
function StockReport({ s, fmt, pct, onRefresh }: { s: any; fmt: (n: number) => string; pct: (n: number) => string; onRefresh: () => void }) {
    const [tab, setTab] = useState('setup')
    const val = (n: number | null | undefined, suffix = '') => n != null ? n.toFixed(2) + suffix : '—'

    const tabs = [
        { id: 'setup', label: '⚡ Trade Setup' },
        { id: 'technicals', label: '📈 Technicals' },
        { id: 'valuation', label: '💰 Valuation' },
        { id: 'quarterly', label: '📋 Quarterly' },
        { id: 'annual', label: '📅 Annual' },
    ]

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Header Card ── */}
            <div className="trade-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                            <span className="card-ticker">{s.ticker}</span>
                            <span className="card-sector">{s.sector}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: 8 }}>{s.companyName}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                            <span style={{ fontSize: '1.9rem', fontWeight: 900, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace" }}>
                                {s.currentPrice ? fmt(s.currentPrice) : '—'}
                            </span>
                            {s.dayChangePct != null && (
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: s.dayChangePct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                    {pct(s.dayChangePct)}
                                </span>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div className="metric-box" style={{ minWidth: 110 }}><div className="metric-label">52W High</div><div className="metric-value green">{s.high52w ? fmt(s.high52w) : '—'}</div></div>
                        <div className="metric-box" style={{ minWidth: 110 }}><div className="metric-label">52W Low</div><div className="metric-value red">{s.low52w ? fmt(s.low52w) : '—'}</div></div>
                        <div className="metric-box" style={{ minWidth: 110 }}>
                            <div className="metric-label">RSI 14</div>
                            <div className="metric-value" style={{ color: s.rsi14 && s.rsi14 <= 50 ? 'var(--amber)' : 'var(--green)' }}>
                                {s.rsi14 != null ? s.rsi14.toFixed(1) : '—'}
                            </div>
                        </div>
                        <button
                            onClick={onRefresh}
                            title="Bypass cache and fetch latest data from NSE + Screener.in"
                            style={{
                                background: 'rgba(59,130,246,0.1)', color: 'var(--blue)',
                                border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px',
                                padding: '8px 14px', fontWeight: 700, fontSize: '0.78rem',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                transition: 'background 0.2s', alignSelf: 'flex-start', marginTop: 2,
                            }}
                        >
                            🔄 Force Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Tab bar ── */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {tabs.map(t => (
                    <button key={t.id} className="btn-secondary-sm"
                        style={tab === t.id ? { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' } : {}}
                        onClick={() => setTab(t.id)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── Trade Setup ── */}
            {tab === 'setup' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {s.hasSetup && s.buyZone
                        ? <>
                            <div className="card-metrics">
                                <div className="metric-box"><div className="metric-label">Buy Zone</div><div className="metric-value blue">{fmt(s.buyZone)}</div></div>
                                <div className="metric-box"><div className="metric-label">Target</div><div className="metric-value green">{s.target ? fmt(s.target) : '—'}</div></div>
                                <div className="metric-box"><div className="metric-label">Stop Loss</div><div className="metric-value red">{s.stopLoss ? fmt(s.stopLoss) : '—'}</div></div>
                            </div>
                            <div className="card-info-row">
                                <div className="info-item"><div className="info-label">Setup Type</div><div className="info-value">{s.setupType ?? '—'}</div></div>
                                <div className="info-item"><div className="info-label">Risk/Reward</div><div className="info-value">{s.riskReward ? `${s.riskReward}:1` : '—'}</div></div>
                                <div className="info-item"><div className="info-label">Confidence</div><div className={`info-value ${(s.confidenceScore ?? 0) >= 7 ? 'green' : 'amber'}`}>{s.confidenceScore ?? '—'}/10</div></div>
                                <div className="info-item"><div className="info-label">Vs Nifty</div><div className={`info-value ${s.outperformsNifty ? 'green' : 'red'}`}>{s.outperformsNifty ? '✅ Outperforms' : '❌ Underperforms'}</div></div>
                            </div>
                        </>
                        : <div className="no-setups">No active setup for <strong>{s.ticker}</strong>. Run the Scanner from Dashboard to find fresh setups.</div>
                    }
                    <div className="card-info-row">
                        <div className="info-item"><div className="info-label">Above 200 DMA</div><div className={`info-value ${s.aboveDma200 ? 'green' : 'red'}`}>{s.aboveDma200 ? '✅ Yes' : '❌ No'}</div></div>
                        <div className="info-item"><div className="info-label">Above 50 EMA</div><div className={`info-value ${s.aboveEma50 ? 'green' : 'red'}`}>{s.aboveEma50 ? '✅ Yes' : '❌ No'}</div></div>
                        <div className="info-item"><div className="info-label">% from 200 DMA</div><div className={`info-value ${(s.distFromDma200Pct ?? 0) >= 0 ? 'green' : 'red'}`}>{val(s.distFromDma200Pct, '%')}</div></div>
                        <div className="info-item"><div className="info-label">% from 50 EMA</div><div className={`info-value ${(s.distFromEma50Pct ?? 0) >= 0 ? 'green' : 'red'}`}>{val(s.distFromEma50Pct, '%')}</div></div>
                    </div>
                </div>
            )}

            {/* ── Technicals ── */}
            {tab === 'technicals' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
                    {[
                        ['RSI 14', val(s.rsi14)],
                        ['200 DMA', s.dma200 ? fmt(s.dma200) : '—'],
                        ['50 EMA', s.ema50 ? fmt(s.ema50) : '—'],
                        ['20 EMA', s.ema20 ? fmt(s.ema20) : '—'],
                        ['Avg Vol 20D', s.avgVolume20d ? s.avgVolume20d.toLocaleString() : '—'],
                        ['Volume Ratio', val(s.volumeRatio, 'x')],
                        ['1M Return', val(s.returns1m, '%')],
                        ['3M Return', val(s.returns3m, '%')],
                        ['Nifty 3M Retn', val(s.nifty3mReturn, '%')],
                        ['% > 200 DMA', val(s.distFromDma200Pct, '%')],
                        ['% > 50 EMA', val(s.distFromEma50Pct, '%')],
                        ['Outperforms', s.outperformsNifty ? '✅ Yes' : '❌ No'],
                    ].map(([label, value]) => (
                        <div key={label} className="metric-box">
                            <div className="metric-label">{label}</div>
                            <div className="metric-value" style={{ color: 'var(--text)', fontSize: '0.9rem' }}>{value}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Valuation ── */}
            {tab === 'valuation' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
                    {[
                        ['Market Cap (Cr)', s.marketCapCr ? `₹${s.marketCapCr.toLocaleString()}` : '—'],
                        ['P/E Ratio', val(s.peRatio)],
                        ['Industry P/E', val(s.industryPe)],
                        ['P/B Ratio', val(s.pbRatio)],
                        ['EPS (₹)', val(s.eps)],
                        ['Book Value', val(s.bookValue)],
                        ['Face Value', val(s.faceValue)],
                        ['Div Yield', val(s.dividendYield, '%')],
                        ['ROE', val(s.roe, '%')],
                        ['ROCE', val(s.roce, '%')],
                        ['Debt/Equity', val(s.debtToEquity)],
                        ['Current Ratio', val(s.currentRatio)],
                        ['Promoter Hold', val(s.promoterHolding, '%')],
                    ].map(([label, value]) => (
                        <div key={label} className="metric-box">
                            <div className="metric-label">{label}</div>
                            <div className="metric-value" style={{ color: 'var(--text)', fontSize: '0.88rem' }}>{value}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Quarterly ── */}
            {tab === 'quarterly' && (
                s.quarterlyResults?.length
                    ? <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                {['Period', 'Sales (Cr)', 'Profit (Cr)', 'OPM %'].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text3)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {s.quarterlyResults.map((r: any) => (
                                <tr key={r.period} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '10px 14px', color: 'var(--text2)', fontWeight: 600 }}>{r.period}</td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text)' }}>{r.salesCr?.toLocaleString()}</td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: r.profitCr >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.profitCr?.toLocaleString()}</td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text2)' }}>{r.opmPct != null ? r.opmPct.toFixed(1) + '%' : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    : <div className="no-setups">No quarterly data available for {s.ticker}.</div>
            )}

            {/* ── Annual ── */}
            {tab === 'annual' && (
                s.annualResults?.length
                    ? <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                {['Year', 'Sales (Cr)', 'Profit (Cr)', 'EPS (₹)'].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text3)', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {s.annualResults.map((r: any) => (
                                <tr key={r.year} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '10px 14px', color: 'var(--text2)', fontWeight: 600 }}>{r.year}</td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text)' }}>{r.salesCr?.toLocaleString()}</td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: r.profitCr >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.profitCr?.toLocaleString()}</td>
                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text2)' }}>{r.epsDiluted != null ? r.epsDiluted.toFixed(2) : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    : <div className="no-setups">No annual data available for {s.ticker}.</div>
            )}
        </div>
    )
}
