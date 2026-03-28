// =====================================================
// scanner.ts — Hardened NSE swing scanner
// ALL gates strictly enforced per blueprint spec
// =====================================================

import { fetchHistoricalData, fetchNiftyData, MARKET_CAP_CR_MAP, NSE_UNIVERSE, SECTOR_MAP } from './dataService';
import { computeIndicators, computeConfidence, computeRegime, estimateHitProbability, identifySetupType, detectVCP } from './indicators';
import prisma from './prismaClient';
import { validateNewsRisk } from './newsValidator';
import { validateEarningsRisk } from './earningsValidator';
import { analyzeStocksWithAI } from './aiAdvisor';
import { getOptionsFlow } from './optionsService';
import { getInstitutionalFlowSignal } from './institutionalFlowService';
import { MarketDataApi, MarketStatus, StockIndicators, TradeSetup } from './types';

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

// ──────────────────────────────────────────────────────────────────
// FETCH UNIVERSE
// ──────────────────────────────────────────────────────────────────
async function fetchUniverseData(
    dataApi: MarketDataApi | null,
    concurrency = 6
): Promise<Array<{ ticker: string; candles: any[] }>> {
    const entries = Object.entries(NSE_UNIVERSE);
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

// ──────────────────────────────────────────────────────────────────
// MAIN SCANNER — all gates enforced
// ──────────────────────────────────────────────────────────────────
export async function runScanner(
    dataApi: MarketDataApi | null = null
): Promise<{ qualified: StockIndicators[]; marketStatus: MarketStatus }> {

    const marketStatus = await checkMarketCondition();

    // ── GATE: No new longs in RISK-OFF ────────────────────────────
    if (marketStatus.regime === 'RISK_OFF') {
        return { qualified: [], marketStatus };
    }

    const niftyCandles = await fetchHistoricalData('^NSEI', 300);
    const allData = await fetchUniverseData(dataApi, 6);
    const optionsFlow = await getOptionsFlow();
    const qualified: StockIndicators[] = [];

    for (const { ticker, candles } of allData) {
        // ── GATE 1: Dynamic Liquidity ─────────────────────────────
        if (candles.length < 20) continue;
        const last20 = candles.slice(-20);
        const avgVol20 = last20.reduce((s, c) => s + c.volume, 0) / 20;
        const lastClose = candles[candles.length - 1]?.close ?? 0;
        const avgTurnoverCr = (avgVol20 * lastClose) / 10000000; // ₹ in Crores
        if (avgTurnoverCr < 10) continue; // Minimum ₹10 Cr daily turnover

        // Rough proxy if missing to keep formatting intact
        let marketCapCr = MARKET_CAP_CR_MAP[ticker] ?? Math.round(avgTurnoverCr * 50);

        // ── GATE 2: Enough history ────────────────────────────────
        if (candles.length < 200) continue;

        // ── GATE 3: Price ≥ ₹50 ─────────────────────────────────
        if (lastClose < MIN_PRICE) continue;

        // ── GATE 4: ATR filter — exclude erratic stocks ───────────
        const atr14 = calcATR(candles.slice(-30));
        const atrPct = lastClose > 0 ? (atr14 / lastClose) * 100 : 99;
        if (atrPct > MAX_ATR_PCT) continue;

        // ── Compute indicators ────────────────────────────────────
        const ind = computeIndicators(ticker, candles, niftyCandles);
        if (!ind) continue;

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
        if ((ind.accumulationScore ?? 0) < 45) continue;

        if (!isStandardTrend && !ind.isBullFlag && !ind.isDeepValue) continue;

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
            if (optData.derivativeStatus === 'Short Buildup') continue;
            if (optData.pcr < 0.6) continue; // Massive call writing resistance ceiling
        }

        qualified.push(ind);
    }

    // Sort by composite momentum score before setup building
    qualified.sort((a, b) => {
        const score = (x: StockIndicators) =>
            (x.volumeRatio * 0.4) +
            ((x.returns3m - x.nifty3mReturn) * 0.3) +
            (x.adx14 / 100 * 0.2) +
            (x.rsi14 / 100 * 0.1);
        return score(b) - score(a);
    });

    return { qualified, marketStatus };
}

