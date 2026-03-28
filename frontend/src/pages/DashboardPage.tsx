import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import {
    Zap, SlidersHorizontal, Cpu, CheckCircle2, Clock, Bookmark,
    TrendingUp, BarChart3, Target, Activity, ShieldCheck, History
} from 'lucide-react'
import { getWatchlist } from '../lib/watchlist'
import { useWatchlist } from '../lib/useWatchlist'
import { useAgentSSE } from '../lib/useAgentSSE'
import AIActionCard from '../components/AIActionCard'
import AgentWorkflowVisualizer from '../components/AgentWorkflowVisualizer'
import MarketDashboardWidget from '../components/MarketDashboardWidget'
import { AITrackRecordCard } from '../components/AITrackRecordCard'
import { EquityCurveChart } from '../components/EquityCurveChart'
import EconomicCalendarWidget from '../components/EconomicCalendarWidget'
import FiiDiiWidget from '../components/FiiDiiWidget'
import { useViewport } from '../lib/useViewport'

/* ΓöÇΓöÇΓöÇ Types ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
interface MarketStatus {
    safeToTrade: boolean
    warning: string
    niftyChange: number
    vixChange: number
    killSwitch: boolean
    niftyMidcapChange?: number
    sensexChange?: number
    goldChange?: number
    regime?: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF'
    regimeLabel?: string
    regimeDetail?: string
    regimeColor?: string
    positionSizeMult?: number
    nifty50dma?: number
    nifty200dma?: number
    dmaCrossPct?: number
    institutionalBias?: 'RISK_ON' | 'RISK_OFF' | 'MIXED'
    institutionalScore?: number
    institutionalNet1dCr?: number
    institutionalNet5dCr?: number
    institutionalNet20dCr?: number
    institutionalLastTradingDate?: string
    institutionalDetail?: string
}
interface IndexData {
    price: number
    change: number
    high52: number
    low52: number
    pct52: number
}
interface MarketPulse {
    indices: Record<string, IndexData>
    vixRisk: string
    vixLabel: { text: string; color: string; detail: string }
    isMarketOpen: boolean
    fetchedAt: string
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
}


/* ΓöÇΓöÇΓöÇ Helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

/* ΓöÇΓöÇΓöÇ Regime Banner (prominent, always visible) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function RegimeBanner({ market }: { market: MarketStatus | null }) {
    if (!market?.regime) return null
    const {
        regime,
        regimeColor,
        regimeLabel,
        regimeDetail,
        positionSizeMult,
        nifty50dma,
        nifty200dma,
        dmaCrossPct,
        institutionalBias,
        institutionalNet5dCr,
        institutionalDetail,
    } = market
    const c = regimeColor || (regime === 'BULLISH' ? '#34d399' : regime === 'NEUTRAL' ? '#fbbf24' : '#f87171')
    const icon = regime === 'BULLISH' ? '\u2705' : regime === 'NEUTRAL' ? '\u26A0\uFE0F' : '\u26D4'
    const sizeLabel = positionSizeMult === 1
        ? 'Full size'
        : positionSizeMult === 0.75
            ? 'Reduced size'
            : positionSizeMult === 0.5
                ? 'Half size'
                : 'No new longs'

    return (
        <div style={{
            background: `rgba(${regime === 'BULLISH' ? '16,185,129' : regime === 'NEUTRAL' ? '251,191,36' : '239,68,68'}, 0.06)`,
            border: `1px solid ${c}44`,
            borderRadius: 12,
            padding: '11px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 4,
            flexWrap: 'wrap',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1rem' }}>{icon}</span>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.88rem', fontWeight: 900, color: c }}>
                        {regimeLabel || regime} Regime
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>
                        {regimeDetail}
                    </div>
                    {institutionalDetail && (
                        <div style={{ fontSize: '0.58rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                            Institutional flow: {institutionalDetail}
                        </div>
                    )}
                </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)', marginBottom: 1 }}>Position Size</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.78rem', color: c }}>{sizeLabel}</div>
                </div>
                {nifty50dma != null && nifty200dma != null && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)', marginBottom: 1 }}>50DMA vs 200DMA</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.78rem', color: (dmaCrossPct ?? 0) > 0 ? '#34d399' : '#f87171' }}>
                            {(dmaCrossPct ?? 0) > 0 ? '+' : ''}{(dmaCrossPct ?? 0).toFixed(2)}%
                        </div>
                    </div>
                )}
                {institutionalBias && institutionalNet5dCr != null && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)', marginBottom: 1 }}>Inst. 5D Flow</div>
                        <div style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            color: institutionalBias === 'RISK_ON' ? '#34d399' : institutionalBias === 'RISK_OFF' ? '#f87171' : '#fbbf24',
                        }}>
                            {institutionalNet5dCr >= 0 ? '+' : ''}{institutionalNet5dCr.toFixed(0)} Cr
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

/* ΓöÇΓöÇΓöÇ Mini sparkline ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function Sparkline({ up }: { up: boolean }) {
    const pts = up
        ? '0,28 18,22 36,24 54,14 72,17 90,9 108,11 126,4'
        : '0,5 18,9 36,7 54,17 72,14 90,21 108,19 126,27'
    const c = up ? '#10b981' : '#ef4444'
    return (
        <svg viewBox="0 0 126 32" style={{ width: '100%', height: 44 }} preserveAspectRatio="none">
            <defs>
                <linearGradient id={`sg${up ? 'u' : 'd'}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={c} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={`0,32 ${pts} 126,32`} fill={`url(#sg${up ? 'u' : 'd'})`} />
            <polyline points={pts} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

/* ΓöÇΓöÇΓöÇ F&O Expiry helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function getNextThursday(afterDate = new Date()): Date {
    const d = new Date(afterDate)
    const day = d.getDay()
    const daysToThursday = (4 - day + 7) % 7
    d.setDate(d.getDate() + (daysToThursday === 0 ? 7 : daysToThursday))
    d.setHours(15, 30, 0, 0)
    return d
}
function getLastThursdayOfMonth(year: number, month: number): Date {
    const last = new Date(year, month + 1, 0)
    const day = last.getDay()
    const daysBack = (day - 4 + 7) % 7
    const d = new Date(year, month, last.getDate() - daysBack)
    d.setHours(15, 30, 0, 0)
    return d
}
function getMonthlyExpiry(): Date {
    const now = new Date()
    const curr = getLastThursdayOfMonth(now.getFullYear(), now.getMonth())
    if (curr > now) return curr
    const next = now.getMonth() === 11
        ? getLastThursdayOfMonth(now.getFullYear() + 1, 0)
        : getLastThursdayOfMonth(now.getFullYear(), now.getMonth() + 1)
    return next
}
function daysUntil(target: Date): number {
    return Math.max(0, Math.ceil((target.getTime() - Date.now()) / 86400000))
}
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* ΓöÇΓöÇΓöÇ Sector heatmap data ΓÇö fetched LIVE from /api/sectors ΓöÇΓöÇΓöÇΓöÇ */
const FALLBACK_SECTORS = [
    { n: 'IT', v: 0 }, { n: 'Bank', v: 0 }, { n: 'Pharma', v: 0 },
    { n: 'Auto', v: 0 }, { n: 'Metal', v: 0 }, { n: 'FMCG', v: 0 },
    { n: 'Energy', v: 0 }, { n: 'Realty', v: 0 }, { n: 'Infra', v: 0 },
]

