import { bilingual } from '../bilingual';

export const planning = bilingual(
  {
    autofill: 'Isi otomatis',
    autofillTitle: 'Saran isi otomatis',
    autofillHint:
      'Mengisi kekurangan baris Kebutuhan dengan officer yang tidak cuti, terdaftar untuk site ini, cukup istirahat, dan masih di bawah batas jam mingguan. Officer site ini didahulukan.',
    nothingToFill: 'Kebutuhan minggu ini sudah terpenuhi.',
    noStaffing: 'Atur Kebutuhan site dulu agar sistem tahu berapa officer per hari.',
    kinds: { day: 'Pagi', night: 'Malam' } as Record<string, string>,
    weeklyHours: (h: number) => `${h} jam minggu itu`,
    otherSite: 'dari site lain',
    unfilled: (n: number) => `${n} slot tidak bisa diisi tanpa melanggar aturan`,
    stillShort: (n: number) => `kurang ${n}`,
    apply: (n: number) => `Terapkan saran (${n})`,
    applied: (n: number) => `${n} draft dibuat dari saran.`,
    rotation: 'Pola rotasi',
    rotationTitle: 'Terapkan pola rotasi',
    rotationHint:
      'P = pagi, M = malam, L = libur. Pola diulang dari tanggal mulai sampai tanggal selesai sebagai draft; draft officer ini di hari L dihapus. Hari cuti dan shift yang sudah terbit dilewati.',
    officer: 'Officer',
    pattern: 'Pola',
    custom: 'Pola sendiri',
    patternLetters: 'Huruf pola',
    invalidPattern: 'Gunakan huruf P, M, atau L.',
    needsWork: 'Pola perlu minimal satu hari kerja.',
    startAt: 'Tanggal mulai jatuh pada',
    step: (i: number, label: string) => `Langkah ${i} (${label})`,
    from: 'Mulai',
    to: 'Selesai',
    preview: 'Pratinjau',
    applyRotation: 'Buat draft',
    rotationDone: (created: number, skipped: number) =>
      skipped > 0
        ? `${created} draft dibuat, ${skipped} hari dilewati.`
        : `${created} draft dibuat.`,
    stepLetters: { day: 'P', night: 'M', off: 'L' } as Record<string, string>,
  },
  {
    autofill: 'Auto-fill',
    autofillTitle: 'Auto-fill suggestions',
    autofillHint:
      'Fills what the Need row is short of with officers who are not on leave, are cleared for this site, have had enough rest, and are under the weekly hours limit. Officers based here come first.',
    nothingToFill: 'This week’s needs are already met.',
    noStaffing: 'Set the site’s Need first so the system knows how many officers each day needs.',
    kinds: { day: 'Day', night: 'Night' } as Record<string, string>,
    weeklyHours: (h: number) => `${h} h that week`,
    otherSite: 'from another site',
    unfilled: (n: number) =>
      `${n} slot${n === 1 ? '' : 's'} cannot be filled without breaking a rule`,
    stillShort: (n: number) => `${n} short`,
    apply: (n: number) => `Apply suggestions (${n})`,
    applied: (n: number) => `${n} draft${n === 1 ? '' : 's'} created from suggestions.`,
    rotation: 'Rotation',
    rotationTitle: 'Apply a rotation pattern',
    rotationHint:
      'D = day, N = night, O = off. The pattern repeats from the start date to the end date as drafts; this officer’s drafts on O days are removed. Leave days and published shifts are skipped.',
    officer: 'Officer',
    pattern: 'Pattern',
    custom: 'Custom pattern',
    patternLetters: 'Pattern letters',
    invalidPattern: 'Use the letters D, N or O.',
    needsWork: 'A pattern needs at least one working day.',
    startAt: 'The start date falls on',
    step: (i: number, label: string) => `Step ${i} (${label})`,
    from: 'Start',
    to: 'End',
    preview: 'Preview',
    applyRotation: 'Create drafts',
    rotationDone: (created: number, skipped: number) =>
      skipped > 0
        ? `${created} draft${created === 1 ? '' : 's'} created, ${skipped} day${skipped === 1 ? '' : 's'} skipped.`
        : `${created} draft${created === 1 ? '' : 's'} created.`,
    stepLetters: { day: 'D', night: 'N', off: 'O' } as Record<string, string>,
  },
);
