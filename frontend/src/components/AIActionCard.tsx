/* ─── AIActionCard.tsx — Premium trade setup cards with interactive chart ─── */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Zap, MessageSquare, Bookmark, BookmarkCheck, TrendingUp, TrendingDown,
    Shield, Target, Activity, ChevronDown, ChevronUp, ExternalLink,
    AlertTriangle, Clock, BarChart3, Brain, Copy, CheckCircle,
    Star, ThumbsUp, Eye, LineChart
} from 'lucide-react'
import { toggleWatchlistItem, isWatched } from '../lib/watchlist'
import StockChart from './StockChart'

interface TradeSetup {
    ticker: string
    sector: string
    setupType: string
    timeframe?: string
    marketCapCr?: number
    ltp: number
    buyZone: number
    target: number
    target2?: number
    atr14?: number
    stopLoss: number
    targetPct: number
    slPct: number
    riskReward: number
    confidenceScore: number
    confidenceBreakdown?: {
        scoreTrend: number
        scoreVolume: number
        scoreRS: number
        scoreSetup: number
        scoreRR: number
    }
    volatilityHitProb: number
    momentumRank: number
    trendStatus: string
    volumeSpike: string
    entryTrigger: string
    catalyst: string
    aiSignal?: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT'
    aiLogic?: string
    aiTargetRange?: string
    aiStopLoss?: string
    headlines?: string[]
}

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 })

function confColor(s: number) { return s >= 7 ? '#34d399' : s >= 5 ? '#fbbf24' : '#f87171' }
function glowRgb(sig?: string) { return sig === 'BUY' || sig === 'LIGHT BUY' ? '16,185,129' : sig === 'REJECT' ? '239,68,68' : '245,158,11' }

// AI Satisfaction level based on confidence + signal
function getSatisfaction(score: number, signal?: string): { label: string; emoji: string; color: string; stars: number } {
    if (signal === 'BUY' && score >= 8) return { label: 'Highly Recommended', emoji: '🔥', color: '#22c55e', stars: 5 }
    if (signal === 'BUY' && score >= 7) return { label: 'Strong Setup', emoji: '💪', color: '#34d399', stars: 4 }
    if ((signal === 'BUY' || signal === 'LIGHT BUY') && score >= 5) return { label: 'Decent Opportunity', emoji: '👍', color: '#fbbf24', stars: 3 }
    if (signal === 'WATCH' && score >= 6) return { label: 'Worth Monitoring', emoji: '👀', color: '#60a5fa', stars: 3 }
    if (signal === 'WATCH') return { label: 'On Watchlist', emoji: '📋', color: '#94a3b8', stars: 2 }
    return { label: 'Needs More Confirmation', emoji: '⏳', color: '#f87171', stars: 1 }
}

