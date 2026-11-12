# Plan A — Roster grid, roving, dan siaga

Rencana Tahap A untuk halaman **Jadwal (Roster)**. Tujuannya: perencana bisa melihat dan menyusun
jadwal satu minggu satu site dengan cepat, langsung tahu kekurangan orang dan pelanggaran aturan
sebelum menerbitkan, serta bisa menjadwalkan officer **roving** dan **siaga di rumah**.

Tahap B (alur _Kirim pengganti_, target kunjungan roving, pola rotasi, isi otomatis) ada di bagian
akhir sebagai batas lingkup, bukan bagian dari rencana ini.

---

## 1. Masalah yang diselesaikan

| Sekarang                                                                   | Setelah Tahap A                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Satu kartu per hari; gambaran per orang harus dirangkai sendiri            | Grid **officer × hari**: seminggu terlihat sekaligus               |
| 4–5 ketukan per shift, tanpa salin                                         | Ketuk sel = isi preset; pilih banyak sel; **salin minggu lalu**    |
| Cuti, istirahat pendek, jam berlebih baru ketahuan belakangan (atau tidak) | **Peringatan konflik** di sel sebelum disimpan dan saat terbit     |
| Tidak tahu site kurang orang                                               | **Kebutuhan per site** dan baris _Terisi_ yang memerah bila kurang |
| Shift selalu terikat satu site                                             | **Roving** (per zona) dan **Siaga di rumah** (baris Cadangan)      |

## 2. Konsep baru

### 2.1 Jenis penugasan officer

Atribut karyawan, terpisah dari peran akses:

- **Tetap** — biasa bertugas di satu site (`employees.location_id` yang sudah ada).
- **Roving** — berkeliling di satu **zona**.

Ditambah:

- **Site yang boleh dijaga** — daftar site yang sudah dikenalkan/dilatih. Grid dan saran pengganti
  (Tahap B) hanya menawarkan site ini. Kosong = semua site legal entity-nya (perilaku sekarang).
- **Bisa jadi pengganti** — ya/tidak. Otomatis _ya_ untuk roving. Dipakai Tahap B.

"Cadangan" **bukan** jenis officer: siapa pun bisa siaga pada hari tertentu (lihat 2.4).

### 2.2 Zona

Kumpulan site dalam satu legal entity dan satu zona waktu, mis. _Cluster Jaksel_ = 4 gedung.
Satu site boleh di beberapa zona. Dikelola di menu **Site**.

### 2.3 Shift roving

Shift yang ditugaskan ke **zona**, bukan ke satu site.

- Absen boleh di site mana pun dalam zona (QR + geofence site itu).
- Patroli boleh memindai checkpoint semua site dalam zona.
- Tidak dihitung ke baris _Terisi_ site mana pun; tampil di lajur zona.

### 2.4 Siaga di rumah (on-call)

Jenis shift baru `standby`:

- Ditugaskan ke zona (atau tanpa zona = seluruh legal entity).
- **Tanpa absen dan tanpa alert no-show.**
- Dihitung sebagai **jam siaga**, bukan jam kerja (tidak masuk batas jam mingguan; nanti untuk
  tunjangan siaga di Fase 3).
- Tampil di baris **Cadangan** di grid.

### 2.5 Kebutuhan orang per site

Per site, per **hari dalam seminggu** (Sen–Min), per **slot**: Pagi / Malam (/ Khusus bila perlu),
berupa jumlah orang. Default sama untuk semua hari; bisa diubah per hari (mis. akhir pekan lebih
sedikit). Kosong = tidak ada target (baris _Terisi_ hanya menampilkan jumlah).

## 3. Aturan konflik

Dihitung di server (satu sumber kebenaran) dan dikirim bersama data grid. **Peringatan, bukan
penolakan**, kecuali yang memang sudah ditolak sekarang (tumpang tindih shift, > 24 jam).

