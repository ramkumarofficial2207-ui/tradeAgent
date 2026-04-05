import { DependencyList, useEffect, useState } from 'react';

export function useApi<T>(loader: () => Promise<T>, deps: DependencyList = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const execute = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      setData(result);
    } catch (err: any) {
      setError(err?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void execute();
  }, deps);

  return { data, loading, error, refresh: execute };
}
