import { Injectable } from '@nestjs/common';
import {
  WEEKLY_HOUR_LIMITS,
  type Localized,
  type MyReliefOffer,
  type ReliefCandidate,
  type ReliefQuery,
  type ReliefRequestView,
  type SendReliefRequest,
} from '@xrostr/contracts';
import { AuditLogger, Clock, UnitOfWork } from '../../../shared/application/ports.js';
import { formatCalendarDate } from '../../../shared/domain/dates.js';
import { addDays, localDaysToUtcRange, utcToLocal } from '../../../shared/domain/local-time.js';
import type { DomainError } from '../../../shared/domain/domain-error.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { Principal } from '../../identity/public-api.js';
import { Notifier } from '../../notifications/public-api.js';
import { LegalEntityDirectory } from '../../tenancy/public-api.js';
import { WorkforceDirectory, type WorkforceLocation } from '../../workforce/public-api.js';
import { SchedulingErrors } from '../domain/scheduling-errors.js';
import {
  LeaveCalendarRepository,
  ReliefRepository,
  ShiftRepository,
  ZoneRepository,
  type ReliefOffer,
  type ReliefRequest,
  type Shift,
} from './ports.js';
import { rankReliefCandidates } from './relief-candidates.js';

const tenantOf = (actor: Principal) => actor.subject.tenantId!;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** Shifts this far either side of the window are read to check rest and roving duty. */
const AROUND_MS = 36 * 3_600_000;

/** Monday of the week containing a YYYY-MM-DD date. */
const mondayOf = (date: string) => {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
};

/**
 * Relief: find someone to take over a published site shift. Candidates are ranked by
 * `rankReliefCandidates`; offers go out one at a time, and the first officer to accept gets a
 * published shift for the rest of the window while the original is cancelled (or cut short if
 * it already started). Declines move on at once; unanswered offers are moved on by the worker.
 */
