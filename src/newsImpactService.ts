import { StockReport } from './fundamentalService';
import { MarketGroundingContext, TradeSetup } from './types';
import { NewsEvent } from './newsIntel/types';

export type NewsCategory = 'CORPORATE_ACTION' | 'MACRO' | 'REGULATORY' | 'SECTORAL';
export type ImpactMagnitude = 'LOW' | 'MEDIUM' | 'HIGH';
export type HorizonBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNKNOWN';
export type TradeSignal = 'BUY' | 'SELL' | 'HOLD' | 'WATCH';
export type PricedInStatus = 'YES' | 'PARTIAL' | 'NO' | 'UNKNOWN';
export type AnalysisSupportLevel = 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED';

export type NewsTechnicalContext = MarketGroundingContext;

export interface NewsImpactInput {
    headline?: string;
    articleText?: string;
    targetTicker?: string;
    targetSector?: string;
    currentMarketContext?: string;
    technicalContext?: NewsTechnicalContext | null;
    events?: NewsEvent[];
}

export interface NewsImpactOutput {
    ticker: string;
    sector: string | null;
    category: NewsCategory;
    news_sentiment_score: number;
    impact_magnitude: ImpactMagnitude;
    priced_in_assessment: {
        status: PricedInStatus;
        reason: string;
    };
    time_horizon: {
        intraday: HorizonBias;
        short_term: HorizonBias;
        long_term: HorizonBias;
    };
    rationale: string;
    key_levels_to_watch: {
        support: number[];
        resistance: number[];
        basis: 'TECHNICAL_CONTEXT' | 'UNKNOWN';
    };
    trade_signal: TradeSignal;
    confidence: number;
    support_level: AnalysisSupportLevel;
    missing_inputs: string[];
    market_grounding: {
        cmp: number | null;
        gap_pct: number | null;
        day_high: number | null;
        day_low: number | null;
        volume_ratio: number | null;
        rsi14: number | null;
        ema20: number | null;
        ema50: number | null;
        dma200: number | null;
        scanner_setup: MarketGroundingContext['scannerSetup'] | null;
        regime: string | null;
        sector_breadth: MarketGroundingContext['sectorBreadth'] | null;
        confirmation_score: number | null;
        confirmation_status: NonNullable<MarketGroundingContext['confirmationStatus']>;
        confirmation_notes: string[];
    };
    distribution_flags: {
        news_tailwind_score: number;
        news_risk_flag: boolean;
        regulatory_risk_flag: boolean;
        signal_alignment: 'ALIGNED' | 'MIXED' | 'CONFLICT' | 'UNAVAILABLE';
        alert_worthy: boolean;
    };
}

const CATEGORY_PATTERNS: Array<{ category: NewsCategory; patterns: RegExp[] }> = [
    {
        category: 'REGULATORY',
        patterns: [/\bsebi\b/i, /\brbi\b/i, /\bpenalty\b/i, /\bprobe\b/i, /\bban\b/i, /\bcompliance\b/i, /\blicen[cs]e\b/i, /\bcircular\b/i],
    },
    {
        category: 'MACRO',
        patterns: [/\binflation\b/i, /\bcpi\b/i, /\bgdp\b/i, /\brepo rate\b/i, /\brate hike\b/i, /\brate cut\b/i, /\bfii\b/i, /\bdii\b/i, /\bcrude\b/i, /\bdollar\b/i],
    },
    {
        category: 'SECTORAL',
        patterns: [/\bsector\b/i, /\bbank(?:ing)?\b/i, /\bpharma\b/i, /\bauto\b/i, /\bit\b/i, /\bdefen[cs]e\b/i, /\bmetal(?:s)?\b/i, /\bpower\b/i],
    },
    {
        category: 'CORPORATE_ACTION',
        patterns: [/\border win\b/i, /\bacqui(?:re|sition)\b/i, /\bmerger\b/i, /\bstake sale\b/i, /\bpledge\b/i, /\bresults?\b/i, /\bguidance\b/i, /\bdividend\b/i, /\bbonus\b/i],
    },
];

