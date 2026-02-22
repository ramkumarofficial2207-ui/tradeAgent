// =====================================================
// backtester.ts — Historical Strategy Backtesting Engine
// Replays the SwingEdge scanner strategy on 12 months
// of NSE historical data to measure real performance
// =====================================================

import { fetchHistoricalData } from './dataService';
import { Candle } from './types';

// ─── Types ───────────────────────────────────────────
export interface BacktestConfig {
    tickers: string[];          // List of NSE tickers to test
    startDate: string;          // 'YYYY-MM-DD'
    endDate: string;            // 'YYYY-MM-DD'
    targetPct: number;          // e.g. 5 (%)
    stopLossPct: number;        // e.g. 3.5 (%)
    maxHoldingDays: number;     // e.g. 20 trading days
    minRSI: number;             // e.g. 35
    maxRSI: number;             // e.g. 75
    minVolumeRatio: number;     // e.g. 1.1
}

export interface BacktestTrade {
    ticker: string;
    entryDate: string;
    entryPrice: number;
    exitDate: string;
    exitPrice: number;
    exitReason: 'TARGET' | 'STOP_LOSS' | 'TIMEOUT';
    pnlPct: number;
    holdingDays: number;
    signalDate: string;
}

export interface BacktestStats {
    totalTrades: number;
    wins: number;
    losses: number;
    timeouts: number;
    winRate: number;
    avgReturn: number;
    avgWin: number;
    avgLoss: number;
    riskRewardRatio: number;
    totalReturn: number;
    maxDrawdown: number;
    bestTrade: BacktestTrade | null;
    worstTrade: BacktestTrade | null;
    profitFactor: number;
    sharpeRatio: number;
}

export interface BacktestResult {
    trades: BacktestTrade[];
    stats: BacktestStats;
    equityCurve: { date: string; equity: number; drawdown: number }[];
    byTicker: { ticker: string; trades: number; wins: number; winRate: number; avgReturn: number }[];
    byMonth: { month: string; trades: number; wins: number; return: number }[];
    config: BacktestConfig;
    duration: number; // ms
}

// ─── Indicator Helpers ────────────────────────────────

