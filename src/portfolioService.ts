// portfolioService.ts — Trade lifecycle management for user portfolios
import prisma from './prismaClient';
import { getTickerNewsDigest } from './newsIntel/service';
import { ScanResult } from './types';

export interface CreateTradeInput {
    ticker: string;
    companyName?: string;
    sector?: string;
    capCategory?: string;
    setupType?: string;
    regimeAtEntry?: string;
    confidenceScore?: number;
    entryPrice: number;
    quantity: number;
    stopLossInit: number;
    target1: number;
    target2?: number;
    notes?: string;
}

export interface CloseTrade {
    exitPrice: number;
    exitReason: 'TARGET' | 'STOP' | 'TRAIL' | 'MANUAL';
}

export interface PortfolioNewsRiskItem {
    ticker: string;
    sector: string | null;
    status: 'HIGH_SEVERITY' | 'REGULATORY_RISK' | 'WATCH' | 'CLEAR';
    avgSentiment: number;
    highImpactCount: number;
    regulatoryRisk: boolean;
    newsRiskFlag: boolean;
    signalAlignment: 'ALIGNED' | 'MIXED' | 'CONFLICT' | 'UNAVAILABLE';
    alertEligible: boolean;
    latestHeadline: string | null;
    lastUpdated: string | null;
    eventTypes: string[];
}

export interface PortfolioCorrelationCluster {
    key: string;
    type: 'SECTOR' | 'REGIME' | 'NEWS_RISK';
    label: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    holdings: number;
    capitalPct: number;
    riskRs: number;
    tickers: string[];
}

