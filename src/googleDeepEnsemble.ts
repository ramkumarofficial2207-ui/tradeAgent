import { StockIndicators } from './types';
import { extractFeatureVector } from './tfDataPrep';
import { predictWinProbabilityTf } from './tfModel';
import { matchChartDna } from './chartDnaService';
import { computeMacroState } from './macroEngine';

export interface DeepEnsembleResult {
    winProbability: number;     // 0.0 to 1.0
    winProbabilityPct: number;  // 0% to 100%
    chartDnaMatchPct: number;   // Chart DNA similarity %
    macroMultiplier: number;    // 0.5 to 1.2
    passedGate: boolean;        // True if passes Adaptive Quality Safety Gate
    fastTrackStatus: 'FAST_TRACK_1' | 'FAST_TRACK_2' | 'STANDARD_GATE' | 'REJECTED';
    rejectionReason?: string;
}

/**
 * Unified Google Deep Ensemble Engine (TabNet + TFT + TensorFlow.js + Chart DNA + Macro Engine)
 */
export function evaluateGoogleDeepEnsemble(
    ind: StockIndicators,
    confidenceScore: number,
    setupType: string
): DeepEnsembleResult {
    // 1. Chart DNA Vector Similarity Match
    const dnaResult = matchChartDna(ind.candles);

    // 2. Macro Liquidity & Sector Correlation Engine
    const macroState = computeMacroState(ind.candles, ind.outperformsNifty ? 8.5 : 5.0);

    // 3. TensorFlow.js Neural Network Feature Inference
    const rawFeatures = extractFeatureVector(ind);
    const tfWinProb = predictWinProbabilityTf(rawFeatures);

    // Composite Ensemble Win Probability
    const ensembleProb = (tfWinProb * 0.60) + (dnaResult.similarityScore * 0.25) + (macroState.macroMultiplier * 0.15);
    const winProbability = +Math.min(0.95, Math.max(0.35, ensembleProb)).toFixed(3);
    const winProbabilityPct = +(winProbability * 100).toFixed(1);

    // ── ADAPTIVE QUALITY SAFETY GATE (NO FALSE KILLS) ──
    const isTopPattern =
        setupType.includes('Episodic Pivot') ||
        setupType.includes('High Tight Flag') ||
        setupType.includes('VCP') ||
        setupType.includes('Leader Pullback');

    let fastTrackStatus: 'FAST_TRACK_1' | 'FAST_TRACK_2' | 'STANDARD_GATE' | 'REJECTED' = 'STANDARD_GATE';
    let passedGate = false;
    let rejectionReason: string | undefined = undefined;

    // Fast-Track 1: High-Conviction / Pattern Master (Score >= 8.5 or Top Pattern)
    if (confidenceScore >= 8.5 || (isTopPattern && confidenceScore >= 7.5)) {
        fastTrackStatus = 'FAST_TRACK_1';
        passedGate = true;
    }
    // Fast-Track 2: Market Leader Protection (Outperforming Nifty + Strong Trend)
    else if (ind.isLeader && ind.outperformsNifty && winProbability >= 0.55) {
        fastTrackStatus = 'FAST_TRACK_2';
        passedGate = true;
    }
    // Standard Gate: Neural Network Filter (Requires Win Probability >= 60%)
    else if (winProbability >= 0.60) {
        fastTrackStatus = 'STANDARD_GATE';
        passedGate = true;
    } else {
        fastTrackStatus = 'REJECTED';
        passedGate = false;
        rejectionReason = `Ensemble Win Probability (${winProbabilityPct}%) below 60% threshold.`;
    }

    return {
        winProbability,
        winProbabilityPct,
        chartDnaMatchPct: +(dnaResult.similarityScore * 100).toFixed(1),
        macroMultiplier: macroState.macroMultiplier,
        passedGate,
        fastTrackStatus,
        rejectionReason,
    };
}
