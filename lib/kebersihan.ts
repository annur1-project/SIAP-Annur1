export type KebersihanMode = 'harian' | 'roan_jumat';
export type KebersihanSesi = 'pagi' | 'sore' | 'jumat_pagi';
export type KebersihanStatus = 'terlaksana' | 'tidak_terlaksana';

export interface KebersihanArea {
  id: string;
  nama_area: string;
  deskripsi: string;
  urutan: number;
  aktif: boolean;
  created_at?: string;
}

export interface KebersihanJadwalItem {
  id: string;
  tanggal: string; // YYYY-MM-DD
  mode: KebersihanMode;
  sesi: KebersihanSesi;
  area_id: string;
  area_nama: string;
  santri_id?: string | null;
  santri_nama?: string | null;
  kamar?: string | null;
  status: KebersihanStatus;
  catatan?: string;
  dicatat_oleh?: string;
  created_at?: string;
  updated_at?: string;
}

export function getWibTodayDateStr(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

export function isFridayIso(dateStr: string): boolean {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.getUTCDay() === 5;
}

export function formatTanggalIndoKebersihan(dateStr: string): string {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const hari = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'][dt.getUTCDay()] || '';
  const bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ][(m || 1) - 1] || '';
  return `${hari}, ${d} ${bulan} ${y}`;
}
