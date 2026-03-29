import { NewsImpactOutput } from '../newsImpactService';
import { MarketGroundingContext, NewsDistributionContext } from '../types';

export type NewsSourceType = 'MEDIA' | 'REGULATORY' | 'EXCHANGE' | 'MARKET_DATA';
export type EventPolarity = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';
export type EventMagnitude = 'LOW' | 'MEDIUM' | 'HIGH';
export type EventSurprise = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export type EventDurability = 'INTRADAY' | 'SHORT_TERM' | 'LONG_TERM';
export type NewsEventType =
    | 'RESULTS_BEAT'
    | 'RESULTS_MISS'
    | 'ORDER_WIN'
    | 'PROMOTER_PLEDGE'
    | 'SEBI_ACTION'
    | 'RBI_POLICY'
    | 'FRAUD_GOVERNANCE'
    | 'CAPEX'
    | 'MNA'
    | 'DIVIDEND_BUYBACK'
    | 'FII_DII_FLOW_SHIFT';

export interface NewsEntityMatch {
    tickers: string[];
    companyNames: string[];
    sectors: string[];
    peerBasket: string[];
    regulators: string[];
    themes: string[];
    exposures: Array<{
        theme: string;
        sectors: string[];
        tickers: string[];
        rationale: string;
    }>;
}

export interface RawNewsItem {
    title: string;
    body: string;
    summary: string;
    url: string;
    source: string;
    sourceType: NewsSourceType;
    language: string;
    publishedAt: string | null;
    fetchedAt: string;
    trustScore: number;
}

export interface NewsEvent {
    type: NewsEventType;
    polarity: EventPolarity;
    magnitude: EventMagnitude;
    surprise: EventSurprise;
    durability: EventDurability;
    confidence: number;
    affectedTickers: string[];
    affectedSectors: string[];
    rationale: string;
}

export interface NewsIntelligenceItem extends RawNewsItem {
    id: string;
    dedupeHash: string;
    entities: NewsEntityMatch;
    events: NewsEvent[];
    impact: NewsImpactOutput;
}

export interface NewsStoreState {
    items: NewsIntelligenceItem[];
    lastSyncedAt: string | null;
}

export interface NewsFeedQuery {
    ticker?: string;
    sector?: string;
    regulator?: string;
    limit?: number;
}

export interface TickerNewsDigest {
    ticker: string;
    itemCount: number;
    latestPublishedAt: string | null;
    avgSentiment: number;
    bullishCount: number;
    bearishCount: number;
    highImpactCount: number;
    regulatoryRisk: boolean;
    events: NewsEvent[];
    items: NewsIntelligenceItem[];
    marketGrounding?: MarketGroundingContext | null;
    distribution?: NewsDistributionContext | null;
    analogs?: Array<{
        title: string;
        publishedAt: string | null;
        eventTypes: string[];
        sentiment: number;
        analogType?: 'TICKER' | 'SECTOR';
        sector?: string | null;
        subsequentStatus?: 'WON' | 'LOST' | null;
        subsequentResultPct?: number | null;
    }>;
}
