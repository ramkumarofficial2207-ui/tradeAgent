import axios from 'axios';
import prisma from './prismaClient';

export interface InstitutionalFlowDay {
    tradingDate: string;
    fiiBuy: number;
    fiiSell: number;
    fiiNet: number;
    diiBuy: number;
    diiSell: number;
    diiNet: number;
    totalNet: number;
    marketBias: 'RISK_ON' | 'RISK_OFF' | 'MIXED';
    source: string;
    fetchedAt: string;
}

export interface InstitutionalFlowSummary {
    status: 'live' | 'database' | 'unavailable';
    source: string;
    fetchedAt: string | null;
    lastTradingDate: string | null;
    isStale: boolean;
    note: string | null;
    latest: InstitutionalFlowDay | null;
    series: InstitutionalFlowDay[];
    totals: {
        fiiNet1dCr: number;
        diiNet1dCr: number;
        totalNet1dCr: number;
        totalNet5dCr: number;
        totalNet20dCr: number;
    };
    trend: {
        bias: 'RISK_ON' | 'RISK_OFF' | 'MIXED';
        score: number;
        detail: string;
    };
}

type CacheEntry = {
    summary: InstitutionalFlowSummary;
    ts: number;
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const HISTORY_LIMIT = 20;
const NSE_HOME_URL = 'https://www.nseindia.com/';
const NSE_FLOW_URL = 'https://www.nseindia.com/api/fiidiiTradeReact';

let summaryCache: CacheEntry | null = null;

function parseNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string') return 0;
    const normalized = value.replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseTradingDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }

    const raw = String(value).trim();
    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) {
        return new Date(Date.UTC(direct.getUTCFullYear(), direct.getUTCMonth(), direct.getUTCDate()));
    }

    const match = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (!match) return null;

    const [, dayRaw, monthRaw, yearRaw] = match;
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = months.indexOf(monthRaw.toLowerCase());
    if (monthIndex === -1) return null;

    return new Date(Date.UTC(Number(yearRaw), monthIndex, Number(dayRaw)));
}

