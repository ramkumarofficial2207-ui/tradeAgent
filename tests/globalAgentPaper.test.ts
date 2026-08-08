import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        trade: {
            count: vi.fn(),
            findFirst: vi.fn(),
            update: vi.fn(),
            create: vi.fn(),
            findMany: vi.fn(),
        },
    },
}));

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('../src/prismaClient', () => ({ default: prismaMock }));
vi.mock('../src/dataService', () => ({ fetchLtp: vi.fn() }));

import { syncScanToGlobalTrackRecord } from '../src/globalAgent';

describe('scheduled scan paper-trade handoff', () => {
    const original = {
        automation: process.env.ENABLE_AUTOMATION,
        paper: process.env.PAPER_TRADING_MODE,
        live: process.env.ENABLE_LIVE_TRADING,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ENABLE_AUTOMATION = 'true';
        process.env.PAPER_TRADING_MODE = 'true';
        process.env.ENABLE_LIVE_TRADING = 'false';
        prismaMock.trade.count.mockResolvedValue(0);
        prismaMock.trade.findFirst.mockResolvedValue(null);
        prismaMock.trade.create.mockResolvedValue({ id: 'paper-trade-1' });
    });

    afterEach(() => {
        if (original.automation === undefined) delete process.env.ENABLE_AUTOMATION;
        else process.env.ENABLE_AUTOMATION = original.automation;
        if (original.paper === undefined) delete process.env.PAPER_TRADING_MODE;
        else process.env.PAPER_TRADING_MODE = original.paper;
        if (original.live === undefined) delete process.env.ENABLE_LIVE_TRADING;
        else process.env.ENABLE_LIVE_TRADING = original.live;
    });

    it('creates a paper position only for a strong BUY setup', async () => {
        await syncScanToGlobalTrackRecord([{
            ticker: 'RELIANCE',
            ltp: 1_500,
            target: 1_620,
            stopLoss: 1_440,
            confidenceScore: 7.5,
            aiSignal: 'BUY',
            setupType: 'Compression Breakout',
        }]);

        expect(prismaMock.trade.create).toHaveBeenCalledOnce();
        expect(prismaMock.trade.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ ticker: 'RELIANCE', status: 'OPEN' }),
        }));
    });

    it('does not create trades when automation is disabled', async () => {
        process.env.ENABLE_AUTOMATION = 'false';
        await syncScanToGlobalTrackRecord([{
            ticker: 'RELIANCE',
            ltp: 1_500,
            confidenceScore: 9,
            aiSignal: 'BUY',
        }]);
        expect(prismaMock.trade.create).not.toHaveBeenCalled();
    });

    it('refuses autonomous synchronization when live trading is enabled', async () => {
        process.env.ENABLE_LIVE_TRADING = 'true';
        await expect(syncScanToGlobalTrackRecord([])).rejects.toThrow(/paper-only mode/i);
    });
});
