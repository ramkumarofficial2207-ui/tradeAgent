"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkMarketCondition = checkMarketCondition;
exports.runScanner = runScanner;
exports.buildTradeSetups = buildTradeSetups;
const dataService_1 = require("./dataService");
const indicators_1 = require("./indicators");
const newsValidator_1 = require("./newsValidator");
const MIN_MARKET_CAP_CR = 5000;
const MIN_AVG_VOLUME = 500_000; // Lowered: midcaps have lower absolute volumes
const MIN_VOLUME_SPIKE = 1.2; // Lowered: 1.5x was eliminating too many valid setups
// RSI range: wider band to capture more phases of pullback
//   30–50 = classic oversold/pullback; 50–65 = healthy consolidation in uptrend
const RSI_MIN = 30;
const RSI_MAX = 65;
async function checkMarketCondition() {
    const { niftyChange, vixChange } = await (0, dataService_1.fetchNiftyData)();
    const safeToTrade = niftyChange > -1.5;
    let warning = 'Markets healthy. Normal position sizing allowed.';
    if (!safeToTrade) {
        warning = 'Market risk elevated. Stay in cash: Nifty 50 is down more than 1.5%.';
    }
    else if (vixChange > 10) {
        warning = 'India VIX is up more than 10%. Reduce position size.';
    }
    return { niftyChange, vixChange, safeToTrade, warning };
}
async function fetchUniverseData(dataApi, concurrency = 6) {
    const entries = Object.entries(dataService_1.NSE_UNIVERSE);
    const out = [];
    for (let i = 0; i < entries.length; i += concurrency) {
        const batch = entries.slice(i, i + concurrency);
        const settled = await Promise.allSettled(batch.map(async ([ticker, yahoo]) => {
            const candles = dataApi
                ? await dataApi.getHistoricalData(ticker, '1d', 300)
                : await (0, dataService_1.fetchHistoricalData)(yahoo, 300);
            return { ticker, candles };
        }));
        for (const row of settled) {
            if (row.status === 'fulfilled')
                out.push(row.value);
        }
    }
    return out;
}
async function runScanner(dataApi = null) {
    const marketStatus = await checkMarketCondition();
    if (!marketStatus.safeToTrade) {
        return { qualified: [], marketStatus };
    }
    const niftyCandles = await (0, dataService_1.fetchHistoricalData)('^NSEI', 300);
    const allData = await fetchUniverseData(dataApi, 6);
    const qualified = [];
    for (const { ticker, candles } of allData) {
        const marketCapCr = dataService_1.MARKET_CAP_CR_MAP[ticker] ?? 0;
        if (marketCapCr < MIN_MARKET_CAP_CR)
            continue;
        if (candles.length < 200)
            continue; // Reduced from 220 to handle newer listings
        const indicators = (0, indicators_1.computeIndicators)(ticker, candles, niftyCandles);
        if (!indicators)
            continue;
        // GATE 1 — Trend: price must be above 200 DMA (primary trend filter)
        const trendOk = indicators.ltp > indicators.dma200;
        // GATE 2 — RSI: wider band (30–65) captures pullbacks AND consolidations
        const pullbackOk = indicators.rsi14 >= RSI_MIN && indicators.rsi14 <= RSI_MAX;
        // GATE 3 — Volume: meaningful activity (1.2× spike OR very high absolute volume)
        const volumeOk = (indicators.volumeRatio >= MIN_VOLUME_SPIKE && indicators.avgVolume20d >= MIN_AVG_VOLUME) ||
            indicators.avgVolume20d >= 5_000_000; // Very liquid stocks pass regardless of spike
        // BONUS — Nifty RS: outperforming Nifty is scored higher, not a hard gate
        // (some great setups exist in stocks that just lagged Nifty briefly)
        // Only 3 gates required: trend + RSI + volume
        if (trendOk && pullbackOk && volumeOk) {
            qualified.push(indicators);
        }
    }
    qualified.sort((a, b) => {
        // Score = RS vs Nifty (50% weight) + volume (30% weight) + RSI proximity to sweet spot 45 (20%)
        // RS bonus is a scoring factor now, not a hard filter
        const rsBonus = (x) => x.outperformsNifty ? (x.returns3m - x.nifty3mReturn) : 0;
        const scoreA = rsBonus(a) * 0.5 + a.volumeRatio * 0.3 + (50 - Math.abs(a.rsi14 - 45)) * 0.2;
        const scoreB = rsBonus(b) * 0.5 + b.volumeRatio * 0.3 + (50 - Math.abs(b.rsi14 - 45)) * 0.2;
        return scoreB - scoreA;
    });
    return { qualified, marketStatus };
}
async function buildTradeSetups(qualified) {
    const setups = [];
    for (let index = 0; index < qualified.length; index++) {
        const ind = qualified[index];
        const marketCapCr = dataService_1.MARKET_CAP_CR_MAP[ind.ticker] ?? 0;
        const lastCandle = ind.candles[ind.candles.length - 1];
        const useBounceEntry = Math.abs(ind.ltp - ind.ema20) / ind.ema20 <= 0.015 && lastCandle.low <= ind.ema20;
        const entryPrice = useBounceEntry
            ? +(Math.max(ind.ema20, lastCandle.high) * 1.001).toFixed(2)
            : +(lastCandle.high * 1.001).toFixed(2);
        const entryTrigger = useBounceEntry
            ? `Bounce confirmation from 20 EMA. Buy above ${entryPrice}`
            : `Breakout above today's high. Buy above ${entryPrice}`;
        const projectedResistance = ind.high3m * 0.995;
        // Target: 5%–12% range (was 7%–10%) — allows mid-range setups to qualify
        const minTarget = entryPrice * 1.05;
        const maxTarget = entryPrice * 1.12;
        const targetPrice = +Math.min(Math.max(minTarget, projectedResistance), maxTarget).toFixed(2);
        const targetPct = +(((targetPrice - entryPrice) / entryPrice) * 100).toFixed(2);
        const stopLoss = +(entryPrice * 0.965).toFixed(2);
        const slPct = +(((entryPrice - stopLoss) / entryPrice) * 100).toFixed(2);
        const riskReward = +(((targetPrice - entryPrice) / (entryPrice - stopLoss))).toFixed(2);
        // Relaxed gates: R:R ≥ 1.5 (was 2.0), target ≥ 5% (was 7%)
        // A 1.5 R:R is still excellent for swing trades
        if (riskReward < 1.5 || targetPct < 5)
            continue;
        const news = await (0, newsValidator_1.validateNewsRisk)(ind.ticker);
        if (news.blocked)
            continue;
        const hitProb = (0, indicators_1.estimateHitProbability)(ind, targetPct);
        const confidenceScore = Math.min(10, Math.max(1, Math.round(hitProb / 18 +
            (riskReward >= 2.5 ? 2 : 1) +
            (ind.volumeRatio >= 2 ? 1.5 : 1) +
            (ind.outperformsNifty ? 1 : 0))));
        setups.push({
            ticker: ind.ticker,
            sector: dataService_1.SECTOR_MAP[ind.ticker] ?? 'Diversified',
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
            catalyst: `RSI at ${ind.rsi14.toFixed(1)} — ${ind.rsi14 < 50 ? 'pullback setup' : 'momentum consolidation'}. 3M RS vs Nifty: ${ind.outperformsNifty ? '✅ Outperforming' : '⚠️ Lagging'}. Vol: ${ind.volumeRatio.toFixed(1)}× avg.`,
            confidenceScore,
            setupType: (0, indicators_1.identifySetupType)(ind),
            earningsRisk: false,
            newsRisk: false,
            newsSummary: news.reason,
            momentumRank: index + 1,
            volatilityHitProb: hitProb,
        });
    }
    return setups.slice(0, 10);
}
//# sourceMappingURL=scanner.js.map