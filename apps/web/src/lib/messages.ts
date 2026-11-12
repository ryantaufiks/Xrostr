/** Indonesian wording for the API's stable error codes. Unknown codes fall back to its title. */
const MESSAGES: Record<string, string> = {
  network: 'Tidak dapat terhubung ke server. Periksa koneksi Anda.',
  invalid_credentials: 'Email atau password salah.',
  account_locked:
    'Terlalu banyak percobaan gagal. Akun dikunci sementara, coba lagi dalam 15 menit.',
  mfa_required: 'Masukkan 6 digit kode dari aplikasi authenticator Anda.',
  invalid_mfa_code: 'Kode authenticator salah atau sudah kedaluwarsa.',
  mfa_already_enabled: 'Autentikasi dua faktor sudah aktif.',
  mfa_setup_not_started: 'Mulai ulang pengaturan autentikasi dua faktor.',
  mfa_enrollment_required: 'Aktifkan autentikasi dua faktor terlebih dahulu.',
  invalid_refresh_token: 'Sesi berakhir. Silakan masuk kembali.',
  unauthenticated: 'Silakan masuk untuk melanjutkan.',
  invalid_invite: 'Undangan tidak valid, sudah dipakai, atau kedaluwarsa.',
  platform_only: 'Halaman ini khusus Superadmin.',
  missing_permission: 'Anda tidak memiliki izin untuk tindakan ini.',
  slug_taken: 'Slug sudah dipakai tenant lain.',
  slug_reserved: 'Slug ini dicadangkan sistem. Pilih slug lain.',
  duplicate_legal_entity: 'Nama legal entity tidak boleh sama.',
  invalid_request: 'Periksa kembali isian formulir.',
  rate_limited: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.',
  csrf_rejected: 'Permintaan ditolak. Muat ulang halaman lalu coba lagi.',
  internal: 'Terjadi kesalahan di server. Coba lagi nanti.',
};

export function messageFor(code: string, fallback?: unknown): string {
  return MESSAGES[code] ?? (typeof fallback === 'string' ? fallback : 'Terjadi kesalahan.');
}
