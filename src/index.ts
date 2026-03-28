// =====================================================
// index.ts — Express Server + Cron Scheduler
// =====================================================
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import cron from 'node-cron';
import bcrypt from 'bcryptjs';
import { runScanner, buildTradeSetups } from './scanner';
import { ScanResult } from './types';
import { getTradingApiFromEnv, fetchHistoricalData, fetchNiftyData } from './dataService';
import { fetchStockReport, batchPrefetch } from './fundamentalService';
import { sendPreMarketAlert } from './alerter';
import { NSE_UNIVERSE } from './dataService';
import axios from 'axios';
import { claudeAsk } from './claudeClient';
import { groqAsk } from './groqClient';
import { geminiAsk } from './geminiClient';
import {
    pushEvent, getEvents, getUnreadCount, markAllRead, markRead,
    setAgentState, getAgentStatus, incrementTasksCompleted,
    setLastScan, setNextScan, setMonitoredStocks,
    addThinkingStep, updateThinkingStep, clearThinkingSteps,
    addSSEClient, removeSSEClient,
} from './agentEvents';
import prisma from './prismaClient';
import { updatePerformanceRecords } from './performanceJob';
import { initAutoScanner } from './autoScannerJob';
import { requireAuth, generateToken, AuthRequest } from './authMiddleware';
import { scanLimiter, chatLimiter, authLimiter } from './rateLimiter';
import { requireSubscription } from './subscriptionMiddleware';
import { createTrade, closeTrade, getPortfolioSummary, updateTradeCurrentPrice } from './portfolioService';
import { sendBuyAlert, sendPreMarketDigest } from './whatsappAlert';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
type DbStatus = 'unknown' | 'ready' | 'error';

const dbHealth: {
    status: DbStatus;
    checkedAt: string | null;
    message: string | null;
} = {
    status: 'unknown',
    checkedAt: null,
    message: null,
};

function isDatabaseError(err: any): boolean {
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

function summarizeDbError(err: any): string {
    const raw = (err && typeof err === 'object' && err.message) ? String(err.message) : String(err || '');
    if (!raw) return 'Unknown database error';
    const normalized = raw.replace(/\s+/g, ' ').trim();
    return normalized.slice(0, 240);
}

function markDatabaseHealthy(): void {
    dbHealth.status = 'ready';
    dbHealth.checkedAt = new Date().toISOString();
    dbHealth.message = null;
}

function markDatabaseError(err: any): void {
    dbHealth.status = 'error';
    dbHealth.checkedAt = new Date().toISOString();
    dbHealth.message = summarizeDbError(err);
}

async function verifyDatabaseConnection(): Promise<void> {
    if (!process.env.DATABASE_URL) {
        markDatabaseError('DATABASE_URL is not set');
        console.error('[System] Database connection failed: DATABASE_URL is not set');
        return;
    }
    try {
        await prisma.$connect();
        await prisma.$queryRawUnsafe('SELECT 1');
        markDatabaseHealthy();
        console.log('[System] Database connection ready.');
    } catch (err: any) {
        markDatabaseError(err);
        console.error('[System] Database connection failed:', summarizeDbError(err));
    }
}

// Helper to sanitize database/system errors for the UI
function sanitizeError(err: any): string {
    const raw = (err && typeof err === 'object' && err.message) ? String(err.message) : String(err || '');
    const msg = raw.toLowerCase();
    
    if (isDatabaseError(err)) {
        markDatabaseError(err);
        return 'Database is temporarily unavailable. Please try again later.';
    }
    
    // AI Provider checks
    if (msg.includes('anthropic') || msg.includes('gemini') || msg.includes('groq') || msg.includes('api_key')) {
        return 'AI service configuration error. Please check server logs.';
    }

    return 'Something went wrong on our end. Please try again later.';
}

app.use(cors());
app.use(express.json());

// In production, serve the built React frontend
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

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
    v: 'fix-9',
    db: dbHealth.status,
    dbCheckedAt: dbHealth.checkedAt,
    dbMessage: dbHealth.message,
}));
app.get('/api/ready', (_req, res) => {
    const ready = dbHealth.status === 'ready';
    res.status(ready ? 200 : 503).json({
        status: ready ? 'READY' : 'NOT_READY',
        v: 'fix-9',
        db: dbHealth.status,
        dbCheckedAt: dbHealth.checkedAt,
        dbMessage: dbHealth.message,
    });
});
app.get('/', (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
        const indexPath = path.join(FRONTEND_DIST, 'index.html');
        res.sendFile(indexPath, (err) => {
            if (err) res.status(200).send('StockSage AI Backend Operational (Frontend loading...)');
        });
    } else {
        res.status(200).send('StockSage AI Backend Operational');
    }
});

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(FRONTEND_DIST));
}