| Kode                 | Arti                                                    | Default      | Sumber                           |
| -------------------- | ------------------------------------------------------- | ------------ | -------------------------------- |
| `on_leave`           | Officer cuti disetujui di tanggal itu                   | —            | Modul cuti                       |
| `leave_pending`      | Ada pengajuan cuti menunggu di tanggal itu              | —            | Modul cuti                       |
| `short_rest`         | Jeda dari shift sebelumnya/berikutnya < N jam           | 11 jam       | Kebijakan tenant                 |
| `weekly_hours`       | Jam kerja Senin–Minggu > batas                          | ID 40, SG 44 | Country Pack, bisa diubah tenant |
| `consecutive_nights` | Malam berturut-turut > N                                | 4            | Kebijakan tenant                 |
| `consecutive_days`   | Hari kerja berturut-turut > N                           | 6            | Kebijakan tenant                 |
| `site_not_allowed`   | Site tidak ada di daftar site yang boleh dijaga         | —            | Data karyawan                    |
| `public_holiday`     | Shift jatuh di hari libur nasional (info, untuk lembur) | —            | Kalender libur                   |

Batas jam per negara ditandai **"perlu diverifikasi"** seperti data cuti: nilai awal dari Country
Pack, admin tenant bisa mengubah di pengaturan.

## 4. Perubahan data (migrasi)

| Tabel                            | Perubahan                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `employees`                      | `deployment` text (`fixed`/`roving`, default `fixed`), `can_cover` boolean (default false)                                                                                            |
| `employee_sites` _(baru)_        | (employee_id, location_id) — site yang boleh dijaga                                                                                                                                   |
| `zones` _(baru)_                 | id, legal_entity_id, name, timezone, status                                                                                                                                           |
| `zone_sites` _(baru)_            | (zone_id, location_id)                                                                                                                                                                |
| `shifts`                         | `location_id` jadi nullable; `zone_id` nullable; `kind` tambah `standby`; check: tepat salah satu dari `location_id` / `zone_id` terisi, kecuali `standby` yang boleh keduanya kosong |
| `coverage_requirements` _(baru)_ | location_id, weekday (1–7), slot (`day`/`night`/`custom`), headcount                                                                                                                  |
| `tenant_policies` _(baru)_       | min_rest_hours, max_weekly_hours (per country), max_consecutive_nights, max_consecutive_days                                                                                          |

Semua tabel baru tenant-scoped dengan RLS (`tenantIsolation`). Constraint `shifts_no_overlap`
tetap berlaku, **kecuali** antara `standby` dan shift kerja (officer siaga boleh dipanggil kerja;
pemanggilan diurus Tahap B).

Dampak ke modul yang ada (harus disesuaikan, dengan test):

- **Absensi**: kandidat shift = shift di site itu **atau** shift roving di zona yang memuat site
  itu; `standby` tidak pernah jadi kandidat.
- **No-show monitor (worker)**: abaikan `standby`; roving dicek per shift seperti biasa.
- **Patroli**: shift roving boleh memindai checkpoint site mana pun di zonanya.
- **Cuti**: penarikan shift saat cuti disetujui juga mencakup roving dan standby.
- **Welfare check / patroli terlambat (worker)**: roving ikut; standby tidak.

## 5. API

Semua di modul `scheduling` kecuali disebut lain. Izin mengikuti yang ada
(`schedules.read` / `schedules.manage`, `locations.manage`, `employees.manage`).

| Method         | Path                                       | Isi                                                                                                                                                                              |
| -------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET            | `/tenant/roster/grid?locationId&weekStart` | Satu site, satu minggu: officer (baris), shift per sel, cuti, hari libur, kebutuhan vs terisi per hari/slot, konflik per sel, lajur zona roving yang memuat site, baris Cadangan |
| POST           | `/tenant/shifts/batch`                     | Buat banyak shift sekaligus (multi-pilih sel); hasil per item: dibuat / ditolak + alasan; peringatan konflik dikembalikan                                                        |
| POST           | `/tenant/roster/copy-week`                 | Salin draft+terbit minggu sumber ke minggu target sebagai **draft**; lewati yang bentrok, laporkan yang dilewati                                                                 |
| POST           | `/tenant/roster/check`                     | Hitung konflik untuk usulan shift tanpa menyimpan (dipakai saat memilih sel)                                                                                                     |
| GET/PUT        | `/tenant/locations/:id/coverage`           | Kebutuhan per hari per slot                                                                                                                                                      |
| GET/POST/PATCH | `/tenant/zones`, `/tenant/zones/:id`       | Zona + anggota site (modul `workforce`)                                                                                                                                          |
| PATCH          | `/tenant/employees/:id`                    | Tambah `deployment`, `canCover`, `siteIds` (modul `workforce`)                                                                                                                   |
| GET/PUT        | `/tenant/policies/scheduling`              | Kebijakan jam & istirahat (modul `tenancy`)                                                                                                                                      |