const POSITIVE_RULES: Array<{ pattern: RegExp; weight: number }> = [
    { pattern: /\border win\b/i, weight: 0.35 },
    { pattern: /\bapproval\b/i, weight: 0.2 },
    { pattern: /\bupgrade\b/i, weight: 0.18 },
    { pattern: /\bstrong\b/i, weight: 0.12 },
    { pattern: /\bbeats?\b/i, weight: 0.22 },
    { pattern: /\bbetter than expected\b/i, weight: 0.28 },
    { pattern: /\brate cut\b/i, weight: 0.18 },
    { pattern: /\bfii buying\b/i, weight: 0.15 },
    { pattern: /\bdii buying\b/i, weight: 0.12 },
    { pattern: /\bcapacity expansion\b/i, weight: 0.18 },
];

const NEGATIVE_RULES: Array<{ pattern: RegExp; weight: number }> = [
    { pattern: /\bpenalty\b/i, weight: -0.42 },
    { pattern: /\bprobe\b/i, weight: -0.5 },
    { pattern: /\bfraud\b/i, weight: -0.85 },
    { pattern: /\bdefault\b/i, weight: -0.7 },
    { pattern: /\bpledge\b/i, weight: -0.32 },
    { pattern: /\bdowngrade\b/i, weight: -0.2 },
    { pattern: /\bworse than expected\b/i, weight: -0.3 },
    { pattern: /\bmiss(?:es|ed)?\b/i, weight: -0.24 },
    { pattern: /\brate hike\b/i, weight: -0.15 },
    { pattern: /\bfii selling\b/i, weight: -0.16 },
    { pattern: /\bgovernance\b/i, weight: -0.25 },
    { pattern: /\bsearches\b/i, weight: -0.3 },
    { pattern: /\braids?\b/i, weight: -0.45 },
    { pattern: /\bresign(?:s|ation)\b/i, weight: -0.14 },
];

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function cleanText(value: string | undefined): string {
    return (value || '').replace(/\s+/g, ' ').trim();
}

function combinedText(input: NewsImpactInput): string {
    return [input.headline, input.articleText, input.currentMarketContext, input.targetSector, input.targetTicker]
        .map(cleanText)
        .filter(Boolean)
        .join(' | ');
}

function inferCategory(text: string): NewsCategory {
    const normalized = cleanText(text);
    for (const rule of CATEGORY_PATTERNS) {
        if (rule.patterns.some(pattern => pattern.test(normalized))) {
            return rule.category;
        }
    }
    return 'CORPORATE_ACTION';
}

function scoreSentiment(text: string): number {
    let score = 0;
    for (const rule of POSITIVE_RULES) {
        if (rule.pattern.test(text)) score += rule.weight;
    }
    for (const rule of NEGATIVE_RULES) {
        if (rule.pattern.test(text)) score += rule.weight;
    }
    if (/\bno impact\b/i.test(text) || /\bmuted\b/i.test(text)) score *= 0.5;
    return +clamp(score, -1, 1).toFixed(2);
}

function scoreSentimentFromEvents(events: NewsEvent[] | undefined): number | null {
    if (!events?.length) return null;
    let score = 0;
    for (const event of events) {
        const direction = event.polarity === 'POSITIVE' ? 1 : event.polarity === 'NEGATIVE' ? -1 : 0;
        const magnitude = event.magnitude === 'HIGH' ? 0.45 : event.magnitude === 'MEDIUM' ? 0.25 : 0.1;
        score += direction * magnitude * event.confidence;
    }
    return +clamp(score, -1, 1).toFixed(2);
}

function inferImpactMagnitude(text: string, score: number): ImpactMagnitude {
    if (/\bfraud\b|\bdefault\b|\bprobe\b|\bban\b|\bmajor\b|\bunexpected\b/i.test(text) || Math.abs(score) >= 0.55) {
        return 'HIGH';
    }
    if (Math.abs(score) >= 0.2 || /\border win\b|\bresults?\b|\bguidance\b|\brate\b/i.test(text)) {
        return 'MEDIUM';
    }
    return 'LOW';
}

