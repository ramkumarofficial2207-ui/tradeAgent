import { EMA } from 'technicalindicators';
import { ActiveTrade, MarketDataApi, TradeSetup } from './types';
import { fetchHistoricalData, NSE_UNIVERSE } from './dataService';
import prisma from './prismaClient';

// For now, assume a single user environment until auth is implemented
const MOCK_USER_ID = "mock-user-123";

// Ensure mock user exists (Temporary setup)
async function ensureUser() {
    const user = await prisma.user.findUnique({ where: { id: MOCK_USER_ID } });
    if (!user) {
        try {
            await prisma.user.create({
                data: { id: MOCK_USER_ID, email: 'trader@swingedge.com', name: 'Pro Trader' }
            });
        } catch { } // Ignore race conditions
    }
}
ensureUser();

export async function addTrade(setup: TradeSetup): Promise<void> {
    const existing = await prisma.trade.findFirst({
        where: { userId: MOCK_USER_ID, ticker: setup.ticker, status: 'active' }
    });

    if (existing) return;

    await prisma.trade.create({
        data: {
            userId: MOCK_USER_ID,
            ticker: setup.ticker,
            entryPrice: setup.buyZone,
            target: setup.target,
            stopLoss: setup.stopLoss,
            status: 'active',
            currentPrice: setup.ltp,
            quantity: 10, // Default mock qty
            setupType: setup.setupType || 'Pullback Continuation',
        }
    });
}

export async function removeTrade(ticker: string): Promise<void> {
    await prisma.trade.deleteMany({
        where: { userId: MOCK_USER_ID, ticker: ticker }
    });
}

export async function watchTrades(dataApi: MarketDataApi | null = null): Promise<any[]> {
    const trades = await prisma.trade.findMany({ where: { userId: MOCK_USER_ID, status: 'active' } });
    if (!trades.length) return [];

    const updated = [];

    for (const trade of trades) {
        const yahooTicker = NSE_UNIVERSE[trade.ticker] ?? `${trade.ticker}.NS`;
        const candles = dataApi
            ? await dataApi.getHistoricalData(trade.ticker, '1d', 120)
            : await fetchHistoricalData(yahooTicker, 120);

        if (candles.length < 55) {
            updated.push(trade);
            continue;
        }

        const closes = candles.map((c) => c.close);
        const ltp = closes[closes.length - 1];
        const pnlPct = +(((ltp - trade.entryPrice) / trade.entryPrice) * 100).toFixed(2);

        const ema20Series = EMA.calculate({ period: 20, values: closes });
        const ema50Series = EMA.calculate({ period: 50, values: closes });
        const ema20 = ema20Series[ema20Series.length - 1];
        const ema50 = ema50Series[ema50Series.length - 1];

        let newStatus = 'active';

        if (Number.isFinite(ema50) && ltp < ema50) {
            newStatus = 'closed';
        }

        if (ltp <= trade.stopLoss) {
            newStatus = 'closed';
        }

        if (ltp >= trade.target) {
            newStatus = 'closed';
        }

        const updatedTrade = await prisma.trade.update({
            where: { id: trade.id },
            data: {
                currentPrice: +ltp.toFixed(2),
                status: newStatus,
                exitPrice: newStatus === 'closed' ? +ltp.toFixed(2) : null,
                exitDate: newStatus === 'closed' ? new Date() : null,
            }
        });

        updated.push({ ...updatedTrade, pnlPct });
    }

    return updated;
}

export async function getActiveTrades(): Promise<any[]> {
    return prisma.trade.findMany({ where: { userId: MOCK_USER_ID, status: 'active' }, orderBy: { entryDate: 'desc' } });
}

export async function getTradeHistory(): Promise<any[]> {
    return prisma.trade.findMany({ where: { userId: MOCK_USER_ID, status: 'closed' }, orderBy: { exitDate: 'desc' }, take: 50 });
}
