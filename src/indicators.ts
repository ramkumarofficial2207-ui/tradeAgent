// =====================================================
// indicators.ts — Technical indicators with ADX + Regime
// =====================================================

import { SMA, EMA, RSI, ADX, ATR } from 'technicalindicators';
import { Candle, StockIndicators } from './types';

function avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(values: number[], avgValue: number): number {
    if (values.length === 0) return 0;
    const squareDiffs = values.map(value => {
        const diff = value - avgValue;
        return diff * diff;
    });
    const avgSquareDiff = avg(squareDiffs);
    return Math.sqrt(avgSquareDiff);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function rangeOf(candle: Candle): number {
    return Math.max(candle.high - candle.low, 0.0001);
}

function closeLocation(candle: Candle): number {
    return clamp((candle.close - candle.low) / rangeOf(candle), 0, 1);
}

function calcEfficiencyRatio(closes: number[], lookback = 10): number {
    if (closes.length < lookback + 1) return 0;
    const slice = closes.slice(-lookback - 1);
    const netMove = Math.abs(slice[slice.length - 1] - slice[0]);
    const path = slice.slice(1).reduce((sum, close, index) => sum + Math.abs(close - slice[index]), 0);
    return path > 0 ? clamp(netMove / path, 0, 1) : 0;
}

function calcAtrLatest(candles: Candle[], period = 14): number {
    if (candles.length < period + 1) return 0;
    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    const close = candles.map(c => c.close);
    const values = ATR.calculate({ period, high, low, close });
    return values.length ? values[values.length - 1] : 0;
}

export function detectTTMSqueeze(candles: Candle[], currentIdx?: number): { isSqueeze: boolean; tightness: number } {
    const idx = currentIdx ?? candles.length - 1;
    if (idx < 20) return { isSqueeze: false, tightness: 0 };
    
    const slice = candles.slice(idx - 19, idx + 1);
    const closes = slice.map(c => c.close);
    
    const mbb = avg(closes);
    const sd = stdDev(closes, mbb);
    const ubb = mbb + 2.0 * sd;
    const lbb = mbb - 2.0 * sd;
    
    const smoothing = 2 / (20 + 1);
    let ema = closes[0];
    for (let i = 1; i < closes.length; i++) {
        ema = (closes[i] * smoothing) + (ema * (1 - smoothing));
    }
    
    const atrInput = candles.slice(0, idx + 1);
    const atr = calcAtrLatest(atrInput, 20);
    
    const ukc = ema + 1.5 * atr;
    const lkc = ema - 1.5 * atr;
    
    const isSqueeze = ubb < ukc && lbb > lkc;
    const tightness = mbb > 0 ? ((ubb - lbb) / mbb) * 100 : 0;
    
    return { isSqueeze, tightness };
}

export function detectPocketPivot(candles: Candle[], currentIdx?: number, ema20Val?: number, ema50Val?: number): boolean {
    const idx = currentIdx ?? candles.length - 1;
    if (idx < 10) return false;
    
    const current = candles[idx];
    if (current.close <= current.open) return false;
    
    const closes = candles.slice(0, idx + 1).map(c => c.close);
    
    let ema20 = ema20Val;
    if (ema20 === undefined) {
        const ema20Arr = EMA.calculate({ period: 20, values: closes });
        ema20 = ema20Arr.length ? ema20Arr[ema20Arr.length - 1] : 0;
    }
    
    let ema50 = ema50Val;
    if (ema50 === undefined) {
        const ema50Arr = EMA.calculate({ period: 50, values: closes });
        ema50 = ema50Arr.length ? ema50Arr[ema50Arr.length - 1] : 0;
    }
    
    if (ema20 === 0 || ema50 === 0) return false;
    
    const dist20 = Math.abs(current.close - ema20) / ema20;
    const dist50 = Math.abs(current.close - ema50) / ema50;
    const nearEMA = dist20 <= 0.045 || dist50 <= 0.045;
    if (!nearEMA) return false;
    
    const last10 = candles.slice(idx - 10, idx);
    let maxDownVol = 0;
    for (const c of last10) {
        if (c.close < c.open) {
            if (c.volume > maxDownVol) {
                maxDownVol = c.volume;
            }
        }
    }
    
    return current.volume > maxDownVol;
}

function calcIchimoku(candles: Candle[]): {
    tenkan: number;
    kijun: number;
    spanA: number;
    spanB: number;
    cloudTop: number;
    cloudBottom: number;
    bullish: boolean;
} {
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);
    const lastClose = closes[closes.length - 1] ?? 0;

    const highest = (period: number): number => {
        if (highs.length < period) return 0;
        return Math.max(...highs.slice(-period));
    };
    const lowest = (period: number): number => {
        if (lows.length < period) return 0;
        return Math.min(...lows.slice(-period));
    };

    const tenkan = (highest(9) + lowest(9)) / 2;
    const kijun = (highest(26) + lowest(26)) / 2;
    const spanA = (tenkan + kijun) / 2;
    const spanB = (highest(52) + lowest(52)) / 2;
    const cloudTop = Math.max(spanA, spanB);
    const cloudBottom = Math.min(spanA, spanB);
    const priceAboveCloud = cloudTop > 0 ? lastClose > cloudTop : false;
    const tenkanAboveKijun = tenkan > 0 && kijun > 0 ? tenkan > kijun : false;
    const chikouBullish = closes.length >= 27 ? lastClose > closes[closes.length - 27] : false;

    return {
        tenkan,
        kijun,
        spanA,
        spanB,
        cloudTop,
        cloudBottom,
        bullish: priceAboveCloud && tenkanAboveKijun && chikouBullish,
    };
}

