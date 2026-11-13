# Plan Fase 3 — Payroll

Lanjutan [Plan A](Plan%20A.md) dan [Plan B](Plan%20B.md). Fase 1–2 dan Tahap A–B menghasilkan data
kerja yang lengkap: shift terbit, absen masuk/pulang beserta keterlambatan, cuti disetujui, hari
libur nasional, shift siaga, dan shift pengganti (`replaces_shift_id`). Fase 3 mengubah data itu
menjadi **gaji yang benar, bisa dijelaskan, dan bisa diaudit**, untuk Indonesia dan Singapura.

Dikerjakan dalam tiga bagian yang masing-masing bisa dicoba dan di-commit sendiri.

> **Catatan regulasi.** Angka dan pasal di dokumen ini adalah titik awal, sama seperti Country
> Pack cuti. Semua tarif disimpan sebagai tabel berlaku-sejak (effective date) di Country Pack dan
> **wajib diverifikasi** dengan regulasi terbaru (PP, PMK, Permenaker, CPF Board, MOM) sebelum
> dipakai untuk membayar orang.

---

## Prinsip

1. **Deterministik dan bisa dijelaskan.** Setiap baris slip gaji menyimpan rumus dan sumbernya
   (shift, absen, cuti). Officer dan HR bisa membuka _"kenapa lembur saya 6 jam?"_ dan melihat
   shift-shift yang membentuknya. Ini juga fondasi Fase 4: agen menjelaskan, bukan menebak.
2. **Uang sebagai bilangan bulat** dalam unit terkecil mata uang (IDR tanpa desimal, SGD dalam
   sen). Pembulatan hanya di titik yang ditentukan aturan, satu kali, dan tercatat.
3. **Aturan negara di Country Pack, kebijakan perusahaan di pengaturan tenant.** Undang-undang
   menetapkan batas minimum; perusahaan boleh lebih baik, tidak boleh lebih buruk. Sistem
   memperingatkan bila kebijakan tenant di bawah ketentuan.
4. **Periode yang disetujui terkunci.** Koreksi setelahnya masuk ke periode berikutnya sebagai
   penyesuaian, tidak mengubah slip yang sudah dibayar.
5. **Pemisahan tugas.** Yang menyiapkan gaji tidak bisa menyetujui gajinya sendiri.

---

## 3A — Data gaji dan lembar waktu

### Profil gaji per karyawan

| Isi                   | Keterangan                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Dasar pembayaran      | `monthly` (bulanan), `daily` (harian), `hourly` (per jam, part-time)                                                                            |
| Upah pokok            | Per bulan / hari / jam sesuai dasar                                                                                                             |
| Tunjangan tetap       | Mis. jabatan, masa kerja: dibayar tetap, ikut dasar lembur (ID)                                                                                 |
| Tunjangan tidak tetap | Mis. makan dan transport **per kehadiran**: dihitung dari absen                                                                                 |
| Riwayat               | Setiap perubahan punya tanggal berlaku; periode dihitung dengan nilai yang berlaku saat itu                                                     |
| Data bayar            | Bank, nomor rekening, nama pemilik (terenkripsi)                                                                                                |
| Data pajak/iuran ID   | NPWP/NIK, status PTKP (TK/0, K/1, …), nomor BPJS Ketenagakerjaan dan Kesehatan (terenkripsi)                                                    |
| Data iuran SG         | Status residensi (Citizen / PR tahun ke-1, 2, 3+ / foreigner), tanggal lahir (kelompok umur CPF), kelompok SHG (CDAC/MBMF/SINDA/ECF), grade PWM |

Data sensitif dienkripsi dengan `FIELD_ENCRYPTION_KEY` (seperti rahasia TOTP), hanya terlihat oleh
izin `payroll.manage`, dan setiap pembacaan penuh tercatat di audit.

### Kebijakan gaji per legal entity

Default dari Country Pack, bisa diubah perusahaan (dengan peringatan bila di bawah ketentuan):

