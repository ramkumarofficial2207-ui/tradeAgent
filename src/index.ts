// =====================================================
// index.ts — Express Server + Cron Scheduler
// =====================================================
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import cron from 'node-cron';
import bcrypt from 'bcryptjs';
import { MarketDataInterval, ScanResult } from './types';
import { fetchHistoricalData, fetchLtp, fetchNiftyData, getLiveQuoteSnapshots, NSE_UNIVERSE, SECTOR_MAP, getTradingApiFromEnv } from './dataService';
import { fetchStockReport, batchPrefetch } from './fundamentalService';
import { sendPreMarketAlert } from './alerter';
import axios from 'axios';
import { claudeAsk } from './claudeClient';
import { groqAsk } from './groqClient';
import { geminiAsk } from './geminiClient';
import {
    pushEvent, getEvents, getUnreadCount, markAllRead, markRead,
    getAgentStatus,
    addSSEClient, removeSSEClient,
} from './agentEvents';
import { getDhanWebSocketInstance } from './dhanWebSocket';
import { liveTickerStore } from './liveTickerStore';
import prisma from './prismaClient';
import { updatePerformanceRecords } from './performanceJob';
import { initAutoScanner } from './autoScannerJob';
import { initGlobalAgent } from './globalAgent';
import {
    requireAuth,
    requireAdmin,
    generateToken,
    generateKiteOauthState,
    verifyKiteOauthState,
    isAdminEmail,
    AuthRequest,
    assertAuthConfiguration,
} from './authMiddleware';
import { scanLimiter, chatLimiter, authLimiter, paymentLimiter } from './rateLimiter';
import { requireSubscription } from './subscriptionMiddleware';
import { createTrade, closeTrade, getPortfolioIntelligence, getPortfolioNewsRisk, getPortfolioSummary, updateOwnedTrade } from './portfolioService';
import { sendBuyAlert, sendPreMarketDigest } from './whatsappAlert';
import { notifyUsersWithMorningDigest, notifyUsersWithPostMarketSummary } from './notificationService';
import {
    getInstitutionalFlowSummary,
    importInstitutionalFlowCsv,
    seedInstitutionalFlowIfEmpty,
    syncInstitutionalFlowFromOfficialReport,
} from './institutionalFlowService';
import { syncNseDailyBulkDeals, backfillNseBulkDeals } from './services/institutionalService';
import { getStockDeepDive } from './services/stockDeepDiveService';
import { calculateRiskAndPosition, querySignalLabsAi } from './services/riskCalculatorService';
import { scanIntradayDeliverySpikes } from './services/intradayDeliveryService';
import {
    createRazorpayOrder,
    processRazorpayWebhook,
    SUBSCRIPTION_PLANS,
    verifyAndActivateSubscription,
} from './services/subscriptionPaymentService';
import { fetchTickerNewsSource } from './newsIntel/sources';





import { getLiveIndexPrices, getLiveLtpBatch, getMarketStatus } from './liveMarket';
import {
    adminInstitutionalFlowImportSchema,
    adminActivateSchema,
    capitalSettingsSchema,
    chatSchema,
    deviceRegistrationSchema,
    loginSchema,
    newsImpactSchema,
    portfolioTradeSchema,
    portfolioTradeUpdateSchema,
    paymentVerificationSchema,
    registerSchema,
    riskCalculationSchema,
    signalLabsSchema,
    subscriptionOrderSchema,
    userPreferencesSchema,
    validateBody,
    watchlistCreateSchema,
} from './validation';
import { buildGroundedChatResponse } from './chat/service';
import { analyzeNewsImpact, buildTechnicalContextFromStock } from './newsImpactService';
import { getNewsFeed, getStoredNewsStatus, getTickerNewsDigest, syncNewsIntelligence } from './newsIntel/service';
import { buildMarketGroundingFromReport } from './newsIntel/marketGrounding';
import { backfillTrackedSignalsFromDb, buildEdgeDashboard, trackHistoricalSetup } from './edgeAnalyticsService';
import { registerDeviceToken } from './pushNotificationService';
import { generateKiteSession, getKiteLoginUrl, initializeKiteSession, isKiteAuthenticated } from './kiteAuth';
import { SYSTEM_AGENT_EMAIL, SYSTEM_AGENT_USER_ID } from './systemConstants';
import {
    getCachedScan,
    getLatestAvailableScan,
    getScanStatus,
    initializeScanCoordinator,
    ScanMode,
    startMarketScan,
} from './scanCoordinator';

// Initialize Kite Connect if token is cached
initializeKiteSession();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
assertAuthConfiguration();
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
const SAFE_USER_SELECT = {
    id: true,
    name: true,
    email: true,
    mobileNumber: true,
    createdAt: true,
    subscriptionStatus: true,
    subscriptionExpiry: true,
    telegramChatId: true,
    notifyBuySignals: true,
    notifyEmail: true,
    tradingCapital: true,
    maxRiskPct: true,
    maxPositions: true,
    maxSectorConc: true,
} as const;

function safeUserPayload<T extends { email: string }>(user: T) {
    return { ...user, isAdmin: isAdminEmail(user.email) };
}

function normalizeEmail(value?: string): string | undefined {
    return value?.trim().toLowerCase() || undefined;
}

function normalizeMobileNumber(value?: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.startsWith('+') ? `+${trimmed.slice(1).replace(/\D/g, '')}` : trimmed.replace(/\D/g, '');
}

function getPasswordCredential(body: Record<string, any>): string | undefined {
    return body?.password ?? body?.secret;
}

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
        await prisma.$queryRaw`SELECT 1`;
        // Check for InstitutionalFlowSnapshot table (using any property to verify existence)
        await prisma.institutionalFlowSnapshot.findFirst({ select: { id: true } });
        
        // Seed the Global Agent System User
        const systemUser = await prisma.user.upsert({
            where: { email: SYSTEM_AGENT_EMAIL },
            update: {},
            create: {
                id: SYSTEM_AGENT_USER_ID,
                email: SYSTEM_AGENT_EMAIL,
                name: 'ApexScan AI System',
                password: await bcrypt.hash(`disabled-${Date.now()}-${SYSTEM_AGENT_USER_ID}`, 12),
            }
        });
        if (systemUser.id !== SYSTEM_AGENT_USER_ID) {
            throw new Error('System agent user exists with an incompatible identifier.');
        }
        
        markDatabaseHealthy();
        console.log('[System] Database connection ready. Global Agent Seeded.');
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

const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
    throw new Error('CORS_ALLOWED_ORIGINS must be configured in production.');
}
const allowedOrigins = new Set(
    configuredOrigins.length > 0
        ? configuredOrigins
        : ['http://localhost:5173', 'http://127.0.0.1:5173']
);

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error('Origin is not allowed by CORS policy.'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Razorpay-Signature'],
    maxAge: 600,
}));

interface RawBodyRequest extends Request {
    rawBody?: Buffer;
}

app.use(express.json({
    limit: '100kb',
    verify(req, _res, buffer) {
        (req as RawBodyRequest).rawBody = Buffer.from(buffer);
    },
}));

// In production, serve the built React frontend
const FRONTEND_DIST = path.join(__dirname, '..', 'apex-intelligence', 'dist');

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(FRONTEND_DIST));
}

// Routes
app.get('/api/health', (_req, res) => res.status(200).json({
    status: 'OK',
    version: '2.0.0',
}));
app.get('/api/ready', async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        markDatabaseHealthy();
        res.status(200).json({ status: 'READY', database: 'ready' });
    } catch (error) {
        markDatabaseError(error);
        res.status(503).json({ status: 'NOT_READY', database: 'unavailable' });
    }
});
app.get('/', (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
        const indexPath = path.join(FRONTEND_DIST, 'index.html');
        // Prevent caching of index.html to ensure clients always get the latest hashed asset references
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(indexPath, (err) => {
            if (err) {
                console.error('[Static] Failed to serve index.html:', err.message);
                res.status(200).send('ApexScan AI Backend Operational (Initial Booting...)');
            }
        });
    } else {
        res.status(200).send('ApexScan AI Backend Operational (Development Mode)');
    }
});

