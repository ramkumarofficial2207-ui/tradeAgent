import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        trade: {
            updateMany: vi.fn(),
            findFirstOrThrow: vi.fn(),
        },
    },
}));

vi.mock('../src/prismaClient', () => ({ default: prismaMock }));
vi.mock('../src/newsIntel/service', () => ({ getTickerNewsDigest: vi.fn() }));

import { buildCloseMetrics, updateOwnedTrade } from '../src/portfolioService';

describe('trade ownership and close metrics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('scopes every trade update to both trade id and authenticated user id', async () => {
        prismaMock.trade.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.trade.findFirstOrThrow.mockResolvedValue({ id: 'trade-1', userId: 'owner-1' });

        await updateOwnedTrade('owner-1', 'trade-1', { currentPrice: 125 });

        expect(prismaMock.trade.updateMany).toHaveBeenCalledWith({
            where: { id: 'trade-1', userId: 'owner-1', status: 'OPEN' },
            data: { currentPrice: 125 },
        });
        expect(prismaMock.trade.findFirstOrThrow).toHaveBeenCalledWith({
            where: { id: 'trade-1', userId: 'owner-1' },
        });
    });

    it('does not return a trade when the owner-scoped update matched nothing', async () => {
        prismaMock.trade.updateMany.mockResolvedValue({ count: 0 });

        await expect(updateOwnedTrade('attacker', 'trade-1', { notes: 'tampered' }))
            .rejects.toThrow('Open trade not found.');
        expect(prismaMock.trade.findFirstOrThrow).not.toHaveBeenCalled();
    });

    it('computes realized P&L, R-multiple, and holding duration on close', () => {
        const metrics = buildCloseMetrics({
            entryPrice: 100,
            quantity: 10,
            stopLossInit: 90,
            initialRiskRs: 100,
            entryDate: new Date('2026-01-01T00:00:00.000Z'),
        }, 120, new Date('2026-01-04T00:00:00.000Z'));

        expect(metrics).toEqual({ pnlRs: 200, pnlPct: 20, rMultiple: 2, daysHeld: 3 });
    });
});
