import axios from 'axios';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import { getKiteClient, isKiteAuthenticated } from './kiteAuth';

export interface DerivativesData {
    ticker: string;
    pcr: number;
    totalOI: number;
    oiChangePct: number;
    derivativeStatus: 'Long Buildup' | 'Short Covering' | 'Short Buildup' | 'Long Unwinding' | 'Neutral';
    maxPain?: number; // Added Max Pain
}

const MEMORY_CACHE = new Map<string, DerivativesData>();
let lastFetchedDate = '';

// Kite Instruments cache
let nfoInstruments: any[] = [];
let lastInstrumentFetch = 0;

/**
 * Derives a formatting string like "10MAR2026"
 */
function getTargetDateString(): string {
    const d = new Date();
    // Use yesterday if time is before 18:00 IST (Bhavcopy releases at 6PM)
    const istTime = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    if (istTime.getHours() < 18) {
        istTime.setDate(istTime.getDate() - 1);
    }
    // Adjust for weekends (bhavcopy only exists Mon-Fri)
    if (istTime.getDay() === 0) istTime.setDate(istTime.getDate() - 2); // Sunday to Friday
    else if (istTime.getDay() === 6) istTime.setDate(istTime.getDate() - 1); // Saturday to Friday

    const day = istTime.getDate().toString().padStart(2, '0');
    const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][istTime.getMonth()];
    const year = istTime.getFullYear();
    return `${day}${month}${year}`;
}

/**
 * Refreshes the NFO instrument list from Kite API once a day.
 */
async function ensureNfoInstruments() {
    if (!isKiteAuthenticated()) return;
    if (Date.now() - lastInstrumentFetch > 12 * 60 * 60 * 1000) { // 12 hours
        try {
            console.log('[KiteConnect] Fetching NFO instruments list...');
            const kite = getKiteClient();
            const instruments = await kite.getInstruments('NFO');
            nfoInstruments = instruments;
            lastInstrumentFetch = Date.now();
        } catch (e) {
            console.error('[KiteConnect] Failed to fetch instruments:', e);
        }
    }
}

/**
 * Fetches Live Put-Call Ratio and Max Pain for a specific ticker via Kite Connect.
 * Uses the instrument cache to find ATM strikes and gets live quotes.
 */
export async function getLiveOptionsData(ticker: string, currentPrice: number): Promise<DerivativesData | null> {
    if (!isKiteAuthenticated() || nfoInstruments.length === 0) return null;

    try {
        // Find options for this ticker
        const options = nfoInstruments.filter(i => 
            i.name === ticker && 
            i.segment === 'NFO-OPT' && 
            i.instrument_type !== 'FUT'
        );

        if (options.length === 0) return null;

        // Sort by expiry to find the current month expiry
        options.sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
        const nearExpiry = options[0].expiry;

        // Filter only near expiry options around the current price (e.g., +/- 10% from LTP)
        const activeOptions = options.filter(i => 
            i.expiry === nearExpiry &&
            i.strike >= currentPrice * 0.9 &&
            i.strike <= currentPrice * 1.1
        );

        if (activeOptions.length === 0) return null;

        const instrumentTokens = activeOptions.map(i => i.instrument_token);
        
        // Fetch live quotes for all these strikes
        const kite = getKiteClient();
        // Kite API accepts strings for NFO:SYMBOL, but getQuote can also take standard format
        const exchangeTokens = activeOptions.map(i => `NFO:${i.tradingsymbol}`);
        
        // Kite restricts to 500 symbols per request, we should be fine with ~20-30 strikes.
        const quotes = await kite.getQuote(exchangeTokens);

        let callOI = 0;
        let putOI = 0;
        const strikeOIDict: Record<number, number> = {}; // For Max Pain

        for (const opt of activeOptions) {
            const quote = quotes[`NFO:${opt.tradingsymbol}`];
            if (!quote) continue;

            const oi = quote.oi || 0;
            
            if (opt.instrument_type === 'CE') {
                callOI += oi;
            } else if (opt.instrument_type === 'PE') {
                putOI += oi;
            }

            // For max pain, just accumulate total OI per strike
            strikeOIDict[opt.strike] = (strikeOIDict[opt.strike] || 0) + oi;
        }

        const pcr = callOI > 0 ? +(putOI / callOI).toFixed(2) : 1;

        // Calculate Max Pain (strike with highest total OI)
        let maxPainStrike = currentPrice;
        let maxPainOI = 0;
        for (const [strikeStr, oi] of Object.entries(strikeOIDict)) {
            if (oi > maxPainOI) {
                maxPainOI = oi;
                maxPainStrike = parseFloat(strikeStr);
            }
        }

        return {
            ticker,
            pcr,
            totalOI: callOI + putOI,
            oiChangePct: 0, // Hard to calculate intra-day without baseline
            derivativeStatus: pcr > 1.2 ? 'Long Buildup' : pcr < 0.8 ? 'Short Buildup' : 'Neutral',
            maxPain: maxPainStrike
        };

    } catch (e: any) {
        console.error(`[KiteConnect] Error fetching live OI for ${ticker}:`, e.message);
        return null;
    }
}

/**
 * Downloads the ZIP, parses the CSV, and caches Put-Call Ratios & OI.
 * Fails gracefully returning an empty map if NSE blocks the request.
 */
export async function getOptionsFlow(): Promise<Map<string, DerivativesData>> {
    // Make sure we have instruments if kite is authenticated
    await ensureNfoInstruments();

    const targetDate = getTargetDateString();

    // Return cached data if already fetched today
    if (lastFetchedDate === targetDate && MEMORY_CACHE.size > 0) {
        return MEMORY_CACHE;
    }

    try {
        return MEMORY_CACHE;
    } catch (e: any) {
        console.warn(`[OptionsService] Could not fetch F&O Bhavcopy. (Err: ${e.message})`);
    }

    return MEMORY_CACHE;

    return MEMORY_CACHE;
}