function calcSMA(closes: number[], period: number, idx: number): number | null {
    if (idx < period - 1) return null;
    const slice = closes.slice(idx - period + 1, idx + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
}

function calcEMA(closes: number[], period: number, idx: number): number | null {
    if (idx < period - 1) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i <= idx; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
}

function calcRSI(closes: number[], period: number, idx: number): number | null {
    if (idx < period) return null;
    let gains = 0, losses = 0;
    for (let i = idx - period + 1; i <= idx; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

function calcVolumeRatio(volumes: number[], idx: number, period = 20): number | null {
    if (idx < period) return null;
    const avgVol = volumes.slice(idx - period, idx).reduce((a, b) => a + b, 0) / period;
    return avgVol > 0 ? volumes[idx] / avgVol : null;
}

// ─── Scanner Signal Check ─────────────────────────────
// Returns true if stock passes ALL scanner filters on a given candle index

function passesFilters(
    candles: Candle[],
    idx: number,
    config: BacktestConfig
): boolean {
    if (idx < 210) return false; // Need enough history

    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    const dma200 = calcSMA(closes, 200, idx);
    const ema50 = calcEMA(closes, 50, idx);
    const rsi = calcRSI(closes, 14, idx);
    const volRatio = calcVolumeRatio(volumes, idx);

    if (!dma200 || !ema50 || rsi === null || !volRatio) return false;

    const price = closes[idx];

    return (
        price > dma200 &&                          // Above 200 DMA
        price > ema50 &&                           // Above 50 EMA
        rsi >= config.minRSI &&                    // RSI not oversold
        rsi <= config.maxRSI &&                    // RSI not overbought
        volRatio >= config.minVolumeRatio          // Volume surge
    );
}

// ─── Simulate a Single Trade ──────────────────────────

function simulateTrade(
    candles: Candle[],
    signalIdx: number,
    ticker: string,
    config: BacktestConfig
): BacktestTrade | null {
    const entryIdx = signalIdx + 1;
    if (entryIdx >= candles.length) return null;

    const entryPrice = candles[entryIdx].open || candles[entryIdx].close;
    const targetPrice = entryPrice * (1 + config.targetPct / 100);
    const stopPrice = entryPrice * (1 - config.stopLossPct / 100);

    let exitIdx = entryIdx;
    let exitPrice = entryPrice;
    let exitReason: 'TARGET' | 'STOP_LOSS' | 'TIMEOUT' = 'TIMEOUT';

    for (let i = entryIdx + 1; i < candles.length && i <= entryIdx + config.maxHoldingDays; i++) {
        const { high, low, close } = candles[i];

        // Check stop-loss first (conservative)
        if (low <= stopPrice) {
            exitIdx = i;
            exitPrice = stopPrice;
            exitReason = 'STOP_LOSS';
            break;
        }

        // Check target
        if (high >= targetPrice) {
            exitIdx = i;
            exitPrice = targetPrice;
            exitReason = 'TARGET';
            break;
        }

        // End of holding period
        if (i === entryIdx + config.maxHoldingDays) {
            exitIdx = i;
            exitPrice = close;
            exitReason = 'TIMEOUT';
        }
    }

    const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;

    return {
        ticker,
        signalDate: candles[signalIdx].date,
        entryDate: candles[entryIdx].date,
        entryPrice: +entryPrice.toFixed(2),
        exitDate: candles[exitIdx].date,
        exitPrice: +exitPrice.toFixed(2),
        exitReason,
        pnlPct: +pnlPct.toFixed(2),
        holdingDays: exitIdx - entryIdx,
    };
}

// ─── Core Backtest Runner ─────────────────────────────

export async function runBacktest(
    config: BacktestConfig,
    onProgress?: (done: number, total: number, ticker: string) => void
): Promise<BacktestResult> {
    const startMs = Date.now();
    const allTrades: BacktestTrade[] = [];

    const startTs = new Date(config.startDate).getTime() / 1000;
    const endTs = new Date(config.endDate).getTime() / 1000;

    // We need 210 extra trading days of history before startDate for indicators
    // ~1 year before start = roughly 365 days extra
    const extendedStartTs = startTs - 365 * 24 * 3600;

    for (let i = 0; i < config.tickers.length; i++) {
        const ticker = config.tickers[i];
        onProgress?.(i, config.tickers.length, ticker);

        try {
            // Fetch full history needed (extra history + test range)
            const yahooSymbol = ticker.includes('.NS') ? ticker : `${ticker}.NS`;

            // Use raw axios since fetchHistoricalData doesn't expose period1/period2
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
                `?period1=${Math.floor(extendedStartTs)}&period2=${Math.floor(endTs)}&interval=1d`;

            const resp = await (await import('axios')).default.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 20000,
            });

            const result = resp.data?.chart?.result?.[0];
            if (!result) continue;

            const timestamps: number[] = result.timestamp || [];
            const quote = result.indicators?.quote?.[0] || {};
            const opens: number[] = quote.open || [];
            const highs: number[] = quote.high || [];
            const lows: number[] = quote.low || [];
            const closes: number[] = quote.close || [];
            const volumes: number[] = quote.volume || [];

            if (closes.length < 220) continue;

            // Build candle array
            const candles: Candle[] = timestamps.map((ts, idx) => ({
                date: new Date(ts * 1000).toISOString().slice(0, 10),
                open: opens[idx] || closes[idx],
                high: highs[idx] || closes[idx],
                low: lows[idx] || closes[idx],
                close: closes[idx],
                volume: volumes[idx] || 0,
            })).filter(c => c.close && c.close > 0);

            // Find the index where our test range starts
            const testStartIdx = candles.findIndex(c => c.date >= config.startDate);
            if (testStartIdx < 210) continue;

            // Track last trade exit to avoid overlapping trades on same ticker
            let lastExitIdx = -1;

            // Scan each day in the test range for signals
            for (let idx = testStartIdx; idx < candles.length - 1; idx++) {
                if (candles[idx].date > config.endDate) break;
                if (idx <= lastExitIdx) continue; // Skip if still in a trade

                if (passesFilters(candles, idx, config)) {
                    const trade = simulateTrade(candles, idx, ticker, config);
                    if (trade) {
                        allTrades.push(trade);
                        // Find exit index to avoid overlapping
                        const exitCandleIdx = candles.findIndex(c => c.date >= trade.exitDate);
                        if (exitCandleIdx > 0) lastExitIdx = exitCandleIdx;
                    }
                }
            }
        } catch (_err) {
            // Skip failed tickers silently
        }
    }

    onProgress?.(config.tickers.length, config.tickers.length, 'done');

    // Sort trades by entry date
    allTrades.sort((a, b) => a.entryDate.localeCompare(b.entryDate));

    // ─── Compute Statistics ───────────────────────────────
    const stats = computeStats(allTrades);
    const equityCurve = buildEquityCurve(allTrades);
    const byTicker = buildByTicker(allTrades);
    const byMonth = buildByMonth(allTrades);

    return {
        trades: allTrades,
        stats,
        equityCurve,
        byTicker,
        byMonth,
        config,
        duration: Date.now() - startMs,
    };
}

// ─── Stats Builder ────────────────────────────────────

function computeStats(trades: BacktestTrade[]): BacktestStats {
    if (trades.length === 0) {
        return {
            totalTrades: 0, wins: 0, losses: 0, timeouts: 0,
            winRate: 0, avgReturn: 0, avgWin: 0, avgLoss: 0,
            riskRewardRatio: 0, totalReturn: 0, maxDrawdown: 0,
            bestTrade: null, worstTrade: null, profitFactor: 0, sharpeRatio: 0,
        };
    }

    const wins = trades.filter(t => t.pnlPct > 0);
    const losses = trades.filter(t => t.pnlPct < 0);
    const timeouts = trades.filter(t => t.exitReason === 'TIMEOUT');

    const avgReturn = trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length;
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;

    const totalGains = wins.reduce((s, t) => s + t.pnlPct, 0);
    const totalLosses = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0));
    const profitFactor = totalLosses > 0 ? totalGains / totalLosses : totalGains > 0 ? 999 : 0;

    // Compound total return (starting with 100 units)
    let equity = 100;
    for (const t of trades) {
        equity = equity * (1 + t.pnlPct / 100);
    }
    const totalReturn = equity - 100;

    // Max drawdown from equity curve
    const curve = buildEquityCurve(trades);
    const maxDrawdown = Math.min(...curve.map(p => p.drawdown));

    // Sharpe-like ratio (avg return / std dev of returns)
    const mean = avgReturn;
    const variance = trades.reduce((s, t) => s + Math.pow(t.pnlPct - mean, 2), 0) / trades.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;

    const sorted = [...trades].sort((a, b) => b.pnlPct - a.pnlPct);

    return {
        totalTrades: trades.length,
        wins: wins.length,
        losses: losses.length,
        timeouts: timeouts.length,
        winRate: +(wins.length / trades.length * 100).toFixed(1),
        avgReturn: +avgReturn.toFixed(2),
        avgWin: +avgWin.toFixed(2),
        avgLoss: +avgLoss.toFixed(2),
        riskRewardRatio: avgLoss !== 0 ? +(Math.abs(avgWin / avgLoss)).toFixed(2) : 0,
        totalReturn: +totalReturn.toFixed(2),
        maxDrawdown: +maxDrawdown.toFixed(2),
        bestTrade: sorted[0] || null,
        worstTrade: sorted[sorted.length - 1] || null,
        profitFactor: +profitFactor.toFixed(2),
        sharpeRatio: +sharpeRatio.toFixed(2),
    };
}

