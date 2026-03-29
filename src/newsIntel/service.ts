import { createHash } from 'crypto';
import { fetchStockReport } from '../fundamentalService';
import { analyzeNewsImpact, buildTechnicalContextFromStock } from '../newsImpactService';
import prisma from '../prismaClient';
import { MarketGroundingContext, NewsDistributionContext, ScanResult } from '../types';
import { resolveNewsEntities } from './entityResolver';
import { extractNewsEvents } from './eventExtractor';
import { buildMarketGroundingFromReport, getSectorBreadthForTicker } from './marketGrounding';
import { parseNewsWithModelAssist } from './modelParser';
import { fetchBaseNewsSources, fetchTickerNewsSource } from './sources';
import { queryNewsStore, readNewsStore, upsertNewsItems } from './store';
import { NewsEntityMatch, NewsEvent, NewsFeedQuery, NewsIntelligenceItem, RawNewsItem, TickerNewsDigest } from './types';

function hashItem(item: RawNewsItem): string {
    const normalized = `${item.source}|${item.title.toUpperCase()}|${item.body.toUpperCase()}|${item.url}`;
    return createHash('sha1').update(normalized).digest('hex');
}

function mergeUniqueStrings(...groups: Array<string[] | undefined>): string[] {
    return Array.from(new Set(groups.flatMap(group => group ?? []).filter(Boolean)));
}

function mergeEntities(base: NewsEntityMatch, assisted?: Partial<NewsEntityMatch> | null): NewsEntityMatch {
    if (!assisted) return base;
    return {
        tickers: mergeUniqueStrings(base.tickers, assisted.tickers),
        companyNames: mergeUniqueStrings(base.companyNames, assisted.companyNames),
        sectors: mergeUniqueStrings(base.sectors, assisted.sectors),
        peerBasket: mergeUniqueStrings(base.peerBasket, assisted.peerBasket).slice(0, 12),
        regulators: mergeUniqueStrings(base.regulators, assisted.regulators),
        themes: mergeUniqueStrings(base.themes, assisted.themes),
        exposures: Array.from(new Map(
            [...(base.exposures ?? []), ...(assisted.exposures ?? [])]
                .filter(item => item?.theme)
                .map(item => [item.theme, item])
        ).values()),
    };
}

function mergeEvents(base: NewsEvent[], assisted: NewsEvent[] = []): NewsEvent[] {
    const merged = new Map<string, NewsEvent>();
    for (const event of [...base, ...assisted]) {
        const key = [
            event.type,
            event.affectedTickers.join(','),
            event.affectedSectors.join(','),
        ].join('|');
        const existing = merged.get(key);
        if (!existing || event.confidence > existing.confidence) {
            merged.set(key, event);
        }
    }
    return Array.from(merged.values());
}

async function buildIntelligenceItem(
    item: RawNewsItem,
    targetTicker?: string,
    targetSector?: string,
    technicalContext?: MarketGroundingContext | null
): Promise<NewsIntelligenceItem> {
    const resolvedEntities = resolveNewsEntities(`${item.title} ${item.body} ${item.summary}`, targetTicker, targetSector);
    const modelAssist = await parseNewsWithModelAssist({
        title: item.title,
        body: item.body,
        summary: item.summary,
        source: item.source,
        sourceType: item.sourceType,
        targetTicker,
        targetSector,
    });
    const entities = mergeEntities(resolvedEntities, modelAssist ? {
        tickers: modelAssist.tickers,
        companyNames: modelAssist.companyNames,
        sectors: modelAssist.sectors,
        peerBasket: modelAssist.peerBasket,
        regulators: modelAssist.regulators,
        themes: modelAssist.themes,
        exposures: modelAssist.exposures,
    } : null);
    const events = mergeEvents(
        extractNewsEvents(`${item.title} ${item.body} ${item.summary}`, entities),
        modelAssist?.events ?? [],
    );
    const analysis = analyzeNewsImpact({
        headline: item.title,
        articleText: item.body || item.summary,
        targetTicker: targetTicker || entities.tickers[0],
        targetSector: targetSector || entities.sectors[0],
        technicalContext: technicalContext ?? null,
        events,
    });

    return {
        ...item,
        id: hashItem(item),
        dedupeHash: hashItem(item),
        entities,
        events,
        impact: analysis,
    };
}

