// FiiDiiWidget.tsx — FII vs DII institutional flow widget
import { useEffect, useState } from 'react'
import axios from 'axios'
import { Building2 } from 'lucide-react'

interface FiiDiiDay {
    date: string
    fiiNet: number
    diiNet: number
}

function FlowBar({ value, maxAbs }: { value: number; maxAbs: number }) {
    const pct = maxAbs > 0 ? Math.abs(value) / maxAbs * 100 : 0
    const isPositive = value >= 0
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
            <div style={{ flex: 1, height: 5, background: 'var(--bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
                {isPositive ? (
                    <div style={{ height: '100%', width: `${pct}%`, background: '#34d399', borderRadius: 99 }} />
                ) : (
                    <div style={{ height: '100%', width: `${pct}%`, background: '#f87171', borderRadius: 99, marginLeft: 'auto' }} />
                )}
            </div>
            <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, width: 52, textAlign: 'right', flexShrink: 0,
                color: isPositive ? '#34d399' : '#f87171',
            }}>
                {isPositive ? '+' : ''}{(value / 100).toFixed(0)}Cr
            </span>
        </div>
    )
}

export default function FiiDiiWidget() {
    const [data, setData] = useState<FiiDiiDay[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        axios.get('/api/fii-dii').then(({ data: res }) => {
            if (res.success) setData(res.data || [])
        }).catch(() => {}).finally(() => setLoading(false))
    }, [])

    if (loading || !data.length) return null

    const maxAbs = Math.max(...data.map(d => Math.max(Math.abs(d.fiiNet || 0), Math.abs(d.diiNet || 0))), 1)
    const latest = data[0]

    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Building2 size={12} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        FII / DII Flow
                    </span>
                </div>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Last 5 days</span>
            </div>

            {/* Today summary */}
            {latest && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    {[
                        { label: 'FII Net', value: latest.fiiNet },
                        { label: 'DII Net', value: latest.diiNet },
                    ].map(item => (
                        <div key={item.label} style={{
                            flex: 1, background: 'var(--bg-elevated)', borderRadius: 8, padding: '6px 8px',
                            border: `1px solid ${(item.value || 0) >= 0 ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)'}`,
                        }}>
                            <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)', marginBottom: 2 }}>{item.label} (Today)</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.78rem', color: (item.value || 0) >= 0 ? '#34d399' : '#f87171' }}>
                                {(item.value || 0) >= 0 ? '+' : ''}{((item.value || 0) / 100).toFixed(0)} Cr
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 5-day bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.slice(0, 5).map((day, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.56rem', color: 'var(--text-muted)', width: 36, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                            {new Date(day.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </span>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: '0.52rem', color: '#60a5fa', width: 20, flexShrink: 0 }}>FII</span>
                                <FlowBar value={day.fiiNet || 0} maxAbs={maxAbs} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: '0.52rem', color: '#a78bfa', width: 20, flexShrink: 0 }}>DII</span>
                                <FlowBar value={day.diiNet || 0} maxAbs={maxAbs} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
