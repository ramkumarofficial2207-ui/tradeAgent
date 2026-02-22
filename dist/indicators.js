"use strict";
// =====================================================
// indicators.ts — All technical indicator calculations
// =====================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeIndicators = computeIndicators;
exports.identifySetupType = identifySetupType;
exports.estimateHitProbability = estimateHitProbability;
const technicalindicators_1 = require("technicalindicators");
function avg(arr) {
    if (arr.length === 0)
        return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function computeIndicators(ticker, candles, niftyCandles) {
    if (candles.length < 200)
        return null;
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    // --- Moving Averages ---
    const dma200Arr = technicalindicators_1.SMA.calculate({ period: 200, values: closes });
    const ema50Arr = technicalindicators_1.EMA.calculate({ period: 50, values: closes });
    const ema20Arr = technicalindicators_1.EMA.calculate({ period: 20, values: closes });
    const rsi14Arr = technicalindicators_1.RSI.calculate({ period: 14, values: closes });
    if (!dma200Arr.length || !ema50Arr.length || !ema20Arr.length || !rsi14Arr.length)
        return null;
    const ltp = closes[closes.length - 1];
    const dma200 = dma200Arr[dma200Arr.length - 1];
    const ema50 = ema50Arr[ema50Arr.length - 1];
    const ema20 = ema20Arr[ema20Arr.length - 1];
    const rsi14 = rsi14Arr[rsi14Arr.length - 1];
    // --- Volume ---
    const last20Vol = volumes.slice(-21, -1);
    const avgVolume20d = avg(last20Vol);
    const todayVolume = volumes[volumes.length - 1];
    const volumeRatio = avgVolume20d > 0 ? todayVolume / avgVolume20d : 0;
    // --- 3-Month Returns (63 trading days) ---
    const lookback63 = Math.max(0, closes.length - 64);
    const price63dAgo = closes[lookback63];
    const returns3m = ((ltp - price63dAgo) / price63dAgo) * 100;
    // --- 3-Month return for Nifty ---
    let nifty3mReturn = 0;
    if (niftyCandles.length >= 64) {
        const nc = niftyCandles.map(c => c.close);
        const lb = Math.max(0, nc.length - 64);
        nifty3mReturn = ((nc[nc.length - 1] - nc[lb]) / nc[lb]) * 100;
    }
    // --- 3M High/Low for target-zone reference ---
    const last63 = candles.slice(-63);
    const high3m = Math.max(...last63.map(c => c.high));
    const low3m = Math.min(...last63.map(c => c.low));
    return {
        ticker,
        ltp,
        dma200,
        ema50,
        ema20,
        rsi14,
        avgVolume20d,
        todayVolume,
        volumeRatio,
        high3m,
        low3m,
        returns3m,
        nifty3mReturn,
        outperformsNifty: returns3m > nifty3mReturn,
        candles,
    };
}
function identifySetupType(ind) {
    const { ltp, ema20, high3m, rsi14 } = ind;
    // Breakout Base: Price near 3M high + RSI recovering
    if (ltp >= high3m * 0.97 && rsi14 >= 44)
        return 'Breakout Base';
    // VCP: Multiple contractions — price near EMA20, RSI 35-45
    if (Math.abs(ltp - ema20) / ema20 < 0.02 && rsi14 < 45)
        return 'Volatility Contraction (VCP)';
    // Default: Pullback Continuation
    return 'Pullback Continuation';
}
function estimateHitProbability(ind, targetPct) {
    // Rough historical-volatility based estimate
    const { candles } = ind;
    const closes = candles.slice(-30).map(c => c.close);
    const dailyReturns = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
    const sumSq = dailyReturns.reduce((a, r) => a + r * r, 0);
    const stdDev = Math.sqrt(sumSq / dailyReturns.length) * Math.sqrt(252) * 100; // Annualized
    // Empirical: lower HV + RSI closer to 48 = better probability
    const volatilityFactor = Math.max(0, 1 - stdDev / 80);
    const rsiFactor = (50 - Math.abs(ind.rsi14 - 45)) / 50;
    const volFactor = Math.min(ind.volumeRatio / 2.5, 1);
    const rsFactor = ind.outperformsNifty ? 0.15 : 0;
    const raw = (volatilityFactor * 0.35 + rsiFactor * 0.30 + volFactor * 0.20 + rsFactor) * 100;
    return Math.min(95, Math.max(30, Math.round(raw)));
}
//# sourceMappingURL=indicators.js.map