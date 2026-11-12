/** SQLSTATE codes the repositories turn into domain outcomes. */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_EXCLUSION_VIOLATION = '23P01';

/** The SQLSTATE of a database error, looking through driver and ORM wrappers. */
export function causeCode(error: unknown): string | undefined {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ('code' in e && typeof e.code === 'string') return e.code;
  }
  return undefined;
}
