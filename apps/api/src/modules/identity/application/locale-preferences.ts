import { Injectable } from '@nestjs/common';
import { isLocale, localeForRegion, type Locale, type LocaleSettings } from '@xrostr/contracts';
import { TenantDirectory } from '../../../shared/application/ports.js';
import type { SubjectRef } from '../domain/account.js';
import { AccountRepository } from './ports.js';
import { SubjectScope } from './subject-scope.js';

/**
 * Which language a person reads Xrostr in: their own choice, else their tenant's default
 * (from its data region). Platform admins without a choice default to English.
 * Part of the identity public API, so notifications are written in the reader's language.
 */
@Injectable()
export class LocalePreferences {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly tenants: TenantDirectory,
    private readonly scope: SubjectScope,
  ) {}

  settings(subject: SubjectRef): Promise<LocaleSettings> {
    return this.scope.run(subject, () => this.resolve(subject));
  }

  async set(subject: SubjectRef, locale: Locale | null): Promise<LocaleSettings> {
    return this.scope.run(subject, async () => {
      await this.accounts.setLocale(subject, locale);
      return this.resolve(subject);
    });
  }

  /** A tenant user's language; requires that tenant's unit of work. */
  async ofUser(tenantId: string, userId: string): Promise<Locale> {
    return (await this.resolve({ type: 'user', id: userId, tenantId })).locale;
  }

  private async resolve(subject: SubjectRef): Promise<LocaleSettings> {
    const stored = await this.accounts.localeOf(subject);
    const preferred = isLocale(stored) ? stored : null;
    const fallback = subject.tenantId
      ? localeForRegion(await this.tenants.dataRegion(subject.tenantId))
      : 'en';
    return { locale: preferred ?? fallback, preferred, default: fallback };
  }
}