export interface PortfolioHeatmapCell {
    label: string;
    holdings: number;
    exposurePct: number;
    riskPct: number;
    sentiment: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface PortfolioIntelligenceSummary {
    openHoldings: number;
    totalCapitalDeployed: number;
    maxDamageTodayRs: number;
    maxDamageTodayPct: number;
    correlatedExposureCount: number;
    regulatoryExposureCount: number;
    highNewsRiskCount: number;
    clusters: PortfolioCorrelationCluster[];
    suggestions: string[];
    sectorHeatmap: PortfolioHeatmapCell[];
    regimeHeatmap: PortfolioHeatmapCell[];
    newsHeatmap: PortfolioHeatmapCell[];
}

// ── Create a new trade ───────────────────────────────────────────────
export async function createTrade(userId: string, input: CreateTradeInput) {
    const initialRiskRs = (input.entryPrice - input.stopLossInit) * input.quantity;
    const capitalDeployed = input.entryPrice * input.quantity;

    return prisma.trade.create({
        data: {
            userId,
            ticker: input.ticker.toUpperCase(),
            companyName: input.companyName,
            sector: input.sector,
            capCategory: input.capCategory || 'UNKNOWN',
            setupType: input.setupType || 'Manual',
            regimeAtEntry: input.regimeAtEntry,
            confidenceScore: input.confidenceScore,
            entryPrice: input.entryPrice,
            quantity: input.quantity,
            stopLossInit: input.stopLossInit,
            target1: input.target1,
            target2: input.target2,
            initialRiskRs,
            capitalDeployed,
            status: 'OPEN',
            notes: input.notes,
        },
    });
}

// ── Close a trade — compute P&L ──────────────────────────────────────
export async function closeTrade(userId: string, tradeId: string, close: CloseTrade) {
    const trade = await prisma.trade.findFirst({
        where: { id: tradeId, userId, status: 'OPEN' },
    });
    if (!trade) throw new Error('Trade not found or already closed.');

    const exitPrice = close.exitPrice;
    const pnlRs = (exitPrice - trade.entryPrice) * trade.quantity;
    const pnlPct = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
    const initialRisk = trade.initialRiskRs || ((trade.entryPrice - trade.stopLossInit) * trade.quantity);
    const rMultiple = initialRisk !== 0 ? pnlRs / initialRisk : 0;
    const daysHeld = Math.ceil((Date.now() - new Date(trade.entryDate).getTime()) / 86400000);

    return prisma.trade.update({
        where: { id: tradeId },
        data: {
            status: 'CLOSED',
            exitDate: new Date(),
            exitPrice,
            exitReason: close.exitReason,
            pnlRs: +pnlRs.toFixed(2),
            pnlPct: +pnlPct.toFixed(2),
            rMultiple: +rMultiple.toFixed(2),
            daysHeld,
        },
    });
}

// ── Get portfolio summary ─────────────────────────────────────────────
export async function getPortfolioSummary(userId: string) {
    const trades = await prisma.trade.findMany({ where: { userId } });

    const open = trades.filter(t => t.status === 'OPEN');
    const closed = trades.filter(t => t.status === 'CLOSED');
    const won = closed.filter(t => (t.pnlRs || 0) > 0);
    const lost = closed.filter(t => (t.pnlRs || 0) <= 0);

    const totalCapitalDeployed = open.reduce((s, t) => s + (t.capitalDeployed || 0), 0);
    const totalRealizedPnL = closed.reduce((s, t) => s + (t.pnlRs || 0), 0);
    const avgR = closed.length
        ? closed.reduce((s, t) => s + (t.rMultiple || 0), 0) / closed.length
        : 0;
    const winRate = closed.length ? (won.length / closed.length) * 100 : 0;
    const avgWinPct = won.length
        ? won.reduce((s, t) => s + (t.pnlPct || 0), 0) / won.length
        : 0;
    const avgLossPct = lost.length
        ? lost.reduce((s, t) => s + (t.pnlPct || 0), 0) / lost.length
        : 0;
    const totalOpenRiskRs = open.reduce((s, t) => s + Math.max((t.initialRiskRs || 0), 0), 0);
    const avgOpenRiskPct = totalCapitalDeployed > 0 ? (totalOpenRiskRs / totalCapitalDeployed) * 100 : 0;
    const largestPositionRs = open.reduce((max, t) => Math.max(max, t.capitalDeployed || 0), 0);
    const largestPositionPct = totalCapitalDeployed > 0 ? (largestPositionRs / totalCapitalDeployed) * 100 : 0;
    const sectorExposure = open.reduce<Record<string, number>>((acc, trade) => {
        const key = trade.sector || 'Unspecified';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const [topSector = 'None', topSectorCount = 0] = Object.entries(sectorExposure)
        .sort((a, b) => b[1] - a[1])[0] || [];

    return {
        openCount: open.length,
        closedCount: closed.length,
        wonCount: won.length,
        lostCount: lost.length,
        winRate: +winRate.toFixed(1),
        avgR: +avgR.toFixed(2),
        avgWinPct: +avgWinPct.toFixed(2),
        avgLossPct: +avgLossPct.toFixed(2),
        totalCapitalDeployed: +totalCapitalDeployed.toFixed(2),
        totalRealizedPnL: +totalRealizedPnL.toFixed(2),
        totalOpenRiskRs: +totalOpenRiskRs.toFixed(2),
        avgOpenRiskPct: +avgOpenRiskPct.toFixed(2),
        largestPositionPct: +largestPositionPct.toFixed(2),
        topSector,
        topSectorCount,
    };
}

// ── Update current price for open trades ─────────────────────────────
export async function getPortfolioNewsRisk(userId: string, scan: ScanResult | null = null) {
    const openTrades = await prisma.trade.findMany({
        where: { userId, status: 'OPEN' },
        orderBy: { entryDate: 'desc' },
    });

    if (!openTrades.length) {
        return {
            openHoldings: 0,
            highSeverityCount: 0,
            regulatoryRiskCount: 0,
            alignedPositiveCount: 0,
            holdings: [] as PortfolioNewsRiskItem[],
        };
    }

    const holdings = (await Promise.all(openTrades.map(async (trade) => {
        const digest = await getTickerNewsDigest(trade.ticker, scan, true);
        const status: PortfolioNewsRiskItem['status'] = digest.regulatoryRisk
            ? 'REGULATORY_RISK'
            : (digest.distribution?.newsRiskFlag || digest.highImpactCount > 0)
                ? 'HIGH_SEVERITY'
                : digest.avgSentiment > 0.2 && digest.distribution?.signalAlignment === 'ALIGNED'
                    ? 'CLEAR'
                    : 'WATCH';

        return {
            ticker: trade.ticker,
            sector: trade.sector ?? null,
            status,
            avgSentiment: digest.avgSentiment,
            highImpactCount: digest.highImpactCount,
            regulatoryRisk: digest.regulatoryRisk,
            newsRiskFlag: !!digest.distribution?.newsRiskFlag,
            signalAlignment: digest.distribution?.signalAlignment ?? 'UNAVAILABLE',
            alertEligible: !!digest.distribution?.alertEligible,
            latestHeadline: digest.distribution?.latestHeadline ?? null,
            lastUpdated: digest.latestPublishedAt,
            eventTypes: digest.distribution?.eventTypes ?? [],
        };
    }))).sort((a, b) => {
        const severityOrder: Record<PortfolioNewsRiskItem['status'], number> = {
            REGULATORY_RISK: 0,
            HIGH_SEVERITY: 1,
            WATCH: 2,
            CLEAR: 3,
        };
        return severityOrder[a.status] - severityOrder[b.status];
    });

    return {
        openHoldings: openTrades.length,
        highSeverityCount: holdings.filter(item => item.status === 'HIGH_SEVERITY').length,
        regulatoryRiskCount: holdings.filter(item => item.status === 'REGULATORY_RISK').length,
        alignedPositiveCount: holdings.filter(item => item.signalAlignment === 'ALIGNED' && item.avgSentiment > 0).length,
        holdings,
    };
}

function toSeverity(value: number, medium = 20, high = 35): PortfolioCorrelationCluster['severity'] {
    if (value >= high) return 'HIGH';
    if (value >= medium) return 'MEDIUM';
    return 'LOW';
}

export async function getPortfolioIntelligence(userId: string, scan: ScanResult | null = null): Promise<PortfolioIntelligenceSummary> {
    const openTrades = await prisma.trade.findMany({
        where: { userId, status: 'OPEN' },
        orderBy: { entryDate: 'desc' },
    });

    if (!openTrades.length) {
        return {
            openHoldings: 0,
            totalCapitalDeployed: 0,
            maxDamageTodayRs: 0,
            maxDamageTodayPct: 0,
            correlatedExposureCount: 0,
            regulatoryExposureCount: 0,
            highNewsRiskCount: 0,
            clusters: [],
            suggestions: [],
            sectorHeatmap: [],
            regimeHeatmap: [],
            newsHeatmap: [],
        };
    }

    const totalCapitalDeployed = openTrades.reduce((sum, trade) => sum + (trade.capitalDeployed || 0), 0);
    const maxDamageTodayRs = openTrades.reduce((sum, trade) => sum + Math.max(trade.initialRiskRs || 0, 0), 0);
    const maxDamageTodayPct = totalCapitalDeployed > 0 ? (maxDamageTodayRs / totalCapitalDeployed) * 100 : 0;

    const enriched = await Promise.all(openTrades.map(async (trade) => {
        const digest = await getTickerNewsDigest(trade.ticker, scan, true);
        const newsBucket = digest.regulatoryRisk
            ? 'REGULATORY_RISK'
            : digest.distribution?.newsRiskFlag
                ? 'HIGH_NEWS_RISK'
                : digest.distribution?.signalAlignment === 'ALIGNED'
                    ? 'ALIGNED'
                    : 'WATCH';
        return { trade, digest, newsBucket };
    }));

    const buildCluster = (key: string, type: PortfolioCorrelationCluster['type'], label: string, rows: typeof enriched): PortfolioCorrelationCluster => {
        const capital = rows.reduce((sum, row) => sum + (row.trade.capitalDeployed || 0), 0);
        const risk = rows.reduce((sum, row) => sum + Math.max(row.trade.initialRiskRs || 0, 0), 0);
        const capitalPct = totalCapitalDeployed > 0 ? (capital / totalCapitalDeployed) * 100 : 0;
        return {
            key,
            type,
            label,
            severity: toSeverity(capitalPct),
            holdings: rows.length,
            capitalPct: +capitalPct.toFixed(1),
            riskRs: +risk.toFixed(2),
            tickers: rows.map(row => row.trade.ticker),
        };
    };

    const sectorGroups = new Map<string, typeof enriched>();
    const regimeGroups = new Map<string, typeof enriched>();
    const newsGroups = new Map<string, typeof enriched>();

    for (const row of enriched) {
        const sectorKey = row.trade.sector || 'Unspecified';
        sectorGroups.set(sectorKey, [...(sectorGroups.get(sectorKey) ?? []), row]);
        const regimeKey = row.trade.regimeAtEntry || 'UNKNOWN';
        regimeGroups.set(regimeKey, [...(regimeGroups.get(regimeKey) ?? []), row]);
        newsGroups.set(row.newsBucket, [...(newsGroups.get(row.newsBucket) ?? []), row]);
    }

    const clusters: PortfolioCorrelationCluster[] = [
        ...Array.from(sectorGroups.entries())
            .filter(([, rows]) => rows.length >= 2)
            .map(([key, rows]) => buildCluster(`sector:${key}`, 'SECTOR', key, rows)),
        ...Array.from(regimeGroups.entries())
            .filter(([, rows]) => rows.length >= 2)
            .map(([key, rows]) => buildCluster(`regime:${key}`, 'REGIME', key, rows)),
    ];

    const newsClusters = Array.from(newsGroups.entries())
        .filter(([key, rows]) => rows.length >= 2 && key !== 'ALIGNED')
        .map(([key, rows]) => buildCluster(`news:${key}`, 'NEWS_RISK', key.replace(/_/g, ' '), rows));
    clusters.push(...newsClusters);
    clusters.sort((a, b) => b.capitalPct - a.capitalPct || b.riskRs - a.riskRs);

    const sectorHeatmap: PortfolioHeatmapCell[] = Array.from(sectorGroups.entries()).map(([label, rows]) => {
        const capital = rows.reduce((sum, row) => sum + (row.trade.capitalDeployed || 0), 0);
        const risk = rows.reduce((sum, row) => sum + Math.max(row.trade.initialRiskRs || 0, 0), 0);
        const sentiment = rows.reduce((sum, row) => sum + row.digest.avgSentiment, 0) / rows.length;
        const exposurePct = totalCapitalDeployed > 0 ? (capital / totalCapitalDeployed) * 100 : 0;
        return {
            label,
            holdings: rows.length,
            exposurePct: +exposurePct.toFixed(1),
            riskPct: totalCapitalDeployed > 0 ? +((risk / totalCapitalDeployed) * 100).toFixed(1) : 0,
            sentiment: +sentiment.toFixed(2),
            severity: toSeverity(exposurePct),
        };
    }).sort((a, b) => b.exposurePct - a.exposurePct);

    const regimeHeatmap: PortfolioHeatmapCell[] = Array.from(regimeGroups.entries()).map(([label, rows]) => {
        const capital = rows.reduce((sum, row) => sum + (row.trade.capitalDeployed || 0), 0);
        const risk = rows.reduce((sum, row) => sum + Math.max(row.trade.initialRiskRs || 0, 0), 0);
        const sentiment = rows.reduce((sum, row) => sum + row.digest.avgSentiment, 0) / rows.length;
        const exposurePct = totalCapitalDeployed > 0 ? (capital / totalCapitalDeployed) * 100 : 0;
        return {
            label,
            holdings: rows.length,
            exposurePct: +exposurePct.toFixed(1),
            riskPct: totalCapitalDeployed > 0 ? +((risk / totalCapitalDeployed) * 100).toFixed(1) : 0,
            sentiment: +sentiment.toFixed(2),
            severity: toSeverity(exposurePct, 25, 45),
        };
    }).sort((a, b) => b.exposurePct - a.exposurePct);

    const newsHeatmap: PortfolioHeatmapCell[] = Array.from(newsGroups.entries()).map(([label, rows]) => {
        const capital = rows.reduce((sum, row) => sum + (row.trade.capitalDeployed || 0), 0);
        const risk = rows.reduce((sum, row) => sum + Math.max(row.trade.initialRiskRs || 0, 0), 0);
        const sentiment = rows.reduce((sum, row) => sum + row.digest.avgSentiment, 0) / rows.length;
        const exposurePct = totalCapitalDeployed > 0 ? (capital / totalCapitalDeployed) * 100 : 0;
        return {
            label: label.replace(/_/g, ' '),
            holdings: rows.length,
            exposurePct: +exposurePct.toFixed(1),
            riskPct: totalCapitalDeployed > 0 ? +((risk / totalCapitalDeployed) * 100).toFixed(1) : 0,
            sentiment: +sentiment.toFixed(2),
            severity: toSeverity(exposurePct, 20, 30),
        };
    }).sort((a, b) => b.exposurePct - a.exposurePct);

    const suggestions: string[] = [];
    const topSector = sectorHeatmap[0];
    if (topSector && topSector.exposurePct >= 35) {
        suggestions.push(`Reduce sector concentration in ${topSector.label}; exposure is ${topSector.exposurePct}% of deployed capital.`);
    }
    if (maxDamageTodayPct >= 2.5) {
        suggestions.push(`Open-position max damage is ${maxDamageTodayPct.toFixed(1)}% of deployed capital. Tighten stops or trim size.`);
    }
    const regulatoryCluster = newsHeatmap.find(item => item.label === 'REGULATORY RISK');
    if (regulatoryCluster && regulatoryCluster.exposurePct >= 15) {
        suggestions.push(`Regulatory-risk holdings are concentrated at ${regulatoryCluster.exposurePct}% exposure. Consider compressing that sleeve first.`);
    }
    const conflictRows = enriched.filter(row => row.digest.distribution?.signalAlignment === 'CONFLICT');
    if (conflictRows.length >= 2) {
        suggestions.push(`Multiple open holdings have conflicting news alignment. Rebalance toward aligned names before adding risk.`);
    }
    if (!suggestions.length) {
        suggestions.push('Portfolio risk is currently balanced. Keep new additions diversified by sector and regime.');
    }

    return {
        openHoldings: openTrades.length,
        totalCapitalDeployed: +totalCapitalDeployed.toFixed(2),
        maxDamageTodayRs: +maxDamageTodayRs.toFixed(2),
        maxDamageTodayPct: +maxDamageTodayPct.toFixed(2),
        correlatedExposureCount: clusters.length,
        regulatoryExposureCount: enriched.filter(row => row.digest.regulatoryRisk).length,
        highNewsRiskCount: enriched.filter(row => row.digest.distribution?.newsRiskFlag).length,
        clusters: clusters.slice(0, 8),
        suggestions,
        sectorHeatmap: sectorHeatmap.slice(0, 10),
        regimeHeatmap: regimeHeatmap.slice(0, 6),
        newsHeatmap: newsHeatmap.slice(0, 6),
    };
}

export async function updateTradeCurrentPrice(tradeId: string, currentPrice: number) {
    return prisma.trade.update({
        where: { id: tradeId },
        data: { currentPrice },
    });
}
