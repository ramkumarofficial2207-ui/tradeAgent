import { pushEvent } from './agentEvents';
import { fetchHistoricalData } from './dataService';
import prisma from './prismaClient';

/**
 * TriggerMonitor
 * Advisory service that monitors pre-authorized trade setups and squawks 
 * when price or volume conditions are met. (Advisor-Only Vision)
 */
export async function runTriggerMonitoring() {
    // 1. Find all authorized setups waiting for trigger
    const authorizedSetups = await prisma.historicalSetup.findMany({
        where: {
            status: 'AUTHORIZED',
            resolvedAt: null
        }
    });

    if (authorizedSetups.length === 0) return;

    console.log(`[TriggerMonitor] 📡 Monitoring ${authorizedSetups.length} authorized setups for breakout signals...`);

    for (const setup of authorizedSetups) {
        try {
            const now = new Date();
            const created = new Date(setup.createdAt);

            // Authorization expires after 24 hours
            if (now.getTime() - created.getTime() > 24 * 60 * 60 * 1000) {
                await prisma.historicalSetup.update({
                    where: { id: setup.id },
                    data: { status: 'EXPIRED', resolvedAt: now }
                });
                continue;
            }

            const ticker = setup.ticker.endsWith('.NS') ? setup.ticker : `${setup.ticker}.NS`;
            const candles = await fetchHistoricalData(ticker, 1);
            if (candles.length === 0) continue;

            const latest = candles[candles.length - 1];

            // Advisor Squawk: Price crossing trigger_price
            if (latest.close >= setup.entryPrice) {
                pushEvent('TRADE_ALERT', 'success', `🎯 TRIGGER HIT: ${setup.ticker}`,
                    `Price ₹${latest.close} crossed the high-conviction trigger ₹${setup.entryPrice}. Monitor for entry.`);

                // Transition to MONITORED status for virtual tracking
                await prisma.historicalSetup.update({
                    where: { id: setup.id },
                    data: {
                        status: 'MONITORED',
                        resultPct: 0
                    }
                });

                // Create a virtual trade record if not exists to track theoretical performance
                const existingTrade = await prisma.trade.findFirst({
                    where: { ticker: setup.ticker, status: 'OPEN' }
                });

                if (!existingTrade) {
                    await prisma.trade.create({
                        data: {
                            userId: '0', // System user or default
                            ticker: setup.ticker,
                            companyName: setup.ticker,
                            sector: 'Monitored',
                            entryPrice: setup.entryPrice,
                            quantity: 100, // Dummy quantity for P&L calc
                            stopLossInit: setup.stopLoss,
                            target1: setup.targetPrice,
                            status: 'OPEN', // PositionManager will pick this up
                            setupType: setup.setupType,
                            confidenceScore: setup.confidenceScore,
                            notes: `MONITORED_ADVISOR | Trigger: ${setup.entryPrice} | ATR: ${(setup.entryPrice * 0.03).toFixed(2)}`
                        }
                    });
                }
            }

        } catch (error: any) {
            console.error(`[TriggerMonitor] Error checking ${setup.ticker}:`, error.message);
        }
    }
}