function inferImpactMagnitudeFromEvents(events: NewsEvent[] | undefined, fallback: ImpactMagnitude): ImpactMagnitude {
    if (!events?.length) return fallback;
    if (events.some(event => event.magnitude === 'HIGH')) return 'HIGH';
    if (events.some(event => event.magnitude === 'MEDIUM')) return 'MEDIUM';
    return fallback;
}

function inferPricedIn(text: string, magnitude: ImpactMagnitude): { status: PricedInStatus; reason: string } {
    if (/\bexpected\b|\bpriced in\b|\bconsensus\b|\balready announced\b|\binline\b/i.test(text)) {
        return {
            status: 'YES',
            reason: 'The language suggests the event was largely anticipated by the market.',
        };
    }
    if (/\bunexpected\b|\bsurprise\b|\bbetter than expected\b|\bworse than expected\b/i.test(text)) {
        return {
            status: 'NO',
            reason: 'The wording indicates a surprise element rather than a fully anticipated event.',
        };
    }
    if (magnitude === 'LOW') {
        return {
            status: 'PARTIAL',
            reason: 'Low-magnitude news is often absorbed quickly unless price and volume confirm a stronger reaction.',
        };
    }
    return {
        status: 'UNKNOWN',
        reason: 'A proper priced-in assessment needs expectation data and observed price reaction.',
    };
}

function inferHorizons(category: NewsCategory, score: number, text: string): NewsImpactOutput['time_horizon'] {
    const bullish = score > 0.18;
    const bearish = score < -0.18;
    const base: NewsImpactOutput['time_horizon'] = {
        intraday: bullish ? 'BULLISH' : bearish ? 'BEARISH' : 'NEUTRAL',
        short_term: bullish ? 'BULLISH' : bearish ? 'BEARISH' : 'NEUTRAL',
        long_term: 'UNKNOWN',
    };

    if (category === 'REGULATORY') {
        base.long_term = bearish ? 'BEARISH' : bullish ? 'BULLISH' : 'NEUTRAL';
        return base;
    }
    if (category === 'MACRO') {
        base.long_term = /\bpolicy\b|\brate\b|\binflation\b/i.test(text)
            ? (bullish ? 'BULLISH' : bearish ? 'BEARISH' : 'NEUTRAL')
            : 'UNKNOWN';
        return base;
    }
    if (/\border win\b|\bcapacity expansion\b|\bmerger\b|\bacquisition\b/i.test(text)) {
        base.long_term = bullish ? 'BULLISH' : bearish ? 'BEARISH' : 'NEUTRAL';
        return base;
    }
    if (/\bresults?\b|\bquarter\b|\bguidance\b/i.test(text)) {
        base.long_term = bullish ? 'BULLISH' : bearish ? 'BEARISH' : 'NEUTRAL';
        return base;
    }
    base.long_term = bullish ? 'BULLISH' : bearish ? 'BEARISH' : 'NEUTRAL';
    return base;
}

function getTechnicalLevels(context?: NewsTechnicalContext | null): NewsImpactOutput['key_levels_to_watch'] {
    if (!context) return { support: [], resistance: [], basis: 'UNKNOWN' };

    const supports = [context.dayLow, context.ema20, context.ema50, context.dma200]
        .filter((value): value is number => value != null && Number.isFinite(value))
        .sort((a, b) => b - a)
        .slice(0, 3)
        .map(value => +value.toFixed(2));

    const resistances = [context.dayHigh]
        .filter((value): value is number => value != null && Number.isFinite(value))
        .map(value => +value.toFixed(2));

    if (!supports.length && !resistances.length) {
        return { support: [], resistance: [], basis: 'UNKNOWN' };
    }

    return {
        support: supports,
        resistance: resistances,
        basis: 'TECHNICAL_CONTEXT',
    };
}

