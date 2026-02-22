// =====================================================
// backtester.ts — Realistic Portfolio Backtesting Engine
// Uses concurrent position model (max N open trades)
// with equal-weight position sizing
// =====================================================

import { Candle } from './types';

// ─── Types ───────────────────────────────────────────
export interface BacktestConfig {
    tickers: string[];
    startDate: string;
    endDate: string;
    targetPct: number;
    stopLossPct: number;
    maxHoldingDays: number;
    minRSI: number;
    maxRSI: number;
    minVolumeRatio: number;
    maxConcurrentTrades: number;
    cooldownDays: number;
    requireVCP: boolean;        // Only take VCP-pattern setups
    requireBreakout: boolean;   // Only buy on 15-day resistance breakout
    startingCapital: number;    // User's actual capital (e.g. 100000)
    aiSignalOnly: boolean;      // Only trade AI BUY signals (simulated via strict technical score)
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
    duration: number;
}

// ─── Indicator Helpers ────────────────────────────────

function calcSMA(closes: number[], period: number, idx: number): number | null {
    if (idx < period - 1) return null;
    return closes.slice(idx - period + 1, idx + 1).reduce((a, b) => a + b, 0) / period;
}

function calcEMA(closes: number[], period: number, idx: number): number | null {
    if (idx < period - 1) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i <= idx; i++) ema = closes[i] * k + ema * (1 - k);
    return ema;
}

function calcRSI(closes: number[], period: number, idx: number): number | null {
    if (idx < period) return null;
    let gains = 0, losses = 0;
    for (let i = idx - period + 1; i <= idx; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) gains += d; else losses += Math.abs(d);
    }
    const avgG = gains / period, avgL = losses / period;
    if (avgL === 0) return 100;
    return 100 - 100 / (1 + avgG / avgL);
}

function calcVolRatio(volumes: number[], idx: number, period = 20): number | null {
    if (idx < period) return null;
    const avg = volumes.slice(idx - period, idx).reduce((a, b) => a + b, 0) / period;
    return avg > 0 ? volumes[idx] / avg : null;
}

// ─── VCP Helpers for backtester use ─────────────────
function detectVCPInline(candles: Candle[], idx: number): { isVCP: boolean; quality: number } {
    if (idx < 240) return { isVCP: false, quality: 0 };
    const lookback = 60;
    const slice = candles.slice(idx - lookback, idx + 1);
    const highs = slice.map(c => c.high);
    const lows = slice.map(c => c.low);
    const closes = slice.map(c => c.close);
    const volumes = slice.map(c => c.volume);
    const currentClose = closes[closes.length - 1];
    const currentVol = volumes[volumes.length - 1];
    const peakHigh = Math.max(...highs);
    const peakIdx = highs.indexOf(peakHigh);
    if (peakIdx > lookback * 0.65 || (lookback - peakIdx) < 10) return { isVCP: false, quality: 0 };
    const pctFromPivot = (peakHigh - currentClose) / peakHigh * 100;
    if (pctFromPivot > 5) return { isVCP: false, quality: 0 };
    const postPeak = slice.slice(peakIdx);
    const ppH = postPeak.map(c => c.high);
    const ppL = postPeak.map(c => c.low);
    const ppV = postPeak.map(c => c.volume);
    const n = postPeak.length;
    if (n < 9) return { isVCP: false, quality: 0 };
    const t = Math.floor(n / 3);
    const s1r = (Math.max(...ppH.slice(0, t)) - Math.min(...ppL.slice(0, t))) / currentClose * 100;
    const s2r = (Math.max(...ppH.slice(t, t * 2)) - Math.min(...ppL.slice(t, t * 2))) / currentClose * 100;
    const s3r = (Math.max(...ppH.slice(t * 2)) - Math.min(...ppL.slice(t * 2))) / currentClose * 100;
    const contractions = (s2r < s1r * 0.8 ? 1 : 0) + (s3r < s2r * 0.8 ? 1 : 0);
    const avgBaseVol = ppV.slice(t * 2, -1).reduce((a, b) => a + b, 0) / Math.max(1, ppV.slice(t * 2, -1).length);
    const avgEarlyVol = ppV.slice(0, t).reduce((a, b) => a + b, 0) / Math.max(1, t);
    const volDryUp = avgBaseVol < avgEarlyVol * 0.75;
    const breakoutVol = currentVol > avgBaseVol * 1.4;
    let quality = 0;
    if (contractions >= 1) quality += 3;
    if (contractions >= 2) quality += 2;
    if (s3r < 7) quality += 2;
    if (s3r < 4) quality += 1;
    if (volDryUp) quality += 1;
    if (breakoutVol) quality += 1;
    if (pctFromPivot < 2) quality += 1;
    return { isVCP: quality >= 5 && contractions >= 1 && s3r < 12, quality };
}

