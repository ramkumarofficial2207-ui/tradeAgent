"use strict";
// =====================================================
// index.ts — Express Server + Cron Scheduler
// =====================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const node_cron_1 = __importDefault(require("node-cron"));
const scanner_1 = require("./scanner");
const tradeManager_1 = require("./tradeManager");
const dataService_1 = require("./dataService");
const fundamentalService_1 = require("./fundamentalService");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(__dirname, '..', 'public')));
// Cache last scan result
let lastScan = null;
const broker = (0, dataService_1.getTradingApiFromEnv)();
const tradingApi = broker.api;
// ——————————————————————————————————————————
// ROUTES
// ——————————————————————————————————————————
// GET /api/scan — Run the full Phase 1+2 scanner
app.get('/api/scan', async (req, res) => {
    try {
        console.log('\n[API] /api/scan called');
        const { qualified, marketStatus } = await (0, scanner_1.runScanner)(tradingApi);
        const setups = await (0, scanner_1.buildTradeSetups)(qualified);
        const activeTrades = await (0, tradeManager_1.getActiveTrades)();
        lastScan = {
            timestamp: new Date().toISOString(),
            marketStatus,
            setups,
            activeTrades,
        };
        res.json({ success: true, data: lastScan });
        // ── Background: pre-warm fundamentals for all qualified tickers ──
        // Runs silently after response is sent so scan doesn't slow down
        const scanTickers = setups.map(s => s.ticker);
        if (scanTickers.length) {
            setImmediate(() => (0, fundamentalService_1.batchPrefetch)(scanTickers).catch(() => { }));
        }
    }
    catch (error) {
        console.error('[API] Scan error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});
// POST /api/execute/:ticker — place a paper GTT order for an approved setup
app.post('/api/execute/:ticker', async (req, res) => {
    try {
        const ticker = req.params.ticker;
        const qty = Number(req.body?.quantity ?? 1);
        const scanSetups = lastScan?.setups ?? [];
        const setup = scanSetups.find((s) => s.ticker === ticker);
        if (!setup) {
            res.status(404).json({ success: false, message: `No approved setup found for ${ticker}` });
            return;
        }
        if (qty <= 0) {
            res.status(400).json({ success: false, message: 'Quantity must be positive' });
            return;
        }
        const order = await tradingApi.placeGttOrder({
            ticker: setup.ticker,
            entry: setup.buyZone,
            stopLoss: setup.stopLoss,
            target: setup.target,
            quantity: qty,
        });
        (0, tradeManager_1.addTrade)(setup);
        res.json({ success: true, data: order });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// ── SCREENER / FUNDAMENTALS ROUTES ─────────────────
// GET /api/screener/universe — full stock list (ticker + sector)
app.get('/api/screener/universe', (_req, res) => {
    res.json({ success: true, data: (0, fundamentalService_1.getUniverseList)() });
});
// GET /api/screener/grade/:ticker — lightweight fundamental grade for trade cards
app.get('/api/screener/grade/:ticker', async (req, res) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const report = await (0, fundamentalService_1.fetchStockReport)(ticker);
        if (!report) {
            res.json({ success: true, data: { grade: '—', score: 0, summary: 'Data unavailable' } });
            return;
        }
        res.json({ success: true, data: (0, fundamentalService_1.getFundamentalGrade)(report) });
    }
    catch {
        res.json({ success: true, data: { grade: '—', score: 0, summary: 'Error' } });
    }
});
// GET /api/screener/stock/:ticker — full stock report (our data)
app.get('/api/screener/stock/:ticker', async (req, res) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        // Try to enrich with Nifty candles if we have a recent scan
        const niftyCandles = lastScan ? undefined : undefined; // future: pass nifty candles
        const data = await (0, fundamentalService_1.fetchStockReport)(ticker, niftyCandles);
        if (!data) {
            res.status(404).json({ success: false, message: `No data found for ${ticker}. Market may be closed.` });
            return;
        }
        res.json({ success: true, data });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
app.get('/api/broker/status', (_req, res) => {
    res.json({
        success: true,
        data: {
            provider: broker.provider,
            live: broker.live,
            note: broker.live ? 'Live broker mode' : 'Paper mode fallback',
        },
    });
});
// GET /api/last — Return cached last scan result
app.get('/api/last', (req, res) => {
    if (!lastScan) {
        res.json({ success: false, message: 'No scan has been run yet. Hit /api/scan first.' });
        return;
    }
    res.json({ success: true, data: lastScan });
});
// GET /api/trades — Get all active trades
app.get('/api/trades', async (req, res) => {
    res.json({ success: true, data: await (0, tradeManager_1.getActiveTrades)() });
});
// POST /api/trades/add — Manually accept a trade setup
app.post('/api/trades/add', async (req, res) => {
    try {
        const setup = req.body;
        if (!setup?.ticker) {
            res.status(400).json({ success: false, message: 'Invalid trade setup payload' });
            return;
        }
        (0, tradeManager_1.addTrade)(setup);
        res.json({ success: true, message: `Trade added for ${setup.ticker}` });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// DELETE /api/trades/:ticker — Remove a trade
app.delete('/api/trades/:ticker', (req, res) => {
    (0, tradeManager_1.removeTrade)(req.params.ticker);
    res.json({ success: true, message: `Trade removed for ${req.params.ticker}` });
});
// POST /api/watch — Manually trigger trade monitoring
app.post('/api/watch', async (req, res) => {
    try {
        const updatedWithBroker = await (0, tradeManager_1.watchTrades)(tradingApi);
        res.json({ success: true, data: updatedWithBroker });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// ——————————————————————————————————————————
// CRON JOBS
// ——————————————————————————————————————————
// Run scanner every day at 9:20 AM IST (NSE opens 9:15 AM)
node_cron_1.default.schedule('20 9 * * 1-5', async () => {
    console.log('\n[CRON] Morning scan triggered at 9:20 AM IST');
    const { qualified, marketStatus } = await (0, scanner_1.runScanner)(tradingApi);
    const setups = await (0, scanner_1.buildTradeSetups)(qualified);
    lastScan = {
        timestamp: new Date().toISOString(),
        marketStatus,
        setups,
        activeTrades: await (0, tradeManager_1.getActiveTrades)(),
    };
}, { timezone: 'Asia/Kolkata' });
// Watch active trades every 15 minutes during market hours (9:15 AM – 3:30 PM IST)
node_cron_1.default.schedule('*/15 9-15 * * 1-5', async () => {
    console.log('\n[CRON] Trade watcher triggered');
    await (0, tradeManager_1.watchTrades)(tradingApi);
}, { timezone: 'Asia/Kolkata' });
// ——————————————————————————————————————————
// START
// ——————————————————————————————————————————
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║   ⚡  SwingEdge                                       ║');
    console.log('║   Your Quantitative Edge in the Indian Market         ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║   Dashboard : http://localhost:${PORT}                  ║`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log('║   GET  /api/scan        — Run full scanner            ║');
    console.log('║   GET  /api/trades      — View active trades          ║');
    console.log('║   POST /api/trades/add  — Add a trade                 ║');
    console.log('║   POST /api/watch       — Refresh trade monitor       ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
});
//# sourceMappingURL=index.js.map