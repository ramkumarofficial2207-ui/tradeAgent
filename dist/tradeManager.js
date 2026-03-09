"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcPositionSize = calcPositionSize;
exports.addTrade = addTrade;
exports.manualAddTrade = manualAddTrade;
exports.closeTrade = closeTrade;
exports.updateTrailingStop = updateTrailingStop;
exports.watchTrades = watchTrades;
exports.getActiveTrades = getActiveTrades;
exports.getTradeHistory = getTradeHistory;
exports.removeTrade = removeTrade;
exports.getPerformanceMetrics = getPerformanceMetrics;
const dataService_1 = require("./dataService");
const prismaClient_1 = __importDefault(require("./prismaClient"));
const MOCK_USER_ID = "mock-user-123";
// ── Ensure mock user + portfolio config exist ──────────────────────
async function ensureUser() {
    const user = await prismaClient_1.default.user.findUnique({ where: { id: MOCK_USER_ID } });
    if (!user) {
        try {
            await prismaClient_1.default.user.create({
                data: { id: MOCK_USER_ID, email: 'trader@stocksage.ai', name: 'Pro Trader' }
            });
        }
        catch { }
    }
    // Ensure singleton portfolio config
    const cfg = await prismaClient_1.default.portfolioConfig.findUnique({ where: { id: 'singleton' } });
    if (!cfg) {
        await prismaClient_1.default.portfolioConfig.create({
            data: { id: 'singleton', totalCapital: 1000000 }
        });
    }
}
ensureUser();
// ── Position size calculator ───────────────────────────────────────
function calcPositionSize(params) {
    const { capital, entry, stop, capCategory, regime } = params;
    if (regime === 'RISK_OFF')
        return { qty: 0, riskRs: 0, capitalDeployed: 0 };
    const riskPctBase = capCategory === 'SMALL' ? 0.0075 : 0.01;
    const regimeMult = regime === 'NEUTRAL' ? 0.5 : 1.0;
    const riskPct = riskPctBase * regimeMult;
    const riskAmount = capital * riskPct;
    const riskPerSh = entry - stop;
    if (riskPerSh <= 0)
        return { qty: 0, riskRs: 0, capitalDeployed: 0 };
    let qty = Math.floor(riskAmount / riskPerSh);
    let value = qty * entry;
    // Hard cap: single position ≤ 20% of capital
    if (value > capital * 0.20) {
        qty = Math.floor((capital * 0.20) / entry);
        value = qty * entry;
    }
    return {
        qty,
        riskRs: +(qty * riskPerSh).toFixed(2),
        capitalDeployed: +value.toFixed(2),
    };
}
// ── Add trade from scanner signal ─────────────────────────────────
async function addTrade(setup) {
    const existing = await prismaClient_1.default.trade.findFirst({
        where: { userId: MOCK_USER_ID, ticker: setup.ticker, status: 'OPEN' }
    });
    if (existing)
        return;
    const cfg = await prismaClient_1.default.portfolioConfig.findUnique({ where: { id: 'singleton' } });
    const capital = cfg?.totalCapital ?? 1000000;
    const capCat = setup.marketCapCr && setup.marketCapCr < 5000 ? 'SMALL' : setup.marketCapCr && setup.marketCapCr < 20000 ? 'MID' : 'LARGE';
    const regime = 'BULLISH'; // default; will be overridden by caller
    const { qty, riskRs, capitalDeployed } = calcPositionSize({
        capital, entry: setup.buyZone, stop: setup.stopLoss, capCategory: capCat, regime
    });
    await prismaClient_1.default.trade.create({
        data: {
            userId: MOCK_USER_ID,
            ticker: setup.ticker,
            sector: setup.sector,
            capCategory: capCat,
            setupType: setup.setupType || 'Pullback Continuation',
            entryPrice: setup.buyZone,
            quantity: qty || 10,
            stopLossInit: setup.stopLoss,
            stopLossTrail: setup.stopLoss,
            target1: setup.target,
            target2: +(setup.target * 1.04).toFixed(2),
            currentPrice: setup.ltp,
            confidenceScore: setup.confidenceScore ?? null,
            initialRiskRs: riskRs,
            capitalDeployed: capitalDeployed,
            status: 'OPEN',
        }
    });
}
// ── Manual trade entry (from Performance page form) ───────────────
async function manualAddTrade(params) {
    const { ticker, sector, capCategory = 'LARGE', setupType = 'Manual', entryPrice, quantity, stopLoss, target1, target2, regimeAtEntry, confidenceScore, notes } = params;
    const riskPerSh = entryPrice - stopLoss;
    const initialRiskRs = +(riskPerSh * quantity).toFixed(2);
    const capitalDeployed = +(entryPrice * quantity).toFixed(2);
    return prismaClient_1.default.trade.create({
        data: {
            userId: MOCK_USER_ID,
            ticker: ticker.toUpperCase(),
            sector,
            capCategory,
            setupType,
            entryPrice,
            quantity,
            stopLossInit: stopLoss,
            stopLossTrail: stopLoss,
            target1,
            target2: target2 ?? null,
            currentPrice: entryPrice,
            regimeAtEntry,
            confidenceScore,
            initialRiskRs,
            capitalDeployed,
            notes,
            status: 'OPEN',
        }
    });
}
// ── Close a trade manually ────────────────────────────────────────
async function closeTrade(tradeId, exitPrice, exitReason = 'MANUAL') {
    const trade = await prismaClient_1.default.trade.findUnique({ where: { id: tradeId } });
    if (!trade)
        throw new Error('Trade not found');
    const pnlRs = +((exitPrice - trade.entryPrice) * trade.quantity).toFixed(2);
    const pnlPct = +(((exitPrice - trade.entryPrice) / trade.entryPrice) * 100).toFixed(2);
    const riskRs = trade.initialRiskRs || ((trade.entryPrice - trade.stopLossInit) * trade.quantity);
    const rMult = riskRs > 0 ? +(pnlRs / riskRs).toFixed(2) : 0;
    const msHeld = Date.now() - new Date(trade.entryDate).getTime();
    const daysHeld = Math.round(msHeld / 86400000);
    return prismaClient_1.default.trade.update({
        where: { id: tradeId },
        data: {
            exitPrice,
            exitDate: new Date(),
            exitReason,
            pnlRs,
            pnlPct,
            rMultiple: rMult,
            daysHeld,
            status: 'CLOSED',
        }
    });
}
// ── Update trailing stop ──────────────────────────────────────────
async function updateTrailingStop(tradeId, newStop) {
    await prismaClient_1.default.trade.update({
        where: { id: tradeId },
        data: { stopLossTrail: newStop }
    });
}
// ── Watch open trades, update current price ───────────────────────
async function watchTrades(dataApi = null) {
    const trades = await prismaClient_1.default.trade.findMany({ where: { userId: MOCK_USER_ID, status: 'OPEN' } });
    if (!trades.length)
        return [];
    const updated = [];
    for (const trade of trades) {
        const yahooTicker = dataService_1.NSE_UNIVERSE[trade.ticker] ?? `${trade.ticker}.NS`;
        const candles = dataApi
            ? await dataApi.getHistoricalData(trade.ticker, '1d', 60)
            : await (0, dataService_1.fetchHistoricalData)(yahooTicker, 60);
        if (candles.length < 5) {
            updated.push(trade);
            continue;
        }
        const closes = candles.map(c => c.close);
        const ltp = +closes[closes.length - 1].toFixed(2);
        const pnlRs = +((ltp - trade.entryPrice) * trade.quantity).toFixed(2);
        const riskRs = trade.initialRiskRs || 1;
        const rMult = +(pnlRs / riskRs).toFixed(2);
        const msHeld = Date.now() - new Date(trade.entryDate).getTime();
        const daysHeld = Math.round(msHeld / 86400000);
        const updatedTrade = await prismaClient_1.default.trade.update({
            where: { id: trade.id },
            data: { currentPrice: ltp }
        });
        updated.push({ ...updatedTrade, pnlRs, rMultiple: rMult, daysHeld });
    }
    return updated;
}
// ── Getters ───────────────────────────────────────────────────────
async function getActiveTrades() {
    return prismaClient_1.default.trade.findMany({
        where: { userId: MOCK_USER_ID, status: 'OPEN' },
        orderBy: { entryDate: 'desc' }
    });
}
async function getTradeHistory() {
    return prismaClient_1.default.trade.findMany({
        where: { userId: MOCK_USER_ID, status: 'CLOSED' },
        orderBy: { exitDate: 'desc' }
    });
}
async function removeTrade(ticker) {
    await prismaClient_1.default.trade.deleteMany({ where: { userId: MOCK_USER_ID, ticker } });
}
// ── Performance metrics ───────────────────────────────────────────
async function getPerformanceMetrics() {
    const cfg = await prismaClient_1.default.portfolioConfig.findUnique({ where: { id: 'singleton' } });
    const capital = cfg?.totalCapital ?? 1000000;
    const closed = await prismaClient_1.default.trade.findMany({
        where: { userId: MOCK_USER_ID, status: 'CLOSED' },
        orderBy: { exitDate: 'asc' }
    });
    if (closed.length === 0)
        return {
            totalTrades: 0, winCount: 0, lossCount: 0, winRate: 0,
            avgR: 0, avgWinR: 0, avgLossR: 0, expectancy: 0,
            totalPnlRs: 0, maxDrawdownPct: 0, equityCurve: [capital],
            monthlyReturns: [], sectorBreakdown: [], openExposure: 0,
        };
    const wins = closed.filter((t) => (t.pnlRs ?? 0) > 0);
    const losses = closed.filter((t) => (t.pnlRs ?? 0) <= 0);
    const winRate = wins.length / closed.length;
    const avgR = closed.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / closed.length;
    const avgWinR = wins.length ? wins.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / wins.length : 0;
    const avgLossR = losses.length ? Math.abs(losses.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / losses.length) : 0;
    const expectancy = (winRate * avgWinR) - ((1 - winRate) * avgLossR);
    const totalPnl = closed.reduce((s, t) => s + (t.pnlRs ?? 0), 0);
    // Equity curve + max drawdown
    let equity = capital;
    let peak = capital;
    let maxDD = 0;
    const curve = [capital];
    const monthlyMap = {};
    for (const t of closed) {
        equity += t.pnlRs ?? 0;
        curve.push(+equity.toFixed(2));
        if (equity > peak)
            peak = equity;
        const dd = (peak - equity) / peak * 100;
        if (dd > maxDD)
            maxDD = dd;
        const mo = new Date(t.exitDate).toISOString().slice(0, 7);
        monthlyMap[mo] = (monthlyMap[mo] ?? 0) + (t.pnlRs ?? 0);
    }
    const monthlyReturns = Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, pnl]) => ({ month, pnl: +pnl.toFixed(2), pct: +((pnl / capital) * 100).toFixed(2) }));
    // Sector breakdown
    const sectorMap = {};
    for (const t of closed) {
        const s = t.sector ?? 'Unknown';
        if (!sectorMap[s])
            sectorMap[s] = { pnl: 0, trades: 0, wins: 0 };
        sectorMap[s].pnl += t.pnlRs ?? 0;
        sectorMap[s].trades++;
        if ((t.pnlRs ?? 0) > 0)
            sectorMap[s].wins++;
    }
    const sectorBreakdown = Object.entries(sectorMap).map(([sector, d]) => ({
        sector, pnl: +d.pnl.toFixed(2), trades: d.trades, winRate: +(d.wins / d.trades * 100).toFixed(1)
    })).sort((a, b) => b.pnl - a.pnl);
    // Open trade exposure
    const openTrades = await prismaClient_1.default.trade.findMany({ where: { userId: MOCK_USER_ID, status: 'OPEN' } });
    const openExposure = openTrades.reduce((s, t) => s + (t.capitalDeployed ?? 0), 0);
    return {
        totalTrades: closed.length,
        winCount: wins.length,
        lossCount: losses.length,
        winRate: +(winRate * 100).toFixed(1),
        avgR: +avgR.toFixed(2),
        avgWinR: +avgWinR.toFixed(2),
        avgLossR: -+avgLossR.toFixed(2),
        expectancy: +expectancy.toFixed(3),
        totalPnlRs: +totalPnl.toFixed(2),
        maxDrawdownPct: +maxDD.toFixed(2),
        equityCurve: curve,
        monthlyReturns,
        sectorBreakdown,
        openExposure: +openExposure.toFixed(2),
        totalCapital: capital,
        currentCapital: +equity.toFixed(2),
        openTradesCount: openTrades.length,
    };
}
//# sourceMappingURL=tradeManager.js.map