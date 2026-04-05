// =====================================================
// index.ts — Express Server + Cron Scheduler
// =====================================================
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import cron from 'node-cron';
import bcrypt from 'bcryptjs';
import { exec } from 'child_process';
import { runScanner, buildTradeSetups, finalizeSwingDiagnostics, runIntradayScanner } from './scanner';
import { MarketDataInterval, ScanResult } from './types';
import { fetchHistoricalData, fetchNiftyData, getLiveQuoteSnapshots, NSE_UNIVERSE, SECTOR_MAP, getTradingApiFromEnv } from './dataService';
import { fetchStockReport, batchPrefetch } from './fundamentalService';
import { sendPreMarketAlert } from './alerter';
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
import { createTrade, closeTrade, getPortfolioIntelligence, getPortfolioNewsRisk, getPortfolioSummary, updateTradeCurrentPrice } from './portfolioService';
import { sendBuyAlert, sendPreMarketDigest } from './whatsappAlert';
import { notifyUsersWithMorningDigest, notifyUsersWithPostMarketSummary } from './notificationService';
import {
    getInstitutionalFlowSummary,
    importInstitutionalFlowCsv,
    seedInstitutionalFlowIfEmpty,
    syncInstitutionalFlowFromOfficialReport,
} from './institutionalFlowService';
import {
    adminInstitutionalFlowImportSchema,
    adminActivateSchema,
    chatSchema,
    deviceRegistrationSchema,
    loginSchema,
    newsImpactSchema,
    portfolioTradeSchema,
    portfolioTradeUpdateSchema,
    registerSchema,
    userPreferencesSchema,
    validateBody,
    watchlistCreateSchema,
} from './validation';
import { buildGroundedChatResponse } from './chat/service';
import { analyzeNewsImpact, buildTechnicalContextFromStock } from './newsImpactService';
import { getNewsFeed, getStoredNewsStatus, getTickerNewsDigest, syncNewsIntelligence } from './newsIntel/service';
import { buildMarketGroundingFromReport, buildSectorBreadthMap } from './newsIntel/marketGrounding';
import { backfillTrackedSignalsFromDb, buildEdgeDashboard, trackHistoricalSetup } from './edgeAnalyticsService';
import { registerDeviceToken } from './pushNotificationService';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
type DbStatus = 'unknown' | 'ready' | 'error';
type ScanMode = 'swing' | 'intraday';

const dbHealth: {
    status: DbStatus;
    checkedAt: string | null;
    message: string | null;
} = {
    status: 'unknown',
    checkedAt: null,
    message: null,
};
let dbRepairAttempted = false;
let dbRepairInFlight = false;

const SAFE_USER_SELECT = {
    id: true,
    name: true,
    email: true,
    mobileNumber: true,
    createdAt: true,
    subscriptionStatus: true,
    subscriptionExpiry: true,
} as const;

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

function shouldAttemptDatabaseRepair(err: any): boolean {
    if (!isDatabaseError(err)) return false;
    const message = summarizeDbError(err).toLowerCase();
    return message.includes('does not exist in the current database') ||
        message.includes('table') && message.includes('does not exist') ||
        message.includes('has not been created yet');
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

function attemptDatabaseRepair(reason: any): void {
    if (dbRepairAttempted || dbRepairInFlight || !shouldAttemptDatabaseRepair(reason)) return;
    dbRepairAttempted = true;
    dbRepairInFlight = true;
    console.warn('[System] Database schema mismatch detected. Attempting one-time prisma db push...');
    exec('npx prisma db push', { cwd: process.cwd() }, async (err, stdout, stderr) => {
        dbRepairInFlight = false;
        if (err) {
            console.error('[System] Database repair failed:', (stderr || err.message || '').trim());
            return;
        }
        if (stdout?.trim()) console.log('[System] Database repair output:', stdout.trim());
        await verifyDatabaseConnection();
    });
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
        // Check for InstitutionalFlowSnapshot table (using any property to verify existence)
        await prisma.institutionalFlowSnapshot.findFirst({ select: { id: true } });
        markDatabaseHealthy();
        console.log('[System] Database connection ready.');
    } catch (err: any) {
        markDatabaseError(err);
        console.error('[System] Database connection failed:', summarizeDbError(err));
        attemptDatabaseRepair(err);
    }
}