function calcSupertrend(candles: Candle[], period = 10, multiplier = 3): { supertrend: number; bullish: boolean } {
    if (candles.length < period + 1) return { supertrend: 0, bullish: false };

    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    const close = candles.map(c => c.close);
    const atrValues = ATR.calculate({ period, high, low, close });
    if (!atrValues.length) return { supertrend: 0, bullish: false };

    const offset = candles.length - atrValues.length;
    let finalUpper = 0;
    let finalLower = 0;
    let supertrend = 0;
    let bullish = true;

    for (let i = offset; i < candles.length; i++) {
        const atr = atrValues[i - offset];
        if (!Number.isFinite(atr)) continue;

        const hl2 = (high[i] + low[i]) / 2;
        const basicUpper = hl2 + multiplier * atr;
        const basicLower = hl2 - multiplier * atr;

        if (i === offset) {
            finalUpper = basicUpper;
            finalLower = basicLower;
            bullish = close[i] >= hl2;
            supertrend = bullish ? finalLower : finalUpper;
            continue;
        }

        const prevClose = close[i - 1];
        finalUpper = (basicUpper < finalUpper || prevClose > finalUpper) ? basicUpper : finalUpper;
        finalLower = (basicLower > finalLower || prevClose < finalLower) ? basicLower : finalLower;

        if (bullish) {
            if (close[i] < finalLower) {
                bullish = false;
                supertrend = finalUpper;
            } else {
                supertrend = finalLower;
            }
        } else {
            if (close[i] > finalUpper) {
                bullish = true;
                supertrend = finalLower;
            } else {
                supertrend = finalUpper;
            }
        }
    }

    return { supertrend, bullish };
}

function scoreAcceptance(candles: Candle[], ema20: number, ema50: number): number {
    const recent = candles.slice(-10);
    const last5 = recent.slice(-5);
    if (!recent.length) return 0;

    const pivotHigh = Math.max(...recent.map(c => c.high));
    const abovePivot = last5.filter(c => c.close >= pivotHigh * 0.995).length / Math.max(last5.length, 1);
    const holdEma20 = last5.filter(c => c.close >= ema20).length / Math.max(last5.length, 1);
    const holdEma50 = last5.filter(c => c.close >= ema50).length / Math.max(last5.length, 1);
    const avgCloseLocation = avg(last5.map(closeLocation));
    const score = (abovePivot * 4.5) + (holdEma20 * 2.2) + (holdEma50 * 1.3) + (avgCloseLocation * 2.0);
    return +clamp(score, 0, 10).toFixed(1);
}

function scoreAbsorption(candles: Candle[], volumeRatio: number): number {
    const recent = candles.slice(-5);
    if (!recent.length) return 0;
    const avgRange20 = avg(candles.slice(-20).map(rangeOf));
    const tightRanges = avgRange20 > 0
        ? recent.filter(c => rangeOf(c) <= avgRange20 * 0.85).length / recent.length
        : 0;
    const closeNearHigh = avg(recent.map(closeLocation));
    const bodyCompression = 1 - avg(recent.map(c => Math.abs(c.close - c.open) / rangeOf(c)));
    const volumeSupport = clamp(volumeRatio / 2.0, 0, 1);
    const score = (closeNearHigh * 3.4) + (bodyCompression * 2.4) + (tightRanges * 2.0) + (volumeSupport * 2.2);
    return +clamp(score, 0, 10).toFixed(1);
}

function scorePersistence(candles: Candle[], ema20: number, ema50: number): number {
    const recent = candles.slice(-10);
    if (!recent.length) return 0;
    const aboveEma20 = recent.filter(c => c.close >= ema20).length / recent.length;
    const aboveEma50 = recent.filter(c => c.close >= ema50).length / recent.length;
    const greenDays = recent.filter(c => c.close > c.open).length / recent.length;
    const closes = recent.map(c => c.close);
    const peak = Math.max(...closes);
    const trough = Math.min(...closes);
    const drawdownPct = peak > 0 ? ((peak - trough) / peak) * 100 : 0;
    const stability = clamp(1 - (drawdownPct / 12), 0, 1);
    const score = (aboveEma20 * 3.6) + (aboveEma50 * 2.0) + (greenDays * 2.4) + (stability * 2.0);
    return +clamp(score, 0, 10).toFixed(1);
}

function scoreBreakoutRetention(candles: Candle[], ema20: number): number {
    const recent = candles.slice(-21, -1);
    const holdWindow = candles.slice(-5);
    if (!recent.length || !holdWindow.length) return 0;
    const pivotHigh = Math.max(...recent.map(c => c.high));
    const closesAbovePivot = holdWindow.filter(c => c.close >= pivotHigh * 0.995).length / holdWindow.length;
    const lowsAbovePivot = holdWindow.filter(c => c.low >= pivotHigh * 0.985).length / holdWindow.length;
    const emaSupport = holdWindow.filter(c => c.close >= ema20).length / holdWindow.length;
    const score = (closesAbovePivot * 4.2) + (lowsAbovePivot * 3.0) + (emaSupport * 2.8);
    return +clamp(score, 0, 10).toFixed(1);
}

function scoreFailureRisk(params: {
    ltp: number;
    ema20: number;
    rsi14: number;
    acceptanceScore: number;
    breakoutRetentionScore: number;
    persistenceScore: number;
    candles: Candle[];
}): number {
    const { ltp, ema20, rsi14, acceptanceScore, breakoutRetentionScore, persistenceScore, candles } = params;
    const last = candles[candles.length - 1];
    const closeLoc = closeLocation(last);
    const extensionFromEma20 = ema20 > 0 ? Math.abs(ltp - ema20) / ema20 * 100 : 0;
    const overExtension = clamp(extensionFromEma20 / 8, 0, 1);
    const weakClose = closeLoc < 0.45 ? 1 : 0;
    const rsiRisk = clamp((rsi14 - 72) / 10, 0, 1);
    const retentionGap = 1 - (breakoutRetentionScore / 10);
    const acceptanceGap = 1 - (acceptanceScore / 10);
    const persistenceGap = 1 - (persistenceScore / 10);
    const score = (overExtension * 2.4) + (weakClose * 1.5) + (rsiRisk * 2.0) + (retentionGap * 2.0) + (acceptanceGap * 1.3) + (persistenceGap * 0.8);
    return +clamp(score, 0, 10).toFixed(1);
}

