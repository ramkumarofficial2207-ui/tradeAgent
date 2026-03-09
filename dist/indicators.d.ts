import { Candle, StockIndicators } from './types';
export declare function computeIndicators(ticker: string, candles: Candle[], niftyCandles: Candle[]): StockIndicators | null;
export interface ConfidenceBreakdown {
    scoreTrend: number;
    scoreVolume: number;
    scoreRS: number;
    scoreSetup: number;
    scoreRR: number;
    total: number;
    passes: boolean;
}
export declare function computeConfidence(ind: StockIndicators, rr: number): ConfidenceBreakdown;
export interface RegimeResult {
    regime: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF';
    label: string;
    color: string;
    detail: string;
    positionSizeMult: number;
    niftyAbove200: boolean;
    vixLevel: number;
    dma50: number;
    dma200: number;
    dmaGap: number;
}
export declare function computeRegime(niftyCandles: Candle[], vixLevel: number): RegimeResult;
export interface VCPResult {
    isVCP: boolean;
    quality: number;
    tightness: number;
    contractionCount: number;
    pivotPrice: number;
    pctFromPivot: number;
}
export declare function detectVCP(candles: Candle[], currentIdx?: number): VCPResult;
export declare function isBreakout(candles: Candle[], lookback?: number): boolean;
export declare function identifySetupType(ind: StockIndicators): string;
export declare function estimateHitProbability(ind: StockIndicators, targetPct: number): number;
