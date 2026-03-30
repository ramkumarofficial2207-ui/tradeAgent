/* ─── MarketDashboardWidget.tsx — Interactive live market overview ─── */
import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
    TrendingUp, TrendingDown, RefreshCw, Activity,
    BarChart3, Globe, Shield, ArrowUpRight, ArrowDownRight, Flame
} from 'lucide-react'

interface IndexData {
    price: number
    change: number
    high52: number
    low52: number
    pct52: number
    sparkline?: number[]
}

interface MarketPulse {
    indices: Record<string, IndexData>
    vixRisk: string
    vixLabel: { text: string; color: string; detail: string }
    isMarketOpen: boolean
    fetchedAt: string
}

const fmtNum = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%'

function IndexCard({ label, price, change, icon, active, onClick }: {
    label: string; price: number; change: number; icon: React.ReactNode; active?: boolean; onClick?: () => void
}) {
    const up = change >= 0
    return (
        <button onClick={onClick} style={{
            padding: '8px 12px', borderRadius: 12, textAlign: 'left', width: '100%',
            background: active ? `rgba(${up ? '16,185,129' : '239,68,68'}, 0.08)` : `rgba(${up ? '16,185,129' : '239,68,68'}, 0.03)`,
            border: active ? `1.5px solid rgba(${up ? '16,185,129' : '239,68,68'}, 0.25)` : `1px solid rgba(${up ? '16,185,129' : '239,68,68'}, 0.08)`,
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'all 0.2s', cursor: 'pointer',
            transform: active ? 'scale(1.02)' : 'none',
            boxShadow: active ? `0 4px 12px rgba(${up ? '16,185,129' : '239,68,68'}, 0.1)` : 'none',
        }}>
            <div style={{ color: up ? '#34d399' : '#f87171', display: 'flex', opacity: 0.7, flexShrink: 0 }}>{icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {price > 0 ? fmtNum(price) : '—'}
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                {up ? <ArrowUpRight size={10} style={{ color: '#34d399' }} /> : <ArrowDownRight size={10} style={{ color: '#f87171' }} />}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 700, color: up ? '#34d399' : '#f87171' }}>{fmtPct(change)}</span>
            </div>
        </button>
    )
}

