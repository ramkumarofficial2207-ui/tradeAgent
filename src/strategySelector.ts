import prisma from './prismaClient';

export interface StrategyPerformance {
    strategyName: string;
    totalSignals: number;
    winCount: number;
    lossCount: number;
    winRatePct: number;
    status: 'ACTIVE' | 'RESTRICTED' | 'DISABLED';
    priorityMultiplier: number;
}

export const ALL_STRATEGIES = [
    'EPISODIC_PIVOT',
    'ANCHORED_VWAP_RECLAIM',
    'HIGH_TIGHT_FLAG',
    'EMA20_PULLBACK',
    'PULLBACK_CONTINUATION',
    'VCP_BREAKOUT',
    'TTM_SQUEEZE',
    'NR4_NR7_INSIDE_BAR',
    'EARNINGS_CONTINUATION',
    'DEEP_VALUE',
];

/**
 * Evaluates rolling 30-day win rates from DB and selects active high-winning strategies
 */
export async function getActiveStrategies(): Promise<Record<string, StrategyPerformance>> {
    const result: Record<string, StrategyPerformance> = {};

    // Cold-start strategies remain enabled, but no historical performance is invented.
    for (const strat of ALL_STRATEGIES) {
        result[strat] = {
            strategyName: strat,
            totalSignals: 0,
            winCount: 0,
            lossCount: 0,
            winRatePct: 0,
            status: 'ACTIVE',
            priorityMultiplier: 1.0,
        };
    }

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const setups = await prisma.historicalSetup.findMany({
            where: { createdAt: { gte: thirtyDaysAgo } },
            select: { setupType: true, status: true },
        });

        if (setups.length >= 5) {
            const stats: Record<string, { total: number; won: number }> = {};
            for (const s of setups) {
                const type = s.setupType || 'EMA20_PULLBACK';
                if (!stats[type]) stats[type] = { total: 0, won: 0 };
                stats[type].total++;
                if (s.status === 'WON') stats[type].won++;
            }

            for (const strat of ALL_STRATEGIES) {
                const s = stats[strat];
                if (s && s.total >= 3) {
                    const winRate = +((s.won / s.total) * 100).toFixed(1);
                    let status: 'ACTIVE' | 'RESTRICTED' | 'DISABLED' = 'ACTIVE';
                    let priorityMultiplier = 1.0;

                    if (winRate >= 65) {
                        status = 'ACTIVE';
                        priorityMultiplier = 1.15;
                    } else if (winRate >= 50) {
                        status = 'RESTRICTED';
                        priorityMultiplier = 0.85;
                    } else {
                        status = 'DISABLED';
                        priorityMultiplier = 0.0;
                    }

                    result[strat] = {
                        strategyName: strat,
                        totalSignals: s.total,
                        winCount: s.won,
                        lossCount: s.total - s.won,
                        winRatePct: winRate,
                        status,
                        priorityMultiplier,
                    };
                }
            }
        }
    } catch {
        /* fallback to defaults */
    }

    return result;
}
