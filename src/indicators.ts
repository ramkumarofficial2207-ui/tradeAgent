// =====================================================
// indicators.ts — Technical indicators with ADX + Regime
// =====================================================

import { SMA, EMA, RSI, ADX } from 'technicalindicators';
import { Candle, StockIndicators } from './types';

function avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
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
    if (niftyCandles.length >= 64) {
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
            else { upVol += c.volume / 2; downVol += c.volume / 2; }
        }
        accumulationScore = downVol === 0 ? 100 : (upVol / (upVol + downVol)) * 100;
    }

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

    return {
        ticker, ltp, dma200, ema50, ema20, rsi14,
        adx14, ema50Slope,
        avgVolume20d, todayVolume, volumeRatio,
        high3m, low3m, high52w, pctFrom52wHigh, distFrom200,
        returns3m, returns1m, returns6m, returns10d,
        nifty3mReturn, nifty1mReturn,
        outperformsNifty: returns3m > nifty3mReturn,
        accumulationScore,
        isBullFlag, isDeepValue,
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

export function computeConfidence(ind: StockIndicators, rr: number): ConfidenceBreakdown {
    // ── Component 1: Trend Strength (ADX + 50DMA slope) ─
    const scoreTrend =
        ind.adx14 > 35 && ind.ema50Slope > 0 ? 2.0 :
            ind.adx14 > 25 && ind.ema50Slope > 0 ? 1.5 :
                ind.adx14 > 20 && ind.ema50Slope > 0 ? 1.0 :
                    ind.adx14 > 20 ? 0.5 : 0.0;

    // ── Component 2: Volume Expansion ───────────────────
    const scoreVolume =
        ind.volumeRatio > 3.0 ? 2.0 :
            ind.volumeRatio > 2.0 ? 1.5 :
                ind.volumeRatio > 1.5 ? 1.0 :
                    ind.volumeRatio > 1.1 ? 0.5 : 0.0;

    // ── Component 3: Relative Strength vs Nifty ─────────
    const pts1m = ind.returns1m - ind.nifty1mReturn > 5 ? 0.7 : ind.returns1m - ind.nifty1mReturn > 0 ? 0.4 : 0;
    const pts3m = ind.returns3m - ind.nifty3mReturn > 8 ? 0.7 : ind.returns3m - ind.nifty3mReturn > 0 ? 0.4 : 0;
    const pts6m = (ind.returns6m ?? 0) > 10 ? 0.6 : (ind.returns6m ?? 0) > 0 ? 0.3 : 0;
    const scoreRS = Math.min(2.0, pts1m + pts3m + pts6m);

    // ── Component 4: Setup Quality ───────────────────────
    const rsiScore =
        ind.rsi14 >= 60 && ind.rsi14 <= 68 ? 0.8 :
            ind.rsi14 >= 55 && ind.rsi14 < 60 ? 0.6 :
                ind.rsi14 > 68 && ind.rsi14 <= 72 ? 0.6 : 0.0;

    const distScore =
        ind.distFrom200 >= 5 && ind.distFrom200 <= 20 ? 0.7 :
            ind.distFrom200 > 20 && ind.distFrom200 <= 30 ? 0.5 :
                ind.distFrom200 > 0 && ind.distFrom200 < 5 ? 0.3 : 0.0;

    const athScore =
        ind.pctFrom52wHigh >= 3 && ind.pctFrom52wHigh <= 10 ? 0.5 :
            ind.pctFrom52wHigh > 10 && ind.pctFrom52wHigh <= 15 ? 0.3 : 0.0;

    const scoreSetup = Math.min(2.0, rsiScore + distScore + athScore);

    // ── Component 5: Risk-Reward ─────────────────────────
    const scoreRR =
        rr >= 3.0 ? 2.0 :
            rr >= 2.5 ? 1.5 :
                rr >= 2.0 ? 1.0 :
                    rr >= 1.5 ? 0.5 : 0.0;

    let total = scoreTrend + scoreVolume + scoreRS + scoreSetup + scoreRR;

    if (ind.isBullFlag) {
        // Bull Flags have low volume intentionally, give them max volume points to compensate
        total += (2.0 - scoreVolume);
    } else if (ind.isDeepValue) {
        // Deep Value has falling 50DMA and low RSI, compensate Setup & Trend points
        total += (2.0 - scoreTrend) + (2.0 - scoreSetup);
    } else {
        // Normal VCP / Breakout Hard caps
        if (ind.ltp <= ind.dma200) total = Math.min(total, 4.0); // Below 200DMA
        if (ind.rsi14 < 55 || ind.rsi14 > 80) total = Math.min(total, 5.0); // RSI out of zone
        if (ind.volumeRatio < 1.2) total = Math.min(total, 5.5); // Weak volume
    }

    total = Math.min(10.0, +total.toFixed(1));

    return {
        scoreTrend: +scoreTrend.toFixed(1),
        scoreVolume: +scoreVolume.toFixed(1),
        scoreRS: +scoreRS.toFixed(1),
        scoreSetup: +scoreSetup.toFixed(1),
        scoreRR: +scoreRR.toFixed(1),
        total,
        passes: total >= 7.0,
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

export function isBreakout(candles: Candle[], lookback = 20): boolean {
    if (candles.length < lookback + 2) return false;
    const recent = candles.slice(-lookback - 1, -1);
    const resistance = Math.max(...recent.map(c => c.close));
    const today = candles[candles.length - 1];
    return today.close > resistance && today.close > today.open;
}

export function identifySetupType(ind: StockIndicators): string {
    if (ind.isBullFlag) return 'Bull Flag Breakout 🚩';
    if (ind.isDeepValue) return 'Deep Value Reversion 📉';

    const vcp = detectVCP(ind.candles);
    if (vcp.isVCP && vcp.quality >= 7) return 'VCP Breakout 🔥';
    if (vcp.isVCP) return 'VCP Contraction';

    const breakout = isBreakout(ind.candles, 20);
    const { ltp, ema20, ema50, high3m, rsi14, high52w } = ind;

    // Within 3% of 52W high with strong momentum
    if (ltp >= high52w * 0.97 && rsi14 >= 55) return 'Momentum Continuation';
    if (breakout && ltp >= high3m * 0.97 && rsi14 >= 55) return 'Breakout Base';
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
    const rsFactor = ind.outperformsNifty ? 0.15 : 0;
    const raw = (volFactor * 0.30 + rsiFactor * 0.25 + (ind.volumeRatio / 2.5) * 0.20 + rsFactor + vcpFactor) * 100;
    return Math.min(95, Math.max(30, Math.round(raw)));
}
