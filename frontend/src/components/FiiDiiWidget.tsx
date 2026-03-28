import { useEffect, useState } from 'react'
import axios from 'axios'
import { Building2, RefreshCw } from 'lucide-react'
import { useViewport } from '../lib/useViewport'

interface InstitutionalFlowDay {
    tradingDate: string
    fiiBuy: number
    fiiSell: number
    fiiNet: number
    diiBuy: number
    diiSell: number
    diiNet: number
    totalNet: number
    marketBias: 'RISK_ON' | 'RISK_OFF' | 'MIXED'
}

interface InstitutionalFlowSummary {
    status: 'live' | 'database' | 'unavailable'
    source: string
    fetchedAt: string | null
    lastTradingDate: string | null
    isStale: boolean
    note: string | null
    latest: InstitutionalFlowDay | null
    series: InstitutionalFlowDay[]
    totals: {
        fiiNet1dCr: number
        diiNet1dCr: number
        totalNet1dCr: number
        totalNet5dCr: number
        totalNet20dCr: number
    }
    trend: {
        bias: 'RISK_ON' | 'RISK_OFF' | 'MIXED'
        score: number
        detail: string
    }
}

function formatCr(value: number) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(0)} Cr`
}

function toneForBias(bias: 'RISK_ON' | 'RISK_OFF' | 'MIXED') {
    if (bias === 'RISK_ON') return { color: '#34d399', bg: 'rgba(16,185,129,0.12)', label: 'Risk-On' }
    if (bias === 'RISK_OFF') return { color: '#f87171', bg: 'rgba(239,68,68,0.12)', label: 'Risk-Off' }
    return { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', label: 'Mixed' }
}

function FlowBar({ value, maxAbs, color }: { value: number; maxAbs: number; color: string }) {
    const pct = maxAbs > 0 ? Math.min(100, Math.abs(value) / maxAbs * 100) : 0
    const isPositive = value >= 0
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: isPositive ? color : '#f87171',
                    borderRadius: 999,
                    marginLeft: isPositive ? 0 : 'auto',
                }} />
            </div>
            <span style={{
                width: 56,
                flexShrink: 0,
                textAlign: 'right',
                fontSize: '0.62rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: isPositive ? color : '#f87171',
            }}>
                {formatCr(value)}
            </span>
        </div>
    )
}

export default function FiiDiiWidget() {
    const { isPhone } = useViewport()
    const [summary, setSummary] = useState<InstitutionalFlowSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    async function load(force = false) {
        const setter = force ? setRefreshing : setLoading
        setter(true)
        try {
            const { data: res } = await axios.get(`/api/fii-dii${force ? '?refresh=true' : ''}`)
            if (res.success) setSummary(res.data)
        } catch {
            setSummary(null)
        } finally {
            setter(false)
        }
    }

    useEffect(() => {
        load().catch(() => undefined)
    }, [])

    if (loading) {
        return (
            <div className="card" style={{ padding: '14px 12px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Loading institutional flow...</div>
            </div>
        )
    }

    if (!summary || !summary.series.length || !summary.latest) return null

    const accent = toneForBias(summary.trend.bias)
    const maxAbs = Math.max(...summary.series.map(day => Math.max(Math.abs(day.fiiNet), Math.abs(day.diiNet), Math.abs(day.totalNet))), 1)

    return (
        <div className="card" style={{ padding: isPhone ? '14px 12px' : '16px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 10,
                        display: 'grid',
                        placeItems: 'center',
                        background: accent.bg,
                        border: `1px solid ${accent.color}33`,
                    }}>
                        <Building2 size={14} style={{ color: accent.color }} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            FII / DII Flow
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {summary.lastTradingDate ? `Last trading day ${new Date(summary.lastTradingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : 'Institutional cash market activity'}
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => load(true)}
                    disabled={refreshing}
                    style={{ padding: '6px 8px', gap: 6, fontSize: '0.68rem', flexShrink: 0 }}
                >
                    <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : undefined }} />
                    {refreshing ? 'Syncing' : 'Refresh'}
                </button>
            </div>

            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                marginBottom: 12,
                background: accent.bg,
                border: `1px solid ${accent.color}26`,
                flexWrap: 'wrap',
            }}>
                <div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Institutional Bias
                    </div>
                    <div style={{ marginTop: 3, fontSize: '0.9rem', fontWeight: 900, color: accent.color }}>
                        {accent.label}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)' }}>1D Net</div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: summary.totals.totalNet1dCr >= 0 ? '#34d399' : '#f87171' }}>
                            {formatCr(summary.totals.totalNet1dCr)}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)' }}>5D Net</div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: summary.totals.totalNet5dCr >= 0 ? '#34d399' : '#f87171' }}>
                            {formatCr(summary.totals.totalNet5dCr)}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)' }}>20D Net</div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: summary.totals.totalNet20dCr >= 0 ? '#34d399' : '#f87171' }}>
                            {formatCr(summary.totals.totalNet20dCr)}
                        </div>
                    </div>
                </div>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: isPhone ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                gap: 8,
                marginBottom: 12,
            }}>
                {[
                    { label: 'FII Net', value: summary.totals.fiiNet1dCr, color: '#60a5fa' },
                    { label: 'DII Net', value: summary.totals.diiNet1dCr, color: '#a78bfa' },
                    { label: 'Combined', value: summary.totals.totalNet1dCr, color: summary.totals.totalNet1dCr >= 0 ? '#34d399' : '#f87171' },
                ].map(item => (
                    <div key={item.label} style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '10px 11px',
                    }}>
                        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: item.value >= 0 ? item.color : '#f87171' }}>
                            {formatCr(item.value)}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {summary.series.slice(0, 5).map(day => (
                    <div key={day.tradingDate} style={{
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        padding: '8px 10px',
                        background: 'rgba(255,255,255,0.02)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <div style={{ fontSize: '0.64rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                                {new Date(day.tradingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: isPhone ? undefined : 'numeric' })}
                            </div>
                            <div style={{
                                fontSize: '0.56rem',
                                color: toneForBias(day.marketBias).color,
                                background: toneForBias(day.marketBias).bg,
                                border: `1px solid ${toneForBias(day.marketBias).color}26`,
                                padding: '3px 7px',
                                borderRadius: 999,
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}>
                                {toneForBias(day.marketBias).label}
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 26, flexShrink: 0, fontSize: '0.56rem', color: '#60a5fa', fontWeight: 800 }}>FII</span>
                                <FlowBar value={day.fiiNet} maxAbs={maxAbs} color="#60a5fa" />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 26, flexShrink: 0, fontSize: '0.56rem', color: '#a78bfa', fontWeight: 800 }}>DII</span>
                                <FlowBar value={day.diiNet} maxAbs={maxAbs} color="#a78bfa" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {summary.trend.detail}
            </div>
            {(summary.note || summary.isStale || summary.fetchedAt) && (
                <div style={{ marginTop: 8, fontSize: '0.56rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    {summary.note ? `${summary.note} ` : ''}
                    {summary.isStale ? 'Snapshot may be stale. ' : ''}
                    {summary.fetchedAt ? `Updated ${new Date(summary.fetchedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.` : ''}
                </div>
            )}
        </div>
    )
}
