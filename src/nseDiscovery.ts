// ================================================================
// nseDiscovery.ts — Dynamic NSE Universe · Zero Hardcoding
// ================================================================
// Every trading day NSE publishes a free public Bhavcopy CSV with
// OHLCV for EVERY listed stock. We download it, parse it, and use
// it as the live universe — no static list anywhere.
// ================================================================

import axios from 'axios';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

export interface BhavRecord {
    symbol: string;         // NSE symbol e.g. DALMIASUG
    yahooTicker: string;    // Yahoo Finance ticker e.g. DALMIASUG.NS
    open: number;
    high: number;
    low: number;
    close: number;
    prevClose: number;
    pctChange: number;
    totalVolQty: number;    // shares traded
    totalTradValCr: number; // daily turnover in crores
    totalTrades: number;    // number of trades (best liquidity proxy)
    isin: string;
}

// ── URL builder ──────────────────────────────────────────────────
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function bhavUrl(date: Date): string {
    const d = String(date.getDate()).padStart(2, '0');
    const m = MONTHS[date.getMonth()];
    const y = date.getFullYear();
    return `https://archives.nseindia.com/content/historical/EQUITIES/${y}/${m}/cm${d}${m}${y}bhav.csv.zip`;
}

// ── Download + unzip ─────────────────────────────────────────────
async function downloadCsv(date: Date): Promise<string> {
    const { data } = await axios.get(bhavUrl(date), {
        responseType: 'arraybuffer',
        timeout: 30_000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': '*/*',
            'Referer': 'https://www.nseindia.com/',
        },
    });
    const unzipped = await gunzip(Buffer.from(data));
    return unzipped.toString('utf-8');
}

// ── Parse bhavcopy CSV ───────────────────────────────────────────
function parseCsv(csv: string): BhavRecord[] {
    const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const col = (name: string) => headers.indexOf(name);

    const iSymbol  = col('SYMBOL');
    const iSeries  = col('SERIES');
    const iOpen    = col('OPEN');
    const iHigh    = col('HIGH');
    const iLow     = col('LOW');
    const iClose   = col('CLOSE');
    const iPrev    = col('PREVCLOSE');
    const iQty     = col('TOTTRDQTY');
    const iVal     = col('TOTTRDVAL');
    const iTrades  = col('TOTALTRADES');
    const iIsin    = col('ISIN');

    const records: BhavRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 8) continue;

        // Only equity series — skip BE, SM, BT, etc.
        const series = iSeries >= 0 ? cols[iSeries]?.trim() : '';
        if (series !== 'EQ') continue;

        const symbol = cols[iSymbol]?.trim() ?? '';
        if (!symbol) continue;

        const close    = parseFloat(cols[iClose]  ?? '0') || 0;
        const prevClose = parseFloat(cols[iPrev]  ?? '0') || 0;
        const totalVal  = parseFloat(cols[iVal]   ?? '0') || 0;
        const pctChange = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;

        records.push({
            symbol,
            yahooTicker:    `${symbol}.NS`,
            open:           parseFloat(cols[iOpen]   ?? '0') || 0,
            high:           parseFloat(cols[iHigh]   ?? '0') || 0,
            low:            parseFloat(cols[iLow]    ?? '0') || 0,
            close,
            prevClose,
            totalVolQty:    parseInt(cols[iQty]    ?? '0', 10) || 0,
            totalTradValCr: +(totalVal / 1e7).toFixed(2),  // paise → crores
            totalTrades:    parseInt(cols[iTrades] ?? '0', 10) || 0,
            isin:           iIsin >= 0 ? (cols[iIsin]?.trim() ?? '') : '',
            pctChange:      +pctChange.toFixed(2),
        });
    }

    return records;
}

// ── In-memory cache (avoids re-downloading on every scan) ────────
let _cache: { records: BhavRecord[]; timestamp: number; dateLabel: string } | null = null;

async function fetchLatestBhavcopy(): Promise<BhavRecord[]> {
    // Legacy Bhavcopy scraper bypassed in favor of Zerodha & Yahoo Finance APIs
    return [];
}

// ── Public: raw bhavcopy with cache ─────────────────────────────
export async function getNseBhavcopy(): Promise<BhavRecord[]> {
    const now = Date.now();
    // Refresh every 4 hours (bhavcopy publishes once per day after 6:30pm IST)
    if (_cache && now - _cache.timestamp < 4 * 60 * 60 * 1000) {
        return _cache.records;
    }

    const records = await fetchLatestBhavcopy();
    if (records.length > 0) {
        const today = new Date().toDateString();
        _cache = { records, timestamp: now, dateLabel: today };
    }
    return _cache?.records ?? [];
}

// ── Public: full liquid equity universe from bhavcopy ────────────
// No hardcoded stocks. Every NSE-listed EQ-series stock that clears
// basic liquidity thresholds is included automatically.
export async function getDynamicUniverse(options: {
    minClose?: number;
    minTurnoverCr?: number;
    minTrades?: number;
} = {}): Promise<BhavRecord[]> {
    const {
        minClose      = 20,    // ₹20 minimum price
        minTurnoverCr = 2,     // ₹2 Cr minimum daily turnover
        minTrades     = 300,   // at least 300 trades (not just a few block deals)
    } = options;

    const all = await getNseBhavcopy();
    return all.filter(r =>
        r.close      >= minClose       &&
        r.totalTradValCr >= minTurnoverCr &&
        r.totalTrades    >= minTrades
    );
}

// ── Public: momentum pre-screen ──────────────────────────────────
// Returns top N stocks ranked by a composite score of:
//   - recent % gain
//   - volume intensity relative to market
//   - green candle (close > prevClose)
// This is used to limit expensive Yahoo Finance API calls to only
// the most promising candidates, while still covering the full NSE.
export async function getMomentumCandidates(limit = 250): Promise<BhavRecord[]> {
    const universe = await getDynamicUniverse({
        minClose: 20,
        minTurnoverCr: 3,
        minTrades: 500,
    });

    if (!universe.length) return [];

    const maxVal = Math.max(...universe.map(r => r.totalTradValCr), 1);

    const scored = universe.map(r => ({
        ...r,
        _score:
            Math.max(0, r.pctChange) * 0.45 +                    // price momentum
            (r.totalTradValCr / maxVal) * 100 * 0.35 +           // volume intensity
            (r.close > r.prevClose ? 0.15 : 0) +                 // trending green
            (r.totalTrades > 5000 ? 0.05 : 0),                   // institution-level activity
    }));

    scored.sort((a, b) => b._score - a._score);
    return scored.slice(0, limit);
}

// ── Public: top gainers for alerts / diagnostics ─────────────────
export async function getTopGainersToday(minPct = 3, limit = 50): Promise<BhavRecord[]> {
    const universe = await getDynamicUniverse({ minTurnoverCr: 2 });
    return universe
        .filter(r => r.pctChange >= minPct)
        .sort((a, b) => b.pctChange - a.pctChange)
        .slice(0, limit);
}

// ── Public: check if bhavcopy is loaded (for health endpoints) ───
export function getBhavcopyCacheStatus(): { loaded: boolean; symbolCount: number; dateLabel: string | null } {
    return {
        loaded:      !!_cache && _cache.records.length > 0,
        symbolCount: _cache?.records.length ?? 0,
        dateLabel:   _cache?.dateLabel ?? null,
    };
}