// Global process handlers
process.on('uncaughtException', (err) => {
    console.error('[System] Uncaught Exception:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[System] Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

function normalizeScanMode(value: unknown): ScanMode {
    return value === 'intraday' ? 'intraday' : 'swing';
}

type SectorPulseTile = { n: string; v: number };

const SECTOR_PULSE_BASKETS: Record<string, string[]> = {
    IT: ['TCS', 'INFY', 'HCLTECH'],
    Bank: ['HDFCBANK', 'ICICIBANK', 'AXISBANK'],
    Pharma: ['SUNPHARMA', 'DRREDDY', 'CIPLA'],
    Auto: ['MARUTI', 'M&M', 'TATAMOTORS'],
    Metal: ['JSWSTEEL', 'TATASTEEL', 'HINDALCO'],
    FMCG: ['HINDUNILVR', 'ITC', 'NESTLEIND'],
    Energy: ['RELIANCE', 'ONGC', 'BPCL'],
    Realty: ['DLF', 'GODREJPROP', 'OBEROIRLTY'],
    Infra: ['LT', 'NBCC', 'KEC'],
};

const SECTOR_PULSE_TTL_MS = 5 * 60 * 1000;
let sectorPulseCache: { ts: number; data: { sectors: SectorPulseTile[]; fetchedAt: string; source: string } } | null = null;

function roundNumber(value: number, digits = 2): number {
    return Number(value.toFixed(digits));
}

function buildSectorFallbackFromScan(scan: ScanResult | null): SectorPulseTile[] {
    const breadth = scan?.sectorBreadth ? Object.values(scan.sectorBreadth) : [];
    return breadth
        .sort((a, b) => b.breadthScore - a.breadthScore)
        .slice(0, 9)
        .map(item => ({
            n: item.sector,
            v: roundNumber((item.breadthScore - 0.5) * 12, 2),
        }));
}

async function buildSectorPulse(): Promise<{ sectors: SectorPulseTile[]; fetchedAt: string; source: string }> {
    if (sectorPulseCache && Date.now() - sectorPulseCache.ts < SECTOR_PULSE_TTL_MS) {
        return sectorPulseCache.data;
    }

    const liveEntries = await Promise.all(Object.entries(SECTOR_PULSE_BASKETS).map(async ([sector, tickers]) => {
        const changes = (await Promise.all(tickers.map(async (ticker) => {
            const yahooTicker = NSE_UNIVERSE[ticker] || `${ticker}.NS`;
            let candles = await fetchHistoricalData(yahooTicker, 2, '5m');
            if (candles.length < 2) candles = await fetchHistoricalData(yahooTicker, 5, '1d');
            if (candles.length < 2) return null;
            const latest = candles[candles.length - 1];
            const previous = candles[candles.length - 2];
            if (!previous?.close) return null;
            return ((latest.close - previous.close) / previous.close) * 100;
        }))).filter((value): value is number => value != null && Number.isFinite(value));

        if (!changes.length) return null;
        const averageChange = changes.reduce((sum, value) => sum + value, 0) / changes.length;
        return { n: sector, v: roundNumber(averageChange, 2) };
    }));

    const sectors = liveEntries.filter((entry): entry is SectorPulseTile => Boolean(entry));
    const data = sectors.length
        ? { sectors, fetchedAt: new Date().toISOString(), source: 'live-sector-baskets' }
        : {
            sectors: buildSectorFallbackFromScan(getLatestAvailableScan()),
            fetchedAt: new Date().toISOString(),
            source: 'scan-sector-breadth',
        };

    sectorPulseCache = { ts: Date.now(), data };
    return data;
}

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

setTimeout(() => {
    syncNewsIntelligence(getCachedScan('swing')).catch((err: any) => {
        console.warn('[NewsIntel] Initial sync skipped:', err?.message || err);
    });
}, 2500);

// ——————————————————————————————————————————
// ROUTES
// ——————————————————————————————————————————

app.get('/api/broker/status', requireAuth, (_req: Request, res: Response) => {
    if (!broker) {
        res.json({ success: true, data: { provider: 'initializing', live: false, note: 'Broker system starting...' } });
        return;
    }
    res.json({
        success: true,
        data: {
            provider: broker.provider,
            live: broker.live,
            note: broker.live ? 'Live broker mode' : 'Paper trading mode',
        },
    });
});

// ═══════════════════════════════════════════
// AUTH — Register / Login / Me / Logout
// ═══════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', authLimiter, validateBody(registerSchema), async (req: Request, res: Response) => {
    const { name } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    const mobileNumber = normalizeMobileNumber(req.body?.mobileNumber);
    const password = getPasswordCredential(req.body ?? {});
    const mpin = req.body?.mpin;
    const primarySecret = password ?? mpin;

    if (!name || !email || !primarySecret) {
        res.status(400).json({ success: false, message: 'Name, email and password or MPIN are required.' });
        return;
    }
    if (password && password.length < 10) {
        res.status(400).json({ success: false, message: 'Password must be at least 10 characters.' });
        return;
    }
    if (mpin && !/^\d{6}$/.test(mpin)) {
        res.status(400).json({ success: false, message: 'MPIN must be exactly 6 digits.' });
        return;
    }
    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            res.status(409).json({ success: false, message: 'An account with this email already exists.' });
            return;
        }
        if (mobileNumber) {
            const existingMobile = await prisma.user.findUnique({ where: { mobileNumber } });
            if (existingMobile) {
                res.status(409).json({ success: false, message: 'An account with this mobile number already exists.' });
                return;
            }
        }

        const hashed = await bcrypt.hash(primarySecret, 12);
        const mpinHash = mpin ? await bcrypt.hash(mpin, 12) : null;
        // Grant a 7-day trial for all new registrations
        const trialExpiry = new Date();
        trialExpiry.setDate(trialExpiry.getDate() + 7);
        const user = await prisma.user.create({
            data: {
                name,
                email,
                mobileNumber,
                password: hashed,
                mpinHash,
                subscriptionStatus: 'TRIAL',
                subscriptionExpiry: trialExpiry,
            },
            select: SAFE_USER_SELECT,
        });
        const token = generateToken(user.id, user.email);
        res.json({ success: true, token, user: safeUserPayload(user), trialDaysLeft: 7 });
    } catch (err: any) {
        console.error('[Register] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// POST /api/auth/login
app.post('/api/auth/login', authLimiter, validateBody(loginSchema), async (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const mobileNumber = normalizeMobileNumber(req.body?.mobileNumber);
    const password = getPasswordCredential(req.body ?? {});
    const mpin = req.body?.mpin;
    const secret = password ?? mpin;
    if ((!email && !mobileNumber) || !secret) {
        res.status(400).json({ success: false, message: 'Email or mobile number and password/MPIN are required.' });
        return;
    }
    try {
        const user = mobileNumber
            ? await prisma.user.findUnique({ where: { mobileNumber } })
            : await prisma.user.findUnique({ where: { email } });
        if (!user) {
            res.status(401).json({ success: false, message: 'Invalid credentials.' });
            return;
        }
        const useMpinHash = Boolean(mobileNumber) || Boolean(mpin);
        const targetHash = useMpinHash ? ((user as any).mpinHash || (user as any).password) : (user as any).password;
        const match = await bcrypt.compare(secret, targetHash);
        if (!match) {
            res.status(401).json({ success: false, message: 'Invalid credentials.' });
            return;
        }
        const token = generateToken(user.id, user.email);
        const safeUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: SAFE_USER_SELECT });
        res.json({ success: true, token, user: safeUserPayload(safeUser) });
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
            select: SAFE_USER_SELECT,
        });
        if (!user) { res.status(404).json({ success: false, message: 'User not found.' }); return; }
        res.json({ success: true, user: safeUserPayload(user) });
    } catch (err: any) {
        console.error('[Auth-Me] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

app.get('/api/user/preferences', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                name: true,
                email: true,
                mobileNumber: true,
                telegramChatId: true,
                notifyBuySignals: true,
                notifyEmail: true,
                subscriptionStatus: true,
                subscriptionExpiry: true,
                createdAt: true,
            },
        });
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found.' });
            return;
        }
        res.json({ success: true, data: user });
    } catch (err: any) {
        console.error('[UserPreferences-GET] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

app.post('/api/user/preferences', requireAuth, validateBody(userPreferencesSchema), async (req: AuthRequest, res: Response) => {
    try {
        const updated = await prisma.user.update({
            where: { id: req.userId },
            data: {
                name: req.body?.name,
                telegramChatId: req.body?.telegramChatId ?? req.body?.whatsappNumber,
                notifyBuySignals: req.body?.notifyBuySignals,
                notifyEmail: req.body?.notifyEmail,
            },
            select: {
                name: true,
                email: true,
                mobileNumber: true,
                telegramChatId: true,
                notifyBuySignals: true,
                notifyEmail: true,
                subscriptionStatus: true,
                subscriptionExpiry: true,
                createdAt: true,
            },
        });
        res.json({ success: true, data: updated });
    } catch (err: any) {
        console.error('[UserPreferences-POST] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

app.post('/api/notifications/register-device', requireAuth, validateBody(deviceRegistrationSchema), async (req: AuthRequest, res: Response) => {
    try {
        await registerDeviceToken(req.userId!, req.body.pushToken, req.body.platform);
        res.json({ success: true });
    } catch (err: any) {
        console.error('[RegisterDevice] Error:', err);
        res.status(400).json({ success: false, message: sanitizeError(err) });
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
app.post('/api/watchlist', requireAuth, validateBody(watchlistCreateSchema), async (req: AuthRequest, res: Response) => {
    const { ticker, sector, signal, ltp, target, stopLoss, targetPct, slPct, riskReward, confidenceScore, setupType, buyZone, snapshot } = req.body || {};
    if (!ticker) { res.status(400).json({ success: false, message: 'ticker is required.' }); return; }
    try {
        const item = await prisma.watchlistItem.upsert({
            where: { userId_ticker: { userId: req.userId!, ticker } },
            update: { sector, signal, ltp, target, stopLoss, targetPct, slPct, riskReward, confidenceScore, setupType, buyZone, snapshot, addedAt: new Date() },
            create: { userId: req.userId!, ticker, sector, signal, ltp, target, stopLoss, targetPct, slPct, riskReward, confidenceScore, setupType, buyZone, snapshot },
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
// ── Kite Connect Authentication Routes ──────────────────────────────

app.get('/api/kite/status', requireAuth, requireAdmin, (_req: Request, res: Response) => {
    res.json({ success: true, authenticated: isKiteAuthenticated() });
});

app.get('/api/kite/login', requireAuth, requireAdmin, (req: AuthRequest, res: Response) => {
    const state = generateKiteOauthState(req.userId!, req.userEmail!);
    const separator = getKiteLoginUrl().includes('?') ? '&' : '?';
    res.json({ success: true, url: `${getKiteLoginUrl()}${separator}state=${encodeURIComponent(state)}` });
});

app.get('/api/kite/callback', async (req: Request, res: Response) => {
    const requestToken = req.query.request_token as string;
    const state = req.query.state as string;
    if (!requestToken || !state) {
        return res.status(400).send('Missing OAuth callback parameters.');
    }
    try {
        const identity = verifyKiteOauthState(state);
        if (!isAdminEmail(identity.email)) return res.status(403).send('Administrator access required.');
    } catch {
        return res.status(401).send('Invalid or expired OAuth state.');
    }
    const success = await generateKiteSession(requestToken);
    if (success) {
        res.send('<h1>Kite Connect Authenticated!</h1><p>You can close this window and return to the dashboard.</p><script>setTimeout(()=>window.close(), 2000)</script>');
    } else {
        res.status(500).send('<h1>Authentication Failed</h1><p>Check server logs.</p>');
    }
});

// ── End Kite Routes ───────────────────────────────────────────────

async function queueManualScan(req: AuthRequest, res: Response): Promise<void> {
    try {
        const mode = normalizeScanMode(req.query.mode);
        const result = await startMarketScan({ mode, trigger: 'manual', requestedBy: req.userId });
        res.status(result.started ? 202 : 200).json({
            success: true,
            isScanning: true,
            message: result.started ? 'Market scan queued.' : 'A market scan is already active.',
            scan: result.job,
            data: getCachedScan(mode),
        });
    } catch (error: any) {
        console.error('[API] Unable to queue scan:', error?.message || error);
        res.status(500).json({ success: false, message: sanitizeError(error) });
    }
}

// Preferred mutation endpoint. The legacy GET route remains for older clients.
app.post('/api/scans', scanLimiter, requireAuth, requireSubscription, queueManualScan);
app.get('/api/scan', scanLimiter, requireAuth, requireSubscription, async (req: AuthRequest, res: Response) => {
    const mode = normalizeScanMode(req.query.mode);
    if (req.query.force !== 'true') {
        const status = await getScanStatus(mode);
        res.json({
            success: true,
            isScanning: Boolean(status.active),
            scan: status.active ?? status.latest,
            data: getCachedScan(mode),
        });
        return;
    }
    await queueManualScan(req, res);
});

app.get('/api/scan/status', requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
        const mode = normalizeScanMode(req.query.mode);
        res.json({ success: true, data: await getScanStatus(mode) });
    } catch (error: any) {
        res.status(500).json({ success: false, message: sanitizeError(error) });
    }
});

// GET /api/performance — Fetch AI Track Record
app.get('/api/performance', requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
        const history = await prisma.historicalSetup.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        const edge = await buildEdgeDashboard();
        const stats = {
            total: history.length,
            won: history.filter((h: any) => h.status === 'WON').length,
            lost: history.filter((h: any) => h.status === 'LOST').length,
            inProgress: history.filter((h: any) => h.status === 'IN_PROGRESS').length,
            avgWin: 0, avgLoss: 0, winRate: 0,
            expectancy: edge.totals.expectancy,
            profitFactor: edge.totals.profitFactor,
            maxDrawdown: edge.totals.maxDrawdown,
            falseAlertRate: edge.totals.falseAlertRate,
        };
        const resolvedCount = stats.won + stats.lost;
        if (resolvedCount > 0) stats.winRate = (stats.won / resolvedCount) * 100;
        const wonTrades = history.filter((h: any) => h.status === 'WON' && h.resultPct);
        if (wonTrades.length) stats.avgWin = wonTrades.reduce((sum: number, t: any) => sum + (t.resultPct || 0), 0) / wonTrades.length;
        const lostTrades = history.filter((h: any) => h.status === 'LOST' && h.resultPct);
        if (lostTrades.length) stats.avgLoss = lostTrades.reduce((sum: number, t: any) => sum + (t.resultPct || 0), 0) / lostTrades.length;
        res.json({ success: true, data: { stats, history, analytics: edge } });
    } catch (err: any) {
        console.error('[Performance] Error:', err);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

app.get('/api/founder/edge-dashboard', requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
        const edge = await buildEdgeDashboard();
        res.json({ success: true, data: edge });
    } catch (err: any) {
        console.error('[FounderDashboard] Error:', err.message);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// GET /api/chart/:ticker — Historical OHLCV + indicators
const chartCache: Record<string, { ts: number; data: any }> = {};
app.get('/api/chart/:ticker', requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const yahooBSE = `${ticker}.NS`;
        const interval = (['1d', '15m', '5m'].includes(String(req.query.interval)) ? String(req.query.interval) : '1d') as MarketDataInterval;
        const daysLimit = interval === '1d' ? 365 : interval === '15m' ? 20 : 10;
        const days = Math.min(Number(req.query.days) || (interval === '1d' ? 180 : 5), daysLimit);
        const cacheKey = `${ticker}:${interval}:${days}`;
        const cached = chartCache[cacheKey];
        if (cached && Date.now() - cached.ts < 300_000) return res.json({ success: true, data: cached.data });

        const candles = await fetchHistoricalData(yahooBSE, days, interval);
        if (!candles.length) return res.status(404).json({ success: false, message: 'No data found' });

        const computeSMA = (arr: number[], period: number) => {
            const result: (number | null)[] = [];
            for (let i = 0; i < arr.length; i++) {
                if (i < period - 1) { result.push(null); continue; }
                const sum = arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
                result.push(Number((sum / period).toFixed(2)));
            }
            return result;
        };
        const computeRSI = (closes: number[], period = 14) => {
            const rsi: (number | null)[] = [];
            let gainSum = 0, lossSum = 0;
            for (let i = 0; i < closes.length; i++) {
                if (i === 0) { rsi.push(null); continue; }
                const diff = closes[i] - closes[i - 1];
                const gain = diff > 0 ? diff : 0;
                const loss = diff < 0 ? -diff : 0;
                if (i < period) { gainSum += gain; lossSum += loss; rsi.push(null); continue; }
                if (i === period) {
                    gainSum += gain; lossSum += loss;
                    const avgGain = gainSum / period; const avgLoss = lossSum / period;
                    rsi.push(avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)));
                    gainSum = avgGain; lossSum = avgLoss;
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
    } catch (error: any) {
        res.status(500).json({ success: false, message: sanitizeError(error) });
    }
});

app.get('/api/quotes', requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
        const tickersRaw = typeof req.query.tickers === 'string' ? req.query.tickers : '';
        const tickers = tickersRaw
            .split(',')
            .map(ticker => ticker.trim().toUpperCase())
            .filter(Boolean)
            .slice(0, 100);

        if (!tickers.length) {
            return res.status(400).json({ success: false, message: 'Provide tickers as a comma-separated query string.' });
        }

        const quotes = await getLiveQuoteSnapshots(tickers, tradingApi);
        const quoteMap = Object.fromEntries(quotes.map(quote => [quote.ticker, quote]));
        res.json({ success: true, data: quoteMap });
    } catch (error: any) {
        res.status(500).json({ success: false, message: sanitizeError(error) });
    }
});

// ── MARKET PULSE ───────────────────────────────────
let pulseCache: { data: any; ts: number } | null = null;
const PULSE_TTL = 5 * 60 * 1000;
app.get('/api/market-pulse', requireAuth, requireSubscription, async (_req: Request, res: Response) => {
    if (pulseCache && Date.now() - pulseCache.ts < PULSE_TTL) return res.json({ success: true, data: pulseCache.data });
    try {
        const symbols = [
            { key: 'nifty', symbol: '^NSEI' },
            { key: 'banknifty', symbol: '^NSEBANK' },
            { key: 'sensex', symbol: '^BSESN' },
            { key: 'midcap', symbol: '^NSMIDCP' },
            { key: 'gold', symbol: 'GOLDBEES.NS' },
            { key: 'silver', symbol: 'SILVERBEES.NS' },
            { key: 'vix', symbol: '^INDIAVIX' }
        ];
        const results = await Promise.allSettled(symbols.map(s => fetchHistoricalData(s.symbol, 260)));
        const state: Record<string, any> = {};
        symbols.forEach((s, i) => {
            const res = results[i];
            if (res.status === 'fulfilled' && res.value.length >= 2) {
                const c = res.value;
                const price = +c[c.length - 1].close.toFixed(2);
                const prev = c[c.length - 2].close;
                const change = +(((price - prev) / prev) * 100).toFixed(2);
                state[s.key] = { price, change };
            } else state[s.key] = null;
        });
        const vixPrice = state.vix?.price;
        let vixLabel = { text: 'Unavailable', color: '#9ca3af', detail: 'Volatility data is unavailable.' };
        if (typeof vixPrice === 'number' && vixPrice > 20) vixLabel = { text: 'High Risk', color: '#f87171', detail: 'High volatility detected.' };
        else if (typeof vixPrice === 'number' && vixPrice > 16) vixLabel = { text: 'Moderate Risk', color: '#fbbf24', detail: 'Watch for swings.' };
        else if (typeof vixPrice === 'number' && vixPrice > 0) vixLabel = { text: 'Low Risk', color: '#34d399', detail: 'Market volatility is low.' };
        
        const data = { indices: state, vixLabel, isMarketOpen: getMarketStatus().isOpen, fetchedAt: new Date().toISOString() };
        pulseCache = { data, ts: Date.now() };
        res.json({ success: true, data });
    } catch (err: any) {
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
            const start = `<${tag}>`; const end = `</${tag}>`;
            const s = itemContent.indexOf(start); const e = itemContent.indexOf(end);
            if (s !== -1 && e !== -1) return itemContent.substring(s + start.length, e).replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
            return '';
        };
        const title = extract('title'); const link = extract('link'); const pubDate = extract('pubDate');
        if (title && link) items.push({ title, link, pubDate });
    }
    return items;
}

app.get('/api/market-outlook', requireAuth, requireSubscription, async (_req: Request, res: Response) => {
    if (Date.now() - outlookTime < 15 * 60 * 1000 && cachedOutlook) return res.json({ success: true, summary: cachedOutlook, news: cachedNews });
    try {
        const [indiaRes, globalRes] = await Promise.all([
            axios.get('https://www.livemint.com/rss/markets', { timeout: 10000 }),
            axios.get('https://www.livemint.com/rss/companies', { timeout: 10000 })
        ]);
        const combinedNews = [...parseFastXML(indiaRes.data), ...parseFastXML(globalRes.data)].sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
        if (!combinedNews.length) return res.json({ success: false, message: 'No headlines' });
        cachedNews = combinedNews.slice(0, 15);
        const headlines = cachedNews.map(t => `- ${t.title}`).join('\n');
        cachedOutlook = await claudeAsk('Expert Indian analyst persona. Summarize outlook concisely.', `Headlines:\n${headlines}`, { maxTokens: 200, temperature: 0.4 });
        outlookTime = Date.now();
        res.json({ success: true, summary: cachedOutlook, news: cachedNews });
    } catch (e: any) {
        res.status(500).json({ success: false, message: sanitizeError(e) });
    }
});

app.post('/api/news/impact', chatLimiter, requireAuth, requireSubscription, validateBody(newsImpactSchema), async (req: AuthRequest, res: Response) => {
    try {
        const {
            headline,
            articleText,
            targetTicker,
            targetSector,
            currentMarketContext,
            technicalContext,
        } = req.body || {};

        let resolvedTechnicalContext = technicalContext ?? null;
        let resolvedSector = targetSector;

        if (!resolvedTechnicalContext && targetTicker) {
            const report = await fetchStockReport(targetTicker.toUpperCase());
            const swingScan = getCachedScan('swing');
            const setup = swingScan?.setups?.find(item => item.ticker === targetTicker.toUpperCase()) ?? null;
            if (report) {
                resolvedTechnicalContext =
                    await buildMarketGroundingFromReport(
                        report,
                        setup,
                        swingScan?.marketStatus,
                        swingScan?.sectorBreadth?.[report.sector],
                    ) ?? buildTechnicalContextFromStock(report, setup);
                resolvedSector = resolvedSector || report.sector;
            }
        }

        const analysis = await analyzeNewsImpact({
            headline,
            articleText,
            targetTicker: targetTicker?.toUpperCase(),
            targetSector: resolvedSector,
            currentMarketContext,
            technicalContext: resolvedTechnicalContext,
        });

        res.json({ success: true, data: analysis });
    } catch (err: any) {
        console.error('[NewsImpact] Error:', err.message);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

app.get('/api/news/feed', requireAuth, requireSubscription, async (req: AuthRequest, res: Response) => {
    try {
        const ticker = typeof req.query.ticker === 'string' ? req.query.ticker.toUpperCase() : undefined;
        const sector = typeof req.query.sector === 'string' ? req.query.sector : undefined;
        const regulator = typeof req.query.regulator === 'string' ? req.query.regulator : undefined;
        const refresh = req.query.refresh === 'true';
        const limit = Number(req.query.limit) || 25;
        const items = await getNewsFeed({ ticker, sector, regulator, refresh, limit }, getCachedScan('swing'));
        const status = await getStoredNewsStatus();
        res.json({ success: true, data: { items, status } });
    } catch (err: any) {
        console.error('[NewsFeed] Error:', err.message);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

app.get('/api/news/digest/:ticker', requireAuth, requireSubscription, async (req: AuthRequest, res: Response) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const refresh = req.query.refresh !== 'false';
        const digest = await getTickerNewsDigest(ticker, getCachedScan('swing'), refresh);
        res.json({ success: true, data: digest });
    } catch (err: any) {
        console.error('[NewsDigest] Error:', err.message);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

app.post('/api/news/sync', chatLimiter, requireAuth, requireSubscription, async (_req: AuthRequest, res: Response) => {
    try {
        const result = await syncNewsIntelligence(getCachedScan('swing'));
        res.json({ success: true, data: result });
    } catch (err: any) {
        console.error('[NewsSync] Error:', err.message);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

app.post('/api/chat', chatLimiter, requireAuth, requireSubscription, validateBody(chatSchema), async (req: AuthRequest, res: Response) => {
    try {
        const { message } = req.body || {};
        const response = await buildGroundedChatResponse({
            message,
            userId: req.userId!,
            lastSwingScan: getCachedScan('swing'),
        });
        res.json({ success: true, ...response });
    } catch (err: any) {
        console.error('[Chat] Grounded chat error:', err.message);
        if (res.headersSent) return;
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// POST /api/chat — Intelligence 5.0 Core
app.post('/api/chat-legacy', chatLimiter, requireAuth, requireSubscription, validateBody(chatSchema), async (req: AuthRequest, res: Response) => {
    const { message } = req.body || {};
    const upperMsg = message.toUpperCase();
    let detectedTicker = '';
    const words = upperMsg.split(/[^A-Z0-9&-]+/);
    for (const word of words) {
        if (word.length >= 3 && NSE_UNIVERSE[word]) { detectedTicker = word; break; }
    }
    if (!detectedTicker) {
        if (upperMsg.includes('TATA MOTORS')) detectedTicker = 'TATAMOTORS';
        else if (upperMsg.includes('HDFC BANK')) detectedTicker = 'HDFCBANK';
    }

    let technicalContext = '';
    let stockCardData: any = null;
    if (detectedTicker) {
        try {
            const [candleRes, fundRes] = await Promise.allSettled([fetchHistoricalData(detectedTicker + '.NS', 220), fetchStockReport(detectedTicker)]);
            const candles = candleRes.status === 'fulfilled' ? candleRes.value : [];
            const fund = fundRes.status === 'fulfilled' ? fundRes.value : null;
            if (candles.length > 20) {
                const closes = candles.map(c => c.close);
                const ltp = closes[closes.length - 1];
                const dma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, closes.length);
                const ema20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;

                // Accurate RSI(14) with Wilder's Smoothing
                let avgGain = 0, avgLoss = 0;
                for (let i = 1; i <= 14; i++) {
                    const diff = closes[closes.length - 15 + i] - closes[closes.length - 16 + i];
                    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
                }
                avgGain /= 14; avgLoss /= 14;

                // Smoothing step (if more data exists)
                const smoothingPeriods = Math.min(closes.length - 15, 5); // 5 extra sessions for smoothing
                for (let i = 1; i <= smoothingPeriods; i++) {
                    const diff = closes[closes.length - smoothingPeriods + i] - closes[closes.length - smoothingPeriods + i - 1];
                    const gain = diff > 0 ? diff : 0;
                    const loss = diff < 0 ? Math.abs(diff) : 0;
                    avgGain = (avgGain * 13 + gain) / 14;
                    avgLoss = (avgLoss * 13 + loss) / 14;
                }
                const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / (avgLoss || 1))));

                const rawCandles = candles.slice(-10).map(c => 
                    `[${c.date.split('T')[0]}] O:${c.open.toFixed(1)} H:${c.high.toFixed(1)} L:${c.low.toFixed(1)} C:${c.close.toFixed(1)} Vol:${(c.volume/1000).toFixed(0)}k`
                ).join('\n');

                technicalContext = `
[QUANT DATA] Live Technicals for ${detectedTicker} (NSE):
- CMP: ₹${ltp.toFixed(2)} | RSI(14): ${rsi.toFixed(1)}
- 200 DMA: ₹${dma200.toFixed(2)} (Current price is ${ltp > dma200 ? 'ABOVE' : 'BELOW'})
- 20 EMA: ₹${ema20.toFixed(2)} (Short-term trend: ${ltp > ema20 ? 'Bullish' : 'Bearish'})
- Sector: ${fund?.sector || SECTOR_MAP[detectedTicker] || 'N/A'}

[RAW PRICE ACTION - LAST 10 SESSIONS]
${rawCandles}
`;
                const conf = (ltp > dma200 && rsi < 65) ? 8 : (ltp > dma200) ? 6 : 4;
                stockCardData = {
                    ticker: detectedTicker,
                    price: +ltp.toFixed(2),
                    signal: conf >= 7 ? 'BUY' : 'WATCH',
                    buyZone: +ltp.toFixed(2),
                    target: +(ltp * 1.08).toFixed(2),
                    stopLoss: +(ltp * 0.96).toFixed(2),
                    confidenceScore: conf,
                    sector: fund?.sector || SECTOR_MAP[detectedTicker] || 'NSE Stock',
                    setupType: ltp > dma200 ? 'Trend Continuation' : 'Mean Reversion',
                };
            }
        } catch { /* proceed */ }
    }

    const now = new Date();
    const isMarketHours = now.getHours() >= 9 && now.getHours() < 16;
    const swingScan = getCachedScan('swing');
    const topSetups = swingScan?.setups?.slice(0, 3).map(s => s.ticker).join(', ') || 'Scanning...';

    const systemPrompt = `You are ApexScan Intelligence - an autonomous Multi-Agent Quant Trading system.
You are running as a Node.js background worker tracking the Indian NSE stock market.
- Global Regime: ${swingScan?.marketStatus?.regime || 'NEUTRAL'}
- Active Scanner alerts: ${topSetups}
${technicalContext}

[RULES]
1. Speak as a professional CONSENSUS BOARD consisting of three specialized personas:
   - QUANT ANALYST: Analyze technical indicators and raw price action.
   - MACRO STRATEGIST: Global regime and sentiment synthesis.
   - RISK MANAGER: Final verdict, targets, and stop-loss levels.
2. Use the "RAW PRICE ACTION" data to justify your tactical stance.
3. Provide a clear "Final Verdict" for swing traders.
4. Keep under 300 words. No "I am an AI" disclaimers.`;

    try {
        let reply = '';
        try {
            console.log('[AI] Attempting Gemini Core...');
            reply = await geminiAsk(systemPrompt, message, { maxTokens: 450, temperature: 0.5 });
        } catch (geminiErr: any) {
            console.warn('[AI] Gemini failed, falling back to Claude:', geminiErr.message);
            try {
                reply = await claudeAsk(systemPrompt, message, { maxTokens: 450, temperature: 0.5 });
            } catch (claudeErr: any) {
                console.warn('[AI] Claude failed, falling back to Groq:', claudeErr.message);
                reply = await groqAsk(systemPrompt, message, { maxTokens: 450, temperature: 0.5 });
            }
        }
        res.json({ success: true, reply, stockCard: stockCardData });
    } catch (finalErr: any) {
        console.error('[AI] All AI providers failed:', finalErr.message);
        res.status(500).json({ success: false, message: 'Intelligence Core offline or misconfigured.' });
    }
});

app.get('/api/last', requireAuth, requireSubscription, (req: Request, res: Response) => {
    const mode = normalizeScanMode(req.query.mode);
    const scan = getCachedScan(mode);
    res.json({ success: !!scan, data: scan });
});

// Notifications consume the last durable auto-scan; they do not start a
// second expensive scanner pipeline.
cron.schedule('40 9 * * 1-5', async () => {
    const scan = getCachedScan('swing');
    if (!scan) return;
    await notifyUsersWithMorningDigest(
        scan.setups.filter(setup => setup.confidenceScore >= 7),
        scan.marketStatus.regime || 'NEUTRAL',
    ).catch(() => undefined);
}, { timezone: 'Asia/Kolkata' });

cron.schedule('50 15 * * 1-5', async () => {
    const scan = getCachedScan('swing');
    if (scan) {
        await notifyUsersWithPostMarketSummary(scan.setups, scan.marketStatus.regime || 'NEUTRAL').catch(() => undefined);
    }
}, { timezone: 'Asia/Kolkata' });

// NSE publishes institutional cash-flow and bulk-deal reports after the close.
// Store one official snapshot per trading day so Signal Labs can build history.
cron.schedule('10 16 * * 1-5', async () => {
    const [flowResult, dealResult] = await Promise.allSettled([
        syncInstitutionalFlowFromOfficialReport(),
        syncNseDailyBulkDeals(),
    ]);
    if (flowResult.status === 'rejected') {
        console.warn('[SignalLabs] FII/DII EOD sync failed:', flowResult.reason?.message || flowResult.reason);
    }
    if (dealResult.status === 'rejected' || !dealResult.value.success) {
        const reason = dealResult.status === 'rejected' ? dealResult.reason : dealResult.value.message;
        console.warn('[SignalLabs] Bulk-deal EOD sync failed:', reason);
    }
}, { timezone: 'Asia/Kolkata' });

cron.schedule('*/30 8-18 * * 1-5', async () => {
    try {
        await syncNewsIntelligence(getCachedScan('swing'));
    } catch { }
}, { timezone: 'Asia/Kolkata' });

// AGENTIC AI
app.get('/api/agent/status', requireAuth, requireSubscription, (_req, res) => res.json({ success: true, data: getAgentStatus() }));
app.get('/api/agent/events', requireAuth, requireSubscription, (_req, res) => res.json({ success: true, data: getEvents(50) }));
app.get('/api/agent/stream', requireAuth, requireSubscription, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    addSSEClient(res);
    req.on('close', () => removeSSEClient(res));
});

app.get('/api/fii-dii', requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
        const refresh = req.query.refresh === 'true';
        let summary = refresh
            ? await syncInstitutionalFlowFromOfficialReport()
            : await getInstitutionalFlowSummary();

        if (!summary.series.length) {
            summary = await seedInstitutionalFlowIfEmpty();
        }

        res.json({ success: true, data: summary });
    } catch (error: any) {
        try {
            const fallback = await getInstitutionalFlowSummary();
            res.json({ success: true, data: fallback });
        } catch (fallbackError: any) {
            res.status(500).json({ success: false, message: sanitizeError(fallbackError || error) });
        }
    }
});

// Institutional Bulk/Block Deals Feed
app.get('/api/institutional/deals', requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
        const entityType = req.query.entityType ? String(req.query.entityType) : undefined;
        const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : undefined;
        const dealType = req.query.dealType ? String(req.query.dealType).toUpperCase() : undefined;
        const daysParam = req.query.days ? parseInt(String(req.query.days), 10) : undefined;

        const where: any = {};
        if (entityType && entityType !== 'ALL') where.entityType = entityType;
        if (symbol) where.symbol = { contains: symbol };
        if (dealType && dealType !== 'ALL') where.dealType = dealType;
        if (daysParam && Number.isFinite(daysParam) && daysParam > 0) {
            const cutoff = new Date();
            cutoff.setUTCDate(cutoff.getUTCDate() - daysParam);
            where.tradeDate = { gte: cutoff };
        }

        const deals = await prisma.institutionalDeal.findMany({
            where,
            orderBy: { tradeDate: 'desc' },
            take: 500,
        });

        const latest = deals[0] || null;
        res.json({
            success: true,
            count: deals.length,
            data: deals,
            meta: {
                source: 'NSE Daily Bulk Deals Archive',
                lastTradeDate: latest?.tradeDate ?? null,
                lastSyncedAt: latest?.createdAt ?? null,
                daysFilter: daysParam ?? null,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// Institutional Confluence Radar (Super Signals)
app.get('/api/institutional/confluence', requireAuth, requireSubscription, async (_req: Request, res: Response) => {
    try {
        const confluences = await prisma.institutionalConfluence.findMany({
            orderBy: [{ isSuperSignal: 'desc' }, { confluenceScore: 'desc' }],
            take: 50,
        });
        res.json({
            success: true,
            count: confluences.length,
            data: confluences,
            meta: {
                basis: 'Classified stock-level NSE bulk deals; candidates require a separate current scanner match.',
                lastTradeDate: confluences[0]?.tradeDate ?? null,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// Manual Sync trigger for Daily Bulk Deals
app.post('/api/institutional/sync', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
        const result = await syncNseDailyBulkDeals();
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// Historical Bulk Deals Backfill — admin only, runs in background, returns 202 immediately
app.post('/api/institutional/backfill', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const daysBack = req.body?.days ? Math.min(parseInt(String(req.body.days), 10), 730) : 730;
        if (!Number.isFinite(daysBack) || daysBack < 1) {
            res.status(400).json({ success: false, message: 'days must be a number between 1 and 730' });
            return;
        }

        res.status(202).json({
            success: true,
            message: `Backfill started for ${daysBack} calendar days. Progress is logged server-side.`,
            daysBack,
        });

        // Fire-and-forget — intentional, do not await
        backfillNseBulkDeals(daysBack).then((result) => {
            console.log('[BackfillAPI]', result.message);
        }).catch((err) => {
            console.error('[BackfillAPI] Backfill failed:', err?.message ?? err);
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// 360° Stock Intelligence Deep-Dive Endpoint
app.get('/api/stock/:ticker/deep-dive', requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const data = await getStockDeepDive(ticker);
        res.json({ success: true, data });
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// Strictly Grounded Real News Endpoint (EXTRACT-ONLY, ZERO MOCK/HALLUCINATED FALLBACKS)
app.get('/api/stock/:ticker/news', requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const rawSources = await fetchTickerNewsSource(ticker).catch(() => []);
        
        if (!rawSources || rawSources.length === 0) {
            res.json({ success: true, ticker, count: 0, news: [] });
            return;
        }

        const newsItems = rawSources.map((item, idx) => {
            const pubDate = item.publishedAt ? new Date(item.publishedAt) : null;
            let timeAgo = 'Recently';
            if (pubDate && !isNaN(pubDate.getTime())) {
                const diffHours = Math.floor((Date.now() - pubDate.getTime()) / (1000 * 60 * 60));
                timeAgo = diffHours < 1 ? 'Just now' : diffHours < 24 ? `${diffHours} hours ago` : `${Math.floor(diffHours / 24)} days ago`;
            }

            // Keyword sentiment check on real headline text
            const text = `${item.title} ${item.summary || ''}`.toLowerCase();
            let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
            if (/\b(profit|revenue|growth|order|beat|up|surge|gain|bull|expansion|contract)\b/i.test(text)) sentiment = 'BULLISH';
            else if (/\b(loss|drop|fall|probe|sebi|penalty|down|bear|miss|decline|warning)\b/i.test(text)) sentiment = 'BEARISH';

            let impact: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
            if (/\b(results|order win|sebi|rbi|acquisition|merger|fda|probe)\b/i.test(text)) impact = 'HIGH';

            return {
                id: `real-news-${idx}-${Date.now()}`,
                title: item.title,
                source: item.source || 'Source unavailable',
                timeAgo,
                publishedAt: item.publishedAt || null,
                sentiment,
                impact,
                summary: item.summary || item.body || item.title,
                url: item.url,
            };
        });

        res.json({
            success: true,
            ticker,
            count: newsItems.length,
            news: newsItems,
        });
    } catch (err: any) {
        console.error(`[News API Error for ${req.params.ticker}]:`, err?.message);
        res.json({ success: true, ticker: req.params.ticker.toUpperCase(), count: 0, news: [] });
    }
});


// Position Size & Risk Governor Calculation API
app.post('/api/risk/calculate', requireAuth, requireSubscription, validateBody(riskCalculationSchema), (req: Request, res: Response) => {
    try {
        const { portfolioCapital, maxRiskPct, entryPrice, stopLoss, regime } = req.body || {};
        const result = calculateRiskAndPosition({
            portfolioCapital,
            maxRiskPct,
            entryPrice,
            stopLoss,
            regime,
        });
        res.json({ success: true, data: result });
    } catch (err: any) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// Grounded Multi-LLM Chat Engine API for Signal Labs Desk
app.post('/api/chat/signal-labs', chatLimiter, requireAuth, requireSubscription, validateBody(signalLabsSchema), async (req: Request, res: Response) => {
    try {
        const { prompt, model } = req.body || {};
        if (!prompt) {
            res.status(400).json({ success: false, message: 'Prompt is required.' });
            return;
        }
        const result = await querySignalLabsAi(String(prompt), String(model || 'gemini'));
        res.json({ success: true, data: result });
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// Live Intraday Delivery & Volume Footprint Scanner API (9:15 AM - 3:30 PM)
app.get('/api/scan/intraday-delivery', scanLimiter, requireAuth, requireSubscription, async (_req: Request, res: Response) => {
    try {
        const results = await scanIntradayDeliverySpikes();
        res.json({ success: true, count: results.length, data: results });
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

// Subscription Payment Routes
app.get('/api/subscription/plans', (_req: Request, res: Response) => {
    res.json({ success: true, data: SUBSCRIPTION_PLANS });
});

app.post('/api/subscription/create-order', paymentLimiter, requireAuth, validateBody(subscriptionOrderSchema), async (req: AuthRequest, res: Response) => {
    try {
        const order = await createRazorpayOrder(req.userId!, req.body.planId);
        res.json({ success: true, ...order });
    } catch (err: any) {
        console.error('[Payments] Order creation failed:', err?.message || err);
        res.status(503).json({ success: false, message: 'Payment order service is unavailable.' });
    }
});

app.post('/api/subscription/verify-payment', paymentLimiter, requireAuth, validateBody(paymentVerificationSchema), async (req: AuthRequest, res: Response) => {
    try {
        const result = await verifyAndActivateSubscription(req.userId!, req.body);
        res.json(result);
    } catch (err: any) {
        console.warn('[Payments] Verification rejected:', err?.message || err);
        res.status(400).json({ success: false, message: 'Payment verification failed.' });
    }
});

app.post('/api/subscription/webhook', paymentLimiter, async (req: RawBodyRequest, res: Response) => {
    try {
        const signature = req.header('x-razorpay-signature') ?? '';
        if (!req.rawBody || !signature) {
            res.status(400).json({ success: false, message: 'Webhook signature is required.' });
            return;
        }
        const result = await processRazorpayWebhook(req.rawBody, signature);
        res.json({ success: true, ...result });
    } catch (err: any) {
        console.warn('[Payments] Webhook rejected:', err?.message || err);
        res.status(400).json({ success: false, message: 'Webhook verification failed.' });
    }
});






app.get('/api/economic-calendar', requireAuth, (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: [],
        source: 'unavailable',
        note: 'No authoritative economic calendar provider is configured.',
    });
});

// SECTORS
app.get('/api/sectors', requireAuth, requireSubscription, async (_req, res) => {
    try {
        const data = await buildSectorPulse();
        res.json({ success: true, data });
    } catch (error: any) {
        const scan = getLatestAvailableScan();
        res.json({
            success: true,
            data: {
                sectors: buildSectorFallbackFromScan(scan),
                fetchedAt: scan?.timestamp || new Date().toISOString(),
                source: 'scan-sector-breadth',
                note: sanitizeError(error),
            },
        });
    }
});

// PORTFOLIO
app.get('/api/portfolio', requireAuth, async (req: AuthRequest, res: Response) => {
    const trades = await prisma.trade.findMany({ where: { userId: req.userId } });
    res.json({ success: true, data: trades });
});

// GLOBAL MASTER AI PORTFOLIO (Autonomous Track Record)
app.get('/api/portfolio/global-track-record', requireAuth, requireSubscription, async (_req: Request, res: Response) => {
    try {
        const trades = await prisma.trade.findMany({ 
            where: { userId: SYSTEM_AGENT_USER_ID },
            orderBy: { entryDate: 'desc' }
        });

        const mktStatus = getMarketStatus();
        const openTrades = trades.filter((t: any) => t.status === 'OPEN');
        const openTickers = openTrades.map((t: any) => t.ticker);

        // Live Price Refresh
        let liveLtps: Record<string, number> = {};

        if (mktStatus.isOpen && openTickers.length > 0) {
            // MARKET OPEN: Use Dhan HQ for real-time LTPs
            liveLtps = await getLiveLtpBatch(openTickers).catch(() => ({}));
        }

        // Fallback to Yahoo Finance for any tickers not covered or outside hours
        await Promise.allSettled(openTrades.map(async (t: any) => {
            try {
                let ltp = liveLtps[t.ticker] || 0;
                if (!ltp) {
                    // Yahoo Finance daily candle fallback
                    ltp = await fetchLtp(t.ticker + '.NS').catch(() => 0);
                }
                if (ltp && !isNaN(ltp) && ltp > 0) {
                    t.currentPrice = +ltp.toFixed(2);
                    t.pnlRs = +((ltp - t.entryPrice) * t.quantity).toFixed(2);
                    t.pnlPct = +(((ltp - t.entryPrice) / t.entryPrice) * 100).toFixed(2);
                }
            } catch { }
        }));

        let totalPnlRs = 0;
        let totalWins = 0;
        let totalClosed = 0;
        let activeRunners = 0;
        let capitalDeployed = 0;
        let unrealizedPnlRs = 0;

        trades.forEach((t: any) => {
            if (t.status === 'CLOSED') {
                totalClosed++;
                totalPnlRs += t.pnlRs || 0;
                if ((t.pnlRs || 0) > 0) totalWins++;
            } else if (t.status === 'OPEN') {
                capitalDeployed += t.capitalDeployed || 0;
                unrealizedPnlRs += t.pnlRs || 0;
                if (t.stopLossTrail) activeRunners++;
            }
        });

        const winRate = totalClosed > 0 ? (totalWins / totalClosed) * 100 : 0;

        res.json({
            success: true,
            data: {
                trades,
                metrics: {
                    totalPnlRs,
                    unrealizedPnlRs,
                    winRate,
                    totalClosed,
                    capitalDeployed,
                    activeRunners,
                },
                marketStatus: mktStatus,
                priceSource: mktStatus.isOpen ? 'Dhan HQ (Live)' : 'Yahoo Finance (EOD)',
                refreshedAt: new Date().toISOString(),
            }
        });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/portfolio/summary', requireAuth, async (req: AuthRequest, res: Response) => {
    const summary = await getPortfolioSummary(req.userId!);
    res.json({ success: true, data: summary });
});

app.get('/api/portfolio/news-risk', requireAuth, async (req: AuthRequest, res: Response) => {
    const summary = await getPortfolioNewsRisk(req.userId!, getCachedScan('swing'));
    res.json({ success: true, data: summary });
});

app.get('/api/portfolio/intelligence', requireAuth, async (req: AuthRequest, res: Response) => {
    const summary = await getPortfolioIntelligence(req.userId!, getCachedScan('swing'));
    res.json({ success: true, data: summary });
});

// MARKET INTEL (Sidebar & Signal Labs data)
// ── LIVE MARKET DATA: Real-time tick during market hours ──────────────
// GET /api/live/market — Live Nifty / BankNifty / Sensex + market open status
// Poll every 1-2 seconds during market hours, every 30-60s outside hours
app.get('/api/live/market', requireAuth, requireSubscription, async (_req: Request, res: Response) => {
    try {
        const status = getMarketStatus();
        const indices = await getLiveIndexPrices();
        res.json({
            success: true,
            data: {
                marketStatus: status,
                indices,
            }
        });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/live/prices?tickers=RELIANCE,TCS,INFY — Live LTPs for watchlist stocks
// Returns { ticker: ltp } map. Sourced from Dhan HQ during market hours.
app.get('/api/live/prices', requireAuth, requireSubscription, async (req: Request, res: Response) => {
    try {
        const status = getMarketStatus();
        const tickersParam = String(req.query.tickers || '');
        const tickers = tickersParam ? tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean) : [];

        let ltps: Record<string, number> = {};
        if (tickers.length > 0 && status.isOpen) {
            // During market hours: fetch live from Dhan HQ
            ltps = await getLiveLtpBatch(tickers);
        } else if (tickers.length > 0) {
            // Outside market hours: return last known prices from cached scan
            const cached = getCachedScan('swing');
            if (cached?.setups) {
                for (const s of cached.setups) {
                    if (tickers.includes(s.ticker)) {
                        ltps[s.ticker] = (s as any).ltp || (s as any).entryPrice || 0;
                    }
                }
            }
        }

        res.json({
            success: true,
            data: {
                marketStatus: status,
                ltps,
                fetchedAt: new Date().toISOString(),
            }
        });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
});

app.get('/api/market/intel', requireAuth, requireSubscription, async (_req: Request, res: Response) => {
    try {
        const [niftyRaw, bankNiftyRaw, sensexRaw] = await Promise.all([
            fetchLtp('^NSEI').catch(() => 0),
            fetchLtp('^NSEBANK').catch(() => 0),
            fetchLtp('^BSESN').catch(() => 0),
        ]);

        const nifty = (typeof niftyRaw === 'number' && niftyRaw > 0) ? niftyRaw : null;
        const bankNifty = (typeof bankNiftyRaw === 'number' && bankNiftyRaw > 0) ? bankNiftyRaw : null;
        const sensex = (typeof sensexRaw === 'number' && sensexRaw > 0) ? sensexRaw : null;
        
        let niftySparkline: number[] = [];
        try {
            const hist = await fetchHistoricalData('^NSEI', 30, '1d');
            if (hist && hist.length > 0) {
                niftySparkline = hist.map(c => c.close);
            }
        } catch { /* ignore */ }

        const flowSummary = await getInstitutionalFlowSummary().catch(() => null);
        const fiiDii = flowSummary?.series ? flowSummary.series.slice(0, 10).map(s => ({
            day: s.tradingDate,
            fii: s.fiiNet,
            dii: s.diiNet,
            total: s.totalNet,
            bias: s.marketBias,
        })) : [];

        res.json({
            success: true,
            data: {
                nifty,
                bankNifty,
                sensex,
                flowSummary,
                fiiDii,
                sparklines: {
                    nifty: niftySparkline,
                    fiiData: fiiDii.map(f => ({
                        h: Math.min(80, Math.max(10, Math.abs(f.total) / 50)),
                        isPos: f.total >= 0,
                    })),
                }
            }
        });
    } catch (e: any) {
        console.error('[API] Error fetching market intel:', e?.message || e);
        res.status(500).json({ success: false, message: 'Failed to fetch market intel' });
    }
});

// CAPITAL & POSITION SIZING SETTINGS
app.get('/api/user/capital', requireAuth, async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { tradingCapital: true, maxRiskPct: true, maxPositions: true, maxSectorConc: true } });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, data: user });
});

app.put('/api/user/capital', requireAuth, validateBody(capitalSettingsSchema), async (req: AuthRequest, res: Response) => {
    const { tradingCapital, maxRiskPct, maxPositions, maxSectorConc } = req.body;
    const updated = await prisma.user.update({
        where: { id: req.userId! },
        data: {
            ...(tradingCapital !== undefined && { tradingCapital: Number(tradingCapital) }),
            ...(maxRiskPct !== undefined && { maxRiskPct: Number(maxRiskPct) }),
            ...(maxPositions !== undefined && { maxPositions: Number(maxPositions) }),
            ...(maxSectorConc !== undefined && { maxSectorConc: Number(maxSectorConc) }),
        },
        select: { tradingCapital: true, maxRiskPct: true, maxPositions: true, maxSectorConc: true },
    });
    res.json({ success: true, data: updated });
});

app.post('/api/portfolio/trade', requireAuth, validateBody(portfolioTradeSchema), async (req: AuthRequest, res: Response) => {
    try {
        const trade = await createTrade(req.userId!, req.body);
        res.json({ success: true, trade, data: trade });
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

app.post('/api/portfolio/trades', requireAuth, validateBody(portfolioTradeSchema), async (req: AuthRequest, res: Response) => {
    try {
        const trade = await createTrade(req.userId!, req.body);
        res.json({ success: true, trade, data: trade });
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

app.get('/api/portfolio/trades', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const trades = await prisma.trade.findMany({
            where: { userId: req.userId! },
            orderBy: { entryDate: 'desc' },
        });
        const openTrades = trades.filter(t => t.status === 'OPEN');
        const closedTrades = trades.filter(t => t.status === 'CLOSED');
        res.json({ success: true, openTrades, closedTrades, data: trades });
    } catch (err: any) {
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

app.patch('/api/portfolio/trades/:id', requireAuth, validateBody(portfolioTradeUpdateSchema), async (req: AuthRequest, res: Response) => {
    try {
        const tradeId = req.params.id;
        const { exitPrice, exitReason, currentPrice, stopLossTrail, notes } = req.body;
        const trade = exitPrice !== undefined && exitReason !== undefined
            ? await closeTrade(req.userId!, tradeId, { exitPrice, exitReason })
            : await updateOwnedTrade(req.userId!, tradeId, { currentPrice, stopLossTrail, notes });
        res.json({ success: true, trade, data: trade });
    } catch (err: any) {
        res.status(404).json({ success: false, message: 'Open trade not found.' });
    }
});


// REAL-TIME WEBSOCKET TICK STREAM (SSE Endpoint for UI)
app.get('/api/stream/ticks', requireAuth, requireSubscription, (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const tickHandler = (tick: any) => {
        res.write(`data: ${JSON.stringify(tick)}\n\n`);
    };

    liveTickerStore.on('tick', tickHandler);

    req.on('close', () => {
        liveTickerStore.off('tick', tickHandler);
    });
});

// Keep unknown API requests out of the SPA fallback so API clients receive a
// machine-readable failure instead of index.html with a misleading HTTP 200.
app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ success: false, message: 'API route not found.' });
});

// SPA Fallback
if (process.env.NODE_ENV === 'production') {
    app.get('*', (_req, res) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
}

// =====================================================
// 🚀 FINAL START: BIND PORT
// =====================================================
app.listen(Number(PORT) || 3000, '0.0.0.0', () => {
    console.log(`\n[System] BOOT: ApexScan AI Bound to Port ${PORT}`);
    console.log(`[System] Initializing Agent Engine...`);
    console.log(`[System] Mode: ${process.env.NODE_ENV || 'development'}`);
    void (async () => {
        await verifyDatabaseConnection();
        await initializeScanCoordinator();
        await backfillTrackedSignalsFromDb().catch(() => undefined);

        // Scanning and paper execution are deliberately separate controls.
        initAutoScanner(trigger => startMarketScan({ mode: 'swing', trigger }));
        initGlobalAgent();

        // Warm empty/stale Signal Labs datasets without delaying HTTP readiness.
        void (async () => {
            const summary = await getInstitutionalFlowSummary();
            if (!summary.series.length || summary.isStale) {
                await syncInstitutionalFlowFromOfficialReport();
            }

            const latestDeal = await prisma.institutionalDeal.findFirst({ orderBy: { tradeDate: 'desc' } });
            const dealAgeMs = latestDeal ? Date.now() - latestDeal.tradeDate.getTime() : Number.POSITIVE_INFINITY;
            if (dealAgeMs > 5 * 24 * 60 * 60 * 1000) {
                await syncNseDailyBulkDeals();
            }
        })().catch((error: any) => {
            console.warn('[SignalLabs] Startup data refresh skipped:', error?.message || error);
        });
    })().catch((error: any) => {
        console.error('[System] Background services failed to initialize:', error?.message || error);
    });

    // Initialize Dhan Live Market Feed WebSocket (Sub-millisecond Ticks)
    const wsClient = getDhanWebSocketInstance();
    if (wsClient) {
        wsClient.on('error', () => {}); // Handle offline network errors safely
        wsClient.connect();
    }
});
