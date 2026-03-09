/* ─── StockChart.tsx — Professional candlestick chart with indicators ─── */
import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import axios from 'axios'
import { TrendingUp, TrendingDown, BarChart3, Activity, Loader2 } from 'lucide-react'

interface ChartCandle {
    time: string
    open: number; high: number; low: number; close: number
    volume: number
    sma20: number | null; sma50: number | null; sma200: number | null
    ema20: number | null; rsi: number | null; volSma20: number | null
}

interface StockChartProps {
    ticker: string
    buyZone: number
    target: number
    stopLoss: number
    ltp: number
}

const INDICATOR_COLORS = {
    sma20: '#fbbf24',
    sma50: '#3b82f6',
    sma200: '#f87171',
    ema20: '#8b5cf6',
}

export default function StockChart({ ticker, buyZone, target, stopLoss, ltp }: StockChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set(['sma20', 'sma200']))
    const [lastCandle, setLastCandle] = useState<ChartCandle | null>(null)
    const [crosshairData, setCrosshairData] = useState<any>(null)

    const toggleIndicator = (key: string) => {
        setActiveIndicators(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key); else next.add(key)
            return next
        })
    }

    useEffect(() => {
        if (!chartContainerRef.current) return

        let cancelled = false
        const container = chartContainerRef.current

        const fetchAndRender = async () => {
            try {
                setLoading(true); setError(null)
                const { data: resp } = await axios.get(`/api/chart/${ticker}?days=180`)

                if (!resp.success || cancelled) return
                const candles: ChartCandle[] = resp.data.candles

                if (candles.length < 5) { setError('Insufficient data'); return }

                // Set last candle for crosshair default display
                setLastCandle(candles[candles.length - 1])

                // Clear old chart
                if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

                const chart = createChart(container, {
                    width: container.clientWidth,
                    height: 320,
                    layout: {
                        background: { type: ColorType.Solid, color: 'transparent' },
                        textColor: '#94a3b8',
                        fontSize: 10,
                        fontFamily: "'JetBrains Mono', monospace",
                    },
                    grid: {
                        vertLines: { color: 'rgba(148,163,184,0.06)' },
                        horzLines: { color: 'rgba(148,163,184,0.06)' },
                    },
                    crosshair: {
                        mode: CrosshairMode.Normal,
                        vertLine: { color: 'rgba(148,163,184,0.2)', width: 1, style: 2, labelBackgroundColor: '#334155' },
                        horzLine: { color: 'rgba(148,163,184,0.2)', width: 1, style: 2, labelBackgroundColor: '#334155' },
                    },
                    rightPriceScale: {
                        borderColor: 'rgba(148,163,184,0.1)',
                        scaleMargins: { top: 0.05, bottom: 0.25 },
                    },
                    timeScale: {
                        borderColor: 'rgba(148,163,184,0.1)',
                        timeVisible: false,
                    },
                    handleScroll: { vertTouchDrag: false },
                })
                chartRef.current = chart

                // Candlestick series
                const candleSeries = chart.addSeries(CandlestickSeries, {
                    upColor: '#22c55e', downColor: '#ef4444',
                    borderUpColor: '#22c55e', borderDownColor: '#ef4444',
                    wickUpColor: '#22c55e88', wickDownColor: '#ef444488',
                })
                candleSeries.setData(candles.map(c => ({
                    time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
                })))

                // Volume histogram
                const volumeSeries = chart.addSeries(HistogramSeries, {
                    priceFormat: { type: 'volume' },
                    priceScaleId: 'volume',
                })
                chart.priceScale('volume').applyOptions({
                    scaleMargins: { top: 0.82, bottom: 0 },
                })
                volumeSeries.setData(candles.map(c => ({
                    time: c.time,
                    value: c.volume,
                    color: c.close >= c.open ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
                })))

                // Indicator overlay lines
                const indicatorSeries: Record<string, ISeriesApi<'Line'>> = {}
                const overlayDefs = [
                    { key: 'sma20', color: INDICATOR_COLORS.sma20, field: 'sma20' as keyof ChartCandle },
                    { key: 'sma50', color: INDICATOR_COLORS.sma50, field: 'sma50' as keyof ChartCandle },
                    { key: 'sma200', color: INDICATOR_COLORS.sma200, field: 'sma200' as keyof ChartCandle },
                    { key: 'ema20', color: INDICATOR_COLORS.ema20, field: 'ema20' as keyof ChartCandle },
                ]

                overlayDefs.forEach(({ key, color, field }) => {
                    const series = chart.addSeries(LineSeries, {
                        color: activeIndicators.has(key) ? color : 'transparent',
                        lineWidth: 1,
                        priceLineVisible: false,
                        lastValueVisible: false,
                        crosshairMarkerVisible: false,
                    })
                    const lineData = candles.filter(c => c[field] !== null).map(c => ({
                        time: c.time,
                        value: c[field] as number,
                    }))
                    series.setData(lineData)
                    indicatorSeries[key] = series
                })

                // Price level markers — Buy Zone, Target, Stop Loss
                const markers = [
                    { price: target, color: '#22c55e', title: `T: ₹${target.toLocaleString('en-IN')}`, lineWidth: 1 as const, lineStyle: 2 },
                    { price: buyZone, color: '#3b82f6', title: `Buy: ₹${buyZone.toLocaleString('en-IN')}`, lineWidth: 1 as const, lineStyle: 2 },
                    { price: stopLoss, color: '#ef4444', title: `SL: ₹${stopLoss.toLocaleString('en-IN')}`, lineWidth: 1 as const, lineStyle: 2 },
                ]
                markers.forEach(m => {
                    candleSeries.createPriceLine({
                        price: m.price,
                        color: m.color,
                        lineWidth: m.lineWidth,
                        lineStyle: m.lineStyle,
                        axisLabelVisible: true,
                        title: m.title,
                    })
                })

                // Crosshair move handler
                chart.subscribeCrosshairMove((param) => {
                    if (!param.time || !param.seriesData) {
                        setCrosshairData(null)
                        return
                    }
                    const candleData = param.seriesData.get(candleSeries) as any
                    if (candleData) {
                        const matchingCandle = candles.find(c => c.time === param.time)
                        setCrosshairData({
                            ...candleData,
                            volume: matchingCandle?.volume,
                            rsi: matchingCandle?.rsi,
                            sma20: matchingCandle?.sma20,
                            sma200: matchingCandle?.sma200,
                        })
                    }
                })

                // Responsive resize
                const resizeObserver = new ResizeObserver(entries => {
                    const { width } = entries[0].contentRect
                    chart.applyOptions({ width })
                })
                resizeObserver.observe(container)

                // Fit content
                chart.timeScale().fitContent()

                setLoading(false)

                return () => {
                    cancelled = true
                    resizeObserver.disconnect()
                    chart.remove()
                }
            } catch (err: any) {
                if (!cancelled) { setError(err.message || 'Failed to load chart'); setLoading(false) }
            }
        }

        fetchAndRender()

        return () => { cancelled = true; if (chartRef.current) { chartRef.current.remove(); chartRef.current = null } }
    }, [ticker, activeIndicators, buyZone, target, stopLoss])

    // Display candle = crosshair or last candle
    const displayCandle = crosshairData || lastCandle
    const priceChange = displayCandle ? (displayCandle.close - displayCandle.open) : 0
    const priceChangePct = displayCandle && displayCandle.open ? (priceChange / displayCandle.open * 100) : 0

    return (
        <div style={{
            background: 'var(--bg-elevated)', borderRadius: 12,
            border: '1px solid var(--border)', overflow: 'hidden',
        }}>
            {/* Chart header bar */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderBottom: '1px solid var(--border)',
                flexWrap: 'wrap', gap: 6,
            }}>
                {/* OHLCV data */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {displayCandle && (
                        <>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                O <span style={{ color: 'var(--text-primary)' }}>{displayCandle.open?.toFixed(2)}</span>
                            </span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                H <span style={{ color: '#22c55e' }}>{displayCandle.high?.toFixed(2)}</span>
                            </span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                L <span style={{ color: '#ef4444' }}>{displayCandle.low?.toFixed(2)}</span>
                            </span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                C <span style={{ color: priceChange >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{displayCandle.close?.toFixed(2)}</span>
                            </span>
                            <span style={{
                                fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700,
                                color: priceChange >= 0 ? '#22c55e' : '#ef4444',
                                display: 'flex', alignItems: 'center', gap: 2,
                            }}>
                                {priceChange >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                                {priceChangePct >= 0 ? '+' : ''}{priceChangePct.toFixed(2)}%
                            </span>
                            {displayCandle.rsi && (
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: displayCandle.rsi > 70 ? '#ef4444' : displayCandle.rsi < 30 ? '#22c55e' : '#fbbf24' }}>
                                    RSI {displayCandle.rsi.toFixed(0)}
                                </span>
                            )}
                        </>
                    )}
                </div>

                {/* Indicator toggles */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[
                        { key: 'sma20', label: 'SMA20', color: INDICATOR_COLORS.sma20 },
                        { key: 'sma50', label: 'SMA50', color: INDICATOR_COLORS.sma50 },
                        { key: 'sma200', label: 'DMA200', color: INDICATOR_COLORS.sma200 },
                        { key: 'ema20', label: 'EMA20', color: INDICATOR_COLORS.ema20 },
                    ].map(ind => (
                        <button
                            key={ind.key}
                            onClick={() => toggleIndicator(ind.key)}
                            style={{
                                padding: '2px 7px', borderRadius: 5, fontSize: '0.54rem', fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                                background: activeIndicators.has(ind.key) ? `${ind.color}20` : 'transparent',
                                color: activeIndicators.has(ind.key) ? ind.color : 'var(--text-muted)',
                                border: `1px solid ${activeIndicators.has(ind.key) ? `${ind.color}40` : 'var(--border)'}`,
                                cursor: 'pointer', transition: 'all 0.15s',
                            }}
                        >
                            {ind.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart body */}
            <div ref={chartContainerRef} style={{ position: 'relative', minHeight: 320 }}>
                {loading && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--bg-elevated)', zIndex: 10,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(59,130,246,0.2)', borderTop: '2px solid var(--blue)', animation: 'spin 0.8s linear infinite' }} />
                            Loading chart...
                        </div>
                    </div>
                )}
                {error && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--bg-elevated)', zIndex: 10, color: 'var(--text-muted)', fontSize: '0.78rem',
                    }}>
                        {error}
                    </div>
                )}
            </div>

            {/* Level legend */}
            <div style={{
                display: 'flex', gap: 12, padding: '5px 12px', borderTop: '1px solid var(--border)',
                fontSize: '0.56rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
            }}>
                <span><span style={{ color: '#3b82f6' }}>━</span> Buy Zone</span>
                <span><span style={{ color: '#22c55e' }}>━</span> Target</span>
                <span><span style={{ color: '#ef4444' }}>━</span> Stop Loss</span>
            </div>
        </div>
    )
}
