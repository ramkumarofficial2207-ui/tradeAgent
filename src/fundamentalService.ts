// =====================================================
// fundamentalService.ts — Independent Data Service
// Sources: NSE India API (price/PE) + Screener.in HTML
// (fetched silently server-side, not exposed in UI)
// =====================================================

import axios from 'axios';
import { fetchHistoricalData, NSE_UNIVERSE, SECTOR_MAP } from './dataService';
import { computeIndicators } from './indicators';

// ── Types ─────────────────────────────────────────────
export interface QuarterlyResult {
    period: string;
    salesCr: number;
    profitCr: number;
    opmPct: number | null;
}

export interface AnnualResult {
    year: string;
    salesCr: number;
    profitCr: number;
    epsDiluted: number | null;
}

export interface StockReport {
    ticker: string;
    sector: string;
    companyName: string;
    // Price
    currentPrice: number;
    dayChange: number;
    dayChangePct: number;
    high52w: number;
    low52w: number;
    // Valuation (NSE + Screener)
    peRatio: number | null;
    industryPe: number | null;
    pbRatio: number | null;
    marketCapCr: number | null;
    dividendYield: number | null;
    eps: number | null;
    bookValue: number | null;
    faceValue: number | null;
    // Quality (Screener)
    roe: number | null;
    roce: number | null;
    debtToEquity: number | null;
    currentRatio: number | null;
    promoterHolding: number | null;
    // Technical (our engine)
    rsi14: number | null;
    dma200: number | null;
    ema50: number | null;
    ema20: number | null;
    avgVolume20d: number | null;
    volumeRatio: number | null;
    returns1m: number | null;
    returns3m: number | null;
    nifty3mReturn: number | null;
    outperformsNifty: boolean;
    aboveDma200: boolean;
    aboveEma50: boolean;
    distFromDma200Pct: number | null;
    distFromEma50Pct: number | null;
    // Setup (from scanner)
    hasSetup: boolean;
    setupType: string | null;
    buyZone: number | null;
    target: number | null;
    stopLoss: number | null;
    riskReward: number | null;
    confidenceScore: number | null;
    // Financials
    quarterlyResults: QuarterlyResult[];
    annualResults: AnnualResult[];
    fetchedAt: string;
}