// ─── Breakout Filter ──────────────────────────────────
function isBreakoutDay(candles: Candle[], idx: number, lookback = 15): boolean {
    if (idx < lookback + 1) return false;
    // Resistance = highest CLOSE of the last N days (excluding today)
    const resistance = Math.max(...candles.slice(idx - lookback, idx).map(c => c.close));
    const today = candles[idx];
    // Breakout: today's close > resistance AND close > open (green candle)
    return today.close > resistance && today.close > today.open;
}

// ─── Core Signal Check ───────────────────────────────
function passesFilters(candles: Candle[], idx: number, cfg: BacktestConfig): boolean {
    if (idx < 215) return false;
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const highs = candles.map(c => c.high);

    const dma200 = calcSMA(closes, 200, idx);
    const dma200_20ago = calcSMA(closes, 200, idx - 20);
    const ema50 = calcEMA(closes, 50, idx);
    const ema20 = calcEMA(closes, 20, idx);
    const rsi = calcRSI(closes, 14, idx);

    if (!dma200 || !dma200_20ago || !ema50 || !ema20 || rsi === null) return false;

    const price = closes[idx];

    // ── GATE 1: Primary uptrend filters (always required) ──
    if (price <= dma200) return false;          // Must be above 200 DMA
    if (price <= ema50) return false;           // Must be above 50 EMA
    if (ema20 <= ema50) return false;           // Short-term EMAs bullishly aligned
    if ((dma200 ?? 0) <= (dma200_20ago ?? 0)) return false; // 200 DMA must be rising
    if (rsi < 38 || rsi > 78) return false;    // RSI within acceptable range

    // ── GATE 2: Entry method ─────────────────────────────
    if (cfg.requireBreakout) {
        // MODE A: 15-day resistance breakout
        if (!isBreakoutDay(candles, idx, 15)) return false;
        const volRatio = calcVolRatio(volumes, idx);
        if (!volRatio || volRatio < cfg.minVolumeRatio) return false;
    } else {
        // MODE B: EMA Bounce (default — matches real scanner useBounceEntry)
        // Price should be pulling back to the 20 EMA support zone
        const distFromEMA20 = Math.abs(price - ema20) / ema20 * 100;
        if (distFromEMA20 > 4) return false;           // Price must be within 4% of 20 EMA
        if (price < ema20 * 0.99) return false;        // Not too far below
        const prev = closes[idx - 1];
        if (price <= prev) return false;               // Must bounce up on signal day
        // Volume should be normal/low (quiet pullback is healthy)
        const volRatio = calcVolRatio(volumes, idx);
        if (!volRatio || volRatio > 3.0) return false; // Avoid panic spikes
        if (rsi > 65) return false;                    // RSI pulled back (not extended)
        if (rsi < 38) return false;                    // Not deeply oversold
    }

    // ── GATE 3: VCP Pattern (optional) ───────────────────
    if (cfg.requireVCP) {
        const vcp = detectVCPInline(candles, idx);
        if (!vcp.isVCP) return false;
    }

    // ── GATE 4: AI BUY Signal Simulation ─────────────────
    // When enabled, only take trades matching what Gemini would rate as BUY
    // BUY criteria: RSI in momentum zone + strong relative volume + RS vs Nifty
    if (cfg.aiSignalOnly) {
        // RSI must be in momentum sweet spot (55-72) — not pullback, not overbought
        if (rsi < 55 || rsi > 72) return false;

        // Volume must be strong spike (2x+ average) — institutional involvement
        const volRatio = calcVolRatio(volumes, idx);
        if (!volRatio || volRatio < 2.0) return false;

        // Stock must be near 52-week high (within 8%) — real momentum stock
        const high52w = Math.max(...highs.slice(Math.max(0, idx - 252), idx + 1));
        const pctFrom52wHigh = (high52w - price) / high52w * 100;
        if (pctFrom52wHigh > 8) return false;

        // Stock must be outperforming NIfty over last 3 months
        // Proxy: price must be at least 3% above its 60-day low (relative strength)
        const low60d = Math.min(...closes.slice(Math.max(0, idx - 60), idx + 1));
        const returnFrom60dLow = (price - low60d) / low60d * 100;
        if (returnFrom60dLow < 3) return false;
    }

    return true;
}