function scoreRelativeStrengthAcceleration(returns1m: number, nifty1mReturn: number, returns3m: number, nifty3mReturn: number): { raw: number; score: number } {
    const rs1m = returns1m - nifty1mReturn;
    const rs3m = returns3m - nifty3mReturn;
    const raw = rs1m - (rs3m / 3);
    const score = clamp(5 + (raw * 0.35), 0, 10);
    return { raw: +raw.toFixed(2), score: +score.toFixed(1) };
}

function scorePreMove(acceptanceScore: number, absorptionScore: number, efficiencyScore: number, persistenceScore: number, breakoutRetentionScore: number, relativeStrengthAccelerationScore: number, failureRiskScore: number): number {
    const score =
        (acceptanceScore * 0.22) +
        (absorptionScore * 0.18) +
        (efficiencyScore * 0.14) +
        (persistenceScore * 0.16) +
        (breakoutRetentionScore * 0.16) +
        (relativeStrengthAccelerationScore * 0.14) -
        (failureRiskScore * 0.10);
    return +clamp(score, 0, 10).toFixed(1);
}

function calcTimeSeriesMomentumBullish(params: {
    returns1m: number;
    nifty1mReturn: number;
    returns3m: number;
    nifty3mReturn: number;
    returns6m: number;
    ema50Slope: number;
    ltp: number;
    dma200: number;
}): boolean {
    const {
        returns1m,
        nifty1mReturn,
        returns3m,
        nifty3mReturn,
        returns6m,
        ema50Slope,
        ltp,
        dma200,
    } = params;

    const shortMomentum = returns1m >= nifty1mReturn - 0.5;
    const mediumMomentum = returns3m >= nifty3mReturn - 0.5;
    const longerMomentum = returns6m >= -3;
    const trendFilter = ema50Slope > 0 && ltp > dma200;

    return shortMomentum && mediumMomentum && longerMomentum && trendFilter;
}

function calcLeaderScore(params: {
    outperformsNifty: boolean;
    timeSeriesMomentumBullish: boolean;
    ema20: number;
    ema50: number;
    dma200: number;
    acceptanceScore: number;
    persistenceScore: number;
    breakoutRetentionScore: number;
    volumeRatio: number;
    rsi14: number;
    returns1m: number;
    nifty1mReturn: number;
    returns3m: number;
    nifty3mReturn: number;
}): number {
    const {
        outperformsNifty,
        timeSeriesMomentumBullish,
        ema20,
        ema50,
        dma200,
        acceptanceScore,
        persistenceScore,
        breakoutRetentionScore,
        volumeRatio,
        rsi14,
        returns1m,
        nifty1mReturn,
        returns3m,
        nifty3mReturn,
    } = params;

    let score = 0;
    if (outperformsNifty) score += 2.0;
    if (timeSeriesMomentumBullish) score += 2.0;
    if (ema20 > ema50) score += 1.0;
    if (ema50 > dma200) score += 1.0;
    if (acceptanceScore >= 6) score += 1.0;
    if (persistenceScore >= 6) score += 1.0;
    if (breakoutRetentionScore >= 6) score += 0.8;
    if (volumeRatio >= 1.05) score += 0.8;
    if (rsi14 >= 50 && rsi14 <= 72) score += 0.7;
    if (returns1m > nifty1mReturn) score += 0.7;
    if (returns3m > nifty3mReturn) score += 0.9;

    return +clamp(score, 0, 10).toFixed(1);
}

function detectLeaderPullbackReclaim(
    candles: Candle[],
    ema20: number,
    ema50: number,
    dma200: number,
    timeSeriesMomentumBullish: boolean,
    isLeader: boolean
): boolean {
    if (!isLeader || !timeSeriesMomentumBullish || candles.length < 15) return false;

    const latest = candles[candles.length - 1];
    const recent5 = candles.slice(-5);
    const recent8 = candles.slice(-8);
    const avgVol5 = avg(recent8.slice(0, -1).map(c => c.volume));
    const touchedEma20 = recent5.some(c => c.low <= ema20 * 1.01 || Math.abs(c.close - ema20) / Math.max(ema20, 1) <= 0.025);
    const reclaimedEma20 = latest.close > ema20 && latest.close > latest.open && closeLocation(latest) >= 0.6;
    const priorClosesBelowEma20 = recent8.slice(0, -1).some(c => c.close < ema20 * 0.998);
    const trendAligned = ema20 > ema50 && ema50 > dma200;
    const volumeSupport = avgVol5 > 0 ? latest.volume >= avgVol5 * 0.95 : true;

    return touchedEma20 && reclaimedEma20 && priorClosesBelowEma20 && trendAligned && volumeSupport;
}

function detectSecondEntryRetest(
    candles: Candle[],
    timeSeriesMomentumBullish: boolean,
    isLeader: boolean
): boolean {
    if (!isLeader || !timeSeriesMomentumBullish || candles.length < 25) return false;

    const latest = candles[candles.length - 1];
    const recent = candles.slice(-10);
    const preBreakout = candles.slice(-25, -10);
    if (preBreakout.length < 8) return false;

    const breakoutHigh = Math.max(...preBreakout.map(c => c.high));
    const breakoutSeen = candles.slice(-10, -3).some(c => c.close >= breakoutHigh * 1.01 || c.high >= breakoutHigh * 1.005);
    const retestHeld = recent.some(c => c.low <= breakoutHigh * 1.01) && latest.close >= breakoutHigh * 0.997;
    const closeStrength = closeLocation(latest) >= 0.65 && latest.close > latest.open;
    const volumeSupport = latest.volume >= avg(candles.slice(-8, -1).map(c => c.volume)) * 0.95;

    return breakoutSeen && retestHeld && closeStrength && volumeSupport;
}

