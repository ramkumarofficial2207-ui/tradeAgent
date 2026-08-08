// =====================================================
// liveMarket.ts — Real-time live price streaming service
// Provides:
//   - Live LTPs for tracked stocks (from Dhan /marketfeed/ltp)
//   - Live Nifty / BankNifty / Sensex / India VIX (from Yahoo Finance quotes)
//   - High-Frequency Tick Streaming Engine with Green/Red directional pulses
//   - Market hours detection (IST 9:15 AM – 3:30 PM, Mon–Fri)
// =====================================================

import axios from 'axios';
import { getDhanApiFromEnv } from './dhanClient';

// ── Market Hours ─────────────────────────────────────────────────────
export function getISTTime(): { hours: number; minutes: number; day: number } {
    const now = new Date();
    // IST = UTC + 5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    return {
        hours: ist.getUTCHours(),
        minutes: ist.getUTCMinutes(),
        day: ist.getUTCDay(), // 0=Sun, 6=Sat
    };
}

export function isMarketOpen(): boolean {
    const { hours, minutes, day } = getISTTime();
    if (day === 0 || day === 6) return false; // Weekend
    const totalMinutes = hours * 60 + minutes;
    const open  = 9 * 60 + 15;  // 9:15 AM IST
    const close = 15 * 60 + 30; // 3:30 PM IST
    return totalMinutes >= open && totalMinutes <= close;
}

export function getMarketStatus(): {
    isOpen: boolean;
    label: string;
    nextEvent: string;
    pollIntervalMs: number;
} {
    const { hours, minutes, day } = getISTTime();
    const totalMinutes = hours * 60 + minutes;
    const open  = 9 * 60 + 15;
    const close = 15 * 60 + 30;
    const open_pre = 9 * 60;     // 9:00 AM pre-open
    const isWeekend = day === 0 || day === 6;

    if (isWeekend) {
        return { isOpen: false, label: 'Closed (Weekend)', nextEvent: 'Opens Monday 9:15 AM IST', pollIntervalMs: 60000 };
    }
    if (totalMinutes < open_pre) {
        const remaining = open - totalMinutes;
        return { isOpen: false, label: 'Pre-Market', nextEvent: `Opens in ${Math.floor(remaining / 60)}h ${remaining % 60}m`, pollIntervalMs: 30000 };
    }
    if (totalMinutes >= open_pre && totalMinutes < open) {
        return { isOpen: false, label: 'Pre-Open (9:00–9:15)', nextEvent: 'Opens in a few minutes', pollIntervalMs: 10000 };
    }
    if (totalMinutes >= open && totalMinutes <= close) {
        const remaining = close - totalMinutes;
        return { isOpen: true, label: 'Open 🟢', nextEvent: `Closes in ${Math.floor(remaining / 60)}h ${remaining % 60}m`, pollIntervalMs: 1500 };
    }
    return { isOpen: false, label: 'Closed (After Hours)', nextEvent: 'Opens tomorrow 9:15 AM IST', pollIntervalMs: 60000 };
}

// ── Live Index Quotes via Yahoo Finance ──────────────────────────────
let indexCache: {
    nifty: number; bankNifty: number; sensex: number; indiaVix: number;
    change: { nifty: number; bankNifty: number; sensex: number; indiaVix: number };
    fetchedAt: number;
} | null = null;

