import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, LineSeries, CandlestickSeries } from 'lightweight-charts';

interface ChartProps {
    data: {
        time: string;
        open: number;
        high: number;
        low: number;
        close: number;
    }[];
    ema50Data?: { time: string; value: number }[];
    dma200Data?: { time: string; value: number }[];
    buyZone?: { time: string; value: number }[];
}

export default function TradingChart({ data, ema50Data, dma200Data, buyZone }: ChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Remove existing chart to prevent duplicates on strict mode
        chartContainerRef.current.innerHTML = '';

        // Initialize Chart
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#d1d5db', // Tailwind gray-300
            },
            grid: {
                vertLines: { color: '#2d2d35' },
                horzLines: { color: '#2d2d35' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 450,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
            },
        });

        chartRef.current = chart;

        // Add Candlestick Series
        const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#10b981', // emerald-500
            downColor: '#ef4444', // red-500
            borderVisible: false,
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
        });

        if (data && data.length > 0) {
            candlestickSeries.setData(data);
        }

        candlestickSeriesRef.current = candlestickSeries;

        // Add 50 EMA Line
        if (ema50Data && ema50Data.length > 0) {
            const ema50Series = chart.addSeries(LineSeries, {
                color: '#3b82f6', // blue-500
                lineWidth: 2,
                title: '50 EMA',
            });
            ema50Series.setData(ema50Data);
        }

        // Add 200 DMA Line
        if (dma200Data && dma200Data.length > 0) {
            const dma200Series = chart.addSeries(LineSeries, {
                color: '#f59e0b', // amber-500
                lineWidth: 2,
                title: '200 DMA',
            });
            dma200Series.setData(dma200Data);
        }

        // Add Buy Zone markers or lines if provided
        if (buyZone && buyZone.length > 0) {
            const buyZoneSeries = chart.addSeries(LineSeries, {
                color: '#8b5cf6', // violet-500
                lineWidth: 2,
                lineStyle: 2, // Dashed line
                title: 'Buy Zone Limit',
            });
            buyZoneSeries.setData(buyZone);
        }

        // Handle Resize
        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                });
            }
        };

        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
            }
        };
    }, [data, ema50Data, dma200Data, buyZone]);

    return <div ref={chartContainerRef} className="w-full h-full" />;
}
