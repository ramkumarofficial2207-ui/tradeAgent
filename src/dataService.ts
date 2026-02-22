// =====================================================
// dataService.ts — NSE Large Cap + Mid Cap Universe
// Nifty 200 = Nifty 100 (Large Cap) + Nifty Next 50 + Nifty Midcap 100
// =====================================================

import axios from 'axios';
import { Candle, GttOrderRequest, GttOrderResponse, TradingApi } from './types';

// =====================================================
// FULL NSE LARGE + MIDCAP UNIVERSE (Nifty 200 equivalent)
// =====================================================
export const NSE_UNIVERSE: Record<string, string> = {
    // ── NIFTY 50 (Large Cap Core) ──────────────────────
    'RELIANCE': 'RELIANCE.NS',
    'TCS': 'TCS.NS',
    'HDFCBANK': 'HDFCBANK.NS',
    'INFY': 'INFY.NS',
    'ICICIBANK': 'ICICIBANK.NS',
    'HINDUNILVR': 'HINDUNILVR.NS',
    'SBIN': 'SBIN.NS',
    'BHARTIARTL': 'BHARTIARTL.NS',
    'ITC': 'ITC.NS',
    'KOTAKBANK': 'KOTAKBANK.NS',
    'LT': 'LT.NS',
    'AXISBANK': 'AXISBANK.NS',
    'ASIANPAINT': 'ASIANPAINT.NS',
    'MARUTI': 'MARUTI.NS',
    'WIPRO': 'WIPRO.NS',
    'BAJFINANCE': 'BAJFINANCE.NS',
    'TITAN': 'TITAN.NS',
    'SUNPHARMA': 'SUNPHARMA.NS',
    'ULTRACEMCO': 'ULTRACEMCO.NS',
    'POWERGRID': 'POWERGRID.NS',
    'NTPC': 'NTPC.NS',
    'TECHM': 'TECHM.NS',
    'HCLTECH': 'HCLTECH.NS',
    'DRREDDY': 'DRREDDY.NS',
    'NESTLEIND': 'NESTLEIND.NS',
    'BAJAJFINSV': 'BAJAJFINSV.NS',
    'M&M': 'M%26M.NS',
    'TATAMOTORS': 'TATAMOTORS.NS',
    'ADANIENT': 'ADANIENT.NS',
    'TATASTEEL': 'TATASTEEL.NS',
    'JSWSTEEL': 'JSWSTEEL.NS',
    'HINDALCO': 'HINDALCO.NS',
    'ONGC': 'ONGC.NS',
    'COALINDIA': 'COALINDIA.NS',
    'GRASIM': 'GRASIM.NS',
    'BPCL': 'BPCL.NS',
    'EICHERMOT': 'EICHERMOT.NS',
    'CIPLA': 'CIPLA.NS',
    'DIVISLAB': 'DIVISLAB.NS',
    'APOLLOHOSP': 'APOLLOHOSP.NS',
    'INDUSINDBK': 'INDUSINDBK.NS',
    'BRITANNIA': 'BRITANNIA.NS',
    'BAJAJ-AUTO': 'BAJAJ-AUTO.NS',
    'HEROMOTOCO': 'HEROMOTOCO.NS',
    'SHREECEM': 'SHREECEM.NS',
    'TATACONSUM': 'TATACONSUM.NS',
    'UPL': 'UPL.NS',
    'SBILIFE': 'SBILIFE.NS',
    'HDFCLIFE': 'HDFCLIFE.NS',
    'LTIM': 'LTIM.NS',

    // ── NIFTY NEXT 50 (Large Cap Extended) ─────────────
    'SIEMENS': 'SIEMENS.NS',
    'PIDILITIND': 'PIDILITIND.NS',
    'HAVELLS': 'HAVELLS.NS',
    'GODREJCP': 'GODREJCP.NS',
    'DABUR': 'DABUR.NS',
    'MARICO': 'MARICO.NS',
    'BERGEPAINT': 'BERGEPAINT.NS',
    'TORNTPOWER': 'TORNTPOWER.NS',
    'MUTHOOTFIN': 'MUTHOOTFIN.NS',
    'BOSCHLTD': 'BOSCHLTD.NS',
    'AMBUJACEM': 'AMBUJACEM.NS',
    'ACC': 'ACC.NS',
    'BANDHANBNK': 'BANDHANBNK.NS',
    'BANKBARODA': 'BANKBARODA.NS',
    'CANBK': 'CANBK.NS',
    'PNB': 'PNB.NS',
    'INDHOTEL': 'INDHOTEL.NS',
    'TATAPOWER': 'TATAPOWER.NS',
    'ADANIPORTS': 'ADANIPORTS.NS',
    'ADANIGREEN': 'ADANIGREEN.NS',
    'ADANITRANS': 'ADANITRANS.NS',
    'NAUKRI': 'NAUKRI.NS',
    'ZOMATO': 'ZOMATO.NS',
    'DMART': 'DMART.NS',
    'COLPAL': 'COLPAL.NS',
    'MCDOWELL-N': 'MCDOWELL-N.NS',
    'TRENT': 'TRENT.NS',
    'PAGEIND': 'PAGEIND.NS',
    'NHPC': 'NHPC.NS',
    'RECLTD': 'RECLTD.NS',
    'PFC': 'PFC.NS',
    'IRCTC': 'IRCTC.NS',

    // ── NIFTY MIDCAP 100 (Mid Cap) ─────────────────────
    'VOLTAS': 'VOLTAS.NS',
    'MPHASIS': 'MPHASIS.NS',
    'PERSISTENT': 'PERSISTENT.NS',
    'COFORGE': 'COFORGE.NS',
    'LTTS': 'LTTS.NS',
    'OFSS': 'OFSS.NS',
    'KPITTECH': 'KPITTECH.NS',
    'SONACOMS': 'SONACOMS.NS',
    'SUNDRMFAST': 'SUNDRMFaSTCOATINGS.NS',
    'ASTRAL': 'ASTRAL.NS',
    'POLYCAB': 'POLYCAB.NS',
    'KANSAINER': 'KANSAINER.NS',
    'SUPREMEIND': 'SUPREMEIND.NS',
    'RELAXO': 'RELAXO.NS',
    'VGUARD': 'VGUARD.NS',
    'CROMPTON': 'CROMPTON.NS',
    'BATAINDIA': 'BATAINDIA.NS',
    'TATAELXSI': 'TATAELXSI.NS',
    'KAJARIACER': 'KAJARIACER.NS',
    'FCL': 'FCL.NS',
    'LALPATHLAB': 'LALPATHLAB.NS',
    'METROPOLIS': 'METROPOLIS.NS',
    'FORTIS': 'FORTIS.NS',
    'MAXHEALTHCARE': 'MAXHEALTH.NS',
    'AARTIIND': 'AARTIIND.NS',
    'DEEPAKNTR': 'DEEPAKNTR.NS',
    'NAVINFLUOR': 'NAVINFLUOR.NS',
    'PIIND': 'PIIND.NS',
    'BALRAMCHIN': 'BALRAMCHIN.NS',
    'GNFC': 'GNFC.NS',
    'GUJGASLTD': 'GUJGASLTD.NS',
    'MGL': 'MGL.NS',
    'IGL': 'IGL.NS',
    'CESC': 'CESC.NS',
    'JSL': 'JSL.NS',
    'SAIL': 'SAIL.NS',
    'NMDC': 'NMDC.NS',
    'NATIONALUM': 'NATIONALUM.NS',
    'HINDCOPPER': 'HINDCOPPER.NS',
    'IDFCFIRSTB': 'IDFCFIRSTB.NS',
    'FEDERALBNK': 'FEDERALBNK.NS',
    'RBLBANK': 'RBLBANK.NS',
    'KARURVYSYA': 'KARURVYSYA.NS',
    'CHOLAFIN': 'CHOLAFIN.NS',
    'M&MFIN': 'M%26MFIN.NS',
    'SHRIRAMFIN': 'SHRIRAMFIN.NS',
    'ABCAPITAL': 'ABCAPITAL.NS',
    'MANAPPURAM': 'MANAPPURAM.NS',
    'LICHSGFIN': 'LICHSGFIN.NS',
    'SUNDARMFIN': 'SUNDARMFIN.NS',
    'STARHEALTH': 'STARHEALTH.NS',
    'NIACL': 'NIACL.NS',
    'OBEROIRLTY': 'OBEROIRLTY.NS',
    'PRESTIGE': 'PRESTIGE.NS',
    'PHOENIXLTD': 'PHOENIXLTD.NS',
    'GODREJPROP': 'GODREJPROP.NS',
    'DLF': 'DLF.NS',
    'LODHA': 'LODHA.NS',
};