@Injectable()
export class ReliefService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly relief: ReliefRepository,
    private readonly shifts: ShiftRepository,
    private readonly zones: ZoneRepository,
    private readonly leaves: LeaveCalendarRepository,
    private readonly workforce: WorkforceDirectory,
    private readonly entities: LegalEntityDirectory,
    private readonly notifier: Notifier,
    private readonly audit: AuditLogger,
    private readonly clock: Clock,
  ) {}

  candidates(actor: Principal, shiftId: string): Promise<Result<ReliefCandidate[]>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const target = await this.eligibleShift(shiftId);
      if (!target.ok) return target;
      return ok(await this.rank(target.value.shift, target.value.site));
    });
  }

  send(
    actor: Principal,
    shiftId: string,
    input: SendReliefRequest,
  ): Promise<Result<ReliefRequestView>> {
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const target = await this.eligibleShift(shiftId);
      if (!target.ok) return target;
      const { shift, site } = target.value;
      // Only officers who still qualify, in the planner's order.
      const qualifying = new Set((await this.rank(shift, site)).map((c) => c.employee.id));
      const chosen = [...new Set(input.employeeIds)].filter((id) => qualifying.has(id));
      if (chosen.length === 0) return err(SchedulingErrors.reliefNoCandidates());

      const now = this.clock.now();
      const id = await this.relief.insertRequest({
        shiftId: shift.id,
        locationId: site.id,
        startsAt: shift.startsAt > now ? shift.startsAt : now,
        endsAt: shift.endsAt,
        requestedBy: actor.subject.id,
        timeoutMinutes: input.timeoutMinutes,
      });
      if (!id) return err(SchedulingErrors.reliefAlreadyOpen());
      await this.relief.insertOffers(id, chosen);
      const request = (await this.relief.findRequest(id))!;
      await this.offerNext(tenantId, request, site, now);
      await this.record(actor, 'relief.requested', id, {
        shiftId: shift.id,
        candidates: chosen.length,
      });
      return ok((await this.views([(await this.relief.findRequest(id))!]))[0]!);
    });
  }

  list(actor: Principal, query: ReliefQuery): Promise<ReliefRequestView[]> {
    return this.uow.runInTenant(tenantOf(actor), async () =>
      this.views(
        await this.relief.list({ locationId: query.locationId, openOnly: query.status === 'open' }),
      ),
    );
  }

  cancel(actor: Principal, id: string): Promise<Result<void>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const request = await this.relief.lockRequest(id);
      if (!request) return err(SchedulingErrors.reliefNotFound());
      if (request.status !== 'open') return err(SchedulingErrors.reliefClosed());
      const now = this.clock.now();
      await this.relief.withdrawRemaining(id, now);
      await this.relief.close(id, 'cancelled', now);
      await this.record(actor, 'relief.cancelled', id, {});
      return ok(undefined);
    });
  }

  /** The officer's offers that are still waiting for an answer. */
  mine(actor: Principal): Promise<Result<MyReliefOffer[]>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const me = await this.workforce.employeeOfUser(actor.subject.id);
      if (!me) return err(SchedulingErrors.notAnEmployee());
      const offers = await this.relief.pendingFor(me.id, this.clock.now());
      const views: MyReliefOffer[] = [];
      for (const offer of offers) {
        const request = (await this.relief.findRequest(offer.requestId))!;
        const site = (await this.workforce.location(request.locationId))!;
        views.push({
          id: offer.id,
          status: offer.status,
          expiresAt: offer.expiresAt?.toISOString() ?? null,
          location: { id: site.id, name: site.name },
          ...this.window(request, site),
        });
      }
      return ok(views);
    });
  }

  async accept(actor: Principal, offerId: string): Promise<Result<MyReliefOffer>> {
    try {
      return await this.acceptInTransaction(actor, offerId);
    } catch (error) {
      // A clash discovered half way: the whole acceptance was rolled back.
      if (error instanceof ReliefAbort) return err(error.cause);
      throw error;
    }
  }

  private acceptInTransaction(actor: Principal, offerId: string): Promise<Result<MyReliefOffer>> {
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const me = await this.workforce.employeeOfUser(actor.subject.id);
      const found = await this.relief.findOffer(offerId);
      if (!me || !found || found.employeeId !== me.id)
        return err(SchedulingErrors.reliefOfferNotFound());
      // Lock the request first: concurrent accepts queue here, and only one finds it open.
      const request = await this.relief.lockRequest(found.requestId);
      const offer = (await this.relief.findOffer(offerId))!;
      const now = this.clock.now();
      if (
        !request ||
        request.status !== 'open' ||
        offer.status !== 'offered' ||
        !offer.expiresAt ||
        offer.expiresAt <= now
      )
        return err(SchedulingErrors.reliefOfferClosed());

      const original = (await this.shifts.findById(request.shiftId))!;
      const site = (await this.workforce.location(request.locationId))!;
      const start =
        request.startsAt > now
          ? request.startsAt
          : new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS);
      if (start >= request.endsAt) return err(SchedulingErrors.reliefOfferClosed());

      // A roving officer leaves their zone for the site: end or drop their roving shift.
      const mine = await this.shifts.forEmployees(
        [me.id],
        new Date(start.getTime() - DAY_MS),
        request.endsAt,
      );
      for (const s of mine) {
        if (
          s.kind === 'standby' ||
          s.status === 'cancelled' ||
          !(s.startsAt < request.endsAt && s.endsAt > start)
        )
          continue;
        if (s.startsAt < start) await this.shifts.truncate(s.id, start);
        else await this.shifts.cancel(s.id);
      }
      // The original officer keeps the part they may already have worked.
      if (original.startsAt < start) await this.shifts.truncate(original.id, start);
      else await this.shifts.cancel(original.id);

      const newShiftId = await this.shifts.insert({
        locationId: site.id,
        zoneId: null,
        employeeId: me.id,
        kind: original.startsAt < start ? 'custom' : original.kind,
        startsAt: start,
        endsAt: request.endsAt,
        timezone: site.timezone,
        notes: null,
        createdBy: request.requestedBy,
        replacesShiftId: original.id,
      });
      // Throwing undoes the changes above (original and roving shifts) with the transaction.
      if (!newShiftId) throw new ReliefAbort(SchedulingErrors.shiftOverlap());
      await this.shifts.publishByIds([newShiftId], now);

      await this.relief.setOfferStatus(offer.id, 'accepted', now);
      await this.relief.withdrawRemaining(request.id, now);
      await this.relief.close(request.id, 'filled', now, {
        employeeId: me.id,
        shiftId: newShiftId,
      });

      const originalOfficer = await this.workforce.employee(original.employeeId);
      const when = this.when(request, site);
      await this.notifier.notify(tenantId, {
        userId: request.requestedBy,
        kind: 'relief.filled',
        url: '/tenant/roster',
        text: {
          en: {
            title: 'Relief found',
            body: `${me.fullName} takes over from ${originalOfficer?.fullName ?? ''} at ${site.name}, ${when.en}.`,
          },
          id: {
            title: 'Pengganti didapat',
            body: `${me.fullName} menggantikan ${originalOfficer?.fullName ?? ''} di ${site.name}, ${when.id}.`,
          },
        },
      });
      if (originalOfficer) {
        await this.notifier.notify(tenantId, {
          userId: originalOfficer.userId,
          kind: 'relief.replaced',
          url: '/tenant',
          text: {
            en: {
              title: 'Your shift is covered',
              body: `${me.fullName} takes over at ${site.name}, ${when.en}.`,
            },
            id: {
              title: 'Shift Anda digantikan',
              body: `${me.fullName} menggantikan Anda di ${site.name}, ${when.id}.`,
            },
          },
        });
      }
      await this.audit.recordTenant({
        actorType: 'user',
        actorId: actor.subject.id,
        action: 'relief.accepted',
        targetType: 'relief_request',
        targetId: request.id,
        metadata: { newShiftId, originalShiftId: original.id },
      });
      return ok({
        id: offer.id,
        status: 'accepted',
        expiresAt: null,
        location: { id: site.id, name: site.name },
        ...this.window(request, site),
      });
    });
  }

  decline(actor: Principal, offerId: string): Promise<Result<void>> {
    const tenantId = tenantOf(actor);
    return this.uow.runInTenant(tenantId, async () => {
      const me = await this.workforce.employeeOfUser(actor.subject.id);
      const found = await this.relief.findOffer(offerId);
      if (!me || !found || found.employeeId !== me.id)
        return err(SchedulingErrors.reliefOfferNotFound());
      const request = await this.relief.lockRequest(found.requestId);
      const offer = (await this.relief.findOffer(offerId))!;
      if (!request || request.status !== 'open' || offer.status !== 'offered')
        return err(SchedulingErrors.reliefOfferClosed());
      const now = this.clock.now();
      await this.relief.setOfferStatus(offer.id, 'declined', now);
      const site = (await this.workforce.location(request.locationId))!;
      await this.offerNext(tenantId, request, site, now);
      return ok(undefined);
    });
  }

  /** Offers the next candidate, or closes the search as unfilled and tells the planner. */
  private async offerNext(
    tenantId: string,
    request: ReliefRequest,
    site: WorkforceLocation,
    now: Date,
  ) {
    const next = await this.relief.offerNext(
      request.id,
      now,
      new Date(now.getTime() + request.timeoutMinutes * MINUTE_MS),
    );
    const when = this.when(request, site);
    if (next) {
      const employee = await this.workforce.employee(next.employeeId);
      if (employee)
        await this.notifier.notify(tenantId, {
          userId: employee.userId,
          ...offerMessage(site.name, when, request.timeoutMinutes),
        });
      return;
    }
    await this.relief.close(request.id, 'unfilled', now);
    await this.notifier.notify(tenantId, {
      userId: request.requestedBy,
      kind: 'relief.unfilled',
      url: '/tenant/roster',
      text: {
        en: {
          title: 'No relief found',
          body: `Nobody took the shift at ${site.name}, ${when.en}. Find someone else or call around.`,
        },
        id: {
          title: 'Pengganti tidak didapat',
          body: `Tidak ada yang menerima shift di ${site.name}, ${when.id}. Cari officer lain atau hubungi langsung.`,
        },
      },
    });
  }

  private async eligibleShift(
    shiftId: string,
  ): Promise<Result<{ shift: Shift; site: WorkforceLocation }>> {
    const shift = await this.shifts.findById(shiftId);
    if (!shift) return err(SchedulingErrors.shiftNotFound());
    if (
      shift.status !== 'published' ||
      shift.kind === 'standby' ||
      !shift.locationId ||
      shift.endsAt <= this.clock.now()
    )
      return err(SchedulingErrors.reliefShiftNotEligible());
    const site = await this.workforce.location(shift.locationId);
    if (!site) return err(SchedulingErrors.locationNotFound());
    return ok({ shift, site });
  }

  private async rank(shift: Shift, site: WorkforceLocation): Promise<ReliefCandidate[]> {
    const now = this.clock.now();
    const start = shift.startsAt > now ? shift.startsAt : now;
    const employees = (await this.workforce.employeesByLegalEntity(site.legalEntityId)).filter(
      (e) => e.id !== shift.employeeId,
    );
    const ids = employees.map((e) => e.id);
    const startDate = utcToLocal(start, site.timezone).date;
    const week = localDaysToUtcRange(
      mondayOf(startDate),
      addDays(mondayOf(startDate), 6),
      site.timezone,
    );
    const [around, leave, allowedSites, zones, entity] = await Promise.all([
      this.shifts.forEmployees(
        ids,
        new Date(Math.min(start.getTime() - AROUND_MS, week.start.getTime())),
        new Date(Math.max(shift.endsAt.getTime() + AROUND_MS, week.end.getTime())),
      ),
      this.leaves.approvedSpans(ids, startDate, utcToLocal(shift.endsAt, site.timezone).date),
      this.workforce.allowedSites(ids),
      this.zones.list(),
      this.entities.find(site.legalEntityId),
    ]);
    return rankReliefCandidates(employees, {
      siteId: site.id,
      start,
      end: shift.endsAt,
      zoneIds: new Set(
        zones.filter((z) => z.locations.some((l) => l.id === site.id)).map((z) => z.id),
      ),
      shifts: around.filter((s) => s.status !== 'cancelled'),
      onLeave: new Set(leave.map((l) => l.employeeId)),
      allowedSites,
      weekStart: week.start,
      weekEnd: week.end,
      weeklyLimit: entity ? (WEEKLY_HOUR_LIMITS[entity.countryCode] ?? 44) : 44,
    });
  }

  private window(request: ReliefRequest, site: WorkforceLocation) {
    const start = utcToLocal(request.startsAt, site.timezone);
    return {
      localDate: start.date,
      localStart: start.time,
      localEnd: utcToLocal(request.endsAt, site.timezone).time,
      timezone: site.timezone,
    };
  }

  private when(request: ReliefRequest, site: WorkforceLocation): Localized<string> {
    const w = this.window(request, site);
    return {
      en: `${formatCalendarDate(w.localDate, 'en')} ${w.localStart}–${w.localEnd}`,
      id: `${formatCalendarDate(w.localDate, 'id')} ${w.localStart.replace(':', '.')}–${w.localEnd.replace(':', '.')}`,
    };
  }

  private async views(requests: ReliefRequest[]): Promise<ReliefRequestView[]> {
    const [offers, sites, shifts] = await Promise.all([
      this.relief.offers(requests.map((r) => r.id)),
      this.workforce.locationsById(requests.map((r) => r.locationId)),
      Promise.all(requests.map((r) => this.shifts.findById(r.shiftId))),
    ]);
    const employees = await this.workforce.employeesById([
      ...offers.map((o) => o.employeeId),
      ...shifts.flatMap((s) => (s ? [s.employeeId] : [])),
    ]);
    const name = (id: string) => employees.get(id)?.fullName ?? '';
    return requests.map((r, i) => {
      const site = sites.get(r.locationId)!;
      const original = shifts[i]!;
      return {
        id: r.id,
        shiftId: r.shiftId,
        status: r.status,
        location: { id: site.id, name: site.name },
        original: { id: original.employeeId, fullName: name(original.employeeId) },
        ...this.window(r, site),
        timeoutMinutes: r.timeoutMinutes,
        offers: offers
          .filter((o) => o.requestId === r.id)
          .map((o: ReliefOffer) => ({
            employee: { id: o.employeeId, fullName: name(o.employeeId) },
            status: o.status,
            expiresAt: o.expiresAt?.toISOString() ?? null,
          })),
        filledBy: r.filledEmployeeId
          ? { id: r.filledEmployeeId, fullName: name(r.filledEmployeeId) }
          : null,
        newShiftId: r.newShiftId,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  private record(actor: Principal, action: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.recordTenant({
      actorType: 'user',
      actorId: actor.subject.id,
      action,
      targetType: 'relief_request',
      targetId: id,
      metadata,
    });
  }
}

/** The push an officer gets when a replacement shift is offered to them. */
export function offerMessage(siteName: string, when: Localized<string>, minutes: number) {
  return {
    kind: 'relief.offered',
    url: '/tenant/relief',
    text: {
      en: {
        title: 'Replacement shift offered',
        body: `${siteName}, ${when.en}. Please answer within ${minutes} minutes.`,
      },
      id: {
        title: 'Tawaran shift pengganti',
        body: `${siteName}, ${when.id}. Jawab dalam ${minutes} menit.`,
      },
    },
  };
}

/** Thrown inside an acceptance to roll its transaction back. */
class ReliefAbort extends Error {
  constructor(override readonly cause: DomainError) {
    super(cause.message);
  }
}
