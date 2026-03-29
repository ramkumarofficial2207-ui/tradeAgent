import { NSE_UNIVERSE } from '../dataService';
import { ChatIntent } from './types';

const EXPLICIT_ALIASES: Record<string, string> = {
    TATAMOTORS: 'TATAMOTORS',
    HDFCBANK: 'HDFCBANK',
    SHRIRAMFINANCE: 'SHRIRAMFIN',
    SHRIRAMFIN: 'SHRIRAMFIN',
    STARHEALTH: 'STARHEALTH',
};

const SCANNER_KEYWORDS = [
    'TOP SETUP',
    'TOP 5',
    'TOP FIVE',
    'MOMENTUM STOCK',
    'SCANNER',
    'BEST STOCK',
    'TODAY SETUP',
    'TRADE SETUP',
];

const PORTFOLIO_KEYWORDS = [
    'PORTFOLIO',
    'DIVERSIFIED',
    'DIVERSIFICATION',
    'CONCENTRATION',
    'MY HOLDINGS',
    'MY TRADES',
];

const MARKET_KEYWORDS = [
    'NIFTY',
    'SENSEX',
    'VIX',
    'MARKET',
    'REGIME',
    'BREADTH',
    'RISK ON',
    'RISK OFF',
];

const PERFORMANCE_KEYWORDS = [
    'ACCURACY',
    'WIN RATE',
    'TRACK RECORD',
    'PERFORMANCE',
    'HOW ACCURATE',
    'RESULTS',
];

const CONCEPT_KEYWORDS = [
    'EXPLAIN',
    'WHAT IS',
    'MEANING OF',
    'PATTERN',
    'HOW DOES',
    'WHY DOES',
    'DEFINE',
];

const NEWS_KEYWORDS = [
    'SEBI',
    'RBI',
    'HEADLINE',
    'NEWS',
    'ARTICLE',
    'PENALTY',
    'PROBE',
    'ORDER WIN',
    'GUIDANCE',
    'RESULTS',
    'DIVIDEND',
    'FII',
    'DII',
    'LATEST NEWS',
    'NEWS ON',
];

const UNSUPPORTED_PATTERNS: Array<{ test: (message: string) => boolean; reason: string }> = [
    {
        test: msg => /(SELF[\s-]?LEARN|LEARN FROM LIVE|BROWSE THE INTERNET|ACCESS EXTERNAL INFORMATION)/i.test(msg),
        reason: 'This assistant does not self-learn from the open internet in real time.',
    },
    {
        test: msg => /(GOLD|SILVER|CRUDE|BITCOIN|BTC|ETH|CRYPTO).*(TOMORROW|NEXT WEEK|FORECAST|PREDICT)/i.test(msg),
        reason: 'Commodity and crypto forecasting is outside the current grounded NSE chat scope.',
    },
    {
        test: msg => /(TOMORROW|NEXT WEEK|NEXT MONTH).*(WILL|GO|MOVE|TARGET)/i.test(msg) && !/(NIFTY|SENSEX|STOCK|SHARE|TICKER)/i.test(msg),
        reason: 'Forward predictions without a supported, grounded instrument context are blocked.',
    },
];

const NORMALIZED_TICKERS = Object.keys(NSE_UNIVERSE).map(ticker => ({
    ticker,
    normalized: normalizeKey(ticker),
}));

function normalizeKey(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function findTickerFromMessage(message: string): string | undefined {
    const directWords = message.toUpperCase().split(/[^A-Z0-9&-]+/).filter(Boolean);
    for (const word of directWords) {
        if (NSE_UNIVERSE[word]) return word;
    }

    const spans: string[] = [];
    for (let start = 0; start < directWords.length; start++) {
        for (let len = 1; len <= 4 && start + len <= directWords.length; len++) {
            spans.push(directWords.slice(start, start + len).join(''));
        }
    }

    const normalizedSpans = Array.from(new Set(spans.map(normalizeKey).filter(Boolean))).sort((a, b) => b.length - a.length);
    for (const span of normalizedSpans) {
        if (EXPLICIT_ALIASES[span]) return EXPLICIT_ALIASES[span];

        const exact = NORMALIZED_TICKERS.find(entry => entry.normalized === span);
        if (exact) return exact.ticker;

        if (span.length < 5) continue;
        const fuzzy = NORMALIZED_TICKERS.filter(entry => span.includes(entry.normalized) || entry.normalized.includes(span));
        if (fuzzy.length === 1) return fuzzy[0].ticker;
    }

    return undefined;
}

function containsAny(message: string, keywords: string[]): boolean {
    return keywords.some(keyword => message.includes(keyword));
}

export function detectChatIntent(rawMessage: string): ChatIntent {
    const message = rawMessage.toUpperCase();
    const ticker = findTickerFromMessage(message);
    const looksLikeNews =
        containsAny(message, NEWS_KEYWORDS) &&
        (
            rawMessage.length >= 80 ||
            rawMessage.includes('\n') ||
            rawMessage.includes(':') ||
            /LATEST NEWS|NEWS ON|HEADLINES/i.test(message)
        );

    for (const rule of UNSUPPORTED_PATTERNS) {
        if (rule.test(message)) {
            return { kind: 'unsupported_query', ticker, reason: rule.reason };
        }
    }

    if (looksLikeNews) {
        return { kind: 'news_query', ticker };
    }

    if (containsAny(message, PERFORMANCE_KEYWORDS)) {
        return { kind: 'performance_query', ticker };
    }

    if (containsAny(message, PORTFOLIO_KEYWORDS)) {
        return { kind: 'portfolio_query', ticker };
    }

    if (containsAny(message, SCANNER_KEYWORDS)) {
        return { kind: 'scanner_query', ticker };
    }

    if (ticker) {
        return { kind: 'stock_query', ticker };
    }

    if (containsAny(message, MARKET_KEYWORDS)) {
        return { kind: 'market_query' };
    }

    if (containsAny(message, CONCEPT_KEYWORDS)) {
        return { kind: 'concept_query' };
    }

    return { kind: 'concept_query', ticker };
}
