import { fetchHistoricalData, fetchNiftyData, MARKET_CAP_CR_MAP, NSE_UNIVERSE, SECTOR_MAP } from './dataService';
import { computeIndicators, estimateHitProbability, identifySetupType } from './indicators';
import { validateNewsRisk } from './newsValidator';
import { analyzeStocksWithAI } from './aiAdvisor';
import { MarketDataApi, MarketStatus, StockIndicators, TradeSetup } from './types';

const MIN_MARKET_CAP_CR = 5000;
const MIN_AVG_VOLUME = 500_000;
const MIN_VOLUME_SPIKE = 1.1; // Softened to 1.1x so the AI has candidates to evaluate, it will throw out the weak ones.

// RSI range: Momentum Zone, softened minimum to catch early breakouts
const RSI_MIN = 45;
const RSI_MAX = 80;

export async function checkMarketCondition(): Promise<MarketStatus> {
    const marketData = await fetchNiftyData();
    const safeToTrade = marketData.niftyChange > -1.5;
    let warning = 'Markets healthy. Normal position sizing allowed.';

    if (!safeToTrade) {
        warning = 'Market risk elevated. Stay in cash: Nifty 50 is down more than 1.5%.';
    } else if (marketData.vixChange > 10) {
        warning = 'India VIX is up more than 10%. Reduce position size.';
    }

    return {
        ...marketData,
        safeToTrade,
        warning
    };
}

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

export async function runScanner(dataApi: MarketDataApi | null = null): Promise<{ qualified: StockIndicators[]; marketStatus: MarketStatus }> {
    const marketStatus = await checkMarketCondition();
    if (!marketStatus.safeToTrade) {
        return { qualified: [], marketStatus };
    }

    const niftyCandles = await fetchHistoricalData('^NSEI', 300);
    const allData = await fetchUniverseData(dataApi, 6);
    const qualified: StockIndicators[] = [];

    for (const { ticker, candles } of allData) {
        const marketCapCr = MARKET_CAP_CR_MAP[ticker] ?? 0;
        if (marketCapCr < MIN_MARKET_CAP_CR) continue;
        if (candles.length < 200) continue; // Reduced from 220 to handle newer listings

        const indicators = computeIndicators(ticker, candles, niftyCandles);
        if (!indicators) continue;
        // MOMENTUM FILTER
        // GATE 1 — Trend: price must be above 200 DMA (primary trend filter)
        const trendOk = indicators.ltp > indicators.dma200;
        // GATE 2 — RSI: Momentum Zone (55-80) captures active breakouts
        const pullbackOk = indicators.rsi14 >= RSI_MIN && indicators.rsi14 <= RSI_MAX;
        // GATE 3 — Volume: We need a strict spike for a Newgen style breakout
        const volumeOk = indicators.volumeRatio >= MIN_VOLUME_SPIKE && indicators.avgVolume20d >= MIN_AVG_VOLUME;
        const isMomentumSetup = trendOk && pullbackOk && volumeOk;

        // MEAN REVERSION FILTER
        // 1. Fundamentals proxy: strict large cap filtering (> 20,000 Cr, basically top 100/150 NSE)
        // 2. Overextended drop: price must be 15%+ below 50 EMA
        // 3. Capitulation RSI: below 30
        const isLargeCap = marketCapCr >= 20000;
        const isDropping = indicators.ltp < indicators.ema50 * 0.85;
        const isOversold = indicators.rsi14 < 30;
        const isMeanReversionSetup = isLargeCap && isDropping && isOversold;

        // Passed if it triggers either strategy
        if (isMomentumSetup || isMeanReversionSetup) {
            qualified.push(indicators);
        }
    }

    qualified.sort((a, b) => {
        // Score = Volume Spike (50% weight) + RS vs Nifty (30% weight) + RSI momentum strength (20%)
        // We want the most explosive stocks at the top
        const rsBonus = (x: StockIndicators) => x.outperformsNifty ? (x.returns3m - x.nifty3mReturn) : 0;
        const scoreA = (a.volumeRatio * 0.5) + (rsBonus(a) * 0.3) + (a.rsi14 * 0.2);
        const scoreB = (b.volumeRatio * 0.5) + (rsBonus(b) * 0.3) + (b.rsi14 * 0.2);
        return scoreB - scoreA;
    });

    return { qualified, marketStatus };
}

