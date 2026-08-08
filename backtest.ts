import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { parse } from 'csv-parse/sync';
import { fetchHistoricalData, NSE_UNIVERSE } from './src/dataService';
import { computeConfidence, computeIndicators, identifySetupType } from './src/indicators';
import { Candle } from './src/types';

interface UniverseMember {
    ticker: string;
    yahooTicker: string;
    source: string;
    isin?: string;
}

interface BacktestTrade {
    ticker: string;
    source: string;
    signalDate: string;
    entryDate: string;
    entryPrice: number;
    setupType: string;
    setupFamily: string;
    stopLoss: number;
    target: number;
    exitDate: string;
    exitPrice: number;
    exitReason: 'TARGET' | 'STOP' | 'TIME_EXIT';
    grossPnlPct: number;
    netPnlPct: number;
    riskPct: number;
    rMultiple: number;
    daysHeld: number;
    confidenceScore: number;
}

interface PortfolioStats {
    selectedTrades: number;
    capacityRejected: number;
    initialCapital: number;
    endingCapital: number;
    totalReturnPct: number;
    maxDrawdownPct: number;
    annualizedReturnPct: number;
    avgPositionPct: number;
    periodDays: number;
}

const DEFAULT_LOOKBACK_DAYS = Number(process.env.BACKTEST_DAYS ?? '500');
const MIN_HISTORY = Number(process.env.BACKTEST_MIN_HISTORY ?? '200');
const UNIVERSE_MODE = (process.env.BACKTEST_UNIVERSE_MODE ?? 'broad_india').toLowerCase();
const MAX_TICKERS = Number(process.env.BACKTEST_MAX_TICKERS ?? '0');
const ROUND_TRIP_COST_PCT = Number(process.env.BACKTEST_ROUND_TRIP_COST_PCT ?? '0.25');
const FETCH_BATCH_SIZE = Number(process.env.BACKTEST_FETCH_BATCH ?? '8');
const ENTRY_WINDOW_DAYS = Math.max(1, Number(process.env.BACKTEST_ENTRY_WINDOW_DAYS ?? '3'));
const MAX_ENTRY_GAP_PCT = Number(process.env.BACKTEST_MAX_ENTRY_GAP_PCT ?? '2');
const HOLDING_DAYS = Math.max(1, Number(process.env.BACKTEST_HOLDING_DAYS ?? '20'));
const PORTFOLIO_INITIAL_CAPITAL = Number(process.env.BACKTEST_INITIAL_CAPITAL ?? '1000000');
const PORTFOLIO_MAX_POSITIONS = Math.max(1, Number(process.env.BACKTEST_MAX_POSITIONS ?? '5'));
const PORTFOLIO_RISK_PER_TRADE_PCT = Number(process.env.BACKTEST_RISK_PER_TRADE_PCT ?? '1');
const PORTFOLIO_MAX_POSITION_PCT = Number(process.env.BACKTEST_MAX_POSITION_PCT ?? '20');
const UNIVERSE_ONLY = process.env.BACKTEST_UNIVERSE_ONLY === '1';
const EXTRA_UNIVERSE_FILES = (process.env.BACKTEST_EXTRA_UNIVERSE_FILES ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
const MII_SECURITY_FILE = process.env.BACKTEST_MII_SECURITY_FILE?.trim();

const BROAD_NSE_FILES = [
    'references/PKScreener-shallow/results/Indices/ind_nifty50list.csv',
    'references/PKScreener-shallow/results/Indices/ind_nifty100list.csv',
    'references/PKScreener-shallow/results/Indices/ind_nifty200list.csv',
    'references/PKScreener-shallow/results/Indices/ind_nifty500list.csv',
    'references/PKScreener-shallow/results/Indices/ind_niftymidcap50list.csv',
    'references/PKScreener-shallow/results/Indices/ind_niftymidcap100list.csv',
    'references/PKScreener-shallow/results/Indices/ind_niftymidcap150list.csv',
    'references/PKScreener-shallow/results/Indices/ind_niftysmallcap50list.csv',
    'references/PKScreener-shallow/results/Indices/ind_niftysmallcap100list.csv',
    'references/PKScreener-shallow/results/Indices/ind_niftysmallcap250list.csv',
    'references/PKScreener-shallow/results/Indices/EQUITY_L.csv',
    ...EXTRA_UNIVERSE_FILES,
];

const MIN_PRICE = 50;
const MIN_AVG_VOLUME = 150_000;
const MIN_AVG_TURNOVER_CR = 10;
const MAX_ATR_PCT = 12;
const RSI_MIN = 45;
const RSI_MAX = 80;
const ADX_MIN = 10;
const MAX_52W_DROP = 35;

function upperBoundByDate(candles: Candle[], date: string): number {
    let low = 0;
    let high = candles.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (candles[mid].date <= date) low = mid + 1;
        else high = mid;
    }
    return low;
}

