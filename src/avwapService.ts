import { Candle } from './types';

export interface AVWAPResult {
    avwap: number;
    anchorDate: string;
    anchorIndex: number;
    holdingSupport: boolean;
    distPct: number;
}

/**
 * Calculates Anchored VWAP from a specific candle anchor index
 */
export function calculateAnchoredVwap(candles: Candle[], anchorIndex: number): AVWAPResult | null {
    if (!candles || candles.length === 0 || anchorIndex < 0 || anchorIndex >= candles.length) {
        return null;
    }

    const slice = candles.slice(anchorIndex);
    let cumulativeVolume = 0;
    let cumulativeTPV = 0; // Typical Price x Volume

    for (const c of slice) {
        const typicalPrice = (c.high + c.low + c.close) / 3;
        cumulativeTPV += typicalPrice * c.volume;
        cumulativeVolume += c.volume;
    }

    if (cumulativeVolume <= 0) return null;

    const avwap = +(cumulativeTPV / cumulativeVolume).toFixed(2);
    const latest = candles[candles.length - 1];
    const distPct = +(((latest.close - avwap) / avwap) * 100).toFixed(2);
    const holdingSupport = latest.close >= avwap * 0.995 && latest.low <= avwap * 1.015;

    return {
        avwap,
        anchorDate: new Date(candles[anchorIndex].timestamp || candles[anchorIndex].date || Date.now()).toISOString().slice(0, 10),
        anchorIndex,
        holdingSupport,
        distPct,
    };
}

/**
 * Finds the optimal anchor point (Highest High in last 60 days or major gap candle)
 */
export function getAutoAnchoredVwap(candles: Candle[]): AVWAPResult | null {
    if (!candles || candles.length < 20) return null;

    // Search last 60 candles for highest high anchor point
    const lookback = Math.min(candles.length, 60);
    const slice = candles.slice(candles.length - lookback);

    let maxHigh = -1;
    let maxIdx = 0;

    for (let i = 0; i < slice.length; i++) {
        if (slice[i].high > maxHigh) {
            maxHigh = slice[i].high;
            maxIdx = i;
        }
    }

    const globalAnchorIdx = (candles.length - lookback) + maxIdx;
    return calculateAnchoredVwap(candles, globalAnchorIdx);
}
