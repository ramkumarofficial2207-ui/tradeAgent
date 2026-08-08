import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries, IChartApi } from 'lightweight-charts';
import { Loader2, RefreshCw } from 'lucide-react';
import { apiJson } from '../lib/api';

interface TechnicalChartPanelProps {
  ticker: string;
}

export const TechnicalChartPanel: React.FC<TechnicalChartPanelProps> = ({ ticker }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);

  const [timeframe, setTimeframe] = useState<'1D' | '15M' | '5M'>('1D');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clear previous chart instance if present
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    setLoading(true);
    setError(null);

    // Initialize Lightweight Chart instance
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#080B14' },
        textColor: '#9CA3AF',
        fontSize: 11,
        fontFamily: 'Roboto Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      width: chartContainerRef.current.clientWidth || 700,
      height: 320,
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: timeframe !== '1D',
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      crosshair: {
        vertLine: { color: '#6366F1', width: 1, style: 3 },
        horzLine: { color: '#6366F1', width: 1, style: 3 },
      },
    });

    chartInstanceRef.current = chart;

    // Create Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    // Create 20 EMA Line Overlay (#06B6D4)
    const ema20Series = chart.addSeries(LineSeries, {
      color: '#06B6D4',
      lineWidth: 2,
      priceLineVisible: false,
      title: '20 EMA',
    });

    // Create 50 EMA Line Overlay (#818CF8)
    const ema50Series = chart.addSeries(LineSeries, {
      color: '#818CF8',
      lineWidth: 2,
      priceLineVisible: false,
      title: '50 EMA',
    });

    // Create Volume Histogram (Bottom 20% overlay pane)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Overlay on main price scale
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8, // Volume occupies bottom 20%
        bottom: 0,
      },
    });

    // Fetch Chart Data from API endpoint: GET /api/chart/${ticker}?interval=${timeframe}
    const interval = timeframe.toLowerCase();
    apiJson<any>(`/api/chart/${ticker}?interval=${interval}`)
      .then((response) => {
        const candles = response?.data?.candles;
        if (Array.isArray(candles) && candles.length > 0) {
          candleSeries.setData(candles.map((candle: any) => ({
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          })));
          ema20Series.setData(candles.filter((candle: any) => candle.sma20 != null).map((candle: any) => ({ time: candle.time, value: candle.sma20 })));
          ema50Series.setData(candles.filter((candle: any) => candle.sma50 != null).map((candle: any) => ({ time: candle.time, value: candle.sma50 })));
          volumeSeries.setData(candles.map((candle: any) => ({
            time: candle.time,
            value: candle.volume,
            color: candle.close >= candle.open ? '#10B98166' : '#EF444466',
          })));
          chart.timeScale().fitContent();
        } else {
          setError('No chart data returned for this ticker');
        }
      })
      .catch((err) => {
        console.error('Error fetching lightweight chart data:', err);
        setError('Failed to render chart data');
      })
      .finally(() => {
        setLoading(false);
      });

    // ResizeObserver for responsive chart dimensions
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [ticker, timeframe]);

  return (
    <div className="p-4 rounded-xl bg-[#080B14] border border-white/10 space-y-3">
      {/* Chart Header Bar with Timeframe Toggle & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="font-bold text-white tracking-wider font-sans">{ticker} Technical Chart</span>
          
          {/* EMA Legend */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1 text-[#06B6D4]">
              <span className="w-2.5 h-0.5 bg-[#06B6D4] rounded"></span> 20 EMA
            </span>
            <span className="flex items-center gap-1 text-[#818CF8]">
              <span className="w-2.5 h-0.5 bg-[#818CF8] rounded"></span> 50 EMA
            </span>
            <span className="flex items-center gap-1 text-emerald-400/80">
              <span className="w-2 h-2 bg-emerald-500/40 rounded-sm"></span> Volume
            </span>
          </div>
        </div>

        {/* Timeframe Selector Buttons */}
        <div className="flex items-center bg-[#0D111D] p-1 rounded-lg border border-white/10">
          {(['1D', '15M', '5M'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                timeframe === tf
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="relative w-full h-[320px] rounded-lg overflow-hidden bg-[#080B14]">
        {loading && (
          <div className="absolute inset-0 bg-[#080B14]/80 backdrop-blur-xs flex items-center justify-center z-10 text-cyan-400 gap-2 font-mono text-xs">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Rendering TradingView Lightweight Chart...</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-[#080B14] flex flex-col items-center justify-center z-10 text-gray-400 gap-2 font-mono text-xs">
            <span className="text-red-400">{error}</span>
            <button
              onClick={() => setTimeframe(timeframe)}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-white flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
};


