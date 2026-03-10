import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView, useAnimation } from 'framer-motion'
import {
    Zap, MessageSquare, Bookmark, BookmarkCheck, TrendingUp,
    Shield, Target, Activity, ChevronDown, ChevronUp, Copy, CheckCircle,
    Star, Brain, LineChart, Cpu, BarChart3, Database
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
        scoreTrend: number; scoreVolume: number; scoreRS: number; scoreSetup: number; scoreRR: number
    }
    volatilityHitProb: number
    momentumRank: number
    trendStatus: string
    volumeSpike: string
    entryTrigger: string
    catalyst: string
    aiSignal?: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT'
    aiLogic?: string
    institutionalDemand?: number
    pcr?: number
    derivativeStatus?: string
    headlines?: string[]
}

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Simple CountUp animation for dynamic numbers
function CountUp({ value, suffix = '', decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
    const [count, setCount] = useState(0)
    const ref = useRef(null)
    const isInView = useInView(ref, { once: true })

    useEffect(() => {
        if (!isInView) return
        let start = 0
        const end = value
        if (start === end) return
        const minTimer = 50
        let stepTime = Math.abs(Math.floor(800 / (end - start)))
        stepTime = Math.max(stepTime, minTimer)
        const startTime = Date.now()
        const duration = 800

        const step = () => {
            const now = Date.now()
            const progress = Math.min((now - startTime) / duration, 1)
            // ease out cubic
            const easeProgress = 1 - Math.pow(1 - progress, 3)
            setCount(start + (end - start) * easeProgress)
            if (progress < 1) {
                requestAnimationFrame(step)
            } else {
                setCount(end)
            }
        }
        requestAnimationFrame(step)
    }, [value, isInView])

    return <span ref={ref}>{count.toFixed(decimals)}{suffix}</span>
}

// Glowing styles based on signal
function getSignalStyles(signal?: string) {
    if (signal === 'BUY' || signal === 'LIGHT BUY') return { color: 'neon-text-green', border: 'neon-border-green', hex: '#10b981', bg: 'rgba(16,185,129,0.05)' }
    if (signal === 'REJECT') return { color: 'text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]', border: 'border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.3)]', hex: '#f43f5e', bg: 'rgba(244,63,94,0.05)' }
    return { color: 'neon-text-amber', border: 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]', hex: '#f59e0b', bg: 'rgba(245,158,11,0.05)' }
}

export default function AIActionCard({ s, delay = 0 }: { s: TradeSetup; delay?: number }) {
    const [expanded, setExpanded] = useState(false)
    const [showChart, setShowChart] = useState(false)
    const [saved, setSaved] = useState(() => isWatched(s.ticker))
    const [copied, setCopied] = useState(false)
    const navigate = useNavigate()

    const theme = getSignalStyles(s.aiSignal)

    const handleCopySetup = () => {
        const text = `${s.ticker} | ${s.setupType} | ${s.aiSignal}\nBuy: ${fmt(s.buyZone)} | Target: ${fmt(s.target)} (+${s.targetPct.toFixed(1)}%)\nSL: ${fmt(s.stopLoss)} (-${s.slPct.toFixed(1)}%) | RR: ${s.riskReward}:1\nPCR: ${s.pcr || 'N/A'}`
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.015, y: -4 }}
            className={`glass-card ${theme.border} transition-all duration-300`}
            style={{ backgroundImage: `linear-gradient(to bottom right, ${theme.bg}, transparent 60%)` }}
        >
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] pointer-events-none" style={{ background: theme.hex, opacity: 0.15 }} />

            {/* Header */}
            <div className="p-5 pb-3">
                <div className="flex justify-between items-start mb-3">
                    <div>
                        <div className="flex items-center gap-3 mb-1.5">
                            <h2 className="font-display text-2xl font-bold tracking-tight text-white">{s.ticker}</h2>
                            <div className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider border bg-black/40 ${theme.color} border-${theme.hex}/30`}>
                                {s.aiSignal || 'WATCH'}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-[0.65rem] text-slate-300 uppercase tracking-widest">{s.sector}</span>
                            <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-[0.65rem] text-slate-300 uppercase tracking-widest">{s.setupType}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="font-mono text-xl font-bold text-white tracking-tight">{fmt(s.ltp)}</div>
                        <div className="flex gap-2 justify-end items-center mt-1">
                            <span className="neon-text-green font-mono text-xs font-bold">+<CountUp value={s.targetPct} decimals={1} />%</span>
                            <span className="text-[0.65rem] text-slate-400 font-medium tracking-wider">RR {s.riskReward}:1</span>
                        </div>
                    </div>
                </div>

                {/* 3-Col Data (Buy, Target, SL) */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                    {[
                        { label: 'Buy Zone', value: fmt(s.buyZone), color: 'text-cyan-400', icon: Target },
                        { label: 'Target', value: fmt(s.target), color: 'text-emerald-400', icon: TrendingUp },
                        { label: 'Stop Loss', value: fmt(s.stopLoss), color: 'text-rose-400', icon: Shield },
                    ].map(m => (
                        <div key={m.label} className="metric-box-cyber">
                            <div className="flex items-center gap-1.5 text-[0.6rem] text-slate-400 uppercase tracking-wider font-bold mb-1">
                                <m.icon size={10} /> {m.label}
                            </div>
                            <div className={`font-mono text-sm font-bold ${m.color}`}>{m.value}</div>
                        </div>
                    ))}
                </div>

                {/* Institutional X-Ray Row (Phase 6 Integration) */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="metric-box-cyber bg-cyan-950/10 border-cyan-500/20">
                        <div className="flex items-center gap-1.5 text-[0.6rem] text-cyan-500/80 uppercase tracking-wider font-bold mb-1">
                            <Database size={10} /> Options Flow (PCR)
                        </div>
                        <div className="flex items-end justify-between">
                            <div className="font-mono text-sm font-bold neon-text-cyan">
                                {s.pcr ? <CountUp value={s.pcr} decimals={2} /> : 'N/A'}
                            </div>
                            <div className="text-[0.6rem] text-cyan-400/60 uppercase">{s.derivativeStatus || 'Idle'}</div>
                        </div>
                    </div>
                    <div className="metric-box-cyber bg-purple-950/10 border-purple-500/20">
                        <div className="flex items-center gap-1.5 text-[0.6rem] text-purple-500/80 uppercase tracking-wider font-bold mb-1">
                            <BarChart3 size={10} /> Inst. Demand
                        </div>
                        <div className="flex items-end justify-between">
                            <div className="font-mono text-sm font-bold neon-text-purple">
                                {s.institutionalDemand ? <><CountUp value={s.institutionalDemand} />%</> : 'N/A'}
                            </div>
                            <div className="text-[0.6rem] text-purple-400/60 uppercase">Vol Avg</div>
                        </div>
                    </div>
                </div>

                {/* Confidence Bar */}
                <div className="mb-4">
                    <div className="flex justify-between items-end mb-1.5">
                        <span className="text-[0.6rem] text-slate-400 uppercase tracking-wider font-bold flex items-center gap-1"><Cpu size={10} /> AI Confidence Score</span>
                        <span className={`font-mono text-xs font-bold ${theme.color}`}><CountUp value={s.confidenceScore} decimals={1} />/10</span>
                    </div>
                    <div className="h-1.5 bg-slate-800/50 rounded-full overflow-hidden border border-white/5">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${s.confidenceScore * 10}%` }}
                            transition={{ duration: 1.2, delay: delay + 0.3, ease: 'easeOut' }}
                            className="h-full rounded-full"
                            style={{ background: theme.hex, boxShadow: `0 0 10px ${theme.hex}` }}
                        />
                    </div>
                </div>
            </div>

            {/* Interactive Chart Toggle */}
            <div className="px-5 pb-3">
                <button
                    onClick={() => setShowChart(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-300 transition-all duration-300"
                >
                    <span className="flex items-center gap-2"><LineChart size={14} className="text-cyan-400" /> {showChart ? 'Hide X-Ray Chart' : 'Show X-Ray Chart'}</span>
                    <motion.div animate={{ rotate: showChart ? 180 : 0 }}><ChevronDown size={14} /></motion.div>
                </button>
            </div>

            {/* Chart Panel */}
            {showChart && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="px-3 pb-3">
                    <div className="bg-black/40 border border-white/5 rounded-xl overflow-hidden p-1">
                        <StockChart ticker={s.ticker} buyZone={s.buyZone} target={s.target} stopLoss={s.stopLoss} ltp={s.ltp} />
                    </div>
                </motion.div>
            )}

            {/* AI Reasoning */}
            <div className="px-5 pb-3">
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2 bg-transparent text-xs font-bold text-slate-400 hover:text-white transition-colors"
                >
                    <span className="flex items-center gap-2"><Brain size={14} className="text-purple-400" /> Read AI Institutional Logic</span>
                    <motion.div animate={{ rotate: expanded ? 180 : 0 }}><ChevronDown size={14} /></motion.div>
                </button>
                {expanded && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2 text-xs text-slate-300 leading-relaxed bg-black/30 p-4 rounded-xl border border-white/5">
                        {s.aiLogic || 'No detailed reasoning provided by the AI for this setup.'}
                        {s.catalyst && (
                            <div className="mt-3 p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-lg">
                                <span className="text-[0.6rem] text-cyan-400 font-bold uppercase tracking-wider block mb-1">Catalytic Driver</span>
                                {s.catalyst}
                            </div>
                        )}
                    </motion.div>
                )}
            </div>

            {/* Quick Actions Footer */}
            <div className="px-5 py-3 border-t border-white/5 bg-black/20 flex flex-wrap gap-2 justify-between items-center backdrop-blur-md">
                <div className="flex gap-2">
                    <button onClick={handleCopySetup} className="btn-cyber btn-cyber-ghost text-xs py-1.5 px-3">
                        {copied ? <CheckCircle size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        {copied ? 'Copied Buffer' : 'Copy'}
                    </button>
                    <button onClick={() => navigate(`/chat?q=${encodeURIComponent(`Analyse ${s.ticker}`)}`)} className="btn-cyber btn-cyber-ghost text-xs py-1.5 px-3">
                        <MessageSquare size={12} className="text-cyan-400" /> Query AI
                    </button>
                </div>
                <button
                    onClick={() => { toggleWatchlistItem({ ticker: s.ticker, sector: s.sector, signal: s.aiSignal, ltp: s.ltp, target: s.target, stopLoss: s.stopLoss, targetPct: s.targetPct, slPct: s.slPct, riskReward: s.riskReward, confidenceScore: s.confidenceScore, setupType: s.setupType, buyZone: s.buyZone }); setSaved(v => !v) }}
                    className={`btn-cyber ${saved ? 'bg-purple-600/20 border-purple-500/40 text-purple-300' : 'btn-cyber-ghost'} text-xs py-1.5 px-3`}
                >
                    {saved ? <BookmarkCheck size={12} className="text-purple-400" /> : <Bookmark size={12} />}
                    {saved ? 'Tracked' : 'Track'}
                </button>
            </div>
        </motion.div>
    )
}
