import { describe, expect, it } from 'vitest';
import { computeAtr14 } from '../src/indicators';
import type { Candle } from '../src/types';

function candle(index: number): Candle {
    return {
        date: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
        open: 100,
        high: 105,
        low: 95,
        close: 100,
        volume: 1_000,
    };
}

describe('indicator calculations', () => {
    it('returns zero when ATR has insufficient history', () => {
        expect(computeAtr14(Array.from({ length: 14 }, (_, index) => candle(index)))).toBe(0);
    });

    it('calculates ATR14 from true ranges without synthetic fallback values', () => {
        const candles = Array.from({ length: 15 }, (_, index) => candle(index));
        expect(computeAtr14(candles)).toBe(10);
    });
});