function evaluateMarketConfirmation(
    score: number,
    technicalContext?: NewsTechnicalContext | null
): {
    score: number | null;
    status: NonNullable<MarketGroundingContext['confirmationStatus']>;
    notes: string[];
} {
    if (!technicalContext) {
        return { score: null, status: 'UNAVAILABLE', notes: ['Live market grounding was not attached.'] };
    }

    const notes: string[] = [];
    const isBullish = score > 0.15;
    const isBearish = score < -0.15;
    const price = technicalContext.price ?? null;
    const volumeRatio = technicalContext.volumeRatio ?? null;
    const rsi14 = technicalContext.rsi14 ?? null;
    let confirmation = 0;

    if (price == null) notes.push('CMP unavailable.');

    if (isBullish) {
        if (price != null && technicalContext.ema20 != null && price >= technicalContext.ema20) confirmation += 0.12;
        else notes.push('Price is not holding above EMA20.');
        if (price != null && technicalContext.ema50 != null && price >= technicalContext.ema50) confirmation += 0.16;
        else notes.push('Price is not holding above EMA50.');
        if (price != null && technicalContext.dma200 != null && price >= technicalContext.dma200) confirmation += 0.18;
        else notes.push('Price is not holding above 200 DMA.');
        if (volumeRatio != null && volumeRatio >= 1.1) confirmation += 0.14;
        else notes.push('Volume confirmation is weak.');
        if (rsi14 != null && rsi14 >= 50 && rsi14 <= 72) confirmation += 0.12;
        else notes.push('RSI is not in a clean bullish range.');
        if ((technicalContext.gapPct ?? 0) >= 0) confirmation += 0.06;
        if (technicalContext.scannerSetup?.aiSignal === 'BUY' || technicalContext.scannerSetup?.aiSignal === 'LIGHT BUY') confirmation += 0.12;
        else if ((technicalContext.scannerSetup?.confidenceScore ?? 0) >= 7) confirmation += 0.08;
        if (technicalContext.regime === 'BULLISH') confirmation += 0.06;
        if (technicalContext.regime === 'RISK_OFF') confirmation -= 0.18;
        const breadthScore = technicalContext.sectorBreadth?.breadthScore ?? null;
        if (breadthScore != null && breadthScore >= 0.6) confirmation += 0.08;
        else if (breadthScore != null && breadthScore < 0.4) {
            confirmation -= 0.06;
            notes.push('Sector breadth is weak.');
        }
    } else if (isBearish) {
        if (price != null && technicalContext.ema20 != null && price <= technicalContext.ema20) confirmation += 0.12;
        if (price != null && technicalContext.ema50 != null && price <= technicalContext.ema50) confirmation += 0.16;
        if (price != null && technicalContext.dma200 != null && price <= technicalContext.dma200) confirmation += 0.18;
        if (volumeRatio != null && volumeRatio >= 1) confirmation += 0.12;
        if (rsi14 != null && rsi14 <= 45) confirmation += 0.12;
        else notes.push('RSI is not confirming downside momentum.');
        if ((technicalContext.gapPct ?? 0) <= 0) confirmation += 0.06;
        if (technicalContext.regime === 'RISK_OFF') confirmation += 0.1;
        if (technicalContext.regime === 'BULLISH') confirmation -= 0.12;
        const breadthScore = technicalContext.sectorBreadth?.breadthScore ?? null;
        if (breadthScore != null && breadthScore < 0.45) confirmation += 0.08;
    } else {
        confirmation = 0.4;
        notes.push('News bias is muted, so confirmation is treated as mixed.');
    }

    const roundedScore = +clamp(confirmation, 0, 1).toFixed(2);
    if (roundedScore >= 0.65) return { score: roundedScore, status: 'CONFIRMED', notes };
    if (roundedScore >= 0.4) return { score: roundedScore, status: 'PARTIAL', notes };
    return { score: roundedScore, status: 'UNCONFIRMED', notes };
}

function inferTradeSignal(
    score: number,
    technicalContext: NewsTechnicalContext | null | undefined,
    confirmation: ReturnType<typeof evaluateMarketConfirmation>
): TradeSignal {
    if (!technicalContext) return 'WATCH';
    if (Math.abs(score) < 0.18) return 'HOLD';
    if (score >= 0.35 && confirmation.status === 'CONFIRMED') return 'BUY';
    if (score <= -0.35 && confirmation.status === 'CONFIRMED') return 'SELL';
    return 'WATCH';
}

