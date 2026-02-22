// =====================================================
// indicators.ts — Technical indicators + VCP detector
// =====================================================

import { SMA, EMA, RSI } from 'technicalindicators';
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
    const volumes = candles.map(c => c.volume);

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

    const last20Vol = volumes.slice(-21, -1);
    const avgVolume20d = avg(last20Vol);
    const todayVolume = volumes[volumes.length - 1];
    const volumeRatio = avgVolume20d > 0 ? todayVolume / avgVolume20d : 0;

    const lookback63 = Math.max(0, closes.length - 64);
    const price63dAgo = closes[lookback63];
    const returns3m = ((ltp - price63dAgo) / price63dAgo) * 100;

    let nifty3mReturn = 0;
    if (niftyCandles.length >= 64) {
        const nc = niftyCandles.map(c => c.close);
        const lb = Math.max(0, nc.length - 64);
        nifty3mReturn = ((nc[nc.length - 1] - nc[lb]) / nc[lb]) * 100;
    }

    const last63 = candles.slice(-63);
    const high3m = Math.max(...last63.map(c => c.high));
    const low3m = Math.min(...last63.map(c => c.low));

    return {
        ticker, ltp, dma200, ema50, ema20, rsi14,
        avgVolume20d, todayVolume, volumeRatio,
        high3m, low3m, returns3m, nifty3mReturn,
        outperformsNifty: returns3m > nifty3mReturn,
        candles,
    };
}

// ─── VCP (Volatility Contraction Pattern) Detector ───
// Minervini's signature pattern: progressively tighter bases
// before a pivot breakout on expanding volume

export interface VCPResult {
    isVCP: boolean;
    quality: number;        // 0–10 (higher = better setup)
    tightness: number;      // % range of the final base (lower = tighter)
    contractionCount: number; // How many contracting stages detected
    pivotPrice: number;     // The breakout price (the pivot high)
    pctFromPivot: number;   // How far below pivot the price currently is
}

export function detectVCP(candles: Candle[], currentIdx?: number): VCPResult {
    const EMPTY: VCPResult = { isVCP: false, quality: 0, tightness: 99, contractionCount: 0, pivotPrice: 0, pctFromPivot: 99 };
    const idx = currentIdx ?? candles.length - 1;
    const lookback = Math.min(idx, 65); // Max 65-day look window
    if (lookback < 25) return EMPTY;

    const slice = candles.slice(idx - lookback, idx + 1);
    const highs = slice.map(c => c.high);
    const lows = slice.map(c => c.low);
    const closes = slice.map(c => c.close);
    const volumes = slice.map(c => c.volume);

    const currentClose = closes[closes.length - 1];
    const currentVol = volumes[volumes.length - 1];

    // ── 1. Find the swing high (pivot) ────────────────
    const peakHigh = Math.max(...highs);
    const peakIdx = highs.indexOf(peakHigh);

    // Peak must be in the first 65% of the window to have formed a base after it
    if (peakIdx > lookback * 0.65 || (lookback - peakIdx) < 10) return EMPTY;

    // Current price must be within 5% of the pivot (about to break out)
    const pctFromPivot = (peakHigh - currentClose) / peakHigh * 100;
    if (pctFromPivot > 5) return EMPTY;

    // ── 2. Measure contracting stages after the peak ──
    const postPeak = slice.slice(peakIdx);
    const ppH = postPeak.map(c => c.high);
    const ppL = postPeak.map(c => c.low);
    const ppV = postPeak.map(c => c.volume);
    const n = postPeak.length;

    if (n < 9) return EMPTY;

    // Split into 3 equal sections to measure contraction
    const t = Math.floor(n / 3);
    const s1Range = (Math.max(...ppH.slice(0, t)) - Math.min(...ppL.slice(0, t))) / currentClose * 100;
    const s2Range = (Math.max(...ppH.slice(t, t * 2)) - Math.min(...ppL.slice(t, t * 2))) / currentClose * 100;
    const s3Range = (Math.max(...ppH.slice(t * 2)) - Math.min(...ppL.slice(t * 2))) / currentClose * 100;

    // Count contracting stages (each must be smaller than previous)
    const contractionCount = (s2Range < s1Range * 0.8 ? 1 : 0) + (s3Range < s2Range * 0.8 ? 1 : 0);

    // Tightness = range of the final base (< 7% is VCP-quality, < 4% is elite)
    const tightness = s3Range;

    // ── 3. Volume analysis: should dry up in base, expand on breakout ──
    const avgBaseVol = avg(ppV.slice(t * 2, -1)); // avg vol in last section (excluding today)
    const avgEarlyVol = avg(ppV.slice(0, t));      // avg vol after peak
    const volDryUp = avgBaseVol < avgEarlyVol * 0.75; // At least 25% lower vol
    const breakoutVol = currentVol > avgBaseVol * 1.4; // Expanding on breakout

    // ── 4. Quality Score (0–10) ───────────────────────
    let quality = 0;
    if (contractionCount >= 1) quality += 3;
    if (contractionCount >= 2) quality += 2;  // Double contraction is elite
    if (tightness < 7) quality += 2;
    if (tightness < 4) quality += 1;           // Elite tight base
    if (volDryUp) quality += 1;
    if (breakoutVol) quality += 1;
    if (pctFromPivot < 2) quality += 1;        // At the pivot — prime entry

    const isVCP = quality >= 5 && contractionCount >= 1 && tightness < 12 && pctFromPivot <= 5;

    return { isVCP, quality, tightness, contractionCount, pivotPrice: peakHigh, pctFromPivot };
}