function passesHistoricalTechnicalGate(ind: ReturnType<typeof computeIndicators>, atr14: number): boolean {
    if (!ind) return false;

    const avgTurnoverCr = (ind.avgVolume20d * ind.ltp) / 10_000_000;
    const atrPct = ind.ltp > 0 ? (atr14 / ind.ltp) * 100 : 99;
    if (avgTurnoverCr < MIN_AVG_TURNOVER_CR) return false;
    if (ind.ltp < MIN_PRICE || atrPct > MAX_ATR_PCT) return false;

    // Pre-Surge Hybrid Base: 20 EMA touch + Volume Dry-Up + RS outperformance
    // Evaluated BEFORE accumulationScore gate so quiet bases aren't filtered out
    const isPreSurgeBase =
        Math.abs(ind.ltp - ind.ema20) / ind.ema20 <= 0.025 &&
        ind.volumeRatio <= 0.90 &&
        ind.rsi14 >= 40 && ind.rsi14 <= 70 &&
        ind.ema20 > ind.ema50 &&
        ind.ema50 > (ind.dma200 ?? 0) &&
        ind.avgVolume20d >= MIN_AVG_VOLUME &&
        (ind.returns3m - ind.nifty3mReturn) >= 5;
    if (isPreSurgeBase) return true;

    if ((ind.accumulationScore ?? 0) < 45) return false;

    const isSpecialStructure =
        ind.isSqueeze ||
        ind.isPocketPivot;
    const isLeaderStructure =
        ind.isLeaderPullbackReclaim ||
        ind.isSecondEntryRetest ||
        ind.isEarningsReactionContinuation ||
        ind.isCompressionInLeaders;

    const isStandardTrend =
        ind.ltp > ind.dma200 &&
        ind.rsi14 >= RSI_MIN && ind.rsi14 <= RSI_MAX &&
        ind.adx14 >= ADX_MIN &&
        ind.volumeRatio >= 1.0 &&
        ind.avgVolume20d >= MIN_AVG_VOLUME &&
        ind.pctFrom52wHigh <= MAX_52W_DROP &&
        ind.ema50Slope > 0;

    if (!isStandardTrend && !ind.isBullFlag && !ind.isDeepValue && !isLeaderStructure && !isSpecialStructure) {
        return false;
    }
    if (ind.returns3m < ind.nifty3mReturn && !ind.isLeader && !ind.isEarningsReactionContinuation && !ind.isDeepValue && !isSpecialStructure) {
        return false;
    }
    if (ind.ema20 < ind.ema50 * 0.98 && !isSpecialStructure && !ind.isDeepValue) {
        return false;
    }
    return true;
}

function getSetupFamily(setupType: string, isDeepValue: boolean): string {
    if (setupType.includes('Episodic Pivot')) return 'CATALYST';
    if (setupType.includes('High Tight Flag')) return 'MOMENTUM';
    if (setupType.includes('Pre-Surge')) return 'PRE_SURGE';
    if (setupType === 'Compression Breakout') return 'COMPRESSION';
    if (setupType === 'Compression in Leaders' || setupType === 'Leader Pullback Reclaim') return 'LEADER';
    if (setupType === 'Second-Entry Retest') return 'BREAKOUT';
    if (setupType === 'Earnings Reaction Continuation') return 'EVENT_DRIVEN';
    if (isDeepValue) return 'REVERSAL';
    if (setupType.includes('Pullback') || setupType.includes('Bounce')) return 'PULLBACK';
    if (setupType.includes('VCP') || setupType.includes('Breakout')) return 'BREAKOUT';
    return 'CONTINUATION';
}

function calcATR(candles: Candle[], period = 14): number {
    if (candles.length < period + 1) return 0;
    const trs: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high;
        const l = candles[i].low;
        const pc = candles[i - 1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const last14 = trs.slice(-period);
    return last14.reduce((sum, value) => sum + value, 0) / last14.length;
}

function normalizeTicker(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
}

function resolveYahooTicker(ticker: string): string {
    return NSE_UNIVERSE[ticker] ?? `${ticker}.NS`;
}

function loadCsvUniverse(filePath: string): UniverseMember[] {
    if (!fs.existsSync(filePath)) return [];

    const raw = fs.readFileSync(filePath, 'utf8');
    const rows = parse(raw, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
    }) as Record<string, string>[];

    return rows
        .map((row) => {
            const ticker =
                normalizeTicker(row.Symbol ?? row.SYMBOL ?? row.symbol ?? row.Ticker ?? row.TICKER);
            const series = normalizeTicker(row.Series ?? row.SERIES ?? row.series);
            const isin = normalizeTicker(
                row.ISIN ?? row['ISIN NUMBER'] ?? row[' ISIN NUMBER'] ?? row.Isin
            );
            if (!ticker) return null;
            if (series && series !== 'EQ') return null;
            return {
                ticker,
                yahooTicker: resolveYahooTicker(ticker),
                source: path.basename(filePath),
                isin: isin || undefined,
            } satisfies UniverseMember;
        })
        .filter((member): member is NonNullable<typeof member> => Boolean(member));
}

function findMiiSecurityFile(): string | null {
    if (MII_SECURITY_FILE) {
        const explicitPath = path.resolve(process.cwd(), MII_SECURITY_FILE);
        return fs.existsSync(explicitPath) ? explicitPath : null;
    }

    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) return null;
    const candidates = fs.readdirSync(dataDir)
        .filter(name => /^NSE_CM_security_\d{8}\.csv\.gz$/i.test(name))
        .sort()
        .reverse();
    return candidates.length ? path.join(dataDir, candidates[0]) : null;
}