// ─── Simulate a Single Trade ──────────────────────────

function simulateTrade(candles: Candle[], signalIdx: number, ticker: string, cfg: BacktestConfig): BacktestTrade | null {
    const entryIdx = signalIdx + 1;
    if (entryIdx >= candles.length) return null;

    const entryPrice = candles[entryIdx].open || candles[entryIdx].close;
    const targetPrice = entryPrice * (1 + cfg.targetPct / 100);
    const stopPrice = entryPrice * (1 - cfg.stopLossPct / 100);

    let exitIdx = Math.min(entryIdx + cfg.maxHoldingDays, candles.length - 1);
    let exitPrice = candles[exitIdx].close;
    let exitReason: 'TARGET' | 'STOP_LOSS' | 'TIMEOUT' = 'TIMEOUT';

    for (let i = entryIdx + 1; i < candles.length && i <= entryIdx + cfg.maxHoldingDays; i++) {
        const { high, low, close } = candles[i];

        // Check stop-loss FIRST (conservative — assume worst intraday)
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

        if (i === entryIdx + cfg.maxHoldingDays) {
            exitIdx = i;
            exitPrice = close;
        }
    }

    return {
        ticker,
        signalDate: candles[signalIdx].date,
        entryDate: candles[entryIdx].date,
        entryPrice: +entryPrice.toFixed(2),
        exitDate: candles[exitIdx].date,
        exitPrice: +exitPrice.toFixed(2),
        exitReason,
        pnlPct: +((exitPrice - entryPrice) / entryPrice * 100).toFixed(2),
        holdingDays: exitIdx - entryIdx,
    };
}

// ─── Core Backtest Runner ─────────────────────────────

