import { supabase } from '@/lib/supabase';

export type DapurShift = 'pagi' | 'sore';
export type StatusWaktuMasak = 'belum_mulai' | 'sedang_masak' | 'tepat_waktu' | 'terlambat';
export type StatusAbsenPetugas = 'hadir' | 'izin' | 'sakit' | 'alpha';
export type JenisKasDapur = 'masuk' | 'keluar';
export type DominansiShift =
  | 'Dominan Pagi'
  | 'Dominan Sore'
  | 'Seimbang'
  | 'Tidak Ada Kehadiran'
  | 'Belum Terlihat';
export type StatusDisiplinPetugas = 'Teladan' | 'Cukup' | 'Perlu Pembinaan' | 'Belum Ada Data';

export interface DapurSesiMasak {
  id: string;
  tanggal: string; // YYYY-MM-DD
  shift: DapurShift;
  target_selesai: '05:45' | '16:45';
  started_at: string | null; // ISO timestamp
  finished_at: string | null; // ISO timestamp
  durasi_menit: number;
  status_waktu: StatusWaktuMasak;
  selisih_menit: number; // > 0 berarti terlambat X menit, <= 0 berarti tepat waktu / lebih cepat
  menu_ringkas: string;
  petugas_pj: string;
  catatan: string;
  created_at?: string;
}

export interface DapurMenuJadwal {
  id: string;
  tanggal: string; // YYYY-MM-DD
  shift: DapurShift;
  menu_utama: string;
  sayur_pendamping: string;
  lauk_tambahan: string;
  estimasi_porsi: number;
  catatan_belanja: string;
  created_at?: string;
}

export interface DapurPetugas {
  id: string;
  nama: string;
  divisi: string;
  jabatan: string;
  no_wa: string;
  sumber: 'pengurus' | 'lokal';
  aktif: boolean;
  created_at?: string;
}

export interface DapurAbsenPetugas {
  id: string;
  tanggal: string; // YYYY-MM-DD
  shift: DapurShift;
  petugas_id: string;
  petugas_nama: string;
  status: StatusAbsenPetugas;
  jam_catat: string; // HH:mm
  keterangan: string;
  created_at?: string;
}

export interface DapurKasItem {
  id: string;
  tanggal: string; // YYYY-MM-DD
  jenis: JenisKasDapur;
  kategori: string;
  uraian: string;
  nominal: number;
  penanggung_jawab: string;
  catatan: string;
  created_at?: string;
}

export type TipeBukuMasak = 'jatah_harian' | 'belanja_pagi' | 'belanja_sore' | 'subsidi_jualan_malam';
export type TipeJualanMalam = 'omzet_jualan' | 'modal_belanja' | 'subsidi_ke_masak';

export interface DapurBukuMasakItem {
  id: string;
  tanggal: string; // YYYY-MM-DD
  tipe: TipeBukuMasak;
  arah: 'masuk' | 'keluar';
  nominal: number;
  uraian: string;
  penanggung_jawab: string;
  catatan: string;
  created_at?: string;
}

export interface DapurJualanMalamItem {
  id: string;
  tanggal: string; // YYYY-MM-DD
  tipe: TipeJualanMalam;
  arah: 'masuk' | 'keluar';
  nominal: number;
  uraian: string;
  penanggung_jawab: string;
  catatan: string;
  linked_masak_id?: string | null;
  created_at?: string;
}

export interface CookingTimelinessStats {
  totalSelesai: number;
  tepatWaktuCount: number;
  terlambatCount: number;
  persenTepatWaktu: number | null;
  pagiSelesai: number;
  pagiTepatWaktu: number;
  pagiTerlambat: number;
  persenPagi: number | null;
  soreSelesai: number;
  soreTepatWaktu: number;
  soreTerlambat: number;
  persenSore: number | null;
  avgDurasiMenit: number;
  avgTerlambatMenit: number;
  shiftLebihSeringTelat: 'pagi' | 'sore' | 'seimbang' | null;
}

export interface PetugasRekapItem {
  petugasId: string;
  nama: string;
  jabatan: string;
  noWa: string;
  totalTercatat: number;
  totalPagiTercatat: number;
  totalSoreTercatat: number;
  hadirPagi: number;
  hadirSore: number;
  totalHadir: number;
  izin: number;
  sakit: number;
  alpha: number;
  persenHadirTotal: number | null;
  persenHadirPagi: number | null;
  persenHadirSore: number | null;
  dominansi: DominansiShift;
  dominansiDetail: string;
  statusDisiplin: StatusDisiplinPetugas;
  alasanPembinaan: string[];
}

