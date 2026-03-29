import { NSE_UNIVERSE, SECTOR_MAP } from '../dataService';
import { NewsEntityMatch } from './types';

type ExposureRule = {
    theme: string;
    pattern: RegExp;
    sectors: string[];
    tickers?: string[];
    rationale: string;
};

const REGULATOR_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
    { key: 'SEBI', pattern: /\bsebi\b/i },
    { key: 'RBI', pattern: /\brbi\b/i },
    { key: 'MCA', pattern: /\bmca\b/i },
    { key: 'NSE', pattern: /\bnse\b/i },
    { key: 'BSE', pattern: /\bbse\b/i },
    { key: 'USFDA', pattern: /\busfda\b|\bfda\b/i },
];

const THEME_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
    { key: 'FII_FLOW', pattern: /\bfii\b/i },
    { key: 'DII_FLOW', pattern: /\bdii\b/i },
    { key: 'GOVERNANCE', pattern: /\bfraud\b|\bgovernance\b|\bpledge\b|\bprobe\b|\braid\b|\badjudication\b/i },
    { key: 'RESULTS', pattern: /\bresults?\b|\bquarter\b|\bguidance\b|\bearnings\b/i },
    { key: 'ORDER_WIN', pattern: /\border win\b|\bcontract\b|\bproject\b/i },
    { key: 'RATES', pattern: /\brate hike\b|\brate cut\b|\brepo\b|\brisk weights?\b/i },
    { key: 'DIVIDEND_BUYBACK', pattern: /\bdividend\b|\bbuyback\b|\bbonus\b|\bsplit\b/i },
    { key: 'MNA', pattern: /\bmerger\b|\bacquisition\b|\bstake sale\b/i },
    { key: 'CAPEX', pattern: /\bcapex\b|\bcapacity expansion\b|\bgreenfield\b/i },
];

const SECTOR_KEYWORDS: Array<{ sector: string; pattern: RegExp }> = [
    { sector: 'Financial Services', pattern: /\bnbfc\b|\bbank(?:ing)?\b|\bfinancial\b|\binsurance\b|\bmfi\b/i },
    { sector: 'Information Technology', pattern: /\bit\b|\bsoftware\b|\bsaas\b|\btech\b/i },
    { sector: 'Healthcare', pattern: /\bpharma\b|\bhospital\b|\bhealth(?:care)?\b|\busfda\b|\bfda\b/i },
    { sector: 'Automobile and Auto Components', pattern: /\bauto\b|\bev\b|\bvehicle\b|\b2w\b|\b4w\b/i },
    { sector: 'Power', pattern: /\bpower\b|\bsolar\b|\brenewable\b|\belectricity\b|\btransmission\b/i },
    { sector: 'Metals & Mining', pattern: /\bmetal(?:s)?\b|\bsteel\b|\baluminium\b|\bmining\b/i },
    { sector: 'Oil Gas & Consumable Fuels', pattern: /\bcrude\b|\boil\b|\bgas\b|\blng\b/i },
    { sector: 'Construction', pattern: /\binfra(?:structure)?\b|\broad\b|\bhighway\b|\bconstruction\b/i },
    { sector: 'Capital Goods', pattern: /\bcapital goods\b|\bengineering\b|\bdefen[cs]e\b|\bindustrial\b/i },
    { sector: 'Fast Moving Consumer Goods', pattern: /\bfmcg\b|\bconsumer\b|\bstaples\b/i },
];

