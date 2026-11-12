import type { Locale } from '@xrostr/contracts';

/**
 * One block of interface text in both languages. Indonesian sets the shape and English must
 * match it key for key, so a missing translation fails the build instead of showing up blank.
 */
export function bilingual<T>(id: T, en: NoInfer<T>): Record<Locale, T> {
  return { id, en };
}
