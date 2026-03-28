import { useState, useRef, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
    Send, ThumbsUp, ThumbsDown, Copy, Bookmark, BookmarkCheck,
    TrendingUp, TrendingDown, CheckCircle, AlertTriangle, MinusCircle,
    ExternalLink, RotateCcw, Info, ChevronDown, ChevronUp
} from 'lucide-react'
import { getWatchlist, toggleWatchlistItem } from '../lib/watchlist'
import { useWatchlist } from '../lib/useWatchlist'
import { useViewport } from '../lib/useViewport'

/* ─── Types ───────────────────────────────────────────────── */
interface StockCard {
    ticker: string
    price: number
    signal: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT' | null
    buyZone?: number
    target?: number
    stopLoss?: number
    targetPct?: number
    slPct?: number
    riskReward?: number
    confidenceScore?: number
    sector?: string
    setupType?: string
}

interface Section {
    type: 'technicals' | 'fundamentals' | 'verdict' | 'overlap' | 'portfolio'
    data: Record<string, unknown>
}

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    stockCard?: StockCard
    sections?: Section[]
    sources?: string[]
    timestamp: Date
    isTyping?: boolean
    feedback?: 'up' | 'down' | null
}

/* ─── Constants ───────────────────────────────────────────── */
const SUGGESTIONS = [
    'Is Reliance Industries a good buy right now?',
    'Show me top 5 momentum stocks today',
    'Explain VCP pattern with an example',
    'My portfolio: TCS, Infosys, Wipro. Am I diversified?',
    'Why did Nifty fall today?',
    'Best defensive stocks for bearish market',
]

const WELCOME_ID = 'welcome-0'

/* ─── Helpers ─────────────────────────────────────────────── */
function fmtPrice(n: number) {
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pctStr(n: number) {
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
}
function signalBadgeClass(sig: string | null) {
    if (sig === 'BUY' || sig === 'LIGHT BUY') return 'badge badge-buy'
    if (sig === 'REJECT') return 'badge badge-avoid'
    return 'badge badge-watch'
}
function confClass(score: number) {
    if (score >= 7) return 'conf-high'
    if (score >= 5) return 'conf-medium'
    return 'conf-low'
}

/* ─── Typing indicator ────────────────────────────────────── */
function TypingIndicator() {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, animation: 'fadeUp 0.2s ease both' }}>
            <AiAvatar />
            <div className="bubble-ai" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 18px' }}>
                {[0, 1, 2].map(i => (
                    <span key={i} style={{ display: 'block', width: 7, height: 7, borderRadius: '50%', background: 'var(--purple)', animation: `bounce3 1.25s ease-in-out ${i * 0.18}s infinite` }} />
                ))}
            </div>
        </div>
    )
}

/* ─── Avatars ─────────────────────────────────────────────── */
function AiAvatar() {
    return (
        <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 14px rgba(124,58,237,0.3)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>AI</span>
        </div>
    )
}
function UserAvatar() {
    return (
        <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.68rem', fontWeight: 800, color: '#fff' }}>U</span>
        </div>
    )
}

