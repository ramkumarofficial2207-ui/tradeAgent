import { Candle, StockIndicators } from './types';
export declare function computeIndicators(ticker: string, candles: Candle[], niftyCandles: Candle[]): StockIndicators | null;
export declare function identifySetupType(ind: StockIndicators): 'Pullback Continuation' | 'Volatility Contraction (VCP)' | 'Breakout Base';
export declare function estimateHitProbability(ind: StockIndicators, targetPct: number): number;
