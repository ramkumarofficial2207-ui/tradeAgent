// =====================================================
// dhanClient.ts — Dhan HQ API Market Data Client
// Replaces Yahoo Finance as data source
// 30-day token validity — no daily refresh needed!
// Docs: https://dhanhq.co/docs/v2/
// =====================================================

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import { Candle, MarketDataApi, MarketDataInterval } from './types';

const DHAN_BASE_URL = 'https://api.dhan.co/v2';
const DHAN_BASE_URL_SANDBOX = 'https://api.dhan.co/v2';

// Security master cache path (downloaded once daily)
const SECURITY_MASTER_CACHE = path.join(__dirname, '..', '.dhan_securities.json');

interface DhanSecurity {
    SEM_SMST_SECURITY_ID: string;   // Dhan internal security ID
    SEM_TRADING_SYMBOL: string;     // NSE symbol e.g. "RELIANCE"
    SEM_EXCH_INSTRM_TYPE: string;   // "ES" for equity
    SEM_SEGMENT: string;            // "NSE_EQ"
}

// In-memory symbol → securityId map
let securityMap: Map<string, string> | null = null;
let securityMapLoadedAt: number = 0;
const SECURITY_MAP_TTL = 24 * 60 * 60 * 1000; // 24 hours

export class DhanMarketDataApi implements MarketDataApi {
    private readonly clientId: string;
    private readonly accessToken: string;
    private readonly baseUrl: string;

    constructor(clientId: string, accessToken: string, sandbox = false) {
        this.clientId = clientId;
        this.accessToken = accessToken;
        this.baseUrl = sandbox ? DHAN_BASE_URL_SANDBOX : DHAN_BASE_URL;
    }

    private getHeaders() {
        return {
            'access-token': this.accessToken,
            'client-id': this.clientId,
            'Content-Type': 'application/json',
        };
    }

    // ── Load security master from Dhan CDN ───────────────────────────
    private async loadSecurityMap(): Promise<Map<string, string>> {
        const now = Date.now();

        // Return in-memory cache if fresh
        if (securityMap && (now - securityMapLoadedAt) < SECURITY_MAP_TTL) {
            return securityMap;
        }

        // Try loading from disk cache
        if (fs.existsSync(SECURITY_MASTER_CACHE)) {
            try {
                const cached = JSON.parse(fs.readFileSync(SECURITY_MASTER_CACHE, 'utf-8'));
                if (cached.loadedAt && (now - cached.loadedAt) < SECURITY_MAP_TTL) {
                    securityMap = new Map(Object.entries(cached.data));
                    securityMapLoadedAt = cached.loadedAt;
                    console.log(`[Dhan] 📦 Loaded security master from disk cache (${securityMap.size} symbols)`);
                    return securityMap;
                }
            } catch { /* ignore, re-download */ }
        }

        // Download fresh security master from Dhan CDN
        console.log('[Dhan] 📥 Downloading security master from Dhan CDN...');
        try {
            const { data } = await axios.get(
                'https://images.dhan.co/api-data/api-scrip-master.csv',
                { timeout: 30000, responseType: 'text' }
            );

            const lines = (data as string).split('\n');
            const header = lines[0].split(',');
            const idxExch   = header.findIndex(h => h.trim() === 'SEM_EXM_EXCH_ID');
            const idxSeg    = header.findIndex(h => h.trim() === 'SEM_SEGMENT');
            const idxSecId  = header.findIndex(h => h.trim() === 'SEM_SMST_SECURITY_ID');
            const idxSymbol = header.findIndex(h => h.trim() === 'SEM_TRADING_SYMBOL');
            const idxSeries = header.findIndex(h => h.trim() === 'SEM_SERIES');

            const map = new Map<string, string>();
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',');
                if (!cols[idxExch] || !cols[idxSeg]) continue;
                const exch   = cols[idxExch]?.trim();
                const seg    = cols[idxSeg]?.trim();
                const series = cols[idxSeries]?.trim();

                // Only NSE Equity (NSE exchange, E segment, EQ series)
                if (exch === 'NSE' && seg === 'E' && (series === 'EQ' || !series)) {
                    const sym   = cols[idxSymbol]?.trim().toUpperCase();
                    const secId = cols[idxSecId]?.trim();
                    if (sym && secId) map.set(sym, secId);
                }
            }

            securityMap = map;
            securityMapLoadedAt = now;

            // Persist to disk
            fs.writeFileSync(SECURITY_MASTER_CACHE, JSON.stringify({
                loadedAt: now,
                data: Object.fromEntries(map)
            }));

