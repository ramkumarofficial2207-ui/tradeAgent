import { pushEvent } from './agentEvents';
import { fetchHistoricalData } from './dataService';
import prisma from './prismaClient';
import { analyzeStocksWithAI } from './aiAdvisor';
import { SECTOR_MAP } from './dataService';
import { computeAtr14 } from './indicators';
import { buildCloseMetrics } from './portfolioService';

/**
 * PositionManager
 * Handles live trade management: trailing stops, multi-stage take profits, 
 * and thesis invalidation.
 */
export async function runActivePositionManagement() {
    if (process.env.ENABLE_AUTOMATION !== 'true') return;
    if (process.env.PAPER_TRADING_MODE !== 'true') {
        console.warn('[PositionManager] Disabled: live exit-order execution is not implemented.');
        return;
    }

    // 1. Fetch all OPEN trades
    const openTrades = await prisma.trade.findMany({
        where: { status: 'OPEN' }
    });

    if (openTrades.length === 0) return;

    console.log(`[PositionManager] 🛡️ Managing ${openTrades.length} open positions...`);

    for (const trade of openTrades) {
        try {
            const ticker = trade.ticker.endsWith('.NS') ? trade.ticker : `${trade.ticker}.NS`;
            const candles = await fetchHistoricalData(ticker, 5); // Need some history for ATR
            if (candles.length === 0) continue;

            const latest = candles[candles.length - 1];
            const currentPrice = latest.close;

            // ── Update Current Price in DB ──
            await prisma.trade.update({
                where: { id: trade.id },
                data: { currentPrice }
            });

            // ── ATR-based Trailing Stop Management ──
            // Formula: If price moves up, trail stop at (CurrentPrice - 2*ATR)
            // But only move it UP, never DOWN.
            const atr14 = computeAtr14(candles);
            const potentialTrail = atr14 > 0 ? currentPrice - (1.5 * atr14) : null;
            const currentStop = trade.stopLossTrail || trade.stopLossInit;

            if (potentialTrail !== null && potentialTrail > currentStop) {
                console.log(`[PositionManager] 📈 Trailing stop for ${trade.ticker} raised from ₹${currentStop.toFixed(2)} to ₹${potentialTrail.toFixed(2)}`);
                await prisma.trade.update({
                    where: { id: trade.id },
                    data: { stopLossTrail: potentialTrail }
                });

                pushEvent('TRADE_ALERT', 'info', `[PAPER] Trailing Stop Raised: ${trade.ticker}`,
                    `LTP ₹${currentPrice.toFixed(2)} pushed trailing stop to ₹${potentialTrail.toFixed(2)}.`);
            }

            // ── Scaling Out (T1 Hit) ──
            // If price >= T1 and we haven't scaled out yet
            if (currentPrice >= trade.target1 && !trade.notes?.includes('SCALED_OUT')) {
                const sellQty = Math.floor(trade.quantity * 0.33);
                if (sellQty > 0) {

                pushEvent('TRADE_ALERT', 'success', `[PAPER] ${trade.ticker} T1 Hit`,
                    `Price ₹${currentPrice.toFixed(2)} hit Target 1. Scaling out 33% (${sellQty} shares) and moving SL to Break-Even.`);

                // Update trade record: Quantity reduced, Move SL to Break-Even
                await prisma.trade.update({
                    where: { id: trade.id },
                    data: {
                        quantity: trade.quantity - sellQty,
                        stopLossTrail: trade.entryPrice, // Move to Break-Even
                        notes: (trade.notes || '') + ' | SCALED_OUT'
                    }
                });
                }

            }

            // ── Exit Check: Stop Loss Triggered ──
            if (currentPrice <= currentStop) {
                const profitPct = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

                pushEvent('TRADE_ALERT', profitPct > 0 ? 'success' : 'critical',
                    `🛑 EXIT TRIGGERED: ${trade.ticker}`,
                    `Price ₹${currentPrice.toFixed(2)} hit Stop Loss ₹${currentStop.toFixed(2)}. Net: ${profitPct.toFixed(2)}%`);

                const closeMetrics = buildCloseMetrics(trade, currentPrice);
                await prisma.trade.update({
                    where: { id: trade.id },
                    data: {
                        status: 'CLOSED',
                        exitPrice: currentPrice,
                        exitDate: new Date(),
                        exitReason: 'STOP_LOSS',
                        ...closeMetrics,
                    }
                });
            }

            // ── Thesis Check: Every 4 Hours ──
            const lastCheck = trade.notes?.includes('THESIS_LAST_CHECK:')
                ? new Date(trade.notes.split('THESIS_LAST_CHECK:')[1].split(' |')[0])
                : new Date(0);

            if (Date.now() - lastCheck.getTime() > 4 * 60 * 60 * 1000) {
                console.log(`[PositionManager] 🧠 Running AI thesis re-validation for ${trade.ticker}...`);

                const aiResult = await analyzeStocksWithAI([{
                    ticker: trade.ticker,
                    close: currentPrice,
                    sector: trade.sector || SECTOR_MAP[trade.ticker] || 'Unknown',
                    setupType: trade.setupType,
                    confidenceScore: trade.confidenceScore
                }]);

                const assessment = aiResult.get(trade.ticker);
                if (assessment && assessment.signal === 'REJECT') {
                    pushEvent('TRADE_ALERT', 'critical', `[PAPER] THESIS INVALIDATED: ${trade.ticker}`,
                        `AI Advisor recommends REJECT: "${assessment.logic}". Closing position to protect capital.`);

                    const closeMetrics = buildCloseMetrics(trade, currentPrice);
                    await prisma.trade.update({
                        where: { id: trade.id },
                        data: {
                            status: 'CLOSED',
                            exitPrice: currentPrice,
                            exitDate: new Date(),
                            exitReason: 'THESIS_INVALIDATED',
                            ...closeMetrics,
                            notes: (trade.notes || '') + ` | THESIS_REJECTED: ${assessment.logic}`
                        }
                    });
                } else {
                    // Update last check timestamp in notes
                    const updatedNotes = (trade.notes || '').replace(/THESIS_LAST_CHECK:.*?(\s|$)/, '') + ` | THESIS_LAST_CHECK:${new Date().toISOString()}`;
                    await prisma.trade.update({
                        where: { id: trade.id },
                        data: { notes: updatedNotes }
                    });
                }
            }

        } catch (error: any) {
            console.error(`[PositionManager] Error managing ${trade.ticker}:`, error.message);
        }
    }
}
