import { promises as fs } from 'fs';
import path from 'path';
import prisma from './prismaClient';
import { TradeSetup } from './types';

const STORE_PATH = path.join(process.cwd(), 'data', 'edge-analytics.json');

type SignalStatus = 'IN_PROGRESS' | 'WON' | 'LOST' | 'AUTHORIZED' | 'MONITORED' | 'EXPIRED';

export interface TrackedSignal {
    historicalSetupId: string;
    ticker: string;
    setupType: string;
    setupFamily: string;
    setupCategory: string;
    thesisHorizonDays: number | null;
    timeframe: string | null;
    aiSignal: string;
    confidenceScore: number;
    confidenceBand: 'LOW' | 'MEDIUM' | 'HIGH';
    confluenceScore: number;
    confluenceBand: 'LOW' | 'MEDIUM' | 'HIGH';
    sector: string;
    regime: string;
    newsAlignment: string;
    confirmationStatus: string;
    alertEligible: boolean;
    riskReward: number;
    targetPct: number;
    slPct: number;
    edgeScore: number;
    positionSizePct: number;
    createdAt: string;
    dayOfWeek: string;
    status: SignalStatus;
    resultPct: number | null;
    resolvedAt: string | null;
}

interface EdgeAnalyticsState {
    signals: TrackedSignal[];
    updatedAt: string | null;
}

function toConfidenceBand(score: number): TrackedSignal['confidenceBand'] {
    if (score >= 8) return 'HIGH';
    if (score >= 6) return 'MEDIUM';
    return 'LOW';
}

function toConfluenceBand(score: number): TrackedSignal['confluenceBand'] {
    if (score >= 7.5) return 'HIGH';
    if (score >= 5.8) return 'MEDIUM';
    return 'LOW';
}

function toDayOfWeek(value: string | Date): string {
    return new Date(value).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Calcutta' });
}

