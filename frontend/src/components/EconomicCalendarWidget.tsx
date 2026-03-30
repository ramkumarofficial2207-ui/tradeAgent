// EconomicCalendarWidget.tsx — Upcoming NSE/RBI events
import { useEffect, useState } from 'react'
import axios from 'axios'
import { Calendar, AlertTriangle, TrendingUp, DollarSign, Building2 } from 'lucide-react'

interface CalEvent {
    date: string
    label: string
    type: 'FNO' | 'RBI' | 'EARNINGS' | 'BUDGET'
    importance: 'HIGH' | 'CRITICAL'
}

const TYPE_CONFIG = {
    FNO:     { icon: TrendingUp, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', label: 'F&O' },
    RBI:     { icon: Building2,  color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  label: 'RBI' },
    EARNINGS:{ icon: DollarSign, color: '#34d399', bg: 'rgba(52,211,153,0.1)',  label: 'EPS' },
    BUDGET:  { icon: AlertTriangle,color:'#f87171',bg: 'rgba(239,68,68,0.1)',   label: 'GOV' },
}

function daysUntil(dateStr: string): number {
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

export default function EconomicCalendarWidget() {
    const [events, setEvents] = useState<CalEvent[]>([])

    useEffect(() => {
        const load = () => axios.get('/api/economic-calendar').then(({ data }) => {
            if (data.success) setEvents(data.data)
        }).catch(() => {})

        load()
        const timer = window.setInterval(load, 30 * 60 * 1000)
        return () => window.clearInterval(timer)
    }, [])

    if (!events.length) return null

    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Economic Calendar
                </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {events.slice(0, 5).map((evt, i) => {
                    const cfg = TYPE_CONFIG[evt.type] || TYPE_CONFIG.FNO
                    const Icon = cfg.icon
                    const days = daysUntil(evt.date)
                    const daysLabel = days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `${days}d`
                    const isCritical = evt.importance === 'CRITICAL'
                    return (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: 'var(--bg-elevated)', borderRadius: 8,
                            padding: '6px 10px',
                            border: `1px solid ${isCritical ? cfg.color + '33' : 'transparent'}`,
                        }}>
                            <div style={{
                                width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                                background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Icon size={11} color={cfg.color} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {evt.label}
                                </div>
                                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                    {new Date(evt.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                </div>
                            </div>
                            <span style={{
                                fontSize: '0.58rem', fontWeight: 800,
                                color: days <= 3 ? '#f87171' : days <= 7 ? '#fbbf24' : cfg.color,
                                background: days <= 3 ? 'rgba(239,68,68,0.1)' : days <= 7 ? 'rgba(251,191,36,0.1)' : cfg.bg,
                                padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                            }}>
                                {daysLabel}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