const EXPLICIT_ALIASES: Record<string, { ticker: string; companyName: string }> = {
    SHRIRAMFINANCE: { ticker: 'SHRIRAMFIN', companyName: 'Shriram Finance' },
    SHRIRAMFIN: { ticker: 'SHRIRAMFIN', companyName: 'Shriram Finance' },
    HDFCBANK: { ticker: 'HDFCBANK', companyName: 'HDFC Bank' },
    HDFC: { ticker: 'HDFCBANK', companyName: 'HDFC Bank' },
    STATEBANKOFINDIA: { ticker: 'SBIN', companyName: 'State Bank of India' },
    SBI: { ticker: 'SBIN', companyName: 'State Bank of India' },
    RELIANCEINDUSTRIES: { ticker: 'RELIANCE', companyName: 'Reliance Industries' },
    RELIANCE: { ticker: 'RELIANCE', companyName: 'Reliance Industries' },
    TATAMOTORS: { ticker: 'TATAMOTORS', companyName: 'Tata Motors' },
    TCS: { ticker: 'TCS', companyName: 'Tata Consultancy Services' },
    INFOSYS: { ticker: 'INFY', companyName: 'Infosys' },
    LARSENTOUBRO: { ticker: 'LT', companyName: 'Larsen & Toubro' },
    LT: { ticker: 'LT', companyName: 'Larsen & Toubro' },
    BHARTIAIRTEL: { ticker: 'BHARTIARTL', companyName: 'Bharti Airtel' },
    BAJAJFINANCE: { ticker: 'BAJFINANCE', companyName: 'Bajaj Finance' },
    ICICIBANK: { ticker: 'ICICIBANK', companyName: 'ICICI Bank' },
    AXISBANK: { ticker: 'AXISBANK', companyName: 'Axis Bank' },
    KOTAKBANK: { ticker: 'KOTAKBANK', companyName: 'Kotak Mahindra Bank' },
    SUNPHARMA: { ticker: 'SUNPHARMA', companyName: 'Sun Pharma' },
    DRREDDY: { ticker: 'DRREDDY', companyName: "Dr Reddy's Laboratories" },
    CIPLA: { ticker: 'CIPLA', companyName: 'Cipla' },
    WIPRO: { ticker: 'WIPRO', companyName: 'Wipro' },
    HCLTECH: { ticker: 'HCLTECH', companyName: 'HCL Technologies' },
    TATAPOWER: { ticker: 'TATAPOWER', companyName: 'Tata Power' },
    SBILIFE: { ticker: 'SBILIFE', companyName: 'SBI Life Insurance' },
    HDFCLIFE: { ticker: 'HDFCLIFE', companyName: 'HDFC Life' },
    STARHEALTH: { ticker: 'STARHEALTH', companyName: 'Star Health' },
    MANDM: { ticker: 'M&M', companyName: 'Mahindra & Mahindra' },
};