export interface AnalisisOtomatisDapur {
  totalPetugasAktif: number;
  totalCatatanAbsen: number;
  rataHadirKeseluruhan: number | null;
  rataHadirPagi: number | null;
  rataHadirSore: number | null;
  dominanPagiList: PetugasRekapItem[];
  dominanSoreList: PetugasRekapItem[];
  seimbangList: PetugasRekapItem[];
  teladanList: PetugasRekapItem[];
  perluPembinaanList: PetugasRekapItem[];
  summaryBullets: string[];
}

export const SHIFT_TARGET_TIME: Record<DapurShift, '05:45' | '16:45'> = {
  pagi: '05:45',
  sore: '16:45',
};

export const DEFAULT_JATAH_MASAK_HARIAN = 250000;

export const LS_DAPUR_SESI_KEY = 'siap_dapur_sesi_v1';
export const LS_DAPUR_MENU_KEY = 'siap_dapur_menu_v1';
export const LS_DAPUR_PETUGAS_KEY = 'siap_dapur_petugas_v1';
export const LS_DAPUR_ABSEN_KEY = 'siap_dapur_absen_v1';
export const LS_DAPUR_KAS_KEY = 'siap_dapur_kas_v1';
export const LS_DAPUR_BUKU_MASAK_KEY = 'eannur_dapur_buku_masak_v1';
export const LS_DAPUR_JUALAN_MALAM_KEY = 'eannur_dapur_jualan_malam_v1';

export const KATEGORI_KAS_MASUK = [
  'Dropping Dana Pondok',
  'Tambahan Kas Dapur',
  'Dana Konsumsi Kegiatan',
  'Lainnya',
];

export const KATEGORI_KAS_KELUAR = [
  'Belanja Bahan Pokok (Beras/Minyak)',
  'Belanja Sayur & Lauk Harian',
  'Bumbu Dapur & Pelengkap',
  'Gas LPG & Operasional Dapur',
  'Perlengkapan / Alat Masak',
  'Lainnya',
];

export function computeBukuMasakSummary(rows: DapurBukuMasakItem[], tanggal?: string) {
  const sortedAsc = [...rows].sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });

  let saldo = 0;
  let totalJatah = 0;
  let totalSubsidiMasuk = 0;
  let totalBelanjaPagi = 0;
  let totalBelanjaSore = 0;
  let jatahHariIni = 0;
  let belanjaHariIni = 0;

  const withBalance: Array<DapurBukuMasakItem & { saldoBerjalan: number }> = [];
  for (const row of sortedAsc) {
    const nom = Number(row.nominal || 0);
    saldo += row.arah === 'masuk' ? nom : -nom;
    if (row.tipe === 'jatah_harian') totalJatah += nom;
    if (row.tipe === 'subsidi_jualan_malam') totalSubsidiMasuk += nom;
    if (row.tipe === 'belanja_pagi') totalBelanjaPagi += nom;
    if (row.tipe === 'belanja_sore') totalBelanjaSore += nom;

    if (tanggal && row.tanggal === tanggal) {
      if (row.tipe === 'jatah_harian') jatahHariIni += nom;
      if (row.tipe === 'belanja_pagi' || row.tipe === 'belanja_sore') belanjaHariIni += nom;
    }

    withBalance.push({ ...row, saldoBerjalan: saldo });
  }

  return {
    ascWithBalance: withBalance,
    saldoAkhir: saldo,
    isMinus: saldo < 0,
    kekurangan: saldo < 0 ? Math.abs(saldo) : 0,
    totalJatah,
    totalSubsidiMasuk,
    totalBelanjaPagi,
    totalBelanjaSore,
    totalBelanjaSemua: totalBelanjaPagi + totalBelanjaSore,
    jatahHariIni,
    belanjaHariIni,
  };
}

