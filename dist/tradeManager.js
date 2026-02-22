"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addTrade = addTrade;
exports.removeTrade = removeTrade;
exports.watchTrades = watchTrades;
exports.getActiveTrades = getActiveTrades;
const technicalindicators_1 = require("technicalindicators");
const dataService_1 = require("./dataService");
const prismaClient_1 = __importDefault(require("./prismaClient"));
// For now, assume a single user environment until auth is implemented
const MOCK_USER_ID = "mock-user-123";
// Ensure mock user exists (Temporary setup)
async function ensureUser() {
    const user = await prismaClient_1.default.user.findUnique({ where: { id: MOCK_USER_ID } });
    if (!user) {
        try {
            await prismaClient_1.default.user.create({
                data: { id: MOCK_USER_ID, email: 'trader@swingedge.com', name: 'Pro Trader' }
            });
        }
        catch { } // Ignore race conditions
    }
}
ensureUser();
async function addTrade(setup) {
    const existing = await prismaClient_1.default.trade.findFirst({
        where: { userId: MOCK_USER_ID, ticker: setup.ticker, status: 'active' }
    });
    if (existing)
        return;
    await prismaClient_1.default.trade.create({
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
async function removeTrade(ticker) {
    await prismaClient_1.default.trade.deleteMany({
        where: { userId: MOCK_USER_ID, ticker: ticker }
    });
}
async function watchTrades(dataApi = null) {
    const trades = await prismaClient_1.default.trade.findMany({ where: { userId: MOCK_USER_ID, status: 'active' } });
    if (!trades.length)
        return [];
    const updated = [];
    for (const trade of trades) {
        const yahooTicker = dataService_1.NSE_UNIVERSE[trade.ticker] ?? `${trade.ticker}.NS`;
        const candles = dataApi
            ? await dataApi.getHistoricalData(trade.ticker, '1d', 120)
            : await (0, dataService_1.fetchHistoricalData)(yahooTicker, 120);
        if (candles.length < 55) {
            updated.push(trade);
            continue;
        }
        const closes = candles.map((c) => c.close);
        const ltp = closes[closes.length - 1];
        const pnlPct = +(((ltp - trade.entryPrice) / trade.entryPrice) * 100).toFixed(2);
        const ema20Series = technicalindicators_1.EMA.calculate({ period: 20, values: closes });
        const ema50Series = technicalindicators_1.EMA.calculate({ period: 50, values: closes });
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
        const updatedTrade = await prismaClient_1.default.trade.update({
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
async function getActiveTrades() {
    return prismaClient_1.default.trade.findMany({ where: { userId: MOCK_USER_ID, status: 'active' } });
}
//# sourceMappingURL=tradeManager.js.map