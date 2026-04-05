import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { WatchlistItem } from '../lib/types';

export function useWatchlist(enabled = true) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const { data } = await api.get('/api/watchlist');
      setItems(data?.success ? data.data : []);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(async (item: WatchlistItem) => {
    await api.post('/api/watchlist', item);
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (ticker: string) => {
    await api.delete(`/api/watchlist/${ticker}`);
    setItems((prev) => prev.filter((entry) => entry.ticker !== ticker));
  }, []);

  return {
    items,
    loading,
    refresh,
    add,
    remove,
    isSaved: (ticker: string) => items.some((item) => item.ticker === ticker),
  };
}