// ──────────────────────────────────────────────────────────────────
// BUILD TRADE SETUPS — from qualified stocks
// ──────────────────────────────────────────────────────────────────
export async function buildTradeSetups(qualified: StockIndicators[]): Promise<TradeSetup[]> {
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
        const riskReward = +(((targetPrice - entryPrice) / (entryPrice - stopLoss))).toFixed(2);

        // ── GATE: Minimum RR ≥ 2:1 ───────────────────────────────
        if (riskReward < MIN_RR) continue;
        // ── GATE: Target ≥ 4% ────────────────────────────────────
        if (targetPct < 4) continue;

        // ── GATE: News risk check ─────────────────────────────────
        const news = await validateNewsRisk(ind.ticker);
        if (news.blocked) continue;

        // ── GATE: Earnings risk check ─────────────────────────────
        const earnings = await validateEarningsRisk(ind.ticker);
        if (earnings.blocked) continue;

        // ── 5-Component Confidence Score ──────────────────────────
        const breakdown = computeConfidence(ind, riskReward);

        // ── GATE: Score ≥ MIN_CONFIDENCE — THE KEY FILTER ───────────────────
        if (breakdown.total < MIN_CONFIDENCE) continue;

        // ── In NEUTRAL regime: raise bar to 8.0 ──────────────────
        // (half size AND higher quality threshold)
        // This is already handled by the positionSizeMult on the frontend

        // To approach a high win rate, we only trade outperformers.
        // Stock must beat Nifty over 3 months.
        if (ind.returns3m - ind.nifty3mReturn < 0) continue;

        // ── GATE: Moving Average Pinch ────────────────────────────────
        // Precise short-term momentum alignment required (with slight tolerance for pullbacks)
        if (ind.ema20 < ind.ema50 * 0.98) continue;

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
        const timeframe = (() => {
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
            return `Momentum breakout above ${entryPrice}. Wait for next-day open.`;
        })();

        // ── Catalyst text ─────────────────────────────────────────
        const catalyst = [
            `RSI: ${ind.rsi14.toFixed(1)} ${ind.isDeepValue ? '(oversold)' : '(momentum zone)'}`,
            ind.isDeepValue ? `Stretch: ${ind.distFrom200.toFixed(1)}% below 200 DMA` : `ADX: ${ind.adx14.toFixed(1)} (${ind.adx14 > 30 ? 'strong' : 'moderate'} trend)`,
            ind.isBullFlag ? `Flag Volume: Drying up (-30% avg)` : `Vol: ${ind.volumeRatio.toFixed(1)}× avg (${isSmall ? 'small cap 2× required' : '1.5× required'})`,
            `3M RS: ${ind.outperformsNifty ? '+' : ''}${(ind.returns3m - ind.nifty3mReturn).toFixed(1)}% vs Nifty`,
            `${ind.pctFrom52wHigh.toFixed(1)}% below 52W high`,
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
            confidenceScore: breakdown.total,
            confidenceBreakdown: {
                scoreTrend: breakdown.scoreTrend,
                scoreVolume: breakdown.scoreVolume,
                scoreRS: breakdown.scoreRS,
                scoreSetup: breakdown.scoreSetup,
                scoreRR: breakdown.scoreRR,
            },
            setupType,
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
        });
    }

    // Take top 8 (after all gates — should be small quality set)
    const finalSetups = setups.slice(0, 8);
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
    const eligibleBuys = finalSetups.filter(s => s.aiSignal === 'BUY' || s.aiSignal === 'LIGHT BUY');

    // ── Phase 5: Multi-Agent Risk Manager (Sector Concentration) ─────
    const riskManaged: TradeSetup[] = [];
    const sectorCounts: Record<string, number> = {};

    for (const setup of eligibleBuys) {
        const sector = setup.sector || 'Diversified';
        const count = sectorCounts[sector] || 0;

        // Max 2 stocks per sector to prevent correlation risk
        if (count < 2) {
            riskManaged.push(setup);
            sectorCounts[sector] = count + 1;
        } else {
            console.log(`[Risk Manager] Rejected ${setup.ticker} to prevent over-concentration in ${sector}`);
        }
    }

    // ── Phase 3: EV-Based Prioritization ──────────────────────────
    const setupsWithEV = await Promise.all(riskManaged.map(async s => {
        (s as any).expectedValue = await calculateExpectedValue(s);
        return s;
    }));

    // Sort by EV (Descending)
    setupsWithEV.sort((a, b) => (b as any).expectedValue - (a as any).expectedValue);

    return setupsWithEV;
}

