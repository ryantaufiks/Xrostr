'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/lib/i18n';
import { Button } from './ui';

export interface ConfirmOptions {
  /** Specific question, e.g. "Cancel this leave request?" */
  message: string;
  /** Label of the action button, e.g. "Cancel request". */
  confirmLabel: string;
  /** Destructive actions get the accent button; others a neutral primary. */
  tone?: 'danger' | 'primary';
}

interface Request extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Replaces the browser's native `confirm()` with a styled, accessible dialog so every
 * confirmation matches the design system and the chosen language.
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm({ message: t.leave.cancelConfirm(...), confirmLabel: t.leave.cancelRequest }))) return;
 *
 * Render `confirmDialog` once in the component's tree.
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDialog: ReactNode;
} {
  const [request, setRequest] = useState<Request | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    [],
  );

  const close = useCallback((result: boolean) => {
    setRequest((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const confirmDialog = request ? <ConfirmDialog {...request} onClose={close} /> : null;
  return { confirm, confirmDialog };
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  message,
  confirmLabel,
  tone = 'danger',
  onClose,
}: ConfirmOptions & { onClose: (confirmed: boolean) => void }) {
  const t = useT();
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Destructive actions are cancelled by default; focus the safe button first.
    cancelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose(false);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={() => onClose(false)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <h2 id={titleId} className="font-display text-2xl font-bold text-fg">
          {t.common.areYouSure}
        </h2>
        <p id={descId} className="mt-2 text-base text-muted">
          {message}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={() => onClose(false)}>
            {t.common.cancel}
          </Button>
          <Button variant={tone} onClick={() => onClose(true)}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
