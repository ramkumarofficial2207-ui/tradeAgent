import { ScanResult } from '../types';

export type ChatSupportLevel = 'supported' | 'partial' | 'unsupported';

export type ChatIntentKind =
    | 'news_query'
    | 'stock_query'
    | 'scanner_query'
    | 'market_query'
    | 'portfolio_query'
    | 'performance_query'
    | 'concept_query'
    | 'unsupported_query';

export interface ChatIntent {
    kind: ChatIntentKind;
    ticker?: string;
    reason?: string;
}

export interface ChatMeta {
    supportLevel: ChatSupportLevel;
    grounded: boolean;
    liveDataUsed: boolean;
    scannerContextUsed: boolean;
    dataUsed: string[];
    lastUpdated: string | null;
    notes: string[];
}

export interface GroundedChatResponse {
    reply: string;
    stockCard?: {
        ticker: string;
        price: number;
        signal: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT' | null;
        buyZone?: number;
        target?: number;
        stopLoss?: number;
        targetPct?: number;
        slPct?: number;
        riskReward?: number;
        confidenceScore?: number;
        sector?: string;
        setupType?: string;
    } | null;
    sources: string[];
    meta: ChatMeta;
}

export interface BuildChatResponseInput {
    message: string;
    userId: string;
    lastSwingScan: ScanResult | null;
}