export const SECTOR_MAP: Record<string, string> = {
    'RELIANCE': 'Energy / Conglomerates', 'TCS': 'IT Services', 'HDFCBANK': 'Private Banking',
    'INFY': 'IT Services', 'ICICIBANK': 'Private Banking', 'HINDUNILVR': 'FMCG',
    'SBIN': 'PSU Banking', 'BHARTIARTL': 'Telecom', 'ITC': 'FMCG', 'KOTAKBANK': 'Private Banking',
    'LT': 'Capital Goods', 'AXISBANK': 'Private Banking', 'ASIANPAINT': 'Paints',
    'MARUTI': 'Auto', 'WIPRO': 'IT Services', 'BAJFINANCE': 'NBFC', 'TITAN': 'Jewellery',
    'SUNPHARMA': 'Pharma', 'ULTRACEMCO': 'Cement', 'POWERGRID': 'Power',
    'NTPC': 'Power', 'TECHM': 'IT Services', 'HCLTECH': 'IT Services',
    'DRREDDY': 'Pharma', 'NESTLEIND': 'FMCG', 'BAJAJFINSV': 'NBFC', 'M&M': 'Auto',
    'TATAMOTORS': 'Auto', 'ADANIENT': 'Conglomerates', 'TATASTEEL': 'Metals',
    'JSWSTEEL': 'Metals', 'HINDALCO': 'Metals', 'ONGC': 'Oil & Gas', 'COALINDIA': 'Mining',
    'GRASIM': 'Diversified', 'BPCL': 'Oil & Gas', 'EICHERMOT': 'Auto',
    'CIPLA': 'Pharma', 'DIVISLAB': 'Pharma', 'APOLLOHOSP': 'Healthcare',
    'INDUSINDBK': 'Private Banking', 'BRITANNIA': 'FMCG', 'BAJAJ-AUTO': 'Auto',
    'HEROMOTOCO': 'Auto', 'SHREECEM': 'Cement', 'TATACONSUM': 'FMCG',
    'UPL': 'Agro Chemicals', 'SBILIFE': 'Insurance', 'HDFCLIFE': 'Insurance',
    'LTIM': 'IT Services', 'SIEMENS': 'Capital Goods', 'PIDILITIND': 'Chemicals',
    'HAVELLS': 'Electricals', 'GODREJCP': 'FMCG', 'DABUR': 'FMCG', 'MARICO': 'FMCG',
    'BERGEPAINT': 'Paints', 'TORNTPOWER': 'Power', 'MUTHOOTFIN': 'NBFC',
    'BOSCHLTD': 'Auto Ancillary', 'AMBUJACEM': 'Cement', 'ACC': 'Cement',
    'BANDHANBNK': 'Private Banking', 'BANKBARODA': 'PSU Banking', 'CANBK': 'PSU Banking',
    'PNB': 'PSU Banking', 'INDHOTEL': 'Hotels', 'TATAPOWER': 'Power',
    'ADANIPORTS': 'Ports & Logistics', 'ADANIGREEN': 'Renewable Energy',
    'NAUKRI': 'Internet Services', 'ZOMATO': 'Internet /Food-Tech', 'DMART': 'Retail',
    'COLPAL': 'FMCG', 'TRENT': 'Retail', 'PAGEIND': 'Textiles', 'RECLTD': 'Finance',
    'PFC': 'Finance', 'IRCTC': 'Travel / PSU', 'NHPC': 'Power',
    'VOLTAS': 'Capital Goods', 'MPHASIS': 'IT Services', 'PERSISTENT': 'IT Services',
    'COFORGE': 'IT Services', 'LTTS': 'IT Services', 'KPITTECH': 'IT Services',
    'ASTRAL': 'Pipes', 'POLYCAB': 'Cables & Wires', 'CROMPTON': 'Electricals',
    'BATAINDIA': 'Footwear', 'TATAELXSI': 'IT Services',
    'LALPATHLAB': 'Healthcare', 'METROPOLIS': 'Healthcare', 'FORTIS': 'Healthcare',
    'DEEPAKNTR': 'Chemicals', 'NAVINFLUOR': 'Chemicals', 'PIIND': 'Agro Chemicals',
    'IGL': 'Gas   Distribution', 'MGL': 'Gas Distribution', 'GUJGASLTD': 'Gas Distribution',
    'SAIL': 'Metals', 'NMDC': 'Mining', 'IDFCFIRSTB': 'Private Banking',
    'FEDERALBNK': 'Private Banking', 'RBLBANK': 'Private Banking',
    'CHOLAFIN': 'NBFC', 'SHRIRAMFIN': 'NBFC', 'MANAPPURAM': 'NBFC',
    'LICHSGFIN': 'NBFC', 'SUNDARMFIN': 'NBFC', 'OBEROIRLTY': 'Real Estate',
    'PRESTIGE': 'Real Estate', 'GODREJPROP': 'Real Estate', 'DLF': 'Real Estate',
    'LODHA': 'Real Estate',
};