export function computeJualanMalamSummary(rows: DapurJualanMalamItem[], tanggal?: string) {
  const sortedAsc = [...rows].sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });

  let saldoAkhir = 0;
  let totalOmzet = 0;
  let totalModal = 0;
  let totalSubsidiKeluar = 0;
  let omzetHariIni = 0;
  let modalHariIni = 0;

  const withBalance: Array<DapurJualanMalamItem & { saldoBerjalan: number }> = [];
  for (const row of sortedAsc) {
    const nom = Number(row.nominal || 0);
    saldoAkhir += row.arah === 'masuk' ? nom : -nom;
    if (row.tipe === 'omzet_jualan') totalOmzet += nom;
    if (row.tipe === 'modal_belanja') totalModal += nom;
    if (row.tipe === 'subsidi_ke_masak') totalSubsidiKeluar += nom;

    if (tanggal && row.tanggal === tanggal) {
      if (row.tipe === 'omzet_jualan') omzetHariIni += nom;
      if (row.tipe === 'modal_belanja') modalHariIni += nom;
    }

    withBalance.push({ ...row, saldoBerjalan: saldoAkhir });
  }

  const labaBersihTotal = totalOmzet - totalModal;
  return {
    ascWithBalance: withBalance,
    saldoAkhir,
    totalOmzet,
    totalModal,
    totalSubsidiKeluar,
    labaBersihTotal,
    omzetHariIni,
    modalHariIni,
    labaHariIni: omzetHariIni - modalHariIni,
  };
}

export const DAPUR_TABLES_SQL = `CREATE TABLE IF NOT EXISTS dapur_sesi_masak (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tanggal date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('pagi', 'sore')),
  target_selesai text NOT NULL DEFAULT '05:45',
  started_at timestamptz,
  finished_at timestamptz,
  durasi_menit integer NOT NULL DEFAULT 0,
  status_waktu text NOT NULL DEFAULT 'belum_mulai',
  selisih_menit integer NOT NULL DEFAULT 0,
  menu_ringkas text DEFAULT '',
  petugas_pj text DEFAULT '',
  catatan text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dapur_menu_jadwal (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tanggal date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('pagi', 'sore')),
  menu_utama text NOT NULL,
  sayur_pendamping text DEFAULT '',
  lauk_tambahan text DEFAULT '',
  estimasi_porsi integer NOT NULL DEFAULT 250,
  catatan_belanja text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dapur_petugas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nama text NOT NULL,
  divisi text DEFAULT 'Sie Konsumsi / Dapur',
  jabatan text DEFAULT 'Petugas Dapur',
  no_wa text DEFAULT '',
  sumber text DEFAULT 'lokal',
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dapur_absen_petugas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tanggal date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('pagi', 'sore')),
  petugas_id text NOT NULL,
  petugas_nama text NOT NULL,
  status text NOT NULL CHECK (status IN ('hadir', 'izin', 'sakit', 'alpha')),
  jam_catat text DEFAULT '',
  keterangan text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dapur_kas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tanggal date NOT NULL,
  jenis text NOT NULL CHECK (jenis IN ('masuk', 'keluar')),
  kategori text NOT NULL,
  uraian text NOT NULL,
  nominal integer NOT NULL DEFAULT 0,
  penanggung_jawab text DEFAULT '',
  catatan text DEFAULT '',
  created_at timestamptz DEFAULT now()
);`;

export function createDapurId(prefix = 'dpr'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isMissingRelationError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code?: unknown }).code || '') : '';
  const msg = 'message' in err ? String((err as { message?: unknown }).message || '') : '';
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('Could not find the table') ||
    msg.includes('does not exist')
  );
}

export function extractSupabaseError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
  }
  return fallback;
}

export function getLocalTodayStr(d = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function addDaysIso(isoDate: string, deltaDays: number): string {
  const parts = isoDate.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3) return isoDate;
  const dt = new Date(parts[0], parts[1] - 1, parts[2] + deltaDays);
  return getLocalTodayStr(dt);
}

export function getWeekRangeMondayToSunday(anchorIso: string): string[] {
  const parts = anchorIso.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3) return [];
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  const day = dt.getDay(); // 0 = Sunday, 1 = Monday ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(parts[0], parts[1] - 1, parts[2] + diffToMonday);
  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const cur = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    days.push(getLocalTodayStr(cur));
  }
  return days;
}

export function formatHariTanggalIndo(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3) return dateStr;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  const hari = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return `${hari[dt.getDay()]}, ${parts[2]} ${bulan[parts[1] - 1] || parts[1]} ${parts[0]}`;
}

