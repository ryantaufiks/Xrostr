import { common } from './i18n/messages/common';
import { errors } from './i18n/messages/errors';
import { currentLocale } from './i18n/state';

export function messageFor(code: string, fallback?: unknown): string {
  const locale = currentLocale();
  return errors[locale][code] ?? (typeof fallback === 'string' ? fallback : common[locale].error);
}