function buildDistributionFlags(
    category: NewsCategory,
    score: number,
    magnitude: ImpactMagnitude,
    tradeSignal: TradeSignal,
    confirmation: ReturnType<typeof evaluateMarketConfirmation>,
): NewsImpactOutput['distribution_flags'] {
    const newsTailwindScore = +clamp(score, -1, 1).toFixed(2);
    const regulatoryRiskFlag = category === 'REGULATORY' && score < -0.15;
    const newsRiskFlag = regulatoryRiskFlag || (score <= -0.25) || (magnitude === 'HIGH' && score < 0);
    const signalAlignment = confirmation.status === 'UNAVAILABLE'
        ? 'UNAVAILABLE'
        : tradeSignal === 'BUY' && score > 0
            ? 'ALIGNED'
            : tradeSignal === 'SELL' && score < 0
                ? 'ALIGNED'
                : tradeSignal === 'HOLD' || confirmation.status === 'PARTIAL'
                    ? 'MIXED'
                    : confirmation.status === 'UNCONFIRMED'
                        ? 'CONFLICT'
                        : 'MIXED';

    return {
        news_tailwind_score: newsTailwindScore,
        news_risk_flag: newsRiskFlag,
        regulatory_risk_flag: regulatoryRiskFlag,
        signal_alignment: signalAlignment,
        alert_worthy: tradeSignal === 'BUY' && !newsRiskFlag && !regulatoryRiskFlag && confirmation.status === 'CONFIRMED',
    };
}

function inferConfidence(input: NewsImpactInput, score: number, magnitude: ImpactMagnitude): number {
    let confidence = 0.45;
    if (cleanText(input.headline)) confidence += 0.1;
    if (cleanText(input.articleText).length >= 120) confidence += 0.1;
    if (input.targetTicker || input.targetSector) confidence += 0.1;
    if (input.currentMarketContext) confidence += 0.1;
    if (input.technicalContext) confidence += 0.1;
    if (input.events?.length) confidence += 0.08;
    if (magnitude === 'HIGH') confidence += 0.05;
    if (Math.abs(score) < 0.1) confidence -= 0.05;
    return +clamp(confidence, 0.2, 0.95).toFixed(2);
}

function inferSupportLevel(input: NewsImpactInput): { level: AnalysisSupportLevel; missingInputs: string[] } {
    const missingInputs: string[] = [];
    if (!cleanText(input.headline) && !cleanText(input.articleText)) {
        missingInputs.push('news_text');
    }
    if (!input.targetTicker && !input.targetSector) {
        missingInputs.push('target_entity');
    }
    if (!input.currentMarketContext) {
        missingInputs.push('market_context');
    }
    if (!input.technicalContext) {
        missingInputs.push('market_grounding_for_trade_signal');
    }

    if (missingInputs.includes('news_text')) {
        return { level: 'UNSUPPORTED', missingInputs };
    }
    if (missingInputs.length > 1) {
        return { level: 'PARTIAL', missingInputs };
    }
    return { level: 'SUPPORTED', missingInputs };
}

function buildRationale(
    category: NewsCategory,
    score: number,
    pricedIn: { status: PricedInStatus; reason: string },
    technicalContext: NewsTechnicalContext | null | undefined,
    confirmation: ReturnType<typeof evaluateMarketConfirmation>
): string {
    const sentimentText = score > 0.18 ? 'positive' : score < -0.18 ? 'negative' : 'mixed';
    const sentence1 = `${category.replace(/_/g, ' ')} news carries a ${sentimentText.toUpperCase()} bias with score ${score.toFixed(2)}, and the likely near-term reaction depends on whether price and volume confirm the move.`;
    const sentence2 = technicalContext
        ? `Market confirmation is ${confirmation.status.toLowerCase()} with score ${confirmation.score ?? 'N/A'}, regime ${technicalContext.regime ?? 'N/A'}, while the priced-in assessment is ${pricedIn.status}.`
        : `Technical confirmation is missing, so the output should be treated as impact analysis first and trade setup second; priced-in assessment is ${pricedIn.status}.`;
    return `${sentence1} ${sentence2}`;
}