export async function buildTradeSetups(qualified: StockIndicators[]): Promise<TradeSetup[]> {
    const setups: TradeSetup[] = [];

    for (let index = 0; index < qualified.length; index++) {
        const ind = qualified[index];
        const marketCapCr = MARKET_CAP_CR_MAP[ind.ticker] ?? 0;
        const lastCandle = ind.candles[ind.candles.length - 1];

        const setupType = identifySetupType(ind) as import('./types').SetupType;
        const isMeanReversion = setupType === 'Deep Value Reversion 📉';

        const useBounceEntry = !isMeanReversion && Math.abs(ind.ltp - ind.ema20) / ind.ema20 <= 0.015 && lastCandle.low <= ind.ema20;

        const entryPrice = isMeanReversion
            ? +(lastCandle.high * 1.002).toFixed(2)
            : (useBounceEntry
                ? +(Math.max(ind.ema20, lastCandle.high) * 1.001).toFixed(2)
                : +(lastCandle.high * 1.001).toFixed(2));

        const entryTrigger = isMeanReversion
            ? `Deep Value Reversion setup. Buy above capitulation high ${entryPrice}`
            : (useBounceEntry
                ? `Bounce confirmation from 20 EMA. Buy above ${entryPrice}`
                : `Breakout above today's high. Buy above ${entryPrice}`);

        const projectedResistance = isMeanReversion ? ind.ema50 : ind.high3m * 0.995;
        // Target: 5%–15% range — allows mid-range setups and strong mean reversion bounces
        const minTarget = entryPrice * (isMeanReversion ? 1.04 : 1.05);
        const maxTarget = entryPrice * 1.15;
        const targetPrice = +Math.min(Math.max(minTarget, projectedResistance), maxTarget).toFixed(2);
        const targetPct = +(((targetPrice - entryPrice) / entryPrice) * 100).toFixed(2);

        const stopLoss = +(entryPrice * 0.965).toFixed(2);
        const slPct = +(((entryPrice - stopLoss) / entryPrice) * 100).toFixed(2);
        const riskReward = +(((targetPrice - entryPrice) / (entryPrice - stopLoss))).toFixed(2);

        // Relaxed gates: R:R ≥ 1.0 (was 1.5), target >= 3% (was 5%)
        // We let the AI decide if the setup is actually worth trading based on momentum
        if (riskReward < 1.0 || targetPct < 3) continue;

        const news = await validateNewsRisk(ind.ticker);
        if (news.blocked) continue;

        const hitProb = estimateHitProbability(ind, targetPct);
        const confidenceScore = Math.min(
            10,
            Math.max(
                1,
                Math.round(
                    hitProb / 18 +
                    (riskReward >= 2.5 ? 2 : 1) +
                    (ind.volumeRatio >= 2 ? 1.5 : 1) +
                    (ind.outperformsNifty ? 1 : 0)
                )
            )
        );

        setups.push({
            ticker: ind.ticker,
            sector: SECTOR_MAP[ind.ticker] ?? 'Diversified',
            marketCapCr,
            ltp: +ind.ltp.toFixed(2),
            trendStatus: `LTP ${ind.ltp.toFixed(2)} above 200 DMA ${ind.dma200.toFixed(2)} and 50 EMA ${ind.ema50.toFixed(2)}`,
            volumeSpike: `${ind.volumeRatio.toFixed(2)}x of 20D average`,
            entryTrigger,
            buyZone: entryPrice,
            target: targetPrice,
            stopLoss,
            targetPct,
            slPct,
            riskReward,
            catalyst: isMeanReversion
                ? `RSI dropped to ${ind.rsi14.toFixed(1)} (deep capitulation). Overextended -${(((ind.ema50 - ind.ltp) / ind.ema50) * 100).toFixed(1)}% below 50-EMA.`
                : `RSI at ${ind.rsi14.toFixed(1)} — ${ind.rsi14 < 50 ? 'pullback setup' : 'momentum consolidation'}. 3M RS vs Nifty: ${ind.outperformsNifty ? '✅ Outperforming' : '⚠️ Lagging'}. Vol: ${ind.volumeRatio.toFixed(1)}× avg.`,
            confidenceScore,
            setupType,
            earningsRisk: false,
            newsRisk: false,
            newsSummary: news.reason,
            momentumRank: index + 1,
            volatilityHitProb: hitProb,
        });
    }

    const finalSetups = setups.slice(0, 10);

    // AI ENRICHMENT: Send the top setups to Gemini for the "Newgen Breakout" analysis
    if (finalSetups.length > 0) {
        // Collect data needed for AI prompt
        const aiInputData = finalSetups.map(s => {
            const ind = qualified.find(q => q.ticker === s.ticker);
            return {
                ticker: s.ticker,
                close: s.ltp,
                high: ind?.candles[ind.candles.length - 1]?.high,
                volume: ind?.todayVolume,
                avgVolume20d: ind?.avgVolume20d,
                rsi14: ind?.rsi14,
                distFromDma200Pct: ind?.dma200 ? +(((s.ltp - ind.dma200) / ind.dma200) * 100).toFixed(2) : null,
                sector: s.sector,
                mcap: s.marketCapCr,
            };
        });

        const aiAssessments = await analyzeStocksWithAI(aiInputData);
        for (const s of finalSetups) {
            const assessment = aiAssessments.get(s.ticker);
            if (assessment) {
                s.aiSignal = assessment.signal;
                s.aiLogic = assessment.logic;
                s.aiTargetRange = assessment.target_range;
                s.aiStopLoss = assessment.stop_loss;
                // We can override the base confidence score with AI momentum score if we want, 
                // but let's keep both distinct for now or average them. Let's just override it:
                if (assessment.momentum_score) s.confidenceScore = assessment.momentum_score;
            }
        }
    }

    return finalSetups;
}

