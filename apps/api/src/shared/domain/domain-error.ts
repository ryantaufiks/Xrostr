export type ErrorKind =
  'validation' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'locked';

/** An expected failure, returned as a value. The interface layer maps `kind` to a status. */
export class DomainError {
  constructor(
    readonly kind: ErrorKind,
    /** Stable, machine-readable code clients may branch on, e.g. `mfa_required`. */
    readonly code: string,
    readonly message: string,
    readonly details?: Record<string, unknown>,
  ) {}
}
