import { bilingual } from '../bilingual';

export const attendance = bilingual(
  {
    noGeolocation: 'Perangkat ini tidak bisa membaca lokasi.',
    locationDenied:
      'Izin lokasi ditolak. Izinkan lokasi untuk Xrostr di pengaturan browser, lalu coba lagi.',
    locationUnavailable:
      'Lokasi belum terbaca. Pastikan GPS menyala dan Anda di luar ruangan, lalu coba lagi.',
    incompleteQr: 'QR tidak lengkap. Pindai ulang poster QR di lokasi.',
    locating: 'Membaca lokasi Anda…',
    sending: 'Mencatat absensi…',
    notRecorded: 'Absensi belum tercatat',
    distance: (distance: string, radius: number) => `Jarak Anda ${distance} m · batas ${radius} m`,
    rescan: 'Pindai ulang QR',
    checkedIn: 'Absen masuk tercatat',
    checkedOut: 'Absen pulang tercatat',
    lateBy: (minutes: number) => `Terlambat ${minutes} menit`,
    onTime: 'Tepat waktu',
    backToSchedule: 'Kembali ke jadwal',
    scanTitle: 'Pindai QR',
    close: 'Tutup',
    scanHint: 'Arahkan kamera ke poster QR di lokasi. Absen tercatat otomatis.',
    notXrostrQr: 'Ini bukan QR absensi Xrostr. Arahkan ke poster QR di lokasi.',
    cameraDenied:
      'Kamera tidak bisa dibuka. Izinkan kamera untuk Xrostr di pengaturan browser, lalu coba lagi.',
    noCamera: 'Browser ini tidak bisa membuka kamera.',
    opening: 'Membuka absensi…',
  },
  {
    noGeolocation: 'This device cannot read its location.',
    locationDenied:
      'Location permission denied. Allow location for Xrostr in the browser settings, then try again.',
    locationUnavailable:
      'Location not found yet. Make sure GPS is on and you are outdoors, then try again.',
    incompleteQr: 'Incomplete QR code. Scan the QR poster on site again.',
    locating: 'Reading your location…',
    sending: 'Recording attendance…',
    notRecorded: 'Attendance not recorded',
    distance: (distance: string, radius: number) =>
      `You are ${distance} m away · limit ${radius} m`,
    rescan: 'Scan QR again',
    checkedIn: 'Checked in',
    checkedOut: 'Checked out',
    lateBy: (minutes: number) => `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} late`,
    onTime: 'On time',
    backToSchedule: 'Back to schedule',
    scanTitle: 'Scan QR',
    close: 'Close',
    scanHint: 'Point the camera at the QR poster on site. Attendance is recorded automatically.',
    notXrostrQr: 'This is not an Xrostr attendance QR. Point at the QR poster on site.',
    cameraDenied:
      'The camera could not open. Allow the camera for Xrostr in the browser settings, then try again.',
    noCamera: 'This browser cannot open the camera.',
    opening: 'Opening attendance…',
  },
);
