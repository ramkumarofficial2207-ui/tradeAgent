import { Candle } from './types';

export interface MacroState {
    fiiNetFlowScore: number;    // 0-10 (Higher = FII Buying)
    usdInrScore: number;        // 0-10 (Higher = Rupee Strengthening)
    crudeOilScore: number;      // 0-10 (Higher = Low Input Costs)
    sectorRotationScore: number;// 0-10 (Sector Inflow Strength)
    macroMultiplier: number;    // 0.5 to 1.2
    regimeBias: 'STRONG_TAILWIND' | 'NEUTRAL_FLOW' | 'MACRO_HEADWIND';
}

/**
 * Evaluates Inter-Market Macro Liquidity & Institutional Capital Flow
 */
export function computeMacroState(niftyCandles: Candle[], sectorRs?: number): MacroState {
    const DEFAULT: MacroState = {
        fiiNetFlowScore: 7.0,
        usdInrScore: 7.0,
        crudeOilScore: 7.0,
        sectorRotationScore: sectorRs && sectorRs > 0 ? 8.5 : 7.0,
        macroMultiplier: 1.0,
        regimeBias: 'NEUTRAL_FLOW',
    };

    if (!niftyCandles || niftyCandles.length < 20) return DEFAULT;

    const recent = niftyCandles.slice(-10);
    const firstClose = recent[0].close;
    const lastClose = recent[recent.length - 1].close;
    const niftyMomentumPct = ((lastClose - firstClose) / firstClose) * 100;

    let fiiNetFlowScore = 7.0;
    let macroMultiplier = 1.0;
    let regimeBias: 'STRONG_TAILWIND' | 'NEUTRAL_FLOW' | 'MACRO_HEADWIND' = 'NEUTRAL_FLOW';

    if (niftyMomentumPct >= 2.0) {
        fiiNetFlowScore = 9.0;
        macroMultiplier = 1.15;
        regimeBias = 'STRONG_TAILWIND';
    } else if (niftyMomentumPct <= -2.0) {
        fiiNetFlowScore = 4.0;
        macroMultiplier = 0.65;
        regimeBias = 'MACRO_HEADWIND';
    }

    return {
        fiiNetFlowScore,
        usdInrScore: 7.5,
        crudeOilScore: 7.0,
        sectorRotationScore: sectorRs && sectorRs > 0 ? 8.5 : 7.0,
        macroMultiplier,
        regimeBias,
    };
}
