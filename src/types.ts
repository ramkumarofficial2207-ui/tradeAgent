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
    accumulationScore?: number; // Phase 4 Extension
    isBullFlag?: boolean;
    isDeepValue?: boolean;
    pcr?: number;
    totalOI?: number;
    oiChangePct?: number;
    derivativeStatus?: string;
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

export interface TriggerZone {
    triggerPrice: number;
    triggerVolumeRatio: number;
    authorizedAt: Date;
    expiresAt: Date;
}

export interface SectorBreadthSnapshot {
    sector: string;
    qualifiedCount: number;
    setupCount: number;
    advancingRatio: number;
    breadthScore: number;
}

export interface ScannerSetupContext {
    setupType?: string | null;
    confidenceScore?: number | null;
    aiSignal?: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT' | null;
    riskReward?: number | null;
    targetPct?: number | null;
    slPct?: number | null;
}

export interface MarketGroundingContext {
    price?: number | null;
    gapPct?: number | null;
    dayHigh?: number | null;
    dayLow?: number | null;
    volumeRatio?: number | null;
    rsi14?: number | null;
    ema20?: number | null;
    ema50?: number | null;
    dma200?: number | null;
    scannerSetup?: ScannerSetupContext | null;
    regime?: string | null;
    sectorBreadth?: SectorBreadthSnapshot | null;
    confirmationScore?: number | null;
    confirmationStatus?: 'CONFIRMED' | 'PARTIAL' | 'UNCONFIRMED' | 'UNAVAILABLE';
    confirmationNotes?: string[];
}

export interface NewsDistributionContext {
    newsTailwindScore: number;
    newsRiskFlag: boolean;
    regulatoryRiskFlag: boolean;
    signalAlignment: 'ALIGNED' | 'MIXED' | 'CONFLICT' | 'UNAVAILABLE';
    alertEligible: boolean;
    eventTypes: string[];
    latestHeadline?: string | null;
    lastUpdated?: string | null;
}

export interface ExecutionQualityContext {
    breakoutQuality?: number | null;
    pullbackQuality?: number | null;
    gapQuality?: number | null;
    effectiveRiskReward?: number | null;
    slippagePct?: number | null;
    structure5m?: number | null;
    structure15m?: number | null;
    eventDurability?: number | null;
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
    institutionalDemand?: number; // Phase 4 Extension
    aiSignal?: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT';
    aiLogic?: string;
    aiTargetRange?: string;
    aiStopLoss?: string;
    // Phase 6 Extension
    pcr?: number;
    totalOI?: number;
    oiChangePct?: number;
    derivativeStatus?: string;
    // Phase 1 Latency Fix
    authorizedZone?: TriggerZone;
    marketGrounding?: MarketGroundingContext;
    newsDistribution?: NewsDistributionContext;
    executionQuality?: ExecutionQualityContext;
    calibratedEdgeScore?: number;
    positionSizePct?: number;
    riskFlags?: string[];
    rejectionReasons?: string[];
    confidenceDrivers?: string[];
    alertStage?: 'SETUP_DETECTED' | 'TRIGGER_ARMED' | 'TRADE_READY' | 'THESIS_INVALIDATED';
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
    sectorBreadth?: Record<string, SectorBreadthSnapshot>;
}
