import { AlertTriangle, ShieldAlert } from 'lucide-react'

interface AuthDisclaimerModalProps {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    onAccept: () => void
    actionLabel?: string
}

export default function AuthDisclaimerModal({ checked, onCheckedChange, onAccept, actionLabel = 'Continue' }: AuthDisclaimerModalProps) {
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(3, 7, 18, 0.82)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 1000,
        }}>
            <div style={{
                width: '100%',
                maxWidth: 560,
                background: 'linear-gradient(180deg, rgba(20,24,36,0.98), rgba(12,14,24,0.98))',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 24,
                boxShadow: '0 30px 100px rgba(0,0,0,0.55)',
                overflow: 'hidden',
            }}>
                <div style={{
                    padding: '18px 22px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(251,191,36,0.08))',
                }}>
                    <div style={{
                        width: 42,
                        height: 42,
                        borderRadius: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(248,113,113,0.12)',
                        color: '#fca5a5',
                    }}>
                        <ShieldAlert size={20} />
                    </div>
                    <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1rem' }}>Important Risk Disclosure</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Required before continuing to StockSage AI</div>
                    </div>
                </div>

                <div style={{ padding: '22px 22px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{
                        display: 'grid',
                        gap: 10,
                        fontSize: '0.88rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.6,
                    }}>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <AlertTriangle size={16} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 2 }} />
                            <span>StockSage AI provides market research and educational signals, not personalized investment advice.</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <AlertTriangle size={16} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 2 }} />
                            <span>All trades involve risk. Past performance, AI analysis, and backtested outcomes do not guarantee future returns.</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <AlertTriangle size={16} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 2 }} />
                            <span>You should independently verify every setup and consult a SEBI-registered advisor before acting.</span>
                        </div>
                    </div>

                    <label style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        marginTop: 4,
                        padding: '14px 14px',
                        borderRadius: 16,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        cursor: 'pointer',
                    }}>
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => onCheckedChange(e.target.checked)}
                            style={{ marginTop: 3, width: 16, height: 16, accentColor: '#2563eb' }}
                        />
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            I understand StockSage AI is for research and education only, not SEBI-registered financial advice, and I accept full responsibility for my trading decisions.
                        </span>
                    </label>
                </div>

                <div style={{
                    padding: '0 22px 22px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        This acknowledgement is stored on this device.
                    </div>
                    <button
                        type="button"
                        disabled={!checked}
                        onClick={onAccept}
                        className="btn btn-primary"
                        style={{ minWidth: 170, justifyContent: 'center', opacity: checked ? 1 : 0.55 }}
                    >
                        {actionLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
