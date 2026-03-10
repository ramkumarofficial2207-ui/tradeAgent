import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Zap, SlidersHorizontal, Cpu, CheckCircle2, Clock, Bookmark,
    TrendingUp, BarChart3, Target, Activity, ShieldCheck, History,
    Terminal, RadioReceiver, Brain
} from 'lucide-react'
import { useWatchlist } from '../lib/useWatchlist'
import { useAgentSSE } from '../lib/useAgentSSE'
import AIActionCard from '../components/AIActionCard'
import MarketDashboardWidget from '../components/MarketDashboardWidget'
import { AITrackRecordCard } from '../components/AITrackRecordCard'
import { EquityCurveChart } from '../components/EquityCurveChart'

/* ─── Types ───────────────────────────────────────────────── */
interface MarketStatus {
    safeToTrade: boolean
    warning: string
    niftyChange: number
    vixChange: number
    killSwitch: boolean
    regime?: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF'
    regimeLabel?: string
    regimeDetail?: string
    regimeColor?: string
    positionSizeMult?: number
    nifty50dma?: number
    nifty200dma?: number
    dmaCrossPct?: number
}
interface TradeSetup {
    ticker: string
    sector: string
    setupType: string
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
    volatilityHitProb: number
    momentumRank: number
    trendStatus: string
    volumeSpike: string
    entryTrigger: string
    catalyst: string
    pcr?: number
    institutionalDemand?: number
    derivativeStatus?: string
    aiSignal?: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT'
    aiLogic?: string
    headlines?: string[]
}

const FALLBACK_SECTORS = [
    { n: 'IT', v: 0 }, { n: 'Bank', v: 0 }, { n: 'Pharma', v: 0 },
    { n: 'Auto', v: 0 }, { n: 'Metal', v: 0 }, { n: 'FMCG', v: 0 },
    { n: 'Energy', v: 0 }, { n: 'Realty', v: 0 }, { n: 'Infra', v: 0 },
]

/* ─── Regime Banner (Glassmorphic) ───────────── */
function RegimeBanner({ market }: { market: MarketStatus | null }) {
    if (!market?.regime) return null
    const { regime, regimeColor, regimeLabel, regimeDetail, positionSizeMult, nifty50dma, nifty200dma, dmaCrossPct } = market
    const isBull = regime === 'BULLISH'
    const isNeut = regime === 'NEUTRAL'
    const bgClass = isBull ? 'bg-emerald-500/10 border-emerald-500/20' : isNeut ? 'bg-amber-500/10 border-amber-500/20' : 'bg-rose-500/10 border-rose-500/20'
    const textClass = isBull ? 'text-emerald-400' : isNeut ? 'text-amber-400' : 'text-rose-400'
    const sizeLabel = positionSizeMult === 1 ? '100% Core' : positionSizeMult === 0.5 ? '50% Half' : '0% Cash'

    return (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className={`glass-panel rounded-2xl p-4 flex flex-wrap items-center gap-4 border ${bgClass} shadow-lg mb-2 relative overflow-hidden`}
        >
            {/* Pulsing background glow */}
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] pointer-events-none" style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)' }} />

            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-black/40 border border-white/5`}>
                    <Activity className={textClass} size={20} />
                </div>
                <div>
                    <div className={`font-display text-sm font-black uppercase tracking-wider ${textClass} drop-shadow-md`}>
                        {regimeLabel || regime} REGIME
                    </div>
                    <div className="text-[0.65rem] text-slate-400 mt-0.5 max-w-[300px]">{regimeDetail}</div>
                </div>
            </div>

            <div className="flex gap-6 ml-auto relative z-10 bg-black/30 p-2.5 rounded-xl border border-white/5 backdrop-blur-md hidden sm:flex">
                <div className="text-center">
                    <div className="text-[0.55rem] text-slate-500 uppercase font-bold tracking-widest mb-1">Exposure</div>
                    <div className={`font-mono font-bold text-xs ${textClass}`}>{sizeLabel}</div>
                </div>
                {nifty50dma != null && nifty200dma != null && (
                    <>
                        <div className="w-px bg-white/10" />
                        <div className="text-center">
                            <div className="text-[0.55rem] text-slate-500 uppercase font-bold tracking-widest mb-1">50v200 DMA</div>
                            <div className={`font-mono font-bold text-xs ${(dmaCrossPct ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {(dmaCrossPct ?? 0) > 0 ? '+' : ''}{(dmaCrossPct ?? 0).toFixed(2)}%
                            </div>
                        </div>
                    </>
                )}
            </div>
        </motion.div>
    )
}