            console.log(`[Dhan] ✅ Security master loaded: ${map.size} NSE equity symbols`);
            return map;
        } catch (e: any) {
            console.error('[Dhan] ❌ Failed to download security master:', e.message);
            throw new Error('Dhan security master unavailable');
        }
    }

    private async getSecurityId(ticker: string): Promise<string> {
        const sym = ticker.replace(/\.NS$/i, '').toUpperCase();
        const map = await this.loadSecurityMap();
        const secId = map.get(sym);
        if (!secId) throw new Error(`[Dhan] Security ID not found for ${sym}`);
        return secId;
    }

    // ── Live LTP ─────────────────────────────────────────────────────
    async getLtp(ticker: string): Promise<number> {
        const secId = await this.getSecurityId(ticker);
        const { data } = await axios.post(
            `${this.baseUrl}/marketfeed/ltp`,
            { NSE_EQ: [parseInt(secId)] },
            { headers: this.getHeaders(), timeout: 5000 }
        );
        const ltp = data?.data?.NSE_EQ?.[secId]?.last_price;
        if (!ltp) throw new Error(`[Dhan] LTP unavailable for ${ticker}`);
        return Number(ltp);
    }

    // ── Historical Candles ────────────────────────────────────────────
    async getHistoricalData(
        ticker: string,
        interval: MarketDataInterval,
        days: number = 300
    ): Promise<Candle[]> {
        const secId = await this.getSecurityId(ticker);
        const to = new Date();
        const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

        const fmt = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD

        if (interval === '1d') {
            // Daily candles
            const { data } = await axios.post(
                `${this.baseUrl}/charts/historical`,
                {
                    securityId: secId,
                    exchangeSegment: 'NSE_EQ',
                    instrument: 'EQUITY',
                    fromDate: fmt(from),
                    toDate: fmt(to),
                },
                { headers: this.getHeaders(), timeout: 15000 }
            );
            return this.parseDhanCandles(data);
        } else {
            // Intraday candles (5m or 15m)
            const dhanInterval = interval === '5m' ? 5 : 15;
            const { data } = await axios.post(
                `${this.baseUrl}/charts/intraday`,
                {
                    securityId: secId,
                    exchangeSegment: 'NSE_EQ',
                    instrument: 'EQUITY',
                    interval: String(dhanInterval),
                    fromDate: fmt(from),
                    toDate: fmt(to),
                },
                { headers: this.getHeaders(), timeout: 15000 }
            );
            return this.parseDhanCandles(data);
        }
    }

    private parseDhanCandles(data: any): Candle[] {
        // Dhan returns parallel arrays: open[], high[], low[], close[], volume[], timestamp[]
        const opens   = data?.open   ?? [];
        const highs   = data?.high   ?? [];
        const lows    = data?.low    ?? [];
        const closes  = data?.close  ?? [];
        const volumes = data?.volume ?? [];
        const ts      = data?.start_Time ?? data?.timestamp ?? [];

        const candles: Candle[] = [];
        for (let i = 0; i < closes.length; i++) {
            const rawOpen  = Number(opens[i]);
            const rawHigh  = Number(highs[i]);
            const rawLow   = Number(lows[i]);
            const rawClose = Number(closes[i]);
            const rawVol   = Number(volumes[i]);

            // Validate non-zero, non-NaN real prices
            if (!Number.isFinite(rawClose) || rawClose <= 0) continue;
            if (!Number.isFinite(rawOpen)  || rawOpen <= 0) continue;

            const open  = rawOpen;
            const close = rawClose;
            const high  = Number.isFinite(rawHigh) && rawHigh > 0 ? Math.max(rawHigh, open, close) : Math.max(open, close);
            const low   = Number.isFinite(rawLow)  && rawLow > 0  ? Math.min(rawLow, open, close)  : Math.min(open, close);
            const volume = Number.isFinite(rawVol) && rawVol >= 0 ? rawVol : 0;

            const date = ts[i]
                ? new Date(ts[i] * 1000).toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10);

            candles.push({ date, open, high, low, close, volume });
        }
        return candles;
    }

}

// ── Factory — auto-creates from .env ─────────────────────────────────
export function getDhanApiFromEnv(): DhanMarketDataApi | null {
    const clientId    = process.env.DHAN_CLIENT_ID;
    const token       = process.env.DHAN_ACCESS_TOKEN || process.env.DHAN_API_SECRET;
    const sandbox     = process.env.DHAN_SANDBOX === 'true';

    if (!clientId || !token) {
        return null;
    }

    console.log(`[Dhan] ✅ Dhan API initialized (${sandbox ? 'Sandbox' : 'Production'} | Client: ${clientId})`);
    return new DhanMarketDataApi(clientId, token, sandbox);
}
