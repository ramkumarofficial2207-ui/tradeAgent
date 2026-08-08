import { Candle } from './types';
import { StockIndicators } from './types';

export interface NormalizedDataset {
    features: number[][]; // N x 12 matrix
    labels: number[];     // N x 1 array (1 = Hit target, 0 = Stopped)
}

/**
 * Extracts 12 normalized features from stock indicators
 */
export function extractFeatureVector(ind: StockIndicators): number[] {
    const rsiNorm = Math.min(1, Math.max(0, ind.rsi14 / 100));
    const adxNorm = Math.min(1, Math.max(0, ind.adx14 / 60));
    const volNorm = Math.min(1, Math.max(0, ind.volumeRatio / 4.0));
    const emaSlopeNorm = Math.min(1, Math.max(0, (ind.ema50Slope + 5) / 10));
    const dist200Norm = Math.min(1, Math.max(0, (ind.distFrom200 + 20) / 40));
    const pct52wNorm = Math.min(1, Math.max(0, (30 - ind.pctFrom52wHigh) / 30));
    const rsNorm = ind.outperformsNifty ? 1.0 : 0.0;

    const acceptanceNorm = ind.acceptanceScore / 10;
    const absorptionNorm = ind.absorptionScore / 10;
    const persistenceNorm = ind.persistenceScore / 10;
    const retentionNorm = ind.breakoutRetentionScore / 10;
    const failureRiskNorm = ind.failureRiskScore / 10;

    return [
        +rsiNorm.toFixed(4),
        +adxNorm.toFixed(4),
        +volNorm.toFixed(4),
        +emaSlopeNorm.toFixed(4),
        +dist200Norm.toFixed(4),
        +pct52wNorm.toFixed(4),
        rsNorm,
        +acceptanceNorm.toFixed(4),
        +absorptionNorm.toFixed(4),
        +persistenceNorm.toFixed(4),
        +retentionNorm.toFixed(4),
        +failureRiskNorm.toFixed(4),
    ];
}