/* ─── Right Panel (Watchlist / Sectors) ──── */
function RightPanel({ navigate, sectors, sectorTime, watchlist }: { navigate: (p: string) => void; sectors: { n: string; v: number }[]; sectorTime: string | null; watchlist: any[] }) {
    const buyCount = watchlist.filter(w => w.signal === 'BUY' || w.signal === 'LIGHT BUY').length

    return (
        <aside className="w-[320px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto no-scrollbar hidden xl:flex">
            {/* Live Market + Sectors Widget (wrapped slightly) */}
            <div className="glass-panel p-2 rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-10"><RadioReceiver size={40} /></div>
                <MarketDashboardWidget sectors={sectors} sectorTime={sectorTime} />
            </div>

            <div className="flex justify-between items-center px-1">
                <div>
                    <div className="font-display text-sm font-black tracking-wide text-white">COMMAND CENTER</div>
                    <div className="text-[0.6rem] text-cyan-400/70 font-mono mt-1 tracking-widest uppercase">
                        {watchlist.length === 0 ? 'STATUS: IDLE' : `${buyCount} ACTIVE TARGETS`}
                    </div>
                </div>
                <button onClick={() => navigate('/watchlist')} className="btn-cyber btn-cyber-ghost text-[0.65rem] py-1 px-2.5">
                    Terminal
                </button>
            </div>

            {/* Watchlist stocks */}
            {watchlist.length === 0 ? (
                <div className="glass-card p-6 text-center">
                    <Terminal size={24} className="mx-auto mb-3 text-slate-500/50" />
                    <div className="text-[0.7rem] text-slate-500">Awaiting target selection...</div>
                </div>
            ) : watchlist.slice(0, 10).map((w, i) => {
                const isBuy = w.signal === 'BUY' || w.signal === 'LIGHT BUY'
                const isReject = w.signal === 'REJECT'
                const color = isBuy ? 'text-emerald-400' : isReject ? 'text-rose-400' : 'text-amber-400'
                const border = isBuy ? 'border-emerald-500/20 bg-emerald-500/5' : isReject ? 'border-rose-500/20 bg-rose-500/5' : 'border-amber-500/20 bg-amber-500/5'

                return (
                    <motion.div
                        key={w.ticker}
                        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        className={`p-3 rounded-xl border ${border} backdrop-blur-md relative overflow-hidden hover:bg-white/5 transition-colors cursor-pointer`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div className="font-display text-[0.8rem] font-bold text-white">{w.ticker}</div>
                            {w.signal && (
                                <span className={`text-[0.55rem] font-bold ${color} uppercase tracking-wider bg-black/40 px-1.5 py-0.5 rounded`}>
                                    {w.signal}
                                </span>
                            )}
                        </div>
                        <div className="flex justify-between text-[0.65rem] text-slate-400 font-mono">
                            <span>&#8377;{w.ltp?.toLocaleString('en-IN') ?? '—'}</span>
                            {w.targetPct != null && <span className="text-emerald-400 font-bold">+{w.targetPct}% TGT</span>}
                        </div>
                    </motion.div>
                )
            })}
        </aside>
    )
}

/* ─── MAIN Dashboard ──────────────────────────────────────── */
export default function DashboardPage() {
    const [setups, setSetups] = useState<TradeSetup[]>([])
    const [market, setMarket] = useState<MarketStatus | null>(null)
    const [scanning, setScanning] = useState(false)
    const [filter, setFilter] = useState('All')
    const [scanAge, setScanAge] = useState<string | null>(null)
    const [marketBrief, setMarketBrief] = useState<string | null>(null)
    const [sectors, setSectors] = useState<{ n: string; v: number }[]>(FALLBACK_SECTORS)
    const [sectorTime, setSectorTime] = useState<string | null>(null)
    const [showTracker, setShowTracker] = useState(false)
    const [perfData, setPerfData] = useState<{ stats: any, history: any[] } | null>(null)
    const navigate = useNavigate()
    const pulseRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const { status } = useAgentSSE()
    const { items: watchlist } = useWatchlist()

    // Status polling
    useEffect(() => {
        axios.get('/api/last').then(({ data }) => {
            if (!data.success) return
            if (data.data?.setups?.length) { setSetups(data.data.setups); setScanAge(data.data.scannedAt) }
            if (data.data?.marketStatus) setMarket(data.data.marketStatus)
            if (data.data?.marketBrief?.brief) setMarketBrief(data.data.marketBrief.brief)
        }).catch(() => { })

        axios.get('/api/sectors').then(({ data }) => {
            if (data.success && data.data?.sectors) {
                setSectors(data.data.sectors)
                setSectorTime(data.data.fetchedAt)
            }
        }).catch(() => { })
    }, [])

    useEffect(() => {
        if (showTracker && !perfData) {
            axios.get('/api/performance').then(({ data }) => {
                if (data.success) setPerfData(data.data)
            }).catch(() => { })
        }
    }, [showTracker, perfData])

    useEffect(() => {
        const handler = () => { if (!scanning) runScan() }
        window.addEventListener('trigger-scan', handler)
        return () => window.removeEventListener('trigger-scan', handler)
    })

    const runScan = useCallback(async () => {
        setScanning(true)
        try {
            const { data } = await axios.get('/api/scan?force=true', { timeout: 200000 })
            if (data.success) {
                const scanData = data.data ?? data
                setSetups(scanData.setups || [])
                setMarket(scanData.marketStatus || null)
                setScanAge(scanData.timestamp || scanData.scannedAt)
                if (scanData.marketBrief?.brief) setMarketBrief(scanData.marketBrief.brief)
            }
        } catch (e) { console.error('Scan error', e) }
        finally { setScanning(false) }
    }, [])

    const filtered = setups.filter(s => {
        if (filter === 'All') return true
        if (filter === 'BUY') return s.aiSignal === 'BUY' || s.aiSignal === 'LIGHT BUY'
        if (filter === 'WATCH') return s.aiSignal === 'WATCH'
        if (filter === 'SmallCap') return (s.marketCapCr ?? 99999) < 5000
        if (filter === 'VCP') return s.setupType.includes('VCP')
        if (filter === 'Breakout') return s.setupType.includes('Break')
        if (filter === 'Pullback') return s.setupType.includes('Pull')
        return true
    })

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-[calc(100vh-64px)] flex flex-col pt-4">

            {/* AI Market Brief Banner */}
            {marketBrief && (
                <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mx-4 mb-4 lg:mx-8">
                    <div className="glass-panel border-cyan-500/20 bg-cyan-950/10 rounded-xl p-3 flex items-start gap-4">
                        <div className="bg-cyan-500/20 border border-cyan-500/40 p-1.5 rounded-lg flex-shrink-0 animate-pulse">
                            <Brain size={14} className="text-cyan-400" />
                        </div>
                        <p className="text-[0.75rem] text-slate-300 leading-relaxed font-mono">
                            <strong className="text-cyan-400">SYS_BRIEF:</strong> {marketBrief}
                        </p>
                    </div>
                </motion.div>
            )}

            <div className="flex-1 flex gap-6 px-4 lg:px-8 pb-8 max-w-[1600px] mx-auto w-full">

                {/* MAIN CENTER */}
                <main className="flex-1 min-w-0 flex flex-col gap-4">
                    <RegimeBanner market={market} />

                    {/* AI COMMAND CENTER HEADER */}
                    <div className="glass-panel rounded-2xl p-4 relative overflow-hidden flex flex-wrap justify-between items-center gap-4">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-[80px] pointer-events-none" />

                        <div className="flex items-center gap-4 z-10">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-950 to-blue-950 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                                <Cpu size={24} className="text-cyan-400" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="font-display text-xl font-bold tracking-tight text-white mb-1">Algorithmic Terminal</h1>
                                    <span className={`px-2 py-0.5 rounded bg-black/30 border text-[0.55rem] font-bold uppercase tracking-widest flex items-center gap-1.5
                                        ${scanning ? 'border-purple-500/50 text-purple-400 shadow-[0_0_10px_rgba(139,92,246,0.3)]' : 'border-cyan-500/50 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${scanning ? 'bg-purple-400 animate-ping' : 'bg-cyan-400 animate-pulse'}`} />
                                        {scanning ? 'SCANNING' : status?.state === 'IDLE' ? 'ACTIVE' : 'IDLE'}
                                    </span>
                                </div>
                                <div className="text-[0.65rem] text-slate-400 uppercase tracking-widest font-mono">
                                    NSE1000 • Quant Metrics • AI Analysis
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 z-10 ml-auto">
                            {setups.length > 0 && scanAge && (
                                <div className="text-right hidden sm:block mr-2">
                                    <div className="text-[0.55rem] text-slate-500 uppercase tracking-widest font-bold mb-1">Last Sweep</div>
                                    <div className="text-xs font-mono text-cyan-400">{new Date(scanAge).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                                </div>
                            )}
                            <button onClick={runScan} disabled={scanning} className="btn-cyber btn-cyber-primary text-sm px-6 py-2.5">
                                {scanning ? (
                                    <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Processing...</>
                                ) : (
                                    <><Zap size={16} className={scanning ? '' : 'text-cyan-100'} /> Execute Scan</>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Filter and Mode Toggle */}
                    <div className="flex justify-between items-center flex-wrap gap-4 mt-2">
                        {setups.length > 0 && !showTracker ? (
                            <div className="flex gap-2 items-center flex-wrap">
                                {[
                                    { key: 'All', label: 'All Setups' },
                                    { key: 'BUY', label: 'BUY' },
                                    { key: 'WATCH', label: 'WATCH' },
                                    { key: 'VCP', label: 'Volatility Contraction' },
                                ].map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => setFilter(f.key)}
                                        className={`px-3 py-1.5 rounded-lg text-[0.65rem] font-bold uppercase tracking-wider transition-all duration-200 border 
                                            ${filter === f.key ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]' : 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5 hover:text-white'}`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        ) : <div />}

                        <button
                            onClick={() => setShowTracker(!showTracker)}
                            className={`btn-cyber text-[0.65rem] uppercase tracking-widest py-1.5 px-3 rounded-lg border transition-all ${showTracker ? 'bg-purple-600/20 border-purple-500/50 text-purple-300 shadow-[0_0_10px_rgba(139,92,246,0.3)]' : 'bg-black/20 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'}`}
                        >
                            <History size={12} /> Live P&L Visualizer
                        </button>
                    </div>

                    {/* ─── P&L TRACK RECORD ─── */}
                    <AnimatePresence mode="wait">
                        {showTracker && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-4">
                                <EquityCurveChart history={perfData?.history || []} />
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
                                    {perfData?.history.map((h: any) => (
                                        <AITrackRecordCard key={h.id} trade={h} />
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ─── PREMIUM EMPTY STATE ─── */}
                    {!showTracker && setups.length === 0 && !scanning && (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center rounded-2xl glass-panel relative overflow-hidden min-h-[50vh]">
                            <div className="absolute inset-0 bg-[url('https://camo.githubusercontent.com/9dcad634026da78784fcabf19bb8bebc80cba00d4ef460012e1ec73e6dd33ea0/68747470733a2f2f7777772e7472616e73706172656e7474657874757265732e636f6d2f7061747465726e732f63756265732e706e67')] opacity-[0.03] pointer-events-none" />

                            <div className="relative w-32 h-32 mb-8">
                                <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 rounded-full blur-[40px] animate-pulse" />
                                <div className="absolute inset-0 rounded-full border border-white/10 flex items-center justify-center bg-black/40 backdrop-blur-md">
                                    <Target size={40} className="text-cyan-400/80" />
                                </div>
                                {/* Orbiting rings */}
                                <div className="absolute inset-[-20%] border border-cyan-500/20 rounded-full animate-[spin_10s_linear_infinite]" />
                                <div className="absolute inset-[-40%] border border-purple-500/10 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
                            </div>

                            <h2 className="font-display text-2xl font-black text-white mb-3 tracking-wide">SYSTEM INITIALIZED</h2>
                            <p className="text-slate-400 text-sm max-w-md mx-auto mb-8 font-mono leading-relaxed">
                                Ready to execute multi-variate quantitative scan across NSE1000.
                                Engaged parameters: <span className="text-cyan-400">ATR Limits</span>, <span className="text-purple-400">Options Flow</span>, <span className="text-emerald-400">Volume Dynamics</span>.
                            </p>

                            <button onClick={runScan} className="btn-cyber btn-cyber-primary px-8 py-3 text-sm tracking-wider uppercase">
                                <Zap size={16} /> Ignite Engine
                            </button>
                        </div>
                    )}

                    {/* ─── SCANNING STATE ─── */}
                    {scanning && (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center rounded-2xl glass-panel relative overflow-hidden min-h-[50vh]">
                            <div className="w-full max-w-md">
                                <div className="flex justify-between text-[0.6rem] font-mono text-cyan-400 mb-2 font-bold tracking-widest uppercase">
                                    <span>Processing Universe</span>
                                    <span className="animate-pulse">Loading Matrices...</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5 relative">
                                    <motion.div
                                        className="h-full bg-cyan-500"
                                        initial={{ width: "0%" }}
                                        animate={{ width: "100%" }}
                                        transition={{ duration: 15, ease: "linear" }}
                                    />
                                </div>
                                <div className="font-mono text-[0.55rem] text-slate-500 mt-4 text-left space-y-1">
                                    <p className="animate-pulse">&gt; Disconnecting human bias...</p>
                                    <p className="animate-pulse" style={{ animationDelay: '1s' }}>&gt; Fetching NSE F&O Options Bhavcopy...</p>
                                    <p className="animate-pulse" style={{ animationDelay: '2s' }}>&gt; Calculating Volume Dry-Up and VCP thresholds...</p>
                                    <p className="animate-pulse" style={{ animationDelay: '3s' }}>&gt; Handing off to LLM Logic Engine...</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Cards Grid */}
                    <AnimatePresence>
                        {!showTracker && !scanning && filtered.length > 0 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {filtered.map((s, i) => <AIActionCard key={s.ticker} s={s} delay={Math.min(i * 0.05, 0.4)} />)}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* No matches */}
                    {!showTracker && !scanning && setups.length > 0 && filtered.length === 0 && (
                        <div className="glass-panel text-center p-8 rounded-2xl border-white/5 opacity-70">
                            <SlidersHorizontal size={24} className="mx-auto text-slate-500 mb-3" />
                            <p className="text-sm font-mono text-slate-400 mb-4">No targets match filter param: {filter}</p>
                            <button onClick={() => setFilter('All')} className="btn-cyber btn-cyber-ghost text-xs py-1.5 px-4">Reset Matrix</button>
                        </div>
                    )}
                </main>

                <RightPanel navigate={navigate} sectors={sectors} sectorTime={sectorTime} watchlist={watchlist} />
            </div>
        </motion.div>
    )
}
