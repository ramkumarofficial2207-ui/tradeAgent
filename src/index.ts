// =====================================================
// index.ts — Express Server + Cron Scheduler
// =====================================================
console.log('[System] 🚀 Starting StockSage AI Engine...');

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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In production, serve the built React frontend
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

// ——————————————————————————————————————————
// 🚀 EMERGENCY BOOT: BIND PORT IMMEDIATELY
// ——————————————————————————————————————————
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`\n[System] EMERGERNCY BOOT: StockSage AI Port ${PORT} Bound.`);
    console.log(`[System] Mode: ${process.env.NODE_ENV}`);
});

// Root & Health for Railway
app.get('/api/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    } else {
        res.status(200).send('StockSage AI Backend Operational');
    }
});

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(FRONTEND_DIST));
}

console.log('[System] Process starting...');
process.on('uncaughtException', (err) => {
    console.error('[System] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[System] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Cache last scan result
let lastScan: ScanResult | null = null;
const broker = getTradingApiFromEnv();
const tradingApi = broker.api;

// ——————————————————————————————————————————
// ROUTES
// ——————————————————————————————————————————

// ═══════════════════════════════════════════
// AUTH — Register / Login / Me / Logout
// ═══════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req: Request, res: Response) => {
    const { name, email, password } = req.body || {};
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
        const user = await prisma.user.create({
            data: { name, email, password: hashed },
            select: { id: true, name: true, email: true, createdAt: true },
        });
        const token = generateToken(user.id, user.email);
        res.json({ success: true, token, user });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { email, password } = req.body || {};
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
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/watchlist/:ticker
app.delete('/api/watchlist/:ticker', requireAuth, async (req: AuthRequest, res: Response) => {
    const ticker = req.params.ticker.toUpperCase();
    try {
        await prisma.watchlistItem.deleteMany({ where: { userId: req.userId, ticker } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// GET /api/scan — Run the full Phase 1+2 scanner
app.get('/api/scan', async (req: Request, res: Response) => {
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

            const aiBuys = setups.filter(s => s.aiSignal === 'BUY' && s.confidenceScore >= 7);
            for (const s of aiBuys) {
                const exists = await prisma.historicalSetup.findFirst({
                    where: { ticker: s.ticker, status: 'IN_PROGRESS', createdAt: { gte: today } }
                });

                if (!exists) {
                    await prisma.historicalSetup.create({
                        data: {
                            ticker: s.ticker,
                            setupType: s.setupType,
                            timeframe: s.timeframe,
                            aiSignal: s.aiSignal || 'BUY',
                            confidenceScore: s.confidenceScore,
                            entryPrice: s.buyZone,
                            targetPrice: s.target,
                            stopLoss: s.stopLoss,
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
        pushEvent('SCAN_FAILED', 'critical', 'Scan Failed', error.message);
        res.status(500).json({ success: false, message: error.message });
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
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: error.message });
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
        res.status(500).json({ success: false, message: err.message });
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
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/chat — AI Stock Research Chatbot powered by Anthropic Claude AI
app.post('/api/chat', async (req: Request, res: Response) => {
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

    // Always inject current date/time so Claude knows it's not 2024
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
        const reply = await claudeAsk(systemPrompt, message, { maxTokens: 350, temperature: 0.5 });
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
                reply: `⚠️ AI error: ${errMsg}. Please try again.`,
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
        res.status(500).json({ success: false, message: err.message });
    }
});

// Daily Performance Tracking Job (Run at 16:00 IST / 10:30 UTC)
cron.schedule('30 10 * * 1-5', () => {
    updatePerformanceRecords();
});

// ——————————————————————————————————————————
// 🚀 START SERVER IMMEDIATELY
// ——————————————————————————————————————————
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`\n[System] StockSage AI Agent Online on Port ${PORT}`);
    console.log(`[System] Mode: ${process.env.NODE_ENV}`);

    // Log masked DB URL for production debugging
    const dbUrl = process.env.DATABASE_URL || '';
    const maskedUrl = dbUrl.replace(/:([^@]+)@/, ':****@');
    console.log(`[System] DB Host: ${maskedUrl.split('@')[1] || 'Unknown'}`);

    // Deferred initialization to allow server to be "Ready" for Railway
    setTimeout(async () => {
        try {
            console.log('[System] Running database migrations...');
            // Optional: run migrations in background
            const { exec } = require('child_process');
            exec('npx prisma migrate deploy', (err: any, stdout: any, stderr: any) => {
                if (err) console.error('[System] Migration Error:', stderr);
                else console.log('[System] Migration Complete:', stdout);
            });

            console.log('[System] Initializing AI Agentic Systems...');
            initAutoScanner();
            setNextScan(computeNextScan());
            pushEvent('SYSTEM', 'success', 'StockSage AI Online', 'Autonomous agent systems initialized and monitoring.');
        } catch (e: any) {
            console.error('[System] Deferred Init Failed:', e.message);
        }
    }, 1000);
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