| Kebijakan             | Pilihan                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Siklus dan cut-off    | Bulanan; cut-off mis. tanggal 21–20 (umum di ID) atau 1–akhir bulan; tanggal bayar                      |
| Lembur                | `statutory` (rumus undang-undang) atau `flat` (tarif per jam/shift tetap, dengan cek minimum statutory) |
| Tunjangan siaga       | Per jam siaga atau per shift siaga                                                                      |
| Uang panggil          | Nominal tetap saat officer siaga/libur dipanggil sebagai pengganti (dari `replaces_shift_id`)           |
| Tunjangan malam       | Opsional, per shift malam                                                                               |
| Keterlambatan         | Tanpa potongan / potong per menit / potong per blok; dengan toleransi (grace)                           |
| Tidak hadir (no-show) | Hari tidak dibayar (upah harian), sesuai `daily rate` negara                                            |
| Pembulatan jam kerja  | Ke 15 / 30 menit, ke bawah untuk masuk terlambat dan pulang cepat                                       |

### Lembar waktu (timesheet)

Dihitung dari data yang sudah ada, per shift terbit dalam periode:

| Kolom                    | Sumber                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Jam terjadwal            | `shifts.starts_at/ends_at` (setelah dipotong relief)                                |
| Jam bekerja              | Absen masuk–pulang, dibatasi jadwal, dibulatkan sesuai kebijakan                    |
| Terlambat / pulang cepat | `late_minutes`, selisih pulang terhadap jadwal                                      |
| Tidak hadir              | Shift tanpa absen masuk dan tanpa cuti                                              |
| Hari libur nasional      | `public_holidays` sesuai negara legal entity, per tanggal lokal site                |
| Hari istirahat           | Hari kerja ke-6/7 dalam minggu (pola kerja 5 atau 6 hari diatur per karyawan)       |
| Siaga                    | Shift `standby`: jam siaga                                                          |
| Panggilan                | Shift dengan `replaces_shift_id` milik officer yang saat itu siaga atau libur       |
| Cuti                     | Cuti disetujui: dibayar / tidak dibayar menurut jenis cuti (`paid` di Country Pack) |

**Koreksi supervisor.** Absen pulang yang lupa, jam yang salah, atau hadir tanpa scan bisa
dikoreksi dengan alasan wajib. Nilai asli tetap tersimpan; koreksi dan pelakunya tercatat.
**Kunci lembar waktu** per periode menjadi syarat menghitung gaji.

### Selesai bila

Untuk satu bulan data uji, lembar waktu per officer cocok dengan hitungan manual dari shift,
absen, cuti, dan libur; koreksi tercatat di audit; tidak ada data sensitif yang terlihat tanpa izin.

---

## 3B — Mesin hitung dan periode gaji

### Alur periode gaji

`draft` → `calculated` → `reviewed` → `approved` → `paid`

- **Hitung** bisa diulang selama belum `approved` (mis. setelah koreksi lembar waktu).
- **Penyesuaian** satu kali per karyawan: bonus, kasbon, potongan pinjaman, koreksi periode lalu.
- **Setujui** oleh pemegang `payroll.approve` yang bukan penyiapnya. Setelah itu terkunci.
- **Tandai dibayar** setelah transfer bank; slip terbit ke officer.

### Komponen pendapatan

| Komponen            | Rumus (default)                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Upah pokok          | Bulanan penuh; prorata untuk masuk/keluar di tengah periode; harian × hari hadir; per jam × jam |
| Tunjangan tetap     | Penuh, prorata seperti upah pokok                                                               |
| Tunjangan kehadiran | Nominal × hari hadir                                                                            |
| Lembur              | Lihat aturan negara di bawah                                                                    |
| Kerja di hari libur | Lihat aturan negara                                                                             |
| Tunjangan siaga     | Kebijakan tenant × jam/shift siaga                                                              |
| Uang panggil        | Kebijakan tenant × jumlah panggilan                                                             |
| Tunjangan malam     | Kebijakan tenant × shift malam                                                                  |

Potongan: keterlambatan, tidak hadir, cuti tidak dibayar, penyesuaian, lalu iuran dan pajak.

### Indonesia (Country Pack ID)

- **Upah per jam lembur** = 1/173 × upah sebulan (upah pokok + tunjangan tetap). PP 35/2021.
- **Lembur hari kerja**: jam pertama 1,5×, jam berikutnya 2×.
- **Lembur hari istirahat / libur nasional**: tarif berjenjang menurut pola 5 atau 6 hari kerja
  (2× untuk jam-jam awal, lalu 3× dan 4×). Tabel di Country Pack.