function detectEarningsReactionContinuation(
    candles: Candle[],
    timeSeriesMomentumBullish: boolean,
    isLeader: boolean
): boolean {
    if (!isLeader || !timeSeriesMomentumBullish || candles.length < 12) return false;

    const latest = candles[candles.length - 1];
    const previous = candles[candles.length - 2];
    if (!previous) return false;

    const gapPct = previous.close > 0 ? ((latest.open - previous.close) / previous.close) * 100 : 0;
    const recentVol = avg(candles.slice(-10, -1).map(c => c.volume));
    const strongClose = closeLocation(latest) >= 0.65 && latest.close > latest.open;
    const followThrough = latest.close >= previous.close * 1.015 || latest.close > latest.high * 0.995;
    const volumeImpulse = recentVol > 0 ? latest.volume >= recentVol * 1.2 : true;
    const gapQuality = gapPct >= 1.5 && gapPct <= 10;

    return gapQuality && strongClose && followThrough && volumeImpulse;
}

function detectCompressionInLeaders(
    candles: Candle[],
    timeSeriesMomentumBullish: boolean,
    isLeader: boolean
): boolean {
    if (!isLeader || !timeSeriesMomentumBullish || candles.length < 20) return false;
    const compression = detectCompressionSetup(candles);
    return compression.isCompression && compression.quality >= 6 && compression.pctFromPivot <= 3.5;
}

export function computeAtr14(candles: Candle[]): number {
    if (!candles || candles.length < 15) return 0;
    const slice = candles.slice(-15);
    let trSum = 0;
    for (let i = 1; i < slice.length; i++) {
        const tr = Math.max(
            slice[i].high - slice[i].low,
            Math.abs(slice[i].high - slice[i - 1].close),
            Math.abs(slice[i].low - slice[i - 1].close)
        );
        trSum += tr;
    }
    return +(trSum / (slice.length - 1)).toFixed(2);
}

export function detectEpisodicPivot(candles: Candle[]): boolean {
    if (!candles || candles.length < 50) return false;
    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (!prev || prev.close <= 0) return false;

    const gapPct = ((latest.open - prev.close) / prev.close) * 100;
    const avgVol50 = avg(candles.slice(-52, -2).map(c => c.volume));
    const volMultiple = avgVol50 > 0 ? latest.volume / avgVol50 : 0;

    return gapPct >= 7.5 && volMultiple >= 2.5 && latest.close >= latest.open;
}

export function detectHighTightFlag(candles: Candle[]): boolean {
    if (!candles || candles.length < 30) return false;
    const slice20 = candles.slice(-20);
    const low20 = Math.min(...slice20.map(c => c.low));
    const high20 = Math.max(...slice20.map(c => c.high));
    const runUpPct = low20 > 0 ? ((high20 - low20) / low20) * 100 : 0;

    if (runUpPct < 25) return false;

    const last5 = candles.slice(-5);
    const range5 = (Math.max(...last5.map(c => c.high)) - Math.min(...last5.map(c => c.low))) / high20 * 100;
    return range5 <= 6.5;
}

