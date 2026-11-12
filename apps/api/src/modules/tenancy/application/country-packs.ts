import type { CountryCode, CountryPack } from '@xrostr/contracts';
import { indonesiaPack } from '@xrostr/country-id';
import { singaporePack } from '@xrostr/country-sg';

/** Installed Country Packs. A new country is a new package registered here. */
const PACKS: Record<CountryCode, CountryPack> = { SG: singaporePack, ID: indonesiaPack };

export function countryPack(code: CountryCode): CountryPack {
  return PACKS[code];
}
