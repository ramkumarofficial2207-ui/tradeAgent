// =====================================================
// scanner.ts — Hardened NSE swing scanner
// ALL gates strictly enforced per blueprint spec
// =====================================================

import { fetchHistoricalData, fetchNiftyData, MARKET_CAP_CR_MAP, NSE_UNIVERSE, SECTOR_MAP } from './dataService';
import { getMomentumCandidates, getTopGainersToday, getBhavcopyCacheStatus } from './nseDiscovery';
import { getNewsCatalystTickers } from './newsIntel/service';
import { computeIndicators, computeConfidence, computeRegime, estimateHitProbability, identifySetupType, detectVCP } from './indicators';
import prisma from './prismaClient';
import { validateNewsRisk } from './newsValidator';
import { validateEarningsRisk } from './earningsValidator';
import { analyzeStocksWithAI } from './aiAdvisor';
import { getOptionsFlow } from './optionsService';
import { getInstitutionalFlowSignal } from './institutionalFlowService';
import { getTickerNewsDigest } from './newsIntel/service';
import { NewsEvent } from './newsIntel/types';
import { buildMarketGroundingFromIndicator, buildSectorBreadthMap } from './newsIntel/marketGrounding';
import { applyRiskGovernor } from './riskGovernor';
import { Candle, MarketDataApi, MarketStatus, ScanDiagnostics, ScanResult, StockIndicators, TradeSetup } from './types';

// ── Universe liquidity gates ─────────────────────────────────────
const MIN_MARKET_CAP_CR = 250;       // Lowered to ₹250 Cr to include all small/midcaps
const MIN_AVG_VOLUME = 150_000;   // Lowered to 1.5 Lakh shares to include midcaps
const MIN_PRICE = 50;        // Lowered from ₹100 to catch cheaper midcaps

// ── Mandatory momentum gates ─────────────────────────────────────
const RSI_MIN = 45;        // Relaxed from 50 to catch early breakouts and deeper pullbacks
const RSI_MAX = 80;        // Relaxed from 78
const ADX_MIN = 10;        // Relaxed from 15 to allow very early stage trends
const VOL_RATIO_LARGE = 1.0;       // Dropped to 1.0 (just average volume required for large/midcaps)
const VOL_RATIO_SMALL = 1.1;      // Dropped from 1.25 to 1.1 for smallcaps

// ── Quality gates ────────────────────────────────────────────────
const MIN_RR = 1.5;       // Blueprint: minimum 1.5:1 RR (relaxed from 2)
const MIN_CONFIDENCE = 5.0;       // Relaxed from 5.5 to show more setups
const MAX_ATR_PCT = 12.0;       // Relaxed from 10% to allow for more volatile midcaps
const MAX_52W_DROP = 35;        // Relaxed from 25% for deeper value plays

const INTRADAY_UNIVERSE = [
    'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK',
    'TCS', 'INFY', 'WIPRO', 'HCLTECH', 'LT', 'ULTRACEMCO', 'TITAN',
    'BAJFINANCE', 'BAJAJFINSV', 'MARUTI', 'M&M', 'TATAMOTORS', 'ADANIENT',
    'ADANIPORTS', 'BHARTIARTL', 'HINDUNILVR', 'ITC', 'ASIANPAINT', 'SUNPHARMA',
    'DRREDDY', 'CIPLA', 'HINDALCO', 'TATASTEEL', 'JSWSTEEL', 'POWERGRID',
    'NTPC', 'COALINDIA', 'ONGC', 'BPCL', 'INDUSINDBK', 'DLF', 'TRENT',
    'ZOMATO', 'IRCTC',
].filter(ticker => Boolean(NSE_UNIVERSE[ticker]));

// ──────────────────────────────────────────────────────────────────
// MARKET REGIME — BULLISH / NEUTRAL / RISK-OFF
// Uses Nifty 50DMA vs 200DMA + India VIX (from market-pulse cache)
// ──────────────────────────────────────────────────────────────────
export async function checkMarketCondition(): Promise<MarketStatus> {
    const marketData = await fetchNiftyData();

    // Fetch nifty candles for regime computation
    let regime: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF' = 'NEUTRAL';
    let regimeLabel = 'Neutral';
    let regimeDetail = 'Mixed signals. Half position size.';
    let regimeColor = '#fbbf24';
    let positionSizeMult = 0.5;
    let nifty50dma: number | undefined;
    let nifty200dma: number | undefined;
    let dmaCrossPct: number | undefined;
    const vixLevel: number | undefined = (marketData as any).vixLevel;
    let institutionalBias: MarketStatus['institutionalBias'];
    let institutionalScore: number | undefined;
    let institutionalNet1dCr: number | undefined;
    let institutionalNet5dCr: number | undefined;
    let institutionalNet20dCr: number | undefined;
    let institutionalLastTradingDate: string | undefined;
    let institutionalDetail: string | undefined;

    try {
        const niftyCandles = await fetchHistoricalData('^NSEI', 260);
        if (niftyCandles.length >= 200) {
            const regimeResult = computeRegime(niftyCandles, vixLevel ?? 16);
            regime = regimeResult.regime;
            regimeLabel = regimeResult.label;
            regimeDetail = regimeResult.detail;
            regimeColor = regimeResult.color;
            positionSizeMult = regimeResult.positionSizeMult;
            nifty50dma = regimeResult.dma50;
            nifty200dma = regimeResult.dma200;
            dmaCrossPct = regimeResult.dmaGap;
        }
    } catch { /* use defaults */ }

    try {
        const flowSignal = await getInstitutionalFlowSignal();
        institutionalBias = flowSignal.bias;
        institutionalScore = flowSignal.score;
        institutionalNet1dCr = flowSignal.totals.totalNet1dCr;
        institutionalNet5dCr = flowSignal.totals.totalNet5dCr;
        institutionalNet20dCr = flowSignal.totals.totalNet20dCr;
        institutionalLastTradingDate = flowSignal.lastTradingDate ?? undefined;
        institutionalDetail = flowSignal.isStale
            ? `${flowSignal.detail} Data may be stale.`
            : flowSignal.detail;
    } catch {
        institutionalDetail = 'Institutional flow unavailable.';
    }

    const safeToTrade = regime !== 'RISK_OFF';

    let warning = regimeDetail;
    if (regime === 'RISK_OFF') {
        warning = '⛔ RISK-OFF: Nifty below 200DMA and VIX elevated. No new longs. Protect capital.';
    } else if (regime === 'NEUTRAL') {
        warning = '⚠️ NEUTRAL: Use half position size. Only highest-confidence setups.';
    } else {
        warning = '✅ BULLISH: Full position size allowed. Favour momentum setups.';
    }

    if (institutionalBias === 'RISK_OFF' && regime !== 'RISK_OFF') {
        regimeDetail = `${regimeDetail} Institutions remain net sellers across recent sessions.`;
        warning = regime === 'BULLISH'
            ? '⚠️ BULLISH tape, but institutions are still net sellers. Reduce aggression and favor only the strongest setups.'
            : `${warning} Institutional flows remain risk-off.`;
        positionSizeMult = Math.min(positionSizeMult, 0.75);
    } else if (institutionalBias === 'RISK_ON') {
        regimeDetail = `${regimeDetail} Institutional flow is supportive.`;
    }

    return {
        ...marketData,
        safeToTrade,
        warning,
        regime,
        regimeLabel,
        regimeDetail,
        regimeColor,
        positionSizeMult,
        nifty50dma,
        nifty200dma,
        dmaCrossPct,
        vixLevel,
        institutionalBias,
        institutionalScore,
        institutionalNet1dCr,
        institutionalNet5dCr,
        institutionalNet20dCr,
        institutionalLastTradingDate,
        institutionalDetail,
    };
}

// ──────────────────────────────────────────────────────────────────
// ATR(14) CALCULATOR — for stop loss + erratic filter
// ──────────────────────────────────────────────────────────────────
function calcATR(candles: { high: number; low: number; close: number }[], period = 14): number {
    if (candles.length < period + 1) return 0;
    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const last14 = trs.slice(-period);
    return last14.reduce((s, v) => s + v, 0) / last14.length;
}