/* LeftSidebar removed ΓÇö sectors moved to right panel, F&O removed, risk advisory in RegimeBanner */


/* ΓöÇΓöÇΓöÇ Right Panel ΓÇö Market + Sectors + Watchlist ΓöÇΓöÇΓöÇΓöÇ */
function RightPanel({
    navigate,
    sectors,
    sectorTime,
    watchlist,
    mobile = false,
}: {
    navigate: (p: string) => void
    sectors: { n: string; v: number }[]
    sectorTime: string | null
    watchlist: any[]
    mobile?: boolean
}) {
    const buyCount = watchlist.filter(w => w.signal === 'BUY' || w.signal === 'LIGHT BUY').length
    const watchCount = watchlist.filter(w => w.signal === 'WATCH').length
    const containerStyle: React.CSSProperties = mobile
        ? { width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }
        : { width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', scrollbarWidth: 'none' }

    return (
        <aside className={mobile ? undefined : 'hide-xl'} style={containerStyle}>

            {/* Live Market + Sectors Widget */}
            <MarketDashboardWidget sectors={sectors} sectorTime={sectorTime} />

            {/* Economic Calendar & FII/DII Widgets */}
            <div style={{ padding: mobile ? 0 : '0 4px', display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4, marginBottom: 8 }}>
                <EconomicCalendarWidget />
                <FiiDiiWidget />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6 }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.88rem', fontWeight: 800 }}>My Watchlist</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {watchlist.length === 0 ? 'No stocks saved yet' : `${buyCount} BUY \u00B7 ${watchCount} WATCH`}
                    </div>
                </div>
                <button onClick={() => navigate('/watchlist')} className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '0.7rem', gap: 4 }}>
                    View All
                </button>
            </div>

            {/* Watchlist stocks */}
            {watchlist.length === 0 ? (
                <div className="card" style={{ padding: '20px 14px', textAlign: 'center' }}>
                    <Bookmark size={20} style={{ margin: '0 auto 8px', color: 'var(--text-muted)' }} />
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        Save stocks from scanner results to track them here
                    </div>
                </div>
            ) : watchlist.map(w => {
                const isBuy = w.signal === 'BUY' || w.signal === 'LIGHT BUY'
                const isReject = w.signal === 'REJECT'
                const sigColor = isBuy ? '#34d399' : isReject ? '#f87171' : '#fcd34d'
                const sigBg = isBuy ? 'rgba(16,185,129,0.08)' : isReject ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)'
                return (
                    <div key={w.ticker} style={{
                        background: 'var(--bg-card)', border: `1px solid ${sigColor}22`,
                        borderRadius: 12, padding: '11px 13px',
                        transition: 'all 0.2s',
                        marginBottom: mobile ? 10 : 0,
                    }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.transform = 'none'}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 900 }}>{w.ticker}</div>
                            {w.signal && (
                                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: sigColor, background: sigBg, padding: '2px 7px', borderRadius: 5 }}>
                                    {w.signal}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>&#8377;{w.ltp?.toLocaleString('en-IN') ?? '—'}</span>
                            {w.targetPct != null && (
                                <span style={{ color: '#34d399', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>Tgt +{w.targetPct}%</span>
                            )}
                        </div>
                        {w.confidenceScore != null && (
                            <div style={{ marginTop: 7 }}>
                                <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${w.confidenceScore * 10}%`, background: sigColor, borderRadius: 99 }} />
                                </div>
                                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 3 }}>Conf {w.confidenceScore}/10</div>
                            </div>
                        )}
                    </div>
                )
            })}

        </aside>
    )
}

/* ΓöÇΓöÇΓöÇ Filter Bar ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
const FILTER_OPTIONS = [
    { key: 'All', label: 'All Setups' },
    { key: 'BUY', label: '\u26A1 BUY/LIGHT' },
    { key: 'WATCH', label: '\uD83D\uDC40 WATCH' },
    { key: 'SmallCap', label: 'Small Cap' },
    { key: 'VCP', label: 'VCP' },
    { key: 'Breakout', label: 'Breakout' },
    { key: 'Pullback', label: 'Pullback' },
]

/* ΓöÇΓöÇΓöÇ MAIN Dashboard ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
export default function DashboardPage() {
    const [setups, setSetups] = useState<TradeSetup[]>([])
    const [market, setMarket] = useState<MarketStatus | null>(null)
    const [pulse, setPulse] = useState<MarketPulse | null>(null)
    const [scanning, setScanning] = useState(false)
    const [scanMode, setScanMode] = useState<'swing' | 'intraday'>('swing')
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
    const { isMobile, isPhone } = useViewport()

    // Load live market pulse on mount + refresh every 5 min
    useEffect(() => {
        const fetchPulse = () => {
            axios.get('/api/market-pulse').then(({ data }) => {
                if (data.success) setPulse(data.data)
            }).catch(() => { })
        }
        fetchPulse()
        pulseRef.current = setInterval(fetchPulse, 5 * 60 * 1000)
        return () => { if (pulseRef.current) clearInterval(pulseRef.current) }
    }, [])

    // Load last scan on mount
    useEffect(() => {
        axios.get(`/api/last?mode=${scanMode}`).then(({ data }) => {
            if (!data.success) return
            if (data.data?.setups?.length) { setSetups(data.data.setups); setScanAge(data.data.timestamp || data.data.scannedAt) }
            if (data.data?.marketStatus) setMarket(data.data.marketStatus)
            if (data.data?.marketBrief?.brief) setMarketBrief(data.data.marketBrief.brief)
        }).catch(() => { })
    }, [scanMode])

    // Fetch live sector data
    useEffect(() => {
        axios.get('/api/sectors').then(({ data }) => {
            if (data.success && data.data?.sectors) {
                setSectors(data.data.sectors)
                setSectorTime(data.data.fetchedAt)
            }
        }).catch(() => { })
    }, [])

    // Fetch tracker data
    useEffect(() => {
        if (showTracker && !perfData) {
            axios.get('/api/performance').then(({ data }) => {
                if (data.success) {
                    setPerfData(data.data)
                }
            }).catch(() => { })
        }
    }, [showTracker, perfData])

    // Listen for navbar "Run Scanner" trigger
    useEffect(() => {
        const handler = () => { if (!scanning) runScan() }
        window.addEventListener('trigger-scan', handler)
        return () => window.removeEventListener('trigger-scan', handler)
    })

    const [scanError, setScanError] = useState<string | null>(null)
    const runScan = useCallback(async () => {
        setScanning(true)
        setScanError(null)
        try {
            const { data } = await axios.get(`/api/scan?force=true&mode=${scanMode}`, { timeout: 200000 })
            if (data.success) {
                const scanData = data.data ?? data        // server wraps in .data
                setSetups(scanData.setups || [])
                setMarket(scanData.marketStatus || null)
                setScanAge(scanData.timestamp || scanData.scannedAt)
                if (scanData.marketBrief?.brief) setMarketBrief(scanData.marketBrief.brief)
            } else {
                setScanError(data.message || 'Scan failed')
            }
        } catch (e: any) {
            console.error('Scan error', e)
            setScanError(e.response?.data?.message || 'Market scanner is temporarily busy. Please try again soon.')
        }
        finally { setScanning(false) }
    }, [scanMode])

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
        <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>

            {/* AI Market Brief Banner */}
            {marketBrief && (
                <div style={{ background: 'rgba(59,130,246,0.05)', borderBottom: '1px solid rgba(59,130,246,0.12)', padding: '9px 24px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span className="badge badge-vcp" style={{ fontSize: '0.62rem', flexShrink: 0, marginTop: 1 }}>AI Brief</span>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{marketBrief}</p>
                </div>
            )}

            {/* 2-column layout */}
            <div style={{ flex: 1, display: 'flex', gap: isMobile ? 12 : 18, padding: isMobile ? '14px 12px 22px' : '20px 22px 28px', maxWidth: 1480, margin: '0 auto', width: '100%' }}>

                {/* MAIN CENTER */}
                <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* ΓöÇΓöÇ REGIME BANNER ΓöÇΓöÇ always visible ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
                    <RegimeBanner market={market} />

                    {/* ΓöÇΓöÇ AI COMMAND CENTER v2 ΓöÇΓöÇ */}
                    <div className="gradient-border" style={{
                        background: 'linear-gradient(135deg, rgba(34,211,238,0.03), rgba(139,92,246,0.02))',
                        borderRadius: 16, padding: isMobile ? '12px 12px' : '14px 18px',
                        position: 'relative', overflow: 'hidden',
                    }}>
                        {/* Ambient glow */}
                        <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.08), transparent 70%)', pointerEvents: 'none' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, position: 'relative' }}>
                            {/* Left ΓÇö Agent identity + status */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(139,92,246,0.1))',
                                    border: '1px solid rgba(34,211,238,0.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 0 16px rgba(34,211,238,0.12)',
                                    flexShrink: 0,
                                }}>
                                    <Cpu size={17} color="#22d3ee" strokeWidth={2} />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                        <span style={{ fontFamily: 'var(--font-display)', fontSize: isPhone ? '0.9rem' : '1rem', fontWeight: 900, letterSpacing: '-0.02em' }}>StockSage AI</span>
                                        <span style={{
                                            fontSize: '0.52rem', fontWeight: 700,
                                            color: scanning ? '#a78bfa' : '#22d3ee',
                                            background: scanning ? 'rgba(167,139,250,0.12)' : 'rgba(34,211,238,0.1)',
                                            border: `1px solid ${scanning ? 'rgba(167,139,250,0.25)' : 'rgba(34,211,238,0.2)'}`,
                                            padding: '2px 8px', borderRadius: 99,
                                            display: 'flex', alignItems: 'center', gap: 3,
                                        }}>
                                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: scanning ? '#a78bfa' : '#22d3ee', boxShadow: `0 0 6px ${scanning ? '#a78bfa' : '#22d3ee'}`, animation: scanning ? 'pulse 1.2s ease-in-out infinite' : 'none' }} />
                                            {scanning ? 'Scanning...' : status?.state === 'IDLE' ? 'Active' : 'Ready'}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: isPhone ? 'none' : 'block' }}>
                                        {scanMode === 'intraday'
                                            ? 'Liquid NSE leaders · 5m momentum · EMA pullbacks · Volume expansion'
                                            : 'Nifty 1000 Universe · DMA200 · RSI · Volume · Gemini AI'}
                                    </p>
                                </div>
                            </div>

                            {/* Center ΓÇö Scan stats (only when we have results) */}
                            {setups.length > 0 && !isPhone && (
                                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'center' }}>
                                    {[
                                        { label: 'Setups', value: setups.length, color: '#22d3ee', icon: <Target size={10} /> },
                                        { label: 'BUY', value: setups.filter(s => s.aiSignal === 'BUY' || s.aiSignal === 'LIGHT BUY').length, color: '#34d399', icon: <TrendingUp size={10} /> },
                                        { label: 'WATCH', value: setups.filter(s => s.aiSignal === 'WATCH').length, color: '#fbbf24', icon: <Activity size={10} /> },
                                    ].map(stat => (
                                        <div key={stat.label} style={{ textAlign: 'center' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 900, color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                                {stat.icon} {stat.value}
                                            </div>
                                            <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{stat.label}</div>
                                        </div>
                                    ))}
                                    {scanAge && (
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                                <Clock size={10} /> {new Date(scanAge).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Last Scan</div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'stretch' : 'flex-end', gap: 6, width: isMobile ? '100%' : 'auto' }}>
                                <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 999, background: 'rgba(15,23,42,0.5)', border: '1px solid var(--border)' }}>
                                    {[
                                        { key: 'swing', label: 'Swing' },
                                        { key: 'intraday', label: 'Intraday' },
                                    ].map(option => (
                                        <button
                                            key={option.key}
                                            onClick={() => setScanMode(option.key as 'swing' | 'intraday')}
                                            className="btn"
                                            style={{
                                                padding: '5px 10px',
                                                fontSize: '0.68rem',
                                                minWidth: 0,
                                                background: scanMode === option.key ? 'linear-gradient(135deg, #2563eb, #4f46e5)' : 'transparent',
                                                color: scanMode === option.key ? '#fff' : 'var(--text-secondary)',
                                                border: scanMode === option.key ? '1px solid rgba(96,165,250,0.35)' : '1px solid transparent',
                                            }}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                                <button onClick={runScan} disabled={scanning} className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '0.82rem', gap: 6, flexShrink: 0, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
                                    {scanning
                                        ? <><span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} /> Scanning...</>
                                        : <><Zap size={14} /> {scanMode === 'intraday' ? 'Run Intraday' : 'Run Scanner'}</>
                                    }
                                </button>
                                {scanError && (
                                    <div style={{ fontSize: '0.62rem', color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.2)' }}>
                                        ⚠️ {scanError}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Filter bar and Toggle */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                        {setups.length > 0 && !showTracker ? (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                {FILTER_OPTIONS.map(f => (
                                    <button key={f.key} onClick={() => setFilter(f.key)} className={`filter-pill ${filter === f.key ? 'active' : ''}`}>{f.label}</button>
                                ))}
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 4 }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
                            </div>
                        ) : <div />}

                        <button
                            onClick={() => setShowTracker(!showTracker)}
                            className={`btn ${showTracker ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '6px 14px', fontSize: '0.78rem', gap: 6, borderRadius: 20 }}
                        >
                            <History size={14} /> AI Track Record
                        </button>
                    </div>

                    {/* ΓöÇΓöÇΓöÇ TRACK RECORD UI ΓöÇΓöÇΓöÇ */}
                    {isMobile && (
                        <RightPanel
                            mobile
                            navigate={navigate}
                            sectors={sectors}
                            sectorTime={sectorTime}
                            watchlist={watchlist}
                        />
                    )}

                    {showTracker && (
                        <div style={{ animation: 'fade-in 0.3s ease-out' }}>
                            {/* Stats Bar */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20
                            }}>
                                {[
                                    { label: 'Win Rate', val: `${perfData?.stats?.winRate?.toFixed(1) || '0'}%`, color: '#34d399', icon: <ShieldCheck size={16} /> },
                                    { label: 'Avg Profit', val: `+${perfData?.stats?.avgWin?.toFixed(2) || '0'}%`, color: '#60a5fa', icon: <TrendingUp size={16} /> },
                                    { label: 'Avg Loss', val: `${perfData?.stats?.avgLoss?.toFixed(2) || '0'}%`, color: '#f87171', icon: <BarChart3 size={16} /> },
                                    { label: 'Win/Loss', val: `${perfData?.stats?.won || 0} / ${perfData?.stats?.lost || 0}`, color: 'var(--text-primary)', icon: <Target size={16} /> },
                                    { label: 'In Progress', val: `${perfData?.stats?.inProgress || 0}`, color: '#fbbf24', icon: <Activity size={16} /> }
                                ].map((s, i) => (
                                    <div key={i} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ color: s.color }}>{s.icon}</div>
                                        <div>
                                            <div style={{ fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{s.label}</div>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 900, color: s.color, marginTop: 2 }}>{s.val}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Equity Compounding Chart */}
                            <EquityCurveChart history={perfData?.history || []} />

                            {/* History Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
                                {perfData?.history.map((h: any) => (
                                    <AITrackRecordCard key={h.id} trade={h} />
                                ))}
                                {perfData?.history.length === 0 && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '20px' }}>No historic tracking data available yet.</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ΓöÇΓöÇΓöÇ PREMIUM EMPTY STATE ΓöÇΓöÇΓöÇ */}
                    {!showTracker && setups.length === 0 && !scanning && (
                        <div style={{
                            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', padding: isMobile ? '32px 12px' : '60px 24px', textAlign: 'center', gap: isMobile ? 18 : 24,
                        }}>
                            {/* Animated hero orb */}
                            <div style={{ position: 'relative', width: 120, height: 120 }}>
                                {/* Main icon */}
                                <div style={{
                                    width: 100, height: 100, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(124,58,237,0.12))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 0 60px rgba(59,130,246,0.08), 0 0 120px rgba(124,58,237,0.06)',
                                    animation: 'heroFloat 4s ease-in-out infinite',
                                    position: 'absolute', top: 10, left: 10,
                                }}>
                                    <Cpu size={36} style={{ color: 'var(--blue)', opacity: 0.9 }} />
                                </div>
                                {/* Orbiting dots */}
                                {[0, 1, 2].map(i => (
                                    <div key={i} style={{
                                        position: 'absolute', top: '50%', left: '50%',
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: ['#3b82f6', '#8b5cf6', '#10b981'][i],
                                        boxShadow: `0 0 8px ${['#3b82f6', '#8b5cf6', '#10b981'][i]}88`,
                                        animation: `heroOrbit ${4 + i * 0.8}s linear infinite`,
                                        animationDelay: `${i * 1.2}s`,
                                    }} />
                                ))}
                            </div>

                            <div>
                                <div style={{
                                    fontFamily: 'var(--font-display)', fontSize: isMobile ? '1.3rem' : '1.65rem', fontWeight: 900,
                                    marginBottom: 10, letterSpacing: '-0.03em',
                                    background: 'linear-gradient(90deg, #f0f0ff, #93c5fd, #c4b5fd)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                    backgroundClip: 'text',
                                }}>
                                    AI Agent Ready
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: 420, lineHeight: 1.7, margin: '0 auto' }}>
                                    Run a full market scan to analyse <strong style={{ color: 'var(--text-primary)' }}>1000+ NSE stocks</strong> — Large, Mid and Small Cap — with live technical data, volume analysis, and Gemini AI signal generation.
                                </p>
                            </div>

                            <button onClick={runScan} className="btn btn-primary" style={{ padding: isMobile ? '11px 22px' : '13px 36px', fontSize: '0.95rem', gap: 8 }}>
                                <Zap size={16} /> Launch Scanner
                            </button>

                            <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                                {['DMA200 Filter', 'RSI Zone', 'Volume Spike', 'AI Signal'].map(t => (
                                    <span key={t} style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <CheckCircle2 size={9} style={{ color: '#34d399', opacity: 0.6 }} /> {t}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ΓöÇΓöÇΓöÇ SCANNING STATE ΓöÇΓöÇΓöÇ */}
                    {!showTracker && scanning && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '60px 0' }}>
                            <div style={{ position: 'relative', width: 64, height: 64 }}>
                                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid rgba(59,130,246,0.12)', borderTop: '3px solid var(--blue)', animation: 'spin 0.9s linear infinite' }} />
                                <div style={{ position: 'absolute', inset: 9, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.12)', borderBottom: '2px solid var(--purple)', animation: 'spinReverse 1.3s linear infinite' }} />
                                <div style={{ position: 'absolute', inset: 18, borderRadius: '50%', border: '2px solid rgba(16,185,129,0.12)', borderTop: '2px solid var(--green)', animation: 'spin 1.7s linear infinite' }} />
                            </div>
                            <div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, textAlign: 'center', marginBottom: 8 }}>Scanning High-Liquidity Universe</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                                    Fetching live data &nbsp;{'\u00B7'}&nbsp; Computing indicators &nbsp;{'\u00B7'}&nbsp; Gemini AI analysis
                                </div>
                            </div>
                        </div>
                    )}

                    {/* No match state */}
                    {!showTracker && filtered.length === 0 && setups.length > 0 && (
                        <div className="card" style={{ textAlign: 'center', padding: '36px 24px' }}>
                            <SlidersHorizontal size={24} style={{ margin: '0 auto 12px', color: 'var(--text-muted)', opacity: 0.5 }} />
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 10 }}>No setups match the "{filter}" filter.</p>
                            <button onClick={() => setFilter('All')} className="btn btn-ghost" style={{ fontSize: '0.78rem' }}>Show All Setups</button>
                        </div>
                    )}

                    {/* Cards grid */}
                    {!showTracker && filtered.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
                            {filtered.map((s, i) => <AIActionCard key={s.ticker} s={s} delay={Math.min(i * 0.04, 0.5)} />)}
                        </div>
                    )}
                </main>

                {/* RIGHT ΓÇö Market + Sectors + Watchlist */}
                <RightPanel navigate={navigate} sectors={sectors} sectorTime={sectorTime} watchlist={watchlist} />
            </div>
        </div>
    )
}
