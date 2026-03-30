import { useEffect, useState } from 'react'
import axios from 'axios'
import { Shield, TrendingUp, TrendingDown, Activity, AlertTriangle } from 'lucide-react'
import { useViewport } from '../lib/useViewport'

interface Bucket {
    bucket: string
    samples: number
    resolved: number
    winRate: number
    expectancy: number
    avgWin: number
    avgLoss: number
}

interface EdgeDashboardData {
    updatedAt: string | null
    totals: {
        tracked: number
        resolved: number
        won: number
        lost: number
        inProgress: number
        expectancy: number
        avgWin: number
        avgLoss: number
        winRate: number
        profitFactor: number
        maxDrawdown: number
        falseAlertRate: number
    }
    strongestBuckets: Bucket[]
    weakestBuckets: Bucket[]
    familyBuckets: Bucket[]
    categoryBuckets: Bucket[]
    sectorBuckets: Bucket[]
    regimeBuckets: Bucket[]
    alignmentBuckets: Bucket[]
    confidenceBuckets: Bucket[]
    confluenceBuckets: Bucket[]
    dayOfWeekBuckets: Bucket[]
    recentSignals: any[]
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 900, color, marginTop: 4 }}>{value}</div>
        </div>
    )
}

function BucketList({ title, items, tone }: { title: string; items: Bucket[]; tone: 'good' | 'bad' | 'neutral' }) {
    const color = tone === 'good' ? '#34d399' : tone === 'bad' ? '#f87171' : '#93c5fd'
    return (
        <div className="card" style={{ padding: '18px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 900, marginBottom: 12 }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.length === 0 && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>No bucket data yet.</div>}
                {items.map(item => (
                    <div key={item.bucket} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>{item.bucket}</div>
                            <span className={`badge ${tone === 'bad' ? 'badge-avoid' : tone === 'good' ? 'badge-buy' : 'badge-neutral'}`} style={{ fontSize: '0.56rem' }}>
                                {item.expectancy.toFixed(2)}%
                            </span>
                        </div>
                        <div style={{ marginTop: 4, fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                            {item.samples} samples · {item.resolved} resolved · WR {item.winRate}% · Avg win {item.avgWin}% · Avg loss {item.avgLoss}%
                        </div>
                        <div style={{ marginTop: 6, height: 4, borderRadius: 99, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, Math.max(0, item.winRate))}%`, height: '100%', background: color }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default function FounderEdgePage() {
    const [data, setData] = useState<EdgeDashboardData | null>(null)
    const [loading, setLoading] = useState(true)
    const { isMobile } = useViewport()

    useEffect(() => {
        axios.get('/api/founder/edge-dashboard').then(({ data }) => {
            if (data.success) setData(data.data)
        }).finally(() => setLoading(false))
    }, [])

    return (
        <div style={{ padding: isMobile ? '16px 12px 28px' : '24px 22px 36px', maxWidth: 1280, margin: '0 auto' }}>
            <div style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Shield size={22} style={{ color: '#93c5fd' }} /> Founder Edge Lab
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Expectancy, drawdown, false-alert rate, and bucket analytics for tuning the trading engine.
                </div>
            </div>

            {loading ? (
                <div style={{ color: 'var(--text-muted)', padding: '40px 0' }}>Loading edge dashboard...</div>
            ) : !data ? (
                <div className="card" style={{ padding: '24px', color: 'var(--text-muted)' }}>No edge dashboard data available yet.</div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                        <Stat label="Tracked" value={String(data.totals.tracked)} color="#93c5fd" />
                        <Stat label="Win Rate" value={`${data.totals.winRate}%`} color="#34d399" />
                        <Stat label="Expectancy" value={`${data.totals.expectancy}%`} color={data.totals.expectancy >= 0 ? '#34d399' : '#f87171'} />
                        <Stat label="Profit Factor" value={data.totals.profitFactor.toFixed(2)} color="#a78bfa" />
                        <Stat label="Max Drawdown" value={`${data.totals.maxDrawdown}%`} color="#f87171" />
                        <Stat label="False Alerts" value={`${data.totals.falseAlertRate}%`} color="#fbbf24" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <BucketList title="Strongest Setup Buckets" items={data.strongestBuckets} tone="good" />
                        <BucketList title="Weakest Setup Buckets" items={data.weakestBuckets} tone="bad" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <BucketList title="Setup Family Performance" items={data.familyBuckets} tone="neutral" />
                        <BucketList title="Horizon Category Performance" items={data.categoryBuckets} tone="neutral" />
                        <BucketList title="Confluence Band Performance" items={data.confluenceBuckets} tone="neutral" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <BucketList title="Sector Performance" items={data.sectorBuckets} tone="neutral" />
                        <BucketList title="Regime Performance" items={data.regimeBuckets} tone="neutral" />
                        <BucketList title="News Alignment Performance" items={data.alignmentBuckets} tone="neutral" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 18 }}>
                        <BucketList title="Confidence Band Performance" items={data.confidenceBuckets} tone="neutral" />
                        <BucketList title="Day Of Week Performance" items={data.dayOfWeekBuckets} tone="neutral" />
                    </div>

                    <div className="card" style={{ padding: '18px' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 900, marginBottom: 12 }}>Recent Signals</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                            {data.recentSignals.map((signal, index) => (
                                <div key={`${signal.historicalSetupId}-${index}`} style={{ padding: '12px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <div>
                                            <div style={{ fontWeight: 800 }}>{signal.ticker}</div>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{signal.setupType} · {signal.regime}</div>
                                        </div>
                                        <span className={`badge ${signal.status === 'WON' ? 'badge-buy' : signal.status === 'LOST' ? 'badge-avoid' : 'badge-watch'}`} style={{ fontSize: '0.56rem' }}>
                                            {signal.status}
                                        </span>
                                    </div>
                                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        <span className="badge badge-neutral" style={{ fontSize: '0.54rem' }}>Edge {signal.edgeScore}</span>
                                        <span className="badge badge-neutral" style={{ fontSize: '0.54rem' }}>{signal.setupFamily}</span>
                                        <span className="badge badge-neutral" style={{ fontSize: '0.54rem' }}>Confluence {signal.confluenceScore}</span>
                                        <span className="badge badge-neutral" style={{ fontSize: '0.54rem' }}>{signal.newsAlignment}</span>
                                        <span className="badge badge-neutral" style={{ fontSize: '0.54rem' }}>{signal.confirmationStatus}</span>
                                    </div>
                                    <div style={{ marginTop: 8, fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                        Result {signal.resultPct == null ? 'pending' : `${signal.resultPct > 0 ? '+' : ''}${signal.resultPct}%`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