const EXPOSURE_RULES: ExposureRule[] = [
    {
        theme: 'RBI_RISK_WEIGHTS',
        pattern: /\brbi\b.*\brisk weights?\b|\brisk weights?\b.*\brbi\b/i,
        sectors: ['Financial Services'],
        tickers: ['HDFCBANK', 'ICICIBANK', 'AXISBANK', 'KOTAKBANK', 'SBIN', 'SHRIRAMFIN', 'BAJFINANCE'],
        rationale: 'RBI risk-weight actions typically propagate first into banks and NBFCs.',
    },
    {
        theme: 'RBI_RATE_POLICY',
        pattern: /\brepo\b|\brate hike\b|\brate cut\b|\bmonetary policy\b/i,
        sectors: ['Financial Services', 'Automobile and Auto Components', 'Realty'],
        tickers: ['HDFCBANK', 'ICICIBANK', 'AXISBANK', 'KOTAKBANK', 'SBIN', 'TATAMOTORS'],
        rationale: 'RBI policy changes affect rate-sensitive sectors and financial transmission.',
    },
    {
        theme: 'SEBI_DERIVATIVES',
        pattern: /\bsebi\b.*\bderivatives?\b|\bderivatives?\b.*\bsebi\b|\bf&o\b/i,
        sectors: ['Financial Services'],
        tickers: ['BSE', 'MCX', 'ANGELONE', 'IIFL'],
        rationale: 'SEBI derivatives rules usually impact exchanges, brokers, and leveraged participation.',
    },
    {
        theme: 'USFDA',
        pattern: /\busfda\b|\bfda\b|\b483\b/i,
        sectors: ['Healthcare'],
        tickers: ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'LUPIN', 'AUROPHARMA'],
        rationale: 'USFDA updates mainly propagate through export-oriented pharma names.',
    },
    {
        theme: 'CRUDE_MOVE',
        pattern: /\bcrude\b|\bbrent\b|\boil prices?\b/i,
        sectors: ['Oil Gas & Consumable Fuels', 'Automobile and Auto Components', 'Consumer Durables'],
        tickers: ['BPCL', 'IOC', 'HPCL', 'TATAMOTORS', 'MARUTI'],
        rationale: 'Crude-price moves flow through OMC margins, fuel demand, and transport cost structures.',
    },
    {
        theme: 'FII_DII_FLOW',
        pattern: /\bfii\b|\bdii\b/i,
        sectors: ['Financial Services'],
        tickers: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'RELIANCE', 'INFY'],
        rationale: 'Institutional-flow shifts generally hit liquid index-heavy names first.',
    },
    {
        theme: 'AUTO_SUPPLY_CHAIN',
        pattern: /\bauto sales\b|\bvehicle production\b|\bev demand\b|\boem\b/i,
        sectors: ['Automobile and Auto Components', 'Capital Goods'],
        tickers: ['TATAMOTORS', 'MARUTI', 'M&M', 'BOSCHLTD', 'MOTHERSON'],
        rationale: 'Auto demand and production headlines spill into OEMs, ancillaries, and component suppliers.',
    },
    {
        theme: 'INFRA_SUPPLY_CHAIN',
        pattern: /\bcapex\b|\binfra\b|\broad project\b|\bepc\b|\bconstruction order\b/i,
        sectors: ['Construction', 'Capital Goods', 'Metals & Mining'],
        tickers: ['LT', 'ULTRACEMCO', 'JSWSTEEL', 'TATASTEEL', 'HINDALCO'],
        rationale: 'Infrastructure and EPC news usually propagates into cement, steel, and capital-goods supply chains.',
    },
    {
        theme: 'PHARMA_EXPORT_CHAIN',
        pattern: /\busfda\b|\bapi\b|\bformulation\b|\bdrug approval\b/i,
        sectors: ['Healthcare'],
        tickers: ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'AUROPHARMA', 'LUPIN'],
        rationale: 'Drug approvals and API issues often spill over across export pharma peers and supply chains.',
    },
];

function normalizeToken(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function humanizeTicker(ticker: string): string {
    const cleaned = ticker.replace(/&/g, ' & ').replace(/-/g, ' ');
    return cleaned
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part.charAt(0) + part.slice(1).toLowerCase())
        .join(' ');
}

const TICKER_METADATA = Object.keys(NSE_UNIVERSE).map(ticker => {
    const normalized = normalizeToken(ticker);
    const explicit = EXPLICIT_ALIASES[normalized];
    const companyName = explicit?.companyName || humanizeTicker(ticker);
    const aliases = new Set<string>([
        normalized,
        normalizeToken(companyName),
        normalizeToken(companyName.replace(/\bLimited\b|\bLtd\b|\bBank\b/g, '')),
    ]);
    if (explicit) aliases.add(normalizeToken(explicit.companyName));
    return {
        ticker,
        normalized,
        companyName,
        aliases: Array.from(aliases).filter(alias => alias.length >= 3),
        sector: SECTOR_MAP[ticker] ?? null,
    };
});

const SECTOR_TO_TICKERS = new Map<string, string[]>();
for (const entry of TICKER_METADATA) {
    if (!entry.sector) continue;
    const current = SECTOR_TO_TICKERS.get(entry.sector) ?? [];
    current.push(entry.ticker);
    SECTOR_TO_TICKERS.set(entry.sector, current);
}