export function computeIndicators(
    ticker: string,
    candles: Candle[],
    niftyCandles: Candle[]
): StockIndicators | null {
    if (candles.length < 200) return null;

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);

    // ── Core indicators ──────────────────────────────────
    const dma200Arr = SMA.calculate({ period: 200, values: closes });
    const ema50Arr = EMA.calculate({ period: 50, values: closes });
    const ema20Arr = EMA.calculate({ period: 20, values: closes });
    const rsi14Arr = RSI.calculate({ period: 14, values: closes });

    if (!dma200Arr.length || !ema50Arr.length || !ema20Arr.length || !rsi14Arr.length) return null;

    const ltp = closes[closes.length - 1];
    const dma200 = dma200Arr[dma200Arr.length - 1];
    const ema50 = ema50Arr[ema50Arr.length - 1];
    const ema20 = ema20Arr[ema20Arr.length - 1];
    const rsi14 = rsi14Arr[rsi14Arr.length - 1];

    // ── ADX(14) — Trend strength ──────────────────────────
    let adx14 = 0;
    try {
        const adxInput = { period: 14, high: highs, low: lows, close: closes };
        const adxArr = ADX.calculate(adxInput);
        if (adxArr.length > 0) adx14 = adxArr[adxArr.length - 1].adx;
    } catch { adx14 = 0; }

    // ── 50 DMA slope (% change over 10 days) ─────────────
    const ema50Slope = ema50Arr.length >= 11
        ? ((ema50Arr[ema50Arr.length - 1] - ema50Arr[ema50Arr.length - 11]) / ema50Arr[ema50Arr.length - 11]) * 100
        : 0;

    // ── Volume ───────────────────────────────────────────
    const last20Vol = volumes.slice(-21, -1);
    const avgVolume20d = avg(last20Vol);
    const todayVolume = volumes[volumes.length - 1];
    const volumeRatio = avgVolume20d > 0 ? todayVolume / avgVolume20d : 0;

    // ── 3-month returns ──────────────────────────────────
    const lookback63 = Math.max(0, closes.length - 64);
    const price63dAgo = closes[lookback63];
    const returns3m = ((ltp - price63dAgo) / price63dAgo) * 100;

    // 1-month return
    const lb22 = Math.max(0, closes.length - 23);
    const returns1m = ((ltp - closes[lb22]) / closes[lb22]) * 100;

    // 6-month return
    const lb126 = Math.max(0, closes.length - 127);
    const returns6m = ((ltp - closes[lb126]) / closes[lb126]) * 100;

    // 10-day return (for Bull Flag logic)
    const lb10 = Math.max(0, closes.length - 11);
    const returns10d = ((ltp - closes[lb10]) / closes[lb10]) * 100;

    // ── Nifty benchmark returns ──────────────────────────
    let nifty3mReturn = 0, nifty1mReturn = 0;
    if (niftyCandles && niftyCandles.length >= 64) {
        const nc = niftyCandles.map(c => c.close);
        const lb3 = Math.max(0, nc.length - 64);
        const lb1 = Math.max(0, nc.length - 23);
        nifty3mReturn = ((nc[nc.length - 1] - nc[lb3]) / nc[lb3]) * 100;
        nifty1mReturn = ((nc[nc.length - 1] - nc[lb1]) / nc[lb1]) * 100;
    }

    // ── 52-week high / 3-month range ────────────────────
    const last252 = candles.slice(-252);
    const last63c = candles.slice(-63);
    const high52w = Math.max(...last252.map(c => c.high));
    const high3m = Math.max(...last63c.map(c => c.high));
    const low3m = Math.min(...last63c.map(c => c.low));
    const pctFrom52wHigh = ((high52w - ltp) / high52w) * 100;

    // ── Distance from 200 DMA ───────────────────────────
    const distFrom200 = dma200 > 0 ? ((ltp - dma200) / dma200) * 100 : 0;




    // ── Phase 4: Delivery / Accumulation Proxy ──────────
    let accumulationScore = 0;
    if (candles.length >= 10) {
        const last10 = candles.slice(-10);
        let upVol = 0, downVol = 0;
        for (const c of last10) {
            if (c.close > c.open) upVol += c.volume;
            else if (c.close < c.open) downVol += c.volume;
        }
        accumulationScore = downVol === 0 ? 100 : (upVol / (upVol + downVol)) * 100;
    }

    const squeezeRes = detectTTMSqueeze(candles);
    const isSqueeze = squeezeRes.isSqueeze;
    const squeezeTightness = squeezeRes.tightness;
    const isPocketPivot = detectPocketPivot(candles, candles.length - 1, ema20, ema50);

    // ── Setup Identifiers ───────────────────────────────
    // Short Swing: Bull Flag
    const isBullFlag = returns10d >= 15 &&          // 15%+ run in last 10 days
        ltp > ema20 &&              // Price holding above 20 EMA
        rsi14 >= 60 &&              // Strong momentum
        todayVolume < avgVolume20d * 0.7; // Drying volume on flag consolidation

    // Medium Swing: Deep Value Reversion
    const isDeepValue = distFrom200 <= -10 &&       // Stretched below 200 DMA
        rsi14 < 35 &&               // Heavily oversold
        volumeRatio >= 1.5 &&       // Climactic volume confirmation
        ltp > candles[candles.length - 1].open; // Bullish close (hammer/engulfing)

    const ichimoku = calcIchimoku(candles);
    const supertrend = calcSupertrend(candles);
    const acceptanceScore = scoreAcceptance(candles, ema20, ema50);
    const absorptionScore = scoreAbsorption(candles, volumeRatio);
    const efficiencyRatio = calcEfficiencyRatio(closes, 10);
    const efficiencyScore = +(efficiencyRatio * 10).toFixed(1);
    const persistenceScore = scorePersistence(candles, ema20, ema50);
    const breakoutRetentionScore = scoreBreakoutRetention(candles, ema20);
    const relativeStrengthAcceleration = scoreRelativeStrengthAcceleration(returns1m, nifty1mReturn, returns3m, nifty3mReturn);
    const failureRiskScore = scoreFailureRisk({
        ltp,
        ema20,
        rsi14,
        acceptanceScore,
        breakoutRetentionScore,
        persistenceScore,
        candles,
    });
    const preMoveScore = scorePreMove(
        acceptanceScore,
        absorptionScore,
        efficiencyScore,
        persistenceScore,
        breakoutRetentionScore,
        relativeStrengthAcceleration.score,
        failureRiskScore,
    );
    const timeSeriesMomentumBullish = calcTimeSeriesMomentumBullish({
        returns1m,
        nifty1mReturn,
        returns3m,
        nifty3mReturn,
        returns6m,
        ema50Slope,
        ltp,
        dma200,
    });
    const leaderScore = calcLeaderScore({
        outperformsNifty: returns3m > nifty3mReturn,
        timeSeriesMomentumBullish,
        ema20,
        ema50,
        dma200,
        acceptanceScore,
        persistenceScore,
        breakoutRetentionScore,
        volumeRatio,
        rsi14,
        returns1m,
        nifty1mReturn,
        returns3m,
        nifty3mReturn,
    });
    const isLeader = leaderScore >= 6.2;
    const isLeaderPullbackReclaim = detectLeaderPullbackReclaim(candles, ema20, ema50, dma200, timeSeriesMomentumBullish, isLeader);
    const isSecondEntryRetest = detectSecondEntryRetest(candles, timeSeriesMomentumBullish, isLeader);
    const isEarningsReactionContinuation = detectEarningsReactionContinuation(candles, timeSeriesMomentumBullish, isLeader);
    const isCompressionInLeaders = detectCompressionInLeaders(candles, timeSeriesMomentumBullish, isLeader);

    return {
        ticker, ltp, dma200, ema50, ema20, rsi14,
        adx14, ema50Slope,
        avgVolume20d, todayVolume, volumeRatio,
        high3m, low3m, high52w, pctFrom52wHigh, distFrom200,
        returns3m, returns1m, returns6m, returns10d,
        nifty3mReturn, nifty1mReturn,
        outperformsNifty: returns3m > nifty3mReturn,
        accumulationScore,
        timeSeriesMomentumBullish,
        isLeader,
        leaderScore,
        isBullFlag, isDeepValue,
        isLeaderPullbackReclaim,
        isSecondEntryRetest,
        isEarningsReactionContinuation,
        isCompressionInLeaders,
        isSqueeze, squeezeTightness, isPocketPivot,
        ichimokuTenkan: +ichimoku.tenkan.toFixed(2),
        ichimokuKijun: +ichimoku.kijun.toFixed(2),
        ichimokuSpanA: +ichimoku.spanA.toFixed(2),
        ichimokuSpanB: +ichimoku.spanB.toFixed(2),
        ichimokuCloudTop: +ichimoku.cloudTop.toFixed(2),
        ichimokuCloudBottom: +ichimoku.cloudBottom.toFixed(2),
        ichimokuBullish: ichimoku.bullish,
        supertrend: +supertrend.supertrend.toFixed(2),
        supertrendBullish: supertrend.bullish,
        acceptanceScore,
        absorptionScore,
        efficiencyRatio: +efficiencyRatio.toFixed(3),
        efficiencyScore,
        persistenceScore,
        breakoutRetentionScore,
        failureRiskScore,
        relativeStrengthAcceleration: relativeStrengthAcceleration.raw,
        relativeStrengthAccelerationScore: relativeStrengthAcceleration.score,
        preMoveScore,
        candles,
    };
}

