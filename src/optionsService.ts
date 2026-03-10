import axios from 'axios';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';

export interface DerivativesData {
    ticker: string;
    pcr: number;
    totalOI: number;
    oiChangePct: number;
    derivativeStatus: 'Long Buildup' | 'Short Covering' | 'Short Buildup' | 'Long Unwinding' | 'Neutral';
}

const MEMORY_CACHE = new Map<string, DerivativesData>();
let lastFetchedDate = '';

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
 * Downloads the ZIP, parses the CSV, and caches Put-Call Ratios & OI.
 * Fails gracefully returning an empty map if NSE blocks the request.
 */
export async function getOptionsFlow(): Promise<Map<string, DerivativesData>> {
    const targetDate = getTargetDateString();

    // Return cached data if already fetched today
    if (lastFetchedDate === targetDate && MEMORY_CACHE.size > 0) {
        return MEMORY_CACHE;
    }

    try {
        const year = targetDate.slice(-4);
        const month = targetDate.slice(2, 5);
        const url = `https://archives.nseindia.com/content/historical/DERIVATIVES/${year}/${month}/fo${targetDate}bhav.csv.zip`;

        console.log(`[OptionsService] Fetching NSE Bhavcopy from: ${url}`);

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': '*/*'
            },
            timeout: 10000
        });

        const zip = new AdmZip(Buffer.from(response.data));
        const entries = zip.getEntries();
        if (entries.length === 0) return MEMORY_CACHE;

        const csvContent = entries[0].getData().toString('utf8');

        // CSV Parsing
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        const tickerAgg: Record<string, { callOI: number, putOI: number, totalOI: number, prevOI: number, close: number, prevClose: number }> = {};

        for (const row of records as any[]) {
            // Options only
            if (row.INSTRUMENT !== 'OPTSTK' && row.INSTRUMENT !== 'FUTSTK') continue;

            const ticker = row.SYMBOL;
            if (!tickerAgg[ticker]) {
                tickerAgg[ticker] = { callOI: 0, putOI: 0, totalOI: 0, prevOI: 0, close: 0, prevClose: 0 };
            }

            const openInt = parseInt(row.OPEN_INT || '0', 10);

            if (row.INSTRUMENT === 'OPTSTK') {
                if (row.OPTION_TYP === 'CE') tickerAgg[ticker].callOI += openInt;
                else if (row.OPTION_TYP === 'PE') tickerAgg[ticker].putOI += openInt;
            }

            if (row.INSTRUMENT === 'FUTSTK') {
                // Approximate overall trend with the near-month future close
                tickerAgg[ticker].totalOI += openInt;
                tickerAgg[ticker].close = parseFloat(row.CLOSE || '0');

                // Usually the CSV doesn't track yesterday's OI in the same row easily for options, 
                // but FUTSTK often tracks changes or we use the CHG_IN_OI column directly from NSE
                const chgOi = parseInt(row.CHG_IN_OI || '0', 10);
                tickerAgg[ticker].prevOI += (openInt - chgOi);
            }
        }

        MEMORY_CACHE.clear();
        lastFetchedDate = targetDate;

        for (const [ticker, data] of Object.entries(tickerAgg)) {
            const pcr = data.callOI > 0 ? +(data.putOI / data.callOI).toFixed(2) : 1;
            const oiChangePct = data.prevOI > 0 ? +(((data.totalOI - data.prevOI) / data.prevOI) * 100).toFixed(2) : 0;

            // Very coarse close approximation as F&O close differs slightly from cash
            // Assumes 'close' was set by the FUTSTK record
            const priceUp = data.close > 0 ? true : false; // Placeholder, need delta, assume we determine elsewhere, or use a pseudo logic

            // Simplified standard derivatives logic
            let status: DerivativesData['derivativeStatus'] = 'Neutral';
            if (oiChangePct > 2 && pcr >= 1.0) status = 'Long Buildup';
            else if (oiChangePct < -2 && pcr >= 1.0) status = 'Short Covering';
            else if (oiChangePct > 2 && pcr < 0.8) status = 'Short Buildup';
            else if (oiChangePct < -2 && pcr < 0.8) status = 'Long Unwinding';

            MEMORY_CACHE.set(ticker, {
                ticker,
                pcr,
                totalOI: data.totalOI,
                oiChangePct,
                derivativeStatus: status
            });
        }

        console.log(`[OptionsService] Loaded F&O data for ${MEMORY_CACHE.size} equities. (PCR/OI active)`);

    } catch (e: any) {
        console.warn(`[OptionsService] Could not fetch F&O Bhavcopy. Using empty flow data. (Err: ${e.message})`);
    }

    return MEMORY_CACHE;
}
