/* watchlist.ts — API-backed watchlist (replaces localStorage) */
import axios from 'axios'

export interface WatchlistItem {
    id?: string
    userId?: string
    ticker: string
    sector?: string
    signal?: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT'
    ltp?: number
    target?: number
    stopLoss?: number
    targetPct?: number
    slPct?: number
    riskReward?: number
    confidenceScore?: number
    setupType?: string
    buyZone?: number
    addedAt: string
    note?: string
}

// Sync helpers — all calls go to the server (JWT attached by axios defaults)

export async function getWatchlistAsync(): Promise<WatchlistItem[]> {
    try {
        const { data } = await axios.get('/api/watchlist')
        return data.success ? data.data : []
    } catch {
        return []
    }
}

export async function addToWatchlistAsync(item: Omit<WatchlistItem, 'addedAt'>): Promise<void> {
    await axios.post('/api/watchlist', item)
}

export async function removeFromWatchlistAsync(ticker: string): Promise<void> {
    await axios.delete(`/api/watchlist/${ticker}`)
}

export function removeFromWatchlist(ticker: string): void {
    removeFromWatchlistAsync(ticker).catch(() => { })
    _cache = _cache.filter(w => w.ticker !== ticker)
}

export async function toggleWatchlistItemAsync(
    item: Omit<WatchlistItem, 'addedAt'>,
    currentItems: WatchlistItem[]
): Promise<boolean> {
    const exists = currentItems.some(w => w.ticker === item.ticker)
    if (exists) {
        await removeFromWatchlistAsync(item.ticker)
        return false
    } else {
        await addToWatchlistAsync(item)
        return true
    }
}

// Backward-compat shims (synchronous, use in-memory cache)
// Components that need to be sync should use the React state from useWatchlist hook
let _cache: WatchlistItem[] = []

export function getWatchlist(): WatchlistItem[] {
    return _cache
}

export function setWatchlistCache(items: WatchlistItem[]): void {
    _cache = items
}

export function isWatched(ticker: string): boolean {
    return _cache.some(w => w.ticker === ticker)
}

// Warning: this is now a "fire and forget" async operation for sync callers
export function toggleWatchlistItem(item: Omit<WatchlistItem, 'addedAt'>): void {
    const exists = _cache.some(w => w.ticker === item.ticker)
    if (exists) {
        removeFromWatchlistAsync(item.ticker).then(() => {
            _cache = _cache.filter(w => w.ticker !== item.ticker)
        })
    } else {
        addToWatchlistAsync(item).then(() => {
            // Note: cache might be slightly stale until a refresh is called by useWatchlist hook
            _cache = [..._cache, { ...item, addedAt: new Date().toISOString() }]
        })
    }
}
