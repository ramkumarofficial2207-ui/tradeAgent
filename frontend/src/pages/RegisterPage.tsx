/* RegisterPage.tsx */
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { Zap, Mail, Lock, User, Eye, EyeOff } from 'lucide-react'

export default function RegisterPage() {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const { login } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        if (password !== confirm) { setError('Passwords do not match.'); return }
        if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
        setLoading(true)
        try {
            const { data } = await axios.post('/api/auth/register', { name, email, passwd: password })
            if (data.success) {
                login(data.token, data.user)
                navigate('/', { replace: true })
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Registration failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ width: '100%', maxWidth: 440 }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #2563eb, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', boxShadow: '0 0 32px rgba(124,58,237,0.35)' }}>
                        <Zap size={26} color="#fff" strokeWidth={2.5} />
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.025em', marginBottom: 6 }}>Create Account</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Join StockSage AI — your personal edge in the Indian market</p>
                </div>

                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', borderRadius: 20, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                        {error && (
                            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: '0.78rem' }}>
                                ⚠️ {error}
                            </div>
                        )}

                        {/* Name */}
                        <div>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7, display: 'block' }}>Full Name</label>
                            <div style={{ position: 'relative' }}>
                                <User size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="text" value={name} onChange={e => setName(e.target.value)}
                                    placeholder="Ram Kumar" required autoComplete="name"
                                    style={{ width: '100%', padding: '11px 12px 11px 36px', background: 'var(--bg-input)', border: '1px solid var(--border-md)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7, display: 'block' }}>Email</label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                    placeholder="you@example.com" required autoComplete="email"
                                    style={{ width: '100%', padding: '11px 12px 11px 36px', background: 'var(--bg-input)', border: '1px solid var(--border-md)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7, display: 'block' }}>Password</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                                    placeholder="Min 6 characters" required
                                    style={{ width: '100%', padding: '11px 40px 11px 36px', background: 'var(--bg-input)', border: '1px solid var(--border-md)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }} />
                                <button type="button" onClick={() => setShowPw(v => !v)}
                                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm */}
                        <div>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7, display: 'block' }}>Confirm Password</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                                    placeholder="Repeat password" required
                                    style={{ width: '100%', padding: '11px 12px 11px 36px', background: 'var(--bg-input)', border: '1px solid var(--border-md)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                        </div>

                        <button type="submit" disabled={loading} className="btn btn-primary"
                            style={{ padding: '12px', fontSize: '0.88rem', fontWeight: 700, marginTop: 4, borderRadius: 12, gap: 8, justifyContent: 'center' }}>
                            {loading ? <><span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} /> Creating account...</> : 'Create Account — Free'}
                        </button>
                    </form>

                    <div style={{ textAlign: 'center', marginTop: 20, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Already have an account?{' '}
                        <Link to="/login" style={{ color: '#a78bfa', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
