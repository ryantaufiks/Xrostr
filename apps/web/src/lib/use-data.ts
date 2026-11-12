'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { messageFor } from './messages';

/**
 * Loads `path` from the API; `reload` fetches it again after a change. With `refreshMs`, it also
 * refetches on that interval, for screens that must stay current such as the alert desk.
 */
export function useData<T>(path: string | null, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : messageFor('unknown'));
    }
  }, [path]);

  useEffect(() => {
    void reload();
    if (!refreshMs) return;
    const timer = setInterval(() => void reload(), refreshMs);
    return () => clearInterval(timer);
  }, [reload, refreshMs]);
  return { data, error, reload };
}
