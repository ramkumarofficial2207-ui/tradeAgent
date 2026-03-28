import axios from 'axios';
import { parse as parseCsv } from 'csv-parse/sync';
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
    status: 'database' | 'sync' | 'unavailable';
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

const HISTORY_LIMIT = 20;
const REPORT_PAGE_URL = 'https://www.nseindia.com/reports/fii-dii';
const NSE_ONLY_CSV_URL = 'https://www.nseindia.com/api/fiidiiTradeNse?csv=true';
const DB_CACHE_TTL_MS = 30 * 60 * 1000;

let summaryCache: { summary: InstitutionalFlowSummary; ts: number } | null = null;
let syncInFlight: Promise<InstitutionalFlowSummary> | null = null;

type RawSnapshot = {
    tradingDate: Date;
    fiiBuy: number;
    fiiSell: number;
    fiiNet: number;
    diiBuy: number;
    diiSell: number;
    diiNet: number;
    totalNet: number;
    source: string;
    fetchedAt: Date;
};

function roundCr(value: number): number {
    return Number(value.toFixed(2));
}

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
            bias: score >= 2 ? 'RISK_ON' as const : score <= -2 ? 'RISK_OFF' as const : 'MIXED' as const,
            score,
            detail: buildTrendDetail(score, latest, totalNet5d, totalNet20d),
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
        source: latest?.source ?? 'NSE Official Report',
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

function normalizeRow(record: Record<string, string>): { category: string; date: Date; buyValue: number; sellValue: number; netValue: number } | null {
    const normalizedEntries = Object.entries(record).map(([key, value]) => [
        key.replace(/\s+/g, ' ').replace(/[^\w/() ]/g, '').trim().toLowerCase(),
        String(value ?? '').trim(),
    ]);
    const data = Object.fromEntries(normalizedEntries);

    const category = String(data['category'] ?? '').toUpperCase();
    const tradingDate = parseTradingDate(data['date']);
    if (!category || !tradingDate) return null;

    return {
        category,
        date: tradingDate,
        buyValue: roundCr(parseNumber(data['buy value ( crores)'] ?? data['buy value ()'] ?? data['buy value'])),
        sellValue: roundCr(parseNumber(data['sell value ( crores)'] ?? data['sell value ()'] ?? data['sell value'])),
        netValue: roundCr(parseNumber(data['net value ( crores)'] ?? data['net value ()'] ?? data['net value'])),
    };
}

function buildSnapshotFromRows(rows: Array<{ category: string; date: Date; buyValue: number; sellValue: number; netValue: number }>, source: string): RawSnapshot {
    const fii = rows.find(row => row.category.includes('FII'));
    const dii = rows.find(row => row.category.includes('DII'));
    const tradingDate = fii?.date ?? dii?.date;

    if (!tradingDate) {
        throw new Error('Official FII/DII report did not contain a trading date');
    }

    const fiiBuy = roundCr(fii?.buyValue ?? 0);
    const fiiSell = roundCr(fii?.sellValue ?? 0);
    const fiiNet = roundCr(fii?.netValue ?? 0);
    const diiBuy = roundCr(dii?.buyValue ?? 0);
    const diiSell = roundCr(dii?.sellValue ?? 0);
    const diiNet = roundCr(dii?.netValue ?? 0);
    const totalNet = roundCr(fiiNet + diiNet);

    return {
        tradingDate,
        fiiBuy,
        fiiSell,
        fiiNet,
        diiBuy,
        diiSell,
        diiNet,
        totalNet,
        source,
        fetchedAt: new Date(),
    };
}

function snapshotToDay(snapshot: RawSnapshot): InstitutionalFlowDay {
    return {
        tradingDate: toIsoDate(snapshot.tradingDate),
        fiiBuy: snapshot.fiiBuy,
        fiiSell: snapshot.fiiSell,
        fiiNet: snapshot.fiiNet,
        diiBuy: snapshot.diiBuy,
        diiSell: snapshot.diiSell,
        diiNet: snapshot.diiNet,
        totalNet: snapshot.totalNet,
        marketBias: classifyDay(snapshot.totalNet),
        source: snapshot.source,
        fetchedAt: snapshot.fetchedAt.toISOString(),
    };
}

function getOfficialHeaders(cookie?: string) {
    return {
        'Accept': 'text/csv,*/*;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Origin': 'https://www.nseindia.com',
        'Referer': `${REPORT_PAGE_URL}`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        ...(cookie ? { 'Cookie': cookie } : {}),
    };
}