export function buildTechnicalContextFromStock(report: StockReport | null, setup: TradeSetup | null): NewsTechnicalContext | null {
    if (!report) return null;
    return {
        price: report.currentPrice,
        gapPct: setup?.marketGrounding?.gapPct ?? null,
        dayHigh: setup?.marketGrounding?.dayHigh ?? setup?.buyZone ?? report.currentPrice,
        dayLow: setup?.marketGrounding?.dayLow ?? setup?.stopLoss ?? undefined,
        ema20: report.ema20,
        ema50: report.ema50,
        dma200: report.dma200,
        volumeRatio: report.volumeRatio,
        rsi14: report.rsi14,
        scannerSetup: setup ? {
            setupType: setup.setupType,
            confidenceScore: setup.confidenceScore,
            aiSignal: setup.aiSignal ?? null,
            riskReward: setup.riskReward,
            targetPct: setup.targetPct,
            slPct: setup.slPct,
        } : null,
        regime: setup?.marketGrounding?.regime ?? null,
        sectorBreadth: setup?.marketGrounding?.sectorBreadth ?? null,
        confirmationScore: setup?.marketGrounding?.confirmationScore ?? null,
        confirmationStatus: setup?.marketGrounding?.confirmationStatus ?? 'UNAVAILABLE',
        confirmationNotes: setup?.marketGrounding?.confirmationNotes ?? [],
    };
}

export function analyzeNewsImpact(input: NewsImpactInput): NewsImpactOutput {
    const text = combinedText(input);
    const support = inferSupportLevel(input);
    const category = inferCategory(text);
    const eventScore = scoreSentimentFromEvents(input.events);
    const score = eventScore ?? scoreSentiment(text);
    const textMagnitude = inferImpactMagnitude(text, score);
    const magnitude = inferImpactMagnitudeFromEvents(input.events, textMagnitude);
    const pricedIn = inferPricedIn(text, magnitude);
    const horizons = inferHorizons(category, score, text);
    const confirmation = evaluateMarketConfirmation(score, input.technicalContext);
    const tradeSignal = inferTradeSignal(score, input.technicalContext, confirmation);
    const levels = getTechnicalLevels(input.technicalContext);
    const confidence = inferConfidence(input, score, magnitude);
    const rationale = buildRationale(category, score, pricedIn, input.technicalContext, confirmation);
    const distributionFlags = buildDistributionFlags(category, score, magnitude, tradeSignal, confirmation);

    return {
        ticker: input.targetTicker || 'N/A',
        sector: input.targetSector || null,
        category,
        news_sentiment_score: score,
        impact_magnitude: magnitude,
        priced_in_assessment: pricedIn,
        time_horizon: horizons,
        rationale,
        key_levels_to_watch: levels,
        trade_signal: tradeSignal,
        confidence,
        support_level: support.level,
        missing_inputs: support.missingInputs,
        market_grounding: {
            cmp: input.technicalContext?.price ?? null,
            gap_pct: input.technicalContext?.gapPct ?? null,
            day_high: input.technicalContext?.dayHigh ?? null,
            day_low: input.technicalContext?.dayLow ?? null,
            volume_ratio: input.technicalContext?.volumeRatio ?? null,
            rsi14: input.technicalContext?.rsi14 ?? null,
            ema20: input.technicalContext?.ema20 ?? null,
            ema50: input.technicalContext?.ema50 ?? null,
            dma200: input.technicalContext?.dma200 ?? null,
            scanner_setup: input.technicalContext?.scannerSetup ?? null,
            regime: input.technicalContext?.regime ?? null,
            sector_breadth: input.technicalContext?.sectorBreadth ?? null,
            confirmation_score: confirmation.score,
            confirmation_status: confirmation.status,
            confirmation_notes: confirmation.notes,
        },
        distribution_flags: distributionFlags,
    };
}