export async function runBacktest(
    config: BacktestConfig,
    onProgress?: (done: number, total: number, ticker: string) => void
): Promise<BacktestResult> {
    const startMs = Date.now();

    const startTs = new Date(config.startDate).getTime() / 1000;
    const endTs = new Date(config.endDate).getTime() / 1000;
    const extendedStartTs = startTs - 400 * 24 * 3600;

    // ── Step 0: Build Nifty Market Regime Map ─────────
    // Key insight: only take trades when Nifty is above its 200 DMA
    // This is the #1 filter to improve win rate in swing trading
    onProgress?.(0, config.tickers.length, 'Fetching Nifty market regime data…');
    const niftyBullDates = new Set<string>(); // dates when market is in uptrend

    try {
        const { default: axios } = await import('axios');
        const niftyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI` +
            `?period1=${Math.floor(extendedStartTs)}&period2=${Math.floor(endTs)}&interval=1d`;
        const nr = await axios.get(niftyUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
        const nResult = nr.data?.chart?.result?.[0];
        if (nResult) {
            const nTs: number[] = nResult.timestamp || [];
            const nClose: number[] = nResult.indicators?.quote?.[0]?.close || [];
            const nCandles = nTs.map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), close: nClose[i] || 0 })).filter(c => c.close > 0);

            for (let i = 200; i < nCandles.length; i++) {
                const nDMA200 = nCandles.slice(i - 200, i).reduce((s, c) => s + c.close, 0) / 200;
                const nDMA200_20ago = i >= 220 ? nCandles.slice(i - 220, i - 20).reduce((s, c) => s + c.close, 0) / 200 : nDMA200;
                // Market is bullish if: price > 200 DMA AND 200 DMA is still rising
                if (nCandles[i].close > nDMA200 && nDMA200 >= nDMA200_20ago * 0.995) {
                    niftyBullDates.add(nCandles[i].date);
                }
            }
        }
    } catch (_) {
        // If Nifty fetch fails, allow all dates (no regime filter)
        console.warn('[Backtest] Could not fetch Nifty data, skipping regime filter');
    }

    // ── Step 1: Collect all raw signals ───────────────
    type Signal = BacktestTrade & { ticker: string };
    const allSignals: Signal[] = [];

    for (let i = 0; i < config.tickers.length; i++) {
        const ticker = config.tickers[i];
        onProgress?.(i, config.tickers.length, ticker);

        try {
            const { default: axios } = await import('axios');
            const yahooSym = ticker.includes('.NS') ? ticker : `${ticker}.NS`;
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}` +
                `?period1=${Math.floor(extendedStartTs)}&period2=${Math.floor(endTs)}&interval=1d`;

            const resp = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
            const result = resp.data?.chart?.result?.[0];
            if (!result) continue;

            const timestamps: number[] = result.timestamp || [];
            const q = result.indicators?.quote?.[0] || {};
            const candles: Candle[] = timestamps.map((ts, idx) => ({
                date: new Date(ts * 1000).toISOString().slice(0, 10),
                open: q.open?.[idx] || q.close?.[idx] || 0,
                high: q.high?.[idx] || q.close?.[idx] || 0,
                low: q.low?.[idx] || q.close?.[idx] || 0,
                close: q.close?.[idx] || 0,
                volume: q.volume?.[idx] || 0,
            })).filter(c => c.close > 0);

            if (candles.length < 220) continue;

            const testStartIdx = candles.findIndex(c => c.date >= config.startDate);
            if (testStartIdx < 210) continue;

            let lastExitDate = '';

            for (let idx = testStartIdx; idx < candles.length - 1; idx++) {
                if (candles[idx].date > config.endDate) break;
                if (lastExitDate && candles[idx].date <= lastExitDate) continue;

                // ⭐ MARKET REGIME FILTER: skip trade if market is in downtrend
                if (niftyBullDates.size > 0 && !niftyBullDates.has(candles[idx].date)) continue;

                if (passesFilters(candles, idx, config)) {
                    const trade = simulateTrade(candles, idx, ticker, config);
                    if (trade) {
                        allSignals.push(trade as Signal);
                        const exitD = new Date(trade.exitDate);
                        exitD.setDate(exitD.getDate() + config.cooldownDays);
                        lastExitDate = exitD.toISOString().slice(0, 10);
                    }
                }
            }
        } catch (_) { }
    }

    onProgress?.(config.tickers.length, config.tickers.length, 'Simulating portfolio…');

    // ── Step 2: Portfolio simulation (concurrent positions) ──
    // Sort all signals by entry date
    allSignals.sort((a, b) => a.entryDate.localeCompare(b.entryDate));

    // Simulate portfolio using the user's actual starting capital
    const STARTING_CAPITAL = config.startingCapital > 0 ? config.startingCapital : 10000;
    let cash = STARTING_CAPITAL;

    type OpenPosition = Signal & { allocatedCapital: number };
    const openPositions: OpenPosition[] = [];
    const executedTrades: BacktestTrade[] = [];
    const equityByDate = new Map<string, number>();

    const slotCapital = () => STARTING_CAPITAL / config.maxConcurrentTrades;

    for (const signal of allSignals) {
        // Close any positions that have exited before this signal's entry
        const releaseDate = signal.entryDate;
        const toClose = openPositions.filter(p => p.exitDate <= releaseDate);

        for (const pos of toClose) {
            const pnlAmount = pos.allocatedCapital * (pos.pnlPct / 100);
            cash += pos.allocatedCapital + pnlAmount;
            executedTrades.push(pos);
            openPositions.splice(openPositions.indexOf(pos), 1);
        }

        // Take new position if we have capacity and enough cash
        const capital = slotCapital();
        if (openPositions.length < config.maxConcurrentTrades && cash >= capital) {
            cash -= capital;
            openPositions.push({ ...signal, allocatedCapital: capital });
        }

        // Record equity on this date
        const portfolioValue = cash + openPositions.reduce((s, p) => {
            // Estimate current value based on % through trade
            return s + p.allocatedCapital * (1 + p.pnlPct / 100 * 0.5); // rough mid estimate
        }, 0);
        equityByDate.set(signal.entryDate, portfolioValue);
    }

    // Close any remaining open positions at their exit dates
    for (const pos of openPositions) {
        const pnlAmount = pos.allocatedCapital * (pos.pnlPct / 100);
        cash += pos.allocatedCapital + pnlAmount;
        executedTrades.push(pos);
    }

    const finalEquity = cash;

    // ── Step 3: Build equity curve from executed trades ──
    executedTrades.sort((a, b) => a.exitDate.localeCompare(b.exitDate));

    let runningEquity = STARTING_CAPITAL;
    let peak = STARTING_CAPITAL;
    const equityCurve: { date: string; equity: number; drawdown: number }[] = [
        { date: config.startDate, equity: STARTING_CAPITAL, drawdown: 0 }
    ];

    for (const t of executedTrades) {
        const capitalForTrade = slotCapital();
        const pnlAmount = capitalForTrade * (t.pnlPct / 100);
        runningEquity += pnlAmount;
        if (runningEquity > peak) peak = runningEquity;
        const drawdown = ((runningEquity - peak) / peak) * 100;
        equityCurve.push({
            date: t.exitDate,
            equity: +runningEquity.toFixed(2),
            drawdown: +drawdown.toFixed(2),
        });
    }

    const totalReturn = +((finalEquity - STARTING_CAPITAL) / STARTING_CAPITAL * 100).toFixed(2);

    // ── Step 4: Compute stats on executed trades ──────
    const stats = computeStats(executedTrades, totalReturn, Math.min(...equityCurve.map(e => e.drawdown)));
    const byTicker = buildByTicker(executedTrades);
    const byMonth = buildByMonth(executedTrades);

    return {
        trades: executedTrades,
        stats,
        equityCurve,
        byTicker,
        byMonth,
        config,
        duration: Date.now() - startMs,
    };
}