function deriveDistribution(
    items: NewsIntelligenceItem[],
    marketGrounding: MarketGroundingContext | null
): NewsDistributionContext | null {
    if (!items.length) return null;

    const avgSentiment = items.reduce((sum, item) => sum + item.impact.news_sentiment_score, 0) / items.length;
    const regulatoryRiskFlag = items.some(item =>
        item.impact.category === 'REGULATORY' && item.impact.news_sentiment_score < -0.15
    );
    const newsRiskFlag = regulatoryRiskFlag || items.some(item =>
        item.impact.distribution_flags.news_risk_flag || item.impact.news_sentiment_score <= -0.25
    );
    const confirmationStatus = marketGrounding?.confirmationStatus ?? 'UNAVAILABLE';
    const signalAlignment = confirmationStatus === 'UNAVAILABLE'
        ? 'UNAVAILABLE'
        : confirmationStatus === 'CONFIRMED' && avgSentiment > 0.15 && !newsRiskFlag
            ? 'ALIGNED'
            : confirmationStatus === 'CONFIRMED' && avgSentiment < -0.15
                ? 'CONFLICT'
                : 'MIXED';

    return {
        newsTailwindScore: +Math.max(-1, Math.min(1, avgSentiment)).toFixed(2),
        newsRiskFlag,
        regulatoryRiskFlag,
        signalAlignment,
        alertEligible: confirmationStatus === 'CONFIRMED' && avgSentiment > 0.2 && !newsRiskFlag && !regulatoryRiskFlag,
        eventTypes: Array.from(new Set(items.flatMap(item => item.events.map(event => event.type)))).slice(0, 8),
        latestHeadline: items[0]?.title ?? null,
        lastUpdated: items[0]?.publishedAt ?? null,
    };
}

async function findHistoricalAnalogs(
    ticker: string,
    items: NewsIntelligenceItem[]
): Promise<TickerNewsDigest['analogs']> {
    if (!items.length) return [];
    const state = await readNewsStore();
    const currentIds = new Set(items.map(item => item.id));
    const eventTypes = new Set(items.flatMap(item => item.events.map(event => event.type)));
    const currentSectors = new Set(items.flatMap(item => item.entities.sectors));
    const candidates = state.items
        .filter(item =>
            !currentIds.has(item.id) &&
            item.events.some(event => eventTypes.has(event.type)) &&
            (
                item.entities.tickers.includes(ticker) ||
                item.entities.sectors.some(sector => currentSectors.has(sector))
            )
        )
        .slice(0, 8);

    const outcomes = await Promise.all(candidates.map(async (item) => {
        const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
        const tradeOutcome = publishedAt
            ? await prisma.historicalSetup.findFirst({
                where: {
                    ticker: { in: item.entities.tickers.slice(0, 4) },
                    createdAt: { gte: publishedAt },
                    status: { in: ['WON', 'LOST'] },
                },
                orderBy: { createdAt: 'asc' },
            })
            : null;

        return {
            title: item.title,
            publishedAt: item.publishedAt,
            eventTypes: Array.from(new Set(item.events.map(event => event.type))).slice(0, 3),
            sentiment: item.impact.news_sentiment_score,
            analogType: item.entities.tickers.includes(ticker) ? 'TICKER' as const : 'SECTOR' as const,
            sector: item.entities.sectors[0] ?? null,
            subsequentStatus: tradeOutcome?.status === 'WON' || tradeOutcome?.status === 'LOST'
                ? (tradeOutcome.status as 'WON' | 'LOST')
                : null,
            subsequentResultPct: tradeOutcome?.resultPct ?? null,
        };
    }));

    return outcomes;
}

