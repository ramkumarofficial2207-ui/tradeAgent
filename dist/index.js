"use strict";
// =====================================================
// index.ts — Express Server + Cron Scheduler
// =====================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const node_cron_1 = __importDefault(require("node-cron"));
const scanner_1 = require("./scanner");
const dataService_1 = require("./dataService");
const fundamentalService_1 = require("./fundamentalService");
const alerter_1 = require("./alerter");
const axios_1 = __importDefault(require("axios"));
const claudeClient_1 = require("./claudeClient");
const agentEvents_1 = require("./agentEvents");
const prismaClient_1 = __importDefault(require("./prismaClient"));
const performanceJob_1 = require("./performanceJob");
const autoScannerJob_1 = require("./autoScannerJob");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// In production, serve the built React frontend from frontend/dist
const FRONTEND_DIST = path_1.default.join(__dirname, '..', 'frontend', 'dist');
if (process.env.NODE_ENV === 'production') {
    app.use(express_1.default.static(FRONTEND_DIST));
}
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
        const force = req.query.force === 'true';
        if (!force && lastScan) {
            console.log('[API] Serving cached scan results');
            res.json({ success: true, data: lastScan });
            return;
        }
        // ── Agentic: emit thinking steps ──
        (0, agentEvents_1.clearThinkingSteps)();
        (0, agentEvents_1.setAgentState)('SCANNING', 'Running full market scan');
        (0, agentEvents_1.pushEvent)('SCAN_START', 'info', 'Scanner Started', 'Running full Phase 1+2 scan across 200+ NSE stocks');
        const s1 = (0, agentEvents_1.addThinkingStep)('Fetching live market data from NSE', 'running');
        console.log('[API] Running full market scan...');
        const { qualified, marketStatus } = await (0, scanner_1.runScanner)(tradingApi);
        (0, agentEvents_1.updateThinkingStep)(s1, 'done', `Market regime: ${marketStatus.regime || 'NEUTRAL'}`);
        const s2 = (0, agentEvents_1.addThinkingStep)('Computing technical indicators & AI signals', 'running');
        const setups = await (0, scanner_1.buildTradeSetups)(qualified);
        (0, agentEvents_1.updateThinkingStep)(s2, 'done', `${setups.length} setups identified`);
        const s3 = (0, agentEvents_1.addThinkingStep)('Finalizing scan results', 'running');
        (0, agentEvents_1.updateThinkingStep)(s3, 'done', 'Ready');
        lastScan = {
            timestamp: new Date().toISOString(),
            marketStatus,
            setups,
        };
        // Emit scan result events
        const buyCount = setups.filter(s => s.aiSignal === 'BUY').length;
        (0, agentEvents_1.setAgentState)('IDLE');
        (0, agentEvents_1.incrementTasksCompleted)();
        (0, agentEvents_1.setLastScan)(lastScan.timestamp);
        (0, agentEvents_1.setMonitoredStocks)(setups.length);
        (0, agentEvents_1.pushEvent)('SCAN_COMPLETE', 'success', `Scan Complete — ${setups.length} Setups Found`, `${buyCount} BUY signals, ${setups.length - buyCount} WATCH/AVOID. Regime: ${marketStatus.regime || 'NEUTRAL'}`, { data: { total: setups.length, buyCount } });
        // Emit individual high-confidence setup events
        setups.filter(s => s.aiSignal === 'BUY' && s.confidenceScore >= 7).forEach(s => {
            (0, agentEvents_1.pushEvent)('SETUP_FOUND', 'success', `🎯 BUY Signal: ${s.ticker}`, `${s.setupType} — Confidence ${s.confidenceScore}/10, Target +${s.targetPct.toFixed(1)}%, RR ${s.riskReward}:1`, { ticker: s.ticker, data: { confidence: s.confidenceScore, target: s.targetPct } });
        });
        // ── AUTO-LOGGING TO PERFORMANCE DATABASE ──
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const aiBuys = setups.filter(s => s.aiSignal === 'BUY' && s.confidenceScore >= 7);
            for (const s of aiBuys) {
                const exists = await prismaClient_1.default.historicalSetup.findFirst({
                    where: { ticker: s.ticker, status: 'IN_PROGRESS', createdAt: { gte: today } }
                });
                if (!exists) {
                    await prismaClient_1.default.historicalSetup.create({
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
        }
        catch (dbErr) {
            console.error('[Database] Failed to log setups to tracker:', dbErr.message);
        }
        // Regime change detection
        if (marketStatus.regime === 'RISK_OFF') {
            (0, agentEvents_1.pushEvent)('MARKET_REGIME_CHANGE', 'critical', '⛔ RISK OFF Regime', marketStatus.regimeDetail || 'Nifty below key moving averages');
        }
        else if (marketStatus.regime === 'BULLISH') {
            (0, agentEvents_1.pushEvent)('MARKET_REGIME_CHANGE', 'success', '✅ BULLISH Regime', marketStatus.regimeDetail || 'Nifty above key moving averages');
        }
        res.json({ success: true, data: lastScan });
        const scanTickers = setups.map(s => s.ticker);
        if (scanTickers.length) {
            setImmediate(() => (0, fundamentalService_1.batchPrefetch)(scanTickers).catch(() => { }));
        }
    }
    catch (error) {
        console.error('[API] Scan error:', error.message);
        (0, agentEvents_1.setAgentState)('IDLE');
        (0, agentEvents_1.pushEvent)('SCAN_FAILED', 'critical', 'Scan Failed', error.message);
        res.status(500).json({ success: false, message: error.message });
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
            avgWin: 0,
            avgLoss: 0,
            winRate: 0
        };
        const resolvedCount = stats.won + stats.lost;
        if (resolvedCount > 0) {
            stats.winRate = (stats.won / resolvedCount) * 100;
        }
        const wonTrades = history.filter((h) => h.status === 'WON' && h.resultPct);
        if (wonTrades.length) {
            stats.avgWin = wonTrades.reduce((sum, t) => sum + (t.resultPct || 0), 0) / wonTrades.length;
        }
        const lostTrades = history.filter((h) => h.status === 'LOST' && h.resultPct);
        if (lostTrades.length) {
            stats.avgLoss = lostTrades.reduce((sum, t) => sum + (t.resultPct || 0), 0) / lostTrades.length;
        }
        res.json({ success: true, data: { stats, history } });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/chart/:ticker — Historical OHLCV + indicators for frontend chart
const chartCache = {};
app.get('/api/chart/:ticker', async (req, res) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const yahooBSE = `${ticker}.NS`;
        const days = Math.min(Number(req.query.days) || 180, 365);
        // Serve from cache if < 5 min old
        const cached = chartCache[ticker];
        if (cached && Date.now() - cached.ts < 300_000) {
            return res.json({ success: true, data: cached.data });
        }
        const candles = await (0, dataService_1.fetchHistoricalData)(yahooBSE, days);
        if (!candles.length) {
            return res.status(404).json({ success: false, message: 'No data found for ' + ticker });
        }
        // Compute SMAs and EMA inline
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
        const computeEMA = (arr, period) => {
            const k = 2 / (period + 1);
            const result = [];
            let ema = null;
            for (let i = 0; i < arr.length; i++) {
                if (i < period - 1) {
                    result.push(null);
                    continue;
                }
                if (ema === null) {
                    ema = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
                }
                else {
                    ema = arr[i] * k + ema * (1 - k);
                }
                result.push(Number(ema.toFixed(2)));
            }
            return result;
        };
        // Compute RSI
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
                    lossSum = avgLoss; // reuse as smoothed
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
    }
    catch (error) {
        console.error('[API] Chart error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});
// ── MARKET PULSE ───────────────────────────────────
// Lightweight endpoint: live Nifty price + all index changes
// Cached 5 min to avoid hammering Yahoo Finance
let pulseCache = null;
const PULSE_TTL = 5 * 60 * 1000; // 5 minutes
app.get('/api/market-pulse', async (_req, res) => {
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
        const results = await Promise.allSettled(symbols.map(s => (0, dataService_1.fetchHistoricalData)(s.symbol, 260)));
        const state = {};
        symbols.forEach((s, i) => {
            const res = results[i];
            if (res.status === 'fulfilled' && res.value.length >= 2) {
                const c = res.value;
                const price = +c[c.length - 1].close.toFixed(2);
                const prev = c[c.length - 2].close;
                const change = +(((price - prev) / prev) * 100).toFixed(2);
                const closes = c.map((x) => x.close);
                const high52 = +Math.max(...closes.slice(-252)).toFixed(2);
                const low52 = +Math.min(...closes.slice(-252)).toFixed(2);
                const pct52 = high52 > low52 ? +(((price - low52) / (high52 - low52)) * 100).toFixed(1) : 0;
                // Keep the last 30 closes for a mini sparkline chart
                const sparkline = closes.slice(-30).map((n) => +n.toFixed(2));
                state[s.key] = { price, change, high52, low52, pct52, sparkline };
            }
            else {
                state[s.key] = { price: 0, change: 0, high52: 0, low52: 0, pct52: 0, sparkline: [] };
            }
        });
        // Derive market risk from VIX — available without any scan
        const vixLevel = state.vix.price;
        const vixRisk = vixLevel === 0 ? 'unknown' :
            vixLevel < 13 ? 'calm' :
                vixLevel < 16 ? 'normal' :
                    vixLevel < 20 ? 'elevated' :
                        vixLevel < 25 ? 'high' : 'extreme';
        const vixLabel = vixRisk === 'calm' ? { text: 'Bull Zone', color: '#34d399', detail: 'Full position sizing allowed' } :
            vixRisk === 'normal' ? { text: 'Market Clear', color: '#34d399', detail: 'Normal position sizing allowed' } :
                vixRisk === 'elevated' ? { text: 'Elevated Risk', color: '#fbbf24', detail: 'Reduce to 60% position size' } :
                    vixRisk === 'high' ? { text: 'Danger Zone', color: '#f87171', detail: 'Avoid new longs. Trail stops.' } :
                        vixRisk === 'extreme' ? { text: 'Crisis Mode', color: '#f87171', detail: 'Stay in cash. No new trades.' } :
                            { text: 'Checking VIX…', color: 'var(--text-muted)', detail: 'Fetching data' };
        const isMarketOpen = (() => {
            const now = new Date();
            const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
            const h = ist.getHours(), m = ist.getMinutes(), day = ist.getDay();
            if (day === 0 || day === 6)
                return false;
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
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// GET /api/chart/:ticker — OHLCV data for TradingChart
app.get('/api/chart/:ticker', async (req, res) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const yahooTicker = ticker + '.NS';
        const candles = await (0, dataService_1.fetchHistoricalData)(yahooTicker, 250);
        const chartData = candles.map(c => ({
            time: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
        }));
        res.json({ success: true, data: chartData });
    }
    catch (e) {
        res.status(500).json({ success: false, message: e.message });
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
        if (title && link)
            items.push({ title, link, pubDate });
    }
    return items;
}
// GET /api/market-outlook — Read general market news and summarize
app.get('/api/market-outlook', async (req, res) => {
    if (Date.now() - outlookTime < 15 * 60 * 1000 && cachedOutlook) {
        return res.json({ success: true, summary: cachedOutlook, news: cachedNews });
    }
    try {
        const [indiaRes, globalRes] = await Promise.all([
            axios_1.default.get('https://www.livemint.com/rss/markets', { timeout: 10000 }),
            axios_1.default.get('https://www.livemint.com/rss/companies', { timeout: 10000 })
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
            cachedOutlook = await (0, claudeClient_1.claudeAsk)('You are an expert Indian stock market analyst. Summarize the market outlook for swing traders in 3-4 sentences. Be concise, opinionated, and actionable. Plain text only, no bullet points or markdown.', `Top market headlines:\n${headlines}`, { maxTokens: 200, temperature: 0.4 });
        }
        catch (aiErr) {
            console.error('[Market Outlook AI] Error:', aiErr.message);
            cachedOutlook = 'AI summary unavailable. Check your ANTHROPIC_API_KEY in .env';
        }
        outlookTime = Date.now();
        res.json({ success: true, summary: cachedOutlook, news: cachedNews });
    }
    catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});
// POST /api/chat — AI Stock Research Chatbot powered by Groq (Llama 3.3 70B)
app.post('/api/chat', async (req, res) => {
    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
        res.status(400).json({ success: false, message: 'Missing message' });
        return;
    }
    // Detect known stock tickers in the message
    const upperMsg = message.toUpperCase();
    const knownStocks = {
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
        if (upperMsg.includes(key)) {
            detectedTicker = ticker;
            break;
        }
    }
    // Build live technical context for the detected stock
    let technicalContext = '';
    let stockCardData = null;
    if (detectedTicker && detectedTicker !== 'NIFTY') {
        try {
            const [candleRes, fundRes] = await Promise.allSettled([
                (0, dataService_1.fetchHistoricalData)(detectedTicker + '.NS', 220),
                (0, fundamentalService_1.fetchStockReport)(detectedTicker),
            ]);
            const candles = candleRes.status === 'fulfilled' ? candleRes.value : [];
            const fund = fundRes.status === 'fulfilled' ? fundRes.value : null;
            if (candles.length > 20) {
                const closes = candles.map(c => c.close);
                const ltp = closes[closes.length - 1];
                const dma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, closes.length);
                const ema20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
                const gains = [], losses = [];
                for (let i = 1; i <= 14; i++) {
                    const diff = closes[closes.length - i] - closes[closes.length - i - 1];
                    if (diff > 0)
                        gains.push(diff);
                    else
                        losses.push(Math.abs(diff));
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
        }
        catch { /* proceed without live data */ }
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
            let headlines = [];
            if (cachedNews.length > 0) {
                headlines = cachedNews.slice(0, 12).map((n) => `- ${n.title}`);
            }
            else {
                const [indiaRes, globalRes] = await Promise.allSettled([
                    axios_1.default.get('https://www.livemint.com/rss/markets', { timeout: 7000 }),
                    axios_1.default.get('https://www.livemint.com/rss/companies', { timeout: 7000 }),
                ]);
                const raw = [];
                if (indiaRes.status === 'fulfilled')
                    raw.push(...parseFastXML(indiaRes.value.data).slice(0, 8));
                if (globalRes.status === 'fulfilled')
                    raw.push(...parseFastXML(globalRes.value.data).slice(0, 6));
                headlines = raw.map(n => `- ${n.title}`);
            }
            if (headlines.length > 0) {
                newsContext = `
Today's Live Market Headlines (from LiveMint — use these for any news/market questions):
${headlines.join('\n')}
`;
            }
        }
        catch { /* proceed without news */ }
    }
    // Always inject current date/time so Groq knows it's not 2024
    const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });
    const topSetups = lastScan?.setups?.slice(0, 5).map(s => `${s.ticker} (${s.setupType}, Conf:${s.confidenceScore}/10, Signal:${s.aiSignal})`).join(', ') || 'No recent scan on record.';
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
        const reply = await (0, claudeClient_1.claudeAsk)(systemPrompt, message, { maxTokens: 350, temperature: 0.5 });
        res.json({ success: true, reply, stockCard: stockCardData });
    }
    catch (error) {
        const errMsg = error?.message ?? 'Unknown error';
        console.error('[Chat API] Claude error:', errMsg);
        // Check if it's a key config issue
        if (errMsg.includes('ANTHROPIC_API_KEY')) {
            res.status(503).json({
                success: false,
                reply: '⚠️ ' + errMsg,
                stockCard: null,
            });
        }
        else {
            res.status(500).json({
                success: false,
                reply: `⚠️ AI error: ${errMsg}. Please try again.`,
                stockCard: null,
            });
        }
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
// ——————————————————————————————————————————
// CRON JOBS
// ——————————————————————————————————————————
// ── Pre-Market Watchlist at 8:45 AM IST (before NSE opens at 9:15 AM) ─────────
node_cron_1.default.schedule('45 8 * * 1-5', async () => {
    console.log('\n[CRON] 🔔 Pre-market scan triggered at 8:45 AM IST');
    try {
        const { qualified, marketStatus } = await (0, scanner_1.runScanner)(tradingApi);
        let setups = await (0, scanner_1.buildTradeSetups)(qualified);
        // Filter: Only HIGH-QUALITY setups for the email (Confidence >= 7, BUY or WATCH signal)
        const alertSetups = setups.filter(s => s.confidenceScore >= 7 && (s.aiSignal === 'BUY' || s.aiSignal === 'WATCH'));
        lastScan = {
            timestamp: new Date().toISOString(),
            marketStatus,
            setups,
        };
        // Send email alert with filtered high-quality setups
        await (0, alerter_1.sendPreMarketAlert)(alertSetups);
        console.log(`[CRON] Pre-market scan complete: ${setups.length} total, ${alertSetups.length} high-quality alerts sent`);
    }
    catch (err) {
        console.error('[CRON] Pre-market scan failed:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });
// Run scanner every day at 9:20 AM IST (NSE opens 9:15 AM)
node_cron_1.default.schedule('20 9 * * 1-5', async () => {
    console.log('\n[CRON] Morning scan triggered at 9:20 AM IST');
    const { qualified, marketStatus } = await (0, scanner_1.runScanner)(tradingApi);
    const setups = await (0, scanner_1.buildTradeSetups)(qualified);
    lastScan = {
        timestamp: new Date().toISOString(),
        marketStatus,
        setups,
    };
}, { timezone: 'Asia/Kolkata' });
// Run End-of-Day (EOD) scanner at 3:45 PM IST (Market closes 3:30 PM)
node_cron_1.default.schedule('45 15 * * 1-5', async () => {
    console.log('\n[CRON] EOD Scan triggered at 3:45 PM IST');
    const { qualified, marketStatus } = await (0, scanner_1.runScanner)(tradingApi);
    const setups = await (0, scanner_1.buildTradeSetups)(qualified);
    lastScan = {
        timestamp: new Date().toISOString(),
        marketStatus,
        setups,
    };
    // Background: pre-warm fundamentals for all qualified tickers
    const scanTickers = setups.map(s => s.ticker);
    if (scanTickers.length) {
        setImmediate(() => (0, fundamentalService_1.batchPrefetch)(scanTickers).catch(() => { }));
    }
}, { timezone: 'Asia/Kolkata' });
// ══════════════════════════════════════════════════════
// AGENTIC AI — Event System & SSE Routes
// ══════════════════════════════════════════════════════
// GET /api/agent/status — Current AI agent status
app.get('/api/agent/status', (_req, res) => {
    res.json({ success: true, data: (0, agentEvents_1.getAgentStatus)() });
});
// GET /api/agent/events — Get recent events
app.get('/api/agent/events', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const unreadOnly = req.query.unread === 'true';
    res.json({ success: true, data: (0, agentEvents_1.getEvents)(limit, unreadOnly), unreadCount: (0, agentEvents_1.getUnreadCount)() });
});
// POST /api/agent/events/read — Mark events as read
app.post('/api/agent/events/read', (req, res) => {
    const { eventId } = req.body || {};
    if (eventId)
        (0, agentEvents_1.markRead)(eventId);
    else
        (0, agentEvents_1.markAllRead)();
    res.json({ success: true, unreadCount: (0, agentEvents_1.getUnreadCount)() });
});
// GET /api/agent/stream — SSE real-time event stream
app.get('/api/agent/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    (0, agentEvents_1.addSSEClient)(res);
    req.on('close', () => (0, agentEvents_1.removeSSEClient)(res));
});
// GET /api/sectors — Live sector performance data
let sectorCache = null;
const SECTOR_TTL = 10 * 60 * 1000; // 10 min
const SECTOR_ETFS = {
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
app.get('/api/sectors', async (_req, res) => {
    if (sectorCache && Date.now() - sectorCache.ts < SECTOR_TTL) {
        return res.json({ success: true, data: sectorCache.data });
    }
    try {
        const results = await Promise.allSettled(Object.entries(SECTOR_ETFS).map(async ([name, symbol]) => {
            const candles = await (0, dataService_1.fetchHistoricalData)(symbol, 10);
            if (candles.length >= 2) {
                const prev = candles[candles.length - 2].close;
                const curr = candles[candles.length - 1].close;
                return { n: name.replace('Nifty ', ''), v: +((curr - prev) / prev * 100).toFixed(2) };
            }
            return { n: name.replace('Nifty ', ''), v: 0 };
        }));
        const sectors = results
            .filter((r) => r.status === 'fulfilled')
            .map(r => r.value);
        sectorCache = { data: { sectors, fetchedAt: new Date().toISOString() }, ts: Date.now() };
        res.json({ success: true, data: sectorCache.data });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// Daily Performance Tracking Job (Run at 16:00 IST / 10:30 UTC)
node_cron_1.default.schedule('30 10 * * 1-5', () => {
    (0, performanceJob_1.updatePerformanceRecords)();
});
// Start Level-1000 Autonomous Scanner Agent
(0, autoScannerJob_1.initAutoScanner)();
// ——————————————————————————————————————————
// START
// SPA fallback — must be after all API routes so React Router handles all non-API paths
if (process.env.NODE_ENV === 'production') {
    app.get('*', (_req, res) => {
        res.sendFile(path_1.default.join(FRONTEND_DIST, 'index.html'));
    });
}
// Compute next scheduled scan time
function computeNextScan() {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const h = ist.getHours();
    if (h < 9 || (h === 9 && ist.getMinutes() < 20)) {
        ist.setHours(9, 20, 0, 0);
    }
    else if (h < 15 || (h === 15 && ist.getMinutes() < 45)) {
        ist.setHours(15, 45, 0, 0);
    }
    else {
        ist.setDate(ist.getDate() + 1);
        ist.setHours(9, 20, 0, 0);
    }
    return ist.toISOString();
}
(0, agentEvents_1.setNextScan)(computeNextScan());
// ——————————————————————————————————————————
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║   🧠  StockSage AI — Agentic Trading Assistant        ║');
    console.log('║   India\'s AI Stock Research Companion                 ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║   Dashboard : http://localhost:${PORT}                  ║`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log('║   POST /api/chat           — AI Chatbot               ║');
    console.log('║   GET  /api/scan           — Run stock scanner        ║');
    console.log('║   GET  /api/agent/stream   — SSE live event stream    ║');
    console.log('║   GET  /api/agent/status   — Agent status             ║');
    console.log('║   GET  /api/sectors        — Live sector data         ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
    (0, agentEvents_1.pushEvent)('SYSTEM', 'success', 'Server Started', `StockSage AI agent running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map