// Global process handlers
process.on('uncaughtException', (err) => {
    console.error('[System] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[System] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Cache last scan result
let lastScan: ScanResult | null = null;
let broker: any = null;
let tradingApi: any = null;

// ——————————————————————————————————————————
// ⚡ BACKGROUND INITIALIZATION (Non-blocking)
// ——————————————————————————————————————————
setTimeout(() => {
    try {
        const result = getTradingApiFromEnv();
        broker = result;
        tradingApi = result.api;
        console.log('[System] Heavy modules & Broker API initialized.');
    } catch (e: any) {
        console.error('[System] Deferred initialization failed:', e.message);
    }
}, 1500);

// ——————————————————————————————————————————
// ROUTES
// ——————————————————————————————————————————

app.get('/api/broker/status', (_req: Request, res: Response) => {
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
app.post('/api/auth/register', authLimiter, async (req: Request, res: Response) => {
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
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            res.status(409).json({ success: false, message: 'An account with this email already exists.' });
            return;
        }
        const hashed = await bcrypt.hash(password, 12);
        // Grant a 7-day trial for all new registrations
        const trialExpiry = new Date();
        trialExpiry.setDate(trialExpiry.getDate() + 7);
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashed,
                subscriptionStatus: 'TRIAL',
                subscriptionExpiry: trialExpiry,
            },
            select: { id: true, name: true, email: true, createdAt: true },
        });
        const token = generateToken(user.id, user.email);
        res.json({ success: true, token, user, trialDaysLeft: 7 });
    } catch (err: any) {
        console.error('[Register] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, async (req: Request, res: Response) => {
    const { email } = req.body || {};
    const password = req.body?.password ?? req.body?.secret;
    if (!email || !password) {
        res.status(400).json({ success: false, message: 'Email and password are required.' });
        return;
    }
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            res.status(401).json({ success: false, message: 'Invalid email or password.' });
            return;
        }
        const match = await bcrypt.compare(password, (user as any).password);
        if (!match) {
            res.status(401).json({ success: false, message: 'Invalid email or password.' });
            return;
        }
        const token = generateToken(user.id, user.email);
        const { password: _, ...safeUser } = user as any;
        res.json({ success: true, token, user: safeUser });
    } catch (err: any) {
        console.error('[Login] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { id: true, name: true, email: true, createdAt: true },
        });
        if (!user) { res.status(404).json({ success: false, message: 'User not found.' }); return; }
        res.json({ success: true, user });
    } catch (err: any) {
        console.error('[Auth-Me] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// POST /api/auth/logout — Stateless JWT: just acknowledge (client deletes token)
app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.json({ success: true, message: 'Logged out.' });
});

// ═══════════════════════════════════════════
// WATCHLIST — Persistent, per-user, cloud-synced
// ═══════════════════════════════════════════

// GET /api/watchlist
app.get('/api/watchlist', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const items = await prisma.watchlistItem.findMany({
            where: { userId: req.userId },
            orderBy: { addedAt: 'desc' },
        });
        res.json({ success: true, data: items });
    } catch (err: any) {
        console.error('[Watchlist-GET] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// POST /api/watchlist
app.post('/api/watchlist', requireAuth, async (req: AuthRequest, res: Response) => {
    const { ticker, sector, signal, ltp, target, stopLoss, targetPct, slPct, riskReward, confidenceScore, setupType, buyZone } = req.body || {};
    if (!ticker) { res.status(400).json({ success: false, message: 'ticker is required.' }); return; }
    try {
        const item = await prisma.watchlistItem.upsert({
            where: { userId_ticker: { userId: req.userId!, ticker } },
            update: { sector, signal, ltp, target, stopLoss, targetPct, slPct, riskReward, confidenceScore, setupType, buyZone, addedAt: new Date() },
            create: { userId: req.userId!, ticker, sector, signal, ltp, target, stopLoss, targetPct, slPct, riskReward, confidenceScore, setupType, buyZone },
        });
        res.json({ success: true, data: item });
    } catch (err: any) {
        console.error('[Watchlist-POST] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// DELETE /api/watchlist/:ticker
app.delete('/api/watchlist/:ticker', requireAuth, async (req: AuthRequest, res: Response) => {
    const ticker = req.params.ticker.toUpperCase();
    try {
        await prisma.watchlistItem.deleteMany({ where: { userId: req.userId, ticker } });
        res.json({ success: true });
    } catch (err: any) {
        console.error('[Watchlist-DELETE] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});


// GET /api/scan — Run the full Phase 1+2 scanner (rate limited + subscription gated)
app.get('/api/scan', scanLimiter, requireAuth, requireSubscription, async (req: AuthRequest, res: Response) => {
    try {
        console.log('\n[API] /api/scan called');
        const force = req.query.force === 'true';

        if (!force && lastScan) {
            console.log('[API] Serving cached scan results');
            res.json({ success: true, data: lastScan });
            return;
        }

        // ── Agentic: emit thinking steps ──
        clearThinkingSteps();
        setAgentState('SCANNING', 'Running full market scan');
        pushEvent('SCAN_START', 'info', 'Scanner Started', 'Running full Phase 1+2 scan across Nifty 1000 stocks');

        const s1 = addThinkingStep('Fetching live market data from NSE', 'running');
        console.log('[API] Running full market scan...');
        const { qualified, marketStatus } = await runScanner(tradingApi);
        updateThinkingStep(s1, 'done', `Market regime: ${marketStatus.regime || 'NEUTRAL'}`);

        const s2 = addThinkingStep('Computing technical indicators & AI signals', 'running');
        const setups = await buildTradeSetups(qualified);
        updateThinkingStep(s2, 'done', `${setups.length} setups identified`);

        const s3 = addThinkingStep('Finalizing scan results', 'running');
        updateThinkingStep(s3, 'done', 'Ready');

        lastScan = {
            timestamp: new Date().toISOString(),
            marketStatus,
            setups,
        };

        // Emit scan result events
        const buyCount = setups.filter(s => s.aiSignal === 'BUY').length;
        setAgentState('IDLE');
        incrementTasksCompleted();
        setLastScan(lastScan.timestamp);
        setMonitoredStocks(setups.length);
        pushEvent('SCAN_COMPLETE', 'success',
            `Scan Complete — ${setups.length} Setups Found`,
            `${buyCount} BUY signals, ${setups.length - buyCount} WATCH/AVOID. Regime: ${marketStatus.regime || 'NEUTRAL'}`,
            { data: { total: setups.length, buyCount } }
        );

        // Emit individual high-confidence setup events
        setups.filter(s => s.aiSignal === 'BUY' && s.confidenceScore >= 7).forEach(s => {
            pushEvent('SETUP_FOUND', 'success',
                `🎯 BUY Signal: ${s.ticker}`,
                `${s.setupType} — Confidence ${s.confidenceScore}/10, Target +${s.targetPct.toFixed(1)}%, RR ${s.riskReward}:1`,
                { ticker: s.ticker, data: { confidence: s.confidenceScore, target: s.targetPct } }
            );
        });

        // ── AUTO-LOGGING TO PERFORMANCE DATABASE ──
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Log BUY, LIGHT BUY and interesting WATCH signals
            const signalsToTrack = setups.filter(s => 
                (s.aiSignal === 'BUY' && s.confidenceScore >= 7) || 
                (s.aiSignal === 'LIGHT BUY' && s.confidenceScore >= 6) ||
                (s.aiSignal === 'WATCH' && s.confidenceScore >= 8)
            );

            for (const s of signalsToTrack) {
                const exists = await prisma.historicalSetup.findFirst({
                    where: { ticker: s.ticker, status: 'IN_PROGRESS', createdAt: { gte: today } }
                });

                if (!exists) {
                    await prisma.historicalSetup.create({
                        data: {
                            ticker: s.ticker,
                            setupType: s.setupType,
                            timeframe: s.timeframe,
                            aiSignal: s.aiSignal || 'WATCH',
                            confidenceScore: s.confidenceScore,
                            entryPrice: s.buyZone,
                            targetPrice: s.target,
                            stopLoss: s.stopLoss,
                            aiLogic: s.aiLogic, // Added aiLogic tracking
                            status: 'IN_PROGRESS'
                        }
                    });
                }
            }
        } catch (dbErr: any) {
            console.error('[Database] Failed to log setups to tracker:', dbErr.message);
        }

        // Regime change detection
        if (marketStatus.regime === 'RISK_OFF') {
            pushEvent('MARKET_REGIME_CHANGE', 'critical', '⛔ RISK OFF Regime', marketStatus.regimeDetail || 'Nifty below key moving averages');
        } else if (marketStatus.regime === 'BULLISH') {
            pushEvent('MARKET_REGIME_CHANGE', 'success', '✅ BULLISH Regime', marketStatus.regimeDetail || 'Nifty above key moving averages');
        }

        res.json({ success: true, data: lastScan });

        const scanTickers = setups.map(s => s.ticker);
        if (scanTickers.length) {
            setImmediate(() => batchPrefetch(scanTickers).catch(() => { }));
        }
    } catch (error: any) {
        console.error('[API] Scan error:', error.message);
        setAgentState('IDLE');
        pushEvent('SCAN_FAILED', 'critical', 'Scan Failed', 'System error during market scan. Check logs.');
        res.status(500).json({ success: false, message: sanitizeError(error) });
    }
});

// GET /api/performance — Fetch AI Track Record
app.get('/api/performance', async (req: Request, res: Response) => {
    try {
        const history = await prisma.historicalSetup.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        const stats = {
            total: history.length,
            won: history.filter((h: any) => h.status === 'WON').length,
            lost: history.filter((h: any) => h.status === 'LOST').length,
            inProgress: history.filter((h: any) => h.status === 'IN_PROGRESS').length,
            avgWin: 0,
            avgLoss: 0,
            winRate: 0
        };

        const resolvedCount = stats.won + stats.lost;
        if (resolvedCount > 0) {
            stats.winRate = (stats.won / resolvedCount) * 100;
        }

        const wonTrades = history.filter((h: any) => h.status === 'WON' && h.resultPct);
        if (wonTrades.length) {
            stats.avgWin = wonTrades.reduce((sum: number, t: any) => sum + (t.resultPct || 0), 0) / wonTrades.length;
        }

        const lostTrades = history.filter((h: any) => h.status === 'LOST' && h.resultPct);
        if (lostTrades.length) {
            stats.avgLoss = lostTrades.reduce((sum: number, t: any) => sum + (t.resultPct || 0), 0) / lostTrades.length;
        }

        res.json({ success: true, data: { stats, history } });
    } catch (err: any) {
        console.error('[Performance] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// GET /api/chart/:ticker — Historical OHLCV + indicators for frontend chart
const chartCache: Record<string, { ts: number; data: any }> = {};
app.get('/api/chart/:ticker', async (req: Request, res: Response) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const yahooBSE = `${ticker}.NS`;
        const days = Math.min(Number(req.query.days) || 180, 365);

        // Serve from cache if < 5 min old
        const cached = chartCache[ticker];
        if (cached && Date.now() - cached.ts < 300_000) {
            return res.json({ success: true, data: cached.data });
        }

        const candles = await fetchHistoricalData(yahooBSE, days);
        if (!candles.length) {
            return res.status(404).json({ success: false, message: 'No data found for ' + ticker });
        }

        // Compute SMAs and EMA inline
        const computeSMA = (arr: number[], period: number) => {
            const result: (number | null)[] = [];
            for (let i = 0; i < arr.length; i++) {
                if (i < period - 1) { result.push(null); continue; }
                const sum = arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
                result.push(Number((sum / period).toFixed(2)));
            }
            return result;
        };
        const computeEMA = (arr: number[], period: number) => {
            const k = 2 / (period + 1);
            const result: (number | null)[] = [];
            let ema: number | null = null;
            for (let i = 0; i < arr.length; i++) {
                if (i < period - 1) { result.push(null); continue; }
                if (ema === null) {
                    ema = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
                } else {
                    ema = arr[i] * k + ema * (1 - k);
                }
                result.push(Number(ema.toFixed(2)));
            }
            return result;
        };

        // Compute RSI
        const computeRSI = (closes: number[], period = 14) => {
            const rsi: (number | null)[] = [];
            let gainSum = 0, lossSum = 0;
            for (let i = 0; i < closes.length; i++) {
                if (i === 0) { rsi.push(null); continue; }
                const diff = closes[i] - closes[i - 1];
                const gain = diff > 0 ? diff : 0;
                const loss = diff < 0 ? -diff : 0;
                if (i < period) {
                    gainSum += gain; lossSum += loss;
                    rsi.push(null); continue;
                }
                if (i === period) {
                    gainSum += gain; lossSum += loss;
                    const avgGain = gainSum / period;
                    const avgLoss = lossSum / period;
                    rsi.push(avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)));
                    gainSum = avgGain; lossSum = avgLoss; // reuse as smoothed
                } else {
                    const avgGain = (gainSum * (period - 1) + gain) / period;
                    const avgLoss = (lossSum * (period - 1) + loss) / period;
                    rsi.push(avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)));
                    gainSum = avgGain; lossSum = avgLoss;
                }
            }
            return rsi;
        };

        const closes = candles.map(c => c.close);
        const sma20 = computeSMA(closes, 20);
        const sma50 = computeSMA(closes, 50);
        const sma200 = computeSMA(closes, 200);
        const ema20 = computeEMA(closes, 20);
        const rsi14 = computeRSI(closes, 14);

        // Compute volume SMA
        const volumes = candles.map(c => c.volume);
        const volSma20 = computeSMA(volumes, 20);

        const chartData = {
            ticker,
            candles: candles.map((c, i) => ({
                time: c.date,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume,
                sma20: sma20[i],
                sma50: sma50[i],
                sma200: sma200[i],
                ema20: ema20[i],
                rsi: rsi14[i],
                volSma20: volSma20[i],
            })),
        };

        chartCache[ticker] = { ts: Date.now(), data: chartData };
        res.json({ success: true, data: chartData });
    } catch (error: any) {
        console.error('[API] Chart error:', error.message);
        res.status(500).json({ success: false, message: sanitizeError(error) });
    }
});

// ── MARKET PULSE ───────────────────────────────────
// Lightweight endpoint: live Nifty price + all index changes
// Cached 5 min to avoid hammering Yahoo Finance
let pulseCache: { data: any; ts: number } | null = null;
const PULSE_TTL = 5 * 60 * 1000; // 5 minutes

app.get('/api/market-pulse', async (_req: Request, res: Response) => {
    if (pulseCache && Date.now() - pulseCache.ts < PULSE_TTL) {
        res.json({ success: true, data: pulseCache.data });
        return;
    }
    try {
        const symbols = [
            { key: 'nifty', symbol: '^NSEI' },
            { key: 'sensex', symbol: '^BSESN' },
            { key: 'midcap', symbol: '^NSMIDCP' },
            { key: 'banknifty', symbol: '^NSEBANK' },
            { key: 'gold', symbol: 'GOLDBEES.NS' },
            { key: 'silver', symbol: 'SILVERBEES.NS' },
            { key: 'vix', symbol: '^INDIAVIX' }
        ];

        const results = await Promise.allSettled(
            symbols.map(s => fetchHistoricalData(s.symbol, 260))
        );

        const state: Record<string, any> = {};

        symbols.forEach((s, i) => {
            const res = results[i];
            if (res.status === 'fulfilled' && res.value.length >= 2) {
                const c = res.value;
                const price = +c[c.length - 1].close.toFixed(2);
                const prev = c[c.length - 2].close;
                const change = +(((price - prev) / prev) * 100).toFixed(2);

                const closes = c.map((x: any) => x.close);
                const high52 = +Math.max(...closes.slice(-252)).toFixed(2);
                const low52 = +Math.min(...closes.slice(-252)).toFixed(2);
                const pct52 = high52 > low52 ? +(((price - low52) / (high52 - low52)) * 100).toFixed(1) : 0;

                // Keep the last 30 closes for a mini sparkline chart
                const sparkline = closes.slice(-30).map((n: number) => +n.toFixed(2));

                state[s.key] = { price, change, high52, low52, pct52, sparkline };
            } else {
                state[s.key] = { price: 0, change: 0, high52: 0, low52: 0, pct52: 0, sparkline: [] };
            }
        });

        // Derive market risk from VIX — available without any scan
        const vixLevel = state.vix.price;
        const vixRisk =
            vixLevel === 0 ? 'unknown' :
                vixLevel < 13 ? 'calm' :
                    vixLevel < 16 ? 'normal' :
                        vixLevel < 20 ? 'elevated' :
                            vixLevel < 25 ? 'high' : 'extreme';

        const vixLabel =
            vixRisk === 'calm' ? { text: 'Bull Zone', color: '#34d399', detail: 'Full position sizing allowed' } :
                vixRisk === 'normal' ? { text: 'Market Clear', color: '#34d399', detail: 'Normal position sizing allowed' } :
                    vixRisk === 'elevated' ? { text: 'Elevated Risk', color: '#fbbf24', detail: 'Reduce to 60% position size' } :
                        vixRisk === 'high' ? { text: 'Danger Zone', color: '#f87171', detail: 'Avoid new longs. Trail stops.' } :
                            vixRisk === 'extreme' ? { text: 'Crisis Mode', color: '#f87171', detail: 'Stay in cash. No new trades.' } :
                                { text: 'Checking VIX…', color: 'var(--text-muted)', detail: 'Fetching data' };

        const isMarketOpen = (() => {
            const now = new Date();
            const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
            const h = ist.getHours(), m = ist.getMinutes(), day = ist.getDay();
            if (day === 0 || day === 6) return false;
            const mins = h * 60 + m;
            return mins >= 555 && mins <= 930;
        })();

        const data = {
            indices: state,
            vixRisk,
            vixLabel,
            isMarketOpen,
            fetchedAt: new Date().toISOString(),
        };

        pulseCache = { data, ts: Date.now() };
        res.json({ success: true, data });
    } catch (err: any) {
        console.error('[Pulse] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});





let cachedOutlook = '';
let cachedNews: any[] = [];
let outlookTime = 0;

function parseFastXML(xml: string) {
    const items: any[] = [];
    const chunks = xml.split('<item>').slice(1);
    for (const chunk of chunks) {
        const itemContent = chunk.split('</item>')[0];
        const extract = (tag: string) => {
            const start = `<${tag}>`;
            const end = `</${tag}>`;
            const s = itemContent.indexOf(start);
            const e = itemContent.indexOf(end);
            if (s !== -1 && e !== -1) {
                let val = itemContent.substring(s + start.length, e);
                // Clean up XML enclosures and CDATA
                val = val.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
                    .replace(/&#39;/g, "'").replace(/&quot;/g, '"');
                return val.trim();
            }
            return '';
        };
        const title = extract('title');
        const link = extract('link');
        const pubDate = extract('pubDate');
        if (title && link) items.push({ title, link, pubDate });
    }
    return items;
}

// GET /api/market-outlook — Read general market news and summarize
app.get('/api/market-outlook', async (req: Request, res: Response) => {
    if (Date.now() - outlookTime < 15 * 60 * 1000 && cachedOutlook) {
        return res.json({ success: true, summary: cachedOutlook, news: cachedNews });
    }
    try {
        const [indiaRes, globalRes] = await Promise.all([
            axios.get('https://www.livemint.com/rss/markets', { timeout: 10000 }),
            axios.get('https://www.livemint.com/rss/companies', { timeout: 10000 })
        ]);

        const indiaNews = parseFastXML(indiaRes.data).slice(0, 10);
        const globalNews = parseFastXML(globalRes.data).slice(0, 10);
        const combinedNews = [...indiaNews, ...globalNews].sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

        if (!combinedNews.length) {
            return res.json({ success: false, message: 'Could not fetch headlines.' });
        }

        cachedNews = combinedNews;
        const headlines = combinedNews.slice(0, 15).map(t => `- ${t.title}`).join('\n');

        try {
            cachedOutlook = await claudeAsk(
                'You are an expert Indian stock market analyst. Summarize the market outlook for swing traders in 3-4 sentences. Be concise, opinionated, and actionable. Plain text only, no bullet points or markdown.',
                `Top market headlines:\n${headlines}`,
                { maxTokens: 200, temperature: 0.4 }
            );
        } catch (aiErr: any) {
            console.error('[Market Outlook AI] Error:', aiErr.message);
            cachedOutlook = 'AI summary unavailable. Check your ANTHROPIC_API_KEY in .env';
        }

        outlookTime = Date.now();
        res.json({ success: true, summary: cachedOutlook, news: cachedNews });
    } catch (e: any) {
        console.error('[Outlook] Error:', e);
        res.status(500).json({ success: false, message: sanitizeError(e) });
    }
});

// POST /api/chat — AI Stock Research Chatbot powered by Gemini AI (rate limited + subscription gated)
app.post('/api/chat', chatLimiter, requireAuth, requireSubscription, async (req: AuthRequest, res: Response) => {
    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
        res.status(400).json({ success: false, message: 'Missing message' });
        return;
    }

    // Detect known stock tickers in the message
    const upperMsg = message.toUpperCase();
    const knownStocks: Record<string, string> = {
        'RELIANCE': 'RELIANCE', 'TATA MOTORS': 'TATAMOTORS', 'TATAMOTORS': 'TATAMOTORS',
        'INFOSYS': 'INFY', 'INFY': 'INFY', 'TCS': 'TCS', 'HDFC': 'HDFCBANK',
        'HDFCBANK': 'HDFCBANK', 'WIPRO': 'WIPRO', 'ICICI': 'ICICIBANK', 'ICICIBANK': 'ICICIBANK',
        'BAJAJ': 'BAJFINANCE', 'BAJFINANCE': 'BAJFINANCE', 'ADANI': 'ADANIENT',
        'ZOMATO': 'ZOMATO', 'PAYTM': 'PAYTM', 'SBI': 'SBIN', 'SBIN': 'SBIN',
        'AXIS': 'AXISBANK', 'AXISBANK': 'AXISBANK', 'MARUTI': 'MARUTI',
        'SUNPHARMA': 'SUNPHARMA', 'ONGC': 'ONGC', 'LTIM': 'LTIM', 'HCLTECH': 'HCLTECH',
        'TATASTEEL': 'TATASTEEL', 'JSWSTEEL': 'JSWSTEEL', 'POWERGRID': 'POWERGRID',
        'NTPC': 'NTPC', 'BPCL': 'BPCL', 'IRCTC': 'IRCTC', 'ITC': 'ITC',
        'TITAN': 'TITAN', 'DABUR': 'DABUR', 'DMART': 'DMART', 'NESTLEIND': 'NESTLEIND',
    };

    let detectedTicker = '';
    for (const [key, ticker] of Object.entries(knownStocks)) {
        if (upperMsg.includes(key)) { detectedTicker = ticker; break; }
    }

    // Build live technical context for the detected stock
    let technicalContext = '';
    let stockCardData: any = null;

    if (detectedTicker && detectedTicker !== 'NIFTY') {
        try {
            const [candleRes, fundRes] = await Promise.allSettled([
                fetchHistoricalData(detectedTicker + '.NS', 220),
                fetchStockReport(detectedTicker),
            ]);
            const candles = candleRes.status === 'fulfilled' ? candleRes.value : [];
            const fund = fundRes.status === 'fulfilled' ? fundRes.value : null;

            if (candles.length > 20) {
                const closes = candles.map(c => c.close);
                const ltp = closes[closes.length - 1];
                const dma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, closes.length);
                const ema20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;

                const gains: number[] = [], losses: number[] = [];
                for (let i = 1; i <= 14; i++) {
                    const diff = closes[closes.length - i] - closes[closes.length - i - 1];
                    if (diff > 0) gains.push(diff); else losses.push(Math.abs(diff));
                }
                const avgGain = gains.reduce((a, b) => a + b, 0) / 14;
                const avgLoss = losses.reduce((a, b) => a + b, 0) / 14;
                const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
                const aboveDMA = ltp > dma200;
                const aboveEMA = ltp > ema20;
                const rsiLabel = rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral';

                technicalContext = `
Live Technical Data for ${detectedTicker} (NSE):
- Price: ₹${ltp.toFixed(2)}
- RSI(14): ${rsi.toFixed(1)} — ${rsiLabel}
- 200 DMA: ₹${dma200.toFixed(2)} — price is ${aboveDMA ? 'ABOVE (bullish trend)' : 'BELOW (bearish trend)'}
- 20 EMA: ₹${ema20.toFixed(2)} — price is ${aboveEMA ? 'ABOVE' : 'BELOW'} short-term trend
- 52W High: ₹${Math.max(...closes.slice(-252)).toFixed(2)}
- 52W Low:  ₹${Math.min(...closes.slice(-252)).toFixed(2)}`;

                if (fund) {
                    technicalContext += `
- Sector: ${fund.sector || 'N/A'}
- P/E: ${fund.peRatio?.toFixed(1) ?? 'N/A'} | ROE: ${fund.roe?.toFixed(1) ?? 'N/A'}%`;
                }

                const targetPct = 8, slPct = 4;
                const conf = aboveDMA && rsi < 65 && rsi > 35 ? 8 : aboveDMA ? 6 : 4;
                const signal = conf >= 7 ? 'BUY' : conf >= 5 ? 'WATCH' : 'AVOID';
                stockCardData = {
                    ticker: detectedTicker,
                    price: +ltp.toFixed(2),
                    signal,
                    buyZone: +ltp.toFixed(2),
                    target: +(ltp * (1 + targetPct / 100)).toFixed(2),
                    stopLoss: +(ltp * (1 - slPct / 100)).toFixed(2),
                    targetPct, slPct,
                    riskReward: +(targetPct / slPct).toFixed(1),
                    confidenceScore: conf,
                    sector: fund?.sector || 'NSE Stock',
                    setupType: aboveDMA && rsi < 60 ? 'Pullback Continuation' : 'Watchlist',
                };
            }
        } catch { /* proceed without live data */ }
    }

    // ── Detect if user is asking about news / today's market ─────────────────
    const newsKeywords = ['news', 'today', 'market', 'nifty', 'sensex', 'fell', 'rally', 'crash',
        'why', 'happen', 'current', 'latest', 'fall', 'rise', 'up', 'down', 'move',
        'reason', 'cause', 'result', 'week', 'month', 'quarter', 'budget', 'rbi', 'fed',
        'inflation', 'gdp', 'earnings', 'results', 'event', 'trigger', 'impact'];
    const isNewsQuery = newsKeywords.some(kw => upperMsg.toLowerCase().includes(kw));

    let newsContext = '';
    if (isNewsQuery) {
        try {
            // Use cached headlines if fresh enough (<30 min), else fetch new ones
            let headlines: string[] = [];
            if (cachedNews.length > 0) {
                headlines = cachedNews.slice(0, 12).map((n: any) => `- ${n.title}`);
            } else {
                const [indiaRes, globalRes] = await Promise.allSettled([
                    axios.get('https://www.livemint.com/rss/markets', { timeout: 7000 }),
                    axios.get('https://www.livemint.com/rss/companies', { timeout: 7000 }),
                ]);
                const raw: any[] = [];
                if (indiaRes.status === 'fulfilled') raw.push(...parseFastXML(indiaRes.value.data).slice(0, 8));
                if (globalRes.status === 'fulfilled') raw.push(...parseFastXML(globalRes.value.data).slice(0, 6));
                headlines = raw.map(n => `- ${n.title}`);
            }
            if (headlines.length > 0) {
                newsContext = `
Today's Live Market Headlines (from LiveMint — use these for any news/market questions):
${headlines.join('\n')}
`;
            }
        } catch { /* proceed without news */ }
    }

    // Always inject current date/time so the AI knows it's not 2024
    const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });

    const topSetups = lastScan?.setups?.slice(0, 5).map(s =>
        `${s.ticker} (${s.setupType}, Conf:${s.confidenceScore}/10, Signal:${s.aiSignal})`
    ).join(', ') || 'No recent scan on record.';

    const systemPrompt = `You are StockSage AI — India's most helpful stock market research companion.
Speak like a knowledgeable friend who trades NSE stocks. Be warm, clear, and concise.

IMPORTANT: Current date and time is ${nowIST} (IST). Never say you don't know today's date.

Context:
- Today's top scanner setups: ${topSetups}
${technicalContext}
${newsContext}
Rules:
- For news/market questions: ALWAYS use the live headlines provided above. Summarize and explain them — do NOT say you lack current information.
- For stock analysis: use the live technical data provided above
- For concept questions: explain simply with Indian market examples
- Respond in short paragraphs or bullet points — under 280 words
- End stock analysis with a brief risk note
- Never promise returns or recommend position sizes
- If asked what's in the news today: summarize the live headlines provided, don't say you can't access the internet`;

    try {
        let reply = '';
        try {
            // Try Gemini primary (User preference for live context)
            reply = await geminiAsk(systemPrompt, message, { maxTokens: 450, temperature: 0.4 });
        } catch (GeminiErr: any) {
            console.warn('[Chat] Gemini failed, falling back to Claude...', GeminiErr.message);
            try {
                // Fallback to Claude
                reply = await claudeAsk(systemPrompt, message, { maxTokens: 450, temperature: 0.4 });
            } catch (ClaudeErr: any) {
                console.warn('[Chat] Claude failed, falling back to Groq...', ClaudeErr.message);
                // Last resort: Groq (Llama 3.3 70B)
                reply = await groqAsk(systemPrompt, message, { maxTokens: 450, temperature: 0.5 });
            }
        }
        res.json({ success: true, reply, stockCard: stockCardData });
    } catch (error: any) {
        const errMsg = error?.message ?? 'Unknown error';
        console.error('[Chat API] Claude error:', errMsg);
        // Check if it's a key config issue
        if (errMsg.includes('ANTHROPIC_API_KEY')) {
            res.status(503).json({
                success: false,
                reply: '⚠️ ' + errMsg,
                stockCard: null,
            });
        } else {
            res.status(500).json({
                success: false,
                reply: `⚠️ AI agent is temporarily unavailable. Please try again in few moments.`,
                stockCard: null,
            });
        }
    }
});


app.get('/api/broker/status', (_req: Request, res: Response) => {
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
app.get('/api/last', (req: Request, res: Response) => {
    if (!lastScan) {
        res.json({ success: false, message: 'No scan has been run yet. Hit /api/scan first.' });
        return;
    }
    res.json({ success: true, data: lastScan });
});



// ——————————————————————————————————————————
// CRON JOBS
// ——————————————————————————————————————————

// ── Pre-Market Watchlist at 8:45 AM IST (before NSE opens at 9:15 AM) ─────────
cron.schedule('45 8 * * 1-5', async () => {
    console.log('\n[CRON] 🔔 Pre-market scan triggered at 8:45 AM IST');
    try {
        const { qualified, marketStatus } = await runScanner(tradingApi);
        let setups = await buildTradeSetups(qualified);

        // Filter: Only HIGH-QUALITY setups for the email (Confidence >= 7, BUY or WATCH signal)
        const alertSetups = setups.filter(s =>
            s.confidenceScore >= 7 && (s.aiSignal === 'BUY' || s.aiSignal === 'WATCH')
        );

        lastScan = {
            timestamp: new Date().toISOString(),
            marketStatus,
            setups,
        };

        // Send email alert with filtered high-quality setups
        await sendPreMarketAlert(alertSetups);
        console.log(`[CRON] Pre-market scan complete: ${setups.length} total, ${alertSetups.length} high-quality alerts sent`);
    } catch (err: any) {
        console.error('[CRON] Pre-market scan failed:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });

// Run scanner every day at 9:20 AM IST (NSE opens 9:15 AM)
cron.schedule('20 9 * * 1-5', async () => {
    console.log('\n[CRON] Morning scan triggered at 9:20 AM IST');
    const { qualified, marketStatus } = await runScanner(tradingApi);
    const setups = await buildTradeSetups(qualified);
    lastScan = {
        timestamp: new Date().toISOString(),
        marketStatus,
        setups,
    };
}, { timezone: 'Asia/Kolkata' });

// Run End-of-Day (EOD) scanner at 3:45 PM IST (Market closes 3:30 PM)
cron.schedule('45 15 * * 1-5', async () => {
    console.log('\n[CRON] EOD Scan triggered at 3:45 PM IST');
    const { qualified, marketStatus } = await runScanner(tradingApi);
    const setups = await buildTradeSetups(qualified);
    lastScan = {
        timestamp: new Date().toISOString(),
        marketStatus,
        setups,
    };

    // Background: pre-warm fundamentals for all qualified tickers
    const scanTickers = setups.map(s => s.ticker);
    if (scanTickers.length) {
        setImmediate(() => batchPrefetch(scanTickers).catch(() => { }));
    }
}, { timezone: 'Asia/Kolkata' });

// ══════════════════════════════════════════════════════
// AGENTIC AI — Event System & SSE Routes
// ══════════════════════════════════════════════════════

// GET /api/agent/status — Current AI agent status
app.get('/api/agent/status', (_req: Request, res: Response) => {
    res.json({ success: true, data: getAgentStatus() });
});

// GET /api/agent/events — Get recent events
app.get('/api/agent/events', (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const unreadOnly = req.query.unread === 'true';
    res.json({ success: true, data: getEvents(limit, unreadOnly), unreadCount: getUnreadCount() });
});

// POST /api/agent/events/read — Mark events as read
app.post('/api/agent/events/read', (req: Request, res: Response) => {
    const { eventId } = req.body || {};
    if (eventId) markRead(eventId);
    else markAllRead();
    res.json({ success: true, unreadCount: getUnreadCount() });
});

// GET /api/agent/stream — SSE real-time event stream
app.get('/api/agent/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    addSSEClient(res);
    req.on('close', () => removeSSEClient(res));
});

// GET /api/sectors — Live sector performance data
let sectorCache: { data: any; ts: number } | null = null;
const SECTOR_TTL = 10 * 60 * 1000; // 10 min

const SECTOR_ETFS: Record<string, string> = {
    'Nifty IT': '^CNXIT',
    'Bank Nifty': '^NSEBANK',
    'Nifty Pharma': '^CNXPHARMA',
    'Nifty Auto': '^CNXAUTO',
    'Nifty Metal': '^CNXMETAL',
    'Nifty FMCG': '^CNXFMCG',
    'Nifty Energy': '^CNXENERGY',
    'Nifty Realty': '^CNXREALTY',
    'Nifty Infra': '^CNXINFRA',
};

app.get('/api/sectors', async (_req: Request, res: Response) => {
    if (sectorCache && Date.now() - sectorCache.ts < SECTOR_TTL) {
        return res.json({ success: true, data: sectorCache.data });
    }
    try {
        const results = await Promise.allSettled(
            Object.entries(SECTOR_ETFS).map(async ([name, symbol]) => {
                const candles = await fetchHistoricalData(symbol, 10);
                if (candles.length >= 2) {
                    const prev = candles[candles.length - 2].close;
                    const curr = candles[candles.length - 1].close;
                    return { n: name.replace('Nifty ', ''), v: +((curr - prev) / prev * 100).toFixed(2) };
                }
                return { n: name.replace('Nifty ', ''), v: 0 };
            })
        );
        const sectors = results
            .filter((r): r is PromiseFulfilledResult<{ n: string; v: number }> => r.status === 'fulfilled')
            .map(r => r.value);
        sectorCache = { data: { sectors, fetchedAt: new Date().toISOString() }, ts: Date.now() };
        res.json({ success: true, data: sectorCache.data });
    } catch (err: any) {
        console.error('[Sectors] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// Daily Performance Tracking Job (Run at 16:00 IST / 10:30 UTC)
cron.schedule('30 10 * * 1-5', () => {
    updatePerformanceRecords();
});

// ——————————————————————————————————————————
// ⚡ BACKGROUND INITIALIZATION (Non-Blocking)
// ——————————————————————————————————————————
setTimeout(() => {
    try {
        console.log('[System] Background Init: Starting AI Agent System...');
        initAutoScanner();
        setNextScan(computeNextScan());
        pushEvent('SYSTEM', 'success', 'StockSage AI Online', 'Autonomous agent systems initialized in background.');
    } catch (e: any) {
        console.error('[System] Background Init Failed:', e.message);
    }
}, 3000);


// ══════════════════════════════════════════════
// PORTFOLIO ROUTES
// ══════════════════════════════════════════════

// GET /api/portfolio — list all user trades
app.get('/api/portfolio', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const trades = await prisma.trade.findMany({
            where: { userId: req.userId },
            orderBy: { entryDate: 'desc' },
        });
        res.json({ success: true, data: trades });
    } catch (err: any) {
        console.error('[Portfolio-GET] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// GET /api/portfolio/summary — aggregated P&L stats
app.get('/api/portfolio/summary', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const summary = await getPortfolioSummary(req.userId!);
        res.json({ success: true, data: summary });
    } catch (err: any) {
        console.error('[Portfolio-Summary] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// POST /api/portfolio/trade — log a new trade entry
app.post('/api/portfolio/trade', requireAuth, async (req: AuthRequest, res: Response) => {
    const { ticker, entryPrice, quantity, stopLossInit, target1, target2,
            companyName, sector, capCategory, setupType, regimeAtEntry,
            confidenceScore, notes } = req.body || {};
    if (!ticker || !entryPrice || !quantity || !stopLossInit || !target1) {
        res.status(400).json({ success: false, message: 'ticker, entryPrice, quantity, stopLossInit, target1 are required.' });
        return;
    }
    try {
        const trade = await createTrade(req.userId!, {
            ticker, entryPrice: +entryPrice, quantity: +quantity,
            stopLossInit: +stopLossInit, target1: +target1, target2: target2 ? +target2 : undefined,
            companyName, sector, capCategory, setupType, regimeAtEntry,
            confidenceScore: confidenceScore ? +confidenceScore : undefined, notes,
        });
        res.json({ success: true, data: trade });
    } catch (err: any) {
        console.error('[Portfolio-POST] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// PUT /api/portfolio/trade/:id — close a trade or update
app.put('/api/portfolio/trade/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    const { exitPrice, exitReason, currentPrice, notes } = req.body || {};
    try {
        if (exitPrice && exitReason) {
            const trade = await closeTrade(req.userId!, req.params.id,
                { exitPrice: +exitPrice, exitReason });
            res.json({ success: true, data: trade });
        } else if (currentPrice) {
            const trade = await updateTradeCurrentPrice(req.params.id, +currentPrice);
            res.json({ success: true, data: trade });
        } else {
            const trade = await prisma.trade.update({
                where: { id: req.params.id },
                data: { notes },
            });
            res.json({ success: true, data: trade });
        }
    } catch (err: any) {
        console.error('[Portfolio-PUT] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// DELETE /api/portfolio/trade/:id
app.delete('/api/portfolio/trade/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        await prisma.trade.deleteMany({ where: { id: req.params.id, userId: req.userId } });
        res.json({ success: true });
    } catch (err: any) {
        console.error('[Portfolio-DELETE] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// ══════════════════════════════════════════════
// USER PREFERENCES (WhatsApp + Notifications)
// ══════════════════════════════════════════════

// GET /api/user/preferences
app.get('/api/user/preferences', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { 
                id: true, name: true, email: true,
                subscriptionStatus: true, subscriptionExpiry: true,
                telegramChatId: true, notifyBuySignals: true, notifyEmail: true,
            },
        });
        res.json({ success: true, data: user });
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// POST /api/user/preferences — update notification settings
app.post('/api/user/preferences', requireAuth, async (req: AuthRequest, res: Response) => {
    const { whatsappNumber, notifyBuySignals, notifyEmail, name } = req.body || {};
    try {
        const update: any = {};
        if (whatsappNumber !== undefined) update.telegramChatId = whatsappNumber; // stored in telegramChatId field
        if (notifyBuySignals !== undefined) update.notifyBuySignals = !!notifyBuySignals;
        if (notifyEmail !== undefined) update.notifyEmail = !!notifyEmail;
        if (name) update.name = name;
        const user = await prisma.user.update({ where: { id: req.userId }, data: update });
        res.json({ success: true, data: { id: user.id, name: user.name, email: user.email } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// ══════════════════════════════════════════════
// ADMIN — Activate Subscription
// ══════════════════════════════════════════════
app.post('/api/admin/activate', async (req: Request, res: Response) => {
    const adminSecret = req.headers['x-admin-secret'];
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
        res.status(403).json({ success: false, message: 'Forbidden.' });
        return;
    }
    const { email, planDays = 30 } = req.body || {};
    if (!email) { res.status(400).json({ success: false, message: 'email required.' }); return; }
    try {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + (+planDays));
        const user = await prisma.user.update({
            where: { email },
            data: { subscriptionStatus: 'ACTIVE', subscriptionExpiry: expiry },
        });
        res.json({ success: true, message: `Activated ${planDays}-day plan for ${user.email}. Expires: ${expiry.toDateString()}` });
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// ══════════════════════════════════════════════
// ECONOMIC CALENDAR
// ══════════════════════════════════════════════
app.get('/api/economic-calendar', (_req: Request, res: Response) => {
    const now = new Date();
    const year = now.getFullYear();
    // Key recurring NSE/RBI events (static + computed)
    const events = [
        // F&O expiry — last Thursday of each month
        ...Array.from({ length: 12 }, (_, m) => {
            const last = new Date(year, m + 1, 0);
            const day = last.getDay();
            const daysBack = (day - 4 + 7) % 7;
            const expiry = new Date(year, m, last.getDate() - daysBack);
            return { date: expiry.toISOString().split('T')[0], label: 'Monthly F&O Expiry', type: 'FNO', importance: 'HIGH' };
        }),
        // RBI policy meetings 2026 (approximate — 6 per year)
        { date: `${year}-04-09`, label: 'RBI MPC Meeting', type: 'RBI', importance: 'CRITICAL' },
        { date: `${year}-06-04`, label: 'RBI MPC Meeting', type: 'RBI', importance: 'CRITICAL' },
        { date: `${year}-08-06`, label: 'RBI MPC Meeting', type: 'RBI', importance: 'CRITICAL' },
        { date: `${year}-10-08`, label: 'RBI MPC Meeting', type: 'RBI', importance: 'CRITICAL' },
        { date: `${year}-12-03`, label: 'RBI MPC Meeting', type: 'RBI', importance: 'CRITICAL' },
        // Q4 Results season
        { date: `${year}-04-15`, label: 'Q4 Results Season Begins', type: 'EARNINGS', importance: 'HIGH' },
        { date: `${year}-07-15`, label: 'Q1 Results Season Begins', type: 'EARNINGS', importance: 'HIGH' },
        { date: `${year}-10-15`, label: 'Q2 Results Season Begins', type: 'EARNINGS', importance: 'HIGH' },
        { date: `${year+1}-01-15`, label: 'Q3 Results Season Begins', type: 'EARNINGS', importance: 'HIGH' },
        // Budget
        { date: `${year+1}-02-01`, label: 'Union Budget', type: 'BUDGET', importance: 'CRITICAL' },
    ]
    .filter(e => new Date(e.date) >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 8);

    res.json({ success: true, data: events });
});

// ══════════════════════════════════════════════
// FII/DII DATA
// ══════════════════════════════════════════════
let fiiDiiCache: { data: any; ts: number } | null = null;
app.get('/api/fii-dii', async (_req: Request, res: Response) => {
    if (fiiDiiCache && Date.now() - fiiDiiCache.ts < 60 * 60 * 1000) {
        return res.json({ success: true, data: fiiDiiCache.data });
    }
    try {
        const response = await axios.get(
            'https://www.nseindia.com/api/fiidiiTradeReact',
            { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://www.nseindia.com' }, timeout: 8000 }
        );
        const data = response.data?.data || [];
        // Get last 5 trading days
        const recent = data.slice(0, 5).map((d: any) => ({
            date: d.date,
            fiiBuy: d.fiiBuy, fiiSell: d.fiiSell, fiiNet: d.fiiNet,
            diiBuy: d.diiBuy, diiSell: d.diiSell, diiNet: d.diiNet,
        }));
        fiiDiiCache = { data: recent, ts: Date.now() };
        res.json({ success: true, data: recent });
    } catch (err: any) {
        console.error('[FII-DII] NSE fetch failed:', err.message);
        // Return fallback zeros to avoid frontend crash
        res.json({ success: true, data: [], note: 'NSE data temporarily unavailable.' });
    }
});

// SPA fallback — must be after all API routes so React Router handles all non-API paths
if (process.env.NODE_ENV === 'production') {
    app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
}

// Compute next scheduled scan time
function computeNextScan(): string {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const h = ist.getHours();
    if (h < 9 || (h === 9 && ist.getMinutes() < 20)) {
        ist.setHours(9, 20, 0, 0);
    } else if (h < 15 || (h === 15 && ist.getMinutes() < 45)) {
        ist.setHours(15, 45, 0, 0);
    } else {
        ist.setDate(ist.getDate() + 1);
        ist.setHours(9, 20, 0, 0);
    }
    return ist.toISOString();
}