export function formatTanggalPendek(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3) return dateStr;
  const bulanPendek = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ];
  return `${parts[2]} ${bulanPendek[parts[1] - 1] || parts[1]} ${parts[0]}`;
}

export function formatTimeClock(isoStr?: string | null, withSeconds = true): string {
  if (!isoStr) return '--:--';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '--:--';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (!withSeconds) return `${hh}:${mm}`;
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatElapsedHms(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatRupiah(nominal: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(nominal || 0);
}

export function getShiftDeadlineDate(tanggalIso: string, shift: DapurShift): Date {
  const parts = tanggalIso.split('-').map((n) => parseInt(n, 10));
  const now = new Date();
  const y = parts.length === 3 ? parts[0] : now.getFullYear();
  const m = parts.length === 3 ? parts[1] - 1 : now.getMonth();
  const d = parts.length === 3 ? parts[2] : now.getDate();
  const hour = shift === 'pagi' ? 5 : 16;
  return new Date(y, m, d, hour, 45, 0, 0);
}

export function evaluateCookingCompletion(
  tanggal: string,
  shift: DapurShift,
  startedAtIso: string,
  finishedAtIso: string
): {
  target_selesai: '05:45' | '16:45';
  durasi_menit: number;
  status_waktu: 'tepat_waktu' | 'terlambat';
  selisih_menit: number;
} {
  const startMs = new Date(startedAtIso).getTime();
  const finishMs = new Date(finishedAtIso).getTime();
  const deadlineMs = getShiftDeadlineDate(tanggal, shift).getTime();
  const durasi_menit = Number.isNaN(startMs)
    ? 0
    : Math.max(0, Math.round((finishMs - startMs) / 60000));

  if (finishMs <= deadlineMs) {
    const aheadMin = Math.floor((deadlineMs - finishMs) / 60000);
    return {
      target_selesai: SHIFT_TARGET_TIME[shift],
      durasi_menit,
      status_waktu: 'tepat_waktu',
      selisih_menit: aheadMin > 0 ? -aheadMin : 0,
    };
  }

  const lateMin = Math.max(1, Math.ceil((finishMs - deadlineMs) / 60000));
  return {
    target_selesai: SHIFT_TARGET_TIME[shift],
    durasi_menit,
    status_waktu: 'terlambat',
    selisih_menit: lateMin,
  };
}

export function computeCookingTimelinessStats(
  sessions: DapurSesiMasak[],
  periodPrefix?: string
): CookingTimelinessStats {
  const finished = sessions.filter((s) => {
    const isFinished = s.status_waktu === 'tepat_waktu' || s.status_waktu === 'terlambat';
    if (!isFinished) return false;
    if (periodPrefix && !(s.tanggal || '').startsWith(periodPrefix)) return false;
    return true;
  });

  const pagi = finished.filter((s) => s.shift === 'pagi');
  const sore = finished.filter((s) => s.shift === 'sore');

  const tepatWaktuCount = finished.filter((s) => s.status_waktu === 'tepat_waktu').length;
  const terlambatCount = finished.length - tepatWaktuCount;

  const pagiTepatWaktu = pagi.filter((s) => s.status_waktu === 'tepat_waktu').length;
  const pagiTerlambat = pagi.length - pagiTepatWaktu;

  const soreTepatWaktu = sore.filter((s) => s.status_waktu === 'tepat_waktu').length;
  const soreTerlambat = sore.length - soreTepatWaktu;

  const totalDurasi = finished.reduce((sum, s) => sum + Number(s.durasi_menit || 0), 0);
  const lateItems = finished.filter((s) => s.status_waktu === 'terlambat');
  const totalLateMin = lateItems.reduce((sum, s) => sum + Math.max(0, Number(s.selisih_menit || 0)), 0);

  const persenTepatWaktu =
    finished.length > 0 ? Math.round((tepatWaktuCount / finished.length) * 100) : null;
  const persenPagi = pagi.length > 0 ? Math.round((pagiTepatWaktu / pagi.length) * 100) : null;
  const persenSore = sore.length > 0 ? Math.round((soreTepatWaktu / sore.length) * 100) : null;

  let shiftLebihSeringTelat: 'pagi' | 'sore' | 'seimbang' | null = null;
  if (pagi.length > 0 && sore.length > 0 && (pagiTerlambat > 0 || soreTerlambat > 0)) {
    const pRate = pagiTerlambat / pagi.length;
    const sRate = soreTerlambat / sore.length;
    if (pRate > sRate + 0.05) shiftLebihSeringTelat = 'pagi';
    else if (sRate > pRate + 0.05) shiftLebihSeringTelat = 'sore';
    else shiftLebihSeringTelat = 'seimbang';
  } else if (pagiTerlambat > 0 && soreTerlambat === 0) {
    shiftLebihSeringTelat = 'pagi';
  } else if (soreTerlambat > 0 && pagiTerlambat === 0) {
    shiftLebihSeringTelat = 'sore';
  }

  return {
    totalSelesai: finished.length,
    tepatWaktuCount,
    terlambatCount,
    persenTepatWaktu,
    pagiSelesai: pagi.length,
    pagiTepatWaktu,
    pagiTerlambat,
    persenPagi,
    soreSelesai: sore.length,
    soreTepatWaktu,
    soreTerlambat,
    persenSore,
    avgDurasiMenit: finished.length > 0 ? Math.round(totalDurasi / finished.length) : 0,
    avgTerlambatMenit: lateItems.length > 0 ? Math.round(totalLateMin / lateItems.length) : 0,
    shiftLebihSeringTelat,
  };
}

export function computePetugasAnalytics(
  petugasList: DapurPetugas[],
  absenList: DapurAbsenPetugas[],
  periodPrefix?: string
): {
  rekap: PetugasRekapItem[];
  analisis: AnalisisOtomatisDapur;
} {
  const filteredAbsen = absenList.filter((a) =>
    periodPrefix ? (a.tanggal || '').startsWith(periodPrefix) : true
  );

  // Gabungkan master petugas aktif + siapa saja yang muncul di log absen periode ini
  const personMap = new Map<string, { id: string; nama: string; jabatan: string; noWa: string }>();
  for (const p of petugasList) {
    if (p.aktif !== false) {
      personMap.set(p.id, {
        id: p.id,
        nama: p.nama,
        jabatan: p.jabatan || 'Petugas Dapur',
        noWa: p.no_wa || '',
      });
    }
  }
  for (const a of filteredAbsen) {
    if (!personMap.has(a.petugas_id)) {
      personMap.set(a.petugas_id, {
        id: a.petugas_id,
        nama: a.petugas_nama || 'Petugas Dapur',
        jabatan: 'Petugas Dapur',
        noWa: '',
      });
    }
  }

  let totalAllRecords = 0;
  let totalAllHadir = 0;
  let totalPagiRecords = 0;
  let totalPagiHadir = 0;
  let totalSoreRecords = 0;
  let totalSoreHadir = 0;

  const rekap: PetugasRekapItem[] = [];

  for (const person of personMap.values()) {
    const logs = filteredAbsen.filter(
      (a) => a.petugas_id === person.id || a.petugas_nama.toLowerCase() === person.nama.toLowerCase()
    );
    // Deduplicate by petugas_id match priority if same id
    const seenKeys = new Set<string>();
    const uniqueLogs: DapurAbsenPetugas[] = [];
    for (const l of logs) {
      const k = `${l.tanggal}_${l.shift}`;
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        uniqueLogs.push(l);
      }
    }

    let hadirPagi = 0;
    let hadirSore = 0;
    let totalPagiTercatat = 0;
    let totalSoreTercatat = 0;
    let izin = 0;
    let sakit = 0;
    let alpha = 0;

    for (const l of uniqueLogs) {
      if (l.shift === 'pagi') {
        totalPagiTercatat += 1;
        if (l.status === 'hadir') hadirPagi += 1;
      } else {
        totalSoreTercatat += 1;
        if (l.status === 'hadir') hadirSore += 1;
      }
      if (l.status === 'izin') izin += 1;
      else if (l.status === 'sakit') sakit += 1;
      else if (l.status === 'alpha') alpha += 1;
    }

    const totalTercatat = uniqueLogs.length;
    const totalHadir = hadirPagi + hadirSore;

    totalAllRecords += totalTercatat;
    totalAllHadir += totalHadir;
    totalPagiRecords += totalPagiTercatat;
    totalPagiHadir += hadirPagi;
    totalSoreRecords += totalSoreTercatat;
    totalSoreHadir += hadirSore;

    const persenHadirTotal =
      totalTercatat > 0 ? Math.round((totalHadir / totalTercatat) * 100) : null;
    const persenHadirPagi =
      totalPagiTercatat > 0 ? Math.round((hadirPagi / totalPagiTercatat) * 100) : null;
    const persenHadirSore =
      totalSoreTercatat > 0 ? Math.round((hadirSore / totalSoreTercatat) * 100) : null;

    // Klasifikasi Dominansi Shift
    let dominansi: DominansiShift = 'Belum Terlihat';
    let dominansiDetail = 'Belum ada catatan hadir';

    if (totalTercatat === 0) {
      dominansi = 'Belum Terlihat';
      dominansiDetail = 'Belum ada catatan absen';
    } else if (totalHadir === 0) {
      dominansi = 'Tidak Ada Kehadiran';
      dominansiDetail = `0 hadir dari ${totalTercatat} sesi`;
    } else {
      dominansiDetail = `Pagi ${hadirPagi}x · Sore ${hadirSore}x`;
      const ratioPagi = hadirPagi / totalHadir;
      const ratioSore = hadirSore / totalHadir;
      const rateDiffPagi =
        persenHadirPagi !== null && persenHadirSore !== null
          ? persenHadirPagi - persenHadirSore
          : 0;

      if (
        (hadirPagi - hadirSore >= 2 && ratioPagi >= 0.6) ||
        (hadirPagi >= 2 && hadirSore === 0) ||
        (totalPagiTercatat >= 2 && totalSoreTercatat >= 2 && rateDiffPagi >= 25)
      ) {
        dominansi = 'Dominan Pagi';
      } else if (
        (hadirSore - hadirPagi >= 2 && ratioSore >= 0.6) ||
        (hadirSore >= 2 && hadirPagi === 0) ||
        (totalPagiTercatat >= 2 && totalSoreTercatat >= 2 && rateDiffPagi <= -25)
      ) {
        dominansi = 'Dominan Sore';
      } else if (totalHadir >= 2 || totalTercatat >= 2) {
        dominansi = 'Seimbang';
      }
    }

    // Deteksi Kedisiplinan & Alasan Pembinaan ("petugas nakal / pilih-pilih shift / bolos")
    const alasanPembinaan: string[] = [];
    if (alpha >= 2) {
      alasanPembinaan.push(`Alpha ${alpha}x tanpa keterangan`);
    }
    if (persenHadirTotal !== null && persenHadirTotal < 70 && totalTercatat >= 2) {
      alasanPembinaan.push(`Kehadiran rendah (${persenHadirTotal}%)`);
    }
    if (
      totalPagiTercatat >= 2 &&
      persenHadirPagi !== null &&
      persenHadirPagi < 50 &&
      (persenHadirSore === null || persenHadirSore - persenHadirPagi >= 25)
    ) {
      alasanPembinaan.push(`Jarang hadir Shift Pagi (${persenHadirPagi}%)`);
    }
    if (
      totalSoreTercatat >= 2 &&
      persenHadirSore !== null &&
      persenHadirSore < 50 &&
      (persenHadirPagi === null || persenHadirPagi - persenHadirSore >= 25)
    ) {
      alasanPembinaan.push(`Jarang hadir Shift Sore (${persenHadirSore}%)`);
    }

    let statusDisiplin: StatusDisiplinPetugas = 'Belum Ada Data';
    if (totalTercatat > 0) {
      if (alasanPembinaan.length > 0) {
        statusDisiplin = 'Perlu Pembinaan';
      } else if ((persenHadirTotal ?? 0) >= 85 && alpha === 0) {
        statusDisiplin = 'Teladan';
      } else {
        statusDisiplin = 'Cukup';
      }
    }

    rekap.push({
      petugasId: person.id,
      nama: person.nama,
      jabatan: person.jabatan,
      noWa: person.noWa,
      totalTercatat,
      totalPagiTercatat,
      totalSoreTercatat,
      hadirPagi,
      hadirSore,
      totalHadir,
      izin,
      sakit,
      alpha,
      persenHadirTotal,
      persenHadirPagi,
      persenHadirSore,
      dominansi,
      dominansiDetail,
      statusDisiplin,
      alasanPembinaan,
    });
  }

  // Urutkan: yang punya catatan dulu, lalu berdasarkan persen hadir tertinggi
  rekap.sort((a, b) => {
    if (a.totalTercatat === 0 && b.totalTercatat > 0) return 1;
    if (b.totalTercatat === 0 && a.totalTercatat > 0) return -1;
    const pa = a.persenHadirTotal ?? -1;
    const pb = b.persenHadirTotal ?? -1;
    if (pb !== pa) return pb - pa;
    return b.totalHadir - a.totalHadir;
  });

  const dominanPagiList = rekap
    .filter((r) => r.dominansi === 'Dominan Pagi')
    .sort((a, b) => b.hadirPagi - a.hadirPagi);
  const dominanSoreList = rekap
    .filter((r) => r.dominansi === 'Dominan Sore')
    .sort((a, b) => b.hadirSore - a.hadirSore);
  const seimbangList = rekap.filter((r) => r.dominansi === 'Seimbang');
  const teladanList = rekap.filter((r) => r.statusDisiplin === 'Teladan');
  const perluPembinaanList = rekap
    .filter((r) => r.statusDisiplin === 'Perlu Pembinaan' || r.alpha >= 1 && (r.persenHadirTotal ?? 100) < 75)
    .sort((a, b) => b.alpha - a.alpha || (a.persenHadirTotal ?? 100) - (b.persenHadirTotal ?? 100));

  const rataHadirKeseluruhan =
    totalAllRecords > 0 ? Math.round((totalAllHadir / totalAllRecords) * 100) : null;
  const rataHadirPagi =
    totalPagiRecords > 0 ? Math.round((totalPagiHadir / totalPagiRecords) * 100) : null;
  const rataHadirSore =
    totalSoreRecords > 0 ? Math.round((totalSoreHadir / totalSoreRecords) * 100) : null;

  const summaryBullets: string[] = [];
  if (totalAllRecords === 0) {
    summaryBullets.push('Belum ada data absensi petugas dapur pada periode ini untuk dianalisis.');
  } else {
    if (rataHadirPagi !== null && rataHadirSore !== null) {
      const gap = rataHadirSore - rataHadirPagi;
      if (gap >= 10) {
        summaryBullets.push(
          `Kehadiran Shift Pagi (${rataHadirPagi}%) lebih rendah ${gap}% dibanding Shift Sore (${rataHadirSore}%) — Shift Pagi lebih rawan petugas telat/absen.`
        );
      } else if (gap <= -10) {
        summaryBullets.push(
          `Kehadiran Shift Sore (${rataHadirSore}%) lebih rendah ${Math.abs(gap)}% dibanding Shift Pagi (${rataHadirPagi}%).`
        );
      } else {
        summaryBullets.push(
          `Kehadiran rata-rata Shift Pagi (${rataHadirPagi}%) dan Shift Sore (${rataHadirSore}%) tergolong berimbang.`
        );
      }
    }

    if (dominanPagiList.length > 0) {
      const topPagi = dominanPagiList
        .slice(0, 3)
        .map((r) => `${r.nama} (Pagi ${r.hadirPagi}x / Sore ${r.hadirSore}x)`)
        .join(', ');
      summaryBullets.push(`Dominan Masak Pagi: ${topPagi}.`);
    }

    if (dominanSoreList.length > 0) {
      const topSore = dominanSoreList
        .slice(0, 3)
        .map((r) => `${r.nama} (Sore ${r.hadirSore}x / Pagi ${r.hadirPagi}x)`)
        .join(', ');
      summaryBullets.push(
        `Dominan Masak Sore (minim kontribusi Pagi): ${topSore}.`
      );
    }

    if (perluPembinaanList.length > 0) {
      const topWarn = perluPembinaanList
        .slice(0, 3)
        .map(
          (r) =>
            `${r.nama} (${r.persenHadirTotal ?? 0}% hadir${
              r.alasanPembinaan.length > 0 ? ` — ${r.alasanPembinaan.join(', ')}` : ''
            })`
        )
        .join('; ');
      summaryBullets.push(`Perlu Teguran / Pembinaan Koordinator: ${topWarn}.`);
    }

    if (teladanList.length > 0) {
      const topGood = teladanList
        .slice(0, 3)
        .map((r) => `${r.nama} (${r.persenHadirTotal ?? 0}%)`)
        .join(', ');
      summaryBullets.push(`Petugas Paling Disiplin: ${topGood}.`);
    }
  }

  return {
    rekap,
    analisis: {
      totalPetugasAktif: rekap.length,
      totalCatatanAbsen: totalAllRecords,
      rataHadirKeseluruhan,
      rataHadirPagi,
      rataHadirSore,
      dominanPagiList,
      dominanSoreList,
      seimbangList,
      teladanList,
      perluPembinaanList,
      summaryBullets,
    },
  };
}

export function readLocalArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalArray<T>(key: string, rows: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // ignore storage quota errors
  }
}