/* ─── Inline Stock Card ───────────────────────────────────── */
function StockCardView({ card, watchlist, toggle }: { card: StockCard; watchlist: any[]; toggle: (item: any) => void }) {
    const { isMobile, isPhone } = useViewport()
    const saved = watchlist.some(w => w.ticker === card.ticker)
    const [showMeta, setShowMeta] = useState(false)
    const SignalIcon = (card.signal === 'BUY' || card.signal === 'LIGHT BUY') ? CheckCircle : card.signal === 'REJECT' ? AlertTriangle : MinusCircle
    const signalColor = (card.signal === 'BUY' || card.signal === 'LIGHT BUY') ? '#34d399' : card.signal === 'REJECT' ? '#f87171' : '#fcd34d'
    const glowAlpha = (card.signal === 'BUY' || card.signal === 'LIGHT BUY') ? '16,185,129' : card.signal === 'REJECT' ? '239,68,68' : '245,158,11'

    function handleSave() {
        toggle({
            ticker: card.ticker,
            sector: card.sector || 'NSE',
            signal: card.signal || undefined,
            ltp: card.price,
            target: card.target,
            stopLoss: card.stopLoss,
            targetPct: card.targetPct,
            slPct: card.slPct,
            riskReward: card.riskReward,
            confidenceScore: card.confidenceScore,
            setupType: card.setupType,
            buyZone: card.buyZone,
        })
    }

    return (
        <div style={{
            background: `radial-gradient(circle at top right, rgba(${glowAlpha},0.07), transparent 55%), var(--bg-card)`,
            border: `1px solid rgba(${glowAlpha}, 0.22)`,
            borderRadius: 16,
            padding: '18px 20px',
            marginTop: 12,
            boxShadow: `0 0 40px rgba(${glowAlpha}, 0.08)`,
            animation: 'fadeUp 0.35s ease both',
        }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4 }}>
                        {card.ticker}
                    </div>
                    {card.sector && (
                        <span className="badge badge-neutral" style={{ fontSize: '0.62rem' }}>{card.sector}{card.setupType ? ` · ${card.setupType}` : ''}</span>
                    )}
                </div>
                <div style={{ textAlign: isPhone ? 'left' : 'right', width: isPhone ? '100%' : 'auto' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700, marginBottom: 6 }}>
                        {fmtPrice(card.price)}
                    </div>
                    {card.signal && (
                        <span className={signalBadgeClass(card.signal)} style={{ gap: 5 }}>
                            <SignalIcon size={11} strokeWidth={2.5} />
                            {card.signal}
                        </span>
                    )}
                </div>
            </div>

            {/* Metrics */}
            {(card.buyZone || card.target || card.stopLoss) && (
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                    <div className="metric-box">
                        <div className="metric-label">Buy Zone</div>
                        <div className="metric-value" style={{ color: 'var(--blue)', fontSize: '0.88rem' }}>
                            {card.buyZone ? fmtPrice(card.buyZone) : '—'}
                        </div>
                    </div>
                    <div className="metric-box">
                        <div className="metric-label">Target {card.targetPct ? pctStr(card.targetPct) : ''}</div>
                        <div className="metric-value" style={{ color: '#34d399', fontSize: '0.88rem' }}>
                            {card.target ? fmtPrice(card.target) : '—'}
                        </div>
                    </div>
                    <div className="metric-box">
                        <div className="metric-label">Stop {card.slPct ? pctStr(-card.slPct) : ''}</div>
                        <div className="metric-value" style={{ color: '#f87171', fontSize: '0.88rem' }}>
                            {card.stopLoss ? fmtPrice(card.stopLoss) : '—'}
                        </div>
                    </div>
                </div>
            )}

            {/* Confidence */}
            {card.confidenceScore != null && (
                <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <span className="metric-label" style={{ marginBottom: 0 }}>AI Confidence</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: signalColor }}>
                            {card.confidenceScore.toFixed(1)}/10
                        </span>
                    </div>
                    <div className="conf-track">
                        <div className={`conf-fill ${confClass(card.confidenceScore)}`} style={{ width: `${card.confidenceScore * 10}%` }} />
                    </div>
                </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border)', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {card.riskReward && (
                        <span className="badge badge-neutral">RR {card.riskReward}:1</span>
                    )}
                    <button onClick={() => setShowMeta(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.7rem' }}>
                        <Info size={12} />
                        {showMeta ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                </div>
                <div style={{ display: 'flex', gap: 6, width: isMobile ? '100%' : 'auto' }}>
                    <a
                        href={`https://www.nseindia.com/get-quotes/equity?symbol=${card.ticker}`}
                        target="_blank" rel="noreferrer"
                        className="btn btn-ghost"
                        style={{ padding: '5px 10px', fontSize: '0.72rem', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4, flex: isMobile ? 1 : undefined, justifyContent: 'center' }}
                    >
                        <ExternalLink size={11} /> NSE
                    </a>
                    <button onClick={handleSave} className={`btn ${saved ? 'btn-purple' : 'btn-ghost'}`} style={{ padding: '5px 10px', fontSize: '0.72rem', borderRadius: 8, flex: isMobile ? 1 : undefined, justifyContent: 'center' }}>
                        {saved ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
                        {saved ? 'Saved' : 'Save'}
                    </button>
                </div>
            </div>

            {showMeta && (
                <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 8, fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.7, animation: 'fadeUp 0.2s ease both' }}>
                    <Info size={10} style={{ display: 'inline', marginRight: 4 }} />
                    This is AI-generated research for educational purposes only. Prices and signals may change. Always verify before trading. Not financial advice.
                </div>
            )}
        </div>
    )
}

