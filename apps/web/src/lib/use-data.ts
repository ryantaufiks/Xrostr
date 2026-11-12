'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

/** Loads `path` from the API; `reload` fetches it again after a change. */
export function useData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan.');
    }
  }, [path]);

  useEffect(() => void reload(), [reload]);
  return { data, error, reload };
}
