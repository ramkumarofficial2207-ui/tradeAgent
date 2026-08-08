import { pushEvent } from './agentEvents';
import { fetchHistoricalData } from './dataService';
import prisma from './prismaClient';
import { SYSTEM_AGENT_USER_ID } from './systemConstants';

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
                    where: { userId: SYSTEM_AGENT_USER_ID, ticker: setup.ticker, status: 'OPEN' }
                });

                if (!existingTrade) {
                    const quantity = Math.max(1, Math.floor(100000 / setup.entryPrice));
                    await prisma.trade.create({
                        data: {
                            userId: SYSTEM_AGENT_USER_ID,
                            ticker: setup.ticker,
                            companyName: setup.ticker,
                            entryPrice: setup.entryPrice,
                            quantity,
                            stopLossInit: setup.stopLoss,
                            target1: setup.targetPrice,
                            status: 'OPEN',
                            setupType: setup.setupType,
                            confidenceScore: setup.confidenceScore,
                            capitalDeployed: setup.entryPrice * quantity,
                            initialRiskRs: Math.max((setup.entryPrice - setup.stopLoss) * quantity, 0),
                            notes: `PAPER_MONITORED_ADVISOR | Trigger: ${setup.entryPrice}`
                        }
                    });
                }
            }

        } catch (error: any) {
            console.error(`[TriggerMonitor] Error checking ${setup.ticker}:`, error.message);
        }
    }
}
