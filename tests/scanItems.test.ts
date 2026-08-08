import { describe, expect, it } from 'vitest';
import { normalizeScanItems } from '../apex-intelligence/src/lib/scanItems';

describe('scan item API normalization', () => {
    it('maps backend TradeSetup fields into the dashboard presentation model', () => {
        const [item] = normalizeScanItems([{
            ticker: 'RELIANCE',
            sector: 'Energy',
            ltp: 1500,
            buyZone: 1490,
            target: 1620,
            target2: 1710,
            targetPct: 8,
            slPct: 4,
            stopLoss: 1440,
            riskReward: 2,
            confidenceScore: 7.5,
            aiSignal: 'BUY',
            status: 'TRIGGERED',
            catalyst: 'Volume confirmation',
            marketGrounding: { rsi14: 61, ema20: 1485, ema50: 1410 },
        }]);

        expect(item).toMatchObject({
            ticker: 'RELIANCE',
            buyZoneMin: 1490,
            buyZoneMax: 1490,
            target1: 1620,
            target2: 1710,
            target1Pct: 8,
            stopLoss: 1440,
            stopLossPct: 4,
            status: 'TRIGGERED',
            aiReasons: ['Volume confirmation'],
            rsi14: 61,
            ema20: 1485,
            ema50: 1410,
        });
    });

    it('filters unusable records and assigns monitor status to watch signals', () => {
        const items = normalizeScanItems([
            { ticker: 'TCS', ltp: 3000, aiSignal: 'WATCH' },
            { ticker: 'INVALID', ltp: 0 },
            null,
        ]);

        expect(items).toHaveLength(1);
        expect(items[0].status).toBe('QUALIFIED');
    });
});
