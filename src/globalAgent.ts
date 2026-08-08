import cron from 'node-cron';
import prisma from './prismaClient';
import { fetchLtp } from './dataService';
import { SYSTEM_AGENT_USER_ID } from './systemConstants';

const MAX_POSITIONS = 10;
const CAPITAL_PER_TRADE = 100000; // ₹1 Lakh
const BROKERAGE_FRICTION = 0.0015; // 0.15%

export function initGlobalAgent() {
    if (process.env.ENABLE_AUTOMATION !== 'true') {
        console.log('[GlobalAgent] Paper automation is disabled.');
        return;
    }
    console.log('[GlobalAgent] Initializing paper portfolio management...');

    // Scan creation is owned by ScanCoordinator. This worker only manages
    // positions created from a successfully completed scheduled scan.
    cron.schedule('*/5 9-15 * * 1-5', async () => {
        const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const hour = ist.getHours();
        const minute = ist.getMinutes();
        if ((hour === 9 && minute < 15) || (hour === 15 && minute > 30)) return;
        console.log('[GlobalAgent] Tracking Portfolio...');
        try {
            await trackPortfolio();
        } catch (e) {
            console.error('[GlobalAgent] Portfolio tracking failed:', e);
        }
    }, { timezone: 'Asia/Kolkata' });
}

async function trackPortfolio() {
    const openTrades = await prisma.trade.findMany({
        where: { userId: SYSTEM_AGENT_USER_ID, status: 'OPEN' }
    });

    if (openTrades.length === 0) return;

    for (const trade of openTrades) {
        try {
            const ltp = await fetchLtp(trade.ticker + '.NS');
            if (!ltp || isNaN(ltp)) continue;
            
            await prisma.trade.update({
                where: { id: trade.id },
                data: { currentPrice: ltp }
            });

            // Evaluate trailing stop or initial stop
            const stopLoss = trade.stopLossTrail || trade.stopLossInit;
            if (ltp <= stopLoss) {
                await closeTrade(trade, ltp, trade.stopLossTrail ? 'TRAIL' : 'STOP');
                continue;
            }

            // Evaluate take profit (50% scale out)
            if (ltp >= trade.target1 && !trade.stopLossTrail) {
                const soldQty = Math.floor(trade.quantity / 2);
                const runnerQty = trade.quantity - soldQty;

                if (soldQty <= 0) continue;

                // 1. Close 50% of the position as a winning trade
                await closePartialTrade(trade, soldQty, ltp, 'TARGET_1');

                // 2. Turn the remaining 50% into a Risk-Free Runner
                await prisma.trade.update({
                    where: { id: trade.id },
                    data: { 
                        quantity: runnerQty,
                        capitalDeployed: trade.entryPrice * runnerQty,
                        initialRiskRs: (trade.entryPrice - trade.stopLossInit) * runnerQty,
                        stopLossTrail: trade.entryPrice // Move stop to breakeven
                    }
                });
                console.log(`[GlobalAgent] TARGET 1 HIT for ${trade.ticker}. Sold ${soldQty}. Remaining ${runnerQty} as risk-free runner.`);
            }
        } catch (e: any) {
            console.error(`[GlobalAgent] Failed to track ${trade.ticker}:`, e.message);
        }
    }
}

async function closePartialTrade(trade: any, qtyToClose: number, exitPrice: number, exitReason: string) {
    let rawPnl = (exitPrice - trade.entryPrice) * qtyToClose;
    const capitalDeployed = trade.entryPrice * qtyToClose;
    const turnover = (trade.entryPrice * qtyToClose) + (exitPrice * qtyToClose);
    const brokerage = turnover * BROKERAGE_FRICTION;
    const pnlRs = rawPnl - brokerage;
    const pnlPct = (pnlRs / capitalDeployed) * 100;
    
    // Duplicate the trade as a CLOSED record for the ledger
    await prisma.trade.create({
        data: {
            userId: trade.userId,
            ticker: trade.ticker,
            companyName: trade.companyName,
            setupType: trade.setupType,
            confidenceScore: trade.confidenceScore,
            entryPrice: trade.entryPrice,
            quantity: qtyToClose,
            stopLossInit: trade.stopLossInit,
            target1: trade.target1,
            status: 'CLOSED',
            exitDate: new Date(),
            exitPrice,
            exitReason,
            pnlRs,
            pnlPct,
            capitalDeployed,
            initialRiskRs: (trade.entryPrice - trade.stopLossInit) * qtyToClose
        }
    });
}

