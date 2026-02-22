// =====================================================
// index.ts — Express Server + Cron Scheduler
// =====================================================

import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import cron from 'node-cron';
import { runScanner, buildTradeSetups } from './scanner';
import { addTrade, watchTrades, getActiveTrades, removeTrade, getTradeHistory } from './tradeManager';
import { ScanResult } from './types';
import { getTradingApiFromEnv, fetchHistoricalData } from './dataService';
import { fetchStockReport, getUniverseList, getFundamentalGrade, batchPrefetch, clearStockCache } from './fundamentalService';
import { sendPreMarketAlert } from './alerter';
import { runBacktest, BacktestConfig } from './backtester';
import { NSE_UNIVERSE } from './dataService';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In production, serve the built React frontend from frontend/dist
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(FRONTEND_DIST));
}

// Cache last scan result
let lastScan: ScanResult | null = null;
const broker = getTradingApiFromEnv();
const tradingApi = broker.api;

// ——————————————————————————————————————————
// ROUTES
// ——————————————————————————————————————————

// GET /api/scan — Run the full Phase 1+2 scanner
app.get('/api/scan', async (req: Request, res: Response) => {
    try {
        console.log('\n[API] /api/scan called');
        const { qualified, marketStatus } = await runScanner(tradingApi);
        const setups = await buildTradeSetups(qualified);
        const activeTrades = await getActiveTrades();

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
            setImmediate(() => batchPrefetch(scanTickers).catch(() => { }));
        }
    } catch (error: any) {
        console.error('[API] Scan error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/execute/:ticker — place a paper GTT order for an approved setup
app.post('/api/execute/:ticker', async (req: Request, res: Response) => {
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

        addTrade(setup);
        res.json({ success: true, data: order });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ── SCREENER / FUNDAMENTALS ROUTES ─────────────────

// GET /api/screener/universe — full stock list (ticker + sector)
app.get('/api/screener/universe', (_req: Request, res: Response) => {
    res.json({ success: true, data: getUniverseList() });
});

// GET /api/screener/grade/:ticker — lightweight fundamental grade for trade cards
app.get('/api/screener/grade/:ticker', async (req: Request, res: Response) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const report = await fetchStockReport(ticker);
        if (!report) {
            res.json({ success: true, data: { grade: '—', score: 0, summary: 'Data unavailable' } });
            return;
        }
        res.json({ success: true, data: getFundamentalGrade(report) });
    } catch {
        res.json({ success: true, data: { grade: '—', score: 0, summary: 'Error' } });
    }
});

// GET /api/chart/:ticker — OHLCV data for TradingChart
app.get('/api/chart/:ticker', async (req: Request, res: Response) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const yahooTicker = ticker + '.NS';
        const candles = await fetchHistoricalData(yahooTicker, 250);

        const chartData = candles.map(c => ({
            time: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
        }));

        res.json({ success: true, data: chartData });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
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

        const headlines = combinedNews.slice(0, 15).map((t) => `- ${t.title}`).join('\n');

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === 'paste_your_gemini_key_here') {
            cachedOutlook = "AI requires Gemini API key. Raw headlines fetched, but cannot summarize.";
            outlookTime = Date.now();
            return res.json({ success: true, summary: cachedOutlook, news: cachedNews });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const prompt = `Based on these top Indian and Global stock market headlines today:\n${headlines}\n\nAct as an expert Indian market analyst. Provide a concise, highly insightful 3-4 sentence paragraph. Do not just list the news. Summarize the overall market sentiment, how the overall market/companies are likely performing based on this, and provide a short future prediction or outlook. Format it as plain text without markdown headers or bullet points. Make it actionable for a swing trader.`;

        const aiResponse = await model.generateContent(prompt);
        cachedOutlook = aiResponse.response.text();
        outlookTime = Date.now();

        res.json({ success: true, summary: cachedOutlook, news: cachedNews });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/screener/stock/:ticker — full stock report
// Add ?refresh=1 to bypass the 30-min cache and force fresh data
app.get('/api/screener/stock/:ticker', async (req: Request, res: Response) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const forceRefresh = req.query.refresh === '1';
        if (forceRefresh) clearStockCache(ticker);
        const data = await fetchStockReport(ticker);
        if (!data) {
            res.status(404).json({ success: false, message: `No data found for ${ticker}. Market may be closed.` });
            return;
        }
        res.json({ success: true, data, fromCache: !forceRefresh });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
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

// GET /api/trades — Get all active trades
app.get('/api/trades', async (req: Request, res: Response) => {
    res.json({ success: true, data: await getActiveTrades() });
});

// POST /api/trades/add — Manually accept a trade setup
app.post('/api/trades/add', async (req: Request, res: Response) => {
    try {
        const setup = req.body;
        if (!setup?.ticker) {
            res.status(400).json({ success: false, message: 'Invalid trade setup payload' });
            return;
        }
        await addTrade(setup);
        res.json({ success: true, message: `Trade added for ${setup.ticker}` });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/trades/history — Get closed trades (Wins/Losses)
app.get('/api/trades/history', async (req: Request, res: Response) => {
    try {
        const history = await getTradeHistory();
        res.json({ success: true, data: history });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/trades/:ticker — Remove a trade
app.delete('/api/trades/:ticker', (req: Request, res: Response) => {
    removeTrade(req.params.ticker);
    res.json({ success: true, message: `Trade removed for ${req.params.ticker}` });
});

// POST /api/watch — Manually trigger trade monitoring
app.post('/api/watch', async (req: Request, res: Response) => {
    try {
        const updatedWithBroker = await watchTrades(tradingApi);
        res.json({ success: true, data: updatedWithBroker });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/backtest — Run historical backtesting engine
app.post('/api/backtest', async (req: Request, res: Response) => {
    try {
        const body = req.body;
        const allTickers = Object.keys(NSE_UNIVERSE);

        // Allow custom ticker subset or use full universe
        const tickers: string[] = body.tickers?.length > 0
            ? body.tickers
            : allTickers.slice(0, 60); // Default: top 60 for speed

        const config: BacktestConfig = {
            tickers,
            startDate: body.startDate || '2024-01-01',
            endDate: body.endDate || new Date().toISOString().slice(0, 10),
            targetPct: body.targetPct ?? 7,
            stopLossPct: body.stopLossPct ?? 3.5,
            maxHoldingDays: body.maxHoldingDays ?? 20,
            minRSI: body.minRSI ?? 45,
            maxRSI: body.maxRSI ?? 72,
            minVolumeRatio: body.minVolumeRatio ?? 1.5,
            maxConcurrentTrades: body.maxConcurrentTrades ?? 5,
            cooldownDays: body.cooldownDays ?? 15,
            requireBreakout: body.requireBreakout ?? true,
            requireVCP: body.requireVCP ?? false,
        };

        console.log(`[Backtest] Starting: ${config.tickers.length} stocks, ${config.startDate} → ${config.endDate}`);

        // Use SSE for progress streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const result = await runBacktest(config, (done, total, ticker) => {
            res.write(`data: ${JSON.stringify({ type: 'progress', done, total, ticker })}\n\n`);
        });

        res.write(`data: ${JSON.stringify({ type: 'result', data: result })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();

        console.log(`[Backtest] Complete: ${result.stats.totalTrades} trades, ${result.stats.winRate}% win rate`);
    } catch (error: any) {
        console.error('[Backtest] Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
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
            activeTrades: await getActiveTrades(),
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
        activeTrades: await getActiveTrades(),
    };
}, { timezone: 'Asia/Kolkata' });

// Watch active trades every 15 minutes during market hours (9:15 AM – 3:30 PM IST)
cron.schedule('*/15 9-15 * * 1-5', async () => {
    console.log('\n[CRON] Trade watcher triggered');
    await watchTrades(tradingApi);
}, { timezone: 'Asia/Kolkata' });

// ——————————————————————————————————————————
// START
// SPA fallback — must be after all API routes so React Router handles all non-API paths
if (process.env.NODE_ENV === 'production') {
    app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
}

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
