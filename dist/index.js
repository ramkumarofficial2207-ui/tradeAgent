"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// =====================================================
// index.ts — Express Server + Cron Scheduler
// =====================================================
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const node_cron_1 = __importDefault(require("node-cron"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const child_process_1 = require("child_process");
const scanner_1 = require("./scanner");
const dataService_1 = require("./dataService");
const fundamentalService_1 = require("./fundamentalService");
const axios_1 = __importDefault(require("axios"));
const claudeClient_1 = require("./claudeClient");
const geminiClient_1 = require("./geminiClient");
const agentEvents_1 = require("./agentEvents");
const prismaClient_1 = __importDefault(require("./prismaClient"));
const authMiddleware_1 = require("./authMiddleware");
const rateLimiter_1 = require("./rateLimiter");
const subscriptionMiddleware_1 = require("./subscriptionMiddleware");
const portfolioService_1 = require("./portfolioService");
const notificationService_1 = require("./notificationService");
const validation_1 = require("./validation");
const app = (0, express_1.default)();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const dbHealth = {
    status: 'unknown',
    checkedAt: null,
    message: null,
};
let dbRepairAttempted = false;
let dbRepairInFlight = false;
function isDatabaseError(err) {
    const raw = (err && typeof err === 'object' && err.message) ? String(err.message) : String(err || '');
    const msg = raw.toLowerCase();
    return msg.includes('prisma') ||
        msg.includes('database') ||
        msg.includes('connection') ||
        msg.includes('postgresql') ||
        msg.includes('psql') ||
        msg.includes('sql') ||
        msg.includes('env(') ||
        msg.includes('database_url') ||
        msg.includes('authentication failed against database server');
}
function summarizeDbError(err) {
    const raw = (err && typeof err === 'object' && err.message) ? String(err.message) : String(err || '');
    if (!raw)
        return 'Unknown database error';
    const normalized = raw.replace(/\s+/g, ' ').trim();
    return normalized.slice(0, 240);
}
function shouldAttemptDatabaseRepair(err) {
    if (!isDatabaseError(err))
        return false;
    const message = summarizeDbError(err).toLowerCase();
    return message.includes('does not exist in the current database') ||
        message.includes('table') && message.includes('does not exist') ||
        message.includes('has not been created yet');
}
function markDatabaseHealthy() {
    dbHealth.status = 'ready';
    dbHealth.checkedAt = new Date().toISOString();
    dbHealth.message = null;
}
function markDatabaseError(err) {
    dbHealth.status = 'error';
    dbHealth.checkedAt = new Date().toISOString();
    dbHealth.message = summarizeDbError(err);
}
function attemptDatabaseRepair(reason) {
    if (dbRepairAttempted || dbRepairInFlight || !shouldAttemptDatabaseRepair(reason))
        return;
    dbRepairAttempted = true;
    dbRepairInFlight = true;
    console.warn('[System] Database schema mismatch detected. Attempting one-time prisma db push...');
    (0, child_process_1.exec)('npx prisma db push', { cwd: process.cwd() }, async (err, stdout, stderr) => {
        dbRepairInFlight = false;
        if (err) {
            console.error('[System] Database repair failed:', (stderr || err.message || '').trim());
            return;
        }
        if (stdout?.trim())
            console.log('[System] Database repair output:', stdout.trim());
        await verifyDatabaseConnection();
    });
}
async function verifyDatabaseConnection() {
    if (!process.env.DATABASE_URL) {
        markDatabaseError('DATABASE_URL is not set');
        console.error('[System] Database connection failed: DATABASE_URL is not set');
        return;
    }
    try {
        await prismaClient_1.default.$connect();
        await prismaClient_1.default.$queryRawUnsafe('SELECT 1');
        // Check for InstitutionalFlowSnapshot table (using any property to verify existence)
        await prismaClient_1.default.institutionalFlowSnapshot.findFirst({ select: { id: true } });
        markDatabaseHealthy();
        console.log('[System] Database connection ready.');
    }
    catch (err) {
        markDatabaseError(err);
        console.error('[System] Database connection failed:', summarizeDbError(err));
        attemptDatabaseRepair(err);
    }
}
// Helper to sanitize database/system errors for the UI
function sanitizeError(err) {
    const raw = (err && typeof err === 'object' && err.message) ? String(err.message) : String(err || '');
    const msg = raw.toLowerCase();
    if (isDatabaseError(err)) {
        markDatabaseError(err);
        attemptDatabaseRepair(err);
        return 'Database is temporarily unavailable. Please try again later.';
    }
    // AI Provider checks
    if (msg.includes('anthropic') || msg.includes('gemini') || msg.includes('groq') || msg.includes('api_key')) {
        return 'AI service configuration error. Please check server logs.';
    }
    return 'Something went wrong on our end. Please try again later.';
}
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// In production, serve the built React frontend
const FRONTEND_DIST = path_1.default.join(__dirname, '..', 'frontend', 'dist');
// ——————————————————————————————————————————
// 🚀 EMERGENCY BOOT: BIND PORT IMMEDIATELY
// ——————————————————————————————————————————
app.listen(Number(PORT) || 3000, '0.0.0.0', () => {
    console.log(`\n[System] BOOT: StockSage AI Bound to Port ${PORT}`);
    console.log(`[System] Mode: ${process.env.NODE_ENV}`);
    void verifyDatabaseConnection();
});
app.get('/api/health', (_req, res) => res.status(200).json({
    status: 'OK',
    v: 'fix-Intelligence5.0',
    db: dbHealth.status,
    dbCheckedAt: dbHealth.checkedAt,
    dbMessage: dbHealth.message,
}));
app.get('/api/ready', (_req, res) => {
    const ready = dbHealth.status === 'ready';
    res.status(ready ? 200 : 503).json({
        status: ready ? 'READY' : 'NOT_READY',
        v: 'fix-Intelligence5.0',
        db: dbHealth.status,
        dbCheckedAt: dbHealth.checkedAt,
        dbMessage: dbHealth.message,
    });
});
app.get('/', (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
        const indexPath = path_1.default.join(FRONTEND_DIST, 'index.html');
        res.sendFile(indexPath, (err) => {
            if (err)
                res.status(200).send('StockSage AI Backend Operational (Frontend loading...)');
        });
    }
    else {
        res.status(200).send('StockSage AI Backend Operational');
    }
});
if (process.env.NODE_ENV === 'production') {
    app.use(express_1.default.static(FRONTEND_DIST));
}
// Global process handlers
process.on('uncaughtException', (err) => {
    console.error('[System] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[System] Unhandled Rejection at:', promise, 'reason:', reason);
});
// Cache last scan result
let lastSwingScan = null;
let lastIntradayScan = null;
function normalizeScanMode(value) {
    return value === 'intraday' ? 'intraday' : 'swing';
}
function getCachedScan(mode) {
    return mode === 'intraday' ? lastIntradayScan : lastSwingScan;
}
function setCachedScan(mode, scan) {
    if (mode === 'intraday') {
        lastIntradayScan = scan;
        return;
    }
    lastSwingScan = scan;
}
let broker = null;
let tradingApi = null;
// ——————————————————————————————————————————
// ⚡ BACKGROUND INITIALIZATION (Non-blocking)
// ——————————————————————————————————————————
setTimeout(() => {
    try {
        const result = (0, dataService_1.getTradingApiFromEnv)();
        broker = result;
        tradingApi = result.api;
        console.log('[System] Heavy modules & Broker API initialized.');
    }
    catch (e) {
        console.error('[System] Deferred initialization failed:', e.message);
    }
}, 1500);
// ——————————————————————————————————————————
// ROUTES
// ——————————————————————————————————————————
app.get('/api/broker/status', (_req, res) => {
    if (!broker) {
        res.json({ success: true, data: { provider: 'initializing', live: false, note: 'Broker system starting...' } });
        return;
    }
    res.json({
        success: true,
        data: {
            provider: broker.provider,
            live: broker.live,
            note: broker.live ? 'Live broker mode' : 'Paper mode fallback',
        },
    });
});
// ═══════════════════════════════════════════
// AUTH — Register / Login / Me / Logout
// ═══════════════════════════════════════════
// POST /api/auth/register
app.post('/api/auth/register', rateLimiter_1.authLimiter, (0, validation_1.validateBody)(validation_1.registerSchema), async (req, res) => {
    const { name, email } = req.body || {};
    const password = req.body?.password ?? req.body?.secret;
    if (!name || !email || !password) {
        res.status(400).json({ success: false, message: 'Name, email and password are required.' });
        return;
    }
    if (password.length < 6) {
        res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        return;
    }
    try {
        const existing = await prismaClient_1.default.user.findUnique({ where: { email } });
        if (existing) {
            res.status(409).json({ success: false, message: 'An account with this email already exists.' });
            return;
        }
        const hashed = await bcryptjs_1.default.hash(password, 12);
        // Grant a 7-day trial for all new registrations
        const trialExpiry = new Date();
        trialExpiry.setDate(trialExpiry.getDate() + 7);
        const user = await prismaClient_1.default.user.create({
            data: {
                name,
                email,
                password: hashed,
                subscriptionStatus: 'TRIAL',
                subscriptionExpiry: trialExpiry,
            },
            select: { id: true, name: true, email: true, createdAt: true },
        });
        const token = (0, authMiddleware_1.generateToken)(user.id, user.email);
        res.json({ success: true, token, user, trialDaysLeft: 7 });
    }
    catch (err) {
        console.error('[Register] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});
// POST /api/auth/login
app.post('/api/auth/login', rateLimiter_1.authLimiter, (0, validation_1.validateBody)(validation_1.loginSchema), async (req, res) => {
    const { email } = req.body || {};
    const password = req.body?.password ?? req.body?.secret;
    if (!email || !password) {
        res.status(400).json({ success: false, message: 'Email and password are required.' });
        return;
    }
    try {
        const user = await prismaClient_1.default.user.findUnique({ where: { email } });
        if (!user) {
            res.status(401).json({ success: false, message: 'Invalid email or password.' });
            return;
        }
        const match = await bcryptjs_1.default.compare(password, user.password);
        if (!match) {
            res.status(401).json({ success: false, message: 'Invalid email or password.' });
            return;
        }
        const token = (0, authMiddleware_1.generateToken)(user.id, user.email);
        const { password: _, ...safeUser } = user;
        res.json({ success: true, token, user: safeUser });
    }
    catch (err) {
        console.error('[Login] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});
// GET /api/auth/me
app.get('/api/auth/me', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const user = await prismaClient_1.default.user.findUnique({
            where: { id: req.userId },
            select: { id: true, name: true, email: true, createdAt: true },
        });
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found.' });
            return;
        }
        res.json({ success: true, user });
    }
    catch (err) {
        console.error('[Auth-Me] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});
// POST /api/auth/logout — Stateless JWT: just acknowledge (client deletes token)
app.post('/api/auth/logout', (_req, res) => {
    res.json({ success: true, message: 'Logged out.' });
});
// ═══════════════════════════════════════════
// WATCHLIST — Persistent, per-user, cloud-synced
// ═══════════════════════════════════════════
// GET /api/watchlist
app.get('/api/watchlist', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const items = await prismaClient_1.default.watchlistItem.findMany({
            where: { userId: req.userId },
            orderBy: { addedAt: 'desc' },
        });
        res.json({ success: true, data: items });
    }
    catch (err) {
        console.error('[Watchlist-GET] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});
// POST /api/watchlist
app.post('/api/watchlist', authMiddleware_1.requireAuth, (0, validation_1.validateBody)(validation_1.watchlistCreateSchema), async (req, res) => {
    const { ticker, sector, signal, ltp, target, stopLoss, targetPct, slPct, riskReward, confidenceScore, setupType, buyZone } = req.body || {};
    if (!ticker) {
        res.status(400).json({ success: false, message: 'ticker is required.' });
        return;
    }
    try {
        const item = await prismaClient_1.default.watchlistItem.upsert({
            where: { userId_ticker: { userId: req.userId, ticker } },
            update: { sector, signal, ltp, target, stopLoss, targetPct, slPct, riskReward, confidenceScore, setupType, buyZone, addedAt: new Date() },
            create: { userId: req.userId, ticker, sector, signal, ltp, target, stopLoss, targetPct, slPct, riskReward, confidenceScore, setupType, buyZone },
        });
        res.json({ success: true, data: item });
    }
    catch (err) {
        console.error('[Watchlist-POST] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});
// DELETE /api/watchlist/:ticker
app.delete('/api/watchlist/:ticker', authMiddleware_1.requireAuth, async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    try {
        await prismaClient_1.default.watchlistItem.deleteMany({ where: { userId: req.userId, ticker } });
        res.json({ success: true });
    }
    catch (err) {
        console.error('[Watchlist-DELETE] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});
// GET /api/scan — Run the full Phase 1+2 scanner (rate limited + subscription gated)
app.get('/api/scan', rateLimiter_1.scanLimiter, authMiddleware_1.requireAuth, subscriptionMiddleware_1.requireSubscription, async (req, res) => {
    try {
        console.log('\n[API] /api/scan called');
        const force = req.query.force === 'true';
        const mode = normalizeScanMode(req.query.mode);
        const cachedScan = getCachedScan(mode);
        if (!force && cachedScan) {
            console.log('[API] Serving cached scan results');
            res.json({ success: true, data: cachedScan });
            return;
        }
        (0, agentEvents_1.clearThinkingSteps)();
        (0, agentEvents_1.setAgentState)('SCANNING', mode === 'intraday' ? 'Running intraday momentum scan' : 'Running full market scan');
        (0, agentEvents_1.pushEvent)('SCAN_START', 'info', mode === 'intraday' ? 'Intraday Scanner Started' : 'Scanner Started', mode === 'intraday'
            ? 'Running 5-minute intraday scan across the liquid NSE universe'
            : 'Running full Phase 1+1000 scan across Nifty stocks');
        const s1 = (0, agentEvents_1.addThinkingStep)('Fetching live market data from NSE', 'running');
        console.log(`[API] Running ${mode} market scan...`);
        let qualified = [];
        let marketStatus;
        let setups = [];
        if (mode === 'intraday') {
            const intradayResult = await (0, scanner_1.runIntradayScanner)(tradingApi);
            qualified = intradayResult.qualified;
            marketStatus = intradayResult.marketStatus;
            setups = intradayResult.setups;
        }
        else {
            const swingResult = await (0, scanner_1.runScanner)(tradingApi);
            qualified = swingResult.qualified;
            marketStatus = swingResult.marketStatus;
        }
        (0, agentEvents_1.updateThinkingStep)(s1, 'done', `Market regime: ${marketStatus.regime || 'NEUTRAL'}`);
        const s2 = (0, agentEvents_1.addThinkingStep)('Computing technical indicators & AI signals', 'running');
        if (mode !== 'intraday') {
            setups = await (0, scanner_1.buildTradeSetups)(qualified);
        }
        (0, agentEvents_1.updateThinkingStep)(s2, 'done', `${setups.length} setups identified`);
        const s3 = (0, agentEvents_1.addThinkingStep)('Finalizing scan results', 'running');
        (0, agentEvents_1.updateThinkingStep)(s3, 'done', 'Ready');
        const scanPayload = {
            timestamp: new Date().toISOString(),
            marketStatus,
            setups,
        };
        setCachedScan(mode, scanPayload);
        const buyCount = setups.filter(s => s.aiSignal === 'BUY').length;
        (0, agentEvents_1.setAgentState)('IDLE');
        (0, agentEvents_1.incrementTasksCompleted)();
        (0, agentEvents_1.setLastScan)(scanPayload.timestamp);
        (0, agentEvents_1.setMonitoredStocks)(setups.length);
        (0, agentEvents_1.pushEvent)('SCAN_COMPLETE', 'success', `Scan Complete — ${setups.length} Setups Found`, `${buyCount} BUY signals, ${setups.length - buyCount} WATCH/AVOID. Regime: ${marketStatus.regime || 'NEUTRAL'}`, { data: { total: setups.length, buyCount } });
        // ── AUTO-LOGGING TO PERFORMANCE DATABASE ──
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const signalsToTrack = setups.filter(s => (s.aiSignal === 'BUY' && s.confidenceScore >= 7) ||
                (s.aiSignal === 'LIGHT BUY' && s.confidenceScore >= 6) ||
                (s.aiSignal === 'WATCH' && s.confidenceScore >= 8));
            for (const s of signalsToTrack) {
                const exists = await prismaClient_1.default.historicalSetup.findFirst({
                    where: { ticker: s.ticker, status: 'IN_PROGRESS', createdAt: { gte: today } }
                });
                if (!exists) {
                    await prismaClient_1.default.historicalSetup.create({
                        data: {
                            ticker: s.ticker, setupType: s.setupType, timeframe: s.timeframe,
                            aiSignal: s.aiSignal || 'WATCH', confidenceScore: s.confidenceScore,
                            entryPrice: s.buyZone, targetPrice: s.target, stopLoss: s.stopLoss,
                            aiLogic: s.aiLogic, status: 'IN_PROGRESS'
                        }
                    });
                }
            }
        }
        catch (dbErr) {
            console.error('[Database] Failed to log setups:', dbErr.message);
        }
        res.json({ success: true, data: scanPayload });
        const scanTickers = setups.map(s => s.ticker);
        if (scanTickers.length) {
            setImmediate(() => (0, fundamentalService_1.batchPrefetch)(scanTickers).catch(() => { }));
        }
    }
    catch (error) {
        console.error('[API] Scan error:', error.message);
        (0, agentEvents_1.setAgentState)('IDLE');
        (0, agentEvents_1.pushEvent)('SCAN_FAILED', 'critical', 'Scan Failed', 'System error during market scan. Check logs.');
        res.status(500).json({ success: false, message: sanitizeError(error) });
    }
});
// GET /api/performance — Fetch AI Track Record
app.get('/api/performance', async (req, res) => {
    try {
        const history = await prismaClient_1.default.historicalSetup.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        const stats = {
            total: history.length,
            won: history.filter((h) => h.status === 'WON').length,
            lost: history.filter((h) => h.status === 'LOST').length,
            inProgress: history.filter((h) => h.status === 'IN_PROGRESS').length,
            avgWin: 0, avgLoss: 0, winRate: 0
        };
        const resolvedCount = stats.won + stats.lost;
        if (resolvedCount > 0)
            stats.winRate = (stats.won / resolvedCount) * 100;
        const wonTrades = history.filter((h) => h.status === 'WON' && h.resultPct);
        if (wonTrades.length)
            stats.avgWin = wonTrades.reduce((sum, t) => sum + (t.resultPct || 0), 0) / wonTrades.length;
        const lostTrades = history.filter((h) => h.status === 'LOST' && h.resultPct);
        if (lostTrades.length)
            stats.avgLoss = lostTrades.reduce((sum, t) => sum + (t.resultPct || 0), 0) / lostTrades.length;
        res.json({ success: true, data: { stats, history } });
    }
    catch (err) {
        console.error('[Performance] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});
// GET /api/chart/:ticker — Historical OHLCV + indicators
const chartCache = {};
app.get('/api/chart/:ticker', async (req, res) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const yahooBSE = `${ticker}.NS`;
        const interval = (['1d', '15m', '5m'].includes(String(req.query.interval)) ? String(req.query.interval) : '1d');
        const daysLimit = interval === '1d' ? 365 : interval === '15m' ? 20 : 10;
        const days = Math.min(Number(req.query.days) || (interval === '1d' ? 180 : 5), daysLimit);
        const cacheKey = `${ticker}:${interval}:${days}`;
        const cached = chartCache[cacheKey];
        if (cached && Date.now() - cached.ts < 300_000)
            return res.json({ success: true, data: cached.data });
        const candles = await (0, dataService_1.fetchHistoricalData)(yahooBSE, days, interval);
        if (!candles.length)
            return res.status(404).json({ success: false, message: 'No data found' });
        const computeSMA = (arr, period) => {
            const result = [];
            for (let i = 0; i < arr.length; i++) {
                if (i < period - 1) {
                    result.push(null);
                    continue;
                }
                const sum = arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
                result.push(Number((sum / period).toFixed(2)));
            }
            return result;
        };
        const computeRSI = (closes, period = 14) => {
            const rsi = [];
            let gainSum = 0, lossSum = 0;
            for (let i = 0; i < closes.length; i++) {
                if (i === 0) {
                    rsi.push(null);
                    continue;
                }
                const diff = closes[i] - closes[i - 1];
                const gain = diff > 0 ? diff : 0;
                const loss = diff < 0 ? -diff : 0;
                if (i < period) {
                    gainSum += gain;
                    lossSum += loss;
                    rsi.push(null);
                    continue;
                }
                if (i === period) {
                    gainSum += gain;
                    lossSum += loss;
                    const avgGain = gainSum / period;
                    const avgLoss = lossSum / period;
                    rsi.push(avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)));
                    gainSum = avgGain;
                    lossSum = avgLoss;
                }
                else {
                    const avgGain = (gainSum * (period - 1) + gain) / period;
                    const avgLoss = (lossSum * (period - 1) + loss) / period;
                    rsi.push(avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)));
                    gainSum = avgGain;
                    lossSum = avgLoss;
                }
            }
            return rsi;
        };
        const closes = candles.map(c => c.close);
        const sma20 = computeSMA(closes, 20);
        const sma50 = computeSMA(closes, 50);
        const sma200 = computeSMA(closes, 200);
        const rsi14 = computeRSI(closes, 14);
        const chartData = {
            ticker, interval,
            candles: candles.map((c, i) => ({
                time: interval === '1d' ? c.date : Math.floor(new Date(c.date).getTime() / 1000),
                open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
                sma20: sma20[i], sma50: sma50[i], sma200: sma200[i], rsi: rsi14[i],
            })),
        };
        chartCache[cacheKey] = { ts: Date.now(), data: chartData };
        res.json({ success: true, data: chartData });
    }
    catch (error) {
        res.status(500).json({ success: false, message: sanitizeError(error) });
    }
});
// ── MARKET PULSE ───────────────────────────────────
let pulseCache = null;
const PULSE_TTL = 5 * 60 * 1000;
app.get('/api/market-pulse', async (_req, res) => {
    if (pulseCache && Date.now() - pulseCache.ts < PULSE_TTL)
        return res.json({ success: true, data: pulseCache.data });
    try {
        const symbols = [{ key: 'nifty', symbol: '^NSEI' }, { key: 'sensex', symbol: '^BSESN' }, { key: 'vix', symbol: '^INDIAVIX' }];
        const results = await Promise.allSettled(symbols.map(s => (0, dataService_1.fetchHistoricalData)(s.symbol, 260)));
        const state = {};
        symbols.forEach((s, i) => {
            const res = results[i];
            if (res.status === 'fulfilled' && res.value.length >= 2) {
                const c = res.value;
                const price = +c[c.length - 1].close.toFixed(2);
                const prev = c[c.length - 2].close;
                const change = +(((price - prev) / prev) * 100).toFixed(2);
                state[s.key] = { price, change };
            }
            else
                state[s.key] = { price: 0, change: 0 };
        });
        const data = { indices: state, isMarketOpen: true, fetchedAt: new Date().toISOString() };
        pulseCache = { data, ts: Date.now() };
        res.json({ success: true, data });
    }
    catch (err) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});
let cachedOutlook = '';
let cachedNews = [];
let outlookTime = 0;
function parseFastXML(xml) {
    const items = [];
    const chunks = xml.split('<item>').slice(1);
    for (const chunk of chunks) {
        const itemContent = chunk.split('</item>')[0];
        const extract = (tag) => {
            const start = `<${tag}>`;
            const end = `</${tag}>`;
            const s = itemContent.indexOf(start);
            const e = itemContent.indexOf(end);
            if (s !== -1 && e !== -1)
                return itemContent.substring(s + start.length, e).replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
            return '';
        };
        const title = extract('title');
        const link = extract('link');
        const pubDate = extract('pubDate');
        if (title && link)
            items.push({ title, link, pubDate });
    }
    return items;
}
app.get('/api/market-outlook', async (req, res) => {
    if (Date.now() - outlookTime < 15 * 60 * 1000 && cachedOutlook)
        return res.json({ success: true, summary: cachedOutlook, news: cachedNews });
    try {
        const [indiaRes, globalRes] = await Promise.all([
            axios_1.default.get('https://www.livemint.com/rss/markets', { timeout: 10000 }),
            axios_1.default.get('https://www.livemint.com/rss/companies', { timeout: 10000 })
        ]);
        const combinedNews = [...parseFastXML(indiaRes.data), ...parseFastXML(globalRes.data)].sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
        if (!combinedNews.length)
            return res.json({ success: false, message: 'No headlines' });
        cachedNews = combinedNews.slice(0, 15);
        const headlines = cachedNews.map(t => `- ${t.title}`).join('\n');
        cachedOutlook = await (0, claudeClient_1.claudeAsk)('Expert Indian analyst persona. Summarize outlook concisely.', `Headlines:\n${headlines}`, { maxTokens: 200, temperature: 0.4 });
        outlookTime = Date.now();
        res.json({ success: true, summary: cachedOutlook, news: cachedNews });
    }
    catch (e) {
        res.status(500).json({ success: false, message: sanitizeError(e) });
    }
});
// POST /api/chat — Intelligence 5.0 Core
app.post('/api/chat', rateLimiter_1.chatLimiter, authMiddleware_1.requireAuth, subscriptionMiddleware_1.requireSubscription, (0, validation_1.validateBody)(validation_1.chatSchema), async (req, res) => {
    const { message } = req.body || {};
    const upperMsg = message.toUpperCase();
    let detectedTicker = '';
    const words = upperMsg.split(/[^A-Z0-9&-]+/);
    for (const word of words) {
        if (word.length >= 3 && dataService_1.NSE_UNIVERSE[word]) {
            detectedTicker = word;
            break;
        }
    }
    if (!detectedTicker) {
        if (upperMsg.includes('TATA MOTORS'))
            detectedTicker = 'TATAMOTORS';
        else if (upperMsg.includes('HDFC BANK'))
            detectedTicker = 'HDFCBANK';
    }
    let technicalContext = '';
    let stockCardData = null;
    if (detectedTicker) {
        try {
            const [candleRes, fundRes] = await Promise.allSettled([(0, dataService_1.fetchHistoricalData)(detectedTicker + '.NS', 220), (0, fundamentalService_1.fetchStockReport)(detectedTicker)]);
            const candles = candleRes.status === 'fulfilled' ? candleRes.value : [];
            const fund = fundRes.status === 'fulfilled' ? fundRes.value : null;
            if (candles.length > 20) {
                const closes = candles.map(c => c.close);
                const ltp = closes[closes.length - 1];
                const dma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, closes.length);
                const rawCandles = candles.slice(-10).map(c => `[${c.date.split('T')[0]}] O:${c.open.toFixed(1)} C:${c.close.toFixed(1)}`).join('\n');
                technicalContext = `\n[QUANT DATA] ${detectedTicker}: CMP ₹${ltp.toFixed(2)}, DMA200 ₹${dma200.toFixed(2)}\n[RAW PRICE ACTION]\n${rawCandles}`;
                stockCardData = { ticker: detectedTicker, price: +ltp.toFixed(2), signal: ltp > dma200 ? 'BUY' : 'WATCH' };
            }
        }
        catch { }
    }
    const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });
    const systemPrompt = `You are StockSage Intelligence — Multi-Agent Quant Trading system. 
Time: ${nowIST}
${technicalContext}
Rules: 
1. Use RAW PRICE ACTION to justify tactical stance.
2. Speake as a Consensus Board. 
3. Concise, professional, under 280 words.`;
    try {
        const reply = await (0, geminiClient_1.geminiAsk)(systemPrompt, message, { maxTokens: 450, temperature: 0.5 });
        res.json({ success: true, reply, stockCard: stockCardData });
    }
    catch {
        res.status(500).json({ success: false, message: 'Intelligence Core offline.' });
    }
});
app.get('/api/broker/status', (_req, res) => {
    res.json({ success: true, data: { provider: broker?.provider || 'paper', live: !!broker?.live } });
});
app.get('/api/last', (req, res) => {
    const mode = normalizeScanMode(req.query.mode);
    const scan = getCachedScan(mode);
    res.json({ success: !!scan, data: scan });
});
// CRON JOBS
node_cron_1.default.schedule('45 8 * * 1-5', async () => {
    try {
        const { qualified, marketStatus } = await (0, scanner_1.runScanner)(tradingApi);
        const setups = await (0, scanner_1.buildTradeSetups)(qualified);
        lastSwingScan = { timestamp: new Date().toISOString(), marketStatus, setups };
        await (0, notificationService_1.notifyUsersWithMorningDigest)(setups.filter(s => s.confidenceScore >= 7), marketStatus.regime || 'NEUTRAL');
    }
    catch { }
}, { timezone: 'Asia/Kolkata' });
node_cron_1.default.schedule('45 15 * * 1-5', async () => {
    try {
        const { qualified, marketStatus } = await (0, scanner_1.runScanner)(tradingApi);
        const setups = await (0, scanner_1.buildTradeSetups)(qualified);
        lastSwingScan = { timestamp: new Date().toISOString(), marketStatus, setups };
        await (0, notificationService_1.notifyUsersWithPostMarketSummary)(setups, marketStatus.regime || 'NEUTRAL');
    }
    catch { }
}, { timezone: 'Asia/Kolkata' });
// AGENTIC AI
app.get('/api/agent/status', (_req, res) => res.json({ success: true, data: (0, agentEvents_1.getAgentStatus)() }));
app.get('/api/agent/events', (req, res) => res.json({ success: true, data: (0, agentEvents_1.getEvents)(50) }));
app.get('/api/agent/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    (0, agentEvents_1.addSSEClient)(res);
    req.on('close', () => (0, agentEvents_1.removeSSEClient)(res));
});
// SECTORS
app.get('/api/sectors', async (_req, res) => {
    res.json({ success: true, data: { sectors: [], fetchedAt: new Date().toISOString() } });
});
// PORTFOLIO
app.get('/api/portfolio', authMiddleware_1.requireAuth, async (req, res) => {
    const trades = await prismaClient_1.default.trade.findMany({ where: { userId: req.userId } });
    res.json({ success: true, data: trades });
});
app.get('/api/portfolio/summary', authMiddleware_1.requireAuth, async (req, res) => {
    const summary = await (0, portfolioService_1.getPortfolioSummary)(req.userId);
    res.json({ success: true, data: summary });
});
app.post('/api/portfolio/trade', authMiddleware_1.requireAuth, async (req, res) => {
    const trade = await (0, portfolioService_1.createTrade)(req.userId, req.body);
    res.json({ success: true, data: trade });
});
// SPA Fallback
if (process.env.NODE_ENV === 'production') {
    app.get('*', (_req, res) => res.sendFile(path_1.default.join(FRONTEND_DIST, 'index.html')));
}
function computeNextScan() {
    return new Date().toISOString();
}
//# sourceMappingURL=index.js.map