// ─── 5-Component Confidence Scorer (Blueprint Formula) ──────────
export interface ConfidenceBreakdown {
    scoreTrend: number  // 0–2: ADX + 50DMA slope
    scoreVolume: number  // 0–2: vol ratio vs 20d avg
    scoreRS: number  // 0–2: relative strength vs Nifty (1M+3M+6M)
    scoreSetup: number  // 0–2: RSI zone + 200DMA dist + 52W proximity
    scoreRR: number  // 0–2: risk-reward ratio
    total: number  // 0–10
    passes: boolean // total >= 7.0
}

export function computeConfidence(ind: StockIndicators, rr: number, setupType?: string): ConfidenceBreakdown {
    const isPullback = setupType && (
        setupType.includes('Pullback') ||
        setupType.includes('Contraction') ||
        setupType.includes('Continuation') ||
        setupType.includes('Bounce')
    );
    const isLeaderSetup = setupType && (
        setupType.includes('Leader') ||
        setupType.includes('Second-Entry') ||
        setupType.includes('Compression in Leaders')
    );
    const isEventDriven = setupType?.includes('Earnings Reaction Continuation') ?? false;
    const isCompressionLeader = setupType?.includes('Compression in Leaders') ?? false;

    // ── Explicit 1.0 - 10.0 Weighted Confidence Model ───────────────────
    // Base Technical Pattern Match: +3.0
    const basePatternScore = 3.0;

    // ADX Trend Strength (> 25): +2.5 max
    const adxScore = ind.adx14 > 35 ? 2.5 :
        ind.adx14 > 25 ? 2.0 :
            ind.adx14 > 20 ? 1.0 : 0.0;

    // RSI Momentum Zone (50-70): +2.5 max
    const rsiScore = (ind.rsi14 >= 50 && ind.rsi14 <= 70) ? 2.5 :
        (ind.rsi14 >= 45 && ind.rsi14 < 50) ? 1.5 :
            (ind.rsi14 > 70 && ind.rsi14 <= 75) ? 1.5 : 0.5;

    // Volume Confirmation: High volume for breakouts (>= 1.5x), Volume Dry-up for pullbacks/bases (< 0.9x)
    const volScore = (isPullback && ind.volumeRatio <= 0.9) ? 2.0 :
        ind.volumeRatio >= 2.0 ? 2.0 :
            ind.volumeRatio >= 1.5 ? 1.5 :
                ind.volumeRatio >= 1.2 ? 0.8 : 0.0;

    let total = basePatternScore + adxScore + rsiScore + volScore;

    // Relative strength & risk reward adjustments
    if (rr >= 2.5) total += 0.5;
    if (ind.outperformsNifty) total += 0.5;

    // Short-Circuit Penalties for Mandatory Rule Violations
    const requiresHighVolume = !isPullback && !ind.isBullFlag && !ind.isSqueeze;
    if (requiresHighVolume && ind.volumeRatio < 1.2) {
        total = Math.min(total, 3.5); // Short-circuit weak breakouts
    }
    if (ind.ltp <= ind.dma200 && !ind.isDeepValue) {
        total = Math.min(total, 3.8); // Short-circuit names below 200 DMA
    }
    if (ind.rsi14 < 40) {
        total = Math.min(total, 3.0); // Short-circuit falling knives
    }

    total = +clamp(total, 1.0, 10.0).toFixed(1);
    const passes = total >= 6.5;

    return {
        scoreTrend: +adxScore.toFixed(1),
        scoreVolume: +volScore.toFixed(1),
        scoreRS: +(ind.outperformsNifty ? 0.5 : 0).toFixed(1),
        scoreSetup: +basePatternScore.toFixed(1),
        scoreRR: +(rr >= 2.5 ? 0.5 : 0).toFixed(1),
        total,
        passes,
    };
}


// ─── Market Regime Detector ───────────────────────────────────────
export interface RegimeResult {
    regime: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF'
    label: string
    color: string
    detail: string
    positionSizeMult: number    // 1.0 | 0.5 | 0.0
    niftyAbove200: boolean
    vixLevel: number
    dma50: number
    dma200: number
    dmaGap: number              // 50DMA vs 200DMA gap %
}

