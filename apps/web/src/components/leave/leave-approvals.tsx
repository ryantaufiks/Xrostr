'use client';

import type { LeaveRequestView } from '@xrostr/contracts';
import { CalendarX2 } from 'lucide-react';
import { useState } from 'react';
import { Alert, Button, Card, Input, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useData } from '@/lib/use-data';
import { LeaveRequestRow } from './leave-request-row';
import { useT } from '@/lib/i18n';

/** Pending requests for people who may approve leave. */
export function LeaveApprovals() {
  const t = useT();
  const queue = useData<LeaveRequestView[]>('/tenant/leave/requests');
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  return (
    <section className="space-y-4" aria-labelledby="approvals">
      <h2 id="approvals" className="font-display text-2xl font-bold">
        {t.leave.awaiting}
      </h2>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {queue.error && <Alert>{queue.error}</Alert>}
      {!queue.data && !queue.error && <Spinner />}
      {queue.data?.length === 0 && (
        <p className="text-base text-muted">{t.leave.nothingAwaiting}</p>
      )}
      {queue.data && queue.data.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {queue.data.map((r) => (
              <LeaveRequestRow key={r.id} request={r} showEmployee>
                <Decision
                  request={r}
                  onDone={async (text, tone) => {
                    setMessage({ tone, text });
                    await queue.reload();
                  }}
                />
              </LeaveRequestRow>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function Decision({
  request,
  onDone,
}: {
  request: LeaveRequestView;
  onDone: (text: string, tone: 'error' | 'success') => Promise<void>;
}) {
  const t = useT();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(decision);
    try {
      await api(`/tenant/leave/requests/${request.id}/decision`, {
        body: { decision, note: note.trim() || undefined },
      });
      const shifts =
        decision === 'approve' && request.conflictingShifts > 0
          ? t.leave.withdrawn(request.conflictingShifts)
          : '';
      await onDone(
        `${t.leave.decided(request.employee.fullName, decision === 'approve')}${shifts}`,
        'success',
      );
    } catch (e) {
      await onDone(e instanceof ApiError ? e.message : t.common.error, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {request.conflictingShifts > 0 && (
        <p className="flex items-center gap-2 text-base text-accent">
          <CalendarX2 className="size-5 shrink-0" aria-hidden />
          {t.leave.conflicts(request.conflictingShifts)}
        </p>
      )}
      <Input
        aria-label={t.leave.noteFor(request.employee.fullName)}
        placeholder={t.leave.notePlaceholder}
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        <Button
          loading={busy === 'approve'}
          disabled={busy !== null}
          onClick={() => decide('approve')}
        >
          {t.leave.approve}
        </Button>
        <Button
          variant="secondary"
          loading={busy === 'reject'}
          disabled={busy !== null}
          onClick={() => decide('reject')}
        >
          {t.leave.reject}
        </Button>
      </div>
    </div>
  );
}