- **Batas lembur** 4 jam/hari dan 18 jam/minggu: diperingatkan, bukan diblokir.
- **Shift 12 jam** dengan batas 40 jam/minggu menghasilkan jam lembur struktural; mesin
  menghitungnya per hari dan per minggu menurut pola kerja karyawan, tanpa menghitung ganda.
- **Upah minimum (UMP/UMK)** per wilayah: tabel per kabupaten/kota dan tahun; site diberi kode
  wilayah. Upah pokok + tunjangan tetap di bawah UMK site utama → peringatan.
- **BPJS Ketenagakerjaan**: JHT, JP (dengan batas upah), JKK (tarif menurut kelompok risiko,
  diatur per legal entity), JKM. **BPJS Kesehatan** (dengan batas upah). Porsi perusahaan dan
  karyawan dipisah di slip.
- **PPh 21**: metode TER bulanan (Januari–November) dan perhitungan setahun di Desember atau saat
  keluar, menurut status PTKP. Gross atau gross-up dipilih per legal entity.
- **THR**: periode khusus; 1 bulan upah untuk masa kerja ≥ 12 bulan, prorata untuk ≥ 1 bulan.

### Singapura (Country Pack SG)

- **Lembur** (Employment Act Part IV, untuk karyawan dalam cakupan): 1,5× upah per jam pokok;
  upah per jam = (12 × upah bulanan pokok) / (52 × 44). Batas jam lembur bulanan diperingatkan.
- **Kerja di hari libur nasional**: tambahan satu hari upah (atau hari pengganti, menurut
  kebijakan). **Hari istirahat**: menurut siapa yang meminta kerja.
- **PWM keamanan**: upah pokok minimum per grade dan tahun; di bawahnya → peringatan.
- **CPF**: tarif per kelompok umur dan status residensi, batas Ordinary Wage bulanan dan
  Additional Wage tahunan; porsi pemberi kerja dan karyawan dipisah.
- **SDL** (Skills Development Levy) dan **SHG** (CDAC/MBMF/SINDA/ECF) menurut tabel.

### Mesin hitung

- Fungsi murni per Country Pack: `computePay(profile, timesheet, policy, period, rates)` →
  baris-baris slip (`code`, `label` dua bahasa, `amount`, `formula`, `sources[]`).
- Tabel tarif berlaku-sejak di Country Pack: perubahan tahunan (UMK, batas BPJS/CPF, TER) cukup
  menambah baris, periode lama tetap dihitung dengan tarif lamanya.
- Diuji dengan **kasus emas**: contoh hitungan resmi/publik dan hitungan manual yang disimpan
  sebagai fixture, dijalankan di CI.

### Selesai bila

Satu periode bisa dihitung, ditinjau, dikoreksi, dihitung ulang, disetujui oleh orang lain, dan
dikunci; setiap baris slip punya rumus dan sumber; kasus emas ID dan SG lolos.

---

## 3C — Slip gaji, pembayaran, dan laporan

- **Slip gaji officer**: di aplikasi (menu _Gaji_) dan PDF, dua bahasa, rincian per baris dengan
  tautan ke shift sumbernya. Push saat slip terbit.
- **File bank**: CSV transfer massal generik dulu; format bank tertentu (mis. BCA, Mandiri,
  DBS/OCBC GIRO) sebagai adaptor menyusul.
- **Laporan**: rekap periode per site dan legal entity (biaya per site untuk penagihan klien),
  rekap BPJS dan PPh 21 (ID), rekap CPF/SDL/SHG (SG), perbandingan antar periode.
- **Ekspor ke sistem lain**: CSV jurnal untuk akuntansi.
- **Uji paralel**: tenant pertama menjalankan Xrostr berdampingan dengan payroll lamanya 1–2 bulan;
  laporan selisih per karyawan membantu menemukan perbedaan aturan sebelum beralih.

### Selesai bila

Officer melihat slip yang sama dengan yang disetujui HR; file bank cocok dengan total periode;
rekap iuran dan pajak cocok dengan slip.

---

## Data

