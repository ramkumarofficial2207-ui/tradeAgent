export interface Candle {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}
export type MarketDataInterval = '1d' | '15m' | '5m';
export interface MarketDataApi {
    getLtp(ticker: string): Promise<number>;
    getHistoricalData(ticker: string, interval: MarketDataInterval, days?: number): Promise<Candle[]>;
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
    adx14: number;
    ema50Slope: number;
    avgVolume20d: number;
    todayVolume: number;
    volumeRatio: number;
    high3m: number;
    low3m: number;
    high52w: number;
    pctFrom52wHigh: number;
    distFrom200: number;
    returns3m: number;
    returns1m: number;
    returns6m: number;
    returns10d: number;
    nifty3mReturn: number;
    nifty1mReturn: number;
    outperformsNifty: boolean;
    accumulationScore?: number;
    isBullFlag?: boolean;
    isDeepValue?: boolean;
    pcr?: number;
    totalOI?: number;
    oiChangePct?: number;
    derivativeStatus?: string;
    candles: Candle[];
}
export type SetupType = 'Pullback Continuation' | 'EMA50 Pullback' | 'EMA20 Pullback' | 'Volatility Contraction (VCP)' | 'VCP Breakout 🔥' | 'VCP Contraction' | 'Breakout Base' | 'EMA20 Bounce' | 'Momentum Continuation' | 'Bull Flag Breakout 🚩' | 'Deep Value Reversion 📉';
export interface TriggerZone {
    triggerPrice: number;
    triggerVolumeRatio: number;
    authorizedAt: Date;
    expiresAt: Date;
}
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
        scoreTrend: number;
        scoreVolume: number;
        scoreRS: number;
        scoreSetup: number;
        scoreRR: number;
    };
    setupType: SetupType;
    timeframe: 'Intraday' | 'Short Swing' | 'Medium Swing';
    earningsRisk: boolean;
    newsRisk: boolean;
    newsSummary: string;
    headlines?: string[];
    momentumRank: number;
    volatilityHitProb: number;
    institutionalDemand?: number;
    aiSignal?: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT';
    aiLogic?: string;
    aiTargetRange?: string;
    aiStopLoss?: string;
    pcr?: number;
    totalOI?: number;
    oiChangePct?: number;
    derivativeStatus?: string;
    authorizedZone?: TriggerZone;
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
    regime?: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF';
    regimeLabel?: string;
    regimeDetail?: string;
    regimeColor?: string;
    positionSizeMult?: number;
    nifty50dma?: number;
    nifty200dma?: number;
    dmaCrossPct?: number;
    vixLevel?: number;
    institutionalBias?: 'RISK_ON' | 'RISK_OFF' | 'MIXED';
    institutionalScore?: number;
    institutionalNet1dCr?: number;
    institutionalNet5dCr?: number;
    institutionalNet20dCr?: number;
    institutionalLastTradingDate?: string;
    institutionalDetail?: string;
}
export interface ScanResult {
    timestamp: string;
    marketStatus: MarketStatus;
    setups: TradeSetup[];
}
