// positionSizer.ts — Capital-Aware Position Sizing, ATR Dynamic Risk & Smart Trade Tiering

export interface CapitalConfig {
    tradingCapital: number;   // Total capital in INR
    maxRiskPct: number;       // Max risk per trade as percentage (e.g. 2.0 = 2%)
    maxPositions: number;     // Max simultaneous positions
    maxSectorConc: number;    // Max stocks from same sector in primary picks
    regimeMultiplier?: number;// Nifty market regime multiplier (1.0 | 0.7 | 0.4)
}

export interface SizedPosition {
    ticker: string;
    sector?: string;
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
    atr14?: number;
    breakEvenTrigger: number; // Price to move SL to Breakeven (+1R)
    quantity: number;
    capitalAllocated: number;
    riskAmount: number;
    riskPct: number;
    targetPct: number;
    riskReward: number;
    confidenceScore: number;
    trailingRule: string;
}

export interface TieredResult {
    capital: CapitalConfig;
    primary: SizedPosition[];    // Top picks with full sizing
    watchlist: SizedPosition[];  // Remaining as backup
    totalCapitalDeployed: number;
    totalRiskAmount: number;
}

export const DEFAULT_CAPITAL_CONFIG: CapitalConfig = {
    tradingCapital: 500000,
    maxRiskPct: 2.0,
    maxPositions: 5,
    maxSectorConc: 2,
    regimeMultiplier: 1.0,
};

/**
 * Calculate position size for a single trade using ATR dynamic risk
 */
export function calculatePositionSize(
    capital: number,
    maxRiskPct: number,
    entryPrice: number,
    stopLoss: number,
    regimeMultiplier: number = 1.0
): { quantity: number; capitalAllocated: number; riskAmount: number; riskPct: number } {
    const effectiveCapital = capital * regimeMultiplier;
    const maxRiskAmount = (effectiveCapital * maxRiskPct) / 100;
    const riskPerShare = Math.abs(entryPrice - stopLoss);

    if (riskPerShare <= 0) {
        return { quantity: 0, capitalAllocated: 0, riskAmount: 0, riskPct: 0 };
    }

    let quantity = Math.floor(maxRiskAmount / riskPerShare);

    // Cap at 20% of total capital per position
    const maxCapitalPerPosition = effectiveCapital * 0.20;
    const capitalNeeded = quantity * entryPrice;
    if (capitalNeeded > maxCapitalPerPosition) {
        quantity = Math.floor(maxCapitalPerPosition / entryPrice);
    }

    // Minimum 1 share
    quantity = Math.max(1, quantity);

    const capitalAllocated = quantity * entryPrice;
    const riskAmount = quantity * riskPerShare;
    const riskPct = (riskAmount / capital) * 100;

    return { quantity, capitalAllocated, riskAmount, riskPct };
}

/**
 * Tier setups into Primary picks and Watchlist based on capital & ATR constraints
 */
export function tierSetups(
    setups: Array<{
        ticker: string;
        sector?: string;
        entryZoneHigh?: number;
        entryZoneLow?: number;
        target1?: number;
        stopLoss?: number;
        atr14?: number;
        confidenceScore: number;
    }>,
    config: CapitalConfig = DEFAULT_CAPITAL_CONFIG
): TieredResult {
    // Sort by confidence score descending
    const sorted = [...setups].sort((a, b) => b.confidenceScore - a.confidenceScore);

    const primary: SizedPosition[] = [];
    const watchlist: SizedPosition[] = [];
    const sectorCount: Record<string, number> = {};
    const mult = config.regimeMultiplier ?? 1.0;
    let capitalRemaining = config.tradingCapital * mult;

    for (const setup of sorted) {
        const entry = setup.entryZoneHigh || 0;
        const target = setup.target1 || entry * 1.08;

        // ATR-based dynamic stop loss: Entry - (1.5 x ATR14) if ATR available
        const sl = setup.atr14 && setup.atr14 > 0
            ? +Math.max(setup.stopLoss || 0, entry - (1.5 * setup.atr14)).toFixed(2)
            : setup.stopLoss || + (entry * 0.95).toFixed(2);

        const sector = setup.sector || 'Unknown';

        if (entry <= 0) continue;

        const sizing = calculatePositionSize(config.tradingCapital, config.maxRiskPct, entry, sl, mult);
        const targetPct = +(((target - entry) / entry) * 100).toFixed(2);
        const riskPerShare = Math.abs(entry - sl);
        const rewardPerShare = Math.abs(target - entry);
        const riskReward = riskPerShare > 0 ? +(rewardPerShare / riskPerShare).toFixed(2) : 0;
        const breakEvenTrigger = +(entry + riskPerShare).toFixed(2); // +1R price

        const position: SizedPosition = {
            ticker: setup.ticker,
            sector,
            entryPrice: entry,
            targetPrice: target,
            stopLoss: sl,
            atr14: setup.atr14,
            breakEvenTrigger,
            quantity: sizing.quantity,
            capitalAllocated: sizing.capitalAllocated,
            riskAmount: sizing.riskAmount,
            riskPct: +sizing.riskPct.toFixed(2),
            targetPct,
            riskReward,
            confidenceScore: setup.confidenceScore,
            trailingRule: 'Move SL to Breakeven at +1R. Trail remaining 50% on 20 EMA after +1.5R target.',
        };

        // Check if this can be a primary pick
        const canBePrimary =
            primary.length < config.maxPositions &&
            (sectorCount[sector] || 0) < config.maxSectorConc &&
            capitalRemaining >= sizing.capitalAllocated;

        if (canBePrimary) {
            primary.push(position);
            sectorCount[sector] = (sectorCount[sector] || 0) + 1;
            capitalRemaining -= sizing.capitalAllocated;
        } else {
            watchlist.push(position);
        }
    }

    const totalCapitalDeployed = primary.reduce((sum, p) => sum + p.capitalAllocated, 0);
    const totalRiskAmount = primary.reduce((sum, p) => sum + p.riskAmount, 0);

    return {
        capital: config,
        primary,
        watchlist,
        totalCapitalDeployed,
        totalRiskAmount,
    };
}
