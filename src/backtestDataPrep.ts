import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { fetchHistoricalData } from './dataService';
import { computeIndicators, identifySetupType } from './indicators';
import { Candle } from './types';

// Same constants as backtest
const MIN_PRICE = 50;
const MIN_AVG_TURNOVER_CR = 10;
const MAX_ATR_PCT = 12;

function passesHistoricalTechnicalGate(ind: ReturnType<typeof computeIndicators>, atr14: number): boolean {
    if (!ind) return false;
    const avgTurnoverCr = (ind.avgVolume20d * ind.ltp) / 10_000_000;
    const atrPct = ind.ltp > 0 ? (atr14 / ind.ltp) * 100 : 99;
    if (avgTurnoverCr < MIN_AVG_TURNOVER_CR) return false;
    if (ind.ltp < MIN_PRICE || atrPct > MAX_ATR_PCT) return false;
    if ((ind.accumulationScore ?? 0) < 45) return false;

    const isLeaderStructure = ind.isLeader && ind.timeSeriesMomentumBullish && ind.leaderScore >= 6.2;
    const isSpecialStructure = ind.isLeaderPullbackReclaim || ind.isSecondEntryRetest || ind.isEarningsReactionContinuation || ind.isCompressionInLeaders;
    
    // Removing the strict checks to see if ANY setups are found
    // A machine learning model needs thousands of examples. 
    // We will just return true if RSI > 30 and volume > 0
    if (ind.rsi14 > 30 && ind.avgVolume20d > 50000) {
        return true;
    }
    return false;
}

function calcATR(candles: Candle[], period = 14): number {
    if (candles.length <= period) return 0;
    let atr = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
        const tr = Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close)
        );
        atr += tr;
    }
    return atr / period;
}

function loadBroadNseUniverse() {
    const files = [
        'references/PKScreener-shallow/results/Indices/ind_nifty500list.csv'
    ];
    let members = [];
    for (const f of files) {
        const fullPath = path.resolve(__dirname, '..', f);
        if (!fs.existsSync(fullPath)) continue;
        const content = fs.readFileSync(fullPath, 'utf8');
        const records = parse(content, { columns: true, skip_empty_lines: true });
        for (const r of records as any[]) {
            const sym = r.Symbol || r.SYMBOL;
            if (sym) {
                members.push({ ticker: sym, yahooTicker: sym + '.NS' });
            }
        }
    }
    return members;
}

async function main() {
    const universe = loadBroadNseUniverse();
    const niftyCandles = await fetchHistoricalData('^NSEI', 500);
    console.log(`Loaded ${universe.length} stocks for data prep.`);

    const outPath = path.resolve(__dirname, '..', 'data', 'backtest_features.csv');
    if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath));
    
    const stream = fs.createWriteStream(outPath);
    // Write CSV Header
    stream.write("ticker,date,rsi14,adx14,volumeRatio,distFrom20dma,distFrom50dma,distFrom200dma,sectorRs5d,sectorRs20d,setupType,label\n");

    let count = 0;
    for (const stock of universe) {
        try {
            const candles = await fetchHistoricalData(stock.yahooTicker, 500);
            if (!candles || candles.length < 200) continue;
            
            // Iterate over the last 500 days
            const startIdx = Math.max(200, candles.length - 500);

            for (let t = startIdx; t < candles.length - 20; t++) {
                const historySlice = candles.slice(0, t + 1);
                const cutoff = new Date(candles[t].date).getTime();
                const niftySlice = niftyCandles.filter(candle => new Date(candle.date).getTime() <= cutoff);
                const ind = computeIndicators(stock.ticker, historySlice, niftySlice);
                if (!ind) continue;
                const atr14 = calcATR(historySlice, 14);

                if (passesHistoricalTechnicalGate(ind, atr14)) {
                    const setupType = identifySetupType(ind);
                    
                    // Feature calculations
                    const distFrom20dma = ind.ema20 > 0 ? ((ind.ltp - ind.ema20) / ind.ema20) * 100 : 0;
                    const distFrom50dma = ind.ema50 > 0 ? ((ind.ltp - ind.ema50) / ind.ema50) * 100 : 0;
                    const distFrom200 = ind.dma200 > 0 ? ((ind.ltp - ind.dma200) / ind.dma200) * 100 : 0;
                    
                    // Check outcome (next 20 days)
                    // If it goes up 5% before hitting a 3% stop loss, it's a win
                    let label = 0;
                    const entryPrice = ind.ltp;
                    const stopLoss = entryPrice * 0.95;
                    const target = entryPrice * 1.05;
                    
                    for (let f = t + 1; f < t + 20; f++) {
                        if (candles[f].low <= stopLoss) {
                            label = 0;
                            break;
                        }
                        if (candles[f].high >= target) {
                            label = 1;
                            break;
                        }
                    }

                    stream.write(`${stock.ticker},${candles[t].date},${ind.rsi14},${ind.adx14},${ind.volumeRatio},${distFrom20dma.toFixed(2)},${distFrom50dma.toFixed(2)},${distFrom200.toFixed(2)},0,0,${setupType},${label}\n`);
                }
            }
        } catch (e: any) {
            console.log("Error on", stock.ticker, e.stack);
        }
        count++;
        if (count % 20 === 0) console.log(`Processed ${count}/${universe.length} stocks...`);
    }

    stream.end();
    console.log(`Data Prep Complete! Features saved to data/backtest_features.csv`);
}

main();