// ─── Breakout Detection ────────────────────────────────
// True breakout: today's close above the highest close of last N days

export function isBreakout(candles: Candle[], lookback = 15): boolean {
    if (candles.length < lookback + 2) return false;
    const recent = candles.slice(-lookback - 1, -1); // exclude today
    const resistance = Math.max(...recent.map(c => c.close));
    const today = candles[candles.length - 1];
    return today.close > resistance && today.close > today.open; // green breakout candle
}

// ─── Setup Type Identifier ────────────────────────────
export function identifySetupType(ind: StockIndicators): string {
    const vcp = detectVCP(ind.candles);
    if (vcp.isVCP && vcp.quality >= 7) return 'VCP Breakout 🔥';
    if (vcp.isVCP) return 'Volatility Contraction (VCP)';

    const breakout = isBreakout(ind.candles, 15);
    const { ltp, ema20, ema50, high3m, rsi14 } = ind;

    if (ltp < ema50 * 0.85 && rsi14 < 30) return 'Deep Value Reversion 📉';

    if (breakout && ltp >= high3m * 0.97 && rsi14 >= 44) return 'Breakout Base';

    if (Math.abs(ltp - ema20) / ema20 < 0.02) return 'EMA20 Bounce';
    return 'Pullback Continuation';
}

// ─── Hit Probability Estimator ─────────────────────────
export function estimateHitProbability(ind: StockIndicators, targetPct: number): number {
    const { candles } = ind;
    const closes = candles.slice(-30).map(c => c.close);
    const dailyReturns = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
    const sumSq = dailyReturns.reduce((a, r) => a + r * r, 0);
    const stdDev = Math.sqrt(sumSq / dailyReturns.length) * Math.sqrt(252) * 100;

    const volatilityFactor = Math.max(0, 1 - stdDev / 80);
    const rsiFactor = (50 - Math.abs(ind.rsi14 - 45)) / 50;
    const volFactor = Math.min(ind.volumeRatio / 2.5, 1);
    const rsFactor = ind.outperformsNifty ? 0.15 : 0;

    // VCP bonus: tighter base = higher probability
    const vcp = detectVCP(ind.candles);
    const vcpFactor = vcp.isVCP ? (0.1 + (10 - vcp.tightness) / 100) : 0;

    const raw = (volatilityFactor * 0.30 + rsiFactor * 0.25 + volFactor * 0.20 + rsFactor + vcpFactor) * 100;
    return Math.min(95, Math.max(30, Math.round(raw)));
}
