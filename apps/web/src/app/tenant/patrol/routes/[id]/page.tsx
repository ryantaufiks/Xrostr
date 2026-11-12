'use client';

import type { PatrolCheckpointView, PatrolRouteView } from '@xrostr/contracts';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Crosshair,
  Printer,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  Input,
  PageHeader,
  Spinner,
  buttonStyles,
  cx,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { positionIfAvailable } from '@/lib/checkin';
import { useT } from '@/lib/i18n';

type Message = { tone: 'error' | 'success'; text: string } | null;

export default function PatrolRoutePage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const [route, setRoute] = useState<PatrolRouteView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  useEffect(() => {
    api<PatrolRouteView>(`/tenant/patrol/routes/${id}`)
      .then(setRoute)
      .catch((e: unknown) => setLoadError(e instanceof ApiError ? e.message : t.common.error));
  }, [id, t]);

  async function change(request: () => Promise<PatrolRouteView>, done?: string) {
    setMessage(null);
    try {
      setRoute(await request());
      if (done) setMessage({ tone: 'success', text: done });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof ApiError ? e.message : t.common.error });
    }
  }

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!route) return <Spinner />;

  const activeCheckpoints = route.checkpoints.filter((c) => c.status === 'active');
  const move = (index: number, by: -1 | 1) => {
    const ids = activeCheckpoints.map((c) => c.id);
    [ids[index], ids[index + by]] = [ids[index + by]!, ids[index]!];
    return change(() =>
      api<PatrolRouteView>(`/tenant/patrol/routes/${route.id}/order`, {
        method: 'PUT',
        body: { checkpointIds: ids },
      }),
    );
  };
  const setCheckpointStatus = (c: PatrolCheckpointView, status: 'active' | 'archived') =>
    change(() =>
      api<PatrolRouteView>(`/tenant/patrol/checkpoints/${c.id}`, {
        method: 'PATCH',
        body: { status },
      }),
    );

  return (
    <>
      <Link href="/tenant/patrol" className={buttonStyles('ghost', 'mb-4 -ml-4')}>
        <ArrowLeft className="size-5" aria-hidden />
        {t.patrol.title}
      </Link>
      <PageHeader
        title={route.name}
        description={`${route.location.name} (${route.location.code})`}
        actions={
          <Link
            href={`/tenant/patrol/routes/${route.id}/tags`}
            className={buttonStyles('secondary')}
          >
            <Printer className="size-5" aria-hidden />
            {t.patrol.printTags}
          </Link>
        }
      />
      <div className="space-y-6">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <RouteForm
          route={route}
          onSave={(body) =>
            change(
              () =>
                api<PatrolRouteView>(`/tenant/patrol/routes/${route.id}`, {
                  method: 'PATCH',
                  body,
                }),
              t.patrol.routeSaved,
            )
          }
        />

        <Card>
          <div className="p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold">{t.patrol.checkpoints}</h2>
            <p className="mt-1 text-sm text-muted">{t.patrol.checkpointsHint}</p>
          </div>
          {route.checkpoints.length === 0 ? (
            <p className="border-t border-line px-5 py-4 text-base text-muted sm:px-6">
              {t.patrol.noCheckpoints}
            </p>
          ) : (
            <ol className="divide-y divide-line border-t border-line">
              {route.checkpoints.map((c) => {
                const index = activeCheckpoints.indexOf(c);
                const archived = c.status === 'archived';
                return (
                  <li
                    key={c.id}
                    className={cx(
                      'flex items-center gap-3 px-5 py-3 sm:px-6',
                      archived && 'opacity-60',
                    )}
                  >
                    <span className="w-6 text-center font-mono text-base text-muted">
                      {archived ? '–' : index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg text-fg">{c.name}</p>
                      <p className="text-sm text-muted">
                        {c.latitude != null ? t.patrol.point(c.radiusM) : t.patrol.noPoint}
                      </p>
                    </div>
                    {archived ? (
                      <>
                        <Badge>{t.patrol.archived}</Badge>
                        <IconButton
                          aria-label={t.patrol.restoreCheckpoint(c.name)}
                          onClick={() => setCheckpointStatus(c, 'active')}
                        >
                          <ArchiveRestore className="size-5" aria-hidden />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <IconButton
                          aria-label={t.patrol.moveUp(c.name)}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp className="size-5" aria-hidden />
                        </IconButton>
                        <IconButton
                          aria-label={t.patrol.moveDown(c.name)}
                          disabled={index === activeCheckpoints.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="size-5" aria-hidden />
                        </IconButton>
                        <IconButton
                          tone="danger"
                          aria-label={t.patrol.archiveCheckpoint(c.name)}
                          onClick={() => setCheckpointStatus(c, 'archived')}
                        >
                          <Archive className="size-5" aria-hidden />
                        </IconButton>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {route.status === 'active' && (
            <AddCheckpoint
              onAdd={(body) =>
                change(() =>
                  api<PatrolRouteView>(`/tenant/patrol/routes/${route.id}/checkpoints`, { body }),
                )
              }
            />
          )}
        </Card>
      </div>
    </>
  );
}

function RouteForm({
  route,
  onSave,
}: {
  route: PatrolRouteView;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState(route.name);
  const [intervalText, setIntervalText] = useState(route.intervalMinutes?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    await onSave({
      name: name.trim(),
      intervalMinutes: intervalText ? Number(intervalText) : null,
    });
    setSaving(false);
  }

  const active = route.status === 'active';
  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-[1fr_220px]">
          <Field label={t.patrol.routeName} htmlFor="route-name">
            <Input
              id="route-name"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t.patrol.interval} htmlFor="route-interval" hint={t.patrol.intervalHint}>
            <Input
              id="route-interval"
              type="number"
              min={15}
              max={1440}
              inputMode="numeric"
              value={intervalText}
              onChange={(e) => setIntervalText(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={saving}>
            {t.common.save}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onSave({ status: active ? 'archived' : 'active' })}
          >
            {active ? t.patrol.archiveRoute : t.patrol.restoreRoute}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AddCheckpoint({ onAdd }: { onAdd: (body: Record<string, unknown>) => Promise<void> }) {
  const t = useT();
  const [name, setName] = useState('');
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radius, setRadius] = useState('30');
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  async function locate() {
    setLocating(true);
    const position = await positionIfAvailable(20_000);
    setPoint(position && { latitude: position.latitude, longitude: position.longitude });
    setLocating(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    await onAdd({ name: name.trim(), ...point, radiusM: Number(radius) || 30 });
    setName('');
    setPoint(null);
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="space-y-5 border-t border-line p-5 sm:p-6">
      <h3 className="label font-bold text-muted">{t.patrol.addCheckpoint}</h3>
      <div className="grid gap-5 sm:grid-cols-[1fr_160px]">
        <Field label={t.patrol.checkpointName} htmlFor="checkpoint-name">
          <Input
            id="checkpoint-name"
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t.patrol.radius} htmlFor="checkpoint-radius">
          <Input
            id="checkpoint-radius"
            type="number"
            min={5}
            max={500}
            inputMode="numeric"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" loading={locating} onClick={locate}>
          <Crosshair className="size-5" aria-hidden />
          {t.patrol.useMyLocation}
        </Button>
        {point && (
          <span className="font-mono text-sm text-muted">
            {t.patrol.locationSet(point.latitude.toFixed(6), point.longitude.toFixed(6))}
          </span>
        )}
      </div>
      <Button type="submit" loading={saving}>
        {t.patrol.addCheckpoint}
      </Button>
    </form>
  );
}
