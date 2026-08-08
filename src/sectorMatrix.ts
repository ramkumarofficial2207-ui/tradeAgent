import { fetchHistoricalData } from './dataService';
import { Candle } from './types';

export interface SectorStrength {
    sector: string;
    rs5d: number; // 5-day Relative Strength vs Nifty
    rs20d: number; // 20-day Relative Strength vs Nifty
    isOutperforming: boolean;
    trend: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
}

// Yahoo Finance symbols for NSE Sector Indices
const SECTOR_INDICES: Record<string, string> = {
    'Financial Services': '^NSEBANK', // Proxied via Bank Nifty
    'IT': '^CNXIT',
    'Auto': '^CNXAUTO',
    'Pharma': '^CNXPHARMA',
    'Healthcare': '^CNXPHARMA', // Proxied via Pharma
    'Metals': '^CNXMETAL',
    'Fast Moving Consumer Goods': '^CNXFMCG',
    'Energy': '^CNXENERGY',
    'Realty': '^CNXREALTY',
    'Infrastructure': '^CNXINFRA',
    'Consumer Services': '^CNXCONSUM',
    'Commodities': '^CNXCMDT',
    'Media': '^CNXMEDIA',
    'Public Sector': '^CNXPSE',
};

// In-memory cache for sector strengths (refreshed daily)
let sectorStrengthCache: Record<string, SectorStrength> | null = null;
let lastUpdate: Date | null = null;

/**
 * Calculates the percentage return over the given window.
 */
function calculateReturn(candles: any[], days: number): number {
    if (candles.length < days) return 0;
    const latestClose = candles[candles.length - 1].close;
    const pastClose = candles[candles.length - days].close;
    return ((latestClose - pastClose) / pastClose) * 100;
}

/**
 * Fetches historical data and computes Relative Strength (RS) against Nifty 50.
 */
export async function computeSectorMatrix(): Promise<Record<string, SectorStrength>> {
    // If we have cached data from today, return it to save API calls
    if (sectorStrengthCache && lastUpdate && lastUpdate.toDateString() === new Date().toDateString()) {
        return sectorStrengthCache;
    }

    console.log('[Sector Matrix] Computing NSE Sector Relative Strength...');
    const matrix: Record<string, SectorStrength> = {};

    try {
        // Fetch Nifty 50 Baseline (Need 25 days to be safe for 20-day calculation)
        let niftyCandles: Candle[] = [];
        try {
            niftyCandles = await fetchHistoricalData('^NSEI', 35);
        } catch { /* ignore */ }

        if (!niftyCandles || niftyCandles.length < 5) {
            console.warn('[Sector Matrix] Nifty baseline data unavailable, using neutral matrix.');
            return sectorStrengthCache ?? {};
        }

        const nifty5dReturn = calculateReturn(niftyCandles, Math.min(5, niftyCandles.length - 1));
        const nifty20dReturn = calculateReturn(niftyCandles, Math.min(20, niftyCandles.length - 1));

        const sectorRows = await Promise.allSettled(
            Object.entries(SECTOR_INDICES).map(async ([sectorName, symbol]) => {
                const sectorCandles = await fetchHistoricalData(symbol, 25);
                if (sectorCandles.length < 20) return null;

                const sec5dReturn = calculateReturn(sectorCandles, 5);
                const sec20dReturn = calculateReturn(sectorCandles, 20);
                const rs5d = +(sec5dReturn - nifty5dReturn).toFixed(2);
                const rs20d = +(sec20dReturn - nifty20dReturn).toFixed(2);

                let trend: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' = 'NEUTRAL';
                if (rs5d > 0.5 && rs20d > 1.0) trend = 'ACCUMULATION';
                else if (rs5d < -0.5 && rs20d < -1.0) trend = 'DISTRIBUTION';

                return {
                    sectorName,
                    value: {
                        sector: sectorName,
                        rs5d,
                        rs20d,
                        isOutperforming: rs5d > 0 || rs20d > 0,
                        trend,
                    } satisfies SectorStrength,
                };
            }),
        );

        for (const row of sectorRows) {
            if (row.status === 'fulfilled' && row.value) {
                matrix[row.value.sectorName] = row.value.value;
            }
        }

        sectorStrengthCache = matrix;
        lastUpdate = new Date();
        console.log(`[Sector Matrix] Completed for ${Object.keys(matrix).length} sectors.`);
        
    } catch (e) {
        console.error('[Sector Matrix] Error computing baseline:', e);
    }

    return matrix;
}

/**
 * Returns the sector strength snapshot for a given sector name.
 */
export function getSectorStrength(sectorName: string): SectorStrength | null {
    if (!sectorStrengthCache) return null;
    return sectorStrengthCache[sectorName] ?? null;
}
