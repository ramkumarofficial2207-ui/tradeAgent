// ================================================================
// entityResolver.ts — Structural news parsing only. Zero hardcoding.
// ================================================================
// This module handles ONLY:
//   1. Regulator keyword detection (SEBI, RBI, etc.)
//   2. Theme keyword detection (RESULTS, ORDER_WIN, etc.)
//   3. Direct NSE ticker mentions in news text
//
// ALL company-name → ticker resolution, peer basket construction,
// and sector exposure impact mapping is handled by the AI
// (Gemini / Claude / Groq) in modelParser.ts via parseNewsWithModelAssist().
//
// The AI already knows every NSE company, every sector theme,
// and every supply-chain relationship — dynamically, with no
// hardcoded stock lists needed here.
// ================================================================

import { NSE_UNIVERSE } from '../dataService';
import { NewsEntityMatch } from './types';

// ── Regulator detection — generic keywords, NOT stock lists ──────
const REGULATOR_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
    { key: 'SEBI',  pattern: /\bsebi\b/i },
    { key: 'RBI',   pattern: /\brbi\b/i },
    { key: 'MCA',   pattern: /\bmca\b/i },
    { key: 'NSE',   pattern: /\bnse\b/i },
    { key: 'BSE',   pattern: /\bbse\b/i },
    { key: 'USFDA', pattern: /\busfda\b|\bfda\b/i },
];

// ── Theme detection — generic keywords, NOT stock lists ──────────
const THEME_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
    { key: 'FII_FLOW',         pattern: /\bfii\b/i },
    { key: 'DII_FLOW',         pattern: /\bdii\b/i },
    { key: 'GOVERNANCE',       pattern: /\bfraud\b|\bgovernance\b|\bpledge\b|\bprobe\b|\braid\b|\badjudication\b/i },
    { key: 'RESULTS',          pattern: /\bresults?\b|\bquarter\b|\bguidance\b|\bearnings\b/i },
    { key: 'ORDER_WIN',        pattern: /\border win\b|\bcontract\b|\bproject\b/i },
    { key: 'RATES',            pattern: /\brate hike\b|\brate cut\b|\brepo\b|\brisk weights?\b/i },
    { key: 'DIVIDEND_BUYBACK', pattern: /\bdividend\b|\bbuyback\b|\bbonus\b|\bsplit\b/i },
    { key: 'MNA',              pattern: /\bmerger\b|\bacquisition\b|\bstake sale\b/i },
    { key: 'CAPEX',            pattern: /\bcapex\b|\bcapacity expansion\b|\bgreenfield\b/i },
];

// ── Main resolver ─────────────────────────────────────────────────
// Returns only structural signals. The AI merges richer entity data on top.
export function resolveNewsEntities(
    text: string,
    explicitTicker?: string,
    explicitSector?: string,
): NewsEntityMatch {
    const haystack  = text.toUpperCase();
    const tickers   = new Set<string>();
    const sectors   = new Set<string>();
    const regulators = new Set<string>();
    const themes    = new Set<string>();

    // Explicit overrides from calling context
    if (explicitTicker) tickers.add(explicitTicker.toUpperCase());
    if (explicitSector) sectors.add(explicitSector);

    // Regulator detection
    for (const { key, pattern } of REGULATOR_PATTERNS) {
        if (pattern.test(text)) regulators.add(key);
    }

    // Theme detection
    for (const { key, pattern } of THEME_PATTERNS) {
        if (pattern.test(text)) themes.add(key);
    }

    // Direct ticker mentions in news text.
    // We accept any token that looks like a valid NSE symbol (3–15
    // uppercase alphanumeric chars). Not restricted to a hardcoded
    // list — the AI validates and enriches in the next step.
    const NSE_SYMBOL_RE = /^[A-Z][A-Z0-9&-]{2,14}$/;
    const words = haystack.split(/[^A-Z0-9&-]+/).filter(Boolean);
    for (const word of words) {
        if (NSE_UNIVERSE[word] || NSE_SYMBOL_RE.test(word)) {
            tickers.add(word);
        }
    }

    // Peer basket, company names, and sector exposures are all left
    // empty here. The AI fills them in parseNewsWithModelAssist().
    return {
        tickers:      Array.from(tickers),
        companyNames: [],
        sectors:      Array.from(sectors),
        peerBasket:   [],
        regulators:   Array.from(regulators),
        themes:       Array.from(themes),
        exposures:    [],
    };
}