/* ─── Message sources ─────────────────────────────────────── */
function Sources({ sources }: { sources: string[] }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Data:</span>
            {sources.map(s => (
                <span key={s} style={{ fontSize: '0.6rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '1px 7px', borderRadius: 99 }}>{s}</span>
            ))}
        </div>
    )
}

/* ─── Message bubble ──────────────────────────────────────── */
function MessageBubble({
    msg, onFeedback, onCopy, watchlist, toggle
}: {
    msg: Message
    onFeedback: (id: string, val: 'up' | 'down') => void
    onCopy: (text: string) => void
    watchlist: any[]
    toggle: (item: any) => void
}) {
    const { isMobile, isPhone } = useViewport()
    const isUser = msg.role === 'user'
    if (msg.isTyping) return <TypingIndicator />

    return (
        <div
            style={{ display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', gap: 10, alignItems: 'flex-start', animation: 'fadeUp 0.3s ease both' }}
        >
            {isUser ? <UserAvatar /> : <AiAvatar />}

            <div style={{ maxWidth: isMobile ? '100%' : '78%', minWidth: 0, width: isPhone ? 'calc(100% - 44px)' : 'auto' }}>
                {isUser
                    ? <div className="bubble-user">{msg.content}</div>
                    : <div className="bubble-ai" style={{ lineHeight: 1.75 }}>
                        {msg.id === WELCOME_ID ? (
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 10 }}>Hello! I'm StockSage AI — your NSE research companion.</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 12 }}>I can help you with:</div>
                                <ul style={{ paddingLeft: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                                    {[
                                        'Analyse any NSE stock with live data — technicals & fundamentals',
                                        'Find high-confidence trade setups across 1000+ stocks',
                                        'Explain market moves and concepts in plain English',
                                        'Review your portfolio for sector concentration & risk',
                                        'Answer anything about the Indian stock market',
                                    ].map(item => (
                                        <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.85rem' }}>
                                            <span style={{ color: 'var(--purple)', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>→</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div style={{ marginTop: 14, fontSize: '0.88rem', fontWeight: 600 }}>What would you like to know?</div>
                            </div>
                        ) : (
                            msg.content
                        )}
                    </div>
                }

                {/* Stock card */}
                {msg.stockCard && <StockCardView card={msg.stockCard} watchlist={watchlist} toggle={toggle} />}

                {/* Metadata row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                        {msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    {/* Sources */}
                    {msg.sources && msg.sources.length > 0 && <Sources sources={msg.sources} />}

                    {/* AI feedback buttons */}
                    {!isUser && (
                        <div style={{ display: 'flex', gap: 4, marginLeft: isPhone ? 0 : 'auto', width: isPhone ? '100%' : 'auto', justifyContent: isPhone ? 'flex-end' : 'flex-start' }}>
                            <button onClick={() => onCopy(msg.content)} title="Copy" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 3, borderRadius: 4, transition: 'color var(--t-fast)' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                            ><Copy size={12} /></button>
                            <button onClick={() => onFeedback(msg.id, 'up')} title="Good response" style={{ background: 'none', border: 'none', cursor: 'pointer', color: msg.feedback === 'up' ? 'var(--green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 3, borderRadius: 4, transition: 'color var(--t-fast)' }}>
                                <ThumbsUp size={12} />
                            </button>
                            <button onClick={() => onFeedback(msg.id, 'down')} title="Poor response" style={{ background: 'none', border: 'none', cursor: 'pointer', color: msg.feedback === 'down' ? 'var(--red)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 3, borderRadius: 4, transition: 'color var(--t-fast)' }}>
                                <ThumbsDown size={12} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/* ─── Main Chat Page ──────────────────────────────────────── */
export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([
        { id: WELCOME_ID, role: 'assistant', content: '', timestamp: new Date(), sources: [] }
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const endRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const { items: watchlist, toggle } = useWatchlist()
    const { isMobile, isPhone } = useViewport()

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const send = useCallback(async (text: string) => {
        const msg = text.trim()
        if (!msg || loading) return

        const id = Date.now().toString()
        setMessages(prev => [
            ...prev,
            { id, role: 'user', content: msg, timestamp: new Date() },
            { id: 'typing', role: 'assistant', content: '', isTyping: true, timestamp: new Date() },
        ])
        setInput('')
        setLoading(true)

        // Auto-resize input back
        if (inputRef.current) {
            inputRef.current.style.height = 'auto'
        }

        try {
            const { data } = await axios.post('/api/chat', { message: msg }, { timeout: 40000 })
            setMessages(prev => [
                ...prev.filter(m => m.id !== 'typing'),
                {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: data.reply || 'No response received.',
                    stockCard: data.stockCard || null,
                    sources: data.sources || ['NSE India', 'Gemini AI'],
                    timestamp: new Date(),
                    feedback: null,
                },
            ])
        } catch {
            setMessages(prev => [
                ...prev.filter(m => m.id !== 'typing'),
                {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: 'Unable to get a response right now. Please check that the backend server is running and your ANTHROPIC_API_KEY is set in the .env file.',
                    timestamp: new Date(),
                    sources: [],
                },
            ])
        } finally {
            setLoading(false)
            setTimeout(() => inputRef.current?.focus(), 60)
        }
    }, [loading])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
    }

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value)
        const t = e.target
        t.style.height = 'auto'
        t.style.height = Math.min(t.scrollHeight, 140) + 'px'
    }

    const handleFeedback = (id: string, val: 'up' | 'down') => {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, feedback: m.feedback === val ? null : val } : m))
    }

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text).catch(() => { })
    }

    const handleReset = () => {
        setMessages([{ id: WELCOME_ID, role: 'assistant', content: '', timestamp: new Date(), sources: [] }])
    }

    const showSuggestions = messages.length <= 1

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', maxWidth: 860, margin: '0 auto', width: '100%' }}>

            {/* ── Chat header ──────────────────────────────────────── */}
            <div style={{ padding: isMobile ? '12px 12px' : '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <AiAvatar />
                <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>StockSage AI</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span className="status-dot status-dot-green" />
                        <span style={{ fontSize: '0.65rem', color: '#34d399', fontWeight: 600 }}>Online &mdash; NSE Research Assistant</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {!isPhone && <span className="badge badge-vcp" style={{ fontSize: '0.62rem' }}>Gemini AI</span>}
                    {!isPhone && <span className="badge badge-buy" style={{ fontSize: '0.62rem' }}>Live NSE Data</span>}
                    <button onClick={handleReset} className="btn btn-icon btn-ghost" title="New conversation" style={{ width: 30, height: 30 }}>
                        <RotateCcw size={12} />
                    </button>
                </div>
            </div>

            {/* ── Messages ─────────────────────────────────────────── */}
            <div
                style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 12px 8px' : '24px 20px 12px', display: 'flex', flexDirection: 'column', gap: 22, scrollbarColor: 'var(--bg-hover) transparent' }}
            >
                {messages.map(m => (
                    <MessageBubble key={m.id} msg={m} onFeedback={handleFeedback} onCopy={handleCopy} watchlist={watchlist} toggle={toggle} />
                ))}
                <div ref={endRef} />
            </div>

            {/* ── Suggestion chips ──────────────────────────────────── */}
            {showSuggestions && (
                <div style={{ padding: isMobile ? '10px 12px 2px' : '10px 20px 2px', display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                    {SUGGESTIONS.map(s => (
                        <button
                            key={s}
                            onClick={() => send(s)}
                            style={{
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-md)',
                                color: 'var(--text-secondary)',
                                padding: '6px 13px',
                                borderRadius: 99,
                                fontSize: '0.77rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all var(--t-fast)',
                                fontFamily: 'var(--font-body)',
                            }}
                            onMouseEnter={e => {
                                const b = e.currentTarget as HTMLButtonElement
                                b.style.borderColor = 'rgba(139,92,246,0.4)'
                                b.style.color = '#c4b5fd'
                                b.style.background = 'rgba(139,92,246,0.08)'
                            }}
                            onMouseLeave={e => {
                                const b = e.currentTarget as HTMLButtonElement
                                b.style.borderColor = 'var(--border-md)'
                                b.style.color = 'var(--text-secondary)'
                                b.style.background = 'var(--bg-elevated)'
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Input bar ─────────────────────────────────────────── */}
                <div style={{ padding: isMobile ? '10px 12px 14px' : '12px 20px 18px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-end',
                    background: 'var(--bg-input)',
                    border: `1px solid ${loading ? 'rgba(139,92,246,0.45)' : 'var(--border-md)'}`,
                    borderRadius: 14,
                    padding: '10px 12px 10px 16px',
                    transition: 'border-color var(--t-fast)',
                    boxShadow: loading ? '0 0 0 3px rgba(139,92,246,0.07)' : 'none',
                }}>
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about any stock, sector, or market concept..."
                        rows={1}
                        disabled={loading}
                        maxLength={1200}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '0.9rem',
                            lineHeight: 1.6,
                            resize: 'none',
                            maxHeight: 140,
                            fontFamily: 'var(--font-body)',
                            scrollbarWidth: 'none',
                        }}
                    />
                    <button
                        onClick={() => send(input)}
                        disabled={loading || !input.trim()}
                        style={{
                            width: 38, height: 38, borderRadius: '50%', border: 'none', flexShrink: 0,
                            background: input.trim() && !loading ? 'linear-gradient(135deg, #7c3aed, #4f46e5)' : 'var(--bg-hover)',
                            cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: input.trim() && !loading ? '#fff' : 'var(--text-muted)',
                            boxShadow: input.trim() && !loading ? '0 0 16px rgba(124,58,237,0.4)' : 'none',
                            transform: input.trim() && !loading ? 'scale(1)' : 'scale(0.9)',
                            transition: 'all var(--t-fast)',
                        }}
                    >
                        <Send size={15} strokeWidth={2.2} />
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 7, flexWrap: 'wrap' }}>
                    {['Research and education only', 'Not financial advice', 'Always verify before trading'].map(t => (
                        <span key={t} style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{t}</span>
                    ))}
                </div>
            </div>

            <style>{`
        @keyframes bounce3 {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }
        textarea::-webkit-scrollbar { display: none; }
      `}</style>
        </div>
    )
}
