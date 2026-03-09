// useWatchlist.ts — Hook to load/manage watchlist from API, backed by in-memory cache
import { useState, useCallback, useEffect } from 'react'
import {
    getWatchlistAsync, addToWatchlistAsync, removeFromWatchlistAsync,
    setWatchlistCache, WatchlistItem
} from './watchlist'
import { useAuth } from '../context/AuthContext'

export function useWatchlist() {
    const { user } = useAuth()
    const [items, setItems] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(false)

    const refresh = useCallback(async () => {
        if (!user) { setItems([]); setWatchlistCache([]); return }
        setLoading(true)
        const data = await getWatchlistAsync()
        setItems(data)
        setWatchlistCache(data)
        setLoading(false)
    }, [user])

    useEffect(() => { refresh() }, [refresh])

    const add = useCallback(async (item: Omit<WatchlistItem, 'addedAt'>) => {
        await addToWatchlistAsync(item)
        await refresh()
    }, [refresh])

    const remove = useCallback(async (ticker: string) => {
        await removeFromWatchlistAsync(ticker)
        setItems(prev => {
            const next = prev.filter(i => i.ticker !== ticker)
            setWatchlistCache(next)
            return next
        })
    }, [])

    const toggle = useCallback(async (item: Omit<WatchlistItem, 'addedAt'>) => {
        const exists = items.some(w => w.ticker === item.ticker)
        if (exists) { await remove(item.ticker); return false }
        else { await add(item); return true }
    }, [items, add, remove])

    const isSaved = (ticker: string) => items.some(i => i.ticker === ticker)

    return { items, loading, refresh, add, remove, toggle, isSaved }
}
