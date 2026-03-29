import { claudeAsk } from '../claudeClient';
import { geminiAsk } from '../geminiClient';
import { groqAsk } from '../groqClient';
import { NewsEntityMatch, NewsEvent, NewsEventType } from './types';

type ModelNewsParseResult = {
    tickers?: string[];
    companyNames?: string[];
    sectors?: string[];
    peerBasket?: string[];
    regulators?: string[];
    themes?: string[];
    exposures?: NewsEntityMatch['exposures'];
    events?: NewsEvent[];
};

const EVENT_TYPES = new Set<NewsEventType>([
    'RESULTS_BEAT',
    'RESULTS_MISS',
    'ORDER_WIN',
    'PROMOTER_PLEDGE',
    'SEBI_ACTION',
    'RBI_POLICY',
    'FRAUD_GOVERNANCE',
    'CAPEX',
    'MNA',
    'DIVIDEND_BUYBACK',
    'FII_DII_FLOW_SHIFT',
]);

const SYSTEM_PROMPT = `You are an Indian market news intelligence parser.
Read the news item and return strict JSON only.
Extract:
- tickers
- companyNames
- sectors
- peerBasket
- regulators
- themes
- exposures
- events

Rules:
- Focus on NSE/BSE equities and Indian market context.
- Use only event types from the allowed list.
- Include supply-chain or second-order impact exposures when clearly implied.
- Keep confidence realistic.
- If uncertain, return empty arrays instead of hallucinating.

Allowed event types:
RESULTS_BEAT, RESULTS_MISS, ORDER_WIN, PROMOTER_PLEDGE, SEBI_ACTION, RBI_POLICY, FRAUD_GOVERNANCE, CAPEX, MNA, DIVIDEND_BUYBACK, FII_DII_FLOW_SHIFT

Return exactly this JSON shape:
{
  "tickers": [],
  "companyNames": [],
  "sectors": [],
  "peerBasket": [],
  "regulators": [],
  "themes": [],
  "exposures": [{"theme":"", "sectors":[], "tickers":[], "rationale":""}],
  "events": [{
    "type":"RESULTS_BEAT",
    "polarity":"POSITIVE",
    "magnitude":"MEDIUM",
    "surprise":"MEDIUM",
    "durability":"SHORT_TERM",
    "confidence":0.7,
    "affectedTickers":[],
    "affectedSectors":[],
    "rationale":""
  }]
}`;

function hasAnyModelKey(): boolean {
    return Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY);
}

function cleanArray(values: unknown, limit = 12): string[] {
    if (!Array.isArray(values)) return [];
    return values
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .slice(0, limit);
}

function sanitizeEvents(events: unknown): NewsEvent[] {
    if (!Array.isArray(events)) return [];
    return events.flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const event = value as Record<string, unknown>;
        const type = String(event.type || '').trim().toUpperCase() as NewsEventType;
        if (!EVENT_TYPES.has(type)) return [];
        return [{
            type,
            polarity: ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED'].includes(String(event.polarity)) ? String(event.polarity) as NewsEvent['polarity'] : 'NEUTRAL',
            magnitude: ['LOW', 'MEDIUM', 'HIGH'].includes(String(event.magnitude)) ? String(event.magnitude) as NewsEvent['magnitude'] : 'LOW',
            surprise: ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'].includes(String(event.surprise)) ? String(event.surprise) as NewsEvent['surprise'] : 'UNKNOWN',
            durability: ['INTRADAY', 'SHORT_TERM', 'LONG_TERM'].includes(String(event.durability)) ? String(event.durability) as NewsEvent['durability'] : 'SHORT_TERM',
            confidence: Math.min(1, Math.max(0, Number(event.confidence ?? 0.5))),
            affectedTickers: cleanArray(event.affectedTickers),
            affectedSectors: cleanArray(event.affectedSectors),
            rationale: String(event.rationale || '').trim().slice(0, 200),
        }];
    });
}

function sanitizeResult(payload: unknown): ModelNewsParseResult | null {
    if (!payload || typeof payload !== 'object') return null;
    const value = payload as Record<string, unknown>;
    return {
        tickers: cleanArray(value.tickers),
        companyNames: cleanArray(value.companyNames),
        sectors: cleanArray(value.sectors),
        peerBasket: cleanArray(value.peerBasket),
        regulators: cleanArray(value.regulators),
        themes: cleanArray(value.themes),
        exposures: Array.isArray(value.exposures)
            ? value.exposures.flatMap((item) => {
                if (!item || typeof item !== 'object') return [];
                const exposure = item as Record<string, unknown>;
                const theme = String(exposure.theme || '').trim();
                if (!theme) return [];
                return [{
                    theme,
                    sectors: cleanArray(exposure.sectors),
                    tickers: cleanArray(exposure.tickers),
                    rationale: String(exposure.rationale || '').trim().slice(0, 200),
                }];
            })
            : [],
        events: sanitizeEvents(value.events),
    };
}

async function askModel(userPrompt: string): Promise<string> {
    try {
        if (process.env.GEMINI_API_KEY) {
            return await geminiAsk(SYSTEM_PROMPT, userPrompt, { maxTokens: 900, temperature: 0.1 });
        }
    } catch { /* fall through */ }

    try {
        if (process.env.ANTHROPIC_API_KEY) {
            return await claudeAsk(SYSTEM_PROMPT, userPrompt, { maxTokens: 900, temperature: 0.1 });
        }
    } catch { /* fall through */ }

    if (process.env.GROQ_API_KEY) {
        return groqAsk(SYSTEM_PROMPT, userPrompt, { maxTokens: 900, temperature: 0.1 });
    }

    throw new Error('No model key available');
}

export async function parseNewsWithModelAssist(params: {
    title: string;
    body: string;
    summary: string;
    source: string;
    sourceType: string;
    targetTicker?: string;
    targetSector?: string;
}): Promise<ModelNewsParseResult | null> {
    if (!hasAnyModelKey()) return null;

    const userPrompt = JSON.stringify({
        title: params.title,
        body: params.body,
        summary: params.summary,
        source: params.source,
        sourceType: params.sourceType,
        targetTicker: params.targetTicker ?? null,
        targetSector: params.targetSector ?? null,
    });

    try {
        const raw = await askModel(userPrompt);
        const clean = raw.replace(/```json|```/g, '').trim();
        const match = clean.match(/\{[\s\S]*\}/);
        if (!match) return null;
        return sanitizeResult(JSON.parse(match[0]));
    } catch {
        return null;
    }
}