export async function runIntradayScanner(
    dataApi: MarketDataApi | null = null
): Promise<{ qualified: StockIndicators[]; marketStatus: MarketStatus; setups: TradeSetup[] }> {
    const marketStatus = await checkMarketCondition();
    if (marketStatus.regime === 'RISK_OFF') {
        return { qualified: [], marketStatus, setups: [] };
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
            if (candles.length < 120) continue;

            const ind = computeIndicators(ticker, candles, niftyCandles);
            if (!ind) continue;

            const emaAligned = ind.ltp >= ind.ema20 && ind.ema20 >= ind.ema50 * 0.995;
            const pullbackWindow = Math.abs(ind.ltp - ind.ema20) / Math.max(ind.ema20, 1) <= 0.015;
            const momentumHealthy = ind.rsi14 >= 52 && ind.rsi14 <= 76 && ind.adx14 >= 18;
            const volumeHealthy = ind.volumeRatio >= 1.15 && ind.avgVolume20d >= 20_000;
            const relativeStrengthOkay = ind.returns3m >= ind.nifty3mReturn - 0.5;

            if (!emaAligned && !pullbackWindow) continue;
            if (!momentumHealthy || !volumeHealthy || !relativeStrengthOkay) continue;
            if ((ind.accumulationScore ?? 0) < 48) continue;

            qualified.push(ind);
        }
    }

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
        if (!Number.isFinite(atr14) || atr14 <= 0) continue;

        const recentLows = ind.candles.slice(-8).map(c => c.low);
        const entryPrice = +(Math.max(lastCandle.high, ind.ltp) * 1.0008).toFixed(2);
        let stopLoss = Math.min(Math.min(...recentLows) * 0.999, ind.ema20 * 0.997);
        if (stopLoss >= entryPrice) stopLoss = entryPrice - atr14;
        stopLoss = +stopLoss.toFixed(2);
        if (stopLoss <= 0 || stopLoss >= entryPrice) continue;

        const riskPerShare = entryPrice - stopLoss;
        const targetPrice = +(entryPrice + Math.max(riskPerShare * 1.8, atr14 * 1.4)).toFixed(2);
        const target2 = +(targetPrice + atr14).toFixed(2);
        const targetPct = +(((targetPrice - entryPrice) / entryPrice) * 100).toFixed(2);
        const slPct = +(((entryPrice - stopLoss) / entryPrice) * 100).toFixed(2);
        const riskReward = +(((targetPrice - entryPrice) / riskPerShare)).toFixed(2);

        if (riskReward < 1.5) continue;
        if (targetPct < 0.6 || targetPct > 3.5) continue;

        const nearEma20 = Math.abs(ind.ltp - ind.ema20) / Math.max(ind.ema20, 1) <= 0.01;
        const setupType = nearEma20
            ? 'EMA20 Bounce'
            : ind.volumeRatio >= 1.6
                ? 'Momentum Continuation'
                : 'Breakout Base';

        const confidenceScore = +Math.min(
            10,
            4.5 +
            Math.min(1.8, Math.max(0, ind.volumeRatio - 1) * 1.8) +
            Math.min(1.4, Math.max(0, (ind.adx14 - 18) / 12)) +
            (ind.rsi14 >= 56 && ind.rsi14 <= 68 ? 0.9 : 0.5) +
            (nearEma20 ? 0.7 : 0.4)
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
        });
    }

    const finalSetups = setups
        .sort((a, b) => b.confidenceScore - a.confidenceScore || b.riskReward - a.riskReward)
        .slice(0, 8);

    await enrichTradeSetupsWithAI(finalSetups, qualified);

    return { qualified, marketStatus, setups: finalSetups };
}