// ─── Stats ────────────────────────────────────────────

function computeStats(trades: BacktestTrade[], totalReturn: number, maxDrawdown: number): BacktestStats {
    if (!trades.length) return { totalTrades: 0, wins: 0, losses: 0, timeouts: 0, winRate: 0, avgReturn: 0, avgWin: 0, avgLoss: 0, riskRewardRatio: 0, totalReturn: 0, maxDrawdown: 0, bestTrade: null, worstTrade: null, profitFactor: 0, sharpeRatio: 0 };

    const wins = trades.filter(t => t.pnlPct > 0);
    const losses = trades.filter(t => t.pnlPct < 0);
    const timeouts = trades.filter(t => t.exitReason === 'TIMEOUT');
    const avgReturn = trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length;
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;
    const totalGains = wins.reduce((s, t) => s + t.pnlPct, 0);
    const totalLosses = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0));
    const profitFactor = totalLosses > 0 ? totalGains / totalLosses : (totalGains > 0 ? 99 : 0);
    const mean = avgReturn;
    const variance = trades.reduce((s, t) => s + Math.pow(t.pnlPct - mean, 2), 0) / trades.length;
    const sharpeRatio = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(252 / 20) : 0;
    const sorted = [...trades].sort((a, b) => b.pnlPct - a.pnlPct);

    return {
        totalTrades: trades.length,
        wins: wins.length, losses: losses.length, timeouts: timeouts.length,
        winRate: +(wins.length / trades.length * 100).toFixed(1),
        avgReturn: +avgReturn.toFixed(2),
        avgWin: +avgWin.toFixed(2),
        avgLoss: +avgLoss.toFixed(2),
        riskRewardRatio: avgLoss !== 0 ? +(Math.abs(avgWin / avgLoss)).toFixed(2) : 0,
        totalReturn,
        maxDrawdown,
        bestTrade: sorted[0] || null,
        worstTrade: sorted[sorted.length - 1] || null,
        profitFactor: +profitFactor.toFixed(2),
        sharpeRatio: +sharpeRatio.toFixed(2),
    };
}

function buildByTicker(trades: BacktestTrade[]) {
    const map = new Map<string, BacktestTrade[]>();
    for (const t of trades) { if (!map.has(t.ticker)) map.set(t.ticker, []); map.get(t.ticker)!.push(t); }
    return Array.from(map.entries()).map(([ticker, ts]) => ({
        ticker, trades: ts.length,
        wins: ts.filter(t => t.pnlPct > 0).length,
        winRate: +(ts.filter(t => t.pnlPct > 0).length / ts.length * 100).toFixed(1),
        avgReturn: +(ts.reduce((s, t) => s + t.pnlPct, 0) / ts.length).toFixed(2),
    })).sort((a, b) => b.avgReturn - a.avgReturn);
}

function buildByMonth(trades: BacktestTrade[]) {
    const map = new Map<string, BacktestTrade[]>();
    for (const t of trades) {
        const m = t.entryDate.slice(0, 7);
        if (!map.has(m)) map.set(m, []);
        map.get(m)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([month, ts]) => ({
        month, trades: ts.length,
        wins: ts.filter(t => t.pnlPct > 0).length,
        return: +(ts.reduce((s, t) => s + t.pnlPct, 0) / ts.length).toFixed(2),
    }));
}