async function fetchOfficialNseCsv(): Promise<string> {
    const landing = await axios.get(REPORT_PAGE_URL, {
        headers: getOfficialHeaders(),
        timeout: 10000,
        validateStatus: status => status >= 200 && status < 400,
    });

    const cookies = Array.isArray(landing.headers['set-cookie'])
        ? landing.headers['set-cookie'].map(value => value.split(';')[0]).join('; ')
        : undefined;

    const response = await axios.get(NSE_ONLY_CSV_URL, {
        headers: getOfficialHeaders(cookies),
        timeout: 10000,
        responseType: 'text',
    });

    return typeof response.data === 'string' ? response.data : String(response.data ?? '');
}

function parseOfficialCsv(csvText: string, source = 'NSE Official Report'): RawSnapshot {
    const records = parseCsv(csvText, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
    }) as Record<string, string>[];

    const rows = records
        .map(normalizeRow)
        .filter((row): row is { category: string; date: Date; buyValue: number; sellValue: number; netValue: number } => Boolean(row));

    if (!rows.length) {
        throw new Error('Official FII/DII CSV did not contain any data rows');
    }

    return buildSnapshotFromRows(rows, source);
}

async function persistSnapshot(snapshot: RawSnapshot): Promise<void> {
    await prisma.institutionalFlowSnapshot.upsert({
        where: { tradingDate: snapshot.tradingDate },
        update: {
            fiiBuy: snapshot.fiiBuy,
            fiiSell: snapshot.fiiSell,
            fiiNet: snapshot.fiiNet,
            diiBuy: snapshot.diiBuy,
            diiSell: snapshot.diiSell,
            diiNet: snapshot.diiNet,
            totalNet: snapshot.totalNet,
            marketBias: classifyDay(snapshot.totalNet),
            source: snapshot.source,
            fetchedAt: snapshot.fetchedAt,
        },
        create: {
            tradingDate: snapshot.tradingDate,
            fiiBuy: snapshot.fiiBuy,
            fiiSell: snapshot.fiiSell,
            fiiNet: snapshot.fiiNet,
            diiBuy: snapshot.diiBuy,
            diiSell: snapshot.diiSell,
            diiNet: snapshot.diiNet,
            totalNet: snapshot.totalNet,
            marketBias: classifyDay(snapshot.totalNet),
            source: snapshot.source,
            fetchedAt: snapshot.fetchedAt,
        },
    });
}

async function loadSeriesFromDatabase(limit = HISTORY_LIMIT): Promise<InstitutionalFlowDay[]> {
    const rows = await prisma.institutionalFlowSnapshot.findMany({
        take: limit,
        orderBy: { tradingDate: 'desc' },
    });

    return rows.map(row => ({
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

export async function importInstitutionalFlowCsv(csvText: string, source = 'Manual Official CSV Import'): Promise<InstitutionalFlowSummary> {
    const snapshot = parseOfficialCsv(csvText, source);
    await persistSnapshot(snapshot);
    summaryCache = null;
    return getInstitutionalFlowSummary({ bypassCache: true });
}

export async function syncInstitutionalFlowFromOfficialReport(): Promise<InstitutionalFlowSummary> {
    if (syncInFlight) return syncInFlight;

    syncInFlight = (async () => {
        try {
            const csv = await fetchOfficialNseCsv();
            const snapshot = parseOfficialCsv(csv);
            await persistSnapshot(snapshot);
            summaryCache = null;
            return getInstitutionalFlowSummary({ bypassCache: true, note: 'Synced from NSE official report.' });
        } finally {
            syncInFlight = null;
        }
    })();

    return syncInFlight;
}

export async function seedInstitutionalFlowIfEmpty(): Promise<InstitutionalFlowSummary> {
    const existing = await loadSeriesFromDatabase(1);
    if (existing.length) {
        return createSummary(existing, 'database', null);
    }
    try {
        return await syncInstitutionalFlowFromOfficialReport();
    } catch (error: any) {
        return createSummary([], 'unavailable', error?.message ? String(error.message) : 'Institutional flow unavailable');
    }
}

export async function getInstitutionalFlowSummary(options?: { bypassCache?: boolean; note?: string | null }): Promise<InstitutionalFlowSummary> {
    const bypassCache = Boolean(options?.bypassCache);
    if (!bypassCache && summaryCache && Date.now() - summaryCache.ts < DB_CACHE_TTL_MS) {
        return summaryCache.summary;
    }

    const dbSeries = await loadSeriesFromDatabase();
    const summary = dbSeries.length
        ? createSummary(dbSeries, 'database', options?.note ?? null)
        : createSummary([], 'unavailable', options?.note ?? 'Institutional flow has not been synced yet.');

    summaryCache = { summary, ts: Date.now() };
    return summary;
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
