import { promises as fs } from 'fs';
import path from 'path';
import { NewsFeedQuery, NewsIntelligenceItem, NewsStoreState } from './types';

const STORE_PATH = path.join(process.cwd(), 'data', 'news-intelligence.json');

let writeChain: Promise<void> = Promise.resolve();

async function ensureStoreFile(): Promise<void> {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    try {
        await fs.access(STORE_PATH);
    } catch {
        const initial: NewsStoreState = { items: [], lastSyncedAt: null };
        await fs.writeFile(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    }
}

export async function readNewsStore(): Promise<NewsStoreState> {
    await ensureStoreFile();
    try {
        const raw = await fs.readFile(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as NewsStoreState;
        return {
            items: Array.isArray(parsed.items) ? parsed.items.map(normalizeStoredItem).filter(Boolean) : [],
            lastSyncedAt: parsed.lastSyncedAt ?? null,
        };
    } catch {
        return { items: [], lastSyncedAt: null };
    }
}

function normalizeStoredItem(item: any): NewsIntelligenceItem {
    return {
        ...item,
        body: typeof item?.body === 'string' && item.body.trim() ? item.body : (item?.summary || item?.title || ''),
        summary: typeof item?.summary === 'string' && item.summary.trim() ? item.summary : (item?.body || item?.title || ''),
        language: typeof item?.language === 'string' && item.language.trim() ? item.language : 'en',
        entities: {
            tickers: Array.isArray(item?.entities?.tickers) ? item.entities.tickers : [],
            companyNames: Array.isArray(item?.entities?.companyNames) ? item.entities.companyNames : [],
            sectors: Array.isArray(item?.entities?.sectors) ? item.entities.sectors : [],
            peerBasket: Array.isArray(item?.entities?.peerBasket) ? item.entities.peerBasket : [],
            regulators: Array.isArray(item?.entities?.regulators) ? item.entities.regulators : [],
            themes: Array.isArray(item?.entities?.themes) ? item.entities.themes : [],
            exposures: Array.isArray(item?.entities?.exposures) ? item.entities.exposures : [],
        },
        events: Array.isArray(item?.events) ? item.events : [],
    } as NewsIntelligenceItem;
}

export async function writeNewsStore(next: NewsStoreState): Promise<void> {
    await ensureStoreFile();
    writeChain = writeChain.then(async () => {
        await fs.writeFile(STORE_PATH, JSON.stringify(next, null, 2), 'utf8');
    });
    await writeChain;
}

export async function upsertNewsItems(items: NewsIntelligenceItem[]): Promise<NewsStoreState> {
    const state = await readNewsStore();
    const map = new Map(state.items.map(item => [item.dedupeHash, item]));
    for (const item of items) {
        const existing = map.get(item.dedupeHash);
        map.set(item.dedupeHash, existing ? { ...existing, ...item } : item);
    }

    const merged = Array.from(map.values()).sort((a, b) => {
        const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return bTime - aTime;
    }).slice(0, 800);

    const nextState: NewsStoreState = {
        items: merged,
        lastSyncedAt: new Date().toISOString(),
    };
    await writeNewsStore(nextState);
    return nextState;
}

export async function queryNewsStore(query: NewsFeedQuery = {}): Promise<NewsIntelligenceItem[]> {
    const state = await readNewsStore();
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);

    return state.items.filter(item => {
        if (query.ticker && !item.entities.tickers.includes(query.ticker.toUpperCase())) return false;
        if (query.sector && !item.entities.sectors.includes(query.sector)) return false;
        if (query.regulator && !item.entities.regulators.includes(query.regulator.toUpperCase())) return false;
        return true;
    }).slice(0, limit);
}
