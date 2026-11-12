# Plan B — Pengganti, kunjungan roving, rotasi, dan isi otomatis

Lanjutan [Plan A](Plan%20A.md). Tahap A menyediakan grid, roving, siaga, dan konflik. Tahap B
membuat jadwal **bereaksi**: saat ada kekosongan, sistem mencarikan dan menawarkan pengganti;
officer roving punya target kunjungan; perencana bisa memakai pola rotasi dan saran isi otomatis.

Dikerjakan dalam tiga bagian yang masing-masing bisa dicoba dan di-commit sendiri.

---

## B1 — Kirim pengganti (relief)

### Alur

1. **Kekosongan**: shift terbit di sebuah site yang butuh orang lain — officer tidak datang
   (alert no-show), sakit mendadak, atau supervisor perlu menukar.
2. Supervisor menekan **Cari pengganti** pada shift itu. Sistem menampilkan **calon berurutan**
   beserta alasannya.
3. Supervisor menekan **Kirim tawaran**. Calon pertama menerima push _"Penugasan pengganti:
   Menara Sudirman 20.00–08.00. Terima?"_.
4. **Terima** → shift asli dibatalkan, shift baru terbit untuk pengganti (mulai sekarang bila
   shift sudah berjalan), pengganti bisa langsung absen; supervisor dan officer asli diberi tahu.
5. **Tolak** atau **tidak menjawab** dalam batas waktu (default 15 menit) → tawaran pindah ke
   calon berikutnya otomatis (worker).
6. Daftar habis → permintaan **tidak terisi**, supervisor diberi tahu.

### Urutan calon

| Prioritas | Siapa                                                                    | Kenapa                                        |
| --------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| 1         | Officer **roving** yang sedang bertugas di zona yang memuat site         | Sudah di lapangan, dekat, tanpa biaya panggil |
| 2         | Officer **siaga** (standby) yang jam siaganya mencakup kekosongan        | Memang disiapkan untuk dipanggil              |
| 3         | Officer **libur** yang _bisa jadi pengganti_ atau site utamanya site ini | Memenuhi aturan istirahat                     |

Disaring keluar: tidak aktif, legal entity lain, **cuti disetujui** di tanggal itu, punya shift
kerja yang bertabrakan (kecuali roving prioritas 1), istirahat < 11 jam sebelum/sesudah
(kecuali roving prioritas 1), **tidak terdaftar** untuk site itu (bila punya daftar site).
Peringatan (tidak menyaring): jam mingguan akan melewati batas.

Dalam satu prioritas: lebih sedikit jam kerja minggu itu didahulukan.

### Data

| Tabel                      | Isi                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `relief_requests` _(baru)_ | shift asli, site, jendela waktu, peminta, status `open`/`filled`/`unfilled`/`cancelled`, pengganti & shift baru, batas waktu tawaran       |
| `relief_offers` _(baru)_   | permintaan, officer, urutan, status `queued`/`offered`/`accepted`/`declined`/`expired`/`withdrawn`, waktu ditawarkan, kedaluwarsa, dijawab |
| `shifts`                   | `replaces_shift_id` — shift pengganti menunjuk shift yang digantikan (riwayat & payroll)                                                   |

Satu permintaan terbuka per shift (indeks unik parsial). Menerima tawaran berjalan dalam satu
transaksi dan mengunci baris permintaan, jadi dua officer yang menerima bersamaan tidak bisa sama-sama
menang.

### Saat diterima

- Shift asli → `cancelled` (bila belum dimulai) atau dipotong sampai sekarang (bila sudah berjalan
  dan officer asli sempat absen); shift baru `published`, `replaces_shift_id` terisi.
- Pengganti roving: shift roving-nya dipotong sampai jam mulai penggantian (dia meninggalkan zona).
- Pengganti siaga: shift siaganya tetap (siaga boleh tumpang tindih dengan kerja).

### API

| Method | Path                                                                    | Izin               |
| ------ | ----------------------------------------------------------------------- | ------------------ |
| GET    | `/tenant/shifts/:id/relief/candidates`                                  | `schedules.manage` |
| POST   | `/tenant/shifts/:id/relief` (`employeeIds` berurutan, `timeoutMinutes`) | `schedules.manage` |
| GET    | `/tenant/relief?status=open`                                            | `schedules.read`   |
| POST   | `/tenant/relief/:id/cancel`                                             | `schedules.manage` |
| GET    | `/me/relief`                                                            | tenant user        |
| POST   | `/me/relief/:offerId/accept`, `/me/relief/:offerId/decline`             | tenant user        |

### Worker

`ReliefMonitor` tiap menit: tawaran yang lewat batas → `expired`, tawarkan ke calon berikutnya,
atau tutup sebagai `unfilled` dan beri tahu peminta.

### Web

- Jadwal (tampilan Hari dan grid): shift terbit punya aksi **Cari pengganti** → daftar calon
  dengan alasan → **Kirim tawaran**. Shift yang sedang dicarikan menampilkan status
  _"Menawarkan ke Pak Bambang · berakhir 20.14"_ / _"Digantikan Pak Bambang"_.
- Officer: halaman **Penugasan** (tautan dari push) dengan tombol besar **Terima** / **Tolak**;
  beranda menampilkan tawaran yang menunggu.

### Selesai bila

Satu kekosongan bisa diisi dari tombol sampai pengganti absen, dengan penolakan dan batas waktu
berpindah otomatis, tanpa dua pengganti untuk satu kekosongan.

---

## B2 — Target kunjungan roving

- Per zona per site: **minimal kunjungan per shift** (mis. 2). Kunjungan = absen di site itu atau
  memindai checkpoint patroli site itu, dengan jeda minimal antar kunjungan.
- Tampilan supervisor: per shift roving, site mana yang sudah/belum dikunjungi.
- Worker: peringatan bila sisa waktu shift tidak cukup untuk memenuhi target.
- Bila officer roving ditarik jadi pengganti (B1), site zonanya ditandai **tidak terlayani** sejak
  saat itu.

## B3 — Pola rotasi dan isi otomatis

- **Pola rotasi**: urutan hari, mis. `P P M M L L` (L = libur), diterapkan ke satu officer untuk
  rentang tanggal dan site tertentu → draft lewat batch (semua atau tidak sama sekali).
- **Isi otomatis**: untuk slot di bawah kebutuhan (baris _Terisi_), sistem menyarankan officer
  dengan aturan yang sama seperti urutan calon B1; perencana memilih **Terapkan saran**.
- Menjadi dasar autonomy engine Fase 4: L1 menyarankan, L2 membuat draft sendiri, L3 menerbitkan.

---

## Di luar lingkup

- Tunjangan siaga, uang panggil, dan lembur pengganti → Fase 3 (payroll), memakai
  `replaces_shift_id` dan jam siaga.
- Pengganti lintas legal entity.
