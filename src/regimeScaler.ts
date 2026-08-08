import { Candle } from './types';
import { SMA } from 'technicalindicators';

export interface RegimeScalingResult {
    regime: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF';
    positionSizeMultiplier: number; // 1.0 | 0.7 | 0.4
    niftyAbove50Ema: boolean;
    niftyAbove200Dma: boolean;
    label: string;
    badgeColor: string;
    description: string;
}

/**
 * Computes Nifty Market Regime & Capital Scaling Multiplier
 */
export function computeMarketRegimeScaling(niftyCandles: Candle[]): RegimeScalingResult {
    const DEFAULT: RegimeScalingResult = {
        regime: 'NEUTRAL',
        positionSizeMultiplier: 0.7,
        niftyAbove50Ema: true,
        niftyAbove200Dma: true,
        label: 'NEUTRAL (70% Capital)',
        badgeColor: '#F59E0B',
        description: 'Moderate market environment. Allocating 70% standard capital per trade.',
    };

    if (!niftyCandles || niftyCandles.length < 200) return DEFAULT;

    const closes = niftyCandles.map(c => c.close);
    const dma50Arr = SMA.calculate({ period: 50, values: closes });
    const dma200Arr = SMA.calculate({ period: 200, values: closes });

    const ltp = closes[closes.length - 1];
    const dma50 = dma50Arr.length > 0 ? dma50Arr[dma50Arr.length - 1] : ltp;
    const dma200 = dma200Arr.length > 0 ? dma200Arr[dma200Arr.length - 1] : ltp;

    const niftyAbove50Ema = ltp >= dma50;
    const niftyAbove200Dma = ltp >= dma200;

    if (niftyAbove50Ema && niftyAbove200Dma && dma50 >= dma200) {
        return {
            regime: 'BULLISH',
            positionSizeMultiplier: 1.0,
            niftyAbove50Ema,
            niftyAbove200Dma,
            label: 'BULLISH (100% Capital)',
            badgeColor: '#10B981',
            description: 'Strong market environment. 100% full capital deployed per setup.',
        };
    }

    if (!niftyAbove200Dma || (!niftyAbove50Ema && dma50 < dma200)) {
        return {
            regime: 'RISK_OFF',
            positionSizeMultiplier: 0.4,
            niftyAbove50Ema,
            niftyAbove200Dma,
            label: 'RISK-OFF (40% Capital)',
            badgeColor: '#EF4444',
            description: 'Market correction / Risk-Off. Auto-scaling position sizes down to 40% for capital defense.',
        };
    }

    return DEFAULT;
}
