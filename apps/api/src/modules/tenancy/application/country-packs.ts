import type { CountryCode, CountryPack } from '@inroster/contracts';
import { indonesiaPack } from '@inroster/country-id';
import { singaporePack } from '@inroster/country-sg';

/** Installed Country Packs. A new country is a new package registered here. */
const PACKS: Record<CountryCode, CountryPack> = { SG: singaporePack, ID: indonesiaPack };

export function countryPack(code: CountryCode): CountryPack {
  return PACKS[code];
}