function buildEquityCurve(trades: BacktestTrade[]): { date: string; equity: number; drawdown: number }[] {
    let equity = 100;
    let peak = 100;
    const curve: { date: string; equity: number; drawdown: number }[] = [
        { date: trades[0]?.entryDate || '', equity: 100, drawdown: 0 }
    ];

    for (const t of trades) {
        equity = equity * (1 + t.pnlPct / 100);
        if (equity > peak) peak = equity;
        const drawdown = ((equity - peak) / peak) * 100;
        curve.push({ date: t.exitDate, equity: +equity.toFixed(2), drawdown: +drawdown.toFixed(2) });
    }
    return curve;
}

function buildByTicker(trades: BacktestTrade[]) {
    const map = new Map<string, BacktestTrade[]>();
    for (const t of trades) {
        if (!map.has(t.ticker)) map.set(t.ticker, []);
        map.get(t.ticker)!.push(t);
    }
    return Array.from(map.entries()).map(([ticker, ts]) => ({
        ticker,
        trades: ts.length,
        wins: ts.filter(t => t.pnlPct > 0).length,
        winRate: +(ts.filter(t => t.pnlPct > 0).length / ts.length * 100).toFixed(1),
        avgReturn: +(ts.reduce((s, t) => s + t.pnlPct, 0) / ts.length).toFixed(2),
    })).sort((a, b) => b.avgReturn - a.avgReturn);
}

function buildByMonth(trades: BacktestTrade[]) {
    const map = new Map<string, BacktestTrade[]>();
    for (const t of trades) {
        const month = t.entryDate.slice(0, 7); // 'YYYY-MM'
        if (!map.has(month)) map.set(month, []);
        map.get(month)!.push(t);
    }
    return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, ts]) => ({
            month,
            trades: ts.length,
            wins: ts.filter(t => t.pnlPct > 0).length,
            return: +(ts.reduce((s, t) => s + t.pnlPct, 0) / ts.length).toFixed(2),
        }));
}