export async function syncNewsIntelligence(scan: ScanResult | null = null): Promise<{ items: NewsIntelligenceItem[]; lastSyncedAt: string | null }> {
    const rawItems = await fetchBaseNewsSources();
    const items = await Promise.all(rawItems.map(item => buildIntelligenceItem(item)));
    const state = await upsertNewsItems(items);
    return { items: state.items.slice(0, 50), lastSyncedAt: state.lastSyncedAt };
}

export async function ingestTickerNews(ticker: string, scan: ScanResult | null = null): Promise<NewsIntelligenceItem[]> {
    const upperTicker = ticker.toUpperCase();
    const report = await fetchStockReport(upperTicker);
    const setup = scan?.setups?.find(item => item.ticker === upperTicker) ?? null;
    const technicalContext =
        await buildMarketGroundingFromReport(
            report,
            setup,
            scan?.marketStatus,
            getSectorBreadthForTicker(upperTicker, scan),
        ) ?? buildTechnicalContextFromStock(report, setup);
    const rawItems = await fetchTickerNewsSource(upperTicker);
    const items = await Promise.all(rawItems.map(item => buildIntelligenceItem(item, upperTicker, report?.sector, technicalContext)));
    await upsertNewsItems(items);
    return items;
}

export async function getNewsFeed(query: NewsFeedQuery & { refresh?: boolean }, scan: ScanResult | null = null): Promise<NewsIntelligenceItem[]> {
    if (query.refresh) {
        if (query.ticker) {
            await ingestTickerNews(query.ticker, scan);
        } else {
            await syncNewsIntelligence(scan);
        }
    }

    return queryNewsStore({
        ticker: query.ticker?.toUpperCase(),
        sector: query.sector,
        regulator: query.regulator,
        limit: query.limit,
    });
}

export async function getTickerNewsDigest(ticker: string, scan: ScanResult | null = null, refresh = true): Promise<TickerNewsDigest> {
    const upperTicker = ticker.toUpperCase();
    const report = await fetchStockReport(upperTicker);
    const setup = scan?.setups?.find(item => item.ticker === upperTicker) ?? null;
    const marketGrounding =
        await buildMarketGroundingFromReport(
            report,
            setup,
            scan?.marketStatus,
            getSectorBreadthForTicker(upperTicker, scan),
        ) ?? buildTechnicalContextFromStock(report, setup);

    if (refresh) {
        await ingestTickerNews(upperTicker, scan);
    }

    const items = await queryNewsStore({ ticker: upperTicker, limit: 12 });
    const avgSentiment = items.length
        ? +(items.reduce((sum, item) => sum + item.impact.news_sentiment_score, 0) / items.length).toFixed(2)
        : 0;
    const events = items.flatMap(item => item.events);

    return {
        ticker: upperTicker,
        itemCount: items.length,
        latestPublishedAt: items[0]?.publishedAt ?? null,
        avgSentiment,
        bullishCount: items.filter(item => item.impact.news_sentiment_score > 0.18).length,
        bearishCount: items.filter(item => item.impact.news_sentiment_score < -0.18).length,
        highImpactCount: items.filter(item => item.impact.impact_magnitude === 'HIGH').length,
        regulatoryRisk: items.some(item => item.impact.category === 'REGULATORY' && item.impact.news_sentiment_score < -0.3),
        events,
        items,
        marketGrounding,
        distribution: deriveDistribution(items, marketGrounding),
        analogs: await findHistoricalAnalogs(upperTicker, items),
    };
}

export async function getStoredNewsStatus(): Promise<{ count: number; lastSyncedAt: string | null }> {
    const state = await readNewsStore();
    return {
        count: state.items.length,
        lastSyncedAt: state.lastSyncedAt,
    };
}
