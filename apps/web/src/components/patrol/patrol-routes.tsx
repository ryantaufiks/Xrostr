'use client';

import type { LocationView, PatrolRouteView } from '@xrostr/contracts';
import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/use-data';
import { Alert, Badge, Button, Card, Field, Input, Spinner } from '../ui';

/** The site's routes, and a form to start a new one. Planners only. */
export function PatrolRoutes({ site }: { site: LocationView }) {
  const t = useT();
  const routes = useData<PatrolRouteView[]>(`/tenant/patrol/routes?locationId=${site.id}`);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [intervalText, setIntervalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/tenant/patrol/routes', {
        body: {
          locationId: site.id,
          name: name.trim(),
          intervalMinutes: intervalText ? Number(intervalText) : null,
        },
      });
      setName('');
      setIntervalText('');
      setAdding(false);
      await routes.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="routes">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="routes" className="font-display text-2xl font-bold">
          {t.patrol.routesTitle}
        </h2>
        {!adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-5" aria-hidden />
            {t.patrol.newRoute}
          </Button>
        )}
      </div>
      {adding && (
        <Card className="p-5 sm:p-6">
          <form onSubmit={create} className="space-y-5">
            {error && <Alert>{error}</Alert>}
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
              <Field
                label={t.patrol.interval}
                htmlFor="route-interval"
                hint={t.patrol.intervalHint}
              >
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
                {t.patrol.createRoute}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                {t.common.cancel}
              </Button>
            </div>
          </form>
        </Card>
      )}
      {routes.error && <Alert>{routes.error}</Alert>}
      {!routes.data && !routes.error && <Spinner />}
      {routes.data?.length === 0 && !adding && (
        <p className="text-base text-muted">{t.patrol.noRoutesManage}</p>
      )}
      {routes.data && routes.data.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {routes.data.map((route) => {
              const count = route.checkpoints.filter((c) => c.status === 'active').length;
              return (
                <li key={route.id}>
                  <Link
                    href={`/tenant/patrol/routes/${route.id}`}
                    aria-label={`${t.patrol.manageRoute}: ${route.name}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-sunken"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold text-fg">{route.name}</p>
                      <p className="text-base text-muted">
                        {t.patrol.checkpointsCount(count)}
                        {route.intervalMinutes &&
                          ` · ${t.patrol.everyMinutes(route.intervalMinutes)}`}
                      </p>
                    </div>
                    {route.status === 'archived' && <Badge>{t.patrol.archived}</Badge>}
                    <ChevronRight className="size-6 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