// ── Cache ─────────────────────────────────────────────
const CACHE = new Map<string, { data: StockReport; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30min

/** Call this to force a fresh fetch for a specific ticker on next request */
export function clearStockCache(ticker: string): void {
    CACHE.delete(ticker.toUpperCase());
    console.log(`[Cache] Cleared cache for ${ticker}`);
}


// ── Session cookies ───────────────────────────────────
let _nseCookie = ''; let _nseTs = 0;
let _scrCookie = ''; let _scrTs = 0;

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function nseCookie(): Promise<string> {
    if (_nseCookie && Date.now() - _nseTs < 20 * 60 * 1000) return _nseCookie;
    try {
        const r = await axios.get('https://www.nseindia.com/', {
            headers: { 'User-Agent': CHROME_UA },
            timeout: 12000,
        });
        _nseCookie = (r.headers['set-cookie'] ?? []).map((c: string) => c.split(';')[0]).join('; ');
        _nseTs = Date.now();
    } catch (e: any) { console.warn('[NSE] cookie:', e.message); }
    return _nseCookie;
}

async function scrCookie(): Promise<string> {
    // Prefer the manually-set session from .env (gives fresh data)
    const envSession = process.env.SCREENER_SESSION;
    if (envSession && envSession !== 'paste_your_sessionid_value_here') {
        return `sessionid=${envSession}`;
    }
    // Fallback: dynamic anonymous cookie (may return older data)
    if (_scrCookie && Date.now() - _scrTs < 50 * 60 * 1000) return _scrCookie;
    try {
        const r = await axios.get('https://www.screener.in/', {
            headers: { 'User-Agent': CHROME_UA, 'Accept': 'text/html' },
            timeout: 12000,
        });
        _scrCookie = (r.headers['set-cookie'] ?? []).map((c: string) => c.split(';')[0]).join('; ');
        _scrTs = Date.now();
    } catch (e: any) { console.warn('[SCR] cookie:', e.message); }
    return _scrCookie;
}

// ── NSE: price, P/E, 52W ─────────────────────────────
async function fetchNSE(symbol: string) {
    const cookie = await nseCookie();
    try {
        const { data } = await axios.get(
            `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
            { headers: { 'User-Agent': CHROME_UA, 'Accept': 'application/json', 'Referer': 'https://www.nseindia.com/', 'Cookie': cookie }, timeout: 10000 }
        );
        const pi = data?.priceInfo ?? {}, md = data?.metadata ?? {}, inf = data?.info ?? {};
        const last = Number(pi.lastPrice ?? 0);
        const prev = Number(pi.previousClose ?? last);
        return {
            companyName: inf.companyName ?? symbol,
            currentPrice: last,
            dayChange: +(last - prev).toFixed(2),
            dayChangePct: prev > 0 ? +((last - prev) / prev * 100).toFixed(2) : 0,
            high52w: Number(pi.weekHighLow?.max ?? 0),
            low52w: Number(pi.weekHighLow?.min ?? 0),
            peRatio: Number(md.pdSymbolPe) || null,
            industryPe: Number(md.pdSectorPe) || null,
        };
    } catch (e: any) { console.warn(`[NSE] ${symbol}: ${e?.response?.status ?? e.message}`); return null; }
}

// ── Screener.in: fundamentals + financials ────────────
function parseRatio(html: string, label: string): number | null {
    // Targets <span class="name">Label</span> … <span class="number">Value</span>
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${esc}[\\s\\S]{0,300}?<span[^>]*number[^>]*>([\\d,. ]+)`, 'i');
    const m = html.match(re);
    if (!m) return null;
    const n = parseFloat(m[1].replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : null;
}

function parseTable(html: string, sectionId: string): { headers: string[]; rows: Record<string, string>[] } {
    // Find the section by id
    const secRe = new RegExp(`id="${sectionId}"[\\s\\S]*?<table[\\s\\S]*?<\\/table>`, 'i');
    const block = html.match(secRe)?.[0] ?? '';
    if (!block) return { headers: [], rows: [] };

    // Parse headers
    const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    const headers: string[] = [];
    let m;
    while ((m = thRe.exec(block)) !== null) {
        headers.push(m[1].replace(/<[^>]+>/g, '').trim());
    }

    // Parse rows
    const rows: Record<string, string>[] = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    while ((m = trRe.exec(block)) !== null) {
        const cells: string[] = [];
        const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let cm;
        while ((cm = tdRe.exec(m[1])) !== null) {
            cells.push(cm[1].replace(/<[^>]+>/g, '').replace(/&nbsp;|&amp;/g, ' ').trim());
        }
        if (cells.length >= 2) {
            const row: Record<string, string> = {};
            headers.forEach((h, i) => { if (cells[i] !== undefined) row[h] = cells[i]; });
            if (Object.keys(row).length > 1) rows.push(row);
        }
    }
    return { headers, rows };
}

function toCr(s: string): number {
    const n = parseFloat(s.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
}

// ── Screener.in: Fundamentals + P&L ────────────────────────────────────
// Using session cookies from .env to bypass generic HTML cache
async function fetchScreener(symbol: string) {
    const cookie = await scrCookie();
    const urls = [
        `https://www.screener.in/company/${encodeURIComponent(symbol)}/consolidated/`,
        `https://www.screener.in/company/${encodeURIComponent(symbol)}/`,
    ];

    let html = '';
    for (const url of urls) {
        try {
            const { data } = await axios.get(url, {
                headers: {
                    'User-Agent': CHROME_UA,
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.screener.in/',
                    'Cookie': cookie,
                },
                timeout: 15000,
            });
            // If redirected to login page, skip
            if (typeof data === 'string' && data.length > 5000 && !data.includes('login?next=')) {
                html = data; break;
            }
        } catch (e: any) { console.warn(`[SCR] ${url}: ${e?.message ?? e}`); }
    }
    if (!html) return null;

    // ── Key ratios ──
    const mcap = parseRatio(html, 'Market Cap');
    const pe = parseRatio(html, 'Stock P/E');
    const pb = parseRatio(html, 'Price to Book');
    const dy = parseRatio(html, 'Dividend Yield');
    const roe = parseRatio(html, 'Return on equity');
    const roce = parseRatio(html, 'ROCE');
    const d2e = parseRatio(html, 'Debt to equity');
    const cr = parseRatio(html, 'Current ratio');
    const bv = parseRatio(html, 'Book Value');
    const fv = parseRatio(html, 'Face Value');
    const eps = parseRatio(html, 'EPS in Rs');

    // Promoter holding from shareholding section
    const proRe = /Promoters[^\d]*?([\d.]+)%/i;
    const proM = html.match(proRe);
    const promoterHolding = proM ? parseFloat(proM[1]) : null;

    // ── Quarterly results ──
    const { headers: qHdr, rows: qRows } = parseTable(html, 'quarters');
    const salesQ = qRows.find(r => /^sales/i.test(Object.values(r)[0] ?? ''));
    const profQ = qRows.find(r => /net profit/i.test(Object.values(r)[0] ?? ''));
    const opmQ = qRows.find(r => /opm\s*%/i.test(Object.values(r)[0] ?? ''));

    // THE FIX: Screener lists oldest→newest left-to-right. Take last 5 (most recent). Ignore TTM.
    const periods = qHdr.slice(1).filter(h => Boolean(h) && !/^ttm$/i.test(h.trim()));
    const quarterlyResults: QuarterlyResult[] = periods.map(p => ({
        period: p,
        salesCr: toCr(salesQ?.[p] ?? '0'),
        profitCr: toCr(profQ?.[p] ?? '0'),
        opmPct: opmQ?.[p] ? parseFloat(opmQ[p]) : null,
    })).filter(q => q.salesCr > 0 || q.profitCr !== 0).slice(-5); // ← last 5 = most recent

    // ── Annual P&L ──
    const { headers: aHdr, rows: aRows } = parseTable(html, 'profit-loss');
    const salesA = aRows.find(r => /^sales/i.test(Object.values(r)[0] ?? ''));
    const profA = aRows.find(r => /net profit/i.test(Object.values(r)[0] ?? ''));
    const epsA = aRows.find(r => /^eps/i.test(Object.values(r)[0] ?? ''));

    const years = aHdr.slice(1).filter(h => Boolean(h) && !/^ttm$/i.test(h.trim()));
    const annualResults: AnnualResult[] = years.map(y => ({
        year: y,
        salesCr: toCr(salesA?.[y] ?? '0'),
        profitCr: toCr(profA?.[y] ?? '0'),
        epsDiluted: epsA?.[y] ? parseFloat(epsA[y]) : null,
    })).filter(a => a.salesCr > 0 || a.profitCr !== 0).slice(-5); // ← last 5 = most recent

    console.log(`[SCR] ✓ ${symbol} | mcap=₹${mcap}Cr | ROE=${roe}% | Q=${quarterlyResults.length} qtrs | A=${annualResults.length} yrs`);

    return { mcap, pe, pb, dy, roe, roce, d2e, cr, bv, fv, eps, promoterHolding, quarterlyResults, annualResults };
}






// ── Main ──────────────────────────────────────────────
export async function fetchStockReport(ticker: string, niftyCandles?: any[]): Promise<StockReport | null> {
    const now = Date.now();
    const hit = CACHE.get(ticker);
    if (hit && now - hit.ts < CACHE_TTL) return hit.data;

    console.log(`[Report] Fetching ${ticker}…`);
    const yahoo = NSE_UNIVERSE[ticker] ?? `${ticker}.NS`;

    // All three in parallel for speed:
    // - NSE: live LTP, P/E, 52W data
    // - Screener: rich fundamentals + quarterly/annual P&L
    // - Yahoo Candles: OHLCV for technical indicators
    const [nseRes, finRes, candleRes] = await Promise.allSettled([
        fetchNSE(ticker),
        fetchScreener(ticker),
        fetchHistoricalData(yahoo, 300),
    ]);

    const nse = nseRes.status === 'fulfilled' ? nseRes.value : null;
    const scr = finRes.status === 'fulfilled' ? finRes.value : null;
    const candles = candleRes.status === 'fulfilled' ? candleRes.value : [];

    if (!nse && !scr && !candles.length) {
        console.error(`[Report] No data for ${ticker}`);
        return null;
    }


    // ── Technical indicators ──
    const tech = candles.length >= 60
        ? computeIndicators(ticker, candles, niftyCandles ?? [])
        : null;

    const ltp = nse?.currentPrice ?? tech?.ltp ?? 0;
    const dist200 = tech?.dma200 ? +(((ltp - tech.dma200) / tech.dma200) * 100).toFixed(2) : null;
    const dist50 = tech?.ema50 ? +(((ltp - tech.ema50) / tech.ema50) * 100).toFixed(2) : null;
    let ret1m: number | null = null;
    if (candles.length >= 22) {
        const p = candles[candles.length - 22]?.close;
        if (p) ret1m = +(((ltp - p) / p) * 100).toFixed(2);
    }

    const result: StockReport = {
        ticker,
        sector: SECTOR_MAP[ticker] ?? 'Diversified',
        companyName: nse?.companyName ?? ticker,
        currentPrice: ltp,
        dayChange: nse?.dayChange ?? 0,
        dayChangePct: nse?.dayChangePct ?? 0,
        high52w: nse?.high52w ?? 0,
        low52w: nse?.low52w ?? 0,
        // Valuation — NSE fallback → Screener
        peRatio: nse?.peRatio ?? scr?.pe ?? null,
        industryPe: nse?.industryPe ?? null,
        pbRatio: scr?.pb ?? null,
        marketCapCr: scr?.mcap ?? null,
        dividendYield: scr?.dy ?? null,
        eps: scr?.eps ?? null,
        bookValue: scr?.bv ?? null,
        faceValue: scr?.fv ?? null,
        // Quality
        roe: scr?.roe ?? null,
        roce: scr?.roce ?? null,
        debtToEquity: scr?.d2e ?? null,
        currentRatio: scr?.cr ?? null,
        promoterHolding: scr?.promoterHolding ?? null,
        // Technical
        rsi14: tech ? +tech.rsi14.toFixed(1) : null,
        dma200: tech ? +tech.dma200.toFixed(2) : null,
        ema50: tech ? +tech.ema50.toFixed(2) : null,
        ema20: tech ? +tech.ema20.toFixed(2) : null,
        avgVolume20d: tech ? Math.round(tech.avgVolume20d) : null,
        volumeRatio: tech ? +tech.volumeRatio.toFixed(2) : null,
        returns1m: ret1m,
        returns3m: tech ? +tech.returns3m.toFixed(2) : null,
        nifty3mReturn: tech ? +tech.nifty3mReturn.toFixed(2) : null,
        outperformsNifty: tech?.outperformsNifty ?? false,
        aboveDma200: tech ? ltp > tech.dma200 : false,
        aboveEma50: tech ? ltp > tech.ema50 : false,
        distFromDma200Pct: dist200,
        distFromEma50Pct: dist50,
        // Setup (populated from scanner externally)
        hasSetup: false, setupType: null, buyZone: null,
        target: null, stopLoss: null, riskReward: null, confidenceScore: null,
        // Financials from Screener
        quarterlyResults: scr?.quarterlyResults ?? [],
        annualResults: scr?.annualResults ?? [],
        fetchedAt: new Date().toISOString(),
    };

    CACHE.set(ticker, { data: result, ts: now });
    console.log(`[Report] ✓ ${ticker} | ₹${ltp} | P/E=${result.peRatio} | ROE=${result.roe}% | RSI=${result.rsi14}`);
    return result;
}

// ── Fundamental Grade (A/B/C/D) ──────────────────────
// Used to enrich scanner trade cards without exposing data source
export interface FundamentalGrade {
    grade: 'A' | 'B' | 'C' | 'D' | '—';
    score: number;   // 0–10
    peOk: boolean;  // P/E below industry or < 30
    roeOk: boolean;  // ROE >= 12%
    debtOk: boolean;  // D/E <= 1
    promoOk: boolean;  // Promoter >= 40%
    summary: string;   // one-line reason
}

export function getFundamentalGrade(r: StockReport): FundamentalGrade {
    if (!r) return { grade: '—', score: 0, peOk: false, roeOk: false, debtOk: false, promoOk: false, summary: 'No data' };

    const peOk = r.peRatio != null && r.industryPe != null
        ? r.peRatio <= r.industryPe * 1.1          // within 10% of industry
        : r.peRatio != null ? r.peRatio < 35 : false;
    const roeOk = (r.roe ?? 0) >= 12;
    const debtOk = r.debtToEquity == null || r.debtToEquity <= 1;
    const promoOk = r.promoterHolding == null || r.promoterHolding >= 40;

    const pts = [peOk, roeOk, debtOk, promoOk].filter(Boolean).length;
    const score = Math.round((pts / 4) * 10);

    const grade: 'A' | 'B' | 'C' | 'D' = pts === 4 ? 'A' : pts === 3 ? 'B' : pts === 2 ? 'C' : 'D';

    const issues: string[] = [];
    if (!peOk) issues.push(`P/E ${r.peRatio?.toFixed(1)} > industry`);
    if (!roeOk) issues.push(`ROE ${r.roe?.toFixed(1)}% low`);
    if (!debtOk) issues.push(`D/E ${r.debtToEquity?.toFixed(2)} high`);
    if (!promoOk) issues.push(`Promoter ${r.promoterHolding?.toFixed(1)}% low`);

    const summary = issues.length === 0
        ? 'Fundamentally strong across all key metrics'
        : issues.join(' · ');

    return { grade, score, peOk, roeOk, debtOk, promoOk, summary };
}

// ── Batch pre-warm (call after scanner run) ──────────
// Silently fetches fundamentals for a list of tickers in background.
// Throttled to avoid hammering APIs.
export async function batchPrefetch(tickers: string[], niftyCandles?: any[]): Promise<void> {
    const now = Date.now();
    const toFetch = tickers.filter(t => {
        const hit = CACHE.get(t);
        return !hit || now - hit.ts >= CACHE_TTL;
    });
    if (!toFetch.length) return;

    console.log(`[Prefetch] Warming fundamentals for: ${toFetch.join(', ')}`);
    // Fetch 2 at a time to be gentle on APIs
    for (let i = 0; i < toFetch.length; i += 2) {
        const batch = toFetch.slice(i, i + 2);
        await Promise.allSettled(batch.map(t => fetchStockReport(t, niftyCandles)));
        await new Promise(r => setTimeout(r, 1500)); // 1.5s gap between batches
    }
}

export function getUniverseList(): Array<{ ticker: string; sector: string }> {
    return Object.keys(NSE_UNIVERSE).map(ticker => ({
        ticker,
        sector: SECTOR_MAP[ticker] ?? 'Diversified',
    }));
}
