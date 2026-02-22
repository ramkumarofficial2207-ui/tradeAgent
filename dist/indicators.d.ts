import { Candle, StockIndicators } from './types';
export declare function computeIndicators(ticker: string, candles: Candle[], niftyCandles: Candle[]): StockIndicators | null;
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
