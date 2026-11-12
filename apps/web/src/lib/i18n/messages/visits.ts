import { bilingual } from '../bilingual';

export const visits = bilingual(
  {
    title: 'Kunjungan roving',
    description: 'Kunjungan officer roving ke tiap site di zonanya, dibanding target per shift.',
    empty: 'Tidak ada shift roving di tanggal ini.',
    previousDay: 'Hari sebelumnya',
    nextDay: 'Hari berikutnya',
    today: 'Hari ini',
    phases: { upcoming: 'Belum mulai', running: 'Berjalan', ended: 'Selesai' } as Record<
      string,
      string
    >,
    notCheckedIn: 'Belum absen masuk',
    checkedInAt: (time: string) => `Absen masuk ${time}`,
    count: (done: number, target: number) => `${done}/${target}`,
    countNoTarget: (done: number) => `${done} kunjungan`,
    lastVisit: (time: string) => `terakhir ${time}`,
    neverVisited: 'belum dikunjungi',
    states: {
      met: 'Tercapai',
      pending: 'Belum',
      behind: 'Tertinggal',
      missed: 'Tidak tercapai',
      unserved: 'Tidak terlayani',
      none: 'Tanpa target',
    } as Record<string, string>,
    unserved: (time: string, site: string) =>
      `Zona tidak terlayani sejak ${time}: officer ditarik menjadi pengganti di ${site}.`,
    gap: (minutes: number) => `Jeda antar kunjungan ${minutes} menit`,
    // Zone targets editor
    targetsTitle: 'Target kunjungan',
    targetsHint:
      'Minimal kunjungan per shift roving untuk tiap site. Absen, pindai QR site, atau pindai checkpoint patroli dihitung sebagai kunjungan.',
    gapLabel: 'Jeda minimal antar kunjungan',
    minutes: (n: number) => `${n} menit`,
    perShift: (n: number) => (n === 0 ? 'Tanpa target' : `${n}× per shift`),
    editTargets: 'Atur target',
    saveTargets: 'Simpan target',
    saved: 'Target kunjungan disimpan.',
    viewVisits: 'Lihat kunjungan roving',
    // Check-in page
    visitRecorded: 'Kunjungan tercatat',
    visitHint: 'Shift roving Anda masih berjalan. Pindai QR site lain saat tiba di sana.',
    endShift: 'Akhiri shift di sini (absen pulang)',
  },
  {
    title: 'Roving visits',
    description:
      "Roving officers' visits to each site of their zone, against the per-shift target.",
    empty: 'No roving shifts on this date.',
    previousDay: 'Previous day',
    nextDay: 'Next day',
    today: 'Today',
    phases: { upcoming: 'Not started', running: 'Running', ended: 'Ended' } as Record<
      string,
      string
    >,
    notCheckedIn: 'Not checked in',
    checkedInAt: (time: string) => `Checked in ${time}`,
    count: (done: number, target: number) => `${done}/${target}`,
    countNoTarget: (done: number) => `${done} ${done === 1 ? 'visit' : 'visits'}`,
    lastVisit: (time: string) => `last ${time}`,
    neverVisited: 'not visited yet',
    states: {
      met: 'Met',
      pending: 'Pending',
      behind: 'Behind',
      missed: 'Missed',
      unserved: 'Unserved',
      none: 'No target',
    } as Record<string, string>,
    unserved: (time: string, site: string) =>
      `Zone unserved since ${time}: the officer was pulled to relieve at ${site}.`,
    gap: (minutes: number) => `${minutes} minutes between visits`,
    targetsTitle: 'Visit targets',
    targetsHint:
      'Minimum visits per roving shift for each site. Checking in, scanning the site QR or a patrol checkpoint counts as a visit.',
    gapLabel: 'Minimum time between visits',
    minutes: (n: number) => `${n} minutes`,
    perShift: (n: number) => (n === 0 ? 'No target' : `${n}× per shift`),
    editTargets: 'Set targets',
    saveTargets: 'Save targets',
    saved: 'Visit targets saved.',
    viewVisits: 'View roving visits',
    visitRecorded: 'Visit recorded',
    visitHint: 'Your roving shift is still running. Scan the next site’s QR when you get there.',
    endShift: 'End my shift here (check out)',
  },
);