async function ensureStore(): Promise<void> {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    try {
        await fs.access(STORE_PATH);
    } catch {
        const initial: EdgeAnalyticsState = { signals: [], updatedAt: null };
        await fs.writeFile(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    }
}

async function readStore(): Promise<EdgeAnalyticsState> {
    await ensureStore();
    try {
        const raw = await fs.readFile(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as Partial<EdgeAnalyticsState>;
        return {
            signals: Array.isArray(parsed.signals)
                ? parsed.signals.map((signal: any) => ({
                    ...signal,
                    setupFamily: signal?.setupFamily ?? 'UNKNOWN',
                    setupCategory: signal?.setupCategory ?? 'UNKNOWN',
                    thesisHorizonDays: typeof signal?.thesisHorizonDays === 'number' ? signal.thesisHorizonDays : null,
                    dayOfWeek: signal?.dayOfWeek ?? toDayOfWeek(signal?.createdAt ?? new Date()),
                    confluenceScore: typeof signal?.confluenceScore === 'number' ? signal.confluenceScore : 0,
                    confluenceBand: signal?.confluenceBand ?? toConfluenceBand(signal?.confluenceScore ?? 0),
                }))
                : [],
            updatedAt: parsed.updatedAt ?? null,
        };
    } catch {
        return { signals: [], updatedAt: null };
    }
}

async function writeStore(state: EdgeAnalyticsState): Promise<void> {
    await ensureStore();
    state.updatedAt = new Date().toISOString();
    await fs.writeFile(STORE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

export async function trackHistoricalSetup(
    historicalSetupId: string,
    setup: TradeSetup,
    regime: string
): Promise<void> {
    const state = await readStore();
    const existingIndex = state.signals.findIndex(signal => signal.historicalSetupId === historicalSetupId);
    const nextSignal: TrackedSignal = {
        historicalSetupId,
        ticker: setup.ticker,
        setupType: setup.setupType,
        setupFamily: setup.setupFamily ?? 'UNKNOWN',
        setupCategory: setup.setupCategory ?? 'UNKNOWN',
        thesisHorizonDays: setup.thesisHorizonDays ?? null,
        timeframe: setup.timeframe ?? null,
        aiSignal: setup.aiSignal || 'WATCH',
        confidenceScore: setup.confidenceScore,
        confidenceBand: toConfidenceBand(setup.confidenceScore),
        confluenceScore: +(setup.confluenceScore ?? 0).toFixed(2),
        confluenceBand: toConfluenceBand(setup.confluenceScore ?? 0),
        sector: setup.sector || 'Diversified',
        regime,
        newsAlignment: setup.newsDistribution?.signalAlignment ?? 'UNAVAILABLE',
        confirmationStatus: setup.marketGrounding?.confirmationStatus ?? 'UNAVAILABLE',
        alertEligible: !!setup.newsDistribution?.alertEligible,
        riskReward: setup.riskReward,
        targetPct: setup.targetPct,
        slPct: setup.slPct,
        edgeScore: +(setup.calibratedEdgeScore ?? setup.confidenceScore).toFixed(2),
        positionSizePct: +(setup.positionSizePct ?? 0).toFixed(2),
        createdAt: new Date().toISOString(),
        dayOfWeek: toDayOfWeek(new Date()),
        status: 'IN_PROGRESS',
        resultPct: null,
        resolvedAt: null,
    };

    if (existingIndex >= 0) state.signals[existingIndex] = { ...state.signals[existingIndex], ...nextSignal };
    else state.signals.unshift(nextSignal);

    await writeStore(state);
}

export async function syncTrackedSignalResolution(
    historicalSetupId: string,
    status: SignalStatus,
    resultPct: number | null,
    resolvedAt: string | Date | null
): Promise<void> {
    const state = await readStore();
    const signal = state.signals.find(item => item.historicalSetupId === historicalSetupId);
    if (!signal) return;
    signal.status = status;
    signal.resultPct = resultPct;
    signal.resolvedAt = resolvedAt ? new Date(resolvedAt).toISOString() : null;
    await writeStore(state);
}

type BucketSummary = ReturnType<typeof buildBucketSummary>[number];

function qualifiesForPromotion(bucket: BucketSummary): boolean {
    return bucket.resolved >= 4 && bucket.expectancy > 0.35 && bucket.winRate >= 50;
}

function qualifiesForDowngrade(bucket: BucketSummary): boolean {
    return bucket.resolved >= 3 && (bucket.expectancy < -0.15 || (bucket.winRate < 40 && bucket.avgLoss < -0.8));
}

function computeDrawdown(resolved: TrackedSignal[]): number {
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;

    for (const signal of resolved) {
        equity += signal.resultPct ?? 0;
        peak = Math.max(peak, equity);
        maxDrawdown = Math.min(maxDrawdown, equity - peak);
    }

    return +maxDrawdown.toFixed(2);
}

function buildBucketSummary(signals: TrackedSignal[], key: keyof TrackedSignal) {
    const buckets = new Map<string, TrackedSignal[]>();
    for (const signal of signals) {
        const bucketKey = String(signal[key] ?? 'UNKNOWN');
        const list = buckets.get(bucketKey) ?? [];
        list.push(signal);
        buckets.set(bucketKey, list);
    }

    return Array.from(buckets.entries()).map(([bucket, rows]) => {
        const resolved = rows.filter(item => item.status === 'WON' || item.status === 'LOST');
        const wins = resolved.filter(item => item.status === 'WON');
        const losses = resolved.filter(item => item.status === 'LOST');
        const avgWin = wins.length ? wins.reduce((sum, item) => sum + (item.resultPct ?? 0), 0) / wins.length : 0;
        const avgLoss = losses.length ? losses.reduce((sum, item) => sum + (item.resultPct ?? 0), 0) / losses.length : 0;
        const winRate = resolved.length ? (wins.length / resolved.length) * 100 : 0;
        const expectancy = resolved.length ? ((wins.length / resolved.length) * avgWin) + ((losses.length / resolved.length) * avgLoss) : 0;

        return {
            bucket,
            samples: rows.length,
            resolved: resolved.length,
            winRate: +winRate.toFixed(1),
            expectancy: +expectancy.toFixed(2),
            avgWin: +avgWin.toFixed(2),
            avgLoss: +avgLoss.toFixed(2),
        };
    }).sort((a, b) => b.expectancy - a.expectancy);
}

export async function buildEdgeDashboard() {
    const state = await readStore();
    const signals = state.signals.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const resolved = signals.filter(signal => signal.status === 'WON' || signal.status === 'LOST');
    const wins = resolved.filter(signal => signal.status === 'WON');
    const losses = resolved.filter(signal => signal.status === 'LOST');
    const avgWin = wins.length ? wins.reduce((sum, signal) => sum + (signal.resultPct ?? 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((sum, signal) => sum + (signal.resultPct ?? 0), 0) / losses.length : 0;
    const winRate = resolved.length ? (wins.length / resolved.length) * 100 : 0;
    const expectancy = resolved.length ? ((wins.length / resolved.length) * avgWin) + ((losses.length / resolved.length) * avgLoss) : 0;
    const grossProfit = wins.reduce((sum, signal) => sum + Math.max(signal.resultPct ?? 0, 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, signal) => sum + Math.min(signal.resultPct ?? 0, 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
    const falseAlertRate = signals.filter(signal => signal.alertEligible).length
        ? (signals.filter(signal => signal.alertEligible && signal.status === 'LOST').length / signals.filter(signal => signal.alertEligible).length) * 100
        : 0;

    return {
        updatedAt: state.updatedAt,
        totals: {
            tracked: signals.length,
            resolved: resolved.length,
            won: wins.length,
            lost: losses.length,
            inProgress: signals.filter(signal => signal.status === 'IN_PROGRESS').length,
            expectancy: +expectancy.toFixed(2),
            avgWin: +avgWin.toFixed(2),
            avgLoss: +avgLoss.toFixed(2),
            winRate: +winRate.toFixed(1),
            profitFactor: +profitFactor.toFixed(2),
            maxDrawdown: computeDrawdown(resolved),
            falseAlertRate: +falseAlertRate.toFixed(1),
        },
        strongestBuckets: buildBucketSummary(resolved, 'setupType').slice(0, 5),
        weakestBuckets: buildBucketSummary(resolved, 'setupType').slice(-5).reverse(),
        familyBuckets: buildBucketSummary(resolved, 'setupFamily'),
        categoryBuckets: buildBucketSummary(resolved, 'setupCategory'),
        sectorBuckets: buildBucketSummary(resolved, 'sector'),
        regimeBuckets: buildBucketSummary(resolved, 'regime'),
        alignmentBuckets: buildBucketSummary(resolved, 'newsAlignment'),
        confidenceBuckets: buildBucketSummary(resolved, 'confidenceBand'),
        confluenceBuckets: buildBucketSummary(resolved, 'confluenceBand'),
        dayOfWeekBuckets: buildBucketSummary(resolved, 'dayOfWeek'),
        recentSignals: signals.slice(-20).reverse(),
    };
}

export async function getCalibrationMap() {
    const dashboard = await buildEdgeDashboard();

    const setupMap = new Map<string, number>();
    for (const bucket of dashboard.strongestBuckets) {
        if (qualifiesForPromotion(bucket)) setupMap.set(bucket.bucket, 0.35);
    }
    for (const bucket of dashboard.weakestBuckets) {
        if (qualifiesForDowngrade(bucket)) setupMap.set(bucket.bucket, -0.45);
    }

    const familyMap = new Map<string, number>();
    for (const bucket of dashboard.familyBuckets) {
        if (qualifiesForPromotion(bucket)) familyMap.set(bucket.bucket, 0.2);
        else if (qualifiesForDowngrade(bucket)) familyMap.set(bucket.bucket, -0.24);
    }

    const categoryMap = new Map<string, number>();
    for (const bucket of dashboard.categoryBuckets) {
        if (qualifiesForPromotion(bucket)) categoryMap.set(bucket.bucket, 0.12);
        else if (qualifiesForDowngrade(bucket)) categoryMap.set(bucket.bucket, -0.16);
    }

    const alignmentMap = new Map<string, number>();
    for (const bucket of dashboard.alignmentBuckets) {
        if (qualifiesForPromotion(bucket)) alignmentMap.set(bucket.bucket, 0.2);
        else if (qualifiesForDowngrade(bucket)) alignmentMap.set(bucket.bucket, -0.25);
    }

    const confidenceMap = new Map<string, number>();
    for (const bucket of dashboard.confidenceBuckets) {
        if (qualifiesForPromotion(bucket)) confidenceMap.set(bucket.bucket, 0.15);
        else if (qualifiesForDowngrade(bucket)) confidenceMap.set(bucket.bucket, -0.2);
    }

    const confluenceMap = new Map<string, number>();
    for (const bucket of dashboard.confluenceBuckets) {
        if (qualifiesForPromotion(bucket)) confluenceMap.set(bucket.bucket, 0.18);
        else if (qualifiesForDowngrade(bucket)) confluenceMap.set(bucket.bucket, -0.22);
    }

    const sectorMap = new Map<string, number>();
    for (const bucket of dashboard.sectorBuckets) {
        if (qualifiesForPromotion(bucket)) sectorMap.set(bucket.bucket, 0.18);
        else if (qualifiesForDowngrade(bucket)) sectorMap.set(bucket.bucket, -0.22);
    }

    const regimeMap = new Map<string, number>();
    for (const bucket of dashboard.regimeBuckets) {
        if (qualifiesForPromotion(bucket)) regimeMap.set(bucket.bucket, 0.16);
        else if (qualifiesForDowngrade(bucket)) regimeMap.set(bucket.bucket, -0.2);
    }

    const dayOfWeekMap = new Map<string, number>();
    for (const bucket of dashboard.dayOfWeekBuckets) {
        if (qualifiesForPromotion(bucket)) dayOfWeekMap.set(bucket.bucket, 0.1);
        else if (qualifiesForDowngrade(bucket)) dayOfWeekMap.set(bucket.bucket, -0.12);
    }

    return {
        setupMap,
        familyMap,
        categoryMap,
        alignmentMap,
        confidenceMap,
        confluenceMap,
        sectorMap,
        regimeMap,
        dayOfWeekMap,
        totals: dashboard.totals,
    };
}

export async function backfillTrackedSignalsFromDb(): Promise<void> {
    const history = await prisma.historicalSetup.findMany({
        orderBy: { createdAt: 'desc' },
        take: 300,
    });
    const state = await readStore();
    const knownIds = new Set(state.signals.map(signal => signal.historicalSetupId));

    for (const item of history) {
        if (knownIds.has(item.id)) continue;
        state.signals.push({
            historicalSetupId: item.id,
            ticker: item.ticker,
            setupType: item.setupType,
            setupFamily: 'UNKNOWN',
            setupCategory: 'UNKNOWN',
            thesisHorizonDays: null,
            timeframe: item.timeframe,
            aiSignal: item.aiSignal,
            confidenceScore: item.confidenceScore,
            confidenceBand: toConfidenceBand(item.confidenceScore),
            confluenceScore: 0,
            confluenceBand: 'LOW',
            sector: 'Unknown',
            regime: 'UNKNOWN',
            newsAlignment: 'UNAVAILABLE',
            confirmationStatus: 'UNAVAILABLE',
            alertEligible: false,
            riskReward: 0,
            targetPct: 0,
            slPct: 0,
            edgeScore: item.confidenceScore,
            positionSizePct: 0,
            createdAt: item.createdAt.toISOString(),
            dayOfWeek: toDayOfWeek(item.createdAt),
            status: item.status as SignalStatus,
            resultPct: item.resultPct ?? null,
            resolvedAt: item.resolvedAt?.toISOString() ?? null,
        });
    }

    await writeStore(state);
}