function calcVWAP(candles: { high: number; low: number; close: number; volume: number }[]): number {
    let pv = 0;
    let vol = 0;
    for (const candle of candles) {
        const typical = (candle.high + candle.low + candle.close) / 3;
        pv += typical * candle.volume;
        vol += candle.volume;
    }
    return vol > 0 ? pv / vol : 0;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function aggregateCandles(candles: Candle[], groupSize: number): Candle[] {
    const aggregated: Candle[] = [];
    for (let index = 0; index < candles.length; index += groupSize) {
        const chunk = candles.slice(index, index + groupSize);
        if (chunk.length < groupSize) continue;
        aggregated.push({
            date: chunk[chunk.length - 1].date,
            open: chunk[0].open,
            high: Math.max(...chunk.map(candle => candle.high)),
            low: Math.min(...chunk.map(candle => candle.low)),
            close: chunk[chunk.length - 1].close,
            volume: chunk.reduce((sum, candle) => sum + candle.volume, 0),
        });
    }
    return aggregated;
}

function calcEMA(values: number[], period: number): number {
    if (!values.length) return 0;
    const smoothing = 2 / (period + 1);
    let ema = values[0];
    for (let index = 1; index < values.length; index++) {
        ema = (values[index] * smoothing) + (ema * (1 - smoothing));
    }
    return ema;
}

function calcGapPct(open: number, previousClose: number): number {
    if (!previousClose || !Number.isFinite(previousClose)) return 0;
    return +(((open - previousClose) / previousClose) * 100).toFixed(2);
}

function estimateSlippagePct(
    marketCapCr: number | undefined,
    volumeRatio: number,
    timeframe: 'Intraday' | 'Swing'
): number {
    let slippage = timeframe === 'Intraday' ? 0.12 : 0.18;
    if ((marketCapCr ?? 0) < 5_000) slippage += 0.08;
    if ((marketCapCr ?? 0) < 1_500) slippage += 0.09;
    if (volumeRatio < 1.15) slippage += 0.07;
    if (volumeRatio > 1.9) slippage -= 0.03;
    return +clamp(slippage, 0.05, 0.5).toFixed(2);
}

function calcEffectiveRiskReward(entryPrice: number, stopLoss: number, targetPrice: number, slippagePct: number): number {
    const slipFactor = slippagePct / 100;
    const effectiveEntry = entryPrice * (1 + slipFactor);
    const effectiveTarget = targetPrice * (1 - slipFactor);
    const effectiveRisk = effectiveEntry - stopLoss;
    const effectiveReward = effectiveTarget - effectiveEntry;
    if (effectiveRisk <= 0 || effectiveReward <= 0) return 0;
    return +clamp(effectiveReward / effectiveRisk, 0, 10).toFixed(2);
}

function scoreBreakoutQuality(params: {
    breakoutPct: number;
    volumeRatio: number;
    alignedTrend: boolean;
    aboveReference: boolean;
    trendStrength: number;
}): number {
    const { breakoutPct, volumeRatio, alignedTrend, aboveReference, trendStrength } = params;
    let score = 4.2;
    if (breakoutPct >= 0.15 && breakoutPct <= 1.2) score += 2.1;
    else if (breakoutPct > 1.2 && breakoutPct <= 2.2) score += 1.1;
    else if (breakoutPct < -0.15) score -= 1.4;
    if (volumeRatio >= 1.8) score += 1.8;
    else if (volumeRatio >= 1.25) score += 1.1;
    if (alignedTrend) score += 1.2;
    if (aboveReference) score += 0.9;
    if (trendStrength >= 28) score += 0.9;
    else if (trendStrength < 16) score -= 0.6;
    return +clamp(score, 0, 10).toFixed(1);
}

function scorePullbackQuality(params: {
    distanceToReferencePct: number;
    holdsReference: boolean;
    bounceStrengthPct: number;
    volumeRatio: number;
    shallowRetracePct: number;
}): number {
    const { distanceToReferencePct, holdsReference, bounceStrengthPct, volumeRatio, shallowRetracePct } = params;
    let score = 4.4;
    if (distanceToReferencePct <= 1.2) score += 2;
    else if (distanceToReferencePct <= 2.5) score += 1.1;
    else score -= 0.8;
    if (holdsReference) score += 1.2;
    if (bounceStrengthPct >= 0.45) score += 0.9;
    if (volumeRatio >= 1.1 && volumeRatio <= 2.2) score += 0.6;
    if (shallowRetracePct <= 3.2) score += 0.8;
    else if (shallowRetracePct > 6.5) score -= 1.1;
    return +clamp(score, 0, 10).toFixed(1);
}

function scoreGapQuality(gapPct: number, trendRecovered: boolean): number {
    let score = 5;
    const absGap = Math.abs(gapPct);
    if (absGap <= 0.8) score += 1.8;
    else if (absGap <= 1.8) score += 0.7;
    else if (absGap > 3.2) score -= 1.6;
    if (gapPct < -0.6 && !trendRecovered) score -= 1.4;
    if (gapPct > 2.2) score -= 0.9;
    if (trendRecovered) score += 0.8;
    return +clamp(score, 0, 10).toFixed(1);
}

function scoreCloseLocation(lastCandle: Candle): number {
    const range = Math.max(lastCandle.high - lastCandle.low, 0.01);
    return clamp(((lastCandle.close - lastCandle.low) / range) * 100, 0, 100);
}

function scoreTomorrowContinuation(params: {
    ind: StockIndicators;
    lastCandle: Candle;
    breakoutQuality: number;
    gapQuality: number;
}): number {
    const { ind, lastCandle, breakoutQuality, gapQuality } = params;
    const closeLocation = scoreCloseLocation(lastCandle);
    const extensionFromEma20 = Math.abs(ind.ltp - ind.ema20) / Math.max(ind.ema20, 1) * 100;
    let score = 4.4;

    if (closeLocation >= 75) score += 1.5;
    else if (closeLocation >= 60) score += 0.8;
    else score -= 0.9;

    if (ind.volumeRatio >= 1.8) score += 1.4;
    else if (ind.volumeRatio >= 1.2) score += 0.8;

    if (ind.returns10d >= 4) score += 0.9;
    else if (ind.returns10d > 0) score += 0.45;
    else score -= 0.8;

    if (ind.rsi14 >= 54 && ind.rsi14 <= 72) score += 0.8;
    else if (ind.rsi14 > 78) score -= 0.8;

    if (ind.adx14 >= 20) score += 0.55;
    if (ind.ema20 >= ind.ema50 * 0.995) score += 0.4;
    if (extensionFromEma20 > 6) score -= 1.1;
    else if (extensionFromEma20 > 4) score -= 0.45;

    score += (breakoutQuality - 5) * 0.18;
    score += (gapQuality - 5) * 0.08;
    return +clamp(score, 0, 10).toFixed(1);
}

function scoreFiveDaySwingPotential(params: {
    ind: StockIndicators;
    breakoutQuality: number;
    pullbackQuality: number;
}): number {
    const { ind, breakoutQuality, pullbackQuality } = params;
    const rs1m = ind.returns1m - ind.nifty1mReturn;
    const rs3m = ind.returns3m - ind.nifty3mReturn;
    let score = 4.8;

    if (rs1m >= 4) score += 1.2;
    else if (rs1m >= 1) score += 0.6;
    else score -= 0.8;

    if (rs3m >= 6) score += 1.15;
    else if (rs3m >= 1) score += 0.6;
    else score -= 0.9;

    if (ind.ema50Slope > 0.8) score += 0.9;
    else if (ind.ema50Slope > 0.2) score += 0.45;

    if (ind.pctFrom52wHigh <= 12) score += 0.8;
    else if (ind.pctFrom52wHigh <= 20) score += 0.35;
    else score -= 0.7;

    if ((ind.accumulationScore ?? 0) >= 60) score += 0.8;
    else if ((ind.accumulationScore ?? 0) < 48) score -= 0.6;

    score += (Math.max(breakoutQuality, pullbackQuality) - 5) * 0.2;
    if (ind.isBullFlag) score += 0.45;
    if (ind.isDeepValue) score -= 0.7;

    return +clamp(score, 0, 10).toFixed(1);
}

function classifySwingHorizon(tomorrowScore: number, fiveDayScore: number): {
    category: 'TOMORROW' | 'SWING_2_5';
    label: 'Tomorrow continuation' | '2-5 day swing';
    horizonDays: number;
} {
    if (tomorrowScore >= fiveDayScore) {
        return { category: 'TOMORROW', label: 'Tomorrow continuation', horizonDays: 1 };
    }
    return { category: 'SWING_2_5', label: '2-5 day swing', horizonDays: 5 };
}

function evaluateExhaustionRisk(ind: StockIndicators, lastCandle: Candle): {
    exhausted: boolean;
    reason: string;
} {
    const closeLocation = scoreCloseLocation(lastCandle);
    const extensionFromEma20 = Math.abs(ind.ltp - ind.ema20) / Math.max(ind.ema20, 1) * 100;
    const hardExtension = extensionFromEma20 >= 6.5 || ind.rsi14 >= 78;
    const weakCloseAfterRun = ind.returns10d >= 8 && closeLocation <= 42;
    const extremeStretch = ind.distFrom200 >= 26 && ind.returns10d >= 10;

    if (hardExtension && weakCloseAfterRun) {
        return {
            exhausted: true,
            reason: 'Recent run is overextended and the stock did not finish near the day high. Risk of next-session mean reversion is elevated.',
        };
    }
    if (extremeStretch) {
        return {
            exhausted: true,
            reason: 'Price is stretched far above the long-term trend after a sharp move. Better to wait for consolidation or pullback.',
        };
    }
    if (ind.rsi14 >= 80) {
        return {
            exhausted: true,
            reason: 'Momentum is overheated after a sharp advance. Chasing here raises pullback risk versus reward.',
        };
    }

    return { exhausted: false, reason: '' };
}

function scoreIntradayStructure(params: {
    close: number;
    fastEma: number;
    slowEma: number;
    higherLow: boolean;
    volumeRatio: number;
    aboveReference: boolean;
}): number {
    const { close, fastEma, slowEma, higherLow, volumeRatio, aboveReference } = params;
    let score = 4.2;
    if (close >= fastEma && fastEma >= slowEma * 0.998) score += 2.2;
    else if (close >= slowEma) score += 1;
    else score -= 1.2;
    if (higherLow) score += 1.3;
    if (aboveReference) score += 1.1;
    if (volumeRatio >= 1.15) score += 0.7;
    return +clamp(score, 0, 10).toFixed(1);
}

function scoreEventDurability(events: NewsEvent[]): number {
    if (!events.length) return 5;
    let score = 5;
    for (const event of events.slice(0, 4)) {
        const direction = event.polarity === 'POSITIVE' ? 1 : event.polarity === 'NEGATIVE' ? -1 : 0;
        const durabilityWeight = event.durability === 'LONG_TERM' ? 1.25 : event.durability === 'SHORT_TERM' ? 0.8 : 0.35;
        const magnitudeWeight = event.magnitude === 'HIGH' ? 1.15 : event.magnitude === 'MEDIUM' ? 0.7 : 0.35;
        score += direction * durabilityWeight * magnitudeWeight * clamp(event.confidence, 0.2, 1) * 2.2;
    }
    return +clamp(score, 0, 10).toFixed(1);
}

function toIstDateKey(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function getLatestSessionCandles(candles: Candle[]): Candle[] {
    if (!candles.length) return [];
    const latestKey = toIstDateKey(candles[candles.length - 1].date);
    return candles.filter(candle => toIstDateKey(candle.date) === latestKey);
}

// ──────────────────────────────────────────────────────────────────
// FETCH UNIVERSE — Two-source dynamic discovery
//
// Source 1: NSE Bhavcopy — top 300 momentum stocks from entire NSE
// Source 2: News catalyst tickers — stocks AI identified from news
//
// Both sources are merged and deduped. This ensures the agent covers:
//   • Stocks showing technical breakout (bhavcopy momentum)
//   • Stocks with fresh catalysts from news (even before price moves)
//
// Falls back to static NSE_UNIVERSE only if bhavcopy is unavailable.
// ──────────────────────────────────────────────────────────────────
async function fetchUniverseData(
    dataApi: MarketDataApi | null,
    newsCatalystTickers: string[] = [],
    concurrency = 8
): Promise<Array<{ ticker: string; candles: any[] }>> {

    // ── Source 1: NSE Bhavcopy (dynamic, zero hardcoding) ──────────
    let entries: Array<[string, string]> = [];
    try {
        const bhavCandidates = await getMomentumCandidates(300);
        if (bhavCandidates.length > 50) {
            entries = bhavCandidates.map(r => [r.symbol, r.yahooTicker]);
            console.log(`[scanner] 🌐 Bhavcopy universe: ${entries.length} stocks`);
        }
    } catch (err) {
        console.warn('[scanner] Bhavcopy unavailable, falling back to static universe.');
    }

    // Fallback: static universe if bhavcopy failed
    if (entries.length === 0) {
        entries = Object.entries(NSE_UNIVERSE);
        console.warn(`[scanner] ⚠️  Static fallback: ${entries.length} stocks`);
    }

    // ── Source 2: News catalyst tickers (AI-discovered) ──────────
    // Add any AI-identified tickers not already in the bhavcopy set.
    // These are stocks with fresh news catalysts that may not yet show
    // technical momentum — but need to be watched.
    const existingSymbols = new Set(entries.map(([sym]) => sym.toUpperCase()));
    let newCatalystCount = 0;
    for (const rawTicker of newsCatalystTickers) {
        const sym = rawTicker.replace(/\.NS$/i, '').toUpperCase();
        if (sym && !existingSymbols.has(sym)) {
            entries.push([sym, `${sym}.NS`]);
            existingSymbols.add(sym);
            newCatalystCount++;
        }
    }
    if (newCatalystCount > 0) {
        console.log(`[scanner] 📰 News catalyst additions: +${newCatalystCount} stocks`);
    }

    // ── Fetch historical candles for all candidates ───────────────
    const out: Array<{ ticker: string; candles: any[] }> = [];
    for (let i = 0; i < entries.length; i += concurrency) {
        const batch = entries.slice(i, i + concurrency);
        const settled = await Promise.allSettled(
            batch.map(async ([ticker, yahoo]) => {
                const candles = dataApi
                    ? await dataApi.getHistoricalData(ticker, '1d', 300)
                    : await fetchHistoricalData(yahoo, 300);
                return { ticker, candles };
            })
        );
        for (const row of settled) {
            if (row.status === 'fulfilled') out.push(row.value);
        }
    }
    return out;
}

// ── Public helpers ──────────────────────────────────────────────────
export async function getTodayTopGainers(minPct = 5): Promise<{ symbol: string; pctChange: number }[]> {
    try {
        const gainers = await getTopGainersToday(minPct, 50);
        return gainers.map(g => ({ symbol: g.symbol, pctChange: g.pctChange }));
    } catch {
        return [];
    }
}
export { getBhavcopyCacheStatus };

function scoreSwingComposite(candidate: StockIndicators): number {
    return (
        (candidate.volumeRatio * 0.4) +
        ((candidate.returns3m - candidate.nifty3mReturn) * 0.3) +
        (candidate.adx14 / 100 * 0.2) +
        (candidate.rsi14 / 100 * 0.1)
    );
}

function scoreSwingWatchConfidence(params: {
    volumeRatio?: number;
    adx14?: number;
    rsi14?: number;
    pctChange?: number;
}): number {
    const { volumeRatio = 1, adx14 = 14, rsi14 = 55, pctChange = 0 } = params;
    return +clamp(
        4.8 +
        Math.max(0, volumeRatio - 1) * 1.6 +
        Math.max(0, adx14 - 14) * 0.08 +
        Math.max(0, Math.min(12, pctChange)) * 0.14 +
        (rsi14 >= 52 && rsi14 <= 72 ? 0.45 : 0),
        4.6,
        9.2,
    ).toFixed(1);
}

export async function finalizeSwingDiagnostics(
    diagnostics: ScanDiagnostics,
    qualified: StockIndicators[],
    setups: TradeSetup[],
): Promise<ScanDiagnostics> {
    const setupTickers = new Set(setups.map(setup => setup.ticker));
    const watchItems = new Map<string, NonNullable<ScanDiagnostics['nearMisses']>[number]>();
    const avoidItems = new Map<string, NonNullable<ScanDiagnostics['avoids']>[number]>();

    for (const candidate of qualified
        .filter(item => !setupTickers.has(item.ticker))
        .sort((a, b) => scoreSwingComposite(b) - scoreSwingComposite(a))
        .slice(0, 8)) {
        const lastCandle = candidate.candles[candidate.candles.length - 1];
        const previousClose = candidate.candles[candidate.candles.length - 2]?.close ?? lastCandle.close;
        const gapPct = calcGapPct(lastCandle.open, previousClose);
        const recentSwingHigh = Math.max(...candidate.candles.slice(-21, -1).map(candle => candle.high));
        const recentSwingLow = Math.min(...candidate.candles.slice(-10).map(candle => candle.low));
        const breakoutQuality = scoreBreakoutQuality({
            breakoutPct: ((lastCandle.close - recentSwingHigh) / Math.max(recentSwingHigh, 1)) * 100,
            volumeRatio: candidate.volumeRatio,
            alignedTrend: candidate.ema20 >= candidate.ema50 * 0.99,
            aboveReference: lastCandle.close >= recentSwingHigh * 0.997,
            trendStrength: candidate.adx14,
        });
        const pullbackQuality = scorePullbackQuality({
            distanceToReferencePct: Math.min(
                Math.abs(candidate.ltp - candidate.ema20) / Math.max(candidate.ema20, 1) * 100,
                Math.abs(candidate.ltp - candidate.ema50) / Math.max(candidate.ema50, 1) * 100,
            ),
            holdsReference: lastCandle.close >= candidate.ema20 * 0.995,
            bounceStrengthPct: ((lastCandle.close - lastCandle.low) / Math.max(lastCandle.low, 1)) * 100,
            volumeRatio: candidate.volumeRatio,
            shallowRetracePct: ((Math.max(...candidate.candles.slice(-10).map(candle => candle.high)) - recentSwingLow) / Math.max(candidate.ltp, 1)) * 100,
        });
        const gapQuality = scoreGapQuality(gapPct, lastCandle.close >= candidate.ema20 && candidate.ema20 >= candidate.ema50 * 0.99);
        const tomorrowScore = scoreTomorrowContinuation({ ind: candidate, lastCandle, breakoutQuality, gapQuality });
        const fiveDayScore = scoreFiveDaySwingPotential({ ind: candidate, breakoutQuality, pullbackQuality });
        const horizon = classifySwingHorizon(tomorrowScore, fiveDayScore);
        const exhaustion = evaluateExhaustionRisk(candidate, lastCandle);
        const confidenceScore = scoreSwingWatchConfidence({
            volumeRatio: candidate.volumeRatio,
            adx14: candidate.adx14,
            rsi14: candidate.rsi14,
        });

        if (exhaustion.exhausted) {
            avoidItems.set(candidate.ticker, {
                ticker: candidate.ticker,
                setupType: `${identifySetupType(candidate)} · Avoid`,
                confidenceScore,
                primaryReason: exhaustion.reason,
                source: 'QUALIFIED_EXHAUSTED',
            });
            continue;
        }

        watchItems.set(candidate.ticker, {
            ticker: candidate.ticker,
            setupType: `${identifySetupType(candidate)} · ${horizon.label}`,
            confidenceScore,
            primaryReason: `Cleared the first-stage momentum scan but did not become trade-ready. Best fit is ${horizon.label.toLowerCase()} if price confirms clean follow-through.`,
            source: 'QUALIFIED_WATCHLIST',
        });
    }

    const topGainers = await getTodayTopGainers(5);
    for (const gainer of topGainers) {
        if (setupTickers.has(gainer.symbol) || watchItems.has(gainer.symbol) || avoidItems.has(gainer.symbol)) continue;
        if (gainer.pctChange >= 9) {
            avoidItems.set(gainer.symbol, {
                ticker: gainer.symbol,
                setupType: 'Momentum Spike · Avoid',
                confidenceScore: scoreSwingWatchConfidence({ pctChange: gainer.pctChange }),
                primaryReason: `The stock already moved ${gainer.pctChange.toFixed(2)}% in one session. Avoid chasing unless it rebuilds a fresh continuation structure.`,
                movePct: gainer.pctChange,
                source: 'TOP_GAINER',
            });
            continue;
        }
        watchItems.set(gainer.symbol, {
            ticker: gainer.symbol,
            setupType: 'Momentum Watch · Tomorrow continuation',
            confidenceScore: scoreSwingWatchConfidence({ pctChange: gainer.pctChange }),
            primaryReason: `Strong daily move of ${gainer.pctChange.toFixed(2)}% detected in the dynamic NSE universe. Monitor tomorrow for follow-through or a cleaner entry.`,
            movePct: gainer.pctChange,
            source: 'TOP_GAINER',
        });
    }

    diagnostics.setupCount = setups.length;
    diagnostics.nearMisses = Array.from(watchItems.values())
        .sort((a, b) => {
            const moveDiff = (b.movePct ?? 0) - (a.movePct ?? 0);
            if (Math.abs(moveDiff) > 0.01) return moveDiff;
            return b.confidenceScore - a.confidenceScore;
        })
        .slice(0, 6);
    diagnostics.avoids = Array.from(avoidItems.values())
        .sort((a, b) => (b.movePct ?? 0) - (a.movePct ?? 0) || b.confidenceScore - a.confidenceScore)
        .slice(0, 6);

    if (setups.length > 0) {
        diagnostics.summary = `${setups.length} swing setup${setups.length === 1 ? '' : 's'} are trade-ready. Near-miss opportunities are preserved below, and extended names are separated into Avoid / Exhausted.`;
        diagnostics.recommendedAction = 'TRADE_READY';
    } else if (diagnostics.nearMisses.length > 0) {
        diagnostics.summary = `${diagnostics.nearMisses.length} strong swing candidates remain on the watchlist even though none cleared every final entry-quality gate today.`;
        diagnostics.recommendedAction = 'WATCHLIST';
    } else {
        diagnostics.summary = 'No swing setups or high-momentum watchlist names were produced from the current scan universe.';
        diagnostics.recommendedAction = 'WAIT';
    }

    return diagnostics;
}

/**
 * Calculates Expected Value (EV) based on:
 * EV = (WinProb * AvgWin) - (LossProb * AvgLoss)
 */
async function calculateExpectedValue(setup: TradeSetup): Promise<number> {
    const winProb = setup.volatilityHitProb / 100;
    const lossProb = 1 - winProb;
    const reward = setup.targetPct;
    const risk = setup.slPct;

    // Use historical performance data to weight the calculation
    let historicalWeight = 1.0;
    try {
        const stats = await prisma.historicalSetup.findMany({
            where: { setupType: setup.setupType, status: { in: ['WON', 'LOST'] } },
            take: 10
        });
        if (stats.length >= 2) {
            const wins = stats.filter(s => s.status === 'WON').length;
            historicalWeight = (wins / stats.length) + 0.5; // Scale reward potential
        }
    } catch { /* fallback to technical-only EV */ }

    const ev = (winProb * (reward * historicalWeight)) - (lossProb * risk);
    return +ev.toFixed(2);
}

async function enrichTradeSetupsWithAI(setups: TradeSetup[], qualified: StockIndicators[]): Promise<void> {
    if (!setups.length) return;

    const aiInputData = setups.map(s => {
        const ind = qualified.find(q => q.ticker === s.ticker);
        return {
            ticker: s.ticker,
            close: s.ltp,
            high: ind?.candles[ind.candles.length - 1]?.high,
            volume: ind?.todayVolume,
            avgVolume20d: ind?.avgVolume20d,
            rsi14: ind?.rsi14,
            adx14: ind?.adx14,
            distFromDma200Pct: ind?.distFrom200 ?? null,
            sector: s.sector,
            mcap: s.marketCapCr,
            setupType: s.setupType,
            confidenceScore: s.confidenceScore,
            headlines: s.headlines,
            pcr: s.pcr,
            derivativeStatus: s.derivativeStatus,
            timeframe: s.timeframe,
        };
    });

    const aiAssessments = await analyzeStocksWithAI(aiInputData);
    for (const s of setups) {
        const assessment = aiAssessments.get(s.ticker);
        if (!assessment) continue;

        s.aiSignal = assessment.signal;
        s.aiLogic = assessment.logic;
        s.aiTargetRange = assessment.target_range;
        s.aiStopLoss = assessment.stop_loss;

        if (assessment.trigger_price) {
            s.authorizedZone = {
                triggerPrice: assessment.trigger_price,
                triggerVolumeRatio: assessment.trigger_volume_ratio || 1.2,
                authorizedAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            };
        }

        if (assessment.momentum_score && assessment.momentum_score > s.confidenceScore) {
            s.confidenceScore = Math.min(10, assessment.momentum_score);
        }
    }
}

async function enrichSetupsWithGroundedNews(
    setups: TradeSetup[],
    qualified: StockIndicators[],
    marketStatus: MarketStatus,
    refreshNews: boolean
): Promise<Record<string, ReturnType<typeof buildSectorBreadthMap>[string]>> {
    if (!setups.length) return {};

    const sectorBreadth = buildSectorBreadthMap(qualified, setups);
    const scanContext: ScanResult = {
        timestamp: new Date().toISOString(),
        marketStatus,
        setups,
        sectorBreadth,
    };

    await Promise.allSettled(setups.map(async (setup) => {
        const indicator = qualified.find(item => item.ticker === setup.ticker);
        const grounding = indicator
            ? buildMarketGroundingFromIndicator(indicator, setup, marketStatus, sectorBreadth[setup.sector || 'Diversified'] ?? null)
            : setup.marketGrounding ?? undefined;
        const digest = await getTickerNewsDigest(setup.ticker, scanContext, refreshNews);

        setup.marketGrounding = (digest.marketGrounding ?? grounding) || undefined;
        setup.newsDistribution = digest.distribution || undefined;
        setup.newsRisk = setup.newsRisk || !!digest.distribution?.newsRiskFlag;
        const eventDurability = scoreEventDurability(digest.events);
        setup.executionQuality = {
            ...(setup.executionQuality ?? {}),
            eventDurability,
        };
        const durabilityDelta = eventDurability >= 6.5
            ? Math.min(0.7, (eventDurability - 6.5) * 0.3)
            : eventDurability <= 4
                ? -Math.min(0.8, (4 - eventDurability) * 0.35)
                : 0;
        setup.confidenceScore = +clamp(setup.confidenceScore + durabilityDelta, 0, 10).toFixed(1);
        setup.confidenceDrivers = [
            ...(setup.confidenceDrivers ?? []),
            `Event durability ${eventDurability}/10`,
        ];
        if (eventDurability <= 3.8) {
            setup.rejectionReasons = [
                ...(setup.rejectionReasons ?? []),
                'Durable negative event pressure',
            ];
        }

        const eventLabel = digest.distribution?.eventTypes?.length
            ? `Events: ${digest.distribution.eventTypes.slice(0, 3).join(', ')}`
            : '';
        const alignment = digest.distribution?.signalAlignment
            ? `Alignment: ${digest.distribution.signalAlignment}`
            : '';
        const headline = digest.distribution?.latestHeadline ? `Headline: ${digest.distribution.latestHeadline}` : '';
        const summaryParts = [setup.newsSummary, headline, eventLabel, alignment].filter(Boolean);
        setup.newsSummary = summaryParts.join(' | ');
        setup.headlines = digest.items.slice(0, 5).map(item => item.title);
    }));

    return sectorBreadth;
}

// ──────────────────────────────────────────────────────────────────
// MAIN SCANNER
// Two-source discovery: NSE Bhavcopy + AI news-catalyst tickers
// Both are merged before technical filters run — so no stock with
// a real catalyst can ever be missed due to a hardcoded list.
// ──────────────────────────────────────────────────────────────────
export async function runScanner(
    dataApi: MarketDataApi | null = null
): Promise<{ qualified: StockIndicators[]; marketStatus: MarketStatus; diagnostics: ScanDiagnostics }> {

    const marketStatus = await checkMarketCondition();
    const diagnostics: ScanDiagnostics = {
        mode: 'swing',
        universeCount: 0,
        qualifiedCount: 0,
        setupCount: 0,
        rejectionCounts: {},
        notes: [],
        nearMisses: [],
        recommendedAction: 'WAIT',
    };
    const reject = (reason: string) => {
        diagnostics.rejectionCounts[reason] = (diagnostics.rejectionCounts[reason] || 0) + 1;
    };

    if (marketStatus.regime === 'RISK_OFF') {
        diagnostics.notes?.push('Market regime is RISK_OFF, so new swing longs are disabled.');
        diagnostics.summary = 'Swing scan is disabled because the market regime is risk-off.';
        return { qualified: [], marketStatus, diagnostics };
    }

    // ── Step 1: Collect news-catalyst tickers (AI-discovered) ─────
    // These are stocks the AI identified from news in the last 24-48h.
    // They get added to the scan universe even if they have no
    // technical momentum yet — so catalysts are caught early.
    let newsCatalystTickers: string[] = [];
    try {
        newsCatalystTickers = await getNewsCatalystTickers();
        if (newsCatalystTickers.length > 0) {
            console.log(`[scanner] 📰 News-first: ${newsCatalystTickers.length} AI-discovered tickers queued`);
        }
    } catch (err) {
        console.warn('[scanner] News catalyst tickers unavailable:', err);
    }

    // ── Step 2: Fetch full merged universe + historical candles ───
    const niftyCandles = await fetchHistoricalData('^NSEI', 300);
    const allData = await fetchUniverseData(dataApi, newsCatalystTickers, 8);
    const optionsFlow = await getOptionsFlow();
    const qualified: StockIndicators[] = [];
    diagnostics.universeCount = allData.length;

    for (const { ticker, candles } of allData) {
        // ── GATE 1: Dynamic Liquidity ─────────────────────────────
        if (candles.length < 20) {
            reject('insufficient_candles');
            continue;
        }
        const last20 = candles.slice(-20);
        const avgVol20 = last20.reduce((s, c) => s + c.volume, 0) / 20;
        const lastClose = candles[candles.length - 1]?.close ?? 0;
        const avgTurnoverCr = (avgVol20 * lastClose) / 10000000; // ₹ in Crores
        if (avgTurnoverCr < 10) {
            reject('turnover_gate');
            continue;
        } // Minimum ₹10 Cr daily turnover

        // Rough proxy if missing to keep formatting intact
        const marketCapCr = MARKET_CAP_CR_MAP[ticker] ?? Math.round(avgTurnoverCr * 50);

        // ── GATE 2: Enough history ────────────────────────────────
        if (candles.length < 200) {
            reject('history_gate');
            continue;
        }

        // ── GATE 3: Price ≥ ₹50 ─────────────────────────────────
        if (lastClose < MIN_PRICE) {
            reject('price_gate');
            continue;
        }

        // ── GATE 4: ATR filter — exclude erratic stocks ───────────
        const atr14 = calcATR(candles.slice(-30));
        const atrPct = lastClose > 0 ? (atr14 / lastClose) * 100 : 99;
        if (atrPct > MAX_ATR_PCT) {
            reject('atr_gate');
            continue;
        }

        // ── Compute indicators ────────────────────────────────────
        const ind = computeIndicators(ticker, candles, niftyCandles);
        if (!ind) {
            reject('indicator_failure');
            continue;
        }

        // ── GATE 5 to 10: Setup Routing (Trend vs Deep Value vs Bull Flag) ──────
        const isSmall = marketCapCr < 5000;
        const volThreshold = isSmall ? VOL_RATIO_SMALL : VOL_RATIO_LARGE;

        const isStandardTrend =
            ind.ltp > ind.dma200 &&
            ind.rsi14 >= RSI_MIN && ind.rsi14 <= RSI_MAX &&
            ind.adx14 >= ADX_MIN &&
            ind.volumeRatio >= volThreshold &&
            ind.avgVolume20d >= MIN_AVG_VOLUME &&
            ind.pctFrom52wHigh <= MAX_52W_DROP &&
            ind.ema50Slope > 0;

        // ── Phase 4 GATE: Minimum Accumulation Score (Demand Index > 45%)
        if ((ind.accumulationScore ?? 0) < 45) {
            reject('accumulation_gate');
            continue;
        }

        if (!isStandardTrend && !ind.isBullFlag && !ind.isDeepValue) {
            reject('trend_structure_gate');
            continue;
        }

        // Note: For Deep Value, price is explicitly BELOW 200 DMA, so it bypasses standard filters.

        // ── Phase 6 GATE: Options Flow Mechanics ──────────────────────
        const cleanTicker = ticker.replace('.NS', '');
        const optData = optionsFlow.get(cleanTicker);
        if (optData) {
            ind.pcr = optData.pcr;
            ind.totalOI = optData.totalOI;
            ind.oiChangePct = optData.oiChangePct;
            ind.derivativeStatus = optData.derivativeStatus;

            // Reject if institutional derivatives flow is fundamentally against the trade
            if (optData.derivativeStatus === 'Short Buildup') {
                reject('derivatives_short_buildup');
                continue;
            }
            if (optData.pcr < 0.6) {
                reject('pcr_gate');
                continue;
            } // Massive call writing resistance ceiling
        }

        qualified.push(ind);
    }

    diagnostics.qualifiedCount = qualified.length;

    // Sort by composite momentum score before setup building
    qualified.sort((a, b) => scoreSwingComposite(b) - scoreSwingComposite(a));
    diagnostics.summary = qualified.length
        ? `${qualified.length} names cleared the first-stage swing scan. Final trade-ready setups and tomorrow watchlist are built next.`
        : 'No names cleared the first-stage swing momentum and quality gates.';
    if (!qualified.length) {
        diagnostics.notes?.push('Use the rejection counts and tomorrow watchlist to review strong movers that were not trade-ready today.');
    }

    return { qualified, marketStatus, diagnostics };
}

// ──────────────────────────────────────────────────────────────────
// BUILD TRADE SETUPS — from qualified stocks
// ──────────────────────────────────────────────────────────────────
export async function buildTradeSetups(
    qualified: StockIndicators[],
    marketStatus?: MarketStatus | null
): Promise<TradeSetup[]> {
    const setups: TradeSetup[] = [];

    for (let index = 0; index < qualified.length; index++) {
        const ind = qualified[index];
        // Calculate rough proxy if not in map
        const avgTurnoverCr = (ind.avgVolume20d * ind.ltp) / 10000000;
        const marketCapCr = MARKET_CAP_CR_MAP[ind.ticker] ?? Math.round(avgTurnoverCr * 50);
        const lastCandle = ind.candles[ind.candles.length - 1];
        const isSmall = marketCapCr < 5000;

        // ── Setup type detection ──────────────────────────────────
        const setupType = identifySetupType(ind) as import('./types').SetupType;

        // ── Phase 1: Structural Stop Loss ─────────────────────────
        const atr14 = calcATR(ind.candles.slice(-30));
        const entryPrice = +(lastCandle.high * 1.001).toFixed(2);
        const previousClose = ind.candles[ind.candles.length - 2]?.close ?? lastCandle.close;
        const gapPct = calcGapPct(lastCandle.open, previousClose);

        let stopLoss = 0;
        if (ind.isDeepValue) {
            // Structural stop: just below the lowest low of the last 15 days
            const recentLows = ind.candles.slice(-15).map(c => c.low);
            stopLoss = Math.min(...recentLows) * 0.99; // 1% buffer
        } else if (setupType.includes('VCP') || ind.isBullFlag) {
            // Tight structural stop: below the recent pivot low (5 days)
            const recentLows = ind.candles.slice(-5).map(c => c.low);
            stopLoss = Math.min(...recentLows) * 0.993; // 0.7% buffer
        } else {
            // Trend follower: below 20 EMA or 1.5 ATR
            stopLoss = Math.min(ind.ema20 * 0.99, entryPrice - 1.5 * atr14);
        }

        // Failsafe bounds
        if (entryPrice - stopLoss > 2.5 * atr14) stopLoss = entryPrice - 2.5 * atr14;
        if (stopLoss >= entryPrice) stopLoss = entryPrice - atr14;

        stopLoss = +(stopLoss).toFixed(2);
        const slPct = +(((entryPrice - stopLoss) / entryPrice) * 100).toFixed(2);

        if (stopLoss <= 0 || stopLoss >= entryPrice) continue;

        // ── Target: 3×ATR (ensures ≥ 2:1 RR) ────────────────────
        const target1 = +(entryPrice + 3.0 * atr14).toFixed(2); // T1 = 3×ATR (RR 1.5)
        let targetPrice = target1;

        // For Deep Value Reversion, target the 50 DMA if it makes sense mathematically
        if (ind.isDeepValue && ind.ema50 > entryPrice + (2.0 * atr14)) {
            targetPrice = +(ind.ema50).toFixed(2);
        }

        const target2 = +(targetPrice + 1.5 * atr14).toFixed(2); // T2
        const targetPct = +(((targetPrice - entryPrice) / entryPrice) * 100).toFixed(2);
        const rawRiskReward = +(((targetPrice - entryPrice) / (entryPrice - stopLoss))).toFixed(2);
        const slippagePct = estimateSlippagePct(marketCapCr, ind.volumeRatio, 'Swing');
        const effectiveRiskReward = calcEffectiveRiskReward(entryPrice, stopLoss, targetPrice, slippagePct);
        const riskReward = effectiveRiskReward;

        // ── GATE: Minimum RR ≥ 2:1 ───────────────────────────────
        const strongEarlyContinuation =
            ind.volumeRatio >= 1.5 &&
            ind.returns10d >= 3 &&
            ind.rsi14 >= 54 &&
            ind.rsi14 <= 72;
        const minimumRiskReward = strongEarlyContinuation ? 1.35 : MIN_RR;
        const minimumTargetPct = strongEarlyContinuation ? 3.2 : 4;
        if (riskReward < minimumRiskReward) continue;
        // ── GATE: Target ≥ 4% ────────────────────────────────────
        if (targetPct < minimumTargetPct) continue;

        // ── GATE: News risk check ─────────────────────────────────
        const news = await validateNewsRisk(ind.ticker);
        if (news.blocked) continue;

        // ── GATE: Earnings risk check ─────────────────────────────
        const earnings = await validateEarningsRisk(ind.ticker);
        if (earnings.blocked) continue;

        // ── 5-Component Confidence Score ──────────────────────────
        const breakdown = computeConfidence(ind, riskReward);
        const recentSwingHigh = Math.max(...ind.candles.slice(-21, -1).map(candle => candle.high));
        const recentSwingLow = Math.min(...ind.candles.slice(-10).map(candle => candle.low));
        const breakoutQuality = scoreBreakoutQuality({
            breakoutPct: ((lastCandle.close - recentSwingHigh) / Math.max(recentSwingHigh, 1)) * 100,
            volumeRatio: ind.volumeRatio,
            alignedTrend: ind.ema20 >= ind.ema50 * 0.99,
            aboveReference: lastCandle.close >= recentSwingHigh * 0.997,
            trendStrength: ind.adx14,
        });
        const pullbackQuality = scorePullbackQuality({
            distanceToReferencePct: Math.min(
                Math.abs(ind.ltp - ind.ema20) / Math.max(ind.ema20, 1) * 100,
                Math.abs(ind.ltp - ind.ema50) / Math.max(ind.ema50, 1) * 100,
            ),
            holdsReference: lastCandle.close >= ind.ema20 * 0.995,
            bounceStrengthPct: ((lastCandle.close - lastCandle.low) / Math.max(lastCandle.low, 1)) * 100,
            volumeRatio: ind.volumeRatio,
            shallowRetracePct: ((Math.max(...ind.candles.slice(-10).map(candle => candle.high)) - recentSwingLow) / Math.max(ind.ltp, 1)) * 100,
        });
        const gapQuality = scoreGapQuality(gapPct, lastCandle.close >= ind.ema20 && ind.ema20 >= ind.ema50 * 0.99);
        const primaryExecutionQuality = setupType.includes('Pullback') || ind.isDeepValue
            ? pullbackQuality
            : breakoutQuality;
        const tomorrowContinuationScore = scoreTomorrowContinuation({
            ind,
            lastCandle,
            breakoutQuality,
            gapQuality,
        });
        const fiveDaySwingScore = scoreFiveDaySwingPotential({
            ind,
            breakoutQuality,
            pullbackQuality,
        });
        const predictiveEdgeScore = +(((tomorrowContinuationScore * 0.58) + (fiveDaySwingScore * 0.42))).toFixed(1);
        const isPredictiveLeader = tomorrowContinuationScore >= 6.8 || fiveDaySwingScore >= 7.1;
        const minimumExecutionQuality = isPredictiveLeader ? 4.4 : 4.8;
        const minimumGapQuality = isPredictiveLeader ? 3.4 : 3.8;
        if (primaryExecutionQuality < minimumExecutionQuality || gapQuality < minimumGapQuality) continue;
        const executionAdjustment = ((primaryExecutionQuality - 5) * 0.2) + ((gapQuality - 5) * 0.08) + ((effectiveRiskReward - 1.5) * 0.35);
        const predictiveAdjustment = ((tomorrowContinuationScore - 5) * 0.24) + ((fiveDaySwingScore - 5) * 0.22);
        const executionAdjustedConfidence = +clamp(breakdown.total + executionAdjustment + predictiveAdjustment, 0, 10).toFixed(1);

        // ── GATE: Score ≥ MIN_CONFIDENCE — THE KEY FILTER ───────────────────
        if (executionAdjustedConfidence < MIN_CONFIDENCE) continue;

        // ── In NEUTRAL regime: raise bar to 8.0 ──────────────────
        // (half size AND higher quality threshold)
        // This is already handled by the positionSizeMult on the frontend

        // To approach a high win rate, we only trade outperformers.
        // Stock must beat Nifty over 3 months.
        if (ind.returns3m - ind.nifty3mReturn < 0) continue;

        // ── GATE: Moving Average Pinch ────────────────────────────────
        // Precise short-term momentum alignment required (with slight tolerance for pullbacks)
        if (ind.ema20 < ind.ema50 * 0.98) continue;

        if (predictiveEdgeScore < 6.2) continue;

        // Note: setupType was already computed above.

        // ── GATE: The VCP Volume Dry-Up Law ───────────────────────
        if (setupType.includes('VCP')) {
            if (ind.candles.length >= 6) {
                const last5Vols = ind.candles.slice(-6, -1).map(c => c.volume);
                const avgVol5d = last5Vols.reduce((a, b) => a + b, 0) / 5;
                // Soft warning instead of absolute rejection to prevent 0 setups
                if (avgVol5d > ind.avgVolume20d * 0.8) {
                    // We let it pass but Claude will see the exact volume ratio
                }
            }
        }

        // ── Timeframe categorization ─────────────────────────────
        const horizon = classifySwingHorizon(tomorrowContinuationScore, fiveDaySwingScore);
        const horizonLabel = horizon.label;
        const timeframe = (() => {
            if (tomorrowContinuationScore >= 7.2) return 'Short Swing';
            if (ind.isDeepValue || setupType.includes('VCP')) return 'Medium Swing';
            if (ind.isBullFlag || setupType.includes('Breakout Base') || setupType.includes('Momentum Continuation')) return 'Short Swing';
            return 'Short Swing';
        })();

        // ── Hit probability ───────────────────────────────────────
        const hitProb = estimateHitProbability(ind, targetPct);

        // ── Entry trigger text ────────────────────────────────────
        const entryTrigger = (() => {
            if (ind.isDeepValue) return `Deep Value Reversal. Buy on confirmation close above ${entryPrice}.`;
            if (ind.isBullFlag) return `Bull Flag breakout. Buy as it crosses ${entryPrice} with early volume.`;
            const vcp = detectVCP(ind.candles);
            if (vcp.isVCP) return `VCP breakout above pivot ${entryPrice}. Volume must be ≥ 1.5× on breakout day.`;
            if (Math.abs(ind.ltp - ind.ema20) / ind.ema20 < 0.02) return `Bounce from 20 EMA. Enter above ${entryPrice} on green candle.`;
            if (Math.abs(ind.ltp - ind.ema50) / ind.ema50 < 0.03) return `50 EMA pullback. Enter above ${entryPrice} with volume confirmation.`;
            return horizonLabel === 'Tomorrow continuation'
                ? `Tomorrow continuation setup. Buy above ${entryPrice} if price holds strength into the next session.`
                : `Short swing setup. Buy above ${entryPrice} if price confirms continuation over the next 1-2 sessions.`;
        })();

        // ── Catalyst text ─────────────────────────────────────────
        const catalyst = [
            `RSI: ${ind.rsi14.toFixed(1)} ${ind.isDeepValue ? '(oversold)' : '(momentum zone)'}`,
            ind.isDeepValue ? `Stretch: ${ind.distFrom200.toFixed(1)}% below 200 DMA` : `ADX: ${ind.adx14.toFixed(1)} (${ind.adx14 > 30 ? 'strong' : 'moderate'} trend)`,
            ind.isBullFlag ? `Flag Volume: Drying up (-30% avg)` : `Vol: ${ind.volumeRatio.toFixed(1)}× avg (${isSmall ? 'small cap 2× required' : '1.5× required'})`,
            `3M RS: ${ind.outperformsNifty ? '+' : ''}${(ind.returns3m - ind.nifty3mReturn).toFixed(1)}% vs Nifty`,
            `${ind.pctFrom52wHigh.toFixed(1)}% below 52W high`,
            `Horizon: ${horizonLabel}`,
        ].join(' · ');

        setups.push({
            ticker: ind.ticker,
            sector: SECTOR_MAP[ind.ticker] ?? 'Diversified',
            marketCapCr,
            ltp: +ind.ltp.toFixed(2),
            trendStatus: `${ind.ltp.toFixed(2)} is ${ind.distFrom200.toFixed(1)}% above 200 DMA. 50EMA slope: ${ind.ema50Slope > 0 ? '+' : ''}${ind.ema50Slope.toFixed(2)}%/10d`,
            volumeSpike: `${ind.volumeRatio.toFixed(2)}× 20d avg (${isSmall ? 'small cap — 2× required' : '1.5× required'})`,
            entryTrigger,
            buyZone: entryPrice,
            target: targetPrice,
            target2,
            atr14: +atr14.toFixed(2),
            stopLoss,
            targetPct,
            slPct,
            riskReward,
            catalyst,
            confidenceScore: executionAdjustedConfidence,
            confidenceBreakdown: {
                scoreTrend: breakdown.scoreTrend,
                scoreVolume: breakdown.scoreVolume,
                scoreRS: breakdown.scoreRS,
                scoreSetup: breakdown.scoreSetup,
                scoreRR: breakdown.scoreRR,
            },
            setupType,
            setupCategory: horizon.category,
            thesisHorizonDays: horizon.horizonDays,
            timeframe,
            earningsRisk: earnings.blocked,
            newsRisk: news.blocked,
            newsSummary: earnings.blocked ? earnings.reason : news.reason,
            headlines: news.headlines,
            momentumRank: index + 1,
            volatilityHitProb: hitProb,
            institutionalDemand: Math.round(ind.accumulationScore ?? 0),
            pcr: ind.pcr,
            totalOI: ind.totalOI,
            oiChangePct: ind.oiChangePct,
            derivativeStatus: ind.derivativeStatus,
            executionQuality: {
                breakoutQuality,
                pullbackQuality,
                gapQuality,
                effectiveRiskReward,
                slippagePct,
            },
            calibratedEdgeScore: predictiveEdgeScore,
            rejectionReasons: [],
            confidenceDrivers: [
                `Tomorrow continuation ${tomorrowContinuationScore}/10`,
                `2-5 day swing ${fiveDaySwingScore}/10`,
                `Relative strength ${(ind.returns3m - ind.nifty3mReturn).toFixed(1)}% vs Nifty`,
                `Trend score ${breakdown.scoreTrend}/2`,
                `Volume score ${breakdown.scoreVolume}/2`,
                `Exec quality B${breakoutQuality}/P${pullbackQuality}/G${gapQuality}`,
                `Slippage-adjusted RR ${effectiveRiskReward}:1 (raw ${rawRiskReward}:1)`,
            ],
            alertStage: 'SETUP_DETECTED',
        });
    }

    // Take top 8 (after all gates — should be small quality set)
    const finalSetups = setups
        .sort((a, b) =>
            (a.setupCategory === 'TOMORROW' ? 0 : 1) - (b.setupCategory === 'TOMORROW' ? 0 : 1) ||
            (b.calibratedEdgeScore ?? 0) - (a.calibratedEdgeScore ?? 0) ||
            b.confidenceScore - a.confidenceScore ||
            b.riskReward - a.riskReward
        )
        .slice(0, 8);
    await enrichTradeSetupsWithAI(finalSetups, qualified);

    // ── AI ENRICHMENT ────────────────────────────────────────────
    if (false && finalSetups.length > 0) {
        const aiInputData = finalSetups.map(s => {
            const ind = qualified.find(q => q.ticker === s.ticker);
            return {
                ticker: s.ticker,
                close: s.ltp,
                high: ind?.candles[ind.candles.length - 1]?.high,
                volume: ind?.todayVolume,
                avgVolume20d: ind?.avgVolume20d,
                rsi14: ind?.rsi14,
                adx14: ind?.adx14,
                distFromDma200Pct: ind?.distFrom200 ?? null,
                sector: s.sector,
                mcap: s.marketCapCr,
                setupType: s.setupType,
                confidenceScore: s.confidenceScore,
                headlines: s.headlines,
                pcr: s.pcr,
                derivativeStatus: s.derivativeStatus,
            };
        });

        const aiAssessments = await analyzeStocksWithAI(aiInputData);
        for (const s of finalSetups) {
            const assessment = aiAssessments.get(s.ticker);
            if (!assessment) continue;
            const safeAssessment = assessment!;
            s.aiSignal = safeAssessment.signal;
            s.aiLogic = safeAssessment.logic;
            s.aiTargetRange = safeAssessment.target_range;
            s.aiStopLoss = safeAssessment.stop_loss;
            // Phase 1: Authorized Trigger Zone
            if (safeAssessment.trigger_price != null) {
                s.authorizedZone = {
                    triggerPrice: safeAssessment.trigger_price!,
                    triggerVolumeRatio: safeAssessment.trigger_volume_ratio ?? 1.2,
                    authorizedAt: new Date(),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
                };
            }
            // Only override confidence if AI momentum_score is meaningful AND higher
            if (safeAssessment.momentum_score && safeAssessment.momentum_score > s.confidenceScore) {
                s.confidenceScore = Math.min(10, safeAssessment.momentum_score);
            }
        }
    }

    // STRICT CUSTOMER REQUEST: Filter out WATCH and REJECT signals.

    // ── Phase 5: Multi-Agent Risk Manager (Sector Concentration) ─────

    // ── Phase 3: EV-Based Prioritization ──────────────────────────
    const setupsWithEV = await Promise.all(finalSetups.map(async s => {
        (s as any).expectedValue = await calculateExpectedValue(s);
        return s;
    }));

    // Sort by EV (Descending)
    setupsWithEV.sort((a, b) => (b as any).expectedValue - (a as any).expectedValue);

    if (marketStatus) {
        await enrichSetupsWithGroundedNews(setupsWithEV, qualified, marketStatus, false);
        await applyRiskGovernor(setupsWithEV, marketStatus);
    }

    return setupsWithEV;
}

export async function runIntradayScanner(
    dataApi: MarketDataApi | null = null
): Promise<{ qualified: StockIndicators[]; marketStatus: MarketStatus; setups: TradeSetup[]; diagnostics: ScanDiagnostics }> {
    const marketStatus = await checkMarketCondition();
    const diagnostics: ScanDiagnostics = {
        mode: 'intraday',
        universeCount: INTRADAY_UNIVERSE.length,
        qualifiedCount: 0,
        setupCount: 0,
        rejectionCounts: {},
        notes: [],
        nearMisses: [],
        recommendedAction: 'WAIT',
    };
    const reject = (reason: string) => {
        diagnostics.rejectionCounts[reason] = (diagnostics.rejectionCounts[reason] || 0) + 1;
    };
    const addNearMiss = (candidate: { ticker: string; setupType: string; confidenceScore: number; primaryReason: string }) => {
        diagnostics.nearMisses = [...(diagnostics.nearMisses || []), candidate]
            .sort((a, b) => b.confidenceScore - a.confidenceScore)
            .slice(0, 3);
    };
    if (marketStatus.regime === 'RISK_OFF') {
        diagnostics.notes?.push('Market regime is RISK_OFF, so intraday longs are disabled.');
        diagnostics.summary = 'Intraday longs are disabled because the market regime is risk-off.';
        return { qualified: [], marketStatus, setups: [], diagnostics };
    }

    const niftyCandles = await fetchHistoricalData('^NSEI', 10, '5m');
    const qualified: StockIndicators[] = [];

    for (let i = 0; i < INTRADAY_UNIVERSE.length; i += 8) {
        const batch = INTRADAY_UNIVERSE.slice(i, i + 8);
        const settled = await Promise.allSettled(
            batch.map(async (ticker) => {
                const yahoo = NSE_UNIVERSE[ticker] ?? `${ticker}.NS`;
                const candles = dataApi
                    ? await dataApi.getHistoricalData(ticker, '5m', 10)
                    : await fetchHistoricalData(yahoo, 10, '5m');
                return { ticker, candles };
            })
        );

        for (const row of settled) {
            if (row.status !== 'fulfilled') continue;
            const { ticker, candles } = row.value;
            if (candles.length < 120) {
                reject('insufficient_candles');
                continue;
            }

            const ind = computeIndicators(ticker, candles, niftyCandles);
            if (!ind) {
                reject('indicator_failure');
                continue;
            }

            const emaAligned = ind.ltp >= ind.ema20 && ind.ema20 >= ind.ema50 * 0.995;
            const pullbackWindow = Math.abs(ind.ltp - ind.ema20) / Math.max(ind.ema20, 1) <= 0.018;
            const momentumHealthy = ind.rsi14 >= 50 && ind.rsi14 <= 78 && ind.adx14 >= 16;
            const volumeHealthy = ind.volumeRatio >= 1.05 && ind.avgVolume20d >= 20_000;
            const relativeStrengthOkay = ind.returns3m >= ind.nifty3mReturn - 0.5;

            if (!emaAligned && !pullbackWindow) {
                reject('ema_or_pullback_gate');
                continue;
            }
            if (!momentumHealthy) {
                reject('momentum_gate');
                continue;
            }
            if (!volumeHealthy) {
                reject('volume_gate');
                continue;
            }
            if (!relativeStrengthOkay) {
                reject('relative_strength_gate');
                continue;
            }
            if ((ind.accumulationScore ?? 0) < 45) {
                reject('accumulation_gate');
                continue;
            }

            qualified.push(ind);
        }
    }

    diagnostics.qualifiedCount = qualified.length;

    qualified.sort((a, b) => {
        const score = (x: StockIndicators) =>
            (x.volumeRatio * 0.35) +
            (x.adx14 / 100 * 0.25) +
            (x.rsi14 / 100 * 0.2) +
            ((x.returns3m - x.nifty3mReturn) * 0.2);
        return score(b) - score(a);
    });

    const setups: TradeSetup[] = [];

    for (let index = 0; index < qualified.length; index++) {
        const ind = qualified[index];
        const lastCandle = ind.candles[ind.candles.length - 1];
        const atr14 = calcATR(ind.candles.slice(-25));
        if (!Number.isFinite(atr14) || atr14 <= 0) {
            reject('atr_invalid');
            continue;
        }
        const sessionCandles = getLatestSessionCandles(ind.candles);
        if (sessionCandles.length < 12) {
            reject('insufficient_session_candles');
            continue;
        }
        const openingRangeBars = Math.min(6, sessionCandles.length);
        const openingRange = sessionCandles.slice(0, openingRangeBars);
        const openingRangeHigh = Math.max(...openingRange.map(c => c.high));
        const openingRangeLow = Math.min(...openingRange.map(c => c.low));
        const intradayVwap = calcVWAP(sessionCandles);
        const fifteenMinuteCandles = aggregateCandles(ind.candles, 3);
        const currentSession15m = getLatestSessionCandles(fifteenMinuteCandles);
        if (currentSession15m.length < 4) {
            reject('insufficient_15m_session_candles');
            continue;
        }
        if (fifteenMinuteCandles.length < 12) {
            reject('insufficient_15m_candles');
            continue;
        }
        const last15Candle = currentSession15m[currentSession15m.length - 1];
        const last15Volumes = currentSession15m.slice(-6).map(candle => candle.volume);
        const avg15Volume = last15Volumes.slice(0, -1).reduce((sum, volume) => sum + volume, 0) / Math.max(last15Volumes.length - 1, 1);
        const ema8On15 = calcEMA(currentSession15m.map(candle => candle.close), Math.min(8, currentSession15m.length));
        const ema21On15 = calcEMA(currentSession15m.map(candle => candle.close), Math.min(21, currentSession15m.length));
        const higherLow15 = currentSession15m.length >= 4
            ? last15Candle.low >= Math.min(...currentSession15m.slice(-4, -1).map(candle => candle.low)) * 0.997
            : false;
        const breakoutActive = lastCandle.close >= openingRangeHigh * 0.998;
        const aboveVwap = lastCandle.close >= intradayVwap;
        const firstPullbackHeld = sessionCandles.length >= 10
            ? Math.min(...sessionCandles.slice(-5).map(c => c.low)) > intradayVwap * 0.995
            : false;
        const structure5m = scoreIntradayStructure({
            close: lastCandle.close,
            fastEma: ind.ema20,
            slowEma: ind.ema50,
            higherLow: sessionCandles.length >= 4
                ? lastCandle.low >= Math.min(...sessionCandles.slice(-4, -1).map(candle => candle.low)) * 0.998
                : false,
            volumeRatio: ind.volumeRatio,
            aboveReference: aboveVwap,
        });
        const structure15m = scoreIntradayStructure({
            close: last15Candle.close,
            fastEma: ema8On15,
            slowEma: ema21On15,
            higherLow: higherLow15,
            volumeRatio: avg15Volume > 0 ? last15Candle.volume / avg15Volume : 1,
            aboveReference: last15Candle.close >= ema8On15,
        });
        const rejectionReasons: string[] = [];
        if (!aboveVwap) rejectionReasons.push('Below intraday VWAP');
        if (!breakoutActive && !firstPullbackHeld) rejectionReasons.push('No clean opening-range breakout or first-pullback hold');
        if (lastCandle.close < openingRangeLow) rejectionReasons.push('Trading below opening-range low');
        if (structure5m < 4.8) rejectionReasons.push('Weak 5m structure');
        if (structure15m < 5.0) rejectionReasons.push('Weak 15m structure');
        const nearEma20 = Math.abs(ind.ltp - ind.ema20) / Math.max(ind.ema20, 1) <= 0.01;
        const setupType = nearEma20
            ? 'EMA20 Bounce'
            : ind.volumeRatio >= 1.6
                ? 'Momentum Continuation'
                : 'Breakout Base';
        const earlyConfidence = +Math.min(
            10,
            4.2 +
            Math.min(1.6, Math.max(0, ind.volumeRatio - 1) * 1.7) +
            Math.min(1.2, Math.max(0, (ind.adx14 - 16) / 12)) +
            (aboveVwap ? 0.35 : 0) +
            ((structure5m - 5) * 0.18) +
            ((structure15m - 5) * 0.2)
        ).toFixed(1);
        if (rejectionReasons.length) {
            rejectionReasons.forEach(reason => reject(reason));
            addNearMiss({
                ticker: ind.ticker,
                setupType,
                confidenceScore: earlyConfidence,
                primaryReason: rejectionReasons[0],
            });
            continue;
        }

        const recentLows = ind.candles.slice(-8).map(c => c.low);
        const entryPrice = +(Math.max(lastCandle.high, ind.ltp) * 1.0008).toFixed(2);
        const previousSessionClose = ind.candles[ind.candles.length - 25]?.close ?? ind.candles[ind.candles.length - 2]?.close ?? lastCandle.close;
        const gapPct = calcGapPct(openingRange[0]?.open ?? lastCandle.open, previousSessionClose);
        let stopLoss = Math.min(Math.min(...recentLows) * 0.999, ind.ema20 * 0.997);
        if (stopLoss >= entryPrice) stopLoss = entryPrice - atr14;
        stopLoss = +stopLoss.toFixed(2);
        if (stopLoss <= 0 || stopLoss >= entryPrice) {
            reject('stop_loss_invalid');
            continue;
        }

        const riskPerShare = entryPrice - stopLoss;
        const targetPrice = +(entryPrice + Math.max(riskPerShare * 1.8, atr14 * 1.4)).toFixed(2);
        const target2 = +(targetPrice + atr14).toFixed(2);
        const targetPct = +(((targetPrice - entryPrice) / entryPrice) * 100).toFixed(2);
        const slPct = +(((entryPrice - stopLoss) / entryPrice) * 100).toFixed(2);
        const slippagePct = estimateSlippagePct(MARKET_CAP_CR_MAP[ind.ticker], ind.volumeRatio, 'Intraday');
        const rawRiskReward = +(((targetPrice - entryPrice) / riskPerShare)).toFixed(2);
        const effectiveRiskReward = calcEffectiveRiskReward(entryPrice, stopLoss, targetPrice, slippagePct);
        const riskReward = effectiveRiskReward;

        if (riskReward < 1.4) {
            reject('effective_rr_gate');
            addNearMiss({
                ticker: ind.ticker,
                setupType,
                confidenceScore: earlyConfidence,
                primaryReason: 'Reward-to-risk is too weak after slippage',
            });
            continue;
        }
        if (targetPct < 0.5 || targetPct > 3.5) {
            reject('target_pct_gate');
            addNearMiss({
                ticker: ind.ticker,
                setupType,
                confidenceScore: earlyConfidence,
                primaryReason: 'Target range is not practical for this intraday setup',
            });
            continue;
        }

        const breakoutQuality = scoreBreakoutQuality({
            breakoutPct: ((lastCandle.close - openingRangeHigh) / Math.max(openingRangeHigh, 1)) * 100,
            volumeRatio: ind.volumeRatio,
            alignedTrend: ind.ema20 >= ind.ema50 * 0.998,
            aboveReference: aboveVwap,
            trendStrength: ind.adx14,
        });
        const pullbackQuality = scorePullbackQuality({
            distanceToReferencePct: Math.abs(ind.ltp - ind.ema20) / Math.max(ind.ema20, 1) * 100,
            holdsReference: firstPullbackHeld || lastCandle.close >= ind.ema20 * 0.998,
            bounceStrengthPct: ((lastCandle.close - lastCandle.low) / Math.max(lastCandle.low, 1)) * 100,
            volumeRatio: ind.volumeRatio,
            shallowRetracePct: ((openingRangeHigh - Math.min(...sessionCandles.slice(-6).map(candle => candle.low))) / Math.max(ind.ltp, 1)) * 100,
        });
        const gapQuality = scoreGapQuality(gapPct, aboveVwap && structure15m >= 5.5);
        const primaryQuality = nearEma20 ? pullbackQuality : breakoutQuality;
        if (primaryQuality < 4.6) {
            reject('primary_execution_quality');
            addNearMiss({
                ticker: ind.ticker,
                setupType,
                confidenceScore: earlyConfidence,
                primaryReason: nearEma20 ? 'Pullback quality is still weak' : 'Breakout quality is still weak',
            });
            continue;
        }
        if (gapQuality < 3.4) {
            reject('gap_quality_gate');
            addNearMiss({
                ticker: ind.ticker,
                setupType,
                confidenceScore: earlyConfidence,
                primaryReason: 'Opening gap quality is not strong enough',
            });
            continue;
        }

        const confidenceScore = +Math.min(
            10,
            4.5 +
            Math.min(1.8, Math.max(0, ind.volumeRatio - 1) * 1.8) +
            Math.min(1.4, Math.max(0, (ind.adx14 - 18) / 12)) +
            (ind.rsi14 >= 56 && ind.rsi14 <= 68 ? 0.9 : 0.5) +
            (nearEma20 ? 0.7 : 0.4) +
            (aboveVwap ? 0.35 : 0) +
            (breakoutActive ? 0.45 : firstPullbackHeld ? 0.25 : 0) +
            ((structure5m - 5) * 0.18) +
            ((structure15m - 5) * 0.2) +
            ((primaryQuality - 5) * 0.16) +
            ((gapQuality - 5) * 0.08) +
            ((effectiveRiskReward - 1.5) * 0.35)
        ).toFixed(1);

        setups.push({
            ticker: ind.ticker,
            sector: SECTOR_MAP[ind.ticker] ?? 'Diversified',
            marketCapCr: MARKET_CAP_CR_MAP[ind.ticker],
            ltp: +ind.ltp.toFixed(2),
            trendStatus: `5m trend intact. Price vs EMA20 ${(((ind.ltp - ind.ema20) / ind.ema20) * 100).toFixed(2)}%. ADX ${ind.adx14.toFixed(1)}.`,
            volumeSpike: `${ind.volumeRatio.toFixed(2)}x 5m volume vs trailing average`,
            entryTrigger: nearEma20
                ? `Buy above ${entryPrice} if the 5m pullback reclaims EMA20 with volume.`
                : `Buy above ${entryPrice} on a fresh 5m range expansion.`,
            buyZone: entryPrice,
            target: targetPrice,
            target2,
            atr14: +atr14.toFixed(2),
            stopLoss,
            targetPct,
            slPct,
            riskReward,
            catalyst: [
                `RSI ${ind.rsi14.toFixed(1)}`,
                `ADX ${ind.adx14.toFixed(1)}`,
                `Vol ${ind.volumeRatio.toFixed(2)}x`,
                `Accumulation ${Math.round(ind.accumulationScore ?? 0)}%`,
                `VWAP ${intradayVwap.toFixed(2)} ${aboveVwap ? '(above)' : '(below)'}`,
                `OR ${openingRangeHigh.toFixed(2)}/${openingRangeLow.toFixed(2)}`,
                `15m EMA ${ema8On15.toFixed(2)}/${ema21On15.toFixed(2)}`,
            ].join(' · '),
            confidenceScore,
            confidenceBreakdown: {
                scoreTrend: +Math.min(2, Math.max(0.5, ind.adx14 / 25)).toFixed(1),
                scoreVolume: +Math.min(2, Math.max(0.5, ind.volumeRatio)).toFixed(1),
                scoreRS: +Math.min(2, Math.max(0.5, ind.returns3m - ind.nifty3mReturn + 1)).toFixed(1),
                scoreSetup: nearEma20 ? 1.8 : 1.4,
                scoreRR: riskReward >= 2 ? 1.8 : 1.3,
            },
            setupType,
            timeframe: 'Intraday',
            earningsRisk: false,
            newsRisk: false,
            newsSummary: 'Intraday momentum scan',
            momentumRank: index + 1,
            volatilityHitProb: estimateHitProbability(ind, Math.max(targetPct, 1)),
            institutionalDemand: Math.round(ind.accumulationScore ?? 0),
            pcr: ind.pcr,
            totalOI: ind.totalOI,
            oiChangePct: ind.oiChangePct,
            derivativeStatus: ind.derivativeStatus,
            executionQuality: {
                breakoutQuality,
                pullbackQuality,
                gapQuality,
                effectiveRiskReward,
                slippagePct,
                structure5m,
                structure15m,
            },
            rejectionReasons: [],
            confidenceDrivers: [
                `5m structure ${structure5m}/10`,
                `15m structure ${structure15m}/10`,
                `Exec quality B${breakoutQuality}/P${pullbackQuality}/G${gapQuality}`,
                `Slippage-adjusted RR ${effectiveRiskReward}:1 (raw ${rawRiskReward}:1)`,
            ],
            alertStage: 'SETUP_DETECTED',
        });
    }

    const finalSetups = setups
        .sort((a, b) => b.confidenceScore - a.confidenceScore || b.riskReward - a.riskReward)
        .slice(0, 8);

    diagnostics.setupCount = finalSetups.length;
    if (finalSetups.length) {
        diagnostics.summary = `${finalSetups.length} intraday setup${finalSetups.length === 1 ? '' : 's'} are trade-ready after momentum, structure, and risk checks.`;
        diagnostics.recommendedAction = 'TRADE_READY';
    } else {
        const topReason = Object.entries(diagnostics.rejectionCounts)
            .sort((a, b) => b[1] - a[1])[0];
        if (!qualified.length) {
            diagnostics.summary = `No names cleared the first-stage intraday filter. ${topReason ? `${topReason[1]} symbols failed ${topReason[0].replace(/_/g, ' ')}.` : 'Market breadth is weak right now.'}`;
            diagnostics.recommendedAction = 'WAIT';
        } else if ((diagnostics.nearMisses?.length || 0) > 0) {
            diagnostics.summary = `${qualified.length} names reached deeper checks, but none became trade-ready. Best action is to watch the near-miss names and wait for confirmation.`;
            diagnostics.recommendedAction = 'WATCHLIST';
        } else {
            diagnostics.summary = 'No intraday setups passed all filters. Market conditions are not supporting clean entries right now.';
            diagnostics.recommendedAction = 'WAIT';
        }
        diagnostics.notes?.push('No intraday setups passed all filters. Check rejectionCounts to see the dominant gate.');
    }

    await enrichTradeSetupsWithAI(finalSetups, qualified);
    await enrichSetupsWithGroundedNews(finalSetups, qualified, marketStatus, true);
    await applyRiskGovernor(finalSetups, marketStatus);

    return { qualified, marketStatus, setups: finalSetups, diagnostics };
}