function SparklineChart({ data, up }: { data: number[] | undefined, up: boolean }) {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    // Map to SVG coordinates (100x40 viewport for slightly more vertical space)
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 35 - ((d - min) / range) * 30; // padded Y inside 40px height
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const color = up ? '#34d399' : '#f87171';
    const pathData = `M ${points.join(' L ')}`;
    const fillData = `${pathData} L 100,40 L 0,40 Z`;
    const lastY = 35 - ((data[data.length - 1] - min) / range) * 30;
    const monthChange = ((data[data.length - 1] - data[0]) / data[0]) * 100;

    return (
        <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, padding: '0 4px' }}>
                <span style={{ fontSize: '0.48rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>30-Day Trend</span>
                <span style={{ fontSize: '0.48rem', fontFamily: 'var(--font-mono)', color: color, fontWeight: 700 }}>
                    {monthChange >= 0 ? '+' : ''}{monthChange.toFixed(1)}% MTD
                </span>
            </div>

            <div style={{ height: 45, width: '100%', marginBottom: -4, cursor: 'crosshair' }} title={`30-day High: ${max.toLocaleString('en-IN')}\n30-day Low: ${min.toLocaleString('en-IN')}`}>
                <svg viewBox="0 0 100 40" style={{ width: '100%', height: '100%', overflow: 'visible' }} preserveAspectRatio="none">
                    <defs>
                        <linearGradient id={`grad-${up}`} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id={`lineGrad-${up}`} x1="0" x2="1" y1="0" y2="0">
                            <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                            <stop offset="100%" stopColor={color} stopOpacity={1} />
                        </linearGradient>
                    </defs>

                    {/* Subtle Min/Max dashed guide lines */}
                    <line x1="0" y1="5" x2="100" y2="5" stroke={color} strokeWidth="0.2" strokeDasharray="1,1.5" opacity="0.3" />
                    <line x1="0" y1="35" x2="100" y2="35" stroke={color} strokeWidth="0.2" strokeDasharray="1,1.5" opacity="0.3" />

                    <path d={fillData} fill={`url(#grad-${up})`} />
                    <path d={pathData} fill="none" stroke={`url(#lineGrad-${up})`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="100" cy={lastY} r="2.2" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
                </svg>
            </div>
        </div>
    )
}

interface SectorData { n: string; v: number }

export default function MarketDashboardWidget({ sectors, sectorTime }: { sectors: SectorData[]; sectorTime: string | null }) {
    const [pulse, setPulse] = useState<MarketPulse | null>(null)
    const [refreshing, setRefreshing] = useState(false)
    const [selectedIdx, setSelectedIdx] = useState(0)

    const fetchData = useCallback(async () => {
        setRefreshing(true)
        try {
            const res = await axios.get('/api/market-pulse')
            if (res.data.success) setPulse(res.data.data)
        } catch { /* ignore */ }
        finally { setRefreshing(false) }
    }, [])

    useEffect(() => {
        fetchData()
        const timer = window.setInterval(fetchData, 5 * 60 * 1000)
        return () => window.clearInterval(timer)
    }, [fetchData])

    const vLvl = pulse?.indices?.vix?.price ?? 0
    const vChg = pulse?.indices?.vix?.change ?? 0
    const vixColor = vLvl === 0 ? '#6b7280' : vLvl < 16 ? '#34d399' : vLvl < 20 ? '#fbbf24' : '#f87171'
    const vixLabel = !pulse ? 'Loading...' : (pulse.vixLabel?.text || 'Risk Stable')

    // All indices
    const indices = [
        { key: 'nifty', label: 'Nifty 50', icon: <BarChart3 size={14} /> },
        { key: 'banknifty', label: 'Bank Nifty', icon: <Activity size={14} /> },
        { key: 'sensex', label: 'Sensex', icon: <TrendingUp size={14} /> },
        { key: 'midcap', label: 'Midcap 150', icon: <BarChart3 size={14} /> },
        { key: 'gold', label: 'Gold', icon: <TrendingUp size={14} /> },
        { key: 'silver', label: 'Silver', icon: <TrendingUp size={14} /> },
    ].map(idx => ({
        ...idx,
        price: pulse?.indices?.[idx.key]?.price ?? 0,
        change: pulse?.indices?.[idx.key]?.change ?? 0,
        high52: pulse?.indices?.[idx.key]?.high52 ?? 0,
        low52: pulse?.indices?.[idx.key]?.low52 ?? 0,
        pct52: pulse?.indices?.[idx.key]?.pct52 ?? 50,
        sparkline: pulse?.indices?.[idx.key]?.sparkline ?? [],
    }))

    const selected = indices[selectedIdx]

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* ── Market Overview Card ─── */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,0.03), rgba(139,92,246,0.02))',
                border: '1px solid var(--border-md)', borderRadius: 16, padding: '14px 16px',
                position: 'relative', overflow: 'hidden',
            }}>
                {/* Ambient */}
                <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.06), transparent 70%)', pointerEvents: 'none' }} />

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Globe size={13} style={{ color: 'var(--blue)' }} />
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.82rem', fontWeight: 800 }}>Market Overview</span>
                        {pulse?.isMarketOpen && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399', animation: 'pulse 2s ease-in-out infinite' }} />}
                    </div>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>
                            {pulse?.fetchedAt ? new Date(pulse.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                        <button onClick={fetchData} disabled={refreshing}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                            <RefreshCw size={10} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                        </button>
                    </div>
                </div>

                {/* Index cards — all visible, clickable */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                    {indices.map((idx, i) => {
                        const { key, ...rest } = idx
                        return <IndexCard key={key} {...rest} active={selectedIdx === i} onClick={() => setSelectedIdx(i)} />
                    })}
                </div>

                {/* Detail panel for selected index */}
                {pulse && selected.high52 > 0 && (
                    <div style={{ padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 8, animation: 'fadeUp 0.3s ease' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.52rem', color: 'var(--text-muted)', fontWeight: 600 }}>52W Range</span>
                            <span style={{ fontSize: '0.48rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                                {fmtNum(selected.low52)} — {fmtNum(selected.high52)}
                            </span>
                        </div>
                        <div style={{ position: 'relative', height: 5, background: 'linear-gradient(90deg, rgba(239,68,68,0.15), rgba(245,158,11,0.15), rgba(16,185,129,0.15))', borderRadius: 99 }}>
                            <div style={{
                                position: 'absolute', top: -2, left: `${Math.min(95, Math.max(5, selected.pct52))}%`,
                                width: 9, height: 9, borderRadius: '50%',
                                background: selected.pct52 > 70 ? '#34d399' : selected.pct52 > 30 ? '#fbbf24' : '#f87171',
                                border: '2px solid var(--bg-card)',
                                boxShadow: `0 0 6px ${selected.pct52 > 70 ? '#34d399' : selected.pct52 > 30 ? '#fbbf24' : '#f87171'}50`,
                                transform: 'translateX(-50%)', transition: 'left 0.8s ease',
                            }} />
                        </div>
                        <div style={{ textAlign: 'center', marginTop: 3 }}>
                            <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: selected.pct52 > 70 ? '#34d399' : selected.pct52 > 30 ? '#fbbf24' : '#f87171' }}>
                                {selected.pct52.toFixed(1)}% of range
                            </span>
                        </div>

                        {/* 30-day Trend Sparkline overlaying the bottom half of detail panel */}
                        <SparklineChart data={selected.sparkline} up={selected.change >= 0} />
                    </div>
                )}

                {/* VIX compact */}
                <div style={{ display: 'flex', gap: 8, padding: '8px 10px', background: `${vixColor}08`, borderRadius: 10, border: `1px solid ${vixColor}15` }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            <Shield size={10} style={{ color: vixColor }} />
                            <span style={{ fontSize: '0.52rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>India VIX</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 900, color: vixColor }}>{vLvl.toFixed(2)}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, color: vChg <= 0 ? '#34d399' : '#f87171' }}>
                                {fmtPct(vChg)}
                            </span>
                        </div>
                        <span style={{ fontSize: '0.5rem', fontWeight: 700, color: vixColor, display: 'block' }}>{vixLabel}</span>
                    </div>
                </div>
            </div>

            {/* ── Sector Pulse ─── */}
            {sectors.length > 0 && (
                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 16, padding: '12px 14px',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: '0.56rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Flame size={10} style={{ color: '#f59e0b' }} />
                            Sector Pulse
                        </div>
                        <div style={{ fontSize: '0.46rem', color: 'var(--text-muted)' }}>
                            {sectorTime ? `Live · ${new Date(sectorTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : '...'}
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                        {sectors.map((s, i) => {
                            const intensity = Math.min(1, Math.abs(s.v) / 3)
                            const baseColor = s.v > 0 ? '16,185,129' : s.v < 0 ? '239,68,68' : '107,114,128'
                            return (
                                <div key={s.n} style={{
                                    padding: '5px 6px', borderRadius: 7, textAlign: 'center',
                                    background: `rgba(${baseColor}, ${0.04 + intensity * 0.1})`,
                                    border: `1px solid rgba(${baseColor}, ${0.08 + intensity * 0.15})`,
                                    transition: 'all 0.3s',
                                }}>
                                    <div style={{ fontSize: '0.54rem', fontWeight: 800, color: s.v > 0 ? '#34d399' : s.v < 0 ? '#f87171' : 'var(--text-secondary)', marginBottom: 1 }}>{s.n}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', fontWeight: 700, color: s.v > 0 ? '#34d399' : s.v < 0 ? '#f87171' : 'var(--text-muted)' }}>
                                        {s.v > 0 ? '+' : ''}{s.v.toFixed(2)}%
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