function toIsoDate(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function roundCr(value: number): number {
    return Number(value.toFixed(2));
}

function classifyDay(totalNet: number): 'RISK_ON' | 'RISK_OFF' | 'MIXED' {
    if (totalNet >= 1500) return 'RISK_ON';
    if (totalNet <= -1500) return 'RISK_OFF';
    return 'MIXED';
}

function buildTrendDetail(score: number, latest: InstitutionalFlowDay | null, totalNet5d: number, totalNet20d: number): string {
    const latestLabel = latest
        ? `Latest session ${latest.totalNet >= 0 ? 'net buying' : 'net selling'} of ${Math.abs(latest.totalNet).toFixed(0)} Cr`
        : 'No latest institutional flow data';
    const trailingLabel = `5D ${totalNet5d >= 0 ? '+' : ''}${totalNet5d.toFixed(0)} Cr, 20D ${totalNet20d >= 0 ? '+' : ''}${totalNet20d.toFixed(0)} Cr`;

    if (score >= 2) return `${latestLabel}. Institutions are supportive of risk appetite. ${trailingLabel}.`;
    if (score <= -2) return `${latestLabel}. Institutions are leaning risk-off. ${trailingLabel}.`;
    return `${latestLabel}. Flows are mixed rather than directional. ${trailingLabel}.`;
}

function summarizeTrend(series: InstitutionalFlowDay[]) {
    const latest = series[0] ?? null;
    const totalNet5d = roundCr(series.slice(0, 5).reduce((sum, day) => sum + day.totalNet, 0));
    const totalNet20d = roundCr(series.slice(0, 20).reduce((sum, day) => sum + day.totalNet, 0));
    const fiiNet1dCr = roundCr(latest?.fiiNet ?? 0);
    const diiNet1dCr = roundCr(latest?.diiNet ?? 0);
    const totalNet1dCr = roundCr(latest?.totalNet ?? 0);

    let score = 0;
    if (totalNet1dCr >= 1000) score += 1;
    else if (totalNet1dCr <= -1000) score -= 1;

    if (totalNet5d >= 4000) score += 2;
    else if (totalNet5d <= -4000) score -= 2;
    else if (totalNet5d >= 1500) score += 1;
    else if (totalNet5d <= -1500) score -= 1;

    if (totalNet20d >= 12000) score += 2;
    else if (totalNet20d <= -12000) score -= 2;
    else if (totalNet20d >= 4000) score += 1;
    else if (totalNet20d <= -4000) score -= 1;

    if ((latest?.fiiNet ?? 0) >= 500) score += 1;
    else if ((latest?.fiiNet ?? 0) <= -500) score -= 1;

    if (Math.sign(latest?.fiiNet ?? 0) !== 0 && Math.sign(latest?.fiiNet ?? 0) === Math.sign(latest?.diiNet ?? 0)) {
        score += Math.sign(latest?.fiiNet ?? 0) > 0 ? 1 : -1;
    }

    const bias: 'RISK_ON' | 'RISK_OFF' | 'MIXED' = score >= 2 ? 'RISK_ON' : score <= -2 ? 'RISK_OFF' : 'MIXED';
    const detail = buildTrendDetail(score, latest, totalNet5d, totalNet20d);

    return {
        latest,
        totals: {
            fiiNet1dCr,
            diiNet1dCr,
            totalNet1dCr,
            totalNet5dCr: totalNet5d,
            totalNet20dCr: totalNet20d,
        },
        trend: {
            bias,
            score,
            detail,
        },
    };
}

function createSummary(series: InstitutionalFlowDay[], status: InstitutionalFlowSummary['status'], note: string | null): InstitutionalFlowSummary {
    const normalizedSeries = [...series]
        .sort((a, b) => b.tradingDate.localeCompare(a.tradingDate))
        .slice(0, HISTORY_LIMIT);
    const { latest, totals, trend } = summarizeTrend(normalizedSeries);
    const fetchedAt = latest?.fetchedAt ?? null;
    const lastTradingDate = latest?.tradingDate ?? null;
    const isStale = !lastTradingDate
        ? true
        : (Date.now() - new Date(`${lastTradingDate}T15:30:00+05:30`).getTime()) > (72 * 60 * 60 * 1000);

    return {
        status,
        source: latest?.source ?? 'NSE',
        fetchedAt,
        lastTradingDate,
        isStale,
        note,
        latest,
        series: normalizedSeries,
        totals,
        trend,
    };
}

function getNseHeaders(cookie?: string) {
    return {
        'Accept': 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': NSE_HOME_URL,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        ...(cookie ? { 'Cookie': cookie } : {}),
    };
}

async function fetchNseInstitutionalFlow(): Promise<InstitutionalFlowDay[]> {
    const landing = await axios.get(NSE_HOME_URL, {
        headers: getNseHeaders(),
        timeout: 10000,
        validateStatus: status => status >= 200 && status < 400,
    });

    const cookies = Array.isArray(landing.headers['set-cookie'])
        ? landing.headers['set-cookie'].map(value => value.split(';')[0]).join('; ')
        : undefined;

    const response = await axios.get(NSE_FLOW_URL, {
        headers: getNseHeaders(cookies),
        timeout: 10000,
    });

    const rows = Array.isArray(response.data?.data) ? response.data.data : [];
    const fetchedAt = new Date().toISOString();

    return rows
        .map((row: any) => {
            const tradingDate = parseTradingDate(row.date);
            if (!tradingDate) return null;

            const fiiBuy = roundCr(parseNumber(row.fiiBuy));
            const fiiSell = roundCr(parseNumber(row.fiiSell));
            const fiiNet = roundCr(parseNumber(row.fiiNet));
            const diiBuy = roundCr(parseNumber(row.diiBuy));
            const diiSell = roundCr(parseNumber(row.diiSell));
            const diiNet = roundCr(parseNumber(row.diiNet));
            const totalNet = roundCr(fiiNet + diiNet);

            return {
                tradingDate: toIsoDate(tradingDate),
                fiiBuy,
                fiiSell,
                fiiNet,
                diiBuy,
                diiSell,
                diiNet,
                totalNet,
                marketBias: classifyDay(totalNet),
                source: 'NSE',
                fetchedAt,
            } satisfies InstitutionalFlowDay;
        })
        .filter((row: InstitutionalFlowDay | null): row is InstitutionalFlowDay => Boolean(row))
        .slice(0, HISTORY_LIMIT);
}

async function persistSeries(series: InstitutionalFlowDay[]): Promise<void> {
    if (!series.length) return;
    await Promise.all(series.map(day => prisma.institutionalFlowSnapshot.upsert({
        where: { tradingDate: new Date(`${day.tradingDate}T00:00:00.000Z`) },
        update: {
            fiiBuy: day.fiiBuy,
            fiiSell: day.fiiSell,
            fiiNet: day.fiiNet,
            diiBuy: day.diiBuy,
            diiSell: day.diiSell,
            diiNet: day.diiNet,
            totalNet: day.totalNet,
            marketBias: day.marketBias,
            source: day.source,
            fetchedAt: new Date(day.fetchedAt),
        },
        create: {
            tradingDate: new Date(`${day.tradingDate}T00:00:00.000Z`),
            fiiBuy: day.fiiBuy,
            fiiSell: day.fiiSell,
            fiiNet: day.fiiNet,
            diiBuy: day.diiBuy,
            diiSell: day.diiSell,
            diiNet: day.diiNet,
            totalNet: day.totalNet,
            marketBias: day.marketBias,
            source: day.source,
            fetchedAt: new Date(day.fetchedAt),
        },
    })));
}

async function loadSeriesFromDatabase(limit = HISTORY_LIMIT): Promise<InstitutionalFlowDay[]> {
    const rows = await prisma.institutionalFlowSnapshot.findMany({
        take: limit,
        orderBy: { tradingDate: 'desc' },
    });

    return rows.map((row: {
        tradingDate: Date;
        fiiBuy: number;
        fiiSell: number;
        fiiNet: number;
        diiBuy: number;
        diiSell: number;
        diiNet: number;
        totalNet: number;
        marketBias: string;
        source: string;
        fetchedAt: Date;
    }) => ({
        tradingDate: toIsoDate(row.tradingDate),
        fiiBuy: row.fiiBuy,
        fiiSell: row.fiiSell,
        fiiNet: row.fiiNet,
        diiBuy: row.diiBuy,
        diiSell: row.diiSell,
        diiNet: row.diiNet,
        totalNet: row.totalNet,
        marketBias: row.marketBias as 'RISK_ON' | 'RISK_OFF' | 'MIXED',
        source: row.source,
        fetchedAt: row.fetchedAt.toISOString(),
    }));
}

export async function refreshInstitutionalFlow(force = false): Promise<InstitutionalFlowSummary> {
    if (!force && summaryCache && Date.now() - summaryCache.ts < CACHE_TTL_MS) {
        return summaryCache.summary;
    }

    try {
        const liveSeries = await fetchNseInstitutionalFlow();
        await persistSeries(liveSeries);
        const summary = createSummary(liveSeries, 'live', null);
        summaryCache = { summary, ts: Date.now() };
        return summary;
    } catch (error: any) {
        const dbSeries = await loadSeriesFromDatabase();
        if (!dbSeries.length) {
            const summary = createSummary([], 'unavailable', error?.message ? String(error.message) : 'Institutional flow unavailable');
            summaryCache = { summary, ts: Date.now() };
            return summary;
        }

        const summary = createSummary(dbSeries, 'database', 'Live NSE feed unavailable. Showing latest stored institutional flow.');
        summaryCache = { summary, ts: Date.now() };
        return summary;
    }
}

export async function getInstitutionalFlowSummary(force = false): Promise<InstitutionalFlowSummary> {
    if (!force && summaryCache && Date.now() - summaryCache.ts < CACHE_TTL_MS) {
        return summaryCache.summary;
    }
    return refreshInstitutionalFlow(force);
}

export async function getInstitutionalFlowSignal(): Promise<InstitutionalFlowSummary['trend'] & {
    latest: InstitutionalFlowSummary['latest'];
    totals: InstitutionalFlowSummary['totals'];
    lastTradingDate: string | null;
    isStale: boolean;
}> {
    const summary = await getInstitutionalFlowSummary();
    return {
        ...summary.trend,
        latest: summary.latest,
        totals: summary.totals,
        lastTradingDate: summary.lastTradingDate,
        isStale: summary.isStale,
    };
}
