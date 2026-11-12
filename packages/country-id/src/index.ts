import type { CountryPack } from '@inroster/contracts';

export const indonesiaPack: CountryPack = {
  code: 'ID',
  name: 'Indonesia',
  currency: 'IDR',
  currencyMinorUnits: 0,
  defaultTimezone: 'Asia/Jakarta',
  // WIB, WITA, WIT: each site picks its own.
  timezones: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'],
  locale: 'id-ID',
  defaultDataRegion: 'id',
};