`POST /tenant/shifts` yang ada menerima `zoneId` sebagai ganti `locationId` dan `kind: 'standby'`.
`POST /tenant/roster/publish` juga menerbitkan shift roving/standby yang menyentuh site/zona itu,
dan mengembalikan **ringkasan konflik** yang masih ada (tidak memblokir).

## 6. Tampilan web

### 6.1 Mode

Tombol **Grid | Hari** di halaman Jadwal. Default: _Grid_ di layar ≥ 768 px, _Hari_ (tampilan
sekarang) di HP. Pilihan diingat per perangkat.

### 6.2 Grid minggu

```
Menara Sudirman · 16–22 Nov      [Grid | Hari]   [Salin minggu lalu]   [Terbitkan 12 draft]
               Sen    Sel    Rab    Kam    Jum    Sab*   Min
Kebutuhan     2P 2M  2P 2M  2P 2M  2P 2M  2P 2M  1P 1M  1P 1M     (* = hari libur)
Terisi          ✓    1P ⚠     ✓      ✓      ✓      ✓    0M ⚠
Pak Slamet      P      P      M      M      ·      ·      P
Pak Bambang     M      M      ·      ·    CUTI   CUTI     ·
Bu Rina         P      ·      P      P      M     M ⚠     ·
— Roving · Cluster Jaksel —
Pak Dedi        R      R      ·      R      R      ·      ·
— Cadangan —
Siaga          Andi   Andi   Dedi    ·     Andi    ·      ·
```

- **Baris officer**: yang site utamanya site ini atau pernah dijadwalkan di sini minggu itu,
  ditambah tombol _Tambah officer ke grid_ (dari daftar site yang boleh dijaga).
- **Sel**: chip P / M / K(hh–hh) / R / S; garis putus-putus = draft; titik oranye = ada konflik;
  CUTI terkunci (abu-abu); absen/terlambat untuk hari yang sudah lewat.
- **Ketuk sel kosong** → isi dengan _preset aktif_ (dipilih di bilah atas: P / M / Khusus / Siaga),
  langsung tersimpan sebagai draft. **Ketuk chip** → menu kecil: ganti preset, ubah jam, hapus /
  batalkan.
- **Pilih banyak**: tahan Shift (desktop) atau mode _Pilih_ (HP) → terapkan preset ke semua sel
  terpilih (`/tenant/shifts/batch`).
- **Konflik**: arahkan/ketuk titik oranye → daftar alasan dalam bahasa pengguna.
- **Baris Kebutuhan/Terisi** hanya muncul bila kebutuhan diisi; ketuk → atur kebutuhan.
- **Terbitkan** menampilkan ringkasan konflik sebelum konfirmasi.
- Kolom nama lengket saat menggulir horizontal; target sentuh ≥ 44 px; dua bahasa (ID/EN).

### 6.3 Pengaturan baru

- **Site** → bagian _Kebutuhan orang_ (tabel hari × slot) dan _Zona_.
- **Karyawan** → _Jenis penugasan_, _Site yang boleh dijaga_, _Bisa jadi pengganti_.
- **Akun perusahaan / Pengaturan** → _Kebijakan jadwal_ (istirahat minimal, jam mingguan,
  malam/hari berturut-turut).

## 7. Urutan pengerjaan

Setiap bagian bisa dicoba dan di-commit sendiri.

### A1 — Grid, isi cepat, kebutuhan, konflik, salin minggu