async function closeTrade(trade: any, exitPrice: number, exitReason: string) {
    let rawPnl = (exitPrice - trade.entryPrice) * trade.quantity;
    
    // Deduct 0.15% brokerage friction on the total turnover (entry + exit)
    const turnover = (trade.entryPrice * trade.quantity) + (exitPrice * trade.quantity);
    const brokerage = turnover * BROKERAGE_FRICTION;
    const pnlRs = rawPnl - brokerage;
    const pnlPct = (pnlRs / trade.capitalDeployed) * 100;
    const rMultiple = trade.initialRiskRs ? pnlRs / trade.initialRiskRs : 0;

    await prisma.trade.update({
        where: { id: trade.id },
        data: {
            status: 'CLOSED',
            exitDate: new Date(),
            exitPrice,
            exitReason,
            pnlRs,
            pnlPct,
            rMultiple
        }
    });

    console.log(`[GlobalAgent] CLOSED ${trade.ticker} at ₹${exitPrice}. Reason: ${exitReason}. P&L: ₹${pnlRs.toFixed(2)} (${pnlPct.toFixed(2)}%)`);
}

export async function syncScanToGlobalTrackRecord(setups: any[]) {
    if (process.env.ENABLE_AUTOMATION !== 'true') return;
    if (process.env.PAPER_TRADING_MODE !== 'true' || process.env.ENABLE_LIVE_TRADING === 'true') {
        throw new Error('Autonomous trade synchronization requires paper-only mode.');
    }
    if (!setups || setups.length === 0) return;

    const buySignals = setups
        .filter((setup: any) => {
            const mlBuy = setup.mlAction === 'BUY' && Number(setup.mlWinProbability) >= 55;
            const scannerBuy = setup.aiSignal === 'BUY' && Number(setup.confidenceScore) >= 7;
            return mlBuy || scannerBuy;
        })
        .sort((a: any, b: any) =>
            Number(b.mlWinProbability ?? b.confidenceScore ?? 0) - Number(a.mlWinProbability ?? a.confidenceScore ?? 0));
    if (buySignals.length === 0) return;

    const openTradesCount = await prisma.trade.count({
        where: { userId: SYSTEM_AGENT_USER_ID, status: 'OPEN' },
    });
    let availableSlots = Math.max(0, MAX_POSITIONS - openTradesCount);
    if (availableSlots === 0) {
        console.log('[GlobalAgent] Paper portfolio is at maximum capacity.');
        return;
    }

    for (const setup of buySignals) {
        if (availableSlots <= 0) break;
        try {
            const existing = await prisma.trade.findFirst({
                where: { userId: SYSTEM_AGENT_USER_ID, ticker: setup.ticker, status: 'OPEN' }
            });
            if (existing) {
                if (setup.ltp) {
                    await prisma.trade.update({
                        where: { id: existing.id },
                        data: { currentPrice: setup.ltp }
                    });
                }
                continue;
            }

            const ltp = Number(setup.ltp || setup.price);
            if (!Number.isFinite(ltp) || ltp <= 0) continue;
            const quantity = Math.floor(CAPITAL_PER_TRADE / ltp);
            if (quantity <= 0) continue;
            const target1 = setup.target || ltp * 1.08;
            const stopLossInit = setup.stopLoss || ltp * 0.95;

            await prisma.trade.create({
                data: {
                    userId: SYSTEM_AGENT_USER_ID,
                    ticker: setup.ticker,
                    companyName: setup.ticker,
                    setupType: setup.setupType || 'AI Breakout',
                    confidenceScore: setup.confidenceScore ?? setup.mlWinProbability,
                    entryPrice: ltp,
                    currentPrice: ltp,
                    quantity,
                    stopLossInit,
                    target1,
                    status: 'OPEN',
                    initialRiskRs: Math.max((ltp - stopLossInit) * quantity, 0),
                    capitalDeployed: ltp * quantity,
                    notes: 'Synchronized from a real scanner result — paper trade only',
                }
            });
            console.log(`[GlobalAgent] PAPER TRADE SYNCED from scanner: ${setup.ticker} at ₹${ltp}`);
            availableSlots--;
        } catch (e: any) {
            console.error(`[GlobalAgent] Failed to sync ${setup.ticker}:`, e.message);
        }
    }
}
