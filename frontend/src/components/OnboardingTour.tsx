// OnboardingTour.tsx — First-time user walkthrough (shown once)
import { useState, useEffect } from 'react'
import { X, Zap, Target, Bookmark, Briefcase, ChevronRight } from 'lucide-react'

const STEPS = [
    {
        icon: Zap,
        color: '#22d3ee',
        title: 'Run the AI Scanner',
        desc: 'Click "Run Scanner" on the Dashboard to scan 1000+ NSE stocks in real-time. The AI applies 10+ filters and returns only the highest-probability setups.',
    },
    {
        icon: Target,
        color: '#34d399',
        title: 'Read Your Signal Cards',
        desc: 'Each card shows a BUY/WATCH signal with Entry Zone, Target, Stop Loss, Risk:Reward, and an AI-generated "Devil\'s Advocate" bear case. Only trade when conviction is high.',
    },
    {
        icon: Bookmark,
        color: '#a78bfa',
        title: 'Save to Watchlist',
        desc: 'Bookmark setups you are monitoring. Your watchlist syncs to the cloud across all devices. You\'ll get WhatsApp alerts when saved stocks hit their trigger zones.',
    },
    {
        icon: Briefcase,
        color: '#fbbf24',
        title: 'Track with Portfolio',
        desc: 'Once you enter a trade, log it in Portfolio. The system tracks real P&L, R-multiples, win rate, and builds your personal equity curve — your true edge score.',
    },
]

export default function OnboardingTour() {
    const [visible, setVisible] = useState(false)
    const [step, setStep] = useState(0)

    useEffect(() => {
        const done = localStorage.getItem('onboarding_done')
        if (!done) setTimeout(() => setVisible(true), 1200)
    }, [])

    function finish() {
        localStorage.setItem('onboarding_done', '1')
        setVisible(false)
    }

    if (!visible) return null

    const current = STEPS[step]
    const Icon = current.icon
    const isLast = step === STEPS.length - 1

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
            animation: 'fadeIn 0.3s ease',
        }}>
            <div style={{
                background: 'var(--bg-card)', borderRadius: 20,
                border: '1px solid var(--border-md)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
                width: '100%', maxWidth: 420, padding: '32px 28px',
                position: 'relative', animation: 'slideUp 0.3s ease',
            }}>
                {/* Close */}
                <button onClick={finish} style={{
                    position: 'absolute', top: 16, right: 16,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', display: 'flex',
                }}>
                    <X size={18} />
                </button>

                {/* Step indicator */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
                    {STEPS.map((_, i) => (
                        <div key={i} style={{
                            height: 3, flex: 1, borderRadius: 99,
                            background: i <= step ? current.color : 'var(--bg-elevated)',
                            transition: 'background 0.3s',
                        }} />
                    ))}
                </div>

                {/* Icon */}
                <div style={{
                    width: 56, height: 56, borderRadius: 14, marginBottom: 20,
                    background: `${current.color}15`,
                    border: `1px solid ${current.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={26} color={current.color} />
                </div>

                {/* Content */}
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 900, marginBottom: 12 }}>
                    {current.title}
                </div>
                <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 28 }}>
                    {current.desc}
                </p>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button onClick={finish} style={{
                        background: 'none', border: 'none', color: 'var(--text-muted)',
                        fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600,
                    }}>
                        Skip tour
                    </button>
                    <button
                        onClick={() => isLast ? finish() : setStep(s => s + 1)}
                        className="btn btn-primary"
                        style={{ padding: '9px 20px', fontSize: '0.85rem', gap: 6 }}
                    >
                        {isLast ? '🚀 Let\'s Trade!' : <><ChevronRight size={14} /> Next</>}
                    </button>
                </div>
            </div>
        </div>
    )
}