export async function fetchTableWithFallback<T>(
  table: string,
  lsKey: string,
  orderBy?: { col: string; ascending: boolean }
): Promise<{ rows: T[]; usingLocal: boolean }> {
  try {
    let q = supabase.from(table).select('*');
    if (orderBy) {
      q = q.order(orderBy.col, { ascending: orderBy.ascending });
    }
    const { data, error } = await q;
    if (error) {
      if (isMissingRelationError(error)) {
        return { rows: readLocalArray<T>(lsKey), usingLocal: true };
      }
      throw error;
    }
    const rows = (data || []) as T[];
    // Also mirror if local empty & rows present, or if mock empty check local?
    // When using real Supabase with created tables, Supabase is truth;
    // when using built-in mock client (fresh memory), sync with localStorage if empty.
    if (rows.length === 0) {
      const localRows = readLocalArray<T>(lsKey);
      if (localRows.length > 0 && isMockModeActive()) {
        return { rows: localRows, usingLocal: true };
      }
    }
    return { rows, usingLocal: false };
  } catch (err) {
    if (isMissingRelationError(err)) {
      return { rows: readLocalArray<T>(lsKey), usingLocal: true };
    }
    return { rows: readLocalArray<T>(lsKey), usingLocal: true };
  }
}

function isMockModeActive(): boolean {
  const inlineUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const inlineKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (inlineUrl && inlineKey) return false;
  if (typeof window !== 'undefined') {
    const winEnv = (
      window as unknown as { __SIAP_SUPABASE_ENV__?: { url?: string; anonKey?: string } }
    ).__SIAP_SUPABASE_ENV__;
    if (winEnv?.url && winEnv?.anonKey) return false;
  }
  return true;
}

