// =====================================================
// types.ts — All strict TypeScript interfaces
// =====================================================

export interface Candle {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface MarketDataApi {
    getLtp(ticker: string): Promise<number>;
    getHistoricalData(ticker: string, interval: '1d', days?: number): Promise<Candle[]>;
}

export interface GttOrderRequest {
    ticker: string;
    entry: number;
    stopLoss: number;
    target: number;
    quantity: number;
}

export interface GttOrderResponse {
    orderId: string;
    status: 'accepted' | 'rejected';
    message: string;
}

export interface TradingApi extends MarketDataApi {
    placeGttOrder(order: GttOrderRequest): Promise<GttOrderResponse>;
}

export interface StockIndicators {
    ticker: string;
    ltp: number;
    dma200: number;
    ema50: number;
    ema20: number;
    rsi14: number;
    adx14: number;           // ADX(14) trend strength
    ema50Slope: number;      // % change in 50EMA over 10 days (positive = rising)
    avgVolume20d: number;
    todayVolume: number;
    volumeRatio: number;     // todayVolume / avgVolume20d
    high3m: number;
    low3m: number;
    high52w: number;         // 52-week high price
    pctFrom52wHigh: number;  // % below 52W high (lower = closer to high)
    distFrom200: number;     // % above 200 DMA
    returns3m: number;       // 3-month return %
    returns1m: number;       // 1-month return %
    returns6m: number;       // 6-month return %
    returns10d: number;      // 10-day return %
    nifty3mReturn: number;
    nifty1mReturn: number;
    outperformsNifty: boolean;
    isBullFlag?: boolean;
    isDeepValue?: boolean;
    candles: Candle[];
}

export type SetupType =
    | 'Pullback Continuation'
    | 'EMA50 Pullback'
    | 'EMA20 Pullback'
    | 'Volatility Contraction (VCP)'
    | 'VCP Breakout 🔥'
    | 'VCP Contraction'
    | 'Breakout Base'
    | 'EMA20 Bounce'
    | 'Momentum Continuation'
    | 'Bull Flag Breakout 🚩'
    | 'Deep Value Reversion 📉';

export interface TradeSetup {
    ticker: string;
    sector: string;
    marketCapCr?: number;
    ltp: number;
    trendStatus: string;
    volumeSpike: string;
    entryTrigger: string;
    buyZone: number;
    target: number;
    stopLoss: number;
    target2?: number;
    atr14?: number;
    targetPct: number;
    slPct: number;
    riskReward: number;
    catalyst: string;
    confidenceScore: number;
    confidenceBreakdown?: {
        scoreTrend: number   // 0–2
        scoreVolume: number   // 0–2
        scoreRS: number   // 0–2
        scoreSetup: number   // 0–2
        scoreRR: number   // 0–2
    };
    setupType: SetupType;
    timeframe: 'Intraday' | 'Short Swing' | 'Medium Swing';
    earningsRisk: boolean;
    newsRisk: boolean;
    newsSummary: string;
    headlines?: string[];
    momentumRank: number;
    volatilityHitProb: number;
    aiSignal?: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT';
    aiLogic?: string;
    aiTargetRange?: string;
    aiStopLoss?: string;
}

export interface MarketStatus {
    niftyChange: number;
    vixChange: number;
    niftyNext50Change?: number;
    niftyMidcapChange?: number;
    sensexChange?: number;
    goldChange?: number;
    silverChange?: number;
    safeToTrade: boolean;
    warning: string;
    // Regime fields (added in Phase 2)
    regime?: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF';
    regimeLabel?: string;
    regimeDetail?: string;
    regimeColor?: string;
    positionSizeMult?: number;
    nifty50dma?: number;
    nifty200dma?: number;
    dmaCrossPct?: number;
    vixLevel?: number;
}


export interface ScanResult {
    timestamp: string;
    marketStatus: MarketStatus;
    setups: TradeSetup[];
}
