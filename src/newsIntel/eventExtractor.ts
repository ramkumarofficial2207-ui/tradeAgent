import { NewsEntityMatch, NewsEvent, NewsEventType } from './types';

type EventRule = {
    type: NewsEventType;
    patterns: RegExp[];
    polarity: NewsEvent['polarity'];
    magnitude: NewsEvent['magnitude'];
    surprise: NewsEvent['surprise'];
    durability: NewsEvent['durability'];
    rationale: string;
};

const EVENT_RULES: EventRule[] = [
    {
        type: 'RESULTS_BEAT',
        patterns: [/\bresults?\b.*\bbeat\b/i, /\bbetter than expected\b/i, /\bprofit jumps?\b/i],
        polarity: 'POSITIVE',
        magnitude: 'MEDIUM',
        surprise: 'MEDIUM',
        durability: 'SHORT_TERM',
        rationale: 'Earnings outperformance usually drives a near-term positive repricing if confirmed by guidance and price action.',
    },
    {
        type: 'RESULTS_MISS',
        patterns: [/\bresults?\b.*\bmiss\b/i, /\bworse than expected\b/i, /\bprofit falls?\b/i],
        polarity: 'NEGATIVE',
        magnitude: 'MEDIUM',
        surprise: 'MEDIUM',
        durability: 'SHORT_TERM',
        rationale: 'An earnings miss often weakens short-term sentiment and can reset expectations downward.',
    },
    {
        type: 'ORDER_WIN',
        patterns: [/\border win\b/i, /\bwon .* contract\b/i, /\bnew contract\b/i, /\bproject award\b/i],
        polarity: 'POSITIVE',
        magnitude: 'MEDIUM',
        surprise: 'MEDIUM',
        durability: 'SHORT_TERM',
        rationale: 'Fresh order wins improve revenue visibility and often support near-term momentum in the name and sector peers.',
    },
    {
        type: 'PROMOTER_PLEDGE',
        patterns: [/\bpledge\b/i, /\bpromoter.*encumbered\b/i],
        polarity: 'NEGATIVE',
        magnitude: 'HIGH',
        surprise: 'MEDIUM',
        durability: 'LONG_TERM',
        rationale: 'Promoter pledge risk raises balance-sheet and governance concerns that can persist beyond the initial reaction.',
    },
    {
        type: 'SEBI_ACTION',
        patterns: [/\bsebi\b.*\b(order|action|notice|penalty|ban|adjudication)\b/i, /\bpenalty\b/i],
        polarity: 'NEGATIVE',
        magnitude: 'HIGH',
        surprise: 'HIGH',
        durability: 'LONG_TERM',
        rationale: 'SEBI actions can change the market’s perception of governance, compliance, and business continuity.',
    },
    {
        type: 'RBI_POLICY',
        patterns: [/\brbi\b.*\b(policy|repo|risk weights?|liquidity)\b/i, /\brate hike\b/i, /\brate cut\b/i],
        polarity: 'MIXED',
        magnitude: 'MEDIUM',
        surprise: 'UNKNOWN',
        durability: 'SHORT_TERM',
        rationale: 'RBI policy actions propagate across rate-sensitive sectors and require sector-specific interpretation.',
    },
    {
        type: 'FRAUD_GOVERNANCE',
        patterns: [/\bfraud\b/i, /\bgovernance\b/i, /\bprobe\b/i, /\braids?\b/i, /\bsearches\b/i],
        polarity: 'NEGATIVE',
        magnitude: 'HIGH',
        surprise: 'HIGH',
        durability: 'LONG_TERM',
        rationale: 'Fraud and governance headlines are usually high-severity and can impair trust for an extended period.',
    },
    {
        type: 'CAPEX',
        patterns: [/\bcapex\b/i, /\bcapacity expansion\b/i, /\bgreenfield\b/i, /\bplant\b/i],
        polarity: 'POSITIVE',
        magnitude: 'MEDIUM',
        surprise: 'LOW',
        durability: 'LONG_TERM',
        rationale: 'Capex stories tend to matter more over a quarterly or annual horizon than purely intraday.',
    },
    {
        type: 'MNA',
        patterns: [/\bmerger\b/i, /\bacquisition\b/i, /\bstake sale\b/i, /\bcombination\b/i],
        polarity: 'MIXED',
        magnitude: 'MEDIUM',
        surprise: 'MEDIUM',
        durability: 'LONG_TERM',
        rationale: 'M&A changes strategic positioning, but its market effect depends on valuation, integration risk, and financing.',
    },
    {
        type: 'DIVIDEND_BUYBACK',
        patterns: [/\bdividend\b/i, /\bbuyback\b/i, /\bbonus issue\b/i, /\bstock split\b/i],
        polarity: 'POSITIVE',
        magnitude: 'LOW',
        surprise: 'LOW',
        durability: 'SHORT_TERM',
        rationale: 'Shareholder-return actions are generally supportive, but the lasting impact is often moderate unless payout quality is strong.',
    },
    {
        type: 'FII_DII_FLOW_SHIFT',
        patterns: [/\bfii\b/i, /\bdii\b/i, /\binstitutional flow\b/i],
        polarity: 'MIXED',
        magnitude: 'MEDIUM',
        surprise: 'UNKNOWN',
        durability: 'INTRADAY',
        rationale: 'Institutional flow shifts often drive index-heavy names quickly and influence short-term market tone.',
    },
];