// Helper to sanitize database/system errors for the UI
function sanitizeError(err: any): string {
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

app.use(cors());
app.use(express.json());

// In production, serve the built React frontend
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(FRONTEND_DIST));
}

// Routes
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
        const indexPath = path.join(FRONTEND_DIST, 'index.html');
        // Prevent caching of index.html to ensure clients always get the latest hashed asset references
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(indexPath, (err) => {
            if (err) {
                console.error('[Static] Failed to serve index.html:', err.message);
                res.status(200).send('StockSage AI Backend Operational (Initial Booting...)');
            }
        });
    } else {
        res.status(200).send('StockSage AI Backend Operational (Development Mode)');
    }
});

// Global process handlers
process.on('uncaughtException', (err) => {
    console.error('[System] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[System] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Cache last scan result
let lastSwingScan: ScanResult | null = null;
let lastIntradayScan: ScanResult | null = null;

function normalizeScanMode(value: unknown): ScanMode {
    return value === 'intraday' ? 'intraday' : 'swing';
}

function getCachedScan(mode: ScanMode): ScanResult | null {
    return mode === 'intraday' ? lastIntradayScan : lastSwingScan;
}

function setCachedScan(mode: ScanMode, scan: ScanResult): void {
    if (mode === 'intraday') {
        lastIntradayScan = scan;
        return;
    }
    lastSwingScan = scan;
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

function getLatestAvailableScan(): ScanResult | null {
    if (!lastSwingScan) return lastIntradayScan;
    if (!lastIntradayScan) return lastSwingScan;
    const swingTs = new Date(lastSwingScan.timestamp || 0).getTime();
    const intradayTs = new Date(lastIntradayScan.timestamp || 0).getTime();
    return intradayTs > swingTs ? lastIntradayScan : lastSwingScan;
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

function getLastThursdayUtc(year: number, monthIndex: number): Date {
    const date = new Date(Date.UTC(year, monthIndex + 1, 0));
    while (date.getUTCDay() !== 4) date.setUTCDate(date.getUTCDate() - 1);
    return date;
}

function buildEconomicCalendar(now = new Date()) {
    const events: Array<{ date: string; label: string; type: 'FNO' | 'RBI' | 'EARNINGS' | 'BUDGET'; importance: 'HIGH' | 'CRITICAL' }> = [];
    const year = now.getUTCFullYear();
    const start = Date.UTC(year, now.getUTCMonth(), now.getUTCDate());

    for (let offset = 0; offset < 6; offset += 1) {
        const monthIndex = now.getUTCMonth() + offset;
        const expiry = getLastThursdayUtc(year + Math.floor(monthIndex / 12), ((monthIndex % 12) + 12) % 12);
        if (expiry.getTime() >= start) {
            events.push({
                date: expiry.toISOString(),
                label: `Monthly F&O Expiry - ${expiry.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`,
                type: 'FNO',
                importance: offset <= 1 ? 'CRITICAL' : 'HIGH',
            });
        }
    }

    const budgetThisYear = new Date(Date.UTC(year, 1, 1));
    const budgetNextYear = new Date(Date.UTC(year + 1, 1, 1));
    const nextBudget = budgetThisYear.getTime() >= start ? budgetThisYear : budgetNextYear;
    events.push({
        date: nextBudget.toISOString(),
        label: 'Union Budget',
        type: 'BUDGET',
        importance: 'CRITICAL',
    });

    return events
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 6);
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
    syncNewsIntelligence(lastSwingScan).catch((err: any) => {
        console.warn('[NewsIntel] Initial sync skipped:', err?.message || err);
    });
}, 2500);

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
    if (password && password.length < 6) {
        res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        return;
    }
    if (mpin && !/^\d{4,6}$/.test(mpin)) {
        res.status(400).json({ success: false, message: 'MPIN must be 4 to 6 digits.' });
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
        res.json({ success: true, token, user, trialDaysLeft: 7 });
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
        const { password: _, mpinHash: __, ...safeUser } = user as any;
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
            select: SAFE_USER_SELECT,
        });
        if (!user) { res.status(404).json({ success: false, message: 'User not found.' }); return; }
        res.json({ success: true, user });
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
                telegramChatId: req.body?.whatsappNumber,
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
app.get('/api/scan', scanLimiter, requireAuth, requireSubscription, async (req: AuthRequest, res: Response) => {
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

        clearThinkingSteps();
        setAgentState('SCANNING', mode === 'intraday' ? 'Running intraday momentum scan' : 'Running full market scan');
        pushEvent(
            'SCAN_START',
            'info',
            mode === 'intraday' ? 'Intraday Scanner Started' : 'Scanner Started',
            mode === 'intraday'
                ? 'Running 5-minute intraday scan across the liquid NSE universe'
                : 'Running full Phase 1+1000 scan across Nifty stocks'
        );

        const s1 = addThinkingStep('Fetching live market data from NSE', 'running');
        console.log(`[API] Running ${mode} market scan...`);
        let qualified: any[] = [];
        let marketStatus: any;
        let setups: any[] = [];
        let diagnostics: ScanResult['diagnostics'];
        if (mode === 'intraday') {
            const intradayResult = await runIntradayScanner(tradingApi);
            qualified = intradayResult.qualified;
            marketStatus = intradayResult.marketStatus;
            setups = intradayResult.setups;
            diagnostics = intradayResult.diagnostics;
        } else {
            const swingResult = await runScanner(tradingApi);
            qualified = swingResult.qualified;
            marketStatus = swingResult.marketStatus;
            diagnostics = swingResult.diagnostics;
        }
        updateThinkingStep(s1, 'done', `Market regime: ${marketStatus.regime || 'NEUTRAL'}`);

        const s2 = addThinkingStep('Computing technical indicators & AI signals', 'running');
        if (mode !== 'intraday') {
            setups = await buildTradeSetups(qualified, marketStatus);
            diagnostics = await finalizeSwingDiagnostics(diagnostics ?? {
                mode: 'swing',
                universeCount: qualified.length,
                qualifiedCount: qualified.length,
                setupCount: 0,
                rejectionCounts: {},
                notes: [],
                nearMisses: [],
                recommendedAction: 'WAIT',
            }, qualified, setups);
        }
        updateThinkingStep(s2, 'done', `${setups.length} setups identified`);

        const s3 = addThinkingStep('Finalizing scan results', 'running');
        updateThinkingStep(s3, 'done', 'Ready');

        const sectorBreadth = buildSectorBreadthMap(qualified, setups);
        const scanPayload: ScanResult = {
            timestamp: new Date().toISOString(),
            marketStatus,
            setups,
            sectorBreadth,
            diagnostics,
        };
        setCachedScan(mode, scanPayload);

        const buyCount = setups.filter(s => s.aiSignal === 'BUY').length;
        setAgentState('IDLE');
        incrementTasksCompleted();
        setLastScan(scanPayload.timestamp);
        setMonitoredStocks(setups.length);
        pushEvent('SCAN_COMPLETE', 'success',
            `Scan Complete — ${setups.length} Setups Found`,
            `${buyCount} BUY signals, ${setups.length - buyCount} WATCH/AVOID. Regime: ${marketStatus.regime || 'NEUTRAL'}`,
            { data: { total: setups.length, buyCount } }
        );

        // ── AUTO-LOGGING TO PERFORMANCE DATABASE ──
        setups
            .filter(s => s.alertStage && (s.alertStage === 'TRADE_READY' || s.alertStage === 'TRIGGER_ARMED'))
            .slice(0, 3)
            .forEach(s => {
                pushEvent(
                    'TRADE_ALERT',
                    s.alertStage === 'TRADE_READY' ? 'success' : 'info',
                    `${s.alertStage === 'TRADE_READY' ? 'Trade Ready' : 'Trigger Armed'}: ${s.ticker}`,
                    `${s.setupType} | Edge ${s.calibratedEdgeScore ?? s.confidenceScore}/10 | ${s.newsDistribution?.signalAlignment ?? 'UNAVAILABLE'} | ${s.marketGrounding?.confirmationStatus ?? 'UNAVAILABLE'}`,
                    { ticker: s.ticker }
                );
            });

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
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
                    const created = await prisma.historicalSetup.create({
                        data: {
                            ticker: s.ticker, setupType: s.setupType, timeframe: s.timeframe,
                            aiSignal: s.aiSignal || 'WATCH', confidenceScore: s.confidenceScore,
                            entryPrice: s.buyZone, targetPrice: s.target, stopLoss: s.stopLoss,
                            aiLogic: s.aiLogic, status: 'IN_PROGRESS'
                        }
                    });
                    await trackHistoricalSetup(created.id, s, marketStatus.regime || 'UNKNOWN');
                }
            }
        } catch (dbErr: any) {
            console.error('[Database] Failed to log setups:', dbErr.message);
        }

        res.json({ success: true, data: scanPayload });

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

app.get('/api/founder/edge-dashboard', requireAuth, async (_req: AuthRequest, res: Response) => {
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
app.get('/api/chart/:ticker', async (req: Request, res: Response) => {
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

app.get('/api/quotes', async (req: Request, res: Response) => {
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
app.get('/api/market-pulse', async (_req: Request, res: Response) => {
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
            } else state[s.key] = { price: 0, change: 0 };
        });
        const vixPrice = state.vix?.price || 0;
        let vixLabel = { text: 'Low Risk', color: '#34d399', detail: 'Market volatility is low.' };
        if (vixPrice > 20) vixLabel = { text: 'High Risk', color: '#f87171', detail: 'High volatility detected.' };
        else if (vixPrice > 16) vixLabel = { text: 'Moderate Risk', color: '#fbbf24', detail: 'Watch for swings.' };
        
        const data = { indices: state, vixLabel, isMarketOpen: true, fetchedAt: new Date().toISOString() };
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

app.get('/api/market-outlook', async (req: Request, res: Response) => {
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
            const setup = lastSwingScan?.setups?.find(item => item.ticker === targetTicker.toUpperCase()) ?? null;
            if (report) {
                resolvedTechnicalContext =
                    await buildMarketGroundingFromReport(
                        report,
                        setup,
                        lastSwingScan?.marketStatus,
                        lastSwingScan?.sectorBreadth?.[report.sector],
                    ) ?? buildTechnicalContextFromStock(report, setup);
                resolvedSector = resolvedSector || report.sector;
            }
        }

        const analysis = analyzeNewsImpact({
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
        const items = await getNewsFeed({ ticker, sector, regulator, refresh, limit }, lastSwingScan);
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
        const digest = await getTickerNewsDigest(ticker, lastSwingScan, refresh);
        res.json({ success: true, data: digest });
    } catch (err: any) {
        console.error('[NewsDigest] Error:', err.message);
        res.status(500).json({ success: false, message: sanitizeError(err) });
    }
});

app.post('/api/news/sync', chatLimiter, requireAuth, requireSubscription, async (_req: AuthRequest, res: Response) => {
    try {
        const result = await syncNewsIntelligence(lastSwingScan);
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
            lastSwingScan,
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

    const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });
    const topSetups = lastSwingScan?.setups?.slice(0, 3).map(s => s.ticker).join(', ') || 'Scanning...';

    const systemPrompt = `You are StockSage Intelligence — an autonomous Multi-Agent Quant Trading system.
Current Time: ${nowIST} (IST)

[CONTEXT]
- Global Regime: ${lastSwingScan?.marketStatus?.regime || 'NEUTRAL'}
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

app.get('/api/broker/status', (_req: Request, res: Response) => {
    res.json({ success: true, data: { provider: broker?.provider || 'paper', live: !!broker?.live } });
});

app.get('/api/last', (req: Request, res: Response) => {
    const mode = normalizeScanMode(req.query.mode);
    const scan = getCachedScan(mode);
    res.json({ success: !!scan, data: scan });
});

// CRON JOBS
cron.schedule('45 8 * * 1-5', async () => {
    try {
        const { qualified, marketStatus, diagnostics } = await runScanner(tradingApi);
        const setups = await buildTradeSetups(qualified, marketStatus);
        lastSwingScan = {
            timestamp: new Date().toISOString(),
            marketStatus,
            setups,
            sectorBreadth: buildSectorBreadthMap(qualified, setups),
            diagnostics: await finalizeSwingDiagnostics(diagnostics, qualified, setups),
        };
        await notifyUsersWithMorningDigest(setups.filter(s => s.confidenceScore >= 7), marketStatus.regime || 'NEUTRAL');
    } catch { }
}, { timezone: 'Asia/Kolkata' });

cron.schedule('45 15 * * 1-5', async () => {
    try {
        const { qualified, marketStatus, diagnostics } = await runScanner(tradingApi);
        const setups = await buildTradeSetups(qualified, marketStatus);
        lastSwingScan = {
            timestamp: new Date().toISOString(),
            marketStatus,
            setups,
            sectorBreadth: buildSectorBreadthMap(qualified, setups),
            diagnostics: await finalizeSwingDiagnostics(diagnostics, qualified, setups),
        };
        await notifyUsersWithPostMarketSummary(setups, marketStatus.regime || 'NEUTRAL');
    } catch { }
}, { timezone: 'Asia/Kolkata' });

cron.schedule('*/30 8-18 * * 1-5', async () => {
    try {
        await syncNewsIntelligence(lastSwingScan);
    } catch { }
}, { timezone: 'Asia/Kolkata' });

// AGENTIC AI
app.get('/api/agent/status', (_req, res) => res.json({ success: true, data: getAgentStatus() }));
app.get('/api/agent/events', (req, res) => res.json({ success: true, data: getEvents(50) }));
app.get('/api/agent/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    addSSEClient(res);
    req.on('close', () => removeSSEClient(res));
});

app.get('/api/fii-dii', async (req: Request, res: Response) => {
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

app.get('/api/economic-calendar', (_req: Request, res: Response) => {
    res.json({ success: true, data: buildEconomicCalendar() });
});

// SECTORS
app.get('/api/sectors', async (_req, res) => {
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

app.get('/api/portfolio/summary', requireAuth, async (req: AuthRequest, res: Response) => {
    const summary = await getPortfolioSummary(req.userId!);
    res.json({ success: true, data: summary });
});

app.get('/api/portfolio/news-risk', requireAuth, async (req: AuthRequest, res: Response) => {
    const summary = await getPortfolioNewsRisk(req.userId!, lastSwingScan);
    res.json({ success: true, data: summary });
});

app.get('/api/portfolio/intelligence', requireAuth, async (req: AuthRequest, res: Response) => {
    const summary = await getPortfolioIntelligence(req.userId!, lastSwingScan);
    res.json({ success: true, data: summary });
});

app.post('/api/portfolio/trade', requireAuth, async (req: AuthRequest, res: Response) => {
    const trade = await createTrade(req.userId!, req.body);
    res.json({ success: true, data: trade });
});

// SPA Fallback
if (process.env.NODE_ENV === 'production') {
    app.get('*', (_req, res) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
}

function computeNextScan(): string {
    return new Date().toISOString();
}

// =====================================================
// 🚀 FINAL START: BIND PORT
// =====================================================
app.listen(Number(PORT) || 3000, '0.0.0.0', () => {
    console.log(`\n[System] BOOT: StockSage AI Bound to Port ${PORT}`);
    console.log(`[System] Mode: ${process.env.NODE_ENV || 'development'}`);
    void verifyDatabaseConnection();
    void backfillTrackedSignalsFromDb().catch(() => { });
});
