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
    avgVolume20d: number;
    todayVolume: number;
    volumeRatio: number;
    high3m: number;
    low3m: number;
    returns3m: number;
    nifty3mReturn: number;
    outperformsNifty: boolean;
    candles: Candle[];
}
export type SetupType = 'Pullback Continuation' | 'Volatility Contraction (VCP)' | 'VCP Breakout 🔥' | 'Breakout Base' | 'EMA20 Bounce';
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
    targetPct: number;
    slPct: number;
    riskReward: number;
    catalyst: string;
    confidenceScore: number;
    setupType: SetupType;
    earningsRisk: boolean;
    newsRisk: boolean;
    newsSummary: string;
    momentumRank: number;
    volatilityHitProb: number;
    aiSignal?: 'BUY' | 'WATCH' | 'AVOID';
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
}
export interface ActiveTrade {
    ticker: string;
    entryPrice: number;
    target: number;
    stopLoss: number;
    breakEvenSet: boolean;
    status?: 'active' | 'exit_signal';
    exitReason?: string;
    trailReference?: number;
    entryDate: string;
    currentPrice: number;
    pnlPct: number;
}
export interface ScanResult {
    timestamp: string;
    marketStatus: MarketStatus;
    setups: TradeSetup[];
    activeTrades: ActiveTrade[];
}