function buildPeerBasket(primaryTickers: string[], sectors: string[]): string[] {
    const peers = new Set<string>();

    for (const ticker of primaryTickers) {
        const sector = SECTOR_MAP[ticker];
        if (!sector) continue;
        const sectorTickers = SECTOR_TO_TICKERS.get(sector) ?? [];
        for (const peer of sectorTickers.slice(0, 12)) {
            if (peer !== ticker) peers.add(peer);
            if (peers.size >= 10) break;
        }
        if (peers.size >= 10) break;
    }

    for (const sector of sectors) {
        const sectorTickers = SECTOR_TO_TICKERS.get(sector) ?? [];
        for (const peer of sectorTickers.slice(0, 12)) {
            peers.add(peer);
            if (peers.size >= 10) break;
        }
        if (peers.size >= 10) break;
    }

    return Array.from(peers).slice(0, 10);
}

export function resolveNewsEntities(text: string, explicitTicker?: string, explicitSector?: string): NewsEntityMatch {
    const haystack = text.toUpperCase();
    const normalizedText = normalizeToken(text);
    const tickers = new Set<string>();
    const companyNames = new Set<string>();
    const sectors = new Set<string>();
    const regulators = new Set<string>();
    const themes = new Set<string>();
    const exposures = new Map<string, NewsEntityMatch['exposures'][number]>();

    if (explicitTicker) tickers.add(explicitTicker.toUpperCase());
    if (explicitSector) sectors.add(explicitSector);

    for (const { key, pattern } of REGULATOR_PATTERNS) {
        if (pattern.test(text)) regulators.add(key);
    }

    for (const { key, pattern } of THEME_PATTERNS) {
        if (pattern.test(text)) themes.add(key);
    }

    for (const { sector, pattern } of SECTOR_KEYWORDS) {
        if (pattern.test(text)) sectors.add(sector);
    }

    const directWords = haystack.split(/[^A-Z0-9&-]+/).filter(Boolean);
    for (const word of directWords) {
        if (NSE_UNIVERSE[word]) tickers.add(word);
    }

    for (const token of directWords.map(normalizeToken)) {
        const alias = EXPLICIT_ALIASES[token];
        if (alias) {
            tickers.add(alias.ticker);
            companyNames.add(alias.companyName);
        }
    }

    for (const entry of TICKER_METADATA) {
        if (entry.aliases.some(alias => alias.length >= 4 && normalizedText.includes(alias))) {
            tickers.add(entry.ticker);
            companyNames.add(entry.companyName);
        }
    }

    for (const ticker of tickers) {
        const meta = TICKER_METADATA.find(entry => entry.ticker === ticker);
        if (meta?.companyName) companyNames.add(meta.companyName);
        if (meta?.sector) sectors.add(meta.sector);
    }

    for (const rule of EXPOSURE_RULES) {
        if (!rule.pattern.test(text)) continue;
        themes.add(rule.theme);
        const exposureTickers = new Set<string>(rule.tickers ?? []);
        for (const sector of rule.sectors) {
            sectors.add(sector);
            for (const ticker of (SECTOR_TO_TICKERS.get(sector) ?? []).slice(0, 8)) {
                exposureTickers.add(ticker);
            }
        }
        exposures.set(rule.theme, {
            theme: rule.theme,
            sectors: rule.sectors,
            tickers: Array.from(exposureTickers).slice(0, 12),
            rationale: rule.rationale,
        });
        for (const ticker of exposureTickers) tickers.add(ticker);
    }

    const peerBasket = buildPeerBasket(Array.from(tickers), Array.from(sectors));

    return {
        tickers: Array.from(tickers),
        companyNames: Array.from(companyNames),
        sectors: Array.from(sectors),
        peerBasket,
        regulators: Array.from(regulators),
        themes: Array.from(themes),
        exposures: Array.from(exposures.values()),
    };
}