export function computeRegime(
    niftyCandles: Candle[],
    vixLevel: number
): RegimeResult {
    const closes = niftyCandles.map(c => c.close);
    const dma50Arr = SMA.calculate({ period: 50, values: closes });
    const dma200Arr = SMA.calculate({ period: 200, values: closes });

    const dma50 = dma50Arr.length ? dma50Arr[dma50Arr.length - 1] : 0;
    const dma200 = dma200Arr.length ? dma200Arr[dma200Arr.length - 1] : 0;
    const dmaGap = dma200 > 0 ? +((dma50 - dma200) / dma200 * 100).toFixed(2) : 0;
    const niftyAbove200 = closes[closes.length - 1] > dma200;

    const above50200 = dma50 > dma200;
    const vixCalm = vixLevel > 0 && vixLevel < 20;
    const vixSpike = vixLevel >= 20;

    let regime: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF';

    if (above50200 && vixCalm) {
        regime = 'BULLISH';
    } else if (!above50200 && vixSpike) {
        regime = 'RISK_OFF';
    } else {
        regime = 'NEUTRAL';
    }

    const info = {
        BULLISH: { label: 'Bullish', color: '#34d399', detail: 'Full position size. All setups valid.', positionSizeMult: 1.0 },
        NEUTRAL: { label: 'Neutral', color: '#fbbf24', detail: 'Half position size. Only highest-score setups.', positionSizeMult: 0.5 },
        RISK_OFF: { label: 'Risk-Off', color: '#f87171', detail: 'No new longs. Protect capital.', positionSizeMult: 0.0 },
    }[regime];

    return { regime, niftyAbove200, vixLevel, dma50, dma200, dmaGap, ...info };
}

// ─── VCP Detector ─────────────────────────────────────────────────
export interface VCPResult {
    isVCP: boolean;
    quality: number;
    tightness: number;
    contractionCount: number;
    pivotPrice: number;
    pctFromPivot: number;
}

export function detectVCP(candles: Candle[], currentIdx?: number): VCPResult {
    const EMPTY: VCPResult = { isVCP: false, quality: 0, tightness: 99, contractionCount: 0, pivotPrice: 0, pctFromPivot: 99 };
    const idx = currentIdx ?? candles.length - 1;
    const lookback = Math.min(idx, 65);
    if (lookback < 25) return EMPTY;

    const slice = candles.slice(idx - lookback, idx + 1);
    const highs = slice.map(c => c.high);
    const lows = slice.map(c => c.low);
    const closes = slice.map(c => c.close);
    const volumes = slice.map(c => c.volume);

    const currentClose = closes[closes.length - 1];
    const currentVol = volumes[volumes.length - 1];

    const peakHigh = Math.max(...highs);
    const peakIdx = highs.indexOf(peakHigh);
    if (peakIdx > lookback * 0.65 || (lookback - peakIdx) < 10) return EMPTY;

    const pctFromPivot = (peakHigh - currentClose) / peakHigh * 100;
    if (pctFromPivot > 5) return EMPTY;

    const postPeak = slice.slice(peakIdx);
    const ppH = postPeak.map(c => c.high);
    const ppL = postPeak.map(c => c.low);
    const ppV = postPeak.map(c => c.volume);
    const n = postPeak.length;
    if (n < 9) return EMPTY;

    const t = Math.floor(n / 3);
    const s1Range = (Math.max(...ppH.slice(0, t)) - Math.min(...ppL.slice(0, t))) / currentClose * 100;
    const s2Range = (Math.max(...ppH.slice(t, t * 2)) - Math.min(...ppL.slice(t, t * 2))) / currentClose * 100;
    const s3Range = (Math.max(...ppH.slice(t * 2)) - Math.min(...ppL.slice(t * 2))) / currentClose * 100;

    const contractionCount = (s2Range < s1Range * 0.8 ? 1 : 0) + (s3Range < s2Range * 0.8 ? 1 : 0);
    const tightness = s3Range;

    const avgBaseVol = avg(ppV.slice(t * 2, -1));
    const avgEarlyVol = avg(ppV.slice(0, t));
    const volDryUp = avgBaseVol < avgEarlyVol * 0.75;
    const breakoutVol = currentVol > avgBaseVol * 1.4;

    let quality = 0;
    if (contractionCount >= 1) quality += 3;
    if (contractionCount >= 2) quality += 2;
    if (tightness < 7) quality += 2;
    if (tightness < 4) quality += 1;
    if (volDryUp) quality += 1;
    if (breakoutVol) quality += 1;
    if (pctFromPivot < 2) quality += 1;

    const isVCP = quality >= 5 && contractionCount >= 1 && tightness < 12 && pctFromPivot <= 5;
    return { isVCP, quality, tightness, contractionCount, pivotPrice: peakHigh, pctFromPivot };
}

export interface CompressionResult {
    isCompression: boolean;
    quality: number;
    nr4: boolean;
    nr7: boolean;
    insideBar: boolean;
    volumeDryUp: boolean;
    rangeTightnessPct: number;
    pctFromPivot: number;
}

export function detectCompressionSetup(candles: Candle[], currentIdx?: number): CompressionResult {
    const EMPTY: CompressionResult = {
        isCompression: false,
        quality: 0,
        nr4: false,
        nr7: false,
        insideBar: false,
        volumeDryUp: false,
        rangeTightnessPct: 99,
        pctFromPivot: 99,
    };
    const idx = currentIdx ?? candles.length - 1;
    if (idx < 7) return EMPTY;

    const latest = candles[idx];
    const previous = candles[idx - 1];
    if (!latest || !previous) return EMPTY;

    const recent = candles.slice(idx - 7, idx + 1);
    const latestRange = Math.max(latest.high - latest.low, 0.01);
    const prev4Ranges = candles.slice(idx - 3, idx).map(candle => candle.high - candle.low);
    const prev7Ranges = candles.slice(idx - 6, idx).map(candle => candle.high - candle.low);
    const nr4 = prev4Ranges.length === 3 && latestRange <= Math.min(...prev4Ranges);
    const nr7 = prev7Ranges.length === 6 && latestRange <= Math.min(...prev7Ranges);
    const insideBar = latest.high <= previous.high && latest.low >= previous.low;

    const avgVolume5 = avg(candles.slice(Math.max(0, idx - 5), idx).map(candle => candle.volume));
    const volumeDryUp = avgVolume5 > 0 && latest.volume < avgVolume5 * 0.82;

    const pivotHigh = Math.max(...recent.map(candle => candle.high));
    const pivotLow = Math.min(...recent.map(candle => candle.low));
    const rangeTightnessPct = ((pivotHigh - pivotLow) / Math.max(latest.close, 1)) * 100;
    const pctFromPivot = ((pivotHigh - latest.close) / Math.max(pivotHigh, 1)) * 100;

    let quality = 0;
    if (nr4) quality += 2;
    if (nr7) quality += 2;
    if (insideBar) quality += 2;
    if (volumeDryUp) quality += 2;
    if (rangeTightnessPct <= 4.5) quality += 2;
    else if (rangeTightnessPct <= 6.5) quality += 1;
    if (pctFromPivot <= 2.5) quality += 1;

    const isCompression =
        quality >= 5 &&
        (nr4 || nr7 || insideBar) &&
        volumeDryUp &&
        rangeTightnessPct <= 6.5 &&
        pctFromPivot <= 4;

    return {
        isCompression,
        quality,
        nr4,
        nr7,
        insideBar,
        volumeDryUp,
        rangeTightnessPct: +rangeTightnessPct.toFixed(2),
        pctFromPivot: +pctFromPivot.toFixed(2),
    };
}

