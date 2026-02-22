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
    currentPrice: number;
    dayChange: number;
    dayChangePct: number;
    high52w: number;
    low52w: number;
    peRatio: number | null;
    industryPe: number | null;
    pbRatio: number | null;
    marketCapCr: number | null;
    dividendYield: number | null;
    eps: number | null;
    bookValue: number | null;
    faceValue: number | null;
    roe: number | null;
    roce: number | null;
    debtToEquity: number | null;
    currentRatio: number | null;
    promoterHolding: number | null;
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
    hasSetup: boolean;
    setupType: string | null;
    buyZone: number | null;
    target: number | null;
    stopLoss: number | null;
    riskReward: number | null;
    confidenceScore: number | null;
    quarterlyResults: QuarterlyResult[];
    annualResults: AnnualResult[];
    fetchedAt: string;
}
export declare function fetchStockReport(ticker: string, niftyCandles?: any[]): Promise<StockReport | null>;
export interface FundamentalGrade {
    grade: 'A' | 'B' | 'C' | 'D' | '—';
    score: number;
    peOk: boolean;
    roeOk: boolean;
    debtOk: boolean;
    promoOk: boolean;
    summary: string;
}
export declare function getFundamentalGrade(r: StockReport): FundamentalGrade;
export declare function batchPrefetch(tickers: string[], niftyCandles?: any[]): Promise<void>;
export declare function getUniverseList(): Array<{
    ticker: string;
    sector: string;
}>;