1. Migrasi `coverage_requirements`, `tenant_policies` (+ default dari Country Pack).
2. Mesin konflik (domain murni, unit test tiap aturan) + `GET /tenant/roster/grid`,
   `POST /tenant/roster/check`, `POST /tenant/shifts/batch`, `POST /tenant/roster/copy-week`.
3. Halaman: mode Grid, preset aktif, ketuk-isi, multi-pilih, titik konflik, baris Kebutuhan/Terisi,
   Salin minggu lalu, ringkasan konflik saat terbit.
4. Pengaturan kebutuhan per site dan kebijakan jadwal.

**Selesai bila**: perencana menyusun 7 hari × 4 officer tanpa membuka form per shift; kekurangan
orang dan semua aturan di §3 terlihat sebelum terbit; salin minggu lalu menghasilkan draft yang
benar; tampilan Hari tetap berfungsi.

### A2 — Jenis penugasan, site yang boleh dijaga, zona, roving

1. Migrasi `employees.deployment`, `can_cover`, `employee_sites`, `zones`, `zone_sites`,
   `shifts.zone_id` (+ check constraint).
2. Penyesuaian absensi, patroli, no-show, welfare, cuti untuk shift roving (lihat §4).
3. Halaman: pengaturan karyawan & zona, lajur roving di grid, aturan `site_not_allowed`.

**Selesai bila**: officer roving bisa dijadwalkan ke zona, absen dan patroli di site mana pun dalam
zona, dan muncul di grid semua site anggota zona.

### A3 — Siaga di rumah & baris Cadangan

1. `kind: 'standby'`, pengecualian overlap, pengecualian di absensi/no-show/welfare.
2. Baris Cadangan di grid; jam siaga dipisah dari jam kerja di aturan `weekly_hours`.

**Selesai bila**: siaga dijadwalkan dari grid, tidak memicu alert apa pun, dan tampil sebagai
cadangan per hari.

## 8. Pengujian

- **Unit**: setiap aturan konflik (batas tepat, lintas tengah malam, lintas zona waktu WIB/WITA/SGT,
  minggu Senin–Minggu di zona waktu site).
- **Integrasi (Testcontainers)**: grid per site, batch dengan sebagian gagal, salin minggu dengan
  bentrok, roving absen di site anggota zona dan ditolak di site luar zona, standby tidak memicu
  no-show/welfare, isolasi antar tenant untuk tabel baru.
- **Worker**: no-show/welfare/patroli terlambat mengabaikan standby dan menangani roving.
- **Browser (HP & desktop)**: isi seminggu dengan ketuk, multi-pilih, konflik tampil, salin minggu,
  terbit dengan ringkasan, dua bahasa.

## 9. Keputusan yang sudah diambil

- Kebutuhan orang **per hari dalam seminggu**, default sama setiap hari.
- "Cadangan" = jenis shift **Siaga**, bukan jenis officer; roving otomatis bisa jadi pengganti.
- Siaga di rumah **tanpa absen**, dihitung jam siaga.
- Konflik = **peringatan**, bukan penolakan (kecuali tumpang tindih dan > 24 jam).

## 10. Pertanyaan terbuka

1. Apakah perlu **siaga di pos** (siaga dengan absen, dibayar penuh)? Saat ini cukup dibuat sebagai
   shift kerja biasa (Khusus) di site pos induk.
2. Apakah perencana boleh **menerbitkan dengan konflik** tanpa batas, atau sebagian aturan (mis.
   cuti disetujui) dijadikan penolakan keras?
3. Nilai default kebijakan (11 jam istirahat, 4 malam berturut-turut, 6 hari berturut-turut) —
   sesuaikan dengan praktik perusahaan.

## 11. Di luar lingkup (Tahap B)

- Alur **Kirim pengganti**: saran berurutan (roving di zona → siaga → libur yang memenuhi aturan),
  tawaran Terima/Tolak dengan batas waktu, riwayat penggantian.
- **Target kunjungan roving** per site per shift dan peringatannya.
- **Pola rotasi** (mis. 2P-2M-2L) dan **isi otomatis** berbasis aturan.
- Integrasi **autonomy engine** (L1 saran, L2 tawaran otomatis, L3 penugasan otomatis) di Fase 4.