export default function AIActionCard({ s, delay = 0 }: { s: TradeSetup; delay?: number }) {
    const [expanded, setExpanded] = useState(false)
    const [showChart, setShowChart] = useState(false)
    const [saved, setSaved] = useState(() => isWatched(s.ticker))
    const [copied, setCopied] = useState(false)
    const navigate = useNavigate()
    const rgb = glowRgb(s.aiSignal)
    const satisfaction = getSatisfaction(s.confidenceScore, s.aiSignal)

    const handleCopySetup = () => {
        const text = `${s.ticker} | ${s.setupType} | ${s.aiSignal}\nBuy: ${fmt(s.buyZone)} | Target: ${fmt(s.target)} (+${s.targetPct.toFixed(1)}%)\nSL: ${fmt(s.stopLoss)} (-${s.slPct.toFixed(1)}%) | RR: ${s.riskReward}:1\nConfidence: ${s.confidenceScore}/10 | ${satisfaction.label}`
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    // Capital required for 1 lot (rough estimate based on buyZone)
    const estimatedLotSize = Math.max(1, Math.floor(50000 / s.buyZone))
    const estimatedCapital = estimatedLotSize * s.buyZone
    const expectedReturn = estimatedCapital * (s.targetPct / 100)
    const maxLoss = estimatedCapital * (s.slPct / 100)

    return (
        <div
            style={{
                background: `radial-gradient(circle at top right, rgba(${rgb},0.06), transparent 50%), var(--bg-card)`,
                border: `1px solid rgba(${rgb}, 0.15)`,
                borderRadius: 18, padding: 0,
                boxShadow: `0 4px 28px rgba(${rgb}, 0.06), var(--card-shadow)`,
                transition: 'all var(--t-normal)',
                animation: `fadeUp 0.4s ease ${delay}s both`,
                position: 'relative', overflow: 'hidden',
            }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-4px)'; el.style.borderColor = `rgba(${rgb}, 0.28)`; el.style.boxShadow = `0 16px 44px rgba(${rgb}, 0.12), var(--card-shadow)` }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.transform = 'none'; el.style.borderColor = `rgba(${rgb}, 0.15)`; el.style.boxShadow = `0 4px 28px rgba(${rgb}, 0.06), var(--card-shadow)` }}
        >
            {/* Corner glow */}
            <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: `radial-gradient(circle, rgba(${rgb},0.1), transparent 70%)`, pointerEvents: 'none' }} />

            {/* AI Signal Ribbon */}
            {s.aiSignal === 'BUY' && s.confidenceScore >= 7 && (
                <div style={{
                    position: 'absolute', top: 10, right: -28, transform: 'rotate(45deg)',
                    width: 100, textAlign: 'center', padding: '2px 0',
                    background: 'linear-gradient(90deg, #10b981, #34d399)',
                    fontSize: '0.5rem', fontWeight: 800, color: '#fff',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
                }}>
                    TOP PICK
                </div>
            )}

            {/* ── Card body with padding ── */}
            <div style={{ padding: '20px 22px 0' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, position: 'relative' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 900, letterSpacing: '-0.025em' }}>{s.ticker}</span>
                            <span style={{
                                padding: '2px 8px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 800,
                                background: (s.aiSignal === 'BUY' || s.aiSignal === 'LIGHT BUY') ? 'rgba(16,185,129,0.12)' : (s.aiSignal === 'REJECT') ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                                color: (s.aiSignal === 'BUY' || s.aiSignal === 'LIGHT BUY') ? '#34d399' : (s.aiSignal === 'REJECT') ? '#f87171' : '#fcd34d',
                                border: `1px solid ${(s.aiSignal === 'BUY' || s.aiSignal === 'LIGHT BUY') ? 'rgba(16,185,129,0.3)' : (s.aiSignal === 'REJECT') ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
                            }}>{s.aiSignal || 'WATCH'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <span className="badge badge-purple" style={{ fontSize: '0.54rem', fontWeight: 800, background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}>
                                {s.timeframe || 'Swing'}
                            </span>
                            <span className="badge badge-neutral" style={{ fontSize: '0.56rem' }}>{s.setupType}</span>
                            <span className="badge badge-neutral" style={{ fontSize: '0.56rem' }}>{s.sector}</span>
                            {s.momentumRank > 0 && s.momentumRank <= 10 && <span className="badge badge-buy" style={{ fontSize: '0.54rem' }}>#{s.momentumRank} Momentum</span>}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.12rem', fontWeight: 700, marginBottom: 4 }}>{fmt(s.ltp)}</div>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, color: '#34d399' }}>+{s.targetPct.toFixed(1)}%</span>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>RR {s.riskReward}:1</span>
                        </div>
                    </div>
                </div>

                {/* 3-col price levels */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                    {[
                        { label: 'Buy Zone', value: fmt(s.buyZone), color: 'var(--blue)', icon: <Target size={10} /> },
                        { label: 'Target', value: fmt(s.target), color: '#34d399', icon: <TrendingUp size={10} /> },
                        { label: 'Stop Loss', value: fmt(s.stopLoss), color: '#f87171', icon: <Shield size={10} /> },
                    ].map(m => (
                        <div key={m.label} style={{
                            padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 10,
                            border: '1px solid var(--border)', transition: 'border-color 0.15s',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.56rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>
                                {m.icon} {m.label}
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: m.color }}>{m.value}</div>
                        </div>
                    ))}
                </div>

                {/* ── AI Satisfaction Gauge ── */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', marginBottom: 12,
                    background: `${satisfaction.color}08`, borderRadius: 12,
                    border: `1px solid ${satisfaction.color}18`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '1.2rem' }}>{satisfaction.emoji}</span>
                        <div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.78rem', fontWeight: 800, color: satisfaction.color }}>
                                {satisfaction.label}
                            </div>
                            <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                                {[1, 2, 3, 4, 5].map(i => (
                                    <Star key={i} size={10} fill={i <= satisfaction.stars ? satisfaction.color : 'transparent'} color={i <= satisfaction.stars ? satisfaction.color : 'var(--text-muted)'} strokeWidth={1.5} />
                                ))}
                            </div>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 900, color: confColor(s.confidenceScore) }}>
                            {s.confidenceScore}
                            <span style={{ fontSize: '0.6rem', fontWeight: 500, color: 'var(--text-muted)' }}>/10</span>
                        </div>
                    </div>
                </div>

                {/* Confidence progress bar */}
                <div style={{ marginBottom: 12 }}>
                    <div style={{ height: 4, background: 'var(--bg-hover)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ width: `${s.confidenceScore * 10}%`, height: '100%', background: `linear-gradient(90deg, ${confColor(s.confidenceScore)}88, ${confColor(s.confidenceScore)})`, borderRadius: 99, transition: 'width 0.8s ease' }} />
                    </div>
                </div>

                {/* Quick trade estimate for BUY signals */}
                {(s.aiSignal === 'BUY' || s.aiSignal === 'LIGHT BUY') && (
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12,
                        padding: '8px 10px', background: 'rgba(16,185,129,0.04)', borderRadius: 10,
                        border: '1px solid rgba(16,185,129,0.1)',
                    }}>
                        <div>
                            <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>~Capital</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700 }}>{fmt(estimatedCapital)}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.5rem', color: '#34d399', fontWeight: 600, textTransform: 'uppercase' }}>Expected</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: '#34d399' }}>+{fmt(expectedReturn)}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.5rem', color: '#f87171', fontWeight: 600, textTransform: 'uppercase' }}>Max Loss</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: '#f87171' }}>-{fmt(maxLoss)}</div>
                        </div>
                    </div>
                )}

                {/* Tags */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span className="badge badge-neutral" style={{ fontSize: '0.54rem' }}>Vol {s.volumeSpike}</span>
                    <span className={`badge ${s.trendStatus.includes('Bullish') ? 'badge-buy' : 'badge-watch'}`} style={{ fontSize: '0.54rem' }}>{s.trendStatus}</span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.54rem' }}>{s.entryTrigger}</span>
                    {s.volatilityHitProb > 0 && (
                        <span className="badge badge-neutral" style={{ fontSize: '0.54rem' }}>Hit Prob {(s.volatilityHitProb * 100).toFixed(0)}%</span>
                    )}
                </div>
            </div>

            {/* ── Interactive Chart Toggle ── */}
            <div style={{ padding: '0 22px 12px' }}>
                <button
                    onClick={() => setShowChart(v => !v)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                        background: showChart ? 'rgba(59,130,246,0.08)' : 'var(--bg-elevated)',
                        border: `1px solid ${showChart ? 'rgba(59,130,246,0.2)' : 'var(--border)'}`,
                        borderRadius: 10, padding: '8px 12px',
                        cursor: 'pointer', transition: 'all 0.15s',
                        color: showChart ? '#60a5fa' : 'var(--text-secondary)',
                        fontSize: '0.74rem', fontWeight: 700, fontFamily: 'var(--font-body)',
                    }}
                >
                    <LineChart size={14} />
                    {showChart ? 'Hide Chart' : 'Show Chart'} — SMA · EMA · RSI · Volume
                    <ChevronDown size={12} style={{ marginLeft: 'auto', transform: showChart ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
            </div>

            {/* ── Chart Panel ── */}
            {showChart && (
                <div style={{ padding: '0 12px 12px', animation: 'fadeUp 0.3s ease both' }}>
                    <StockChart
                        ticker={s.ticker}
                        buyZone={s.buyZone}
                        target={s.target}
                        stopLoss={s.stopLoss}
                        ltp={s.ltp}
                    />
                </div>
            )}

            {/* ── Enhanced AI Reasoning (expandable) ── */}
            {(s.aiLogic || s.confidenceBreakdown) && (
                <div style={{ padding: '0 22px 12px' }}>
                    <button
                        onClick={() => setExpanded(v => !v)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
                            cursor: 'pointer', color: 'var(--purple)', fontSize: '0.72rem', fontWeight: 600,
                            padding: 0, fontFamily: 'var(--font-body)',
                        }}
                    >
                        <Brain size={11} /> AI Reasoning & Analysis {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {expanded && (
                        <div style={{ marginTop: 8, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.14)', borderRadius: 12, padding: '14px 16px', animation: 'fadeUp 0.2s ease both' }}>

                            {/* Confidence Breakdown Grid */}
                            {s.confidenceBreakdown && (
                                <div style={{ marginBottom: 14 }}>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Score Breakdown</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                                        {[
                                            { label: 'Trend', val: s.confidenceBreakdown.scoreTrend, max: 2, icon: <TrendingUp size={10} /> },
                                            { label: 'Volume', val: s.confidenceBreakdown.scoreVolume, max: 2, icon: <BarChart3 size={10} /> },
                                            { label: 'RS', val: s.confidenceBreakdown.scoreRS, max: 2, icon: <Activity size={10} /> },
                                            { label: 'Setup', val: s.confidenceBreakdown.scoreSetup, max: 2, icon: <Target size={10} /> },
                                            { label: 'RR', val: s.confidenceBreakdown.scoreRR, max: 2, icon: <Shield size={10} /> },
                                        ].map(b => (
                                            <div key={b.label} style={{
                                                textAlign: 'center', padding: '6px 4px',
                                                background: 'var(--bg-elevated)', borderRadius: 8,
                                                border: '1px solid var(--border)',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: '0.5rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                                                    {b.icon} {b.label}
                                                </div>
                                                <div style={{ fontSize: '0.88rem', fontWeight: 900, color: b.val >= 1.5 ? '#34d399' : b.val >= 1 ? '#fbbf24' : '#f87171' }}>
                                                    {b.val}
                                                </div>
                                                {/* Mini bar */}
                                                <div style={{ height: 2, background: 'var(--bg-hover)', borderRadius: 99, overflow: 'hidden', marginTop: 4 }}>
                                                    <div style={{ width: `${(b.val / b.max) * 100}%`, height: '100%', background: b.val >= 1.5 ? '#34d399' : b.val >= 1 ? '#fbbf24' : '#f87171', borderRadius: 99 }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* AI Reasoning Text */}
                            <div style={{
                                fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7,
                                padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 8,
                                border: '1px solid var(--border)',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, fontSize: '0.58rem', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase' }}>
                                    <Brain size={10} /> AI Analysis
                                </div>
                                {s.aiLogic || 'No detailed reasoning available.'}
                            </div>

                            {/* Catalyst if available */}
                            {s.catalyst && (
                                <div style={{
                                    marginTop: 10, padding: '8px 12px', background: 'rgba(59,130,246,0.05)',
                                    borderRadius: 8, border: '1px solid rgba(59,130,246,0.1)',
                                    fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                                }}>
                                    <span style={{ fontSize: '0.52rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase' }}>Catalyst: </span>
                                    {s.catalyst}
                                </div>
                            )}

                            {/* News Headlines if available */}
                            {s.headlines && s.headlines.length > 0 && (
                                <div style={{
                                    marginTop: 10, padding: '8px 12px', background: 'var(--bg-elevated)',
                                    borderRadius: 8, border: '1px solid var(--border)',
                                    display: 'flex', flexDirection: 'column', gap: 6,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.55rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                        📰 Context Engine: Recent Headlines
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                        {s.headlines.slice(0, 3).map((h, i) => (
                                            <li key={i} style={{ marginBottom: 4 }}>{h}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Satisfaction verdict */}
                            <div style={{
                                marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '8px 12px', background: `${satisfaction.color}06`,
                                borderRadius: 8, border: `1px solid ${satisfaction.color}15`,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: '1rem' }}>{satisfaction.emoji}</span>
                                    <div>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: satisfaction.color }}>{satisfaction.label}</div>
                                        <div style={{ fontSize: '0.54rem', color: 'var(--text-muted)' }}>AI Satisfaction Level</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 2 }}>
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <Star key={i} size={12} fill={i <= satisfaction.stars ? satisfaction.color : 'transparent'} color={i <= satisfaction.stars ? satisfaction.color : 'var(--text-muted)'} strokeWidth={1.5} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Quick Actions Footer ── */}
            <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                    {/* Chart toggle (small) */}
                    <button onClick={() => setShowChart(v => !v)} className={`btn ${showChart ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 8px', fontSize: '0.68rem', gap: 3, minWidth: 0 }} title="Toggle chart">
                        <LineChart size={11} /> Chart
                    </button>
                    {/* Copy Setup */}
                    <button onClick={handleCopySetup} className="btn btn-ghost" style={{ padding: '5px 8px', fontSize: '0.68rem', gap: 3, minWidth: 0 }} title="Copy setup to clipboard">
                        {copied ? <CheckCircle size={11} style={{ color: '#34d399' }} /> : <Copy size={11} />}
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                    {/* Ask AI */}
                    <button onClick={() => navigate(`/chat?q=${encodeURIComponent(`Analyse ${s.ticker}`)}`)} className="btn btn-ghost" style={{ padding: '5px 8px', fontSize: '0.68rem', gap: 3 }}>
                        <MessageSquare size={11} /> AI
                    </button>
                    {/* Save */}
                    <button
                        onClick={() => { toggleWatchlistItem({ ticker: s.ticker, sector: s.sector, signal: s.aiSignal, ltp: s.ltp, target: s.target, stopLoss: s.stopLoss, targetPct: s.targetPct, slPct: s.slPct, riskReward: s.riskReward, confidenceScore: s.confidenceScore, setupType: s.setupType, buyZone: s.buyZone }); setSaved(v => !v) }}
                        className={`btn ${saved ? 'btn-purple' : 'btn-ghost'}`} style={{ padding: '5px 8px', fontSize: '0.68rem', gap: 3 }}
                    >
                        {saved ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
                        {saved ? 'Saved' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    )
}
