// portfolioService.ts — Trade lifecycle management for user portfolios
import prisma from './prismaClient';

export interface CreateTradeInput {
    ticker: string;
    companyName?: string;
    sector?: string;
    capCategory?: string;
    setupType?: string;
    regimeAtEntry?: string;
    confidenceScore?: number;
    entryPrice: number;
    quantity: number;
    stopLossInit: number;
    target1: number;
    target2?: number;
    notes?: string;
}

export interface CloseTrade {
    exitPrice: number;
    exitReason: 'TARGET' | 'STOP' | 'TRAIL' | 'MANUAL';
}

// ── Create a new trade ───────────────────────────────────────────────
export async function createTrade(userId: string, input: CreateTradeInput) {
    const initialRiskRs = (input.entryPrice - input.stopLossInit) * input.quantity;
    const capitalDeployed = input.entryPrice * input.quantity;

    return prisma.trade.create({
        data: {
            userId,
            ticker: input.ticker.toUpperCase(),
            companyName: input.companyName,
            sector: input.sector,
            capCategory: input.capCategory || 'UNKNOWN',
            setupType: input.setupType || 'Manual',
            regimeAtEntry: input.regimeAtEntry,
            confidenceScore: input.confidenceScore,
            entryPrice: input.entryPrice,
            quantity: input.quantity,
            stopLossInit: input.stopLossInit,
            target1: input.target1,
            target2: input.target2,
            initialRiskRs,
            capitalDeployed,
            status: 'OPEN',
            notes: input.notes,
        },
    });
}

// ── Close a trade — compute P&L ──────────────────────────────────────
export async function closeTrade(userId: string, tradeId: string, close: CloseTrade) {
    const trade = await prisma.trade.findFirst({
        where: { id: tradeId, userId, status: 'OPEN' },
    });
    if (!trade) throw new Error('Trade not found or already closed.');

    const exitPrice = close.exitPrice;
    const pnlRs = (exitPrice - trade.entryPrice) * trade.quantity;
    const pnlPct = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
    const initialRisk = trade.initialRiskRs || ((trade.entryPrice - trade.stopLossInit) * trade.quantity);
    const rMultiple = initialRisk !== 0 ? pnlRs / initialRisk : 0;
    const daysHeld = Math.ceil((Date.now() - new Date(trade.entryDate).getTime()) / 86400000);

    return prisma.trade.update({
        where: { id: tradeId },
        data: {
            status: 'CLOSED',
            exitDate: new Date(),
            exitPrice,
            exitReason: close.exitReason,
            pnlRs: +pnlRs.toFixed(2),
            pnlPct: +pnlPct.toFixed(2),
            rMultiple: +rMultiple.toFixed(2),
            daysHeld,
        },
    });
}

// ── Get portfolio summary ─────────────────────────────────────────────
export async function getPortfolioSummary(userId: string) {
    const trades = await prisma.trade.findMany({ where: { userId } });

    const open = trades.filter(t => t.status === 'OPEN');
    const closed = trades.filter(t => t.status === 'CLOSED');
    const won = closed.filter(t => (t.pnlRs || 0) > 0);
    const lost = closed.filter(t => (t.pnlRs || 0) <= 0);

    const totalCapitalDeployed = open.reduce((s, t) => s + (t.capitalDeployed || 0), 0);
    const totalRealizedPnL = closed.reduce((s, t) => s + (t.pnlRs || 0), 0);
    const avgR = closed.length
        ? closed.reduce((s, t) => s + (t.rMultiple || 0), 0) / closed.length
        : 0;
    const winRate = closed.length ? (won.length / closed.length) * 100 : 0;
    const avgWinPct = won.length
        ? won.reduce((s, t) => s + (t.pnlPct || 0), 0) / won.length
        : 0;
    const avgLossPct = lost.length
        ? lost.reduce((s, t) => s + (t.pnlPct || 0), 0) / lost.length
        : 0;
    const totalOpenRiskRs = open.reduce((s, t) => s + Math.max((t.initialRiskRs || 0), 0), 0);
    const avgOpenRiskPct = totalCapitalDeployed > 0 ? (totalOpenRiskRs / totalCapitalDeployed) * 100 : 0;
    const largestPositionRs = open.reduce((max, t) => Math.max(max, t.capitalDeployed || 0), 0);
    const largestPositionPct = totalCapitalDeployed > 0 ? (largestPositionRs / totalCapitalDeployed) * 100 : 0;
    const sectorExposure = open.reduce<Record<string, number>>((acc, trade) => {
        const key = trade.sector || 'Unspecified';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const [topSector = 'None', topSectorCount = 0] = Object.entries(sectorExposure)
        .sort((a, b) => b[1] - a[1])[0] || [];

    return {
        openCount: open.length,
        closedCount: closed.length,
        wonCount: won.length,
        lostCount: lost.length,
        winRate: +winRate.toFixed(1),
        avgR: +avgR.toFixed(2),
        avgWinPct: +avgWinPct.toFixed(2),
        avgLossPct: +avgLossPct.toFixed(2),
        totalCapitalDeployed: +totalCapitalDeployed.toFixed(2),
        totalRealizedPnL: +totalRealizedPnL.toFixed(2),
        totalOpenRiskRs: +totalOpenRiskRs.toFixed(2),
        avgOpenRiskPct: +avgOpenRiskPct.toFixed(2),
        largestPositionPct: +largestPositionPct.toFixed(2),
        topSector,
        topSectorCount,
    };
}

// ── Update current price for open trades ─────────────────────────────
export async function updateTradeCurrentPrice(tradeId: string, currentPrice: number) {
    return prisma.trade.update({
        where: { id: tradeId },
        data: { currentPrice },
    });
}