export async function getLiveIndexPrices(): Promise<{
    nifty: number; bankNifty: number; sensex: number; indiaVix: number;
    change: { nifty: number; bankNifty: number; sensex: number; indiaVix: number };
    fetchedAt: string;
    source: string;
}> {
    const fetchIndexClose = async (symbol: string): Promise<{ price: number; change: number }> => {
        try {
            const end = Math.floor(Date.now() / 1000);
            const start = end - 5 * 86400; // 5 days back to get prev close
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${start}&period2=${end}&interval=1d&includePrePost=false`;
            const { data } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                },
                timeout: 8000,
            });
            const closes: (number | null)[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
            const validCloses = closes.filter((c): c is number => c !== null && c > 0);
            const price = validCloses[validCloses.length - 1] || 0;
            const prevClose = validCloses.length >= 2 ? validCloses[validCloses.length - 2] : price;
            const change = prevClose > 0 ? Number(((price - prevClose) / prevClose * 100).toFixed(2)) : 0;
            return { price, change };
        } catch {
            return { price: 0, change: 0 };
        }
    };

    try {
        const [niftyData, bankNiftyData, sensexData, vixData] = await Promise.all([
            fetchIndexClose('^NSEI'),
            fetchIndexClose('^NSEBANK'),
            fetchIndexClose('^BSESN'),
            fetchIndexClose('^INDIAVIX'),
        ]);

        const primaryPrices = [niftyData.price, bankNiftyData.price, sensexData.price];
        const hasPrimaryData = primaryPrices.some(price => price > 0);
        const hasPrimaryFailure = primaryPrices.some(price => price <= 0);
        const hasCachedData = Boolean(indexCache && [indexCache.nifty, indexCache.bankNifty, indexCache.sensex].some(price => price > 0));
        const result = {
            nifty:     niftyData.price > 0 ? niftyData.price : (indexCache?.nifty || 0),
            bankNifty: bankNiftyData.price > 0 ? bankNiftyData.price : (indexCache?.bankNifty || 0),
            sensex:    sensexData.price > 0 ? sensexData.price : (indexCache?.sensex || 0),
            indiaVix:  vixData.price > 0 ? vixData.price : (indexCache?.indiaVix || 0),
            change: {
                nifty:     niftyData.price > 0 ? niftyData.change : (indexCache?.change.nifty || 0),
                bankNifty: bankNiftyData.price > 0 ? bankNiftyData.change : (indexCache?.change.bankNifty || 0),
                sensex:    sensexData.price > 0 ? sensexData.change : (indexCache?.change.sensex || 0),
                indiaVix:  vixData.price > 0 ? vixData.change : (indexCache?.change.indiaVix || 0),
            },
            fetchedAt: new Date().toISOString(),
            source: !hasPrimaryData && !hasCachedData
                ? 'unavailable'
                : hasPrimaryFailure && hasCachedData
                    ? 'partially-cached'
                    : hasPrimaryFailure
                        ? 'partial-yahoo-market-data'
                        : 'yahoo-market-data',
        };

        if ([result.nifty, result.bankNifty, result.sensex].some(price => price > 0)) {
            indexCache = { ...result, fetchedAt: Date.now() };
        }
        return result;
    } catch (err: any) {
        console.warn('[LiveMarket] Index fetch failed:', err.message);
        return {
            nifty:     indexCache?.nifty || 0,
            bankNifty: indexCache?.bankNifty || 0,
            sensex:    indexCache?.sensex || 0,
            indiaVix:  indexCache?.indiaVix || 0,
            change:    indexCache?.change || { nifty: 0, bankNifty: 0, sensex: 0, indiaVix: 0 },
            fetchedAt: new Date().toISOString(),
            source: indexCache ? 'cached-market-data' : 'unavailable',
        };
    }
}

// ── Live LTPs for a batch of NSE stocks (via Dhan HQ) ───────────────
export async function getLiveLtpBatch(tickers: string[]): Promise<Record<string, number>> {
    try {
        const dhan = getDhanApiFromEnv();
        if (!dhan) {
            return {};
        }
        const result: Record<string, number> = {};
        const batchSize = 10;
        const uniqueTickers = [...new Set(tickers)].slice(0, 50);

        for (let i = 0; i < uniqueTickers.length; i += batchSize) {
            const batch = uniqueTickers.slice(i, i + batchSize);
            const ltpPromises = batch.map(async (ticker) => {
                try {
                    const ltp = await dhan.getLtp(ticker);
                    return [ticker, ltp] as [string, number];
                } catch {
                    return [ticker, 0] as [string, number];
                }
            });
            const settled = await Promise.allSettled(ltpPromises);
            for (const s of settled) {
                if (s.status === 'fulfilled' && s.value[1] > 0) {
                    result[s.value[0]] = s.value[1];
                }
            }
        }
        return result;
    } catch (err: any) {
        console.warn('[LiveMarket] Batch LTP fetch failed:', err.message);
        return {};
    }
}
