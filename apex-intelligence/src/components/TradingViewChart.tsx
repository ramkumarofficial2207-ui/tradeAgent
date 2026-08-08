import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts'
import { apiJson } from '../lib/api'

interface TradingViewChartProps {
  ticker: string;
  defaultInterval?: '1d' | '15m' | '5m';
}

export default function TradingViewChart({ ticker, defaultInterval = '1d' }: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [interval, setInterval] = useState<'1d' | '15m' | '5m'>(defaultInterval)
  const [loading, setLoading] = useState<boolean>(true)
  const [chartError, setChartError] = useState<string>('')
  const [lastRsi, setLastRsi] = useState<number | null>(null)

  useEffect(() => {
    if (!chartContainerRef.current || !ticker) return

    setLoading(true)
    setChartError('')

    let chart: any = null

    apiJson<any>(`/api/chart/${ticker.toUpperCase()}?interval=${interval}&days=180`)
      .then(res => {
        if (!res.success || !res.data?.candles || res.data.candles.length === 0) {
          setChartError(`No candlestick data available for ${ticker}`)
          return
        }

        const rawCandles = res.data.candles

        // Clear previous container content
        if (chartContainerRef.current) {
          chartContainerRef.current.innerHTML = ''
        }

        // Initialize Lightweight Chart instance
        chart = createChart(chartContainerRef.current!, {
          width: chartContainerRef.current!.clientWidth,
          height: 380,
          layout: {
            background: { type: ColorType.Solid, color: 'transparent' },
            textColor: '#9CA3AF',
          },
          grid: {
            vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
            horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
          },
          crosshair: {
            mode: 1, // Normal crosshair
          },
          rightPriceScale: {
            borderColor: 'rgba(255, 255, 255, 0.08)',
          },
          timeScale: {
            borderColor: 'rgba(255, 255, 255, 0.08)',
            timeVisible: interval !== '1d',
          },
        })

        // Add Candlestick Series
        const candlestickSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#10B981',
          downColor: '#EF4444',
          borderVisible: false,
          wickUpColor: '#10B981',
          wickDownColor: '#EF4444',
        })

        // Format Candles Data for Lightweight Charts
        const formattedCandles = rawCandles.map((c: any) => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))

        candlestickSeries.setData(formattedCandles)

        // Add 20 EMA Line Overlay
        const sma20Series = chart.addSeries(LineSeries, {
          color: '#06B6D4',
          lineWidth: 1,
          title: '20 EMA',
        })
        const sma20Data = rawCandles
          .filter((c: any) => c.sma20 !== null)
          .map((c: any) => ({ time: c.time, value: c.sma20 }))
        sma20Series.setData(sma20Data)

        // Add 50 EMA Line Overlay
        const sma50Series = chart.addSeries(LineSeries, {
          color: '#818CF8',
          lineWidth: 1,
          title: '50 EMA',
        })
        const sma50Data = rawCandles
          .filter((c: any) => c.sma50 !== null)
          .map((c: any) => ({ time: c.time, value: c.sma50 }))
        sma50Series.setData(sma50Data)

        // Add Volume Histogram Series at lower pane
        const volumeSeries = chart.addSeries(HistogramSeries, {
          color: '#26a69a',
          priceFormat: { type: 'volume' },
          priceScaleId: '', // Separate scale overlay
        })

        volumeSeries.priceScale().applyOptions({
          scaleMargins: {
            top: 0.8, // Position volume at lower 20% of chart
            bottom: 0,
          },
        })

        const volumeData = rawCandles.map((c: any) => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)',
        }))
        volumeSeries.setData(volumeData)

        // Capture last RSI value
        const lastCandle = rawCandles[rawCandles.length - 1]
        if (lastCandle?.rsi) setLastRsi(Math.round(lastCandle.rsi * 10) / 10)

        // Handle Responsive Resize
        const handleResize = () => {
          if (chart && chartContainerRef.current) {
            chart.applyOptions({ width: chartContainerRef.current.clientWidth })
          }
        }
        window.addEventListener('resize', handleResize)

        return () => {
          window.removeEventListener('resize', handleResize)
        }
      })
      .catch(err => setChartError(err.message))
      .finally(() => setLoading(false))

    return () => {
      if (chart) {
        chart.remove()
      }
    }
  }, [ticker, interval])

  return (
    <div style={{
      background: 'rgba(10, 15, 25, 0.7)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 16, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12
    }}>
      {/* Chart Top Controls & Legends */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 800, fontFamily: 'monospace', color: '#F3F4F6' }}>
            📈 {ticker} Interactive Chart
          </span>

          {/* Indicators Legend */}
          <div style={{ display: 'flex', gap: 12, fontSize: '0.7rem' }}>
            <span style={{ color: '#06B6D4', fontWeight: 700 }}>● 20 EMA</span>
            <span style={{ color: '#818CF8', fontWeight: 700 }}>● 50 EMA</span>
            {lastRsi !== null && (
              <span style={{ color: '#10B981', fontWeight: 700 }}>RSI (14): {lastRsi}</span>
            )}
          </div>
        </div>

        {/* Timeframe Selector Pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['1d', '15m', '5m'] as const).map(tf => (
            <button
              key={tf}
              onClick={() => setInterval(tf)}
              style={{
                background: interval === tf ? '#6366F1' : 'rgba(255, 255, 255, 0.05)',
                color: interval === tf ? '#FFF' : '#9CA3AF',
                border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 6,
                padding: '4px 10px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas Box */}
      <div style={{ position: 'relative', width: '100%', minHeight: 380 }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(10,13,20,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '0.82rem'
          }}>
            ⚡ Loading Live Lightweight Candlestick Chart for {ticker}...
          </div>
        )}

        {chartError ? (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(10,13,20,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444', fontSize: '0.82rem'
          }}>
            {chartError}
          </div>
        ) : null}

        <div ref={chartContainerRef} style={{ width: '100%', height: 380 }} />
      </div>
    </div>
  )
}