function loadBseExclusiveUniverse(nseMembers: UniverseMember[]): UniverseMember[] {
    const securityFile = findMiiSecurityFile();
    if (!securityFile) return [];

    const raw = zlib.gunzipSync(fs.readFileSync(securityFile)).toString('utf8');
    const rows = parse(raw, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
    }) as Record<string, string>[];
    const nseIsins = new Set(nseMembers.map(member => member.isin).filter(Boolean));
    const seenIsins = new Set<string>();
    const seenSymbols = new Set<string>();
    const members: UniverseMember[] = [];

    for (const row of rows) {
        const symbol = normalizeTicker(row.TckrSymb);
        const isin = normalizeTicker(row.ISIN);
        const series = normalizeTicker(row.SctySrs);
        const deleted = normalizeTicker(row.DelFlg);
        if (!symbol || series !== 'EQ' || deleted !== 'N') continue;
        if (!isin.startsWith('INE') || nseIsins.has(isin)) continue;
        if (symbol.includes('NSETEST') || seenSymbols.has(symbol) || seenIsins.has(isin)) continue;

        seenSymbols.add(symbol);
        seenIsins.add(isin);
        members.push({
            ticker: symbol,
            yahooTicker: `${symbol}.BO`,
            source: `BSE_EXCLUSIVE:${path.basename(securityFile)}`,
            isin,
        });
    }

    return members.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function loadBroadNseUniverse(): UniverseMember[] {
    const members = new Map<string, UniverseMember>();

    for (const file of BROAD_NSE_FILES) {
        for (const member of loadCsvUniverse(path.join(process.cwd(), file))) {
            if (!members.has(member.ticker)) {
                members.set(member.ticker, member);
            }
        }
    }

    for (const ticker of Object.keys(NSE_UNIVERSE)) {
        if (!members.has(ticker)) {
            members.set(ticker, {
                ticker,
                yahooTicker: resolveYahooTicker(ticker),
                source: 'NSE_UNIVERSE',
            });
        }
    }

    return [...members.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function loadBroadIndiaUniverse(): UniverseMember[] {
    const nseMembers = loadBroadNseUniverse();
    return [...nseMembers, ...loadBseExclusiveUniverse(nseMembers)];
}

function selectUniverse(): UniverseMember[] {
    const sample = [
        'BORORENEW', 'J&KBANK', 'AKUMS', 'PRESTIGE', 'SHAREINDIA',
        'BIOCON', 'ANANTRAJ', 'LLOYDSENT', 'ABCAPITAL', 'TORNTPHARM',
        'OBEROIRLTY', 'DLF', 'TRENT', 'VOLTAS', 'HAVELLS',
    ].map(ticker => ({
        ticker,
        yahooTicker: resolveYahooTicker(ticker),
        source: 'sample',
    }));

    if (UNIVERSE_MODE === 'sample') {
        return sample;
    }

    const broadNse = loadBroadNseUniverse();
    if (UNIVERSE_MODE === 'broad_nse') {
        return broadNse;
    }

    if (UNIVERSE_MODE === 'broad_nse_200') {
        return broadNse.slice(0, 200);
    }

    if (UNIVERSE_MODE === 'broad_nse_500') {
        return broadNse.slice(0, 500);
    }

    if (UNIVERSE_MODE === 'broad_india' || UNIVERSE_MODE === 'broad_nse_bse') {
        return loadBroadIndiaUniverse();
    }

    return loadBroadIndiaUniverse();
}

function simulatePortfolio(trades: BacktestTrade[]): PortfolioStats | null {
    if (!trades.length) return null;

    const ordered = [...trades].sort((a, b) =>
        a.entryDate.localeCompare(b.entryDate) ||
        b.confidenceScore - a.confidenceScore ||
        b.rMultiple - a.rMultiple
    );
    const selected: Array<BacktestTrade & { positionValue: number; positionPct: number }> = [];
    let active: Array<BacktestTrade & { positionValue: number; positionPct: number }> = [];
    let capacityRejected = 0;
    let realizedEquity = PORTFOLIO_INITIAL_CAPITAL;

    for (const trade of ordered) {
        const stillActive: typeof active = [];
        for (const activeTrade of active) {
            if (activeTrade.exitDate < trade.entryDate) {
                realizedEquity += activeTrade.positionValue * (activeTrade.netPnlPct / 100);
            } else {
                stillActive.push(activeTrade);
            }
        }
        active = stillActive;

        if (active.length >= PORTFOLIO_MAX_POSITIONS) {
            capacityRejected++;
            continue;
        }

        const riskBasedPositionPct = trade.riskPct > 0
            ? (PORTFOLIO_RISK_PER_TRADE_PCT / trade.riskPct) * 100
            : 0;
        const positionPct = Math.max(0, Math.min(PORTFOLIO_MAX_POSITION_PCT, riskBasedPositionPct));
        if (positionPct <= 0) continue;

        const selectedTrade = {
            ...trade,
            positionValue: realizedEquity * (positionPct / 100),
            positionPct,
        };
        selected.push(selectedTrade);
        active.push(selectedTrade);
    }

    const exits = [...selected].sort((a, b) =>
        a.exitDate.localeCompare(b.exitDate) || a.entryDate.localeCompare(b.entryDate)
    );
    let equity = PORTFOLIO_INITIAL_CAPITAL;
    let peak = equity;
    let maxDrawdownPct = 0;
    let positionPctSum = 0;

    for (const trade of exits) {
        equity += trade.positionValue * (trade.netPnlPct / 100);
        peak = Math.max(peak, equity);
        const drawdownPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
        maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
        positionPctSum += trade.positionPct;
    }

    const firstDate = new Date(ordered[0].entryDate).getTime();
    const lastDate = new Date(exits[exits.length - 1].exitDate).getTime();
    const periodDays = Math.max(1, Math.ceil((lastDate - firstDate) / (24 * 60 * 60 * 1000)));
    const years = Math.max(periodDays / 365.25, 1 / 365.25);
    const growth = equity / PORTFOLIO_INITIAL_CAPITAL;
    const annualizedReturnPct = growth > 0 ? (Math.pow(growth, 1 / years) - 1) * 100 : -100;

    return {
        selectedTrades: selected.length,
        capacityRejected,
        initialCapital: PORTFOLIO_INITIAL_CAPITAL,
        endingCapital: +equity.toFixed(2),
        totalReturnPct: +((growth - 1) * 100).toFixed(2),
        maxDrawdownPct: +maxDrawdownPct.toFixed(2),
        annualizedReturnPct: +annualizedReturnPct.toFixed(2),
        avgPositionPct: selected.length ? +(positionPctSum / selected.length).toFixed(2) : 0,
        periodDays,
    };
}

(async () => {
    console.log('====================================================');
    console.log('           STARTING HISTORICAL BACKTEST             ');
    console.log('====================================================');

    const universe = selectUniverse();
    const cappedUniverse = MAX_TICKERS > 0 ? universe.slice(0, MAX_TICKERS) : universe;
    const sourceCounts = cappedUniverse.reduce<Record<string, number>>((acc, member) => {
        acc[member.source] = (acc[member.source] ?? 0) + 1;
        return acc;
    }, {});

    console.log(`Universe mode: ${UNIVERSE_MODE}`);
    console.log(`Universe size: ${cappedUniverse.length} tickers`);
    console.log(`Round-trip cost: ${ROUND_TRIP_COST_PCT.toFixed(2)}%`);
    console.log(`Minimum history required: ${MIN_HISTORY} candles`);
    console.log(`Lookback requested: ${DEFAULT_LOOKBACK_DAYS} days`);
    console.log(`Fetch batch size: ${FETCH_BATCH_SIZE}`);
    console.log(`Entry confirmation window: ${ENTRY_WINDOW_DAYS} sessions`);
    console.log(`Maximum trigger gap: ${MAX_ENTRY_GAP_PCT.toFixed(2)}%`);
    console.log(`Portfolio: ${PORTFOLIO_MAX_POSITIONS} positions, ${PORTFOLIO_RISK_PER_TRADE_PCT.toFixed(2)}% risk/trade, ${PORTFOLIO_MAX_POSITION_PCT.toFixed(2)}% max position`);
    console.log(`Universe sources: ${Object.entries(sourceCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    if (UNIVERSE_ONLY) {
        console.log('Universe-only mode complete. No market data was fetched.');
        return;
    }

    const trades: BacktestTrade[] = [];
    const skipped = {
        insufficientHistory: 0,
        indicatorFailure: 0,
        noData: 0,
        technicalGate: 0,
        executionGate: 0,
        triggerNotFilled: 0,
    };

    const niftyCandles = await fetchHistoricalData('^NSEI', DEFAULT_LOOKBACK_DAYS);
    if (niftyCandles.length < MIN_HISTORY) {
        console.warn('Nifty history is incomplete. Benchmark-relative metrics may be noisy.');
    }

    for (let i = 0; i < cappedUniverse.length; i += FETCH_BATCH_SIZE) {
        const batch = cappedUniverse.slice(i, i + FETCH_BATCH_SIZE);
        console.log(`Fetching batch ${Math.floor(i / FETCH_BATCH_SIZE) + 1} of ${Math.ceil(cappedUniverse.length / FETCH_BATCH_SIZE)} (${batch.length} tickers)...`);
        const settled = await Promise.allSettled(
            batch.map(member => fetchHistoricalData(member.yahooTicker, DEFAULT_LOOKBACK_DAYS))
        );

        for (let b = 0; b < batch.length; b++) {
            const member = batch[b];
            const result = settled[b];
            if (result.status !== 'fulfilled') {
                skipped.noData++;
                console.log(`⚠️ Skip ${member.ticker}: candle fetch failed`);
                continue;
            }

            const candles = result.value;
            if (!candles.length) {
                skipped.noData++;
                console.log(`⚠️ Skip ${member.ticker}: no candle data returned`);
                continue;
            }

            if (candles.length < MIN_HISTORY) {
                skipped.insufficientHistory++;
                console.log(`⚠️ Skip ${member.ticker}: insufficient history (${candles.length} candles)`);
                continue;
            }

            for (let t = MIN_HISTORY; t < candles.length - HOLDING_DAYS - ENTRY_WINDOW_DAYS; t++) {
                const historySlice = candles.slice(0, t + 1);
                const signalDate = candles[t].date;
                const niftySlice = niftyCandles.slice(0, upperBoundByDate(niftyCandles, signalDate));

                const ind = computeIndicators(member.ticker, historySlice, niftySlice);
                if (!ind) {
                    skipped.indicatorFailure++;
                    continue;
                }

                const setupType = identifySetupType(ind);

                // Exclude underperforming setups
                if (setupType === 'Momentum Continuation' || setupType === 'EMA50 Pullback') {
                    skipped.technicalGate++;
                    continue;
                }

                const lastCandle = historySlice[historySlice.length - 1];
                const atr14 = calcATR(historySlice.slice(-30));
                if (!passesHistoricalTechnicalGate(ind, atr14)) {
                    skipped.technicalGate++;
                    continue;
                }

                const setupFamily = getSetupFamily(setupType, Boolean(ind.isDeepValue));
                const recentHigh5 = Math.max(...historySlice.slice(-5).map(c => c.high));
                const recentHigh10 = Math.max(...historySlice.slice(-10).map(c => c.high));
                const recentHigh20 = Math.max(...historySlice.slice(-20).map(c => c.high));
                let triggerPrice = +(lastCandle.high * 1.001).toFixed(2);
                if (setupType.includes('Pre-Surge')) {
                    // For pre-surge bases: enter at current close (limit order at base), not above high
                    triggerPrice = +(ind.ltp * 1.005).toFixed(2);
                } else if (setupType === 'Leader Pullback Reclaim') {
                    triggerPrice = +(Math.max(lastCandle.high, ind.ema20, recentHigh10) * 1.001).toFixed(2);
                } else if (setupType === 'Second-Entry Retest') {
                    triggerPrice = +(Math.max(lastCandle.high, recentHigh20) * 1.0012).toFixed(2);
                } else if (setupType === 'Earnings Reaction Continuation') {
                    triggerPrice = +(Math.max(lastCandle.high, recentHigh10, ind.ema20) * 1.001).toFixed(2);
                } else if (setupType === 'Compression in Leaders') {
                    triggerPrice = +(Math.max(lastCandle.high, recentHigh5) * 1.0015).toFixed(2);
                }

                let entryIndex = -1;
                let entryPrice = 0;
                for (let candidateIndex = t + 1; candidateIndex <= Math.min(t + ENTRY_WINDOW_DAYS, candles.length - 1); candidateIndex++) {
                    const candidate = candles[candidateIndex];
                    if (candidate.high < triggerPrice) continue;
                    const possibleEntry = Math.max(candidate.open, triggerPrice);
                    const gapAboveTriggerPct = ((possibleEntry - triggerPrice) / triggerPrice) * 100;
                    if (gapAboveTriggerPct > MAX_ENTRY_GAP_PCT) break;
                    entryIndex = candidateIndex;
                    entryPrice = possibleEntry;
                    break;
                }
                if (entryIndex < 0) {
                    skipped.triggerNotFilled++;
                    continue;
                }

                let stopLoss = 0;
                const recentLow5 = Math.min(...historySlice.slice(-5).map(c => c.low));
                const recentLow8 = Math.min(...historySlice.slice(-8).map(c => c.low));
                const recentLow12 = Math.min(...historySlice.slice(-12).map(c => c.low));
                const previousClose = historySlice[historySlice.length - 2]?.close ?? lastCandle.close;
                if (ind.isDeepValue) {
                    const recentLows = historySlice.slice(-15).map(c => c.low);
                    stopLoss = Math.min(...recentLows) * 0.99;
                } else if (setupType === 'Leader Pullback Reclaim') {
                    stopLoss = Math.min(recentLow8, ind.ema20 * 0.993, triggerPrice - 1.3 * atr14);
                } else if (setupType === 'Second-Entry Retest') {
                    stopLoss = Math.min(recentLow12, ind.ema20 * 0.992, triggerPrice - 1.5 * atr14);
                } else if (setupType === 'Earnings Reaction Continuation') {
                    stopLoss = Math.min(recentLow5, previousClose * 0.995, triggerPrice - 1.4 * atr14);
                } else if (setupType === 'Compression in Leaders') {
                    stopLoss = Math.min(recentLow5, ind.ema20 * 0.994, triggerPrice - 1.25 * atr14);
                } else if (setupType.includes('VCP') || ind.isBullFlag || setupType === 'Squeeze Breakout' || setupType === 'Compression Breakout') {
                    const recentLows = historySlice.slice(-5).map(c => c.low);
                    stopLoss = Math.min(...recentLows) * 0.993;
                } else if (setupType.includes('Pre-Surge')) {
                    // Tight stop just below the 20 EMA base
                    stopLoss = Math.min(ind.ema20 * 0.975, entryPrice - 1.0 * atr14);
                } else if (setupType.includes('Pullback')) {
                    const recentLows = historySlice.slice(-8).map(c => c.low);
                    stopLoss = Math.min(...recentLows) * 0.994;
                } else {
                    stopLoss = Math.min(ind.ema20 * 0.99, entryPrice - 1.5 * atr14);
                }

                if (entryPrice - stopLoss > 2.5 * atr14) stopLoss = entryPrice - 2.5 * atr14;
                if (stopLoss >= entryPrice) stopLoss = entryPrice - atr14;
                stopLoss = +stopLoss.toFixed(2);

                const slDistance = entryPrice - stopLoss;
                const targetAtrMult = setupType.includes('Pre-Surge') ? 4.5  // wider target for base breakouts
                    : setupType === 'Leader Pullback Reclaim' ? 2.8
                        : setupType === 'Second-Entry Retest' ? 3.1
                            : setupType === 'Earnings Reaction Continuation' ? 3.4
                                : setupType === 'Compression in Leaders' ? 3.2
                                    : ind.isDeepValue ? 2.6 : 3.0;
                let target = +(triggerPrice + targetAtrMult * atr14).toFixed(2);
                if (ind.isDeepValue && ind.ema50 > triggerPrice + 2 * atr14) {
                    target = +ind.ema50.toFixed(2);
                }
                const riskReward = (target - entryPrice) / Math.max(slDistance, 0.01);
                const targetPct = ((target - entryPrice) / entryPrice) * 100;
                const strongEarlyContinuation =
                    ind.volumeRatio >= 1.5 && ind.returns10d >= 3 && ind.rsi14 >= 54 && ind.rsi14 <= 72;
                const minimumRiskReward = setupFamily === 'EVENT_DRIVEN' ? 1.9
                    : setupFamily === 'LEADER' ? 1.8
                        : strongEarlyContinuation ? 1.35 : 1.5;
                const minimumTargetPct = setupFamily === 'EVENT_DRIVEN' ? 3.5
                    : setupFamily === 'LEADER' ? 3.0
                        : strongEarlyContinuation ? 3.2 : 4.0;
                if (stopLoss <= 0 || stopLoss >= entryPrice || riskReward < minimumRiskReward || targetPct < minimumTargetPct) {
                    skipped.executionGate++;
                    continue;
                }

                const confidenceBreakdown = computeConfidence(ind, riskReward, setupType);
                const setupConfidence = confidenceBreakdown.total;

                if (trades.length < 15) {
                    console.log(`[Confidence Debug] ${member.ticker} on ${candles[entryIndex].date}:`, {
                        setupType,
                        setupConfidence,
                        adx: ind.adx14.toFixed(1),
                        volRatio: ind.volumeRatio.toFixed(1),
                        rsi: ind.rsi14.toFixed(1),
                        ltp: ind.ltp,
                        dma200: ind.dma200,
                        components: {
                            trend: confidenceBreakdown.scoreTrend,
                            vol: confidenceBreakdown.scoreVolume,
                            rs: confidenceBreakdown.scoreRS,
                            setup: confidenceBreakdown.scoreSetup,
                            rr: confidenceBreakdown.scoreRR,
                        },
                        total: setupConfidence,
                    });
                }

                let exitPrice = 0;
                let exitReason: 'TARGET' | 'STOP' | 'TIME_EXIT' = 'TIME_EXIT';
                let exitDate = '';
                let daysHeld = 0;

                for (let k = entryIndex; k < Math.min(entryIndex + HOLDING_DAYS, candles.length); k++) {
                    const currentDay = candles[k];
                    daysHeld = k - entryIndex + 1;

                    if (currentDay.low <= stopLoss) {
                        exitPrice = stopLoss;
                        exitReason = 'STOP';
                        exitDate = currentDay.date;
                        break;
                    }

                    if (currentDay.high >= target) {
                        exitPrice = target;
                        exitReason = 'TARGET';
                        exitDate = currentDay.date;
                        break;
                    }
                }

                if (exitReason === 'TIME_EXIT') {
                    const lastCheckDay = candles[Math.min(entryIndex + HOLDING_DAYS - 1, candles.length - 1)];
                    exitPrice = lastCheckDay.close;
                    exitDate = lastCheckDay.date;
                }

                const grossPnlPct = +(((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2);
                const netPnlPct = +(grossPnlPct - ROUND_TRIP_COST_PCT).toFixed(2);
                const riskPct = +(((entryPrice - stopLoss) / entryPrice) * 100).toFixed(2);
                const rMultiple = +(netPnlPct / Math.max(riskPct, 0.01)).toFixed(2);

                trades.push({
                    ticker: member.ticker,
                    source: member.source,
                    signalDate,
                    entryDate: candles[entryIndex].date,
                    entryPrice: +entryPrice.toFixed(2),
                    setupType,
                    setupFamily,
                    stopLoss,
                    target,
                    exitDate,
                    exitPrice: +exitPrice.toFixed(2),
                    exitReason,
                    grossPnlPct,
                    netPnlPct,
                    riskPct,
                    rMultiple,
                    daysHeld,
                    confidenceScore: setupConfidence,
                });

                t = entryIndex + daysHeld - 1;
            }
        }
    }

    if (trades.length === 0) {
        console.log('No trade setups triggered during the backtest period.');
        console.log(`Skip stats: noData=${skipped.noData} | insufficientHistory=${skipped.insufficientHistory} | indicatorFailure=${skipped.indicatorFailure} | technicalGate=${skipped.technicalGate} | triggerNotFilled=${skipped.triggerNotFilled} | executionGate=${skipped.executionGate}`);
        return;
    }

    function getStats(filteredTrades: BacktestTrade[]) {
        if (filteredTrades.length === 0) return null;
        const wins = filteredTrades.filter(t => t.netPnlPct > 0);
        const losses = filteredTrades.filter(t => t.netPnlPct <= 0);
        const winRate = +((wins.length / filteredTrades.length) * 100).toFixed(2);
        const avgProfitPct = wins.length > 0
            ? +(wins.reduce((sum, t) => sum + t.netPnlPct, 0) / wins.length).toFixed(2)
            : 0;
        const avgLossPct = losses.length > 0
            ? +(losses.reduce((sum, t) => sum + t.netPnlPct, 0) / losses.length).toFixed(2)
            : 0;
        const totalProfitPct = filteredTrades.reduce((sum, t) => sum + t.netPnlPct, 0);
        const grossProfit = wins.reduce((sum, t) => sum + t.netPnlPct, 0);
        const grossLoss = losses.reduce((sum, t) => sum + t.netPnlPct, 0);
        const profitFactor = grossLoss !== 0
            ? +(Math.abs(grossProfit / grossLoss)).toFixed(2)
            : 999;
        const expectancyPct = +(totalProfitPct / filteredTrades.length).toFixed(2);
        const avgR = +(filteredTrades.reduce((sum, t) => sum + t.rMultiple, 0) / filteredTrades.length).toFixed(2);
        const sortedR = filteredTrades.map(t => t.rMultiple).sort((a, b) => a - b);
        const middle = Math.floor(sortedR.length / 2);
        const medianR = +(sortedR.length % 2
            ? sortedR[middle]
            : (sortedR[middle - 1] + sortedR[middle]) / 2).toFixed(2);
        const targetRate = +((filteredTrades.filter(t => t.exitReason === 'TARGET').length / filteredTrades.length) * 100).toFixed(2);
        const stopRate = +((filteredTrades.filter(t => t.exitReason === 'STOP').length / filteredTrades.length) * 100).toFixed(2);

        return {
            count: filteredTrades.length,
            wins: wins.length,
            losses: losses.length,
            winRate,
            avgProfitPct,
            avgLossPct,
            totalProfitPct,
            profitFactor,
            expectancyPct,
            avgR,
            medianR,
            targetRate,
            stopRate,
            avgHeld: +(filteredTrades.reduce((sum, t) => sum + t.daysHeld, 0) / filteredTrades.length).toFixed(1),
        };
    }

    const thresholds = [5.0, 6.0, 7.0];
    const thresholdStats = new Map<number, ReturnType<typeof getStats>>();
    for (const threshold of thresholds) {
        thresholdStats.set(threshold, getStats(trades.filter(t => t.confidenceScore >= threshold)));
    }

    const noFilterStats = getStats(trades);
    const portfolioStats = new Map<string, PortfolioStats | null>();
    portfolioStats.set('No Filter', simulatePortfolio(trades));
    for (const threshold of thresholds) {
        portfolioStats.set(`Conf >= ${threshold.toFixed(1)}`, simulatePortfolio(trades.filter(t => t.confidenceScore >= threshold)));
    }

    console.log('\n====================================================');
    console.log('               BACKTEST RESULTS                      ');
    console.log('====================================================');
    console.log('Performance comparison by Confidence Score Threshold:');
    console.log('--------------------------------------------------------------------------------');
    console.log(
        String('Threshold').padEnd(15) + ' | ' +
        String('Trades').padEnd(8) + ' | ' +
        String('Win Rate').padEnd(10) + ' | ' +
        String('Avg Win').padEnd(10) + ' | ' +
        String('Avg Loss').padEnd(10) + ' | ' +
        String('Net P&L').padEnd(12)
    );
    console.log('--------------------------------------------------------------------------------');

    const printStats = (label: string, stats: ReturnType<typeof getStats> | null) => {
        if (!stats) return;
        console.log(
            label.padEnd(15) + ' | ' +
            String(stats.count).padEnd(8) + ' | ' +
            `${stats.winRate}%`.padEnd(10) + ' | ' +
            (`+${stats.avgProfitPct}%`).padEnd(10) + ' | ' +
            (`${stats.avgLossPct}%`).padEnd(10) + ' | ' +
            (`${stats.totalProfitPct.toFixed(2)}%`).padEnd(12)
        );
    };

    printStats('No Filter', noFilterStats);
    for (const threshold of thresholds) {
        printStats(`Conf >= ${threshold.toFixed(1)}`, thresholdStats.get(threshold) ?? null);
    }

    const targetTrades = trades.filter(t => t.confidenceScore >= 5.0);
    const tradesBySetup: Record<string, BacktestTrade[]> = {};
    for (const trade of targetTrades) {
        (tradesBySetup[trade.setupType] ??= []).push(trade);
    }
    const setupsSummary = Object.fromEntries(
        Object.entries(tradesBySetup).map(([name, setupTrades]) => [name, getStats(setupTrades)])
    );
    const tradesByMarket = targetTrades.reduce<Record<string, BacktestTrade[]>>((acc, trade) => {
        const market = trade.source.startsWith('BSE_EXCLUSIVE:') ? 'BSE Exclusive' : 'NSE';
        (acc[market] ??= []).push(trade);
        return acc;
    }, {});
    const marketSummary = Object.fromEntries(
        Object.entries(tradesByMarket).map(([name, marketTrades]) => [name, getStats(marketTrades)])
    );

    console.log('\nSetup Performance Breakdown (For Conf >= 5.0):');
    console.log('--------------------------------------------------------------------------------');
    console.log(
        String('Setup Type').padEnd(25) + ' | ' +
        String('Trades').padEnd(8) + ' | ' +
        String('Win Rate').padEnd(10) + ' | ' +
        String('Net Return').padEnd(12)
    );
    console.log('--------------------------------------------------------------------------------');
    for (const [name, stats] of Object.entries(setupsSummary)) {
        if (!stats) continue;
        const wr = stats.winRate.toFixed(1) + '%';
        const net = stats.totalProfitPct.toFixed(1) + '%';
        console.log(
            name.padEnd(25) + ' | ' +
            String(stats.count).padEnd(8) + ' | ' +
            wr.padEnd(10) + ' | ' +
            net.padEnd(12)
        );
    }

    const runTimestamp = new Date();
    const runId = runTimestamp.toISOString().replace(/[:.]/g, '-');
    let markdown = `# Historical Backtest Report\n\n`;
    markdown += `**Run ID:** ${runId}\n`;
    markdown += `**Date:** ${runTimestamp.toLocaleDateString()}\n`;
    markdown += `**Universe Mode:** ${UNIVERSE_MODE}\n`;
    markdown += `**Universe Size:** ${cappedUniverse.length}\n`;
    markdown += `**Lookback / Minimum History:** ${DEFAULT_LOOKBACK_DAYS} / ${MIN_HISTORY} sessions\n`;
    markdown += `**Round Trip Cost:** ${ROUND_TRIP_COST_PCT.toFixed(2)}%\n`;
    markdown += `**Entry Model:** Buy-stop trigger, ${ENTRY_WINDOW_DAYS}-session validity, maximum ${MAX_ENTRY_GAP_PCT.toFixed(2)}% gap above trigger\n`;
    markdown += `**Exit Model:** Structural stop, setup-specific target, ${HOLDING_DAYS}-session time exit\n`;
    markdown += `**Portfolio Model:** INR ${PORTFOLIO_INITIAL_CAPITAL.toLocaleString()}, ${PORTFOLIO_MAX_POSITIONS} concurrent positions, ${PORTFOLIO_RISK_PER_TRADE_PCT.toFixed(2)}% risk/trade, ${PORTFOLIO_MAX_POSITION_PCT.toFixed(2)}% max position\n`;
    markdown += `**Strategy:** Current swing stack with leader, retest, event-reaction, and compression setup families\n\n`;

    markdown += `## Interpretation Rules\n\n`;
    markdown += `- Portfolio return is the investable comparison metric. Summed trade P&L is a signal-edge diagnostic, not account return.\n`;
    markdown += `- Signals pass historical liquidity, price, ATR, accumulation, relative-strength, trend, and leader/special-structure gates.\n`;
    markdown += `- A signal becomes a trade only when price reaches its buy-stop trigger without exceeding the configured gap limit.\n`;
    markdown += `- If stop and target are both touched in one daily candle, the stop is assumed first.\n`;
    markdown += `- Point-in-time fundamentals, news risk, earnings calendars, options flow, taxes, and market-regime sizing are not reconstructed.\n`;
    markdown += `- Current universe membership introduces survivorship bias; delisted stocks and historical index membership are not included.\n\n`;

    markdown += `## Performance Comparison by Confidence Threshold\n\n`;
    markdown += `| Threshold | Trades | Win Rate | Avg Win | Avg Loss | Profit Factor | Expectancy | Avg R | Median R | Summed P&L |\n`;
    markdown += `|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
    if (noFilterStats) {
        markdown += `| No Filter | ${noFilterStats.count} | ${noFilterStats.winRate}% | +${noFilterStats.avgProfitPct}% | ${noFilterStats.avgLossPct}% | ${noFilterStats.profitFactor} | ${noFilterStats.expectancyPct}% | ${noFilterStats.avgR} | ${noFilterStats.medianR} | ${noFilterStats.totalProfitPct.toFixed(2)}% |\n`;
    }
    for (const threshold of thresholds) {
        const stats = thresholdStats.get(threshold);
        if (!stats) continue;
        markdown += `| Conf >= ${threshold.toFixed(1)} | ${stats.count} | ${stats.winRate}% | +${stats.avgProfitPct}% | ${stats.avgLossPct}% | ${stats.profitFactor} | ${stats.expectancyPct}% | ${stats.avgR} | ${stats.medianR} | ${stats.totalProfitPct.toFixed(2)}% |\n`;
    }

    markdown += `\n## Position-Limited Portfolio Simulation\n\n`;
    markdown += `| Threshold | Executed | Capacity Rejected | Test Days | Ending Capital | Total Return | Annualized Return | Max Drawdown | Avg Position |\n`;
    markdown += `|---|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
    for (const [label, stats] of portfolioStats) {
        if (!stats) continue;
        markdown += `| ${label} | ${stats.selectedTrades} | ${stats.capacityRejected} | ${stats.periodDays} | INR ${stats.endingCapital.toLocaleString()} | ${stats.totalReturnPct}% | ${stats.annualizedReturnPct}% | ${stats.maxDrawdownPct}% | ${stats.avgPositionPct}% |\n`;
    }

    markdown += `\n## Setup Breakdown (For Conf >= 5.0)\n\n`;
    markdown += `| Setup Type | Trades | Win Rate | Profit Factor | Expectancy | Avg R | Target Rate | Stop Rate | Summed P&L |\n`;
    markdown += `|---|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
    for (const [name, stats] of Object.entries(setupsSummary)) {
        if (!stats) continue;
        markdown += `| **${name}** | ${stats.count} | ${stats.winRate}% | ${stats.profitFactor} | ${stats.expectancyPct}% | ${stats.avgR} | ${stats.targetRate}% | ${stats.stopRate}% | ${stats.totalProfitPct.toFixed(1)}% |\n`;
    }

    markdown += `\n## Market Source Breakdown (For Conf >= 5.0)\n\n`;
    markdown += `| Market Source | Trades | Win Rate | Profit Factor | Expectancy | Avg R | Summed P&L |\n`;
    markdown += `|---|---:|---:|---:|---:|---:|---:|\n`;
    for (const [name, stats] of Object.entries(marketSummary)) {
        if (!stats) continue;
        markdown += `| ${name} | ${stats.count} | ${stats.winRate}% | ${stats.profitFactor} | ${stats.expectancyPct}% | ${stats.avgR} | ${stats.totalProfitPct.toFixed(1)}% |\n`;
    }

    markdown += `\n## Sample Trades Executed (Top 25, Conf >= 5.0)\n\n`;
    markdown += `| Ticker | Signal | Entry Date | Entry | Setup Type | Family | Stop | Target | Exit Date | Exit | Reason | Net P&L | R | Conf |\n`;
    markdown += `|---|---|---|---:|---|---|---:|---:|---|---:|---|---:|---:|---:|\n`;
    for (const trade of targetTrades) {
        markdown += `| ${trade.ticker} | ${trade.signalDate} | ${trade.entryDate} | ${trade.entryPrice} | ${trade.setupType} | ${trade.setupFamily} | ${trade.stopLoss} | ${trade.target} | ${trade.exitDate} | ${trade.exitPrice} | ${trade.exitReason} | ${trade.netPnlPct > 0 ? '+' : ''}${trade.netPnlPct}% | ${trade.rMultiple} | ${trade.confidenceScore} |\n`;
    }

    markdown += `\n## Data Quality\n\n`;
    markdown += `- No data: ${skipped.noData}\n`;
    markdown += `- Insufficient history: ${skipped.insufficientHistory}\n`;
    markdown += `- Indicator failures: ${skipped.indicatorFailure}\n`;
    markdown += `- Rejected by technical gates: ${skipped.technicalGate}\n`;
    markdown += `- Trigger not filled: ${skipped.triggerNotFilled}\n`;
    markdown += `- Rejected by execution/RR gates: ${skipped.executionGate}\n`;

    const reportPath = path.join(process.cwd(), 'backtest_report.md');
    const archiveDir = path.join(process.cwd(), 'reports', 'backtests');
    fs.mkdirSync(archiveDir, { recursive: true });
    if (fs.existsSync(reportPath)) {
        fs.copyFileSync(reportPath, path.join(archiveDir, `previous_${runId}.md`));
    }
    fs.writeFileSync(reportPath, markdown);
    fs.writeFileSync(path.join(archiveDir, `backtest_${runId}.md`), markdown);
    console.log(`\nDetailed markdown report written to ${reportPath}`);
    console.log(`Archived report written to ${archiveDir}`);
    console.log(`Skipped symbols: no data=${skipped.noData}, insufficient history=${skipped.insufficientHistory}, indicator failure=${skipped.indicatorFailure}, technical gate=${skipped.technicalGate}, trigger not filled=${skipped.triggerNotFilled}, execution gate=${skipped.executionGate}`);
})();
