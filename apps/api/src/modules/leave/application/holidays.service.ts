import { Injectable } from '@nestjs/common';
import type { CountryCode, CreateHolidayRequest, HolidayView } from '@xrostr/contracts';
import { AuditLogger, UnitOfWork } from '../../../shared/application/ports.js';
import { err, ok, type Result } from '../../../shared/domain/result.js';
import type { Principal } from '../../identity/public-api.js';
import { countryPack } from '../../tenancy/public-api.js';
import { LeaveErrors } from '../domain/leave-errors.js';
import { HolidayRepository } from './ports.js';

const tenantOf = (actor: Principal) => actor.subject.tenantId!;

/**
 * Public holidays per country. Each (country, year) calendar is copied from the Country Pack the
 * first time it is needed; after that the tenant's own edits are the truth.
 */
@Injectable()
export class HolidaysService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly holidays: HolidayRepository,
    private readonly audit: AuditLogger,
  ) {}

  list(actor: Principal, countryCode: CountryCode, year: number): Promise<HolidayView[]> {
    return this.uow.runInTenant(tenantOf(actor), () =>
      this.between(countryCode, `${year}-01-01`, `${year}-12-31`),
    );
  }

  /** Holiday dates in from..to; requires a tenant unit of work. */
  async datesBetween(countryCode: CountryCode, from: string, to: string): Promise<Set<string>> {
    return new Set((await this.between(countryCode, from, to)).map((h) => h.date));
  }

  create(actor: Principal, input: CreateHolidayRequest): Promise<Result<HolidayView>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      await this.ensureSeeded(input.countryCode, Number(input.date.slice(0, 4)));
      const id = await this.holidays.insert(input.countryCode, input.date, input.name);
      if (!id) return err(LeaveErrors.holidayExists());
      await this.record(actor, 'holiday.created', id, {
        date: input.date,
        country: input.countryCode,
      });
      return ok({ id, countryCode: input.countryCode, date: input.date, name: input.name });
    });
  }

  remove(actor: Principal, id: string): Promise<Result<void>> {
    return this.uow.runInTenant(tenantOf(actor), async () => {
      const holiday = await this.holidays.findById(id);
      if (!holiday) return err(LeaveErrors.holidayNotFound());
      await this.holidays.remove(id);
      await this.record(actor, 'holiday.removed', id, {
        date: holiday.date,
        country: holiday.countryCode,
      });
      return ok(undefined);
    });
  }

  private async between(
    countryCode: CountryCode,
    from: string,
    to: string,
  ): Promise<HolidayView[]> {
    for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
      await this.ensureSeeded(countryCode, year);
    }
    return this.holidays.between(countryCode, from, to);
  }

  private async ensureSeeded(countryCode: CountryCode, year: number): Promise<void> {
    if (await this.holidays.isSeeded(countryCode, year)) return;
    await this.holidays.seed(countryCode, year, countryPack(countryCode).holidays[year] ?? []);
  }

  private record(actor: Principal, action: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.recordTenant({
      actorType: 'user',
      actorId: actor.subject.id,
      action,
      targetType: 'holiday',
      targetId: id,
      metadata,
    });
  }
}
