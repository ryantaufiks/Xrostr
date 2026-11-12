// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n';
import { ConfirmDialog } from './confirm-dialog';

afterEach(cleanup);

function renderDialog(message: string, confirmLabel: string, onClose: (v: boolean) => void) {
  render(
    <I18nProvider initial="en">
      <ConfirmDialog message={message} confirmLabel={confirmLabel} onClose={onClose} />
    </I18nProvider>,
  );
}

describe('ConfirmDialog', () => {
  it('shows the question and the action label', () => {
    renderDialog('Cancel this leave request?', 'Cancel request', () => {});
    expect(screen.getByText('Cancel this leave request?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeTruthy();
  });

  it('resolves true on the action button', () => {
    const onClose = vi.fn();
    renderDialog('Delete this draft shift?', 'Delete shift', onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Delete shift' }));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('resolves false on cancel', () => {
    const onClose = vi.fn();
    renderDialog('Delete this draft shift?', 'Delete shift', onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledWith(false);
  });
});