| Tabel                    | Isi                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `pay_profiles`           | Per karyawan, berlaku-sejak: dasar, upah pokok, pola kerja 5/6 hari, data pajak/iuran |
| `pay_profile_allowances` | Tunjangan tetap dan per kehadiran per profil                                          |
| `pay_policies`           | Kebijakan per legal entity (siklus, lembur, siaga, panggil, potongan, pembulatan)     |
| `employee_bank_accounts` | Rekening terenkripsi                                                                  |
| `timesheet_entries`      | Per shift per periode: jam terjadwal/bekerja, terlambat, libur, siaga, panggilan      |
| `timesheet_corrections`  | Nilai asli, nilai koreksi, alasan, pelaku                                             |
| `pay_runs`               | Periode per legal entity: rentang, status, penyiap, penyetuju, waktu                  |
| `payslips`               | Per karyawan per periode: total kotor, potongan, bersih, status                       |
| `payslip_lines`          | Baris: kode, label, jumlah, rumus, sumber                                             |
| `pay_adjustments`        | Penyesuaian satu kali per karyawan per periode                                        |
| `locations.wage_region`  | Kode wilayah UMK (ID) untuk cek upah minimum                                          |

Semua tabel tenant memakai RLS seperti biasa; `payslips` dan `payslip_lines` hanya bisa diubah
selama periodenya belum `approved`.

## Izin

| Izin              | Siapa (default)  | Untuk                                                        |
| ----------------- | ---------------- | ------------------------------------------------------------ |
| `payroll.read`    | HR, Tenant Admin | Melihat periode, slip, laporan                               |
| `payroll.manage`  | HR               | Profil gaji, kebijakan, koreksi lembar waktu, hitung periode |
| `payroll.approve` | Tenant Admin     | Menyetujui periode (bukan penyiapnya)                        |
| _(tanpa izin)_    | Officer          | Slip gajinya sendiri                                         |

Supervisor (`schedules.manage`) boleh mengoreksi lembar waktu site-nya, tidak melihat nominal gaji.

## API (garis besar)

| Method  | Path                                                                 | Izin                                 |
| ------- | -------------------------------------------------------------------- | ------------------------------------ |
| GET/PUT | `/tenant/employees/:id/pay-profile`                                  | `payroll.manage`                     |
| GET/PUT | `/tenant/legal-entities/:id/pay-policy`                              | `payroll.manage`                     |
| GET     | `/tenant/timesheets?legalEntityId=&from=&to=`                        | `payroll.read`                       |
| POST    | `/tenant/timesheets/:entryId/corrections`                            | `schedules.manage`                   |
| POST    | `/tenant/pay-runs` · `/:id/calculate` · `/:id/approve` · `/:id/paid` | `payroll.manage` / `payroll.approve` |
| GET     | `/tenant/pay-runs/:id/payslips` · `/:id/bank-file`                   | `payroll.read`                       |
| GET     | `/me/payslips` · `/me/payslips/:id` (+ PDF)                          | tenant user                          |

---

## Keputusan yang perlu dari Anda sebelum mulai

1. **Siklus dan cut-off** default: bulanan 21–20 atau 1–akhir bulan?
2. **Lembur security di klien Anda**: dihitung statutory per jam, atau tarif flat per shift
   (umum di ID, tetapi perlu cek minimum statutory)?
3. **Bank** pertama untuk file transfer (ID dan SG).
4. **PPh 21**: gross atau gross-up sebagai default?
5. **Tenant uji paralel**: ada perusahaan yang bisa menjalankan payroll lama dan Xrostr
   berdampingan 1–2 bulan?

## Di luar lingkup Fase 3

- Pelaporan langsung ke pemerintah (e-Bupot, SIPP BPJS, CPF EZPay, IRAS AIS): file ekspor dulu,
  integrasi langsung menyusul.
- Pesangon dan penyelesaian akhir hubungan kerja (perhitungan UU Cipta Kerja / PP 35/2021).
- Modul pinjaman karyawan dengan cicilan otomatis (Fase 3 hanya penyesuaian manual).
- Penagihan ke klien (invoice per site) — data biaya per site sudah tersedia dari laporan 3C.
- Otonomi (agen menyiapkan periode gaji, menjelaskan slip) → Fase 4.
