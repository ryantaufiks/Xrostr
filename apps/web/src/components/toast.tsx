'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Dot } from './ui';

type Tone = 'success' | 'error';

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  /** Shows a transient toast; success is polite, error is assertive. */
  push: (tone: Tone, message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: Tone, message: string) => {
      const id = ++nextId.current;
      setToasts((list) => [...list, { id, tone, message }]);
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-20 z-50 flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            role={toast.tone === 'error' ? 'alert' : 'status'}
            onClick={() => dismiss(toast.id)}
            className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full border border-line bg-surface px-5 py-3 text-base font-semibold text-fg shadow-2xl"
          >
            <Dot tone={toast.tone === 'error' ? 'accent' : 'fg'} />
            <span className="text-left">{toast.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside ToastProvider');
  return toast;
}