function polarityFromText(base: NewsEvent['polarity'], text: string): NewsEvent['polarity'] {
    if (base !== 'MIXED') return base;
    if (/\brate cut\b|\bliquidity support\b|\bnet buying\b/i.test(text)) return 'POSITIVE';
    if (/\brate hike\b|\bnet selling\b|\bpenalty\b/i.test(text)) return 'NEGATIVE';
    return 'MIXED';
}

function magnitudeFromText(base: NewsEvent['magnitude'], text: string): NewsEvent['magnitude'] {
    if (/\bmajor\b|\bmassive\b|\bmaterial\b|\bban\b|\bfraud\b/i.test(text)) return 'HIGH';
    if (/\bsmall\b|\bminor\b|\broutine\b/i.test(text)) return 'LOW';
    return base;
}

function surpriseFromText(base: NewsEvent['surprise'], text: string): NewsEvent['surprise'] {
    if (/\bunexpected\b|\bsurprise\b|\bbetter than expected\b|\bworse than expected\b/i.test(text)) return 'HIGH';
    if (/\bexpected\b|\binline\b|\bconsensus\b/i.test(text)) return 'LOW';
    return base;
}

export function extractNewsEvents(text: string, entities: NewsEntityMatch): NewsEvent[] {
    const events: NewsEvent[] = [];
    const combinedText = text.replace(/\s+/g, ' ').trim();

    for (const rule of EVENT_RULES) {
        if (!rule.patterns.some(pattern => pattern.test(combinedText))) continue;

        const event: NewsEvent = {
            type: rule.type,
            polarity: polarityFromText(rule.polarity, combinedText),
            magnitude: magnitudeFromText(rule.magnitude, combinedText),
            surprise: surpriseFromText(rule.surprise, combinedText),
            durability: rule.durability,
            confidence: 0.74,
            affectedTickers: entities.tickers.slice(0, 12),
            affectedSectors: entities.sectors.slice(0, 8),
            rationale: rule.rationale,
        };

        if (rule.type === 'RBI_POLICY' || rule.type === 'FII_DII_FLOW_SHIFT') {
            event.affectedTickers = Array.from(new Set([
                ...event.affectedTickers,
                ...entities.peerBasket.slice(0, 8),
            ])).slice(0, 15);
        }

        if (rule.type === 'SEBI_ACTION' || rule.type === 'FRAUD_GOVERNANCE') {
            event.confidence = 0.85;
        }

        events.push(event);
    }

    if (!events.length && entities.themes.includes('RESULTS')) {
        events.push({
            type: 'RESULTS_BEAT',
            polarity: 'MIXED',
            magnitude: 'LOW',
            surprise: 'UNKNOWN',
            durability: 'SHORT_TERM',
            confidence: 0.45,
            affectedTickers: entities.tickers.slice(0, 8),
            affectedSectors: entities.sectors.slice(0, 6),
            rationale: 'Results-related language was detected, but the beat/miss direction was not explicit.',
        });
    }

    return events;
}
