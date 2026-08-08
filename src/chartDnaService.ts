import { Candle } from './types';

export interface ChartDnaResult {
    vectorEmbedding: number[]; // 64-dimensional vector embedding
    similarityScore: number;  // 0.0 to 1.0 (Similarity to historical multibaggers)
    patternMatchLabel: string;
    isHighConfidenceMatch: boolean;
}

/**
 * Normalizes price and volume sequence into a 64-dimensional Chart DNA Vector
 */
export function extractChartDnaVector(candles: Candle[]): number[] {
    const vector: number[] = new Array(64).fill(0);
    if (!candles || candles.length < 30) return vector;

    const slice = candles.slice(-30);
    const maxClose = Math.max(...slice.map(c => c.close));
    const minClose = Math.min(...slice.map(c => c.low));
    const range = maxClose - minClose || 1;

    const maxVol = Math.max(...slice.map(c => c.volume)) || 1;

    // First 30 features: Normalized close prices
    for (let i = 0; i < 30; i++) {
        vector[i] = +((slice[i].close - minClose) / range).toFixed(4);
    }

    // Next 30 features: Normalized volumes
    for (let i = 0; i < 30; i++) {
        vector[30 + i] = +(slice[i].volume / maxVol).toFixed(4);
    }

    // Final 4 features: Trend & Return summary
    const return30d = (slice[29].close - slice[0].close) / slice[0].close;
    const bodyAvg = slice.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / 30;
    const rangeAvg = slice.reduce((sum, c) => sum + (c.high - c.low), 0) / 30;

    vector[60] = +Math.min(1, Math.max(0, return30d + 0.5)).toFixed(4);
    vector[61] = +Math.min(1, bodyAvg / (rangeAvg || 1)).toFixed(4);
    vector[62] = +(slice[29].close >= slice[29].open ? 1 : 0);
    vector[63] = +(slice[29].volume >= maxVol * 0.8 ? 1 : 0);

    return vector;
}

/**
 * Cosine similarity between two N-dimensional vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Prototype Historical Multibagger Template Vector (Ideal 45-degree VCP breakout DNA)
 */
const IDEAL_MULTIBAGGER_DNA: number[] = (() => {
    const v = new Array(64).fill(0.5);
    for (let i = 0; i < 30; i++) v[i] = 0.2 + (i / 30) * 0.7; // Smooth 45-degree slope
    for (let i = 30; i < 55; i++) v[i] = 0.3;                // Dry volume
    for (let i = 55; i < 60; i++) v[i] = 0.9;                // Volume spike on breakout
    v[60] = 0.8; v[61] = 0.7; v[62] = 1.0; v[63] = 1.0;
    return v;
})();

/**
 * Compares stock chart DNA against ideal historical multibagger DNA
 */
export function matchChartDna(candles: Candle[]): ChartDnaResult {
    const vectorEmbedding = extractChartDnaVector(candles);
    const similarityScore = +cosineSimilarity(vectorEmbedding, IDEAL_MULTIBAGGER_DNA).toFixed(3);
    const isHighConfidenceMatch = similarityScore >= 0.75;

    let patternMatchLabel = 'Standard Structure';
    if (similarityScore >= 0.85) patternMatchLabel = '🎯 Perfect Multibagger DNA Match';
    else if (similarityScore >= 0.75) patternMatchLabel = '⚡ High-Quality Institutional DNA';

    return {
        vectorEmbedding,
        similarityScore,
        patternMatchLabel,
        isHighConfidenceMatch,
    };
}
