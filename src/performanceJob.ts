import prisma from './prismaClient';
import { fetchHistoricalData } from './dataService';

export async function updatePerformanceRecords() {
    console.log('[Performance] Running nightly verifier job...');
    try {
        const inProgress = await prisma.historicalSetup.findMany({
            where: { status: 'IN_PROGRESS' }
        });

        console.log(`[Performance] Found ${inProgress.length} active setups to verify.`);

        let updatedCount = 0;

        for (const setup of inProgress) {
            try {
                // Fetch recent price
                const candles = await fetchHistoricalData(`${setup.ticker}.NS`, 5);
                if (candles.length === 0) continue;

                // Most recent closing price (or high/low for touches)
                // To be exact, target hit usually requires hitting High, Stop Loss requires hitting Low.
                // For simplicity, we can check if the current close crossed them, or if the recent high/low touched them.
                const latest = candles[candles.length - 1];

                const currentPrice = latest.close;

                // Did it hit target?
                if (latest.high >= setup.targetPrice || currentPrice >= setup.targetPrice) {
                    const resultPct = ((setup.targetPrice - setup.entryPrice) / setup.entryPrice) * 100;
                    await prisma.historicalSetup.update({
                        where: { id: setup.id },
                        data: {
                            status: 'WON',
                            resultPct: +resultPct.toFixed(2),
                            resolvedAt: new Date()
                        }
                    });
                    updatedCount++;
                }
                // Did it hit stop loss?
                else if (latest.low <= setup.stopLoss || currentPrice <= setup.stopLoss) {
                    const resultPct = ((setup.stopLoss - setup.entryPrice) / setup.entryPrice) * 100;
                    await prisma.historicalSetup.update({
                        where: { id: setup.id },
                        data: {
                            status: 'LOST',
                            resultPct: +resultPct.toFixed(2),
                            resolvedAt: new Date()
                        }
                    });
                    updatedCount++;
                }

                // If neither, remains IN_PROGRESS

            } catch (err: any) {
                console.error(`[Performance] Error verifying ${setup.ticker}:`, err.message);
            }
        }

        console.log(`[Performance] Job complete. Updated ${updatedCount} records.`);

    } catch (error: any) {
        console.error('[Performance] Tracker job failed:', error.message);
    }
}