// Universe is intentionally curated to liquid NSE names. These values are minimum
// reference market caps used by the strict scanner gate.
export const MARKET_CAP_CR_MAP: Record<string, number> = Object.fromEntries(
    Object.keys(NSE_UNIVERSE).map((ticker) => [ticker, 5000])
);

function parseYahooCandles(rawData: any): Candle[] {
    const timestamps: number[] = rawData?.chart?.result?.[0]?.timestamp ?? [];
    const q = rawData?.chart?.result?.[0]?.indicators?.quote?.[0];
    if (!q || timestamps.length === 0) return [];

    return timestamps.map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().split('T')[0],
        open: q.open[i] ?? 0,
        high: q.high[i] ?? 0,
        low: q.low[i] ?? 0,
        close: q.close[i] ?? 0,
        volume: q.volume[i] ?? 0,
    })).filter(c => c.close > 0 && c.high > 0);
}

export async function fetchHistoricalData(yahooTicker: string, days: number = 250): Promise<Candle[]> {
    try {
        const end = Math.floor(Date.now() / 1000);
        const start = end - days * 86400;
        // Use v8 chart endpoint — most reliable for NSE
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?period1=${start}&period2=${end}&interval=1d&includePrePost=false`;
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
            },
            timeout: 15000,
        });
        return parseYahooCandles(data);
    } catch (err) {
        // Silently skip failed tickers (bad ticker format, delisted, etc.)
        return [];
    }
}

export async function fetchLtp(yahooTicker: string): Promise<number> {
    const candles = await fetchHistoricalData(yahooTicker, 5);
    if (!candles.length) {
        throw new Error(`No candle data for ${yahooTicker}`);
    }
    return candles[candles.length - 1].close;
}

export interface MarketDataChange {
    niftyChange: number;
    vixChange: number;
    niftyNext50Change: number;
    niftyMidcapChange: number;
    sensexChange: number;
    goldChange: number;
    silverChange: number;
}

export async function fetchNiftyData(): Promise<MarketDataChange> {
    try {
        const [niftyRes, vixRes, nn50Res, midRes, sensexRes, goldRes, silverRes] = await Promise.allSettled([
            fetchHistoricalData('^NSEI', 10),
            fetchHistoricalData('^INDIAVIX', 10),
            fetchHistoricalData('JUNIORBEES.NS', 10),
            fetchHistoricalData('^NSMIDCP', 10),
            fetchHistoricalData('^BSESN', 10),
            fetchHistoricalData('GOLDBEES.NS', 10),
            fetchHistoricalData('SILVERBEES.NS', 10),
        ]);

        const getChange = (res) => {
            if (res.status === 'fulfilled' && res.value.length >= 2) {
                const c = res.value;
                const prev = c[c.length - 2].close;
                const curr = c[c.length - 1].close;
                return ((curr - prev) / prev) * 100;
            }
            return 0;
        };

        return {
            niftyChange: getChange(niftyRes),
            vixChange: getChange(vixRes),
            niftyNext50Change: getChange(nn50Res),
            niftyMidcapChange: getChange(midRes),
            sensexChange: getChange(sensexRes),
            goldChange: getChange(goldRes),
            silverChange: getChange(silverRes),
        };
    } catch {
        return { niftyChange: 0, vixChange: 0, niftyNext50Change: 0, niftyMidcapChange: 0, sensexChange: 0, goldChange: 0, silverChange: 0 };
    }
}

type BrokerProvider = 'paper' | 'kite';

function getKiteHeaders(apiKey: string, accessToken: string): Record<string, string> {
    return {
        'X-Kite-Version': '3',
        Authorization: `token ${apiKey}:${accessToken}`,
    };
}

function nseSymbol(ticker: string): string {
    return `NSE:${ticker}`;
}

interface KiteInstrument {
    instrument_token: number;
    tradingsymbol: string;
    exchange: string;
}

export class KiteLiveTradingApi implements TradingApi {
    private readonly baseUrl = 'https://api.kite.trade';
    private readonly apiKey: string;
    private readonly accessToken: string;
    private instrumentMap: Map<string, KiteInstrument> | null = null;
    private lastMapFetchMs = 0;

    constructor(apiKey: string, accessToken: string) {
        this.apiKey = apiKey;
        this.accessToken = accessToken;
    }

    private async loadInstruments(): Promise<Map<string, KiteInstrument>> {
        const now = Date.now();
        if (this.instrumentMap && now - this.lastMapFetchMs < 12 * 60 * 60 * 1000) {
            return this.instrumentMap;
        }

        const url = `${this.baseUrl}/instruments/NSE`;
        const { data } = await axios.get<string>(url, {
            headers: getKiteHeaders(this.apiKey, this.accessToken),
            timeout: 15000,
            responseType: 'text',
        });

        const lines = data.split('\n').filter(Boolean);
        const header = lines[0].split(',');
        const tokenIdx = header.indexOf('instrument_token');
        const symbolIdx = header.indexOf('tradingsymbol');
        const exchIdx = header.indexOf('exchange');
        const map = new Map<string, KiteInstrument>();

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            const tradingsymbol = cols[symbolIdx];
            const exchange = cols[exchIdx];
            const token = Number(cols[tokenIdx]);
            if (!tradingsymbol || exchange !== 'NSE' || !Number.isFinite(token)) continue;
            map.set(tradingsymbol, {
                instrument_token: token,
                tradingsymbol,
                exchange,
            });
        }

        this.instrumentMap = map;
        this.lastMapFetchMs = now;
        return map;
    }

    private async getInstrumentToken(ticker: string): Promise<number> {
        const map = await this.loadInstruments();
        const instrument = map.get(ticker);
        if (!instrument) {
            throw new Error(`Kite instrument not found for ${ticker}`);
        }
        return instrument.instrument_token;
    }

    async getLtp(ticker: string): Promise<number> {
        const symbol = nseSymbol(ticker);
        const url = `${this.baseUrl}/quote/ltp`;
        const { data } = await axios.get(url, {
            params: { i: symbol },
            headers: getKiteHeaders(this.apiKey, this.accessToken),
            timeout: 10000,
        });
        const lastPrice = data?.data?.[symbol]?.last_price;
        if (!Number.isFinite(lastPrice)) {
            throw new Error(`Kite LTP unavailable for ${symbol}`);
        }
        return lastPrice;
    }

    async getHistoricalData(ticker: string, interval: '1d', days: number = 260): Promise<Candle[]> {
        const token = await this.getInstrumentToken(ticker);
        const to = new Date();
        const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
        const kiteInterval = interval === '1d' ? 'day' : interval;
        const url = `${this.baseUrl}/instruments/historical/${token}/${kiteInterval}`;
        const { data } = await axios.get(url, {
            params: {
                from: from.toISOString(),
                to: to.toISOString(),
                continuous: 0,
                oi: 0,
            },
            headers: getKiteHeaders(this.apiKey, this.accessToken),
            timeout: 15000,
        });
        const candles = data?.data?.candles ?? [];
        return candles.map((c: any[]) => ({
            date: String(c[0]).slice(0, 10),
            open: Number(c[1]),
            high: Number(c[2]),
            low: Number(c[3]),
            close: Number(c[4]),
            volume: Number(c[5] ?? 0),
        }));
    }

    async placeGttOrder(order: GttOrderRequest): Promise<GttOrderResponse> {
        const url = `${this.baseUrl}/gtt/triggers`;
        const triggerPrice = +order.entry.toFixed(2);
        const payload = new URLSearchParams();
        payload.append('type', 'single');
        payload.append('condition', JSON.stringify({
            exchange: 'NSE',
            tradingsymbol: order.ticker,
            trigger_values: [triggerPrice],
            last_price: triggerPrice,
        }));
        payload.append('orders', JSON.stringify([{
            exchange: 'NSE',
            tradingsymbol: order.ticker,
            transaction_type: 'BUY',
            quantity: order.quantity,
            order_type: 'LIMIT',
            product: 'CNC',
            price: triggerPrice,
        }]));

        try {
            const { data } = await axios.post(url, payload.toString(), {
                headers: {
                    ...getKiteHeaders(this.apiKey, this.accessToken),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: 15000,
            });
            const id = data?.data?.trigger_id;
            return {
                orderId: String(id ?? `kite-gtt-${order.ticker}-${Date.now()}`),
                status: 'accepted',
                message: 'Kite GTT trigger placed',
            };
        } catch (error: any) {
            return {
                orderId: `kite-gtt-failed-${Date.now()}`,
                status: 'rejected',
                message: error?.response?.data?.message ?? error?.message ?? 'GTT placement failed',
            };
        }
    }
}

export class GrowwPaperTradingApi implements TradingApi {
    async getLtp(ticker: string): Promise<number> {
        const yahooTicker = NSE_UNIVERSE[ticker] ?? `${ticker}.NS`;
        return fetchLtp(yahooTicker);
    }

    async getHistoricalData(ticker: string, _interval: '1d', days: number = 260): Promise<Candle[]> {
        const yahooTicker = NSE_UNIVERSE[ticker] ?? `${ticker}.NS`;
        return fetchHistoricalData(yahooTicker, days);
    }

    async placeGttOrder(order: GttOrderRequest): Promise<GttOrderResponse> {
        const orderId = `paper-gtt-${order.ticker}-${Date.now()}`;
        return {
            orderId,
            status: 'accepted',
            message: `Paper GTT accepted for ${order.ticker} qty ${order.quantity}`,
        };
    }
}

export function getTradingApiFromEnv(): { provider: BrokerProvider; api: TradingApi; live: boolean } {
    const provider = (process.env.BROKER_PROVIDER ?? 'paper').toLowerCase() as BrokerProvider;
    if (provider === 'kite') {
        const apiKey = process.env.KITE_API_KEY;
        const accessToken = process.env.KITE_ACCESS_TOKEN;
        if (apiKey && accessToken) {
            return { provider: 'kite', api: new KiteLiveTradingApi(apiKey, accessToken), live: true };
        }
    }
    return { provider: 'paper', api: new GrowwPaperTradingApi(), live: false };
}
