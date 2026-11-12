'use client';

import type { AlertView } from '@xrostr/contracts';
import { MapPin, Phone, ShieldCheck, Siren } from 'lucide-react';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  SegmentedControl,
  Spinner,
  buttonStyles,
  cx,
  segmentedOptionStyles,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/use-data';

const REFRESH_MS = 30_000;

/** Supervisors' safety desk: newest first, SOS calls stand out. */
export default function AlertsPage() {
  const t = useT();
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const alerts = useData<AlertView[]>(`/tenant/alerts?status=${status}`, REFRESH_MS);
  const [error, setError] = useState<string | null>(null);

  async function act(path: string, body?: unknown) {
    setError(null);
    try {
      await api(path, { method: 'POST', body: body ?? {} });
      await alerts.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    }
  }

  return (
    <>
      <PageHeader
        title={t.safety.alertsTitle}
        description={t.safety.alertsSubtitle}
        actions={
          <SegmentedControl role="radiogroup" className="grid grid-cols-2">
            {(['open', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={status === value}
                onClick={() => setStatus(value)}
                className={segmentedOptionStyles(status === value)}
              >
                {value === 'open' ? t.safety.showOpen : t.safety.showAll}
              </button>
            ))}
          </SegmentedControl>
        }
      />
      {error && <Alert>{error}</Alert>}
      {alerts.error && <Alert>{alerts.error}</Alert>}
      {!alerts.data && !alerts.error && <Spinner />}
      {alerts.data?.length === 0 && (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <ShieldCheck className="size-10 text-faint" aria-hidden />
          <p className="mt-4 text-lg text-muted">{t.safety.noAlerts}</p>
        </Card>
      )}
      <div className="space-y-4">
        {alerts.data?.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onAcknowledge={() => act(`/tenant/alerts/${alert.id}/acknowledge`)}
            onResolve={(note) =>
              act(`/tenant/alerts/${alert.id}/resolve`, { note: note || undefined })
            }
          />
        ))}
      </div>
    </>
  );
}

function AlertCard({
  alert,
  onAcknowledge,
  onResolve,
}: {
  alert: AlertView;
  onAcknowledge: () => Promise<void>;
  onResolve: (note: string) => Promise<void>;
}) {
  const t = useT();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const sos = alert.kind === 'sos';
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    await action();
    setBusy(false);
  };

  return (
    <Card
      className={cx('space-y-3 p-5', sos && alert.status !== 'resolved' && 'ring-2 ring-accent')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cx(
              'label flex items-center gap-2 font-bold',
              sos ? 'text-accent' : 'text-muted',
            )}
          >
            {sos && <Siren className="size-5" aria-hidden />}
            {t.safety.kinds[alert.kind]}
          </p>
          <p className="mt-1 text-xl font-semibold text-fg">{alert.employee.fullName}</p>
          <p className="text-base text-muted">
            {[alert.employee.employeeNo, alert.location?.name, alert.route?.name]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Badge
          tone={
            alert.status === 'open'
              ? 'warn'
              : alert.status === 'acknowledged'
                ? 'active'
                : 'neutral'
          }
        >
          {t.safety.statuses[alert.status]}
        </Badge>
      </div>
      {alert.note && <p className="text-base text-fg">“{alert.note}”</p>}
      <p className="text-sm text-muted">
        {t.safety.raisedAt(formatDateTime(alert.raisedAt))}
        {alert.acknowledgedBy && ` · ${t.safety.acknowledgedBy(alert.acknowledgedBy)}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {alert.employee.phone && (
          <a href={`tel:${alert.employee.phone}`} className={buttonStyles('secondary')}>
            <Phone className="size-5" aria-hidden />
            {t.safety.call(alert.employee.phone)}
          </a>
        )}
        {alert.latitude != null && alert.longitude != null && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${alert.latitude},${alert.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonStyles('secondary')}
          >
            <MapPin className="size-5" aria-hidden />
            {t.safety.openMap}
          </a>
        )}
      </div>
      {alert.latitude != null && alert.accuracyM != null && (
        <p className="text-sm text-muted">{t.safety.accuracy(alert.accuracyM)}</p>
      )}
      {alert.status !== 'resolved' && (
        <div className="space-y-3 border-t border-line pt-4">
          <Input
            aria-label={t.safety.resolveNote}
            placeholder={t.safety.resolveNote}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {alert.status === 'open' && (
              <Button loading={busy} onClick={() => run(onAcknowledge)}>
                {t.safety.acknowledge}
              </Button>
            )}
            <Button
              variant={alert.status === 'open' ? 'secondary' : 'primary'}
              disabled={busy}
              onClick={() => run(() => onResolve(note.trim()))}
            >
              {t.safety.resolve}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