export function isBreakout(candles: Candle[], lookback = 20): boolean {
    if (candles.length < lookback + 2) return false;
    const recent = candles.slice(-lookback - 1, -1);
    const resistance = Math.max(...recent.map(c => c.close));
    const today = candles[candles.length - 1];
    return today.close > resistance && today.close > today.open;
}

export function identifySetupType(ind: StockIndicators): string {
    if (detectEpisodicPivot(ind.candles)) return 'Episodic Pivot (EP) Gap-Up 🚀';
    if (detectHighTightFlag(ind.candles)) return 'High Tight Flag (HTF) 🚩';
    if (ind.isLeaderPullbackReclaim) return 'Leader Pullback Reclaim';
    if (ind.isSecondEntryRetest) return 'Second-Entry Retest';
    if (ind.isEarningsReactionContinuation) return 'Earnings Reaction Continuation';
    if (ind.isCompressionInLeaders) return 'Compression in Leaders';
    if (ind.isBullFlag) return 'Bull Flag Breakout 🚩';
    if (ind.isDeepValue) return 'Deep Value Reversion 📉';

    if (ind.ichimokuBullish && ind.acceptanceScore >= 6.5) return 'Ichimoku Cloud Breakout';
    if (ind.supertrendBullish && ind.acceptanceScore >= 6.5) return 'Supertrend Continuation';
    if (ind.acceptanceScore >= 7 && ind.breakoutRetentionScore >= 6.5) return 'Acceptance Breakout';

    // Volatility Squeeze Breakout check
    const prevCandles = ind.candles.slice(0, -1);
    const prevSqueeze = prevCandles.length > 20 ? detectTTMSqueeze(prevCandles).isSqueeze : false;
    const currentSqueeze = ind.isSqueeze;

    const closes = ind.candles.map(c => c.close);
    const mbb = avg(closes.slice(-20));
    const sd = stdDev(closes.slice(-20), mbb);
    const ubb = mbb + 2.0 * sd;

    const isBBBreakout = ind.ltp > ubb && ind.volumeRatio >= 1.35;

    if ((currentSqueeze || prevSqueeze) && isBBBreakout) {
        return 'Squeeze Breakout';
    }

    const vcp = detectVCP(ind.candles);
    if (vcp.isVCP && vcp.quality >= 7) return 'VCP Breakout 🔥';
    if (vcp.isVCP) return 'VCP Contraction';

    const compression = detectCompressionSetup(ind.candles);
    if (compression.isCompression && compression.quality >= 6) return 'Compression Breakout';

    const breakout = isBreakout(ind.candles, 20);
    const { ltp, ema20, ema50, high3m, rsi14, high52w } = ind;

    // Within 3% of 52W high with strong momentum
    if (ltp >= high52w * 0.97 && rsi14 >= 55) return 'Momentum Continuation';
    if (breakout && ltp >= high3m * 0.97 && rsi14 >= 55) return 'Breakout Base';
    const relativeStrengthVsNifty = ind.returns3m - ind.nifty3mReturn;
    const isPreSurgeBase =
        Math.abs(ltp - ema20) / Math.max(ema20, 1) <= 0.02 &&
        ind.volumeRatio <= 0.85 &&
        ind.rsi14 >= 40 && ind.rsi14 <= 70 &&
        ema20 > ema50 &&
        ema50 > (ind.dma200 ?? 0) &&
        relativeStrengthVsNifty >= 5;
    if (isPreSurgeBase) return 'Pre-Surge Hybrid Base 🌱';
    if (Math.abs(ltp - ema20) / ema20 < 0.02 && ema50 > (ind.dma200 ?? 0)) return 'EMA20 Pullback';
    if (Math.abs(ltp - ema50) / ema50 < 0.025) return 'EMA50 Pullback';
    return 'Pullback Continuation';
}

export function estimateHitProbability(ind: StockIndicators, targetPct: number): number {
    const closes = ind.candles.slice(-30).map(c => c.close);
    const dailyReturns = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
    const sumSq = dailyReturns.reduce((a, r) => a + r * r, 0);
    const stdDev = Math.sqrt(sumSq / dailyReturns.length) * Math.sqrt(252) * 100;
    const volFactor = Math.max(0, 1 - stdDev / 80);
    const rsiFactor = (50 - Math.abs(ind.rsi14 - 45)) / 50;
    const vcp = detectVCP(ind.candles);
    const vcpFactor = vcp.isVCP ? (0.1 + (10 - vcp.tightness) / 100) : 0;
    const compression = detectCompressionSetup(ind.candles);
    const compressionFactor = compression.isCompression ? (0.08 + compression.quality / 100) : 0;
    const rsFactor = ind.outperformsNifty ? 0.15 : 0;
    const raw = (volFactor * 0.28 + rsiFactor * 0.22 + (ind.volumeRatio / 2.5) * 0.18 + rsFactor + vcpFactor + compressionFactor) * 100;
    return Math.min(95, Math.max(30, Math.round(raw)));
}
