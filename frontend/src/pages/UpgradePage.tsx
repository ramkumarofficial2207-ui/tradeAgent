import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { BadgeIndianRupee, CheckCircle2, Clock3, ShieldCheck, Zap } from 'lucide-react'
import { useViewport } from '../lib/useViewport'

type SubscriptionState = 'TRIAL' | 'ACTIVE' | 'FREE' | 'EXPIRED' | 'UNKNOWN'

interface SubscriptionData {
    subscriptionStatus?: SubscriptionState
    subscriptionExpiry?: string | null
}

function statusLabel(status: SubscriptionState): string {
    switch (status) {
        case 'ACTIVE': return 'Active Plan'
        case 'TRIAL': return 'Free Trial'
        case 'EXPIRED': return 'Expired Plan'
        case 'FREE': return 'Free Account'
        default: return 'Unknown'
    }
}

export default function UpgradePage() {
    const navigate = useNavigate()
    const [details, setDetails] = useState<SubscriptionData | null>(null)
    const [loading, setLoading] = useState(true)
    const { isMobile } = useViewport()

    useEffect(() => {
        axios.get('/api/user/preferences')
            .then(({ data }) => {
                if (data.success) setDetails(data.data)
            })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [])

    const status = details?.subscriptionStatus || 'UNKNOWN'
    const expiry = details?.subscriptionExpiry ? new Date(details.subscriptionExpiry) : null
    const trialDaysLeft = expiry ? Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86400000)) : null

    return (
        <div style={{ maxWidth: 920, margin: '0 auto', padding: isMobile ? '18px 12px 28px' : '32px 24px 56px' }}>
            <div style={{
                borderRadius: 28,
                overflow: 'hidden',
                border: '1px solid rgba(37,99,235,0.18)',
                background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(124,58,237,0.08) 55%, rgba(15,23,42,0.95))',
                boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
            }}>
                <div style={{ padding: isMobile ? '22px 16px 18px' : '32px 28px 24px', display: 'grid', gap: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                <Zap size={13} />
                                Premium Access
                            </div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? '1.55rem' : '2rem', fontWeight: 900, margin: '16px 0 6px' }}>StockSage AI Pro</h1>
                            <p style={{ color: 'var(--text-secondary)', maxWidth: 620, lineHeight: 1.6 }}>
                                Premium access unlocks the full scanner, AI chat research, portfolio workflow, and live signal distribution pipeline.
                            </p>
                        </div>

                        <div style={{
                            minWidth: isMobile ? '100%' : 240,
                            padding: 18,
                            borderRadius: 20,
                            background: 'rgba(4, 10, 24, 0.58)',
                            border: '1px solid rgba(255,255,255,0.08)',
                        }}>
                            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 6 }}>Current Access</div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800 }}>{loading ? 'Loading...' : statusLabel(status)}</div>
                            {expiry && (
                                <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    Valid until {expiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </div>
                            )}
                            {status === 'TRIAL' && trialDaysLeft !== null && (
                                <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700 }}>
                                    {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                        {[
                            'Unlimited premium scanner runs during your active plan',
                            'AI research chat with subscription gating already enforced server-side',
                            'Portfolio journaling and watchlist workflow in one dashboard',
                            'WhatsApp and email notification preferences for signal delivery',
                        ].map(item => (
                            <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <CheckCircle2 size={16} style={{ color: '#34d399', marginTop: 2, flexShrink: 0 }} />
                                <span style={{ fontSize: '0.84rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>{item}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.3fr) minmax(280px, 0.9fr)', gap: 18, marginTop: 22 }}>
                <div className="card" style={{ padding: '24px 22px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <BadgeIndianRupee size={18} style={{ color: '#60a5fa' }} />
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800 }}>₹2999 / month</h2>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.6, marginBottom: 16 }}>
                        This plan is built around actionable market workflow: scan, research, watchlist, alerts, and portfolio review in one place.
                    </p>
                    <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                        {[
                            'Regime-aware swing scanner',
                            'AI research chat with multi-model fallback',
                            'Portfolio and watchlist access',
                            'Signal alert preferences and notification routing',
                        ].map(item => (
                            <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                                <ShieldCheck size={15} style={{ color: '#a78bfa', flexShrink: 0 }} />
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => navigate('/profile')} className="btn btn-primary" style={{ gap: 8 }}>
                        <Clock3 size={14} />
                        Manage Preferences
                    </button>
                </div>

                <div className="card" style={{ padding: '24px 22px' }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 800, marginBottom: 10 }}>Activation</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.6, marginBottom: 12 }}>
                        Subscription access is already enforced in the backend. If your trial has expired, activate or renew your plan from the admin activation flow before continuing premium usage.
                    </p>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        Current implementation is entitlement-ready and plan-aware. Payment automation can be layered on top without changing the existing access rules.
                    </div>
                </div>
            </div>
        </div>
    )
}