export function buildAnalitikPetugasWaText(
  periodeLabel: string,
  timeliness: CookingTimelinessStats,
  analisis: AnalisisOtomatisDapur,
  rekap: PetugasRekapItem[]
): string {
  const lines: string[] = [
    `*LAPORAN KEDISIPLINAN & DAPUR e-PONDOK AN-NUR 1*`,
    `Periode: ${periodeLabel}`,
    ``,
    `*1. KETEPATAN WAKTU MEMASAK*`,
    `- Persentase Tepat Waktu: ${timeliness.persenTepatWaktu !== null ? `${timeliness.persenTepatWaktu}%` : 'Belum ada data'} (${timeliness.tepatWaktuCount}/${timeliness.totalSelesai} sesi)`,
    `- Shift Pagi (maks 05:45): ${timeliness.persenPagi !== null ? `${timeliness.persenPagi}%` : '-'} (${timeliness.pagiTepatWaktu}/${timeliness.pagiSelesai})`,
    `- Shift Sore (maks 16:45): ${timeliness.persenSore !== null ? `${timeliness.persenSore}%` : '-'} (${timeliness.soreTepatWaktu}/${timeliness.soreSelesai})`,
    ``,
    `*2. ANALISIS OTOMATIS PETUGAS DAPUR*`,
    ...analisis.summaryBullets.map((b) => `- ${b}`),
    ``,
    `*3. PERSENTASE KEHADIRAN PER PETUGAS*`,
    ...rekap
      .filter((r) => r.totalTercatat > 0)
      .map(
        (r, i) =>
          `${i + 1}. ${r.nama}: *${r.persenHadirTotal ?? 0}%* (Pagi ${r.hadirPagi}/${r.totalPagiTercatat}, Sore ${r.hadirSore}/${r.totalSoreTercatat}, Alpha ${r.alpha}) — [${r.dominansi}]${
            r.statusDisiplin === 'Perlu Pembinaan' ? ' ⚠️ Perlu Pembinaan' : ''
          }`
      ),
  ];
  return lines.join('\n');
}
