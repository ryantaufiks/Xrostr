import { z } from 'zod';

// Shared contract schemas validate in the browser too; show their messages in Indonesian.
z.config(z.locales.id());

/** Indonesian wording for the contracts' custom messages, keyed by field path. */
export const FIELD_MESSAGES: Record<string, string> = {
  slug: 'Gunakan 3–40 huruf kecil, angka, atau tanda hubung.',
  legalEntities: 'Tambahkan minimal satu legal entity.',
};
